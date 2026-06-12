import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { MatchCard } from '../../components/matches/MatchCard'
import { useTenComp } from '../../contexts/TenCompContext'
import { fetchMatches, fetchPhases, fetchGroups } from '../../services/v2/matchService'
import { matchDateKey, formatMatchDayFull } from '../../utils/datetime'

// Fixture read-only scoped a la competencia del Ten-Comp. Las predicciones y
// los modales (estadio/apuestas) se cablean en el siguiente incremento de Fase 3.
export function PencaFixturePage() {
  const { competition } = useTenComp()
  const compId = competition.id
  const [phaseOrder, setPhaseOrder] = useState<number | undefined>(undefined)
  const [groupName, setGroupName] = useState<string | undefined>(undefined)

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
  const { data: matches, isLoading, error } = useQuery({
    queryKey: ['v2', 'matches', compId, phaseOrder, groupName],
    queryFn: () => fetchMatches(compId, { phaseOrder, groupName }),
  })

  // El grupo se filtra solo en fase de grupos (la de sort_order = 1) o en "Todos".
  const groupPhaseOrder = phases[0]?.order
  const showGroupFilter = groups.length > 0 && (phaseOrder === groupPhaseOrder || phaseOrder === undefined)

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

  return (
    <div>
      <h1 className="text-xl font-bold text-text-primary mb-4">Fixture</h1>

      {/* Tabs de fase (dinámicas según la competencia) */}
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

      {/* Filtro de grupo */}
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
            <section key={dateKey}>
              <h2 className="text-xs font-semibold text-text-muted uppercase tracking-widest mb-2 capitalize">
                {label}
              </h2>
              <div className="space-y-3">
                {dayMatches.map(match => <MatchCard key={match.id} match={match} />)}
              </div>
            </section>
          ))}
        </div>
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
