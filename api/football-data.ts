import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Proxy hacia https://api.football-data.org/v4
// GET /api/football-data?path=/competitions/WC/matches&status=FINISHED
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) return res.status(401).json({ error: 'Sin autorización' })

  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
  if (authError || !user) return res.status(401).json({ error: 'Token inválido' })

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('is_super_admin')
    .eq('id', user.id)
    .single()

  if (!profile?.is_super_admin) return res.status(403).json({ error: 'No autorizado' })

  const { path, ...rest } = req.query as Record<string, string>
  if (!path) return res.status(400).json({ error: 'Falta el parámetro path' })

  // Anti-SSRF: el path debe ser una ruta relativa simple. Evita que un
  // path tipo "@otrohost/..." o "//otrohost" desvíe la petición (y la
  // API key) a un servidor arbitrario.
  if (!path.startsWith('/') || path.startsWith('//') || /[@\\]/.test(path)) {
    return res.status(400).json({ error: 'Path inválido' })
  }

  const qs = new URLSearchParams(rest).toString()
  const url = `https://api.football-data.org/v4${path}${qs ? `?${qs}` : ''}`

  // Defensa adicional: confirmar que el host final no cambió.
  try {
    if (new URL(url).host !== 'api.football-data.org') {
      return res.status(400).json({ error: 'Path inválido' })
    }
  } catch {
    return res.status(400).json({ error: 'Path inválido' })
  }

  try {
    const response = await fetch(url, {
      headers: { 'X-Auth-Token': process.env.FOOTBALL_DATA_API_KEY! },
    })
    const data = await response.json()
    res.setHeader('X-External-Status', response.status)
    return res.status(200).json(data)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error desconocido'
    return res.status(500).json({ error: message })
  }
}
