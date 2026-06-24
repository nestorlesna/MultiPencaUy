-- ============================================================================
-- 103_COMPETITION_ARCHIVED.SQL — PencaLes 2.0
-- Archivar una COMPETENCIA (competitions.status = 'archived') debe producir el
-- mismo bloqueo que archivar una penca (ten_comps.status = 'archived'), pero
-- propagado a TODAS las pencas de TODOS los tenants que usan esa competencia:
-- no se puede predecir, ni cargar bonus, ni unirse. La lectura sigue abierta
-- (solo lectura histórica), igual que con una penca archivada.
--
-- Hasta ahora el gate de escritura miraba solo `ten_comps.status = 'open'`.
-- Acá agregamos, en cada punto de escritura de usuario, la condición
-- `competitions.status <> 'archived'`.
-- ============================================================================

-- ── Predicciones: insert/update bloqueados si la competencia está archivada ──
DROP POLICY IF EXISTS "predictions_insert" ON predictions;
CREATE POLICY "predictions_insert" ON predictions FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND is_member(ten_comp_id)
    AND EXISTS (
      SELECT 1 FROM matches m
      JOIN ten_comps tc   ON tc.id = ten_comp_id
      JOIN competitions c ON c.id = tc.competition_id
      WHERE m.id = match_id AND m.competition_id = tc.competition_id
        AND m.match_datetime > now() AND tc.status = 'open'
        AND c.status <> 'archived'
    )
  );

DROP POLICY IF EXISTS "predictions_update" ON predictions;
CREATE POLICY "predictions_update" ON predictions FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND is_member(ten_comp_id)
    AND EXISTS (
      SELECT 1 FROM matches m
      JOIN ten_comps tc   ON tc.id = ten_comp_id
      JOIN competitions c ON c.id = tc.competition_id
      WHERE m.id = match_id AND m.competition_id = tc.competition_id
        AND m.match_datetime > now() AND tc.status = 'open'
        AND c.status <> 'archived'
    )
  );

-- ── Bonus: insert/update bloqueados si la competencia está archivada ─────────
DROP POLICY IF EXISTS "bonus_pred_insert" ON bonus_predictions;
CREATE POLICY "bonus_pred_insert" ON bonus_predictions FOR INSERT
  WITH CHECK (
    user_id = auth.uid() AND is_member(ten_comp_id)
    AND EXISTS (
      SELECT 1 FROM ten_comps tc
      JOIN competitions c ON c.id = tc.competition_id
      WHERE tc.id = ten_comp_id AND tc.bonus_enabled = true AND tc.status = 'open'
        AND c.status <> 'archived'
    )
    AND NOT ten_comp_started(ten_comp_id)
  );

DROP POLICY IF EXISTS "bonus_pred_update" ON bonus_predictions;
CREATE POLICY "bonus_pred_update" ON bonus_predictions FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM ten_comps tc
      JOIN competitions c ON c.id = tc.competition_id
      WHERE tc.id = ten_comp_id AND tc.bonus_enabled = true AND tc.status = 'open'
        AND c.status <> 'archived'
    )
    AND NOT ten_comp_started(ten_comp_id)
  );

-- ── Unirse: bloqueado si la competencia está archivada ───────────────────────
CREATE OR REPLACE FUNCTION join_ten_comp_public(p_ten_comp_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tc ten_comps%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'No autenticado'; END IF;
  SELECT * INTO v_tc FROM ten_comps WHERE id = p_ten_comp_id;
  IF NOT FOUND OR v_tc.visibility <> 'public' THEN RAISE EXCEPTION 'Penca no encontrada o no pública'; END IF;
  IF v_tc.status <> 'open' THEN RAISE EXCEPTION 'La penca no está abierta'; END IF;
  IF EXISTS (SELECT 1 FROM competitions c WHERE c.id = v_tc.competition_id AND c.status = 'archived') THEN
    RAISE EXCEPTION 'La competencia está archivada';
  END IF;
  IF NOT ten_comp_has_room(p_ten_comp_id) THEN RAISE EXCEPTION 'La penca alcanzó el límite de participantes'; END IF;

  INSERT INTO ten_comp_members(ten_comp_id, user_id, status, approved_at)
  VALUES (p_ten_comp_id, auth.uid(), 'approved', now())
  ON CONFLICT (ten_comp_id, user_id) DO NOTHING;

  RETURN jsonb_build_object('ten_comp_id', v_tc.id, 'slug', v_tc.slug, 'status', 'approved');
END;
$$;

CREATE OR REPLACE FUNCTION join_ten_comp_private(p_code CHAR(8))
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tc ten_comps%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'No autenticado'; END IF;
  SELECT * INTO v_tc FROM ten_comps WHERE join_code = upper(p_code) AND visibility = 'private';
  IF NOT FOUND THEN RAISE EXCEPTION 'Código inválido'; END IF;
  IF v_tc.status <> 'open' THEN RAISE EXCEPTION 'La penca no está abierta'; END IF;
  IF EXISTS (SELECT 1 FROM competitions c WHERE c.id = v_tc.competition_id AND c.status = 'archived') THEN
    RAISE EXCEPTION 'La competencia está archivada';
  END IF;
  IF NOT ten_comp_has_room(v_tc.id) THEN RAISE EXCEPTION 'La penca alcanzó el límite de participantes'; END IF;

  INSERT INTO ten_comp_members(ten_comp_id, user_id, status)
  VALUES (v_tc.id, auth.uid(), 'pending')
  ON CONFLICT (ten_comp_id, user_id) DO NOTHING;

  RETURN jsonb_build_object('ten_comp_id', v_tc.id, 'slug', v_tc.slug, 'status', 'pending');
END;
$$;
