import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Navigate, Link, useParams } from 'react-router-dom'
import {
  Loader2, Trophy, Plus, ShieldCheck, Copy, Globe, Lock, Search, X, Users2,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '../../hooks/useAuth'
import { Modal } from '../../components/ui/Modal'
import {
  fetchTenantBySlug, fetchTenantTenComps, createTenComp, fetchCompetitions,
  fetchTenantRoles, assignTenantRole, removeTenantRole, searchProfiles,
  type TenantTenComp, type ProfileLite,
} from '../../services/v2/adminService'

const slugify = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50)

export function TenantAdminPage() {
  const { tenantSlug = '' } = useParams()
  const { user, loading, isTenantAdmin } = useAuth()
  const [showCreate, setShowCreate] = useState(false)
  const [showLoaders, setShowLoaders] = useState(false)

  const { data: tenant, isLoading: loadingTenant } = useQuery({
    queryKey: ['v2', 'tenant-by-slug', tenantSlug],
    queryFn: () => fetchTenantBySlug(tenantSlug),
    enabled: !!user && !!tenantSlug,
  })

  const { data: tenComps = [], isLoading } = useQuery({
    queryKey: ['v2', 'tenant-ten-comps', tenant?.id],
    queryFn: () => fetchTenantTenComps(tenant!.id),
    enabled: !!tenant,
  })

  if (loading || loadingTenant) return null
  if (!user) return <Navigate to="/auth" replace />
  if (!tenant) return <NotFound />
  if (!isTenantAdmin(tenant.id)) return <Navigate to="/" replace />

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Trophy size={20} className="text-primary" />
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-text-primary truncate">{tenant.name}</h1>
            <p className="text-xs text-text-muted">Administración de la empresa</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowLoaders(true)} className="btn-ghost text-sm inline-flex items-center gap-1.5">
            <Users2 size={14} /> Cargadores
          </button>
          <button onClick={() => setShowCreate(true)} className="btn-primary text-sm inline-flex items-center gap-1.5">
            <Plus size={14} /> Nueva penca
          </button>
        </div>
      </div>

      {isLoading ? <Spinner /> : (
        <div className="space-y-3">
          {tenComps.length === 0 && <Empty>Esta empresa no tiene pencas. Creá la primera.</Empty>}
          {tenComps.map(tc => <TenCompCard key={tc.id} tenComp={tc} />)}
        </div>
      )}

      {showCreate && (
        <CreateTenCompModal tenantId={tenant.id} onClose={() => setShowCreate(false)} />
      )}
      {showLoaders && (
        <LoadersModal tenantId={tenant.id} tenantName={tenant.name} onClose={() => setShowLoaders(false)} />
      )}
    </div>
  )
}

function TenCompCard({ tenComp }: { tenComp: TenantTenComp }) {
  return (
    <div className="card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-text-primary truncate">{tenComp.name}</p>
            {tenComp.visibility === 'public'
              ? <Globe size={12} className="text-text-muted flex-shrink-0" />
              : <Lock size={12} className="text-accent flex-shrink-0" />}
            <span className={`badge text-[10px] ${
              tenComp.status === 'open' ? 'bg-success/20 text-success'
              : tenComp.status === 'closed' ? 'bg-accent/20 text-accent' : 'bg-border text-text-muted'
            }`}>
              {tenComp.status === 'open' ? 'Abierta' : tenComp.status === 'closed' ? 'Cerrada' : 'Archivada'}
            </span>
          </div>
          <p className="text-xs text-text-muted truncate">{tenComp.competition_name}</p>
          <p className="text-[11px] text-text-muted mt-1">
            {tenComp.member_count} miembros
            {tenComp.pending_count > 0 && <span className="text-accent"> · {tenComp.pending_count} pendientes</span>}
          </p>
          {tenComp.visibility === 'private' && tenComp.join_code && (
            <div className="flex items-center gap-1.5 mt-2">
              <code className="text-xs bg-surface-2 px-2 py-1 rounded font-mono tracking-widest text-text-secondary">
                {tenComp.join_code}
              </code>
              <button
                onClick={() => { navigator.clipboard.writeText(tenComp.join_code!); toast.success('Código copiado') }}
                className="btn-ghost p-1"
              ><Copy size={12} /></button>
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
          <Link to={`/p/${tenComp.slug}/admin`} className="btn-ghost text-[11px] px-2.5 py-1 inline-flex items-center gap-1 text-accent">
            <ShieldCheck size={12} /> Admin
          </Link>
          <Link to={`/p/${tenComp.slug}`} className="btn-ghost text-[11px] px-2.5 py-1 text-primary">Ver penca</Link>
        </div>
      </div>
    </div>
  )
}

function CreateTenCompModal({ tenantId, onClose }: { tenantId: string; onClose: () => void }) {
  const qc = useQueryClient()
  const [competitionId, setCompetitionId] = useState('')
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugTouched, setSlugTouched] = useState(false)
  const [visibility, setVisibility] = useState<'public' | 'private'>('private')
  const [bonusEnabled, setBonusEnabled] = useState(true)

  const { data: competitions = [] } = useQuery({
    queryKey: ['v2', 'competitions'],
    queryFn: fetchCompetitions,
  })

  const mut = useMutation({
    mutationFn: () => createTenComp({
      tenantId, competitionId, name: name.trim(), slug: slug.trim(), visibility, bonusEnabled,
    }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['v2', 'tenant-ten-comps', tenantId] })
      toast.success(res.join_code ? `Penca creada · código ${res.join_code}` : 'Penca creada')
      onClose()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const valid = competitionId && name.trim() && slug.trim()

  return (
    <Modal open onClose={onClose} title="Nueva penca">
      <form onSubmit={e => { e.preventDefault(); if (valid) mut.mutate() }} className="space-y-4">
        <Field label="Competencia">
          <select className="input w-full" value={competitionId} onChange={e => setCompetitionId(e.target.value)}>
            <option value="">Elegir competencia...</option>
            {competitions.map(c => (
              <option key={c.id} value={c.id}>{c.name}{c.season ? ` (${c.season})` : ''}</option>
            ))}
          </select>
        </Field>
        <Field label="Nombre de la penca">
          <input className="input w-full" value={name} autoFocus
            onChange={e => { setName(e.target.value); if (!slugTouched) setSlug(slugify(e.target.value)) }}
            placeholder="Mundial - Empleados" />
        </Field>
        <Field label="Slug (URL: /p/...)">
          <input className="input w-full font-mono" value={slug}
            onChange={e => { setSlug(slugify(e.target.value)); setSlugTouched(true) }}
            placeholder="mundial-empleados" />
        </Field>
        <Field label="Visibilidad">
          <div className="flex gap-2">
            {(['private', 'public'] as const).map(v => (
              <button key={v} type="button" onClick={() => setVisibility(v)}
                className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium inline-flex items-center justify-center gap-1.5 transition-colors ${
                  visibility === v ? 'bg-primary text-white' : 'bg-surface-2 text-text-secondary'
                }`}>
                {v === 'public' ? <><Globe size={13} /> Pública</> : <><Lock size={13} /> Privada</>}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-text-muted mt-1.5">
            {visibility === 'public'
              ? 'Cualquiera puede unirse y queda aprobado al instante.'
              : 'Se une con código de 8 letras; requiere tu aprobación para el ranking.'}
          </p>
        </Field>
        <label className="flex items-center justify-between gap-3 py-2 px-3 rounded-lg bg-surface-2 cursor-pointer">
          <span className="text-sm text-text-primary">Habilitar + Puntos (bonus)</span>
          <input type="checkbox" checked={bonusEnabled} onChange={e => setBonusEnabled(e.target.checked)}
            className="accent-primary w-4 h-4" />
        </label>
        <button type="submit" disabled={mut.isPending || !valid} className="btn-primary w-full">
          {mut.isPending ? <Loader2 size={16} className="animate-spin mx-auto" /> : 'Crear penca'}
        </button>
      </form>
    </Modal>
  )
}

function LoadersModal({ tenantId, tenantName, onClose }: { tenantId: string; tenantName: string; onClose: () => void }) {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [results, setResults] = useState<ProfileLite[]>([])
  const [searching, setSearching] = useState(false)

  const { data: roles = [], isLoading } = useQuery({
    queryKey: ['v2', 'tenant-roles', tenantId],
    queryFn: () => fetchTenantRoles(tenantId),
  })
  const loaders = roles.filter(r => r.role === 'loader')

  const invalidate = () => qc.invalidateQueries({ queryKey: ['v2', 'tenant-roles', tenantId] })

  const assignMut = useMutation({
    mutationFn: (userId: string) => assignTenantRole(tenantId, userId, 'loader'),
    onSuccess: () => { invalidate(); toast.success('Cargador asignado'); setSearch(''); setResults([]) },
    onError: (e: Error) => toast.error(e.message),
  })
  const removeMut = useMutation({
    mutationFn: (userId: string) => removeTenantRole(tenantId, userId),
    onSuccess: () => { invalidate(); toast.success('Cargador quitado') },
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
    <Modal open onClose={onClose} title={`Cargadores · ${tenantName}`}>
      <div className="space-y-4">
        <p className="text-xs text-text-muted">
          Los cargadores pueden cargar resultados de las competencias que usa esta empresa.
        </p>
        <div>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input className="input w-full pl-9" value={search} onChange={e => doSearch(e.target.value)}
              placeholder="Buscar usuario..." />
            {searching && <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-text-muted" />}
          </div>
          {results.length > 0 && (
            <div className="mt-2 space-y-1.5">
              {results.map(p => (
                <div key={p.id} className="flex items-center justify-between gap-2 py-1.5 px-2.5 rounded-lg bg-surface-2">
                  <span className="text-sm text-text-primary truncate">
                    {p.display_name || p.username || 'Usuario'}
                  </span>
                  <button onClick={() => assignMut.mutate(p.id)} className="btn-primary text-[10px] px-2 py-0.5">
                    Agregar
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
        <div>
          <h3 className="text-xs font-semibold text-text-muted uppercase tracking-widest mb-2">Cargadores actuales</h3>
          {isLoading ? <Spinner /> : loaders.length === 0 ? (
            <Empty>Sin cargadores. Asigná usuarios que carguen resultados.</Empty>
          ) : (
            <div className="space-y-1.5">
              {loaders.map(r => (
                <div key={r.user_id} className="flex items-center justify-between gap-2 py-2 px-3 rounded-lg bg-surface-2">
                  <span className="text-sm text-text-primary truncate">{r.display_name || r.username || 'Usuario'}</span>
                  <button onClick={() => removeMut.mutate(r.user_id)} className="btn-ghost p-1 text-error"><X size={14} /></button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}

function NotFound() {
  return (
    <div className="card p-8 text-center max-w-md mx-auto mt-10">
      <p className="text-text-muted text-sm mb-4">No encontramos esta empresa.</p>
      <Link to="/pencas" className="btn-secondary text-sm">Volver</Link>
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
