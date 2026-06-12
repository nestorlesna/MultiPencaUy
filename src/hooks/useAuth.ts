import { useEffect, useState } from 'react'
import type { User, Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { Profile } from '../types'
import type { TenantRole } from '../types/tenant'

// El modelo multi-tenant (v2) solo se consulta cuando el flag está activo.
// En la app v1 viva queda desactivado → cero consultas a tablas inexistentes.
const V2_ENABLED = import.meta.env.VITE_V2_ENABLED === 'true'

interface AuthState {
  user: User | null
  session: Session | null
  profile: Profile | null
  tenantRoles: TenantRole[]
  loading: boolean
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    user: null,
    session: null,
    profile: null,
    tenantRoles: [],
    loading: true,
  })

  useEffect(() => {
    // Sesión inicial
    supabase.auth.getSession().then(({ data: { session } }) => {
      setState(prev => ({ ...prev, session, user: session?.user ?? null }))
      if (session?.user) loadUser(session.user.id)
      else setState(prev => ({ ...prev, loading: false }))
    })

    // Escucha cambios de auth
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setState(prev => ({ ...prev, session, user: session?.user ?? null }))
      if (session?.user) loadUser(session.user.id)
      else setState(prev => ({ ...prev, profile: null, tenantRoles: [], loading: false }))
    })

    return () => subscription.unsubscribe()
  }, [])

  async function loadUser(userId: string) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()

    let tenantRoles: TenantRole[] = []
    if (V2_ENABLED) {
      const { data } = await supabase
        .from('tenant_roles')
        .select('tenant_id, user_id, role')
        .eq('user_id', userId)
      tenantRoles = (data as TenantRole[]) ?? []
    }

    setState(prev => ({ ...prev, profile, tenantRoles, loading: false }))
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  const isTenantAdmin = (tenantId: string) =>
    (state.profile?.is_super_admin ?? false) ||
    state.tenantRoles.some(r => r.tenant_id === tenantId && r.role === 'admin')

  const isTenantLoader = (tenantId: string) =>
    (state.profile?.is_super_admin ?? false) ||
    state.tenantRoles.some(r => r.tenant_id === tenantId && (r.role === 'admin' || r.role === 'loader'))

  return {
    ...state,
    signOut,
    // v1 (compatibles con la app viva)
    isAdmin:  state.profile?.is_admin  ?? false,
    isLoader: state.profile?.is_loader ?? false,
    isActive: state.profile?.is_active ?? false,
    // v2
    isSuperAdmin: state.profile?.is_super_admin ?? false,
    isTenantAdmin,
    isTenantLoader,
  }
}
