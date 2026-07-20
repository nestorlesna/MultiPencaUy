/**
 * Avatares por defecto: SVG servidos desde `public/avatars/`.
 * La ruta se guarda tal cual en `profiles.avatar_url`, igual que la URL de una
 * foto subida a Storage — el resto de la app no distingue entre ambos casos.
 */

export interface PresetAvatar {
  id: string
  url: string
  label: string
  group: string
}

const AVATAR_GROUPS = [
  {
    group: 'Banderas',
    items: [
      ['01', 'Uruguay'],
      ['02', 'Argentina'],
      ['03', 'Brasil'],
      ['04', 'Ecuador'],
      ['05', 'Noruega'],
      ['06', 'España'],
    ],
  },
  {
    group: 'Escudos',
    items: [
      ['07', 'Tricolor'],
      ['08', 'Celeste con estrella'],
      ['09', 'Amarillo y negro'],
      ['10', 'Rojo y negro'],
      ['21', 'Violeta y blanco'],
      ['22', 'Negro y blanco'],
      ['23', 'Banda negra'],
      ['24', 'Banda roja'],
      ['25', 'Celeste y blanco'],
      ['26', 'Verde y blanco'],
      ['27', 'Rojo y verde'],
      ['28', 'Azul y negro'],
      ['29', 'Celeste'],
      ['30', 'Verde y negro'],
      ['31', 'Azul y blanco'],
      ['32', 'Azul y amarillo'],
      ['33', 'Bordó y blanco'],
      ['34', 'Rojo y blanco'],
    ],
  },
  {
    group: 'Fútbol',
    items: [
      ['11', 'Pelota'],
      ['12', 'Arco'],
      ['13', 'Botín'],
      ['14', 'Silbato'],
      ['15', 'Trofeo'],
      ['16', 'Camiseta 10'],
    ],
  },
  {
    group: 'Caras',
    items: [
      ['17', 'Bigote'],
      ['18', 'Gorro'],
      ['19', 'Corbata'],
      ['20', 'Gorra y lentes'],
    ],
  },
] as const

export const PRESET_AVATAR_GROUPS: { group: string; avatars: PresetAvatar[] }[] =
  AVATAR_GROUPS.map(({ group, items }) => ({
    group,
    avatars: items.map(([id, label]) => ({
      id,
      label,
      group,
      url: `/avatars/${id}.svg`,
    })),
  }))

export const PRESET_AVATARS: PresetAvatar[] = PRESET_AVATAR_GROUPS.flatMap(g => g.avatars)

export function isPresetAvatar(url: string | null): boolean {
  return !!url && url.startsWith('/avatars/')
}

/**
 * Pool para los usuarios que todavía no eligieron avatar. Excluye las banderas
 * de países: repartir nacionalidades sin que la persona las haya pedido queda
 * raro. Escudos, fútbol y caras son neutrales.
 */
const FALLBACK_POOL = PRESET_AVATARS.filter(a => a.group !== 'Banderas').map(a => a.url)

/** FNV-1a — hash estable entre sesiones, plataformas y recargas. */
function hash(seed: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/**
 * Avatar asignado a quien no eligió uno. Se deriva del `user_id`, así al mismo
 * usuario le toca siempre el mismo en todas las pantallas (y en todos los
 * dispositivos) en vez de cambiar en cada render.
 */
export function defaultAvatarUrl(seed: string): string {
  return FALLBACK_POOL[hash(seed) % FALLBACK_POOL.length]
}

/** El avatar a mostrar: el elegido, o el que le toca por defecto. */
export function resolveAvatarUrl(avatarUrl: string | null | undefined, seed: string): string {
  return avatarUrl || defaultAvatarUrl(seed)
}
