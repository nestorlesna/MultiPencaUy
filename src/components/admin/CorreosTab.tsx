import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Loader2, Mail, Send, Trash2, CheckCircle2, XCircle, Clock,
  ChevronDown, ChevronUp, RefreshCw, AlertTriangle, Trophy, Swords, Bell, Eye, X,
  UserPlus, AtSign,
} from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '../../lib/supabase'
import { fetchMembers } from '../../services/v2/adminService'
import { fetchLeaderboard } from '../../services/v2/leaderboardService'
import { fetchMatches } from '../../services/v2/matchService'
import {
  fetchEmailQueue, enqueueEmails, deleteEmail, deleteAllEmails,
  sendEmailViaApi, fetchTenCompUserDetails, fetchMatchPredictions,
  fetchTenCompJoinCode, fetchInvitableUsers,
  buildSinPrediccionesEmail, buildRankingEmail, buildResultadoEmail,
  buildInvitacionEmail, buildRecordatorioEmail,
  type EmailBrand, type EmailQueueEntry, type CreateEmailInput, type MatchInfoForEmail,
  type InvitableUser,
} from '../../services/v2/emailService'
import type { MatchWithRelations } from '../../types/match'

interface Props {
  tenCompId: string
  tenantId: string
  competitionId: string
  brand: EmailBrand
}

export function CorreosTab({ tenCompId, tenantId, competitionId, brand }: Props) {
  const qc = useQueryClient()
  const [preview, setPreview] = useState<EmailQueueEntry | null>(null)

  const { data: members = [] } = useQuery({
    queryKey: ['v2', 'members', tenCompId],
    queryFn: () => fetchMembers(tenCompId),
  })
  const { data: details = [] } = useQuery({
    queryKey: ['v2', 'email-user-details', tenCompId],
    queryFn: () => fetchTenCompUserDetails(tenCompId),
  })
  const { data: leaderboard = [] } = useQuery({
    queryKey: ['v2', 'leaderboard', tenCompId],
    queryFn: () => fetchLeaderboard(tenCompId),
  })
  const { data: matches = [] } = useQuery({
    queryKey: ['matches', competitionId],
    queryFn: () => fetchMatches(competitionId),
  })
  const { data: queue = [], isLoading: loadingQueue } = useQuery({
    queryKey: ['v2', 'email-queue', tenCompId],
    queryFn: () => fetchEmailQueue(tenCompId),
  })
  // Código de invitación (penca privada) e invitables del mismo tenant.
  const { data: joinCode = null } = useQuery({
    queryKey: ['v2', 'join-code', tenCompId],
    queryFn: () => fetchTenCompJoinCode(tenCompId),
  })
  const { data: invitables = [] } = useQuery({
    queryKey: ['v2', 'invitable-users', tenCompId],
    queryFn: () => fetchInvitableUsers(tenCompId),
  })

  const invalidateQueue = () => qc.invalidateQueries({ queryKey: ['v2', 'email-queue', tenCompId] })

  // Mapas de apoyo
  const approved = members.filter(m => m.status === 'approved')
  const emailMap = new Map(details.map(d => [d.id, d]))
  const lbMap = new Map(leaderboard.map(e => [e.user_id, e]))
  const nameOf = (uid: string) => {
    const m = members.find(x => x.user_id === uid)
    return m?.display_name || m?.username || 'Usuario'
  }
  // Solo destinatarios con email conocido (miembros del ten-comp)
  const recipients = approved.filter(m => emailMap.has(m.user_id))
  // Quiénes optaron por NO recibir novedades (por defecto se los excluye).
  const optedOutMembers = new Set(members.filter(m => m.wants_news === false).map(m => m.user_id))
  const optedOutInvitables = new Set(invitables.filter(u => u.wants_news === false).map(u => u.id))

  function baseEntry(uid: string): Omit<CreateEmailInput, 'subject' | 'body_html' | 'category'> {
    return {
      tenant_id: tenantId,
      ten_comp_id: tenCompId,
      to_email: emailMap.get(uid)!.email,
      to_name: nameOf(uid),
      user_id: uid,
    }
  }

  // Helper genérico de encolado
  const enqueueMut = useMutation({
    mutationFn: (entries: CreateEmailInput[]) => enqueueEmails(entries),
    onSuccess: () => { invalidateQueue(); toast.success('Correos agregados a la cola') },
    onError: (e: Error) => toast.error(e.message),
  })

  return (
    <div className="space-y-5">
      <p className="text-xs text-text-muted">
        Se envían desde el correo de la plataforma, firmados con el nombre de la empresa.
        Cada destinatario es un miembro aprobado de esta penca.
      </p>

      {/* ── Sin predicciones ── */}
      <SinPrediccionesSection
        recipients={recipients}
        optedOut={optedOutMembers}
        detailsCount={uid => emailMap.get(uid)?.predictions_count ?? 0}
        nameOf={nameOf}
        queue={queue}
        onEnqueue={(uids) => enqueueMut.mutate(uids.map(uid => ({
          ...baseEntry(uid),
          subject: `¡Todavía no cargaste tus pronósticos! · ${brand.pencaName}`,
          body_html: buildSinPrediccionesEmail(brand, nameOf(uid)),
          category: 'sin_predicciones',
        })))}
        pending={enqueueMut.isPending}
      />

      {/* ── Ranking ── */}
      <RankingSection
        recipients={recipients}
        optedOut={optedOutMembers}
        nameOf={nameOf}
        lbMap={lbMap}
        queue={queue}
        onEnqueue={(uids) => {
          const top5 = leaderboard.slice(0, 5)
          const total = leaderboard.length
          enqueueMut.mutate(uids.map(uid => ({
            ...baseEntry(uid),
            subject: `🏆 Ranking actualizado · ${brand.pencaName}`,
            body_html: buildRankingEmail(brand, nameOf(uid), top5, lbMap.get(uid), total),
            category: 'ranking',
          })))
        }}
        pending={enqueueMut.isPending}
      />

      {/* ── Resultado de partido ── */}
      <ResultadoSection
        recipients={recipients}
        optedOut={optedOutMembers}
        nameOf={nameOf}
        matches={matches}
        queue={queue}
        onEnqueue={async (match, uids) => {
          const preds = await fetchMatchPredictions(tenCompId, match.id)
          const info: MatchInfoForEmail = {
            match_number: match.match_number,
            home_name: match.home_team?.name ?? match.home_slot_label ?? '?',
            away_name: match.away_team?.name ?? match.away_slot_label ?? '?',
            home_score_90: match.home_score_90,
            away_score_90: match.away_score_90,
            match_datetime: match.match_datetime,
            status: match.status,
          }
          enqueueMut.mutate(uids.map(uid => ({
            ...baseEntry(uid),
            subject: `P${match.match_number}: ${info.home_name} vs ${info.away_name} — resultados de la penca`,
            body_html: buildResultadoEmail(brand, nameOf(uid), uid, info, preds, leaderboard.slice(0, 5)),
            category: `partido_M${match.match_number}`,
          })))
        }}
        pending={enqueueMut.isPending}
      />

      {/* ── Invitar usuarios registrados (otras pencas del mismo tenant) ── */}
      <InvitarRegistradosSection
        invitables={invitables}
        optedOut={optedOutInvitables}
        queue={queue}
        onEnqueue={(users) => enqueueMut.mutate(users.map(u => ({
          tenant_id: tenantId,
          ten_comp_id: tenCompId,
          to_email: u.email,
          to_name: u.display_name || u.email,
          user_id: u.id,
          subject: `🎟️ Te invitamos a ${brand.pencaName}`,
          body_html: buildInvitacionEmail(brand, u.display_name || 'jugador', joinCode),
          category: 'invitacion',
        })))}
        pending={enqueueMut.isPending}
      />

      {/* ── Invitar por email a externos (no registrados) ── */}
      <InvitarExternosSection
        joinCode={joinCode}
        onEnqueue={(emails) => enqueueMut.mutate(emails.map(em => ({
          tenant_id: tenantId,
          ten_comp_id: tenCompId,
          to_email: em,
          to_name: em.split('@')[0],
          user_id: null,
          subject: `🎟️ Te invitamos a ${brand.pencaName}`,
          body_html: buildInvitacionEmail(brand, em.split('@')[0], joinCode),
          category: 'invitacion_externa',
        })))}
        pending={enqueueMut.isPending}
      />

      {/* ── Recordatorio ── */}
      <RecordatorioSection
        recipients={recipients}
        optedOut={optedOutMembers}
        nameOf={nameOf}
        matches={matches}
        queue={queue}
        onEnqueue={(uids, proximos) => enqueueMut.mutate(uids.map(uid => ({
          ...baseEntry(uid),
          subject: `⏰ Cargá tus pronósticos · ${brand.pencaName}`,
          body_html: buildRecordatorioEmail(brand, nameOf(uid), proximos),
          category: 'recordatorio',
        })))}
        pending={enqueueMut.isPending}
      />

      {/* ── Cola + envío ── */}
      <QueuePanel
        queue={queue}
        loading={loadingQueue}
        tenCompId={tenCompId}
        onChanged={invalidateQueue}
        onPreview={setPreview}
      />

      {preview && <PreviewModal email={preview} onClose={() => setPreview(null)} />}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// Secciones
// ════════════════════════════════════════════════════════════════════════════
type Member = { user_id: string; status: string }

function Section({ icon: Icon, title, count, children, color = 'text-accent' }: {
  icon: typeof Mail; title: string; count?: number; children: React.ReactNode; color?: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="card p-4">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon size={16} className={color} />
          <span className="font-semibold text-text-primary text-sm">{title}</span>
          {count !== undefined && <span className="badge bg-border text-text-muted text-[10px]">{count}</span>}
        </div>
        {open ? <ChevronUp size={16} className="text-text-muted" /> : <ChevronDown size={16} className="text-text-muted" />}
      </button>
      {open && <div className="mt-4 space-y-3">{children}</div>}
    </div>
  )
}

function Picker({ recipients, nameOf, disabledIds, optedOutIds, selected, toggle, selectAll, clear, rightFor }: {
  recipients: Member[]
  nameOf: (uid: string) => string
  disabledIds: Set<string>
  optedOutIds?: Set<string>
  selected: Set<string>
  toggle: (id: string) => void
  selectAll: () => void
  clear: () => void
  rightFor?: (uid: string) => React.ReactNode
}) {
  return (
    <>
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={selectAll} className="btn-ghost text-xs py-1 px-3">Seleccionar disponibles</button>
        <button onClick={clear} className="btn-ghost text-xs py-1 px-3">Deseleccionar</button>
        <span className="text-xs text-text-muted ml-auto">{selected.size} seleccionados</span>
      </div>
      <div className="space-y-1.5 max-h-64 overflow-y-auto">
        {recipients.map(m => {
          const inQueue = disabledIds.has(m.user_id)
          return (
            <label key={m.user_id}
              className={`flex items-center gap-3 p-2.5 rounded-lg cursor-pointer transition-colors ${inQueue ? 'opacity-40 cursor-not-allowed' : 'hover:bg-surface-2'}`}>
              <input type="checkbox" disabled={inQueue} checked={selected.has(m.user_id)}
                onChange={() => toggle(m.user_id)} className="accent-primary" />
              <span className="flex-1 min-w-0 text-sm text-text-primary truncate">{nameOf(m.user_id)}</span>
              {rightFor?.(m.user_id)}
              {optedOutIds?.has(m.user_id) && (
                <span className="badge bg-accent/15 text-accent text-[10px] flex-shrink-0">Sin novedades</span>
              )}
              {inQueue && <span className="badge bg-border text-text-muted text-[10px]">En cola</span>}
            </label>
          )
        })}
        {recipients.length === 0 && <p className="text-sm text-text-muted text-center py-4">No hay destinatarios.</p>}
      </div>
    </>
  )
}

function useSelection() {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const toggle = (id: string) => setSelected(prev => {
    const n = new Set(prev)
    if (n.has(id)) n.delete(id); else n.add(id)
    return n
  })
  const clear = () => setSelected(new Set())
  return { selected, setSelected, toggle, clear }
}

// Combina "en cola" con "optó por no recibir novedades" (cuando se respeta la
// preferencia) para deshabilitar destinatarios. Por defecto se respeta; el admin
// puede desmarcar para un correo importante que igual debe llegar a todos.
function useRespectNews(queued: Set<string>, optedOut: Set<string>) {
  const [respect, setRespect] = useState(true)
  const disabled = new Set(queued)
  if (respect) optedOut.forEach(id => disabled.add(id))
  return { respect, setRespect, disabled }
}

function RespectNewsToggle({ respect, setRespect, excluded }: {
  respect: boolean; setRespect: (v: boolean) => void; excluded: number
}) {
  if (excluded === 0) return null
  return (
    <label className="flex items-start gap-2 cursor-pointer select-none rounded-lg bg-surface-2 p-2.5">
      <input type="checkbox" checked={respect} onChange={e => setRespect(e.target.checked)}
        className="mt-0.5 accent-primary" />
      <span className="text-xs text-text-secondary leading-snug">
        Respetar la preferencia de novedades
        {respect
          ? <span className="text-text-muted"> · {excluded} {excluded === 1 ? 'destinatario excluido' : 'destinatarios excluidos'}</span>
          : <span className="text-accent"> · desactivado, se incluye a quienes no quieren novedades</span>}
      </span>
    </label>
  )
}

function EnqueueButton({ count, pending, onClick, label, icon: Icon = Mail }: {
  count: number; pending: boolean; onClick: () => void; label: string; icon?: typeof Mail
}) {
  return (
    <button disabled={count === 0 || pending} onClick={onClick}
      className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50">
      {pending ? <Loader2 size={15} className="animate-spin" /> : <Icon size={15} />}
      {label} {count > 0 ? `(${count})` : ''}
    </button>
  )
}

function SinPrediccionesSection({ recipients, optedOut, detailsCount, nameOf, queue, onEnqueue, pending }: {
  recipients: Member[]; optedOut: Set<string>; detailsCount: (uid: string) => number; nameOf: (uid: string) => string
  queue: EmailQueueEntry[]; onEnqueue: (uids: string[]) => void; pending: boolean
}) {
  const { selected, setSelected, toggle, clear } = useSelection()
  const list = recipients.filter(m => detailsCount(m.user_id) === 0)
  const queued = new Set(queue.filter(e => e.category === 'sin_predicciones').map(e => e.user_id!).filter(Boolean))
  const { respect, setRespect, disabled } = useRespectNews(queued, optedOut)
  const excluded = list.filter(m => optedOut.has(m.user_id)).length
  return (
    <Section icon={AlertTriangle} title="Sin predicciones" count={list.length}>
      <p className="text-xs text-text-muted">Miembros aprobados que no cargaron ningún pronóstico.</p>
      <RespectNewsToggle respect={respect} setRespect={setRespect} excluded={excluded} />
      <Picker recipients={list} nameOf={nameOf} disabledIds={disabled} optedOutIds={optedOut} selected={selected} toggle={toggle}
        selectAll={() => setSelected(new Set(list.filter(m => !disabled.has(m.user_id)).map(m => m.user_id)))} clear={clear} />
      <EnqueueButton count={selected.size} pending={pending} label="Agregar a la cola"
        onClick={() => { onEnqueue([...selected]); clear() }} />
    </Section>
  )
}

function RankingSection({ recipients, optedOut, nameOf, lbMap, queue, onEnqueue, pending }: {
  recipients: Member[]; optedOut: Set<string>; nameOf: (uid: string) => string; lbMap: Map<string, { rank: number; total_points: number }>
  queue: EmailQueueEntry[]; onEnqueue: (uids: string[]) => void; pending: boolean
}) {
  const { selected, setSelected, toggle, clear } = useSelection()
  const queued = new Set(queue.filter(e => e.category === 'ranking').map(e => e.user_id!).filter(Boolean))
  const { respect, setRespect, disabled } = useRespectNews(queued, optedOut)
  const excluded = recipients.filter(m => optedOut.has(m.user_id)).length
  return (
    <Section icon={Trophy} title="Ranking actual" count={recipients.length}>
      <p className="text-xs text-text-muted">Envía a cada uno el top 5 y su posición actual.</p>
      <RespectNewsToggle respect={respect} setRespect={setRespect} excluded={excluded} />
      <Picker recipients={recipients} nameOf={nameOf} disabledIds={disabled} optedOutIds={optedOut} selected={selected} toggle={toggle}
        selectAll={() => setSelected(new Set(recipients.filter(m => !disabled.has(m.user_id)).map(m => m.user_id)))} clear={clear}
        rightFor={uid => {
          const e = lbMap.get(uid)
          return e ? <span className="text-[11px] text-accent flex-shrink-0">#{e.rank} · {e.total_points} pts</span> : null
        }} />
      <EnqueueButton count={selected.size} pending={pending} label="Agregar a la cola" icon={Trophy}
        onClick={() => { onEnqueue([...selected]); clear() }} />
    </Section>
  )
}

function ResultadoSection({ recipients, optedOut, nameOf, matches, queue, onEnqueue, pending }: {
  recipients: Member[]; optedOut: Set<string>; nameOf: (uid: string) => string; matches: MatchWithRelations[]
  queue: EmailQueueEntry[]
  onEnqueue: (match: MatchWithRelations, uids: string[]) => void; pending: boolean
}) {
  const { selected, setSelected, toggle, clear } = useSelection()
  const [matchId, setMatchId] = useState('')
  const match = matches.find(m => m.id === matchId)
  const finished = matches.filter(m => m.status === 'finished')
    .sort((a, b) => new Date(b.match_datetime).getTime() - new Date(a.match_datetime).getTime())
  const queued = new Set(
    queue.filter(e => match && e.category === `partido_M${match.match_number}`).map(e => e.user_id!).filter(Boolean)
  )
  const { respect, setRespect, disabled } = useRespectNews(queued, optedOut)
  const excluded = recipients.filter(m => optedOut.has(m.user_id)).length
  const mlabel = (m: MatchWithRelations) =>
    `P${m.match_number}: ${m.home_team?.name ?? '?'} ${m.home_score_90 ?? ''}-${m.away_score_90 ?? ''} ${m.away_team?.name ?? '?'}`

  return (
    <Section icon={Swords} title="Resultado de partido" color="text-primary">
      <p className="text-xs text-text-muted">Tabla con lo que predijo cada uno, sus puntos del partido y el total.</p>
      <select className="input w-full text-sm" value={matchId} onChange={e => { setMatchId(e.target.value); clear() }}>
        <option value="">Elegí un partido jugado…</option>
        {finished.map(m => <option key={m.id} value={m.id}>{mlabel(m)}</option>)}
      </select>
      {match && (
        <>
          <RespectNewsToggle respect={respect} setRespect={setRespect} excluded={excluded} />
          <Picker recipients={recipients} nameOf={nameOf} disabledIds={disabled} optedOutIds={optedOut} selected={selected} toggle={toggle}
            selectAll={() => setSelected(new Set(recipients.filter(m => !disabled.has(m.user_id)).map(m => m.user_id)))} clear={clear} />
          <EnqueueButton count={selected.size} pending={pending} label="Agregar a la cola"
            onClick={() => { onEnqueue(match, [...selected]); clear() }} />
        </>
      )}
    </Section>
  )
}

// Invitar a usuarios YA registrados que juegan en otras pencas del mismo tenant
// (p. ej. los de la competencia A) a esta penca. Cada uno tiene user_id.
function InvitarRegistradosSection({ invitables, optedOut, queue, onEnqueue, pending }: {
  invitables: InvitableUser[]; optedOut: Set<string>; queue: EmailQueueEntry[]
  onEnqueue: (users: InvitableUser[]) => void; pending: boolean
}) {
  const { selected, setSelected, toggle, clear } = useSelection()
  const queued = new Set(queue.filter(e => e.category === 'invitacion').map(e => e.user_id!).filter(Boolean))
  const { respect, setRespect, disabled } = useRespectNews(queued, optedOut)
  const excluded = invitables.filter(u => optedOut.has(u.id)).length
  const nameOf = (uid: string) => {
    const u = invitables.find(x => x.id === uid)
    return u?.display_name || u?.email || 'Usuario'
  }
  const recipients = invitables.map(u => ({ user_id: u.id, status: 'approved' }))
  return (
    <Section icon={UserPlus} title="Invitar usuarios registrados" count={invitables.length} color="text-accent">
      <p className="text-xs text-text-muted">
        Jugadores de otras pencas de esta empresa que todavía no están en esta. Les llega
        el enlace para sumarse (con el código de acceso si la penca es privada).
      </p>
      <RespectNewsToggle respect={respect} setRespect={setRespect} excluded={excluded} />
      <Picker recipients={recipients} nameOf={nameOf} disabledIds={disabled} optedOutIds={optedOut} selected={selected} toggle={toggle}
        selectAll={() => setSelected(new Set(recipients.filter(m => !disabled.has(m.user_id)).map(m => m.user_id)))} clear={clear}
        rightFor={uid => {
          const u = invitables.find(x => x.id === uid)
          return u?.display_name ? <span className="text-[11px] text-text-muted flex-shrink-0 truncate max-w-[160px]">{u.email}</span> : null
        }} />
      <EnqueueButton count={selected.size} pending={pending} label="Agregar a la cola" icon={UserPlus}
        onClick={() => { onEnqueue(invitables.filter(u => selected.has(u.id))); clear() }} />
    </Section>
  )
}

// Invitar por email a personas que NO están registradas en la app. Sin user_id;
// el correo lleva el enlace y, si la penca es privada, el código de acceso.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
function InvitarExternosSection({ joinCode, onEnqueue, pending }: {
  joinCode: string | null; onEnqueue: (emails: string[]) => void; pending: boolean
}) {
  const [raw, setRaw] = useState('')
  const parsed = raw.split(/[\s,;]+/).map(s => s.trim().toLowerCase()).filter(Boolean)
  const unique = Array.from(new Set(parsed))
  const valid = unique.filter(e => EMAIL_RE.test(e))
  const invalid = unique.filter(e => !EMAIL_RE.test(e))
  return (
    <Section icon={AtSign} title="Invitar por email (externos)" color="text-accent">
      <p className="text-xs text-text-muted">
        Para personas que aún no usan la app. Pegá uno o varios correos (separados por coma,
        espacio o salto de línea).{joinCode ? ' El correo incluye el código de acceso de la penca privada.' : ''}
      </p>
      <textarea
        value={raw}
        onChange={e => setRaw(e.target.value)}
        rows={4}
        placeholder="ana@mail.com, juan@mail.com…"
        className="input w-full text-sm font-mono"
      />
      <div className="flex items-center gap-3 text-xs flex-wrap">
        {valid.length > 0 && <span className="text-primary">{valid.length} válidos</span>}
        {invalid.length > 0 && <span className="text-error">{invalid.length} inválidos: {invalid.slice(0, 3).join(', ')}{invalid.length > 3 ? '…' : ''}</span>}
      </div>
      <EnqueueButton count={valid.length} pending={pending} label="Agregar a la cola" icon={AtSign}
        onClick={() => { onEnqueue(valid); setRaw('') }} />
    </Section>
  )
}

function RecordatorioSection({ recipients, optedOut, nameOf, matches, queue, onEnqueue, pending }: {
  recipients: Member[]; optedOut: Set<string>; nameOf: (uid: string) => string; matches: MatchWithRelations[]
  queue: EmailQueueEntry[]; onEnqueue: (uids: string[], proximos: { home: string; away: string; datetime: string }[]) => void; pending: boolean
}) {
  const { selected, setSelected, toggle, clear } = useSelection()
  const [now] = useState(() => Date.now())
  const proximos = matches
    .filter(m => m.status !== 'finished' && new Date(m.match_datetime).getTime() > now)
    .sort((a, b) => new Date(a.match_datetime).getTime() - new Date(b.match_datetime).getTime())
    .slice(0, 5)
    .map(m => ({ home: m.home_team?.name ?? '?', away: m.away_team?.name ?? '?', datetime: m.match_datetime }))
  const queued = new Set(queue.filter(e => e.category === 'recordatorio').map(e => e.user_id!).filter(Boolean))
  const { respect, setRespect, disabled } = useRespectNews(queued, optedOut)
  const excluded = recipients.filter(m => optedOut.has(m.user_id)).length
  return (
    <Section icon={Bell} title="Recordatorio de predicción" count={recipients.length} color="text-primary">
      <p className="text-xs text-text-muted">
        {proximos.length > 0
          ? `Avisa los próximos ${proximos.length} partidos sin jugar.`
          : 'No hay próximos partidos por jugar.'}
      </p>
      {proximos.length > 0 && (
        <>
          <RespectNewsToggle respect={respect} setRespect={setRespect} excluded={excluded} />
          <Picker recipients={recipients} nameOf={nameOf} disabledIds={disabled} optedOutIds={optedOut} selected={selected} toggle={toggle}
            selectAll={() => setSelected(new Set(recipients.filter(m => !disabled.has(m.user_id)).map(m => m.user_id)))} clear={clear} />
          <EnqueueButton count={selected.size} pending={pending} label="Agregar a la cola" icon={Bell}
            onClick={() => { onEnqueue([...selected], proximos); clear() }} />
        </>
      )}
    </Section>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// Cola + envío masivo
// ════════════════════════════════════════════════════════════════════════════
function QueuePanel({ queue, loading, tenCompId, onChanged, onPreview }: {
  queue: EmailQueueEntry[]; loading: boolean; tenCompId: string
  onChanged: () => void; onPreview: (e: EmailQueueEntry) => void
}) {
  const [sending, setSending] = useState(false)
  const [progress, setProgress] = useState({ current: 0, total: 0, name: '' })
  const stopRef = useRef(false)

  const pending = queue.filter(e => e.status === 'pending')
  const sent = queue.filter(e => e.status === 'sent')
  const failed = queue.filter(e => e.status === 'failed')

  async function sendAll() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return toast.error('Sin sesión')
    const toSend = queue.filter(e => e.status === 'pending' || e.status === 'failed')
    if (toSend.length === 0) return toast.info('No hay correos pendientes')
    stopRef.current = false
    setSending(true)
    setProgress({ current: 0, total: toSend.length, name: '' })
    let ok = 0, err = 0
    for (let i = 0; i < toSend.length; i++) {
      if (stopRef.current) break
      setProgress({ current: i + 1, total: toSend.length, name: toSend[i].to_name })
      const r = await sendEmailViaApi(toSend[i].id, session.access_token)
      if (r.success) ok++; else err++
      onChanged()
      if (i < toSend.length - 1 && !stopRef.current) await new Promise(res => setTimeout(res, 15_000))
    }
    setSending(false)
    toast.success(`Proceso finalizado: ${ok} enviados, ${err} fallidos`)
  }

  async function sendOne(e: EmailQueueEntry) {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return toast.error('Sin sesión')
    const r = await sendEmailViaApi(e.id, session.access_token)
    if (r.success) toast.success(`Enviado a ${e.to_name}`)
    else toast.error(r.error ?? 'Error')
    onChanged()
  }

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-text-primary text-sm">Cola de correos</span>
          <span className="badge bg-border text-text-muted text-[10px]">{queue.length}</span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          {pending.length > 0 && <span className="flex items-center gap-1 text-text-muted"><Clock size={12} /> {pending.length}</span>}
          {sent.length > 0 && <span className="flex items-center gap-1 text-primary"><CheckCircle2 size={12} /> {sent.length}</span>}
          {failed.length > 0 && <span className="flex items-center gap-1 text-error"><XCircle size={12} /> {failed.length}</span>}
        </div>
      </div>

      {queue.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => { if (confirm('¿Vaciar toda la cola de esta penca?')) deleteAllEmails(tenCompId).then(onChanged) }}
            className="text-xs py-1 px-3 rounded-lg bg-error/10 text-error hover:bg-error/20 transition-colors ml-auto">
            Vaciar cola
          </button>
        </div>
      )}

      {loading && <div className="flex justify-center py-6"><Loader2 className="animate-spin text-primary" size={20} /></div>}
      {!loading && queue.length === 0 && <p className="text-sm text-text-muted text-center py-6">La cola está vacía.</p>}

      {!loading && queue.length > 0 && (
        <div className="space-y-1.5 max-h-[360px] overflow-y-auto">
          {queue.map(e => (
            <div key={e.id} className="flex items-center gap-3 p-2.5 rounded-lg border border-transparent hover:bg-surface-2">
              <div className="flex-shrink-0">
                {e.status === 'sent' && <CheckCircle2 size={16} className="text-primary" />}
                {e.status === 'pending' && <Clock size={16} className="text-text-muted" />}
                {e.status === 'failed' && <XCircle size={16} className="text-error" />}
              </div>
              <button onClick={() => onPreview(e)} className="flex-1 min-w-0 text-left">
                <p className="text-sm text-text-primary truncate flex items-center gap-1">{e.to_name} <Eye size={11} className="opacity-40" /></p>
                <p className="text-xs text-text-muted truncate">{e.to_email}</p>
                {e.error_message && <p className="text-xs text-error truncate">{e.error_message}</p>}
              </button>
              <span className="badge bg-border text-text-muted text-[10px] flex-shrink-0 hidden sm:inline">{e.category}</span>
              <div className="flex items-center gap-1 flex-shrink-0">
                {(e.status === 'pending' || e.status === 'failed') && (
                  <button onClick={() => sendOne(e)} title="Enviar"
                    className="p-1.5 rounded-lg text-text-muted hover:text-primary hover:bg-primary/10"><Send size={14} /></button>
                )}
                <button onClick={() => deleteEmail(e.id).then(onChanged)} title="Eliminar"
                  className="p-1.5 rounded-lg text-text-muted hover:text-error hover:bg-error/10"><Trash2 size={14} /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Envío masivo */}
      <div className="border-t border-border pt-3">
        {sending ? (
          <div className="space-y-2">
            <p className="text-sm text-text-secondary">Enviando {progress.current} de {progress.total}{progress.name && <span className="text-text-muted"> — {progress.name}</span>}</p>
            <div className="h-2 bg-border rounded-full overflow-hidden">
              <div className="h-full bg-primary transition-all duration-500" style={{ width: `${(progress.current / progress.total) * 100}%` }} />
            </div>
            <p className="text-xs text-text-muted">Pausa de 15 s entre envíos para evitar bloqueos.</p>
            <button onClick={() => { stopRef.current = true }} className="btn-ghost text-xs text-error">Detener</button>
          </div>
        ) : (
          <div className="flex items-center gap-3 flex-wrap">
            <button onClick={sendAll} disabled={pending.length + failed.length === 0}
              className="btn-primary flex items-center gap-2 disabled:opacity-50">
              <Send size={15} /> Enviar {pending.length + failed.length} pendientes
            </button>
            <button onClick={onChanged} className="btn-ghost flex items-center gap-1 text-sm" title="Actualizar"><RefreshCw size={14} /></button>
          </div>
        )}
      </div>
    </div>
  )
}

function PreviewModal({ email, onClose }: { email: EmailQueueEntry; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div className="relative w-full max-w-2xl bg-surface border border-border rounded-2xl shadow-2xl flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between px-5 pt-5 pb-4 border-b border-border flex-shrink-0">
          <div className="min-w-0 pr-4">
            <p className="text-xs text-text-muted mb-1"><span className="text-text-secondary font-medium">Para:</span> {email.to_name} &lt;{email.to_email}&gt;</p>
            <p className="text-xs text-text-muted"><span className="text-text-secondary font-medium">Asunto:</span> {email.subject}</p>
            <span className="badge bg-border text-text-muted text-[10px] mt-2 inline-block">{email.category}</span>
          </div>
          <button onClick={onClose} className="btn-ghost p-1 flex-shrink-0"><X size={18} /></button>
        </div>
        <div className="flex-1 overflow-hidden rounded-b-2xl">
          <iframe srcDoc={email.body_html} title="Preview" sandbox="allow-same-origin"
            className="w-full h-full min-h-[480px] bg-white rounded-b-2xl border-0" />
        </div>
      </div>
    </div>
  )
}
