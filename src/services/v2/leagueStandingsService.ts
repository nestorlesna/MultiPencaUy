import type { GroupStanding } from '../../types/database'
import type { TeamInfo, MatchWithRelations } from '../../types/match'
import { fetchMatches } from './matchService'

// Tabla de posiciones de liga (todos contra todos), calculada desde los partidos
// de la competencia. Reutiliza el shape GroupStanding para renderizar con
// <GroupTable>; los campos de grupo van neutros (no aplican a una liga).
//
// - Lista TODOS los equipos del fixture, aunque no hayan jugado (arrancan en 0):
//   los equipos se toman de todos los partidos (programados o jugados), las
//   estadísticas solo de los finalizados.
// - Desempate: PTS → DG → GF → enfrentamiento directo (mini-tabla entre los
//   equipos empatados) → nombre. El "sorteo" final no se simula: el nombre da un
//   orden estable y reproducible (los empates totales se resuelven a mano si hace
//   falta).
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

  // 1ª pasada: registrar todos los equipos del fixture (incluso sin jugar).
  for (const m of matches) {
    if (m.home_team) ensure(m.home_team)
    if (m.away_team) ensure(m.away_team)
  }

  // 2ª pasada: acumular estadísticas de los partidos finalizados.
  const finished = matches.filter(
    m => m.status === 'finished' && m.home_score_90 != null && m.away_score_90 != null && m.home_team && m.away_team
  )
  for (const m of finished) {
    apply(m.home_team!, m.home_score_90!, m.away_score_90!)
    apply(m.away_team!, m.away_score_90!, m.home_score_90!)
  }

  const rows = Array.from(table.values()).map(r => ({
    ...r,
    gd: r.gf - r.gc,
    pts: r.pg * 3 + r.pe,
  }))

  // Orden primario: PTS → DG → GF. Los empates exactos en esos tres se rompen
  // por enfrentamiento directo entre los equipos involucrados.
  rows.sort(
    (a, b) =>
      b.pts - a.pts ||
      b.gd - a.gd ||
      b.gf - a.gf ||
      headToHead(a.team.id, b.team.id, finished) ||
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

// Enfrentamiento directo entre dos equipos empatados en PTS/DG/GF: suma puntos
// (3/1/0), diferencia y goles SOLO de los partidos entre ellos. Devuelve un
// comparador (<0 si A va primero) o 0 si tampoco así se desempata.
// Nota: para empates de 3+ equipos esto compara de a pares; alcanza para los
// casos habituales de ligas y mantiene el orden estable.
function headToHead(aId: string, bId: string, finished: MatchWithRelations[]): number {
  let aPts = 0, bPts = 0, aGf = 0, bGf = 0
  for (const m of finished) {
    const h = m.home_team!.id, v = m.away_team!.id
    const involved =
      (h === aId && v === bId) || (h === bId && v === aId)
    if (!involved) continue
    const hs = m.home_score_90!, as = m.away_score_90!
    const aScored = h === aId ? hs : as
    const bScored = h === bId ? hs : as
    aGf += aScored
    bGf += bScored
    if (aScored > bScored) aPts += 3
    else if (aScored < bScored) bPts += 3
    else { aPts += 1; bPts += 1 }
  }
  // Mayor puntaje directo primero; si empatan, mayor diferencia de gol directa
  // (entre dos equipos, aGf - bGf es la diferencia de A en esos partidos).
  return (bPts - aPts) || (bGf - aGf)
}
