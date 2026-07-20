// Tipos generados manualmente hasta correr `supabase gen types typescript`
// Actualizar cuando el schema de Supabase esté definido

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[]

export interface Database {
  public: {
    Tables: {
      groups: {
        Row: Group
        Insert: Omit<Group, 'id'>
        Update: Partial<Omit<Group, 'id'>>
      }
      phases: {
        Row: Phase
        Insert: Omit<Phase, 'id'>
        Update: Partial<Omit<Phase, 'id'>>
      }
      stadiums: {
        Row: Stadium
        Insert: Omit<Stadium, 'id'>
        Update: Partial<Omit<Stadium, 'id'>>
      }
      teams: {
        Row: Team
        Insert: Omit<Team, 'id'>
        Update: Partial<Omit<Team, 'id'>>
      }
      matches: {
        Row: Match
        Insert: Omit<Match, 'id'>
        Update: Partial<Omit<Match, 'id'>>
      }
      profiles: {
        Row: Profile
        Insert: Omit<Profile, 'id'>
        Update: Partial<Omit<Profile, 'id'>>
      }
      predictions: {
        Row: Prediction
        Insert: Omit<Prediction, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<Prediction, 'id' | 'user_id' | 'match_id' | 'created_at'>>
      }
      scoring_config: {
        Row: ScoringConfig
        Insert: Omit<ScoringConfig, 'id'>
        Update: Partial<Omit<ScoringConfig, 'id'>>
      }
      knockout_slot_rules: {
        Row: KnockoutSlotRule
        Insert: Omit<KnockoutSlotRule, 'id'>
        Update: Partial<Omit<KnockoutSlotRule, 'id'>>
      }
    }
    Views: {
      group_standings: {
        Row: GroupStanding
      }
      best_third_ranking: {
        Row: BestThirdRanking
      }
      leaderboard: {
        Row: LeaderboardEntry
      }
    }
    Functions: Record<string, never>
    Enums: {
      match_status: 'scheduled' | 'live' | 'finished'
      slot_type: 'home' | 'away'
      rule_type: 'group_position' | 'match_winner' | 'best_third'
    }
  }
}

// --- Entidades ---

export interface Group {
  id: string
  name: string        // 'A' ... 'L'
  order: number       // 1 ... 12
}

export interface Phase {
  id: string
  name: string        // 'Fase de Grupos', 'Dieciseisavos', etc.
  order: number       // 1=grupos, 2=R32, 3=R16, 4=QF, 5=SF, 6=3er, 7=Final
  has_extra_time: boolean
  has_penalties: boolean
}

export interface Stadium {
  id: string
  name: string
  city: string
  country: string     // 'Estados Unidos' | 'México' | 'Canadá'
  address: string | null
  capacity: number | null
  photo_urls: string[]
  latitude: number | null
  longitude: number | null
}

export interface Team {
  id: string
  name: string
  abbreviation: string   // 3 chars, e.g. 'ARG'
  flag_url: string | null
  group_id: string
  group_position: number // seeding position 1-4
  is_confirmed: boolean  // false for TBD teams
  placeholder_name: string | null  // e.g. 'UEFA Playoff A'
}

export interface Match {
  id: string
  match_number: number       // 1-104
  phase_id: string
  group_id: string | null    // null for knockout
  home_team_id: string | null
  away_team_id: string | null
  home_slot_label: string | null  // e.g. '1A', 'W73', '3ABCDF'
  away_slot_label: string | null
  stadium_id: string
  match_date: string         // ISO date 'YYYY-MM-DD'
  match_time: string         // 'HH:MM'
  status: 'scheduled' | 'live' | 'finished'
  // Resultado 90 min
  home_score_90: number | null
  away_score_90: number | null
  // Tiempo extra (goles adicionales)
  home_score_et: number | null
  away_score_et: number | null
  // Penales
  home_score_pk: number | null
  away_score_pk: number | null
  winner_team_id: string | null
}

export interface Profile {
  id: string          // = auth.users.id
  username: string
  display_name: string
  avatar_url: string | null
  is_active: boolean  // true por defecto al registrarse; el admin puede desactivar
  is_admin: boolean
  is_loader: boolean  // puede cargar resultados, sin acceso al resto del admin
  is_super_admin?: boolean // v2: acceso total a la plataforma (ausente en datos v1)
  must_change_password?: boolean // v2: si true, el login obliga a setear nueva pass
  wants_news: boolean // recibir novedades/noticias por email (opt-out, default true)
  created_at: string
}

export interface Prediction {
  id: string
  user_id: string
  match_id: string
  // 90 min
  home_score: number
  away_score: number
  // Tiempo extra (solo knockout, si predicted draw)
  home_score_et: number | null
  away_score_et: number | null
  // Penales (solo knockout)
  predicted_pk_winner_id: string | null
  points_earned: number | null  // null hasta que termine el partido
  created_at: string
  updated_at: string
}

export interface ScoringConfig {
  id: string
  name: string
  is_active: boolean
  // Fase de grupos
  exact_score_points: number       // e.g. 3
  correct_winner_points: number    // e.g. 1
  correct_draw_points: number      // e.g. 1
  // Bonus knockout
  knockout_exact_score_bonus: number  // extra pts por resultado exacto en eliminatoria
  // Tiempo extra
  correct_et_result_points: number    // acertás si hubo ET y resultado
  // Penales
  correct_pk_winner_points: number    // acertás ganador en penales
}

export interface KnockoutSlotRule {
  id: string
  match_id: string
  slot: 'home' | 'away'
  rule_type: 'group_position' | 'match_winner' | 'best_third'
  source_group_id: string | null    // para group_position y best_third
  source_match_id: string | null    // para match_winner
  position: number | null           // 1=1ro, 2=2do, 3=3ro
  third_groups: string[] | null     // grupos que aportan 3ros candidatos
}

// --- Vistas ---

export interface GroupStanding {
  team_id: string
  group_id: string
  group_name: string
  group_order: number
  position: number
  has_override: boolean
  team_name: string
  team_abbreviation: string
  team_flag_url: string | null
  is_confirmed: boolean
  placeholder_name: string | null
  pj: number   // jugados
  pg: number   // ganados
  pe: number   // empatados
  pp: number   // perdidos
  gf: number   // goles a favor
  gc: number   // goles en contra
  gd: number   // diferencia
  pts: number  // puntos
}

export interface BestThirdRanking {
  team_id: string
  group_id: string
  group_name: string
  rank: number
  has_override: boolean
  team_name: string
  team_flag_url: string | null
  pj: number
  pg: number
  pe: number
  pp: number
  gf: number
  gc: number
  gd: number
  pts: number
}

export interface LeaderboardEntry {
  user_id: string
  username: string
  display_name: string
  avatar_url: string | null
  total_points: number
  predictions_count: number
  exact_scores: number
  correct_winners: number
  rank: number
}

// --- Subgrupos ---

export interface Subgrupo {
  id: string
  name: string
  creator_id: string
  is_active: boolean
  created_at: string
}

export interface SubgrupoMember {
  subgrupo_id: string
  user_id: string
  joined_at: string
}

export interface SubgrupoRankingEntry {
  subgrupo_id: string
  user_id: string
  total_points: number
  global_rank: number
  predictions_count: number
  exact_scores: number
  display_name: string
  username: string
  avatar_url: string | null
  subgrupo_rank: number
}
