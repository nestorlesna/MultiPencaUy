-- ============================================================================
-- 98_ADMIN_ALL_USER_EMAILS.SQL — PencaLes 2.0
-- RPC global para que el super-admin vea el email de todos los usuarios en
-- /admin/usuarios. (El RPC `admin_get_user_details(p_ten_comp)` es por-penca;
-- acá hace falta la lista completa de la plataforma.)
--
-- SECURITY DEFINER + chequeo is_super_admin(): el email vive en auth.users, que
-- no es legible por clientes; solo lo expone esta función a super-admins.
-- ============================================================================

CREATE OR REPLACE FUNCTION admin_get_all_user_emails()
RETURNS TABLE(id UUID, email TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
BEGIN
  IF NOT is_super_admin() THEN RAISE EXCEPTION 'Access denied'; END IF;
  RETURN QUERY SELECT au.id, au.email::text FROM auth.users au;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_get_all_user_emails() TO authenticated;
