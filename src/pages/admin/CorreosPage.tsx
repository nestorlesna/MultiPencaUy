import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Loader2, Mail, Send, Trash2, CheckCircle2, XCircle, Clock,
  ChevronDown, ChevronUp, RefreshCw, AlertTriangle, Eye, X, Trophy, Swords,
} from 'lucide-react'
import { toast } from 'sonner'
import { RequireAdmin } from '../../components/auth/AuthGuard'
import { fetchAllProfiles, fetchAdminUserDetails, fetchGroupPredictionsPerUser } from '../../services/profileService'
import { fetchGroupMatchCount, fetchMatches, fetchMatchPredictionsAdmin } from '../../services/matchService'
import type { MatchWithRelations } from '../../types/match'
import { fetchLeaderboard } from '../../services/leaderboardService'
import {
  fetchEmailQueue, enqueueEmails, deleteEmail, deleteEmailsByIds,
  deleteAllEmails, sendEmailViaApi, buildNoApuestasEmail, buildGruposIncompletosEmail,
  buildRankingEmail, buildPartidoEmail,
} from '../../services/emailService'
import type { MatchInfoForEmail } from '../../services/emailService'
import type { EmailQueueEntry } from '../../services/emailService'
import { supabase } from '../../lib/supabase'

export function CorreosPage() {
  return (
    <RequireAdmin>
      <CorreosContent />
    </RequireAdmin>
  )
}

function CorreosContent() {
  const qc = useQueryClient()
  const [sinApuestasOpen, setSinApuestasOpen] = useState(true)
  const [gruposOpen, setGruposOpen] = useState(true)
  const [rankingOpen, setRankingOpen] = useState(true)
  const [selectedRankingUsers, setSelectedRankingUsers] = useState<Set<string>>(new Set())
  const [partidoOpen, setPartidoOpen] = useState(true)
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null)
  const [selectedPartidoUsers, setSelectedPartidoUsers] = useState<Set<string>>(new Set())
  const [previewEmail, setPreviewEmail] = useState<EmailQueueEntry | null>(null)
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set())
  const [selectedGruposUsers, setSelectedGruposUsers] = useState<Set<string>>(new Set())
  const [selectedEmails, setSelectedEmails] = useState<Set<string>>(new Set())
  const [isSending, setIsSending] = useState(false)
  const [sendProgress, setSendProgress] = useState({ current: 0, total: 0, currentName: '' })
  const stopSendRef = useRef(false)

  const { data: profiles } = useQuery({
    queryKey: ['admin_profiles'],
    queryFn: fetchAllProfiles,
  })

  const { data: userDetails } = useQuery({
    queryKey: ['admin_user_details'],
    queryFn: fetchAdminUserDetails,
  })

  const { data: emailQueue, isLoading: loadingQueue } = useQuery({
    queryKey: ['email_queue'],
    queryFn: fetchEmailQueue,
  })

  const { data: groupPredictions } = useQuery({
    queryKey: ['admin_group_predictions'],
    queryFn: fetchGroupPredictionsPerUser,
  })

  const { data: leaderboard } = useQuery({
    queryKey: ['leaderboard'],
    queryFn: fetchLeaderboard,
  })

  const { data: allMatches } = useQuery({
    queryKey: ['matches_all'],
    queryFn: () => fetchMatches(),
  })

  const { data: matchPredictions, isLoading: loadingMatchPreds } = useQuery({
    queryKey: ['match_predictions_admin', selectedMatchId],
    queryFn: () => fetchMatchPredictionsAdmin(selectedMatchId!),
    enabled: !!selectedMatchId,
  })

  const { data: totalGroupMatches } = useQuery({
    queryKey: ['group_match_count'],
    queryFn: fetchGroupMatchCount,
  })

  // Usuarios activos sin apuestas
  const detailsMap = new Map((userDetails ?? []).map(d => [d.id, d]))
  const usersWithoutBets = (profiles ?? []).filter(p =>
    p.is_active && (detailsMap.get(p.id)?.predictions_count ?? -1) === 0
  )

  // Usuarios activos con grupos incompletos (menos predicciones de grupo que el total)
  const groupPredsMap = new Map((groupPredictions ?? []).map(g => [g.user_id, g.group_preds_count]))
  const totalGroup = totalGroupMatches ?? 0
  const usersWithIncompleteGroups = (profiles ?? []).filter(p =>
    p.is_active && (groupPredsMap.get(p.id) ?? 0) < totalGroup
  )

  // Ya están en la cola (evitar duplicados)
  const queuedUserIds = new Set((emailQueue ?? []).map(e => e.user_id).filter(Boolean))
  const pendingQueue = (emailQueue ?? []).filter(e => e.status === 'pending')
  const sentQueue    = (emailQueue ?? []).filter(e => e.status === 'sent')
  const failedQueue  = (emailQueue ?? []).filter(e => e.status === 'failed')

  // Agregar usuarios seleccionados a la cola
  const mutateEnqueue = useMutation({
    mutationFn: async (userIds: string[]) => {
      const entries = userIds.map(uid => {
        const profile = profiles!.find(p => p.id === uid)!
        const detail  = detailsMap.get(uid)!
        return {
          to_email:  detail.email,
          to_name:   profile.display_name || profile.username,
          subject:   '¡Todavía no cargaste tus apuestas! - PencaLes 2026',
          body_html: buildNoApuestasEmail(profile.display_name || profile.username),
          category:  'no_apuestas',
          user_id:   uid,
        }
      })
      await enqueueEmails(entries)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['email_queue'] })
      setSelectedUsers(new Set())
      toast.success('Correos agregados a la cola')
    },
    onError: () => toast.error('Error al agregar correos'),
  })

  // Encolar usuarios con grupos incompletos
  const mutateEnqueueGrupos = useMutation({
    mutationFn: async (userIds: string[]) => {
      const entries = userIds.map(uid => {
        const profile   = profiles!.find(p => p.id === uid)!
        const detail    = detailsMap.get(uid)!
        const groupPreds = groupPredsMap.get(uid) ?? 0
        const name      = profile.display_name || profile.username
        return {
          to_email:  detail.email,
          to_name:   name,
          subject:   `¡Te faltan partidos de grupos por apostar! - PencaLes 2026`,
          body_html: buildGruposIncompletosEmail(name, groupPreds, totalGroup),
          category:  'grupos_incompletos',
          user_id:   uid,
        }
      })
      await enqueueEmails(entries)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['email_queue'] })
      setSelectedGruposUsers(new Set())
      toast.success('Correos agregados a la cola')
    },
    onError: () => toast.error('Error al agregar correos'),
  })

  // Encolar correos de ranking (personalizados por usuario)
  const leaderboardMap = new Map((leaderboard ?? []).map(e => [e.user_id, e]))
  const top5 = (leaderboard ?? []).slice(0, 5)

  // Usuarios activos ordenados por total_points desc para la sección Por partido
  const activeProfilesSortedByPoints = [...(profiles ?? [])]
    .filter(p => p.is_active)
    .sort((a, b) => {
      const pa = leaderboardMap.get(a.id)?.total_points ?? 0
      const pb = leaderboardMap.get(b.id)?.total_points ?? 0
      return pb - pa
    })

  const mutateEnqueueRanking = useMutation({
    mutationFn: async (userIds: string[]) => {
      const totalParticipants = leaderboard?.length ?? 0
      const entries = userIds.map(uid => {
        const profile   = profiles!.find(p => p.id === uid)!
        const detail    = detailsMap.get(uid)!
        const userEntry = leaderboardMap.get(uid)
        const name      = profile.display_name || profile.username
        return {
          to_email:  detail.email,
          to_name:   name,
          subject:   '🏆 Ranking actualizado de la PencaLes 2026',
          body_html: buildRankingEmail(name, top5, userEntry, totalParticipants),
          category:  'ranking',
          user_id:   uid,
        }
      })
      await enqueueEmails(entries)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['email_queue'] })
      setSelectedRankingUsers(new Set())
      toast.success('Correos de ranking agregados a la cola')
    },
    onError: () => toast.error('Error al agregar correos'),
  })

  // Encolar correos por partido
  const mutateEnqueuePartido = useMutation({
    mutationFn: async (userIds: string[]) => {
      const match = (allMatches ?? []).find(m => m.id === selectedMatchId)
      if (!match) throw new Error('Partido no encontrado')
      const preds = await fetchMatchPredictionsAdmin(selectedMatchId!)
      const matchInfo: MatchInfoForEmail = {
        match_number:  match.match_number,
        home_name:     match.home_team?.name ?? match.home_slot_label ?? '?',
        away_name:     match.away_team?.name ?? match.away_slot_label ?? '?',
        home_score_90: match.home_score_90,
        away_score_90: match.away_score_90,
        match_datetime: match.match_datetime,
        status:        match.status,
      }
      const homeName = matchInfo.home_name
      const awayName = matchInfo.away_name
      const entries = userIds.map(uid => {
        const profile = profiles!.find(p => p.id === uid)!
        const detail  = detailsMap.get(uid)!
        const name    = profile.display_name || profile.username
        return {
          to_email:  detail.email,
          to_name:   name,
          subject:   `P${match.match_number}: ${homeName} vs ${awayName} — resultados de la penca`,
          body_html: buildPartidoEmail(name, uid, matchInfo, preds, top5),
          category:  `partido_M${match.match_number}`,
          user_id:   uid,
        }
      })
      await enqueueEmails(entries)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['email_queue'] })
      setSelectedPartidoUsers(new Set())
      toast.success('Correos del partido agregados a la cola')
    },
    onError: () => toast.error('Error al agregar correos'),
  })

  // Eliminar un correo
  const mutateDelete = useMutation({
    mutationFn: deleteEmail,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['email_queue'] }),
    onError: () => toast.error('Error al eliminar'),
  })

  // Eliminar seleccionados
  const mutateDeleteSelected = useMutation({
    mutationFn: () => deleteEmailsByIds([...selectedEmails]),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['email_queue'] })
      setSelectedEmails(new Set())
      toast.success('Correos eliminados')
    },
    onError: () => toast.error('Error al eliminar'),
  })

  // Eliminar todos
  const mutateDeleteAll = useMutation({
    mutationFn: deleteAllEmails,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['email_queue'] })
      setSelectedEmails(new Set())
      toast.success('Cola vaciada')
    },
    onError: () => toast.error('Error al vaciar la cola'),
  })

  // Enviar un correo individual
  async function handleSendOne(email: EmailQueueEntry) {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return toast.error('Sin sesión')
    const result = await sendEmailViaApi(email.id, session.access_token)
    if (result.success) {
      toast.success(`Enviado a ${email.to_name}`)
    } else {
      toast.error(`Error: ${result.error ?? 'desconocido'}`)
    }
    qc.invalidateQueries({ queryKey: ['email_queue'] })
  }

  // Enviar todos los pendientes con pausa de 15 s
  async function handleSendAll() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return toast.error('Sin sesión')

    const toSend = (emailQueue ?? []).filter(e => e.status === 'pending' || e.status === 'failed')
    if (toSend.length === 0) return toast.info('No hay correos pendientes')

    stopSendRef.current = false
    setIsSending(true)
    setSendProgress({ current: 0, total: toSend.length, currentName: '' })

    let sent = 0, failed = 0
    for (let i = 0; i < toSend.length; i++) {
      if (stopSendRef.current) break

      const email = toSend[i]
      setSendProgress({ current: i + 1, total: toSend.length, currentName: email.to_name })

      const result = await sendEmailViaApi(email.id, session.access_token)
      if (result.success) { sent++ } else { failed++ }

      // Refrescar la cola después de cada envío
      qc.invalidateQueries({ queryKey: ['email_queue'] })

      // Pausa de 15 s entre envíos (excepto en el último)
      if (i < toSend.length - 1 && !stopSendRef.current) {
        await new Promise(r => setTimeout(r, 15_000))
      }
    }

    setIsSending(false)
    if (sent > 0 || failed > 0) {
      toast.success(`Proceso finalizado: ${sent} enviados, ${failed} fallidos`)
    }
  }

  function toggleUser(id: string) {
    setSelectedUsers(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleEmail(id: string) {
    setSelectedEmails(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function selectAllUsers() {
    setSelectedUsers(new Set(usersWithoutBets.filter(u => !queuedUserIds.has(u.id)).map(u => u.id)))
  }

  function selectAllEmails() {
    setSelectedEmails(new Set((emailQueue ?? []).map(e => e.id)))
  }

  function toggleGruposUser(id: string) {
    setSelectedGruposUsers(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function selectAllGruposUsers() {
    setSelectedGruposUsers(
      new Set(usersWithIncompleteGroups.filter(u => !queuedUserIds.has(u.id)).map(u => u.id))
    )
  }

  // Para ranking: check por categoría para no bloquear usuarios en otras categorías
  const queuedRankingUserIds = new Set(
    (emailQueue ?? []).filter(e => e.category === 'ranking').map(e => e.user_id).filter(Boolean)
  )
  const activeProfiles = (profiles ?? []).filter(p => p.is_active)

  function toggleRankingUser(id: string) {
    setSelectedRankingUsers(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function selectAllRankingUsers() {
    setSelectedRankingUsers(
      new Set(activeProfiles.filter(u => !queuedRankingUserIds.has(u.id)).map(u => u.id))
    )
  }

  const selectedMatch = (allMatches ?? []).find(m => m.id === selectedMatchId)
  const queuedPartidoUserIds = new Set(
    (emailQueue ?? [])
      .filter(e => selectedMatch && e.category === `partido_M${selectedMatch.match_number}`)
      .map(e => e.user_id).filter(Boolean)
  )

  function togglePartidoUser(id: string) {
    setSelectedPartidoUsers(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function selectAllPartidoUsers() {
    setSelectedPartidoUsers(
      new Set(activeProfilesSortedByPoints.filter(u => !queuedPartidoUserIds.has(u.id)).map(u => u.id))
    )
  }

  return (
    <>
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Mail size={20} className="text-accent" />
        <h1 className="text-xl font-bold text-text-primary">Correos</h1>
      </div>

      {/* ─── Sección: Sin apuestas ─── */}
      <div className="card p-4">
        <button
          onClick={() => setSinApuestasOpen(o => !o)}
          className="w-full flex items-center justify-between"
        >
          <div className="flex items-center gap-2">
            <AlertTriangle size={16} className="text-accent" />
            <span className="font-semibold text-text-primary">Sin apuestas</span>
            <span className="badge-accent text-[10px]">{usersWithoutBets.length}</span>
          </div>
          {sinApuestasOpen ? <ChevronUp size={16} className="text-text-muted" /> : <ChevronDown size={16} className="text-text-muted" />}
        </button>

        {sinApuestasOpen && (
          <div className="mt-4 space-y-3">
            <p className="text-xs text-text-muted">
              Usuarios activos sin ninguna apuesta cargada.
              Los que ya están en la cola aparecen deshabilitados.
            </p>

            {usersWithoutBets.length === 0 ? (
              <p className="text-sm text-text-muted text-center py-4">Todos los usuarios tienen apuestas 🎉</p>
            ) : (
              <>
                {/* Acciones rápidas */}
                <div className="flex items-center gap-2 flex-wrap">
                  <button onClick={selectAllUsers} className="btn-ghost text-xs py-1 px-3">
                    Seleccionar disponibles
                  </button>
                  <button onClick={() => setSelectedUsers(new Set())} className="btn-ghost text-xs py-1 px-3">
                    Deseleccionar todos
                  </button>
                  <span className="text-xs text-text-muted ml-auto">
                    {selectedUsers.size} seleccionados
                  </span>
                </div>

                {/* Lista de usuarios */}
                <div className="space-y-1.5 max-h-64 overflow-y-auto">
                  {usersWithoutBets.map(u => {
                    const detail  = detailsMap.get(u.id)
                    const inQueue = queuedUserIds.has(u.id)
                    return (
                      <label
                        key={u.id}
                        className={`flex items-center gap-3 p-2.5 rounded-lg cursor-pointer transition-colors ${
                          inQueue
                            ? 'opacity-40 cursor-not-allowed'
                            : 'hover:bg-surface-2'
                        }`}
                      >
                        <input
                          type="checkbox"
                          disabled={inQueue}
                          checked={selectedUsers.has(u.id)}
                          onChange={() => toggleUser(u.id)}
                          className="accent-primary"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-text-primary truncate">{u.display_name || u.username}</p>
                          <p className="text-xs text-text-muted truncate">{detail?.email ?? '–'}</p>
                        </div>
                        {inQueue && <span className="badge bg-border text-text-muted text-[10px]">En cola</span>}
                      </label>
                    )
                  })}
                </div>

                <button
                  disabled={selectedUsers.size === 0 || mutateEnqueue.isPending}
                  onClick={() => mutateEnqueue.mutate([...selectedUsers])}
                  className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {mutateEnqueue.isPending
                    ? <><Loader2 size={15} className="animate-spin" /> Agregando...</>
                    : <><Mail size={15} /> Agregar {selectedUsers.size > 0 ? selectedUsers.size : ''} a la cola</>
                  }
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* ─── Sección: Grupos incompletos ─── */}
      <div className="card p-4">
        <button
          onClick={() => setGruposOpen(o => !o)}
          className="w-full flex items-center justify-between"
        >
          <div className="flex items-center gap-2">
            <AlertTriangle size={16} className="text-primary" />
            <span className="font-semibold text-text-primary">Grupos incompletos</span>
            <span className="badge-primary text-[10px]">{usersWithIncompleteGroups.length}</span>
          </div>
          {gruposOpen ? <ChevronUp size={16} className="text-text-muted" /> : <ChevronDown size={16} className="text-text-muted" />}
        </button>

        {gruposOpen && (
          <div className="mt-4 space-y-3">
            <p className="text-xs text-text-muted">
              Usuarios activos que no tienen los {totalGroup > 0 ? totalGroup : '…'} partidos de la fase de grupos apostados.
            </p>

            {totalGroup === 0 || usersWithIncompleteGroups.length === 0 ? (
              <p className="text-sm text-text-muted text-center py-4">
                {totalGroup === 0 ? 'Cargando…' : 'Todos completaron los grupos 🎉'}
              </p>
            ) : (
              <>
                <div className="flex items-center gap-2 flex-wrap">
                  <button onClick={selectAllGruposUsers} className="btn-ghost text-xs py-1 px-3">
                    Seleccionar disponibles
                  </button>
                  <button onClick={() => setSelectedGruposUsers(new Set())} className="btn-ghost text-xs py-1 px-3">
                    Deseleccionar todos
                  </button>
                  <span className="text-xs text-text-muted ml-auto">
                    {selectedGruposUsers.size} seleccionados
                  </span>
                </div>

                <div className="space-y-1.5 max-h-64 overflow-y-auto">
                  {usersWithIncompleteGroups.map(u => {
                    const detail    = detailsMap.get(u.id)
                    const groupPreds = groupPredsMap.get(u.id) ?? 0
                    const missing   = totalGroup - groupPreds
                    const inQueue   = queuedUserIds.has(u.id)
                    return (
                      <label
                        key={u.id}
                        className={`flex items-center gap-3 p-2.5 rounded-lg cursor-pointer transition-colors ${
                          inQueue ? 'opacity-40 cursor-not-allowed' : 'hover:bg-surface-2'
                        }`}
                      >
                        <input
                          type="checkbox"
                          disabled={inQueue}
                          checked={selectedGruposUsers.has(u.id)}
                          onChange={() => toggleGruposUser(u.id)}
                          className="accent-primary"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-text-primary truncate">{u.display_name || u.username}</p>
                          <p className="text-xs text-text-muted truncate">{detail?.email ?? '–'}</p>
                        </div>
                        <div className="flex-shrink-0 text-right">
                          <span className="text-xs font-medium text-text-primary">
                            {groupPreds}
                            <span className="text-text-muted font-normal"> / {totalGroup}</span>
                          </span>
                          <p className="text-[11px] text-error">
                            {missing} sin apostar
                          </p>
                        </div>
                        {inQueue && <span className="badge bg-border text-text-muted text-[10px]">En cola</span>}
                      </label>
                    )
                  })}
                </div>

                <button
                  disabled={selectedGruposUsers.size === 0 || mutateEnqueueGrupos.isPending}
                  onClick={() => mutateEnqueueGrupos.mutate([...selectedGruposUsers])}
                  className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {mutateEnqueueGrupos.isPending
                    ? <><Loader2 size={15} className="animate-spin" /> Agregando...</>
                    : <><Mail size={15} /> Agregar {selectedGruposUsers.size > 0 ? selectedGruposUsers.size : ''} a la cola</>
                  }
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* ─── Sección: Ranking actual ─── */}
      <div className="card p-4">
        <button
          onClick={() => setRankingOpen(o => !o)}
          className="w-full flex items-center justify-between"
        >
          <div className="flex items-center gap-2">
            <Trophy size={16} className="text-accent" />
            <span className="font-semibold text-text-primary">Ranking actual</span>
            <span className="badge bg-accent/20 text-accent text-[10px]">{activeProfiles.length} usuarios</span>
          </div>
          {rankingOpen ? <ChevronUp size={16} className="text-text-muted" /> : <ChevronDown size={16} className="text-text-muted" />}
        </button>

        {rankingOpen && (
          <div className="mt-4 space-y-3">
            <p className="text-xs text-text-muted">
              Envía a cada persona el top 5 del ranking y, si no está en el top 5, su posición actual.
            </p>

            {activeProfiles.length === 0 ? (
              <p className="text-sm text-text-muted text-center py-4">Sin usuarios activos</p>
            ) : (
              <>
                <div className="flex items-center gap-2 flex-wrap">
                  <button onClick={selectAllRankingUsers} className="btn-ghost text-xs py-1 px-3">
                    Seleccionar todos
                  </button>
                  <button onClick={() => setSelectedRankingUsers(new Set())} className="btn-ghost text-xs py-1 px-3">
                    Deseleccionar
                  </button>
                  <span className="text-xs text-text-muted ml-auto">
                    {selectedRankingUsers.size} seleccionados
                  </span>
                </div>

                <div className="space-y-1.5 max-h-72 overflow-y-auto">
                  {activeProfiles.map(u => {
                    const detail    = detailsMap.get(u.id)
                    const lbEntry   = leaderboardMap.get(u.id)
                    const inQueue   = queuedRankingUserIds.has(u.id)
                    return (
                      <label
                        key={u.id}
                        className={`flex items-center gap-3 p-2.5 rounded-lg cursor-pointer transition-colors ${
                          inQueue ? 'opacity-40 cursor-not-allowed' : 'hover:bg-surface-2'
                        }`}
                      >
                        <input
                          type="checkbox"
                          disabled={inQueue}
                          checked={selectedRankingUsers.has(u.id)}
                          onChange={() => toggleRankingUser(u.id)}
                          className="accent-primary"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-text-primary truncate">{u.display_name || u.username}</p>
                          <p className="text-xs text-text-muted truncate">{detail?.email ?? '–'}</p>
                        </div>
                        <div className="flex-shrink-0 text-right">
                          {lbEntry ? (
                            <>
                              <span className="text-xs font-bold text-accent">#{lbEntry.rank}</span>
                              <p className="text-[11px] text-text-muted">{lbEntry.total_points} pts</p>
                            </>
                          ) : (
                            <span className="text-[11px] text-text-muted">Sin puntos</span>
                          )}
                        </div>
                        {inQueue && <span className="badge bg-border text-text-muted text-[10px]">En cola</span>}
                      </label>
                    )
                  })}
                </div>

                <button
                  disabled={selectedRankingUsers.size === 0 || mutateEnqueueRanking.isPending || top5.length === 0}
                  onClick={() => mutateEnqueueRanking.mutate([...selectedRankingUsers])}
                  className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {mutateEnqueueRanking.isPending
                    ? <><Loader2 size={15} className="animate-spin" /> Generando correos...</>
                    : <><Trophy size={15} /> Agregar {selectedRankingUsers.size > 0 ? selectedRankingUsers.size : ''} a la cola</>
                  }
                </button>

                {top5.length === 0 && (
                  <p className="text-xs text-text-muted text-center">
                    Aún no hay datos de ranking para generar el correo.
                  </p>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* ─── Sección: Por partido ─── */}
      <div className="card p-4">
        <button
          onClick={() => setPartidoOpen(o => !o)}
          className="w-full flex items-center justify-between"
        >
          <div className="flex items-center gap-2">
            <Swords size={16} className="text-primary" />
            <span className="font-semibold text-text-primary">Por partido</span>
            {selectedMatch && (
              <span className="badge-primary text-[10px]">
                P{selectedMatch.match_number}
              </span>
            )}
          </div>
          {partidoOpen ? <ChevronUp size={16} className="text-text-muted" /> : <ChevronDown size={16} className="text-text-muted" />}
        </button>

        {partidoOpen && (
          <div className="mt-4 space-y-4">
            <p className="text-xs text-text-muted">
              Envía a cada persona la tabla con lo que apostó cada participante,
              sus puntos del partido y el total acumulado.
            </p>

            {/* Selector de partido */}
            <MatchSelector
              matches={allMatches ?? []}
              value={selectedMatchId}
              onChange={(id) => {
                setSelectedMatchId(id)
                setSelectedPartidoUsers(new Set())
              }}
            />

            {/* Info del partido seleccionado */}
            {selectedMatchId && (
              <>
                {loadingMatchPreds ? (
                  <div className="flex items-center gap-2 text-sm text-text-muted">
                    <Loader2 size={14} className="animate-spin" /> Cargando predicciones...
                  </div>
                ) : (
                  <p className="text-xs text-text-muted">
                    {matchPredictions?.length ?? 0} apuesta{(matchPredictions?.length ?? 0) !== 1 ? 's' : ''} registradas para este partido
                  </p>
                )}

                {/* Lista de usuarios */}
                <div className="flex items-center gap-2 flex-wrap">
                  <button onClick={selectAllPartidoUsers} className="btn-ghost text-xs py-1 px-3">
                    Seleccionar todos
                  </button>
                  <button onClick={() => setSelectedPartidoUsers(new Set())} className="btn-ghost text-xs py-1 px-3">
                    Deseleccionar
                  </button>
                  <span className="text-xs text-text-muted ml-auto">
                    {selectedPartidoUsers.size} seleccionados
                  </span>
                </div>

                <div className="space-y-1.5 max-h-72 overflow-y-auto">
                  {activeProfilesSortedByPoints.map((u, idx) => {
                    const detail   = detailsMap.get(u.id)
                    const lbEntry  = leaderboardMap.get(u.id)
                    const pred     = (matchPredictions ?? []).find(p => p.user_id === u.id)
                    const inQueue  = queuedPartidoUserIds.has(u.id)
                    return (
                      <label
                        key={u.id}
                        className={`flex items-center gap-3 p-2.5 rounded-lg cursor-pointer transition-colors ${
                          inQueue ? 'opacity-40 cursor-not-allowed' : 'hover:bg-surface-2'
                        }`}
                      >
                        <input
                          type="checkbox"
                          disabled={inQueue}
                          checked={selectedPartidoUsers.has(u.id)}
                          onChange={() => togglePartidoUser(u.id)}
                          className="accent-primary"
                        />
                        <span className="text-xs text-text-muted w-5 flex-shrink-0 text-center">{idx + 1}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-text-primary truncate">{u.display_name || u.username}</p>
                          <p className="text-xs text-text-muted truncate">{detail?.email ?? '–'}</p>
                        </div>
                        <div className="flex-shrink-0 text-right space-y-0.5">
                          {lbEntry && (
                            <p className="text-xs font-bold text-accent">{lbEntry.total_points} pts</p>
                          )}
                          {pred ? (
                            <p className="text-xs font-mono text-primary">
                              {pred.home_score}-{pred.away_score}
                            </p>
                          ) : (
                            <p className="text-[11px] text-text-muted">sin apuesta</p>
                          )}
                        </div>
                        {inQueue && <span className="badge bg-border text-text-muted text-[10px]">En cola</span>}
                      </label>
                    )
                  })}
                </div>

                <button
                  disabled={selectedPartidoUsers.size === 0 || mutateEnqueuePartido.isPending}
                  onClick={() => mutateEnqueuePartido.mutate([...selectedPartidoUsers])}
                  className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {mutateEnqueuePartido.isPending
                    ? <><Loader2 size={15} className="animate-spin" /> Generando correos...</>
                    : <><Mail size={15} /> Agregar {selectedPartidoUsers.size > 0 ? selectedPartidoUsers.size : ''} a la cola</>
                  }
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* ─── Cola de correos ─── */}
      <div className="card p-4">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-text-primary">Cola de correos</span>
            <span className="badge-primary text-[10px]">{emailQueue?.length ?? 0}</span>
          </div>

          {/* Resumen de estados */}
          <div className="flex items-center gap-2 text-xs">
            {pendingQueue.length > 0 && (
              <span className="flex items-center gap-1 text-text-muted">
                <Clock size={12} className="text-text-muted" /> {pendingQueue.length} pendientes
              </span>
            )}
            {sentQueue.length > 0 && (
              <span className="flex items-center gap-1 text-primary">
                <CheckCircle2 size={12} /> {sentQueue.length} enviados
              </span>
            )}
            {failedQueue.length > 0 && (
              <span className="flex items-center gap-1 text-error">
                <XCircle size={12} /> {failedQueue.length} fallidos
              </span>
            )}
          </div>
        </div>

        {/* Acciones de la cola */}
        {(emailQueue?.length ?? 0) > 0 && (
          <div className="flex items-center gap-2 flex-wrap mb-3">
            <button onClick={selectAllEmails} className="btn-ghost text-xs py-1 px-3">
              Seleccionar todos
            </button>
            <button onClick={() => setSelectedEmails(new Set())} className="btn-ghost text-xs py-1 px-3">
              Deseleccionar
            </button>
            {selectedEmails.size > 0 && (
              <button
                onClick={() => mutateDeleteSelected.mutate()}
                disabled={mutateDeleteSelected.isPending}
                className="text-xs py-1 px-3 rounded-lg bg-error/10 text-error hover:bg-error/20 transition-colors"
              >
                <Trash2 size={13} className="inline mr-1" />
                Eliminar {selectedEmails.size}
              </button>
            )}
            <button
              onClick={() => {
                if (confirm('¿Eliminar TODOS los correos de la cola?')) mutateDeleteAll.mutate()
              }}
              disabled={mutateDeleteAll.isPending}
              className="ml-auto text-xs py-1 px-3 rounded-lg bg-error/10 text-error hover:bg-error/20 transition-colors"
            >
              Vaciar cola
            </button>
          </div>
        )}

        {loadingQueue && (
          <div className="flex justify-center py-8">
            <Loader2 className="animate-spin text-primary" size={20} />
          </div>
        )}

        {!loadingQueue && (emailQueue?.length ?? 0) === 0 && (
          <p className="text-sm text-text-muted text-center py-8">La cola está vacía</p>
        )}

        {!loadingQueue && (emailQueue?.length ?? 0) > 0 && (
          <div className="space-y-1.5 max-h-[420px] overflow-y-auto">
            {emailQueue!.map(email => (
              <EmailRow
                key={email.id}
                email={email}
                selected={selectedEmails.has(email.id)}
                onToggle={() => toggleEmail(email.id)}
                onDelete={() => mutateDelete.mutate(email.id)}
                onSend={() => handleSendOne(email)}
                onPreview={() => setPreviewEmail(email)}
              />
            ))}
          </div>
        )}
      </div>

      {/* ─── Panel de envío masivo ─── */}
      <div className="card p-4">
        <div className="flex items-center gap-2 mb-3">
          <Send size={16} className="text-primary" />
          <span className="font-semibold text-text-primary">Envío masivo</span>
        </div>

        {isSending ? (
          <div className="space-y-3">
            <p className="text-sm text-text-secondary">
              Enviando {sendProgress.current} de {sendProgress.total}
              {sendProgress.currentName && (
                <span className="text-text-muted"> — {sendProgress.currentName}</span>
              )}
            </p>
            {/* Barra de progreso */}
            <div className="h-2 bg-border rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-500"
                style={{ width: `${(sendProgress.current / sendProgress.total) * 100}%` }}
              />
            </div>
            <p className="text-xs text-text-muted">
              Pausa de 15 s entre cada envío para evitar bloqueos de Gmail.
            </p>
            <button
              onClick={() => { stopSendRef.current = true }}
              className="btn-ghost text-xs text-error"
            >
              Detener envío
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-text-muted">
              Envía todos los correos en estado <em>pendiente</em> o <em>fallido</em>,
              con 15 segundos de pausa entre cada uno.
            </p>
            <div className="flex items-center gap-3 flex-wrap">
              <button
                onClick={handleSendAll}
                disabled={pendingQueue.length + failedQueue.length === 0}
                className="btn-primary flex items-center gap-2 disabled:opacity-50"
              >
                <Send size={15} />
                Enviar {pendingQueue.length + failedQueue.length} pendientes
              </button>
              <button
                onClick={() => qc.invalidateQueries({ queryKey: ['email_queue'] })}
                className="btn-ghost flex items-center gap-1 text-sm"
                title="Actualizar lista"
              >
                <RefreshCw size={14} />
              </button>
            </div>
            {failedQueue.length > 0 && (
              <p className="text-xs text-error flex items-center gap-1">
                <XCircle size={12} /> {failedQueue.length} correo{failedQueue.length > 1 ? 's' : ''} fallido{failedQueue.length > 1 ? 's' : ''} — se reintentarán también
              </p>
            )}
          </div>
        )}
      </div>
    </div>
    {/* ─── Modal preview de correo ─── */}
    {previewEmail && (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        onClick={() => setPreviewEmail(null)}
      >
        <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
        <div
          className="relative w-full max-w-2xl bg-surface border border-border rounded-2xl shadow-2xl flex flex-col max-h-[90vh]"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-start justify-between px-5 pt-5 pb-4 border-b border-border flex-shrink-0">
            <div className="min-w-0 pr-4">
              <p className="text-xs text-text-muted mb-1">
                <span className="font-medium text-text-secondary">Para:</span>{' '}
                {previewEmail.to_name} &lt;{previewEmail.to_email}&gt;
              </p>
              <p className="text-xs text-text-muted">
                <span className="font-medium text-text-secondary">Asunto:</span>{' '}
                {previewEmail.subject}
              </p>
              <div className="flex items-center gap-2 mt-2">
                <span className="badge bg-border text-text-muted text-[10px]">{previewEmail.category}</span>
                {previewEmail.status === 'sent'    && <span className="badge-primary text-[10px]">Enviado</span>}
                {previewEmail.status === 'pending' && <span className="badge bg-border text-text-muted text-[10px]">Pendiente</span>}
                {previewEmail.status === 'failed'  && <span className="badge bg-error/20 text-error text-[10px]">Fallido</span>}
              </div>
            </div>
            <button
              onClick={() => setPreviewEmail(null)}
              className="btn-ghost p-1 -mr-1 flex-shrink-0"
            >
              <X size={18} />
            </button>
          </div>

          {/* iframe con el HTML del mail */}
          <div className="flex-1 overflow-hidden rounded-b-2xl">
            <iframe
              srcDoc={previewEmail.body_html}
              title="Preview del correo"
              sandbox="allow-same-origin"
              className="w-full h-full min-h-[480px] bg-white rounded-b-2xl border-0"
            />
          </div>
        </div>
      </div>
    )}
    </>
  )
}

// ─── Match Selector ────────────────────────────────────────────
interface MatchSelectorProps {
  matches: MatchWithRelations[]
  value: string | null
  onChange: (id: string) => void
}

function MatchSelector({ matches, value, onChange }: MatchSelectorProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const now = new Date()

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  function matchDate(m: MatchWithRelations) {
    return new Date(m.match_datetime)
  }

  const past = matches
    .filter(m => matchDate(m) <= now)
    .sort((a, b) => matchDate(b).getTime() - matchDate(a).getTime())

  const future = matches
    .filter(m => matchDate(m) > now)
    .sort((a, b) => matchDate(a).getTime() - matchDate(b).getTime())

  function label(m: MatchWithRelations) {
    const home = m.home_team?.name ?? m.home_slot_label ?? '?'
    const away = m.away_team?.name ?? m.away_slot_label ?? '?'
    const d = matchDate(m)
    const date = `${d.getDate().toString().padStart(2,'0')}/${(d.getMonth()+1).toString().padStart(2,'0')} ${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`
    const result = m.status === 'finished' ? ` [${m.home_score_90}-${m.away_score_90}]` : ''
    return `P${m.match_number}: ${home} vs ${away}${result} (${date})`
  }

  const selected = matches.find(m => m.id === value)

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="input w-full text-left flex items-center justify-between gap-2"
      >
        <span className={`truncate text-sm ${selected ? 'text-text-primary' : 'text-text-muted'}`}>
          {selected ? label(selected) : 'Seleccioná un partido...'}
        </span>
        <ChevronDown size={15} className="text-text-muted flex-shrink-0" />
      </button>

      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-surface border border-border rounded-lg shadow-2xl z-30 max-h-72 overflow-y-auto">
          {past.length > 0 && (
            <>
              <div className="sticky top-0 px-3 py-1.5 text-[10px] text-text-muted uppercase tracking-wider bg-surface border-b border-border">
                Jugados ({past.length})
              </div>
              {past.map(m => (
                <button
                  key={m.id}
                  onClick={() => { onChange(m.id); setOpen(false) }}
                  className={`w-full text-left px-3 py-2 text-sm transition-colors hover:bg-surface-2 ${
                    m.id === value ? 'text-primary bg-primary/5' : 'text-text-secondary'
                  }`}
                >
                  {label(m)}
                </button>
              ))}
            </>
          )}
          {future.length > 0 && (
            <>
              <div className="sticky top-0 px-3 py-1.5 text-[10px] text-text-muted uppercase tracking-wider bg-surface border-t border-b border-border">
                Próximos ({future.length})
              </div>
              {future.map(m => (
                <button
                  key={m.id}
                  onClick={() => { onChange(m.id); setOpen(false) }}
                  className={`w-full text-left px-3 py-2 text-sm transition-colors hover:bg-surface-2 ${
                    m.id === value ? 'text-primary bg-primary/5' : 'text-text-muted'
                  }`}
                >
                  {label(m)}
                </button>
              ))}
            </>
          )}
          {matches.length === 0 && (
            <p className="text-sm text-text-muted text-center py-4">Cargando partidos...</p>
          )}
        </div>
      )}
    </div>
  )
}

interface EmailRowProps {
  email: EmailQueueEntry
  selected: boolean
  onToggle: () => void
  onDelete: () => void
  onSend: () => void
  onPreview: () => void
}

function EmailRow({ email, selected, onToggle, onDelete, onSend, onPreview }: EmailRowProps) {
  const [sending, setSending] = useState(false)

  async function handleSend() {
    setSending(true)
    await onSend()
    setSending(false)
  }

  return (
    <div className={`flex items-center gap-3 p-3 rounded-lg transition-colors ${
      selected ? 'bg-primary/5 border border-primary/20' : 'border border-transparent hover:bg-surface-2'
    }`}>
      <input
        type="checkbox"
        checked={selected}
        onChange={onToggle}
        className="accent-primary flex-shrink-0"
      />

      {/* Estado */}
      <div className="flex-shrink-0">
        {email.status === 'sent'    && <CheckCircle2 size={16} className="text-primary" />}
        {email.status === 'pending' && <Clock size={16} className="text-text-muted" />}
        {email.status === 'failed'  && <XCircle size={16} className="text-error" />}
      </div>

      {/* Datos */}
      <div className="flex-1 min-w-0">
        <button
          onClick={onPreview}
          className="text-sm text-text-primary font-medium hover:text-primary transition-colors truncate max-w-full text-left flex items-center gap-1 group"
        >
          <span className="truncate">{email.to_name}</span>
          <Eye size={12} className="flex-shrink-0 opacity-0 group-hover:opacity-60 transition-opacity" />
        </button>
        <p className="text-xs text-text-muted truncate">{email.to_email}</p>
        {email.error_message && (
          <p className="text-xs text-error truncate mt-0.5">{email.error_message}</p>
        )}
      </div>

      {/* Categoría + fecha */}
      <div className="hidden sm:flex flex-col items-end flex-shrink-0">
        <span className="badge bg-border text-text-muted text-[10px]">{email.category}</span>
        <span className="text-[11px] text-text-muted mt-1">
          {email.sent_at
            ? new Date(email.sent_at).toLocaleDateString('es')
            : new Date(email.created_at).toLocaleDateString('es')}
        </span>
      </div>

      {/* Acciones */}
      <div className="flex items-center gap-1 flex-shrink-0">
        {(email.status === 'pending' || email.status === 'failed') && (
          <button
            onClick={handleSend}
            disabled={sending}
            title="Enviar este correo"
            className="p-1.5 rounded-lg text-text-muted hover:text-primary hover:bg-primary/10 transition-colors"
          >
            {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
          </button>
        )}
        <button
          onClick={onDelete}
          title="Eliminar"
          className="p-1.5 rounded-lg text-text-muted hover:text-error hover:bg-error/10 transition-colors"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  )
}
