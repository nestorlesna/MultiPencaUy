import { useState } from 'react'
import { ChevronDown, ChevronUp, Play, Copy, Check, RefreshCw, ExternalLink } from 'lucide-react'
import { RequireAdmin } from '../../components/auth/AuthGuard'
import { supabase } from '../../lib/supabase'

export function ResultAutoPage() {
  return (
    <RequireAdmin>
      <ResultAutoContent />
    </RequireAdmin>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getToken(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) throw new Error('Sin sesión activa')
  return session.access_token
}

async function callProxy(
  proxy: string,
  path: string,
  params: Record<string, string> = {}
): Promise<unknown> {
  const token = await getToken()
  const qs = new URLSearchParams({ path, ...params }).toString()
  const res = await fetch(`/api/${proxy}?${qs}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  return res.json()
}

function formatJson(data: unknown): string {
  return JSON.stringify(data, null, 2)
}

// ── JSON Viewer ───────────────────────────────────────────────────────────────

function JsonResult({ data, loading, error }: {
  data: unknown
  loading: boolean
  error: string | null
}) {
  const [copied, setCopied] = useState(false)

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-text-muted text-sm py-6 justify-center">
        <RefreshCw size={14} className="animate-spin" />
        Consultando API...
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-900/20 border border-red-800/40 rounded-lg p-3 text-red-400 text-sm">
        {error}
      </div>
    )
  }

  if (data === null) {
    return (
      <p className="text-text-muted text-sm text-center py-4">
        Elegí una consulta o escribí un endpoint custom y presioná Ejecutar.
      </p>
    )
  }

  const json = formatJson(data)

  function copy() {
    navigator.clipboard.writeText(json)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="relative">
      <button
        onClick={copy}
        className="absolute top-2 right-2 flex items-center gap-1 text-xs text-text-muted hover:text-text-primary transition-colors bg-surface px-2 py-1 rounded"
      >
        {copied ? <Check size={12} /> : <Copy size={12} />}
        {copied ? 'Copiado' : 'Copiar'}
      </button>
      <pre className="bg-background border border-border rounded-lg p-4 text-xs text-text-secondary overflow-auto max-h-[500px] leading-relaxed">
        {json}
      </pre>
    </div>
  )
}

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface Preset {
  label: string
  path: string
  params?: Record<string, string>
}

interface ApiSectionProps {
  title: string
  color: string        // clase tailwind para el badge
  docsUrl: string
  proxy: string
  presets: Preset[]
  defaultPath: string
  defaultParams?: string  // "key=val&key2=val2"
  description: string
}

// ── Sección genérica por API ──────────────────────────────────────────────────

function ApiSection({
  title, color, docsUrl, proxy, presets, defaultPath, defaultParams = '', description,
}: ApiSectionProps) {
  const [open, setOpen]         = useState(true)
  const [path, setPath]         = useState(defaultPath)
  const [params, setParams]     = useState(defaultParams)
  const [loading, setLoading]   = useState(false)
  const [result, setResult]     = useState<unknown>(null)
  const [error, setError]       = useState<string | null>(null)

  async function run(overridePath?: string, overrideParams?: Record<string, string>) {
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const p = overridePath ?? path
      const extraParams = overrideParams ?? parseParams(params)
      const data = await callProxy(proxy, p, extraParams)
      setResult(data)
      if (overridePath) setPath(overridePath)
      if (overrideParams) setParams(new URLSearchParams(overrideParams).toString())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error desconocido')
    } finally {
      setLoading(false)
    }
  }

  function parseParams(raw: string): Record<string, string> {
    const result: Record<string, string> = {}
    try {
      new URLSearchParams(raw).forEach((v, k) => { result[k] = v })
    } catch { /* ignore */ }
    return result
  }

  return (
    <div className="card overflow-hidden">
      {/* Header de sección */}
      <button
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-surface-2 transition-colors"
        onClick={() => setOpen(o => !o)}
      >
        <div className="flex items-center gap-3">
          <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${color}`}>
            {title}
          </span>
          <span className="text-text-muted text-sm">{description}</span>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={docsUrl}
            target="_blank"
            rel="noreferrer"
            onClick={e => e.stopPropagation()}
            className="text-text-muted hover:text-primary transition-colors"
            title="Ver documentación"
          >
            <ExternalLink size={13} />
          </a>
          {open ? <ChevronUp size={16} className="text-text-muted" /> : <ChevronDown size={16} className="text-text-muted" />}
        </div>
      </button>

      {open && (
        <div className="px-5 pb-5 space-y-4 border-t border-border pt-4">

          {/* Presets */}
          <div>
            <p className="text-[11px] text-text-muted uppercase tracking-wide mb-2">Consultas rápidas</p>
            <div className="flex flex-wrap gap-2">
              {presets.map(preset => (
                <button
                  key={preset.label}
                  onClick={() => run(preset.path, preset.params ?? {})}
                  disabled={loading}
                  className="text-xs px-3 py-1.5 rounded-lg bg-surface-2 border border-border text-text-secondary hover:border-primary/50 hover:text-text-primary transition-colors disabled:opacity-50"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* Endpoint custom */}
          <div className="space-y-2">
            <p className="text-[11px] text-text-muted uppercase tracking-wide">Consulta manual</p>
            <div className="flex gap-2">
              <div className="flex-1 space-y-2">
                <input
                  type="text"
                  value={path}
                  onChange={e => setPath(e.target.value)}
                  placeholder="Endpoint, ej: /competitions/WC/matches"
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary/60 font-mono"
                />
                <input
                  type="text"
                  value={params}
                  onChange={e => setParams(e.target.value)}
                  placeholder="Params opcionales, ej: status=FINISHED&matchday=1"
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary/60 font-mono"
                />
              </div>
              <button
                onClick={() => run()}
                disabled={loading || !path.trim()}
                className="btn-primary flex items-center gap-1.5 px-4 self-start"
              >
                {loading
                  ? <RefreshCw size={14} className="animate-spin" />
                  : <Play size={14} />
                }
                Ejecutar
              </button>
            </div>
          </div>

          {/* Resultado */}
          <JsonResult data={result} loading={loading} error={error} />
        </div>
      )}
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────

function ResultAutoContent() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">

      {/* Título */}
      <div>
        <h1 className="text-xl font-bold text-text-primary">Resultados Automáticos</h1>
        <p className="text-text-muted text-sm mt-1">
          Consulta de APIs externas de fútbol · Solo lectura · No afecta datos de la penca
        </p>
      </div>

      {/* API 1 — football-data.org */}
      <ApiSection
        title="football-data.org"
        color="bg-blue-900/40 text-blue-300 border border-blue-800/40"
        docsUrl="https://docs.football-data.org/general/v4/"
        proxy="football-data"
        description="API REST v4 · Competiciones, partidos, equipos, posiciones"
        defaultPath="/competitions/WC/matches"
        defaultParams="status=SCHEDULED"
        presets={[
          { label: 'Info competición WC',   path: '/competitions/WC' },
          { label: 'Partidos programados',  path: '/competitions/WC/matches', params: { status: 'SCHEDULED' } },
          { label: 'Partidos jugados',      path: '/competitions/WC/matches', params: { status: 'FINISHED' } },
          { label: 'Equipos WC',            path: '/competitions/WC/teams' },
          { label: 'Posiciones grupos',     path: '/competitions/WC/standings' },
          { label: 'Próximos partidos',     path: '/matches', params: { competitions: 'WC', status: 'SCHEDULED' } },
        ]}
      />

      {/* API 2 — api-football.com */}
      <ApiSection
        title="api-football.com"
        color="bg-green-900/40 text-green-300 border border-green-800/40"
        docsUrl="https://www.api-football.com/documentation-v3"
        proxy="api-football"
        description="v3.football.api-sports.io · Fixtures, ligas, equipos, jugadores, estadísticas"
        defaultPath="/leagues"
        defaultParams="name=FIFA World Cup&season=2026"
        presets={[
          { label: 'Liga Mundial 2026',      path: '/leagues',   params: { name: 'FIFA World Cup', season: '2026' } },
          { label: 'Fixtures hoy',           path: '/fixtures',  params: { date: new Date().toISOString().slice(0, 10) } },
          { label: 'Estado cuenta',          path: '/status' },
          { label: 'Ligas en vivo',          path: '/leagues',   params: { current: 'true' } },
          { label: 'Equipos (liga 1)',        path: '/teams',     params: { league: '1', season: '2026' } },
          { label: 'Fixtures (liga 1)',       path: '/fixtures',  params: { league: '1', season: '2026' } },
        ]}
      />

      {/* API 3 — thesportsdb.com */}
      <ApiSection
        title="thesportsdb.com"
        color="bg-purple-900/40 text-purple-300 border border-purple-800/40"
        docsUrl="https://www.thesportsdb.com/api.php"
        proxy="sportsdb"
        description="API v1 · Eventos, equipos, ligas, jugadores, imágenes"
        defaultPath="/searchleagues.php"
        defaultParams="c=Soccer&l=FIFA World Cup"
        presets={[
          { label: 'Buscar liga WC',        path: '/searchleagues.php', params: { c: 'Soccer', l: 'FIFA World Cup' } },
          { label: 'Eventos hoy (Fútbol)',   path: '/eventsday.php',    params: { d: new Date().toISOString().slice(0, 10), s: 'Soccer' } },
          { label: 'Buscar equipo Uruguay', path: '/searchteams.php',  params: { t: 'Uruguay' } },
          { label: 'Buscar equipo Brasil',  path: '/searchteams.php',  params: { t: 'Brazil' } },
          { label: 'Deporte Soccer (id)',   path: '/all_sports.php' },
          { label: 'Países disponibles',    path: '/all_countries.php' },
        ]}
      />
    </div>
  )
}
