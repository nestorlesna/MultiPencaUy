import { resolveAvatarUrl } from '../../utils/avatars'

interface UserAvatarProps {
  /** El avatar elegido. Si es null se muestra el que le toca por `seed`. */
  avatarUrl: string | null | undefined
  /** Identidad estable del usuario — su `user_id`. Ver `defaultAvatarUrl`. */
  seed: string
  name?: string
  /** Tamaño y ajustes de layout: `w-9 h-9`, `flex-shrink-0`, etc. */
  className?: string
}

export function UserAvatar({ avatarUrl, seed, name, className = 'w-9 h-9' }: UserAvatarProps) {
  return (
    <img
      src={resolveAvatarUrl(avatarUrl, seed)}
      alt={name ?? ''}
      loading="lazy"
      className={`rounded-full object-cover ${className}`}
    />
  )
}
