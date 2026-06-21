import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2, Smartphone } from 'lucide-react'
import { supabase } from '../lib/supabase'

export function AuthCallbackPage() {
  const navigate = useNavigate()
  const [showButton, setShowButton] = useState(false)
  const [code, setCode] = useState<string | null>(null)

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search)
    const c = searchParams.get('code')

    const fromApk = searchParams.get('from') === 'apk'

    if (!fromApk) {
      // Flujo web puro: intercambiar código PKCE o leer sesión ya establecida
      async function resolveWebSession() {
        if (c) {
          const { error } = await supabase.auth.exchangeCodeForSession(c)
          if (!error) { navigate('/', { replace: true }); return }
        }
        const { data: { session } } = await supabase.auth.getSession()
        navigate(session ? '/' : '/auth', { replace: true })
      }
      resolveWebSession()
      return
    }

    // Flujo APK: Chrome en Android recibió el callback, hay que volver a la app
    if (!c) {
      navigate('/auth', { replace: true })
      return
    }

    setCode(c)

    // Intentar redirect automático con intent URL.
    // Chrome requiere user gesture para custom schemes pero a veces permite intent://.
    tryOpenApp(c)

    // Si después de 2.5s seguimos aquí, mostrar el botón "Abrir en la app"
    // para que el usuario lo toque — el gesto de tap sí dispara el intent en Chrome.
    const timer = setTimeout(() => setShowButton(true), 2500)
    return () => clearTimeout(timer)
  }, [navigate])

  function tryOpenApp(_c: string) {
    const params = new URLSearchParams(window.location.search)
    const fallback = encodeURIComponent('https://penca2026uy.vercel.app/auth')
    window.location.href =
      `intent://login-callback?${params.toString()}` +
      `#Intent;scheme=com.pencales.app;package=com.pencales.app;` +
      `S.browser_fallback_url=${fallback};end`
  }

  async function handleOpenInApp() {
    if (code) tryOpenApp(code)
  }

  async function handleContinueOnWeb() {
    if (!code) { navigate('/auth', { replace: true }); return }
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    navigate(error ? '/auth' : '/', { replace: true })
  }

  if (!showButton) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 size={32} className="animate-spin text-primary" />
          <p className="text-text-secondary text-sm">Autenticando…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-4 text-center">
        <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
          <Smartphone className="text-primary" size={28} />
        </div>
        <div>
          <h2 className="text-text-primary font-bold text-lg">Login exitoso</h2>
          <p className="text-text-secondary text-sm mt-1">
            Tocá el botón para volver a la app
          </p>
        </div>
        <button onClick={handleOpenInApp} className="btn-primary w-full py-3">
          Abrir en PencaLes 2026
        </button>
        <button
          onClick={handleContinueOnWeb}
          className="w-full text-sm text-text-muted hover:text-text-secondary transition-colors py-2"
        >
          Continuar en el navegador
        </button>
      </div>
    </div>
  )
}
