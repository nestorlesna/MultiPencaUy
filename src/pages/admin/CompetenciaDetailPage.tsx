import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Navigate, Link, useParams, useNavigate } from 'react-router-dom'
import {
  Loader2, ArrowLeft, ArrowRight, Trophy, Flag, CalendarDays, Medal, ListOrdered, Shuffle, Radio, Copy,
} from 'lucide-react'
import { toast } from 'sonner'
import type { LucideIcon } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { fetchCompetition, cloneCompetition, createPublicoTenComp } from '../../services/v2/adminService'
import { fetchTeamsByCompetition } from '../../services/v2/teamService'
import type { TeamWithGroup } from '../../services/teamService'
import { Modal } from '../../components/ui/Modal'

type TeamOverride = { name: string; abbreviation: string; flag_url: string }
type CloneArgs = {
  name: string
  startDate: string
  mirror: boolean
  teamMap: Record<string, { name: string; abbreviation: string; flag_url: string | null }>
}

interface ToolLink {
  slug: string
  label: string
  desc: string
  icon: LucideIcon
  /** Solo aplica a torneos con grupos + eliminatoria (motor de avance). */
  requiresEngine?: boolean
}

const CATALOG_TOOLS: ToolLink[] = [
  { slug: 'equipos',           label: 'Equipos',               desc: 'Catálogo de equipos y banderas',       icon: Flag },
  { slug: 'partidos',          label: 'Partidos',               desc: 'Edición de partidos y sedes',          icon: CalendarDays },
  { slug: 'terceros',          label: 'Mejores terceros',       desc: 'Ranking de terceros (overrides)',       icon: Medal,       requiresEngine: true },
  { slug: 'posiciones-grupos', label: 'Posiciones de grupos',   desc: 'Ajuste manual de posiciones',          icon: ListOrdered, requiresEngine: true },
  { slug: 'combinaciones',     label: 'Combinaciones 16avos',   desc: 'Tabla FIFA de cruces',                 icon: Shuffle,     requiresEngine: true },
  { slug: 'resultauto',        label: 'Resultados Auto',        desc: 'Consulta a APIs externas (solo lectura)', icon: Radio },
]

// ── Modal de clonación ───────────────────────────────────────────────────────
function CloneModal({
  open,
  competitionId,
  competitionName,
  onClose,
  onClone,
}: {
  open: boolean
  competitionId: string
  competitionName: string
  onClose: () => void
  onClone: (args: CloneArgs) => void
}) {
  const [name, setName] = useState(`${competitionName} (copia)`)
  const [startDate, setStartDate] = useState('')
  const [mirror, setMirror] = useState(false)
  // Solo guardamos lo que el usuario edita; el valor mostrado cae al original del
  // equipo (así no hace falta inicializar estado con un efecto).
  const [edits, setEdits] = useState<Record<string, Partial<TeamOverride>>>({})

  const { data: teams = [], isLoading: teamsLoading } = useQuery({
    queryKey: ['teams_admin', competitionId],
    queryFn: () => fetchTeamsByCompetition(competitionId),
    enabled: open && !!competitionId,
    staleTime: 1000 * 60 * 10,
  })

  function effective(t: TeamWithGroup): TeamOverride {
    const e = edits[t.id]
    return {
      name: e?.name ?? t.name,
      abbreviation: e?.abbreviation ?? t.abbreviation,
      flag_url: e?.flag_url ?? (t.flag_url ?? ''),
    }
  }

  function setField(teamId: string, field: keyof TeamOverride, value: string) {
    setEdits(prev => ({ ...prev, [teamId]: { ...prev[teamId], [field]: value } }))
  }

  function handleSubmit() {
    if (!name.trim())   { toast.error('Ingresá un nombre'); return }
    if (!startDate)     { toast.error('Ingresá la fecha de inicio'); return }
    if (teamsLoading || teams.length === 0) { toast.error('Esperá a que carguen los equipos'); return }

    const list = (teams as TeamWithGroup[]).map(t => ({ t, ov: effective(t) }))
    if (list.some(({ ov }) => !ov.name.trim() || !ov.abbreviation.trim())) {
      toast.error('Completá nombre y abreviatura de todos los equipos')
      return
    }
    const abbrs = list.map(({ ov }) => ov.abbreviation.trim().toUpperCase())
    if (new Set(abbrs).size !== abbrs.length) {
      toast.error('Las abreviaturas deben ser únicas')
      return
    }

    const teamMap: CloneArgs['teamMap'] = {}
    for (const { t, ov } of list) {
      teamMap[t.id] = {
        name: ov.name.trim(),
        abbreviation: ov.abbreviation.trim().toUpperCase(),
        flag_url: ov.flag_url.trim() || null,
      }
    }
    onClone({ name: name.trim(), startDate, mirror, teamMap })
  }

  return (
    <Modal open={open} onClose={onClose} title="Clonar competencia" size="xl">
      <div className="space-y-4">

        <div className="grid sm:grid-cols-2 gap-3">
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
            <label className="block text-xs text-text-secondary mb-1.5">Fecha de inicio — Jornada 1</label>
            <input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="input"
            />
          </div>
        </div>
        <p className="text-[11px] text-text-muted -mt-2">
          La jornada 1 se agenda en esa fecha; cada jornada posterior se suma 7 días.
        </p>

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

        {/* Transformación de equipos */}
        <div>
          <h3 className="text-xs font-semibold text-text-primary mb-1">Equipos de la nueva competencia</h3>
          <p className="text-[11px] text-text-muted mb-2">
            Izquierda: equipo actual. Derecha: cómo se llamará en la copia. La estructura
            (series/grupos y fixture) se mantiene; solo cambia la identidad de cada equipo.
          </p>

          {teamsLoading && (
            <div className="flex justify-center py-8"><Loader2 className="animate-spin text-primary" size={22} /></div>
          )}

          {!teamsLoading && (
            <div className="max-h-[42vh] overflow-y-auto space-y-2 pr-1">
              {(teams as TeamWithGroup[]).map(t => {
                const ov = effective(t)
                return (
                  <div key={t.id} className="rounded-lg border border-border p-2.5">
                    {/* Original */}
                    <div className="flex items-center gap-2 text-xs mb-2">
                      {t.flag_url
                        ? <img src={t.flag_url} alt="" className="w-5 h-5 object-contain flex-shrink-0" />
                        : <span className="w-5 h-5 flex-shrink-0" />}
                      <span className="font-semibold text-text-primary">{t.abbreviation}</span>
                      <span className="text-text-muted truncate">{t.name}</span>
                      {t.group && (
                        <span className="ml-auto badge-primary text-[10px] font-semibold uppercase tracking-wide">
                          Grupo {t.group.name}
                        </span>
                      )}
                      <ArrowRight size={13} className="text-text-muted flex-shrink-0" />
                    </div>
                    {/* Destino */}
                    <div className="grid grid-cols-3 gap-2">
                      <input
                        type="text"
                        value={ov.name}
                        onChange={e => setField(t.id, 'name', e.target.value)}
                        className="input text-sm col-span-2"
                        placeholder="Nombre"
                        maxLength={100}
                      />
                      <input
                        type="text"
                        value={ov.abbreviation}
                        onChange={e => setField(t.id, 'abbreviation', e.target.value.toUpperCase())}
                        className="input text-sm uppercase"
                        placeholder="ABR"
                        maxLength={3}
                      />
                    </div>
                    <input
                      type="text"
                      value={ov.flag_url}
                      onChange={e => setField(t.id, 'flag_url', e.target.value)}
                      className="input text-sm mt-2"
                      placeholder="URL del escudo (opcional)"
                      maxLength={255}
                    />
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="flex gap-2 pt-1">
          <button className="btn-primary flex-1" onClick={handleSubmit} disabled={teamsLoading}>
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
    mutationFn: async (args: CloneArgs) => {
      const newComp = await cloneCompetition(id, args)
      // Al clonar, siempre crear una penca pública en el tenant "Publico".
      // Si falla, no se revierte la competencia ya creada: se avisa.
      let publicoSlug: string | null = null
      let publicoError: string | null = null
      try {
        const r = await createPublicoTenComp(newComp)
        publicoSlug = r?.slug ?? null
        if (!r) publicoError = 'no se encontró el tenant Publico'
      } catch (e) {
        publicoError = (e as Error).message
      }
      return { newComp, publicoSlug, publicoError }
    },
    onSuccess: ({ newComp, publicoSlug, publicoError }) => {
      toast.success(`Competencia "${newComp.name}" creada`)
      if (publicoSlug) toast.success(`Penca pública creada en Publico: /p/${publicoSlug}`)
      else if (publicoError) toast.error(`Competencia creada, pero no se creó la penca en Publico: ${publicoError}`)
      qc.invalidateQueries({ queryKey: ['v2', 'competitions'] })
      qc.invalidateQueries({ queryKey: ['v2', 'tenant-ten-comps'] })
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
          {CATALOG_TOOLS
            .filter(t => !t.requiresEngine || !!comp.advancement_engine)
            .map(t => <ToolCard key={t.slug} tool={t} competitionId={comp.id} />)}
        </div>
      </section>

      <CloneModal
        open={cloneOpen}
        competitionId={comp.id}
        competitionName={comp.name}
        onClose={() => setCloneOpen(false)}
        onClone={(args) => doClone(args)}
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
