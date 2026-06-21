import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Clock, Lock, EyeOff, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '../../hooks/useAuth'
import { joinPublicTenComp } from '../../services/tenCompService'
import type { CompetitionStatus, MemberStatus, TenCompVisibility } from '../../types/tenant'

// Avisa el estado de participación del usuario en la penca activa.
// - pending: puede predecir, pero no aparece en el ranking hasta ser aprobado.
// - no miembro en penca pública: "NO ASOCIADO" — está en modo visualización y
//   puede unirse al instante (o ingresar si es anónimo). Solo si la competencia
//   está "active": el resto (borrador/finalizada/archivada) no admite inscripción.
// - no miembro en penca privada: necesita el código de acceso.
export function MembershipBanner({
  tenCompId,
  memberStatus,
  visibility,
  competitionStatus,
}: {
  tenCompId: string
  memberStatus: MemberStatus | null
  visibility: TenCompVisibility
  competitionStatus: CompetitionStatus
}) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const qc = useQueryClient()

  const joinMut = useMutation({
    mutationFn: () => joinPublicTenComp(tenCompId),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['my_ten_comps'] })
      qc.invalidateQueries({ queryKey: ['ten_comp'] })
      toast.success('¡Te uniste a la penca!')
      navigate(`/p/${res.slug}`)
    },
    onError: (e: any) => toast.error(e.message || 'No se pudo unir a la penca'),
  })

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

  // No miembro de una penca pública → modo visualización, puede unirse.
  // Solo si la competencia está activa; si no, no se ofrece inscripción.
  if (memberStatus === null && visibility === 'public' && competitionStatus === 'active') {
    return (
      <div className="card border-accent/40 bg-accent/5 p-3 mb-4 flex items-center gap-2.5 flex-wrap">
        <span className="badge bg-accent/20 text-accent text-[10px] inline-flex items-center gap-1 flex-shrink-0">
          <EyeOff size={11} /> NO ASOCIADO
        </span>
        <p className="text-xs text-text-secondary min-w-0 flex-1">
          Estás viendo esta penca en modo visualización. Para hacer pronósticos
          tenés que unirte.
        </p>
        {user ? (
          <button
            onClick={() => joinMut.mutate()}
            disabled={joinMut.isPending}
            className="btn-primary text-xs px-3 py-1.5 flex-shrink-0 inline-flex items-center gap-1"
          >
            {joinMut.isPending ? <Loader2 size={14} className="animate-spin" /> : 'Unirme'}
          </button>
        ) : (
          <button
            onClick={() => navigate('/auth')}
            className="btn-primary text-xs px-3 py-1.5 flex-shrink-0"
          >
            Ingresar
          </button>
        )}
      </div>
    )
  }

  if (memberStatus === null && visibility === 'private') {
    return (
      <div className="card border-error/40 bg-error/5 p-3 mb-4 flex items-start gap-2.5">
        <Lock size={16} className="text-error flex-shrink-0 mt-0.5" />
        <div className="text-xs text-text-secondary">
          <span className="font-medium text-text-primary">No estás asociado.</span>{' '}
          Esta penca es privada: necesitás el código de acceso para unirte y poder pronosticar.
        </div>
      </div>
    )
  }

  return null
}
