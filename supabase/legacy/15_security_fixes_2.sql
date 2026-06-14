-- ============================================================
-- 15_SECURITY_FIXES_2.SQL — PencaLes 2026
-- Correcciones de seguridad de severidad baja:
--   #7 — WITH CHECK explícito en UPDATE de subgrupos (defensa en
--        profundidad; no era explotable porque Postgres ya usa el
--        USING como WITH CHECK cuando este se omite).
--   #8 — profiles deja de ser legible por usuarios anónimos
--        (no autenticados). Los listados públicos (ranking) usan la
--        vista leaderboard, que no depende de esta política.
--   #9 — subgrupos y sus miembros pasan a ser privados: solo los
--        integrantes (y el admin) pueden verlos.
-- Idempotente. Ejecutar DESPUÉS de 12_subgrupos.sql y 14_security_fixes.sql.
-- ============================================================

-- ============================================================
-- #8 — profiles: lectura solo para usuarios autenticados
-- ------------------------------------------------------------
-- Antes la política permitía lectura a cualquiera (anon incluido),
-- exponiendo is_admin / is_loader de todos. El ranking público usa
-- la vista leaderboard (se ejecuta con privilegios del owner), así
-- que no se ve afectado.
-- ============================================================
DROP POLICY IF EXISTS "profiles_lectura_publica" ON profiles;
DROP POLICY IF EXISTS "profiles_lectura_autenticados" ON profiles;

CREATE POLICY "profiles_lectura_autenticados" ON profiles FOR SELECT
  TO authenticated
  USING (true);

-- ============================================================
-- #9 — subgrupos privados (solo miembros y admin)
-- ------------------------------------------------------------
-- Helper SECURITY DEFINER para evaluar membresía sin provocar
-- recursión de RLS sobre subgrupo_members.
-- ============================================================
CREATE OR REPLACE FUNCTION is_subgrupo_member(p_subgrupo_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM subgrupo_members
    WHERE subgrupo_id = p_subgrupo_id
      AND user_id = auth.uid()
  );
$$;

-- subgrupos: ver solo si sos creador, miembro o admin
DROP POLICY IF EXISTS "subgrupos_read_public" ON subgrupos;
DROP POLICY IF EXISTS "subgrupos_read_member" ON subgrupos;

CREATE POLICY "subgrupos_read_member" ON subgrupos FOR SELECT
  USING (
    creator_id = auth.uid()
    OR is_subgrupo_member(id)
    OR (SELECT is_admin FROM profiles WHERE id = auth.uid())
  );

-- subgrupo_members: ver solo tu propia fila, los miembros de un
-- subgrupo al que pertenecés, o si sos admin
DROP POLICY IF EXISTS "subgrupo_members_read_public" ON subgrupo_members;
DROP POLICY IF EXISTS "subgrupo_members_read_member" ON subgrupo_members;

CREATE POLICY "subgrupo_members_read_member" ON subgrupo_members FOR SELECT
  USING (
    user_id = auth.uid()
    OR is_subgrupo_member(subgrupo_id)
    OR (SELECT is_admin FROM profiles WHERE id = auth.uid())
  );

-- Las vistas de subgrupos deben respetar la RLS del que consulta
-- (por defecto se ejecutan como owner y la saltearían).
-- Se aplican solo si la vista existe (algunas instalaciones no tienen
-- my_subgrupos_view).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_views WHERE schemaname = 'public' AND viewname = 'subgrupo_ranking') THEN
    EXECUTE 'ALTER VIEW public.subgrupo_ranking SET (security_invoker = true)';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_views WHERE schemaname = 'public' AND viewname = 'my_subgrupos_view') THEN
    EXECUTE 'ALTER VIEW public.my_subgrupos_view SET (security_invoker = true)';
  END IF;
END $$;

-- ============================================================
-- #7 — WITH CHECK explícito en UPDATE propio de subgrupos
-- ------------------------------------------------------------
-- Evita (de forma explícita) reasignar creator_id a otro usuario.
-- ============================================================
DROP POLICY IF EXISTS "subgrupos_update_creator" ON subgrupos;

CREATE POLICY "subgrupos_update_creator" ON subgrupos FOR UPDATE
  USING (auth.uid() = creator_id)
  WITH CHECK (auth.uid() = creator_id);
