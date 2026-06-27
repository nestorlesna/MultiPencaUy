-- ============================================================================
-- 101_INVITATIONS.SQL — PencaLes 2.0
-- Soporte para invitar a una penca desde el tab "Correos":
--   1. admin_get_ten_comp_join_code: el código de 8 letras de una penca privada
--      (no se expone por SELECT por seguridad) para incluirlo en el correo.
--   2. admin_get_invitable_users: usuarios YA registrados que juegan en OTRAS
--      pencas del MISMO tenant y todavía no son miembros de esta. Permite que el
--      admin invite a sus jugadores de la competencia A a una competencia B nueva.
--
-- Ambas SECURITY DEFINER + guardadas por is_ten_comp_admin(p_ten_comp): solo el
-- admin de la penca destino las puede llamar. La lista de invitables se acota al
-- propio tenant (no expone emails de toda la plataforma a cualquier admin).
-- ============================================================================

-- ── Código de invitación de una penca privada ───────────────────────────────
CREATE OR REPLACE FUNCTION admin_get_ten_comp_join_code(p_ten_comp UUID)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_code TEXT;
BEGIN
  IF NOT is_ten_comp_admin(p_ten_comp) THEN RAISE EXCEPTION 'Access denied'; END IF;
  SELECT join_code INTO v_code
  FROM ten_comps
  WHERE id = p_ten_comp AND visibility = 'private';
  RETURN v_code;  -- NULL si la penca es pública (no tiene código)
END;
$$;

GRANT EXECUTE ON FUNCTION admin_get_ten_comp_join_code(UUID) TO authenticated;

-- ── Usuarios invitables: registrados en otras pencas del mismo tenant ────────
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
