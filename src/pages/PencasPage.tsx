import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { Loader2, Trophy, Globe, KeyRound, Clock, ArrowRight, ShieldCheck, Building2, Eye } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '../hooks/useAuth'
import {
  fetchMyTenComps,
  fetchPublicTenComps,
  joinPublicTenComp,
  joinPrivateTenComp,
} from '../services/tenCompService'
import { fetchTenantsByIds } from '../services/v2/adminService'
import { Modal } from '../components/ui/Modal'
import type { MyPenca, PublicPenca, CompetitionStatus } from '../types/tenant'

// Una penca pública solo se puede unir si su competencia está "Activa".
// El resto (borrador / finalizada / archivada) se muestra en modo visualización.
const NON_ACTIVE_BADGE: Partial<Record<CompetitionStatus, string>> = {
  draft: 'Próximamente',
  finished: 'Finalizada',
  archived: 'Archivada',
}

export function PencasPage() {
  const { user, isSuperAdmin, tenantRoles } = useAuth()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [showJoin, setShowJoin] = useState(false)
  const [code, setCode] = useState('')

  // Tenants donde el usuario es admin (para mostrar accesos de administración).
  const adminTenantIds = useMemo(
    () => [...new Set(tenantRoles.filter(r => r.role === 'admin').map(r => r.tenant_id))],
    [tenantRoles]
  )
  const { data: adminTenants = [] } = useQuery({
    queryKey: ['admin_tenants', adminTenantIds],
    queryFn: () => fetchTenantsByIds(adminTenantIds),
    enabled: adminTenantIds.length > 0,
  })

  const { data: myPencas = [], isLoading: loadingMine } = useQuery({
    queryKey: ['my_ten_comps', user?.id],
    queryFn: () => (user ? fetchMyTenComps(user.id) : Promise.resolve([] as MyPenca[])),
    enabled: !!user,
  })

  const { data: publicPencas = [], isLoading: loadingPublic } = useQuery({
    queryKey: ['public_ten_comps'],
    queryFn: fetchPublicTenComps,
  })

  const myIds = useMemo(() => new Set(myPencas.map(p => p.tenComp.id)), [myPencas])
  // No participadas; las de competencia activa (unibles) primero. El orden por
  // fecha que trae el servicio se mantiene dentro de cada grupo (sort estable).
  const explorable = useMemo(
    () =>
      publicPencas
        .filter(p => !myIds.has(p.tenComp.id))
        .sort((a, b) =>
          (a.competition.status === 'active' ? 0 : 1) - (b.competition.status === 'active' ? 0 : 1)
        ),
    [publicPencas, myIds]
  )

  // Mis pencas: públicas primero, privadas agrupadas por tenant.
  const myPublic = myPencas.filter(p => p.tenComp.visibility === 'public')
  const privateByTenant = useMemo(() => {
    const map = new Map<string, { tenantName: string; pencas: MyPenca[] }>()
    for (const p of myPencas.filter(p => p.tenComp.visibility === 'private')) {
      if (!map.has(p.tenant.id)) map.set(p.tenant.id, { tenantName: p.tenant.name, pencas: [] })
      map.get(p.tenant.id)!.pencas.push(p)
    }
    return Array.from(map.values())
  }, [myPencas])

  const joinPublicMut = useMutation({
    mutationFn: (tenCompId: string) => joinPublicTenComp(tenCompId),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['my_ten_comps'] })
      toast.success('¡Te uniste a la penca!')
      navigate(`/p/${res.slug}`)
    },
    onError: (e: any) => toast.error(e.message || 'No se pudo unir a la penca'),
  })

  const joinPrivateMut = useMutation({
    mutationFn: (c: string) => joinPrivateTenComp(c),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['my_ten_comps'] })
      setShowJoin(false)
      setCode('')
      toast.success(
        res.status === 'pending'
          ? 'Solicitud enviada. Esperá la aprobación del administrador.'
          : '¡Te uniste a la penca!'
      )
      navigate(`/p/${res.slug}`)
    },
    onError: (e: any) => toast.error(e.message || 'Código inválido'),
  })

  // Acción de unirse pública: logueado se une al instante; anónimo va a ingresar.
  const handleJoinPublic = (tenCompId: string) => {
    if (!user) { navigate('/auth'); return }
    joinPublicMut.mutate(tenCompId)
  }
  const handleCodeClick = () => {
    if (!user) { navigate('/auth'); return }
    setShowJoin(true)
    setCode('')
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Trophy size={20} className="text-primary" />
          <h1 className="text-xl font-bold text-text-primary">{user ? 'Mis pencas' : 'Pencas'}</h1>
        </div>
        <button
          onClick={handleCodeClick}
          className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1"
        >
          <KeyRound size={14} /> Unirme con código
        </button>
      </div>

      {/* Accesos de administración */}
      {(isSuperAdmin || adminTenants.length > 0) && (
        <div className="flex flex-wrap gap-2">
          {isSuperAdmin && (
            <Link to="/admin" className="btn-ghost text-xs inline-flex items-center gap-1.5 text-accent border border-border">
              <ShieldCheck size={14} /> Administración
            </Link>
          )}
          {adminTenants.map(t => (
            <Link key={t.id} to={`/t/${t.slug}/admin`}
              className="btn-ghost text-xs inline-flex items-center gap-1.5 text-primary border border-border">
              <Building2 size={14} /> {t.name}
            </Link>
          ))}
        </div>
      )}

      {/* Mis pencas (solo logueado) */}
      {user && (
        loadingMine ? (
          <Spinner />
        ) : myPencas.length === 0 ? (
          <div className="card p-8 text-center">
            <p className="text-text-muted text-sm">
              Todavía no participás en ninguna penca. Explorá las públicas o unite con un código.
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            {myPublic.length > 0 && (
              <PencaGroup
                icon={<Globe size={14} className="text-text-secondary" />}
                title="Públicas"
                subtitle="Pencas públicas a las que ya estás asociado"
              >
                {myPublic.map(p => <MyPencaCard key={p.tenComp.id} penca={p} />)}
              </PencaGroup>
            )}
            {privateByTenant.map(group => (
              <PencaGroup
                key={group.tenantName}
                icon={<Building2 size={14} className="text-text-secondary" />}
                title={group.tenantName}
              >
                {group.pencas.map(p => <MyPencaCard key={p.tenComp.id} penca={p} />)}
              </PencaGroup>
            ))}
          </div>
        )
      )}

      {/* CTA de ingreso para anónimos */}
      {!user && (
        <div className="card p-4 text-center">
          <p className="text-text-muted text-sm mb-3">
            Ingresá para sumarte a una penca pública o usar un código de penca privada.
          </p>
          <Link to="/auth" className="btn-primary text-sm">Ingresar</Link>
        </div>
      )}

      {/* Explorar públicas */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Globe size={16} className="text-text-secondary" />
          <h2 className="text-sm font-semibold text-text-secondary">Pencas públicas</h2>
        </div>
        <p className="text-xs text-text-muted mb-3">Pencas públicas a las que todavía no estás asociado</p>
        {loadingPublic ? (
          <Spinner />
        ) : explorable.length === 0 ? (
          <p className="text-xs text-text-muted">
            {user ? 'No hay pencas públicas nuevas para explorar.' : 'No hay pencas públicas activas por ahora.'}
          </p>
        ) : (
          <div className="grid sm:grid-cols-2 gap-3">
            {explorable.map(p => (
              <PublicPencaCard
                key={p.tenComp.id}
                penca={p}
                joining={joinPublicMut.isPending}
                cta={user ? 'Unirme' : 'Ingresar'}
                onJoin={() => handleJoinPublic(p.tenComp.id)}
                onOpen={() => navigate(`/p/${p.tenComp.slug}`)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Modal unirse por código */}
      <Modal open={showJoin} onClose={() => setShowJoin(false)} title="Unirme con código">
        <form
          onSubmit={e => {
            e.preventDefault()
            if (code.trim().length !== 8) return
            joinPrivateMut.mutate(code.trim())
          }}
          className="space-y-4"
        >
          <div>
            <label className="block text-xs text-text-secondary mb-1.5">Código de la penca (8 letras)</label>
            <input
              type="text"
              value={code}
              onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 8))}
              className="input tracking-[0.3em] text-center font-mono uppercase"
              placeholder="ABCDEFGH"
              maxLength={8}
              autoFocus
            />
          </div>
          <button
            type="submit"
            disabled={joinPrivateMut.isPending || code.trim().length !== 8}
            className="btn-primary w-full"
          >
            {joinPrivateMut.isPending ? <Loader2 size={16} className="animate-spin" /> : 'Unirme'}
          </button>
        </form>
      </Modal>
    </div>
  )
}

function PencaGroup({
  icon,
  title,
  subtitle,
  children,
}: {
  icon: React.ReactNode
  title: string
  subtitle?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-0.5">
        {icon}
        <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">{title}</h3>
      </div>
      {subtitle && <p className="text-xs text-text-muted mb-2">{subtitle}</p>}
      <div className="grid sm:grid-cols-2 gap-3">{children}</div>
    </div>
  )
}

function MyPencaCard({ penca }: { penca: MyPenca }) {
  const { tenComp, competition, memberStatus } = penca
  return (
    <Link to={`/p/${tenComp.slug}`} className="card p-4 hover:border-primary/40 transition-colors group">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-text-primary truncate">{tenComp.name}</p>
          <p className="text-xs text-text-muted truncate">{competition.name}</p>
        </div>
        <ArrowRight size={16} className="text-text-muted group-hover:text-primary transition-colors flex-shrink-0" />
      </div>
      {memberStatus === 'pending' && (
        <span className="badge bg-accent/20 text-accent text-[10px] mt-2 inline-flex items-center gap-1">
          <Clock size={10} /> Pendiente de aprobación
        </span>
      )}
    </Link>
  )
}

function PublicPencaCard({
  penca,
  onJoin,
  onOpen,
  joining,
  cta,
}: {
  penca: PublicPenca
  onJoin: () => void
  onOpen: () => void
  joining: boolean
  cta: string
}) {
  const { tenComp, competition, tenant } = penca
  const joinable = competition.status === 'active'
  const badge = NON_ACTIVE_BADGE[competition.status]
  return (
    <div className="card p-4 flex items-start justify-between gap-2">
      <button onClick={onOpen} className="min-w-0 text-left">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-text-primary truncate">{tenComp.name}</p>
          {badge && (
            <span className="badge bg-border text-text-muted text-[10px] flex-shrink-0">{badge}</span>
          )}
        </div>
        <p className="text-xs text-text-muted truncate">{competition.name} · {tenant.name}</p>
      </button>
      {joinable ? (
        <button onClick={onJoin} disabled={joining} className="btn-primary text-xs px-3 py-1.5 flex-shrink-0">
          {joining ? <Loader2 size={14} className="animate-spin" /> : cta}
        </button>
      ) : (
        <button
          onClick={onOpen}
          className="btn-ghost text-xs px-3 py-1.5 flex-shrink-0 border border-border inline-flex items-center gap-1"
          title="Solo visualización — esta penca aún no admite inscripciones"
        >
          <Eye size={13} /> Ver
        </button>
      )}
    </div>
  )
}

function Spinner() {
  return (
    <div className="flex justify-center py-12">
      <Loader2 className="animate-spin text-primary" size={26} />
    </div>
  )
}
