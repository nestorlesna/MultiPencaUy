import { Users, Check } from 'lucide-react'
import { Modal } from './Modal'
import type { PredictionSummary } from '../../services/predictionService'

interface Props {
  open: boolean
  onClose: () => void
  homeTeam: string
  awayTeam: string
  homeScore: number | null
  awayScore: number | null
  summary: PredictionSummary[]
  totalPredictions: number
}

export function PredictionsSummaryModal({
  open,
  onClose,
  homeTeam,
  awayTeam,
  homeScore,
  awayScore,
  summary,
  totalPredictions,
}: Props) {

  const maxCount = summary[0]?.count ?? 1

  return (
    <Modal open={open} onClose={onClose} title="Predicciones" size="md">
      <div className="space-y-4">
        {/* Resultado real */}
        {homeScore !== null && awayScore !== null && (
          <div className="bg-primary/10 border border-primary/30 rounded-lg p-3 text-center">
            <p className="text-xs text-text-secondary mb-1">Resultado</p>
            <p className="text-lg font-bold text-text-primary">
              {homeTeam} <span className="text-primary">{homeScore}</span> - <span className="text-primary">{awayScore}</span> {awayTeam}
            </p>
          </div>
        )}

        {/* Sin apuestas */}
        {summary.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-6 text-text-muted">
            <Users size={32} className="opacity-30" />
            <p className="text-sm">Nadie apostó en este partido.</p>
          </div>
        )}

        {/* Total */}
        {summary.length > 0 && (
          <div className="flex items-center gap-2 text-sm text-text-secondary">
            <Users size={14} />
            <span>{totalPredictions} predicciones</span>
          </div>
        )}

        {/* Lista de resultados */}
        <div className="space-y-2">
          {summary.map((item) => {
            const isExact = homeScore === item.home_score && awayScore === item.away_score
            const pct = totalPredictions > 0 ? Math.round((item.count / totalPredictions) * 100) : 0
            const barWidth = Math.round((item.count / maxCount) * 100)

            return (
              <div
                key={`${item.home_score}-${item.away_score}`}
                className={`relative rounded-lg p-3 border transition-colors ${
                  isExact
                    ? 'bg-primary/10 border-primary/40'
                    : 'bg-surface-2 border-border'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-base font-bold text-text-primary tabular-nums">
                      {item.home_score} - {item.away_score}
                    </span>
                    {isExact && (
                      <span className="flex items-center gap-0.5 text-[10px] font-semibold text-primary uppercase tracking-wide">
                        <Check size={10} />
                        Exacto
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-text-secondary">{pct}%</span>
                    <span className="badge-primary text-[10px] font-semibold">
                      {item.count}
                    </span>
                  </div>
                </div>

                {/* Barra de progreso */}
                <div className="h-1.5 bg-border rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      isExact ? 'bg-primary' : 'bg-text-muted'
                    }`}
                    style={{ width: `${barWidth}%` }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </Modal>
  )
}
