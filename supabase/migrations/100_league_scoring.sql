-- ============================================================================
-- 100_LEAGUE_SCORING.SQL — PencaLes 2.0
-- Arregla el cálculo de puntos y el recálculo para competencias de LIGA
-- (Apertura UY y similares: advancement_engine = NULL, sin llave eliminatoria).
--
-- Problemas que resuelve:
--   1) calculate_match_points consideraba "knockout" a todo partido sin grupo
--      (group_id IS NULL). En una liga TODOS los partidos son así → se sumaba
--      indebidamente el bonus de eliminatoria. Ahora un partido es knockout solo
--      si la competencia tiene motor de avance Y el partido no es de grupo.
--   2) recalculate_all llamaba SIEMPRE a populate_knockout, que lanza excepción
--      cuando la competencia no tiene advancement_engine → abortaba TODO el
--      recálculo ("la competencia no tiene motor de avance"). Ahora solo se
--      puebla el cuadro si la competencia tiene motor.
--
-- Las posiciones de liga/serie no se tocan acá: las de serie salen de la vista
-- group_standings (ya lista todos los equipos en 0); las de liga de tabla única
-- se calculan en el frontend (leagueStandingsService) con desempate head-to-head.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- calculate_match_points: detección de knockout robusta para ligas y series.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION calculate_match_points(p_match_id UUID)
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_match     matches%ROWTYPE;
  v_has_engine BOOLEAN;
  v_knockout  BOOLEAN;
  v_pred      RECORD;
  v_pts       INTEGER;
  v_count     INTEGER := 0;
BEGIN
  SELECT * INTO v_match FROM matches WHERE id = p_match_id;
  IF NOT FOUND OR v_match.status <> 'finished' OR v_match.home_score_90 IS NULL THEN
    RAISE EXCEPTION 'Partido % no encontrado o sin resultado', p_match_id;
  END IF;
  IF NOT can_load_results(v_match.competition_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  -- Knockout SOLO en competencias con motor de avance (Mundial); ahí los
  -- partidos de eliminatoria no tienen group_id. En ligas (sin motor) y en
  -- series (group_id no nulo) nunca es knockout: no se aplica el bonus de
  -- eliminatoria ni se evalúan ET/penales.
  SELECT (advancement_engine IS NOT NULL) INTO v_has_engine
  FROM competitions WHERE id = v_match.competition_id;
  v_knockout := COALESCE(v_has_engine, false) AND (v_match.group_id IS NULL);

  FOR v_pred IN
    SELECT pr.id, pr.home_score, pr.away_score, pr.home_score_et, pr.away_score_et,
           pr.predicted_pk_winner_id,
           sc.exact_score_points, sc.correct_winner_points, sc.correct_draw_points,
           sc.knockout_exact_score_bonus, sc.correct_et_result_points, sc.correct_pk_winner_points
    FROM predictions pr
    JOIN ten_comp_scoring sc ON sc.ten_comp_id = pr.ten_comp_id
    WHERE pr.match_id = p_match_id
  LOOP
    v_pts := 0;

    -- 90 minutos
    IF v_pred.home_score = v_match.home_score_90 AND v_pred.away_score = v_match.away_score_90 THEN
      v_pts := v_pts + v_pred.exact_score_points;
      IF v_knockout THEN v_pts := v_pts + v_pred.knockout_exact_score_bonus; END IF;
    ELSIF (v_pred.home_score > v_pred.away_score AND v_match.home_score_90 > v_match.away_score_90)
       OR (v_pred.home_score < v_pred.away_score AND v_match.home_score_90 < v_match.away_score_90) THEN
      v_pts := v_pts + v_pred.correct_winner_points;
    ELSIF v_pred.home_score = v_pred.away_score AND v_match.home_score_90 = v_match.away_score_90 THEN
      v_pts := v_pts + v_pred.correct_draw_points;
    END IF;

    -- Tiempo extra (solo eliminatorias)
    IF v_knockout AND v_match.home_score_et IS NOT NULL AND v_pred.home_score_et IS NOT NULL
       AND v_pred.home_score_et = v_match.home_score_et
       AND v_pred.away_score_et = v_match.away_score_et THEN
      v_pts := v_pts + v_pred.correct_et_result_points;
    END IF;

    -- Penales (solo eliminatorias)
    IF v_knockout AND v_match.winner_team_id IS NOT NULL AND v_match.home_score_pk IS NOT NULL
       AND v_pred.predicted_pk_winner_id IS NOT NULL
       AND v_pred.predicted_pk_winner_id = v_match.winner_team_id THEN
      v_pts := v_pts + v_pred.correct_pk_winner_points;
    END IF;

    UPDATE predictions SET points_earned = v_pts, updated_at = now() WHERE id = v_pred.id;
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

-- ----------------------------------------------------------------------------
-- recalculate_all: poblar el cuadro solo si hay motor de avance.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION recalculate_all(p_competition_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_match_id UUID; v_match_count INT := 0; v_pred_count INT := 0;
  v_knockout_n INT := 0; v_bonus_n INT := 0; v_tmp INT;
  v_has_engine BOOLEAN;
BEGIN
  IF NOT can_load_results(p_competition_id) THEN RAISE EXCEPTION 'Access denied'; END IF;

  FOR v_match_id IN
    SELECT id FROM matches
    WHERE competition_id = p_competition_id AND status = 'finished' ORDER BY match_number
  LOOP
    BEGIN
      SELECT calculate_match_points(v_match_id) INTO v_tmp;
      v_pred_count := v_pred_count + v_tmp;
      v_match_count := v_match_count + 1;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END LOOP;

  -- Solo las competencias con motor de avance (p.ej. Mundial) pueblan cuadro.
  SELECT (advancement_engine IS NOT NULL) INTO v_has_engine
  FROM competitions WHERE id = p_competition_id;
  IF COALESCE(v_has_engine, false) THEN
    SELECT populate_knockout(p_competition_id) INTO v_knockout_n;
  END IF;

  SELECT calculate_bonus_points(p_competition_id) INTO v_bonus_n;

  RETURN jsonb_build_object(
    'matches_processed', v_match_count, 'predictions_updated', v_pred_count,
    'knockout_slots_updated', v_knockout_n, 'bonus_rows_updated', v_bonus_n);
END;
$$;
