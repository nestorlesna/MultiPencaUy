import type { VercelRequest, VercelResponse } from '@vercel/node'
import { randomInt } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Sin caracteres ambiguos (0/O, 1/l/I) para que se dicte/copie sin errores.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
function tempPassword(len = 10): string {
  let out = ''
  for (let i = 0; i < len; i++) out += ALPHABET[randomInt(ALPHABET.length)]
  return out
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Verificar JWT del que llama
  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) return res.status(401).json({ error: 'Sin autorización' })

  const { data: { user: caller }, error: authError } = await supabaseAdmin.auth.getUser(token)
  if (authError || !caller) return res.status(401).json({ error: 'Token inválido' })

  const { user_id: targetId } = req.body as { user_id: string }
  if (!targetId) return res.status(400).json({ error: 'Falta user_id' })

  // ── Autorización: super-admin global, o admin de un tenant donde el target es miembro ──
  const { data: callerProfile } = await supabaseAdmin
    .from('profiles')
    .select('is_super_admin')
    .eq('id', caller.id)
    .single()

  let authorized = callerProfile?.is_super_admin === true
  if (!authorized) {
    // Tenants que administra el que llama
    const { data: roles } = await supabaseAdmin
      .from('tenant_roles')
      .select('tenant_id')
      .eq('user_id', caller.id)
      .eq('role', 'admin')
    const adminTenantIds = (roles ?? []).map(r => r.tenant_id)

    if (adminTenantIds.length > 0) {
      // ── Guard anti-escalación de privilegios ──
      // Un tenant-admin NUNCA puede resetear a una cuenta con privilegio igual o
      // mayor: ni a un super-admin de la plataforma, ni a un admin de OTRO tenant
      // que él no administre (aunque compartan una penca pública). Solo el
      // super-admin puede resetear a otros admins.
      const { data: targetProfile } = await supabaseAdmin
        .from('profiles')
        .select('is_super_admin')
        .eq('id', targetId)
        .single()

      const { data: targetRoles } = await supabaseAdmin
        .from('tenant_roles')
        .select('tenant_id')
        .eq('user_id', targetId)
        .eq('role', 'admin')
      const targetAdminsElsewhere = (targetRoles ?? [])
        .some(r => !adminTenantIds.includes(r.tenant_id))

      if (!targetProfile?.is_super_admin && !targetAdminsElsewhere) {
        // El target debe ser miembro de alguna penca de esos tenants
        const { data: tenComps } = await supabaseAdmin
          .from('ten_comps')
          .select('id')
          .in('tenant_id', adminTenantIds)
        const tenCompIds = (tenComps ?? []).map(t => t.id)

        if (tenCompIds.length > 0) {
          const { data: membership } = await supabaseAdmin
            .from('ten_comp_members')
            .select('user_id')
            .eq('user_id', targetId)
            .in('ten_comp_id', tenCompIds)
            .limit(1)
          authorized = (membership ?? []).length > 0
        }
      }
    }
  }
  if (!authorized) return res.status(403).json({ error: 'No autorizado para resetear a este usuario' })

  // ── Resetear: pass temporal + forzar cambio en el próximo login ──
  const password = tempPassword()
  const { error: updErr } = await supabaseAdmin.auth.admin.updateUserById(targetId, { password })
  if (updErr) return res.status(500).json({ success: false, error: updErr.message })

  const { error: flagErr } = await supabaseAdmin
    .from('profiles')
    .update({ must_change_password: true })
    .eq('id', targetId)
  if (flagErr) return res.status(500).json({ success: false, error: flagErr.message })

  return res.status(200).json({ success: true, password })
}
