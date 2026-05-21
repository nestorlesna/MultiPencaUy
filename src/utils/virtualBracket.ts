/**
 * virtualBracket.ts
 *
 * Builds a "virtual" knockout bracket based on a user's predictions:
 *  1. Compute group standings from predicted group-stage scores.
 *  2. Rank best third-place teams.
 *  3. Resolve R32 slots from group positions / best thirds.
 *  4. Propagate winners through R16 → QF → SF → Final / 3rd-place.
 *  5. Return a MatchMap compatible with the BracketPage renderer.
 */

import { supabase } from '../lib/supabase'
import type { MatchWithRelations, TeamInfo, GroupStanding } from '../types'
import type { PredictionWithMatch } from '../services/predictionService'

// ── Raw DB types ──────────────────────────────────────────────────────────────

export interface GroupTeamRow {
  id: string
  name: string
  abbreviation: string
  flag_url: string | null
  is_confirmed: boolean
  placeholder_name: string | null
  group_id: string
  group: { id: string; name: string; order: number }
}

interface SlotRuleRaw {
  slot: 'home' | 'away'
  rule_type: 'group_position' | 'best_third' | 'match_winner' | 'match_loser'
  position: number | null
  third_groups: string[] | null
  match_id: string
  source_group_id: string | null
  source_match_id: string | null
}

// ── Internal computation types ────────────────────────────────────────────────

interface GroupEntry {
  team: TeamInfo
  group_id: string
  group_name: string
  group_order: number
  pj: number; pg: number; pe: number; pp: number
  gf: number; gc: number; gd: number; pts: number
  position: number
}

// ── Supabase fetches ──────────────────────────────────────────────────────────

/** All 48 teams with their group data (group_id is always set for this tournament). */
export async function fetchTeamsInGroups(): Promise<GroupTeamRow[]> {
  const { data, error } = await supabase
    .from('teams')
    .select('id, name, abbreviation, flag_url, is_confirmed, placeholder_name, group_id, group:groups(id, name, order)')
    .not('group_id', 'is', null)
  if (error) throw error
  return (data ?? []) as unknown as GroupTeamRow[]
}

/** Knockout slot rules — defines which team fills each slot in R32–Final. */
export async function fetchSlotRules(): Promise<SlotRuleRaw[]> {
  const { data, error } = await supabase
    .from('knockout_slot_rules')
    .select('slot, rule_type, position, third_groups, match_id, source_group_id, source_match_id')
  if (error) throw error
  return (data ?? []) as SlotRuleRaw[]
}

// ── Group standings computation ────────────────────────────────────────────────

function computeGroupStandings(
  teamsInGroups: GroupTeamRow[],
  predictions: PredictionWithMatch[],
): Map<string, GroupEntry[]> {
  // Seed every team with zeroed stats
  const statsById = new Map<string, GroupEntry>()
  for (const t of teamsInGroups) {
    const g = t.group as { id: string; name: string; order: number }
    statsById.set(t.id, {
      team: {
        id: t.id,
        name: t.name,
        abbreviation: t.abbreviation,
        flag_url: t.flag_url,
        is_confirmed: t.is_confirmed,
        placeholder_name: t.placeholder_name,
      },
      group_id: t.group_id,
      group_name: g.name,
      group_order: g.order,
      pj: 0, pg: 0, pe: 0, pp: 0,
      gf: 0, gc: 0, gd: 0, pts: 0,
      position: 0,
    })
  }

  // Apply user's group-stage predictions
  for (const pred of predictions) {
    const m = pred.match
    if (m.phase.order !== 1) continue  // only group stage
    if (!m.home_team || !m.away_team) continue

    const home = statsById.get(m.home_team.id)
    const away = statsById.get(m.away_team.id)
    if (!home || !away) continue

    const h = pred.home_score
    const a = pred.away_score

    home.pj++; away.pj++
    home.gf += h; home.gc += a
    away.gf += a; away.gc += h
    home.gd = home.gf - home.gc
    away.gd = away.gf - away.gc

    if (h > a) {
      home.pg++; home.pts += 3; away.pp++
    } else if (h < a) {
      away.pg++; away.pts += 3; home.pp++
    } else {
      home.pe++; home.pts++
      away.pe++; away.pts++
    }
  }

  // Group teams by group_name and sort (same criteria as SQL view)
  const groupMap = new Map<string, GroupEntry[]>()
  for (const entry of statsById.values()) {
    const gn = entry.group_name
    if (!groupMap.has(gn)) groupMap.set(gn, [])
    groupMap.get(gn)!.push(entry)
  }

  for (const list of groupMap.values()) {
    list.sort((a, b) => {
      if (b.pts !== a.pts) return b.pts - a.pts
      if (b.gd  !== a.gd)  return b.gd  - a.gd
      if (b.gf  !== a.gf)  return b.gf  - a.gf
      return a.team.name.localeCompare(b.team.name)
    })
    list.forEach((e, i) => { e.position = i + 1 })
  }

  return groupMap
}

/**
 * Builds virtual group standings (compatible with the `GroupTable` component)
 * from a user's group-stage predictions. Same ranking criteria as the SQL
 * `group_standings` view. Teams without predictions simply stay at 0 points.
 *
 * @param teamsInGroups All 48 group teams (from fetchTeamsInGroups)
 * @param predictions   User's predictions for ALL matches
 */
export function buildVirtualGroupStandings(
  teamsInGroups: GroupTeamRow[],
  predictions: PredictionWithMatch[],
): GroupStanding[] {
  const groupMap = computeGroupStandings(teamsInGroups, predictions)
  const result: GroupStanding[] = []

  for (const list of groupMap.values()) {
    for (const e of list) {
      result.push({
        team_id: e.team.id,
        group_id: e.group_id,
        group_name: e.group_name,
        group_order: e.group_order,
        position: e.position,
        has_override: false,
        team_name: e.team.name,
        team_abbreviation: e.team.abbreviation,
        team_flag_url: e.team.flag_url,
        is_confirmed: e.team.is_confirmed,
        placeholder_name: e.team.placeholder_name,
        pj: e.pj, pg: e.pg, pe: e.pe, pp: e.pp,
        gf: e.gf, gc: e.gc, gd: e.gd, pts: e.pts,
      })
    }
  }

  return result.sort(
    (a, b) => a.group_order - b.group_order || a.position - b.position,
  )
}

// ── Winner determination ───────────────────────────────────────────────────────

/**
 * Determines the winning team ID based on a user's prediction for a knockout match.
 * Falls back to null if scores are level and no valid PK winner was predicted.
 */
function resolveKnockoutWinner(
  pred: PredictionWithMatch,
  homeTeamId: string,
  awayTeamId: string,
): string | null {
  const { home_score, away_score, home_score_et, away_score_et, predicted_pk_winner_id } = pred

  if (home_score > away_score) return homeTeamId
  if (away_score > home_score) return awayTeamId

  // 90-min draw — check ET (if ET scores were recorded)
  if (home_score_et !== null && away_score_et !== null) {
    if (home_score_et > away_score_et) return homeTeamId
    if (away_score_et > home_score_et) return awayTeamId
  }

  // Still a draw (ET also tied, or ET not recorded) — check PK winner
  if (
    predicted_pk_winner_id === homeTeamId ||
    predicted_pk_winner_id === awayTeamId
  ) {
    return predicted_pk_winner_id
  }

  return null  // undetermined (draw in group stage, or incomplete prediction)
}

// ── Virtual bracket builder ────────────────────────────────────────────────────

export type VirtualMatchMap = Map<number, MatchWithRelations>

/**
 * Builds a virtual MatchMap where:
 *  - Teams are determined by simulated group standings + bracket propagation.
 *  - Scores are the user's predicted scores (home_score / away_score / etc.).
 *  - winner_team_id is derived from the predicted scores.
 *
 * @param teamsInGroups   All 48 group teams (from fetchTeamsInGroups)
 * @param slotRulesRaw    All knockout slot rules (from fetchSlotRules)
 * @param knockoutMatches Actual knockout matches (for static fields: id, phase, stadium…)
 * @param predictions     User's predictions for ALL matches
 */
export function buildVirtualMatchMap(
  teamsInGroups: GroupTeamRow[],
  slotRulesRaw: SlotRuleRaw[],
  knockoutMatches: MatchWithRelations[],
  predictions: PredictionWithMatch[],
): VirtualMatchMap {
  // ── Index actual knockout matches ────────────────────────────────────────────
  const matchById = new Map<string, MatchWithRelations>()
  const matchByNum = new Map<number, MatchWithRelations>()
  const matchNumById = new Map<string, number>()

  for (const m of knockoutMatches) {
    matchById.set(m.id, m)
    matchByNum.set(m.match_number, m)
    matchNumById.set(m.id, m.match_number)
  }

  // ── Index user predictions by match_number ───────────────────────────────────
  const predByMatchNum = new Map<number, PredictionWithMatch>()
  for (const p of predictions) {
    predByMatchNum.set(p.match.match_number, p)
  }

  // ── Compute virtual group standings ──────────────────────────────────────────
  const groupStandings = computeGroupStandings(teamsInGroups, predictions)

  // Build group_id → group_name index (for resolving source_group_id in rules)
  const groupIdToName = new Map<string, string>()
  for (const t of teamsInGroups) {
    const g = t.group as { id: string; name: string; order: number }
    groupIdToName.set(t.group_id, g.name)
  }

  // ── Rank best thirds (same criteria as SQL best_third_ranking view) ───────────
  const allThirds: GroupEntry[] = []
  for (const standings of groupStandings.values()) {
    const third = standings.find(e => e.position === 3)
    if (third) allThirds.push(third)
  }
  allThirds.sort((a, b) => {
    if (b.pts !== a.pts) return b.pts - a.pts
    if (b.gd  !== a.gd)  return b.gd  - a.gd
    if (b.gf  !== a.gf)  return b.gf  - a.gf
    return a.team.name.localeCompare(b.team.name)
  })

  // ── Process slot rules in match-number order ──────────────────────────────────
  // virtualTeams holds the computed home/away teams for each knockout match
  const virtualTeams = new Map<number, { home: TeamInfo | null; away: TeamInfo | null }>()
  const usedThirdIds = new Set<string>()  // avoid assigning the same third to two slots

  const rules = slotRulesRaw
    .map(r => ({
      ...r,
      match_number: matchNumById.get(r.match_id) ?? 0,
      source_match_number: r.source_match_id ? (matchNumById.get(r.source_match_id) ?? null) : null,
      source_group_name: r.source_group_id ? (groupIdToName.get(r.source_group_id) ?? null) : null,
    }))
    .sort((a, b) => a.match_number - b.match_number)  // R32 → R16 → QF → SF → Final/3rd

  for (const rule of rules) {
    const { match_number, slot, rule_type } = rule
    if (!virtualTeams.has(match_number)) {
      virtualTeams.set(match_number, { home: null, away: null })
    }
    const teams = virtualTeams.get(match_number)!
    let teamInfo: TeamInfo | null = null

    // ── group_position: 1st / 2nd of a specific group ─────────────────────────
    if (rule_type === 'group_position' && rule.source_group_name && rule.position != null) {
      const standings = groupStandings.get(rule.source_group_name) ?? []
      teamInfo = standings.find(e => e.position === rule.position)?.team ?? null

    // ── best_third: best remaining third from eligible groups ─────────────────
    } else if (rule_type === 'best_third' && rule.third_groups) {
      for (const third of allThirds) {
        if (usedThirdIds.has(third.team.id)) continue
        if (rule.third_groups.includes(third.group_name)) {
          teamInfo = third.team
          usedThirdIds.add(third.team.id)
          break
        }
      }

    // ── match_winner: winner of a previous knockout match ─────────────────────
    } else if (rule_type === 'match_winner' && rule.source_match_number != null) {
      const srcNum = rule.source_match_number
      const srcTeams = virtualTeams.get(srcNum)
      const srcPred  = predByMatchNum.get(srcNum)

      if (srcPred && srcTeams?.home && srcTeams?.away) {
        const winnerId = resolveKnockoutWinner(srcPred, srcTeams.home.id, srcTeams.away.id)
        if (winnerId === srcTeams.home.id) teamInfo = srcTeams.home
        else if (winnerId === srcTeams.away.id) teamInfo = srcTeams.away
      }

    // ── match_loser: loser of a previous knockout match (3rd-place match) ─────
    } else if (rule_type === 'match_loser' && rule.source_match_number != null) {
      const srcNum = rule.source_match_number
      const srcTeams = virtualTeams.get(srcNum)
      const srcPred  = predByMatchNum.get(srcNum)

      if (srcPred && srcTeams?.home && srcTeams?.away) {
        const winnerId = resolveKnockoutWinner(srcPred, srcTeams.home.id, srcTeams.away.id)
        if (winnerId === srcTeams.home.id) teamInfo = srcTeams.away
        else if (winnerId === srcTeams.away.id) teamInfo = srcTeams.home
      }
    }

    if (slot === 'home') teams.home = teamInfo
    else                 teams.away = teamInfo
  }

  // ── Build the virtual MatchMap ────────────────────────────────────────────────
  const result: VirtualMatchMap = new Map()

  const ALL_KNOCKOUT = [
    73,74,75,76,77,78,79,80,81,82,83,84,85,86,87,88,
    89,90,91,92,93,94,95,96,
    97,98,99,100,
    101,102,
    103,104,
  ]

  for (const num of ALL_KNOCKOUT) {
    const realMatch = matchByNum.get(num)
    if (!realMatch) continue

    const teams = virtualTeams.get(num) ?? { home: null, away: null }
    const pred  = predByMatchNum.get(num)

    let winner_team_id: string | null = null
    let home_score_pk: number | null  = null
    let away_score_pk: number | null  = null

    if (pred && teams.home && teams.away) {
      winner_team_id = resolveKnockoutWinner(pred, teams.home.id, teams.away.id)

      // Set pk fields non-null so the "P" suffix renders in MatchCard
      if (pred.predicted_pk_winner_id !== null) {
        home_score_pk = 1
        away_score_pk = 1
      }
    }

    const virtualMatch: MatchWithRelations = {
      ...realMatch,
      home_team: teams.home,
      away_team: teams.away,
      home_slot_label: teams.home ? null : realMatch.home_slot_label,
      away_slot_label: teams.away ? null : realMatch.away_slot_label,
      home_score_90: pred?.home_score       ?? null,
      away_score_90: pred?.away_score       ?? null,
      home_score_et: pred?.home_score_et    ?? null,
      away_score_et: pred?.away_score_et    ?? null,
      home_score_pk,
      away_score_pk,
      winner_team_id,
    }

    result.set(num, virtualMatch)
  }

  return result
}
