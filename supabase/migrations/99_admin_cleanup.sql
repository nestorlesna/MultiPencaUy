-- ============================================================================
-- 99_ADMIN_CLEANUP.SQL — PencaLes 2.0
-- Borrado físico transaccional de competencias y tenants para /admin/limpieza.
--
-- Reemplaza la lógica multi-paso que vivía en el frontend
-- (src/services/v2/adminCleanupService.ts), que tenía 3 bugs:
--   A) deleteCompetition no borraba los ten_comps antes del DELETE de la
--      competencia → ten_comps.competition_id es ON DELETE RESTRICT, así que
--      cualquier competencia con pencas (incluida la pública que crea el
--      clonado) hacía fallar la eliminación.
--   B) deleteTenant borraba las competencias propias ANTES del tenant, con sus
--      ten_comps todavía vivos → mismo RESTRICT → fallaba.
--   C) Los equipos se huerfanizaban (competition_id = NULL) en vez de borrarse,
--      dejando filas muertas. Los equipos no se comparten entre competencias
--      (el clonado crea filas nuevas), así que se pueden borrar sin afectar a
--      otras competencias.
--
-- Al ser funciones SQL, cada una corre en una sola transacción: todo-o-nada.
-- SECURITY DEFINER + is_super_admin(): solo el super-admin puede ejecutarlas.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Borra una competencia y todo lo que cuelga de ella, en orden seguro.
--
-- Orden (las FKs a teams son NO ACTION, hay que sacarlas antes de borrar teams):
--   1. ten_comps         → cascada a predictions / bonus_* / *_audit (refs a teams)
--   2. matches           → saca home/away/winner_team_id; cascada knockout_slot_rules
--   3. teams             → ya nadie los referencia
--   4. competitions      → cascada phases, groups, stadiums, bonus_types, etc.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin_delete_competition(p_competition_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_super_admin() THEN RAISE EXCEPTION 'Access denied'; END IF;

  DELETE FROM ten_comps   WHERE competition_id = p_competition_id;
  DELETE FROM matches     WHERE competition_id = p_competition_id;
  DELETE FROM teams       WHERE competition_id = p_competition_id;
  DELETE FROM competitions WHERE id = p_competition_id;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_delete_competition(UUID) TO authenticated;

-- ----------------------------------------------------------------------------
-- Borra un tenant. Sus competencias propias:
--   - si OTRO tenant también las usa (tiene ten_comps) → solo se quita la
--     propiedad (owner_tenant_id = NULL); la competencia sobrevive.
--   - si solo las usa este tenant → se borran por completo (admin_delete_competition,
--     que de paso borra los ten_comps de este tenant sobre esa competencia).
-- Al final el DELETE del tenant cascada sus ten_comps restantes (sobre
-- competencias ajenas/globales) y sus tenant_roles.
-- El tenant Público no se puede borrar.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin_delete_tenant(p_tenant_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_public_tenant CONSTANT UUID := '11111111-1111-4111-8111-111111111111';
  v_comp RECORD;
  v_other_count INT;
BEGIN
  IF NOT is_super_admin() THEN RAISE EXCEPTION 'Access denied'; END IF;
  IF p_tenant_id = v_public_tenant THEN
    RAISE EXCEPTION 'El tenant Público no se puede eliminar.';
  END IF;

  FOR v_comp IN
    SELECT id FROM competitions WHERE owner_tenant_id = p_tenant_id
  LOOP
    SELECT count(*) INTO v_other_count
    FROM ten_comps
    WHERE competition_id = v_comp.id AND tenant_id <> p_tenant_id;

    IF v_other_count > 0 THEN
      UPDATE competitions SET owner_tenant_id = NULL WHERE id = v_comp.id;
    ELSE
      PERFORM admin_delete_competition(v_comp.id);
    END IF;
  END LOOP;

  DELETE FROM tenants WHERE id = p_tenant_id;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_delete_tenant(UUID) TO authenticated;
