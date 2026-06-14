-- ============================================================
-- 14_SECURITY_FIXES.SQL — PencaLes 2026
-- Correcciones de seguridad sobre la RLS existente.
-- Idempotente: se puede ejecutar varias veces sin efectos negativos.
-- Ejecutar DESPUÉS de 07_bonus.sql y 11_loader_role.sql.
-- ============================================================

-- ============================================================
-- PRERREQUISITO — Rol "cargador" (is_loader)
-- ------------------------------------------------------------
-- Si la base nunca ejecutó 11_loader_role.sql, la columna is_loader
-- no existe y este script fallaría. Lo dejamos autónomo: creamos la
-- columna y la política de UPDATE de matches para loaders si faltan
-- (idempotente). Si ya existían, no cambia nada.
-- ============================================================
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS is_loader BOOLEAN NOT NULL DEFAULT false;

DROP POLICY IF EXISTS "Admin can update matches" ON matches;
DROP POLICY IF EXISTS "Admin or loader can update matches" ON matches;

CREATE POLICY "Admin or loader can update matches"
  ON matches FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND (is_admin = true OR is_loader = true)
    )
  );

-- ============================================================
-- FIX 1 — Escalada de privilegios a "cargador" (is_loader)
-- ------------------------------------------------------------
-- La política original profiles_editar_propio (02_auth_rls.sql)
-- solo impedía que el usuario se cambiara is_admin / is_active,
-- pero NO is_loader. Eso permitiría que cualquier usuario hiciera
-- un UPDATE sobre su propio perfil poniendo is_loader = true y,
-- vía la política "Admin or loader can update matches", cargara o
-- alterara resultados de partidos.
-- Se recrea la política bloqueando también is_loader.
-- ============================================================
DROP POLICY IF EXISTS "profiles_editar_propio" ON profiles;

CREATE POLICY "profiles_editar_propio" ON profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND is_admin  = (SELECT is_admin  FROM profiles WHERE id = auth.uid())
    AND is_active = (SELECT is_active FROM profiles WHERE id = auth.uid())
    AND is_loader = (SELECT is_loader FROM profiles WHERE id = auth.uid())
  );

-- ============================================================
-- FIX 2 — Bloqueo server-side de predicciones bonus
-- ------------------------------------------------------------
-- Antes, las políticas de bonus_predictions permitían insertar /
-- editar en cualquier momento; el único candado era client-side
-- (isTournamentStarted() en MasPuntosPage). Eso permitía cambiar
-- las respuestas bonus DESPUÉS de conocer los resultados.
-- Se replica el modelo de predicciones de partido: solo se permite
-- escribir mientras NINGÚN partido haya comenzado, usando now() del
-- servidor (inmune a manipulación del reloj del cliente).
-- El WITH CHECK en UPDATE además evita reasignar user_id a otro id.
-- ============================================================
DROP POLICY IF EXISTS "bonus_pred_own_upsert" ON bonus_predictions;
DROP POLICY IF EXISTS "bonus_pred_own_insert" ON bonus_predictions;
DROP POLICY IF EXISTS "bonus_pred_own_update" ON bonus_predictions;

CREATE POLICY "bonus_pred_own_insert" ON bonus_predictions FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND NOT EXISTS (SELECT 1 FROM matches WHERE match_datetime <= now())
  );

CREATE POLICY "bonus_pred_own_update" ON bonus_predictions FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    AND NOT EXISTS (SELECT 1 FROM matches WHERE match_datetime <= now())
  );
