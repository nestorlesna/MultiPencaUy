import { supabase } from '../lib/supabase'
import type {
  MyPenca,
  PublicPenca,
  TenComp,
  Tenant,
  Competition,
  TenCompScoring,
  MemberStatus,
} from '../types/tenant'

// Columnas reutilizables del Ten-Comp y sus relaciones.
const TEN_COMP_COLS =
  'id, tenant_id, competition_id, name, slug, visibility, status, menu_config, bonus_enabled, created_at'
const TENANT_COLS = 'id, name, slug, logo_url'
const COMP_COLS = 'id, name, sport, status'

// Pencas del usuario (cualquier estado de membresía salvo bloqueado).
export async function fetchMyTenComps(userId: string): Promise<MyPenca[]> {
  const { data, error } = await supabase
    .from('ten_comp_members')
    .select(
      `status,
       ten_comps:ten_comp_id (
         ${TEN_COMP_COLS},
         tenant:tenant_id ( ${TENANT_COLS} ),
         competition:competition_id ( ${COMP_COLS} )
       )`
    )
    .eq('user_id', userId)
    .neq('status', 'blocked')

  if (error) throw error

  return (data ?? [])
    .map((row: any): MyPenca | null => {
      const tc = row.ten_comps
      if (!tc) return null
      return {
        tenComp: stripTenComp(tc),
        tenant: tc.tenant,
        competition: tc.competition,
        memberStatus: row.status as MemberStatus,
        createdAt: tc.created_at,
      }
    })
    .filter((p): p is MyPenca => p !== null)
    // Más reciente primero (regla de selección de competencia activa).
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

// Pencas públicas para explorar / auto-seleccionar (más reciente primero).
// Excluye solo las archivadas; sirve también de candidatas para EntryRedirect.
export async function fetchPublicTenComps(): Promise<PublicPenca[]> {
  const { data, error } = await supabase
    .from('ten_comps')
    .select(
      `${TEN_COMP_COLS},
       tenant:tenant_id ( ${TENANT_COLS} ),
       competition:competition_id ( ${COMP_COLS} )`
    )
    .eq('visibility', 'public')
    .neq('status', 'archived')
    .order('created_at', { ascending: false })

  if (error) throw error

  return (data ?? []).map((tc: any): PublicPenca => ({
    tenComp: stripTenComp(tc),
    tenant: tc.tenant,
    competition: tc.competition,
    createdAt: tc.created_at,
  }))
}

// Resuelve qué Ten-Comp debe quedar activo al entrar sin slug en la URL.
// Precedencia: última usada (localStorage) → mi penca más reciente → pública más
// reciente → null (no hay candidato). Implementación client-side, sin RPC.
export async function resolveEntryTenCompSlug(
  userId: string | null,
  lastSlug: string | null
): Promise<string | null> {
  const [mine, publics] = await Promise.all([
    userId ? fetchMyTenComps(userId) : Promise.resolve([] as MyPenca[]),
    fetchPublicTenComps(),
  ])

  // 1. Última usada, si sigue accesible (mía o pública activa).
  if (lastSlug) {
    const stillAccessible =
      mine.some(p => p.tenComp.slug === lastSlug) ||
      publics.some(p => p.tenComp.slug === lastSlug)
    if (stillAccessible) return lastSlug
  }

  // 2. Mi penca más reciente (ya vienen ordenadas desc).
  if (mine.length > 0) return mine[0].tenComp.slug

  // 3. Pública más reciente (ya vienen ordenadas desc).
  if (publics.length > 0) return publics[0].tenComp.slug

  // 4. Sin candidato.
  return null
}

// Resuelve una penca por slug + scoring + estado de membresía del usuario.
export async function resolveTenCompBySlug(
  slug: string,
  userId: string | null
): Promise<{
  tenComp: TenComp
  tenant: Tenant
  competition: Competition
  scoring: TenCompScoring | null
  memberStatus: MemberStatus | null
} | null> {
  const { data, error } = await supabase
    .from('ten_comps')
    .select(
      `${TEN_COMP_COLS},
       tenant:tenant_id ( id, name, slug, logo_url, status, plan, max_ten_comps, max_members_per_ten_comp ),
       competition:competition_id ( id, name, sport, season, status, start_date, end_date, advancement_engine )`
    )
    .eq('slug', slug)
    .maybeSingle()

  if (error) throw error
  if (!data) return null

  const tc: any = data

  const [scoringRes, memberRes] = await Promise.all([
    supabase.from('ten_comp_scoring').select('*').eq('ten_comp_id', tc.id).maybeSingle(),
    userId
      ? supabase
          .from('ten_comp_members')
          .select('status')
          .eq('ten_comp_id', tc.id)
          .eq('user_id', userId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null } as any),
  ])

  return {
    tenComp: stripTenComp(tc),
    tenant: tc.tenant,
    competition: tc.competition,
    scoring: (scoringRes.data as TenCompScoring) ?? null,
    memberStatus: (memberRes.data?.status as MemberStatus) ?? null,
  }
}

// Unirse a una penca pública: queda aprobado al instante.
export async function joinPublicTenComp(tenCompId: string): Promise<{ slug: string; status: string }> {
  const { data, error } = await supabase.rpc('join_ten_comp_public', { p_ten_comp_id: tenCompId })
  if (error) throw error
  return data as { slug: string; status: string }
}

// Unirse a una penca privada por código: queda pendiente de aprobación.
export async function joinPrivateTenComp(code: string): Promise<{ slug: string; status: string }> {
  const { data, error } = await supabase.rpc('join_ten_comp_private', { p_code: code.toUpperCase() })
  if (error) throw error
  return data as { slug: string; status: string }
}

export async function leaveTenComp(tenCompId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('ten_comp_members')
    .delete()
    .match({ ten_comp_id: tenCompId, user_id: userId })
  if (error) throw error
}

// Quita las relaciones anidadas para devolver un TenComp plano.
function stripTenComp(tc: any): TenComp {
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
  }
}
