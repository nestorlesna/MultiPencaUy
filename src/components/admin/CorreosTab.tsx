import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Loader2, Mail, Send, Trash2, CheckCircle2, XCircle, Clock,
  ChevronDown, ChevronUp, RefreshCw, AlertTriangle, Trophy, Swords, Ticket, Bell, Eye, X,
} from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '../../lib/supabase'
import { fetchMembers } from '../../services/v2/adminService'
import { fetchLeaderboard } from '../../services/v2/leaderboardService'
import { fetchMatches } from '../../services/v2/matchService'
import {
  fetchEmailQueue, enqueueEmails, deleteEmail, deleteAllEmails,
  sendEmailViaApi, fetchTenCompUserDetails, fetchMatchPredictions,
  buildSinPrediccionesEmail, buildRankingEmail, buildResultadoEmail,
  buildInvitacionEmail, buildRecordatorioEmail,
  type EmailBrand, type EmailQueueEntry, type CreateEmailInput, type MatchInfoForEmail,
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

      {/* ── Invitación ── */}
      <InvitacionSection
        recipients={recipients}
        nameOf={nameOf}
        queue={queue}
        onEnqueue={(uids) => enqueueMut.mutate(uids.map(uid => ({
          ...baseEntry(uid),
          subject: `🎟️ Te invitamos a ${brand.pencaName}`,
          body_html: buildInvitacionEmail(brand, nameOf(uid), null),
          category: 'invitacion',
        })))}
        pending={enqueueMut.isPending}
      />

      {/* ── Recordatorio ── */}
      <RecordatorioSection
        recipients={recipients}
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

function Picker({ recipients, nameOf, disabledIds, selected, toggle, selectAll, clear, rightFor }: {
  recipients: Member[]
  nameOf: (uid: string) => string
  disabledIds: Set<string>
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

function SinPrediccionesSection({ recipients, detailsCount, nameOf, queue, onEnqueue, pending }: {
  recipients: Member[]; detailsCount: (uid: string) => number; nameOf: (uid: string) => string
  queue: EmailQueueEntry[]; onEnqueue: (uids: string[]) => void; pending: boolean
}) {
  const { selected, setSelected, toggle, clear } = useSelection()
  const list = recipients.filter(m => detailsCount(m.user_id) === 0)
  const queued = new Set(queue.filter(e => e.category === 'sin_predicciones').map(e => e.user_id!).filter(Boolean))
  return (
    <Section icon={AlertTriangle} title="Sin predicciones" count={list.length}>
      <p className="text-xs text-text-muted">Miembros aprobados que no cargaron ningún pronóstico.</p>
      <Picker recipients={list} nameOf={nameOf} disabledIds={queued} selected={selected} toggle={toggle}
        selectAll={() => setSelected(new Set(list.filter(m => !queued.has(m.user_id)).map(m => m.user_id)))} clear={clear} />
      <EnqueueButton count={selected.size} pending={pending} label="Agregar a la cola"
        onClick={() => { onEnqueue([...selected]); clear() }} />
    </Section>
  )
}

function RankingSection({ recipients, nameOf, lbMap, queue, onEnqueue, pending }: {
  recipients: Member[]; nameOf: (uid: string) => string; lbMap: Map<string, { rank: number; total_points: number }>
  queue: EmailQueueEntry[]; onEnqueue: (uids: string[]) => void; pending: boolean
}) {
  const { selected, setSelected, toggle, clear } = useSelection()
  const queued = new Set(queue.filter(e => e.category === 'ranking').map(e => e.user_id!).filter(Boolean))
  return (
    <Section icon={Trophy} title="Ranking actual" count={recipients.length}>
      <p className="text-xs text-text-muted">Envía a cada uno el top 5 y su posición actual.</p>
      <Picker recipients={recipients} nameOf={nameOf} disabledIds={queued} selected={selected} toggle={toggle}
        selectAll={() => setSelected(new Set(recipients.filter(m => !queued.has(m.user_id)).map(m => m.user_id)))} clear={clear}
        rightFor={uid => {
          const e = lbMap.get(uid)
          return e ? <span className="text-[11px] text-accent flex-shrink-0">#{e.rank} · {e.total_points} pts</span> : null
        }} />
      <EnqueueButton count={selected.size} pending={pending} label="Agregar a la cola" icon={Trophy}
        onClick={() => { onEnqueue([...selected]); clear() }} />
    </Section>
  )
}

function ResultadoSection({ recipients, nameOf, matches, queue, onEnqueue, pending }: {
  recipients: Member[]; nameOf: (uid: string) => string; matches: MatchWithRelations[]
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
          <Picker recipients={recipients} nameOf={nameOf} disabledIds={queued} selected={selected} toggle={toggle}
            selectAll={() => setSelected(new Set(recipients.filter(m => !queued.has(m.user_id)).map(m => m.user_id)))} clear={clear} />
          <EnqueueButton count={selected.size} pending={pending} label="Agregar a la cola"
            onClick={() => { onEnqueue(match, [...selected]); clear() }} />
        </>
      )}
    </Section>
  )
}

function InvitacionSection({ recipients, nameOf, queue, onEnqueue, pending }: {
  recipients: Member[]; nameOf: (uid: string) => string; queue: EmailQueueEntry[]
  onEnqueue: (uids: string[]) => void; pending: boolean
}) {
  const { selected, setSelected, toggle, clear } = useSelection()
  const queued = new Set(queue.filter(e => e.category === 'invitacion').map(e => e.user_id!).filter(Boolean))
  return (
    <Section icon={Ticket} title="Invitación a la penca" count={recipients.length} color="text-accent">
      <p className="text-xs text-text-muted">Mandá el enlace de la penca a los miembros.</p>
      <Picker recipients={recipients} nameOf={nameOf} disabledIds={queued} selected={selected} toggle={toggle}
        selectAll={() => setSelected(new Set(recipients.filter(m => !queued.has(m.user_id)).map(m => m.user_id)))} clear={clear} />
      <EnqueueButton count={selected.size} pending={pending} label="Agregar a la cola" icon={Ticket}
        onClick={() => { onEnqueue([...selected]); clear() }} />
    </Section>
  )
}

function RecordatorioSection({ recipients, nameOf, matches, queue, onEnqueue, pending }: {
  recipients: Member[]; nameOf: (uid: string) => string; matches: MatchWithRelations[]
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
  return (
    <Section icon={Bell} title="Recordatorio de predicción" count={recipients.length} color="text-primary">
      <p className="text-xs text-text-muted">
        {proximos.length > 0
          ? `Avisa los próximos ${proximos.length} partidos sin jugar.`
          : 'No hay próximos partidos por jugar.'}
      </p>
      {proximos.length > 0 && (
        <>
          <Picker recipients={recipients} nameOf={nameOf} disabledIds={queued} selected={selected} toggle={toggle}
            selectAll={() => setSelected(new Set(recipients.filter(m => !queued.has(m.user_id)).map(m => m.user_id)))} clear={clear} />
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
