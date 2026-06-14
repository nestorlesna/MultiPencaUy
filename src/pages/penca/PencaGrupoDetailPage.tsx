import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { GroupTable } from '../../components/groups/GroupTable'
import { MatchCard } from '../../components/matches/MatchCard'
import { useTenComp } from '../../contexts/TenCompContext'
import { fetchGroupStandingsV2 } from '../../services/v2/groupStandingsService'
import { fetchMatches } from '../../services/v2/matchService'
import { matchDateKey, formatMatchDayFull } from '../../utils/datetime'

export function PencaGrupoDetailPage() {
  const { grupo } = useParams<{ grupo: string }>()
  const { competition, tenComp } = useTenComp()
  const compId = competition.id
  const groupName = grupo?.toUpperCase() ?? ''
  const base = `/p/${tenComp.slug}`

  const { data: standings = [], isLoading: loadingStandings } = useQuery({
    queryKey: ['v2', 'group_standings', compId, groupName],
    queryFn: () => fetchGroupStandingsV2(compId, groupName),
    staleTime: 1000 * 60 * 5,
    enabled: !!groupName,
  })

  const { data: matches = [], isLoading: loadingMatches } = useQuery({
    queryKey: ['v2', 'matches', compId, 1, groupName],
    queryFn: () => fetchMatches(compId, { phaseOrder: 1, groupName }),
    staleTime: 1000 * 60 * 5,
    enabled: !!groupName,
  })

  const groupedByDate = (() => {
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
  })()

  const isLoading = loadingStandings || loadingMatches

  return (
    <div>
      <Link
        to={`${base}/grupos`}
        className="text-xs text-text-muted hover:text-text-secondary inline-flex items-center gap-1 mb-4"
      >
        <ArrowLeft size={12} /> Todos los grupos
      </Link>

      <h1 className="text-xl font-bold text-text-primary mb-4">Grupo {groupName}</h1>

      {isLoading && (
        <div className="flex justify-center py-16">
          <Loader2 className="animate-spin text-primary" size={28} />
        </div>
      )}

      {!isLoading && (
        <div className="space-y-6">
          {/* Tabla de posiciones */}
          <div className="card p-4">
            <GroupTable standings={standings} onTeamClick={() => {}} />
          </div>

          {/* Partidos del grupo */}
          {groupedByDate.length > 0 && (
            <section>
              <h2 className="text-xs font-semibold text-text-muted uppercase tracking-widest mb-3">
                Partidos
              </h2>
              <div className="space-y-6">
                {groupedByDate.map(({ dateKey, label, matches: dayMatches }) => (
                  <div key={dateKey}>
                    <p className="text-xs text-text-muted capitalize mb-2">{label}</p>
                    <div className="space-y-3">
                      {dayMatches.map(m => <MatchCard key={m.id} match={m} />)}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {groupedByDate.length === 0 && standings.length === 0 && (
            <p className="text-text-muted text-sm text-center py-8">
              No hay datos para el grupo {groupName}.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
