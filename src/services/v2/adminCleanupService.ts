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

export async function deleteCompetition(competitionId: string): Promise<void> {
  const { error: orphanErr } = await supabase
    .from('teams')
    .update({ competition_id: null, group_id: null })
    .eq('competition_id', competitionId)
  if (orphanErr) throw orphanErr

  const { error: delErr } = await supabase
    .from('competitions')
    .delete()
    .eq('id', competitionId)
  if (delErr) throw delErr
}

export async function deleteTenant(tenantId: string): Promise<void> {
  if (tenantId === PUBLIC_TENANT_ID) throw new Error('El tenant Público no se puede eliminar.')

  const { data: ownedComps, error: fetchErr } = await supabase
    .from('competitions')
    .select('id')
    .eq('owner_tenant_id', tenantId)
  if (fetchErr) throw fetchErr

  for (const comp of (ownedComps ?? [])) {
    const { count, error: countErr } = await supabase
      .from('ten_comps')
      .select('id', { count: 'exact', head: true })
      .eq('competition_id', comp.id)
      .neq('tenant_id', tenantId)
    if (countErr) throw countErr

    if ((count ?? 0) > 0) {
      const { error } = await supabase
        .from('competitions')
        .update({ owner_tenant_id: null })
        .eq('id', comp.id)
      if (error) throw error
    } else {
      await deleteCompetition(comp.id)
    }
  }

  const { error: delErr } = await supabase
    .from('tenants')
    .delete()
    .eq('id', tenantId)
  if (delErr) throw delErr
}
