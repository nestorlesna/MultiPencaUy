-- ─── Tabla: subgrupos ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS subgrupos (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 50),
  creator_id  uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT subgrupos_name_unique UNIQUE (name)
);

CREATE INDEX idx_subgrupos_creator ON subgrupos(creator_id);

-- ─── Tabla: subgrupo_members ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS subgrupo_members (
  subgrupo_id  uuid NOT NULL REFERENCES subgrupos(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  joined_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (subgrupo_id, user_id)
);

CREATE INDEX idx_subgrupo_members_user ON subgrupo_members(user_id);

-- ─── RLS ──────────────────────────────────────────────────────────────────
ALTER TABLE subgrupos ENABLE ROW LEVEL SECURITY;
ALTER TABLE subgrupo_members ENABLE ROW LEVEL SECURITY;

-- Helper SECURITY DEFINER: ¿el usuario actual es miembro del subgrupo?
-- SECURITY DEFINER evita recursión de RLS sobre subgrupo_members.
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

-- Subgrupos privados: solo creador, miembros o admin pueden verlos
CREATE POLICY "subgrupos_read_member"
  ON subgrupos FOR SELECT
  USING (
    creator_id = auth.uid()
    OR is_subgrupo_member(id)
    OR (SELECT is_admin FROM profiles WHERE id = auth.uid())
  );

-- Solo el creador puede insertar
CREATE POLICY "subgrupos_insert_creator"
  ON subgrupos FOR INSERT
  WITH CHECK (auth.uid() = creator_id);

-- Solo el creador puede actualizar (sin poder reasignar creator_id)
CREATE POLICY "subgrupos_update_creator"
  ON subgrupos FOR UPDATE
  USING (auth.uid() = creator_id)
  WITH CHECK (auth.uid() = creator_id);

-- Admin puede actualizar cualquier subgrupo
CREATE POLICY "subgrupos_update_admin"
  ON subgrupos FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  );

-- Solo el creador puede eliminar
CREATE POLICY "subgrupos_delete_creator"
  ON subgrupos FOR DELETE
  USING (auth.uid() = creator_id);

-- Admin puede eliminar cualquier subgrupo
CREATE POLICY "subgrupos_delete_admin"
  ON subgrupos FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  );

-- Miembros visibles solo para integrantes del mismo subgrupo (o admin)
CREATE POLICY "subgrupo_members_read_member"
  ON subgrupo_members FOR SELECT
  USING (
    user_id = auth.uid()
    OR is_subgrupo_member(subgrupo_id)
    OR (SELECT is_admin FROM profiles WHERE id = auth.uid())
  );

-- El creador del subgrupo puede agregar miembros
CREATE POLICY "subgrupo_members_insert_creator"
  ON subgrupo_members FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM subgrupos
      WHERE id = subgrupo_members.subgrupo_id
        AND creator_id = auth.uid()
    )
  );

-- Un usuario puede eliminarse a sí mismo
CREATE POLICY "subgrupo_members_delete_self"
  ON subgrupo_members FOR DELETE
  USING (auth.uid() = user_id);

-- El creador puede eliminar miembros
CREATE POLICY "subgrupo_members_delete_creator"
  ON subgrupo_members FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM subgrupos
      WHERE id = subgrupo_members.subgrupo_id
        AND creator_id = auth.uid()
    )
  );

-- Admin puede eliminar miembros
CREATE POLICY "subgrupo_members_delete_admin"
  ON subgrupo_members FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  );

-- ─── Trigger: auto-insert creator as member ───────────────────────────────
CREATE OR REPLACE FUNCTION auto_add_creator_to_subgrupo()
RETURNS trigger AS $$
BEGIN
  INSERT INTO subgrupo_members (subgrupo_id, user_id)
  VALUES (NEW.id, NEW.creator_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_auto_add_creator ON subgrupos;
CREATE TRIGGER trg_auto_add_creator
  AFTER INSERT ON subgrupos
  FOR EACH ROW
  EXECUTE FUNCTION auto_add_creator_to_subgrupo();

-- ─── Función: check_subgrupo_limit ────────────────────────────────────────
-- Evita que un usuario cree más de 3 subgrupos
CREATE OR REPLACE FUNCTION check_subgrupo_limit()
RETURNS trigger AS $$
BEGIN
  IF (
    SELECT count(*) FROM subgrupos WHERE creator_id = NEW.creator_id
  ) >= 3 THEN
    RAISE EXCEPTION 'Un usuario puede crear máximo 3 subgrupos';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_subgrupo_limit ON subgrupos;
CREATE TRIGGER trg_subgrupo_limit
  BEFORE INSERT ON subgrupos
  FOR EACH ROW
  EXECUTE FUNCTION check_subgrupo_limit();

-- ─── View: subgrupo_ranking ───────────────────────────────────────────────
-- Ranking de miembros de un subgrupo basado en leaderboard.
-- security_invoker: respeta la RLS del usuario que consulta (subgrupos privados).
CREATE OR REPLACE VIEW subgrupo_ranking
WITH (security_invoker = true) AS
SELECT
  sm.subgrupo_id,
  sm.user_id,
  lb.total_points,
  lb.rank AS global_rank,
  lb.predictions_count,
  lb.exact_scores,
  lb.display_name,
  lb.username,
  lb.avatar_url,
  RANK() OVER (PARTITION BY sm.subgrupo_id ORDER BY lb.total_points DESC) AS subgrupo_rank
FROM subgrupo_members sm
JOIN leaderboard lb ON lb.user_id = sm.user_id
JOIN subgrupos sg ON sg.id = sm.subgrupo_id
WHERE sg.is_active = true;

-- ─── View: my_subgrupos_view ──────────────────────────────────────────────
-- Subgrupos activos donde el usuario es miembro.
-- security_invoker: respeta la RLS del usuario que consulta.
CREATE OR REPLACE VIEW my_subgrupos_view
WITH (security_invoker = true) AS
SELECT
  sg.id,
  sg.name,
  sg.creator_id,
  sg.is_active,
  sg.created_at,
  sm.user_id
FROM subgrupo_members sm
JOIN subgrupos sg ON sg.id = sm.subgrupo_id;
