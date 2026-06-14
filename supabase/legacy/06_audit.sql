-- ============================================================
-- 06_AUDIT.SQL — PencaLes 2026
-- Auditoría de cambios en predicciones.
-- Ejecutar DESPUÉS de 01_schema.sql y 02_auth_rls.sql.
-- ============================================================

-- ============================================================
-- TABLA DE AUDITORÍA
-- ============================================================
CREATE TABLE IF NOT EXISTS predictions_audit (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  changed_at      TIMESTAMPTZ NOT NULL DEFAULT now(),  -- hora del servidor (UTC)
  action          TEXT        NOT NULL CHECK (action IN ('INSERT','UPDATE','DELETE')),
  user_id         UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  match_id        UUID        NOT NULL REFERENCES matches(id)  ON DELETE CASCADE,
  -- Valores anteriores (NULL en INSERT)
  old_home_score      SMALLINT,
  old_away_score      SMALLINT,
  old_home_score_et   SMALLINT,
  old_away_score_et   SMALLINT,
  old_pk_winner_id    UUID REFERENCES teams(id) ON DELETE SET NULL,
  -- Valores nuevos (NULL en DELETE)
  new_home_score      SMALLINT,
  new_away_score      SMALLINT,
  new_home_score_et   SMALLINT,
  new_away_score_et   SMALLINT,
  new_pk_winner_id    UUID REFERENCES teams(id) ON DELETE SET NULL
);

-- Índices para filtrado rápido
CREATE INDEX IF NOT EXISTS idx_audit_user    ON predictions_audit(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_match   ON predictions_audit(match_id);
CREATE INDEX IF NOT EXISTS idx_audit_changed ON predictions_audit(changed_at DESC);

-- ============================================================
-- FUNCIÓN TRIGGER
-- ============================================================
CREATE OR REPLACE FUNCTION fn_audit_predictions()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO predictions_audit (
      action, user_id, match_id,
      new_home_score, new_away_score,
      new_home_score_et, new_away_score_et,
      new_pk_winner_id
    ) VALUES (
      'INSERT', NEW.user_id, NEW.match_id,
      NEW.home_score, NEW.away_score,
      NEW.home_score_et, NEW.away_score_et,
      NEW.predicted_pk_winner_id
    );

  ELSIF TG_OP = 'UPDATE' THEN
    -- Solo registrar si realmente cambió algo
    IF (OLD.home_score, OLD.away_score,
        COALESCE(OLD.home_score_et,-1), COALESCE(OLD.away_score_et,-1),
        COALESCE(OLD.predicted_pk_winner_id::text,''))
       IS DISTINCT FROM
       (NEW.home_score, NEW.away_score,
        COALESCE(NEW.home_score_et,-1), COALESCE(NEW.away_score_et,-1),
        COALESCE(NEW.predicted_pk_winner_id::text,''))
    THEN
      INSERT INTO predictions_audit (
        action, user_id, match_id,
        old_home_score, old_away_score,
        old_home_score_et, old_away_score_et,
        old_pk_winner_id,
        new_home_score, new_away_score,
        new_home_score_et, new_away_score_et,
        new_pk_winner_id
      ) VALUES (
        'UPDATE', NEW.user_id, NEW.match_id,
        OLD.home_score, OLD.away_score,
        OLD.home_score_et, OLD.away_score_et,
        OLD.predicted_pk_winner_id,
        NEW.home_score, NEW.away_score,
        NEW.home_score_et, NEW.away_score_et,
        NEW.predicted_pk_winner_id
      );
    END IF;

  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO predictions_audit (
      action, user_id, match_id,
      old_home_score, old_away_score,
      old_home_score_et, old_away_score_et,
      old_pk_winner_id
    ) VALUES (
      'DELETE', OLD.user_id, OLD.match_id,
      OLD.home_score, OLD.away_score,
      OLD.home_score_et, OLD.away_score_et,
      OLD.predicted_pk_winner_id
    );
  END IF;

  RETURN NULL; -- AFTER trigger: el valor de retorno no importa
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- TRIGGER en predictions
-- ============================================================
DROP TRIGGER IF EXISTS trg_audit_predictions ON predictions;
CREATE TRIGGER trg_audit_predictions
  AFTER INSERT OR UPDATE OR DELETE ON predictions
  FOR EACH ROW EXECUTE FUNCTION fn_audit_predictions();

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE predictions_audit ENABLE ROW LEVEL SECURITY;

-- Solo admins pueden leer el audit
CREATE POLICY "audit_admin_read" ON predictions_audit
  FOR SELECT USING (is_admin());

-- Nadie puede insertar/modificar/borrar manualmente (solo el trigger)
-- El trigger usa SECURITY DEFINER por lo que bypasea RLS al escribir.
