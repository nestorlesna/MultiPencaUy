import { Target, Check } from 'lucide-react'
import type { LeaderboardEntry } from '../../types'

// Presentación pura del ranking (podio + mi posición + tabla completa).
// Usada por la página v1 (global) y la v2 (scoped por Ten-Comp).
// onSelect (opcional): hace clickeable cada fila/podio para abrir el detalle.
export function LeaderboardView({
  entries,
  myId,
  onSelect,
}: {
  entries: LeaderboardEntry[]
  myId?: string
  onSelect?: (entry: LeaderboardEntry) => void
}) {
  const myEntry = entries.find(e => e.user_id === myId)
  const hasMore = entries.length > 3

  return (
    <>
      <TopThree entries={entries.slice(0, 3)} myId={myId} onSelect={onSelect} />

      {myEntry && myEntry.rank > 3 && (
        <div className="mb-3">
          <p className="text-xs text-text-muted uppercase tracking-wide mb-1.5">Tu posición</p>
          <LeaderboardRow entry={myEntry} isMe onSelect={onSelect} />
        </div>
      )}

      {hasMore && (
        <div className="space-y-2">
          <p className="text-xs text-text-muted uppercase tracking-wide mb-1.5">Tabla completa</p>
          {entries.map(entry => (
            <LeaderboardRow key={entry.user_id} entry={entry} isMe={entry.user_id === myId} onSelect={onSelect} />
          ))}
        </div>
      )}
    </>
  )
}

export function MedalOrRank({ rank }: { rank: number }) {
  if (rank === 1) return <span className="text-accent text-lg">🥇</span>
  if (rank === 2) return <span className="text-accent text-lg">🥈</span>
  if (rank === 3) return <span className="text-accent text-lg">🥉</span>
  return <span className="text-sm font-bold tabular-nums text-text-muted w-6 text-center">{rank}</span>
}

export function Avatar({ entry }: { entry: LeaderboardEntry }) {
  const initials = (entry.display_name || entry.username)[0].toUpperCase()
  if (entry.avatar_url) {
    return <img src={entry.avatar_url} alt="" className="w-9 h-9 rounded-full object-cover flex-shrink-0" />
  }
  return (
    <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
      <span className="text-primary font-bold text-sm">{initials}</span>
    </div>
  )
}

function LeaderboardRow({
  entry,
  isMe,
  onSelect,
}: {
  entry: LeaderboardEntry
  isMe: boolean
  onSelect?: (entry: LeaderboardEntry) => void
}) {
  const clickable = !!onSelect
  return (
    <div
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={clickable ? () => onSelect!(entry) : undefined}
      onKeyDown={clickable ? e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect!(entry) } } : undefined}
      className={`card p-3 flex items-center gap-3 transition-colors ${isMe ? 'border-primary/40 bg-primary/5' : ''} ${clickable ? 'cursor-pointer hover:border-primary/40' : ''}`}
    >
      <div className="flex-shrink-0 w-8 flex justify-center">
        <MedalOrRank rank={entry.rank} />
      </div>
      <Avatar entry={entry} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-sm font-medium text-text-primary truncate">{entry.display_name}</span>
          {isMe && <span className="badge bg-primary/20 text-primary text-[10px]">Yo</span>}
        </div>
        <div className="flex items-center gap-3 mt-0.5">
          <span className="flex items-center gap-1 text-[11px] text-text-muted">
            <Check size={11} className="text-primary" />
            {entry.predictions_count} pred.
          </span>
          <span className="flex items-center gap-1 text-[11px] text-text-muted">
            <Target size={11} className="text-accent" />
            {entry.exact_scores} exactos
          </span>
        </div>
      </div>
      <div className="flex-shrink-0 text-right">
        <p className="text-xl font-bold tabular-nums text-primary leading-none">{entry.total_points}</p>
        <p className="text-[10px] text-text-muted mt-0.5">pts</p>
      </div>
    </div>
  )
}

function PodiumCard({
  entry,
  height,
  myId,
  onSelect,
}: {
  entry: LeaderboardEntry
  height: string
  myId?: string
  onSelect?: (entry: LeaderboardEntry) => void
}) {
  const isMe = entry.user_id === myId
  const clickable = !!onSelect
  return (
    <div
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={clickable ? () => onSelect!(entry) : undefined}
      onKeyDown={clickable ? e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect!(entry) } } : undefined}
      className={`flex flex-col items-center gap-2 ${clickable ? 'cursor-pointer' : ''}`}
    >
      <Avatar entry={entry} />
      <p className={`text-xs font-medium text-center truncate max-w-[80px] ${isMe ? 'text-primary' : 'text-text-primary'}`}>
        {entry.display_name}
      </p>
      <div
        className={`w-full flex flex-col items-center justify-end rounded-t-lg ${height} ${
          entry.rank === 1 ? 'bg-accent/20 border border-accent/30' : 'bg-surface-2 border border-border'
        }`}
      >
        <MedalOrRank rank={entry.rank} />
        <p className="text-sm font-bold text-primary tabular-nums pb-2">{entry.total_points}</p>
      </div>
    </div>
  )
}

function TopThree({
  entries,
  myId,
  onSelect,
}: {
  entries: LeaderboardEntry[]
  myId?: string
  onSelect?: (entry: LeaderboardEntry) => void
}) {
  const [first, second, third] = entries

  if (!first) return null

  return (
    <div className="grid grid-cols-3 gap-2 items-end mb-6">
      {second ? <PodiumCard entry={second} height="h-20" myId={myId} onSelect={onSelect} /> : <div />}
      <PodiumCard entry={first} height="h-28" myId={myId} onSelect={onSelect} />
      {third ? <PodiumCard entry={third} height="h-16" myId={myId} onSelect={onSelect} /> : <div />}
    </div>
  )
}
