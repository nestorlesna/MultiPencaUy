import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Navigate, Link, useParams, useNavigate } from 'react-router-dom'
import {
  Loader2, ArrowLeft, Trophy, Flag, CalendarDays, Medal, ListOrdered, Shuffle, Radio, Copy,
} from 'lucide-react'
import { toast } from 'sonner'
import type { LucideIcon } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { fetchCompetition, cloneCompetition } from '../../services/v2/adminService'
import { Modal } from '../../components/ui/Modal'

interface ToolLink {
  slug: string
  label: string
  desc: string
  icon: LucideIcon
}

const CATALOG_TOOLS: ToolLink[] = [
  { slug: 'equipos',           label: 'Equipos',               desc: 'Catálogo de equipos y banderas',       icon: Flag },
  { slug: 'partidos',          label: 'Partidos',               desc: 'Edición de partidos y sedes',          icon: CalendarDays },
  { slug: 'terceros',          label: 'Mejores terceros',       desc: 'Ranking de terceros (overrides)',       icon: Medal },
  { slug: 'posiciones-grupos', label: 'Posiciones de grupos',   desc: 'Ajuste manual de posiciones',          icon: ListOrdered },
  { slug: 'combinaciones',     label: 'Combinaciones 16avos',   desc: 'Tabla FIFA de cruces',                 icon: Shuffle },
  { slug: 'resultauto',        label: 'Resultados Auto',        desc: 'Consulta a APIs externas (solo lectura)', icon: Radio },
]

// ── Modal de clonación ───────────────────────────────────────────────────────
function CloneModal({
  open,
  competitionName,
  onClose,
  onClone,
}: {
  open: boolean
  competitionName: string
  onClose: () => void
  onClone: (name: string, startDate: string, mirror: boolean) => void
}) {
  const [name, setName] = useState(`${competitionName} (copia)`)
  const [startDate, setStartDate] = useState('')
  const [mirror, setMirror] = useState(false)

  function handleSubmit() {
    if (!name.trim()) { toast.error('Ingresá un nombre'); return }
    if (!startDate)   { toast.error('Ingresá la fecha de inicio'); return }
    onClone(name.trim(), startDate, mirror)
  }

  return (
    <Modal open={open} onClose={onClose} title="Clonar competencia" size="sm">
      <div className="space-y-4">

        <div>
          <label className="block text-xs text-text-secondary mb-1.5">Nombre de la nueva competencia</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            className="input"
            placeholder="Ej: Clausura UY 2026"
            maxLength={100}
          />
        </div>

        <div>
          <label className="block text-xs text-text-secondary mb-1.5">
            Fecha de inicio — Jornada 1
          </label>
          <input
            type="date"
            value={startDate}
            onChange={e => setStartDate(e.target.value)}
            className="input"
          />
          <p className="text-[11px] text-text-muted mt-1">
            La jornada 1 se agenda en esta fecha. Cada jornada posterior se suma 7 días.
          </p>
        </div>

        <label className="flex items-start gap-3 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={mirror}
            onChange={e => setMirror(e.target.checked)}
            className="mt-0.5 accent-primary w-4 h-4 flex-shrink-0"
          />
          <span className="text-sm text-text-primary">
            Espejo — invertir local/visitante
            <span className="block text-xs text-text-muted mt-0.5">
              Si un equipo era local pasa a ser visitante, y viceversa.
            </span>
          </span>
        </label>

        <div className="flex gap-2 pt-1">
          <button className="btn-primary flex-1" onClick={handleSubmit}>
            Clonar
          </button>
          <button className="btn-ghost flex-1 border border-border" onClick={onClose}>
            Cancelar
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ── Página principal ─────────────────────────────────────────────────────────
export function CompetenciaDetailPage() {
  const { id = '' } = useParams()
  const { user, loading, isSuperAdmin } = useAuth()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [cloneOpen, setCloneOpen] = useState(false)

  const { data: comp, isLoading } = useQuery({
    queryKey: ['v2', 'competition', id],
    queryFn: () => fetchCompetition(id),
    enabled: isSuperAdmin && !!id,
  })

  const { mutate: doClone, isPending: cloning } = useMutation({
    mutationFn: ({ name, startDate, mirror }: { name: string; startDate: string; mirror: boolean }) =>
      cloneCompetition(id, { name, startDate, mirror }),
    onSuccess: (newComp) => {
      toast.success(`Competencia "${newComp.name}" creada`)
      qc.invalidateQueries({ queryKey: ['v2', 'competitions'] })
      setCloneOpen(false)
      navigate(`/admin/competencias/${newComp.id}`)
    },
    onError: (e: Error) => toast.error(e.message),
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

      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Trophy size={20} className="text-primary flex-shrink-0" />
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-text-primary">{comp.name}</h1>
            <p className="text-xs text-text-muted">
              {comp.sport}{comp.season ? ` · ${comp.season}` : ''}
              {comp.advancement_engine ? ` · motor: ${comp.advancement_engine}` : ''}
            </p>
          </div>
        </div>

        <button
          onClick={() => setCloneOpen(true)}
          disabled={cloning}
          className="btn-ghost flex items-center gap-1.5 text-xs border border-border px-3 py-2 flex-shrink-0"
          title="Clonar competencia"
        >
          {cloning
            ? <Loader2 size={14} className="animate-spin" />
            : <Copy size={14} />
          }
          Clonar
        </button>
      </div>

      <section>
        <h2 className="text-xs font-semibold text-text-muted uppercase tracking-widest mb-3">
          Catálogo deportivo
        </h2>
        <div className="grid sm:grid-cols-2 gap-3">
          {CATALOG_TOOLS.map(t => <ToolCard key={t.slug} tool={t} competitionId={comp.id} />)}
        </div>
      </section>

      <CloneModal
        open={cloneOpen}
        competitionName={comp.name}
        onClose={() => setCloneOpen(false)}
        onClone={(name, startDate, mirror) => doClone({ name, startDate, mirror })}
      />
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
