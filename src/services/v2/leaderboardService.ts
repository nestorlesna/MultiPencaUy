import { supabase } from '../../lib/supabase'
import type { LeaderboardEntry } from '../../types'
import type { TeamInfo } from '../../types/match'

// Ranking de un Ten-Comp: la vista leaderboard ya filtra por miembros aprobados
// y suma solo los puntos de esa penca. Acá filtramos por ten_comp_id.
export async function fetchLeaderboard(tenCompId: string): Promise<LeaderboardEntry[]> {
  const { data, error } = await supabase
    .from('leaderboard')
    .select('*')
    .eq('ten_comp_id', tenCompId)
    .order('rank')
  if (error) throw error
  return (data ?? []) as LeaderboardEntry[]
}

// ── Detalle de puntaje de un usuario (popup al hacer click en el ranking) ──────

// Un partido en el que el usuario sacó punto: su apuesta, el resultado real,
// los puntos y la fecha de la apuesta (última modificación).
export interface UserScoredMatch {
  prediction_id: string
  match_id: string
  match_number: number
  match_datetime: string
  points_earned: number
  // Apuesta del usuario (a 90' + ET si aplica)
  pred_home: number
  pred_away: number
  pred_home_et: number | null
  pred_away_et: number | null
  pred_pk_winner_id: string | null
  // Resultado real
  home_score_90: number | null
  away_score_90: number | null
  home_score_et: number | null
  away_score_et: number | null
  home_score_pk: number | null
  away_score_pk: number | null
  predicted_at: string   // updated_at (última modificación) o created_at
  home_team: TeamInfo | null
  away_team: TeamInfo | null
}

const SCORED_SELECT = `
  id, match_id, home_score, away_score, home_score_et, away_score_et,
  predicted_pk_winner_id,
  points_earned, created_at, updated_at,
  match:matches!inner(
    match_number, match_datetime,
    home_score_90, away_score_90, home_score_et, away_score_et,
    home_score_pk, away_score_pk,
    home_team:teams!home_team_id(id, name, abbreviation, flag_url, is_confirmed, placeholder_name),
    away_team:teams!away_team_id(id, name, abbreviation, flag_url, is_confirmed, placeholder_name)
  )
` as const

interface RawScoredRow {
  id: string
  match_id: string
  home_score: number
  away_score: number
  home_score_et: number | null
  away_score_et: number | null
  predicted_pk_winner_id: string | null
  points_earned: number | null
  created_at: string
  updated_at: string | null
  match: {
    match_number: number
    match_datetime: string
    home_score_90: number | null
    away_score_90: number | null
    home_score_et: number | null
    away_score_et: number | null
    home_score_pk: number | null
    away_score_pk: number | null
    home_team: TeamInfo | null
    away_team: TeamInfo | null
  } | null
}

// Partidos donde el usuario obtuvo puntos (> 0). La RLS de `predictions` ya
// autoriza leer ajenas para partidos comenzados (todos los que suman punto).
export async function fetchUserScoredMatches(
  tenCompId: string,
  userId: string
): Promise<UserScoredMatch[]> {
  const { data, error } = await supabase
    .from('predictions')
    .select(SCORED_SELECT)
    .eq('ten_comp_id', tenCompId)
    .eq('user_id', userId)
    .gt('points_earned', 0)
  if (error) throw error

  return ((data ?? []) as unknown as RawScoredRow[])
    .map((r): UserScoredMatch => ({
      prediction_id: r.id,
      match_id: r.match_id,
      match_number: r.match?.match_number ?? 0,
      match_datetime: r.match?.match_datetime ?? '',
      points_earned: r.points_earned ?? 0,
      pred_home: r.home_score,
      pred_away: r.away_score,
      pred_home_et: r.home_score_et,
      pred_away_et: r.away_score_et,
      pred_pk_winner_id: r.predicted_pk_winner_id ?? null,
      home_score_90: r.match?.home_score_90 ?? null,
      away_score_90: r.match?.away_score_90 ?? null,
      home_score_et: r.match?.home_score_et ?? null,
      away_score_et: r.match?.away_score_et ?? null,
      home_score_pk: r.match?.home_score_pk ?? null,
      away_score_pk: r.match?.away_score_pk ?? null,
      predicted_at: r.updated_at ?? r.created_at,
      home_team: r.match?.home_team ?? null,
      away_team: r.match?.away_team ?? null,
    }))
    .sort((a, b) => a.match_number - b.match_number)
}

// Bonus GANADOS (+Puntos) de un usuario. Vía RPC SECURITY DEFINER porque la RLS
// solo expone los bonus propios/del admin (migración 106).
export interface UserBonusPoint {
  bonus_type: string
  points_earned: number
  detail: Record<string, unknown> | null
  calculated_at: string
}

export async function fetchUserBonusPoints(
  tenCompId: string,
  userId: string
): Promise<UserBonusPoint[]> {
  const { data, error } = await supabase.rpc('member_get_user_bonus_points', {
    p_ten_comp: tenCompId,
    p_user: userId,
  })
  if (error) throw error
  return (data ?? []) as UserBonusPoint[]
}

// ── Evolución del jugador (gráficas del detalle del ranking) ───────────────────
// Ambas salen de tablas materializadas (migración 108) vía RPC guardado por
// is_approved_member. Se regeneran al cargar/recalcular resultados o con el botón
// "Recargar evolución" del admin.

// Puntos acumulados partido a partido (con el bonus sumado cuando se resuelve).
export interface UserPointsProgressPoint {
  match_number: number
  match_points: number
  bonus_added: number
  cumulative_points: number
}

export async function fetchUserPointsProgress(
  tenCompId: string,
  userId: string
): Promise<UserPointsProgressPoint[]> {
  const { data, error } = await supabase.rpc('member_get_user_points_progress', {
    p_ten_comp: tenCompId,
    p_user: userId,
  })
  if (error) throw error
  return (data ?? []) as UserPointsProgressPoint[]
}

// Puesto en el ranking por día.
export interface UserRankProgressPoint {
  day: string       // YYYY-MM-DD
  points: number
  rank: number
}

export async function fetchUserRankProgress(
  tenCompId: string,
  userId: string
): Promise<UserRankProgressPoint[]> {
  const { data, error } = await supabase.rpc('member_get_user_rank_progress', {
    p_ten_comp: tenCompId,
    p_user: userId,
  })
  if (error) throw error
  return (data ?? []) as UserRankProgressPoint[]
}
