-- ============================================================================
-- 04_GRANTS.SQL — PencaLes 2.0
-- GRANTs para los roles anon y authenticated.
-- Ejecutar DESPUÉS de 03_functions_views.sql
--
-- Sin estos GRANTs PostgREST bloquea las peticiones antes de que actúe RLS.
-- Las políticas RLS en 02_rls.sql ya tienen USING (true) en el catálogo;
-- aquí solo se dan los privilegios de tabla/vista para que lleguen a la política.
-- ============================================================================

-- ════════════════════════════════════════════════════════════════════════════
-- ROL authenticated
-- ════════════════════════════════════════════════════════════════════════════

-- Plataforma
GRANT SELECT                         ON profiles            TO authenticated;
GRANT UPDATE                         ON profiles            TO authenticated;
GRANT SELECT                         ON tenants             TO authenticated;
GRANT UPDATE                         ON tenants             TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON tenant_roles        TO authenticated;

-- Catálogo deportivo
GRANT SELECT ON advancement_engines       TO authenticated;
GRANT SELECT ON competitions              TO authenticated;
GRANT SELECT ON competition_bonus_types   TO authenticated;
GRANT SELECT ON phases                    TO authenticated;
GRANT SELECT ON groups                    TO authenticated;
GRANT SELECT ON stadiums                  TO authenticated;
GRANT SELECT ON teams                     TO authenticated;
GRANT SELECT ON matches                   TO authenticated;
GRANT UPDATE                             ON matches          TO authenticated;  -- cargadores
GRANT SELECT ON knockout_slot_rules       TO authenticated;
GRANT SELECT ON combinaciones             TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON group_position_overrides   TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON best_third_rank_overrides  TO authenticated;

-- Ten-Comps y participación
GRANT SELECT, INSERT, UPDATE, DELETE ON ten_comps           TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ten_comp_scoring    TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ten_comp_bonus_config TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ten_comp_members    TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON predictions         TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON bonus_predictions   TO authenticated;
GRANT SELECT                         ON bonus_points        TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON subgrupos           TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON subgrupo_members    TO authenticated;
GRANT SELECT                         ON predictions_audit        TO authenticated;
GRANT SELECT                         ON bonus_predictions_audit  TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON email_queue         TO authenticated;

-- Vistas
GRANT SELECT ON group_standings     TO authenticated;
GRANT SELECT ON best_third_ranking  TO authenticated;
GRANT SELECT ON leaderboard         TO authenticated;
GRANT SELECT ON subgrupo_ranking    TO authenticated;
GRANT SELECT ON my_subgrupos_view   TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- ROL anon — solo lectura del catálogo y datos públicos
-- ════════════════════════════════════════════════════════════════════════════

-- Catálogo deportivo (lectura pública; fixture visible sin login)
GRANT SELECT ON advancement_engines      TO anon;
GRANT SELECT ON competitions             TO anon;
GRANT SELECT ON competition_bonus_types  TO anon;
GRANT SELECT ON phases                   TO anon;
GRANT SELECT ON groups                   TO anon;
GRANT SELECT ON stadiums                 TO anon;
GRANT SELECT ON teams                    TO anon;
GRANT SELECT ON matches                  TO anon;
GRANT SELECT ON knockout_slot_rules      TO anon;
GRANT SELECT ON combinaciones            TO anon;
GRANT SELECT ON group_position_overrides    TO anon;
GRANT SELECT ON best_third_rank_overrides   TO anon;

-- Ten-Comps públicos (para resolver slug sin login; RLS filtra solo visibility='public')
GRANT SELECT ON tenants              TO anon;
GRANT SELECT ON ten_comps            TO anon;
GRANT SELECT ON ten_comp_scoring     TO anon;
GRANT SELECT ON ten_comp_bonus_config TO anon;

-- Vistas públicas (fixture, grupos, ranking de pencas públicas)
GRANT SELECT ON group_standings     TO anon;
GRANT SELECT ON best_third_ranking  TO anon;
GRANT SELECT ON leaderboard         TO anon;

-- ════════════════════════════════════════════════════════════════════════════
-- POLÍTICA RLS adicional: tenants legible por anon
-- La política "tenants_read_auth" solo aplica a authenticated.
-- Los usuarios anon necesitan leer el tenant al resolver un Ten-Comp público.
-- ════════════════════════════════════════════════════════════════════════════
CREATE POLICY "tenants_read_anon" ON tenants FOR SELECT TO anon USING (true);
