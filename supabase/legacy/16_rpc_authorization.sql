-- ============================================================
-- 16_RPC_AUTHORIZATION.SQL — PencaLes 2026
-- #4 — Verificación de rol en funciones SECURITY DEFINER que antes
--      eran invocables por cualquier usuario autenticado.
--
--   • Flujo de carga de resultados (admin O cargador):
--       calculate_match_points, populate_knockout_matches,
--       calculate_bonus_points, recalculate_all
--   • Solo admin:
--       admin_get_group_predictions
--
-- Los cuerpos se reproducen idénticos a su versión vigente
-- (populate_knockout_matches = versión de 09_combinaciones.sql);
-- el único cambio funcional es el guard al inicio.
-- Idempotente. Ejecutar DESPUÉS de 09, 10, 13 y 14.
-- ============================================================

-- ── Helper de autorización ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION assert_admin_or_loader()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND (is_admin = true OR is_loader = true)
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
END;
$$;

-- ============================================================
-- calculate_match_points (admin o loader)
-- ============================================================
CREATE OR REPLACE FUNCTION calculate_match_points(p_match_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_match    matches%ROWTYPE;
  v_config   scoring_config%ROWTYPE;
  v_pred     predictions%ROWTYPE;
  v_pts      INTEGER;
  v_count    INTEGER := 0;
  v_knockout BOOLEAN;
BEGIN
  PERFORM assert_admin_or_loader();

  SELECT * INTO v_match FROM matches WHERE id = p_match_id;
  IF NOT FOUND OR v_match.status != 'finished' OR v_match.home_score_90 IS NULL THEN
    RAISE EXCEPTION 'Partido % no encontrado o sin resultado', p_match_id;
  END IF;

  SELECT * INTO v_config FROM scoring_config WHERE is_active = true LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No hay configuración de puntuación activa';
  END IF;

  v_knockout := (v_match.group_id IS NULL);

  FOR v_pred IN SELECT * FROM predictions WHERE match_id = p_match_id LOOP
    v_pts := 0;

    -- 1. Resultado a los 90 min
    IF v_pred.home_score = v_match.home_score_90
       AND v_pred.away_score = v_match.away_score_90 THEN
      v_pts := v_pts + v_config.exact_score_points;
      IF v_knockout THEN
        v_pts := v_pts + v_config.knockout_exact_score_bonus;
      END IF;
    ELSIF (v_pred.home_score > v_pred.away_score AND v_match.home_score_90 > v_match.away_score_90)
       OR (v_pred.home_score < v_pred.away_score AND v_match.home_score_90 < v_match.away_score_90) THEN
      v_pts := v_pts + v_config.correct_winner_points;
    ELSIF v_pred.home_score = v_pred.away_score
          AND v_match.home_score_90 = v_match.away_score_90 THEN
      v_pts := v_pts + v_config.correct_draw_points;
    END IF;

    -- 2. Tiempo extra (solo eliminatorias)
    IF v_knockout
       AND v_match.home_score_et IS NOT NULL
       AND v_pred.home_score_et  IS NOT NULL
       AND v_pred.home_score_et = v_match.home_score_et
       AND v_pred.away_score_et = v_match.away_score_et THEN
      v_pts := v_pts + v_config.correct_et_result_points;
    END IF;

    -- 3. Penales (solo eliminatorias)
    IF v_knockout
       AND v_match.winner_team_id     IS NOT NULL
       AND v_match.home_score_pk      IS NOT NULL
       AND v_pred.predicted_pk_winner_id IS NOT NULL
       AND v_pred.predicted_pk_winner_id = v_match.winner_team_id THEN
      v_pts := v_pts + v_config.correct_pk_winner_points;
    END IF;

    UPDATE predictions
    SET points_earned = v_pts, updated_at = now()
    WHERE id = v_pred.id;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- populate_knockout_matches (admin o loader)
-- Versión vigente: usa la tabla combinaciones (de 09_combinaciones.sql)
-- ============================================================
CREATE OR REPLACE FUNCTION populate_knockout_matches()
RETURNS INTEGER AS $$
DECLARE
  v_rule       knockout_slot_rules%ROWTYPE;
  v_team_id    UUID;
  v_count      INTEGER := 0;
  v_comb_key   TEXT;
  v_home_group TEXT;
  v_rival_col  TEXT;
BEGIN
  PERFORM assert_admin_or_loader();

  -- Paso 1: Calcular clave de combinación (8 letras ordenadas de los mejores terceros)
  SELECT STRING_AGG(g.name, '' ORDER BY g.name)
  INTO v_comb_key
  FROM (
    SELECT btr.group_id
    FROM best_third_ranking btr
    ORDER BY btr.rank
    LIMIT 8
  ) top8
  JOIN groups g ON g.id = top8.group_id;

  FOR v_rule IN SELECT * FROM knockout_slot_rules ORDER BY match_id, slot LOOP
    v_team_id := NULL;

    IF v_rule.rule_type = 'group_position' THEN
      SELECT gs.team_id INTO v_team_id
      FROM group_standings gs
      WHERE gs.group_id = v_rule.source_group_id
        AND gs.position  = v_rule.position
      LIMIT 1;

    ELSIF v_rule.rule_type = 'best_third' THEN
      IF v_comb_key IS NOT NULL AND LENGTH(v_comb_key) = 8 THEN
        SELECT g.name INTO v_home_group
        FROM knockout_slot_rules ksr
        JOIN groups g ON g.id = ksr.source_group_id
        WHERE ksr.match_id = v_rule.match_id
          AND ksr.slot = 'home'
          AND ksr.rule_type = 'group_position'
        LIMIT 1;

        SELECT CASE v_home_group
          WHEN 'A' THEN c.rival_1a
          WHEN 'B' THEN c.rival_1b
          WHEN 'D' THEN c.rival_1d
          WHEN 'E' THEN c.rival_1e
          WHEN 'G' THEN c.rival_1g
          WHEN 'I' THEN c.rival_1i
          WHEN 'K' THEN c.rival_1k
          WHEN 'L' THEN c.rival_1l
          ELSE NULL
        END INTO v_rival_col
        FROM combinaciones c
        WHERE c.combinacion = v_comb_key;

        IF v_rival_col IS NOT NULL THEN
          SELECT gs.team_id INTO v_team_id
          FROM group_standings gs
          JOIN groups g ON g.id = gs.group_id
          WHERE g.name = SUBSTRING(v_rival_col FROM 2)
            AND gs.position = 3
          LIMIT 1;
        END IF;
      END IF;

    ELSIF v_rule.rule_type = 'match_winner' THEN
      SELECT winner_team_id INTO v_team_id
      FROM matches WHERE id = v_rule.source_match_id;

    ELSIF v_rule.rule_type = 'match_loser' THEN
      SELECT CASE
        WHEN winner_team_id = home_team_id THEN away_team_id
        ELSE home_team_id
      END INTO v_team_id
      FROM matches WHERE id = v_rule.source_match_id;
    END IF;

    IF v_team_id IS NOT NULL THEN
      IF v_rule.slot = 'home' THEN
        UPDATE matches SET home_team_id = v_team_id WHERE id = v_rule.match_id;
      ELSE
        UPDATE matches SET away_team_id = v_team_id WHERE id = v_rule.match_id;
      END IF;
      v_count := v_count + 1;
    END IF;
  END LOOP;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- calculate_bonus_points (admin o loader)
-- ============================================================
CREATE OR REPLACE FUNCTION calculate_bonus_points()
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  cfg_exacto    INT; cfg_pres     INT; cfg_empates INT;
  cfg_rango     INT; cfg_fin_cero INT; cfg_top_team INT; cfg_top_grp INT;
  groups_done   BOOLEAN; podio_done BOOLEAN;
  actual_empates    INT;
  actual_top_grp_id UUID;
  actual_goal_total INT;
  actual_rango      TEXT;
  actual_fin_cero   BOOLEAN;
  actual_top_team_id UUID;
  actual_1st UUID; actual_2nd UUID; actual_3rd UUID; actual_4th UUID;
  rec     RECORD;
  pts     INT;
  det     JSONB;
  cnt     INT := 0;
BEGIN
  PERFORM assert_admin_or_loader();

  -- Cargar config
  SELECT points INTO cfg_exacto    FROM bonus_config WHERE bonus_type='podio_exacto';
  SELECT points INTO cfg_pres      FROM bonus_config WHERE bonus_type='podio_presencia';
  SELECT points INTO cfg_empates   FROM bonus_config WHERE bonus_type='empates_grupos';
  SELECT points INTO cfg_rango     FROM bonus_config WHERE bonus_type='rango_goles';
  SELECT points INTO cfg_fin_cero  FROM bonus_config WHERE bonus_type='final_cero';
  SELECT points INTO cfg_top_team  FROM bonus_config WHERE bonus_type='top_scorer_team';
  SELECT points INTO cfg_top_grp   FROM bonus_config WHERE bonus_type='top_group_goals';

  -- ¿Fase de grupos completa? (72 partidos terminados)
  SELECT (COUNT(*) = 72) INTO groups_done
    FROM matches m JOIN phases ph ON m.phase_id = ph.id
    WHERE ph."order" = 1 AND m.status = 'finished';

  -- ¿Final y tercer puesto terminados?
  SELECT (
    (SELECT COUNT(*) FROM matches WHERE match_number IN (103,104) AND status='finished') = 2
  ) INTO podio_done;

  -- ══ Bonuses de fase de grupos ══════════════════════════════════════════════
  IF groups_done THEN
    SELECT COUNT(*)::INT INTO actual_empates
      FROM matches m JOIN phases ph ON m.phase_id = ph.id
      WHERE ph."order" = 1 AND m.status = 'finished'
        AND m.home_score_90 = m.away_score_90;

    SELECT g.id INTO actual_top_grp_id
      FROM matches m
      JOIN phases ph ON m.phase_id = ph.id
      JOIN groups  g  ON m.group_id = g.id
      WHERE ph."order" = 1 AND m.status = 'finished'
      GROUP BY g.id
      ORDER BY SUM(m.home_score_90 + m.away_score_90) DESC
      LIMIT 1;

    FOR rec IN SELECT * FROM bonus_predictions WHERE empates_grupos IS NOT NULL LOOP
      pts := CASE WHEN rec.empates_grupos = actual_empates THEN cfg_empates ELSE 0 END;
      det := jsonb_build_object('predicted', rec.empates_grupos, 'actual', actual_empates);
      INSERT INTO bonus_points(user_id,bonus_type,points_earned,detail)
      VALUES(rec.user_id,'empates_grupos',pts,det)
      ON CONFLICT(user_id,bonus_type) DO UPDATE
        SET points_earned=EXCLUDED.points_earned, detail=EXCLUDED.detail, calculated_at=now();
      cnt := cnt + 1;
    END LOOP;

    FOR rec IN SELECT * FROM bonus_predictions WHERE top_group_id IS NOT NULL LOOP
      pts := CASE WHEN rec.top_group_id = actual_top_grp_id THEN cfg_top_grp ELSE 0 END;
      det := jsonb_build_object('predicted_id',rec.top_group_id,'actual_id',actual_top_grp_id);
      INSERT INTO bonus_points(user_id,bonus_type,points_earned,detail)
      VALUES(rec.user_id,'top_group_goals',pts,det)
      ON CONFLICT(user_id,bonus_type) DO UPDATE
        SET points_earned=EXCLUDED.points_earned, detail=EXCLUDED.detail, calculated_at=now();
      cnt := cnt + 1;
    END LOOP;
  END IF;

  -- ══ Bonuses post-final ══════════════════════════════════════════════════════
  IF podio_done THEN
    SELECT COALESCE(SUM(
      home_score_90 + away_score_90 +
      COALESCE(home_score_et,0) + COALESCE(away_score_et,0)
    ),0)::INT INTO actual_goal_total
    FROM matches WHERE status = 'finished';

    actual_rango := CASE
      WHEN actual_goal_total BETWEEN   1 AND  20 THEN '1-20'
      WHEN actual_goal_total BETWEEN  21 AND  40 THEN '21-40'
      WHEN actual_goal_total BETWEEN  41 AND  60 THEN '41-60'
      WHEN actual_goal_total BETWEEN  61 AND  80 THEN '61-80'
      WHEN actual_goal_total BETWEEN  81 AND 100 THEN '81-100'
      WHEN actual_goal_total BETWEEN 101 AND 120 THEN '101-120'
      WHEN actual_goal_total BETWEEN 121 AND 140 THEN '121-140'
      WHEN actual_goal_total BETWEEN 141 AND 160 THEN '141-160'
      WHEN actual_goal_total BETWEEN 161 AND 180 THEN '161-180'
      WHEN actual_goal_total BETWEEN 181 AND 200 THEN '181-200'
      WHEN actual_goal_total BETWEEN 201 AND 220 THEN '201-220'
      WHEN actual_goal_total BETWEEN 221 AND 240 THEN '221-240'
      WHEN actual_goal_total BETWEEN 241 AND 260 THEN '241-260'
      WHEN actual_goal_total BETWEEN 261 AND 280 THEN '261-280'
      WHEN actual_goal_total BETWEEN 281 AND 300 THEN '281-300'
      WHEN actual_goal_total BETWEEN 301 AND 320 THEN '301-320'
      WHEN actual_goal_total BETWEEN 321 AND 340 THEN '321-340'
      ELSE '341+'
    END;

    SELECT (home_score_90 = 0 AND away_score_90 = 0)
    INTO actual_fin_cero
    FROM matches WHERE match_number = 104;

    SELECT team_id INTO actual_top_team_id FROM (
      SELECT home_team_id AS team_id,
             SUM(home_score_90 + COALESCE(home_score_et,0)) AS g
      FROM matches WHERE status='finished' AND home_team_id IS NOT NULL
      GROUP BY home_team_id
      UNION ALL
      SELECT away_team_id,
             SUM(away_score_90 + COALESCE(away_score_et,0))
      FROM matches WHERE status='finished' AND away_team_id IS NOT NULL
      GROUP BY away_team_id
    ) sub GROUP BY team_id ORDER BY SUM(g) DESC LIMIT 1;

    SELECT winner_team_id,
      CASE WHEN home_team_id = winner_team_id THEN away_team_id ELSE home_team_id END
    INTO actual_1st, actual_2nd
    FROM matches WHERE match_number = 104;

    SELECT winner_team_id,
      CASE WHEN home_team_id = winner_team_id THEN away_team_id ELSE home_team_id END
    INTO actual_3rd, actual_4th
    FROM matches WHERE match_number = 103;

    FOR rec IN SELECT * FROM bonus_predictions WHERE rango_goles IS NOT NULL LOOP
      pts := CASE WHEN rec.rango_goles = actual_rango THEN cfg_rango ELSE 0 END;
      det := jsonb_build_object('predicted',rec.rango_goles,'actual',actual_rango,'total_goals',actual_goal_total);
      INSERT INTO bonus_points(user_id,bonus_type,points_earned,detail)
      VALUES(rec.user_id,'rango_goles',pts,det)
      ON CONFLICT(user_id,bonus_type) DO UPDATE
        SET points_earned=EXCLUDED.points_earned, detail=EXCLUDED.detail, calculated_at=now();
      cnt := cnt + 1;
    END LOOP;

    FOR rec IN SELECT * FROM bonus_predictions WHERE final_cero IS NOT NULL LOOP
      pts := CASE WHEN rec.final_cero = actual_fin_cero THEN cfg_fin_cero ELSE 0 END;
      det := jsonb_build_object('predicted',rec.final_cero,'actual',actual_fin_cero);
      INSERT INTO bonus_points(user_id,bonus_type,points_earned,detail)
      VALUES(rec.user_id,'final_cero',pts,det)
      ON CONFLICT(user_id,bonus_type) DO UPDATE
        SET points_earned=EXCLUDED.points_earned, detail=EXCLUDED.detail, calculated_at=now();
      cnt := cnt + 1;
    END LOOP;

    FOR rec IN SELECT * FROM bonus_predictions WHERE top_scorer_team_id IS NOT NULL LOOP
      pts := CASE WHEN rec.top_scorer_team_id = actual_top_team_id THEN cfg_top_team ELSE 0 END;
      det := jsonb_build_object('predicted_id',rec.top_scorer_team_id,'actual_id',actual_top_team_id);
      INSERT INTO bonus_points(user_id,bonus_type,points_earned,detail)
      VALUES(rec.user_id,'top_scorer_team',pts,det)
      ON CONFLICT(user_id,bonus_type) DO UPDATE
        SET points_earned=EXCLUDED.points_earned, detail=EXCLUDED.detail, calculated_at=now();
      cnt := cnt + 1;
    END LOOP;

    FOR rec IN
      SELECT * FROM bonus_predictions
      WHERE podio_1st_id IS NOT NULL OR podio_2nd_id IS NOT NULL
         OR podio_3rd_id IS NOT NULL OR podio_4th_id IS NOT NULL
    LOOP
      pts := 0;
      IF rec.podio_1st_id IS NOT NULL AND rec.podio_1st_id = actual_1st THEN pts := pts + cfg_exacto; END IF;
      IF rec.podio_2nd_id IS NOT NULL AND rec.podio_2nd_id = actual_2nd THEN pts := pts + cfg_exacto; END IF;
      IF rec.podio_3rd_id IS NOT NULL AND rec.podio_3rd_id = actual_3rd THEN pts := pts + cfg_exacto; END IF;
      IF rec.podio_4th_id IS NOT NULL AND rec.podio_4th_id = actual_4th THEN pts := pts + cfg_exacto; END IF;
      IF rec.podio_1st_id IS NOT NULL AND rec.podio_1st_id != actual_1st
         AND (rec.podio_1st_id = actual_2nd OR rec.podio_1st_id = actual_3rd OR rec.podio_1st_id = actual_4th)
      THEN pts := pts + cfg_pres; END IF;
      IF rec.podio_2nd_id IS NOT NULL AND rec.podio_2nd_id != actual_2nd
         AND (rec.podio_2nd_id = actual_1st OR rec.podio_2nd_id = actual_3rd OR rec.podio_2nd_id = actual_4th)
      THEN pts := pts + cfg_pres; END IF;
      IF rec.podio_3rd_id IS NOT NULL AND rec.podio_3rd_id != actual_3rd
         AND (rec.podio_3rd_id = actual_1st OR rec.podio_3rd_id = actual_2nd OR rec.podio_3rd_id = actual_4th)
      THEN pts := pts + cfg_pres; END IF;
      IF rec.podio_4th_id IS NOT NULL AND rec.podio_4th_id != actual_4th
         AND (rec.podio_4th_id = actual_1st OR rec.podio_4th_id = actual_2nd OR rec.podio_4th_id = actual_3rd)
      THEN pts := pts + cfg_pres; END IF;

      det := jsonb_build_object(
        'predicted', jsonb_build_object('1st',rec.podio_1st_id,'2nd',rec.podio_2nd_id,'3rd',rec.podio_3rd_id,'4th',rec.podio_4th_id),
        'actual',    jsonb_build_object('1st',actual_1st,'2nd',actual_2nd,'3rd',actual_3rd,'4th',actual_4th)
      );
      INSERT INTO bonus_points(user_id,bonus_type,points_earned,detail)
      VALUES(rec.user_id,'podio',pts,det)
      ON CONFLICT(user_id,bonus_type) DO UPDATE
        SET points_earned=EXCLUDED.points_earned, detail=EXCLUDED.detail, calculated_at=now();
      cnt := cnt + 1;
    END LOOP;
  END IF;

  RETURN cnt;
END;
$$;

-- ============================================================
-- recalculate_all (admin o loader)
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
  PERFORM assert_admin_or_loader();

  -- 1. Recalcular puntos de predicciones para cada partido finalizado
  FOR v_match_id IN
    SELECT id FROM matches WHERE status = 'finished' ORDER BY match_number
  LOOP
    BEGIN
      SELECT calculate_match_points(v_match_id) INTO v_tmp;
      v_pred_count  := v_pred_count + v_tmp;
      v_match_count := v_match_count + 1;
    EXCEPTION WHEN OTHERS THEN
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

-- ============================================================
-- admin_get_group_predictions (solo admin)
-- ============================================================
CREATE OR REPLACE FUNCTION admin_get_group_predictions()
RETURNS TABLE(user_id uuid, group_preds_count int)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.user_id,
    COUNT(p.id)::int AS group_preds_count
  FROM predictions p
  INNER JOIN matches m ON m.id = p.match_id
  WHERE m.group_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM profiles adm
      WHERE adm.id = auth.uid() AND adm.is_admin = true
    )
  GROUP BY p.user_id;
$$;
