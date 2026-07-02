import { supabase } from '../../lib/supabase'

// Muro de la penca: mensajes cortos scoped por ten_comp_id. Solo se conservan
// los últimos 10 (autopurga en la BD). Convención v2: scope explícito por parámetro.

export const MURO_MAX_CHARS = 100
export const MURO_MAX_WORDS = 10

export interface MuroMessage {
  id: string
  user_id: string
  texto: string
  created_at: string
  display_name: string
  avatar_url: string | null
}

interface RawMuroRow {
  id: string
  user_id: string
  texto: string
  created_at: string
  author: { display_name: string; username: string; avatar_url: string | null } | null
}

// Últimos 10 mensajes (más nuevos primero) con el nombre del autor.
export async function fetchMuroMessages(tenCompId: string): Promise<MuroMessage[]> {
  const { data, error } = await supabase
    .from('muro_mensajes')
    .select('id, user_id, texto, created_at, author:profiles!user_id(display_name, username, avatar_url)')
    .eq('ten_comp_id', tenCompId)
    .order('created_at', { ascending: false })
    .limit(10)
  if (error) throw error

  return ((data ?? []) as unknown as RawMuroRow[]).map((r): MuroMessage => ({
    id: r.id,
    user_id: r.user_id,
    texto: r.texto,
    created_at: r.created_at,
    display_name: r.author?.display_name || r.author?.username || 'Anónimo',
    avatar_url: r.author?.avatar_url ?? null,
  }))
}

// Cuenta palabras igual que el CHECK de la BD (separa por espacios).
export function countWords(texto: string): number {
  const t = texto.trim()
  return t === '' ? 0 : t.split(/\s+/).length
}

export async function postMuroMessage(
  tenCompId: string,
  userId: string,
  texto: string
): Promise<void> {
  const { error } = await supabase
    .from('muro_mensajes')
    .insert({ ten_comp_id: tenCompId, user_id: userId, texto: texto.trim() })
  if (error) throw error
}

export async function deleteMuroMessage(id: string): Promise<void> {
  const { error } = await supabase.from('muro_mensajes').delete().eq('id', id)
  if (error) throw error
}
