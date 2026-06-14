-- ============================================================================
-- 90_MIGRATE_FROM_V1.SQL — PencaLes 2026 (v1)  →  PencaLes 2.0 (v2)
--
-- Transforma los datos de la penca v1 al modelo multi-tenant. Crea:
--     Tenant  "Publico"  →  Competencia "Mundial Futbol 2026"  →  Ten-Comp "PencaLes 2026"
--
-- PRE-REQUISITOS (ver docs/MIGRACION_V1_A_V2.md):
--   1. Proyecto Supabase nuevo con 01/02/03 ya aplicados.
--   2. auth.users + auth.identities de v1 ya importados (UUIDs preservados).
--   3. Datos v1 (schema public de v1) restaurados en ESTE proyecto bajo el schema `legacy`.
--
-- ESTRATEGIA: se preservan TODOS los UUIDs de v1 (catálogo, predicciones, perfiles),
-- por lo que las foreign keys resuelven sin tabla de mapeo. La única columna nueva
-- es el scope (competition_id / ten_comp_id), seteado a los anclas fijos de abajo.
--
-- Idempotente: usa ON CONFLICT DO NOTHING/UPDATE. Se puede re-ejecutar.
-- ============================================================================

BEGIN;

-- ── UUIDs ancla fijos (legibles, válidos v4) ────────────────────────────────
--   Tenant      Publico            = 11111111-1111-4111-8111-111111111111
--   Competencia Mundial Futbol 26  = 22222222-2222-4222-8222-222222222222
--   Ten-Comp    PencaLes 2026      = 33333333-3333-4333-8333-333333333333

-- ════════════════════════════════════════════════════════════════════════════
-- 1. TENANT + COMPETENCIA + perfiles
-- ════════════════════════════════════════════════════════════════════════════

INSERT INTO tenants (id, name, slug, status, plan)
VALUES ('11111111-1111-4111-8111-111111111111', 'Publico', 'publico', 'active', 'free')
ON CONFLICT (id) DO NOTHING;

INSERT INTO competitions (id, name, sport, season, status, start_date, end_date, advancement_engine, owner_tenant_id)
VALUES ('22222222-2222-4222-8222-222222222222', 'Mundial Futbol 2026', 'futbol', '2026',
        'finished', DATE '2026-06-11', DATE '2026-07-19', 'wc48_best_thirds', NULL)
ON CONFLICT (id) DO NOTHING;

-- default_scoring de la competencia ← config activa de v1
UPDATE competitions c SET default_scoring = jsonb_build_object(
    'exact_score_points',          sc.exact_score_points,
    'correct_winner_points',       sc.correct_winner_points,
    'correct_draw_points',         sc.correct_draw_points,
    'knockout_exact_score_bonus',  sc.knockout_exact_score_bonus,
    'correct_et_result_points',    sc.correct_et_result_points,
    'correct_pk_winner_points',    sc.correct_pk_winner_points)
FROM legacy.scoring_config sc
WHERE c.id = '22222222-2222-4222-8222-222222222222' AND sc.is_active = true;

-- Perfiles. auth.users ya fueron importados → el trigger handle_new_user pudo haber
-- creado perfiles con valores por defecto; restauramos los reales con DO UPDATE.
-- is_super_admin ← is_admin de v1 (el admin de la solución queda como super-admin).
INSERT INTO profiles (id, username, display_name, avatar_url, is_super_admin, is_active, created_at)
SELECT id, username, display_name, avatar_url, is_admin, is_active, created_at
FROM legacy.profiles
ON CONFLICT (id) DO UPDATE SET
  username       = EXCLUDED.username,
  display_name   = EXCLUDED.display_name,
  avatar_url     = EXCLUDED.avatar_url,
  is_super_admin = EXCLUDED.is_super_admin,
  is_active      = EXCLUDED.is_active,
  created_at     = EXCLUDED.created_at;

-- Roles del tenant Publico: admins e is_loader de v1.
INSERT INTO tenant_roles (tenant_id, user_id, role)
SELECT '11111111-1111-4111-8111-111111111111', id, 'admin'
FROM legacy.profiles WHERE is_admin = true
ON CONFLICT (tenant_id, user_id) DO NOTHING;

INSERT INTO tenant_roles (tenant_id, user_id, role)
SELECT '11111111-1111-4111-8111-111111111111', id, 'loader'
FROM legacy.profiles WHERE is_loader = true AND is_admin = false
ON CONFLICT (tenant_id, user_id) DO NOTHING;

-- ════════════════════════════════════════════════════════════════════════════
-- 2. CATÁLOGO DEPORTIVO (preservando UUIDs; "order" → sort_order)
-- ════════════════════════════════════════════════════════════════════════════

INSERT INTO groups (id, competition_id, name, sort_order)
SELECT id, '22222222-2222-4222-8222-222222222222', name, "order" FROM legacy.groups
ON CONFLICT (id) DO NOTHING;

INSERT INTO phases (id, competition_id, name, sort_order, has_extra_time, has_penalties)
SELECT id, '22222222-2222-4222-8222-222222222222', name, "order", has_extra_time, has_penalties
FROM legacy.phases
ON CONFLICT (id) DO NOTHING;

INSERT INTO stadiums (id, competition_id, name, city, country, timezone, address, capacity, photo_urls, latitude, longitude)
SELECT id, '22222222-2222-4222-8222-222222222222', name, city, country, timezone, address, capacity, photo_urls, latitude, longitude
FROM legacy.stadiums
ON CONFLICT (id) DO NOTHING;

INSERT INTO teams (id, competition_id, name, abbreviation, flag_url, group_id, group_position, is_confirmed, placeholder_name)
SELECT id, '22222222-2222-4222-8222-222222222222', name, abbreviation, flag_url, group_id, group_position, is_confirmed, placeholder_name
FROM legacy.teams
ON CONFLICT (id) DO NOTHING;

INSERT INTO matches (id, competition_id, match_number, phase_id, group_id, home_team_id, away_team_id,
  home_slot_label, away_slot_label, stadium_id, match_datetime, status,
  home_score_90, away_score_90, home_score_et, away_score_et, home_score_pk, away_score_pk, winner_team_id)
SELECT id, '22222222-2222-4222-8222-222222222222', match_number, phase_id, group_id, home_team_id, away_team_id,
  home_slot_label, away_slot_label, stadium_id, match_datetime, status,
  home_score_90, away_score_90, home_score_et, away_score_et, home_score_pk, away_score_pk, winner_team_id
FROM legacy.matches
ON CONFLICT (id) DO NOTHING;

INSERT INTO knockout_slot_rules (id, competition_id, match_id, slot, rule_type, source_group_id, source_match_id, position, third_groups)
SELECT id, '22222222-2222-4222-8222-222222222222', match_id, slot, rule_type, source_group_id, source_match_id, position, third_groups
FROM legacy.knockout_slot_rules
ON CONFLICT (id) DO NOTHING;

INSERT INTO combinaciones (competition_id, combinacion, rival_1a, rival_1b, rival_1d, rival_1e, rival_1g, rival_1i, rival_1k, rival_1l)
SELECT '22222222-2222-4222-8222-222222222222', combinacion, rival_1a, rival_1b, rival_1d, rival_1e, rival_1g, rival_1i, rival_1k, rival_1l
FROM legacy.combinaciones
ON CONFLICT (competition_id, combinacion) DO NOTHING;

INSERT INTO group_position_overrides (competition_id, team_id, position, updated_at)
SELECT '22222222-2222-4222-8222-222222222222', team_id, position, updated_at FROM legacy.group_position_overrides
ON CONFLICT (team_id) DO NOTHING;

INSERT INTO best_third_rank_overrides (competition_id, team_id, rank, updated_at)
SELECT '22222222-2222-4222-8222-222222222222', team_id, rank, updated_at FROM legacy.best_third_rank_overrides
ON CONFLICT (team_id) DO NOTHING;

-- ════════════════════════════════════════════════════════════════════════════
-- 3. TEN-COMP + scoring + bonus config
-- ════════════════════════════════════════════════════════════════════════════

INSERT INTO ten_comps (id, tenant_id, competition_id, name, slug, visibility, status, menu_config, bonus_enabled)
SELECT '33333333-3333-4333-8333-333333333333',
       '11111111-1111-4111-8111-111111111111',
       '22222222-2222-4222-8222-222222222222',
       'PencaLes 2026', 'pencales-2026', 'public', 'archived',
       (SELECT default_menu FROM competitions WHERE id = '22222222-2222-4222-8222-222222222222'),
       true
ON CONFLICT (id) DO NOTHING;

INSERT INTO ten_comp_scoring (ten_comp_id, exact_score_points, correct_winner_points, correct_draw_points,
  knockout_exact_score_bonus, correct_et_result_points, correct_pk_winner_points)
SELECT '33333333-3333-4333-8333-333333333333', exact_score_points, correct_winner_points, correct_draw_points,
  knockout_exact_score_bonus, correct_et_result_points, correct_pk_winner_points
FROM legacy.scoring_config WHERE is_active = true
ON CONFLICT (ten_comp_id) DO NOTHING;

-- Tipos de bonus de la competencia (defaults) ← bonus_config de v1
INSERT INTO competition_bonus_types (competition_id, bonus_type, default_points)
SELECT '22222222-2222-4222-8222-222222222222', bonus_type, points FROM legacy.bonus_config
ON CONFLICT (competition_id, bonus_type) DO NOTHING;

-- Puntos de bonus del Ten-Comp ← bonus_config de v1
INSERT INTO ten_comp_bonus_config (ten_comp_id, bonus_type, points, is_active)
SELECT '33333333-3333-4333-8333-333333333333', bonus_type, points, is_active FROM legacy.bonus_config
ON CONFLICT (ten_comp_id, bonus_type) DO NOTHING;

-- Miembros: todos los perfiles de v1, aprobados (joined_at = alta original).
INSERT INTO ten_comp_members (ten_comp_id, user_id, status, joined_at, approved_at)
SELECT '33333333-3333-4333-8333-333333333333', id, 'approved', created_at, created_at
FROM legacy.profiles
ON CONFLICT (ten_comp_id, user_id) DO NOTHING;

-- ════════════════════════════════════════════════════════════════════════════
-- 4. DATOS DE USUARIO (predicciones, bonus, subgrupos, auditoría)
--    Se desactivan los triggers de fila para preservar timestamps y evitar
--    duplicar auditoría / re-disparar límites. Se reactivan al final.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE predictions       DISABLE TRIGGER trg_predictions_updated_at;
ALTER TABLE predictions       DISABLE TRIGGER trg_audit_predictions;
ALTER TABLE bonus_predictions DISABLE TRIGGER trg_bonus_pred_updated_at;
ALTER TABLE bonus_predictions DISABLE TRIGGER trg_audit_bonus_predictions;
ALTER TABLE subgrupos         DISABLE TRIGGER trg_auto_add_creator;
ALTER TABLE subgrupos         DISABLE TRIGGER trg_subgrupo_limit;

INSERT INTO predictions (id, ten_comp_id, user_id, match_id, home_score, away_score,
  home_score_et, away_score_et, predicted_pk_winner_id, points_earned, created_at, updated_at)
SELECT id, '33333333-3333-4333-8333-333333333333', user_id, match_id, home_score, away_score,
  home_score_et, away_score_et, predicted_pk_winner_id, points_earned, created_at, updated_at
FROM legacy.predictions
ON CONFLICT (id) DO NOTHING;

INSERT INTO bonus_predictions (id, ten_comp_id, user_id, podio_1st_id, podio_2nd_id, podio_3rd_id, podio_4th_id,
  empates_grupos, rango_goles, final_cero, top_scorer_team_id, top_group_id, created_at, updated_at)
SELECT id, '33333333-3333-4333-8333-333333333333', user_id, podio_1st_id, podio_2nd_id, podio_3rd_id, podio_4th_id,
  empates_grupos, rango_goles, final_cero, top_scorer_team_id, top_group_id, created_at, updated_at
FROM legacy.bonus_predictions
ON CONFLICT (id) DO NOTHING;

INSERT INTO bonus_points (id, ten_comp_id, user_id, bonus_type, points_earned, detail, calculated_at)
SELECT id, '33333333-3333-4333-8333-333333333333', user_id, bonus_type, points_earned, detail, calculated_at
FROM legacy.bonus_points
ON CONFLICT (id) DO NOTHING;

INSERT INTO subgrupos (id, ten_comp_id, name, creator_id, is_active, created_at)
SELECT id, '33333333-3333-4333-8333-333333333333', name, creator_id, is_active, created_at
FROM legacy.subgrupos
ON CONFLICT (id) DO NOTHING;

INSERT INTO subgrupo_members (subgrupo_id, user_id, joined_at)
SELECT subgrupo_id, user_id, joined_at FROM legacy.subgrupo_members
ON CONFLICT (subgrupo_id, user_id) DO NOTHING;

-- Auditoría histórica (verbatim, con ten_comp_id).
INSERT INTO predictions_audit (id, changed_at, action, ten_comp_id, user_id, match_id,
  old_home_score, old_away_score, old_home_score_et, old_away_score_et, old_pk_winner_id,
  new_home_score, new_away_score, new_home_score_et, new_away_score_et, new_pk_winner_id)
SELECT id, changed_at, action, '33333333-3333-4333-8333-333333333333', user_id, match_id,
  old_home_score, old_away_score, old_home_score_et, old_away_score_et, old_pk_winner_id,
  new_home_score, new_away_score, new_home_score_et, new_away_score_et, new_pk_winner_id
FROM legacy.predictions_audit
ON CONFLICT (id) DO NOTHING;

INSERT INTO bonus_predictions_audit (id, changed_at, action, ten_comp_id, user_id, old_data, new_data)
SELECT id, changed_at, action, '33333333-3333-4333-8333-333333333333', user_id, old_data, new_data
FROM legacy.bonus_predictions_audit
ON CONFLICT (id) DO NOTHING;

ALTER TABLE predictions       ENABLE TRIGGER trg_predictions_updated_at;
ALTER TABLE predictions       ENABLE TRIGGER trg_audit_predictions;
ALTER TABLE bonus_predictions ENABLE TRIGGER trg_bonus_pred_updated_at;
ALTER TABLE bonus_predictions ENABLE TRIGGER trg_audit_bonus_predictions;
ALTER TABLE subgrupos         ENABLE TRIGGER trg_auto_add_creator;
ALTER TABLE subgrupos         ENABLE TRIGGER trg_subgrupo_limit;

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
-- 5. VALIDACIÓN (ver detalle en docs/MIGRACION_V1_A_V2.md, paso 7)
--    El recálculo debe reproducir el leaderboard final de v1 fila a fila.
-- ════════════════════════════════════════════════════════════════════════════
-- SELECT recalculate_all('22222222-2222-4222-8222-222222222222');
