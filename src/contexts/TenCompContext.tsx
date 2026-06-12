import { createContext, useContext } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../hooks/useAuth'
import { resolveTenCompBySlug } from '../services/tenCompService'
import type { TenCompContextData } from '../types/tenant'

interface TenCompState {
  data: TenCompContextData | null
  isLoading: boolean
  notFound: boolean
  refetch: () => void
}

const TenCompCtx = createContext<TenCompState | undefined>(undefined)

// Provee el Ten-Comp activo resuelto por slug a todo el subárbol /p/:slug/*.
export function TenCompProvider({ slug, children }: { slug: string; children: React.ReactNode }) {
  const { user, tenantRoles, isSuperAdmin } = useAuth()

  const query = useQuery({
    queryKey: ['ten_comp', slug, user?.id ?? null],
    queryFn: () => resolveTenCompBySlug(slug, user?.id ?? null),
  })

  const resolved = query.data ?? null
  const isTenCompAdmin = resolved
    ? isSuperAdmin || tenantRoles.some(r => r.tenant_id === resolved.tenant.id && r.role === 'admin')
    : false

  const data: TenCompContextData | null = resolved
    ? {
        tenComp: resolved.tenComp,
        tenant: resolved.tenant,
        competition: resolved.competition,
        scoring: resolved.scoring,
        memberStatus: resolved.memberStatus,
        isTenCompAdmin,
      }
    : null

  const value: TenCompState = {
    data,
    isLoading: query.isLoading,
    notFound: !query.isLoading && !query.isError && resolved === null,
    refetch: query.refetch,
  }

  return <TenCompCtx.Provider value={value}>{children}</TenCompCtx.Provider>
}

// Estado completo del Ten-Comp activo (incluye loading / notFound).
export function useTenCompState(): TenCompState {
  const ctx = useContext(TenCompCtx)
  if (!ctx) throw new Error('useTenCompState debe usarse dentro de <TenCompProvider>')
  return ctx
}

// Atajo para páginas dentro del contexto ya resuelto. Lanza si aún no hay datos.
export function useTenComp(): TenCompContextData {
  const { data } = useTenCompState()
  if (!data) throw new Error('useTenComp usado fuera de un Ten-Comp resuelto')
  return data
}
