import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { Loader2, Trophy, Globe, KeyRound, Clock, ArrowRight, ShieldCheck, Building2 } from 'lucide-react'
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
import type { MyPenca, PublicPenca } from '../types/tenant'

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
    queryFn: () => (user ? fetchMyTenComps(user.id) : Promise.resolve([])),
    enabled: !!user,
  })

  const { data: publicPencas = [], isLoading: loadingPublic } = useQuery({
    queryKey: ['public_ten_comps'],
    queryFn: fetchPublicTenComps,
  })

  const myIds = useMemo(() => new Set(myPencas.map(p => p.tenComp.id)), [myPencas])
  const explorable = publicPencas.filter(p => !myIds.has(p.tenComp.id))

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

  if (!user) {
    return (
      <div className="card p-8 text-center">
        <Trophy size={32} className="text-text-muted mx-auto mb-3" />
        <p className="text-text-muted text-sm mb-4">Iniciá sesión para ver y unirte a tus pencas.</p>
        <Link to="/auth" className="btn-primary text-sm">Ingresar</Link>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Trophy size={20} className="text-primary" />
          <h1 className="text-xl font-bold text-text-primary">Mis pencas</h1>
        </div>
        <button
          onClick={() => { setShowJoin(true); setCode('') }}
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

      {/* Mis pencas */}
      {loadingMine ? (
        <Spinner />
      ) : myPencas.length === 0 ? (
        <div className="card p-8 text-center">
          <p className="text-text-muted text-sm">
            Todavía no participás en ninguna penca. Explorá las públicas o unite con un código.
          </p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {myPencas.map(p => <MyPencaCard key={p.tenComp.id} penca={p} />)}
        </div>
      )}

      {/* Explorar públicas */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Globe size={16} className="text-text-secondary" />
          <h2 className="text-sm font-semibold text-text-secondary">Pencas públicas</h2>
        </div>
        {loadingPublic ? (
          <Spinner />
        ) : explorable.length === 0 ? (
          <p className="text-xs text-text-muted">No hay pencas públicas nuevas para explorar.</p>
        ) : (
          <div className="grid sm:grid-cols-2 gap-3">
            {explorable.map(p => (
              <PublicPencaCard
                key={p.tenComp.id}
                penca={p}
                joining={joinPublicMut.isPending}
                onJoin={() => joinPublicMut.mutate(p.tenComp.id)}
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

function PublicPencaCard({ penca, onJoin, joining }: { penca: PublicPenca; onJoin: () => void; joining: boolean }) {
  const { tenComp, competition, tenant } = penca
  return (
    <div className="card p-4 flex items-start justify-between gap-2">
      <div className="min-w-0">
        <p className="text-sm font-medium text-text-primary truncate">{tenComp.name}</p>
        <p className="text-xs text-text-muted truncate">{competition.name} · {tenant.name}</p>
      </div>
      <button onClick={onJoin} disabled={joining} className="btn-primary text-xs px-3 py-1.5 flex-shrink-0">
        {joining ? <Loader2 size={14} className="animate-spin" /> : 'Unirme'}
      </button>
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
