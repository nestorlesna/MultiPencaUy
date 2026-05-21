import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Loader2, Trophy, User } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { GroupTable } from '../components/groups/GroupTable'
import { useGroupStandings } from '../hooks/useGroupStandings'
import { useAuth } from '../hooks/useAuth'
import { fetchUserPredictions } from '../services/predictionService'
import { fetchTeamsInGroups, buildVirtualGroupStandings } from '../utils/virtualBracket'
import type { GroupStanding } from '../types'
import { GROUPS } from '../utils/constants'

// Agrupa las posiciones planas en un mapa grupo → standings[]
function byGroup(standings: GroupStanding[]): Map<string, GroupStanding[]> {
  const map = new Map<string, GroupStanding[]>()
  for (const s of standings) {
    if (!map.has(s.group_name)) map.set(s.group_name, [])
    map.get(s.group_name)!.push(s)
  }
  return map
}

// ── Grilla de grupos (compartida por ambas pestañas) ──────────────────────────
function GroupsGrid({
  standings,
  selected,
  mio = false,
}: {
  standings: GroupStanding[]
  selected: string | null
  mio?: boolean
}) {
  const navigate = useNavigate()
  const groupMap = byGroup(standings)
  const visibleGroups = selected ? [selected] : GROUPS

  return (
    <div className={`grid gap-4 ${selected ? 'grid-cols-1 max-w-lg mx-auto' : 'grid-cols-1 sm:grid-cols-2'}`}>
      {visibleGroups.map((g) => {
        const rows = groupMap.get(g) ?? []
        return (
          <div key={g} className="card p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold text-text-primary flex items-center gap-2">
                <span className="w-6 h-6 rounded bg-primary/20 text-primary text-xs font-bold flex items-center justify-center">
                  {g}
                </span>
                Grupo {g}
              </h2>
              <button
                onClick={() => navigate(`/grupos/${g}${mio ? '?vista=mias' : ''}`)}
                className="text-xs text-primary hover:underline"
              >
                Ver detalle →
              </button>
            </div>
            <GroupTable
              standings={rows}
              compact={!selected}
              onTeamClick={(teamId) => navigate(`/equipos/${teamId}`)}
            />
          </div>
        )
      })}
    </div>
  )
}

// ── Pestaña "Mis Grupos" — posiciones según las apuestas del usuario ──────────
function MisGrupos({ userId, selected }: { userId: string; selected: string | null }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['virtualGroupStandings', userId],
    queryFn: async () => {
      const [teams, predictions] = await Promise.all([
        fetchTeamsInGroups(),
        fetchUserPredictions(userId),
      ])
      const groupPreds = predictions.filter((p) => p.match.phase.order === 1)
      return {
        standings: buildVirtualGroupStandings(teams, predictions),
        predCount: groupPreds.length,
      }
    },
    staleTime: 1000 * 60,
  })

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="animate-spin text-primary" size={28} />
      </div>
    )
  }

  if (isError || !data) {
    return (
      <p className="text-center text-text-secondary py-12 text-sm">
        No se pudieron generar tus grupos. Intentá de nuevo más tarde.
      </p>
    )
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-surface border border-border px-4 py-3 text-sm text-text-secondary">
        Estas posiciones se calculan con los resultados que vos cargaste en tus
        apuestas (sección <span className="font-medium text-text-primary">JUGAR</span>) —
        no son los resultados oficiales del torneo. Así podés ir viendo cómo
        terminaría cada grupo según tus pronósticos.
        {data.predCount === 0 && (
          <span className="block mt-1 text-accent font-medium">
            Todavía no tenés apuestas cargadas en la fase de grupos — cargalas en la sección JUGAR.
          </span>
        )}
      </div>
      <GroupsGrid standings={data.standings} selected={selected} mio />
    </div>
  )
}

// ── Pestaña "Grupos del Torneo" — posiciones oficiales ────────────────────────
function GruposTorneo({ selected }: { selected: string | null }) {
  const { data: standings, isLoading, error } = useGroupStandings()

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="animate-spin text-primary" size={28} />
      </div>
    )
  }

  if (error) {
    return (
      <div className="card p-4 text-error text-sm text-center">
        Error cargando posiciones. Verificá la conexión a Supabase.
      </div>
    )
  }

  return <GroupsGrid standings={standings ?? []} selected={selected} />
}

// ── Página ────────────────────────────────────────────────────────────────────
type Tab = 'torneo' | 'mio'

export function GruposPage() {
  const [searchParams] = useSearchParams()
  const [activeTab, setActiveTab] = useState<Tab>(
    searchParams.get('vista') === 'mias' ? 'mio' : 'torneo',
  )
  const [selected, setSelected] = useState<string | null>(null)
  const { user } = useAuth()

  return (
    <div>
      <h1 className="text-xl font-bold text-text-primary mb-4">Grupos</h1>

      {/* Pestañas */}
      <div className="flex gap-1 bg-surface rounded-xl p-1 border border-border mb-4">
        <button
          onClick={() => setActiveTab('torneo')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'torneo'
              ? 'bg-primary text-white'
              : 'text-text-secondary hover:text-text-primary'
          }`}
        >
          <Trophy size={14} />
          Grupos del Torneo
        </button>
        <button
          onClick={() => setActiveTab('mio')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'mio'
              ? 'bg-primary text-white'
              : 'text-text-secondary hover:text-text-primary'
          }`}
        >
          <User size={14} />
          Mis Grupos
        </button>
      </div>

      {/* Selector de grupo */}
      <div className="flex gap-1 overflow-x-auto pb-1 mb-5 scrollbar-hide -mx-4 px-4">
        <button
          onClick={() => setSelected(null)}
          className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
            !selected
              ? 'bg-primary text-white'
              : 'bg-surface-2 text-text-secondary hover:text-text-primary'
          }`}
        >
          Todos
        </button>
        {GROUPS.map((g) => (
          <button
            key={g}
            onClick={() => setSelected(selected === g ? null : g)}
            className={`flex-shrink-0 w-9 h-8 rounded-full text-xs font-bold transition-colors ${
              selected === g
                ? 'bg-primary text-white'
                : 'bg-surface-2 text-text-secondary hover:text-text-primary'
            }`}
          >
            {g}
          </button>
        ))}
      </div>

      {/* Contenido */}
      {activeTab === 'torneo' ? (
        <GruposTorneo selected={selected} />
      ) : !user ? (
        <div className="text-center py-16 space-y-2">
          <User size={40} className="mx-auto text-text-muted" />
          <p className="text-text-secondary text-sm">
            Iniciá sesión para ver tus grupos según tus apuestas.
          </p>
        </div>
      ) : (
        <MisGrupos userId={user.id} selected={selected} />
      )}
    </div>
  )
}
