import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Loader2, Star } from 'lucide-react'
import { MatchCard } from '../../components/matches/MatchCard'
import { PredictionModal } from '../../components/predictions/PredictionModal'
import { RequireAuth } from '../../components/auth/AuthGuard'
import { useTenComp } from '../../contexts/TenCompContext'
import { useAuth } from '../../hooks/useAuth'
import { fetchMatches, fetchPhases } from '../../services/v2/matchService'
import { fetchUserPredictionsMapV2 } from '../../services/v2/predictionService'
import { matchDateKey, formatMatchDayFull } from '../../utils/datetime'
import type { MatchWithRelations } from '../../types/match'
import type { PredictionV2 } from '../../services/v2/predictionService'

export function PencaMisPrediccionesPage() {
  return (
    <RequireAuth>
      <PencaJugarInner />
    </RequireAuth>
  )
}

function PencaJugarInner() {
  const { tenComp, competition } = useTenComp()
  const { user } = useAuth()
  const compId = competition.id
  const tenCompId = tenComp.id

  const [selectedMatch, setSelectedMatch] = useState<MatchWithRelations | null>(null)
  const [phaseOrder, setPhaseOrder] = useState<number | undefined>(undefined)

  const { data: phases = [] } = useQuery({
    queryKey: ['v2', 'phases', compId],
    queryFn: () => fetchPhases(compId),
    staleTime: 1000 * 60 * 10,
  })

  const { data: matches = [], isLoading: loadingMatches } = useQuery({
    queryKey: ['v2', 'matches', compId, phaseOrder, undefined],
    queryFn: () => fetchMatches(compId, { phaseOrder }),
    staleTime: 1000 * 60 * 5,
  })

  const { data: predsMap = new Map<string, PredictionV2>() } = useQuery({
    queryKey: ['v2', 'predictions', tenCompId, user?.id],
    queryFn: () => fetchUserPredictionsMapV2(tenCompId, user!.id),
    enabled: !!user,
    staleTime: 1000 * 60 * 2,
  })

  const upcoming = useMemo(
    () => matches.filter(m => m.home_score_90 === null && new Date(m.match_datetime) > new Date()),
    [matches]
  )
  const past = useMemo(
    () => matches.filter(m => m.home_score_90 !== null || new Date(m.match_datetime) <= new Date()),
    [matches]
  )

  const groupedUpcoming = useMemo(() => groupByDate(upcoming), [upcoming])
  const groupedPast = useMemo(() => groupByDate(past.slice().reverse()), [past])

  const existingPred = selectedMatch ? (predsMap.get(selectedMatch.id) ?? null) : null

  return (
    <div>
      <h1 className="text-xl font-bold text-text-primary mb-4">Jugar</h1>

      {/* Tabs de fase */}
      {phases.length > 0 && (
        <div className="flex gap-1 overflow-x-auto pb-1 mb-4 scrollbar-hide -mx-4 px-4">
          <PhaseTab label="Todos" active={phaseOrder === undefined} onClick={() => setPhaseOrder(undefined)} />
          {phases.map(ph => (
            <PhaseTab
              key={ph.id}
              label={ph.name}
              active={phaseOrder === ph.order}
              onClick={() => setPhaseOrder(ph.order)}
            />
          ))}
        </div>
      )}

      {loadingMatches && (
        <div className="flex justify-center py-16">
          <Loader2 className="animate-spin text-primary" size={28} />
        </div>
      )}

      {!loadingMatches && matches.length === 0 && (
        <p className="text-text-muted text-sm text-center py-8">No hay partidos disponibles.</p>
      )}

      {!loadingMatches && (
        <div className="space-y-8">
          {/* Próximos: abrir modal de predicción */}
          {groupedUpcoming.length > 0 && (
            <section>
              <h2 className="text-xs font-semibold text-text-muted uppercase tracking-widest mb-3">
                Próximos
              </h2>
              <div className="space-y-6">
                {groupedUpcoming.map(({ dateKey, label, matches: dayMatches }) => (
                  <div key={dateKey}>
                    <p className="text-xs text-text-muted capitalize mb-2">{label}</p>
                    <div className="space-y-3">
                      {dayMatches.map(m => {
                        const pred = predsMap.get(m.id)
                        return (
                          <MatchCard
                            key={m.id}
                            match={m}
                            onClick={() => setSelectedMatch(m)}
                            footerContent={<PredFooter pred={pred ?? null} />}
                          />
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Pasados: solo lectura con resultado y puntos */}
          {groupedPast.length > 0 && (
            <section>
              <h2 className="text-xs font-semibold text-text-muted uppercase tracking-widest mb-3">
                Jugados
              </h2>
              <div className="space-y-6">
                {groupedPast.map(({ dateKey, label, matches: dayMatches }) => (
                  <div key={dateKey}>
                    <p className="text-xs text-text-muted capitalize mb-2">{label}</p>
                    <div className="space-y-3">
                      {dayMatches.map(m => {
                        const pred = predsMap.get(m.id)
                        return (
                          <MatchCard
                            key={m.id}
                            match={m}
                            footerContent={<PredFooter pred={pred ?? null} showPoints />}
                          />
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      <PredictionModal
        match={selectedMatch}
        existing={existingPred}
        onClose={() => setSelectedMatch(null)}
        tenCompId={tenCompId}
      />
    </div>
  )
}

function PredFooter({ pred, showPoints = false }: { pred: PredictionV2 | null; showPoints?: boolean }) {
  if (!pred) {
    return (
      <div className="flex items-center gap-1 text-[11px] text-text-muted italic">
        <Star size={11} />
        Sin predicción
      </div>
    )
  }
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-1.5 text-[11px] text-text-secondary">
        <Star size={11} className="text-accent" />
        <span className="tabular-nums font-medium">
          {pred.home_score} – {pred.away_score}
          {pred.home_score_et !== null && (
            <span className="text-text-muted ml-1">(ET {pred.home_score_et}:{pred.away_score_et})</span>
          )}
        </span>
      </div>
      {showPoints && pred.points_earned !== null && (
        <span className={`text-[11px] font-semibold tabular-nums ${pred.points_earned > 0 ? 'text-primary' : 'text-text-muted'}`}>
          {pred.points_earned > 0 ? `+${pred.points_earned} pts` : '0 pts'}
        </span>
      )}
    </div>
  )
}

function PhaseTab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
        active ? 'bg-primary text-white' : 'bg-surface-2 text-text-secondary hover:text-text-primary'
      }`}
    >
      {label}
    </button>
  )
}

function groupByDate(list: MatchWithRelations[]) {
  const map = new Map<string, MatchWithRelations[]>()
  for (const m of list) {
    const key = matchDateKey(m.match_datetime)
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(m)
  }
  return Array.from(map.entries()).map(([dateKey, items]) => ({
    dateKey,
    label: formatMatchDayFull(items[0].match_datetime),
    matches: items,
  }))
}
