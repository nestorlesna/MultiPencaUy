import { useQuery } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useTenComp } from '../../contexts/TenCompContext'
import type { MatchWithRelations } from '../../types/match'

// Vista del cuadro del torneo (read-only), scoped por competencia.
// El layout asume la estructura del Mundial 48 (M73–M104), que es el único
// motor de avance disponible en v1 (wc48_best_thirds). "Mi Cuadro" (virtual,
// según predicciones) queda diferido hasta parametrizar virtualBracket.ts.

const UNIT = 88
const CARD_W = 144
const CONN_W = 20
const TOTAL_H = 16 * UNIT
const STROKE = '#2E3A4D'
const MID = CONN_W / 2

const ALL_R32 = [74, 77, 73, 75, 83, 84, 81, 82, 76, 78, 79, 80, 86, 88, 85, 87]
const ALL_R16 = [89, 90, 93, 94, 91, 92, 95, 96]
const ALL_QF = [97, 98, 99, 100]
const ALL_SF = [101, 102]
const FINAL = 104
const THIRD = 103

function makePairPaths(count: number, slotH: number, topOffset: number): string[] {
  const paths: string[] = []
  for (let i = 0; i < count; i++) {
    const yTop = topOffset + i * slotH * 2
    const yBot = yTop + slotH
    const yMid = yTop + slotH / 2
    paths.push(`M0,${yTop} H${MID} V${yMid} H${CONN_W}`)
    paths.push(`M0,${yBot} H${MID} V${yMid}`)
  }
  return paths
}

const R32_R16 = makePairPaths(8, UNIT, UNIT / 2)
const R16_QF = makePairPaths(4, UNIT * 2, UNIT)
const QF_SF = makePairPaths(2, UNIT * 4, UNIT * 2)
const SF_FIN = makePairPaths(1, UNIT * 8, UNIT * 4)

type MatchMap = Map<number, MatchWithRelations>

const MATCH_SELECT = `
  id, match_number, match_datetime, status,
  home_slot_label, away_slot_label,
  home_score_90, away_score_90,
  home_score_et, away_score_et,
  home_score_pk, away_score_pk,
  winner_team_id,
  phase:phases(id, name, order:sort_order, has_extra_time, has_penalties),
  group:groups(id, name),
  stadium:stadiums(id, name, city, country, timezone),
  home_team:teams!home_team_id(id, name, abbreviation, flag_url, is_confirmed, placeholder_name),
  away_team:teams!away_team_id(id, name, abbreviation, flag_url, is_confirmed, placeholder_name)
` as const

async function fetchKnockout(competitionId: string): Promise<MatchMap> {
  const { data: phases } = await supabase
    .from('phases')
    .select('id, sort_order')
    .eq('competition_id', competitionId)
  const ids = (phases as Array<{ id: string; sort_order: number }> | null)
    ?.filter(p => p.sort_order >= 2).map(p => p.id) ?? []
  if (ids.length === 0) return new Map()

  const { data, error } = await supabase
    .from('matches')
    .select(MATCH_SELECT)
    .eq('competition_id', competitionId)
    .in('phase_id', ids)
    .order('match_number')
  if (error) throw error
  const matches = (data ?? []) as unknown as MatchWithRelations[]
  return new Map(matches.map(m => [m.match_number, m]))
}

function TeamRow({ team, label, score, etTotal, suffix, winner, loser }: {
  team: MatchWithRelations['home_team'] | null
  label: string
  score: number | null
  etTotal?: number | null
  suffix?: string
  winner: boolean
  loser: boolean
}) {
  const scoreStr = score !== null ? (etTotal != null ? `${score}-${etTotal}` : String(score)) : null
  return (
    <div className={`flex items-center gap-1.5 px-2 py-[5px] ${winner ? 'bg-primary/10' : ''}`}>
      {team?.flag_url
        ? <img src={team.flag_url} alt="" className="w-5 h-3.5 rounded-sm object-cover flex-shrink-0" loading="lazy" />
        : <div className="w-5 h-3.5 rounded-sm bg-border flex-shrink-0" />}
      <span className={`text-[11px] flex-1 font-medium truncate ${
        winner ? 'text-text-primary' : loser ? 'text-text-muted' : 'text-text-secondary'
      }`}>{label}</span>
      {scoreStr !== null && (
        <span className={`text-xs font-bold tabular-nums ${winner ? 'text-primary' : 'text-text-muted'}`}>
          {scoreStr}{suffix ?? ''}
        </span>
      )}
    </div>
  )
}

function MatchCard({ matchNum, matchMap }: { matchNum: number; matchMap: MatchMap }) {
  const m = matchMap.get(matchNum)
  const home = m?.home_team ?? null
  const away = m?.away_team ?? null
  const homeLabel = home?.is_confirmed ? home.abbreviation : (m?.home_slot_label ?? '?')
  const awayLabel = away?.is_confirmed ? away.abbreviation : (m?.away_slot_label ?? '?')

  const played = m != null && m.home_score_90 !== null && m.away_score_90 !== null
  const hasEt = played && m!.home_score_et !== null
  const pkDecided = played && m!.home_score_pk !== null

  const homeScore = played ? m!.home_score_90! : null
  const awayScore = played ? m!.away_score_90! : null
  const homeEtTotal = hasEt ? m!.home_score_90! + m!.home_score_et! : null
  const awayEtTotal = hasEt ? m!.away_score_90! + m!.away_score_et! : null

  const homeWin = played && !!home && m!.winner_team_id === home.id
  const awayWin = played && !!away && m!.winner_team_id === away.id
  const homeSuffix = pkDecided && homeWin ? 'P' : undefined
  const awaySuffix = pkDecided && awayWin ? 'P' : undefined

  return (
    <div className="rounded-lg overflow-hidden bg-surface border border-border" style={{ width: CARD_W }}>
      <div className="px-2 py-[2px] bg-surface-2 border-b border-border">
        <span className="text-[9px] text-text-muted font-medium">M{matchNum}</span>
      </div>
      <TeamRow team={home} label={homeLabel} score={homeScore} etTotal={homeEtTotal} suffix={homeSuffix} winner={homeWin} loser={awayWin} />
      <div className="h-px bg-border" />
      <TeamRow team={away} label={awayLabel} score={awayScore} etTotal={awayEtTotal} suffix={awaySuffix} winner={awayWin} loser={homeWin} />
    </div>
  )
}

function BracketCol({ matchNums, matchMap }: { matchNums: number[]; matchMap: MatchMap }) {
  const slotH = TOTAL_H / matchNums.length
  return (
    <div style={{ height: TOTAL_H, display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
      {matchNums.map(num => (
        <div key={num} style={{ height: slotH, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <MatchCard matchNum={num} matchMap={matchMap} />
        </div>
      ))}
    </div>
  )
}

function Connector({ paths }: { paths: string[] }) {
  return (
    <svg width={CONN_W} height={TOTAL_H} viewBox={`0 0 ${CONN_W} ${TOTAL_H}`} style={{ flexShrink: 0, display: 'block' }}>
      {paths.map((d, i) => (
        <path key={i} d={d} fill="none" stroke={STROKE} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      ))}
    </svg>
  )
}

const PHASE_LABELS = ['Dieciseis.', 'Octavos', 'Cuartos', 'Semis', 'Final']
const hCls = 'text-[10px] font-semibold text-text-muted uppercase tracking-wide text-center py-2'

function PhaseHeaders() {
  const col = { width: CARD_W, flexShrink: 0 } as const
  const gap = { width: CONN_W, flexShrink: 0 } as const
  return (
    <div className="flex items-center">
      {PHASE_LABELS.map((label, i) => [
        i > 0 && <div key={`g${i}`} style={gap} />,
        <div key={label} style={col} className={`${hCls} ${label === 'Final' ? 'text-accent' : ''}`}>{label}</div>,
      ])}
    </div>
  )
}

function BracketLayout({ matchMap }: { matchMap: MatchMap }) {
  const totalW = 5 * CARD_W + 4 * CONN_W
  return (
    <div className="overflow-x-auto pb-4">
      <div style={{ minWidth: totalW }}>
        <PhaseHeaders />
        <div className="flex" style={{ height: TOTAL_H }}>
          <BracketCol matchNums={ALL_R32} matchMap={matchMap} />
          <Connector paths={R32_R16} />
          <BracketCol matchNums={ALL_R16} matchMap={matchMap} />
          <Connector paths={R16_QF} />
          <BracketCol matchNums={ALL_QF} matchMap={matchMap} />
          <Connector paths={QF_SF} />
          <BracketCol matchNums={ALL_SF} matchMap={matchMap} />
          <Connector paths={SF_FIN} />
          <BracketCol matchNums={[FINAL]} matchMap={matchMap} />
        </div>
        <div className="flex flex-col items-center gap-2 mt-6 pt-4 border-t border-border"
          style={{ marginLeft: 4 * (CARD_W + CONN_W), width: CARD_W }}>
          <span className="text-[10px] text-text-muted uppercase tracking-wide font-semibold">3° Puesto</span>
          <MatchCard matchNum={THIRD} matchMap={matchMap} />
        </div>
      </div>
    </div>
  )
}

export function PencaCuadroPage() {
  const { competition } = useTenComp()
  const { data: matchMap = new Map<number, MatchWithRelations>(), isLoading } = useQuery({
    queryKey: ['v2', 'bracket', competition.id],
    queryFn: () => fetchKnockout(competition.id),
    staleTime: 1000 * 60,
  })

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-text-primary">Cuadro</h1>
        <p className="text-xs text-text-muted mt-1">Fase eliminatoria · Dieciseisavos → Final</p>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20"><Loader2 className="animate-spin text-primary" size={28} /></div>
      ) : matchMap.size === 0 ? (
        <div className="card p-8 text-center">
          <p className="text-text-muted text-sm">El cuadro eliminatorio todavía no está disponible.</p>
        </div>
      ) : (
        <BracketLayout matchMap={matchMap} />
      )}
    </div>
  )
}
