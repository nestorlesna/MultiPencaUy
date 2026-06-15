import { useState, useMemo, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Loader2, Search, ArrowLeft } from 'lucide-react'
import { RequireAdmin } from '../../components/auth/AuthGuard'
import { Modal } from '../../components/ui/Modal'
import { TeamFlag } from '../../components/ui/TeamFlag'
import { fetchMatches, fetchPhases, fetchStadiums, updateMatchData } from '../../services/v2/matchService'
import { fetchTeamsByCompetition } from '../../services/v2/teamService'
import type { MatchWithRelations } from '../../types/match'
import type { TeamWithGroup } from '../../services/teamService'
import { formatMatchDay, formatMatchTime } from '../../utils/datetime'

interface MatchEditInput {
  match_datetime: string   // ISO local datetime-local input value
  home_team_id: string | null
  away_team_id: string | null
  home_slot_label: string
  away_slot_label: string
  stadium_id: string
}

// ── Convierte UTC ISO a valor para <input type="datetime-local"> ─────────────
function toLocalInput(utcIso: string): string {
  const d = new Date(utcIso)
  // datetime-local necesita YYYY-MM-DDTHH:MM
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// ── Modal de edición ─────────────────────────────────────────────────────────
function EditMatchModal({
  match, teams, stadiums, onClose,
}: {
  match: MatchWithRelations | null
  teams: TeamWithGroup[]
  stadiums: { id: string; name: string; city: string }[]
  onClose: () => void
}) {
  const qc = useQueryClient()
  const [form, setForm] = useState<MatchEditInput>({
    match_datetime: '',
    home_team_id: null,
    away_team_id: null,
    home_slot_label: '',
    away_slot_label: '',
    stadium_id: '',
  })

  useEffect(() => {
    if (!match) return
    setForm({
      match_datetime: toLocalInput(match.match_datetime),
      home_team_id: match.home_team?.id ?? null,
      away_team_id: match.away_team?.id ?? null,
      home_slot_label: match.home_slot_label ?? '',
      away_slot_label: match.away_slot_label ?? '',
      stadium_id: match.stadium?.id ?? '',
    })
  }, [match?.id])

  const { mutate: save, isPending } = useMutation({
    mutationFn: async () => {
      if (!match) return
      await updateMatchData(match.id, {
        match_datetime: new Date(form.match_datetime).toISOString(),
        home_team_id: form.home_team_id || null,
        away_team_id: form.away_team_id || null,
        home_slot_label: form.home_slot_label.trim() || null,
        away_slot_label: form.away_slot_label.trim() || null,
      })
    },
    onSuccess: () => {
      toast.success(`Partido #${match?.match_number} actualizado`)
      qc.invalidateQueries({ queryKey: ['matches'] })
      onClose()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  function set<K extends keyof MatchEditInput>(key: K, val: MatchEditInput[K]) {
    setForm(f => ({ ...f, [key]: val }))
  }

  if (!match) return null

  const isKnockout = !match.group

  return (
    <Modal open={!!match} onClose={onClose} title={`Partido #${match.match_number}`} size="md">
      <div className="space-y-4">

        {/* Fecha y hora */}
        <div>
          <label className="block text-xs text-text-secondary mb-1.5">Fecha y hora (local del dispositivo)</label>
          <input
            type="datetime-local"
            value={form.match_datetime}
            onChange={e => set('match_datetime', e.target.value)}
            className="input"
          />
          <p className="text-[11px] text-text-muted mt-1">
            Se guarda en UTC. Hora actual del partido: {formatMatchDay(match.match_datetime)} {formatMatchTime(match.match_datetime)}
          </p>
        </div>

        {/* Equipos */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-text-secondary mb-1.5">Equipo local</label>
            <select
              value={form.home_team_id ?? ''}
              onChange={e => set('home_team_id', e.target.value || null)}
              className="input text-sm"
            >
              <option value="">— Sin asignar —</option>
              {teams.map(t => (
                <option key={t.id} value={t.id}>
                  {t.abbreviation} · {t.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-text-secondary mb-1.5">Equipo visitante</label>
            <select
              value={form.away_team_id ?? ''}
              onChange={e => set('away_team_id', e.target.value || null)}
              className="input text-sm"
            >
              <option value="">— Sin asignar —</option>
              {teams.map(t => (
                <option key={t.id} value={t.id}>
                  {t.abbreviation} · {t.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Slot labels (solo eliminatorias) */}
        {isKnockout && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-text-secondary mb-1.5">Slot local</label>
              <input
                type="text"
                value={form.home_slot_label}
                onChange={e => set('home_slot_label', e.target.value)}
                className="input font-mono text-sm"
                placeholder="ej: 1A, W73, 3ABCDF"
                maxLength={20}
              />
            </div>
            <div>
              <label className="block text-xs text-text-secondary mb-1.5">Slot visitante</label>
              <input
                type="text"
                value={form.away_slot_label}
                onChange={e => set('away_slot_label', e.target.value)}
                className="input font-mono text-sm"
                placeholder="ej: 2A, W74"
                maxLength={20}
              />
            </div>
          </div>
        )}

        {/* Estadio (solo info, no editable desde acá por simplicidad) */}
        <div>
          <label className="block text-xs text-text-secondary mb-1.5">Estadio</label>
          <select
            value={form.stadium_id}
            onChange={e => set('stadium_id', e.target.value)}
            className="input text-sm"
          >
            <option value="">— Seleccioná —</option>
            {stadiums.map(s => (
              <option key={s.id} value={s.id}>
                {s.name} · {s.city}
              </option>
            ))}
          </select>
        </div>

        <div className="flex gap-2 pt-1">
          <button
            className="btn-primary flex-1"
            onClick={() => save()}
            disabled={isPending || !form.match_datetime}
          >
            {isPending ? 'Guardando...' : 'Guardar'}
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
export function PartidosAdminPage() {
  const { id: competitionId = '' } = useParams()
  const [phaseOrder, setPhaseOrder] = useState(1)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<MatchWithRelations | null>(null)

  const { data: phases = [] } = useQuery({
    queryKey: ['v2', 'phases', competitionId],
    queryFn: () => fetchPhases(competitionId),
    enabled: !!competitionId,
  })
  const { data: matches = [], isLoading } = useQuery({
    queryKey: ['matches', competitionId, phaseOrder],
    queryFn: () => fetchMatches(competitionId, { phaseOrder }),
    enabled: !!competitionId,
    staleTime: 1000 * 60 * 5,
  })
  const { data: teams = [] } = useQuery({
    queryKey: ['teams_admin', competitionId],
    queryFn: () => fetchTeamsByCompetition(competitionId),
    enabled: !!competitionId,
    staleTime: 1000 * 60 * 10,
  })
  const { data: stadiums = [] } = useQuery({
    queryKey: ['stadiums', competitionId],
    queryFn: () => fetchStadiums(competitionId),
    enabled: !!competitionId,
    staleTime: Infinity,
  })

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    if (!q) return matches
    return matches.filter(m =>
      String(m.match_number).includes(q) ||
      (m.home_team?.name ?? m.home_slot_label ?? '').toLowerCase().includes(q) ||
      (m.away_team?.name ?? m.away_slot_label ?? '').toLowerCase().includes(q) ||
      (m.stadium?.city ?? '').toLowerCase().includes(q)
    )
  }, [matches, search])

  return (
    <RequireAdmin>
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
        <Link to={`/admin/competencias/${competitionId}`} className="inline-flex items-center gap-1.5 text-xs text-text-muted hover:text-text-primary transition-colors">
          <ArrowLeft size={14} /> Competencia
        </Link>
        <h1 className="text-xl font-bold text-text-primary">Partidos</h1>

        {/* Phase tabs */}
        <div className="flex gap-1 overflow-x-auto scrollbar-hide pb-1">
          {phases.map(p => (
            <button
              key={p.id}
              onClick={() => { setPhaseOrder(p.order); setSearch('') }}
              className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                phaseOrder === p.order
                  ? 'bg-primary text-white'
                  : 'bg-surface-2 text-text-secondary hover:text-text-primary'
              }`}
            >
              {p.name}
            </button>
          ))}
        </div>

        {/* Buscador */}
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por número, equipo o ciudad..."
            className="input pl-9"
          />
        </div>

        {isLoading && (
          <div className="flex justify-center py-16">
            <Loader2 className="animate-spin text-primary" size={28} />
          </div>
        )}

        {/* Lista */}
        <div className="space-y-2">
          {filtered.map(match => (
            <button
              key={match.id}
              onClick={() => setSelected(match)}
              className="card w-full p-3 hover:border-primary/40 transition-colors text-left"
            >
              {/* Línea superior: fase/grupo + número + fecha + hora + estadio */}
              <div className="flex items-center gap-1.5 flex-wrap mb-2.5">
                {match.group
                  ? <span className="badge-primary text-[10px] font-semibold uppercase tracking-wide">Grupo {match.group.name}</span>
                  : <span className="badge bg-accent/20 text-accent text-[10px] font-semibold uppercase tracking-wide">{match.phase.name}</span>
                }
                <span className="text-text-muted text-[11px]">#{match.match_number}</span>
                <span className="text-text-muted text-[11px]">·</span>
                <span className="text-text-secondary text-[11px]">{formatMatchDay(match.match_datetime)}</span>
                <span className="text-text-muted text-[11px]">·</span>
                <span className="text-text-secondary text-[11px] font-medium">{formatMatchTime(match.match_datetime)}</span>
                {match.stadium && (
                  <>
                    <span className="text-text-muted text-[11px]">·</span>
                    <span className="text-text-muted text-[11px] truncate">{match.stadium.city}</span>
                  </>
                )}
                {match.status === 'finished' && (
                  <span className="ml-auto badge bg-success/20 text-success text-[10px]">Final</span>
                )}
              </div>

              {/* Equipos */}
              <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <TeamFlag team={match.home_team} slotLabel={match.home_slot_label} size="sm" align="left" />
                </div>
                <span className="text-text-muted text-base font-light flex-shrink-0">vs</span>
                <div className="flex-1 min-w-0 flex justify-end">
                  <TeamFlag team={match.away_team} slotLabel={match.away_slot_label} size="sm" align="right" />
                </div>
              </div>
            </button>
          ))}

          {!isLoading && filtered.length === 0 && (
            <p className="text-text-muted text-sm text-center py-8">No hay partidos.</p>
          )}
        </div>
      </div>

      <EditMatchModal
        match={selected}
        teams={teams as TeamWithGroup[]}
        stadiums={stadiums}
        onClose={() => setSelected(null)}
      />
    </RequireAdmin>
  )
}
