// Tipos del modelo multi-tenant v2 (PencaLes 2.0).
// Jerarquía: Tenant (empresa) → Ten-Comp (instancia) → Usuario · Competencia (catálogo).

export type TenantStatus = 'active' | 'suspended'

export interface Tenant {
  id: string
  name: string
  slug: string
  logo_url: string | null
  status: TenantStatus
  plan: string
  max_ten_comps: number | null
  max_members_per_ten_comp: number | null
  notes: string | null
}

export type TenantRoleName = 'admin' | 'loader'

export interface TenantRole {
  tenant_id: string
  user_id: string
  role: TenantRoleName
}

export type CompetitionStatus = 'draft' | 'active' | 'finished' | 'archived'

export interface Competition {
  id: string
  name: string
  sport: string
  season: string | null
  status: CompetitionStatus
  start_date: string | null
  end_date: string | null
  advancement_engine: string | null
  default_menu: MenuConfig
  default_scoring: ScoringConfig
}

// Qué ítems del menú ve un Ten-Comp. Ausente o true = visible.
export interface MenuConfig {
  fixture?: boolean
  grupos?: boolean
  cuadro?: boolean
  ranking?: boolean
  posiciones?: boolean   // tabla de liga (todos contra todos); opt-in, solo visible si true
  mis_predicciones?: boolean
  mas_puntos?: boolean
  subgrupos?: boolean
  ayuda?: boolean
}

export type TenCompVisibility = 'public' | 'private'
export type TenCompStatus = 'open' | 'closed' | 'archived'
export type MemberStatus = 'pending' | 'approved' | 'blocked'

export interface TenComp {
  id: string
  tenant_id: string
  competition_id: string
  name: string
  slug: string
  visibility: TenCompVisibility
  status: TenCompStatus
  menu_config: MenuConfig
  bonus_enabled: boolean
}

export interface TenCompScoring {
  ten_comp_id: string
  exact_score_points: number
  correct_winner_points: number
  correct_draw_points: number
  knockout_exact_score_bonus: number
  correct_et_result_points: number
  correct_pk_winner_points: number
}

// Puntaje "plantilla" de una competencia (competitions.default_scoring): mismos
// campos que TenCompScoring pero sin atarse a un Ten-Comp.
export type ScoringConfig = Omit<TenCompScoring, 'ten_comp_id'>

type TenantSummary = Pick<Tenant, 'id' | 'name' | 'slug' | 'logo_url'>
type CompetitionSummary = Pick<Competition, 'id' | 'name' | 'sport' | 'status'>

// Una penca del usuario (pestaña "Mis Pencas").
export interface MyPenca {
  tenComp: TenComp
  tenant: TenantSummary
  competition: CompetitionSummary
  memberStatus: MemberStatus
  createdAt: string
}

// Una penca pública para explorar.
export interface PublicPenca {
  tenComp: TenComp
  tenant: TenantSummary
  competition: CompetitionSummary
  createdAt: string
}

// Contexto activo resuelto por slug (/p/:slug/*).
export interface TenCompContextData {
  tenComp: TenComp
  tenant: Tenant
  competition: Competition
  scoring: TenCompScoring | null
  memberStatus: MemberStatus | null // null = no es miembro (penca pública sin unirse)
  isTenCompAdmin: boolean
}
