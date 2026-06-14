-- ============================================================
-- 03_VIEWS_FUNCTIONS.SQL — Penca Mundial 2026
-- Ejecutar DESPUÉS de 02_auth_rls.sql
-- ============================================================

-- ============================================================
-- VISTA: TABLA DE POSICIONES POR GRUPO
-- Criterios FIFA: Pts > GD > GF > resultado directo > nombre
-- ============================================================
CREATE OR REPLACE VIEW group_standings AS
WITH resultados AS (
  -- Perspectiva equipo local
  SELECT
    m.group_id,
    m.home_team_id                                           AS team_id,
    CASE WHEN m.home_score_90 > m.away_score_90 THEN 1 ELSE 0 END AS won,
    CASE WHEN m.home_score_90 = m.away_score_90 THEN 1 ELSE 0 END AS drawn,
    CASE WHEN m.home_score_90 < m.away_score_90 THEN 1 ELSE 0 END AS lost,
    m.home_score_90::INT AS gf,
    m.away_score_90::INT AS gc
  FROM matches m
  WHERE m.status = 'finished'
    AND m.group_id IS NOT NULL
    AND m.home_score_90 IS NOT NULL
    AND m.home_team_id IS NOT NULL

  UNION ALL

  -- Perspectiva equipo visitante
  SELECT
    m.group_id,
    m.away_team_id,
    CASE WHEN m.away_score_90 > m.home_score_90 THEN 1 ELSE 0 END,
    CASE WHEN m.away_score_90 = m.home_score_90 THEN 1 ELSE 0 END,
    CASE WHEN m.away_score_90 < m.home_score_90 THEN 1 ELSE 0 END,
    m.away_score_90::INT,
    m.home_score_90::INT
  FROM matches m
  WHERE m.status = 'finished'
    AND m.group_id IS NOT NULL
    AND m.away_score_90 IS NOT NULL
    AND m.away_team_id IS NOT NULL
),
stats AS (
  SELECT
    group_id, team_id,
    COUNT(*)::INT                          AS pj,
    SUM(won)::INT                          AS pg,
    SUM(drawn)::INT                        AS pe,
    SUM(lost)::INT                         AS pp,
    SUM(gf)::INT                           AS gf,
    SUM(gc)::INT                           AS gc,
    (SUM(gf) - SUM(gc))::INT              AS gd,
    (SUM(won) * 3 + SUM(drawn))::INT      AS pts
  FROM resultados
  GROUP BY group_id, team_id
)
SELECT
  t.id                           AS team_id,
  t.group_id,
  g.name                         AS group_name,
  g."order"                      AS group_order,
  t.name                         AS team_name,
  t.abbreviation                 AS team_abbreviation,
  t.flag_url                     AS team_flag_url,
  t.is_confirmed,
  t.placeholder_name,
  COALESCE(s.pj,  0)             AS pj,
  COALESCE(s.pg,  0)             AS pg,
  COALESCE(s.pe,  0)             AS pe,
  COALESCE(s.pp,  0)             AS pp,
  COALESCE(s.gf,  0)             AS gf,
  COALESCE(s.gc,  0)             AS gc,
  COALESCE(s.gd,  0)             AS gd,
  COALESCE(s.pts, 0)             AS pts,
  ROW_NUMBER() OVER (
    PARTITION BY t.group_id
    ORDER BY
      COALESCE(s.pts, 0) DESC,
      COALESCE(s.gd,  0) DESC,
      COALESCE(s.gf,  0) DESC,
      t.name ASC
  )::INT                         AS position
FROM teams t
JOIN groups g ON g.id = t.group_id
LEFT JOIN stats s ON s.team_id = t.id AND s.group_id = t.group_id
ORDER BY g."order", position;

-- ============================================================
-- VISTA: RANKING MEJORES TERCEROS
-- ============================================================
CREATE OR REPLACE VIEW best_third_ranking AS
SELECT
  team_id, group_id, group_name, team_name, team_flag_url,
  is_confirmed, placeholder_name,
  pj, pg, pe, pp, gf, gc, gd, pts,
  ROW_NUMBER() OVER (
    ORDER BY pts DESC, gd DESC, gf DESC, team_name ASC
  )::INT AS rank
FROM group_standings
WHERE position = 3;

-- ============================================================
-- VISTA: RANKING GENERAL DE JUGADORES
-- ============================================================
CREATE OR REPLACE VIEW leaderboard AS
SELECT
  p.id            AS user_id,
  p.username,
  p.display_name,
  p.avatar_url,
  COALESCE(SUM(pr.points_earned), 0)::INT                     AS total_points,
  COUNT(pr.id)::INT                                            AS predictions_count,
  COUNT(CASE
    WHEN m.status = 'finished'
      AND pr.home_score = m.home_score_90
      AND pr.away_score = m.away_score_90
    THEN 1 END)::INT                                           AS exact_scores,
  COUNT(CASE
    WHEN m.status = 'finished'
      AND COALESCE(pr.points_earned, 0) > 0
    THEN 1 END)::INT                                           AS correct_predictions,
  RANK() OVER (
    ORDER BY COALESCE(SUM(pr.points_earned), 0) DESC
  )::INT                                                       AS rank
FROM profiles p
LEFT JOIN predictions pr ON pr.user_id = p.id
LEFT JOIN matches m ON m.id = pr.match_id
WHERE p.is_active = true
GROUP BY p.id, p.username, p.display_name, p.avatar_url;

-- ============================================================
-- TRIGGER: Auto-calcular winner_team_id al cerrar partido
-- ============================================================
CREATE OR REPLACE FUNCTION auto_set_match_winner()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'finished' AND NEW.home_score_90 IS NOT NULL THEN
    -- Penales
    IF NEW.home_score_pk IS NOT NULL AND NEW.away_score_pk IS NOT NULL THEN
      NEW.winner_team_id := CASE
        WHEN NEW.home_score_pk > NEW.away_score_pk THEN NEW.home_team_id
        ELSE NEW.away_team_id
      END;
    -- Tiempo extra (marcador diferente)
    ELSIF NEW.home_score_et IS NOT NULL AND NEW.away_score_et IS NOT NULL
          AND NEW.home_score_et != NEW.away_score_et THEN
      NEW.winner_team_id := CASE
        WHEN NEW.home_score_et > NEW.away_score_et THEN NEW.home_team_id
        ELSE NEW.away_team_id
      END;
    -- 90 minutos
    ELSIF NEW.home_score_90 != NEW.away_score_90 THEN
      NEW.winner_team_id := CASE
        WHEN NEW.home_score_90 > NEW.away_score_90 THEN NEW.home_team_id
        ELSE NEW.away_team_id
      END;
    -- Empate fase de grupos: winner_team_id queda NULL
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_match_winner ON matches;
CREATE TRIGGER trg_match_winner
  BEFORE UPDATE ON matches
  FOR EACH ROW
  WHEN (NEW.status = 'finished')
  EXECUTE FUNCTION auto_set_match_winner();

-- ============================================================
-- FUNCIÓN: Calcular puntos para todas las predicciones de un partido
-- Llamar desde el admin después de cargar el resultado
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
      -- Resultado exacto
      v_pts := v_pts + v_config.exact_score_points;
      IF v_knockout THEN
        v_pts := v_pts + v_config.knockout_exact_score_bonus;
      END IF;
    ELSIF (v_pred.home_score > v_pred.away_score AND v_match.home_score_90 > v_match.away_score_90)
       OR (v_pred.home_score < v_pred.away_score AND v_match.home_score_90 < v_match.away_score_90) THEN
      -- Ganador correcto
      v_pts := v_pts + v_config.correct_winner_points;
    ELSIF v_pred.home_score = v_pred.away_score
          AND v_match.home_score_90 = v_match.away_score_90 THEN
      -- Empate correcto
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
-- FUNCIÓN: Popular equipos en partidos eliminatorios
-- Llamar desde el admin al completar cada fase
-- ============================================================
CREATE OR REPLACE FUNCTION populate_knockout_matches()
RETURNS INTEGER AS $$
DECLARE
  v_rule    knockout_slot_rules%ROWTYPE;
  v_team_id UUID;
  v_count   INTEGER := 0;
BEGIN
  FOR v_rule IN SELECT * FROM knockout_slot_rules ORDER BY match_id LOOP
    v_team_id := NULL;

    IF v_rule.rule_type = 'group_position' THEN
      SELECT team_id INTO v_team_id
      FROM group_standings
      WHERE group_id = v_rule.source_group_id
        AND position  = v_rule.position
      LIMIT 1;

    ELSIF v_rule.rule_type = 'best_third' THEN
      -- Toma el mejor 3ro de los grupos elegibles según rank global
      SELECT btr.team_id INTO v_team_id
      FROM best_third_ranking btr
      JOIN groups g ON g.id = btr.group_id
      WHERE g.name = ANY(v_rule.third_groups::TEXT[])
      ORDER BY btr.rank
      LIMIT 1 OFFSET COALESCE(v_rule.position - 1, 0);

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
-- TRIGGER: updated_at automático en predicciones
-- ============================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_predictions_updated_at ON predictions;
CREATE TRIGGER trg_predictions_updated_at
  BEFORE UPDATE ON predictions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
