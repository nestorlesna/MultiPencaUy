import { Outlet } from 'react-router-dom'
import { ActiveTenCompProvider } from '../../contexts/TenCompContext'
import { useAuth } from '../../hooks/useAuth'
import { ForcePasswordChange } from '../auth/ForcePasswordChange'
import { BottomNav } from './BottomNav'
import { Header } from './Header'
import { Footer } from './Footer'

export function Layout() {
  const { user, profile, loading } = useAuth()

  // Gate: si un admin reseteó la pass, el usuario debe crear una nueva antes de
  // poder usar la app (cualquier ruta).
  if (!loading && user && profile?.must_change_password) {
    return <ForcePasswordChange userId={user.id} />
  }

  return (
    <ActiveTenCompProvider>
      <div className="min-h-screen bg-background text-text-primary flex flex-col">
        <Header />
        <main className="flex-1 pb-20 md:pb-0">
          <div className="max-w-5xl mx-auto px-4 py-4">
            <Outlet />
          </div>
        </main>
        <BottomNav />
        <Footer />
      </div>
    </ActiveTenCompProvider>
  )
}
