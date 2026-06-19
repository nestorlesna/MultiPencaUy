import { supabase } from '../../lib/supabase'
import type { TeamWithGroup } from '../teamService'

// Equipos de una competencia (admin del catálogo). Scope explícito por competitionId.
export async function fetchTeamsByCompetition(competitionId: string): Promise<TeamWithGroup[]> {
  const { data, error } = await supabase
    .from('teams')
    .select('*, group:groups(id, name, order:sort_order)')
    .eq('competition_id', competitionId)
    .order('group_id')
    .order('group_position')
  if (error) throw error
  return (data ?? []) as unknown as TeamWithGroup[]
}

// Crea un equipo en el catálogo de la competencia (tipo liga: sin grupo).
export async function createTeam(
  competitionId: string,
  data: {
    name: string
    abbreviation: string
    flag_url?: string | null
    placeholder_name?: string | null
    is_confirmed?: boolean
  }
): Promise<string> {
  const { data: row, error } = await supabase
    .from('teams')
    .insert({
      competition_id: competitionId,
      name: data.name.trim(),
      abbreviation: data.abbreviation.trim().toUpperCase().slice(0, 3),
      flag_url: data.flag_url?.trim() || null,
      placeholder_name: data.placeholder_name?.trim() || null,
      is_confirmed: data.is_confirmed ?? true,
      group_id: null,
      group_position: null,
    })
    .select('id')
    .single()
  if (error) throw error
  return (row as { id: string }).id
}

// Elimina un equipo. Falla por FK si está referenciado en partidos.
export async function deleteTeam(teamId: string): Promise<void> {
  const { error } = await supabase.from('teams').delete().eq('id', teamId)
  if (error) throw error
}

// updateTeam y uploadTeamFlag operan por team_id (no requieren competitionId) →
// se reutilizan desde services/teamService.
export { updateTeam, uploadTeamFlag } from '../teamService'
