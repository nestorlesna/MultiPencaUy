import { createContext, useContext, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useMatch, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import {
  resolveTenCompBySlug,
  fetchMyTenComps,
  fetchPublicTenComps,
} from '../services/tenCompService'
import type { TenCompContextData, MyPenca, PublicPenca } from '../types/tenant'

const LAST_SLUG_KEY = 'lastTenCompSlug'

export function readLastTenCompSlug(): string | null {
  try {
    return localStorage.getItem(LAST_SLUG_KEY)
  } catch {
    return null
  }
}

function writeLastTenCompSlug(slug: string) {
  try {
    localStorage.setItem(LAST_SLUG_KEY, slug)
  } catch {
    /* ignore (modo privado, etc.) */
  }
}

interface TenCompState {
  data: TenCompContextData | null
  isLoading: boolean
  notFound: boolean
  refetch: () => void
  // Switcher de competencia (barra superior global).
  activeSlug: string | null
  myPencas: MyPenca[]
  publicPencas: PublicPenca[]
  setActive: (slug: string) => void
}

const TenCompCtx = createContext<TenCompState | undefined>(undefined)

// Provider global (a nivel Layout): resuelve el Ten-Comp activo desde la URL
// (/p/:slug) o, fuera de ese subárbol, desde el último usado en localStorage.
// Tanto el Header/BottomNav como las páginas /p/:slug/* consumen este contexto.
export function ActiveTenCompProvider({ children }: { children: React.ReactNode }) {
  const { user, tenantRoles, isSuperAdmin } = useAuth()
  const navigate = useNavigate()

  const match = useMatch('/p/:slug/*')
  const urlSlug = match?.params.slug ?? null
  const activeSlug = urlSlug ?? readLastTenCompSlug()

  const query = useQuery({
    queryKey: ['ten_comp', activeSlug, user?.id ?? null],
    queryFn: () => resolveTenCompBySlug(activeSlug!, user?.id ?? null),
    enabled: !!activeSlug,
  })

  // Lista para el combo: mías (logueado) y públicas (todos).
  const { data: myPencas = [] } = useQuery({
    queryKey: ['my_ten_comps', user?.id],
    queryFn: () => (user ? fetchMyTenComps(user.id) : Promise.resolve([] as MyPenca[])),
    enabled: !!user,
  })
  const { data: publicPencas = [] } = useQuery({
    queryKey: ['public_ten_comps'],
    queryFn: fetchPublicTenComps,
  })

  const resolved = query.data ?? null

  // Persistir el último Ten-Comp resuelto válido.
  useEffect(() => {
    if (resolved) writeLastTenCompSlug(resolved.tenComp.slug)
  }, [resolved])

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
    isLoading: !!activeSlug && query.isLoading,
    // "No encontrada" solo aplica cuando hay un slug en la URL que no resuelve.
    notFound: !!urlSlug && !query.isLoading && !query.isError && resolved === null,
    refetch: query.refetch,
    activeSlug,
    myPencas,
    publicPencas,
    setActive: (slug: string) => {
      writeLastTenCompSlug(slug)
      navigate(`/p/${slug}`)
    },
  }

  return <TenCompCtx.Provider value={value}>{children}</TenCompCtx.Provider>
}

// Estado completo del Ten-Comp activo (incluye loading / notFound / switcher).
export function useTenCompState(): TenCompState {
  const ctx = useContext(TenCompCtx)
  if (!ctx) throw new Error('useTenCompState debe usarse dentro de <ActiveTenCompProvider>')
  return ctx
}

// Atajo para páginas dentro del contexto ya resuelto. Lanza si aún no hay datos.
export function useTenComp(): TenCompContextData {
  const { data } = useTenCompState()
  if (!data) throw new Error('useTenComp usado fuera de un Ten-Comp resuelto')
  return data
}
