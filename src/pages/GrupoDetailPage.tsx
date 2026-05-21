import { useMemo } from 'react'
import { useNavigate, useParams, useSearchParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Loader2, Trophy, User } from 'lucide-react'
import { GroupTable } from '../components/groups/GroupTable'
import { MatchCard } from '../components/matches/MatchCard'
import { useGroupStandings } from '../hooks/useGroupStandings'
import { useMatches } from '../hooks/useMatches'
import { useAuth } from '../hooks/useAuth'
import { fetchUserPredictionsMap } from '../services/predictionService'
import { fetchTeamsInGroups, buildVirtualGroupStandings } from '../utils/virtualBracket'
import { GROUPS } from '../utils/constants'

export function GrupoDetailPage() {
  const { grupo } = useParams<{ grupo: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { user } = useAuth()

  const groupName = grupo?.toUpperCase() ?? ''
  const isValid = GROUPS.includes(groupName)
  const isMio = searchParams.get('vista') === 'mias'

  // Posiciones y partidos oficiales
  const { data: standings = [], isLoading: loadingStandings } = useGroupStandings(groupName)
  const { data: matches = [], isLoading: loadingMatches } = useMatches({
    phaseOrder: 1,
    groupName,
  })

  // Posiciones y predicciones del usuario (modo "Mis Grupos")
  const { data: mioData, isLoading: loadingMio } = useQuery({
    queryKey: ['grupoDetailMio', user?.id, groupName],
    enabled: isMio && !!user && isValid,
    staleTime: 1000 * 60,
    queryFn: async () => {
      const [teams, predMap] = await Promise.all([
        fetchTeamsInGroups(),
        fetchUserPredictionsMap(user!.id),
      ])
      const standings = buildVirtualGroupStandings(
        teams,
        Array.from(predMap.values()),
      ).filter((s) => s.group_name === groupName)
      return { standings, predMap }
    },
  })

  // Partidos del grupo con los marcadores apostados por el usuario
  const mioMatches = useMemo(() => {
    if (!isMio || !mioData) return []
    return matches.map((m) => {
      const p = mioData.predMap.get(m.id)
      return {
        ...m,
        home_score_90: p?.home_score ?? null,
        away_score_90: p?.away_score ?? null,
        home_score_et: null,
        away_score_et: null,
        home_score_pk: null,
        away_score_pk: null,
        winner_team_id: null,
      }
    })
  }, [isMio, mioData, matches])

  if (!isValid) {
    return (
      <div className="text-center py-16">
        <p className="text-text-muted mb-4">Grupo "{grupo}" no existe.</p>
        <Link to="/grupos" className="btn-primary text-sm">
          Ver todos los grupos
        </Link>
      </div>
    )
  }

  const standingsRows = isMio ? (mioData?.standings ?? []) : standings
  const matchesRows = isMio ? mioMatches : matches
  const loadingStandingsView = isMio ? loadingMio : loadingStandings
  const loadingMatchesView = isMio ? loadingMio || loadingMatches : loadingMatches

  return (
    <div>
      {/* Breadcrumb */}
      <button
        onClick={() => navigate(isMio ? '/grupos?vista=mias' : '/grupos')}
        className="flex items-center gap-1.5 text-text-muted hover:text-text-primary text-sm mb-4 transition-colors"
      >
        <ArrowLeft size={15} />
        Grupos
      </button>

      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
          <span className="text-lg font-bold text-primary">{groupName}</span>
        </div>
        <h1 className="text-xl font-bold text-text-primary">Grupo {groupName}</h1>
      </div>

      {/* Indicador de vista */}
      <div
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium mb-5 ${
          isMio
            ? 'bg-accent/15 text-accent'
            : 'bg-primary/15 text-primary'
        }`}
      >
        {isMio ? <User size={12} /> : <Trophy size={12} />}
        {isMio ? 'Según mis apuestas' : 'Resultados del torneo'}
      </div>

      {isMio && !user ? (
        <div className="text-center py-16 space-y-2">
          <User size={40} className="mx-auto text-text-muted" />
          <p className="text-text-secondary text-sm">
            Iniciá sesión para ver este grupo según tus apuestas.
          </p>
        </div>
      ) : (
        <>
          {isMio && (
            <div className="card p-3 mb-5 text-sm text-text-secondary">
              Posiciones y marcadores calculados con los resultados que cargaste
              en tus apuestas (sección{' '}
              <span className="font-medium text-text-primary">JUGAR</span>) — no
              son los resultados oficiales del torneo.
            </div>
          )}

          {/* Tabla de posiciones */}
          <section className="card p-4 mb-5">
            <h2 className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-3">
              Posiciones
            </h2>
            {loadingStandingsView ? (
              <div className="flex justify-center py-6">
                <Loader2 className="animate-spin text-primary" size={22} />
              </div>
            ) : (
              <GroupTable
                standings={standingsRows}
                compact={false}
                onTeamClick={(teamId) => navigate(`/equipos/${teamId}`)}
              />
            )}
          </section>

          {/* Partidos del grupo */}
          <section>
            <h2 className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-3">
              {isMio ? 'Mis apuestas' : 'Partidos'}
            </h2>
            {loadingMatchesView ? (
              <div className="flex justify-center py-6">
                <Loader2 className="animate-spin text-primary" size={22} />
              </div>
            ) : matchesRows.length === 0 ? (
              <p className="text-text-muted text-sm text-center py-6">
                Sin partidos cargados.
              </p>
            ) : (
              <div className="space-y-3">
                {matchesRows.map((match) => (
                  <MatchCard key={match.id} match={match} />
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}
