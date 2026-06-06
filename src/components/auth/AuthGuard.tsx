import { Navigate } from 'react-router-dom'
import { Clock, Trophy } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'

/** Bloquea acceso si no está logueado */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return null
  if (!user) return <Navigate to="/auth" replace />
  return <>{children}</>
}

/** Bloquea acceso si la cuenta fue desactivada por un administrador */
export function RequireActive({ children }: { children: React.ReactNode }) {
  const { user, profile, loading, signOut } = useAuth()
  if (loading) return null
  if (!user) return <Navigate to="/auth" replace />

  if (!profile?.is_active) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-6">
        <div className="w-16 h-16 rounded-full bg-accent/10 flex items-center justify-center mb-5">
          <Clock className="text-accent" size={32} />
        </div>
        <h1 className="text-xl font-bold text-text-primary mb-2">
          Cuenta desactivada
        </h1>
        <p className="text-text-secondary text-sm max-w-xs mb-6">
          Tu cuenta fue desactivada por el administrador. Escribinos si creés que es un error.
        </p>
        <button onClick={signOut} className="btn-secondary text-sm">
          Cerrar sesión
        </button>
      </div>
    )
  }

  return <>{children}</>
}

/** Bloquea acceso si no es admin */
export function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { user, isAdmin, loading } = useAuth()
  if (loading) return null
  if (!user) return <Navigate to="/auth" replace />
  if (!isAdmin) return <Navigate to="/" replace />
  return <>{children}</>
}

/** Permite acceso a admin O cargador (solo pantalla de resultados) */
export function RequireLoader({ children }: { children: React.ReactNode }) {
  const { user, isAdmin, isLoader, loading } = useAuth()
  if (loading) return null
  if (!user) return <Navigate to="/auth" replace />
  if (!isAdmin && !isLoader) return <Navigate to="/" replace />
  return <>{children}</>
}

/** Pantalla de bienvenida para el Trophy cup */
export function WelcomeBanner() {
  return (
    <div className="card p-6 text-center mb-6">
      <Trophy className="mx-auto text-accent mb-3" size={40} />
      <h2 className="text-lg font-bold text-text-primary mb-1">Penca Mundial 2026</h2>
      <p className="text-text-secondary text-sm">
        Ingresá para guardar tus predicciones y competir en el ranking.
      </p>
    </div>
  )
}
