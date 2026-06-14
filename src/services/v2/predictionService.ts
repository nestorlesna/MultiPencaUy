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
