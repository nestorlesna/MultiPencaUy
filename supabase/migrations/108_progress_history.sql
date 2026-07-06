-- ============================================================================
-- 108_PROGRESS_HISTORY.SQL — PencaLes 2.0
-- Historial de evolución de un jugador dentro de un Ten-Comp, para dos gráficas
-- en el detalle del ranking:
--   1) Puesto en el ranking por día (línea).
--   2) Puntos acumulados partido a partido (desde 0), sumando los +Puntos (bonus)
--      en el momento en que se resuelven.
--
-- Se materializan en dos tablas (una fila por partido / una por día por usuario)
-- para lectura rápida. Se regeneran enteras (borrar + reinsertar) vía
-- `rebuild_progress(competition_id)`:
--   • automático dentro de set_match_result / recalculate_all (al cargar/recalcular),
--   • manual desde el admin ("Recargar evolución") para competencias ya jugadas.
--
-- Atribución de los bonus en la curva de puntos (según cuándo se resuelven):
--   • empates_grupos, top_group_goals → último partido de la FASE DE GRUPOS.
--   • podio, rango_goles, final_cero, top_scorer_team → último partido del torneo.
-- ============================================================================

-- ── Tablas materializadas ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ten_comp_points_progress (
  id                UUID     PRIMARY KEY DEFAULT gen_random_uuid(),
  ten_comp_id       UUID     NOT NULL REFERENCES ten_comps(id) ON DELETE CASCADE,
  user_id           UUID     NOT NULL REFERENCES profiles(id)  ON DELETE CASCADE,
  match_number      SMALLINT NOT NULL,
  match_points      INT      NOT NULL DEFAULT 0,   -- puntos de ESE partido
  bonus_added       INT      NOT NULL DEFAULT 0,   -- bonus que se resuelve en ESE partido
  cumulative_points INT      NOT NULL DEFAULT 0,   -- acumulado hasta ese partido (incl. bonus)
  UNIQUE (ten_comp_id, user_id, match_number)
);
CREATE INDEX IF NOT EXISTS idx_points_progress_user ON ten_comp_points_progress(ten_comp_id, user_id);

CREATE TABLE IF NOT EXISTS ten_comp_rank_progress (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ten_comp_id UUID NOT NULL REFERENCES ten_comps(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES profiles(id)  ON DELETE CASCADE,
  day         DATE NOT NULL,
  points      INT  NOT NULL DEFAULT 0,   -- acumulado al cierre de ese día
  rank        INT  NOT NULL,             -- puesto ese día
  UNIQUE (ten_comp_id, user_id, day)
);
CREATE INDEX IF NOT EXISTS idx_rank_progress_user ON ten_comp_rank_progress(ten_comp_id, user_id);

-- RLS: sin políticas para el cliente. La escritura y la lectura van por funciones
-- SECURITY DEFINER (que corren como el dueño y saltean RLS). Así nadie lee estas
-- tablas directamente; solo los RPC `member_get_user_*_progress` (guardados por
-- is_approved_member) y `rebuild_progress` (guardado por can_load_results).
ALTER TABLE ten_comp_points_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE ten_comp_rank_progress   ENABLE ROW LEVEL SECURITY;

-- ── Regeneración ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION rebuild_progress(p_competition_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  tz CONSTANT TEXT := 'America/Montevideo';
  v_last_group_mn    INT;
  v_last_overall_mn  INT;
  v_last_group_day   DATE;
  v_last_overall_day DATE;
  v_points_rows INT := 0;
  v_rank_rows   INT := 0;
BEGIN
  IF NOT can_load_results(p_competition_id) THEN RAISE EXCEPTION 'Access denied'; END IF;

  -- Momento de resolución de los bonus: último partido de grupos (fase sort_order=1)
  -- y último partido overall, tanto por match_number (curva de puntos) como por
  -- día (curva de ranking).
  SELECT MAX(m.match_number), MAX((m.match_datetime AT TIME ZONE tz)::date)
    INTO v_last_group_mn, v_last_group_day
  FROM matches m JOIN phases ph ON ph.id = m.phase_id
  WHERE m.competition_id = p_competition_id AND ph.sort_order = 1 AND m.status = 'finished';

  SELECT MAX(m.match_number), MAX((m.match_datetime AT TIME ZONE tz)::date)
    INTO v_last_overall_mn, v_last_overall_day
  FROM matches m
  WHERE m.competition_id = p_competition_id AND m.status = 'finished';

  -- Borrar historial previo de todas las pencas de la competencia.
  DELETE FROM ten_comp_points_progress p
  USING ten_comps tc WHERE tc.id = p.ten_comp_id AND tc.competition_id = p_competition_id;
  DELETE FROM ten_comp_rank_progress r
  USING ten_comps tc WHERE tc.id = r.ten_comp_id AND tc.competition_id = p_competition_id;

  -- ══ Curva de puntos partido a partido (acumulado, con bonus) ══
  WITH fm AS (
    SELECT id, match_number FROM matches
    WHERE competition_id = p_competition_id AND status = 'finished'
  ),
  members AS (
    SELECT tcm.ten_comp_id, tcm.user_id
    FROM ten_comp_members tcm JOIN ten_comps tc ON tc.id = tcm.ten_comp_id
    WHERE tc.competition_id = p_competition_id AND tcm.status = 'approved'
  ),
  mp AS (
    SELECT mem.ten_comp_id, mem.user_id, fm.match_number,
           COALESCE(pr.points_earned, 0)::INT AS match_points
    FROM members mem
    CROSS JOIN fm
    LEFT JOIN predictions pr
      ON pr.ten_comp_id = mem.ten_comp_id AND pr.user_id = mem.user_id AND pr.match_id = fm.id
  ),
  bres AS (
    SELECT bp.ten_comp_id, bp.user_id,
           CASE WHEN bp.bonus_type IN ('empates_grupos','top_group_goals')
                THEN COALESCE(v_last_group_mn, v_last_overall_mn)
                ELSE v_last_overall_mn END AS match_number,
           SUM(bp.points_earned)::INT AS bonus_pts
    FROM bonus_points bp
    JOIN ten_comps tc ON tc.id = bp.ten_comp_id
    WHERE tc.competition_id = p_competition_id AND bp.points_earned <> 0
    GROUP BY 1, 2, 3
  ),
  comb AS (
    SELECT mp.ten_comp_id, mp.user_id, mp.match_number, mp.match_points,
           COALESCE(b.bonus_pts, 0) AS bonus_added
    FROM mp
    LEFT JOIN bres b
      ON b.ten_comp_id = mp.ten_comp_id AND b.user_id = mp.user_id AND b.match_number = mp.match_number
  ),
  ins AS (
    INSERT INTO ten_comp_points_progress
      (ten_comp_id, user_id, match_number, match_points, bonus_added, cumulative_points)
    SELECT ten_comp_id, user_id, match_number, match_points, bonus_added,
           SUM(match_points + bonus_added) OVER (
             PARTITION BY ten_comp_id, user_id ORDER BY match_number
             ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)
    FROM comb
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_points_rows FROM ins;

  -- ══ Curva de puesto en el ranking por día ══
  WITH fm AS (
    SELECT id, (match_datetime AT TIME ZONE tz)::date AS mday
    FROM matches
    WHERE competition_id = p_competition_id AND status = 'finished'
  ),
  members AS (
    SELECT tcm.ten_comp_id, tcm.user_id
    FROM ten_comp_members tcm JOIN ten_comps tc ON tc.id = tcm.ten_comp_id
    WHERE tc.competition_id = p_competition_id AND tcm.status = 'approved'
  ),
  mpd AS (
    SELECT mem.ten_comp_id, mem.user_id, fm.mday, COALESCE(pr.points_earned, 0)::INT AS pts
    FROM members mem
    CROSS JOIN fm
    LEFT JOIN predictions pr
      ON pr.ten_comp_id = mem.ten_comp_id AND pr.user_id = mem.user_id AND pr.match_id = fm.id
  ),
  daily AS (  -- puntos de partidos por (miembro, día); cubre todo miembro × día
    SELECT ten_comp_id, user_id, mday, SUM(pts) AS day_pts
    FROM mpd GROUP BY 1, 2, 3
  ),
  bday AS (   -- bonus por (miembro) con el día en que se resuelve (siempre un día con partidos)
    SELECT bp.ten_comp_id, bp.user_id,
           CASE WHEN bp.bonus_type IN ('empates_grupos','top_group_goals')
                THEN COALESCE(v_last_group_day, v_last_overall_day)
                ELSE v_last_overall_day END AS mday,
           SUM(bp.points_earned)::INT AS day_bonus
    FROM bonus_points bp
    JOIN ten_comps tc ON tc.id = bp.ten_comp_id
    WHERE tc.competition_id = p_competition_id AND bp.points_earned <> 0
    GROUP BY 1, 2, 3
  ),
  delta AS (
    SELECT d.ten_comp_id, d.user_id, d.mday,
           d.day_pts + COALESCE(b.day_bonus, 0) AS day_total
    FROM daily d
    LEFT JOIN bday b
      ON b.ten_comp_id = d.ten_comp_id AND b.user_id = d.user_id AND b.mday = d.mday
  ),
  cum AS (
    SELECT ten_comp_id, user_id, mday,
           SUM(day_total) OVER (
             PARTITION BY ten_comp_id, user_id ORDER BY mday
             ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)::INT AS points
    FROM delta
  ),
  ranked AS (
    SELECT ten_comp_id, user_id, mday, points,
           RANK() OVER (PARTITION BY ten_comp_id, mday ORDER BY points DESC)::INT AS rank
    FROM cum
  ),
  insr AS (
    INSERT INTO ten_comp_rank_progress (ten_comp_id, user_id, day, points, rank)
    SELECT ten_comp_id, user_id, mday, points, rank FROM ranked
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_rank_rows FROM insr;

  RETURN jsonb_build_object('points_rows', v_points_rows, 'rank_rows', v_rank_rows);
END;
$$;

-- ── Lectura (guardada por is_approved_member, como el resto del detalle) ──────

CREATE OR REPLACE FUNCTION member_get_user_points_progress(p_ten_comp UUID, p_user UUID)
RETURNS TABLE(match_number SMALLINT, match_points INT, bonus_added INT, cumulative_points INT)
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT pp.match_number, pp.match_points, pp.bonus_added, pp.cumulative_points
  FROM ten_comp_points_progress pp
  WHERE pp.ten_comp_id = p_ten_comp AND pp.user_id = p_user
    AND is_approved_member(p_ten_comp)
  ORDER BY pp.match_number;
$$;

CREATE OR REPLACE FUNCTION member_get_user_rank_progress(p_ten_comp UUID, p_user UUID)
RETURNS TABLE(day DATE, points INT, rank INT)
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT rp.day, rp.points, rp.rank
  FROM ten_comp_rank_progress rp
  WHERE rp.ten_comp_id = p_ten_comp AND rp.user_id = p_user
    AND is_approved_member(p_ten_comp)
  ORDER BY rp.day;
$$;

GRANT EXECUTE ON FUNCTION rebuild_progress(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION member_get_user_points_progress(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION member_get_user_rank_progress(UUID, UUID) TO authenticated;

-- ── Enganche en el flujo de cálculo ──────────────────────────────────────────
-- Se re-crean set_match_result (base: 03) y recalculate_all (base: 100) sumando
-- la regeneración del historial al final.

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
  -- Best-effort: un fallo regenerando el historial no debe abortar la carga.
  BEGIN PERFORM rebuild_progress(v_comp); EXCEPTION WHEN OTHERS THEN NULL; END;

  RETURN jsonb_build_object('predictions_updated', v_preds, 'bonus_rows_updated', v_bonus);
END;
$$;

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
  BEGIN PERFORM rebuild_progress(p_competition_id); EXCEPTION WHEN OTHERS THEN NULL; END;

  RETURN jsonb_build_object(
    'matches_processed', v_match_count, 'predictions_updated', v_pred_count,
    'knockout_slots_updated', v_knockout_n, 'bonus_rows_updated', v_bonus_n);
END;
$$;
