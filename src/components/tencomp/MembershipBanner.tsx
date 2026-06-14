import { Clock, Lock } from 'lucide-react'
import type { MemberStatus, TenCompVisibility } from '../../types/tenant'

// Avisa el estado de participación del usuario en la penca activa.
// - pending: puede predecir, pero no aparece en el ranking hasta ser aprobado.
// - no miembro en penca privada: no debería llegar acá (RLS), mensaje defensivo.
export function MembershipBanner({
  memberStatus,
  visibility,
}: {
  memberStatus: MemberStatus | null
  visibility: TenCompVisibility
}) {
  if (memberStatus === 'approved') return null

  if (memberStatus === 'pending') {
    return (
      <div className="card border-accent/40 bg-accent/5 p-3 mb-4 flex items-start gap-2.5">
        <Clock size={16} className="text-accent flex-shrink-0 mt-0.5" />
        <div className="text-xs text-text-secondary">
          <span className="font-medium text-text-primary">Pendiente de aprobación.</span>{' '}
          Ya podés cargar tus predicciones; vas a aparecer en el ranking una vez que el
          administrador apruebe tu ingreso.
        </div>
      </div>
    )
  }

  if (memberStatus === null && visibility === 'private') {
    return (
      <div className="card border-error/40 bg-error/5 p-3 mb-4 flex items-start gap-2.5">
        <Lock size={16} className="text-error flex-shrink-0 mt-0.5" />
        <div className="text-xs text-text-secondary">
          Esta penca es privada. Necesitás el código de acceso para unirte.
        </div>
      </div>
    )
  }

  return null
}
