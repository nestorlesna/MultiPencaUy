import { supabase } from '../lib/supabase'
import type { Team } from '../types'
import type { MatchWithRelations } from '../types/match'

export async function fetchAllTeams(): Promise<TeamWithGroup[]> {
  const { data, error } = await supabase
    .from('teams')
    .select('*, group:groups(id, name, order:sort_order)')
    .order('group_id')
    .order('group_position')
  if (error) throw error
  return (data ?? []) as unknown as TeamWithGroup[]
}

export async function updateTeam(
  teamId: string,
  data: Partial<Pick<Team, 'name' | 'abbreviation' | 'flag_url' | 'is_confirmed' | 'placeholder_name'>>
) {
  const { error } = await supabase.from('teams').update(data).eq('id', teamId)
  if (error) throw error
}

export async function uploadTeamFlag(teamId: string, file: File): Promise<string> {
  const ext = file.name.split('.').pop()
  const path = `${teamId}/flag.${ext}`
  const { error } = await supabase.storage
    .from('flags')
    .upload(path, file, { upsert: true })
  if (error) throw error
  const { data } = supabase.storage.from('flags').getPublicUrl(path)
  return `${data.publicUrl}?t=${Date.now()}`
}

const MATCH_SELECT = `
  id, match_number, match_datetime, status,
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

export interface TeamWithGroup extends Team {
  group: { id: string; name: string; order: number }
}

export async function fetchTeam(id: string): Promise<TeamWithGroup | null> {
  const { data, error } = await supabase
    .from('teams')
    .select('*, group:groups(id, name, order:sort_order)')
    .eq('id', id)
    .single()
  if (error) return null
  return data as unknown as TeamWithGroup
}

export async function fetchTeamMatches(teamId: string): Promise<MatchWithRelations[]> {
  // Supabase no soporta OR entre columnas de FK directamente, hacemos dos queries
  const [homeRes, awayRes] = await Promise.all([
    supabase
      .from('matches')
      .select(MATCH_SELECT)
      .eq('home_team_id', teamId)
      .order('match_datetime'),
    supabase
      .from('matches')
      .select(MATCH_SELECT)
      .eq('away_team_id', teamId)
      .order('match_datetime'),
  ])

  if (homeRes.error) throw homeRes.error
  if (awayRes.error) throw awayRes.error

  const all = [...(homeRes.data ?? []), ...(awayRes.data ?? [])]
  all.sort((a, b) => new Date(a.match_datetime).getTime() - new Date(b.match_datetime).getTime())
  return all as unknown as MatchWithRelations[]
}
