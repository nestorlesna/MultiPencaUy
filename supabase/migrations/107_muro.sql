-- ============================================================================
-- 107_MURO.SQL — PencaLes 2.0
-- "Muro" de la penca: mensajes cortos que dejan los miembros, visibles al
-- costado del ranking. Un muro por Ten-Comp.
--
-- Reglas:
--   • Texto corto: 1..100 caracteres y máximo 10 palabras (CHECK en la tabla).
--   • Solo se conservan los últimos 10 mensajes por penca; el resto se borra
--     solo (trigger AFTER INSERT) para no acumular.
--   • Cooldown de 30 s por persona para evitar que uno solo llene el muro
--     (trigger BEFORE INSERT, con mensaje amigable).
--   • Visibilidad: solo miembros aprobados (y admin del Ten-Comp).
--   • Borrado manual: el autor borra el suyo; el admin del Ten-Comp, cualquiera.
-- ============================================================================

CREATE TABLE IF NOT EXISTS muro_mensajes (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  ten_comp_id UUID        NOT NULL REFERENCES ten_comps(id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL REFERENCES profiles(id)  ON DELETE CASCADE,
  texto       TEXT        NOT NULL
              CHECK (char_length(btrim(texto)) BETWEEN 1 AND 100)
              CHECK (array_length(regexp_split_to_array(btrim(texto), '\s+'), 1) <= 10),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_muro_ten_comp ON muro_mensajes(ten_comp_id, created_at DESC);

-- ── Cooldown de 30 s por persona/penca ────────────────────────────────────────
CREATE OR REPLACE FUNCTION muro_cooldown()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM muro_mensajes
    WHERE ten_comp_id = NEW.ten_comp_id
      AND user_id = NEW.user_id
      AND created_at > now() - interval '30 seconds'
  ) THEN
    RAISE EXCEPTION 'Esperá unos segundos antes de dejar otro mensaje';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_muro_cooldown ON muro_mensajes;
CREATE TRIGGER trg_muro_cooldown
  BEFORE INSERT ON muro_mensajes
  FOR EACH ROW EXECUTE FUNCTION muro_cooldown();

-- ── Autopurga: dejar solo los 10 más nuevos por penca ─────────────────────────
-- SECURITY DEFINER para poder borrar filas ajenas (la RLS de DELETE solo permite
-- autor/admin; la purga corre con los privilegios del dueño y las sortea).
CREATE OR REPLACE FUNCTION muro_purge_old()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM muro_mensajes
  WHERE ten_comp_id = NEW.ten_comp_id
    AND id NOT IN (
      SELECT id FROM muro_mensajes
      WHERE ten_comp_id = NEW.ten_comp_id
      ORDER BY created_at DESC, id DESC
      LIMIT 10
    );
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_muro_purge ON muro_mensajes;
CREATE TRIGGER trg_muro_purge
  AFTER INSERT ON muro_mensajes
  FOR EACH ROW EXECUTE FUNCTION muro_purge_old();

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE muro_mensajes ENABLE ROW LEVEL SECURITY;

-- Ver: miembros aprobados y admin del Ten-Comp.
CREATE POLICY "muro_read" ON muro_mensajes FOR SELECT
  USING (is_approved_member(ten_comp_id) OR is_ten_comp_admin(ten_comp_id));

-- Postear: uno mismo, siendo miembro aprobado. (Cooldown/límites por trigger y CHECK.)
CREATE POLICY "muro_insert" ON muro_mensajes FOR INSERT
  WITH CHECK (user_id = auth.uid() AND is_approved_member(ten_comp_id));

-- Borrar: el autor el suyo; el admin del Ten-Comp, cualquiera.
CREATE POLICY "muro_delete" ON muro_mensajes FOR DELETE
  USING (user_id = auth.uid() OR is_ten_comp_admin(ten_comp_id));

-- Sin UPDATE: los mensajes no se editan.

-- ── GRANTs ────────────────────────────────────────────────────────────────────
GRANT SELECT, INSERT, DELETE ON muro_mensajes TO authenticated;
