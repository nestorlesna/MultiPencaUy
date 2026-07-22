import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Navigate } from 'react-router-dom'
import { Loader2, RefreshCw, LineChart, Search, X } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '../../hooks/useAuth'
import { MatchCard } from '../../components/matches/MatchCard'
import { ResultFormV2 } from '../../components/admin/ResultFormV2'
import { fetchCompetitions, recalculateAllV2, rebuildProgress } from '../../services/v2/adminService'
import { fetchMatches, fetchPhases, fetchGroups, fetchRounds } from '../../services/v2/matchService'
import type { MatchWithRelations } from '../../types/match'
import { matchDateKey, formatMatchDayFull } from '../../utils/datetime'

export function AdminResultadosV2Page() {
  const { user, loading, isSuperAdmin, tenantRoles } = useAuth()
  const qc = useQueryClient()
  const [competitionId, setCompetitionId] = useState<string>('')
  const [phaseOrder, setPhaseOrder] = useState<number>(1)
  const [groupName, setGroupName] = useState<string | undefined>(undefined)
  const [roundNumber, setRoundNumber] = useState<number | undefined>(undefined)
  const [loadFilter, setLoadFilter] = useState<'all' | 'pending' | 'loaded'>('all')
  const [teamQuery, setTeamQuery] = useState('')
  const [selected, setSelected] = useState<MatchWithRelations | null>(null)

  const canLoad = isSuperAdmin || tenantRoles.length > 0

  const { data: allCompetitions = [] } = useQuery({
    queryKey: ['v2', 'competitions'],
    queryFn: fetchCompetitions,
    enabled: canLoad,
  })

  // Solo se cargan resultados de competencias activas (borrador/finalizada/
  // archivada no aparecen en el combo).
  const competitions = allCompetitions.filter(c => c.status === 'active')

  // Seleccionar la primera competencia por defecto.
  useEffect(() => {
    if (!competitionId && competitions.length > 0) setCompetitionId(competitions[0].id)
  }, [competitions, competitionId])

  const { data: phases = [] } = useQuery({
    queryKey: ['v2', 'phases', competitionId],
    queryFn: () => fetchPhases(competitionId),
    enabled: !!competitionId,
  })

  const { data: groups = [] } = useQuery({
    queryKey: ['v2', 'groups', competitionId],
    queryFn: () => fetchGroups(competitionId),
    enabled: !!competitionId,
  })

  const { data: rounds = [] } = useQuery({
    queryKey: ['v2', 'rounds', competitionId],
    queryFn: () => fetchRounds(competitionId),
    enabled: !!competitionId,
    staleTime: 1000 * 60 * 10,
  })

  const { data: matches = [], isLoading } = useQuery({
    queryKey: ['v2', 'admin-matches', competitionId, phaseOrder, groupName, roundNumber],
    queryFn: () => fetchMatches(competitionId, { phaseOrder, groupName, roundNumber }),
    enabled: !!competitionId,
  })

  const recalcMut = useMutation({
    mutationFn: () => recalculateAllV2(competitionId),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['v2'] })
      toast.success(
        `Recálculo completo · ${r.matches_processed} partidos · ${r.predictions_updated} predicciones · ${r.knockout_slots_updated} cruces · ${r.bonus_rows_updated} bonus`
      )
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const rebuildMut = useMutation({
    mutationFn: () => rebuildProgress(competitionId),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['v2', 'user-points-progress'] })
      qc.invalidateQueries({ queryKey: ['v2', 'user-rank-progress'] })
      toast.success(`Evolución regenerada · ${r.points_rows} filas de puntos · ${r.rank_rows} de ranking`)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  if (loading) return null
  if (!user) return <Navigate to="/auth" replace />
  if (!canLoad) return <Navigate to="/" replace />

  const showGroupFilter = phaseOrder === 1 && groups.length > 0
  const showRoundFilter = phaseOrder === 1 && rounds.length > 0

  // Filtro por estado de carga (cargado = resultado guardado / status finished)
  // y por nombre/abreviatura de equipo (local o visitante, sin distinguir
  // mayúsculas, por contenido: "nal" → Nacional).
  const q = teamQuery.trim().toLowerCase()
  const matchesTeam = (m: MatchWithRelations) => {
    if (!q) return true
    const fields = [
      m.home_team?.name, m.home_team?.abbreviation,
      m.away_team?.name, m.away_team?.abbreviation,
    ]
    return fields.some(f => f?.toLowerCase().includes(q))
  }
  const visibleMatches = matches.filter(m =>
    (loadFilter === 'all' ? true
      : loadFilter === 'loaded' ? m.status === 'finished'
      : m.status !== 'finished')
    && matchesTeam(m)
  )
  const pendingCount = matches.filter(m => m.status !== 'finished').length
  const loadedCount = matches.length - pendingCount

  // Agrupa por día: una sección por fecha con su encabezado (igual que en Fixture).
  const groupedByDate = (() => {
    const map = new Map<string, MatchWithRelations[]>()
    for (const m of visibleMatches) {
      const key = matchDateKey(m.match_datetime)
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(m)
    }
    return Array.from(map.entries()).map(([dateKey, items]) => ({
      dateKey,
      label: formatMatchDayFull(items[0].match_datetime),
      matches: items,
    }))
  })()

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-bold text-text-primary">Carga de resultados</h1>
        <div className="flex items-center gap-2">
          <button
            className="btn-ghost text-sm inline-flex items-center gap-1.5 border border-border"
            onClick={() => rebuildMut.mutate()}
            disabled={rebuildMut.isPending || !competitionId}
            title="Borra y regenera las gráficas de evolución (puntos por partido y puesto por día)"
          >
            <LineChart size={14} className={rebuildMut.isPending ? 'animate-pulse' : ''} />
            {rebuildMut.isPending ? 'Regenerando...' : 'Recargar evolución'}
          </button>
          <button
            className="btn-secondary text-sm inline-flex items-center gap-1.5"
            onClick={() => recalcMut.mutate()}
            disabled={recalcMut.isPending || !competitionId}
          >
            <RefreshCw size={14} className={recalcMut.isPending ? 'animate-spin' : ''} />
            {recalcMut.isPending ? 'Procesando...' : 'Recalcular todo'}
          </button>
        </div>
      </div>

      {/* Selector de competencia */}
      <div>
        <label className="block text-xs text-text-secondary mb-1.5">Competencia</label>
        <select
          value={competitionId}
          onChange={e => { setCompetitionId(e.target.value); setPhaseOrder(1); setGroupName(undefined); setRoundNumber(undefined) }}
          className="input w-full"
        >
          {competitions.length === 0 && <option value="">No hay competencias</option>}
          {competitions.map(c => (
            <option key={c.id} value={c.id}>{c.name}{c.season ? ` (${c.season})` : ''}</option>
          ))}
        </select>
      </div>

      {/* Tabs de fase */}
      {phases.length > 0 && (
        <div className="flex gap-1 overflow-x-auto scrollbar-hide pb-1">
          {phases.map(p => (
            <button
              key={p.id}
              onClick={() => { setPhaseOrder(p.order); setGroupName(undefined); setRoundNumber(undefined) }}
              className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                phaseOrder === p.order ? 'bg-primary text-white' : 'bg-surface-2 text-text-secondary hover:text-text-primary'
              }`}
            >
              {p.name}
            </button>
          ))}
        </div>
      )}

      {/* Filtro de grupo */}
      {showGroupFilter && (
        <div className="flex gap-1 overflow-x-auto scrollbar-hide pb-1">
          <button
            onClick={() => setGroupName(undefined)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              groupName === undefined ? 'bg-accent text-white' : 'bg-surface-2 text-text-secondary hover:text-text-primary'
            }`}
          >
            Todos
          </button>
          {groups.map(g => (
            <button
              key={g.id}
              onClick={() => setGroupName(g.name)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                groupName === g.name ? 'bg-accent text-white' : 'bg-surface-2 text-text-secondary hover:text-text-primary'
              }`}
            >
              {g.name}
            </button>
          ))}
        </div>
      )}

      {/* Filtro por fecha/jornada (ligas por fechas). Envuelto en varias filas si hay muchas. */}
      {showRoundFilter && (
        <div className="flex flex-wrap gap-1 pb-1">
          <button
            onClick={() => setRoundNumber(undefined)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              roundNumber === undefined ? 'bg-accent text-white' : 'bg-surface-2 text-text-secondary hover:text-text-primary'
            }`}
          >
            Todas
          </button>
          {rounds.map(r => (
            <button
              key={r}
              onClick={() => setRoundNumber(roundNumber === r ? undefined : r)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                roundNumber === r ? 'bg-accent text-white' : 'bg-surface-2 text-text-secondary hover:text-text-primary'
              }`}
            >
              F{r}
            </button>
          ))}
        </div>
      )}

      {/* Búsqueda por equipo (local o visitante) */}
      {matches.length > 0 && (
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            value={teamQuery}
            onChange={e => setTeamQuery(e.target.value)}
            placeholder="Buscar equipo (local o visitante)..."
            className="input w-full pl-9 pr-9"
          />
          {teamQuery && (
            <button
              onClick={() => setTeamQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
              title="Limpiar búsqueda"
            >
              <X size={15} />
            </button>
          )}
        </div>
      )}

      {/* Filtro por estado de carga */}
      {matches.length > 0 && (
        <div className="flex gap-1 overflow-x-auto scrollbar-hide pb-1">
          {([
            ['all', `Todos (${matches.length})`],
            ['pending', `Pendientes (${pendingCount})`],
            ['loaded', `Cargados (${loadedCount})`],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setLoadFilter(key)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                loadFilter === key ? 'bg-primary text-white' : 'bg-surface-2 text-text-secondary hover:text-text-primary'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {isLoading && <Spinner />}

      <div className="space-y-3">
        {!isLoading && matches.length === 0 && (
          <p className="text-text-muted text-sm text-center py-8">No hay partidos en esta fase.</p>
        )}
        {!isLoading && matches.length > 0 && visibleMatches.length === 0 && (
          <p className="text-text-muted text-sm text-center py-8">
            {q
              ? `No hay partidos que coincidan con "${teamQuery.trim()}".`
              : loadFilter === 'pending' ? 'No quedan partidos pendientes en esta fase.' : 'No hay partidos cargados en esta fase.'}
          </p>
        )}
        {groupedByDate.map(({ dateKey, label, matches: dayMatches }) => (
          <section key={dateKey}>
            <h2 className="text-xs font-semibold text-text-muted uppercase tracking-widest mb-2 capitalize">
              {label}
            </h2>
            <div className="space-y-3">
              {dayMatches.map(match => (
                <MatchCard
                  key={match.id}
                  match={match}
                  footerContent={
                    <div className="flex items-center justify-between gap-2">
                      {match.status === 'finished'
                        ? <span className="badge bg-success/20 text-success text-[10px]">Finalizado</span>
                        : <span className="badge bg-border text-text-muted text-[10px]">Pendiente</span>}
                      <button
                        className="btn-primary text-[11px] px-3 py-1"
                        onClick={(e) => { e.stopPropagation(); setSelected(match) }}
                      >
                        Resultado
                      </button>
                    </div>
                  }
                />
              ))}
            </div>
          </section>
        ))}
      </div>

      <ResultFormV2 match={selected} competitionId={competitionId} onClose={() => setSelected(null)} />
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
