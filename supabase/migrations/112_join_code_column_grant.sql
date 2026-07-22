-- ============================================================================
-- 112_JOIN_CODE_COLUMN_GRANT.SQL — PencaLes 2.0
-- Hallazgo 2 de docs/auditoria_seguridad_multipencauy_2026.md:
-- ten_comps_read (02_rls.sql:210-211) es una política de FILA, no de columna:
-- cualquier miembro aprobado de una penca privada (is_member) podía leer
-- join_code por REST directo, no solo el admin. La intención documentada
-- (101_invitations.sql) es que el código solo salga por
-- admin_get_ten_comp_join_code, guardada por is_ten_comp_admin.
--
-- Fix: revocar SELECT de la columna join_code para authenticated. Como eso
-- también corta la lectura legítima que hace el tenant-admin en
-- fetchTenantTenComps (src/services/v2/adminService.ts, listado de pencas del
-- tenant en /t/:slug/admin), se agrega una RPC batch equivalente a
-- admin_get_ten_comp_join_code pero para todas las pencas de un tenant a la vez.
-- ============================================================================

REVOKE SELECT (join_code) ON ten_comps FROM authenticated;

CREATE OR REPLACE FUNCTION admin_get_tenant_join_codes(p_tenant UUID)
RETURNS TABLE(ten_comp_id UUID, join_code TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_tenant_admin(p_tenant) THEN RAISE EXCEPTION 'Access denied'; END IF;
  RETURN QUERY
    SELECT tc.id, tc.join_code
    FROM ten_comps tc
    WHERE tc.tenant_id = p_tenant;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_get_tenant_join_codes(UUID) TO authenticated;
