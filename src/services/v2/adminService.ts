import { supabase } from '../../lib/supabase'
import type {
  Tenant,
  TenComp,
  Competition,
  CompetitionStatus,
  TenCompScoring,
  MenuConfig,
  TenantRoleName,
} from '../../types/tenant'

// ════════════════════════════════════════════════════════════════════════════
// SUPER-ADMIN · TENANTS
// ════════════════════════════════════════════════════════════════════════════

const TENANT_COLS =
  'id, name, slug, logo_url, status, plan, max_ten_comps, max_members_per_ten_comp'

export async function fetchTenants(): Promise<Tenant[]> {
  const { data, error } = await supabase
    .from('tenants')
    .select(TENANT_COLS)
    .order('name')
  if (error) throw error
  return (data ?? []) as Tenant[]
}

export interface TenantInput {
  name: string
  slug: string
  logo_url?: string | null
  status?: 'active' | 'suspended'
  plan?: string
  max_ten_comps?: number | null
  max_members_per_ten_comp?: number | null
}

export async function createTenant(input: TenantInput): Promise<Tenant> {
  const { data, error } = await supabase
    .from('tenants')
    .insert({
      name: input.name,
      slug: input.slug,
      logo_url: input.logo_url ?? null,
      status: input.status ?? 'active',
      plan: input.plan ?? 'free',
      max_ten_comps: input.max_ten_comps ?? null,
      max_members_per_ten_comp: input.max_members_per_ten_comp ?? null,
    })
    .select(TENANT_COLS)
    .single()
  if (error) throw error
  return data as Tenant
}

export async function updateTenant(id: string, patch: Partial<TenantInput>): Promise<void> {
  const { error } = await supabase.from('tenants').update(patch).eq('id', id)
  if (error) throw error
}

export async function fetchTenantsByIds(ids: string[]): Promise<Tenant[]> {
  if (ids.length === 0) return []
  const { data, error } = await supabase
    .from('tenants')
    .select(TENANT_COLS)
    .in('id', ids)
    .order('name')
  if (error) throw error
  return (data ?? []) as Tenant[]
}

export async function fetchTenantBySlug(slug: string): Promise<Tenant | null> {
  const { data, error } = await supabase
    .from('tenants')
    .select(TENANT_COLS)
    .eq('slug', slug)
    .maybeSingle()
  if (error) throw error
  return (data as Tenant) ?? null
}

// ════════════════════════════════════════════════════════════════════════════
// ROLES DE TENANT (admin / loader)
// ════════════════════════════════════════════════════════════════════════════

export interface TenantRoleRow {
  tenant_id: string
  user_id: string
  role: TenantRoleName
  username: string | null
  display_name: string | null
}

export async function fetchTenantRoles(tenantId: string): Promise<TenantRoleRow[]> {
  const { data, error } = await supabase
    .from('tenant_roles')
    .select('tenant_id, user_id, role, profile:user_id ( username, display_name )')
    .eq('tenant_id', tenantId)
  if (error) throw error
  return (data ?? []).map((r: any) => ({
    tenant_id: r.tenant_id,
    user_id: r.user_id,
    role: r.role,
    username: r.profile?.username ?? null,
    display_name: r.profile?.display_name ?? null,
  }))
}

export async function assignTenantRole(
  tenantId: string,
  userId: string,
  role: TenantRoleName
): Promise<void> {
  const { error } = await supabase
    .from('tenant_roles')
    .upsert({ tenant_id: tenantId, user_id: userId, role }, { onConflict: 'tenant_id,user_id' })
  if (error) throw error
}

export async function removeTenantRole(tenantId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('tenant_roles')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
  if (error) throw error
}

// Búsqueda de usuarios por username / display_name (para asignar roles).
export interface ProfileLite {
  id: string
  username: string | null
  display_name: string | null
  avatar_url: string | null
}

export async function searchProfiles(term: string): Promise<ProfileLite[]> {
  const q = term.trim()
  if (q.length < 2) return []
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, display_name, avatar_url')
    .or(`username.ilike.%${q}%,display_name.ilike.%${q}%`)
    .eq('is_active', true)
    .limit(10)
  if (error) throw error
  return (data ?? []) as ProfileLite[]
}

// ════════════════════════════════════════════════════════════════════════════
// COMPETENCIAS (catálogo)
// ════════════════════════════════════════════════════════════════════════════

const COMP_COLS = 'id, name, sport, season, status, start_date, end_date, advancement_engine'

export async function fetchCompetitions(): Promise<Competition[]> {
  const { data, error } = await supabase
    .from('competitions')
    .select(COMP_COLS)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as Competition[]
}

export async function fetchCompetition(id: string): Promise<Competition | null> {
  const { data, error } = await supabase
    .from('competitions')
    .select(COMP_COLS)
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return (data as Competition) ?? null
}

export interface CompetitionInput {
  name: string
  sport: string
  season?: string | null
  status?: CompetitionStatus
  start_date?: string | null
  end_date?: string | null
  advancement_engine?: string | null
}

export async function createCompetition(input: CompetitionInput): Promise<Competition> {
  const { data, error } = await supabase
    .from('competitions')
    .insert({
      name: input.name,
      sport: input.sport,
      season: input.season ?? null,
      status: input.status ?? 'draft',
      start_date: input.start_date ?? null,
      end_date: input.end_date ?? null,
      advancement_engine: input.advancement_engine ?? null,
    })
    .select(COMP_COLS)
    .single()
  if (error) throw error
  return data as Competition
}

export async function updateCompetition(id: string, patch: Partial<CompetitionInput>): Promise<void> {
  const { error } = await supabase.from('competitions').update(patch).eq('id', id)
  if (error) throw error
}

// Catálogo de motores de avance (para el selector al crear una competencia).
export interface AdvancementEngine {
  id: string
  name: string
  description: string | null
}

export async function fetchAdvancementEngines(): Promise<AdvancementEngine[]> {
  const { data, error } = await supabase
    .from('advancement_engines')
    .select('id, name, description')
    .order('name')
  if (error) throw error
  return (data ?? []) as AdvancementEngine[]
}

// ════════════════════════════════════════════════════════════════════════════
// TEN-COMPS (por tenant)
// ════════════════════════════════════════════════════════════════════════════

export interface TenantTenComp extends TenComp {
  join_code: string | null
  competition_name: string
  member_count: number
  pending_count: number
}

export async function fetchTenantTenComps(tenantId: string): Promise<TenantTenComp[]> {
  const { data, error } = await supabase
    .from('ten_comps')
    .select(
      `id, tenant_id, competition_id, name, slug, visibility, status, menu_config,
       bonus_enabled, join_code,
       competition:competition_id ( name ),
       members:ten_comp_members ( status )`
    )
    .eq('tenant_id', tenantId)
    .order('name')
  if (error) throw error
  return (data ?? []).map((tc: any): TenantTenComp => {
    const members: { status: string }[] = tc.members ?? []
    return {
      id: tc.id,
      tenant_id: tc.tenant_id,
      competition_id: tc.competition_id,
      name: tc.name,
      slug: tc.slug,
      visibility: tc.visibility,
      status: tc.status,
      menu_config: tc.menu_config ?? {},
      bonus_enabled: tc.bonus_enabled,
      join_code: tc.join_code ?? null,
      competition_name: tc.competition?.name ?? '',
      member_count: members.filter(m => m.status !== 'blocked').length,
      pending_count: members.filter(m => m.status === 'pending').length,
    }
  })
}

export interface CreateTenCompInput {
  tenantId: string
  competitionId: string
  name: string
  slug: string
  visibility: 'public' | 'private'
  bonusEnabled: boolean
}

export async function createTenComp(input: CreateTenCompInput): Promise<{
  ten_comp_id: string
  slug: string
  join_code: string | null
}> {
  const { data, error } = await supabase.rpc('create_ten_comp', {
    p_tenant: input.tenantId,
    p_competition: input.competitionId,
    p_name: input.name,
    p_slug: input.slug,
    p_visibility: input.visibility,
    p_bonus_enabled: input.bonusEnabled,
  })
  if (error) throw error
  return data as { ten_comp_id: string; slug: string; join_code: string | null }
}

// Edición directa del Ten-Comp (RLS: is_tenant_admin). Menú, status, visibilidad, nombre.
export async function updateTenComp(
  id: string,
  patch: Partial<Pick<TenComp, 'name' | 'status' | 'visibility' | 'menu_config' | 'bonus_enabled'>>
): Promise<void> {
  const { error } = await supabase.from('ten_comps').update(patch).eq('id', id)
  if (error) throw error
}

export async function updateMenuConfig(tenCompId: string, menu: MenuConfig): Promise<void> {
  const { error } = await supabase
    .from('ten_comps')
    .update({ menu_config: menu })
    .eq('id', tenCompId)
  if (error) throw error
}

// ════════════════════════════════════════════════════════════════════════════
// MIEMBROS (admin del Ten-Comp)
// ════════════════════════════════════════════════════════════════════════════

export interface MemberRow {
  user_id: string
  status: 'pending' | 'approved' | 'blocked'
  joined_at: string
  username: string | null
  display_name: string | null
  avatar_url: string | null
}

export async function fetchMembers(tenCompId: string): Promise<MemberRow[]> {
  const { data, error } = await supabase
    .from('ten_comp_members')
    .select('user_id, status, joined_at, profile:user_id ( username, display_name, avatar_url )')
    .eq('ten_comp_id', tenCompId)
    .order('joined_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map((r: any): MemberRow => ({
    user_id: r.user_id,
    status: r.status,
    joined_at: r.joined_at,
    username: r.profile?.username ?? null,
    display_name: r.profile?.display_name ?? null,
    avatar_url: r.profile?.avatar_url ?? null,
  }))
}

export async function approveMember(tenCompId: string, userId: string): Promise<void> {
  const { error } = await supabase.rpc('approve_member', {
    p_ten_comp: tenCompId,
    p_user: userId,
  })
  if (error) throw error
}

// Cambiar estado (bloquear / re-habilitar) — RLS permite al admin del Ten-Comp.
export async function setMemberStatus(
  tenCompId: string,
  userId: string,
  status: 'pending' | 'approved' | 'blocked'
): Promise<void> {
  const patch: Record<string, unknown> = { status }
  if (status === 'approved') patch.approved_at = new Date().toISOString()
  const { error } = await supabase
    .from('ten_comp_members')
    .update(patch)
    .eq('ten_comp_id', tenCompId)
    .eq('user_id', userId)
  if (error) throw error
}

// ════════════════════════════════════════════════════════════════════════════
// SCORING y BONUS CONFIG (admin del Ten-Comp)
// ════════════════════════════════════════════════════════════════════════════

export async function updateScoring(
  tenCompId: string,
  scoring: Omit<TenCompScoring, 'ten_comp_id'>
): Promise<void> {
  const { error } = await supabase
    .from('ten_comp_scoring')
    .update(scoring)
    .eq('ten_comp_id', tenCompId)
  if (error) throw error
}

export interface BonusConfigRow {
  ten_comp_id: string
  bonus_type: string
  points: number
  is_active: boolean
}

export async function fetchBonusConfig(tenCompId: string): Promise<BonusConfigRow[]> {
  const { data, error } = await supabase
    .from('ten_comp_bonus_config')
    .select('ten_comp_id, bonus_type, points, is_active')
    .eq('ten_comp_id', tenCompId)
    .order('bonus_type')
  if (error) throw error
  return (data ?? []) as BonusConfigRow[]
}

export async function updateBonusPoints(
  tenCompId: string,
  bonusType: string,
  points: number
): Promise<void> {
  const { error } = await supabase
    .from('ten_comp_bonus_config')
    .update({ points })
    .eq('ten_comp_id', tenCompId)
    .eq('bonus_type', bonusType)
  if (error) throw error
}

// ════════════════════════════════════════════════════════════════════════════
// RESULTADOS (cargador / super-admin) — scoped por competencia vía RPC
// ════════════════════════════════════════════════════════════════════════════

export interface SetMatchResultInput {
  homeScore90: number
  awayScore90: number
  homeScoreEt?: number | null
  awayScoreEt?: number | null
  homeScorePk?: number | null
  awayScorePk?: number | null
}

export interface SetMatchResultResult {
  predictions_updated: number
  bonus_rows_updated: number
}

// set_match_result hace UPDATE + calculate_match_points + calculate_bonus_points en una llamada.
export async function setMatchResultV2(
  matchId: string,
  r: SetMatchResultInput
): Promise<SetMatchResultResult> {
  const { data, error } = await supabase.rpc('set_match_result', {
    p_match_id: matchId,
    p_home_90: r.homeScore90,
    p_away_90: r.awayScore90,
    p_home_et: r.homeScoreEt ?? null,
    p_away_et: r.awayScoreEt ?? null,
    p_home_pk: r.homeScorePk ?? null,
    p_away_pk: r.awayScorePk ?? null,
  })
  if (error) throw error
  return data as SetMatchResultResult
}

export interface RecalculateAllResult {
  matches_processed: number
  predictions_updated: number
  knockout_slots_updated: number
  bonus_rows_updated: number
}

export async function recalculateAllV2(competitionId: string): Promise<RecalculateAllResult> {
  const { data, error } = await supabase.rpc('recalculate_all', {
    p_competition_id: competitionId,
  })
  if (error) throw error
  return data as RecalculateAllResult
}

export async function populateKnockoutV2(competitionId: string): Promise<number> {
  const { data, error } = await supabase.rpc('populate_knockout', {
    p_competition_id: competitionId,
  })
  if (error) throw error
  return data as number
}
