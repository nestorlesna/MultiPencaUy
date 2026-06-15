import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { Loader2, Search, Edit2, Check, X, RefreshCw, Info, ArrowLeft } from 'lucide-react'
import { toast } from 'sonner'
import { RequireAdmin } from '../../components/auth/AuthGuard'
import { supabase } from '../../lib/supabase'
import { populateKnockoutV2 } from '../../services/v2/adminService'
import {
  fetchCombinaciones,
  fetchCombinacionByKey,
  updateCombinacion,
  RIVAL_COLS,
  type Combinacion,
} from '../../services/combinacionesService'

// ── Calcular clave activa desde los mejores terceros de la competencia ───────
async function fetchActiveKey(competitionId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('best_third_ranking')
    .select('group_name')
    .eq('competition_id', competitionId)
    .order('rank')
    .limit(8)
  if (error) throw error
  const rows = (data ?? []) as { group_name: string }[]
  if (rows.length < 8) return null
  return rows.map(r => r.group_name).sort().join('')
}

// ── Componente de edición inline ──────────────────────────────────────────────
function EditRow({
  row,
  onSave,
  onCancel,
}: {
  row: Combinacion
  onSave: (updates: Partial<Combinacion>) => void
  onCancel: () => void
}) {
  const [vals, setVals] = useState<Record<string, string>>({
    rival_1a: row.rival_1a,
    rival_1b: row.rival_1b,
    rival_1d: row.rival_1d,
    rival_1e: row.rival_1e,
    rival_1g: row.rival_1g,
    rival_1i: row.rival_1i,
    rival_1k: row.rival_1k,
    rival_1l: row.rival_1l,
  })

  return (
    <tr className="bg-primary/5 border-b border-border">
      <td className="px-3 py-2">
        <span className="font-mono text-xs text-accent font-bold">{row.combinacion}</span>
      </td>
      {RIVAL_COLS.map(({ col }) => (
        <td key={col} className="px-2 py-1">
          <input
            value={vals[col]}
            onChange={e => setVals(v => ({ ...v, [col]: e.target.value.toUpperCase() }))}
            className="w-14 bg-surface border border-primary rounded px-1.5 py-0.5 text-xs font-mono text-center text-text-primary focus:outline-none focus:border-primary"
            maxLength={3}
          />
        </td>
      ))}
      <td className="px-2 py-1">
        <div className="flex gap-1">
          <button
            onClick={() => onSave(vals)}
            className="p-1 rounded text-primary hover:bg-primary/10"
            title="Guardar"
          >
            <Check size={14} />
          </button>
          <button
            onClick={onCancel}
            className="p-1 rounded text-text-muted hover:bg-surface-2"
            title="Cancelar"
          >
            <X size={14} />
          </button>
        </div>
      </td>
    </tr>
  )
}

// ── Fila normal ───────────────────────────────────────────────────────────────
function DataRow({
  row,
  isActive,
  onEdit,
}: {
  row: Combinacion
  isActive: boolean
  onEdit: () => void
}) {
  return (
    <tr className={`border-b border-border hover:bg-surface-2 transition-colors ${isActive ? 'bg-primary/5' : ''}`}>
      <td className="px-3 py-2">
        <div className="flex items-center gap-2">
          {isActive && (
            <span className="badge bg-primary/20 text-primary text-[9px] font-semibold">Activa</span>
          )}
          <span className={`font-mono text-xs font-bold ${isActive ? 'text-primary' : 'text-text-secondary'}`}>
            {row.combinacion}
          </span>
        </div>
      </td>
      {RIVAL_COLS.map(({ col }) => (
        <td key={col} className="px-2 py-2 text-center">
          <span className="font-mono text-xs text-text-primary">{(row as Record<string, unknown>)[col] as string}</span>
        </td>
      ))}
      <td className="px-2 py-2">
        <button
          onClick={onEdit}
          className="p-1 rounded text-text-muted hover:text-text-primary hover:bg-surface-2"
          title="Editar"
        >
          <Edit2 size={13} />
        </button>
      </td>
    </tr>
  )
}

// ── Página ────────────────────────────────────────────────────────────────────
export function CombinacionesPage() {
  const { id: competitionId = '' } = useParams()
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [editingKey, setEditingKey] = useState<string | null>(null)

  const { data: activeKey, isLoading: loadingKey } = useQuery({
    queryKey: ['active_comb_key', competitionId],
    queryFn: () => fetchActiveKey(competitionId),
    enabled: !!competitionId,
    staleTime: 1000 * 60,
  })

  const { data: activeComb } = useQuery({
    queryKey: ['combinacion_active', competitionId, activeKey],
    queryFn: () => (activeKey ? fetchCombinacionByKey(competitionId, activeKey) : null),
    enabled: !!competitionId && !!activeKey,
    staleTime: 1000 * 60,
  })

  const { data: rows = [], isLoading: loadingRows } = useQuery({
    queryKey: ['combinaciones', competitionId, search],
    queryFn: () => fetchCombinaciones(competitionId, search),
    enabled: !!competitionId,
    staleTime: 1000 * 30,
  })

  const mutateSave = useMutation({
    mutationFn: ({ combinacion, updates }: { combinacion: string; updates: Partial<Combinacion> }) =>
      updateCombinacion(competitionId, combinacion, updates),
    onSuccess: () => {
      toast.success('Combinación actualizada')
      setEditingKey(null)
      qc.invalidateQueries({ queryKey: ['combinaciones'] })
      qc.invalidateQueries({ queryKey: ['combinacion_active'] })
    },
    onError: () => toast.error('Error al guardar'),
  })

  const mutateRecalc = useMutation({
    mutationFn: () => populateKnockoutV2(competitionId),
    onSuccess: (n) => {
      toast.success(`16avos recalculados (${n} slots actualizados)`)
      qc.invalidateQueries({ queryKey: ['bracket'] })
    },
    onError: () => toast.error('Error al recalcular'),
  })

  return (
    <RequireAdmin>
      <div className="px-4 py-6 space-y-6 max-w-5xl mx-auto">
        <Link to={`/admin/competencias/${competitionId}`} className="inline-flex items-center gap-1.5 text-xs text-text-muted hover:text-text-primary transition-colors">
          <ArrowLeft size={14} /> Competencia
        </Link>
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-text-primary">Combinaciones de terceros</h1>
            <p className="text-xs text-text-muted mt-1">
              495 combinaciones FIFA — determinan qué tercer clasificado enfrenta a cada primero en 16avos
            </p>
          </div>
          <button
            onClick={() => mutateRecalc.mutate()}
            disabled={mutateRecalc.isPending}
            className="btn-primary flex items-center gap-2 text-sm py-2 px-3 whitespace-nowrap"
          >
            {mutateRecalc.isPending
              ? <Loader2 size={14} className="animate-spin" />
              : <RefreshCw size={14} />}
            Recalcular 16avos
          </button>
        </div>

        {/* Combinación activa */}
        <div className="card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Info size={14} className="text-primary" />
            <h2 className="text-sm font-semibold text-text-primary">Combinación activa</h2>
          </div>

          {loadingKey ? (
            <Loader2 size={16} className="animate-spin text-text-muted" />
          ) : !activeKey ? (
            <p className="text-xs text-text-muted">
              Pendiente — se define cuando los 12 grupos estén completos (8 mejores terceros conocidos)
            </p>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <span className="text-xs text-text-muted">Clave:</span>
                <span className="font-mono text-base font-bold text-primary tracking-widest">{activeKey}</span>
              </div>

              {activeComb ? (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {RIVAL_COLS.map(({ col, label }) => (
                    <div key={col} className="bg-surface-2 rounded-lg px-3 py-2 flex justify-between items-center">
                      <span className="text-xs text-text-muted font-mono">{label} vs</span>
                      <span className="font-mono text-sm font-bold text-accent">
                        {(activeComb as Record<string, unknown>)[col] as string}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-text-muted">Clave {activeKey} no encontrada en la tabla</p>
              )}
            </div>
          )}
        </div>

        {/* Buscador y tabla */}
        <div className="card overflow-hidden">
          <div className="p-4 border-b border-border">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
              <input
                type="text"
                placeholder="Buscar por letras de grupos (ej: ABCDEF)"
                value={search}
                onChange={e => setSearch(e.target.value.toUpperCase())}
                className="w-full bg-surface border border-border rounded-lg pl-9 pr-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary"
                maxLength={12}
              />
            </div>
            <p className="text-[10px] text-text-muted mt-1.5">
              {loadingRows ? 'Cargando...' : `${rows.length} resultado${rows.length !== 1 ? 's' : ''} (máx. 50)`}
            </p>
          </div>

          {loadingRows ? (
            <div className="flex justify-center py-10">
              <Loader2 className="animate-spin text-primary" size={24} />
            </div>
          ) : rows.length === 0 ? (
            <div className="py-10 text-center text-sm text-text-muted">
              No se encontraron combinaciones
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-surface-2">
                    <th className="px-3 py-2 text-left text-[10px] text-text-muted uppercase tracking-wider">
                      Clave
                    </th>
                    {RIVAL_COLS.map(({ label }) => (
                      <th key={label} className="px-2 py-2 text-center text-[10px] text-text-muted uppercase tracking-wider">
                        {label}
                      </th>
                    ))}
                    <th className="px-2 py-2 w-10" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map(row =>
                    editingKey === row.combinacion ? (
                      <EditRow
                        key={row.combinacion}
                        row={row}
                        onSave={updates => mutateSave.mutate({ combinacion: row.combinacion, updates })}
                        onCancel={() => setEditingKey(null)}
                      />
                    ) : (
                      <DataRow
                        key={row.combinacion}
                        row={row}
                        isActive={row.combinacion === activeKey}
                        onEdit={() => setEditingKey(row.combinacion)}
                      />
                    )
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Nota informativa */}
        <p className="text-[11px] text-text-muted">
          Estos datos son fijos según la normativa FIFA. Solo editar si hay una corrección oficial.
          Después de editar, usar "Recalcular 16avos" para actualizar los partidos.
        </p>
      </div>
    </RequireAdmin>
  )
}
