-- ============================================================================
-- 111 · admin_get_invitable_users devuelve la preferencia de novedades
-- ----------------------------------------------------------------------------
-- El tab Correos respeta por defecto la elección `profiles.wants_news` (mig. 110)
-- de cada destinatario, con opción del admin de anularla para correos importantes.
-- Para poder filtrar en el frontend, la RPC de invitables ahora expone también
-- `wants_news`. (Los miembros aprobados ya traen wants_news por el join de
-- fetchMembers; los invitados externos no registrados no tienen preferencia.)
-- La firma agrega una columna al final; el resto no cambia.
--
-- Nota: agregar una columna al RETURNS TABLE cambia el tipo de retorno, así que
-- CREATE OR REPLACE falla con "cannot change return type of existing function".
-- Hay que DROP primero. La firma de entrada (p_ten_comp UUID) no cambia, por lo
-- que el GRANT y las llamadas del frontend siguen igual.
-- ============================================================================

-- Elimina cualquier versión previa (todas las firmas) para poder cambiar el
-- tipo de retorno sin el error 42P13 "cannot change return type of existing function".
DO $drop$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT oid::regprocedure AS sig
    FROM pg_proc
    WHERE proname = 'admin_get_invitable_users'
      AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION ' || r.sig || ' CASCADE';
  END LOOP;
END $drop$;

CREATE OR REPLACE FUNCTION admin_get_invitable_users(p_ten_comp UUID)
RETURNS TABLE(id UUID, email TEXT, display_name TEXT, wants_news BOOLEAN)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE v_tenant UUID;
BEGIN
  IF NOT is_ten_comp_admin(p_ten_comp) THEN RAISE EXCEPTION 'Access denied'; END IF;
  SELECT tenant_id INTO v_tenant FROM ten_comps WHERE ten_comps.id = p_ten_comp;

  RETURN QUERY
  SELECT DISTINCT au.id, au.email::text, pr.display_name::text, pr.wants_news
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
