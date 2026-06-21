import { Navigate, Link } from 'react-router-dom'
import {
  Building2, Trophy, UploadCloud, Users, Shield, ScrollText, LayoutGrid, Trash2,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'

interface AdminLink {
  to: string
  label: string
  desc: string
  icon: LucideIcon
}

// ── Plataforma (super-admin) ──
const EMPRESAS: AdminLink = { to: '/admin/tenants', label: 'Empresas (tenants)', desc: 'Alta de empresas y asignación de admins/cargadores', icon: Building2 }
const COMPETENCIAS: AdminLink = { to: '/admin/competencias', label: 'Competencias', desc: 'Catálogo deportivo: equipos, partidos y resultados', icon: Trophy }
const CARGAR_RESULTADOS: AdminLink = { to: '/admin/resultados-v2', label: 'Cargar resultados', desc: 'Selector de competencia y carga de resultados', icon: UploadCloud }

// ── Utilidades globales (super-admin) ──
const OTROS_LINKS: AdminLink[] = [
  { to: '/admin/usuarios', label: 'Usuarios', desc: 'Gestión global de usuarios', icon: Users },
  { to: '/admin/auditoria', label: 'Auditoría', desc: 'Historial de cambios de predicciones', icon: ScrollText },
  { to: '/admin/limpieza', label: 'Limpieza de datos', desc: 'Borrado físico de competencias y tenants', icon: Trash2 },
]

export function AdminHubPage() {
  const { user, loading, isSuperAdmin, isAdmin, isLoader } = useAuth()

  if (loading) return null
  if (!user) return <Navigate to="/auth" replace />
  if (!isSuperAdmin && !isAdmin && !isLoader) return <Navigate to="/" replace />

  // Empresas y Competencias son del super-admin; cargar resultados también lo ve admin/loader.
  const platformLinks: AdminLink[] = []
  if (isSuperAdmin) platformLinks.push(EMPRESAS, COMPETENCIAS)
  if (isSuperAdmin || isAdmin || isLoader) platformLinks.push(CARGAR_RESULTADOS)

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-7">
      <div className="flex items-center gap-2">
        <Shield size={22} className="text-accent" />
        <h1 className="text-xl font-bold text-text-primary">Administración</h1>
      </div>

      {platformLinks.length > 0 && (
        <Section title="Plataforma" icon={LayoutGrid}>
          {platformLinks.map(l => <AdminCard key={l.to} link={l} />)}
        </Section>
      )}

      {isSuperAdmin && (
        <Section title="Utilidades">
          {OTROS_LINKS.map(l => <AdminCard key={l.to} link={l} />)}
        </Section>
      )}
    </div>
  )
}

function Section({ title, icon: Icon, children }: { title: string; icon?: LucideIcon; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-xs font-semibold text-text-muted uppercase tracking-widest mb-3 flex items-center gap-1.5">
        {Icon && <Icon size={13} />} {title}
      </h2>
      <div className="grid sm:grid-cols-2 gap-3">{children}</div>
    </section>
  )
}

function AdminCard({ link }: { link: AdminLink }) {
  const { icon: Icon, to, label, desc } = link
  return (
    <Link to={to} className="card p-4 flex items-start gap-3 hover:border-primary/40 transition-colors group">
      <div className="w-9 h-9 rounded-lg bg-surface-2 flex items-center justify-center flex-shrink-0 group-hover:bg-primary/10 transition-colors">
        <Icon size={18} className="text-text-secondary group-hover:text-primary transition-colors" />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-medium text-text-primary">{label}</p>
        <p className="text-xs text-text-muted">{desc}</p>
      </div>
    </Link>
  )
}
