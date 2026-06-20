import { useState } from 'react'
import { HelpCircle } from 'lucide-react'
import { useTenComp } from '../../contexts/TenCompContext'
import type { TenCompScoring } from '../../types/tenant'

export function PencaAyudaPage() {
  const { scoring, tenComp, competition } = useTenComp()
  const isLeague = competition.advancement_engine === null

  if (!scoring) {
    return (
      <div className="card p-6 text-center text-text-muted text-sm">
        No hay configuración de puntaje disponible para esta penca.
      </div>
    )
  }

  const maxPts = scoring.exact_score_points
  const maxElim = scoring.exact_score_points + scoring.knockout_exact_score_bonus
  const maxConPenales = maxElim + scoring.correct_et_result_points + scoring.correct_pk_winner_points

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-8">
      <div className="flex items-center gap-3">
        <HelpCircle className="text-primary flex-shrink-0" size={24} />
        <div>
          <h1 className="text-xl font-bold text-text-primary">¿Cómo funciona la Penca?</h1>
          <p className="text-xs text-text-muted mt-0.5">{tenComp.name}</p>
        </div>
      </div>

      <div className="card p-4">
        <p className="text-sm text-text-secondary leading-relaxed">
          Predecís el resultado de cada partido antes de que empiece. Cuanto más preciso, más puntos ganás.
          Al final del torneo, el jugador con más puntos gana la penca.
        </p>
        <p className="text-[12px] text-text-muted leading-relaxed mt-2">
          Las predicciones se bloquean automáticamente cuando el partido comienza.
        </p>
      </div>

      {/* Sección de puntos: "Competencia" para ligas, "Fase de grupos" para torneos */}
      <section className="space-y-3">
        <SectionHeader>{isLeague ? 'Competencia' : 'Fase de grupos'}</SectionHeader>
        <div className="card p-4">
          <p className="text-sm text-text-secondary mb-3">
            Predecís el marcador exacto a 90 minutos. Los puntos se acumulan:
          </p>
          <PtsRow label="Resultado exacto" pts={scoring.exact_score_points}
            sub="Acertaste el marcador exacto" />
          <PtsRow label="Ganador correcto" pts={scoring.correct_winner_points}
            sub="Acertaste quién ganó pero no el marcador exacto" />
          <PtsRow label="Empate correcto" pts={scoring.correct_draw_points}
            sub="Predijiste empate y fue empate (aunque no sea el marcador exacto)" />
        </div>
        <div className="bg-primary/5 border border-primary/20 rounded-xl p-3 flex items-center justify-between">
          <p className="text-xs text-text-secondary">Máximo por partido</p>
          <span className="text-lg font-bold text-primary">{maxPts} pts</span>
        </div>
      </section>

      {/* Fase eliminatoria: solo en torneos con eliminación */}
      {!isLeague && (
        <section className="space-y-3">
          <SectionHeader>Fase eliminatoria</SectionHeader>
          <div className="card p-4">
            <p className="text-sm text-text-secondary mb-3">
              En eliminatorias hay tiempo extra y penales. La predicción es progresiva.
            </p>
            <PtsRow label="Resultado exacto (90 min)" pts={scoring.exact_score_points} sub="Igual que en grupos" />
            <PtsRow label="Bonus eliminatoria" pts={scoring.knockout_exact_score_bonus}
              sub={`Bonus adicional por exacto en eliminatorias → total ${maxElim} pts`} />
            <PtsRow label="Ganador correcto (90 min)" pts={scoring.correct_winner_points} sub="Sin bonus" />
            <PtsRow label="Resultado exacto tiempo extra" pts={scoring.correct_et_result_points}
              sub="Acertaste los goles adicionales en el tiempo extra" />
            <PtsRow label="Ganador en penales" pts={scoring.correct_pk_winner_points}
              sub="Acertaste qué equipo ganó la tanda de penales" />
          </div>
          <div className="bg-accent/5 border border-accent/20 rounded-xl p-3 flex items-center justify-between">
            <div>
              <p className="text-xs text-text-secondary">Máximo por partido con penales</p>
              <p className="text-[11px] text-text-muted mt-0.5">
                {scoring.exact_score_points} exacto + {scoring.knockout_exact_score_bonus} bonus
                + {scoring.correct_et_result_points} ET + {scoring.correct_pk_winner_points} penales
              </p>
            </div>
            <span className="text-lg font-bold text-accent">{maxConPenales} pts</span>
          </div>
        </section>
      )}

      {/* Tabla resumen */}
      <section className="space-y-3">
        <SectionHeader>Resumen de puntos</SectionHeader>
        <div className="card overflow-hidden">
          {isLeague ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-4 py-3 text-xs text-text-muted font-medium">Situación</th>
                  <th className="text-right px-4 py-3 text-xs text-text-muted font-medium">Puntos</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { label: 'Marcador exacto',  pts: scoring.exact_score_points },
                  { label: 'Ganador correcto', pts: scoring.correct_winner_points },
                  { label: 'Empate correcto',  pts: scoring.correct_draw_points },
                ].map(({ label, pts }) => (
                  <tr key={label} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 text-text-secondary">{label}</td>
                    <td className="px-4 py-3 text-right font-bold tabular-nums">
                      <span className="text-primary">+{pts}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-4 py-3 text-xs text-text-muted font-medium">Situación</th>
                  <th className="text-right px-4 py-3 text-xs text-text-muted font-medium">Grupos</th>
                  <th className="text-right px-4 py-3 text-xs text-text-muted font-medium">Eliminat.</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { label: 'Marcador exacto',
                    grupos: scoring.exact_score_points,
                    elim: scoring.exact_score_points + scoring.knockout_exact_score_bonus },
                  { label: 'Ganador correcto',
                    grupos: scoring.correct_winner_points,
                    elim: scoring.correct_winner_points },
                  { label: 'Empate correcto',
                    grupos: scoring.correct_draw_points,
                    elim: scoring.correct_draw_points },
                  { label: 'Resultado ET exacto', grupos: null, elim: scoring.correct_et_result_points },
                  { label: 'Ganador en penales',  grupos: null, elim: scoring.correct_pk_winner_points },
                ].map(({ label, grupos, elim }) => (
                  <tr key={label} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 text-text-secondary">{label}</td>
                    <td className="px-4 py-3 text-right font-bold tabular-nums">
                      {grupos !== null
                        ? <span className="text-primary">+{grupos}</span>
                        : <span className="text-text-muted">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right font-bold tabular-nums">
                      <span className="text-accent">+{elim}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {/* Calculadora */}
      <ScoreCalculator scoring={scoring} isLeague={isLeague} />

      {/* Consejos */}
      <section className="space-y-3">
        <SectionHeader>Consejos</SectionHeader>
        <div className="card p-4 space-y-3">
          {[
            { emoji: '⏰', tip: 'Predecí antes que empiece el partido',
              desc: 'Las predicciones se bloquean automáticamente al inicio de cada partido.' },
            { emoji: '🎯', tip: 'Vale la pena arriesgar el marcador exacto',
              desc: `Acertar el marcador exacto da ${scoring.exact_score_points} pts contra ${scoring.correct_winner_points} pts por solo acertar el ganador.` },
            ...(!isLeague ? [{ emoji: '⚡', tip: 'Las eliminatorias valen más',
              desc: `El bonus de ${scoring.knockout_exact_score_bonus} pts por exacto en eliminatorias puede cambiar el ranking de un día para el otro.` }] : []),
            { emoji: '📊', tip: 'No abandones si vas abajo en el ranking',
              desc: 'Los últimos partidos del torneo tienen alto puntaje y pueden voltear el ranking.' },
          ].map(({ emoji, tip, desc }) => (
            <div key={tip} className="flex gap-3">
              <span className="text-lg flex-shrink-0">{emoji}</span>
              <div>
                <p className="text-sm font-medium text-text-primary">{tip}</p>
                <p className="text-[12px] text-text-muted mt-0.5 leading-relaxed">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xs font-semibold text-text-muted uppercase tracking-widest flex items-center gap-2">
      <span className="w-5 h-px bg-border inline-block" />
      {children}
      <span className="flex-1 h-px bg-border inline-block" />
    </h2>
  )
}

function PtsRow({ label, pts, sub }: { label: string; pts: number; sub?: string }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2.5 border-b border-border last:border-0">
      <div className="min-w-0">
        <p className="text-sm text-text-primary">{label}</p>
        {sub && <p className="text-[11px] text-text-muted mt-0.5">{sub}</p>}
      </div>
      <span className="flex-shrink-0 text-base font-bold text-primary tabular-nums">+{pts} pts</span>
    </div>
  )
}

function ScoreCalculator({ scoring, isLeague }: { scoring: TenCompScoring; isLeague: boolean }) {
  const [isGroup, setIsGroup] = useState(true)
  const [predHome, setPredHome] = useState(2)
  const [predAway, setPredAway] = useState(1)
  const [realHome, setRealHome] = useState(2)
  const [realAway, setRealAway] = useState(1)
  const [predEtHome, setPredEtHome] = useState(0)
  const [predEtAway, setPredEtAway] = useState(0)
  const [realEtHome, setRealEtHome] = useState(0)
  const [realEtAway, setRealEtAway] = useState(0)
  const [predPkWinner, setPredPkWinner] = useState<'home' | 'away'>('home')
  const [realPkWinner, setRealPkWinner] = useState<'home' | 'away'>('home')

  // En ligas siempre se comporta como "fase de grupos" (solo 90 min)
  const groupMode = isLeague || isGroup

  const exactScore = predHome === realHome && predAway === realAway
  const predDraw = predHome === predAway
  const realDraw = realHome === realAway
  const correctWinner = !predDraw && !realDraw &&
    ((predHome > predAway && realHome > realAway) || (predHome < predAway && realHome < realAway))
  const correctDraw = predDraw && realDraw
  const needsEt = !groupMode && realDraw

  let points = 0
  const breakdown: { label: string; pts: number }[] = []

  if (exactScore) {
    const pts = scoring.exact_score_points + (!groupMode ? scoring.knockout_exact_score_bonus : 0)
    points += pts
    breakdown.push({ label: `Resultado exacto${!groupMode ? ' + bonus eliminatoria' : ''}`, pts })
  } else if (correctWinner) {
    points += scoring.correct_winner_points
    breakdown.push({ label: 'Ganador correcto', pts: scoring.correct_winner_points })
  } else if (correctDraw) {
    points += scoring.correct_draw_points
    breakdown.push({ label: 'Empate correcto', pts: scoring.correct_draw_points })
  }

  if (needsEt) {
    if (predEtHome === realEtHome && predEtAway === realEtAway) {
      points += scoring.correct_et_result_points
      breakdown.push({ label: 'Resultado exacto tiempo extra', pts: scoring.correct_et_result_points })
    }
    if (realEtHome === realEtAway && predPkWinner === realPkWinner) {
      points += scoring.correct_pk_winner_points
      breakdown.push({ label: 'Ganador en penales correcto', pts: scoring.correct_pk_winner_points })
    }
  }

  return (
    <section className="space-y-3">
      <SectionHeader>Calculadora de puntos</SectionHeader>
      <div className="card p-4 space-y-4">
        <p className="text-sm text-text-secondary leading-relaxed">
          Probá diferentes resultados para entender cómo se calculan los puntos.
        </p>

        {/* Toggle fase grupos/eliminatoria: solo en torneos con eliminación */}
        {!isLeague && (
          <div className="flex items-center gap-3 bg-surface rounded-lg p-3">
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" checked={isGroup} onChange={() => setIsGroup(g => !g)} className="sr-only peer" />
              <div className="w-11 h-6 bg-border rounded-full peer peer-checked:bg-primary after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-text-muted after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full peer-checked:after:bg-white" />
            </label>
            <div>
              <p className="text-sm font-medium text-text-primary">{isGroup ? 'Fase de grupos' : 'Fase eliminatoria'}</p>
              <p className="text-[11px] text-text-muted">{isGroup ? 'Solo 90 minutos' : '90 min + alargue + penales (si hay empate)'}</p>
            </div>
          </div>
        )}

        <NumBlock label="Resultado real" homeVal={realHome} awayVal={realAway}
          onHome={v => setRealHome(Math.max(0, v))} onAway={v => setRealAway(Math.max(0, v))}
          color="text-text-primary" />

        {needsEt && (
          <NumBlock label="Tiempo extra (real)" homeVal={realEtHome} awayVal={realEtAway}
            onHome={v => setRealEtHome(Math.max(0, v))} onAway={v => setRealEtAway(Math.max(0, v))}
            color="text-text-primary" />
        )}
        {needsEt && realEtHome === realEtAway && (
          <PkToggle label="Ganador penales (real)" value={realPkWinner} onChange={setRealPkWinner} />
        )}

        <NumBlock label="Tu predicción" homeVal={predHome} awayVal={predAway}
          onHome={v => setPredHome(Math.max(0, v))} onAway={v => setPredAway(Math.max(0, v))}
          color="text-accent" />

        {needsEt && (
          <NumBlock label="Tiempo extra (predicción)" homeVal={predEtHome} awayVal={predEtAway}
            onHome={v => setPredEtHome(Math.max(0, v))} onAway={v => setPredEtAway(Math.max(0, v))}
            color="text-accent" />
        )}
        {needsEt && realEtHome === realEtAway && (
          <PkToggle label="Ganador penales (predicción)" value={predPkWinner} onChange={setPredPkWinner} accent />
        )}

        <div className="bg-surface rounded-lg p-4 space-y-2">
          <p className="text-[10px] text-text-muted uppercase tracking-wider">Puntos obtenidos</p>
          {breakdown.length > 0 ? (
            <div className="space-y-1.5">
              {breakdown.map(b => (
                <div key={b.label} className="flex items-center justify-between text-sm">
                  <span className="text-text-secondary">{b.label}</span>
                  <span className="font-bold text-primary">+{b.pts} pts</span>
                </div>
              ))}
              <div className="border-t border-border pt-2 mt-2 flex items-center justify-between">
                <span className="text-sm font-semibold text-text-primary">Total</span>
                <span className="text-xl font-bold text-primary">{points} pts</span>
              </div>
            </div>
          ) : (
            <p className="text-sm text-text-muted text-center py-2">No acertaste ni el ganador ni el marcador. 0 pts.</p>
          )}
        </div>
      </div>
    </section>
  )
}

function NumBlock({ label, homeVal, awayVal, onHome, onAway, color }: {
  label: string; homeVal: number; awayVal: number
  onHome: (v: number) => void; onAway: (v: number) => void; color: string
}) {
  return (
    <div className="bg-background rounded-lg p-3 space-y-2">
      <p className={`text-[10px] uppercase tracking-wider ${color}`}>{label}</p>
      <div className="flex items-center gap-3">
        <input type="number" min={0} value={homeVal} onChange={e => onHome(Number(e.target.value))}
          className="flex-1 bg-surface border border-border rounded px-3 py-2 text-center text-sm text-text-primary focus:outline-none focus:border-primary" />
        <span className="text-lg font-bold text-text-muted">–</span>
        <input type="number" min={0} value={awayVal} onChange={e => onAway(Number(e.target.value))}
          className="flex-1 bg-surface border border-border rounded px-3 py-2 text-center text-sm text-text-primary focus:outline-none focus:border-primary" />
      </div>
    </div>
  )
}

function PkToggle({ label, value, onChange, accent = false }: {
  label: string; value: 'home' | 'away'; onChange: (v: 'home' | 'away') => void; accent?: boolean
}) {
  const active = accent ? 'bg-accent text-white border-accent' : 'bg-primary text-white border-primary'
  const inactive = 'bg-surface border border-border text-text-secondary hover:border-primary'
  return (
    <div className="space-y-1">
      <p className="text-[11px] text-text-muted">{label}</p>
      <div className="flex gap-2">
        {(['home', 'away'] as const).map(side => (
          <button key={side} onClick={() => onChange(side)}
            className={`flex-1 py-2 rounded text-xs font-medium transition-colors border ${value === side ? active : inactive}`}>
            {side === 'home' ? 'Local' : 'Visitante'}
          </button>
        ))}
      </div>
    </div>
  )
}
