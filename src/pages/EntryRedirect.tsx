import { useQuery } from '@tanstack/react-query'
import { Navigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { resolveEntryTenCompSlug } from '../services/tenCompService'
import { readLastTenCompSlug } from '../contexts/TenCompContext'

// Punto de entrada ("/"): elige la competencia activa según la regla de
// precedencia y redirige directo a su Fixture. Si no hay candidato, va al hub
// /pencas.
export function EntryRedirect() {
  const { user, loading: authLoading } = useAuth()

  const { data, isLoading, isError } = useQuery({
    queryKey: ['entry_ten_comp', user?.id ?? null],
    queryFn: () => resolveEntryTenCompSlug(user?.id ?? null, readLastTenCompSlug()),
    enabled: !authLoading,
  })

  if (authLoading || isLoading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="animate-spin text-primary" size={28} />
      </div>
    )
  }

  if (!isError && data) return <Navigate to={`/p/${data}/fixture`} replace />

  return <Navigate to="/pencas" replace />
}
