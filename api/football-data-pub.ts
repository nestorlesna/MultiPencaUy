import type { VercelRequest, VercelResponse } from '@vercel/node'

// Public proxy for football-data.org — no auth, restricted to 4 WC paths only
// In-memory cache with 5-minute TTL to avoid hitting rate limits

const ALLOWED_PATHS = new Set([
  '/competitions/WC',
  '/competitions/WC/matches',
  '/competitions/WC/teams',
  '/competitions/WC/standings',
])

const cache = new Map<string, { data: unknown; ts: number }>()
const CACHE_TTL = 5 * 60 * 1000

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const { path, ...rest } = req.query as Record<string, string>
  if (!path) return res.status(400).json({ error: 'Falta el parámetro path' })
  if (!ALLOWED_PATHS.has(path)) return res.status(403).json({ error: 'Ruta no permitida' })

  const qs = new URLSearchParams(rest).toString()
  const cacheKey = `${path}?${qs}`

  const cached = cache.get(cacheKey)
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    res.setHeader('X-Cache', 'HIT')
    return res.status(200).json(cached.data)
  }

  const url = `https://api.football-data.org/v4${path}${qs ? `?${qs}` : ''}`

  try {
    const response = await fetch(url, {
      headers: { 'X-Auth-Token': process.env.FOOTBALL_DATA_API_KEY! },
    })
    const data = await response.json()
    cache.set(cacheKey, { data, ts: Date.now() })
    res.setHeader('X-Cache', 'MISS')
    res.setHeader('X-External-Status', response.status)
    return res.status(200).json(data)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error desconocido'
    return res.status(500).json({ error: message })
  }
}
