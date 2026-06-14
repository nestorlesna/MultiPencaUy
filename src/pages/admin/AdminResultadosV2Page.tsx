import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Navigate } from 'react-router-dom'
import { Loader2, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '../../hooks/useAuth'
import { MatchCard } from '../../components/matches/MatchCard'
import { ResultFormV2 } from '../../components/admin/ResultFormV2'
import { fetchCompetitions, recalculateAllV2 } from '../../services/v2/adminService'
import { fetchMatches, fetchPhases, fetchGroups } from '../../services/v2/matchService'
import type { MatchWithRelations } from '../../types/match'

export function AdminResultadosV2Page() {
  const { user, loading, isSuperAdmin, tenantRoles } = useAuth()
  const qc = useQueryClient()
  const [competitionId, setCompetitionId] = useState<string>('')
  const [phaseOrder, setPhaseOrder] = useState<number>(1)
  const [groupName, setGroupName] = useState<string | undefined>(undefined)
  const [selected, setSelected] = useState<MatchWithRelations | null>(null)

  const canLoad = isSuperAdmin || tenantRoles.length > 0

  const { data: competitions = [] } = useQuery({
    queryKey: ['v2', 'competitions'],
    queryFn: fetchCompetitions,
    enabled: canLoad,
  })

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

  const { data: matches = [], isLoading } = useQuery({
    queryKey: ['v2', 'admin-matches', competitionId, phaseOrder, groupName],
    queryFn: () => fetchMatches(competitionId, { phaseOrder, groupName }),
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

  if (loading) return null
  if (!user) return <Navigate to="/auth" replace />
  if (!canLoad) return <Navigate to="/" replace />

  const showGroupFilter = phaseOrder === 1 && groups.length > 0

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-bold text-text-primary">Carga de resultados</h1>
        <button
          className="btn-secondary text-sm inline-flex items-center gap-1.5"
          onClick={() => recalcMut.mutate()}
          disabled={recalcMut.isPending || !competitionId}
        >
          <RefreshCw size={14} className={recalcMut.isPending ? 'animate-spin' : ''} />
          {recalcMut.isPending ? 'Procesando...' : 'Recalcular todo'}
        </button>
      </div>

      {/* Selector de competencia */}
      <div>
        <label className="block text-xs text-text-secondary mb-1.5">Competencia</label>
        <select
          value={competitionId}
          onChange={e => { setCompetitionId(e.target.value); setPhaseOrder(1); setGroupName(undefined) }}
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
              onClick={() => { setPhaseOrder(p.order); setGroupName(undefined) }}
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

      {isLoading && <Spinner />}

      <div className="space-y-3">
        {!isLoading && matches.length === 0 && (
          <p className="text-text-muted text-sm text-center py-8">No hay partidos en esta fase.</p>
        )}
        {matches.map(match => (
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
