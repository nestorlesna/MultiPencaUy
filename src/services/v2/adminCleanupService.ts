import { supabase } from '../../lib/supabase'

const PUBLIC_TENANT_ID = '11111111-1111-4111-8111-111111111111'

export interface CompetitionForCleanup {
  id: string
  name: string
  sport: string
  season: string | null
  status: string
  owner_tenant_id: string | null
  ten_comp_count: number
  match_count: number
  team_count: number
}

export interface TenantForCleanup {
  id: string
  name: string
  slug: string
  ten_comp_count: number
  owned_competition_count: number
}

export async function fetchCompetitionsForCleanup(): Promise<CompetitionForCleanup[]> {
  const { data: comps, error: compErr } = await supabase
    .from('competitions')
    .select('id, name, sport, season, status, owner_tenant_id')
    .order('name')
  if (compErr) throw compErr

  const results: CompetitionForCleanup[] = []
  for (const c of (comps ?? [])) {
    const [{ count: tcCount }, { count: mCount }, { count: tmCount }] = await Promise.all([
      supabase.from('ten_comps').select('id', { count: 'exact', head: true }).eq('competition_id', c.id),
      supabase.from('matches').select('id', { count: 'exact', head: true }).eq('competition_id', c.id),
      supabase.from('teams').select('id', { count: 'exact', head: true }).eq('competition_id', c.id),
    ])
    results.push({
      ...c,
      ten_comp_count: tcCount ?? 0,
      match_count: mCount ?? 0,
      team_count: tmCount ?? 0,
    })
  }
  return results
}

export async function fetchTenantsForCleanup(): Promise<TenantForCleanup[]> {
  const { data: tenants, error } = await supabase
    .from('tenants')
    .select('id, name, slug')
    .neq('id', PUBLIC_TENANT_ID)
    .order('name')
  if (error) throw error

  const results: TenantForCleanup[] = []
  for (const t of (tenants ?? [])) {
    const [{ count: tcCount }, { count: compCount }] = await Promise.all([
      supabase.from('ten_comps').select('id', { count: 'exact', head: true }).eq('tenant_id', t.id),
      supabase.from('competitions').select('id', { count: 'exact', head: true }).eq('owner_tenant_id', t.id),
    ])
    results.push({
      ...t,
      ten_comp_count: tcCount ?? 0,
      owned_competition_count: compCount ?? 0,
    })
  }
  return results
}

// Borrado transaccional vía RPC (migración 99). La RPC borra en orden seguro
// los ten_comps (y su cascada de predicciones/bonus), partidos, equipos y la
// competencia — todo-o-nada. Ver supabase/migrations/99_admin_cleanup.sql.
export async function deleteCompetition(competitionId: string): Promise<void> {
  const { error } = await supabase.rpc('admin_delete_competition', {
    p_competition_id: competitionId,
  })
  if (error) throw error
}

// Borra el tenant y resuelve sus competencias propias (quita propiedad si otros
// tenants las usan, o las borra por completo). Transaccional en la RPC.
export async function deleteTenant(tenantId: string): Promise<void> {
  if (tenantId === PUBLIC_TENANT_ID) throw new Error('El tenant Público no se puede eliminar.')

  const { error } = await supabase.rpc('admin_delete_tenant', {
    p_tenant_id: tenantId,
  })
  if (error) throw error
}
