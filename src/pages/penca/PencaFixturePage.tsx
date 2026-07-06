import { useState, useMemo, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { MatchCard } from '../../components/matches/MatchCard'
import { MatchSummaryModal } from '../../components/ui/MatchSummaryModal'
import { useTenComp } from '../../contexts/TenCompContext'
import { fetchMatches, fetchPhases, fetchGroups, fetchRounds } from '../../services/v2/matchService'
import { fetchMatchPredictionsSummaryV2 } from '../../services/v2/predictionService'
import { matchDateKey, formatMatchDayFull } from '../../utils/datetime'
import type { MatchWithRelations } from '../../types/match'
import type { PredictionSummaryV2 } from '../../services/v2/predictionService'

export function PencaFixturePage() {
  const { competition, tenComp } = useTenComp()
  const compId = competition.id
  const tenCompId = tenComp.id
  const [phaseOrder, setPhaseOrder] = useState<number | undefined>(undefined)
  const [groupName, setGroupName] = useState<string | undefined>(undefined)
  const [roundNumber, setRoundNumber] = useState<number | undefined>(undefined)
  const [summaryMatch, setSummaryMatch] = useState<MatchWithRelations | null>(null)
  const [summaryData, setSummaryData] = useState<{ summary: PredictionSummaryV2[]; totalPredictions: number } | null>(null)
  const [summaryLoading, setSummaryLoading] = useState(false)

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

  const { data: phases = [] } = useQuery({
    queryKey: ['v2', 'phases', compId],
    queryFn: () => fetchPhases(compId),
    staleTime: 1000 * 60 * 10,
  })
  const { data: groups = [] } = useQuery({
    queryKey: ['v2', 'groups', compId],
    queryFn: () => fetchGroups(compId),
    staleTime: 1000 * 60 * 10,
  })
  const { data: rounds = [] } = useQuery({
    queryKey: ['v2', 'rounds', compId],
    queryFn: () => fetchRounds(compId),
    staleTime: 1000 * 60 * 10,
  })
  const { data: matches, isLoading, error } = useQuery({
    queryKey: ['v2', 'matches', compId, phaseOrder, groupName, roundNumber],
    queryFn: () => fetchMatches(compId, { phaseOrder, groupName, roundNumber }),
  })

  // Competencias tipo liga: usan round_number en vez de fases/grupos
  const isLeague = rounds.length > 0

  // Para torneos con fases/grupos (Mundial): el filtro de grupo aplica solo en la fase de grupos
  const groupPhaseOrder = phases[0]?.order
  const showGroupFilter = !isLeague && groups.length > 0 && (phaseOrder === groupPhaseOrder || phaseOrder === undefined)

  const groupedByDate = useMemo(() => {
    if (!matches) return []
    const map = new Map<string, typeof matches>()
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
  }, [matches])

  // Auto-scroll al entrar: posicionar en los partidos de hoy. Si no hay partidos
  // hoy, en la primera fecha futura; si el campeonato ya terminó, en la última.
  // Solo en la vista por defecto (sin filtro) y una sola vez por competencia.
  const filtersDefault = phaseOrder === undefined && groupName === undefined && roundNumber === undefined
  const todayKey = useMemo(() => new Date().toLocaleDateString('en-CA'), [])
  const targetDateKey = useMemo(() => {
    if (groupedByDate.length === 0) return null
    const upcoming = groupedByDate.find(g => g.dateKey >= todayKey)
    return (upcoming ?? groupedByDate[groupedByDate.length - 1]).dateKey
  }, [groupedByDate, todayKey])

  const sectionRefs = useRef<Map<string, HTMLElement>>(new Map())
  const scrolledForRef = useRef<string | null>(null)

  useEffect(() => {
    if (!filtersDefault || !targetDateKey) return
    if (scrolledForRef.current === compId) return
    const el = sectionRefs.current.get(targetDateKey)
    if (!el) return
    scrolledForRef.current = compId
    requestAnimationFrame(() => el.scrollIntoView({ block: 'start' }))
  }, [filtersDefault, targetDateKey, compId])

  return (
    <div>
      <h1 className="text-xl font-bold text-text-primary mb-4">Fixture</h1>

      {/* Liga: selector de fechas */}
      {isLeague && (
        <div className="flex gap-1 overflow-x-auto pb-1 mb-4 scrollbar-hide -mx-4 px-4">
          <FilterChip
            label="Todas"
            active={roundNumber === undefined}
            onClick={() => setRoundNumber(undefined)}
          />
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

      {/* Torneo (Mundial, etc.): tabs de fase */}
      {!isLeague && (
        <div className="flex gap-1 overflow-x-auto pb-1 mb-3 scrollbar-hide -mx-4 px-4">
          <PhaseTab label="Todos" active={phaseOrder === undefined} onClick={() => { setPhaseOrder(undefined); setGroupName(undefined) }} />
          {phases.map(ph => (
            <PhaseTab
              key={ph.id}
              label={ph.name}
              active={phaseOrder === ph.order}
              onClick={() => {
                setPhaseOrder(ph.order)
                if (ph.order !== groupPhaseOrder) setGroupName(undefined)
              }}
            />
          ))}
        </div>
      )}

      {/* Torneo: filtro de grupo */}
      {showGroupFilter && (
        <div className="flex gap-1 overflow-x-auto pb-1 mb-4 scrollbar-hide -mx-4 px-4">
          <button
            onClick={() => setGroupName(undefined)}
            className={`flex-shrink-0 px-2.5 py-1 rounded text-xs font-medium transition-colors ${
              !groupName ? 'bg-accent/20 text-accent' : 'text-text-muted hover:text-text-secondary'
            }`}
          >
            Todos
          </button>
          {groups.map(g => (
            <button
              key={g.id}
              onClick={() => { setGroupName(g.name); setPhaseOrder(groupPhaseOrder) }}
              className={`flex-shrink-0 px-2 h-7 rounded text-xs font-bold transition-colors ${
                groupName === g.name ? 'bg-accent/20 text-accent' : 'text-text-muted hover:text-text-secondary'
              }`}
            >
              G. {g.name}
            </button>
          ))}
        </div>
      )}

      {isLoading && (
        <div className="flex justify-center py-16">
          <Loader2 className="animate-spin text-primary" size={28} />
        </div>
      )}

      {error && (
        <div className="card p-4 text-error text-sm text-center">Error cargando los partidos.</div>
      )}

      {!isLoading && !error && (
        <div className="space-y-6">
          {groupedByDate.length === 0 && (
            <p className="text-text-muted text-sm text-center py-8">No hay partidos para mostrar.</p>
          )}
          {groupedByDate.map(({ dateKey, label, matches: dayMatches }) => (
            <section
              key={dateKey}
              ref={el => { if (el) sectionRefs.current.set(dateKey, el); else sectionRefs.current.delete(dateKey) }}
              className="scroll-mt-20"
            >
              <h2 className="text-xs font-semibold text-text-muted uppercase tracking-widest mb-2 capitalize">
                {label}
              </h2>
              <div className="space-y-3">
                {dayMatches.map(match => (
                  <MatchCard
                    key={match.id}
                    match={match}
                    onPredictionsClick={(matchId) => handleViewSummary(matchId, match)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <MatchSummaryModal
        open={summaryMatch !== null}
        onClose={() => { setSummaryMatch(null); setSummaryData(null) }}
        match={summaryMatch}
        loading={summaryLoading}
        summary={summaryData?.summary ?? []}
        totalPredictions={summaryData?.totalPredictions ?? 0}
        tenCompId={tenCompId}
      />
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
