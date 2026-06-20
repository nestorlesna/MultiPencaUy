import type { VercelRequest, VercelResponse } from '@vercel/node'
import nodemailer from 'nodemailer'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Verificar JWT del usuario
  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) return res.status(401).json({ error: 'Sin autorización' })

  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
  if (authError || !user) return res.status(401).json({ error: 'Token inválido' })

  const { email_id } = req.body as { email_id: string }
  if (!email_id) return res.status(400).json({ error: 'Falta email_id' })

  // Obtener el correo de la cola (incluye tenant_id para autorización + branding)
  const { data: email, error: fetchError } = await supabaseAdmin
    .from('email_queue')
    .select('*')
    .eq('id', email_id)
    .single()

  if (fetchError || !email) return res.status(404).json({ error: 'Correo no encontrado' })

  // ── Autorización v2: super-admin global o admin del tenant dueño del correo ──
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('is_super_admin')
    .eq('id', user.id)
    .single()

  let authorized = profile?.is_super_admin === true
  if (!authorized && email.tenant_id) {
    const { data: role } = await supabaseAdmin
      .from('tenant_roles')
      .select('role')
      .eq('tenant_id', email.tenant_id)
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .maybeSingle()
    authorized = !!role
  }
  if (!authorized) return res.status(403).json({ error: 'No autorizado' })

  // ── Branding del "from": nombre del tenant (emisor de plataforma) ──
  let fromName = process.env.SMTP_FROM_NAME ?? 'PencaLes'
  if (email.tenant_id) {
    const { data: tenant } = await supabaseAdmin
      .from('tenants')
      .select('name')
      .eq('id', email.tenant_id)
      .maybeSingle()
    if (tenant?.name) fromName = tenant.name
  }

  // Configurar transporte SMTP (global de plataforma)
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST ?? 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT ?? '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  })

  try {
    await transporter.sendMail({
      from: `"${fromName}" <${process.env.SMTP_USER}>`,
      to: `"${email.to_name}" <${email.to_email}>`,
      subject: email.subject,
      html: email.body_html,
    })

    await supabaseAdmin
      .from('email_queue')
      .update({ status: 'sent', sent_at: new Date().toISOString(), error_message: null })
      .eq('id', email_id)

    return res.status(200).json({ success: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido'

    await supabaseAdmin
      .from('email_queue')
      .update({ status: 'failed', error_message: message })
      .eq('id', email_id)

    return res.status(500).json({ success: false, error: message })
  }
}
