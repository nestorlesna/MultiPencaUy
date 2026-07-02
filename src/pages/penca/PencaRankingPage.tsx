import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Loader2, Trophy } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { useTenComp } from '../../contexts/TenCompContext'
import { fetchLeaderboard } from '../../services/v2/leaderboardService'
import { LeaderboardView } from '../../components/leaderboard/LeaderboardView'
import { UserScoreDetailModal } from '../../components/leaderboard/UserScoreDetailModal'
import { Muro } from '../../components/muro/Muro'
import type { LeaderboardEntry } from '../../types'

export function PencaRankingPage() {
  const { tenComp, memberStatus, isTenCompAdmin } = useTenComp()
  const { user } = useAuth()
  const [selected, setSelected] = useState<LeaderboardEntry | null>(null)

  const { data: entries = [], isLoading, error } = useQuery({
    queryKey: ['v2', 'leaderboard', tenComp.id],
    queryFn: () => fetchLeaderboard(tenComp.id),
    staleTime: 1000 * 60 * 2,
  })

  // El muro es solo para miembros aprobados (leer y postear).
  const showMuro = memberStatus === 'approved'

  return (
    <div>
      <div className="flex items-center gap-2 mb-5">
        <Trophy size={20} className="text-accent" />
        <h1 className="text-xl font-bold text-text-primary">Ranking</h1>
      </div>

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-6 lg:items-start">
        <div>
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
            <LeaderboardView
              entries={entries}
              myId={user?.id}
              onSelect={user ? setSelected : undefined}
            />
          )}
        </div>

        {showMuro && (
          <div className="mt-6 lg:mt-0">
            <Muro
              tenCompId={tenComp.id}
              userId={user?.id}
              canPost={memberStatus === 'approved'}
              isAdmin={isTenCompAdmin}
            />
          </div>
        )}
      </div>

      <UserScoreDetailModal
        tenCompId={tenComp.id}
        entry={selected}
        onClose={() => setSelected(null)}
      />
    </div>
  )
}
