import { supabase } from '../../lib/supabase'
import type { MatchWithRelations } from '../../types/match'

// 'order:sort_order' alias mantiene el shape de MatchWithRelations (phase.order)
// pese al renombre de columna en v2.
const MATCH_SELECT = `
  id, match_number, round_number, match_datetime, status,
  home_slot_label, away_slot_label,
  home_score_90, away_score_90,
  home_score_et, away_score_et,
  home_score_pk, away_score_pk,
  winner_team_id,
  phase:phases(id, name, order:sort_order, has_extra_time, has_penalties),
  group:groups(id, name),
  stadium:stadiums(id, name, city, country, timezone),
  home_team:teams!home_team_id(id, name, abbreviation, flag_url, is_confirmed, placeholder_name),
  away_team:teams!away_team_id(id, name, abbreviation, flag_url, is_confirmed, placeholder_name)
` as const

export async function fetchMatches(
  competitionId: string,
  filters?: { phaseOrder?: number; groupName?: string; roundNumber?: number }
): Promise<MatchWithRelations[]> {
  let query = supabase
    .from('matches')
    .select(MATCH_SELECT)
    .eq('competition_id', competitionId)
    .order('match_datetime')

  // En v2 'sort_order' no es palabra reservada → se filtra directo.
  if (filters?.phaseOrder !== undefined) {
    const { data: phase } = await supabase
      .from('phases')
      .select('id')
      .eq('competition_id', competitionId)
      .eq('sort_order', filters.phaseOrder)
      .maybeSingle()
    if (phase) query = query.eq('phase_id', (phase as { id: string }).id)
  }

  if (filters?.groupName) {
    const { data: group } = await supabase
      .from('groups')
      .select('id')
      .eq('competition_id', competitionId)
      .eq('name', filters.groupName)
      .maybeSingle()
    if (group) query = query.eq('group_id', (group as { id: string }).id)
  }

  if (filters?.roundNumber !== undefined) {
    query = query.eq('round_number', filters.roundNumber)
  }

  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as unknown as MatchWithRelations[]
}

export async function fetchPhases(
  competitionId: string
): Promise<{ id: string; name: string; order: number }[]> {
  const { data, error } = await supabase
    .from('phases')
    .select('id, name, order:sort_order')
    .eq('competition_id', competitionId)
    .order('sort_order')
  if (error) throw error
  return (data ?? []) as { id: string; name: string; order: number }[]
}

// Retorna los números de fecha distintos para una competencia tipo liga.
// Vacío si la competencia no usa round_number (torneos con fases/grupos).
export async function fetchRounds(
  competitionId: string
): Promise<number[]> {
  const { data, error } = await supabase
    .from('matches')
    .select('round_number')
    .eq('competition_id', competitionId)
    .not('round_number', 'is', null)
    .order('round_number')
  if (error) throw error
  const unique = [...new Set((data ?? []).map((r: { round_number: number }) => r.round_number))]
  return unique
}

export async function fetchGroups(
  competitionId: string
): Promise<{ id: string; name: string }[]> {
  const { data, error } = await supabase
    .from('groups')
    .select('id, name')
    .eq('competition_id', competitionId)
    .order('sort_order')
  if (error) throw error
  return (data ?? []) as { id: string; name: string }[]
}

export async function fetchStadiums(
  competitionId: string
): Promise<{ id: string; name: string; city: string }[]> {
  const { data, error } = await supabase
    .from('stadiums')
    .select('id, name, city')
    .eq('competition_id', competitionId)
    .order('name')
  if (error) throw error
  return (data ?? []) as { id: string; name: string; city: string }[]
}

// Edición directa de un partido (por match_id; RLS: cargador/admin de la competencia).
export async function updateMatchData(
  matchId: string,
  data: {
    match_datetime: string
    home_team_id: string | null
    away_team_id: string | null
    home_slot_label: string | null
    away_slot_label: string | null
  }
): Promise<void> {
  const { error } = await supabase.from('matches').update(data).eq('id', matchId)
  if (error) throw error
}
