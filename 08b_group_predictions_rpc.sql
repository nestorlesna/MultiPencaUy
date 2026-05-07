-- 08b_group_predictions_rpc.sql
-- RPC para obtener cuántas predicciones de fase de grupos tiene cada usuario
-- Necesario porque predictions tiene RLS user-owned; SECURITY DEFINER permite
-- que el admin vea los datos de todos los usuarios desde el cliente.

CREATE OR REPLACE FUNCTION admin_get_group_predictions()
RETURNS TABLE(user_id uuid, group_preds_count int)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.user_id,
    COUNT(p.id)::int AS group_preds_count
  FROM predictions p
  INNER JOIN matches m ON m.id = p.match_id
  WHERE m.group_id IS NOT NULL
  GROUP BY p.user_id;
$$;
