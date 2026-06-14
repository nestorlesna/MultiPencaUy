import { supabase } from '../../lib/supabase'

// Servicio de bonus (+ Puntos) scoped a ten_comp_id (config/predicciones/puntos)
// y competition_id (catálogo de equipos/grupos). Sigue la convención v2: scope
// explícito por parámetro, nunca desde contexto de módulo.

export interface BonusPredictionV2 {
  id?: string
  ten_comp_id: string
  user_id: string
  podio_1st_id: string | null
  podio_2nd_id: string | null
  podio_3rd_id: string | null
  podio_4th_id: string | null
  empates_grupos: number | null
  rango_goles: string | null
  final_cero: boolean | null
  top_scorer_team_id: string | null
  top_group_id: string | null
  created_at?: string
  updated_at?: string
}

export interface BonusPointsV2 {
  bonus_type: string
  points_earned: number
  detail: Record<string, unknown> | null
  calculated_at: string
}

export interface TeamOption {
  id: string
  name: string
  abbreviation: string
  flag_url: string | null
  group_name: string
}

export interface GroupOption {
  id: string
  name: string
}

export const GOAL_RANGES = [
  '1-20', '21-40', '41-60', '61-80', '81-100', '101-120', '121-140', '141-160',
  '161-180', '181-200', '201-220', '221-240', '241-260', '261-280', '281-300',
  '301-320', '321-340', '341+',
] as const

export type GoalRange = typeof GOAL_RANGES[number]

// Puntos de bonus configurados para el Ten-Comp (lo que vale cada tipo).
export async function fetchBonusConfigV2(tenCompId: string): Promise<Record<string, number>> {
  const { data, error } = await supabase
    .from('ten_comp_bonus_config')
    .select('bonus_type, points')
    .eq('ten_comp_id', tenCompId)
    .eq('is_active', true)
  if (error) throw error
  return Object.fromEntries((data ?? []).map((r: any) => [r.bonus_type, r.points]))
}

export async function fetchBonusPredictionV2(
  tenCompId: string,
  userId: string
): Promise<BonusPredictionV2 | null> {
  const { data, error } = await supabase
    .from('bonus_predictions')
    .select('*')
    .eq('ten_comp_id', tenCompId)
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw error
  return (data as BonusPredictionV2) ?? null
}

export async function fetchBonusPointsV2(
  tenCompId: string,
  userId: string
): Promise<Record<string, BonusPointsV2>> {
  const { data, error } = await supabase
    .from('bonus_points')
    .select('bonus_type, points_earned, detail, calculated_at')
    .eq('ten_comp_id', tenCompId)
    .eq('user_id', userId)
  if (error) throw error
  return Object.fromEntries((data ?? []).map((r: any) => [r.bonus_type, r as BonusPointsV2]))
}

export async function fetchTeamOptionsV2(competitionId: string): Promise<TeamOption[]> {
  const { data, error } = await supabase
    .from('teams')
    .select('id, name, abbreviation, flag_url, groups!inner(name)')
    .eq('competition_id', competitionId)
    .eq('is_confirmed', true)
    .order('name')
  if (error) throw error
  return (data ?? []).map((t: any): TeamOption => ({
    id: t.id,
    name: t.name,
    abbreviation: t.abbreviation,
    flag_url: t.flag_url,
    group_name: t.groups?.name ?? '',
  }))
}

export async function fetchGroupOptionsV2(competitionId: string): Promise<GroupOption[]> {
  const { data, error } = await supabase
    .from('groups')
    .select('id, name')
    .eq('competition_id', competitionId)
    .order('sort_order')
  if (error) throw error
  return (data ?? []) as GroupOption[]
}

// ¿Ya empezó la competencia del Ten-Comp? (primer partido con fecha pasada)
export async function isCompetitionStartedV2(competitionId: string): Promise<boolean> {
  const { data } = await supabase
    .from('matches')
    .select('match_datetime')
    .eq('competition_id', competitionId)
    .order('match_datetime', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (!data?.match_datetime) return false
  return new Date(data.match_datetime) <= new Date()
}

export async function saveBonusPredictionV2(
  tenCompId: string,
  userId: string,
  patch: Partial<Omit<BonusPredictionV2, 'id' | 'ten_comp_id' | 'user_id' | 'created_at' | 'updated_at'>>
): Promise<void> {
  const { error } = await supabase
    .from('bonus_predictions')
    .upsert({ ten_comp_id: tenCompId, user_id: userId, ...patch }, { onConflict: 'ten_comp_id,user_id' })
  if (error) throw error
}
