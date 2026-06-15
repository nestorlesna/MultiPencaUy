import { NavLink } from 'react-router-dom'
import { Calendar, HelpCircle, LayoutGrid, Trophy, Star, User, Users, Grid3x3, Award } from 'lucide-react'
import { Capacitor } from '@capacitor/core'
import { useAuth } from '../../hooks/useAuth'
import { useTenCompState } from '../../contexts/TenCompContext'
import { visibleMenuItems } from '../tencomp/menu'
import type { MenuConfig } from '../../types/tenant'

const isNative = Capacitor.isNativePlatform()

// Iconos e items prioritarios para la barra inferior (espacio limitado).
const ICONS: Partial<Record<keyof MenuConfig, typeof Calendar>> = {
  fixture: Calendar,
  grupos: LayoutGrid,
  ranking: Trophy,
  mis_predicciones: Star,
  cuadro: Grid3x3,
  mas_puntos: Award,
  subgrupos: Users,
  ayuda: HelpCircle,
}
// Orden de prioridad en mobile (se recortan a 4 según la penca).
const PRIORITY: (keyof MenuConfig)[] = [
  'fixture', 'grupos', 'ranking', 'mis_predicciones', 'cuadro', 'mas_puntos', 'subgrupos', 'ayuda',
]

export function BottomNav() {
  const { user } = useAuth()
  const { data } = useTenCompState()

  const base = data ? `/p/${data.tenComp.slug}` : null
  const visible = data ? visibleMenuItems(data.tenComp.menu_config, !!user) : []
  const byKey = new Map(visible.map(i => [i.key, i]))
  const items = PRIORITY.filter(k => byKey.has(k))
    .slice(0, 4)
    .map(k => {
      const def = byKey.get(k)!
      return { to: `${base}/${def.path}`, icon: ICONS[k] ?? Calendar, label: def.label }
    })

  // Item de perfil/ayuda al final, según plataforma.
  const tail = isNative
    ? null
    : user
      ? { to: '/perfil', icon: User, label: 'Perfil' }
      : null

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-surface border-t border-border">
      <div className="flex items-stretch">
        {items.map(({ to, icon: Icon, label }) => (
          <BottomLink key={to} to={to} icon={Icon} label={label} />
        ))}
        {tail && <BottomLink to={tail.to} icon={tail.icon} label={tail.label} />}
        {!user && <BottomLink to="/auth" icon={User} label="Ingresar" />}
      </div>
    </nav>
  )
}

function BottomLink({ to, icon: Icon, label }: { to: string; icon: typeof Calendar; label: string }) {
  return (
    <NavLink
      to={to}
      end
      className={({ isActive }) =>
        `flex-1 flex flex-col items-center justify-center py-2 gap-0.5 text-[10px] transition-colors ${
          isActive ? 'text-primary' : 'text-text-muted hover:text-text-secondary'
        }`
      }
    >
      <Icon size={20} />
      <span>{label}</span>
    </NavLink>
  )
}
