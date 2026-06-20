import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Loader2, Search, ArrowLeft, Plus, Trash2 } from 'lucide-react'
import { RequireAdmin } from '../../components/auth/AuthGuard'
import { Modal } from '../../components/ui/Modal'
import { TeamFlag } from '../../components/ui/TeamFlag'
import { fetchMatches, fetchPhases, fetchStadiums, fetchGroups, fetchRounds, updateMatchData, createMatch, deleteMatch } from '../../services/v2/matchService'
import { fetchTeamsByCompetition } from '../../services/v2/teamService'
import { fetchCompetition } from '../../services/v2/adminService'
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
  round_number: string     // jornada (Fecha N) — vacío si no aplica
}

// ── Convierte UTC ISO a valor para <input type="datetime-local"> ─────────────
function toLocalInput(utcIso: string): string {
  const d = new Date(utcIso)
  // datetime-local necesita YYYY-MM-DDTHH:MM
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// ── Modal de creación / edición ───────────────────────────────────────────────
const EMPTY_FORM: MatchEditInput = {
  match_datetime: '',
  home_team_id: null,
  away_team_id: null,
  home_slot_label: '',
  away_slot_label: '',
  stadium_id: '',
  round_number: '',
}

function formFromMatch(match: MatchWithRelations | null): MatchEditInput {
  if (!match) return EMPTY_FORM
  return {
    match_datetime: toLocalInput(match.match_datetime),
    home_team_id: match.home_team?.id ?? null,
    away_team_id: match.away_team?.id ?? null,
    home_slot_label: match.home_slot_label ?? '',
    away_slot_label: match.away_slot_label ?? '',
    stadium_id: match.stadium?.id ?? '',
    round_number: match.round_number != null ? String(match.round_number) : '',
  }
}

function MatchModal({
  open, match, competitionId, teams, stadiums, isLeague, onClose,
}: {
  open: boolean
  match: MatchWithRelations | null   // null → modo creación
  competitionId: string
  teams: TeamWithGroup[]
  stadiums: { id: string; name: string; city: string }[]
  isLeague: boolean
  onClose: () => void
}) {
  const qc = useQueryClient()
  const isEdit = !!match
  // El padre remonta este modal con `key`, así el estado parte de props sin efecto.
  const [form, setForm] = useState<MatchEditInput>(() => formFromMatch(match))

  const { mutate: save, isPending } = useMutation({
    mutationFn: async () => {
      const round = form.round_number.trim() === '' ? null : Number(form.round_number)
      if (match) {
        await updateMatchData(match.id, {
          match_datetime: new Date(form.match_datetime).toISOString(),
          home_team_id: form.home_team_id || null,
          away_team_id: form.away_team_id || null,
          home_slot_label: form.home_slot_label.trim() || null,
          away_slot_label: form.away_slot_label.trim() || null,
          round_number: round,
          stadium_id: form.stadium_id || null,
        })
      } else {
        await createMatch(competitionId, {
          home_team_id: form.home_team_id || null,
          away_team_id: form.away_team_id || null,
          match_datetime: new Date(form.match_datetime).toISOString(),
          round_number: round,
          stadium_id: form.stadium_id || null,
        })
      }
    },
    onSuccess: () => {
      toast.success(isEdit ? `Partido #${match?.match_number} actualizado` : 'Partido creado')
      qc.invalidateQueries({ queryKey: ['matches'] })
      qc.invalidateQueries({ queryKey: ['v2', 'phases', competitionId] })
      onClose()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const { mutate: remove, isPending: removing } = useMutation({
    mutationFn: async () => { if (match) await deleteMatch(match.id) },
    onSuccess: () => {
      toast.success('Partido eliminado')
      qc.invalidateQueries({ queryKey: ['matches'] })
      onClose()
    },
    onError: () => toast.error('No se pudo eliminar: el partido tiene predicciones asociadas.'),
  })

  function set<K extends keyof MatchEditInput>(key: K, val: MatchEditInput[K]) {
    setForm(f => ({ ...f, [key]: val }))
  }

  if (!open) return null

  // Slots solo en eliminatorias de torneos con grupos (edición de un partido knockout).
  const isKnockout = isEdit && !isLeague && !match!.group

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? `Partido #${match!.match_number}` : 'Nuevo partido'} size="md">
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
          {isEdit && (
            <p className="text-[11px] text-text-muted mt-1">
              Se guarda en UTC. Hora actual del partido: {formatMatchDay(match!.match_datetime)} {formatMatchTime(match!.match_datetime)}
            </p>
          )}
        </div>

        {/* Jornada / Fecha (solo ligas) */}
        {isLeague && (
          <div>
            <label className="block text-xs text-text-secondary mb-1.5">Jornada (Fecha)</label>
            <input
              type="number"
              min={1}
              value={form.round_number}
              onChange={e => set('round_number', e.target.value)}
              className="input"
              placeholder="ej: 1"
            />
            <p className="text-[11px] text-text-muted mt-1">
              Número de fecha de la liga (Fecha 1, Fecha 2, …).
            </p>
          </div>
        )}

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
            {isPending ? 'Guardando...' : isEdit ? 'Guardar' : 'Crear partido'}
          </button>
          <button className="btn-ghost flex-1 border border-border" onClick={onClose}>
            Cancelar
          </button>
        </div>

        {isEdit && isLeague && (
          <button
            className="w-full inline-flex items-center justify-center gap-1.5 text-xs text-error hover:text-error/80 transition-colors pt-1"
            onClick={() => { if (confirm(`¿Eliminar el partido #${match!.match_number}?`)) remove() }}
            disabled={removing}
          >
            <Trash2 size={13} /> {removing ? 'Eliminando...' : 'Eliminar partido'}
          </button>
        )}
      </div>
    </Modal>
  )
}

// ── Página principal ─────────────────────────────────────────────────────────
export function PartidosAdminPage() {
  const { id: competitionId = '' } = useParams()
  const [phaseOrder, setPhaseOrder] = useState(1)
  const [groupName, setGroupName] = useState<string | undefined>(undefined)
  const [roundNumber, setRoundNumber] = useState<number | undefined>(undefined)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<MatchWithRelations | null>(null)
  const [creating, setCreating] = useState(false)

  const { data: comp } = useQuery({
    queryKey: ['v2', 'competition', competitionId],
    queryFn: () => fetchCompetition(competitionId),
    enabled: !!competitionId,
  })
  const isLeague = !!comp && !comp.advancement_engine

  const { data: phases = [] } = useQuery({
    queryKey: ['v2', 'phases', competitionId],
    queryFn: () => fetchPhases(competitionId),
    enabled: !!competitionId,
  })
  const { data: groups = [] } = useQuery({
    queryKey: ['v2', 'groups', competitionId],
    queryFn: () => fetchGroups(competitionId),
    enabled: !!competitionId,
    staleTime: 1000 * 60 * 10,
  })
  const { data: rounds = [] } = useQuery({
    queryKey: ['v2', 'rounds', competitionId],
    queryFn: () => fetchRounds(competitionId),
    enabled: !!competitionId,
    staleTime: 1000 * 60 * 10,
  })
  const { data: matches = [], isLoading } = useQuery({
    queryKey: ['matches', competitionId, phaseOrder, groupName, roundNumber],
    queryFn: () => fetchMatches(competitionId, { phaseOrder, groupName, roundNumber }),
    enabled: !!competitionId,
    staleTime: 1000 * 60 * 5,
  })

  // Los grupos y las fechas viven en la fase de grupos / fase regular (la primera).
  // En knockout del Mundial no hay grupos; en ligas solo existe esa fase.
  const groupPhaseOrder = phases[0]?.order
  const onGroupPhase = phaseOrder === groupPhaseOrder
  const showGroupFilter = groups.length > 0 && onGroupPhase
  const showRoundFilter = rounds.length > 0 && onGroupPhase

  // Al cambiar de fase, los filtros de grupo/fecha dejan de aplicar.
  function selectPhase(order: number) {
    setPhaseOrder(order)
    setGroupName(undefined)
    setRoundNumber(undefined)
    setSearch('')
  }
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
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h1 className="text-xl font-bold text-text-primary">Partidos</h1>
          {isLeague && (
            <button onClick={() => setCreating(true)} className="btn-primary text-sm inline-flex items-center gap-1.5">
              <Plus size={14} /> Nuevo partido
            </button>
          )}
        </div>

        {/* Phase tabs */}
        <div className="flex gap-1 overflow-x-auto scrollbar-hide pb-1">
          {phases.map(p => (
            <button
              key={p.id}
              onClick={() => selectPhase(p.order)}
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

        {/* Filtro por grupo (Mundial: grupos · Intermedio: series). Oculto si no hay grupos. */}
        {showGroupFilter && (
          <div className="flex gap-1 overflow-x-auto scrollbar-hide pb-1">
            <FilterChip label="Todos los grupos" active={groupName === undefined} onClick={() => setGroupName(undefined)} />
            {groups.map(g => (
              <FilterChip
                key={g.id}
                label={`Grupo ${g.name}`}
                active={groupName === g.name}
                onClick={() => setGroupName(groupName === g.name ? undefined : g.name)}
              />
            ))}
          </div>
        )}

        {/* Filtro por fecha/jornada (Apertura, Intermedio). Oculto si no usa round_number. */}
        {/* Se envuelve en varias filas: con muchas fechas no entran en una sola línea. */}
        {showRoundFilter && (
          <div className="flex flex-wrap gap-1 pb-1">
            <FilterChip label="Todas las fechas" active={roundNumber === undefined} onClick={() => setRoundNumber(undefined)} />
            {rounds.map(r => (
              <FilterChip
                key={r}
                label={`Fecha ${r}`}
                active={roundNumber === r}
                onClick={() => setRoundNumber(roundNumber === r ? undefined : r)}
              />
            ))}
          </div>
        )}

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
                  : match.round_number != null
                    ? <span className="badge-primary text-[10px] font-semibold uppercase tracking-wide">Fecha {match.round_number}</span>
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

      <MatchModal
        key={selected?.id ?? (creating ? 'new' : 'closed')}
        open={!!selected || creating}
        match={selected}
        competitionId={competitionId}
        teams={teams as TeamWithGroup[]}
        stadiums={stadiums}
        isLeague={isLeague}
        onClose={() => { setSelected(null); setCreating(false) }}
      />
    </RequireAdmin>
  )
}

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex-shrink-0 px-2.5 py-1 rounded text-xs font-medium transition-colors ${
        active ? 'bg-accent/20 text-accent' : 'text-text-muted hover:text-text-secondary'
      }`}
    >
      {label}
    </button>
  )
}
