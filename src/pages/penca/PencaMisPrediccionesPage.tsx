import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { Loader2, Star, Lock, Check, Globe, KeyRound } from 'lucide-react'
import { PredictionModal } from '../../components/predictions/PredictionModal'
import { MatchSummaryModal } from '../../components/ui/MatchSummaryModal'
import { TeamFlag } from '../../components/ui/TeamFlag'
import { RequireAuth } from '../../components/auth/AuthGuard'
import { useTenComp, useTenCompState } from '../../contexts/TenCompContext'
import { useAuth } from '../../hooks/useAuth'
import { fetchMatches, fetchPhases, fetchRounds } from '../../services/v2/matchService'
import { joinPublicTenComp } from '../../services/tenCompService'
import { fetchUserPredictionsMapV2, fetchMatchPredictionsSummaryV2 } from '../../services/v2/predictionService'
import { formatMatchTime, matchDateKey, formatMatchDayFull } from '../../utils/datetime'
import type { MatchWithRelations } from '../../types/match'
import type { PredictionV2, PredictionSummaryV2 } from '../../services/v2/predictionService'

type Tab = 'predecir' | 'historial'

// Agrupa partidos por día respetando el orden del array de entrada (el Map
// conserva el orden de inserción): ascendente en Predecir, descendente en Historial.
function groupByDate(matches: MatchWithRelations[]) {
  const map = new Map<string, MatchWithRelations[]>()
  for (const m of matches) {
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

export function PencaMisPrediccionesPage() {
  return (
    <RequireAuth>
      <Inner />
    </RequireAuth>
  )
}

function Inner() {
  const { tenComp, competition, memberStatus } = useTenComp()
  const { user } = useAuth()
  const compId = competition.id
  const tenCompId = tenComp.id
  const [tab, setTab] = useState<Tab>('predecir')

  const { data: predsMap = new Map<string, PredictionV2>() } = useQuery({
    queryKey: ['v2', 'predictions', tenCompId, user?.id],
    queryFn: () => fetchUserPredictionsMapV2(tenCompId, user!.id),
    enabled: !!user && memberStatus !== null,
    staleTime: 1000 * 60 * 2,
  })

  // Predecir requiere ser miembro (pending o approved). Un no-miembro no puede
  // apostar: la RLS rechaza el insert, así que ni mostramos el formulario.
  if (memberStatus === null) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-bold text-text-primary">Mis predicciones</h1>
        <JoinGate />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-text-primary">Mis predicciones</h1>

      {/* Tab switcher */}
      <div className="flex gap-1 bg-surface p-1 rounded-xl border border-border">
        {(['predecir', 'historial'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === t
                ? 'bg-background text-text-primary shadow-sm'
                : 'text-text-muted hover:text-text-secondary'
            }`}
          >
            {t === 'predecir' ? 'Predecir' : 'Historial'}
          </button>
        ))}
      </div>

      {tab === 'predecir'
        ? <PredecirTab compId={compId} tenCompId={tenCompId} predsMap={predsMap} />
        : <HistorialTab compId={compId} tenCompId={tenCompId} predsMap={predsMap} />
      }
    </div>
  )
}

// ─── Tab Predecir ─────────────────────────────────────────────────────────────

function PredecirTab({
  compId, tenCompId, predsMap
}: {
  compId: string
  tenCompId: string
  predsMap: Map<string, PredictionV2>
}) {
  const [phaseOrder, setPhaseOrder] = useState<number | undefined>(undefined)
  const [roundNumber, setRoundNumber] = useState<number | undefined>(undefined)
  const [selectedMatch, setSelectedMatch] = useState<MatchWithRelations | null>(null)

  const { data: rounds = [] } = useQuery({
    queryKey: ['v2', 'rounds', compId],
    queryFn: () => fetchRounds(compId),
    staleTime: 1000 * 60 * 10,
  })
  const { data: phases = [] } = useQuery({
    queryKey: ['v2', 'phases', compId],
    queryFn: () => fetchPhases(compId),
    staleTime: 1000 * 60 * 10,
  })
  const { data: matches = [], isLoading } = useQuery({
    queryKey: ['v2', 'matches', compId, phaseOrder, undefined, roundNumber],
    queryFn: () => fetchMatches(compId, { phaseOrder, roundNumber }),
    staleTime: 1000 * 60 * 5,
  })

  const isLeague = rounds.length > 0
  const upcoming = useMemo(
    () => matches.filter(m => m.home_score_90 === null && new Date(m.match_datetime) > new Date()),
    [matches]
  )
  const groupedUpcoming = useMemo(() => groupByDate(upcoming), [upcoming])
  const existingPred = selectedMatch ? (predsMap.get(selectedMatch.id) ?? null) : null

  return (
    <>
      {/* Liga: chips de fecha */}
      {isLeague && (
        <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-hide -mx-4 px-4">
          <FilterChip label="Todas" active={roundNumber === undefined} onClick={() => setRoundNumber(undefined)} />
          {rounds.map(r => (
            <FilterChip
              key={r}
              label={`F${r}`}
              active={roundNumber === r}
              onClick={() => setRoundNumber(roundNumber === r ? undefined : r)}
            />
          ))}
        </div>
      )}

      {/* Torneo: tabs de fase */}
      {!isLeague && phases.length > 0 && (
        <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-hide -mx-4 px-4">
          <PhaseChip label="Todos" active={phaseOrder === undefined} onClick={() => setPhaseOrder(undefined)} />
          {phases.map(ph => (
            <PhaseChip
              key={ph.id}
              label={ph.name}
              active={phaseOrder === ph.order}
              onClick={() => setPhaseOrder(ph.order)}
            />
          ))}
        </div>
      )}

      {isLoading && (
        <div className="flex justify-center py-16">
          <Loader2 className="animate-spin text-primary" size={28} />
        </div>
      )}

      {!isLoading && upcoming.length === 0 && (
        <p className="text-text-muted text-sm text-center py-12">No hay partidos próximos para predecir.</p>
      )}

      <div className="space-y-6">
        {!isLoading && groupedUpcoming.map(({ dateKey, label, matches: dayMatches }) => (
          <section key={dateKey}>
            <h2 className="text-xs font-semibold text-text-muted uppercase tracking-widest mb-2 capitalize">
              {label}
            </h2>
            <div className="space-y-2">
              {dayMatches.map(match => {
                const pred = predsMap.get(match.id) ?? null
                const isStarted = new Date(match.match_datetime) <= new Date()
                return (
                  <div
                    key={match.id}
                    className={`card p-3 flex items-center gap-3 transition-colors ${
                      isStarted
                        ? 'opacity-60 cursor-default'
                        : 'cursor-pointer hover:border-primary/40'
                    }`}
                    onClick={() => !isStarted && setSelectedMatch(match)}
                  >
                    <MatchBadge match={match} isLeague={isLeague} />

                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 min-w-0">
                          <TeamFlag team={match.home_team} slotLabel={match.home_slot_label} size="sm" align="left" abbrev />
                        </div>
                        <span className="text-text-muted text-xs flex-shrink-0">vs</span>
                        <div className="flex-1 min-w-0 flex justify-end">
                          <TeamFlag team={match.away_team} slotLabel={match.away_slot_label} size="sm" align="right" abbrev />
                        </div>
                      </div>
                      <p className="text-[11px] text-text-muted">
                        {formatMatchTime(match.match_datetime)}
                      </p>
                    </div>

                    <div className="flex-shrink-0 text-right min-w-[64px]">
                      {isStarted ? (
                        <div className="flex flex-col items-end gap-0.5">
                          <Lock size={12} className="text-text-muted" />
                          {pred
                            ? <ScoreDisplay pred={pred} />
                            : <span className="text-[10px] text-text-muted italic">Sin pred.</span>
                          }
                        </div>
                      ) : pred ? (
                        <div className="flex flex-col items-end gap-0.5">
                          <ScoreDisplay pred={pred} />
                          <span className="flex items-center gap-0.5 text-[10px] text-primary">
                            <Check size={9} /> Guardada
                          </span>
                        </div>
                      ) : (
                        <span className="text-[11px] text-text-muted italic">Sin pred.</span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        ))}
      </div>

      <PredictionModal
        match={selectedMatch}
        existing={existingPred}
        onClose={() => setSelectedMatch(null)}
        tenCompId={tenCompId}
      />
    </>
  )
}

// ─── Tab Historial ────────────────────────────────────────────────────────────

function HistorialTab({
  compId, tenCompId, predsMap
}: {
  compId: string
  tenCompId: string
  predsMap: Map<string, PredictionV2>
}) {
  const [summaryMatch, setSummaryMatch] = useState<MatchWithRelations | null>(null)
  const [summaryData, setSummaryData] = useState<{ summary: PredictionSummaryV2[]; totalPredictions: number } | null>(null)
  const [summaryLoading, setSummaryLoading] = useState(false)

  const { data: allMatches = [], isLoading } = useQuery({
    queryKey: ['v2', 'matches', compId, undefined, undefined, undefined],
    queryFn: () => fetchMatches(compId, {}),
    staleTime: 1000 * 60 * 5,
  })

  const { data: rounds = [] } = useQuery({
    queryKey: ['v2', 'rounds', compId],
    queryFn: () => fetchRounds(compId),
    staleTime: 1000 * 60 * 10,
  })
  const isLeague = rounds.length > 0

  const past = useMemo(
    () => allMatches
      .filter(m => m.home_score_90 !== null || new Date(m.match_datetime) <= new Date())
      .sort((a, b) => new Date(b.match_datetime).getTime() - new Date(a.match_datetime).getTime()),
    [allMatches]
  )

  const groupedPast = useMemo(() => groupByDate(past), [past])

  const totalPoints = useMemo(
    () => past.reduce((sum, m) => sum + (predsMap.get(m.id)?.points_earned ?? 0), 0),
    [past, predsMap]
  )

  const handleViewSummary = async (matchId: string, match: MatchWithRelations) => {
    setSummaryMatch(match)
    setSummaryLoading(true)
    setSummaryData(null)
    try {
      const data = await fetchMatchPredictionsSummaryV2(tenCompId, matchId)
      setSummaryData(data)
    } finally {
      setSummaryLoading(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="animate-spin text-primary" size={28} />
      </div>
    )
  }

  if (past.length === 0) {
    return <p className="text-text-muted text-sm text-center py-12">Aún no hay partidos jugados.</p>
  }

  return (
    <>
      {/* Total de puntos */}
      <div className="card p-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Star size={16} className="text-accent" />
          <span className="text-sm text-text-secondary">Puntos totales</span>
        </div>
        <span className="text-2xl font-bold text-primary tabular-nums">{totalPoints}</span>
      </div>

      <div className="space-y-6">
        {groupedPast.map(({ dateKey, label, matches: dayMatches }) => (
          <section key={dateKey}>
            <h2 className="text-xs font-semibold text-text-muted uppercase tracking-widest mb-2 capitalize">
              {label}
            </h2>
            <div className="space-y-2">
              {dayMatches.map(match => {
                const pred = predsMap.get(match.id) ?? null
                return (
                  <div key={match.id} className="card p-3 flex items-center gap-3">
                    <MatchBadge match={match} isLeague={isLeague} />

                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 min-w-0">
                          <TeamFlag team={match.home_team} slotLabel={match.home_slot_label} size="sm" align="left" abbrev />
                        </div>
                        <div className="flex-shrink-0 text-center">
                          {match.home_score_90 !== null
                            ? <p className="text-xs font-bold text-text-primary tabular-nums">
                                {match.home_score_90} – {match.away_score_90}
                              </p>
                            : <p className="text-[10px] text-text-muted italic">Pendiente</p>
                          }
                          {pred
                            ? <p className="text-[10px] text-text-muted">
                                {pred.home_score}–{pred.away_score}
                              </p>
                            : <p className="text-[10px] text-text-muted italic">Sin pred.</p>
                          }
                        </div>
                        <div className="flex-1 min-w-0 flex justify-end">
                          <TeamFlag team={match.away_team} slotLabel={match.away_slot_label} size="sm" align="right" abbrev />
                        </div>
                      </div>
                    </div>

                    <div className="flex-shrink-0 flex flex-col items-end gap-1.5">
                      {pred && pred.points_earned !== null && (
                        <PointsBadge points={pred.points_earned} />
                      )}
                      <button
                        onClick={() => handleViewSummary(match.id, match)}
                        className="text-[10px] text-text-muted hover:text-primary transition-colors underline underline-offset-2"
                      >
                        Apuestas
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        ))}
      </div>

      <MatchSummaryModal
        open={summaryMatch !== null}
        onClose={() => { setSummaryMatch(null); setSummaryData(null) }}
        match={summaryMatch}
        loading={summaryLoading}
        summary={summaryData?.summary ?? []}
        totalPredictions={summaryData?.totalPredictions ?? 0}
        tenCompId={tenCompId}
      />
    </>
  )
}

// ─── Gate de membresía ─────────────────────────────────────────────────────────

// Se muestra cuando el usuario logueado NO es miembro de la penca: no puede
// predecir hasta unirse. Pública → se une al instante; privada → necesita código.
function JoinGate() {
  const { tenComp } = useTenComp()
  const { refetch } = useTenCompState()
  const qc = useQueryClient()
  const isPublic = tenComp.visibility === 'public'

  const joinMut = useMutation({
    mutationFn: () => joinPublicTenComp(tenComp.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my_ten_comps'] })
      toast.success('¡Te uniste a la penca! Ya podés predecir.')
      refetch()
    },
    onError: (e: any) => toast.error(e.message || 'No se pudo unir a la penca'),
  })

  return (
    <div className="card p-6 text-center space-y-4">
      <div className="flex justify-center">
        {isPublic
          ? <Globe size={28} className="text-primary" />
          : <KeyRound size={28} className="text-accent" />}
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium text-text-primary">
          Todavía no sos parte de esta penca
        </p>
        <p className="text-xs text-text-muted">
          {isPublic
            ? 'Unite para cargar tus predicciones y aparecer en el ranking.'
            : 'Esta penca es privada. Necesitás el código de acceso para unirte.'}
        </p>
      </div>
      {isPublic ? (
        <button
          onClick={() => joinMut.mutate()}
          disabled={joinMut.isPending}
          className="btn-primary text-sm inline-flex items-center gap-1.5"
        >
          {joinMut.isPending ? <Loader2 size={14} className="animate-spin" /> : 'Unirme a esta penca'}
        </button>
      ) : (
        <Link to="/pencas" className="btn-primary text-sm inline-flex items-center gap-1.5">
          <KeyRound size={14} /> Unirme con código
        </Link>
      )}
    </div>
  )
}

// ─── Sub-componentes ──────────────────────────────────────────────────────────

function MatchBadge({ match, isLeague }: { match: MatchWithRelations; isLeague: boolean }) {
  return (
    <div className="flex-shrink-0 w-10 text-center">
      <p className="text-[11px] text-text-muted">#{match.match_number}</p>
      {isLeague && match.round_number ? (
        <span className="badge bg-accent/20 text-accent text-[9px] font-semibold">F{match.round_number}</span>
      ) : match.group ? (
        <span className="badge-primary text-[9px]">G{match.group.name}</span>
      ) : (
        <span className="badge bg-accent/20 text-accent text-[9px]">
          {match.phase?.name?.substring(0, 3) ?? '—'}
        </span>
      )}
    </div>
  )
}

function ScoreDisplay({ pred }: { pred: PredictionV2 }) {
  return (
    <span className="text-sm font-bold tabular-nums text-text-primary">
      {pred.home_score}–{pred.away_score}
      {pred.home_score_et !== null && (
        <span className="text-[10px] text-text-muted ml-1">
          (ET {pred.home_score_et}:{pred.away_score_et})
        </span>
      )}
    </span>
  )
}

function PointsBadge({ points }: { points: number }) {
  if (points === 0) return <span className="badge bg-border text-text-muted text-[10px]">0 pts</span>
  return (
    <span className="badge bg-primary/20 text-primary text-[10px] font-semibold">+{points} pts</span>
  )
}

function PhaseChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
        active ? 'bg-primary text-white' : 'bg-surface text-text-secondary hover:text-text-primary'
      }`}
    >
      {label}
    </button>
  )
}

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex-shrink-0 px-3 py-1.5 rounded text-xs font-medium transition-colors ${
        active ? 'bg-accent/20 text-accent' : 'text-text-muted hover:text-text-secondary'
      }`}
    >
      {label}
    </button>
  )
}
