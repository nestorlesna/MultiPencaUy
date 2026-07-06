import { useQuery } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { Loader2, TrendingUp, Trophy } from 'lucide-react'
import {
  fetchUserPointsProgress,
  fetchUserRankProgress,
} from '../../services/v2/leaderboardService'

// ── Gráfica de línea SVG, sin dependencias ───────────────────────────────────

interface ChartPoint {
  label: string       // etiqueta del eje X
  value: number
  highlight?: boolean // marca especial (ej. partido donde entró un bonus)
}

const W = 320
const H = 170
const M = { top: 12, right: 10, bottom: 22, left: 30 }
const PLOT_W = W - M.left - M.right
const PLOT_H = H - M.top - M.bottom

function LineChart({
  points,
  invertY = false,
  color = '#10B981',
  valueFormatter = (v: number) => String(v),
}: {
  points: ChartPoint[]
  invertY?: boolean
  color?: string
  valueFormatter?: (v: number) => string
}) {
  if (points.length === 0) return null

  const values = points.map(p => p.value)
  const rawMin = Math.min(...values)
  const rawMax = Math.max(...values)
  const min = rawMin === rawMax ? rawMin - 1 : rawMin
  const max = rawMin === rawMax ? rawMax + 1 : rawMax

  const x = (i: number) =>
    points.length === 1 ? M.left + PLOT_W / 2 : M.left + (i / (points.length - 1)) * PLOT_W
  const y = (v: number) => {
    const frac = invertY ? (v - min) / (max - min) : (max - v) / (max - min)
    return M.top + frac * PLOT_H
  }

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`).join(' ')
  const areaPath =
    `${linePath} L ${x(points.length - 1).toFixed(1)} ${(M.top + PLOT_H).toFixed(1)} ` +
    `L ${x(0).toFixed(1)} ${(M.top + PLOT_H).toFixed(1)} Z`

  // Etiquetas del eje X: primera, última y un par intermedias (máx ~5).
  const maxLabels = 5
  const step = Math.max(1, Math.ceil(points.length / maxLabels))
  const xLabelIdx = points.map((_, i) => i).filter(i => i % step === 0 || i === points.length - 1)

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" preserveAspectRatio="xMidYMid meet" role="img">
      {/* Marco / línea base */}
      <line x1={M.left} y1={M.top} x2={M.left} y2={M.top + PLOT_H} className="stroke-border" strokeWidth={1} />
      <line x1={M.left} y1={M.top + PLOT_H} x2={M.left + PLOT_W} y2={M.top + PLOT_H} className="stroke-border" strokeWidth={1} />

      {/* Etiquetas Y: extremos (mejor arriba) */}
      <text x={M.left - 4} y={y(invertY ? min : max) + 3} textAnchor="end" className="fill-text-muted" fontSize={9}>
        {valueFormatter(invertY ? min : max)}
      </text>
      <text x={M.left - 4} y={y(invertY ? max : min) + 3} textAnchor="end" className="fill-text-muted" fontSize={9}>
        {valueFormatter(invertY ? max : min)}
      </text>

      {/* Área + línea */}
      <path d={areaPath} fill={color} opacity={0.12} />
      <path d={linePath} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

      {/* Puntos */}
      {points.map((p, i) => (
        <circle
          key={i}
          cx={x(i)}
          cy={y(p.value)}
          r={p.highlight ? 3.5 : 2.2}
          fill={p.highlight ? '#F59E0B' : color}
          stroke="#141925"
          strokeWidth={p.highlight ? 1 : 0}
        >
          <title>{`${p.label}: ${valueFormatter(p.value)}`}</title>
        </circle>
      ))}

      {/* Etiquetas X */}
      {xLabelIdx.map(i => (
        <text key={i} x={x(i)} y={H - 6} textAnchor="middle" className="fill-text-muted" fontSize={8}>
          {points[i].label}
        </text>
      ))}
    </svg>
  )
}

// ── Tab de evolución ─────────────────────────────────────────────────────────

export function UserEvolutionTab({ tenCompId, userId }: { tenCompId: string; userId: string }) {
  const { data: pointsProg = [], isLoading: loadingPts } = useQuery({
    queryKey: ['v2', 'user-points-progress', tenCompId, userId],
    queryFn: () => fetchUserPointsProgress(tenCompId, userId),
    staleTime: 1000 * 60 * 2,
  })
  const { data: rankProg = [], isLoading: loadingRank } = useQuery({
    queryKey: ['v2', 'user-rank-progress', tenCompId, userId],
    queryFn: () => fetchUserRankProgress(tenCompId, userId),
    staleTime: 1000 * 60 * 2,
  })

  if (loadingPts || loadingRank) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="animate-spin text-primary" size={24} />
      </div>
    )
  }

  const hasData = pointsProg.length > 0 || rankProg.length > 0
  if (!hasData) {
    return (
      <p className="text-xs text-text-muted card p-4 text-center">
        Todavía no hay evolución para mostrar. Aparece cuando se cargan resultados.
      </p>
    )
  }

  const pointsSeries: ChartPoint[] = pointsProg.map(p => ({
    label: `#${p.match_number}`,
    value: p.cumulative_points,
    highlight: p.bonus_added > 0,
  }))

  const rankSeries: ChartPoint[] = rankProg.map(r => ({
    label: format(parseISO(r.day), 'dd/MM'),
    value: r.rank,
  }))

  return (
    <div className="space-y-6">
      {/* Puesto en el ranking por día */}
      <section>
        <div className="flex items-center gap-1.5 mb-2">
          <Trophy size={14} className="text-accent" />
          <h3 className="text-xs font-semibold text-text-primary uppercase tracking-wide">Puesto por día</h3>
        </div>
        {rankSeries.length === 0 ? (
          <p className="text-xs text-text-muted card p-3">Sin datos de ranking por día.</p>
        ) : (
          <div className="card p-2">
            <LineChart points={rankSeries} invertY color="#F59E0B" valueFormatter={v => `#${v}`} />
          </div>
        )}
      </section>

      {/* Puntos acumulados partido a partido */}
      <section>
        <div className="flex items-center gap-1.5 mb-2">
          <TrendingUp size={14} className="text-primary" />
          <h3 className="text-xs font-semibold text-text-primary uppercase tracking-wide">Puntos partido a partido</h3>
        </div>
        {pointsSeries.length === 0 ? (
          <p className="text-xs text-text-muted card p-3">Sin datos de puntos por partido.</p>
        ) : (
          <>
            <div className="card p-2">
              <LineChart points={pointsSeries} color="#10B981" />
            </div>
            <p className="flex items-center gap-1.5 text-[10px] text-text-muted mt-1.5">
              <span className="inline-block w-2 h-2 rounded-full bg-accent" />
              Partido donde se sumó un bonus (+Puntos)
            </p>
          </>
        )}
      </section>
    </div>
  )
}
