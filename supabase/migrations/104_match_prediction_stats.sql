-- ============================================================================
-- 104_MATCH_PREDICTION_STATS.SQL — PencaLes 2.0
-- Estadísticas de pronósticos de un partido para el popup de carga ("qué
-- apostaron los demás"): distribución 1X2 (match_prediction_stats) y top de
-- resultados exactos más repetidos (match_top_scores). Como un partido pertenece
-- a UNA competencia, agregar por match_id cubre los pronósticos de TODAS las
-- pencas de esa competencia (no solo la penca actual).
--
-- SECURITY DEFINER: necesita leer pronósticos de pencas donde el usuario no es
-- miembro (RLS lo bloquearía). Solo devuelve CONTEOS agregados — nunca filas
-- individuales, así no expone qué predijo cada uno. Excluye la apuesta del propio
-- usuario (son "las otras apuestas").
-- ============================================================================

CREATE OR REPLACE FUNCTION match_prediction_stats(p_match_id UUID)
RETURNS TABLE(home_count INT, draw_count INT, away_count INT, total INT)
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT
    COUNT(*) FILTER (WHERE home_score > away_score)::int,
    COUNT(*) FILTER (WHERE home_score = away_score)::int,
    COUNT(*) FILTER (WHERE home_score < away_score)::int,
    COUNT(*)::int
  FROM predictions
  WHERE match_id = p_match_id
    AND user_id <> auth.uid();
$$;

GRANT EXECUTE ON FUNCTION match_prediction_stats(UUID) TO authenticated;

-- Top N resultados exactos (a 90') más apostados por el resto de la competencia,
-- para una mini gráfica de barras en el popup de carga. Mismas garantías que la
-- función de arriba: solo conteos agregados, excluye la apuesta propia.
CREATE OR REPLACE FUNCTION match_top_scores(p_match_id UUID, p_limit INT DEFAULT 5)
RETURNS TABLE(home_score INT, away_score INT, cnt INT)
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT home_score, away_score, COUNT(*)::int
  FROM predictions
  WHERE match_id = p_match_id
    AND user_id <> auth.uid()
  GROUP BY home_score, away_score
  ORDER BY COUNT(*) DESC, home_score, away_score
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION match_top_scores(UUID, INT) TO authenticated;
