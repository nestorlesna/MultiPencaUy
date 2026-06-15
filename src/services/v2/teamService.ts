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

// updateTeam y uploadTeamFlag operan por team_id (no requieren competitionId) →
// se reutilizan desde services/teamService.
export { updateTeam, uploadTeamFlag } from '../teamService'
