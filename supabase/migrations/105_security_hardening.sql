-- ============================================================================
-- 105_SECURITY_HARDENING.SQL — PencaLes 2.0
-- Cierra el último hueco de control de acceso a funciones, análogo al
-- "HALLAZGO 2" de la auditoría de seguridad de la app predecesora
-- (docs/auditoria_seguridad_anglo_penca2026.md).
--
-- Contexto: todas las RPC de orquestación (recalculate_all, set_match_result,
-- calculate_match_points, calculate_bonus_points, populate_knockout) y las
-- admin ya tienen guard interno (can_load_results / is_*_admin). El motor de
-- avance `engine_wc48_best_thirds` era la única función SECURITY DEFINER que
-- MUTA `matches` sin guard: confiaba en que solo la llamaría el dispatcher
-- `populate_knockout`. Pero como PostgreSQL otorga EXECUTE a PUBLIC por
-- defecto, PostgREST la exponía como RPC y un anónimo podía invocarla directo
-- para corromper el cuadro (bracket) sin autenticarse.
--
-- Defensa en dos capas (igual a la recomendación del auditor):
--   Capa 1 — REVOKE EXECUTE de anon/authenticated (deja de ser RPC pública).
--   Capa 2 — guard interno can_load_results() dentro del cuerpo.
-- El dispatcher (SECURITY DEFINER) la sigue ejecutando porque corre con los
-- privilegios de su dueño, y auth.uid() se preserva entre llamadas SECURITY
-- DEFINER, así que el guard pasa para el cargador legítimo.
-- ============================================================================

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
  -- Guard de defensa en profundidad: aunque el dispatcher ya autoriza, esta
  -- función no debe poder ejecutarse directamente sin permiso de carga.
  IF NOT can_load_results(p_competition_id) THEN RAISE EXCEPTION 'Access denied'; END IF;

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

-- Capa 1: que deje de ser invocable como RPC por clientes. Solo el dispatcher
-- populate_knockout (SECURITY DEFINER) la ejecuta, con los privilegios de su dueño.
REVOKE EXECUTE ON FUNCTION engine_wc48_best_thirds(UUID) FROM anon, authenticated, public;

-- ============================================================================
-- FUGA EN LA VISTA `leaderboard` (paralelo a "UUIDs de Auth expuestos" del informe)
-- ----------------------------------------------------------------------------
-- La vista `leaderboard` se otorga a `anon` y NO es security_invoker → corre con
-- los privilegios de su dueño y bypasea la RLS de las tablas base. Como expone
-- user_id (UUID de Auth) + display_name/username de cada miembro aprobado, un
-- anónimo podía leer el ranking de una penca PRIVADA consultando por su
-- ten_comp_id (la RLS de `ten_comps` la oculta, pero la vista la sorteaba).
--
-- Fix: agregar a la propia vista el MISMO criterio de visibilidad que la
-- política `ten_comps_read` (02_rls.sql): solo se ven filas de Ten-Comps
-- públicos, o de aquellos donde el que consulta es miembro o admin. Para anon
-- (auth.uid() = NULL) los helpers is_member/is_ten_comp_admin dan false, así que
-- queda solo lo público — sin romper el ranking público sin login ni el de las
-- pencas privadas para sus miembros/admins. Se mantiene SECURITY DEFINER (sin
-- security_invoker) para que el ranking público siga funcionando para anon, que
-- no tiene grants sobre ten_comp_members/predictions/profiles.
-- ============================================================================
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
JOIN ten_comps tc ON tc.id = tcm.ten_comp_id
JOIN profiles p ON p.id = tcm.user_id
LEFT JOIN predictions pr ON pr.user_id = tcm.user_id AND pr.ten_comp_id = tcm.ten_comp_id
LEFT JOIN matches m ON m.id = pr.match_id
WHERE tcm.status = 'approved' AND p.is_active = true
  AND (tc.visibility = 'public' OR is_member(tcm.ten_comp_id) OR is_ten_comp_admin(tcm.ten_comp_id))
GROUP BY tcm.ten_comp_id, tcm.user_id, p.username, p.display_name, p.avatar_url;
