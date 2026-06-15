import { supabase } from '../lib/supabase'

// En v2 la tabla `combinaciones` está scopeada por competencia.
// Identidad = PK compuesta (competition_id, combinacion). No hay columna `id`.
export interface Combinacion {
  competition_id: string
  combinacion: string
  rival_1a: string
  rival_1b: string
  rival_1d: string
  rival_1e: string
  rival_1g: string
  rival_1i: string
  rival_1k: string
  rival_1l: string
  [key: string]: string
}

export const RIVAL_COLS = [
  { col: 'rival_1a', label: '1A' },
  { col: 'rival_1b', label: '1B' },
  { col: 'rival_1d', label: '1D' },
  { col: 'rival_1e', label: '1E' },
  { col: 'rival_1g', label: '1G' },
  { col: 'rival_1i', label: '1I' },
  { col: 'rival_1k', label: '1K' },
  { col: 'rival_1l', label: '1L' },
] as const

export async function fetchCombinaciones(
  competitionId: string,
  search?: string
): Promise<Combinacion[]> {
  let query = supabase
    .from('combinaciones')
    .select('*')
    .eq('competition_id', competitionId)
    .order('combinacion')

  if (search && search.length > 0) {
    query = query.ilike('combinacion', `%${search}%`)
  }

  const { data, error } = await query.limit(50)
  if (error) throw error
  return (data ?? []) as Combinacion[]
}

export async function fetchCombinacionByKey(
  competitionId: string,
  key: string
): Promise<Combinacion | null> {
  const { data, error } = await supabase
    .from('combinaciones')
    .select('*')
    .eq('competition_id', competitionId)
    .eq('combinacion', key)
    .maybeSingle()
  if (error) throw error
  return data as Combinacion | null
}

export async function updateCombinacion(
  competitionId: string,
  combinacion: string,
  updates: Partial<Omit<Combinacion, 'competition_id' | 'combinacion'>>
): Promise<void> {
  const { error } = await supabase
    .from('combinaciones')
    .update(updates)
    .eq('competition_id', competitionId)
    .eq('combinacion', combinacion)
  if (error) throw error
}
