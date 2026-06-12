-- ============================================================================
-- 03_FUNCTIONS_VIEWS.SQL — PencaLes 2.0
-- Vistas (scoped por competencia / Ten-Comp), motores de avance y RPCs.
-- Ejecutar DESPUÉS de 02_rls.sql
-- ============================================================================

-- ════════════════════════════════════════════════════════════════════════════
-- VISTA: TABLA DE POSICIONES POR GRUPO (por competencia, con overrides)
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE VIEW group_standings AS
WITH resultados AS (
  SELECT m.competition_id, m.group_id, m.home_team_id AS team_id,
    CASE WHEN m.home_score_90 > m.away_score_90 THEN 1 ELSE 0 END AS won,
    CASE WHEN m.home_score_90 = m.away_score_90 THEN 1 ELSE 0 END AS drawn,
    CASE WHEN m.home_score_90 < m.away_score_90 THEN 1 ELSE 0 END AS lost,
    m.home_score_90::INT AS gf, m.away_score_90::INT AS gc
  FROM matches m
  WHERE m.status = 'finished' AND m.group_id IS NOT NULL
    AND m.home_score_90 IS NOT NULL AND m.home_team_id IS NOT NULL
  UNION ALL
  SELECT m.competition_id, m.group_id, m.away_team_id,
    CASE WHEN m.away_score_90 > m.home_score_90 THEN 1 ELSE 0 END,
    CASE WHEN m.away_score_90 = m.home_score_90 THEN 1 ELSE 0 END,
    CASE WHEN m.away_score_90 < m.home_score_90 THEN 1 ELSE 0 END,
    m.away_score_90::INT, m.home_score_90::INT
  FROM matches m
  WHERE m.status = 'finished' AND m.group_id IS NOT NULL
    AND m.away_score_90 IS NOT NULL AND m.away_team_id IS NOT NULL
),
stats AS (
  SELECT competition_id, group_id, team_id,
    COUNT(*)::INT AS pj, SUM(won)::INT AS pg, SUM(drawn)::INT AS pe, SUM(lost)::INT AS pp,
    SUM(gf)::INT AS gf, SUM(gc)::INT AS gc, (SUM(gf)-SUM(gc))::INT AS gd,
    (SUM(won)*3 + SUM(drawn))::INT AS pts
  FROM resultados GROUP BY competition_id, group_id, team_id
),
ranked AS (
  SELECT
    t.competition_id, t.id AS team_id, t.group_id,
    g.name AS group_name, g.sort_order AS group_order,
    t.name AS team_name, t.abbreviation AS team_abbreviation, t.flag_url AS team_flag_url,
    t.is_confirmed, t.placeholder_name,
    COALESCE(s.pj,0) AS pj, COALESCE(s.pg,0) AS pg, COALESCE(s.pe,0) AS pe, COALESCE(s.pp,0) AS pp,
    COALESCE(s.gf,0) AS gf, COALESCE(s.gc,0) AS gc, COALESCE(s.gd,0) AS gd, COALESCE(s.pts,0) AS pts,
    ROW_NUMBER() OVER (
      PARTITION BY t.group_id
      ORDER BY COALESCE(s.pts,0) DESC, COALESCE(s.gd,0) DESC, COALESCE(s.gf,0) DESC, t.name ASC
    )::INT AS auto_position,
    gpo.position AS override_position
  FROM teams t
  JOIN groups g ON g.id = t.group_id
  LEFT JOIN stats s ON s.team_id = t.id AND s.group_id = t.group_id
  LEFT JOIN group_position_overrides gpo ON gpo.team_id = t.id
  WHERE t.group_id IS NOT NULL
)
SELECT
  competition_id, team_id, group_id, group_name, group_order,
  team_name, team_abbreviation, team_flag_url, is_confirmed, placeholder_name,
  pj, pg, pe, pp, gf, gc, gd, pts,
  COALESCE(override_position, auto_position)::INT AS position,
  (override_position IS NOT NULL) AS has_override
FROM ranked
ORDER BY competition_id, group_order, COALESCE(override_position, auto_position);

-- ════════════════════════════════════════════════════════════════════════════
-- VISTA: RANKING MEJORES TERCEROS (por competencia, con overrides)
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE VIEW best_third_ranking AS
WITH auto_ranked AS (
  SELECT
    gs.competition_id, gs.team_id, gs.group_id, gs.group_name, gs.team_name, gs.team_flag_url,
    gs.is_confirmed, gs.placeholder_name,
    gs.pj, gs.pg, gs.pe, gs.pp, gs.gf, gs.gc, gs.gd, gs.pts,
    ROW_NUMBER() OVER (
      PARTITION BY gs.competition_id
      ORDER BY gs.pts DESC, gs.gd DESC, gs.gf DESC, gs.team_name ASC
    )::INT AS auto_rank,
    btro.rank AS override_rank
  FROM group_standings gs
  LEFT JOIN best_third_rank_overrides btro ON btro.team_id = gs.team_id
  WHERE gs.position = 3
)
SELECT
  competition_id, team_id, group_id, group_name, team_name, team_flag_url,
  is_confirmed, placeholder_name, pj, pg, pe, pp, gf, gc, gd, pts,
  COALESCE(override_rank, auto_rank)::INT AS rank,
  (override_rank IS NOT NULL) AS has_override
FROM auto_ranked
ORDER BY competition_id, COALESCE(override_rank, auto_rank);

-- ════════════════════════════════════════════════════════════════════════════
-- VISTA: RANKING (LEADERBOARD) POR TEN-COMP
-- Suma SOLO puntos de ese Ten-Comp. Solo miembros aprobados.
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE VIEW leaderboard AS
SELECT
  tcm.ten_comp_id,
  tcm.user_id,
  p.username, p.display_name, p.avatar_url,
  (
    COALESCE(SUM(pr.points_earned), 0) +
    COALESCE((SELECT SUM(bp.points_earned) FROM bonus_points bp
              WHERE bp.user_id = tcm.user_id AND bp.ten_comp_id = tcm.ten_comp_id), 0)
  )::INT AS total_points,
  COUNT(pr.id)::INT AS predictions_count,
  COUNT(CASE WHEN m.status = 'finished'
             AND pr.home_score = m.home_score_90 AND pr.away_score = m.away_score_90
        THEN 1 END)::INT AS exact_scores,
  COUNT(CASE WHEN m.status = 'finished' AND COALESCE(pr.points_earned,0) > 0
        THEN 1 END)::INT AS correct_predictions,
  RANK() OVER (
    PARTITION BY tcm.ten_comp_id
    ORDER BY (
      COALESCE(SUM(pr.points_earned), 0) +
      COALESCE((SELECT SUM(bp2.points_earned) FROM bonus_points bp2
                WHERE bp2.user_id = tcm.user_id AND bp2.ten_comp_id = tcm.ten_comp_id), 0)
    ) DESC
  )::INT AS rank
FROM ten_comp_members tcm
JOIN profiles p ON p.id = tcm.user_id
LEFT JOIN predictions pr ON pr.user_id = tcm.user_id AND pr.ten_comp_id = tcm.ten_comp_id
LEFT JOIN matches m ON m.id = pr.match_id
WHERE tcm.status = 'approved' AND p.is_active = true
GROUP BY tcm.ten_comp_id, tcm.user_id, p.username, p.display_name, p.avatar_url;

-- ════════════════════════════════════════════════════════════════════════════
-- VISTA: RANKING DE SUBGRUPOS
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE VIEW subgrupo_ranking
WITH (security_invoker = true) AS
SELECT
  sm.subgrupo_id, sm.user_id, sg.ten_comp_id,
  lb.total_points, lb.rank AS global_rank, lb.predictions_count, lb.exact_scores,
  lb.display_name, lb.username, lb.avatar_url,
  RANK() OVER (PARTITION BY sm.subgrupo_id ORDER BY lb.total_points DESC) AS subgrupo_rank
FROM subgrupo_members sm
JOIN subgrupos sg ON sg.id = sm.subgrupo_id
JOIN leaderboard lb ON lb.user_id = sm.user_id AND lb.ten_comp_id = sg.ten_comp_id
WHERE sg.is_active = true;

CREATE OR REPLACE VIEW my_subgrupos_view
WITH (security_invoker = true) AS
SELECT sg.id, sg.ten_comp_id, sg.name, sg.creator_id, sg.is_active, sg.created_at, sm.user_id
FROM subgrupo_members sm
JOIN subgrupos sg ON sg.id = sm.subgrupo_id;

-- ════════════════════════════════════════════════════════════════════════════
-- CÁLCULO DE PUNTOS — multi-Ten-Comp
-- Un resultado dispara el cálculo en TODOS los Ten-Comps de esa competencia,
-- aplicando el scoring propio de cada uno.
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION calculate_match_points(p_match_id UUID)
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_match    matches%ROWTYPE;
  v_knockout BOOLEAN;
  v_pred     RECORD;
  v_pts      INTEGER;
  v_count    INTEGER := 0;
BEGIN
  SELECT * INTO v_match FROM matches WHERE id = p_match_id;
  IF NOT FOUND OR v_match.status <> 'finished' OR v_match.home_score_90 IS NULL THEN
    RAISE EXCEPTION 'Partido % no encontrado o sin resultado', p_match_id;
  END IF;
  IF NOT can_load_results(v_match.competition_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  v_knockout := (v_match.group_id IS NULL);

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

-- ════════════════════════════════════════════════════════════════════════════
-- MOTOR DE AVANCE: dispatcher + wc48_best_thirds
-- ════════════════════════════════════════════════════════════════════════════

-- Dispatcher: lee competitions.advancement_engine y ejecuta su función.
CREATE OR REPLACE FUNCTION populate_knockout(p_competition_id UUID)
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_fn TEXT; v_count INTEGER;
BEGIN
  IF NOT can_load_results(p_competition_id) THEN RAISE EXCEPTION 'Access denied'; END IF;
  SELECT ae.fn_name INTO v_fn
  FROM competitions c JOIN advancement_engines ae ON ae.id = c.advancement_engine
  WHERE c.id = p_competition_id;
  IF v_fn IS NULL THEN RAISE EXCEPTION 'Competencia % sin motor de avance', p_competition_id; END IF;
  EXECUTE format('SELECT %I($1)', v_fn) INTO v_count USING p_competition_id;
  RETURN COALESCE(v_count, 0);
END;
$$;

-- Motor del Mundial 48 (12 grupos + mejores terceros). Port de la lógica v1,
-- scoped por competencia. No re-chequea autorización (lo hace el dispatcher).
CREATE OR REPLACE FUNCTION engine_wc48_best_thirds(p_competition_id UUID)
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_rule       knockout_slot_rules%ROWTYPE;
  v_team_id    UUID;
  v_count      INTEGER := 0;
  v_comb_key   TEXT;
  v_home_group TEXT;
  v_rival_col  TEXT;
BEGIN
  -- Clave de combinación: 8 letras ordenadas de los mejores terceros de esta competencia.
  SELECT STRING_AGG(g.name, '' ORDER BY g.name) INTO v_comb_key
  FROM (
    SELECT btr.group_id FROM best_third_ranking btr
    WHERE btr.competition_id = p_competition_id
    ORDER BY btr.rank LIMIT 8
  ) top8
  JOIN groups g ON g.id = top8.group_id;

  FOR v_rule IN
    SELECT * FROM knockout_slot_rules
    WHERE competition_id = p_competition_id ORDER BY match_id, slot
  LOOP
    v_team_id := NULL;

    IF v_rule.rule_type = 'group_position' THEN
      SELECT gs.team_id INTO v_team_id FROM group_standings gs
      WHERE gs.competition_id = p_competition_id
        AND gs.group_id = v_rule.source_group_id AND gs.position = v_rule.position
      LIMIT 1;

    ELSIF v_rule.rule_type = 'best_third' THEN
      IF v_comb_key IS NOT NULL AND LENGTH(v_comb_key) = 8 THEN
        SELECT g.name INTO v_home_group
        FROM knockout_slot_rules ksr JOIN groups g ON g.id = ksr.source_group_id
        WHERE ksr.match_id = v_rule.match_id AND ksr.slot = 'home'
          AND ksr.rule_type = 'group_position'
        LIMIT 1;

        SELECT CASE v_home_group
          WHEN 'A' THEN c.rival_1a WHEN 'B' THEN c.rival_1b WHEN 'D' THEN c.rival_1d
          WHEN 'E' THEN c.rival_1e WHEN 'G' THEN c.rival_1g WHEN 'I' THEN c.rival_1i
          WHEN 'K' THEN c.rival_1k WHEN 'L' THEN c.rival_1l ELSE NULL END
        INTO v_rival_col
        FROM combinaciones c
        WHERE c.competition_id = p_competition_id AND c.combinacion = v_comb_key;

        IF v_rival_col IS NOT NULL THEN
          SELECT gs.team_id INTO v_team_id
          FROM group_standings gs JOIN groups g ON g.id = gs.group_id
          WHERE gs.competition_id = p_competition_id
            AND g.name = SUBSTRING(v_rival_col FROM 2) AND gs.position = 3
          LIMIT 1;
        END IF;
      END IF;

    ELSIF v_rule.rule_type = 'match_winner' THEN
      SELECT winner_team_id INTO v_team_id FROM matches WHERE id = v_rule.source_match_id;

    ELSIF v_rule.rule_type = 'match_loser' THEN
      SELECT CASE WHEN winner_team_id = home_team_id THEN away_team_id ELSE home_team_id END
      INTO v_team_id FROM matches WHERE id = v_rule.source_match_id;
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
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- CÁLCULO DE BONUS — por Ten-Comp (lógica Mundial: fases/partidos 103-104)
-- Actuals se calculan una vez por competencia; luego se itera cada Ten-Comp
-- con bonus_enabled aplicando SUS puntos.
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION calculate_bonus_points(p_competition_id UUID)
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  groups_done BOOLEAN; podio_done BOOLEAN;
  actual_empates INT; actual_top_grp_id UUID; actual_goal_total INT; actual_rango TEXT;
  actual_fin_cero BOOLEAN; actual_top_team_id UUID;
  actual_1st UUID; actual_2nd UUID; actual_3rd UUID; actual_4th UUID;
  v_tc UUID;
  cfg_exacto INT; cfg_pres INT; cfg_empates INT; cfg_rango INT;
  cfg_fin_cero INT; cfg_top_team INT; cfg_top_grp INT;
  rec RECORD; pts INT; det JSONB; cnt INT := 0;
BEGIN
  IF NOT can_load_results(p_competition_id) THEN RAISE EXCEPTION 'Access denied'; END IF;

  -- ¿Fase de grupos completa? (todos los partidos de la fase sort_order=1 terminados)
  SELECT (COUNT(*) FILTER (WHERE m.status='finished') = COUNT(*)) AND COUNT(*) > 0
  INTO groups_done
  FROM matches m JOIN phases ph ON m.phase_id = ph.id
  WHERE m.competition_id = p_competition_id AND ph.sort_order = 1;

  SELECT (COUNT(*) FILTER (WHERE status='finished') = 2)
  INTO podio_done
  FROM matches WHERE competition_id = p_competition_id AND match_number IN (103,104);

  IF groups_done THEN
    SELECT COUNT(*)::INT INTO actual_empates
    FROM matches m JOIN phases ph ON m.phase_id = ph.id
    WHERE m.competition_id = p_competition_id AND ph.sort_order = 1
      AND m.status = 'finished' AND m.home_score_90 = m.away_score_90;

    SELECT g.id INTO actual_top_grp_id
    FROM matches m JOIN phases ph ON m.phase_id = ph.id JOIN groups g ON m.group_id = g.id
    WHERE m.competition_id = p_competition_id AND ph.sort_order = 1 AND m.status = 'finished'
    GROUP BY g.id ORDER BY SUM(m.home_score_90 + m.away_score_90) DESC LIMIT 1;
  END IF;

  IF podio_done THEN
    SELECT COALESCE(SUM(home_score_90 + away_score_90 +
      COALESCE(home_score_et,0) + COALESCE(away_score_et,0)),0)::INT
    INTO actual_goal_total
    FROM matches WHERE competition_id = p_competition_id AND status = 'finished';

    actual_rango := CASE
      WHEN actual_goal_total BETWEEN 1 AND 20 THEN '1-20'
      WHEN actual_goal_total BETWEEN 21 AND 40 THEN '21-40'
      WHEN actual_goal_total BETWEEN 41 AND 60 THEN '41-60'
      WHEN actual_goal_total BETWEEN 61 AND 80 THEN '61-80'
      WHEN actual_goal_total BETWEEN 81 AND 100 THEN '81-100'
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
      ELSE '341+' END;

    SELECT (home_score_90 = 0 AND away_score_90 = 0) INTO actual_fin_cero
    FROM matches WHERE competition_id = p_competition_id AND match_number = 104;

    SELECT team_id INTO actual_top_team_id FROM (
      SELECT home_team_id AS team_id, SUM(home_score_90 + COALESCE(home_score_et,0)) AS g
      FROM matches WHERE competition_id = p_competition_id AND status='finished' AND home_team_id IS NOT NULL
      GROUP BY home_team_id
      UNION ALL
      SELECT away_team_id, SUM(away_score_90 + COALESCE(away_score_et,0))
      FROM matches WHERE competition_id = p_competition_id AND status='finished' AND away_team_id IS NOT NULL
      GROUP BY away_team_id
    ) sub GROUP BY team_id ORDER BY SUM(g) DESC LIMIT 1;

    SELECT winner_team_id, CASE WHEN home_team_id = winner_team_id THEN away_team_id ELSE home_team_id END
    INTO actual_1st, actual_2nd
    FROM matches WHERE competition_id = p_competition_id AND match_number = 104;

    SELECT winner_team_id, CASE WHEN home_team_id = winner_team_id THEN away_team_id ELSE home_team_id END
    INTO actual_3rd, actual_4th
    FROM matches WHERE competition_id = p_competition_id AND match_number = 103;
  END IF;

  -- Iterar Ten-Comps con bonus habilitado.
  FOR v_tc IN SELECT id FROM ten_comps WHERE competition_id = p_competition_id AND bonus_enabled = true
  LOOP
    SELECT COALESCE(points,0) INTO cfg_exacto   FROM ten_comp_bonus_config WHERE ten_comp_id=v_tc AND bonus_type='podio_exacto';
    SELECT COALESCE(points,0) INTO cfg_pres     FROM ten_comp_bonus_config WHERE ten_comp_id=v_tc AND bonus_type='podio_presencia';
    SELECT COALESCE(points,0) INTO cfg_empates  FROM ten_comp_bonus_config WHERE ten_comp_id=v_tc AND bonus_type='empates_grupos';
    SELECT COALESCE(points,0) INTO cfg_rango    FROM ten_comp_bonus_config WHERE ten_comp_id=v_tc AND bonus_type='rango_goles';
    SELECT COALESCE(points,0) INTO cfg_fin_cero FROM ten_comp_bonus_config WHERE ten_comp_id=v_tc AND bonus_type='final_cero';
    SELECT COALESCE(points,0) INTO cfg_top_team FROM ten_comp_bonus_config WHERE ten_comp_id=v_tc AND bonus_type='top_scorer_team';
    SELECT COALESCE(points,0) INTO cfg_top_grp  FROM ten_comp_bonus_config WHERE ten_comp_id=v_tc AND bonus_type='top_group_goals';
    cfg_exacto:=COALESCE(cfg_exacto,0); cfg_pres:=COALESCE(cfg_pres,0); cfg_empates:=COALESCE(cfg_empates,0);
    cfg_rango:=COALESCE(cfg_rango,0); cfg_fin_cero:=COALESCE(cfg_fin_cero,0);
    cfg_top_team:=COALESCE(cfg_top_team,0); cfg_top_grp:=COALESCE(cfg_top_grp,0);

    IF groups_done THEN
      FOR rec IN SELECT * FROM bonus_predictions WHERE ten_comp_id=v_tc AND empates_grupos IS NOT NULL LOOP
        pts := CASE WHEN rec.empates_grupos = actual_empates THEN cfg_empates ELSE 0 END;
        det := jsonb_build_object('predicted',rec.empates_grupos,'actual',actual_empates);
        INSERT INTO bonus_points(ten_comp_id,user_id,bonus_type,points_earned,detail)
        VALUES(v_tc,rec.user_id,'empates_grupos',pts,det)
        ON CONFLICT(ten_comp_id,user_id,bonus_type) DO UPDATE
          SET points_earned=EXCLUDED.points_earned, detail=EXCLUDED.detail, calculated_at=now();
        cnt := cnt + 1;
      END LOOP;

      FOR rec IN SELECT * FROM bonus_predictions WHERE ten_comp_id=v_tc AND top_group_id IS NOT NULL LOOP
        pts := CASE WHEN rec.top_group_id = actual_top_grp_id THEN cfg_top_grp ELSE 0 END;
        det := jsonb_build_object('predicted_id',rec.top_group_id,'actual_id',actual_top_grp_id);
        INSERT INTO bonus_points(ten_comp_id,user_id,bonus_type,points_earned,detail)
        VALUES(v_tc,rec.user_id,'top_group_goals',pts,det)
        ON CONFLICT(ten_comp_id,user_id,bonus_type) DO UPDATE
          SET points_earned=EXCLUDED.points_earned, detail=EXCLUDED.detail, calculated_at=now();
        cnt := cnt + 1;
      END LOOP;
    END IF;

    IF podio_done THEN
      FOR rec IN SELECT * FROM bonus_predictions WHERE ten_comp_id=v_tc AND rango_goles IS NOT NULL LOOP
        pts := CASE WHEN rec.rango_goles = actual_rango THEN cfg_rango ELSE 0 END;
        det := jsonb_build_object('predicted',rec.rango_goles,'actual',actual_rango,'total_goals',actual_goal_total);
        INSERT INTO bonus_points(ten_comp_id,user_id,bonus_type,points_earned,detail)
        VALUES(v_tc,rec.user_id,'rango_goles',pts,det)
        ON CONFLICT(ten_comp_id,user_id,bonus_type) DO UPDATE
          SET points_earned=EXCLUDED.points_earned, detail=EXCLUDED.detail, calculated_at=now();
        cnt := cnt + 1;
      END LOOP;

      FOR rec IN SELECT * FROM bonus_predictions WHERE ten_comp_id=v_tc AND final_cero IS NOT NULL LOOP
        pts := CASE WHEN rec.final_cero = actual_fin_cero THEN cfg_fin_cero ELSE 0 END;
        det := jsonb_build_object('predicted',rec.final_cero,'actual',actual_fin_cero);
        INSERT INTO bonus_points(ten_comp_id,user_id,bonus_type,points_earned,detail)
        VALUES(v_tc,rec.user_id,'final_cero',pts,det)
        ON CONFLICT(ten_comp_id,user_id,bonus_type) DO UPDATE
          SET points_earned=EXCLUDED.points_earned, detail=EXCLUDED.detail, calculated_at=now();
        cnt := cnt + 1;
      END LOOP;

      FOR rec IN SELECT * FROM bonus_predictions WHERE ten_comp_id=v_tc AND top_scorer_team_id IS NOT NULL LOOP
        pts := CASE WHEN rec.top_scorer_team_id = actual_top_team_id THEN cfg_top_team ELSE 0 END;
        det := jsonb_build_object('predicted_id',rec.top_scorer_team_id,'actual_id',actual_top_team_id);
        INSERT INTO bonus_points(ten_comp_id,user_id,bonus_type,points_earned,detail)
        VALUES(v_tc,rec.user_id,'top_scorer_team',pts,det)
        ON CONFLICT(ten_comp_id,user_id,bonus_type) DO UPDATE
          SET points_earned=EXCLUDED.points_earned, detail=EXCLUDED.detail, calculated_at=now();
        cnt := cnt + 1;
      END LOOP;

      FOR rec IN SELECT * FROM bonus_predictions
        WHERE ten_comp_id=v_tc AND (podio_1st_id IS NOT NULL OR podio_2nd_id IS NOT NULL
          OR podio_3rd_id IS NOT NULL OR podio_4th_id IS NOT NULL)
      LOOP
        pts := 0;
        IF rec.podio_1st_id IS NOT NULL AND rec.podio_1st_id = actual_1st THEN pts := pts + cfg_exacto; END IF;
        IF rec.podio_2nd_id IS NOT NULL AND rec.podio_2nd_id = actual_2nd THEN pts := pts + cfg_exacto; END IF;
        IF rec.podio_3rd_id IS NOT NULL AND rec.podio_3rd_id = actual_3rd THEN pts := pts + cfg_exacto; END IF;
        IF rec.podio_4th_id IS NOT NULL AND rec.podio_4th_id = actual_4th THEN pts := pts + cfg_exacto; END IF;
        IF rec.podio_1st_id IS NOT NULL AND rec.podio_1st_id != actual_1st
           AND rec.podio_1st_id IN (actual_2nd, actual_3rd, actual_4th) THEN pts := pts + cfg_pres; END IF;
        IF rec.podio_2nd_id IS NOT NULL AND rec.podio_2nd_id != actual_2nd
           AND rec.podio_2nd_id IN (actual_1st, actual_3rd, actual_4th) THEN pts := pts + cfg_pres; END IF;
        IF rec.podio_3rd_id IS NOT NULL AND rec.podio_3rd_id != actual_3rd
           AND rec.podio_3rd_id IN (actual_1st, actual_2nd, actual_4th) THEN pts := pts + cfg_pres; END IF;
        IF rec.podio_4th_id IS NOT NULL AND rec.podio_4th_id != actual_4th
           AND rec.podio_4th_id IN (actual_1st, actual_2nd, actual_3rd) THEN pts := pts + cfg_pres; END IF;
        det := jsonb_build_object(
          'predicted', jsonb_build_object('1st',rec.podio_1st_id,'2nd',rec.podio_2nd_id,'3rd',rec.podio_3rd_id,'4th',rec.podio_4th_id),
          'actual',    jsonb_build_object('1st',actual_1st,'2nd',actual_2nd,'3rd',actual_3rd,'4th',actual_4th));
        INSERT INTO bonus_points(ten_comp_id,user_id,bonus_type,points_earned,detail)
        VALUES(v_tc,rec.user_id,'podio',pts,det)
        ON CONFLICT(ten_comp_id,user_id,bonus_type) DO UPDATE
          SET points_earned=EXCLUDED.points_earned, detail=EXCLUDED.detail, calculated_at=now();
        cnt := cnt + 1;
      END LOOP;
    END IF;
  END LOOP;

  RETURN cnt;
END;
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- ORQUESTACIÓN: cargar resultado / recalcular todo
-- ════════════════════════════════════════════════════════════════════════════

-- Carga un resultado y dispara cálculo de puntos + bonus. Una sola llamada.
CREATE OR REPLACE FUNCTION set_match_result(
  p_match_id UUID,
  p_home_90 SMALLINT, p_away_90 SMALLINT,
  p_home_et SMALLINT DEFAULT NULL, p_away_et SMALLINT DEFAULT NULL,
  p_home_pk SMALLINT DEFAULT NULL, p_away_pk SMALLINT DEFAULT NULL
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_comp UUID; v_preds INT; v_bonus INT;
BEGIN
  SELECT competition_id INTO v_comp FROM matches WHERE id = p_match_id;
  IF v_comp IS NULL THEN RAISE EXCEPTION 'Partido % no existe', p_match_id; END IF;
  IF NOT can_load_results(v_comp) THEN RAISE EXCEPTION 'Access denied'; END IF;

  UPDATE matches SET
    home_score_90 = p_home_90, away_score_90 = p_away_90,
    home_score_et = p_home_et, away_score_et = p_away_et,
    home_score_pk = p_home_pk, away_score_pk = p_away_pk,
    status = 'finished'
  WHERE id = p_match_id;

  SELECT calculate_match_points(p_match_id) INTO v_preds;
  SELECT calculate_bonus_points(v_comp)    INTO v_bonus;

  RETURN jsonb_build_object('predictions_updated', v_preds, 'bonus_rows_updated', v_bonus);
END;
$$;

CREATE OR REPLACE FUNCTION recalculate_all(p_competition_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_match_id UUID; v_match_count INT := 0; v_pred_count INT := 0;
  v_knockout_n INT := 0; v_bonus_n INT := 0; v_tmp INT;
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

  SELECT populate_knockout(p_competition_id)    INTO v_knockout_n;
  SELECT calculate_bonus_points(p_competition_id) INTO v_bonus_n;

  RETURN jsonb_build_object(
    'matches_processed', v_match_count, 'predictions_updated', v_pred_count,
    'knockout_slots_updated', v_knockout_n, 'bonus_rows_updated', v_bonus_n);
END;
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- PARTICIPACIÓN (alta y aprobación)
-- ════════════════════════════════════════════════════════════════════════════

-- Helper interno: ¿hay cupo de miembros en el Ten-Comp? (límite soft del tenant)
CREATE OR REPLACE FUNCTION ten_comp_has_room(p_ten_comp UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(t.max_members_per_ten_comp IS NULL, true)
      OR (SELECT COUNT(*) FROM ten_comp_members WHERE ten_comp_id = p_ten_comp AND status <> 'blocked')
         < t.max_members_per_ten_comp
  FROM ten_comps tc JOIN tenants t ON t.id = tc.tenant_id
  WHERE tc.id = p_ten_comp;
$$;

-- Unirse a un Ten-Comp público: queda aprobado al instante.
CREATE OR REPLACE FUNCTION join_ten_comp_public(p_ten_comp_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tc ten_comps%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'No autenticado'; END IF;
  SELECT * INTO v_tc FROM ten_comps WHERE id = p_ten_comp_id;
  IF NOT FOUND OR v_tc.visibility <> 'public' THEN RAISE EXCEPTION 'Penca no encontrada o no pública'; END IF;
  IF v_tc.status <> 'open' THEN RAISE EXCEPTION 'La penca no está abierta'; END IF;
  IF NOT ten_comp_has_room(p_ten_comp_id) THEN RAISE EXCEPTION 'La penca alcanzó el límite de participantes'; END IF;

  INSERT INTO ten_comp_members(ten_comp_id, user_id, status, approved_at)
  VALUES (p_ten_comp_id, auth.uid(), 'approved', now())
  ON CONFLICT (ten_comp_id, user_id) DO NOTHING;

  RETURN jsonb_build_object('ten_comp_id', v_tc.id, 'slug', v_tc.slug, 'status', 'approved');
END;
$$;

-- Unirse a un Ten-Comp privado por código: queda pendiente de aprobación.
CREATE OR REPLACE FUNCTION join_ten_comp_private(p_code CHAR(8))
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tc ten_comps%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'No autenticado'; END IF;
  SELECT * INTO v_tc FROM ten_comps WHERE join_code = upper(p_code) AND visibility = 'private';
  IF NOT FOUND THEN RAISE EXCEPTION 'Código inválido'; END IF;
  IF v_tc.status <> 'open' THEN RAISE EXCEPTION 'La penca no está abierta'; END IF;
  IF NOT ten_comp_has_room(v_tc.id) THEN RAISE EXCEPTION 'La penca alcanzó el límite de participantes'; END IF;

  INSERT INTO ten_comp_members(ten_comp_id, user_id, status)
  VALUES (v_tc.id, auth.uid(), 'pending')
  ON CONFLICT (ten_comp_id, user_id) DO NOTHING;

  RETURN jsonb_build_object('ten_comp_id', v_tc.id, 'slug', v_tc.slug, 'status', 'pending');
END;
$$;

CREATE OR REPLACE FUNCTION approve_member(p_ten_comp UUID, p_user UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_ten_comp_admin(p_ten_comp) THEN RAISE EXCEPTION 'Access denied'; END IF;
  UPDATE ten_comp_members
  SET status = 'approved', approved_at = now(), approved_by = auth.uid()
  WHERE ten_comp_id = p_ten_comp AND user_id = p_user;
END;
$$;

-- Crear un Ten-Comp: copia scoring/menú/bonus de la competencia, genera join_code
-- si es privado, respeta el límite max_ten_comps del tenant. Devuelve el id/slug.
CREATE OR REPLACE FUNCTION create_ten_comp(
  p_tenant UUID, p_competition UUID, p_name TEXT, p_slug TEXT,
  p_visibility TEXT, p_bonus_enabled BOOLEAN DEFAULT true
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_comp competitions%ROWTYPE;
  v_max INT; v_used INT; v_code CHAR(8); v_id UUID;
BEGIN
  IF NOT is_tenant_admin(p_tenant) THEN RAISE EXCEPTION 'Access denied'; END IF;
  SELECT * INTO v_comp FROM competitions WHERE id = p_competition;
  IF NOT FOUND THEN RAISE EXCEPTION 'Competencia no existe'; END IF;

  SELECT max_ten_comps INTO v_max FROM tenants WHERE id = p_tenant;
  IF v_max IS NOT NULL THEN
    SELECT COUNT(*) INTO v_used FROM ten_comps WHERE tenant_id = p_tenant;
    IF v_used >= v_max THEN RAISE EXCEPTION 'El tenant alcanzó el límite de pencas'; END IF;
  END IF;

  IF p_visibility = 'private' THEN
    -- Código de 8 letras mayúsculas (A-Z), único.
    LOOP
      SELECT string_agg(chr(65 + (random() * 25)::int), '')
      INTO v_code FROM generate_series(1, 8);
      EXIT WHEN NOT EXISTS (SELECT 1 FROM ten_comps WHERE join_code = v_code);
    END LOOP;
  ELSE
    v_code := NULL;
  END IF;

  INSERT INTO ten_comps(tenant_id, competition_id, name, slug, visibility, join_code,
                        menu_config, bonus_enabled, created_by)
  VALUES (p_tenant, p_competition, p_name, p_slug, p_visibility, v_code,
          v_comp.default_menu, p_bonus_enabled, auth.uid())
  RETURNING id INTO v_id;

  -- Copiar scoring desde el default jsonb de la competencia.
  INSERT INTO ten_comp_scoring(ten_comp_id, exact_score_points, correct_winner_points,
    correct_draw_points, knockout_exact_score_bonus, correct_et_result_points, correct_pk_winner_points)
  VALUES (v_id,
    COALESCE((v_comp.default_scoring->>'exact_score_points')::SMALLINT, 3),
    COALESCE((v_comp.default_scoring->>'correct_winner_points')::SMALLINT, 1),
    COALESCE((v_comp.default_scoring->>'correct_draw_points')::SMALLINT, 1),
    COALESCE((v_comp.default_scoring->>'knockout_exact_score_bonus')::SMALLINT, 2),
    COALESCE((v_comp.default_scoring->>'correct_et_result_points')::SMALLINT, 1),
    COALESCE((v_comp.default_scoring->>'correct_pk_winner_points')::SMALLINT, 1));

  -- Copiar bonus si están habilitados.
  IF p_bonus_enabled THEN
    INSERT INTO ten_comp_bonus_config(ten_comp_id, bonus_type, points)
    SELECT v_id, bonus_type, default_points
    FROM competition_bonus_types WHERE competition_id = p_competition;
  END IF;

  RETURN jsonb_build_object('ten_comp_id', v_id, 'slug', p_slug, 'join_code', v_code);
END;
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- HELPERS PARA EL PANEL ADMIN (scoped por Ten-Comp)
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION admin_get_user_details(p_ten_comp UUID)
RETURNS TABLE(id UUID, email TEXT, predictions_count BIGINT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
BEGIN
  IF NOT is_ten_comp_admin(p_ten_comp) THEN RAISE EXCEPTION 'Access denied'; END IF;
  RETURN QUERY
  SELECT au.id, au.email::text,
    (SELECT COUNT(*) FROM predictions p WHERE p.user_id = au.id AND p.ten_comp_id = p_ten_comp)::bigint
  FROM auth.users au
  JOIN ten_comp_members tcm ON tcm.user_id = au.id AND tcm.ten_comp_id = p_ten_comp;
END;
$$;

CREATE OR REPLACE FUNCTION admin_get_match_predictions(p_ten_comp UUID, p_match_id UUID)
RETURNS TABLE(
  user_id UUID, display_name TEXT, username TEXT,
  home_score SMALLINT, away_score SMALLINT, points_earned SMALLINT, total_points BIGINT
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_ten_comp_admin(p_ten_comp) THEN RAISE EXCEPTION 'Access denied'; END IF;
  RETURN QUERY
  SELECT pr.id, pr.display_name::text, pr.username::text,
    p.home_score, p.away_score, COALESCE(p.points_earned,0)::smallint,
    (COALESCE((SELECT SUM(p2.points_earned) FROM predictions p2
              WHERE p2.user_id = pr.id AND p2.ten_comp_id = p_ten_comp AND p2.points_earned IS NOT NULL),0) +
     COALESCE((SELECT SUM(bp.points_earned) FROM bonus_points bp
              WHERE bp.user_id = pr.id AND bp.ten_comp_id = p_ten_comp),0))::bigint
  FROM profiles pr
  JOIN ten_comp_members tcm ON tcm.user_id = pr.id AND tcm.ten_comp_id = p_ten_comp AND tcm.status = 'approved'
  LEFT JOIN predictions p ON p.user_id = pr.id AND p.match_id = p_match_id AND p.ten_comp_id = p_ten_comp
  WHERE pr.is_active = true
  ORDER BY 7 DESC, 2;
END;
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- SEED: catálogo de motores de avance
-- ════════════════════════════════════════════════════════════════════════════
INSERT INTO advancement_engines (id, name, description, fn_name) VALUES
  ('wc48_best_thirds', 'Mundial 48 (mejores terceros)',
   'Formato Copa Mundial 2026: 12 grupos, avanzan 1°, 2° y 8 mejores terceros (tabla FIFA de combinaciones).',
   'engine_wc48_best_thirds')
ON CONFLICT (id) DO NOTHING;
