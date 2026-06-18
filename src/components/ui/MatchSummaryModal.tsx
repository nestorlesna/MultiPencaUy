import { Loader2, Users, Check } from 'lucide-react'
import { Modal } from './Modal'
import type { MatchWithRelations } from '../../types/match'
import type { PredictionSummaryV2 } from '../../services/v2/predictionService'

interface Props {
  open: boolean
  onClose: () => void
  match: MatchWithRelations | null
  loading: boolean
  summary: PredictionSummaryV2[]
  totalPredictions: number
}

export function MatchSummaryModal({ open, onClose, match, loading, summary, totalPredictions }: Props) {
  const homeScore = match?.home_score_90 ?? null
  const awayScore = match?.away_score_90 ?? null
  const homeName = match?.home_team?.name ?? match?.home_slot_label ?? '?'
  const awayName = match?.away_team?.name ?? match?.away_slot_label ?? '?'
  const maxCount = summary[0]?.count ?? 1

  return (
    <Modal open={open} onClose={onClose} title="Apuestas" size="md">
      <div className="space-y-3">
        {/* Resultado */}
        {homeScore !== null && awayScore !== null && (
          <div className="bg-primary/10 border border-primary/30 rounded-lg p-3 text-center">
            <p className="text-xs text-text-secondary mb-1">Resultado</p>
            <p className="text-base font-bold text-text-primary">
              {homeName} <span className="text-primary">{homeScore}</span>
              {' – '}
              <span className="text-primary">{awayScore}</span> {awayName}
            </p>
          </div>
        )}

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

            {/* Grid 2 columnas con scroll */}
            <div className="overflow-y-auto max-h-[52vh] pr-1 -mr-1">
              <div className="grid grid-cols-2 gap-2">
                {summary.map(item => {
                  const isExact = homeScore === item.home_score && awayScore === item.away_score
                  const pct = totalPredictions > 0 ? Math.round((item.count / totalPredictions) * 100) : 0
                  const barWidth = Math.round((item.count / maxCount) * 100)
                  return (
                    <div
                      key={`${item.home_score}-${item.away_score}`}
                      className={`rounded-lg p-3 border flex flex-col gap-1.5 ${
                        isExact ? 'bg-primary/10 border-primary/40' : 'bg-surface border-border'
                      }`}
                    >
                      {/* Marcador */}
                      <div className="flex items-center justify-between">
                        <span className={`text-lg font-bold tabular-nums ${isExact ? 'text-primary' : 'text-text-primary'}`}>
                          {item.home_score} – {item.away_score}
                        </span>
                        {isExact && (
                          <span className="flex items-center gap-0.5 text-[10px] font-semibold text-primary">
                            <Check size={10} /> Exacto
                          </span>
                        )}
                      </div>

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
    </Modal>
  )
}
