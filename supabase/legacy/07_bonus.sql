-- ============================================================
-- 07_BONUS.SQL — Predicciones especiales con puntos extra
-- Ejecutar DESPUÉS de 06_audit.sql
-- ============================================================

-- ── Configuración de puntos ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bonus_config (
  bonus_type TEXT PRIMARY KEY CHECK (bonus_type IN (
    'podio_exacto',       -- posición exacta en top 4
    'podio_presencia',    -- equipo en top 4 pero lugar incorrecto
    'empates_grupos',     -- cantidad de empates en fase grupos
    'rango_goles',        -- rango de goles totales del torneo
    'final_cero',         -- ¿0-0 en la final?
    'top_scorer_team',    -- equipo con más goles
    'top_group_goals'     -- grupo con más goles
  )),
  points       INT     NOT NULL,
  is_active    BOOLEAN NOT NULL DEFAULT true
);

INSERT INTO bonus_config (bonus_type, points) VALUES
  ('podio_exacto',    10),
  ('podio_presencia',  5),
  ('empates_grupos',  15),
  ('rango_goles',     20),
  ('final_cero',      25),
  ('top_scorer_team', 20),
  ('top_group_goals', 13)
ON CONFLICT (bonus_type) DO NOTHING;

-- ── Predicciones especiales del usuario (una fila por usuario) ────────────────
CREATE TABLE IF NOT EXISTS bonus_predictions (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID NOT NULL REFERENCES profiles(id)  ON DELETE CASCADE,

  -- Sección 1: Podio (top 4)
  podio_1st_id         UUID REFERENCES teams(id),
  podio_2nd_id         UUID REFERENCES teams(id),
  podio_3rd_id         UUID REFERENCES teams(id),
  podio_4th_id         UUID REFERENCES teams(id),

  -- Sección 2: Empates en fase de grupos (0–72, NULL = sin respuesta)
  empates_grupos       SMALLINT CHECK (empates_grupos BETWEEN 0 AND 72),

  -- Sección 3: Rango de goles '1-20','21-40',...,'321-340','341+'
  rango_goles          TEXT,

  -- Sección 4: ¿0-0 en la final? (NULL = sin respuesta)
  final_cero           BOOLEAN,

  -- Sección 5: Equipo con más goles (90' + TE, sin penales)
  top_scorer_team_id   UUID REFERENCES teams(id),

  -- Sección 6: Grupo con más goles
  top_group_id         UUID REFERENCES groups(id),

  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(user_id)
);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION bonus_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_bonus_updated_at ON bonus_predictions;
CREATE TRIGGER trg_bonus_updated_at
  BEFORE UPDATE ON bonus_predictions
  FOR EACH ROW EXECUTE FUNCTION bonus_set_updated_at();

-- ── Puntos ganados por bonus (una fila por usuario × tipo) ───────────────────
CREATE TABLE IF NOT EXISTS bonus_points (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  bonus_type      TEXT NOT NULL,
  points_earned   INT  NOT NULL DEFAULT 0,
  detail          JSONB,
  calculated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, bonus_type)
);

-- ── Auditoría de cambios en bonus_predictions ────────────────────────────────
CREATE TABLE IF NOT EXISTS bonus_predictions_audit (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  changed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  action      TEXT        NOT NULL CHECK (action IN ('INSERT','UPDATE')),
  user_id     UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  old_data    JSONB,
  new_data    JSONB
);

CREATE OR REPLACE FUNCTION audit_bonus_predictions()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO bonus_predictions_audit (action, user_id, new_data)
    VALUES ('INSERT', NEW.user_id, to_jsonb(NEW));
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO bonus_predictions_audit (action, user_id, old_data, new_data)
    VALUES ('UPDATE', NEW.user_id, to_jsonb(OLD), to_jsonb(NEW));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_bonus_predictions ON bonus_predictions;
CREATE TRIGGER trg_audit_bonus_predictions
  AFTER INSERT OR UPDATE ON bonus_predictions
  FOR EACH ROW EXECUTE FUNCTION audit_bonus_predictions();

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE bonus_predictions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE bonus_points            ENABLE ROW LEVEL SECURITY;
ALTER TABLE bonus_config            ENABLE ROW LEVEL SECURITY;
ALTER TABLE bonus_predictions_audit ENABLE ROW LEVEL SECURITY;

-- bonus_config: todos leen, solo admin escribe
GRANT SELECT           ON public.bonus_config TO anon, authenticated;
GRANT UPDATE           ON public.bonus_config TO authenticated;

CREATE POLICY "bonus_config_public_read"  ON bonus_config FOR SELECT USING (true);
CREATE POLICY "bonus_config_admin_write"  ON bonus_config FOR ALL
  USING ((SELECT is_admin FROM profiles WHERE id = auth.uid()));

-- bonus_predictions: cada usuario ve/edita la suya; admin ve todas.
-- Escritura bloqueada en el servidor una vez que empezó el torneo
-- (cualquier partido con match_datetime <= now()), usando now() del
-- servidor → inmune a manipulación del reloj del cliente.
CREATE POLICY "bonus_pred_own_read"   ON bonus_predictions FOR SELECT
  USING (user_id = auth.uid() OR (SELECT is_admin FROM profiles WHERE id = auth.uid()));
CREATE POLICY "bonus_pred_own_insert" ON bonus_predictions FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND NOT EXISTS (SELECT 1 FROM matches WHERE match_datetime <= now())
  );
CREATE POLICY "bonus_pred_own_update" ON bonus_predictions FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    AND NOT EXISTS (SELECT 1 FROM matches WHERE match_datetime <= now())
  );

-- bonus_points: usuarios ven los suyos; admin ve todos
CREATE POLICY "bonus_pts_own_read"    ON bonus_points FOR SELECT
  USING (user_id = auth.uid() OR (SELECT is_admin FROM profiles WHERE id = auth.uid()));
CREATE POLICY "bonus_pts_system_write" ON bonus_points FOR ALL
  USING ((SELECT is_admin FROM profiles WHERE id = auth.uid()));

-- bonus_predictions_audit: solo admin
CREATE POLICY "bonus_audit_admin"     ON bonus_predictions_audit FOR SELECT
  USING ((SELECT is_admin FROM profiles WHERE id = auth.uid()));

-- ── Función: calcular puntos bonus ────────────────────────────────────────────
-- Se llama desde adminService después de cargar cada resultado.
-- Es idempotente: recalcula y actualiza.
CREATE OR REPLACE FUNCTION calculate_bonus_points()
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  -- Config
  cfg_exacto    INT; cfg_pres     INT; cfg_empates INT;
  cfg_rango     INT; cfg_fin_cero INT; cfg_top_team INT; cfg_top_grp INT;

  -- Condiciones
  groups_done   BOOLEAN; podio_done BOOLEAN;

  -- Resultados reales
  actual_empates    INT;
  actual_top_grp_id UUID;
  actual_goal_total INT;
  actual_rango      TEXT;
  actual_fin_cero   BOOLEAN;
  actual_top_team_id UUID;
  actual_1st UUID; actual_2nd UUID; actual_3rd UUID; actual_4th UUID;

  -- Loop
  rec     RECORD;
  pts     INT;
  det     JSONB;
  cnt     INT := 0;
BEGIN
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
    -- Empates reales
    SELECT COUNT(*)::INT INTO actual_empates
      FROM matches m JOIN phases ph ON m.phase_id = ph.id
      WHERE ph."order" = 1 AND m.status = 'finished'
        AND m.home_score_90 = m.away_score_90;

    -- Grupo con más goles (solo 90')
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
    -- Total de goles del torneo (90' + TE, sin penales)
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

    -- ¿0-0 en la final?
    SELECT (home_score_90 = 0 AND away_score_90 = 0)
    INTO actual_fin_cero
    FROM matches WHERE match_number = 104;

    -- Equipo con más goles (90' + TE)
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

    -- Podio real
    SELECT winner_team_id,
      CASE WHEN home_team_id = winner_team_id THEN away_team_id ELSE home_team_id END
    INTO actual_1st, actual_2nd
    FROM matches WHERE match_number = 104;

    SELECT winner_team_id,
      CASE WHEN home_team_id = winner_team_id THEN away_team_id ELSE home_team_id END
    INTO actual_3rd, actual_4th
    FROM matches WHERE match_number = 103;

    -- Bonus: rango_goles
    FOR rec IN SELECT * FROM bonus_predictions WHERE rango_goles IS NOT NULL LOOP
      pts := CASE WHEN rec.rango_goles = actual_rango THEN cfg_rango ELSE 0 END;
      det := jsonb_build_object('predicted',rec.rango_goles,'actual',actual_rango,'total_goals',actual_goal_total);
      INSERT INTO bonus_points(user_id,bonus_type,points_earned,detail)
      VALUES(rec.user_id,'rango_goles',pts,det)
      ON CONFLICT(user_id,bonus_type) DO UPDATE
        SET points_earned=EXCLUDED.points_earned, detail=EXCLUDED.detail, calculated_at=now();
      cnt := cnt + 1;
    END LOOP;

    -- Bonus: final_cero
    FOR rec IN SELECT * FROM bonus_predictions WHERE final_cero IS NOT NULL LOOP
      pts := CASE WHEN rec.final_cero = actual_fin_cero THEN cfg_fin_cero ELSE 0 END;
      det := jsonb_build_object('predicted',rec.final_cero,'actual',actual_fin_cero);
      INSERT INTO bonus_points(user_id,bonus_type,points_earned,detail)
      VALUES(rec.user_id,'final_cero',pts,det)
      ON CONFLICT(user_id,bonus_type) DO UPDATE
        SET points_earned=EXCLUDED.points_earned, detail=EXCLUDED.detail, calculated_at=now();
      cnt := cnt + 1;
    END LOOP;

    -- Bonus: top_scorer_team
    FOR rec IN SELECT * FROM bonus_predictions WHERE top_scorer_team_id IS NOT NULL LOOP
      pts := CASE WHEN rec.top_scorer_team_id = actual_top_team_id THEN cfg_top_team ELSE 0 END;
      det := jsonb_build_object('predicted_id',rec.top_scorer_team_id,'actual_id',actual_top_team_id);
      INSERT INTO bonus_points(user_id,bonus_type,points_earned,detail)
      VALUES(rec.user_id,'top_scorer_team',pts,det)
      ON CONFLICT(user_id,bonus_type) DO UPDATE
        SET points_earned=EXCLUDED.points_earned, detail=EXCLUDED.detail, calculated_at=now();
      cnt := cnt + 1;
    END LOOP;

    -- Bonus: podio (suma exacto + presencia)
    FOR rec IN
      SELECT * FROM bonus_predictions
      WHERE podio_1st_id IS NOT NULL OR podio_2nd_id IS NOT NULL
         OR podio_3rd_id IS NOT NULL OR podio_4th_id IS NOT NULL
    LOOP
      pts := 0;
      -- Posición exacta
      IF rec.podio_1st_id IS NOT NULL AND rec.podio_1st_id = actual_1st THEN pts := pts + cfg_exacto; END IF;
      IF rec.podio_2nd_id IS NOT NULL AND rec.podio_2nd_id = actual_2nd THEN pts := pts + cfg_exacto; END IF;
      IF rec.podio_3rd_id IS NOT NULL AND rec.podio_3rd_id = actual_3rd THEN pts := pts + cfg_exacto; END IF;
      IF rec.podio_4th_id IS NOT NULL AND rec.podio_4th_id = actual_4th THEN pts := pts + cfg_exacto; END IF;
      -- Presencia (equipo en top4 pero lugar incorrecto)
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

-- ── Actualizar leaderboard para incluir bonus ─────────────────────────────────
CREATE OR REPLACE VIEW leaderboard AS
SELECT
  p.id           AS user_id,
  p.username,
  p.display_name,
  p.avatar_url,
  (
    COALESCE(SUM(pr.points_earned), 0) +
    COALESCE((SELECT SUM(bp.points_earned) FROM bonus_points bp WHERE bp.user_id = p.id), 0)
  )::INT                                                       AS total_points,
  COUNT(pr.id)::INT                                            AS predictions_count,
  COUNT(CASE
    WHEN m.status = 'finished'
      AND pr.home_score = m.home_score_90
      AND pr.away_score = m.away_score_90
    THEN 1 END)::INT                                           AS exact_scores,
  COUNT(CASE
    WHEN m.status = 'finished' AND COALESCE(pr.points_earned, 0) > 0
    THEN 1 END)::INT                                           AS correct_predictions,
  RANK() OVER (
    ORDER BY (
      COALESCE(SUM(pr.points_earned), 0) +
      COALESCE((SELECT SUM(bp2.points_earned) FROM bonus_points bp2 WHERE bp2.user_id = p.id), 0)
    ) DESC
  )::INT                                                       AS rank
FROM profiles p
LEFT JOIN predictions pr ON pr.user_id = p.id
LEFT JOIN matches      m  ON m.id = pr.match_id
WHERE p.is_active = true
GROUP BY p.id, p.username, p.display_name, p.avatar_url;
