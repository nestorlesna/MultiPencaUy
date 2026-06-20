import { supabase } from '../../lib/supabase'
import type { LeaderboardEntry } from '../../types'

// ════════════════════════════════════════════════════════════════════════════
// CORREOS POR TEN-COMP (multi-tenant) — emisor de plataforma (SMTP global)
//
// El "from" del mail es siempre el de la plataforma (SPF/DKIM en el dominio);
// lo único que varía por penca es el branding: nombre de la penca, nombre de la
// competencia y las URLs /p/:slug/... . Esos datos viajan en `brand` a cada
// builder. Cada fila encolada lleva tenant_id + ten_comp_id para que la RLS
// (email_queue_admin → is_tenant_admin) y el endpoint /api/send-email sepan a
// quién pertenece y con qué nombre firmar el envío.
// ════════════════════════════════════════════════════════════════════════════

// Branding derivado del Ten-Comp activo (sin config extra por tenant).
export interface EmailBrand {
  pencaName: string         // nombre de la penca (Ten-Comp)
  competitionName: string   // nombre de la competencia
  slug: string              // slug del Ten-Comp → URLs /p/:slug/...
  baseUrl: string           // origin de la app (window.location.origin)
}

// Escapa caracteres HTML para evitar inyección vía datos de usuario.
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export interface EmailQueueEntry {
  id: string
  tenant_id: string | null
  ten_comp_id: string | null
  to_email: string
  to_name: string
  subject: string
  body_html: string
  status: 'pending' | 'sent' | 'failed'
  category: string
  error_message: string | null
  user_id: string | null
  created_at: string
  sent_at: string | null
}

export interface CreateEmailInput {
  tenant_id: string
  ten_comp_id: string
  to_email: string
  to_name: string
  subject: string
  body_html: string
  category: string
  user_id?: string | null
}

// ── Cola: operaciones scopeadas al Ten-Comp ─────────────────────────────────
export async function fetchEmailQueue(tenCompId: string): Promise<EmailQueueEntry[]> {
  const { data, error } = await supabase
    .from('email_queue')
    .select('*')
    .eq('ten_comp_id', tenCompId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as EmailQueueEntry[]
}

export async function enqueueEmails(emails: CreateEmailInput[]): Promise<void> {
  if (emails.length === 0) return
  const { error } = await supabase.from('email_queue').insert(emails)
  if (error) throw error
}

export async function deleteEmail(id: string): Promise<void> {
  const { error } = await supabase.from('email_queue').delete().eq('id', id)
  if (error) throw error
}

export async function deleteEmailsByIds(ids: string[]): Promise<void> {
  if (ids.length === 0) return
  const { error } = await supabase.from('email_queue').delete().in('id', ids)
  if (error) throw error
}

export async function deleteAllEmails(tenCompId: string): Promise<void> {
  const { error } = await supabase.from('email_queue').delete().eq('ten_comp_id', tenCompId)
  if (error) throw error
}

export async function sendEmailViaApi(
  emailId: string,
  token: string
): Promise<{ success: boolean; error?: string }> {
  const res = await fetch('/api/send-email', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ email_id: emailId }),
  })
  const json = await res.json()
  return json as { success: boolean; error?: string }
}

// ── Datos de miembros (RPCs v2 ten-comp-scoped, guardadas por is_ten_comp_admin) ──
export interface TenCompUserDetail {
  id: string
  email: string
  predictions_count: number
}

export async function fetchTenCompUserDetails(tenCompId: string): Promise<TenCompUserDetail[]> {
  const { data, error } = await supabase.rpc('admin_get_user_details', { p_ten_comp: tenCompId })
  if (error) throw error
  return (data ?? []) as TenCompUserDetail[]
}

export async function fetchMatchPredictions(
  tenCompId: string,
  matchId: string
): Promise<MatchPredictionRow[]> {
  const { data, error } = await supabase.rpc('admin_get_match_predictions', {
    p_ten_comp: tenCompId,
    p_match_id: matchId,
  })
  if (error) throw error
  return (data ?? []) as MatchPredictionRow[]
}

// ── Layout compartido ───────────────────────────────────────────────────────
function wrap(brand: EmailBrand, headerHtml: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body style="margin:0;padding:20px;background-color:#f0f0f0;font-family:Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;background:#0B0F1A;border-radius:12px;overflow:hidden;border:1px solid #1E2535;">
    <div style="background:#141925;padding:28px 24px;text-align:center;border-bottom:1px solid #1E2535;">
      ${headerHtml}
    </div>
    <div style="padding:32px 24px;">
      ${bodyHtml}
    </div>
    <div style="background:#141925;padding:16px 24px;border-top:1px solid #1E2535;text-align:center;">
      <p style="color:#475569;font-size:11px;margin:0;line-height:1.6;">
        Recibiste este correo porque sos parte de la penca <strong style="color:#94A3B8;">${escapeHtml(brand.pencaName)}</strong>.<br>
        Si no querés recibir más mails, avisale al organizador.
      </p>
    </div>
  </div>
</body>
</html>`
}

function header(brand: EmailBrand, emoji: string, subtitle: string): string {
  return `
    <p style="margin:0 0 6px 0;font-size:28px;">${emoji}</p>
    <h1 style="color:#F59E0B;margin:0;font-size:22px;font-weight:bold;">${escapeHtml(brand.pencaName)}</h1>
    <p style="color:#94A3B8;margin:8px 0 0 0;font-size:13px;">${escapeHtml(subtitle)}</p>`
}

function cta(url: string, label: string): string {
  return `
    <div style="text-align:center;margin:28px 0 0 0;">
      <a href="${url}"
         style="background:#10B981;color:#0B0F1A;text-decoration:none;padding:14px 36px;
                border-radius:8px;font-weight:bold;font-size:15px;display:inline-block;letter-spacing:0.3px;">
        ${label}
      </a>
    </div>`
}

// ── Builder: sin predicciones ───────────────────────────────────────────────
export function buildSinPrediccionesEmail(brand: EmailBrand, displayName: string): string {
  return wrap(brand,
    header(brand, '🏆', brand.competitionName),
    `<p style="color:#F8FAFC;font-size:17px;margin:0 0 12px 0;font-weight:bold;">¡Hola, ${escapeHtml(displayName)}!</p>
     <p style="color:#94A3B8;font-size:14px;line-height:1.7;margin:0 0 20px 0;">
       Todavía no cargaste ninguna predicción en <strong style="color:#F8FAFC;">${escapeHtml(brand.pencaName)}</strong>. ¡No te quedés afuera!
     </p>
     <p style="color:#94A3B8;font-size:14px;line-height:1.7;margin:0 0 8px 0;">
       Entrá antes de que empiece cada partido y cargá tu pronóstico. Cada acierto suma puntos y te acerca al podio.
     </p>
     ${cta(`${brand.baseUrl}/p/${brand.slug}/mis-predicciones`, 'Cargar mis predicciones →')}
     <p style="color:#475569;font-size:12px;line-height:1.6;margin:20px 0 0 0;text-align:center;">
       Las predicciones se bloquean al inicio de cada partido.
     </p>`
  )
}

// ── Builder: ranking ────────────────────────────────────────────────────────
export function buildRankingEmail(
  brand: EmailBrand,
  recipientName: string,
  top5: LeaderboardEntry[],
  userEntry: LeaderboardEntry | undefined,
  totalParticipants: number
): string {
  const medals = ['🥇', '🥈', '🥉', '4°', '5°']
  const userInTop5 = userEntry !== undefined && userEntry.rank <= 5

  function entryRow(entry: LeaderboardEntry, idx: number | null, isUser: boolean) {
    const medal = idx !== null ? medals[idx] : `${entry.rank}°`
    const bg = isUser ? '#10B981' : '#1E2535'
    const fc = isUser ? '#0B0F1A' : '#F8FAFC'
    const pc = isUser ? '#064E3B' : '#F59E0B'
    return `
      <div style="background:${bg};border-radius:8px;padding:10px 14px;margin-bottom:6px;display:flex;align-items:center;">
        <span style="font-size:18px;width:32px;flex-shrink:0;text-align:center;margin-right:10px;">${medal}</span>
        <span style="flex:1;font-size:14px;font-weight:${isUser ? 'bold' : 'normal'};color:${fc};overflow:hidden;white-space:nowrap;text-overflow:ellipsis;margin-right:16px;">
          ${escapeHtml(entry.display_name || entry.username)}${isUser ? ' (vos)' : ''}
        </span>
        <span style="font-size:14px;font-weight:bold;color:${pc};flex-shrink:0;white-space:nowrap;">${entry.total_points} pts</span>
      </div>`
  }

  const top5Rows = top5.map((e, i) => entryRow(e, i, userInTop5 && e.user_id === userEntry?.user_id)).join('')
  const userSection = (!userInTop5 && userEntry)
    ? `<div style="border-top:1px dashed #1E2535;margin:16px 0 10px 0;padding-top:4px;"></div>
       <p style="color:#94A3B8;font-size:11px;text-align:center;margin:0 0 8px 0;text-transform:uppercase;letter-spacing:0.5px;">Tu posición — puesto ${userEntry.rank} de ${totalParticipants}</p>
       ${entryRow(userEntry, null, true)}`
    : (!userInTop5 && !userEntry)
      ? `<div style="border-top:1px dashed #1E2535;margin:16px 0 10px 0;"></div>
         <div style="background:#1E2535;border-radius:8px;padding:10px 14px;text-align:center;">
           <span style="color:#475569;font-size:13px;">Todavía no tenés puntos en el ranking</span>
         </div>`
      : ''

  return wrap(brand,
    header(brand, '🏆', `Ranking actual · ${totalParticipants} participantes`),
    `<p style="color:#F8FAFC;font-size:17px;margin:0 0 6px 0;font-weight:bold;">¡Hola, ${escapeHtml(recipientName)}!</p>
     <p style="color:#94A3B8;font-size:14px;line-height:1.6;margin:0 0 24px 0;">Así está el ranking de la penca. ¿Vas a remontar?</p>
     <p style="color:#94A3B8;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 10px 0;">Top 5</p>
     ${top5Rows}
     ${userSection}
     ${cta(`${brand.baseUrl}/p/${brand.slug}/ranking`, 'Ver ranking completo →')}`
  )
}

// ── Builder: resultado de partido ───────────────────────────────────────────
export interface MatchInfoForEmail {
  match_number: number
  home_name: string
  away_name: string
  home_score_90: number | null
  away_score_90: number | null
  match_datetime: string
  status: string
}

export interface MatchPredictionRow {
  user_id: string
  display_name: string
  username: string
  home_score: number | null
  away_score: number | null
  points_earned: number
  total_points: number
}

export function buildResultadoEmail(
  brand: EmailBrand,
  recipientName: string,
  recipientUserId: string,
  match: MatchInfoForEmail,
  predictions: MatchPredictionRow[],
  top5: LeaderboardEntry[] = []
): string {
  const isFinished = match.status === 'finished'
  const resultStr = isFinished ? `${match.home_score_90} - ${match.away_score_90}` : 'Por jugar'
  const d = new Date(match.match_datetime)
  const dateStr = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`

  function predStr(p: MatchPredictionRow) {
    if (p.home_score === null || p.away_score === null) return '–'
    return `${p.home_score} - ${p.away_score}`
  }

  const rows = predictions.map((p, i) => {
    const isMe = p.user_id === recipientUserId
    const bg = isMe ? '#10B981' : (i % 2 === 0 ? '#141925' : '#1a2030')
    const fc = isMe ? '#0B0F1A' : '#F8FAFC'
    const muted = isMe ? '#064E3B' : '#94A3B8'
    const name = escapeHtml(p.display_name || p.username)
    return `
      <tr style="background:${bg};">
        <td style="padding:8px 10px;font-size:13px;color:${muted};text-align:center;border-radius:4px 0 0 4px;">${i + 1}</td>
        <td style="padding:8px 10px;font-size:13px;color:${fc};font-weight:${isMe ? 'bold' : 'normal'};">${name}${isMe ? ' ✓' : ''}</td>
        <td style="padding:8px 10px;font-size:13px;color:${fc};text-align:center;font-family:monospace;">${predStr(p)}</td>
        <td style="padding:8px 10px;font-size:13px;color:${isMe ? '#064E3B' : '#F59E0B'};text-align:center;font-weight:bold;">${p.points_earned} pts</td>
        <td style="padding:8px 10px;font-size:13px;color:${muted};text-align:center;border-radius:0 4px 4px 0;">${p.total_points} pts</td>
      </tr>
      <tr><td colspan="5" style="padding:1px 0;"></td></tr>`
  }).join('')

  const top5Html = top5.length > 0 ? `
    <div style="margin:24px 0 0 0;">
      <p style="color:#94A3B8;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 10px 0;">Ranking actual</p>
      ${top5.map((e, i) => {
        const medals = ['🥇', '🥈', '🥉', '4°', '5°']
        const isMe = e.user_id === recipientUserId
        const bg = isMe ? '#10B981' : (i % 2 === 0 ? '#1E2535' : '#141925')
        const fc = isMe ? '#0B0F1A' : '#F8FAFC'
        const pc = isMe ? '#064E3B' : '#F59E0B'
        return `<div style="background:${bg};border-radius:6px;padding:8px 12px;margin-bottom:4px;display:flex;align-items:center;gap:10px;">
          <span style="font-size:16px;width:24px;flex-shrink:0;text-align:center;">${medals[i]}</span>
          <span style="flex:1;font-size:13px;color:${fc};font-weight:${isMe ? 'bold' : 'normal'};overflow:hidden;white-space:nowrap;text-overflow:ellipsis;">${escapeHtml(e.display_name || e.username)}${isMe ? ' (vos)' : ''}</span>
          <span style="font-size:13px;font-weight:bold;color:${pc};flex-shrink:0;">${e.total_points} pts</span>
        </div>`
      }).join('')}
    </div>` : ''

  const headerHtml = `
    <p style="margin:0 0 6px 0;font-size:24px;">⚽</p>
    <h1 style="color:#F59E0B;margin:0;font-size:20px;font-weight:bold;">${escapeHtml(match.home_name)} vs ${escapeHtml(match.away_name)}</h1>
    <p style="color:#94A3B8;margin:8px 0 4px 0;font-size:13px;">Partido ${match.match_number} · ${dateStr}</p>
    <p style="color:${isFinished ? '#10B981' : '#F59E0B'};margin:0;font-size:20px;font-weight:bold;letter-spacing:2px;">${resultStr}</p>`

  const bodyHtml = `
    <p style="color:#F8FAFC;font-size:16px;margin:0 0 20px 0;">¡Hola, <strong>${escapeHtml(recipientName)}</strong>! Así quedaron los pronósticos de todos.</p>
    <table style="width:100%;border-collapse:separate;border-spacing:0 0;">
      <thead>
        <tr style="background:#1E2535;">
          <th style="padding:8px 10px;font-size:11px;color:#475569;text-transform:uppercase;text-align:center;">#</th>
          <th style="padding:8px 10px;font-size:11px;color:#475569;text-transform:uppercase;text-align:left;">Jugador</th>
          <th style="padding:8px 10px;font-size:11px;color:#475569;text-transform:uppercase;text-align:center;">Predijo</th>
          <th style="padding:8px 10px;font-size:11px;color:#475569;text-transform:uppercase;text-align:center;">Pts partido</th>
          <th style="padding:8px 10px;font-size:11px;color:#475569;text-transform:uppercase;text-align:center;">Total pts</th>
        </tr>
        <tr><td colspan="5" style="padding:2px 0;"></td></tr>
      </thead>
      <tbody>
        ${rows || '<tr><td colspan="5" style="padding:16px;text-align:center;color:#475569;font-size:13px;">Nadie predijo este partido todavía</td></tr>'}
      </tbody>
    </table>
    ${top5Html}
    ${cta(`${brand.baseUrl}/p/${brand.slug}/ranking`, 'Ver ranking completo →')}`

  return wrap(brand, headerHtml, bodyHtml)
}

// ── Builder: invitación a la penca ──────────────────────────────────────────
export function buildInvitacionEmail(
  brand: EmailBrand,
  recipientName: string,
  joinCode: string | null
): string {
  const url = `${brand.baseUrl}/p/${brand.slug}`
  const codeBlock = joinCode
    ? `<div style="background:#1E2535;border-radius:8px;padding:16px;margin:0 0 20px 0;text-align:center;">
         <p style="color:#94A3B8;font-size:12px;margin:0 0 8px 0;text-transform:uppercase;letter-spacing:0.5px;">Código de invitación</p>
         <p style="color:#F8FAFC;font-size:28px;font-weight:bold;margin:0;letter-spacing:6px;font-family:monospace;">${escapeHtml(joinCode)}</p>
       </div>`
    : ''
  return wrap(brand,
    header(brand, '🎟️', brand.competitionName),
    `<p style="color:#F8FAFC;font-size:17px;margin:0 0 12px 0;font-weight:bold;">¡Hola, ${escapeHtml(recipientName)}!</p>
     <p style="color:#94A3B8;font-size:14px;line-height:1.7;margin:0 0 20px 0;">
       Te invitamos a participar de la penca <strong style="color:#F8FAFC;">${escapeHtml(brand.pencaName)}</strong>
       (${escapeHtml(brand.competitionName)}). Predecí los resultados y competí en el ranking.
     </p>
     ${codeBlock}
     ${cta(url, 'Entrar a la penca →')}`
  )
}

// ── Builder: recordatorio de predicción ─────────────────────────────────────
export function buildRecordatorioEmail(
  brand: EmailBrand,
  recipientName: string,
  proximos: { home: string; away: string; datetime: string }[]
): string {
  const rows = proximos.map(m => {
    const d = new Date(m.datetime)
    const dateStr = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
    return `<div style="background:#1E2535;border-radius:8px;padding:10px 14px;margin-bottom:6px;display:flex;align-items:center;justify-content:space-between;gap:10px;">
      <span style="flex:1;font-size:14px;color:#F8FAFC;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;">${escapeHtml(m.home)} vs ${escapeHtml(m.away)}</span>
      <span style="font-size:12px;color:#F59E0B;flex-shrink:0;white-space:nowrap;">${dateStr}</span>
    </div>`
  }).join('')

  return wrap(brand,
    header(brand, '⏰', brand.competitionName),
    `<p style="color:#F8FAFC;font-size:17px;margin:0 0 12px 0;font-weight:bold;">¡Hola, ${escapeHtml(recipientName)}!</p>
     <p style="color:#94A3B8;font-size:14px;line-height:1.7;margin:0 0 20px 0;">
       Se vienen los próximos partidos de <strong style="color:#F8FAFC;">${escapeHtml(brand.pencaName)}</strong>.
       No te olvides de cargar tus pronósticos antes de que empiecen.
     </p>
     ${rows}
     ${cta(`${brand.baseUrl}/p/${brand.slug}/mis-predicciones`, 'Cargar mis predicciones →')}
     <p style="color:#475569;font-size:12px;line-height:1.6;margin:20px 0 0 0;text-align:center;">
       Cada partido se bloquea al momento de empezar.
     </p>`
  )
}
