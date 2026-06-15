import { useEffect, useRef, useState } from 'react'
import { Menu, X, ShieldCheck, QrCode, Smartphone } from 'lucide-react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { useTenCompState } from '../../contexts/TenCompContext'
import { visibleMenuItems } from '../tencomp/menu'
import { CompetitionSwitcher } from './CompetitionSwitcher'

export function Header() {
  const { user, profile, signOut, isAdmin, isLoader, isSuperAdmin } = useAuth()
  const { data } = useTenCompState()
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const location = useLocation()

  // Cerrar menús al cambiar de ruta
  useEffect(() => {
    setUserMenuOpen(false)
    setMobileMenuOpen(false)
  }, [location.pathname])

  // Cerrar user-menu al click fuera
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const initials = profile
    ? (profile.display_name || profile.username)[0].toUpperCase()
    : 'U'

  // Menú dinámico de la competencia activa.
  const base = data ? `/p/${data.tenComp.slug}` : null
  const menuItems = data ? visibleMenuItems(data.tenComp.menu_config, !!user) : []

  return (
    <>
      <header className="sticky top-0 z-40 bg-background/95 backdrop-blur border-b border-border">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between gap-3">
          {/* Switcher de competencia */}
          <CompetitionSwitcher />

          {/* Desktop nav — dinámica según la penca activa */}
          <nav className="hidden md:flex items-center gap-1 flex-1 justify-center overflow-x-auto">
            {base &&
              menuItems.map(item => (
                <DeskNavLink key={item.key} to={`${base}/${item.path}`}>
                  {item.label}
                </DeskNavLink>
              ))}
            {base && data?.isTenCompAdmin && (
              <DeskNavLink to={`${base}/admin`}>
                <ShieldCheck size={14} className="inline mr-1 text-accent" />Admin
              </DeskNavLink>
            )}
          </nav>

          {/* Derecha: usuario o botón ingresar */}
          <div className="flex items-center gap-2">
            {user ? (
              <div className="relative" ref={menuRef}>
                <button
                  onClick={() => setUserMenuOpen(o => !o)}
                  className="flex items-center gap-2 btn-ghost py-1 px-2"
                >
                  {profile?.avatar_url ? (
                    <img src={profile.avatar_url} alt="" className="w-7 h-7 rounded-full object-cover" />
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center text-primary text-xs font-bold">
                      {initials}
                    </div>
                  )}
                  <span className="hidden sm:block text-sm">{profile?.display_name || profile?.username}</span>
                </button>

                {userMenuOpen && (
                  <div className="absolute right-0 top-full mt-1 w-48 card py-1 shadow-2xl z-50">
                    <div className="px-4 py-2 border-b border-border">
                      <p className="text-xs font-medium text-text-primary truncate">{profile?.display_name}</p>
                      <p className="text-[11px] text-text-muted truncate">@{profile?.username}</p>
                    </div>
                    <Link to="/perfil" className="block px-4 py-2 text-sm text-text-secondary hover:text-text-primary hover:bg-surface-2 transition-colors">
                      Mi perfil
                    </Link>
                    <Link to="/descargar" className="block px-4 py-2 text-sm text-text-secondary hover:text-text-primary hover:bg-surface-2 transition-colors flex items-center gap-2">
                      <QrCode size={14} /> Descargar app
                    </Link>
                    <Link to="/pencas" className="block px-4 py-2 text-sm text-text-secondary hover:text-text-primary hover:bg-surface-2 transition-colors">
                      Mis pencas
                    </Link>
                    {(isSuperAdmin || isAdmin || isLoader) && (
                      <Link to="/admin" className="block px-4 py-2 text-sm text-accent hover:bg-surface-2 transition-colors flex items-center gap-2">
                        <ShieldCheck size={14} /> Administración
                      </Link>
                    )}
                    <button
                      onClick={signOut}
                      className="w-full text-left px-4 py-2 text-sm text-error hover:bg-surface-2 transition-colors"
                    >
                      Cerrar sesión
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Link
                  to="/descargar"
                  title="Descargar App Android"
                  className="p-2 text-text-muted hover:text-primary transition-colors flex items-center justify-center"
                >
                  <Smartphone size={20} />
                </Link>
                <Link to="/auth" className="btn-primary text-sm py-1.5 px-3">
                  Ingresar
                </Link>
              </div>
            )}

            {/* Mobile hamburger */}
            <button
              className="md:hidden btn-ghost p-1.5"
              onClick={() => setMobileMenuOpen(o => !o)}
            >
              {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile menu panel — dinámico */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-x-0 top-14 z-30 bg-surface border-b border-border shadow-xl">
          <nav className="flex flex-col py-2">
            {base &&
              menuItems.map(item => (
                <MobileNavLink key={item.key} to={`${base}/${item.path}`}>
                  {item.label}
                </MobileNavLink>
              ))}
            {base && data?.isTenCompAdmin && (
              <MobileNavLink to={`${base}/admin`}>Admin de la penca</MobileNavLink>
            )}
            <MobileNavLink to="/pencas">Mis pencas</MobileNavLink>
            {user && <MobileNavLink to="/perfil">Mi perfil</MobileNavLink>}
            {user && <MobileNavLink to="/descargar">Descargar app</MobileNavLink>}
            {!user && <MobileNavLink to="/auth">Ingresar</MobileNavLink>}
          </nav>
        </div>
      )}
    </>
  )
}

function DeskNavLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `px-3 py-1.5 text-sm rounded-lg transition-colors whitespace-nowrap ${
          isActive ? 'text-text-primary bg-surface-2' : 'text-text-secondary hover:text-text-primary hover:bg-surface-2'
        }`
      }
    >
      {children}
    </NavLink>
  )
}

function MobileNavLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <NavLink
      to={to}
      end
      className={({ isActive }) =>
        `px-5 py-3 text-sm transition-colors ${
          isActive ? 'text-primary bg-primary/5 font-medium' : 'text-text-secondary hover:text-text-primary hover:bg-surface-2'
        }`
      }
    >
      {children}
    </NavLink>
  )
}
