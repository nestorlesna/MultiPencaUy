import { MapPin, Users } from 'lucide-react'
import { TeamFlag } from '../ui/TeamFlag'
import { formatMatchTime } from '../../utils/datetime'
import type { MatchWithRelations } from '../../types/match'

interface Props {
  match: MatchWithRelations
  onClick?: () => void
  onStadiumClick?: (stadiumId: string) => void
  onPredictionsClick?: (matchId: string) => void
  footerContent?: React.ReactNode
}

export function MatchCard({ match, onClick, onStadiumClick, onPredictionsClick, footerContent }: Props) {
  const hasScore = match.home_score_90 !== null && match.away_score_90 !== null

  const homeWon = hasScore && match.winner_team_id === match.home_team?.id
  const awayWon = hasScore && match.winner_team_id === match.away_team?.id

  return (
    <div
      className={`card p-4 transition-colors ${onClick ? 'cursor-pointer hover:border-primary/40' : ''}`}
      onClick={onClick}
    >
      {/* Encabezado: fase / grupo + fecha/hora */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {match.group && (
            <span className="badge-primary text-[10px] font-semibold uppercase tracking-wide">
              Grupo {match.group.name}
            </span>
          )}
          {!match.group && (
            <span className="badge bg-accent/20 text-accent text-[10px] font-semibold uppercase tracking-wide">
              {match.phase.name}
            </span>
          )}
          <span className="text-text-muted text-xs">#{match.match_number}</span>
        </div>

        {hasScore ? (
          <button
            className="flex items-center gap-1 text-text-muted text-xs hover:text-primary transition-colors"
            onClick={(e) => {
              e.stopPropagation()
              onPredictionsClick?.(match.id)
            }}
          >
            <Users size={12} />
            <span>Ver apuestas</span>
          </button>
        ) : (
          <span className="text-text-secondary text-xs">
            {formatMatchTime(match.match_datetime)}
          </span>
        )}
      </div>

      {/* Equipos y marcador */}
      <div className="flex items-center gap-3">
        {/* Local */}
        <div className="flex-1">
          <TeamFlag
            team={match.home_team}
            slotLabel={match.home_slot_label}
            size="md"
            align="left"
          />
        </div>

        {/* Marcador / VS */}
        <div className="flex-shrink-0 w-20 text-center">
          {hasScore ? (
            <div className="flex items-center justify-center gap-1.5">
              <span className={`text-2xl font-bold tabular-nums ${homeWon ? 'text-primary' : 'text-text-primary'}`}>
                {match.home_score_90}
              </span>
              <span className="text-text-muted text-lg">:</span>
              <span className={`text-2xl font-bold tabular-nums ${awayWon ? 'text-primary' : 'text-text-primary'}`}>
                {match.away_score_90}
              </span>
            </div>
          ) : (
            <span className="text-text-muted text-xl font-light">vs</span>
          )}

          {/* Indicadores de ET y penales */}
          {match.home_score_et !== null && (
            <div className="text-xs text-text-muted mt-1 tabular-nums">
              ET {match.home_score_et} - {match.away_score_et}
            </div>
          )}
          {match.home_score_pk !== null && (
            <div className="text-xs text-accent font-semibold mt-0.5 tabular-nums">
              Pen. {match.home_score_pk} - {match.away_score_pk}
            </div>
          )}
        </div>

        {/* Visitante */}
        <div className="flex-1 flex justify-end">
          <TeamFlag
            team={match.away_team}
            slotLabel={match.away_slot_label}
            size="md"
            align="right"
          />
        </div>
      </div>

      {/* Footer: estadio (default) o contenido custom. El estadio puede no estar
          cargado (ej. ligas sin estadios) → se omite el footer por defecto. */}
      {(footerContent || match.stadium) && (
        <div className="mt-3 pt-3 border-t border-border">
          {footerContent ?? (
            <div
              className="flex items-center gap-1 cursor-pointer hover:text-text-secondary transition-colors"
              onClick={(e) => {
                e.stopPropagation()
                onStadiumClick?.(match.stadium!.id)
              }}
            >
              <MapPin size={11} className="text-text-muted flex-shrink-0" />
              <span className="text-[11px] text-text-muted truncate">
                {match.stadium!.name} · {match.stadium!.city}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
