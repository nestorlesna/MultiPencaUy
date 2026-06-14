import { supabase } from '../../lib/supabase'
import type { GroupStanding } from '../../types/database'

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
