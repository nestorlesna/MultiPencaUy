import { useQuery } from '@tanstack/react-query'
import { Loader2, Users, Check, Trophy } from 'lucide-react'
import { Modal } from './Modal'
import { fetchTopRankPredictions } from '../../services/v2/predictionService'
import type { MatchWithRelations } from '../../types/match'
import type { PredictionSummaryV2 } from '../../services/v2/predictionService'

const TOP_LIMIT = 100

interface Props {
  open: boolean
  onClose: () => void
  match: MatchWithRelations | null
  loading: boolean
  summary: PredictionSummaryV2[]
  totalPredictions: number
  tenCompId?: string
}

export function MatchSummaryModal({ open, onClose, match, loading, summary, totalPredictions, tenCompId }: Props) {
  const homeScore = match?.home_score_90 ?? null
  const awayScore = match?.away_score_90 ?? null
  const homeName = match?.home_team?.name ?? match?.home_slot_label ?? '?'
  const awayName = match?.away_team?.name ?? match?.away_slot_label ?? '?'
  const maxCount = summary[0]?.count ?? 1

  // Abreviaturas para mostrar el ganador en penales.
  const homeAbbr = match?.home_team?.abbreviation ?? match?.home_slot_label ?? 'L'
  const awayAbbr = match?.away_team?.abbreviation ?? match?.away_slot_label ?? 'V'
  const pkAbbr = (teamId: string | null): string | null => {
    if (!teamId) return null
    if (teamId === match?.home_team?.id) return homeAbbr
    if (teamId === match?.away_team?.id) return awayAbbr
    return '?'
  }

  // Datos del desenlace real (solo tienen valor en knockout que llegó a esas instancias).
  const realEt = match && match.home_score_et !== null && match.away_score_et !== null
  const realPk = match && match.home_score_pk !== null && match.away_score_pk !== null
  const realPkWinner = pkAbbr(match?.winner_team_id ?? null)
  const hasResult = homeScore !== null && awayScore !== null

  // "Exacto" = acertó el marcador de 90'. Cuánto suma (los puntos del badge)
  // depende de cuánto más acertó: ET y ganador en penales suman bonus aparte,
  // ya reflejado en points_earned.
  const isExact90 = (item: PredictionSummaryV2): boolean =>
    item.home_score === homeScore && item.away_score === awayScore

  // Apuestas del top 100 del ranking. Visibles una vez que el partido comenzó
  // (la RLS libera las predicciones ajenas de partidos ya arrancados).
  const { data: topPredictions = [], isLoading: topLoading } = useQuery({
    queryKey: ['v2', 'top-rank-predictions', tenCompId, match?.id],
    queryFn: () => fetchTopRankPredictions(tenCompId!, match!.id, TOP_LIMIT),
    enabled: open && !!tenCompId && !!match?.id,
  })

  return (
    <Modal open={open} onClose={onClose} title="Apuestas" size="md">
      <div className="space-y-4">
        {/* Cabezal: resultado si el admin lo cargó, si no solo los equipos */}
        {hasResult ? (
          <div className="bg-primary/10 border border-primary/30 rounded-lg p-3 text-center">
            <p className="text-xs text-text-secondary mb-1">Resultado</p>
            <p className="text-base font-bold text-text-primary">
              {homeName} <span className="text-primary">{homeScore}</span>
              {' – '}
              <span className="text-primary">{awayScore}</span> {awayName}
            </p>
            {(realEt || realPk) && (
              <div className="flex items-center justify-center gap-3 mt-1.5 text-xs text-text-secondary tabular-nums">
                {realEt && (
                  <span>
                    ET <span className="font-semibold text-text-primary">{match!.home_score_et} – {match!.away_score_et}</span>
                  </span>
                )}
                {realPk && (
                  <span>
                    Pen. <span className="font-semibold text-text-primary">{match!.home_score_pk} – {match!.away_score_pk}</span>
                    {realPkWinner && <span className="text-primary font-semibold"> ({realPkWinner})</span>}
                  </span>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="bg-surface-2 border border-border rounded-lg p-3 text-center">
            <p className="text-xs text-text-secondary mb-1">Partido</p>
            <p className="text-base font-bold text-text-primary">
              {homeName} <span className="text-text-muted">–</span> {awayName}
            </p>
          </div>
        )}

        {/* Distribución / % de apuestas — solo con resultado cargado */}
        {hasResult && (
          <div className="space-y-3">
            {loading && (
              <div className="flex justify-center py-6">
                <Loader2 className="animate-spin text-primary" size={24} />
              </div>
            )}

            {!loading && summary.length === 0 && (
              <div className="flex flex-col items-center gap-2 py-6 text-text-muted">
                <Users size={32} className="opacity-30" />
                <p className="text-sm">Nadie apostó en este partido.</p>
              </div>
            )}

            {!loading && summary.length > 0 && (
              <>
                <div className="flex items-center gap-2 text-sm text-text-secondary">
                  <Users size={14} />
                  <span>{totalPredictions} {totalPredictions === 1 ? 'apuesta' : 'apuestas'}</span>
                </div>

                {/* Lista de 1 columna con scroll */}
                <div className="overflow-y-auto max-h-[20vh] pr-1 -mr-1">
                  <div className="grid grid-cols-1 gap-2">
                    {summary.map(item => {
                      const isExact = isExact90(item)
                      const pts = item.points_earned
                      const pct = totalPredictions > 0 ? Math.round((item.count / totalPredictions) * 100) : 0
                      const barWidth = Math.round((item.count / maxCount) * 100)
                      const itemPkWinner = pkAbbr(item.pk_winner_id)
                      const hasEt = item.home_score_et !== null && item.away_score_et !== null
                      return (
                        <div
                          key={`${item.home_score}-${item.away_score}-${item.home_score_et ?? ''}-${item.away_score_et ?? ''}-${item.pk_winner_id ?? ''}`}
                          className={`rounded-lg p-3 border flex flex-col gap-1.5 ${
                            isExact ? 'bg-primary/10 border-primary/40' : 'bg-surface border-border'
                          }`}
                        >
                          {/* Marcador */}
                          <div className="flex items-center justify-between gap-1">
                            <span className={`text-lg font-bold tabular-nums ${isExact ? 'text-primary' : 'text-text-primary'}`}>
                              {item.home_score} – {item.away_score}
                            </span>
                            {/* Puntos que suma este desenlace */}
                            {isExact ? (
                              <span className="flex items-center gap-0.5 text-[10px] font-semibold text-primary whitespace-nowrap">
                                <Check size={10} /> Ex {pts}p
                              </span>
                            ) : pts > 0 ? (
                              <span className="text-[10px] font-semibold text-accent whitespace-nowrap">
                                {pts}p
                              </span>
                            ) : null}
                          </div>

                          {/* Tiempo extra / penales de la apuesta (knockout) */}
                          {(hasEt || itemPkWinner) && (
                            <div className="flex items-center gap-2 text-[11px] text-text-secondary tabular-nums">
                              {hasEt && (
                                <span>ET <span className="font-semibold text-text-primary">{item.home_score_et} – {item.away_score_et}</span></span>
                              )}
                              {itemPkWinner && (
                                <span>Pen. <span className="font-semibold text-text-primary">{itemPkWinner}</span></span>
                              )}
                            </div>
                          )}

                          {/* % y cantidad */}
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-text-muted">{pct}%</span>
                            <span className="badge-primary text-[10px] font-semibold">{item.count}</span>
                          </div>

                          {/* Barra */}
                          <div className="h-1 bg-border rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${isExact ? 'bg-primary' : 'bg-text-muted'}`}
                              style={{ width: `${barWidth}%` }}
                            />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* Apuestas del top 10 del ranking */}
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-sm font-semibold text-text-primary">
            <Trophy size={14} className="text-accent" />
            <span>Apuestas del top {TOP_LIMIT}</span>
          </div>

          {!hasResult && (
            <p className="text-[11px] text-text-muted">
              El resultado y el % de apuestas aparecerán cuando el admin cargue el resultado.
            </p>
          )}

          {topLoading && (
            <div className="flex justify-center py-6">
              <Loader2 className="animate-spin text-primary" size={24} />
            </div>
          )}

          {!topLoading && topPredictions.length === 0 && (
            <p className="text-sm text-text-muted py-2">Todavía no hay ranking para este partido.</p>
          )}

          {!topLoading && topPredictions.length > 0 && (() => {
            // Cada jugador ocupa dos líneas: el nombre completo arriba (así no se
            // corta con "..." en celulares) y abajo las columnas alineadas contra
            // el borde derecho: resultado · ET · Pen · puntos.
            const COLS = 'grid grid-cols-[3rem_2.75rem_2.75rem_2.5rem] gap-2 justify-end w-max ml-auto items-center'
            return (
              <div className="rounded-lg border border-border overflow-y-auto max-h-[40vh]">
                {/* Encabezado de columnas */}
                <div className={`${COLS} px-3 py-1.5 bg-surface-2 sticky top-0 text-[9px] font-semibold uppercase tracking-wide text-text-muted`}>
                  <span className="text-center">Res</span>
                  <span className="text-center">ET</span>
                  <span className="text-center">Pen</span>
                  <span className="text-right">Pts</span>
                </div>

                <div className="divide-y divide-border">
                  {topPredictions.map(t => {
                    const predicted = t.home_score !== null && t.away_score !== null
                    const tEt = t.home_score_et !== null && t.away_score_et !== null
                    const tPk = pkAbbr(t.pk_winner_id)
                    const pts = t.points_earned ?? 0
                    return (
                      <div key={t.user_id} className="px-3 py-2 bg-surface">
                        {/* Línea 1: puesto + nombre completo */}
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-[11px] font-bold text-text-muted tabular-nums">
                            {t.rank}
                          </span>
                          <span className="text-sm text-text-primary break-words">{t.display_name}</span>
                        </div>

                        {/* Línea 2: columnas */}
                        <div className={`${COLS} mt-0.5`}>
                          {predicted ? (
                            <>
                              <span className="text-center text-[13px] font-semibold tabular-nums text-text-primary whitespace-nowrap">
                                {t.home_score}-{t.away_score}
                              </span>
                              <span className="text-center text-[11px] tabular-nums text-text-secondary whitespace-nowrap">
                                {tEt ? `${t.home_score_et}-${t.away_score_et}` : '·'}
                              </span>
                              <span className="text-center text-[11px] font-semibold text-accent whitespace-nowrap">
                                {tPk ?? '·'}
                              </span>
                            </>
                          ) : (
                            <span className="col-span-3 text-center text-xs text-text-muted italic">Sin apuesta</span>
                          )}
                          <span className="text-right">
                            {hasResult && pts > 0 ? (
                              <span className="badge-primary text-[10px] font-semibold">{pts}p</span>
                            ) : (
                              <span className="text-[11px] text-text-muted">·</span>
                            )}
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })()}
        </div>
      </div>
    </Modal>
  )
}
