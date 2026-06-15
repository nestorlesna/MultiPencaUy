import { useQuery } from '@tanstack/react-query'
import { Navigate, Link, useParams } from 'react-router-dom'
import {
  Loader2, ArrowLeft, Trophy, Flag, CalendarDays, Medal, ListOrdered, Shuffle, Radio,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { fetchCompetition } from '../../services/v2/adminService'

interface ToolLink {
  slug: string
  label: string
  desc: string
  icon: LucideIcon
}

// Herramientas del catálogo deportivo, scopeadas a la competencia.
const CATALOG_TOOLS: ToolLink[] = [
  { slug: 'equipos', label: 'Equipos', desc: 'Catálogo de equipos y banderas', icon: Flag },
  { slug: 'partidos', label: 'Partidos', desc: 'Edición de partidos y sedes', icon: CalendarDays },
  { slug: 'terceros', label: 'Mejores terceros', desc: 'Ranking de terceros (overrides)', icon: Medal },
  { slug: 'posiciones-grupos', label: 'Posiciones de grupos', desc: 'Ajuste manual de posiciones', icon: ListOrdered },
  { slug: 'combinaciones', label: 'Combinaciones 16avos', desc: 'Tabla FIFA de cruces', icon: Shuffle },
  { slug: 'resultauto', label: 'Resultados Auto', desc: 'Consulta a APIs externas (solo lectura)', icon: Radio },
]

export function CompetenciaDetailPage() {
  const { id = '' } = useParams()
  const { user, loading, isSuperAdmin } = useAuth()

  const { data: comp, isLoading } = useQuery({
    queryKey: ['v2', 'competition', id],
    queryFn: () => fetchCompetition(id),
    enabled: isSuperAdmin && !!id,
  })

  if (loading) return null
  if (!user) return <Navigate to="/auth" replace />
  if (!isSuperAdmin) return <Navigate to="/" replace />

  if (isLoading) {
    return <div className="flex justify-center py-16"><Loader2 className="animate-spin text-primary" size={28} /></div>
  }
  if (!comp) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
        <BackLink />
        <p className="text-text-muted text-sm">No se encontró la competencia.</p>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      <BackLink />

      <div className="flex items-center gap-2">
        <Trophy size={20} className="text-primary" />
        <div>
          <h1 className="text-xl font-bold text-text-primary">{comp.name}</h1>
          <p className="text-xs text-text-muted">
            {comp.sport}{comp.season ? ` · ${comp.season}` : ''}
            {comp.advancement_engine ? ` · motor: ${comp.advancement_engine}` : ''}
          </p>
        </div>
      </div>

      <section>
        <h2 className="text-xs font-semibold text-text-muted uppercase tracking-widest mb-3">
          Catálogo deportivo
        </h2>
        <div className="grid sm:grid-cols-2 gap-3">
          {CATALOG_TOOLS.map(t => <ToolCard key={t.slug} tool={t} competitionId={comp.id} />)}
        </div>
      </section>
    </div>
  )
}

function BackLink() {
  return (
    <Link to="/admin/competencias" className="inline-flex items-center gap-1.5 text-xs text-text-muted hover:text-text-primary transition-colors">
      <ArrowLeft size={14} /> Competencias
    </Link>
  )
}

function ToolCard({ tool, competitionId }: { tool: ToolLink; competitionId: string }) {
  const { icon: Icon, slug, label, desc } = tool
  const to = `/admin/competencias/${competitionId}/${slug}`
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
