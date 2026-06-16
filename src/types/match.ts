// Tipos enriquecidos con relaciones (resultado de JOINs)

export interface TeamInfo {
  id: string
  name: string
  abbreviation: string
  flag_url: string | null
  is_confirmed: boolean
  placeholder_name: string | null
}

export interface MatchWithRelations {
  id: string
  match_number: number
  match_datetime: string          // ISO UTC
  status: 'scheduled' | 'finished'
  home_slot_label: string | null
  away_slot_label: string | null
  home_score_90: number | null
  away_score_90: number | null
  home_score_et: number | null
  away_score_et: number | null
  home_score_pk: number | null
  away_score_pk: number | null
  winner_team_id: string | null
  phase: {
    id: string; name: string; order: number
    has_extra_time: boolean; has_penalties: boolean
  }
  group: { id: string; name: string } | null
  stadium: { id: string; name: string; city: string; country: string; timezone: string } | null
  home_team: TeamInfo | null
  away_team: TeamInfo | null
}
