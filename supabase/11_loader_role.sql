-- ============================================================
-- 11_LOADER_ROLE.SQL — Rol "Cargador"
-- Agrega el rol is_loader a profiles y actualiza la RLS de
-- matches para permitir que los cargadores carguen resultados.
-- Ejecutar DESPUÉS de 02_auth_rls.sql
-- ============================================================

-- ── Columna en profiles ───────────────────────────────────────────────────────

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS is_loader BOOLEAN NOT NULL DEFAULT false;

-- ── RLS: matches UPDATE ───────────────────────────────────────────────────────
-- Reemplaza la política admin-only de UPDATE por una que admite
-- también a usuarios con is_loader = true.

DROP POLICY IF EXISTS "Admin can update matches" ON matches;

CREATE POLICY "Admin or loader can update matches"
  ON matches FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND (is_admin = true OR is_loader = true)
    )
  );

-- ── RLS: profiles UPDATE propio ───────────────────────────────────────────────
-- Recrea profiles_editar_propio (definida en 02_auth_rls.sql) para que ahora que
-- existe la columna is_loader, el usuario tampoco pueda auto-asignársela.
-- Sin esto, cualquiera podría poner is_loader = true en su propio perfil y cargar
-- resultados de partidos.
DROP POLICY IF EXISTS "profiles_editar_propio" ON profiles;

CREATE POLICY "profiles_editar_propio" ON profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND is_admin  = (SELECT is_admin  FROM profiles WHERE id = auth.uid())
    AND is_active = (SELECT is_active FROM profiles WHERE id = auth.uid())
    AND is_loader = (SELECT is_loader FROM profiles WHERE id = auth.uid())
  );
