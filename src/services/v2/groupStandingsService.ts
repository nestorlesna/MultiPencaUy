import { supabase } from '../../lib/supabase'
import type { GroupStanding, BestThirdRanking } from '../../types/database'

export async function fetchGroupStandingsV2(
  competitionId: string,
  groupName?: string
): Promise<GroupStanding[]> {
  let query = supabase
    .from('group_standings')
    .select('*')
    .eq('competition_id', competitionId)
    .order('group_order')
    .order('position')

  if (groupName) {
    query = query.eq('group_name', groupName)
  }

  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as GroupStanding[]
}

// Ranking de mejores terceros de una competencia (vista best_third_ranking).
export async function fetchBestThirds(competitionId: string): Promise<BestThirdRanking[]> {
  const { data, error } = await supabase
    .from('best_third_ranking')
    .select('*')
    .eq('competition_id', competitionId)
    .order('rank')
  if (error) throw error
  return (data ?? []) as BestThirdRanking[]
}
