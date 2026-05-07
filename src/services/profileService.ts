import { supabase } from '../lib/supabase'
import type { Profile } from '../types'

export interface AdminUserDetail {
  id: string
  email: string
  predictions_count: number
}

export interface GroupPredictionsDetail {
  user_id: string
  group_preds_count: number
}

export async function updateProfile(
  userId: string,
  data: Partial<Pick<Profile, 'display_name' | 'avatar_url'>>
) {
    const { error } = await supabase.from('profiles').update(data).eq('id', userId)
  if (error) throw error
}

export async function uploadAvatar(userId: string, file: File): Promise<string> {
  const ext = file.name.split('.').pop()
  const path = `${userId}/avatar.${ext}`

  const { error: uploadError } = await supabase.storage
    .from('avatars')
    .upload(path, file, { upsert: true })

  if (uploadError) throw uploadError

  const { data } = supabase.storage.from('avatars').getPublicUrl(path)
  // Bust cache con timestamp
  return `${data.publicUrl}?t=${Date.now()}`
}

export async function fetchAllProfiles(): Promise<Profile[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as Profile[]
}

export async function fetchAdminUserDetails(): Promise<AdminUserDetail[]> {
  const { data, error } = await supabase.rpc('admin_get_user_details')
  if (error) throw error
  return (data ?? []) as AdminUserDetail[]
}

export async function fetchGroupPredictionsPerUser(): Promise<GroupPredictionsDetail[]> {
  const { data, error } = await supabase.rpc('admin_get_group_predictions')
  if (error) throw error
  return (data ?? []) as GroupPredictionsDetail[]
}

export async function setUserActive(userId: string, isActive: boolean) {
    const { error } = await supabase.from('profiles').update({ is_active: isActive }).eq('id', userId)
  if (error) throw error
}

export async function setUserAdmin(userId: string, isAdmin: boolean) {
  const { error } = await supabase.from('profiles').update({ is_admin: isAdmin }).eq('id', userId)
  if (error) throw error
}

export async function setUserLoader(userId: string, isLoader: boolean) {
  const { error } = await supabase.from('profiles').update({ is_loader: isLoader }).eq('id', userId)
  if (error) throw error
}
