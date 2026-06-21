import type { MenuConfig } from '../../types/tenant'

// Ítems del menú de un Ten-Comp. `key` matchea con menu_config (ausente o true = visible).
// `memberOnly` marca los puntos de participación (Jugar, +Puntos, Subgrupos): solo se
// muestran a quien es miembro de la penca. Un anónimo o un logueado que NO se unió a
// esta penca ve únicamente los ítems de consulta (Fixture, Ranking, etc.).
export interface TenCompMenuItem {
  key: keyof MenuConfig
  path: string
  label: string
  memberOnly?: boolean
  // optIn: solo visible si menu_config[key] === true (no por defecto). Para ítems que
  // solo aplican a ciertos formatos (ej. Posiciones en ligas todos-contra-todos).
  optIn?: boolean
}

export const TEN_COMP_MENU: TenCompMenuItem[] = [
  { key: 'fixture',          path: 'fixture',          label: 'Fixture' },
  { key: 'grupos',           path: 'grupos',           label: 'Grupos' },
  { key: 'cuadro',           path: 'cuadro',           label: 'Cuadro' },
  { key: 'posiciones',       path: 'posiciones',       label: 'Posiciones', optIn: true },
  { key: 'ranking',          path: 'ranking',          label: 'Ranking' },
  { key: 'mis_predicciones', path: 'mis-predicciones', label: 'Jugar',     memberOnly: true },
  { key: 'mas_puntos',       path: 'mas-puntos',       label: '+ Puntos',  memberOnly: true },
  { key: 'subgrupos',        path: 'subgrupos',        label: 'Subgrupos', memberOnly: true },
  { key: 'ayuda',            path: 'ayuda',            label: 'Ayuda' },
]

// Ítems visibles para un Ten-Comp dado, según su menu_config y la membresía.
// Convención: ausente o true = visible; false = oculto. Los ítems optIn requieren true
// explícito. Los memberOnly (participación) solo se muestran si el usuario es miembro
// (pending/approved) de la penca; así el menú refleja la penca activa del combo.
export function visibleMenuItems(menu: MenuConfig, isMember: boolean): TenCompMenuItem[] {
  return TEN_COMP_MENU.filter(item => {
    const enabled = item.optIn ? menu[item.key] === true : menu[item.key] !== false
    return enabled && (isMember || !item.memberOnly)
  })
}
