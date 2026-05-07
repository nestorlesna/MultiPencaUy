-- 08c_match_predictions_rpc.sql  (v3)
-- Retorna TODOS los usuarios activos para un partido (con o sin apuesta).
-- Cambios vs v2:
--   • LEFT JOIN desde profiles → predictions (incluye usuarios sin apuesta)
--   • Filtra pr.is_active = true
--   • Subqueries de puntos usan pr.id en vez de p.user_id

CREATE OR REPLACE FUNCTION admin_get_match_predictions(p_match_id uuid)
RETURNS TABLE(
  user_id        uuid,
  display_name   text,
  username       text,
  home_score     smallint,
  away_score     smallint,
  points_earned  smallint,
  total_points   bigint
)
SECURITY DEFINER
SET search_path = public, auth
LANGUAGE sql
AS $$
  SELECT
    pr.id,
    pr.display_name::text,
    pr.username::text,
    p.home_score,
    p.away_score,
    COALESCE(p.points_earned, 0)::smallint,
    (
      COALESCE((
        SELECT SUM(p2.points_earned)
        FROM predictions p2
        WHERE p2.user_id = pr.id
          AND p2.points_earned IS NOT NULL
      ), 0) +
      COALESCE((
        SELECT SUM(bp.points_earned)
        FROM bonus_points bp
        WHERE bp.user_id = pr.id
      ), 0)
    )::bigint
  FROM profiles pr
  LEFT JOIN predictions p ON p.user_id = pr.id AND p.match_id = p_match_id
  WHERE pr.is_active = true
    AND EXISTS (
      SELECT 1 FROM profiles adm
      WHERE adm.id = auth.uid() AND adm.is_admin = true
    )
  ORDER BY 7 DESC, 2;
$$;
