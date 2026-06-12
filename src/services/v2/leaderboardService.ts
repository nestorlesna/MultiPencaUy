import { supabase } from '../../lib/supabase'
import type { LeaderboardEntry } from '../../types'

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
