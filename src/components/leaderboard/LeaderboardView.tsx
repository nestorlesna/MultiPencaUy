import { Target, Check } from 'lucide-react'
import type { LeaderboardEntry } from '../../types'

// Presentación pura del ranking (podio + mi posición + tabla completa).
// Usada por la página v1 (global) y la v2 (scoped por Ten-Comp).
export function LeaderboardView({ entries, myId }: { entries: LeaderboardEntry[]; myId?: string }) {
  const myEntry = entries.find(e => e.user_id === myId)
  const hasMore = entries.length > 3

  return (
    <>
      <TopThree entries={entries.slice(0, 3)} myId={myId} />

      {myEntry && myEntry.rank > 3 && (
        <div className="mb-3">
          <p className="text-xs text-text-muted uppercase tracking-wide mb-1.5">Tu posición</p>
          <LeaderboardRow entry={myEntry} isMe />
        </div>
      )}

      {hasMore && (
        <div className="space-y-2">
          <p className="text-xs text-text-muted uppercase tracking-wide mb-1.5">Tabla completa</p>
          {entries.map(entry => (
            <LeaderboardRow key={entry.user_id} entry={entry} isMe={entry.user_id === myId} />
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

function LeaderboardRow({ entry, isMe }: { entry: LeaderboardEntry; isMe: boolean }) {
  return (
    <div className={`card p-3 flex items-center gap-3 transition-colors ${isMe ? 'border-primary/40 bg-primary/5' : ''}`}>
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

function TopThree({ entries, myId }: { entries: LeaderboardEntry[]; myId?: string }) {
  const [first, second, third] = entries

  function PodiumCard({ entry, height }: { entry: LeaderboardEntry; height: string }) {
    const isMe = entry.user_id === myId
    return (
      <div className="flex flex-col items-center gap-2">
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

  if (!first) return null

  return (
    <div className="grid grid-cols-3 gap-2 items-end mb-6">
      {second ? <PodiumCard entry={second} height="h-20" /> : <div />}
      <PodiumCard entry={first} height="h-28" />
      {third ? <PodiumCard entry={third} height="h-16" /> : <div />}
    </div>
  )
}
