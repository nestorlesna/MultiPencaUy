import { useState } from 'react'

// ── Types ────────────────────────────────────────────────────────────────────

export interface WCWinner {
  id: number; name: string; tla: string; crest: string
  website: string; founded: number; clubColors: string; venue: string | null
}
export interface WCSeason {
  id: number; startDate: string; endDate: string
  currentMatchday: number | null; winner: WCWinner | null
}
export interface WCCompetition {
  area: { id: number; name: string; code: string; flag: string | null }
  id: number; name: string; code: string; type: string; emblem: string
  currentSeason: WCSeason; seasons: WCSeason[]; lastUpdated: string
}
export interface WCTeam {
  id: number | null; name: string | null; shortName: string | null
  tla: string | null; crest: string | null
}
export interface WCMatch {
  id: number; utcDate: string; status: string
  matchday: number | null; stage: string; group: string | null
  homeTeam: WCTeam; awayTeam: WCTeam
  score: { winner: string | null; fullTime: { home: number | null; away: number | null } }
}
export interface WCMatchesData {
  filters: { season: string; status: string[] }
  resultSet: { count: number; first: string; last: string; played: number }
  competition: { id: number; name: string; code: string; emblem: string }
  matches: WCMatch[]
}
export interface WCTeamFull {
  id: number; name: string; shortName: string; tla: string; crest: string
  area: { id: number; name: string; code: string; flag: string | null }
  address: string | null; website: string | null; founded: number | null
  clubColors: string | null; venue: string | null; lastUpdated: string
}
export interface WCTeamsData {
  count: number
  competition: { id: number; name: string; code: string; emblem: string }
  season: { startDate: string; endDate: string }
  teams: WCTeamFull[]
}
export interface StandingRow {
  position: number
  team: { id: number; name: string; shortName: string; tla: string; crest: string }
  playedGames: number; form: string | null
  won: number; draw: number; lost: number; points: number
  goalsFor: number; goalsAgainst: number; goalDifference: number
}
export interface GroupStanding { stage: string; type: string; group: string; table: StandingRow[] }
export interface WCStandingsData {
  competition: { id: number; name: string; code: string; emblem: string }
  season: { startDate: string; endDate: string; currentMatchday: number | null }
  standings: GroupStanding[]
}

// ── Type guards ──────────────────────────────────────────────────────────────

export function isWCCompetition(data: unknown): data is WCCompetition {
  return (
    typeof data === 'object' && data !== null &&
    'code' in data && 'seasons' in data && 'emblem' in data &&
    Array.isArray((data as WCCompetition).seasons)
  )
}
export function isWCMatchesData(data: unknown): data is WCMatchesData {
  return (
    typeof data === 'object' && data !== null &&
    'matches' in data && 'resultSet' in data &&
    Array.isArray((data as WCMatchesData).matches)
  )
}
export function isWCTeamsData(data: unknown): data is WCTeamsData {
  return (
    typeof data === 'object' && data !== null &&
    'teams' in data && 'count' in data &&
    Array.isArray((data as WCTeamsData).teams) &&
    (data as WCTeamsData).teams.length > 0 &&
    'tla' in (data as WCTeamsData).teams[0]
  )
}
export function isWCStandingsData(data: unknown): data is WCStandingsData {
  return (
    typeof data === 'object' && data !== null &&
    'standings' in data && Array.isArray((data as WCStandingsData).standings) &&
    (data as WCStandingsData).standings.length > 0 &&
    'table' in (data as WCStandingsData).standings[0]
  )
}

// ── Constants ────────────────────────────────────────────────────────────────

export const STAGE_LABELS: Record<string, string> = {
  GROUP_STAGE:    'Grupos',
  LAST_32:        'R32',
  LAST_16:        'Octavos',
  QUARTER_FINALS: 'Cuartos',
  SEMI_FINALS:    'Semis',
  THIRD_PLACE:    '3.er puesto',
  FINAL:          'Final',
}
export const STAGE_ORDER = ['GROUP_STAGE','LAST_32','LAST_16','QUARTER_FINALS','SEMI_FINALS','THIRD_PLACE','FINAL']

// ── Components ───────────────────────────────────────────────────────────────

export function CompetitionInfoCard({ data }: { data: WCCompetition }) {
  const fmt = (d: string) =>
    new Date(d).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' })

  const counts: Record<string, { name: string; tla: string; crest: string; count: number }> = {}
  for (const s of data.seasons) {
    if (s.winner) {
      const w = s.winner
      if (!counts[w.tla]) counts[w.tla] = { name: w.name, tla: w.tla, crest: w.crest, count: 0 }
      counts[w.tla].count++
    }
  }
  const palmares = Object.values(counts).sort((a, b) => b.count - a.count)
  const maxTitles = palmares[0]?.count ?? 1

  const pastSeasons = data.seasons
    .filter(s => s.winner !== null)
    .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime())

  return (
    <div className="space-y-3 mb-4">
      <div className="bg-background border border-border rounded-xl p-4 flex items-center gap-4">
        <img src={data.emblem} alt={data.name} className="w-16 h-16 object-contain flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-bold text-text-primary leading-tight">{data.name}</h3>
          <div className="flex flex-wrap items-center gap-2 mt-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-blue-900/40 text-blue-300 border border-blue-800/40">
              {data.type}
            </span>
            <span className="text-text-muted text-sm">{data.area.name}</span>
          </div>
          <p className="text-text-muted text-xs mt-1">
            Actualizado: {fmt(data.lastUpdated)}
          </p>
        </div>
      </div>

      <div className="bg-background border border-border rounded-xl p-4">
        <p className="text-[11px] text-text-muted uppercase tracking-wide mb-3">Temporada actual</p>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <p className="text-[10px] text-text-muted uppercase tracking-wide mb-0.5">Inicio</p>
            <p className="text-sm text-text-primary font-medium">{fmt(data.currentSeason.startDate)}</p>
          </div>
          <div>
            <p className="text-[10px] text-text-muted uppercase tracking-wide mb-0.5">Fin</p>
            <p className="text-sm text-text-primary font-medium">{fmt(data.currentSeason.endDate)}</p>
          </div>
          <div>
            <p className="text-[10px] text-text-muted uppercase tracking-wide mb-0.5">Jornada</p>
            <p className="text-sm text-text-primary font-medium">{data.currentSeason.currentMatchday ?? '—'}</p>
          </div>
        </div>
        <div className="mt-3 pt-3 border-t border-border flex items-center gap-2">
          {data.currentSeason.winner ? (
            <>
              <img src={data.currentSeason.winner.crest} alt={data.currentSeason.winner.name} className="w-6 h-6 object-contain" />
              <span className="text-sm text-accent font-semibold">{data.currentSeason.winner.name}</span>
            </>
          ) : (
            <span className="text-text-muted text-sm">Campeón: por definir</span>
          )}
        </div>
      </div>

      <div className="bg-background border border-border rounded-xl p-4">
        <p className="text-[11px] text-text-muted uppercase tracking-wide mb-3">
          Palmarés histórico · {palmares.length} países campeones
        </p>
        <div className="space-y-2.5">
          {palmares.map((team, i) => (
            <div key={team.tla} className="flex items-center gap-3">
              <span className="text-text-muted text-xs w-4 text-right flex-shrink-0">{i + 1}</span>
              <img src={team.crest} alt={team.name} className="w-6 h-6 object-contain flex-shrink-0" onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
              <span className="text-sm text-text-primary w-20 flex-shrink-0 truncate">{team.name}</span>
              <div className="flex-1 flex items-center gap-2">
                <div className="flex-1 bg-border rounded-full h-1.5 overflow-hidden">
                  <div className="h-full bg-accent rounded-full" style={{ width: `${(team.count / maxTitles) * 100}%` }} />
                </div>
                <span className="text-accent font-bold text-sm w-4 text-right flex-shrink-0">{team.count}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-background border border-border rounded-xl p-4">
        <p className="text-[11px] text-text-muted uppercase tracking-wide mb-3">
          Ediciones anteriores · {pastSeasons.length} torneos
        </p>
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {pastSeasons.map(season => {
            const year = new Date(season.startDate).getFullYear()
            const w = season.winner!
            return (
              <div key={season.id} className="flex items-center gap-2 bg-surface rounded-lg px-2.5 py-2 border border-border/50">
                <img src={w.crest} alt={w.name} className="w-5 h-5 object-contain flex-shrink-0" onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                <div className="min-w-0">
                  <p className="text-[10px] text-text-muted leading-tight">{year}</p>
                  <p className="text-xs text-text-primary font-semibold leading-tight truncate">{w.tla}</p>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export function MatchRow({ match }: { match: WCMatch }) {
  const dt = new Date(match.utcDate)
  const dateStr = dt.toLocaleDateString('es', { day: 'numeric', month: 'short' })
  const timeStr = dt.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })
  const home = match.homeTeam
  const away = match.awayTeam
  const ft = match.score.fullTime
  const hasScore = ft.home !== null && ft.away !== null

  return (
    <div className="flex items-center gap-2 py-2 px-3 rounded-lg hover:bg-surface transition-colors">
      <div className="text-right flex-shrink-0 w-16">
        <p className="text-[10px] text-text-muted leading-tight">{dateStr}</p>
        <p className="text-[10px] text-text-secondary leading-tight font-medium">{timeStr}</p>
      </div>
      <div className="flex items-center gap-1.5 flex-1 justify-end min-w-0">
        <span className="text-xs text-text-primary truncate text-right">{home.shortName ?? home.name ?? 'Por definir'}</span>
        {home.crest
          ? <img src={home.crest} alt={home.tla ?? ''} className="w-5 h-5 object-contain flex-shrink-0" onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
          : <span className="w-5 h-5 rounded bg-border flex-shrink-0" />
        }
      </div>
      <div className="flex-shrink-0 w-14 text-center">
        {hasScore
          ? <span className="text-sm font-bold text-text-primary">{ft.home} – {ft.away}</span>
          : <span className="text-xs text-text-muted">vs</span>
        }
      </div>
      <div className="flex items-center gap-1.5 flex-1 min-w-0">
        {away.crest
          ? <img src={away.crest} alt={away.tla ?? ''} className="w-5 h-5 object-contain flex-shrink-0" onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
          : <span className="w-5 h-5 rounded bg-border flex-shrink-0" />
        }
        <span className="text-xs text-text-primary truncate">{away.shortName ?? away.name ?? 'Por definir'}</span>
      </div>
    </div>
  )
}

export function MatchesListCard({ data }: { data: WCMatchesData }) {
  const stages = STAGE_ORDER.filter(s => data.matches.some(m => m.stage === s))
  const [activeStage, setActiveStage] = useState(stages[0] ?? 'GROUP_STAGE')

  const stageMatches = data.matches
    .filter(m => m.stage === activeStage)
    .sort((a, b) => new Date(a.utcDate).getTime() - new Date(b.utcDate).getTime())

  type GroupedMatches = { label: string; matches: WCMatch[] }[]
  let grouped: GroupedMatches = []

  if (activeStage === 'GROUP_STAGE') {
    const byGroup: Record<string, WCMatch[]> = {}
    for (const m of stageMatches) {
      const g = m.group ?? 'SIN_GRUPO'
      if (!byGroup[g]) byGroup[g] = []
      byGroup[g].push(m)
    }
    grouped = Object.entries(byGroup)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([g, ms]) => ({ label: g.replace('GROUP_', 'Grupo '), matches: ms }))
  } else {
    const byDate: Record<string, WCMatch[]> = {}
    for (const m of stageMatches) {
      const d = new Date(m.utcDate).toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' })
      if (!byDate[d]) byDate[d] = []
      byDate[d].push(m)
    }
    grouped = Object.entries(byDate).map(([d, ms]) => ({ label: d, matches: ms }))
  }

  const fmt = (d: string) => new Date(d).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' })

  return (
    <div className="space-y-3 mb-4">
      <div className="bg-background border border-border rounded-xl p-4">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <img src={data.competition.emblem} alt={data.competition.name} className="w-8 h-8 object-contain" />
            <span className="text-sm font-semibold text-text-primary">{data.competition.name}</span>
          </div>
          <div className="flex gap-4 ml-auto flex-wrap">
            <div className="text-center">
              <p className="text-lg font-bold text-text-primary">{data.resultSet.count}</p>
              <p className="text-[10px] text-text-muted uppercase tracking-wide">Total</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold text-primary">{data.resultSet.played}</p>
              <p className="text-[10px] text-text-muted uppercase tracking-wide">Jugados</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold text-accent">{data.resultSet.count - data.resultSet.played}</p>
              <p className="text-[10px] text-text-muted uppercase tracking-wide">Pendientes</p>
            </div>
            <div className="text-center">
              <p className="text-xs font-medium text-text-secondary">{fmt(data.resultSet.first)}</p>
              <p className="text-xs font-medium text-text-secondary">{fmt(data.resultSet.last)}</p>
              <p className="text-[10px] text-text-muted uppercase tracking-wide">Período</p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {stages.map(s => {
          const count = data.matches.filter(m => m.stage === s).length
          return (
            <button
              key={s}
              onClick={() => setActiveStage(s)}
              className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                activeStage === s
                  ? 'bg-primary/20 border-primary/50 text-primary font-semibold'
                  : 'bg-surface border-border text-text-secondary hover:border-primary/30 hover:text-text-primary'
              }`}
            >
              {STAGE_LABELS[s] ?? s} <span className="opacity-60">({count})</span>
            </button>
          )
        })}
      </div>

      <div className="bg-background border border-border rounded-xl overflow-hidden">
        {grouped.map(group => (
          <div key={group.label}>
            <div className="px-3 py-2 bg-surface border-b border-border">
              <p className="text-[11px] text-text-muted uppercase tracking-wide font-semibold">{group.label}</p>
            </div>
            <div className="divide-y divide-border/50">
              {group.matches.map(m => <MatchRow key={m.id} match={m} />)}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function ColorDots({ colors }: { colors: string }) {
  const parts = colors.split('/').map(c => c.trim().toLowerCase())
  const colorMap: Record<string, string> = {
    red: '#ef4444', blue: '#3b82f6', 'navy blue': '#1e3a8a', white: '#f8fafc',
    black: '#1e293b', yellow: '#eab308', green: '#22c55e', orange: '#f97316',
    gold: '#f59e0b', 'sky blue': '#38bdf8', maroon: '#9f1239', purple: '#a855f7',
    pink: '#ec4899', grey: '#6b7280', 'light blue': '#7dd3fc',
  }
  return (
    <div className="flex gap-0.5 flex-wrap">
      {parts.slice(0, 3).map((c, i) => (
        <span
          key={i}
          className="w-3 h-3 rounded-full border border-white/20 flex-shrink-0"
          style={{ backgroundColor: colorMap[c] ?? '#475569' }}
          title={c}
        />
      ))}
    </div>
  )
}

export function TeamsGridCard({ data }: { data: WCTeamsData }) {
  const [search, setSearch] = useState('')
  const filtered = data.teams
    .filter(t =>
      search === '' ||
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.tla.toLowerCase().includes(search.toLowerCase()) ||
      t.area.name.toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => a.name.localeCompare(b.name))

  return (
    <div className="space-y-3 mb-4">
      <div className="bg-background border border-border rounded-xl p-4 flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <img src={data.competition.emblem} alt={data.competition.name} className="w-8 h-8 object-contain" />
          <span className="text-sm font-semibold text-text-primary">{data.competition.name}</span>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-2xl font-bold text-text-primary">{data.count}</span>
          <span className="text-text-muted text-sm">selecciones</span>
        </div>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar selección..."
          className="w-full mt-2 bg-surface border border-border rounded-lg px-3 py-1.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary/60"
        />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {filtered.map(team => (
          <div key={team.id} className="bg-background border border-border rounded-xl p-3 flex gap-3 items-start hover:border-border/80 transition-colors">
            <div className="flex-shrink-0 w-10 h-10 flex items-center justify-center">
              {team.crest
                ? <img src={team.crest} alt={team.tla} className="w-10 h-10 object-contain" onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                : <span className="w-10 h-10 rounded bg-border" />
              }
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-text-primary truncate leading-tight">{team.name}</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider">{team.tla}</span>
                {team.area.flag
                  ? <img src={team.area.flag} alt={team.area.name} className="w-4 h-3 object-cover rounded-sm" onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                  : null
                }
                <span className="text-[10px] text-text-muted truncate">{team.area.name}</span>
              </div>
              <div className="mt-1.5 space-y-0.5">
                {team.founded && (
                  <p className="text-[10px] text-text-muted">Est. {team.founded}</p>
                )}
                {team.clubColors && (
                  <div className="flex items-center gap-1">
                    <ColorDots colors={team.clubColors} />
                    <span className="text-[9px] text-text-muted truncate">{team.clubColors}</span>
                  </div>
                )}
                {team.venue && (
                  <p className="text-[10px] text-text-muted truncate" title={team.venue}>{team.venue}</p>
                )}
                {team.website && (
                  <a
                    href={team.website}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[10px] text-primary/70 hover:text-primary truncate block"
                    onClick={e => e.stopPropagation()}
                  >
                    {team.website.replace(/^https?:\/\/(www\.)?/, '')}
                  </a>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {filtered.length === 0 && (
        <p className="text-text-muted text-sm text-center py-4">Sin resultados para "{search}"</p>
      )}
    </div>
  )
}

export function StandingsCard({ data }: { data: WCStandingsData }) {
  const groups = data.standings.filter(s => s.type === 'TOTAL').sort((a, b) => a.group.localeCompare(b.group))

  return (
    <div className="space-y-3 mb-4">
      <div className="bg-background border border-border rounded-xl p-4 flex items-center gap-3 flex-wrap">
        <img src={data.competition.emblem} alt={data.competition.name} className="w-8 h-8 object-contain" />
        <span className="text-sm font-semibold text-text-primary">{data.competition.name} — Posiciones</span>
        <span className="ml-auto text-xs text-text-muted">{groups.length} grupos</span>
        {data.season.currentMatchday && (
          <span className="text-xs px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
            Jornada {data.season.currentMatchday}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {groups.map(group => (
          <div key={group.group} className="bg-background border border-border rounded-xl overflow-hidden">
            <div className="px-3 py-2 bg-surface border-b border-border">
              <p className="text-[11px] font-bold text-text-secondary uppercase tracking-wide">{group.group}</p>
            </div>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-text-muted border-b border-border/50">
                  <th className="text-left px-3 py-1.5 font-medium w-6">#</th>
                  <th className="text-left px-1 py-1.5 font-medium">Equipo</th>
                  <th className="text-center px-1 py-1.5 font-medium w-6" title="Jugados">PJ</th>
                  <th className="text-center px-1 py-1.5 font-medium w-6" title="Ganados">PG</th>
                  <th className="text-center px-1 py-1.5 font-medium w-6" title="Empates">PE</th>
                  <th className="text-center px-1 py-1.5 font-medium w-6" title="Perdidos">PP</th>
                  <th className="text-center px-1 py-1.5 font-medium w-6" title="Diferencia">DG</th>
                  <th className="text-center px-1 py-1.5 font-medium w-7 text-accent" title="Puntos">Pts</th>
                </tr>
              </thead>
              <tbody>
                {group.table.map((row, i) => (
                  <tr key={row.team.id} className={`border-b border-border/30 last:border-0 ${i < 2 ? 'bg-primary/5' : ''}`}>
                    <td className="px-3 py-1.5 text-text-muted">{row.position}</td>
                    <td className="px-1 py-1.5">
                      <div className="flex items-center gap-1.5">
                        {row.team.crest
                          ? <img src={row.team.crest} alt={row.team.tla} className="w-4 h-4 object-contain flex-shrink-0" onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                          : <span className="w-4 h-4 rounded-sm bg-border flex-shrink-0" />
                        }
                        <span className="text-text-primary truncate max-w-[80px]">{row.team.shortName}</span>
                      </div>
                    </td>
                    <td className="text-center px-1 py-1.5 text-text-muted">{row.playedGames}</td>
                    <td className="text-center px-1 py-1.5 text-text-secondary">{row.won}</td>
                    <td className="text-center px-1 py-1.5 text-text-secondary">{row.draw}</td>
                    <td className="text-center px-1 py-1.5 text-text-secondary">{row.lost}</td>
                    <td className={`text-center px-1 py-1.5 ${row.goalDifference > 0 ? 'text-primary' : row.goalDifference < 0 ? 'text-red-400' : 'text-text-muted'}`}>
                      {row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference}
                    </td>
                    <td className="text-center px-1 py-1.5 font-bold text-accent">{row.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>

      <p className="text-[10px] text-text-muted px-1">Los 2 primeros de cada grupo clasifican a R32. El fondo verde indica zona de clasificación.</p>
    </div>
  )
}
