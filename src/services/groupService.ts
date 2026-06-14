import { supabase } from '../lib/supabase'
import type { GroupStanding } from '../types'

export async function fetchGroupStandings(groupName?: string): Promise<GroupStanding[]> {
  let query = supabase
    .from('group_standings')
    .select('*')
    .order('group_order')
    .order('position')

  if (groupName) {
    query = query.eq('group_name', groupName)
  }

  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as GroupStanding[]
}

export async function saveBestThirdRankOverrides(
  overrides: { team_id: string; rank: number }[]
): Promise<void> {
  const { error } = await supabase
    .from('best_third_rank_overrides')
    .upsert(overrides, { onConflict: 'team_id' })
  if (error) throw error
}

export async function deleteBestThirdRankOverrides(teamIds: string[]): Promise<void> {
  const { error } = await supabase
    .from('best_third_rank_overrides')
    .delete()
    .in('team_id', teamIds)
  if (error) throw error
}

export async function saveGroupPositionOverrides(
  overrides: { team_id: string; position: number }[]
): Promise<void> {
  const { error } = await supabase
    .from('group_position_overrides')
    .upsert(overrides, { onConflict: 'team_id' })
  if (error) throw error
}

export async function deleteGroupPositionOverrides(teamIds: string[]): Promise<void> {
  const { error } = await supabase
    .from('group_position_overrides')
    .delete()
    .in('team_id', teamIds)
  if (error) throw error
}

export async function fetchGroups() {
  const { data, error } = await supabase
    .from('groups')
    .select('*')
    .order('sort_order')
  if (error) throw error
  return data ?? []
}
