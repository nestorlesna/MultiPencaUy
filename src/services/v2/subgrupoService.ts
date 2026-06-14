import { supabase } from '../../lib/supabase'
import type { SubgrupoRankingEntry } from '../../types'

// Subgrupos (mini-ligas) scoped a un Ten-Comp. Convención v2: scope explícito.

export interface SubgrupoV2 {
  id: string
  ten_comp_id: string
  name: string
  creator_id: string
  is_active: boolean
  created_at: string
}

// Mis subgrupos dentro de un Ten-Comp (vía membresía).
export async function fetchMySubgruposV2(tenCompId: string, userId: string): Promise<SubgrupoV2[]> {
  const { data, error } = await supabase
    .from('subgrupo_members')
    .select('subgrupos!inner(id, ten_comp_id, name, creator_id, is_active, created_at)')
    .eq('user_id', userId)
    .eq('subgrupos.ten_comp_id', tenCompId)
  if (error) throw error
  const list = (data ?? []).map((d: any) => d.subgrupos as SubgrupoV2)
  return list.sort((a, b) => a.name.localeCompare(b.name))
}

export async function fetchSubgrupoDetailV2(id: string): Promise<SubgrupoV2 | null> {
  const { data, error } = await supabase
    .from('subgrupos')
    .select('id, ten_comp_id, name, creator_id, is_active, created_at')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return (data as SubgrupoV2) ?? null
}

export async function fetchSubgrupoRankingV2(subgrupoId: string): Promise<SubgrupoRankingEntry[]> {
  const { data, error } = await supabase
    .from('subgrupo_ranking')
    .select('*')
    .eq('subgrupo_id', subgrupoId)
    .order('subgrupo_rank')
  if (error) throw error
  return (data ?? []) as SubgrupoRankingEntry[]
}

export async function fetchSubgrupoMemberIdsV2(subgrupoId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('subgrupo_members')
    .select('user_id')
    .eq('subgrupo_id', subgrupoId)
  if (error) throw error
  return (data ?? []).map((d: any) => d.user_id)
}

// Miembros aprobados del Ten-Comp (candidatos a sumar al subgrupo).
export interface MemberOption {
  id: string
  username: string | null
  display_name: string | null
  avatar_url: string | null
}

export async function fetchTenCompMemberOptionsV2(tenCompId: string): Promise<MemberOption[]> {
  const { data, error } = await supabase
    .from('ten_comp_members')
    .select('user_id, profile:user_id ( username, display_name, avatar_url )')
    .eq('ten_comp_id', tenCompId)
    .eq('status', 'approved')
  if (error) throw error
  return (data ?? []).map((r: any): MemberOption => ({
    id: r.user_id,
    username: r.profile?.username ?? null,
    display_name: r.profile?.display_name ?? null,
    avatar_url: r.profile?.avatar_url ?? null,
  }))
}

// Crear subgrupo + sumar al creador como miembro (dos pasos; RLS permite ambos al creador).
export async function createSubgrupoV2(
  tenCompId: string,
  name: string,
  creatorId: string
): Promise<SubgrupoV2> {
  const { data, error } = await supabase
    .from('subgrupos')
    .insert({ ten_comp_id: tenCompId, name, creator_id: creatorId })
    .select('id, ten_comp_id, name, creator_id, is_active, created_at')
    .single()
  if (error) throw error
  const sg = data as SubgrupoV2

  const { error: memberError } = await supabase
    .from('subgrupo_members')
    .insert({ subgrupo_id: sg.id, user_id: creatorId })
  if (memberError) {
    // Revertir el subgrupo huérfano si falla el alta del creador.
    await supabase.from('subgrupos').delete().eq('id', sg.id)
    throw memberError
  }
  return sg
}

export async function addMemberToSubgrupoV2(subgrupoId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('subgrupo_members')
    .insert({ subgrupo_id: subgrupoId, user_id: userId })
  if (error) throw error
}

export async function removeMemberFromSubgrupoV2(subgrupoId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('subgrupo_members')
    .delete()
    .match({ subgrupo_id: subgrupoId, user_id: userId })
  if (error) throw error
}

export async function leaveSubgrupoV2(subgrupoId: string, userId: string): Promise<void> {
  return removeMemberFromSubgrupoV2(subgrupoId, userId)
}

export async function deleteSubgrupoV2(id: string): Promise<void> {
  const { error } = await supabase.from('subgrupos').delete().eq('id', id)
  if (error) throw error
}

export async function toggleSubgrupoActiveV2(id: string, is_active: boolean): Promise<void> {
  const { error } = await supabase.from('subgrupos').update({ is_active }).eq('id', id)
  if (error) throw error
}

export async function getUserSubgrupoCountV2(tenCompId: string, userId: string): Promise<number> {
  const { count, error } = await supabase
    .from('subgrupos')
    .select('*', { count: 'exact', head: true })
    .eq('ten_comp_id', tenCompId)
    .eq('creator_id', userId)
  if (error) throw error
  return count ?? 0
}
