-- =============================================================
-- 13_admin_functions.sql
-- Funciones auxiliares para el panel de administración
-- =============================================================

-- Retorna email (de auth.users) y total de apuestas por usuario.
-- Solo accesible para admins (validado dentro de la función).
CREATE OR REPLACE FUNCTION admin_get_user_details()
RETURNS TABLE(
  id uuid,
  email text,
  predictions_count bigint
)
SECURITY DEFINER
SET search_path = public, auth
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid() AND profiles.is_admin = true
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  SELECT
    au.id,
    au.email::text,
    COUNT(p.id)::bigint AS predictions_count
  FROM auth.users au
  LEFT JOIN public.predictions p ON p.user_id = au.id
  GROUP BY au.id, au.email;
END;
$$;
