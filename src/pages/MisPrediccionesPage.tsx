import { useState, useMemo } from 'react'
import { Loader2, Star, Lock } from 'lucide-react'
import { RequireAuth, RequireActive } from '../components/auth/AuthGuard'
import { PredictionModal } from '../components/predictions/PredictionModal'
import { TeamFlag } from '../components/ui/TeamFlag'
import { useMatches } from '../hooks/useMatches'
import { useMyPredictionsMap, useMyPredictions } from '../hooks/usePredictions'
import { formatMatchDay, formatMatchTime } from '../utils/datetime'
import { GROUPS } from '../utils/constants'
import type { MatchWithRelations } from '../types/match'
import type { PredictionWithMatch } from '../services/predictionService'

type Tab = 'predecir' | 'historial'

const PHASE_TABS = [
  { label: 'Todos',   phaseOrder: undefined },
  { label: 'Grupos',  phaseOrder: 1 },
  { label: '16avos',  phaseOrder: 2 },
  { label: '8vos',    phaseOrder: 3 },
  { label: 'Cuartos', phaseOrder: 4 },
  { label: 'Semi',    phaseOrder: 5 },
  { label: '3er',     phaseOrder: 6 },
  { label: 'Final',   phaseOrder: 7 },
]

function ScoreBadge({ pred }: { pred: PredictionWithMatch }) {
  return (
    <span className="text-sm font-bold tabular-nums text-text-primary">
      {pred.home_score} – {pred.away_score}
      {pred.home_score_et !== null && (
        <span className="text-xs text-text-muted ml-1">
          (ET {pred.home_score_et}:{pred.away_score_et})
        </span>
      )}
    </span>
  )
}

function PointsBadge({ points }: { points: number | null }) {
  if (points === null) return <span className="badge bg-border text-text-muted text-[10px]">—</span>
  if (points === 0) return <span className="badge bg-border text-text-muted text-[10px]">0 pts</span>
  return (
    <span className="badge bg-primary/20 text-primary text-[10px] font-semibold">
      +{points} pts
    </span>
  )
}

// ─── Tab: Predecir ────────────────────────────────────────────────────────────

function PredecirTab() {
  const [phaseOrder, setPhaseOrder] = useState<number | undefined>(undefined)
  const [groupName, setGroupName] = useState<string | undefined>(undefined)
  const { data: matches = [], isLoading } = useMatches({ phaseOrder, groupName })
  const { data: predsMap = new Map(), isLoading: loadingPreds } = useMyPredictionsMap()
  const [selected, setSelected] = useState<MatchWithRelations | null>(null)

  const upcoming = useMemo(
    () => matches.filter(m => m.home_score_90 === null),
    [matches]
  )

  const showGroupFilter = phaseOrder === 1 || phaseOrder === undefined

  return (
    <>
      {/* Tabs de fase */}
      <div className="flex gap-1 overflow-x-auto pb-1 mb-3 scrollbar-hide -mx-4 px-4">
        {PHASE_TABS.map((t) => (
          <button
            key={t.label}
            onClick={() => {
              setPhaseOrder(t.phaseOrder)
              if (t.phaseOrder !== 1 && t.phaseOrder !== undefined) {
                setGroupName(undefined)
              }
            }}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              phaseOrder === t.phaseOrder
                ? 'bg-primary text-white'
                : 'bg-surface-2 text-text-secondary hover:text-text-primary'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Filtro de grupo (solo en fase grupos o "todos") */}
      {showGroupFilter && (
        <div className="flex gap-1 overflow-x-auto pb-1 mb-4 scrollbar-hide -mx-4 px-4">
          <button
            onClick={() => setGroupName(undefined)}
            className={`flex-shrink-0 px-2.5 py-1 rounded text-xs font-medium transition-colors ${
              !groupName
                ? 'bg-accent/20 text-accent'
                : 'text-text-muted hover:text-text-secondary'
            }`}
          >
            Todos
          </button>
          {GROUPS.map((g) => (
            <button
              key={g}
              onClick={() => {
                setGroupName(g)
                setPhaseOrder(1)
              }}
              className={`flex-shrink-0 px-2 h-7 rounded text-xs font-bold transition-colors ${
                groupName === g
                  ? 'bg-accent/20 text-accent'
                  : 'text-text-muted hover:text-text-secondary'
              }`}
            >
              G. {g}
            </button>
          ))}
        </div>
      )}

      {(isLoading || loadingPreds) && (
        <div className="flex justify-center py-16">
          <Loader2 className="animate-spin text-primary" size={28} />
        </div>
      )}

      {!isLoading && !loadingPreds && upcoming.length === 0 && (
        <p className="text-text-muted text-sm text-center py-12">
          No hay partidos próximos para predecir.
        </p>
      )}

      <div className="space-y-2">
        {!isLoading && !loadingPreds && upcoming.map(match => {
          const pred = predsMap.get(match.id) ?? null
          return (
            <div
              key={match.id}
              className="card p-3 flex items-center gap-3 cursor-pointer hover:border-primary/40 transition-colors"
              onClick={() => setSelected(match)}
            >
              {/* Phase badge + number */}
              <div className="flex-shrink-0 w-10 text-center">
                <p className="text-[11px] text-text-muted">#{match.match_number}</p>
                {match.group ? (
                  <span className="badge-primary text-[9px]">G{match.group.name}</span>
                ) : (
                  <span className="badge bg-accent/20 text-accent text-[9px]">
                    {match.phase.name.substring(0, 3)}
                  </span>
                )}
              </div>

              {/* Teams */}
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <TeamFlag team={match.home_team} slotLabel={match.home_slot_label} size="sm" align="left" abbrev />
                  </div>
                  <span className="text-text-muted text-xs">vs</span>
                  <div className="flex-1 min-w-0 flex justify-end">
                    <TeamFlag team={match.away_team} slotLabel={match.away_slot_label} size="sm" align="right" abbrev />
                  </div>
                </div>
                <p className="text-[11px] text-text-muted">
                  {formatMatchDay(match.match_datetime)} · {formatMatchTime(match.match_datetime)}
                </p>
              </div>

              {/* Prediction status */}
              <div className="flex-shrink-0 text-right min-w-[60px]">
                {pred ? (
                  <div>
                    <ScoreBadge pred={pred} />
                    <p className="text-[10px] text-primary mt-0.5">✓ Guardada</p>
                  </div>
                ) : (
                  <span className="text-[11px] text-text-muted italic">Sin pred.</span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <PredictionModal
        match={selected}
        existing={selected ? (predsMap.get(selected.id) ?? null) : null}
        onClose={() => setSelected(null)}
      />
    </>
  )
}

// ─── Tab: Historial ───────────────────────────────────────────────────────────

function HistorialTab() {
  const { data: preds = [], isLoading } = useMyPredictions()

  const past = useMemo(
    () => preds
      .filter(p => p.match.home_score_90 !== null)
      .sort((a, b) => new Date(b.match.match_datetime).getTime() - new Date(a.match.match_datetime).getTime()),
    [preds]
  )

  const totalPoints = useMemo(
    () => past.reduce((sum, p) => sum + (p.points_earned ?? 0), 0),
    [past]
  )

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="animate-spin text-primary" size={28} />
      </div>
    )
  }

  if (past.length === 0) {
    return (
      <p className="text-text-muted text-sm text-center py-12">
        Aún no hay predicciones en el historial.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      {/* Resumen de puntos */}
      <div className="card p-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Star size={16} className="text-accent" />
          <span className="text-sm text-text-secondary">Puntos totales</span>
        </div>
        <span className="text-2xl font-bold text-primary tabular-nums">{totalPoints}</span>
      </div>

      {past.map(pred => {
        const m = pred.match
        const isFinished = m.home_score_90 !== null
        return (
          <div key={pred.id} className="card p-3 flex items-center gap-3">
            {/* Match info */}
            <div className="flex-shrink-0 w-10 text-center">
              <p className="text-[11px] text-text-muted">#{m.match_number}</p>
              {m.group ? (
                <span className="badge-primary text-[9px]">G{m.group.name}</span>
              ) : (
                <span className="badge bg-accent/20 text-accent text-[9px]">
                  {m.phase.name.substring(0, 3)}
                </span>
              )}
            </div>

            {/* Teams + scores */}
            <div className="flex-1 min-w-0 space-y-1">
              <div className="flex items-center gap-2 text-xs">
                <div className="flex-1 min-w-0">
                  <TeamFlag team={m.home_team} slotLabel={m.home_slot_label} size="sm" align="left" abbrev />
                </div>

                <div className="flex-shrink-0 text-center space-y-0.5">
                  {/* Real result */}
                  {isFinished && m.home_score_90 !== null ? (
                    <p className="text-xs font-bold text-text-primary tabular-nums">
                      {m.home_score_90} – {m.away_score_90}
                    </p>
                  ) : (
                    <div className="flex items-center gap-1 text-text-muted">
                      <Lock size={10} />
                      <span className="text-[10px]">Esperando</span>
                    </div>
                  )}
                  {/* My prediction */}
                  <p className="text-[10px] text-text-muted">
                    Mi pred: {pred.home_score}–{pred.away_score}
                  </p>
                </div>

                <div className="flex-1 min-w-0 flex justify-end">
                  <TeamFlag team={m.away_team} slotLabel={m.away_slot_label} size="sm" align="right" abbrev />
                </div>
              </div>
            </div>

            {/* Points */}
            <div className="flex-shrink-0">
              <PointsBadge points={isFinished ? pred.points_earned : null} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function MisPrediccionesPage() {
  const [tab, setTab] = useState<Tab>('predecir')

  return (
    <RequireAuth>
      <RequireActive>
        <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
          <h1 className="text-xl font-bold text-text-primary">Mis predicciones</h1>

          {/* Tabs */}
          <div className="flex gap-1 bg-surface-2 p-1 rounded-xl">
            {(['predecir', 'historial'] as Tab[]).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors capitalize ${
                  tab === t
                    ? 'bg-surface text-text-primary shadow-sm'
                    : 'text-text-muted hover:text-text-secondary'
                }`}
              >
                {t === 'predecir' ? 'Predecir' : 'Historial'}
              </button>
            ))}
          </div>

          {tab === 'predecir' ? <PredecirTab /> : <HistorialTab />}
        </div>
      </RequireActive>
    </RequireAuth>
  )
}
