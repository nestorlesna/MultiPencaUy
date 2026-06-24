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
  count: number
}

export async function fetchMatchPredictionsSummaryV2(
  tenCompId: string,
  matchId: string
): Promise<{ summary: PredictionSummaryV2[]; totalPredictions: number }> {
  const { data, error } = await supabase
    .from('predictions')
    .select('home_score, away_score')
    .eq('ten_comp_id', tenCompId)
    .eq('match_id', matchId)
  if (error) throw error

  const map = new Map<string, PredictionSummaryV2>()
  for (const row of (data ?? []) as Array<{ home_score: number; away_score: number }>) {
    const key = `${row.home_score}-${row.away_score}`
    if (!map.has(key)) map.set(key, { home_score: row.home_score, away_score: row.away_score, count: 0 })
    map.get(key)!.count++
  }

  const summary = Array.from(map.values()).sort((a, b) => b.count - a.count)
  return { summary, totalPredictions: data?.length ?? 0 }
}
