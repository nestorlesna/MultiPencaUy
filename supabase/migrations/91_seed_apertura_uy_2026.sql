-- ============================================================================
-- 91_SEED_APERTURA_UY_2026.SQL -- PencaLes 2.0
-- Competencia publica "Apertura UY 2026": liga uruguaya de 16 equipos,
-- todos contra todos (15 fechas, 120 partidos), resultados finales cargados.
-- Asociada al tenant "Publico" como un Ten-Comp publico.
--
-- Fuente de datos: Datos/Apertura_2026.xlsx (pestanas Fixture y Tabla de Posiciones).
-- Sin grupos ni llave eliminatoria -> advancement_engine = NULL, una sola fase.
-- Idempotente: ON CONFLICT DO NOTHING en cada bloque.
--
-- UUIDs ancla fijos:
--   Competencia Apertura UY 2026 = c0a00000-0000-4000-8000-000000000001
--   Ten-Comp    Apertura UY 2026 = c0a00000-0000-4000-8000-000000000002
--   Fase        Fase Regular     = c0a00000-0000-4000-8000-000000000003
--   Tenant      Publico          = 11111111-1111-4111-8111-111111111111
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. COMPETENCIA (catalogo deportivo)
-- ============================================================================

INSERT INTO competitions (id, name, sport, season, status, start_date, end_date,
                          advancement_engine, owner_tenant_id, default_menu)
VALUES ('c0a00000-0000-4000-8000-000000000001', 'Apertura UY 2026', 'futbol', '2026',
        'finished', DATE '2026-02-06', DATE '2026-05-11',
        NULL, NULL,
        -- liga: sin grupos ni cuadro de eliminatorias; con Posiciones (tabla),
        -- sin +Puntos. ('posiciones' es opt-in en el menu: requiere true explicito.)
        '{"fixture":true,"grupos":false,"cuadro":false,"posiciones":true,"ranking":true,"mis_predicciones":true,"mas_puntos":false,"subgrupos":true,"ayuda":true}'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- Fase unica (los partidos requieren phase_id NOT NULL)
INSERT INTO phases (id, competition_id, name, sort_order, has_extra_time, has_penalties)
VALUES ('c0a00000-0000-4000-8000-000000000003', 'c0a00000-0000-4000-8000-000000000001', 'Fase Regular', 1, false, false)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 2. EQUIPOS (16, sin grupo)
-- ============================================================================

INSERT INTO teams (competition_id, name, abbreviation, flag_url, group_id, group_position, is_confirmed)
VALUES
  ('c0a00000-0000-4000-8000-000000000001', 'Racing',          'RAC', 'https://estadisticas.tenfield.com.uy/wp-content/uploads/2020/04/escudo-racing.png',                  NULL, NULL, true),
  ('c0a00000-0000-4000-8000-000000000001', 'D. Maldonado',    'DMA', 'https://estadisticas.tenfield.com.uy/wp-content/uploads/2020/04/escudo-deportivo-maldonado.png',      NULL, NULL, true),
  ('c0a00000-0000-4000-8000-000000000001', 'Albion',          'ALB', 'https://estadisticas.tenfield.com.uy/wp-content/uploads/2020/04/escudo-albion.png',                   NULL, NULL, true),
  ('c0a00000-0000-4000-8000-000000000001', 'Peñarol',         'PEN', 'https://estadisticas.tenfield.com.uy/wp-content/uploads/2020/04/escudo-penarol.png',                  NULL, NULL, true),
  ('c0a00000-0000-4000-8000-000000000001', 'Central Español', 'CES', 'https://estadisticas.tenfield.com.uy/wp-content/uploads/2020/04/escudo-central-espanol.png',          NULL, NULL, true),
  ('c0a00000-0000-4000-8000-000000000001', 'M.C. Torque',     'MCT', 'https://estadisticas.tenfield.com.uy/wp-content/uploads/2020/04/escudo-montevideo-city-torque.png',   NULL, NULL, true),
  ('c0a00000-0000-4000-8000-000000000001', 'Nacional',        'NAC', 'https://estadisticas.tenfield.com.uy/wp-content/uploads/2020/04/escudo-nacional.png',                 NULL, NULL, true),
  ('c0a00000-0000-4000-8000-000000000001', 'Def. Sporting',   'DSP', 'https://estadisticas.tenfield.com.uy/wp-content/uploads/2020/04/escudo-defensor-sporting.png',        NULL, NULL, true),
  ('c0a00000-0000-4000-8000-000000000001', 'Liverpool',       'LIV', 'https://estadisticas.tenfield.com.uy/wp-content/uploads/2020/04/escudo-liverpool.png',                NULL, NULL, true),
  ('c0a00000-0000-4000-8000-000000000001', 'Wanderers',       'WAN', 'https://estadisticas.tenfield.com.uy/wp-content/uploads/2020/04/escudo-wanderers.png',                NULL, NULL, true),
  ('c0a00000-0000-4000-8000-000000000001', 'Danubio',         'DAN', 'https://estadisticas.tenfield.com.uy/wp-content/uploads/2020/04/escudo-danubio.png',                  NULL, NULL, true),
  ('c0a00000-0000-4000-8000-000000000001', 'Cerro Largo',     'CLA', 'https://estadisticas.tenfield.com.uy/wp-content/uploads/2020/04/escudo-cerro-largo.png',              NULL, NULL, true),
  ('c0a00000-0000-4000-8000-000000000001', 'Boston River',    'BRI', 'https://estadisticas.tenfield.com.uy/wp-content/uploads/2020/04/escudo-boston-river.png',             NULL, NULL, true),
  ('c0a00000-0000-4000-8000-000000000001', 'Juventud',        'JUV', 'https://estadisticas.tenfield.com.uy/wp-content/uploads/2020/04/escudo-juventud.png',                 NULL, NULL, true),
  ('c0a00000-0000-4000-8000-000000000001', 'Progreso',        'PRO', 'https://estadisticas.tenfield.com.uy/wp-content/uploads/2020/04/escudo-progreso.png',                 NULL, NULL, true),
  ('c0a00000-0000-4000-8000-000000000001', 'Cerro',           'CER', 'https://estadisticas.tenfield.com.uy/wp-content/uploads/2020/04/escudo-cerro.png',                    NULL, NULL, true)
ON CONFLICT (competition_id, abbreviation) DO NOTHING;

-- ============================================================================
-- 3. PARTIDOS (120 = 15 fechas x 8) con resultados finales
--    Hora de inicio por defecto 16:00 (UTC-3, Uruguay). winner_team_id se setea
--    explicito (el trigger auto_set_match_winner solo dispara en UPDATE).
-- ============================================================================

INSERT INTO matches (competition_id, match_number, phase_id, group_id,
  home_team_id, away_team_id, match_datetime, status,
  home_score_90, away_score_90, winner_team_id, round_number)
SELECT 'c0a00000-0000-4000-8000-000000000001', f.match_number, 'c0a00000-0000-4000-8000-000000000003', NULL,
       th.id, ta.id, f.dt, 'finished',
       f.hs, f.vs,
       CASE WHEN f.hs > f.vs THEN th.id
            WHEN f.vs > f.hs THEN ta.id
            ELSE NULL END,
       CEIL(f.match_number / 8.0)::SMALLINT
FROM (VALUES
  (1, TIMESTAMPTZ '2026-02-06 16:00:00-03', 'Wanderers', 'Def. Sporting', 1, 1),
  (2, TIMESTAMPTZ '2026-02-06 16:00:00-03', 'Albion', 'Liverpool', 1, 2),
  (3, TIMESTAMPTZ '2026-02-07 16:00:00-03', 'Peñarol', 'M.C. Torque', 3, 1),
  (4, TIMESTAMPTZ '2026-02-07 16:00:00-03', 'Progreso', 'Central Español', 0, 3),
  (5, TIMESTAMPTZ '2026-02-08 16:00:00-03', 'Boston River', 'Nacional', 1, 2),
  (6, TIMESTAMPTZ '2026-02-08 16:00:00-03', 'Racing', 'D. Maldonado', 2, 4),
  (7, TIMESTAMPTZ '2026-02-08 16:00:00-03', 'Juventud', 'Cerro Largo', 0, 1),
  (8, TIMESTAMPTZ '2026-02-09 16:00:00-03', 'Cerro', 'Danubio', 0, 1),
  (9, TIMESTAMPTZ '2026-02-13 16:00:00-03', 'Liverpool', 'Def. Sporting', 1, 2),
  (10, TIMESTAMPTZ '2026-02-13 16:00:00-03', 'Cerro Largo', 'Wanderers', 1, 2),
  (11, TIMESTAMPTZ '2026-02-14 16:00:00-03', 'D. Maldonado', 'Progreso', 2, 0),
  (12, TIMESTAMPTZ '2026-02-14 16:00:00-03', 'Nacional', 'Racing', 1, 1),
  (13, TIMESTAMPTZ '2026-02-15 16:00:00-03', 'Central Español', 'Peñarol', 2, 1),
  (14, TIMESTAMPTZ '2026-02-15 16:00:00-03', 'Danubio', 'Boston River', 2, 0),
  (15, TIMESTAMPTZ '2026-02-16 16:00:00-03', 'M.C. Torque', 'Juventud', 2, 2),
  (16, TIMESTAMPTZ '2026-02-16 16:00:00-03', 'Albion', 'Cerro', 3, 0),
  (17, TIMESTAMPTZ '2026-02-20 16:00:00-03', 'Cerro', 'Liverpool', 1, 1),
  (18, TIMESTAMPTZ '2026-02-20 16:00:00-03', 'Def. Sporting', 'Cerro Largo', 1, 0),
  (19, TIMESTAMPTZ '2026-02-21 16:00:00-03', 'Boston River', 'Albion', 0, 0),
  (20, TIMESTAMPTZ '2026-02-21 16:00:00-03', 'Racing', 'Danubio', 4, 0),
  (21, TIMESTAMPTZ '2026-02-21 16:00:00-03', 'Progreso', 'Nacional', 0, 1),
  (22, TIMESTAMPTZ '2026-02-22 16:00:00-03', 'Peñarol', 'D. Maldonado', 2, 1),
  (23, TIMESTAMPTZ '2026-02-22 16:00:00-03', 'Juventud', 'Central Español', 0, 1),
  (24, TIMESTAMPTZ '2026-02-22 16:00:00-03', 'Wanderers', 'M.C. Torque', 0, 4),
  (25, TIMESTAMPTZ '2026-02-26 16:00:00-03', 'M.C. Torque', 'Def. Sporting', 1, 0),
  (26, TIMESTAMPTZ '2026-02-27 16:00:00-03', 'Cerro', 'Boston River', 1, 1),
  (27, TIMESTAMPTZ '2026-02-28 16:00:00-03', 'Central Español', 'Wanderers', 0, 1),
  (28, TIMESTAMPTZ '2026-02-28 16:00:00-03', 'Danubio', 'Progreso', 2, 2),
  (29, TIMESTAMPTZ '2026-02-28 16:00:00-03', 'Albion', 'Racing', 1, 3),
  (30, TIMESTAMPTZ '2026-03-01 16:00:00-03', 'Liverpool', 'Cerro Largo', 2, 0),
  (31, TIMESTAMPTZ '2026-03-01 16:00:00-03', 'Nacional', 'Peñarol', 0, 1),
  (32, TIMESTAMPTZ '2026-03-02 16:00:00-03', 'D. Maldonado', 'Juventud', 2, 1),
  (33, TIMESTAMPTZ '2026-03-06 16:00:00-03', 'Wanderers', 'D. Maldonado', 0, 0),
  (34, TIMESTAMPTZ '2026-03-07 16:00:00-03', 'Progreso', 'Albion', 2, 2),
  (35, TIMESTAMPTZ '2026-03-07 16:00:00-03', 'Peñarol', 'Danubio', 1, 1),
  (36, TIMESTAMPTZ '2026-03-08 16:00:00-03', 'Racing', 'Cerro', 1, 0),
  (37, TIMESTAMPTZ '2026-03-08 16:00:00-03', 'Juventud', 'Nacional', 3, 1),
  (38, TIMESTAMPTZ '2026-03-08 16:00:00-03', 'Def. Sporting', 'Central Español', 0, 0),
  (39, TIMESTAMPTZ '2026-03-09 16:00:00-03', 'Boston River', 'Liverpool', 0, 1),
  (40, TIMESTAMPTZ '2026-03-09 16:00:00-03', 'Cerro Largo', 'M.C. Torque', 0, 1),
  (41, TIMESTAMPTZ '2026-03-13 16:00:00-03', 'Nacional', 'Wanderers', 2, 0),
  (42, TIMESTAMPTZ '2026-03-14 16:00:00-03', 'Albion', 'Peñarol', 0, 1),
  (43, TIMESTAMPTZ '2026-03-14 16:00:00-03', 'Cerro', 'Progreso', 0, 1),
  (44, TIMESTAMPTZ '2026-03-14 16:00:00-03', 'Boston River', 'Racing', 0, 1),
  (45, TIMESTAMPTZ '2026-03-15 16:00:00-03', 'Central Español', 'Cerro Largo', 1, 3),
  (46, TIMESTAMPTZ '2026-03-15 16:00:00-03', 'D. Maldonado', 'Def. Sporting', 1, 0),
  (47, TIMESTAMPTZ '2026-03-16 16:00:00-03', 'Liverpool', 'M.C. Torque', 0, 0),
  (48, TIMESTAMPTZ '2026-03-16 16:00:00-03', 'Danubio', 'Juventud', 4, 1),
  (49, TIMESTAMPTZ '2026-03-20 16:00:00-03', 'Def. Sporting', 'Nacional', 2, 1),
  (50, TIMESTAMPTZ '2026-03-20 16:00:00-03', 'Cerro Largo', 'D. Maldonado', 3, 1),
  (51, TIMESTAMPTZ '2026-03-21 16:00:00-03', 'Racing', 'Liverpool', 1, 0),
  (52, TIMESTAMPTZ '2026-03-21 16:00:00-03', 'Peñarol', 'Cerro', 3, 1),
  (53, TIMESTAMPTZ '2026-03-21 16:00:00-03', 'Wanderers', 'Danubio', 2, 1),
  (54, TIMESTAMPTZ '2026-03-21 16:00:00-03', 'M.C. Torque', 'Central Español', 2, 1),
  (55, TIMESTAMPTZ '2026-03-22 16:00:00-03', 'Progreso', 'Boston River', 0, 1),
  (56, TIMESTAMPTZ '2026-03-22 16:00:00-03', 'Juventud', 'Albion', 0, 1),
  (57, TIMESTAMPTZ '2026-03-24 16:00:00-03', 'Liverpool', 'Central Español', 3, 3),
  (58, TIMESTAMPTZ '2026-03-24 16:00:00-03', 'D. Maldonado', 'M.C. Torque', 1, 0),
  (59, TIMESTAMPTZ '2026-03-24 16:00:00-03', 'Nacional', 'Cerro Largo', 3, 0),
  (60, TIMESTAMPTZ '2026-03-25 16:00:00-03', 'Albion', 'Wanderers', 2, 1),
  (61, TIMESTAMPTZ '2026-03-25 16:00:00-03', 'Cerro', 'Juventud', 1, 0),
  (62, TIMESTAMPTZ '2026-03-25 16:00:00-03', 'Boston River', 'Peñarol', 0, 2),
  (63, TIMESTAMPTZ '2026-03-26 16:00:00-03', 'Danubio', 'Def. Sporting', 0, 0),
  (64, TIMESTAMPTZ '2026-03-26 16:00:00-03', 'Racing', 'Progreso', 1, 1),
  (65, TIMESTAMPTZ '2026-03-28 16:00:00-03', 'Wanderers', 'Cerro', 3, 0),
  (66, TIMESTAMPTZ '2026-03-28 16:00:00-03', 'M.C. Torque', 'Nacional', 2, 3),
  (67, TIMESTAMPTZ '2026-03-29 16:00:00-03', 'Peñarol', 'Racing', 1, 2),
  (68, TIMESTAMPTZ '2026-03-30 16:00:00-03', 'Juventud', 'Boston River', 1, 2),
  (69, TIMESTAMPTZ '2026-03-30 16:00:00-03', 'Cerro Largo', 'Danubio', 2, 0),
  (70, TIMESTAMPTZ '2026-03-30 16:00:00-03', 'Central Español', 'D. Maldonado', 2, 1),
  (71, TIMESTAMPTZ '2026-03-31 16:00:00-03', 'Progreso', 'Liverpool', 3, 3),
  (72, TIMESTAMPTZ '2026-03-31 16:00:00-03', 'Def. Sporting', 'Albion', 1, 1),
  (73, TIMESTAMPTZ '2026-04-03 16:00:00-03', 'Nacional', 'Central Español', 0, 1),
  (74, TIMESTAMPTZ '2026-04-03 16:00:00-03', 'Boston River', 'Wanderers', 4, 1),
  (75, TIMESTAMPTZ '2026-04-04 16:00:00-03', 'Danubio', 'M.C. Torque', 1, 1),
  (76, TIMESTAMPTZ '2026-04-04 16:00:00-03', 'Racing', 'Juventud', 2, 1),
  (77, TIMESTAMPTZ '2026-04-04 16:00:00-03', 'Progreso', 'Peñarol', 0, 2),
  (78, TIMESTAMPTZ '2026-04-05 16:00:00-03', 'Liverpool', 'D. Maldonado', 0, 2),
  (79, TIMESTAMPTZ '2026-04-05 16:00:00-03', 'Albion', 'Cerro Largo', 2, 2),
  (80, TIMESTAMPTZ '2026-04-05 16:00:00-03', 'Cerro', 'Def. Sporting', 1, 0),
  (81, TIMESTAMPTZ '2026-04-10 16:00:00-03', 'Cerro Largo', 'Cerro', 1, 1),
  (82, TIMESTAMPTZ '2026-04-11 16:00:00-03', 'Def. Sporting', 'Boston River', 2, 0),
  (83, TIMESTAMPTZ '2026-04-11 16:00:00-03', 'M.C. Torque', 'Albion', 0, 1),
  (84, TIMESTAMPTZ '2026-04-11 16:00:00-03', 'D. Maldonado', 'Nacional', 4, 2),
  (85, TIMESTAMPTZ '2026-04-12 16:00:00-03', 'Juventud', 'Progreso', 1, 0),
  (86, TIMESTAMPTZ '2026-04-12 16:00:00-03', 'Wanderers', 'Racing', 1, 2),
  (87, TIMESTAMPTZ '2026-04-12 16:00:00-03', 'Central Español', 'Danubio', 2, 2),
  (88, TIMESTAMPTZ '2026-04-13 16:00:00-03', 'Peñarol', 'Liverpool', 0, 2),
  (89, TIMESTAMPTZ '2026-04-17 16:00:00-03', 'Albion', 'Central Español', 6, 1),
  (90, TIMESTAMPTZ '2026-04-18 16:00:00-03', 'Racing', 'Def. Sporting', 1, 1),
  (91, TIMESTAMPTZ '2026-04-18 16:00:00-03', 'Progreso', 'Wanderers', 2, 1),
  (92, TIMESTAMPTZ '2026-04-19 16:00:00-03', 'Liverpool', 'Nacional', 1, 3),
  (93, TIMESTAMPTZ '2026-04-19 16:00:00-03', 'Danubio', 'D. Maldonado', 1, 1),
  (94, TIMESTAMPTZ '2026-04-19 16:00:00-03', 'Cerro', 'M.C. Torque', 1, 1),
  (95, TIMESTAMPTZ '2026-04-20 16:00:00-03', 'Boston River', 'Cerro Largo', 1, 0),
  (96, TIMESTAMPTZ '2026-04-20 16:00:00-03', 'Peñarol', 'Juventud', 2, 2),
  (97, TIMESTAMPTZ '2026-04-24 16:00:00-03', 'M.C. Torque', 'Boston River', 4, 1),
  (98, TIMESTAMPTZ '2026-04-25 16:00:00-03', 'Juventud', 'Liverpool', 1, 1),
  (99, TIMESTAMPTZ '2026-04-25 16:00:00-03', 'D. Maldonado', 'Albion', 1, 2),
  (100, TIMESTAMPTZ '2026-04-25 16:00:00-03', 'Nacional', 'Danubio', 1, 2),
  (101, TIMESTAMPTZ '2026-04-26 16:00:00-03', 'Wanderers', 'Peñarol', 1, 0),
  (102, TIMESTAMPTZ '2026-04-26 16:00:00-03', 'Cerro Largo', 'Racing', 0, 1),
  (103, TIMESTAMPTZ '2026-04-26 16:00:00-03', 'Central Español', 'Cerro', 3, 1),
  (104, TIMESTAMPTZ '2026-04-27 16:00:00-03', 'Def. Sporting', 'Progreso', 1, 0),
  (105, TIMESTAMPTZ '2026-05-02 16:00:00-03', 'Liverpool', 'Danubio', 3, 0),
  (106, TIMESTAMPTZ '2026-05-02 16:00:00-03', 'Cerro', 'D. Maldonado', 0, 1),
  (107, TIMESTAMPTZ '2026-05-02 16:00:00-03', 'Juventud', 'Wanderers', 2, 1),
  (108, TIMESTAMPTZ '2026-05-03 16:00:00-03', 'Albion', 'Nacional', 3, 2),
  (109, TIMESTAMPTZ '2026-05-03 16:00:00-03', 'Boston River', 'Central Español', 2, 1),
  (110, TIMESTAMPTZ '2026-05-03 16:00:00-03', 'Racing', 'M.C. Torque', 1, 1),
  (111, TIMESTAMPTZ '2026-05-03 16:00:00-03', 'Progreso', 'Cerro Largo', 0, 1),
  (112, TIMESTAMPTZ '2026-05-04 16:00:00-03', 'Peñarol', 'Def. Sporting', 1, 1),
  (113, TIMESTAMPTZ '2026-05-08 16:00:00-03', 'Wanderers', 'Liverpool', 1, 0),
  (114, TIMESTAMPTZ '2026-05-09 16:00:00-03', 'Central Español', 'Racing', 2, 0),
  (115, TIMESTAMPTZ '2026-05-09 16:00:00-03', 'Danubio', 'Albion', 0, 1),
  (116, TIMESTAMPTZ '2026-05-10 16:00:00-03', 'Def. Sporting', 'Juventud', 1, 2),
  (117, TIMESTAMPTZ '2026-05-10 16:00:00-03', 'M.C. Torque', 'Progreso', 2, 1),
  (118, TIMESTAMPTZ '2026-05-10 16:00:00-03', 'Nacional', 'Cerro', 4, 0),
  (119, TIMESTAMPTZ '2026-05-11 16:00:00-03', 'Cerro Largo', 'Peñarol', 2, 3),
  (120, TIMESTAMPTZ '2026-05-11 16:00:00-03', 'D. Maldonado', 'Boston River', 2, 1)
) AS f(match_number, dt, home, away, hs, vs)
JOIN teams th ON th.competition_id = 'c0a00000-0000-4000-8000-000000000001' AND th.name = f.home
JOIN teams ta ON ta.competition_id = 'c0a00000-0000-4000-8000-000000000001' AND ta.name = f.away
ON CONFLICT (competition_id, match_number) DO NOTHING;

-- ============================================================================
-- 4. TEN-COMP publico asociado al tenant "Publico"
--    Sin bonus (la competencia no define tipos de bonus).
-- ============================================================================

INSERT INTO ten_comps (id, tenant_id, competition_id, name, slug, visibility,
                       join_code, status, menu_config, bonus_enabled)
VALUES ('c0a00000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'c0a00000-0000-4000-8000-000000000001',
        'Apertura UY 2026', 'apertura-uy-2026', 'public',
        NULL, 'open',
        (SELECT default_menu FROM competitions WHERE id = 'c0a00000-0000-4000-8000-000000000001'),
        false)
ON CONFLICT (id) DO NOTHING;

-- Scoring del Ten-Comp <- defaults de la competencia
INSERT INTO ten_comp_scoring (ten_comp_id, exact_score_points, correct_winner_points,
  correct_draw_points, knockout_exact_score_bonus, correct_et_result_points, correct_pk_winner_points)
SELECT 'c0a00000-0000-4000-8000-000000000002',
  (default_scoring->>'exact_score_points')::smallint,
  (default_scoring->>'correct_winner_points')::smallint,
  (default_scoring->>'correct_draw_points')::smallint,
  (default_scoring->>'knockout_exact_score_bonus')::smallint,
  (default_scoring->>'correct_et_result_points')::smallint,
  (default_scoring->>'correct_pk_winner_points')::smallint
FROM competitions WHERE id = 'c0a00000-0000-4000-8000-000000000001'
ON CONFLICT (ten_comp_id) DO NOTHING;

COMMIT;

-- ============================================================================
-- VERIFICACION (opcional)
--   SELECT count(*) FROM teams   WHERE competition_id = 'c0a00000-0000-4000-8000-000000000001';  -- 16
--   SELECT count(*) FROM matches WHERE competition_id = 'c0a00000-0000-4000-8000-000000000001';  -- 120
--   SELECT count(*) FROM matches WHERE competition_id = 'c0a00000-0000-4000-8000-000000000001' AND status='finished'; -- 120
-- ============================================================================
