import { Link } from 'react-router-dom'
import { Trophy, Target, Star } from 'lucide-react'
import { useTenComp } from '../../contexts/TenCompContext'

// Índice de /p/:slug — resumen de la penca activa.
export function PencaDashboardPage() {
  const { tenComp, competition, scoring } = useTenComp()
  const base = `/p/${tenComp.slug}`

  return (
    <div className="space-y-5">
      <div className="card p-4">
        <p className="text-xs text-text-muted mb-1">Competencia</p>
        <p className="text-sm font-medium text-text-primary">{competition.name}</p>
        <div className="flex flex-wrap gap-2 mt-3">
          <Link to={`${base}/fixture`} className="btn-ghost text-xs px-3 py-1.5 inline-flex items-center gap-1.5">
            <Target size={14} /> Fixture
          </Link>
          <Link to={`${base}/ranking`} className="btn-ghost text-xs px-3 py-1.5 inline-flex items-center gap-1.5">
            <Trophy size={14} /> Ranking
          </Link>
          {tenComp.menu_config?.mas_puntos !== false && tenComp.bonus_enabled && (
            <Link to={`${base}/mas-puntos`} className="btn-ghost text-xs px-3 py-1.5 inline-flex items-center gap-1.5">
              <Star size={14} /> + Puntos
            </Link>
          )}
        </div>
      </div>

      {scoring && (
        <div className="card p-4">
          <p className="text-xs text-text-muted mb-2">Puntajes de esta penca</p>
          <ul className="text-sm text-text-secondary space-y-1">
            <li>Resultado exacto: <span className="text-text-primary font-medium">{scoring.exact_score_points}</span></li>
            <li>Ganador acertado: <span className="text-text-primary font-medium">{scoring.correct_winner_points}</span></li>
            <li>Empate acertado: <span className="text-text-primary font-medium">{scoring.correct_draw_points}</span></li>
            <li>Bonus exacto en eliminatorias: <span className="text-text-primary font-medium">{scoring.knockout_exact_score_bonus}</span></li>
          </ul>
        </div>
      )}
    </div>
  )
}
