import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Proxy hacia https://v3.football.api-sports.io
// GET /api/api-football?path=/fixtures&league=1&season=2026&date=2026-06-11
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) return res.status(401).json({ error: 'Sin autorización' })

  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
  if (authError || !user) return res.status(401).json({ error: 'Token inválido' })

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single()

  if (!profile?.is_admin) return res.status(403).json({ error: 'No autorizado' })

  const { path, ...rest } = req.query as Record<string, string>
  if (!path) return res.status(400).json({ error: 'Falta el parámetro path' })

  const qs = new URLSearchParams(rest).toString()
  const url = `https://v3.football.api-sports.io${path}${qs ? `?${qs}` : ''}`

  try {
    const response = await fetch(url, {
      headers: { 'x-apisports-key': process.env.API_FOOTBALL_KEY! },
    })
    const data = await response.json()
    res.setHeader('X-External-Status', response.status)
    return res.status(200).json(data)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error desconocido'
    return res.status(500).json({ error: message })
  }
}
