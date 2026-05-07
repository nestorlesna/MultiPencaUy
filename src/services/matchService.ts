import { supabase } from '../lib/supabase'
import type { MatchWithRelations } from '../types/match'

const MATCH_SELECT = `
  id, match_number, match_datetime, status,
  home_slot_label, away_slot_label,
  home_score_90, away_score_90,
  home_score_et, away_score_et,
  home_score_pk, away_score_pk,
  winner_team_id,
  phase:phases(id, name, order, has_extra_time, has_penalties),
  group:groups(id, name),
  stadium:stadiums(id, name, city, country, timezone),
  home_team:teams!home_team_id(id, name, abbreviation, flag_url, is_confirmed, placeholder_name),
  away_team:teams!away_team_id(id, name, abbreviation, flag_url, is_confirmed, placeholder_name)
` as const

export async function fetchMatches(filters?: {
  phaseOrder?: number
  groupName?: string
}): Promise<MatchWithRelations[]> {
  let query = supabase
    .from('matches')
    .select(MATCH_SELECT)
    .order('match_datetime')

  if (filters?.phaseOrder !== undefined) {
    // 'order' es palabra reservada en PostgREST, no se puede usar en .eq()
    // Se traen todas las fases y se filtra en cliente
    const { data: phasesData } = await supabase
      .from('phases')
      .select('id, order')
    const phase = (phasesData as Array<{ id: string; order: number }> | null)
      ?.find(p => p.order === filters.phaseOrder)
    if (phase) query = query.eq('phase_id', phase.id)
  }

  if (filters?.groupName) {
    const { data: group } = await supabase
      .from('groups')
      .select('id')
      .eq('name', filters.groupName)
      .single()
    if (group) query = query.eq('group_id', (group as { id: string }).id)
  }

  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as unknown as MatchWithRelations[]
}

export async function fetchMatchByNumber(matchNumber: number): Promise<MatchWithRelations | null> {
  const { data, error } = await supabase
    .from('matches')
    .select(MATCH_SELECT)
    .eq('match_number', matchNumber)
    .single()
  if (error) return null
  return data as unknown as MatchWithRelations
}

export async function fetchMatchCount(): Promise<number> {
  const { data, error } = await supabase.from('matches').select('id')
  if (error) throw error
  return data?.length ?? 0
}

export interface MatchPredictionDetail {
  user_id: string
  display_name: string
  username: string
  home_score: number | null
  away_score: number | null
  points_earned: number
  total_points: number
}

export async function fetchMatchPredictionsAdmin(matchId: string): Promise<MatchPredictionDetail[]> {
  const { data, error } = await supabase.rpc('admin_get_match_predictions', { p_match_id: matchId })
  if (error) throw error
  return (data ?? []) as MatchPredictionDetail[]
}

export async function fetchGroupMatchCount(): Promise<number> {
  const { data, error } = await supabase
    .from('matches')
    .select('id')
    .not('group_id', 'is', null)
  if (error) throw error
  return data?.length ?? 0
}

export async function fetchStadium(id: string) {
  const { data, error } = await supabase
    .from('stadiums')
    .select('id, name, city, country, address, capacity, photo_urls, latitude, longitude, timezone')
    .eq('id', id)
    .single()
  if (error) return null
  return data
}
