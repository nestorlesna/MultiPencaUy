-- ============================================================================
-- 97_MUST_CHANGE_PASSWORD.SQL — PencaLes 2.0
-- Flag para forzar cambio de contraseña en el próximo login.
--
-- Lo prende el endpoint `api/admin-reset-password.ts` (service role) cuando un
-- admin resetea la pass de un usuario; lo apaga el propio usuario al setear su
-- nueva contraseña (el gate de Layout lo obliga antes de usar la app).
--
-- La política `profiles_update_own` (02_rls.sql) solo fija is_super_admin e
-- is_active en su WITH CHECK, así que el dueño puede apagar este flag al cambiar
-- la contraseña. El reseteo (prenderlo) lo hace el service role, sin pasar RLS.
-- ============================================================================

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT false;
