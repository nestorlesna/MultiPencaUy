import { useState, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Loader2, ChevronLeft, ChevronRight, Filter, X } from 'lucide-react'
import { RequireAdmin } from '../../components/auth/AuthGuard'
import { fetchAuditLog, fetchAuditUsers } from '../../services/auditService'
import type { AuditEntry, AuditFilters } from '../../services/auditService'
import { UserAvatar } from '../../components/ui/UserAvatar'

const PAGE_SIZE = 50

// ── Formatea fecha UTC del servidor ──────────────────────────────────────────
function formatUTC(iso: string): string {
  return new Date(iso).toLocaleString('es-UY', {
    timeZone: 'UTC',
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }) + ' UTC'
}

// ── Badge de acción ──────────────────────────────────────────────────────────
function ActionBadge({ action }: { action: AuditEntry['action'] }) {
  const map = {
    INSERT: 'bg-primary/20 text-primary',
    UPDATE: 'bg-accent/20 text-accent',
    DELETE: 'bg-error/20 text-error',
  }
  const label = { INSERT: 'Nueva', UPDATE: 'Modificó', DELETE: 'Eliminó' }
  return (
    <span className={`badge text-[10px] font-semibold ${map[action]}`}>
      {label[action]}
    </span>
  )
}

// ── Muestra una predicción (home–away) ────────────────────────────────────────
function PredScore({
  home, away, homeEt, awayEt, pkWinner, empty,
}: {
  home: number | null; away: number | null
  homeEt: number | null; awayEt: number | null
  pkWinner: { abbreviation: string } | null
  empty?: boolean
}) {
  if (empty || home === null || away === null) {
    return <span className="text-text-muted text-xs">—</span>
  }
  return (
    <span className="text-xs font-mono text-text-primary">
      {home}–{away}
      {homeEt !== null && (
        <span className="text-text-muted"> (ET {homeEt}:{awayEt})</span>
      )}
      {pkWinner && (
        <span className="text-text-muted"> PK:{pkWinner.abbreviation}</span>
      )}
    </span>
  )
}

// ── Muestra las dos selecciones del partido ───────────────────────────────────
function MatchLabel({ entry }: { entry: AuditEntry }) {
  const m = entry.match
  const home = m.home_team?.abbreviation ?? m.home_slot_label ?? '?'
  const away = m.away_team?.abbreviation ?? m.away_slot_label ?? '?'
  return (
    <div className="min-w-0">
      <p className="text-xs font-medium text-text-primary whitespace-nowrap">
        #{m.match_number} · {home} vs {away}
      </p>
      <p className="text-[11px] text-text-muted">
        {m.group ? `Grupo ${m.group.name}` : m.phase.name}
      </p>
    </div>
  )
}

// ── Fila de audit ─────────────────────────────────────────────────────────────
function AuditRow({ entry }: { entry: AuditEntry }) {
  return (
    <tr className="border-b border-border hover:bg-surface-2/50 transition-colors">
      {/* Fecha UTC */}
      <td className="px-3 py-2.5 whitespace-nowrap">
        <span className="text-[11px] font-mono text-text-secondary">
          {formatUTC(entry.changed_at)}
        </span>
      </td>

      {/* Usuario */}
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-2">
          <UserAvatar
            avatarUrl={entry.user.avatar_url}
            seed={entry.user.id}
            className="w-6 h-6 flex-shrink-0"
          />
          <div className="min-w-0">
            <p className="text-xs font-medium text-text-primary truncate max-w-[100px]">
              {entry.user.display_name}
            </p>
            <p className="text-[10px] text-text-muted">@{entry.user.username}</p>
          </div>
        </div>
      </td>

      {/* Acción */}
      <td className="px-3 py-2.5">
        <ActionBadge action={entry.action} />
      </td>

      {/* Partido */}
      <td className="px-3 py-2.5">
        <MatchLabel entry={entry} />
      </td>

      {/* Predicción anterior */}
      <td className="px-3 py-2.5">
        <PredScore
          home={entry.old_home_score} away={entry.old_away_score}
          homeEt={entry.old_home_score_et} awayEt={entry.old_away_score_et}
          pkWinner={entry.old_pk_winner}
          empty={entry.action === 'INSERT'}
        />
      </td>

      {/* Predicción nueva */}
      <td className="px-3 py-2.5">
        <PredScore
          home={entry.new_home_score} away={entry.new_away_score}
          homeEt={entry.new_home_score_et} awayEt={entry.new_away_score_et}
          pkWinner={entry.new_pk_winner}
          empty={entry.action === 'DELETE'}
        />
      </td>
    </tr>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────
export function AuditoriaPage() {
  const [page, setPage] = useState(0)
  const [filters, setFilters] = useState<AuditFilters>({})
  const [draft, setDraft] = useState({
    userId: '',
    matchNumber: '',
    action: '' as '' | 'INSERT' | 'UPDATE' | 'DELETE',
    fromDate: '',
    toDate: '',
  })

  const { data: users = [] } = useQuery({
    queryKey: ['audit_users'],
    queryFn: fetchAuditUsers,
    staleTime: 1000 * 60 * 5,
  })

  const activeFilters: AuditFilters = { ...filters, page, pageSize: PAGE_SIZE }

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['audit', activeFilters],
    queryFn: () => fetchAuditLog(activeFilters),
    staleTime: 0,
    placeholderData: prev => prev,
  })

  const entries = data?.data ?? []
  const total   = data?.count ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const applyFilters = useCallback(() => {
    setPage(0)
    setFilters({
      userId:      draft.userId      || undefined,
      matchNumber: draft.matchNumber ? Number(draft.matchNumber) : undefined,
      action:      draft.action      || undefined,
      fromDate:    draft.fromDate    || undefined,
      toDate:      draft.toDate      || undefined,
    })
  }, [draft])

  const clearFilters = useCallback(() => {
    setDraft({ userId: '', matchNumber: '', action: '', fromDate: '', toDate: '' })
    setFilters({})
    setPage(0)
  }, [])

  const hasFilters = Object.values(filters).some(Boolean)

  return (
    <RequireAdmin>
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-4">

        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold text-text-primary">Auditoría de predicciones</h1>
            <p className="text-xs text-text-muted mt-0.5">
              Todas las horas en UTC (hora del servidor de base de datos)
            </p>
          </div>
          {total > 0 && (
            <span className="text-xs text-text-muted">
              {total.toLocaleString()} registro{total !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        {/* Filtros */}
        <div className="card p-4 space-y-3">
          <div className="flex items-center gap-2 mb-1">
            <Filter size={13} className="text-text-muted" />
            <span className="text-xs font-medium text-text-secondary">Filtros</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">

            {/* Usuario */}
            <div>
              <label className="block text-[11px] text-text-muted mb-1">Usuario</label>
              <select
                value={draft.userId}
                onChange={e => setDraft(d => ({ ...d, userId: e.target.value }))}
                className="input text-xs"
              >
                <option value="">Todos</option>
                {users.map(u => (
                  <option key={u.id} value={u.id}>
                    {u.display_name} (@{u.username})
                  </option>
                ))}
              </select>
            </div>

            {/* Nro. Partido */}
            <div>
              <label className="block text-[11px] text-text-muted mb-1">Nro. partido</label>
              <input
                type="number"
                min={1} max={104}
                value={draft.matchNumber}
                onChange={e => setDraft(d => ({ ...d, matchNumber: e.target.value }))}
                placeholder="1 – 104"
                className="input text-xs"
              />
            </div>

            {/* Acción */}
            <div>
              <label className="block text-[11px] text-text-muted mb-1">Acción</label>
              <select
                value={draft.action}
                onChange={e => setDraft(d => ({ ...d, action: e.target.value as typeof draft.action }))}
                className="input text-xs"
              >
                <option value="">Todas</option>
                <option value="INSERT">Nueva predicción</option>
                <option value="UPDATE">Modificación</option>
                <option value="DELETE">Eliminación</option>
              </select>
            </div>

            {/* Desde */}
            <div>
              <label className="block text-[11px] text-text-muted mb-1">Desde (UTC)</label>
              <input
                type="date"
                value={draft.fromDate}
                onChange={e => setDraft(d => ({ ...d, fromDate: e.target.value }))}
                className="input text-xs"
              />
            </div>

            {/* Hasta */}
            <div>
              <label className="block text-[11px] text-text-muted mb-1">Hasta (UTC)</label>
              <input
                type="date"
                value={draft.toDate}
                onChange={e => setDraft(d => ({ ...d, toDate: e.target.value }))}
                className="input text-xs"
              />
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <button className="btn-primary text-xs px-4" onClick={applyFilters}>
              Aplicar filtros
            </button>
            {hasFilters && (
              <button
                className="btn-ghost text-xs px-3 border border-border flex items-center gap-1"
                onClick={clearFilters}
              >
                <X size={12} /> Limpiar
              </button>
            )}
          </div>
        </div>

        {/* Tabla */}
        <div className="card overflow-hidden">
          {(isLoading || isFetching) && entries.length === 0 && (
            <div className="flex justify-center py-16">
              <Loader2 className="animate-spin text-primary" size={28} />
            </div>
          )}

          {!isLoading && entries.length === 0 && (
            <p className="text-text-muted text-sm text-center py-12">
              No hay registros para los filtros seleccionados.
            </p>
          )}

          {entries.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[700px]">
                <thead>
                  <tr className="border-b border-border bg-surface-2/50">
                    <th className="text-left px-3 py-2.5 text-[11px] text-text-muted font-medium whitespace-nowrap">
                      Fecha/Hora (UTC)
                    </th>
                    <th className="text-left px-3 py-2.5 text-[11px] text-text-muted font-medium">Usuario</th>
                    <th className="text-left px-3 py-2.5 text-[11px] text-text-muted font-medium">Acción</th>
                    <th className="text-left px-3 py-2.5 text-[11px] text-text-muted font-medium">Partido</th>
                    <th className="text-left px-3 py-2.5 text-[11px] text-text-muted font-medium">Anterior</th>
                    <th className="text-left px-3 py-2.5 text-[11px] text-text-muted font-medium">Nueva</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map(entry => (
                    <AuditRow key={entry.id} entry={entry} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Paginación */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between">
            <span className="text-xs text-text-muted">
              Página {page + 1} de {totalPages}
              {' · '}mostrando {Math.min(PAGE_SIZE, total - page * PAGE_SIZE)} de {total}
            </span>
            <div className="flex gap-1">
              <button
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
                className="btn-ghost p-1.5 disabled:opacity-40"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="btn-ghost p-1.5 disabled:opacity-40"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}

      </div>
    </RequireAdmin>
  )
}
