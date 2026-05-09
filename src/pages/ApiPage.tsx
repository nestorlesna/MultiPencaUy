import { useState, useRef } from 'react'
import { ChevronDown, ChevronRight, AlertTriangle, Globe } from 'lucide-react'
import {
  CompetitionInfoCard, MatchesListCard, TeamsGridCard, StandingsCard,
  isWCCompetition, isWCMatchesData, isWCTeamsData, isWCStandingsData,
} from '../components/api/WCVisuals'

async function fetchPub(path: string, params?: Record<string, string>): Promise<unknown> {
  const qs = params ? '&' + new URLSearchParams(params).toString() : ''
  const res = await fetch(`/api/football-data-pub?path=${encodeURIComponent(path)}${qs}`)
  const data = await res.json()
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
  return data
}

// ── Lazy sub-section ─────────────────────────────────────────────────────────

interface SubSectionProps {
  title: string
  path: string
  params?: Record<string, string>
  renderVisual: (data: unknown) => React.ReactNode | null
}

function SubSection({ title, path, params, renderVisual }: SubSectionProps) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<unknown>(null)
  const [error, setError] = useState<string | null>(null)
  const fetched = useRef(false)

  async function toggle() {
    if (!open && !fetched.current) {
      fetched.current = true
      setLoading(true)
      setError(null)
      try {
        const result = await fetchPub(path, params)
        setData(result)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Error desconocido')
        fetched.current = false
      } finally {
        setLoading(false)
      }
    }
    setOpen(o => !o)
  }

  return (
    <div className="border border-border rounded-xl overflow-hidden">
      <button
        onClick={toggle}
        className="w-full flex items-center gap-3 px-4 py-3 bg-surface hover:bg-surface/80 transition-colors text-left"
      >
        {open ? <ChevronDown size={15} className="text-text-muted flex-shrink-0" /> : <ChevronRight size={15} className="text-text-muted flex-shrink-0" />}
        <span className="text-sm font-medium text-text-primary">{title}</span>
        {loading && (
          <span className="ml-auto text-[11px] text-text-muted animate-pulse">Cargando...</span>
        )}
      </button>

      {open && (
        <div className="px-4 pt-3 pb-1">
          {error && (
            <div className="flex items-center gap-2 text-sm text-red-400 bg-red-900/20 border border-red-800/40 rounded-lg px-3 py-2 mb-3">
              <AlertTriangle size={14} className="flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}
          {data !== null && !error && renderVisual(data)}
        </div>
      )}
    </div>
  )
}

// ── Outer provider section ────────────────────────────────────────────────────

interface ProviderSectionProps {
  name: string
  description: string
  website: string
  children: React.ReactNode
}

function ProviderSection({ name, description, website, children }: ProviderSectionProps) {
  const [open, setOpen] = useState(false)

  return (
    <div className="card overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-5 py-4 hover:bg-surface-2/50 transition-colors text-left"
      >
        {open ? <ChevronDown size={16} className="text-text-muted flex-shrink-0" /> : <ChevronRight size={16} className="text-text-muted flex-shrink-0" />}
        <div className="flex-1 min-w-0">
          <p className="text-base font-semibold text-text-primary">{name}</p>
          <p className="text-xs text-text-muted mt-0.5">{description}</p>
        </div>
        <a
          href={website}
          target="_blank"
          rel="noreferrer"
          onClick={e => e.stopPropagation()}
          className="flex items-center gap-1 text-[11px] text-primary/70 hover:text-primary transition-colors flex-shrink-0 ml-2"
        >
          <Globe size={12} />
          <span className="hidden sm:block">{website.replace(/^https?:\/\/(www\.)?/, '')}</span>
        </a>
      </button>

      {open && (
        <div className="px-5 pb-4 space-y-2 border-t border-border">
          <div className="pt-3 space-y-2">
            {children}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export function ApiPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">

      <div>
        <h1 className="text-xl font-bold text-text-primary mb-1">Información en tiempo real</h1>
        <p className="text-text-muted text-sm">Datos del Mundial 2026 obtenidos de fuentes externas</p>
      </div>

      {/* Disclaimer */}
      <div className="bg-amber-950/30 border border-amber-700/40 rounded-xl p-4 flex gap-3">
        <AlertTriangle size={18} className="text-accent flex-shrink-0 mt-0.5" />
        <div className="space-y-1.5">
          <p className="text-sm font-semibold text-accent">Información de carácter informativo</p>
          <p className="text-sm text-text-secondary leading-relaxed">
            Los datos que se muestran en esta sección provienen de <strong className="text-text-primary">servicios públicos de terceros</strong> y se ofrecen únicamente como referencia informativa. Pueden contener errores, demoras o diferir de la información oficial.
          </p>
          <p className="text-sm text-text-secondary leading-relaxed">
            <strong className="text-text-primary">No utilices estos datos para tomar decisiones en el juego.</strong> Los resultados oficiales de la penca son los cargados manualmente por los administradores, que son los únicos válidos para el cálculo de puntos y el ranking.
          </p>
        </div>
      </div>

      {/* Providers */}
      <ProviderSection
        name="Football-Data.org"
        description="Estadísticas, partidos, equipos y posiciones del Mundial 2026"
        website="https://www.football-data.org"
      >
        <SubSection
          title="Información del torneo"
          path="/competitions/WC"
          renderVisual={data => isWCCompetition(data) ? <CompetitionInfoCard data={data} /> : null}
        />
        <SubSection
          title="Partidos programados"
          path="/competitions/WC/matches"
          renderVisual={data => isWCMatchesData(data) ? <MatchesListCard data={data} /> : null}
        />
        <SubSection
          title="Selecciones participantes"
          path="/competitions/WC/teams"
          renderVisual={data => isWCTeamsData(data) ? <TeamsGridCard data={data} /> : null}
        />
        <SubSection
          title="Posiciones en grupos"
          path="/competitions/WC/standings"
          renderVisual={data => isWCStandingsData(data) ? <StandingsCard data={data} /> : null}
        />
      </ProviderSection>

    </div>
  )
}
