-- ============================================================================
-- 95_SEED_INTERMEDIO_UY_2026.SQL -- PencaLes 2.0
-- Competencia publica "Intermedio UY 2026": torneo uruguayo de 16 equipos
-- divididos en 2 SERIES de 8 (Serie A / Serie B). Dentro de cada serie se juega
-- todos contra todos (7 fechas x 4 partidos por serie = 8 partidos por fecha,
-- 56 partidos en total, 28 por serie). Cada serie lleva su propia tabla de
-- posiciones (vista group_standings, particionada por group_id), con el mismo
-- criterio de desempate que Apertura: PTS -> DG -> GF -> nombre.
--
-- El torneo real tiene una final entre el 1ro de cada serie: NO se modela aqui.
--
-- Las series mapean a la tabla `groups` (name 'A'/'B' -- la columna es VARCHAR(4),
-- por eso no se usa "Serie A"). La UI mostrara "Grupo A/Grupo B" via la pagina
-- de Grupos; no se toca el frontend (decision del usuario).
--
-- ESTADO: torneo EN CURSO al 2026-06-19. Fechas 1-4 jugadas (31 partidos
-- 'finished' con resultado; el partido Danubio-Juventud de la fecha 2 quedo
-- POSTERGADO -> 'scheduled'). Fechas 5-7 ('scheduled', abiertas a prediccion):
--   * Serie A fecha 5: cruces oficiales (AUF).
--   * Serie A fechas 6-7 y Serie B fechas 5-7: la AUF aun no publico el detalle
--     al cargar este seed; los cruces se completaron resolviendo el round-robin
--     (cada equipo enfrenta exactamente una vez a los 7 de su serie -- la
--     ESTRUCTURA es exacta; el reparto local/visitante y la asignacion a fecha
--     6 vs 7 es provisional, ajustable cuando la AUF lo confirme).
-- Fechas calendario de las fechas futuras fijadas por pedido del usuario:
--   fecha 5 = 29/06/2026, fecha 6 = 06/07/2026, fecha 7 = 13/07/2026.
--
-- Fuente: es.wikipedia.org/wiki/Torneo_Intermedio_2026 + auf.org.uy.
-- Idempotente: ON CONFLICT DO NOTHING en cada bloque.
--
-- UUIDs ancla fijos:
--   Competencia Intermedio UY 2026 = c0b00000-0000-4000-8000-000000000001
--   Ten-Comp    Intermedio UY 2026 = c0b00000-0000-4000-8000-000000000002
--   Fase        Fase Regular       = c0b00000-0000-4000-8000-000000000003
--   Grupo       Serie A            = c0b00000-0000-4000-8000-000000000004
--   Grupo       Serie B            = c0b00000-0000-4000-8000-000000000005
--   Tenant      Publico            = 11111111-1111-4111-8111-111111111111
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. COMPETENCIA (catalogo deportivo)
-- ============================================================================

INSERT INTO competitions (id, name, sport, season, status, start_date, end_date,
                          advancement_engine, owner_tenant_id, default_menu)
VALUES ('c0b00000-0000-4000-8000-000000000001', 'Intermedio UY 2026', 'futbol', '2026',
        'active', DATE '2026-05-15', DATE '2026-07-13',
        NULL, NULL,
        -- 2 series -> se usa la pagina "Grupos" (tabla por serie). Sin cuadro de
        -- eliminatorias, sin +Puntos, y sin "Posiciones" (esa es tabla unica de
        -- liga y fusionaria ambas series).
        '{"fixture":true,"grupos":true,"cuadro":false,"posiciones":false,"ranking":true,"mis_predicciones":true,"mas_puntos":false,"subgrupos":true,"ayuda":true}'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- Fase unica (los partidos requieren phase_id NOT NULL)
INSERT INTO phases (id, competition_id, name, sort_order, has_extra_time, has_penalties)
VALUES ('c0b00000-0000-4000-8000-000000000003', 'c0b00000-0000-4000-8000-000000000001', 'Fase Regular', 1, false, false)
ON CONFLICT (id) DO NOTHING;

-- Las 2 series como grupos (name VARCHAR(4))
INSERT INTO groups (id, competition_id, name, sort_order)
VALUES
  ('c0b00000-0000-4000-8000-000000000004', 'c0b00000-0000-4000-8000-000000000001', 'A', 1),
  ('c0b00000-0000-4000-8000-000000000005', 'c0b00000-0000-4000-8000-000000000001', 'B', 2)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 2. EQUIPOS (16, 8 por serie). Mismos nombres/escudos que Apertura UY 2026.
-- ============================================================================

INSERT INTO teams (competition_id, name, abbreviation, flag_url, group_id, group_position, is_confirmed)
SELECT 'c0b00000-0000-4000-8000-000000000001', t.name, t.abbr, t.flag, g.id, NULL, true
FROM (VALUES
  -- Serie A
  ('Racing',          'RAC', 'https://estadisticas.tenfield.com.uy/wp-content/uploads/2020/04/escudo-racing.png',                'A'),
  ('Peñarol',         'PEN', 'https://estadisticas.tenfield.com.uy/wp-content/uploads/2020/04/escudo-penarol.png',               'A'),
  ('Central Español', 'CES', 'https://estadisticas.tenfield.com.uy/wp-content/uploads/2020/04/escudo-central-espanol.png',       'A'),
  ('Def. Sporting',   'DSP', 'https://estadisticas.tenfield.com.uy/wp-content/uploads/2020/04/escudo-defensor-sporting.png',     'A'),
  ('Liverpool',       'LIV', 'https://estadisticas.tenfield.com.uy/wp-content/uploads/2020/04/escudo-liverpool.png',             'A'),
  ('Cerro Largo',     'CLA', 'https://estadisticas.tenfield.com.uy/wp-content/uploads/2020/04/escudo-cerro-largo.png',           'A'),
  ('Boston River',    'BRI', 'https://estadisticas.tenfield.com.uy/wp-content/uploads/2020/04/escudo-boston-river.png',          'A'),
  ('Cerro',           'CER', 'https://estadisticas.tenfield.com.uy/wp-content/uploads/2020/04/escudo-cerro.png',                 'A'),
  -- Serie B
  ('D. Maldonado',    'DMA', 'https://estadisticas.tenfield.com.uy/wp-content/uploads/2020/04/escudo-deportivo-maldonado.png',   'B'),
  ('Albion',          'ALB', 'https://estadisticas.tenfield.com.uy/wp-content/uploads/2020/04/escudo-albion.png',                'B'),
  ('M.C. Torque',     'MCT', 'https://estadisticas.tenfield.com.uy/wp-content/uploads/2020/04/escudo-montevideo-city-torque.png', 'B'),
  ('Nacional',        'NAC', 'https://estadisticas.tenfield.com.uy/wp-content/uploads/2020/04/escudo-nacional.png',              'B'),
  ('Danubio',         'DAN', 'https://estadisticas.tenfield.com.uy/wp-content/uploads/2020/04/escudo-danubio.png',               'B'),
  ('Wanderers',       'WAN', 'https://estadisticas.tenfield.com.uy/wp-content/uploads/2020/04/escudo-wanderers.png',             'B'),
  ('Juventud',        'JUV', 'https://estadisticas.tenfield.com.uy/wp-content/uploads/2020/04/escudo-juventud.png',              'B'),
  ('Progreso',        'PRO', 'https://estadisticas.tenfield.com.uy/wp-content/uploads/2020/04/escudo-progreso.png',              'B')
) AS t(name, abbr, flag, serie)
JOIN groups g ON g.competition_id = 'c0b00000-0000-4000-8000-000000000001' AND g.name = t.serie
ON CONFLICT (competition_id, abbreviation) DO NOTHING;

-- ============================================================================
-- 3. PARTIDOS (56 = 7 fechas x 8). round_number = CEIL(match_number/8).
--    Cada fecha: match_number 1-4 = Serie A, 5-8 = Serie B.
--    Hora por defecto 16:00 (UTC-3). winner_team_id se setea explicito solo en
--    los 'finished' (el trigger auto_set_match_winner solo dispara en UPDATE).
-- ============================================================================

INSERT INTO matches (competition_id, match_number, phase_id, group_id,
  home_team_id, away_team_id, match_datetime, status,
  home_score_90, away_score_90, winner_team_id, round_number)
SELECT 'c0b00000-0000-4000-8000-000000000001', f.match_number,
       'c0b00000-0000-4000-8000-000000000003', g.id,
       th.id, ta.id, f.dt, f.status,
       f.hs, f.vs,
       CASE WHEN f.status = 'finished' AND f.hs > f.vs THEN th.id
            WHEN f.status = 'finished' AND f.vs > f.hs THEN ta.id
            ELSE NULL END,
       CEIL(f.match_number / 8.0)::SMALLINT
FROM (VALUES
  -- ── FECHA 1 (jugada) ──────────────────────────────────────────────────────
  ( 1, TIMESTAMPTZ '2026-05-16 16:00:00-03', 'A', 'Peñarol',         'Liverpool',     2, 1, 'finished'),
  ( 2, TIMESTAMPTZ '2026-05-16 16:00:00-03', 'A', 'Boston River',    'Cerro',         4, 1, 'finished'),
  ( 3, TIMESTAMPTZ '2026-05-16 16:00:00-03', 'A', 'Racing',          'Cerro Largo',   1, 0, 'finished'),
  ( 4, TIMESTAMPTZ '2026-05-16 16:00:00-03', 'A', 'Central Español', 'Def. Sporting', 2, 1, 'finished'),
  ( 5, TIMESTAMPTZ '2026-05-16 16:00:00-03', 'B', 'M.C. Torque',     'Nacional',      1, 2, 'finished'),
  ( 6, TIMESTAMPTZ '2026-05-16 16:00:00-03', 'B', 'Juventud',        'Progreso',      2, 0, 'finished'),
  ( 7, TIMESTAMPTZ '2026-05-16 16:00:00-03', 'B', 'Albion',          'Wanderers',     0, 0, 'finished'),
  ( 8, TIMESTAMPTZ '2026-05-16 16:00:00-03', 'B', 'D. Maldonado',    'Danubio',       3, 1, 'finished'),
  -- ── FECHA 2 (jugada; Danubio-Juventud POSTERGADO -> scheduled) ─────────────
  ( 9, TIMESTAMPTZ '2026-05-23 16:00:00-03', 'A', 'Liverpool',       'Racing',        0, 0, 'finished'),
  (10, TIMESTAMPTZ '2026-05-23 16:00:00-03', 'A', 'Cerro Largo',     'Boston River',  3, 0, 'finished'),
  (11, TIMESTAMPTZ '2026-05-23 16:00:00-03', 'A', 'Cerro',           'Central Español',1, 0, 'finished'),
  (12, TIMESTAMPTZ '2026-05-23 16:00:00-03', 'A', 'Def. Sporting',   'Peñarol',       0, 2, 'finished'),
  (13, TIMESTAMPTZ '2026-05-23 16:00:00-03', 'B', 'Progreso',        'M.C. Torque',   1, 2, 'finished'),
  (14, TIMESTAMPTZ '2026-05-23 16:00:00-03', 'B', 'Nacional',        'Albion',        1, 0, 'finished'),
  (15, TIMESTAMPTZ '2026-05-23 16:00:00-03', 'B', 'Wanderers',       'D. Maldonado',  1, 1, 'finished'),
  (16, TIMESTAMPTZ '2026-06-24 16:00:00-03', 'B', 'Danubio',         'Juventud',   NULL, NULL, 'scheduled'),
  -- ── FECHA 3 (jugada) ──────────────────────────────────────────────────────
  (17, TIMESTAMPTZ '2026-05-30 16:00:00-03', 'A', 'Cerro Largo',     'Cerro',         2, 0, 'finished'),
  (18, TIMESTAMPTZ '2026-05-30 16:00:00-03', 'A', 'Racing',          'Def. Sporting', 0, 0, 'finished'),
  (19, TIMESTAMPTZ '2026-05-30 16:00:00-03', 'A', 'Boston River',    'Liverpool',     0, 1, 'finished'),
  (20, TIMESTAMPTZ '2026-05-30 16:00:00-03', 'A', 'Peñarol',         'Central Español',0, 1, 'finished'),
  (21, TIMESTAMPTZ '2026-05-30 16:00:00-03', 'B', 'Danubio',         'Progreso',      1, 2, 'finished'),
  (22, TIMESTAMPTZ '2026-05-30 16:00:00-03', 'B', 'Juventud',        'Wanderers',     2, 5, 'finished'),
  (23, TIMESTAMPTZ '2026-05-30 16:00:00-03', 'B', 'D. Maldonado',    'Nacional',      3, 0, 'finished'),
  (24, TIMESTAMPTZ '2026-05-30 16:00:00-03', 'B', 'Albion',          'M.C. Torque',   1, 2, 'finished'),
  -- ── FECHA 4 (jugada) ──────────────────────────────────────────────────────
  (25, TIMESTAMPTZ '2026-06-06 16:00:00-03', 'A', 'Central Español', 'Racing',        1, 1, 'finished'),
  (26, TIMESTAMPTZ '2026-06-06 16:00:00-03', 'A', 'Cerro',           'Peñarol',       0, 1, 'finished'),
  (27, TIMESTAMPTZ '2026-06-06 16:00:00-03', 'A', 'Def. Sporting',   'Boston River',  1, 1, 'finished'),
  (28, TIMESTAMPTZ '2026-06-06 16:00:00-03', 'A', 'Liverpool',       'Cerro Largo',   0, 0, 'finished'),
  (29, TIMESTAMPTZ '2026-06-06 16:00:00-03', 'B', 'Wanderers',       'Danubio',       0, 0, 'finished'),
  (30, TIMESTAMPTZ '2026-06-06 16:00:00-03', 'B', 'M.C. Torque',     'D. Maldonado',  2, 4, 'finished'),
  (31, TIMESTAMPTZ '2026-06-06 16:00:00-03', 'B', 'Nacional',        'Juventud',      2, 1, 'finished'),
  (32, TIMESTAMPTZ '2026-06-06 16:00:00-03', 'B', 'Progreso',        'Albion',        1, 2, 'finished'),
  -- ── FECHA 5 (29/06/2026, scheduled). Serie A: cruces oficiales AUF. ─────────
  (33, TIMESTAMPTZ '2026-06-29 16:00:00-03', 'A', 'Liverpool',       'Cerro',      NULL, NULL, 'scheduled'),
  (34, TIMESTAMPTZ '2026-06-29 16:00:00-03', 'A', 'Cerro Largo',     'Def. Sporting',NULL, NULL, 'scheduled'),
  (35, TIMESTAMPTZ '2026-06-29 16:00:00-03', 'A', 'Boston River',    'Central Español',NULL,NULL,'scheduled'),
  (36, TIMESTAMPTZ '2026-06-29 16:00:00-03', 'A', 'Racing',          'Peñarol',    NULL, NULL, 'scheduled'),
  (37, TIMESTAMPTZ '2026-06-29 16:00:00-03', 'B', 'D. Maldonado',    'Albion',     NULL, NULL, 'scheduled'),
  (38, TIMESTAMPTZ '2026-06-29 16:00:00-03', 'B', 'Juventud',        'M.C. Torque',NULL, NULL, 'scheduled'),
  (39, TIMESTAMPTZ '2026-06-29 16:00:00-03', 'B', 'Nacional',        'Danubio',    NULL, NULL, 'scheduled'),
  (40, TIMESTAMPTZ '2026-06-29 16:00:00-03', 'B', 'Wanderers',       'Progreso',   NULL, NULL, 'scheduled'),
  -- ── FECHA 6 (06/07/2026, scheduled; cruces provisionales por round-robin) ──
  (41, TIMESTAMPTZ '2026-07-06 16:00:00-03', 'A', 'Racing',          'Boston River',NULL, NULL, 'scheduled'),
  (42, TIMESTAMPTZ '2026-07-06 16:00:00-03', 'A', 'Peñarol',         'Cerro Largo', NULL, NULL, 'scheduled'),
  (43, TIMESTAMPTZ '2026-07-06 16:00:00-03', 'A', 'Central Español', 'Liverpool',   NULL, NULL, 'scheduled'),
  (44, TIMESTAMPTZ '2026-07-06 16:00:00-03', 'A', 'Def. Sporting',   'Cerro',       NULL, NULL, 'scheduled'),
  (45, TIMESTAMPTZ '2026-07-06 16:00:00-03', 'B', 'D. Maldonado',    'Juventud',    NULL, NULL, 'scheduled'),
  (46, TIMESTAMPTZ '2026-07-06 16:00:00-03', 'B', 'Albion',          'Danubio',     NULL, NULL, 'scheduled'),
  (47, TIMESTAMPTZ '2026-07-06 16:00:00-03', 'B', 'M.C. Torque',     'Wanderers',   NULL, NULL, 'scheduled'),
  (48, TIMESTAMPTZ '2026-07-06 16:00:00-03', 'B', 'Nacional',        'Progreso',    NULL, NULL, 'scheduled'),
  -- ── FECHA 7 (13/07/2026, scheduled; cruces provisionales por round-robin) ──
  (49, TIMESTAMPTZ '2026-07-13 16:00:00-03', 'A', 'Peñarol',         'Boston River',NULL, NULL, 'scheduled'),
  (50, TIMESTAMPTZ '2026-07-13 16:00:00-03', 'A', 'Central Español', 'Cerro Largo', NULL, NULL, 'scheduled'),
  (51, TIMESTAMPTZ '2026-07-13 16:00:00-03', 'A', 'Def. Sporting',   'Liverpool',   NULL, NULL, 'scheduled'),
  (52, TIMESTAMPTZ '2026-07-13 16:00:00-03', 'A', 'Racing',          'Cerro',       NULL, NULL, 'scheduled'),
  (53, TIMESTAMPTZ '2026-07-13 16:00:00-03', 'B', 'D. Maldonado',    'Progreso',    NULL, NULL, 'scheduled'),
  (54, TIMESTAMPTZ '2026-07-13 16:00:00-03', 'B', 'Albion',          'Juventud',    NULL, NULL, 'scheduled'),
  (55, TIMESTAMPTZ '2026-07-13 16:00:00-03', 'B', 'M.C. Torque',     'Danubio',     NULL, NULL, 'scheduled'),
  (56, TIMESTAMPTZ '2026-07-13 16:00:00-03', 'B', 'Nacional',        'Wanderers',   NULL, NULL, 'scheduled')
) AS f(match_number, dt, serie, home, away, hs, vs, status)
JOIN groups g ON g.competition_id = 'c0b00000-0000-4000-8000-000000000001' AND g.name = f.serie
JOIN teams th ON th.competition_id = 'c0b00000-0000-4000-8000-000000000001' AND th.name = f.home
JOIN teams ta ON ta.competition_id = 'c0b00000-0000-4000-8000-000000000001' AND ta.name = f.away
ON CONFLICT (competition_id, match_number) DO NOTHING;

-- ============================================================================
-- 4. TEN-COMP publico asociado al tenant "Publico"
--    Sin bonus (la competencia no define tipos de bonus).
-- ============================================================================

INSERT INTO ten_comps (id, tenant_id, competition_id, name, slug, visibility,
                       join_code, status, menu_config, bonus_enabled)
VALUES ('c0b00000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'c0b00000-0000-4000-8000-000000000001',
        'Intermedio UY 2026', 'intermedio-uy-2026', 'public',
        NULL, 'open',
        (SELECT default_menu FROM competitions WHERE id = 'c0b00000-0000-4000-8000-000000000001'),
        false)
ON CONFLICT (id) DO NOTHING;

-- Scoring del Ten-Comp <- defaults de la competencia
INSERT INTO ten_comp_scoring (ten_comp_id, exact_score_points, correct_winner_points,
  correct_draw_points, knockout_exact_score_bonus, correct_et_result_points, correct_pk_winner_points)
SELECT 'c0b00000-0000-4000-8000-000000000002',
  (default_scoring->>'exact_score_points')::smallint,
  (default_scoring->>'correct_winner_points')::smallint,
  (default_scoring->>'correct_draw_points')::smallint,
  (default_scoring->>'knockout_exact_score_bonus')::smallint,
  (default_scoring->>'correct_et_result_points')::smallint,
  (default_scoring->>'correct_pk_winner_points')::smallint
FROM competitions WHERE id = 'c0b00000-0000-4000-8000-000000000001'
ON CONFLICT (ten_comp_id) DO NOTHING;

COMMIT;

-- ============================================================================
-- VERIFICACION (opcional)
--   SELECT count(*) FROM teams   WHERE competition_id = 'c0b00000-0000-4000-8000-000000000001';                         -- 16
--   SELECT g.name, count(*) FROM teams t JOIN groups g ON g.id=t.group_id
--     WHERE t.competition_id='c0b00000-0000-4000-8000-000000000001' GROUP BY g.name;                                    -- A=8, B=8
--   SELECT count(*) FROM matches WHERE competition_id = 'c0b00000-0000-4000-8000-000000000001';                         -- 56
--   SELECT status, count(*) FROM matches WHERE competition_id='c0b00000-0000-4000-8000-000000000001' GROUP BY status;   -- finished=31, scheduled=25
--   SELECT round_number, count(*) FROM matches WHERE competition_id='c0b00000-0000-4000-8000-000000000001'
--     GROUP BY round_number ORDER BY round_number;                                                                      -- 8 por fecha (1..7)
--   -- Cada equipo debe tener 7 partidos en su serie:
--   SELECT t.name, count(*) FROM matches m
--     JOIN teams t ON t.id IN (m.home_team_id, m.away_team_id)
--     WHERE m.competition_id='c0b00000-0000-4000-8000-000000000001' GROUP BY t.name ORDER BY 2;                         -- todos 7
--   SELECT * FROM group_standings WHERE competition_id='c0b00000-0000-4000-8000-000000000001' ORDER BY group_order, position;
-- ============================================================================
