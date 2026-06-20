-- ============================================================================
-- 92_ADD_ROUND_NUMBER.SQL — PencaLes 2.0
-- Agrega columna round_number a matches para competencias tipo liga (fechas).
-- Luego puebla el Apertura UY 2026: 15 fechas x 8 partidos = 120 partidos.
-- Idempotente: IF NOT EXISTS + UPDATE solo donde round_number IS NULL.
-- ============================================================================

ALTER TABLE matches ADD COLUMN IF NOT EXISTS round_number SMALLINT;

CREATE INDEX IF NOT EXISTS idx_matches_round
  ON matches(competition_id, round_number)
  WHERE round_number IS NOT NULL;

-- Apertura UY 2026: match_number 1-120, 8 partidos por fecha
-- Fecha = CEIL(match_number / 8)
UPDATE matches
SET    round_number = CEIL(match_number / 8.0)::SMALLINT
WHERE  competition_id = 'c0a00000-0000-4000-8000-000000000001'
  AND  round_number IS NULL;
