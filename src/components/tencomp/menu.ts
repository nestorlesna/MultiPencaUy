import type { MenuConfig } from '../../types/tenant'

// Ítems del menú de un Ten-Comp. `key` matchea con menu_config (ausente o true = visible).
// `authRequired` marca los puntos que solo tienen sentido logueado (Jugar, +Puntos,
// Subgrupos): se ocultan al usuario anónimo aunque la penca sea pública.
export interface TenCompMenuItem {
  key: keyof MenuConfig
  path: string
  label: string
  authRequired?: boolean
}

export const TEN_COMP_MENU: TenCompMenuItem[] = [
  { key: 'fixture',          path: 'fixture',          label: 'Fixture' },
  { key: 'grupos',           path: 'grupos',           label: 'Grupos' },
  { key: 'cuadro',           path: 'cuadro',           label: 'Cuadro' },
  { key: 'ranking',          path: 'ranking',          label: 'Ranking' },
  { key: 'mis_predicciones', path: 'mis-predicciones', label: 'Jugar',     authRequired: true },
  { key: 'mas_puntos',       path: 'mas-puntos',       label: '+ Puntos',  authRequired: true },
  { key: 'subgrupos',        path: 'subgrupos',        label: 'Subgrupos', authRequired: true },
  { key: 'ayuda',            path: 'ayuda',            label: 'Ayuda' },
]

// Ítems visibles para un Ten-Comp dado, según su menu_config y si hay sesión.
export function visibleMenuItems(menu: MenuConfig, isLoggedIn: boolean): TenCompMenuItem[] {
  return TEN_COMP_MENU.filter(
    item => menu[item.key] !== false && (isLoggedIn || !item.authRequired)
  )
}
