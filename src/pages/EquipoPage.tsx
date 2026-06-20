import { useParams, useNavigate, Link } from 'react-router-dom'
import { ArrowLeft, Loader2, Shield } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { MatchCard } from '../components/matches/MatchCard'
import { fetchTeam, fetchTeamMatches } from '../services/teamService'

export function EquipoPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const { data: team, isLoading: loadingTeam } = useQuery({
    queryKey: ['team', id],
    queryFn: () => fetchTeam(id!),
    enabled: !!id,
    staleTime: Infinity,
  })

  const { data: matches = [], isLoading: loadingMatches } = useQuery({
    queryKey: ['team_matches', id],
    queryFn: () => fetchTeamMatches(id!),
    enabled: !!id,
    staleTime: 1000 * 60 * 5,
  })

  if (loadingTeam) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="animate-spin text-primary" size={28} />
      </div>
    )
  }

  if (!team) {
    return (
      <div className="text-center py-16">
        <p className="text-text-muted mb-4">Equipo no encontrado.</p>
        <Link to="/fixture" className="btn-primary text-sm">
          Ir al fixture
        </Link>
      </div>
    )
  }

  const displayName = team.is_confirmed
    ? team.name
    : (team.placeholder_name ?? team.name)

  const played    = matches.filter(m => m.status === 'finished')
  const won       = played.filter(m => m.winner_team_id === team.id)
  const drawn     = played.filter(m =>
    m.status === 'finished' &&
    m.winner_team_id === null &&
    (m.home_team?.id === team.id || m.away_team?.id === team.id)
  )
  const lost      = played.filter(m =>
    m.status === 'finished' &&
    m.winner_team_id !== null &&
    m.winner_team_id !== team.id
  )

  const goalsFor = played.reduce((sum, m) => {
    const isHome = m.home_team?.id === team.id
    return sum + ((isHome ? m.home_score_90 : m.away_score_90) ?? 0)
  }, 0)
  const goalsAgainst = played.reduce((sum, m) => {
    const isHome = m.home_team?.id === team.id
    return sum + ((isHome ? m.away_score_90 : m.home_score_90) ?? 0)
  }, 0)

  return (
    <div>
      {/* Breadcrumb */}
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-1.5 text-text-muted hover:text-text-primary text-sm mb-4 transition-colors"
      >
        <ArrowLeft size={15} />
        Atrás
      </button>

      {/* Header del equipo */}
      <div className="card p-5 mb-5">
        <div className="flex items-center gap-4">
          {/* Bandera */}
          {team.flag_url ? (
            <img
              src={team.flag_url}
              alt={team.abbreviation}
              className="w-16 h-12 rounded object-cover border border-border flex-shrink-0"
            />
          ) : (
            <div className="w-16 h-12 rounded bg-border flex items-center justify-center flex-shrink-0">
              <Shield size={20} className="text-text-muted" />
            </div>
          )}

          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-text-primary leading-tight">
              {displayName}
            </h1>
            {!team.is_confirmed && (
              <span className="badge bg-border text-text-muted text-[10px] mt-1">
                Por confirmar
              </span>
            )}
            <div className="flex items-center gap-3 mt-1">
              <span className="text-xs text-text-muted font-mono">{team.abbreviation}</span>
              {team.group && (
                <Link
                  to={`/grupos/${team.group.name}`}
                  className="text-xs text-primary hover:underline"
                >
                  Grupo {team.group.name}
                </Link>
              )}
            </div>
          </div>
        </div>

        {/* Stats rápidos (solo si jugó algo) */}
        {played.length > 0 && (
          <div className="grid grid-cols-5 gap-2 mt-4 pt-4 border-t border-border">
            {[
              { label: 'PJ', value: played.length },
              { label: 'PG', value: won.length },
              { label: 'PE', value: drawn.length },
              { label: 'PP', value: lost.length },
              { label: 'GD', value: goalsFor - goalsAgainst, sign: true },
            ].map(({ label, value, sign }) => (
              <div key={label} className="text-center">
                <p className={`text-base font-bold tabular-nums ${
                  sign
                    ? value > 0 ? 'text-primary' : value < 0 ? 'text-error' : 'text-text-primary'
                    : 'text-text-primary'
                }`}>
                  {sign && value > 0 ? `+${value}` : value}
                </p>
                <p className="text-[10px] text-text-muted uppercase tracking-wide">{label}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Partidos */}
      <h2 className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-3">
        Partidos
      </h2>

      {loadingMatches ? (
        <div className="flex justify-center py-8">
          <Loader2 className="animate-spin text-primary" size={22} />
        </div>
      ) : matches.length === 0 ? (
        <div className="card p-6 text-center text-text-muted text-sm">
          No hay partidos asignados a este equipo.
        </div>
      ) : (
        <div className="space-y-3">
          {matches.map(match => (
            <MatchCard key={match.id} match={match} />
          ))}
        </div>
      )}
    </div>
  )
}
