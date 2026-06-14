import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Navigate, Link } from 'react-router-dom'
import {
  Loader2, Building2, Plus, Users2, ExternalLink, Search, X, ShieldCheck, UploadCloud,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '../../hooks/useAuth'
import { Modal } from '../../components/ui/Modal'
import {
  fetchTenants, createTenant,
  fetchTenantRoles, assignTenantRole, removeTenantRole, searchProfiles,
  type TenantRoleRow, type ProfileLite,
} from '../../services/v2/adminService'
import type { Tenant, TenantRoleName } from '../../types/tenant'

const slugify = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50)

export function AdminTenantsPage() {
  const { user, loading, isSuperAdmin } = useAuth()
  const qc = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [managingRoles, setManagingRoles] = useState<Tenant | null>(null)

  const { data: tenants = [], isLoading } = useQuery({
    queryKey: ['v2', 'tenants'],
    queryFn: fetchTenants,
    enabled: isSuperAdmin,
  })

  if (loading) return null
  if (!user) return <Navigate to="/auth" replace />
  if (!isSuperAdmin) return <Navigate to="/" replace />

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Building2 size={20} className="text-primary" />
          <h1 className="text-xl font-bold text-text-primary">Empresas (tenants)</h1>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary text-sm inline-flex items-center gap-1.5">
          <Plus size={14} /> Nueva empresa
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        <Link to="/admin/resultados-v2" className="btn-ghost text-xs inline-flex items-center gap-1.5 text-accent">
          <UploadCloud size={14} /> Cargar resultados
        </Link>
      </div>

      {isLoading ? <Spinner /> : (
        <div className="space-y-3">
          {tenants.length === 0 && <Empty>No hay empresas todavía. Creá la primera.</Empty>}
          {tenants.map(t => (
            <TenantCard key={t.id} tenant={t} onManageRoles={() => setManagingRoles(t)} />
          ))}
        </div>
      )}

      <CreateTenantModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={() => qc.invalidateQueries({ queryKey: ['v2', 'tenants'] })}
      />

      {managingRoles && (
        <RolesModal tenant={managingRoles} onClose={() => setManagingRoles(null)} />
      )}
    </div>
  )
}

function TenantCard({ tenant, onManageRoles }: { tenant: Tenant; onManageRoles: () => void }) {
  return (
    <div className="card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-text-primary truncate">{tenant.name}</p>
            <span className={`badge text-[10px] ${tenant.status === 'active' ? 'bg-success/20 text-success' : 'bg-error/20 text-error'}`}>
              {tenant.status === 'active' ? 'Activa' : 'Suspendida'}
            </span>
          </div>
          <p className="text-xs text-text-muted truncate">/{tenant.slug} · plan {tenant.plan}</p>
          <p className="text-[11px] text-text-muted mt-1">
            Pencas: {tenant.max_ten_comps ?? '∞'} · Miembros/penca: {tenant.max_members_per_ten_comp ?? '∞'}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
          <button onClick={onManageRoles} className="btn-ghost text-[11px] px-2.5 py-1 inline-flex items-center gap-1">
            <Users2 size={12} /> Roles
          </button>
          <Link to={`/t/${tenant.slug}/admin`} className="btn-ghost text-[11px] px-2.5 py-1 inline-flex items-center gap-1 text-primary">
            <ExternalLink size={12} /> Pencas
          </Link>
        </div>
      </div>
    </div>
  )
}

function CreateTenantModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [maxTenComps, setMaxTenComps] = useState('')
  const [maxMembers, setMaxMembers] = useState('')
  const [slugTouched, setSlugTouched] = useState(false)

  const mut = useMutation({
    mutationFn: () => createTenant({
      name: name.trim(),
      slug: slug.trim(),
      max_ten_comps: maxTenComps ? Number(maxTenComps) : null,
      max_members_per_ten_comp: maxMembers ? Number(maxMembers) : null,
    }),
    onSuccess: () => {
      toast.success('Empresa creada')
      onCreated()
      onClose()
      setName(''); setSlug(''); setMaxTenComps(''); setMaxMembers(''); setSlugTouched(false)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  return (
    <Modal open={open} onClose={onClose} title="Nueva empresa">
      <form
        onSubmit={e => { e.preventDefault(); if (name.trim() && slug.trim()) mut.mutate() }}
        className="space-y-4"
      >
        <Field label="Nombre">
          <input
            className="input w-full" value={name} autoFocus
            onChange={e => { setName(e.target.value); if (!slugTouched) setSlug(slugify(e.target.value)) }}
            placeholder="Empresa ABC"
          />
        </Field>
        <Field label="Slug (URL)">
          <input
            className="input w-full font-mono" value={slug}
            onChange={e => { setSlug(slugify(e.target.value)); setSlugTouched(true) }}
            placeholder="empresa-abc"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Máx. pencas (vacío = ∞)">
            <input className="input w-full" type="number" min={1} value={maxTenComps}
              onChange={e => setMaxTenComps(e.target.value)} placeholder="∞" />
          </Field>
          <Field label="Máx. miembros/penca">
            <input className="input w-full" type="number" min={1} value={maxMembers}
              onChange={e => setMaxMembers(e.target.value)} placeholder="∞" />
          </Field>
        </div>
        <button type="submit" disabled={mut.isPending || !name.trim() || !slug.trim()} className="btn-primary w-full">
          {mut.isPending ? <Loader2 size={16} className="animate-spin mx-auto" /> : 'Crear empresa'}
        </button>
      </form>
    </Modal>
  )
}

function RolesModal({ tenant, onClose }: { tenant: Tenant; onClose: () => void }) {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [results, setResults] = useState<ProfileLite[]>([])
  const [searching, setSearching] = useState(false)

  const { data: roles = [], isLoading } = useQuery({
    queryKey: ['v2', 'tenant-roles', tenant.id],
    queryFn: () => fetchTenantRoles(tenant.id),
  })

  const invalidate = () => qc.invalidateQueries({ queryKey: ['v2', 'tenant-roles', tenant.id] })

  const assignMut = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: TenantRoleName }) =>
      assignTenantRole(tenant.id, userId, role),
    onSuccess: () => { invalidate(); toast.success('Rol asignado'); setSearch(''); setResults([]) },
    onError: (e: Error) => toast.error(e.message),
  })
  const removeMut = useMutation({
    mutationFn: (userId: string) => removeTenantRole(tenant.id, userId),
    onSuccess: () => { invalidate(); toast.success('Rol quitado') },
    onError: (e: Error) => toast.error(e.message),
  })

  async function doSearch(term: string) {
    setSearch(term)
    if (term.trim().length < 2) { setResults([]); return }
    setSearching(true)
    try {
      const existing = new Set(roles.map(r => r.user_id))
      const found = await searchProfiles(term)
      setResults(found.filter(p => !existing.has(p.id)))
    } catch (e) { toast.error((e as Error).message) }
    finally { setSearching(false) }
  }

  return (
    <Modal open onClose={onClose} title={`Roles · ${tenant.name}`}>
      <div className="space-y-4">
        {/* Buscar usuario */}
        <div>
          <label className="block text-xs text-text-secondary mb-1.5">Asignar rol a un usuario</label>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              className="input w-full pl-9" value={search}
              onChange={e => doSearch(e.target.value)}
              placeholder="Buscar por usuario o nombre..."
            />
            {searching && <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-text-muted" />}
          </div>
          {results.length > 0 && (
            <div className="mt-2 space-y-1.5">
              {results.map(p => (
                <div key={p.id} className="flex items-center justify-between gap-2 py-1.5 px-2.5 rounded-lg bg-surface-2">
                  <span className="text-sm text-text-primary truncate">
                    {p.display_name || p.username || 'Usuario'}
                    {p.username && <span className="text-text-muted text-xs"> @{p.username}</span>}
                  </span>
                  <div className="flex gap-1 flex-shrink-0">
                    <button onClick={() => assignMut.mutate({ userId: p.id, role: 'admin' })}
                      className="btn-primary text-[10px] px-2 py-0.5">Admin</button>
                    <button onClick={() => assignMut.mutate({ userId: p.id, role: 'loader' })}
                      className="btn-ghost text-[10px] px-2 py-0.5">Cargador</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Roles actuales */}
        <div>
          <h3 className="text-xs font-semibold text-text-muted uppercase tracking-widest mb-2">Roles actuales</h3>
          {isLoading ? <Spinner /> : roles.length === 0 ? (
            <Empty>Sin roles asignados. El admin gestiona las pencas; el cargador carga resultados.</Empty>
          ) : (
            <div className="space-y-1.5">
              {roles.map(r => <RoleItem key={r.user_id} role={r} onRemove={() => removeMut.mutate(r.user_id)} />)}
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}

function RoleItem({ role, onRemove }: { role: TenantRoleRow; onRemove: () => void }) {
  return (
    <div className="flex items-center justify-between gap-2 py-2 px-3 rounded-lg bg-surface-2">
      <div className="flex items-center gap-2 min-w-0">
        <ShieldCheck size={14} className={role.role === 'admin' ? 'text-accent' : 'text-text-muted'} />
        <span className="text-sm text-text-primary truncate">
          {role.display_name || role.username || 'Usuario'}
        </span>
        <span className={`badge text-[10px] ${role.role === 'admin' ? 'bg-accent/20 text-accent' : 'bg-border text-text-muted'}`}>
          {role.role === 'admin' ? 'Admin' : 'Cargador'}
        </span>
      </div>
      <button onClick={onRemove} className="btn-ghost p-1 text-error flex-shrink-0"><X size={14} /></button>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs text-text-secondary mb-1.5">{label}</label>
      {children}
    </div>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-text-muted text-sm py-2">{children}</p>
}

function Spinner() {
  return <div className="flex justify-center py-8"><Loader2 className="animate-spin text-primary" size={24} /></div>
}
