import { supabase } from '../../lib/supabase'

export interface PredictionV2 {
  id: string
  ten_comp_id: string
  match_id: string
  home_score: number
  away_score: number
  home_score_et: number | null
  away_score_et: number | null
  predicted_pk_winner_id: string | null
  points_earned: number | null
  created_at: string
  updated_at: string
}

export interface PredictionInputV2 {
  tenCompId: string
  matchId: string
  homeScore: number
  awayScore: number
  homeScoreEt?: number | null
  awayScoreEt?: number | null
  predictedPkWinnerId?: string | null
}

// Distribución 1X2 de los pronósticos del resto (todas las pencas de la
// competencia) para un partido. Conteos crudos; el % se calcula en la UI.
export interface MatchPredictionStats {
  home: number
  draw: number
  away: number
  total: number
}

export async function fetchMatchPredictionStats(matchId: string): Promise<MatchPredictionStats> {
  const { data, error } = await supabase.rpc('match_prediction_stats', { p_match_id: matchId })
  if (error) throw error
  const row = (data?.[0] ?? {}) as Partial<{
    home_count: number; draw_count: number; away_count: number; total: number
  }>
  return {
    home: row.home_count ?? 0,
    draw: row.draw_count ?? 0,
    away: row.away_count ?? 0,
    total: row.total ?? 0,
  }
}

// Top de resultados exactos más apostados por el resto de la competencia.
export interface MatchTopScore {
  home: number
  away: number
  count: number
}

export async function fetchMatchTopScores(matchId: string): Promise<MatchTopScore[]> {
  const { data, error } = await supabase.rpc('match_top_scores', { p_match_id: matchId, p_limit: 5 })
  if (error) throw error
  return ((data ?? []) as { home_score: number; away_score: number; cnt: number }[])
    .map(r => ({ home: r.home_score, away: r.away_score, count: r.cnt }))
}

export async function upsertPredictionV2(userId: string, input: PredictionInputV2): Promise<void> {
  const { error } = await supabase.from('predictions').upsert(
    {
      ten_comp_id: input.tenCompId,
      user_id: userId,
      match_id: input.matchId,
      home_score: input.homeScore,
      away_score: input.awayScore,
      home_score_et: input.homeScoreEt ?? null,
      away_score_et: input.awayScoreEt ?? null,
      predicted_pk_winner_id: input.predictedPkWinnerId ?? null,
    },
    { onConflict: 'ten_comp_id,user_id,match_id' }
  )
  if (error) throw error
}

export async function deletePredictionV2(predictionId: string): Promise<void> {
  const { error } = await supabase.from('predictions').delete().eq('id', predictionId)
  if (error) throw error
}

export async function fetchUserPredictionsMapV2(
  tenCompId: string,
  userId: string
): Promise<Map<string, PredictionV2>> {
  const { data, error } = await supabase
    .from('predictions')
    .select('id, ten_comp_id, match_id, home_score, away_score, home_score_et, away_score_et, predicted_pk_winner_id, points_earned, created_at, updated_at')
    .eq('ten_comp_id', tenCompId)
    .eq('user_id', userId)
  if (error) throw error
  const preds = (data ?? []) as PredictionV2[]
  return new Map(preds.map(p => [p.match_id, p]))
}

export interface PredictionSummaryV2 {
  home_score: number
  away_score: number
  // Solo relevantes en knockout (Mundial 16avos en adelante): tiempo extra y
  // ganador en penales. Null en fase de grupos / ligas, donde el agrupado
  // colapsa naturalmente al marcador de 90'.
  home_score_et: number | null
  away_score_et: number | null
  pk_winner_id: string | null
  // Puntos que suma este desenlace con el scoring del Ten-Comp (0 si el partido
  // aún no fue calculado). Igual para todas las apuestas del grupo, ya que
  // comparten desenlace y scoring.
  points_earned: number
  count: number
}

// Apuestas de los primeros N del ranking para un partido (con nombre y rank).
// La RLS de `predictions` ya autoriza a un miembro aprobado a leer ajenas de
// partidos comenzados, así que esto solo devuelve datos una vez arrancó el
// partido. Incluye al usuario del top aunque no haya apostado (scores en null).
export interface TopRankPrediction {
  user_id: string
  display_name: string
  rank: number
  home_score: number | null
  away_score: number | null
  home_score_et: number | null
  away_score_et: number | null
  pk_winner_id: string | null
  points_earned: number | null
}

export async function fetchTopRankPredictions(
  tenCompId: string,
  matchId: string,
  limit = 10
): Promise<TopRankPrediction[]> {
  const { data: top, error: topErr } = await supabase
    .from('leaderboard')
    .select('user_id, display_name, rank')
    .eq('ten_comp_id', tenCompId)
    .order('rank')
    .limit(limit)
  if (topErr) throw topErr

  const rows = (top ?? []) as { user_id: string; display_name: string; rank: number }[]
  if (rows.length === 0) return []

  const { data: preds, error: predErr } = await supabase
    .from('predictions')
    .select('user_id, home_score, away_score, home_score_et, away_score_et, predicted_pk_winner_id, points_earned')
    .eq('ten_comp_id', tenCompId)
    .eq('match_id', matchId)
    .in('user_id', rows.map(r => r.user_id))
  if (predErr) throw predErr

  const predMap = new Map(
    ((preds ?? []) as Array<{
      user_id: string
      home_score: number
      away_score: number
      home_score_et: number | null
      away_score_et: number | null
      predicted_pk_winner_id: string | null
      points_earned: number | null
    }>).map(p => [p.user_id, p])
  )

  return rows.map(r => {
    const p = predMap.get(r.user_id)
    return {
      user_id: r.user_id,
      display_name: r.display_name,
      rank: r.rank,
      home_score: p?.home_score ?? null,
      away_score: p?.away_score ?? null,
      home_score_et: p?.home_score_et ?? null,
      away_score_et: p?.away_score_et ?? null,
      pk_winner_id: p?.predicted_pk_winner_id ?? null,
      points_earned: p?.points_earned ?? null,
    }
  })
}

export async function fetchMatchPredictionsSummaryV2(
  tenCompId: string,
  matchId: string
): Promise<{ summary: PredictionSummaryV2[]; totalPredictions: number }> {
  const { data, error } = await supabase
    .from('predictions')
    .select('home_score, away_score, home_score_et, away_score_et, predicted_pk_winner_id, points_earned')
    .eq('ten_comp_id', tenCompId)
    .eq('match_id', matchId)
  if (error) throw error

  const map = new Map<string, PredictionSummaryV2>()
  for (const row of (data ?? []) as Array<{
    home_score: number
    away_score: number
    home_score_et: number | null
    away_score_et: number | null
    predicted_pk_winner_id: string | null
    points_earned: number | null
  }>) {
    // La clave incluye ET y ganador de penales: dos apuestas con el mismo 90'
    // pero distinto desenlace de knockout son filas distintas.
    const key = `${row.home_score}-${row.away_score}-${row.home_score_et ?? ''}-${row.away_score_et ?? ''}-${row.predicted_pk_winner_id ?? ''}`
    if (!map.has(key)) map.set(key, {
      home_score: row.home_score,
      away_score: row.away_score,
      home_score_et: row.home_score_et,
      away_score_et: row.away_score_et,
      pk_winner_id: row.predicted_pk_winner_id,
      points_earned: 0,
      count: 0,
    })
    const entry = map.get(key)!
    entry.count++
    // Todas las filas del grupo suman lo mismo; tomamos el máximo por si alguna
    // quedó sin recalcular (null → 0).
    entry.points_earned = Math.max(entry.points_earned, row.points_earned ?? 0)
  }

  const summary = Array.from(map.values()).sort((a, b) => b.count - a.count)
  return { summary, totalPredictions: data?.length ?? 0 }
}
