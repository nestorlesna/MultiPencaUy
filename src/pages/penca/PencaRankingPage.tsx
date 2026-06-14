import { useQuery } from '@tanstack/react-query'
import { Loader2, Trophy } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { useTenComp } from '../../contexts/TenCompContext'
import { fetchLeaderboard } from '../../services/v2/leaderboardService'
import { LeaderboardView } from '../../components/leaderboard/LeaderboardView'

export function PencaRankingPage() {
  const { tenComp } = useTenComp()
  const { user } = useAuth()

  const { data: entries = [], isLoading, error } = useQuery({
    queryKey: ['v2', 'leaderboard', tenComp.id],
    queryFn: () => fetchLeaderboard(tenComp.id),
    staleTime: 1000 * 60 * 2,
  })

  return (
    <div>
      <div className="flex items-center gap-2 mb-5">
        <Trophy size={20} className="text-accent" />
        <h1 className="text-xl font-bold text-text-primary">Ranking</h1>
      </div>

      {isLoading && (
        <div className="flex justify-center py-16">
          <Loader2 className="animate-spin text-primary" size={28} />
        </div>
      )}

      {error && (
        <div className="card p-4 text-sm text-center text-text-muted">
          Error cargando el ranking.
        </div>
      )}

      {!isLoading && !error && entries.length === 0 && (
        <div className="card p-8 text-center">
          <Trophy size={32} className="text-text-muted mx-auto mb-3" />
          <p className="text-text-muted text-sm">Aún no hay puntos registrados en esta penca.</p>
        </div>
      )}

      {!isLoading && !error && entries.length > 0 && (
        <LeaderboardView entries={entries} myId={user?.id} />
      )}
    </div>
  )
}
