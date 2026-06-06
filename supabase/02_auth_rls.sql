-- ============================================================
-- 02_AUTH_RLS.SQL — Penca Mundial 2026
-- Ejecutar DESPUÉS de 01_schema.sql
-- ============================================================

-- ============================================================
-- TRIGGER: Crear perfil automáticamente al registrarse
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, username, display_name, is_active, is_admin)
  VALUES (
    NEW.id,
    COALESCE(
      NEW.raw_user_meta_data->>'username',
      split_part(NEW.email, '@', 1)
    ),
    COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'name',
      split_part(NEW.email, '@', 1)
    ),
    true,
    false
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- HABILITAR RLS EN TODAS LAS TABLAS
-- ============================================================
ALTER TABLE groups             ENABLE ROW LEVEL SECURITY;
ALTER TABLE phases             ENABLE ROW LEVEL SECURITY;
ALTER TABLE stadiums           ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams              ENABLE ROW LEVEL SECURITY;
ALTER TABLE matches            ENABLE ROW LEVEL SECURITY;
ALTER TABLE knockout_slot_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles           ENABLE ROW LEVEL SECURITY;
ALTER TABLE scoring_config     ENABLE ROW LEVEL SECURITY;
ALTER TABLE predictions        ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- FUNCIONES HELPER
-- ============================================================
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND is_admin = true
  );
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION is_active_user()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND is_active = true
  );
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- ============================================================
-- POLÍTICAS: DATOS PÚBLICOS (solo lectura)
-- ============================================================
CREATE POLICY "groups_lectura_publica"   ON groups   FOR SELECT USING (true);
CREATE POLICY "phases_lectura_publica"   ON phases   FOR SELECT USING (true);
CREATE POLICY "stadiums_lectura_publica" ON stadiums FOR SELECT USING (true);
CREATE POLICY "teams_lectura_publica"    ON teams    FOR SELECT USING (true);
CREATE POLICY "matches_lectura_publica"  ON matches  FOR SELECT USING (true);
CREATE POLICY "ksr_lectura_publica"      ON knockout_slot_rules FOR SELECT USING (true);
CREATE POLICY "scoring_lectura_publica"  ON scoring_config      FOR SELECT USING (true);

-- Admin: acceso total a datos del torneo
CREATE POLICY "groups_admin"   ON groups   FOR ALL USING (is_admin());
CREATE POLICY "phases_admin"   ON phases   FOR ALL USING (is_admin());
CREATE POLICY "stadiums_admin" ON stadiums FOR ALL USING (is_admin());
CREATE POLICY "teams_admin"    ON teams    FOR ALL USING (is_admin());
CREATE POLICY "matches_admin"  ON matches  FOR ALL USING (is_admin());
CREATE POLICY "ksr_admin"      ON knockout_slot_rules FOR ALL USING (is_admin());
CREATE POLICY "scoring_admin"  ON scoring_config      FOR ALL USING (is_admin());

-- ============================================================
-- POLÍTICAS: PERFILES
-- ============================================================
-- Lectura solo para usuarios autenticados (el ranking público usa la
-- vista leaderboard, que se ejecuta con privilegios del owner).
-- No exponemos is_admin / is_loader a visitantes anónimos.
CREATE POLICY "profiles_lectura_autenticados" ON profiles FOR SELECT
  TO authenticated
  USING (true);

-- El usuario puede editar su propio perfil (sin poder cambiarse is_admin / is_active)
CREATE POLICY "profiles_editar_propio" ON profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND is_admin  = (SELECT is_admin  FROM profiles WHERE id = auth.uid())
    AND is_active = (SELECT is_active FROM profiles WHERE id = auth.uid())
  );

-- Admin: acceso total a perfiles
CREATE POLICY "profiles_admin" ON profiles FOR ALL USING (is_admin());

-- ============================================================
-- POLÍTICAS: PREDICCIONES
-- ============================================================

-- SELECT: el propio usuario ve siempre las suyas;
--         los activos ven las de todos DESPUÉS de que empieza el partido
CREATE POLICY "predictions_select" ON predictions FOR SELECT
  USING (
    auth.uid() = user_id
    OR (
      is_active_user()
      AND EXISTS (
        SELECT 1 FROM matches m
        WHERE m.id = match_id
          AND m.match_datetime <= now()
      )
    )
  );

-- INSERT: usuario activo, solo antes del partido, solo la suya
CREATE POLICY "predictions_insert" ON predictions FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND is_active_user()
    AND EXISTS (
      SELECT 1 FROM matches m
      WHERE m.id = match_id
        AND m.match_datetime > now()
    )
  );

-- UPDATE: usuario activo, solo antes del partido, solo la suya
CREATE POLICY "predictions_update" ON predictions FOR UPDATE
  USING (
    auth.uid() = user_id
    AND is_active_user()
    AND EXISTS (
      SELECT 1 FROM matches m
      WHERE m.id = match_id
        AND m.match_datetime > now()
    )
  );

-- DELETE: solo antes del partido
CREATE POLICY "predictions_delete" ON predictions FOR DELETE
  USING (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM matches m
      WHERE m.id = match_id
        AND m.match_datetime > now()
    )
  );

-- Admin: acceso total
CREATE POLICY "predictions_admin" ON predictions FOR ALL USING (is_admin());
