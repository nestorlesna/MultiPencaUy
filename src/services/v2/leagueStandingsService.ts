import type { GroupStanding } from '../../types/database'
import type { TeamInfo } from '../../types/match'
import { fetchMatches } from './matchService'

// Tabla de posiciones de liga (todos contra todos), calculada desde los partidos
// finalizados de la competencia. Reutiliza el shape GroupStanding para renderizar
// con <GroupTable>; los campos de grupo van neutros (no aplican a una liga).
// Desempate: PTS → DG → GF → nombre (igual criterio que group_standings).
export async function fetchLeagueStandings(competitionId: string): Promise<GroupStanding[]> {
  const matches = await fetchMatches(competitionId)

  interface Acc {
    team: TeamInfo
    pj: number; pg: number; pe: number; pp: number; gf: number; gc: number
  }
  const table = new Map<string, Acc>()

  const ensure = (team: TeamInfo): Acc => {
    let row = table.get(team.id)
    if (!row) {
      row = { team, pj: 0, pg: 0, pe: 0, pp: 0, gf: 0, gc: 0 }
      table.set(team.id, row)
    }
    return row
  }

  const apply = (team: TeamInfo, scored: number, conceded: number) => {
    const row = ensure(team)
    row.pj += 1
    row.gf += scored
    row.gc += conceded
    if (scored > conceded) row.pg += 1
    else if (scored === conceded) row.pe += 1
    else row.pp += 1
  }

  for (const m of matches) {
    if (m.status !== 'finished') continue
    if (m.home_score_90 == null || m.away_score_90 == null) continue
    if (!m.home_team || !m.away_team) continue
    apply(m.home_team, m.home_score_90, m.away_score_90)
    apply(m.away_team, m.away_score_90, m.home_score_90)
  }

  const rows = Array.from(table.values()).map(r => ({
    ...r,
    gd: r.gf - r.gc,
    pts: r.pg * 3 + r.pe,
  }))

  rows.sort(
    (a, b) =>
      b.pts - a.pts ||
      b.gd - a.gd ||
      b.gf - a.gf ||
      a.team.name.localeCompare(b.team.name)
  )

  return rows.map((r, i) => ({
    team_id: r.team.id,
    group_id: '',
    group_name: '',
    group_order: 0,
    position: i + 1,
    has_override: false,
    team_name: r.team.name,
    team_abbreviation: r.team.abbreviation,
    team_flag_url: r.team.flag_url,
    is_confirmed: r.team.is_confirmed,
    placeholder_name: r.team.placeholder_name,
    pj: r.pj,
    pg: r.pg,
    pe: r.pe,
    pp: r.pp,
    gf: r.gf,
    gc: r.gc,
    gd: r.gd,
    pts: r.pts,
  }))
}
