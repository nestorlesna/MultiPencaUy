import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { ChevronDown, ChevronUp, AlertTriangle, RotateCcw, ArrowLeft } from 'lucide-react'
import { RequireAdmin } from '../../components/auth/AuthGuard'
import { fetchGroupStandingsV2 } from '../../services/v2/groupStandingsService'
import {
  saveGroupPositionOverrides,
  deleteGroupPositionOverrides,
} from '../../services/groupService'
import type { GroupStanding } from '../../types'

// ── Helpers ───────────────────────────────────────────────────────────────────

function groupBy<T>(arr: T[], key: (item: T) => string): Record<string, T[]> {
  return arr.reduce((acc, item) => {
    const k = key(item)
    ;(acc[k] = acc[k] ?? []).push(item)
    return acc
  }, {} as Record<string, T[]>)
}

// ── GroupCard ─────────────────────────────────────────────────────────────────

function GroupCard({ name, rows }: { name: string; rows: GroupStanding[] }) {
  const qc = useQueryClient()
  const [editing, setEditing] = useState(false)
  // orden de teams en modo edición (índice = posición-1)
  const [order, setOrder] = useState<GroupStanding[]>([])

  const hasOverride = rows.some(r => r.has_override)

  function startEdit() {
    setOrder([...rows].sort((a, b) => a.position - b.position))
    setEditing(true)
  }

  function moveUp(idx: number) {
    if (idx === 0) return
    setOrder(prev => {
      const next = [...prev]
      ;[next[idx - 1], next[idx]] = [next[idx], next[idx - 1]]
      return next
    })
  }

  function moveDown(idx: number) {
    if (idx === order.length - 1) return
    setOrder(prev => {
      const next = [...prev]
      ;[next[idx], next[idx + 1]] = [next[idx + 1], next[idx]]
      return next
    })
  }

  const { mutate: save, isPending: saving } = useMutation({
    mutationFn: () =>
      saveGroupPositionOverrides(
        order.map((t, i) => ({ team_id: t.team_id, position: i + 1 }))
      ),
    onSuccess: () => {
      toast.success(`Posiciones del Grupo ${name} guardadas`)
      qc.invalidateQueries({ queryKey: ['group_standings'] })
      setEditing(false)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const { mutate: reset, isPending: resetting } = useMutation({
    mutationFn: () => deleteGroupPositionOverrides(rows.map(r => r.team_id)),
    onSuccess: () => {
      toast.success(`Posiciones del Grupo ${name} restablecidas`)
      qc.invalidateQueries({ queryKey: ['group_standings'] })
      setEditing(false)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const display = editing
    ? order
    : [...rows].sort((a, b) => a.position - b.position)

  return (
    <div className="card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-text-primary">Grupo {name}</span>
          {hasOverride && (
            <span className="badge bg-accent/20 text-accent text-[10px]">Manual</span>
          )}
        </div>
        {!editing ? (
          <button className="btn-secondary text-xs px-2 py-1" onClick={startEdit}>
            Ajustar
          </button>
        ) : (
          <div className="flex gap-1.5">
            <button
              className="btn-primary text-xs px-2 py-1"
              onClick={() => save()}
              disabled={saving}
            >
              {saving ? '...' : 'Guardar'}
            </button>
            {hasOverride && (
              <button
                className="btn-ghost text-xs px-2 py-1 border border-border flex items-center gap-1"
                onClick={() => reset()}
                disabled={resetting}
                title="Volver al orden automático"
              >
                <RotateCcw size={11} />
                Auto
              </button>
            )}
            <button
              className="btn-ghost text-xs px-2 py-1 border border-border"
              onClick={() => setEditing(false)}
            >
              Cancelar
            </button>
          </div>
        )}
      </div>

      {/* Tabla */}
      <div className="divide-y divide-border">
        {display.map((row, idx) => (
          <div key={row.team_id} className="flex items-center gap-2 px-3 py-2">
            {/* Posición */}
            <span className="w-5 text-center text-xs font-bold text-text-muted flex-shrink-0">
              {idx + 1}
            </span>

            {/* Bandera + nombre */}
            <div className="flex items-center gap-1.5 flex-1 min-w-0">
              {row.team_flag_url ? (
                <img
                  src={row.team_flag_url}
                  alt={row.team_abbreviation}
                  className="w-5 h-4 rounded-sm object-cover flex-shrink-0"
                />
              ) : (
                <div className="w-5 h-4 rounded-sm bg-border flex-shrink-0 flex items-center justify-center">
                  <span className="text-[8px] text-text-muted font-bold">{row.team_abbreviation}</span>
                </div>
              )}
              <span className="text-xs text-text-primary truncate">
                {row.is_confirmed ? row.team_name : (row.placeholder_name ?? row.team_name)}
              </span>
              {row.has_override && !editing && (
                <span className="text-[9px] text-accent font-medium flex-shrink-0">●</span>
              )}
            </div>

            {/* Stats compactas */}
            <div className="hidden sm:flex gap-3 text-[11px] tabular-nums text-text-muted flex-shrink-0">
              <span>{row.pj}PJ</span>
              <span className="text-text-primary font-semibold">{row.pts}pts</span>
              <span>{row.gd > 0 ? '+' : ''}{row.gd}DG</span>
            </div>

            {/* Controles de reordenamiento */}
            {editing && (
              <div className="flex flex-col gap-0.5 flex-shrink-0 ml-1">
                <button
                  onClick={() => moveUp(idx)}
                  disabled={idx === 0}
                  className="p-0.5 rounded hover:bg-border/60 disabled:opacity-20 transition-colors"
                >
                  <ChevronUp size={13} className="text-text-muted" />
                </button>
                <button
                  onClick={() => moveDown(idx)}
                  disabled={idx === display.length - 1}
                  className="p-0.5 rounded hover:bg-border/60 disabled:opacity-20 transition-colors"
                >
                  <ChevronDown size={13} className="text-text-muted" />
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function PosicionesGruposPage() {
  const { id: competitionId = '' } = useParams()
  const { data: standings = [], isLoading } = useQuery({
    queryKey: ['group_standings', competitionId],
    queryFn: () => fetchGroupStandingsV2(competitionId),
    enabled: !!competitionId,
  })

  const groups = useMemo(
    () => groupBy(standings, r => r.group_name),
    [standings]
  )

  const groupsWithOverride = useMemo(
    () => Object.values(groups).filter(rows => rows.some(r => r.has_override)).length,
    [groups]
  )

  return (
    <RequireAdmin>
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
        <Link to={`/admin/competencias/${competitionId}`} className="inline-flex items-center gap-1.5 text-xs text-text-muted hover:text-text-primary transition-colors">
          <ArrowLeft size={14} /> Competencia
        </Link>
        <div>
          <h1 className="text-xl font-bold text-text-primary">Posiciones de grupos</h1>
          <p className="text-xs text-text-muted mt-1">
            Ajustá manualmente el orden cuando equipos empaten en todos los criterios FIFA
            (puntos, diferencia de goles, goles a favor). Los cambios se usan al poblar el bracket.
          </p>
        </div>

        {groupsWithOverride > 0 && (
          <div className="flex items-start gap-2 text-xs bg-accent/10 border border-accent/30 rounded-xl px-4 py-3">
            <AlertTriangle size={13} className="text-accent flex-shrink-0 mt-0.5" />
            <span className="text-text-secondary">
              {groupsWithOverride} grupo{groupsWithOverride > 1 ? 's tienen' : ' tiene'} posiciones ajustadas manualmente
              (indicadas con <span className="text-accent font-bold">Manual</span>).
            </span>
          </div>
        )}

        {isLoading && <p className="text-text-muted text-sm">Cargando...</p>}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {Object.entries(groups)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([name, rows]) => (
              <GroupCard key={name} name={name} rows={rows} />
            ))}
        </div>
      </div>
    </RequireAdmin>
  )
}
