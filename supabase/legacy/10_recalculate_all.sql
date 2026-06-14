-- ============================================================
-- FUNCIÓN: Recalcular todo desde cero
-- Recalcula puntos de todos los partidos finalizados,
-- propaga ganadores en el cuadro eliminatorio y
-- recalcula los bonus de +Puntos.
-- Es idempotente: se puede ejecutar múltiples veces sin efecto negativo.
-- ============================================================
CREATE OR REPLACE FUNCTION recalculate_all()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_match_id     UUID;
  v_match_count  INT := 0;
  v_pred_count   INT := 0;
  v_knockout_n   INT := 0;
  v_bonus_n      INT := 0;
  v_tmp          INT;
BEGIN
  -- 1. Recalcular puntos de predicciones para cada partido finalizado
  FOR v_match_id IN
    SELECT id FROM matches WHERE status = 'finished' ORDER BY match_number
  LOOP
    BEGIN
      SELECT calculate_match_points(v_match_id) INTO v_tmp;
      v_pred_count  := v_pred_count + v_tmp;
      v_match_count := v_match_count + 1;
    EXCEPTION WHEN OTHERS THEN
      -- Saltear partidos sin resultado válido o sin config activa
      NULL;
    END;
  END LOOP;

  -- 2. Propagar ganadores al cuadro eliminatorio
  SELECT populate_knockout_matches() INTO v_knockout_n;

  -- 3. Recalcular bonuses de +Puntos
  SELECT calculate_bonus_points() INTO v_bonus_n;

  RETURN jsonb_build_object(
    'matches_processed', v_match_count,
    'predictions_updated', v_pred_count,
    'knockout_slots_updated', v_knockout_n,
    'bonus_rows_updated', v_bonus_n
  );
END;
$$;
