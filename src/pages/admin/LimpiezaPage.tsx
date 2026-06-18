import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Navigate } from 'react-router-dom'
import { Trash2, Loader2, AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '../../hooks/useAuth'
import { Modal } from '../../components/ui/Modal'
import {
  fetchCompetitionsForCleanup,
  fetchTenantsForCleanup,
  deleteCompetition,
  deleteTenant,
  type CompetitionForCleanup,
  type TenantForCleanup,
} from '../../services/v2/adminCleanupService'

type DeleteTarget =
  | { kind: 'competition'; item: CompetitionForCleanup }
  | { kind: 'tenant'; item: TenantForCleanup }

export function LimpiezaPage() {
  const { user, loading, isSuperAdmin } = useAuth()
  const qc = useQueryClient()

  const [competenciasOpen, setCompetenciasOpen] = useState(true)
  const [tenantsOpen, setTenantsOpen] = useState(true)
  const [target, setTarget] = useState<DeleteTarget | null>(null)
  const [confirmName, setConfirmName] = useState('')
  const [deleting, setDeleting] = useState(false)

  const { data: competitions = [], isLoading: loadingComps } = useQuery({
    queryKey: ['v2', 'cleanup', 'competitions'],
    queryFn: fetchCompetitionsForCleanup,
    enabled: isSuperAdmin,
  })

  const { data: tenants = [], isLoading: loadingTenants } = useQuery({
    queryKey: ['v2', 'cleanup', 'tenants'],
    queryFn: fetchTenantsForCleanup,
    enabled: isSuperAdmin,
  })

  if (loading) return null
  if (!user) return <Navigate to="/auth" replace />
  if (!isSuperAdmin) return <Navigate to="/" replace />

  function openDelete(t: DeleteTarget) {
    setTarget(t)
    setConfirmName('')
  }

  function closeModal() {
    if (deleting) return
    setTarget(null)
    setConfirmName('')
  }

  async function handleConfirmDelete() {
    if (!target) return
    const expectedName = target.kind === 'competition' ? target.item.name : target.item.name
    if (confirmName !== expectedName) return

    setDeleting(true)
    try {
      if (target.kind === 'competition') {
        await deleteCompetition(target.item.id)
        await qc.invalidateQueries({ queryKey: ['v2', 'cleanup', 'competitions'] })
        toast.success(`Competencia "${target.item.name}" eliminada`)
      } else {
        await deleteTenant(target.item.id)
        await qc.invalidateQueries({ queryKey: ['v2', 'cleanup', 'tenants'] })
        await qc.invalidateQueries({ queryKey: ['v2', 'cleanup', 'competitions'] })
        toast.success(`Tenant "${target.item.name}" eliminado`)
      }
      setTarget(null)
      setConfirmName('')
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setDeleting(false)
    }
  }

  const targetName = target ? target.item.name : ''
  const canConfirm = confirmName === targetName && targetName.length > 0

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      <header className="space-y-3">
        <div className="flex items-center gap-2">
          <Trash2 size={20} className="text-red-400" />
          <h1 className="text-xl font-bold text-text-primary">Limpieza de datos</h1>
        </div>
        <div className="flex items-start gap-2.5 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3">
          <AlertTriangle size={16} className="text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-300">
            <span className="font-semibold">Zona de peligro</span> — esta sección elimina datos de forma permanente e irreversible.
            No se pueden deshacer las eliminaciones.
          </p>
        </div>
      </header>

      <section>
        <button
          onClick={() => setCompetenciasOpen(o => !o)}
          className="w-full flex items-center justify-between text-left py-2 group"
        >
          <h2 className="text-xs font-semibold text-text-muted uppercase tracking-widest flex items-center gap-1.5">
            {competenciasOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            Competencias ({competitions.length})
          </h2>
        </button>

        {competenciasOpen && (
          <div className="mt-2 space-y-2">
            {loadingComps ? (
              <Spinner />
            ) : competitions.length === 0 ? (
              <Empty>No hay competencias.</Empty>
            ) : (
              competitions.map(c => (
                <CompetitionRow key={c.id} item={c} onDelete={() => openDelete({ kind: 'competition', item: c })} />
              ))
            )}
          </div>
        )}
      </section>

      <section>
        <button
          onClick={() => setTenantsOpen(o => !o)}
          className="w-full flex items-center justify-between text-left py-2 group"
        >
          <h2 className="text-xs font-semibold text-text-muted uppercase tracking-widest flex items-center gap-1.5">
            {tenantsOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            Tenants ({tenants.length})
          </h2>
        </button>

        {tenantsOpen && (
          <div className="mt-2 space-y-2">
            {loadingTenants ? (
              <Spinner />
            ) : tenants.length === 0 ? (
              <Empty>No hay tenants eliminables.</Empty>
            ) : (
              tenants.map(t => (
                <TenantRow key={t.id} item={t} onDelete={() => openDelete({ kind: 'tenant', item: t })} />
              ))
            )}
          </div>
        )}
      </section>

      <ConfirmDeleteModal
        target={target}
        confirmName={confirmName}
        onConfirmNameChange={setConfirmName}
        canConfirm={canConfirm}
        deleting={deleting}
        onClose={closeModal}
        onConfirm={handleConfirmDelete}
      />
    </div>
  )
}

function CompetitionRow({ item, onDelete }: { item: CompetitionForCleanup; onDelete: () => void }) {
  return (
    <div className="card p-3 flex items-start justify-between gap-3">
      <div className="min-w-0 space-y-1.5">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-medium text-text-primary truncate">{item.name}</p>
          <span className="badge bg-border text-text-muted text-[10px]">{item.sport}</span>
          {item.season && (
            <span className="badge bg-border text-text-muted text-[10px]">{item.season}</span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Chip>{item.ten_comp_count} pencas</Chip>
          <Chip>{item.match_count} partidos</Chip>
          <Chip warn>{item.team_count} equipos (se huerfanizan)</Chip>
        </div>
      </div>
      <button
        onClick={onDelete}
        className="flex-shrink-0 text-xs px-2.5 py-1 rounded-lg border border-red-500/40 text-red-400 hover:bg-red-500/10 transition-colors"
      >
        Eliminar
      </button>
    </div>
  )
}

function TenantRow({ item, onDelete }: { item: TenantForCleanup; onDelete: () => void }) {
  return (
    <div className="card p-3 flex items-start justify-between gap-3">
      <div className="min-w-0 space-y-1.5">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-medium text-text-primary truncate">{item.name}</p>
          <span className="badge bg-border text-text-muted text-[10px] font-mono">/{item.slug}</span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Chip>{item.ten_comp_count} pencas</Chip>
          <Chip>{item.owned_competition_count} competencias propias</Chip>
        </div>
      </div>
      <button
        onClick={onDelete}
        className="flex-shrink-0 text-xs px-2.5 py-1 rounded-lg border border-red-500/40 text-red-400 hover:bg-red-500/10 transition-colors"
      >
        Eliminar
      </button>
    </div>
  )
}

function Chip({ children, warn }: { children: React.ReactNode; warn?: boolean }) {
  return (
    <span className={`inline-flex items-center text-[10px] px-2 py-0.5 rounded-full border ${
      warn ? 'border-amber-500/30 bg-amber-500/10 text-amber-400' : 'border-border bg-surface text-text-muted'
    }`}>
      {children}
    </span>
  )
}

interface ConfirmDeleteModalProps {
  target: DeleteTarget | null
  confirmName: string
  onConfirmNameChange: (v: string) => void
  canConfirm: boolean
  deleting: boolean
  onClose: () => void
  onConfirm: () => void
}

function ConfirmDeleteModal({
  target,
  confirmName,
  onConfirmNameChange,
  canConfirm,
  deleting,
  onClose,
  onConfirm,
}: ConfirmDeleteModalProps) {
  if (!target) return null

  const isCompetition = target.kind === 'competition'
  const item = target.item

  return (
    <Modal open onClose={onClose} title="Confirmar eliminación" size="md">
      <div className="space-y-4">
        <div className="flex items-start gap-2.5 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2.5">
          <AlertTriangle size={15} className="text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-red-300">Esta acción es permanente e irreversible.</p>
        </div>

        {isCompetition ? (
          <CompetitionDeleteWarning item={target.item as CompetitionForCleanup} />
        ) : (
          <TenantDeleteWarning item={target.item as TenantForCleanup} />
        )}

        <div className="space-y-1.5">
          <label className="block text-xs text-text-secondary">
            Escribí <span className="font-semibold text-text-primary">{item.name}</span> para confirmar
          </label>
          <input
            className="input w-full"
            value={confirmName}
            onChange={e => onConfirmNameChange(e.target.value)}
            placeholder={item.name}
            autoFocus
            disabled={deleting}
          />
        </div>

        <div className="flex gap-2 pt-1">
          <button
            onClick={onClose}
            disabled={deleting}
            className="btn-ghost flex-1 text-sm"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            disabled={!canConfirm || deleting}
            className="flex-1 text-sm px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium transition-colors flex items-center justify-center gap-2"
          >
            {deleting ? (
              <><Loader2 size={14} className="animate-spin" /> Eliminando...</>
            ) : (
              'Confirmar eliminación'
            )}
          </button>
        </div>
      </div>
    </Modal>
  )
}

function CompetitionDeleteWarning({ item }: { item: CompetitionForCleanup }) {
  return (
    <div className="space-y-2 text-sm text-text-secondary">
      <p>Se eliminará la competencia <span className="text-text-primary font-medium">{item.name}</span> y en cascada:</p>
      <ul className="list-disc list-inside space-y-1 text-xs pl-1">
        <li>Todas las fases, grupos, estadios</li>
        <li>Todos los partidos ({item.match_count})</li>
        <li>Todas las pencas (ten-comps) asociadas ({item.ten_comp_count}) y sus predicciones</li>
      </ul>
      {item.team_count > 0 && (
        <p className="text-xs text-amber-400 flex items-start gap-1.5 mt-1">
          <AlertTriangle size={12} className="flex-shrink-0 mt-0.5" />
          Los {item.team_count} equipos <strong>no se eliminarán</strong> — quedarán huérfanos (sin competencia asignada).
        </p>
      )}
    </div>
  )
}

function TenantDeleteWarning({ item }: { item: TenantForCleanup }) {
  return (
    <div className="space-y-2 text-sm text-text-secondary">
      <p>Se eliminará el tenant <span className="text-text-primary font-medium">{item.name}</span> y en cascada:</p>
      <ul className="list-disc list-inside space-y-1 text-xs pl-1">
        <li>Todas sus pencas ({item.ten_comp_count}) y sus predicciones</li>
        <li>Todos sus roles de usuario</li>
      </ul>
      {item.owned_competition_count > 0 && (
        <div className="text-xs text-amber-400 flex items-start gap-1.5 mt-1">
          <AlertTriangle size={12} className="flex-shrink-0 mt-0.5" />
          <span>
            Las {item.owned_competition_count} competencias de este tenant:
            si solo las usa este tenant → se eliminarán con sus partidos y equipos huérfanos.
            Si otros tenants también las usan → solo se quitará la propiedad.
          </span>
        </div>
      )}
    </div>
  )
}

function Spinner() {
  return <div className="flex justify-center py-8"><Loader2 className="animate-spin text-primary" size={24} /></div>
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-text-muted text-sm py-2">{children}</p>
}
