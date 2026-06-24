-- ============================================================================
-- 102_FIX_INVITABLE_USERS.SQL — PencaLes 2.0
-- Fix de admin_get_invitable_users (migración 101): la función abortaba con
-- "column reference \"id\" is ambiguous" y devolvía 0 invitables.
--
-- Causa: RETURNS TABLE(id UUID, ...) declara una variable de salida llamada
-- `id`, que colisiona con ten_comps.id en el `SELECT tenant_id INTO v_tenant
-- ... WHERE id = p_ten_comp`. PL/pgSQL no sabe si `id` es la variable o la
-- columna y lanza el error antes de devolver nada.
--
-- Solución: calificar la columna (`ten_comps.id`). El resto de la consulta ya
-- usaba referencias calificadas. La firma y los nombres de salida no cambian.
-- ============================================================================

CREATE OR REPLACE FUNCTION admin_get_invitable_users(p_ten_comp UUID)
RETURNS TABLE(id UUID, email TEXT, display_name TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE v_tenant UUID;
BEGIN
  IF NOT is_ten_comp_admin(p_ten_comp) THEN RAISE EXCEPTION 'Access denied'; END IF;
  SELECT tenant_id INTO v_tenant FROM ten_comps WHERE ten_comps.id = p_ten_comp;

  RETURN QUERY
  SELECT DISTINCT au.id, au.email::text, pr.display_name::text
  FROM ten_comp_members tcm
  JOIN ten_comps tc  ON tc.id = tcm.ten_comp_id
                    AND tc.tenant_id = v_tenant
                    AND tc.id <> p_ten_comp
  JOIN auth.users au ON au.id = tcm.user_id
  JOIN profiles pr   ON pr.id = au.id AND pr.is_active = true
  WHERE NOT EXISTS (
    SELECT 1 FROM ten_comp_members x
    WHERE x.ten_comp_id = p_ten_comp AND x.user_id = tcm.user_id
  )
  ORDER BY 3;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_get_invitable_users(UUID) TO authenticated;
