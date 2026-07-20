-- ============================================================================
-- 110 · Preferencia de novedades por email
-- ----------------------------------------------------------------------------
-- El usuario elige al registrarse si quiere recibir novedades/noticias por
-- correo, y puede cambiarlo luego desde su perfil. Default true (opt-out).
--
-- La política `profiles_update_own` (02_rls.sql) solo fija is_super_admin e
-- is_active en su WITH CHECK, así que el dueño puede editar libremente esta
-- columna. El trigger `handle_new_user` la lee de raw_user_meta_data.
-- ============================================================================

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS wants_news BOOLEAN NOT NULL DEFAULT true;

-- Recrear el trigger para capturar la preferencia elegida en el registro.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.profiles (id, username, display_name, is_active, is_super_admin, wants_news)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name',
             split_part(NEW.email, '@', 1)),
    true, false,
    -- Ausente (login social) o 'true' → true; solo 'false' explícito desactiva.
    COALESCE((NEW.raw_user_meta_data->>'wants_news')::boolean, true)
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
