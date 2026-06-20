import { useState } from 'react'
import { KeyRound, Loader2, LogOut } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '../../lib/supabase'

// Pantalla bloqueante: aparece cuando profiles.must_change_password = true (el
// admin reseteó la pass). El usuario no puede usar la app hasta crear una nueva.
export function ForcePasswordChange({ userId }: { userId: string }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [saving, setSaving] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (password.length < 6) return toast.error('La contraseña debe tener al menos 6 caracteres')
    if (password !== confirm) return toast.error('Las contraseñas no coinciden')
    setSaving(true)
    const { error } = await supabase.auth.updateUser({ password })
    if (error) {
      toast.error(error.message || 'No se pudo actualizar la contraseña')
      setSaving(false)
      return
    }
    // Apaga el flag (RLS permite al dueño) y recarga para limpiar el estado de auth.
    const { error: flagErr } = await supabase
      .from('profiles')
      .update({ must_change_password: false })
      .eq('id', userId)
    if (flagErr) {
      toast.error('Contraseña cambiada, pero no se pudo limpiar el flag. Reintentá.')
      setSaving(false)
      return
    }
    toast.success('Contraseña actualizada')
    window.location.assign('/')
  }

  return (
    <div className="min-h-screen bg-background text-text-primary flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="card p-6 space-y-5">
          <div className="text-center space-y-2">
            <div className="w-12 h-12 mx-auto rounded-full bg-accent/15 flex items-center justify-center">
              <KeyRound className="text-accent" size={22} />
            </div>
            <h1 className="text-lg font-bold">Creá tu nueva contraseña</h1>
            <p className="text-sm text-text-secondary">
              Un administrador reseteó tu contraseña. Para continuar, definí una nueva.
            </p>
          </div>

          <form onSubmit={submit} className="space-y-3">
            <div>
              <label className="block text-xs text-text-secondary mb-1.5">Nueva contraseña</label>
              <input
                type="password" value={password} autoFocus
                onChange={e => setPassword(e.target.value)}
                className="input w-full" placeholder="Mínimo 6 caracteres"
              />
            </div>
            <div>
              <label className="block text-xs text-text-secondary mb-1.5">Repetir contraseña</label>
              <input
                type="password" value={confirm}
                onChange={e => setConfirm(e.target.value)}
                className="input w-full" placeholder="Repetí la contraseña"
              />
            </div>
            <button type="submit" disabled={saving} className="btn-primary w-full">
              {saving ? <Loader2 size={16} className="animate-spin mx-auto" /> : 'Guardar y continuar'}
            </button>
          </form>

          <button
            onClick={() => supabase.auth.signOut()}
            className="w-full inline-flex items-center justify-center gap-1.5 text-xs text-text-muted hover:text-text-primary transition-colors"
          >
            <LogOut size={13} /> Cerrar sesión
          </button>
        </div>
      </div>
    </div>
  )
}
