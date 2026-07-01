import { useQuery } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { Loader2, Target, Gift, Clock } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { TeamFlag } from '../ui/TeamFlag'
import { Avatar } from './LeaderboardView'
import {
  fetchUserScoredMatches,
  fetchUserBonusPoints,
  type UserScoredMatch,
  type UserBonusPoint,
} from '../../services/v2/leaderboardService'
import type { LeaderboardEntry } from '../../types'

// Etiquetas amigables para cada tipo de bonus (+Puntos).
const BONUS_LABELS: Record<string, { label: string; icon: string }> = {
  podio:           { label: 'Podio del torneo',        icon: '🏆' },
  empates_grupos:  { label: 'Empates en fase de grupos', icon: '🤝' },
  rango_goles:     { label: 'Rango de goles del torneo', icon: '⚽' },
  final_cero:      { label: '¿0-0 en la Final?',        icon: '🎯' },
  top_scorer_team: { label: 'Equipo goleador',          icon: '🥅' },
  top_group_goals: { label: 'Grupo goleador',           icon: '📊' },
}

function bonusLabel(type: string): { label: string; icon: string } {
  return BONUS_LABELS[type] ?? { label: type.replace(/_/g, ' '), icon: '⭐' }
}

// Marcador real, agregando ET / penales si los hay.
function realScore(m: UserScoredMatch): string {
  if (m.home_score_90 === null || m.away_score_90 === null) return '- : -'
  let s = `${m.home_score_90} : ${m.away_score_90}`
  if (m.home_score_et !== null && m.away_score_et !== null) s += ` (ET ${m.home_score_et}-${m.away_score_et})`
  if (m.home_score_pk !== null && m.away_score_pk !== null) s += ` (pen ${m.home_score_pk}-${m.away_score_pk})`
  return s
}

function predScore(m: UserScoredMatch): string {
  let s = `${m.pred_home} : ${m.pred_away}`
  if (m.pred_home_et !== null && m.pred_away_et !== null) s += ` (ET ${m.pred_home_et}-${m.pred_away_et})`
  return s
}

function MatchRow({ m }: { m: UserScoredMatch }) {
  return (
    <div className="card p-3">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <TeamFlag team={m.home_team} size="sm" abbrev />
          <span className="text-text-muted text-xs">vs</span>
          <TeamFlag team={m.away_team} size="sm" abbrev />
        </div>
        <span className="flex-shrink-0 badge bg-primary/20 text-primary text-[11px] font-bold">
          +{m.points_earned} pts
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-lg bg-surface-2/40 px-2.5 py-1.5">
          <p className="text-text-muted text-[10px] uppercase tracking-wide">Apostó</p>
          <p className="text-text-primary font-semibold tabular-nums">{predScore(m)}</p>
        </div>
        <div className="rounded-lg bg-surface-2/40 px-2.5 py-1.5">
          <p className="text-text-muted text-[10px] uppercase tracking-wide">Real</p>
          <p className="text-text-primary font-semibold tabular-nums">{realScore(m)}</p>
        </div>
      </div>
      {m.predicted_at && (
        <p className="flex items-center gap-1 text-[10px] text-text-muted mt-1.5">
          <Clock size={10} />
          {format(parseISO(m.predicted_at), "d MMM yyyy, HH:mm", { locale: es })}
        </p>
      )}
    </div>
  )
}

function BonusRow({ b }: { b: UserBonusPoint }) {
  const { label, icon } = bonusLabel(b.bonus_type)
  return (
    <div className="card p-3 flex items-center gap-3">
      <span className="text-lg flex-shrink-0">{icon}</span>
      <span className="flex-1 min-w-0 text-sm text-text-primary truncate">{label}</span>
      <span className="flex-shrink-0 badge bg-accent/20 text-accent text-[11px] font-bold">
        +{b.points_earned} pts
      </span>
    </div>
  )
}

export function UserScoreDetailModal({
  tenCompId,
  entry,
  onClose,
}: {
  tenCompId: string
  entry: LeaderboardEntry | null
  onClose: () => void
}) {
  const userId = entry?.user_id

  const { data: matches = [], isLoading: loadingMatches } = useQuery({
    queryKey: ['v2', 'user-scored-matches', tenCompId, userId],
    queryFn: () => fetchUserScoredMatches(tenCompId, userId!),
    enabled: !!userId,
    staleTime: 1000 * 60 * 2,
  })

  const { data: bonuses = [], isLoading: loadingBonus } = useQuery({
    queryKey: ['v2', 'user-bonus-points', tenCompId, userId],
    queryFn: () => fetchUserBonusPoints(tenCompId, userId!),
    enabled: !!userId,
    staleTime: 1000 * 60 * 2,
  })

  const isLoading = loadingMatches || loadingBonus
  const matchPts = matches.reduce((s, m) => s + m.points_earned, 0)
  const bonusPts = bonuses.reduce((s, b) => s + b.points_earned, 0)

  return (
    <Modal open={!!entry} onClose={onClose} size="lg" title="Detalle de puntos">
      {entry && (
        <div className="space-y-4">
          {/* Cabecera del usuario */}
          <div className="flex items-center gap-3">
            <Avatar entry={entry} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-text-primary truncate">{entry.display_name}</p>
              <p className="text-xs text-text-muted">Puesto #{entry.rank}</p>
            </div>
            <div className="text-right">
              <p className="text-xl font-bold tabular-nums text-primary leading-none">{entry.total_points}</p>
              <p className="text-[10px] text-text-muted mt-0.5">pts</p>
            </div>
          </div>

          {isLoading && (
            <div className="flex justify-center py-10">
              <Loader2 className="animate-spin text-primary" size={24} />
            </div>
          )}

          {!isLoading && (
            <div className="max-h-[60vh] overflow-y-auto space-y-5 pr-0.5">
              {/* Partidos con punto */}
              <section>
                <div className="flex items-center gap-1.5 mb-2">
                  <Target size={14} className="text-primary" />
                  <h3 className="text-xs font-semibold text-text-primary uppercase tracking-wide">
                    Partidos con puntos
                  </h3>
                  <span className="text-[11px] text-text-muted">({matchPts} pts)</span>
                </div>
                {matches.length === 0 ? (
                  <p className="text-xs text-text-muted card p-3">Todavía no sumó puntos en partidos.</p>
                ) : (
                  <div className="space-y-2">
                    {matches.map(m => <MatchRow key={m.prediction_id} m={m} />)}
                  </div>
                )}
              </section>

              {/* +Puntos (bonus) */}
              {bonuses.length > 0 && (
                <section>
                  <div className="flex items-center gap-1.5 mb-2">
                    <Gift size={14} className="text-accent" />
                    <h3 className="text-xs font-semibold text-text-primary uppercase tracking-wide">
                      +Puntos
                    </h3>
                    <span className="text-[11px] text-text-muted">({bonusPts} pts)</span>
                  </div>
                  <div className="space-y-2">
                    {bonuses.map(b => <BonusRow key={b.bonus_type} b={b} />)}
                  </div>
                </section>
              )}
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}
