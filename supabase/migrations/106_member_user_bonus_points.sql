-- ============================================================================
-- 106_MEMBER_USER_BONUS_POINTS.SQL — PencaLes 2.0
-- Detalle de puntaje al hacer click en un usuario del ranking.
--
-- La parte de PARTIDOS (qué apostó / resultado real / puntos / fecha) se resuelve
-- con un SELECT directo sobre `predictions`: la RLS `predictions_select` ya deja
-- que un miembro aprobado lea las predicciones ajenas de partidos ya comenzados
-- (todos los que suman punto lo están). No necesita RPC.
--
-- La parte de +PUNTOS (bonus) sí: la RLS `bonus_pts_read` solo expone los bonus
-- PROPIOS o los del admin. Este RPC SECURITY DEFINER permite que un miembro
-- aprobado lea los bonus GANADOS (points_earned > 0) de otro miembro de la MISMA
-- penca. Solo devuelve puntos ya calculados (que ya están sumados en el total del
-- ranking) — nunca apuestas pendientes ni de bonus sin resolver.
--
-- Guard: is_approved_member(p_ten_comp). Si el que consulta no es miembro
-- aprobado, devuelve conjunto vacío (mismo criterio que la RLS de predictions,
-- así el feature queda acotado a miembros aprobados en pencas públicas y privadas).
-- ============================================================================

CREATE OR REPLACE FUNCTION member_get_user_bonus_points(p_ten_comp UUID, p_user UUID)
RETURNS TABLE(bonus_type TEXT, points_earned INT, detail JSONB, calculated_at TIMESTAMPTZ)
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT bp.bonus_type, bp.points_earned, bp.detail, bp.calculated_at
  FROM bonus_points bp
  WHERE bp.ten_comp_id = p_ten_comp
    AND bp.user_id = p_user
    AND bp.points_earned > 0
    AND is_approved_member(p_ten_comp)
  ORDER BY bp.points_earned DESC, bp.bonus_type;
$$;

GRANT EXECUTE ON FUNCTION member_get_user_bonus_points(UUID, UUID) TO authenticated;
