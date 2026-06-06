import { useState, useEffect, type FormEvent } from 'react'
import { Navigate, useSearchParams } from 'react-router-dom'
import { Trophy, Loader2, Eye, EyeOff, Clock } from 'lucide-react'
import { Capacitor } from '@capacitor/core'
import { GoogleAuth } from '@codetrix-studio/capacitor-google-auth'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { Captcha } from '../components/ui/Captcha'

const TOURNAMENT_START = new Date('2026-06-11T00:00:00Z').getTime()

function CountdownTimer() {
  const [timeLeft, setTimeLeft] = useState(() => TOURNAMENT_START - Date.now())

  useEffect(() => {
    const interval = setInterval(() => {
      setTimeLeft(TOURNAMENT_START - Date.now())
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  if (timeLeft <= 0) return null

  const days = Math.floor(timeLeft / (1000 * 60 * 60 * 24))
  const hours = Math.floor((timeLeft % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
  const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60))
  const seconds = Math.floor((timeLeft % (1000 * 60)) / 1000)

  const blocks = [
    { value: days, label: 'días' },
    { value: hours, label: 'horas' },
    { value: minutes, label: 'min' },
    { value: seconds, label: 'seg' },
  ]

  return (
    <div className="mt-8">
      <div className="flex items-center justify-center gap-1.5 text-text-muted text-sm mb-3">
        <Clock size={14} />
        <span>Arranca el Mundial</span>
      </div>
      <div className="flex justify-center gap-2">
        {blocks.map((b) => (
          <div
            key={b.label}
            className="bg-surface border border-border rounded-lg px-3 py-2 min-w-[52px] text-center"
          >
            <div className="text-xl font-bold text-text-primary tabular-nums">
              {String(b.value).padStart(2, '0')}
            </div>
            <div className="text-[10px] text-text-muted uppercase tracking-wide">
              {b.label}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

type Tab = 'login' | 'register' | 'forgot' | 'reset'

export function AuthPage() {
  const { user, isActive } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const [tab, setTab] = useState<Tab>(() => {
    const t = searchParams.get('tab')
    if (t === 'reset') return 'reset'
    return 'login'
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [showPass, setShowPass] = useState(false)

  // Campos
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [username, setUsername] = useState('')
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)

  // Si ya está logueado y activo, redirigir
  if (user && isActive) return <Navigate to="/fixture" replace />

  async function handleLogin(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!captchaToken) {
      setError('Por favor completá la verificación de seguridad.')
      return
    }
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password, options: { captchaToken } })
    if (error) setError(traducirError(error.message))
    setLoading(false)
  }

  async function handleRegister(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!captchaToken) {
      setError('Por favor completá la verificación de seguridad.')
      return
    }
    setLoading(true)

    if (username.length < 3) {
      setError('El nombre de usuario debe tener al menos 3 caracteres.')
      setLoading(false)
      return
    }
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      setError('El usuario solo puede contener letras, números y _')
      setLoading(false)
      return
    }

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { username, full_name: displayName },
        captchaToken,
        emailRedirectTo: window.location.origin,
      },
    })

    if (error) {
      setError(traducirError(error.message))
    } else {
      setSuccess('¡Registro exitoso! Revisá tu correo para confirmar la cuenta y ya podés empezar a predecir.')
      setEmail(''); setPassword(''); setDisplayName(''); setUsername('')
      setCaptchaToken(null)
    }
    setLoading(false)
  }

  async function handleRecover(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!captchaToken) {
      setError('Por favor completá la verificación de seguridad.')
      return
    }
    setLoading(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth?tab=reset`,
      captchaToken
    })
    if (error) {
      setError(traducirError(error.message))
    } else {
      setSuccess('Se ha enviado un correo con instrucciones para restablecer tu contraseña.')
      setEmail('')
      setCaptchaToken(null)
    }
    setLoading(false)
  }

  async function handleGoogleLogin() {
    setError(null)
    setLoading(true)

    if (Capacitor.isNativePlatform()) {
      try {
        await GoogleAuth.initialize({
          clientId: '917674823527-hh4as8jg5mi9gdltjnqgjh4a7fuc07ri.apps.googleusercontent.com',
          scopes: ['profile', 'email'],
          grantOfflineAccess: true,
        })
        const googleUser = await GoogleAuth.signIn()
        const idToken = googleUser.authentication.idToken
        const { error } = await supabase.auth.signInWithIdToken({
          provider: 'google',
          token: idToken,
        })
        if (error) setError(traducirError(error.message))
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e)
        if (!msg.includes('cancel') && !msg.includes('Cancel') && !msg.includes('12501')) {
          setError('No se pudo iniciar sesión con Google.')
        }
      }
    } else {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${window.location.origin}/auth-callback` },
      })
      if (error) setError(traducirError(error.message))
    }

    setLoading(false)
  }

  async function handleResetPassword(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password })
    if (error) {
      setError(traducirError(error.message))
    } else {
      setSuccess('Tu contraseña ha sido actualizada correctamente. Ya podés ingresar.')
      setTab('login')
      setPassword('')
      setSearchParams({})
    }
    setLoading(false)
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-3">
            <Trophy className="text-primary" size={28} />
          </div>
          <h1 className="text-xl font-bold text-text-primary">Penca Mundial 2026</h1>
          <p className="text-text-muted text-sm mt-1">Predicí, competí, ganá</p>
        </div>

        {/* Card */}
        <div className="card p-6">
          {/* Tabs */}
          {tab !== 'forgot' && tab !== 'reset' && (
            <div className="flex rounded-lg bg-surface-2 p-1 mb-5">
              {(['login', 'register'] as Tab[]).map(t => (
                <button
                  key={t}
                  onClick={() => {
                    setTab(t);
                    setError(null);
                    setSuccess(null);
                    setCaptchaToken(null);
                    setSearchParams({});
                  }}
                  className={`flex-1 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    tab === t
                      ? 'bg-surface text-text-primary shadow-sm'
                      : 'text-text-muted hover:text-text-secondary'
                  }`}
                >
                  {t === 'login' ? 'Ingresar' : 'Registrarse'}
                </button>
              ))}
            </div>
          )}

          {tab === 'forgot' && (
            <div className="mb-5">
              <button
                onClick={() => { setTab('login'); setError(null); setSuccess(null) }}
                className="text-xs text-primary hover:underline flex items-center gap-1"
              >
                ← Volver al ingreso
              </button>
              <h2 className="text-lg font-bold text-text-primary mt-2">Recuperar contraseña</h2>
              <p className="text-xs text-text-muted mt-1">Ingresá tu email y te enviaremos un link para crear una nueva.</p>
            </div>
          )}

          {tab === 'reset' && (
            <div className="mb-5">
              <h2 className="text-lg font-bold text-text-primary">Nueva contraseña</h2>
              <p className="text-xs text-text-muted mt-1">Elegí una contraseña segura para tu cuenta.</p>
            </div>
          )}

          {/* Mensaje de éxito */}
          {success && (
            <div className="bg-primary/10 border border-primary/30 text-primary text-sm rounded-lg p-3 mb-4">
              {success}
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="bg-error/10 border border-error/30 text-error text-sm rounded-lg p-3 mb-4">
              {error}
            </div>
          )}

          {/* Formulario */}
          <form
            onSubmit={
              tab === 'login' ? handleLogin :
              tab === 'register' ? handleRegister :
              tab === 'reset' ? handleResetPassword :
              handleRecover
            }
            className="space-y-4"
          >
            {tab !== 'forgot' && tab !== 'reset' && (
              <>
                {tab === 'register' && (
                  <>
                    <div>
                      <label className="block text-xs text-text-secondary mb-1.5">Nombre para mostrar</label>
                      <input
                        type="text"
                        value={displayName}
                        onChange={e => setDisplayName(e.target.value)}
                        className="input"
                        placeholder="Ej: Juan García"
                        required
                        maxLength={60}
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-text-secondary mb-1.5">
                        Nombre de usuario <span className="text-text-muted">(solo letras, números, _)</span>
                      </label>
                      <input
                        type="text"
                        value={username}
                        onChange={e => setUsername(e.target.value.toLowerCase())}
                        className="input"
                        placeholder="Ej: juangarcia"
                        required
                        minLength={3}
                        maxLength={30}
                        pattern="[a-zA-Z0-9_]+"
                      />
                    </div>
                  </>
                )}
                <div>
                  <label className="block text-xs text-text-secondary mb-1.5">Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    className="input"
                    placeholder="tu@email.com"
                    required
                    autoComplete={tab === 'login' ? 'email' : 'new-email'}
                  />
                </div>
              </>
            )}

            {tab === 'forgot' && (
              <div>
                <label className="block text-xs text-text-secondary mb-1.5">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="input"
                  placeholder="tu@email.com"
                  required
                  autoComplete="email"
                />
              </div>
            )}

            {(tab !== 'forgot') && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs text-text-secondary">
                    {tab === 'reset' ? 'Nueva contraseña' : 'Contraseña'}
                  </label>
                  {tab === 'login' && (
                    <button
                      type="button"
                      onClick={() => { setTab('forgot'); setError(null); setSuccess(null) }}
                      className="text-[11px] text-primary hover:underline focus:outline-none"
                    >
                      ¿Olvidaste tu contraseña?
                    </button>
                  )}
                </div>
                <div className="relative">
                  <input
                    type={showPass ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="input pr-10"
                    placeholder={tab === 'register' ? 'Mínimo 6 caracteres' : tab === 'reset' ? 'Ingresá tu nueva contraseña' : '••••••••'}
                    required
                    minLength={6}
                    autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
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
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full flex items-center justify-center gap-2 py-2.5"
            >
              {loading && <Loader2 size={16} className="animate-spin" />}
              {tab === 'login' ? 'Ingresar' : tab === 'register' ? 'Crear cuenta' : tab === 'reset' ? 'Guardar nueva contraseña' : 'Enviar instrucciones'}
            </button>
          </form>

          {(tab === 'login' || tab === 'register') && (
            <>
              <div className="relative my-4">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-border" />
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="bg-surface px-2 text-text-muted">o</span>
                </div>
              </div>
              <button
                type="button"
                onClick={handleGoogleLogin}
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 border border-border rounded-lg text-sm text-text-primary hover:bg-surface-2 transition-colors disabled:opacity-50"
              >
                <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                  <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.716v2.259h2.908C16.658 14.015 17.64 11.707 17.64 9.2z" fill="#4285F4"/>
                  <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
                  <path d="M3.964 10.706A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.332z" fill="#FBBC05"/>
                  <path d="M9 3.576c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.962L3.964 7.294C4.672 5.163 6.656 3.576 9 3.576z" fill="#EA4335"/>
                </svg>
                Continuar con Google
              </button>
            </>
          )}

          <div className="mt-4">
            <Captcha
              onSuccess={token => setCaptchaToken(token)}
              onExpire={() => setCaptchaToken(null)}
              onError={() => {
                setError('Error al cargar la verificación de seguridad.')
                setCaptchaToken(null)
              }}
            />
          </div>

          {tab === 'register' && (
            <p className="text-[11px] text-text-muted text-center mt-4">
              Tu cuenta queda activa al registrarte. ¡Apostá antes de que empiece cada partido!
            </p>
          )}
        </div>

        <CountdownTimer />
      </div>
    </div>
  )
}

function traducirError(msg: string): string {
  if (msg.includes('Invalid login credentials')) return 'Email o contraseña incorrectos.'
  if (msg.includes('User already registered'))   return 'Ya existe una cuenta con ese email.'
  if (msg.includes('Password should be'))        return 'La contraseña debe tener al menos 6 caracteres.'
  if (msg.includes('Unable to validate email'))  return 'El formato del email no es válido.'
  if (msg.includes('Email rate limit'))          return 'Demasiados intentos. Esperá unos minutos.'
  if (msg.includes('captcha'))                   return 'Error en la verificación de seguridad (Captcha).'
  return msg
}
