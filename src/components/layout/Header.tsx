import { useEffect, useRef, useState } from 'react'
import { Trophy, Menu, X, ShieldCheck, HelpCircle, QrCode, Smartphone, Wifi } from 'lucide-react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'

export function Header() {
  const { user, profile, signOut, isAdmin, isLoader, isSuperAdmin } = useAuth()
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

  return (
    <>
      <header className="sticky top-0 z-40 bg-background/95 backdrop-blur border-b border-border">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          {/* Logo */}
          <Link to="/fixture" className="flex items-center gap-2 font-bold text-text-primary">
            <Trophy className="text-accent" size={20} />
            <span className="text-sm font-semibold hidden xs:block">PencaLes 2026</span>
            <span className="text-sm font-semibold xs:hidden">PencaLes 2026</span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-1">
            <DeskNavLink to="/fixture">Fixture</DeskNavLink>
            <DeskNavLink to="/grupos">Grupos</DeskNavLink>
            <DeskNavLink to="/ranking">Ranking</DeskNavLink>
            {user && <DeskNavLink to="/subgrupos">Subgrupos</DeskNavLink>}
            <DeskNavLink to="/cuadro">Cuadro</DeskNavLink>
            {user && <DeskNavLink to="/mis-predicciones">JUGAR</DeskNavLink>}
            {user && <DeskNavLink to="/mas-puntos">+ Puntos</DeskNavLink>}
            <DeskNavLink to="/api-info">
              <Wifi size={14} className="inline mr-1" />API
            </DeskNavLink>
            <DeskNavLink to="/ayuda">
              <HelpCircle size={14} className="inline mr-1" />Ayuda
            </DeskNavLink>
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
                    {isSuperAdmin && (
                      <>
                        <div className="px-4 pt-2 pb-1">
                          <p className="text-[10px] text-text-muted uppercase tracking-wider flex items-center gap-1">
                            <ShieldCheck size={11} />Plataforma
                          </p>
                        </div>
                        <Link to="/admin/tenants" className="block px-4 py-1.5 text-sm text-accent hover:bg-surface-2 transition-colors">Empresas (tenants)</Link>
                        <Link to="/admin/resultados-v2" className="block px-4 py-1.5 text-sm text-accent hover:bg-surface-2 transition-colors">Cargar resultados</Link>
                      </>
                    )}
                    {isAdmin && (
                      <>
                        <div className="px-4 pt-2 pb-1">
                          <p className="text-[10px] text-text-muted uppercase tracking-wider flex items-center gap-1">
                            <ShieldCheck size={11} />Admin
                          </p>
                        </div>
                        <Link to="/admin/usuarios" className="block px-4 py-1.5 text-sm text-accent hover:bg-surface-2 transition-colors">Usuarios</Link>
                        <Link to="/admin/resultados" className="block px-4 py-1.5 text-sm text-accent hover:bg-surface-2 transition-colors">Resultados</Link>
                        <Link to="/admin/partidos" className="block px-4 py-1.5 text-sm text-accent hover:bg-surface-2 transition-colors">Partidos</Link>
                        <Link to="/admin/equipos" className="block px-4 py-1.5 text-sm text-accent hover:bg-surface-2 transition-colors">Equipos</Link>
                        <Link to="/admin/terceros" className="block px-4 py-1.5 text-sm text-accent hover:bg-surface-2 transition-colors">Terceros</Link>
                        <Link to="/admin/posiciones-grupos" className="block px-4 py-1.5 text-sm text-accent hover:bg-surface-2 transition-colors">Posiciones grupos</Link>
                        <Link to="/admin/combinaciones" className="block px-4 py-1.5 text-sm text-accent hover:bg-surface-2 transition-colors">Combinaciones 16avos</Link>
                        <Link to="/admin/correos" className="block px-4 py-1.5 text-sm text-accent hover:bg-surface-2 transition-colors">Correos</Link>
                        <Link to="/admin/resultauto" className="block px-4 py-1.5 text-sm text-accent hover:bg-surface-2 transition-colors">Resultados Auto</Link>
                        <Link to="/admin/auditoria" className="block px-4 py-1.5 text-sm text-accent hover:bg-surface-2 transition-colors">Auditoría</Link>
                            <Link to="/admin/config" className="block px-4 py-1.5 text-sm text-accent hover:bg-surface-2 transition-colors">Configuración</Link>
                      </>
                    )}
                    {!isAdmin && isLoader && (
                      <>
                        <div className="px-4 pt-2 pb-1">
                          <p className="text-[10px] text-text-muted uppercase tracking-wider flex items-center gap-1">
                            <ShieldCheck size={11} />Cargador
                          </p>
                        </div>
                        <Link to="/admin/resultados" className="block px-4 py-1.5 text-sm text-accent hover:bg-surface-2 transition-colors">Resultados</Link>
                      </>
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

      {/* Mobile menu panel */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-x-0 top-14 z-30 bg-surface border-b border-border shadow-xl">
          <nav className="flex flex-col py-2">
            <MobileNavLink to="/fixture">Fixture</MobileNavLink>
            <MobileNavLink to="/grupos">Grupos</MobileNavLink>
            <MobileNavLink to="/ranking">Ranking</MobileNavLink>
            {user && <MobileNavLink to="/subgrupos">Subgrupos</MobileNavLink>}
            <MobileNavLink to="/cuadro">Cuadro</MobileNavLink>
            {user && <MobileNavLink to="/mis-predicciones">JUGAR</MobileNavLink>}
            {user && <MobileNavLink to="/mas-puntos">+ Puntos</MobileNavLink>}
            {user && <MobileNavLink to="/perfil">Mi perfil</MobileNavLink>}
{user && <MobileNavLink to="/descargar">Descargar app</MobileNavLink>}
            <MobileNavLink to="/api-info">API · Tiempo real</MobileNavLink>
            <MobileNavLink to="/ayuda">Ayuda · Puntaje</MobileNavLink>
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
        `px-3 py-1.5 text-sm rounded-lg transition-colors ${
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
