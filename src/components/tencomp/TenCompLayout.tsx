import { Outlet, NavLink, Link, useParams } from 'react-router-dom'
import { Loader2, ArrowLeft, ShieldCheck } from 'lucide-react'
import { TenCompProvider, useTenCompState } from '../../contexts/TenCompContext'
import { MembershipBanner } from './MembershipBanner'
import type { MenuConfig } from '../../types/tenant'

// Ítems del menú scoped a la penca. `key` matchea con menu_config.
const MENU: { key: keyof MenuConfig; path: string; label: string }[] = [
  { key: 'fixture',          path: 'fixture',          label: 'Fixture' },
  { key: 'grupos',           path: 'grupos',           label: 'Grupos' },
  { key: 'cuadro',           path: 'cuadro',           label: 'Cuadro' },
  { key: 'ranking',          path: 'ranking',          label: 'Ranking' },
  { key: 'mis_predicciones', path: 'mis-predicciones', label: 'Jugar' },
  { key: 'mas_puntos',       path: 'mas-puntos',       label: '+ Puntos' },
  { key: 'subgrupos',        path: 'subgrupos',        label: 'Subgrupos' },
  { key: 'ayuda',            path: 'ayuda',            label: 'Ayuda' },
]

// Layout del subárbol /p/:slug/*: provee el contexto y dibuja la navegación
// dinámica según menu_config del Ten-Comp.
export function TenCompLayout() {
  const { slug = '' } = useParams()
  return (
    <TenCompProvider slug={slug}>
      <TenCompShell />
    </TenCompProvider>
  )
}

function TenCompShell() {
  const { data, isLoading, notFound } = useTenCompState()

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="animate-spin text-primary" size={28} />
      </div>
    )
  }

  if (notFound || !data) {
    return (
      <div className="card p-8 text-center">
        <p className="text-text-muted text-sm mb-4">No encontramos esta penca o no tenés acceso.</p>
        <Link to="/pencas" className="btn-primary text-sm inline-flex items-center gap-1.5">
          <ArrowLeft size={14} /> Volver a mis pencas
        </Link>
      </div>
    )
  }

  const { tenComp, competition, memberStatus, isTenCompAdmin } = data
  const menu = tenComp.menu_config ?? {}
  const visibleItems = MENU.filter(item => menu[item.key] !== false)
  const base = `/p/${tenComp.slug}`

  return (
    <div>
      {/* Cabecera de la penca */}
      <div className="mb-4">
        <Link to="/pencas" className="text-xs text-text-muted hover:text-text-secondary inline-flex items-center gap-1 mb-2">
          <ArrowLeft size={12} /> Mis pencas
        </Link>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-text-primary truncate">{tenComp.name}</h1>
            <p className="text-xs text-text-muted truncate">{competition.name}</p>
          </div>
          {isTenCompAdmin && (
            <NavLink
              to={`${base}/admin`}
              className="btn-ghost text-xs px-2.5 py-1.5 inline-flex items-center gap-1.5 text-accent"
            >
              <ShieldCheck size={14} /> Admin
            </NavLink>
          )}
        </div>
      </div>

      {/* Navegación scoped */}
      <nav className="flex gap-1 overflow-x-auto pb-2 mb-4 border-b border-border">
        {visibleItems.map(item => (
          <NavLink
            key={item.key}
            to={`${base}/${item.path}`}
            className={({ isActive }) =>
              `px-3 py-1.5 text-sm rounded-lg whitespace-nowrap transition-colors ${
                isActive
                  ? 'text-text-primary bg-surface-2'
                  : 'text-text-secondary hover:text-text-primary hover:bg-surface-2'
              }`
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>

      <MembershipBanner memberStatus={memberStatus} visibility={tenComp.visibility} />

      <Outlet />
    </div>
  )
}
