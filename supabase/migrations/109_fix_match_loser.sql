-- ============================================================================
-- 109_FIX_MATCH_LOSER.SQL — PencaLes 2.0
-- Port del fix aplicado en producción v1 (legacy 19_fix_match_loser.sql).
--
-- BUG: en la rama 'match_loser' del motor de avance, el CASE
--   WHEN winner_team_id = home_team_id THEN away_team_id ELSE home_team_id
-- cae al ELSE también cuando winner_team_id IS NULL (semifinal con equipos ya
-- asignados pero SIN jugar), devolviendo home_team_id como si fuera el
-- "perdedor". Resultado: el partido por el 3er puesto se puebla prematuramente
-- con el LOCAL de la semi en vez de quedar vacío. Se auto-corrige al cargarse
-- la semi, pero mientras tanto el cuadro/fixture muestra un cruce equivocado.
--
-- 'match_winner' (la final) no sufre esto: lee winner_team_id directo → NULL →
-- el guard IF v_team_id IS NOT NULL deja el slot vacío.
--
-- FIX: caso explícito winner_team_id IS NULL -> NULL.
--
-- Alcance: solo competencias con advancement_engine = 'wc48_best_thirds'
-- (Mundial 2026 y sus clonados). Las ligas (Apertura, Intermedio, Eliminatoria)
-- no tienen motor de avance ni reglas 'match_loser', así que no se ven afectadas.
--
-- Reemplaza la función completa (CREATE OR REPLACE), idéntica a la de
-- 105_security_hardening.sql salvo la rama 'match_loser' corregida.
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
  -- Guard de defensa en profundidad (ver 105_security_hardening.sql).
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
      SELECT CASE
        WHEN winner_team_id IS NULL THEN NULL          -- partido fuente sin jugar: perdedor desconocido
        WHEN winner_team_id = home_team_id THEN away_team_id
        ELSE home_team_id
      END
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

REVOKE EXECUTE ON FUNCTION engine_wc48_best_thirds(UUID) FROM anon, authenticated, public;
