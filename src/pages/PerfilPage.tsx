import { useState, useRef, type ChangeEvent } from 'react'
import { Camera, Loader2, Check, Lock, Eye, EyeOff, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { updateProfile, uploadAvatar } from '../services/profileService'
import { RequireAuth } from '../components/auth/AuthGuard'
import { PRESET_AVATAR_GROUPS, resolveAvatarUrl } from '../utils/avatars'

export function PerfilPage() {
  return (
    <RequireAuth>
      <PerfilContent />
    </RequireAuth>
  )
}

function PerfilContent() {
  const { user, profile, loading: authLoading } = useAuth()
  const [displayName, setDisplayName] = useState(profile?.display_name ?? '')
  const [saving, setSaving] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [updatingPass, setUpdatingPass] = useState(false)
  const [showPass, setShowPass] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  // `undefined` = todavía no se tocó; `null` = el usuario lo quitó.
  const [avatarOverride, setAvatarOverride] = useState<string | null | undefined>(undefined)
  const fileRef = useRef<HTMLInputElement>(null)

  if (authLoading || !profile || !user) return null


  async function handleSave() {
    if (!displayName.trim()) return
    setSaving(true)
    try {
      await updateProfile(user!.id, { display_name: displayName.trim() })
      toast.success('Perfil actualizado')
    } catch {
      toast.error('Error al guardar')
    }
    setSaving(false)
  }

  // Guarda el avatar y refresca la sesión: useAuth no comparte estado entre
  // componentes, así que sin esto el Header seguiría mostrando el anterior.
  async function saveAvatar(url: string | null) {
    await updateProfile(user!.id, { avatar_url: url })
    setAvatarOverride(url)
    await supabase.auth.refreshSession()
  }

  async function handleAvatarChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    // Preview local
    const reader = new FileReader()
    reader.onload = ev => setAvatarOverride(ev.target?.result as string)
    reader.readAsDataURL(file)

    setUploadingAvatar(true)
    try {
      const url = await uploadAvatar(user!.id, file)
      await saveAvatar(url)
      toast.success('Avatar actualizado')
    } catch {
      setAvatarOverride(undefined)
      toast.error('Error al subir la imagen. Máximo 2 MB.')
    }
    setUploadingAvatar(false)
  }

  async function handlePickPreset(url: string) {
    const previous = avatarOverride
    setAvatarOverride(url)
    try {
      await saveAvatar(url)
    } catch {
      setAvatarOverride(previous)
      toast.error('No se pudo guardar el avatar')
    }
  }

  async function handleRemoveAvatar() {
    const previous = avatarOverride
    setAvatarOverride(null)
    try {
      await saveAvatar(null)
      toast.success('Avatar quitado')
    } catch {
      setAvatarOverride(previous)
      toast.error('No se pudo quitar el avatar')
    }
  }

  async function handleUpdatePassword() {
    if (newPassword.length < 6) {
      toast.error('La contraseña debe tener al menos 6 caracteres')
      return
    }
    setUpdatingPass(true)
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) {
      toast.error('Error al actualizar la contraseña')
    } else {
      toast.success('Contraseña actualizada correctamente')
      setNewPassword('')
      setShowPass(false)
    }
    setUpdatingPass(false)
  }

  const avatarSrc = avatarOverride !== undefined ? avatarOverride : profile.avatar_url

  return (
    <div className="max-w-md mx-auto">
      <h1 className="text-xl font-bold text-text-primary mb-6">Mi perfil</h1>

      {/* Avatar */}
      <div className="card p-6 mb-4">
        <div className="flex items-center gap-5">
          <div className="relative flex-shrink-0">
            <img
              src={resolveAvatarUrl(avatarSrc, user.id)}
              alt="Avatar"
              className="w-20 h-20 rounded-full object-cover border-2 border-border"
            />

            {/* Botón cambiar avatar */}
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploadingAvatar}
              className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-primary flex items-center justify-center shadow-lg hover:bg-primary-hover transition-colors"
            >
              {uploadingAvatar
                ? <Loader2 size={14} className="animate-spin text-white" />
                : <Camera size={14} className="text-white" />
              }
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={handleAvatarChange}
            />
          </div>

          <div>
            <p className="font-semibold text-text-primary">{profile.display_name}</p>
            <p className="text-sm text-text-muted">@{profile.username}</p>
            {profile.is_admin && (
              <span className="badge-accent text-[10px] mt-1">Admin</span>
            )}
          </div>
        </div>
        <p className="text-xs text-text-muted mt-3">
          Formatos: JPG, PNG, WEBP · Máximo 2 MB
        </p>
      </div>

      {/* Avatares por defecto */}
      <div className="card p-6 mb-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-text-secondary">Elegí un avatar</h2>
          {avatarSrc && (
            <button
              onClick={handleRemoveAvatar}
              className="text-xs text-text-muted hover:text-text-secondary flex items-center gap-1.5"
            >
              <Trash2 size={13} /> Quitar
            </button>
          )}
        </div>

        <div className="space-y-5">
          {PRESET_AVATAR_GROUPS.map(({ group, avatars }) => (
            <div key={group}>
              <p className="text-[11px] uppercase tracking-wider text-text-muted mb-2">{group}</p>
              <div className="grid grid-cols-6 gap-2.5">
                {avatars.map(av => {
                  const selected = avatarSrc === av.url
                  return (
                    <button
                      key={av.id}
                      onClick={() => handlePickPreset(av.url)}
                      title={av.label}
                      aria-label={av.label}
                      aria-pressed={selected}
                      className={`relative aspect-square rounded-full overflow-hidden transition-transform hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                        selected ? 'ring-2 ring-primary ring-offset-2 ring-offset-surface' : ''
                      }`}
                    >
                      <img src={av.url} alt="" className="w-full h-full object-cover" loading="lazy" />
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Datos editables */}
      <div className="card p-6 mb-4">
        <h2 className="text-sm font-semibold text-text-secondary mb-4">Información</h2>

        <div className="space-y-4">
          <div>
            <label className="block text-xs text-text-secondary mb-1.5">Nombre para mostrar</label>
            <input
              type="text"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              className="input"
              maxLength={60}
            />
          </div>

          <div>
            <label className="block text-xs text-text-secondary mb-1.5">Usuario</label>
            <input
              type="text"
              value={`@${profile.username}`}
              disabled
              className="input opacity-50 cursor-not-allowed"
            />
          </div>

          <div>
            <label className="block text-xs text-text-secondary mb-1.5">Email</label>
            <input
              type="email"
              value={user.email ?? ''}
              disabled
              className="input opacity-50 cursor-not-allowed"
            />
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={saving || displayName.trim() === profile.display_name}
          className="btn-primary w-full mt-5 flex items-center justify-center gap-2"
        >
          {saving
            ? <><Loader2 size={15} className="animate-spin" /> Guardando...</>
            : <><Check size={15} /> Guardar cambios</>
          }
        </button>
      </div>

      {/* Seguridad */}
      <div className="card p-6 mb-4">
        <h2 className="text-sm font-semibold text-text-secondary mb-4 flex items-center gap-2">
          <Lock size={14} /> Seguridad
        </h2>

        <div className="space-y-4">
          <div>
            <label className="block text-xs text-text-secondary mb-1.5">Nueva contraseña</label>
            <div className="relative">
              <input
                type={showPass ? 'text' : 'password'}
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                className="input pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPass(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary"
              >
                {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
        </div>

        <button
          onClick={handleUpdatePassword}
          disabled={updatingPass || newPassword.length < 6}
          className="btn-primary w-full mt-5 flex items-center justify-center gap-2 bg-surface text-text-primary hover:bg-surface-2 border-border"
        >
          {updatingPass
            ? <><Loader2 size={15} className="animate-spin" /> Actualizando...</>
            : <><Check size={15} /> Actualizar contraseña</>
          }
        </button>
      </div>

      {/* Estado de cuenta */}
      <div className="card p-4">
        <div className="flex items-center justify-between">
          <span className="text-xs text-text-muted">Estado de cuenta</span>
          {profile.is_active
            ? <span className="badge-primary">Activa</span>
            : <span className="badge bg-warning/20 text-warning text-xs px-2 py-0.5 rounded-full">Desactivada</span>
          }
        </div>
      </div>
    </div>
  )
}
