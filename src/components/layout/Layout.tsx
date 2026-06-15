import { Outlet } from 'react-router-dom'
import { ActiveTenCompProvider } from '../../contexts/TenCompContext'
import { BottomNav } from './BottomNav'
import { Header } from './Header'
import { Footer } from './Footer'

export function Layout() {
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
