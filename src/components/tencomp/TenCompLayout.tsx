import { Outlet, Link } from 'react-router-dom'
import { Loader2, ArrowLeft } from 'lucide-react'
import { useTenCompState } from '../../contexts/TenCompContext'
import { MembershipBanner } from './MembershipBanner'

// Layout del subárbol /p/:slug/*. El contexto del Ten-Comp activo lo provee
// ActiveTenCompProvider (a nivel Layout); aquí solo se manejan los estados de
// carga / no encontrada y se muestra el banner de membresía.
export function TenCompLayout() {
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

  return (
    <div>
      <MembershipBanner
        tenCompId={data.tenComp.id}
        memberStatus={data.memberStatus}
        visibility={data.tenComp.visibility}
        competitionStatus={data.competition.status}
      />
      <Outlet />
    </div>
  )
}
