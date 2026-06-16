import { useQuery } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { GroupTable } from '../../components/groups/GroupTable'
import { useTenComp } from '../../contexts/TenCompContext'
import { fetchLeagueStandings } from '../../services/v2/leagueStandingsService'

// Tabla de posiciones de liga (todos contra todos), calculada según partidos jugados.
export function PencaPosicionesPage() {
  const { competition } = useTenComp()
  const compId = competition.id

  const { data: standings = [], isLoading, error } = useQuery({
    queryKey: ['v2', 'league_standings', compId],
    queryFn: () => fetchLeagueStandings(compId),
    staleTime: 1000 * 60 * 5,
  })

  return (
    <div>
      <h1 className="text-xl font-bold text-text-primary mb-4">Posiciones</h1>

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

      {!isLoading && !error && standings.length === 0 && (
        <p className="text-text-muted text-sm text-center py-8">
          Todavía no hay partidos finalizados.
        </p>
      )}

      {!isLoading && !error && standings.length > 0 && (
        <div className="card p-4 max-w-2xl mx-auto">
          <GroupTable
            standings={standings}
            highlightPositions={false}
            showLegend={false}
          />
        </div>
      )}
    </div>
  )
}
