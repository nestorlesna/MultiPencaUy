import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { GroupTable } from '../../components/groups/GroupTable'
import { useTenComp } from '../../contexts/TenCompContext'
import { fetchGroupStandingsV2 } from '../../services/v2/groupStandingsService'
import { fetchGroups } from '../../services/v2/matchService'
import type { GroupStanding } from '../../types/database'

function byGroup(standings: GroupStanding[]): Map<string, GroupStanding[]> {
  const map = new Map<string, GroupStanding[]>()
  for (const s of standings) {
    if (!map.has(s.group_name)) map.set(s.group_name, [])
    map.get(s.group_name)!.push(s)
  }
  return map
}

export function PencaGruposPage() {
  const { competition, tenComp } = useTenComp()
  const compId = competition.id
  const navigate = useNavigate()
  const base = `/p/${tenComp.slug}`

  const [selectedGroup, setSelectedGroup] = useState<string | null>(null)

  const { data: groups = [] } = useQuery({
    queryKey: ['v2', 'groups', compId],
    queryFn: () => fetchGroups(compId),
    staleTime: 1000 * 60 * 10,
  })

  const { data: standings = [], isLoading, error } = useQuery({
    queryKey: ['v2', 'group_standings', compId],
    queryFn: () => fetchGroupStandingsV2(compId),
    staleTime: 1000 * 60 * 5,
  })

  const groupMap = byGroup(standings)
  const visibleGroups = selectedGroup
    ? groups.filter(g => g.name === selectedGroup)
    : groups

  return (
    <div>
      <h1 className="text-xl font-bold text-text-primary mb-4">Grupos</h1>

      {/* Filtro de grupo */}
      {groups.length > 0 && (
        <div className="flex gap-1 overflow-x-auto pb-1 mb-4 scrollbar-hide -mx-4 px-4">
          <button
            onClick={() => setSelectedGroup(null)}
            className={`flex-shrink-0 px-2.5 py-1 rounded text-xs font-medium transition-colors ${
              !selectedGroup ? 'bg-accent/20 text-accent' : 'text-text-muted hover:text-text-secondary'
            }`}
          >
            Todos
          </button>
          {groups.map(g => (
            <button
              key={g.id}
              onClick={() => setSelectedGroup(g.name)}
              className={`flex-shrink-0 px-2 h-7 rounded text-xs font-bold transition-colors ${
                selectedGroup === g.name ? 'bg-accent/20 text-accent' : 'text-text-muted hover:text-text-secondary'
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
        <div className="card p-4 text-error text-sm text-center">
          Error cargando posiciones.
        </div>
      )}

      {!isLoading && !error && groups.length === 0 && (
        <p className="text-text-muted text-sm text-center py-8">
          Esta competencia no tiene fase de grupos.
        </p>
      )}

      {!isLoading && !error && (
        <div className={`grid gap-4 ${selectedGroup ? 'grid-cols-1 max-w-lg mx-auto' : 'grid-cols-1 sm:grid-cols-2'}`}>
          {visibleGroups.map(g => {
            const rows = groupMap.get(g.name) ?? []
            return (
              <div key={g.id} className="card p-4">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-bold text-text-primary flex items-center gap-2">
                    <span className="w-6 h-6 rounded bg-primary/20 text-primary text-xs font-bold flex items-center justify-center">
                      {g.name}
                    </span>
                    Grupo {g.name}
                  </h2>
                  <button
                    onClick={() => navigate(`${base}/grupos/${g.name}`)}
                    className="text-xs text-primary hover:underline"
                  >
                    Ver detalle →
                  </button>
                </div>
                <GroupTable
                  standings={rows}
                  compact={!selectedGroup}
                  onTeamClick={() => {}}
                />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
