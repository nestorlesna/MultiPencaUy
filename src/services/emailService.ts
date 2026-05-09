import { supabase } from '../lib/supabase'
import type { LeaderboardEntry } from '../types'
import type { MatchWithRelations } from '../types/match'
import { fetchAllProfiles, fetchAdminUserDetails } from './profileService'
import { fetchMatchPredictionsAdmin } from './matchService'
import { fetchLeaderboard } from './leaderboardService'

export interface EmailQueueEntry {
  id: string
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
  to_email: string
  to_name: string
  subject: string
  body_html: string
  category: string
  user_id?: string | null
}

export async function fetchEmailQueue(): Promise<EmailQueueEntry[]> {
  const { data, error } = await supabase
    .from('email_queue')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as EmailQueueEntry[]
}

export async function enqueueEmails(emails: CreateEmailInput[]): Promise<void> {
  const { error } = await supabase.from('email_queue').insert(emails)
  if (error) throw error
}

export async function deleteEmail(id: string): Promise<void> {
  const { error } = await supabase.from('email_queue').delete().eq('id', id)
  if (error) throw error
}

export async function deleteEmailsByIds(ids: string[]): Promise<void> {
  const { error } = await supabase.from('email_queue').delete().in('id', ids)
  if (error) throw error
}

export async function deleteAllEmails(): Promise<void> {
  const { error } = await supabase.from('email_queue').delete().not('id', 'is', null)
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

// Genera el HTML del mail para usuarios con grupos incompletos
export function buildGruposIncompletosEmail(
  displayName: string,
  groupPreds: number,
  totalGroupMatches: number
): string {
  const missing = totalGroupMatches - groupPreds
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body style="margin:0;padding:20px;background-color:#f0f0f0;font-family:Arial,sans-serif;">
  <div style="max-width:560px;margin:0 auto;background:#0B0F1A;border-radius:12px;overflow:hidden;border:1px solid #1E2535;">

    <!-- Header -->
    <div style="background:#141925;padding:28px 24px;text-align:center;border-bottom:1px solid #1E2535;">
      <p style="margin:0 0 6px 0;font-size:28px;">⚽</p>
      <h1 style="color:#F59E0B;margin:0;font-size:22px;font-weight:bold;">PencaLes 2026</h1>
      <p style="color:#94A3B8;margin:8px 0 0 0;font-size:13px;">Copa del Mundo · Fase de grupos</p>
    </div>

    <!-- Body -->
    <div style="padding:32px 24px;">
      <p style="color:#F8FAFC;font-size:17px;margin:0 0 12px 0;font-weight:bold;">¡Hola, ${displayName}!</p>

      <!-- Progreso visual -->
      <div style="background:#1E2535;border-radius:8px;padding:16px;margin:0 0 20px 0;text-align:center;">
        <p style="color:#94A3B8;font-size:12px;margin:0 0 8px 0;text-transform:uppercase;letter-spacing:0.5px;">Partidos apostados — fase de grupos</p>
        <p style="color:#F8FAFC;font-size:32px;font-weight:bold;margin:0;">
          ${groupPreds} <span style="color:#475569;font-size:18px;font-weight:normal;">/ ${totalGroupMatches}</span>
        </p>
        <p style="color:#F59E0B;font-size:13px;margin:8px 0 0 0;">
          Te ${missing === 1 ? 'falta' : 'faltan'} <strong>${missing}</strong> partido${missing === 1 ? '' : 's'} por apostar
        </p>
      </div>

      <p style="color:#94A3B8;font-size:14px;line-height:1.7;margin:0 0 24px 0;">
        La fase de grupos tiene <strong style="color:#F8FAFC;">${totalGroupMatches} partidos</strong> y cada uno que apostás
        bien te suma puntos. ¡No pierdas los que te quedan!
      </p>

      <!-- CTA -->
      <div style="text-align:center;margin:0 0 28px 0;">
        <a href="https://penca2026uy.vercel.app/fixture"
           style="background:#10B981;color:#0B0F1A;text-decoration:none;padding:14px 36px;
                  border-radius:8px;font-weight:bold;font-size:15px;display:inline-block;
                  letter-spacing:0.3px;">
          Completar mis apuestas →
        </a>
      </div>

      <p style="color:#475569;font-size:12px;line-height:1.6;margin:0;text-align:center;">
        Las apuestas se bloquean al inicio de cada partido.<br>
        ¡Cuanto antes apostés, más puntos podés acumular!
      </p>
    </div>

    <!-- Footer -->
    <div style="background:#141925;padding:16px 24px;border-top:1px solid #1E2535;text-align:center;">
      <p style="color:#475569;font-size:11px;margin:0;line-height:1.6;">
        Recibiste este correo porque sos parte de la PencaLes 2026.<br>
        Si no querés recibir más mails, avisanos.
      </p>
    </div>

  </div>
</body>
</html>`
}

// Genera el HTML del mail con resultados de un partido (predicciones de todos)
export interface MatchInfoForEmail {
  match_number: number
  home_name: string
  away_name: string
  home_score_90: number | null
  away_score_90: number | null
  match_datetime: string
  status: string
}

export function buildPartidoEmail(
  recipientName: string,
  recipientUserId: string,
  match: MatchInfoForEmail,
  predictions: import('./matchService').MatchPredictionDetail[],
  top5: LeaderboardEntry[] = []
): string {
  const isFinished = match.status === 'finished'
  const resultStr  = isFinished
    ? `${match.home_score_90} - ${match.away_score_90}`
    : 'Por jugar'

  const d = new Date(match.match_datetime)
  const dateStr = `${d.getDate().toString().padStart(2,'0')}/${(d.getMonth()+1).toString().padStart(2,'0')}/${d.getFullYear()} ${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`

  function predStr(p: import('./matchService').MatchPredictionDetail) {
    if (p.home_score === null || p.away_score === null) return '–'
    return `${p.home_score} - ${p.away_score}`
  }

  const rows = predictions.map((p, i) => {
    const isMe = p.user_id === recipientUserId
    const bg   = isMe ? '#10B981' : (i % 2 === 0 ? '#141925' : '#1a2030')
    const fc   = isMe ? '#0B0F1A' : '#F8FAFC'
    const muted = isMe ? '#064E3B' : '#94A3B8'
    const name  = p.display_name || p.username
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

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body style="margin:0;padding:20px;background-color:#f0f0f0;font-family:Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;background:#0B0F1A;border-radius:12px;overflow:hidden;border:1px solid #1E2535;">

    <!-- Header -->
    <div style="background:#141925;padding:28px 24px;text-align:center;border-bottom:1px solid #1E2535;">
      <p style="margin:0 0 6px 0;font-size:24px;">⚽</p>
      <h1 style="color:#F59E0B;margin:0;font-size:20px;font-weight:bold;">
        ${match.home_name} vs ${match.away_name}
      </h1>
      <p style="color:#94A3B8;margin:8px 0 4px 0;font-size:13px;">Partido ${match.match_number} · ${dateStr}</p>
      <p style="color:${isFinished ? '#10B981' : '#F59E0B'};margin:0;font-size:20px;font-weight:bold;letter-spacing:2px;">
        ${resultStr}
      </p>
    </div>

    <!-- Body -->
    <div style="padding:24px;">
      <p style="color:#F8FAFC;font-size:16px;margin:0 0 20px 0;">
        ¡Hola, <strong>${recipientName}</strong>! Así quedaron las apuestas de todos.
      </p>

      <!-- Tabla de predicciones -->
      <table style="width:100%;border-collapse:separate;border-spacing:0 0;">
        <thead>
          <tr style="background:#1E2535;">
            <th style="padding:8px 10px;font-size:11px;color:#475569;text-transform:uppercase;text-align:center;">#</th>
            <th style="padding:8px 10px;font-size:11px;color:#475569;text-transform:uppercase;text-align:left;">Jugador</th>
            <th style="padding:8px 10px;font-size:11px;color:#475569;text-transform:uppercase;text-align:center;">Apostó</th>
            <th style="padding:8px 10px;font-size:11px;color:#475569;text-transform:uppercase;text-align:center;">Pts partido</th>
            <th style="padding:8px 10px;font-size:11px;color:#475569;text-transform:uppercase;text-align:center;">Total pts</th>
          </tr>
          <tr><td colspan="5" style="padding:2px 0;"></td></tr>
        </thead>
        <tbody>
          ${rows || '<tr><td colspan="5" style="padding:16px;text-align:center;color:#475569;font-size:13px;">Nadie apostó este partido todavía</td></tr>'}
        </tbody>
      </table>

      ${top5.length > 0 ? `
      <!-- Top 5 ranking -->
      <div style="margin:24px 0 0 0;">
        <p style="color:#94A3B8;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 10px 0;">Ranking actual</p>
        ${top5.map((e, i) => {
          const medals = ['🥇','🥈','🥉','4°','5°']
          const isMe = e.user_id === recipientUserId
          const bg   = isMe ? '#10B981' : (i % 2 === 0 ? '#1E2535' : '#141925')
          const fc   = isMe ? '#0B0F1A' : '#F8FAFC'
          const pc   = isMe ? '#064E3B' : '#F59E0B'
          return `<div style="background:${bg};border-radius:6px;padding:8px 12px;margin-bottom:4px;display:flex;align-items:center;gap:10px;">
            <span style="font-size:16px;width:24px;flex-shrink:0;text-align:center;">${medals[i]}</span>
            <span style="flex:1;font-size:13px;color:${fc};font-weight:${isMe ? 'bold' : 'normal'};overflow:hidden;white-space:nowrap;text-overflow:ellipsis;">${e.display_name || e.username}${isMe ? ' (vos)' : ''}</span>
            <span style="font-size:13px;font-weight:bold;color:${pc};flex-shrink:0;">${e.total_points} pts</span>
          </div>`
        }).join('')}
      </div>` : ''}

      <!-- CTA -->
      <div style="text-align:center;margin:24px 0 0 0;">
        <a href="https://penca2026uy.vercel.app/ranking"
           style="background:#10B981;color:#0B0F1A;text-decoration:none;padding:12px 32px;
                  border-radius:8px;font-weight:bold;font-size:14px;display:inline-block;">
          Ver ranking completo →
        </a>
      </div>
    </div>

    <!-- Footer -->
    <div style="background:#141925;padding:16px 24px;border-top:1px solid #1E2535;text-align:center;">
      <p style="color:#475569;font-size:11px;margin:0;line-height:1.6;">
        Recibiste este correo porque sos parte de la PencaLes 2026.
      </p>
    </div>

  </div>
</body>
</html>`
}

// Genera el HTML del mail con el ranking actual (top 5 + posición del usuario)
export function buildRankingEmail(
  recipientName: string,
  top5: LeaderboardEntry[],
  userEntry: LeaderboardEntry | undefined,
  totalParticipants: number
): string {
  const medals = ['🥇', '🥈', '🥉', '4°', '5°']
  const userInTop5 = userEntry !== undefined && userEntry.rank <= 5

  function rowStyle(isUser: boolean) {
    return isUser
      ? 'background:#10B981;border-radius:8px;padding:10px 14px;margin-bottom:6px;display:flex;align-items:center;'
      : 'background:#1E2535;border-radius:8px;padding:10px 14px;margin-bottom:6px;display:flex;align-items:center;'
  }
  function nameColor(isUser: boolean) {
    return isUser ? '#0B0F1A' : '#F8FAFC'
  }
  function ptColor(isUser: boolean) {
    return isUser ? '#064E3B' : '#F59E0B'
  }
  function entryRow(entry: LeaderboardEntry, idx: number | null, isUser: boolean) {
    const medal  = idx !== null ? medals[idx] : `${entry.rank}°`
    const pts    = entry.total_points
    return `
      <div style="${rowStyle(isUser)}">
        <span style="font-size:18px;width:32px;flex-shrink:0;text-align:center;margin-right:10px;">${medal}</span>
        <span style="flex:1;font-size:14px;font-weight:${isUser ? 'bold' : 'normal'};color:${nameColor(isUser)};overflow:hidden;white-space:nowrap;text-overflow:ellipsis;margin-right:16px;">
          ${entry.display_name || entry.username}${isUser ? ' (vos)' : ''}
        </span>
        <span style="font-size:14px;font-weight:bold;color:${ptColor(isUser)};flex-shrink:0;white-space:nowrap;">${pts} pts</span>
      </div>`
  }

  const top5Rows = top5.map((e, i) => entryRow(e, i, userInTop5 && e.user_id === userEntry?.user_id)).join('')

  const userSection = (!userInTop5 && userEntry)
    ? `
      <div style="border-top:1px dashed #1E2535;margin:16px 0 10px 0;padding-top:4px;"></div>
      <p style="color:#94A3B8;font-size:11px;text-align:center;margin:0 0 8px 0;text-transform:uppercase;letter-spacing:0.5px;">Tu posición — puesto ${userEntry.rank} de ${totalParticipants}</p>
      ${entryRow(userEntry, null, true)}`
    : (!userInTop5 && !userEntry)
      ? `
      <div style="border-top:1px dashed #1E2535;margin:16px 0 10px 0;"></div>
      <div style="background:#1E2535;border-radius:8px;padding:10px 14px;text-align:center;">
        <span style="color:#475569;font-size:13px;">Todavía no tenés puntos en el ranking</span>
      </div>`
      : ''

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body style="margin:0;padding:20px;background-color:#f0f0f0;font-family:Arial,sans-serif;">
  <div style="max-width:560px;margin:0 auto;background:#0B0F1A;border-radius:12px;overflow:hidden;border:1px solid #1E2535;">

    <!-- Header -->
    <div style="background:#141925;padding:28px 24px;text-align:center;border-bottom:1px solid #1E2535;">
      <p style="margin:0 0 6px 0;font-size:28px;">🏆</p>
      <h1 style="color:#F59E0B;margin:0;font-size:22px;font-weight:bold;">PencaLes 2026</h1>
      <p style="color:#94A3B8;margin:8px 0 0 0;font-size:13px;">Ranking actual · ${totalParticipants} participantes</p>
    </div>

    <!-- Body -->
    <div style="padding:32px 24px;">
      <p style="color:#F8FAFC;font-size:17px;margin:0 0 6px 0;font-weight:bold;">¡Hola, ${recipientName}!</p>
      <p style="color:#94A3B8;font-size:14px;line-height:1.6;margin:0 0 24px 0;">
        Así está el ranking de la penca. ¿Vas a remontar?
      </p>

      <!-- Top 5 -->
      <p style="color:#94A3B8;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 10px 0;">Top 5</p>
      ${top5Rows}
      ${userSection}

      <!-- CTA -->
      <div style="text-align:center;margin:28px 0 0 0;">
        <a href="https://penca2026uy.vercel.app/ranking"
           style="background:#10B981;color:#0B0F1A;text-decoration:none;padding:14px 36px;
                  border-radius:8px;font-weight:bold;font-size:15px;display:inline-block;">
          Ver ranking completo →
        </a>
      </div>
    </div>

    <!-- Footer -->
    <div style="background:#141925;padding:16px 24px;border-top:1px solid #1E2535;text-align:center;">
      <p style="color:#475569;font-size:11px;margin:0;line-height:1.6;">
        Recibiste este correo porque sos parte de la PencaLes 2026.<br>
        Si no querés recibir más mails, avisanos.
      </p>
    </div>

  </div>
</body>
</html>`
}

// Encola un correo de resultados por cada usuario activo para un partido recién cargado.
// Omite usuarios que ya tengan un correo en cola para esa categoría (evita duplicados).
// Debe llamarse con el objeto match ya actualizado (status:'finished', scores correctos).
export async function enqueueMatchResultEmails(match: MatchWithRelations): Promise<number> {
  const category = `partido_M${match.match_number}`

  const [profiles, userDetails, preds, leaderboard, existingQueue] = await Promise.all([
    fetchAllProfiles(),
    fetchAdminUserDetails(),
    fetchMatchPredictionsAdmin(match.id),
    fetchLeaderboard(),
    fetchEmailQueue(),
  ])

  const top5       = leaderboard.slice(0, 5)
  const detailsMap = new Map(userDetails.map(d => [d.id, d]))
  const alreadyQueued = new Set(
    existingQueue
      .filter(e => e.category === category && e.user_id)
      .map(e => e.user_id!)
  )

  const matchInfo: MatchInfoForEmail = {
    match_number:   match.match_number,
    home_name:      match.home_team?.name ?? match.home_slot_label ?? '?',
    away_name:      match.away_team?.name ?? match.away_slot_label ?? '?',
    home_score_90:  match.home_score_90,
    away_score_90:  match.away_score_90,
    match_datetime: match.match_datetime,
    status:         match.status,
  }

  const entries = profiles
    .filter(p => p.is_active && !alreadyQueued.has(p.id) && detailsMap.has(p.id))
    .map(p => {
      const detail = detailsMap.get(p.id)!
      const name   = p.display_name || p.username
      return {
        to_email:  detail.email,
        to_name:   name,
        subject:   `P${match.match_number}: ${matchInfo.home_name} vs ${matchInfo.away_name} — resultados de la penca`,
        body_html: buildPartidoEmail(name, p.id, matchInfo, preds, top5),
        category,
        user_id:   p.id,
      }
    })

  if (entries.length > 0) {
    await enqueueEmails(entries)
  }
  return entries.length
}

// Genera el HTML del mail para usuarios sin apuestas
export function buildNoApuestasEmail(displayName: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body style="margin:0;padding:20px;background-color:#f0f0f0;font-family:Arial,sans-serif;">
  <div style="max-width:560px;margin:0 auto;background:#0B0F1A;border-radius:12px;overflow:hidden;border:1px solid #1E2535;">

    <!-- Header -->
    <div style="background:#141925;padding:28px 24px;text-align:center;border-bottom:1px solid #1E2535;">
      <p style="margin:0 0 6px 0;font-size:28px;">🏆</p>
      <h1 style="color:#F59E0B;margin:0;font-size:22px;font-weight:bold;">PencaLes 2026</h1>
      <p style="color:#94A3B8;margin:8px 0 0 0;font-size:13px;">Copa del Mundo · 48 equipos · 104 partidos</p>
    </div>

    <!-- Body -->
    <div style="padding:32px 24px;">
      <p style="color:#F8FAFC;font-size:17px;margin:0 0 12px 0;font-weight:bold;">¡Hola, ${displayName}!</p>
      <p style="color:#94A3B8;font-size:14px;line-height:1.7;margin:0 0 20px 0;">
        El Mundial 2026 arranca el <strong style="color:#F8FAFC;">11 de junio</strong> y todavía
        no cargaste ninguna apuesta en la penca. ¡No te quedés afuera!
      </p>
      <p style="color:#94A3B8;font-size:14px;line-height:1.7;margin:0 0 28px 0;">
        Entrá antes de que empiece cada partido y apostá el resultado. Cada predicción
        acertada suma puntos y te acerca al podio.
      </p>

      <!-- CTA -->
      <div style="text-align:center;margin:0 0 28px 0;">
        <a href="https://penca2026uy.vercel.app/mis-predicciones"
           style="background:#10B981;color:#0B0F1A;text-decoration:none;padding:14px 36px;
                  border-radius:8px;font-weight:bold;font-size:15px;display:inline-block;
                  letter-spacing:0.3px;">
          Cargar mis apuestas →
        </a>
      </div>

      <p style="color:#475569;font-size:12px;line-height:1.6;margin:0;text-align:center;">
        Las apuestas se bloquean al inicio de cada partido.<br>
        Cuantos más partidos apostés, más puntos acumulás.
      </p>
    </div>

    <!-- Footer -->
    <div style="background:#141925;padding:16px 24px;border-top:1px solid #1E2535;text-align:center;">
      <p style="color:#475569;font-size:11px;margin:0;line-height:1.6;">
        Recibiste este correo porque sos parte de la PencaLes 2026.<br>
        Si no querés recibir más mails, avisanos.
      </p>
    </div>

  </div>
</body>
</html>`
}
