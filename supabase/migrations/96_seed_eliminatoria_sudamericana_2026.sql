-- ============================================================================
-- 96_SEED_ELIMINATORIA_SUDAMERICANA_2026.SQL -- PencaLes 2.0
-- Competencia publica "Eliminatoria Sudamericana 2026": clasificatorias CONMEBOL
-- al Mundial 2026. 10 selecciones, todos contra todos a IDA y VUELTA en una
-- UNICA tabla (18 fechas x 5 partidos = 90 partidos). Los puntos de las dos
-- vueltas se suman en la misma tabla: NO se divide 1ra/2da ronda -> es una liga
-- de tabla unica, identica en estructura al Apertura UY (no hay grupos ni
-- eliminatoria -> advancement_engine = NULL, una sola fase, menu "posiciones").
--
-- Cada par de selecciones juega 2 veces (fechas 1-9 ida, 10-18 vuelta), pero el
-- modelo no necesita saberlo: cada partido es una fila mas con su round_number
-- (= la fecha), y la tabla unica acumula los 90 partidos.
--
-- ESTADO: torneo FINALIZADO (sep 2023 -> sep 2025), todos los resultados cargados.
-- Hora de inicio: 00:00 (UTC-3) por pedido del usuario (la fuente no trae hora).
-- Fuente del fixture/resultados: conmebol.com + es.wikipedia.org + ESPN.
--
-- Idempotente: ON CONFLICT DO NOTHING en cada bloque.
--
-- UUIDs ancla fijos:
--   Competencia Eliminatoria Sudamericana 2026 = c0c00000-0000-4000-8000-000000000001
--   Ten-Comp    Eliminatoria Sudamericana 2026 = c0c00000-0000-4000-8000-000000000002
--   Fase        Fase Regular                    = c0c00000-0000-4000-8000-000000000003
--   Tenant      Publico                         = 11111111-1111-4111-8111-111111111111
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. COMPETENCIA (catalogo deportivo)
-- ============================================================================

INSERT INTO competitions (id, name, sport, season, status, start_date, end_date,
                          advancement_engine, owner_tenant_id, default_menu)
VALUES ('c0c00000-0000-4000-8000-000000000001', 'Eliminatoria Sudamericana 2026', 'futbol', '2026',
        'finished', DATE '2023-09-07', DATE '2025-09-09',
        NULL, NULL,
        -- liga de tabla unica: sin grupos ni cuadro; con Posiciones (tabla unica
        -- via leagueStandingsService), sin +Puntos. ('posiciones' es opt-in.)
        '{"fixture":true,"grupos":false,"cuadro":false,"posiciones":true,"ranking":true,"mis_predicciones":true,"mas_puntos":false,"subgrupos":true,"ayuda":true}'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- Fase unica (los partidos requieren phase_id NOT NULL)
INSERT INTO phases (id, competition_id, name, sort_order, has_extra_time, has_penalties)
VALUES ('c0c00000-0000-4000-8000-000000000003', 'c0c00000-0000-4000-8000-000000000001', 'Fase Regular', 1, false, false)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 2. EQUIPOS (10 selecciones CONMEBOL, sin grupo). Abreviaturas = codigos FIFA.
--    Banderas: flagcdn.com (codigo ISO de pais).
-- ============================================================================

INSERT INTO teams (competition_id, name, abbreviation, flag_url, group_id, group_position, is_confirmed)
VALUES
  ('c0c00000-0000-4000-8000-000000000001', 'Argentina', 'ARG', 'https://flagcdn.com/w320/ar.png', NULL, NULL, true),
  ('c0c00000-0000-4000-8000-000000000001', 'Bolivia',   'BOL', 'https://flagcdn.com/w320/bo.png', NULL, NULL, true),
  ('c0c00000-0000-4000-8000-000000000001', 'Brasil',    'BRA', 'https://flagcdn.com/w320/br.png', NULL, NULL, true),
  ('c0c00000-0000-4000-8000-000000000001', 'Chile',     'CHI', 'https://flagcdn.com/w320/cl.png', NULL, NULL, true),
  ('c0c00000-0000-4000-8000-000000000001', 'Colombia',  'COL', 'https://flagcdn.com/w320/co.png', NULL, NULL, true),
  ('c0c00000-0000-4000-8000-000000000001', 'Ecuador',   'ECU', 'https://flagcdn.com/w320/ec.png', NULL, NULL, true),
  ('c0c00000-0000-4000-8000-000000000001', 'Paraguay',  'PAR', 'https://flagcdn.com/w320/py.png', NULL, NULL, true),
  ('c0c00000-0000-4000-8000-000000000001', 'Perú',      'PER', 'https://flagcdn.com/w320/pe.png', NULL, NULL, true),
  ('c0c00000-0000-4000-8000-000000000001', 'Uruguay',   'URU', 'https://flagcdn.com/w320/uy.png', NULL, NULL, true),
  ('c0c00000-0000-4000-8000-000000000001', 'Venezuela', 'VEN', 'https://flagcdn.com/w320/ve.png', NULL, NULL, true)
ON CONFLICT (competition_id, abbreviation) DO NOTHING;

-- ============================================================================
-- 3. PARTIDOS (90 = 18 fechas x 5) con resultados finales.
--    round_number = la fecha = CEIL(match_number / 5.0). Hora 00:00 (UTC-3).
--    winner_team_id se setea explicito (auto_set_match_winner solo en UPDATE).
-- ============================================================================

INSERT INTO matches (competition_id, match_number, phase_id, group_id,
  home_team_id, away_team_id, match_datetime, status,
  home_score_90, away_score_90, winner_team_id, round_number)
SELECT 'c0c00000-0000-4000-8000-000000000001', f.match_number, 'c0c00000-0000-4000-8000-000000000003', NULL,
       th.id, ta.id, f.dt, 'finished',
       f.hs, f.vs,
       CASE WHEN f.hs > f.vs THEN th.id
            WHEN f.vs > f.hs THEN ta.id
            ELSE NULL END,
       CEIL(f.match_number / 5.0)::SMALLINT
FROM (VALUES
  -- Fecha 1 (2023-09-07/08)
  (1,  TIMESTAMPTZ '2023-09-07 00:00:00-03', 'Paraguay', 'Perú', 0, 0),
  (2,  TIMESTAMPTZ '2023-09-07 00:00:00-03', 'Colombia', 'Venezuela', 1, 0),
  (3,  TIMESTAMPTZ '2023-09-07 00:00:00-03', 'Argentina', 'Ecuador', 1, 0),
  (4,  TIMESTAMPTZ '2023-09-08 00:00:00-03', 'Uruguay', 'Chile', 3, 1),
  (5,  TIMESTAMPTZ '2023-09-08 00:00:00-03', 'Brasil', 'Bolivia', 5, 1),
  -- Fecha 2 (2023-09-12)
  (6,  TIMESTAMPTZ '2023-09-12 00:00:00-03', 'Bolivia', 'Argentina', 0, 3),
  (7,  TIMESTAMPTZ '2023-09-12 00:00:00-03', 'Ecuador', 'Uruguay', 2, 1),
  (8,  TIMESTAMPTZ '2023-09-12 00:00:00-03', 'Venezuela', 'Paraguay', 1, 0),
  (9,  TIMESTAMPTZ '2023-09-12 00:00:00-03', 'Chile', 'Colombia', 0, 0),
  (10, TIMESTAMPTZ '2023-09-12 00:00:00-03', 'Perú', 'Brasil', 0, 1),
  -- Fecha 3 (2023-10-12)
  (11, TIMESTAMPTZ '2023-10-12 00:00:00-03', 'Colombia', 'Uruguay', 2, 2),
  (12, TIMESTAMPTZ '2023-10-12 00:00:00-03', 'Bolivia', 'Ecuador', 1, 2),
  (13, TIMESTAMPTZ '2023-10-12 00:00:00-03', 'Argentina', 'Paraguay', 1, 0),
  (14, TIMESTAMPTZ '2023-10-12 00:00:00-03', 'Chile', 'Perú', 2, 0),
  (15, TIMESTAMPTZ '2023-10-12 00:00:00-03', 'Brasil', 'Venezuela', 1, 1),
  -- Fecha 4 (2023-10-17)
  (16, TIMESTAMPTZ '2023-10-17 00:00:00-03', 'Venezuela', 'Chile', 3, 0),
  (17, TIMESTAMPTZ '2023-10-17 00:00:00-03', 'Paraguay', 'Bolivia', 1, 0),
  (18, TIMESTAMPTZ '2023-10-17 00:00:00-03', 'Ecuador', 'Colombia', 0, 0),
  (19, TIMESTAMPTZ '2023-10-17 00:00:00-03', 'Uruguay', 'Brasil', 2, 0),
  (20, TIMESTAMPTZ '2023-10-17 00:00:00-03', 'Perú', 'Argentina', 0, 2),
  -- Fecha 5 (2023-11-16)
  (21, TIMESTAMPTZ '2023-11-16 00:00:00-03', 'Bolivia', 'Perú', 2, 0),
  (22, TIMESTAMPTZ '2023-11-16 00:00:00-03', 'Venezuela', 'Ecuador', 0, 0),
  (23, TIMESTAMPTZ '2023-11-16 00:00:00-03', 'Colombia', 'Brasil', 2, 1),
  (24, TIMESTAMPTZ '2023-11-16 00:00:00-03', 'Argentina', 'Uruguay', 0, 2),
  (25, TIMESTAMPTZ '2023-11-16 00:00:00-03', 'Chile', 'Paraguay', 0, 0),
  -- Fecha 6 (2023-11-21)
  (26, TIMESTAMPTZ '2023-11-21 00:00:00-03', 'Paraguay', 'Colombia', 0, 1),
  (27, TIMESTAMPTZ '2023-11-21 00:00:00-03', 'Ecuador', 'Chile', 1, 0),
  (28, TIMESTAMPTZ '2023-11-21 00:00:00-03', 'Uruguay', 'Bolivia', 3, 0),
  (29, TIMESTAMPTZ '2023-11-21 00:00:00-03', 'Brasil', 'Argentina', 0, 1),
  (30, TIMESTAMPTZ '2023-11-21 00:00:00-03', 'Perú', 'Venezuela', 1, 1),
  -- Fecha 7 (2024-09-06)
  (31, TIMESTAMPTZ '2024-09-06 00:00:00-03', 'Bolivia', 'Venezuela', 4, 0),
  (32, TIMESTAMPTZ '2024-09-05 00:00:00-03', 'Argentina', 'Chile', 3, 0),
  (33, TIMESTAMPTZ '2024-09-06 00:00:00-03', 'Uruguay', 'Paraguay', 0, 0),
  (34, TIMESTAMPTZ '2024-09-06 00:00:00-03', 'Brasil', 'Ecuador', 1, 0),
  (35, TIMESTAMPTZ '2024-09-06 00:00:00-03', 'Perú', 'Colombia', 1, 1),
  -- Fecha 8 (2024-09-10)
  (36, TIMESTAMPTZ '2024-09-10 00:00:00-03', 'Colombia', 'Argentina', 2, 1),
  (37, TIMESTAMPTZ '2024-09-10 00:00:00-03', 'Ecuador', 'Perú', 1, 0),
  (38, TIMESTAMPTZ '2024-09-10 00:00:00-03', 'Chile', 'Bolivia', 1, 2),
  (39, TIMESTAMPTZ '2024-09-10 00:00:00-03', 'Venezuela', 'Uruguay', 0, 0),
  (40, TIMESTAMPTZ '2024-09-10 00:00:00-03', 'Paraguay', 'Brasil', 1, 0),
  -- Fecha 9 (2024-10-10/11)
  (41, TIMESTAMPTZ '2024-10-10 00:00:00-03', 'Bolivia', 'Colombia', 1, 0),
  (42, TIMESTAMPTZ '2024-10-11 00:00:00-03', 'Ecuador', 'Paraguay', 0, 0),
  (43, TIMESTAMPTZ '2024-10-10 00:00:00-03', 'Venezuela', 'Argentina', 1, 1),
  (44, TIMESTAMPTZ '2024-10-10 00:00:00-03', 'Chile', 'Brasil', 1, 2),
  (45, TIMESTAMPTZ '2024-10-11 00:00:00-03', 'Perú', 'Uruguay', 1, 0),
  -- Fecha 10 (2024-10-15)
  (46, TIMESTAMPTZ '2024-10-15 00:00:00-03', 'Colombia', 'Chile', 4, 0),
  (47, TIMESTAMPTZ '2024-10-15 00:00:00-03', 'Paraguay', 'Venezuela', 2, 1),
  (48, TIMESTAMPTZ '2024-10-15 00:00:00-03', 'Uruguay', 'Ecuador', 0, 0),
  (49, TIMESTAMPTZ '2024-10-15 00:00:00-03', 'Argentina', 'Bolivia', 6, 0),
  (50, TIMESTAMPTZ '2024-10-15 00:00:00-03', 'Brasil', 'Perú', 4, 0),
  -- Fecha 11 (2024-11-14/15)
  (51, TIMESTAMPTZ '2024-11-15 00:00:00-03', 'Uruguay', 'Colombia', 3, 2),
  (52, TIMESTAMPTZ '2024-11-15 00:00:00-03', 'Perú', 'Chile', 0, 0),
  (53, TIMESTAMPTZ '2024-11-14 00:00:00-03', 'Venezuela', 'Brasil', 1, 1),
  (54, TIMESTAMPTZ '2024-11-14 00:00:00-03', 'Paraguay', 'Argentina', 1, 1),
  (55, TIMESTAMPTZ '2024-11-15 00:00:00-03', 'Ecuador', 'Bolivia', 4, 0),
  -- Fecha 12 (2024-11-19)
  (56, TIMESTAMPTZ '2024-11-19 00:00:00-03', 'Colombia', 'Ecuador', 0, 1),
  (57, TIMESTAMPTZ '2024-11-19 00:00:00-03', 'Brasil', 'Uruguay', 1, 1),
  (58, TIMESTAMPTZ '2024-11-19 00:00:00-03', 'Bolivia', 'Paraguay', 2, 2),
  (59, TIMESTAMPTZ '2024-11-19 00:00:00-03', 'Argentina', 'Perú', 1, 0),
  (60, TIMESTAMPTZ '2024-11-19 00:00:00-03', 'Chile', 'Venezuela', 4, 2),
  -- Fecha 13 (2025-03-20/21)
  (61, TIMESTAMPTZ '2025-03-21 00:00:00-03', 'Uruguay', 'Argentina', 0, 1),
  (62, TIMESTAMPTZ '2025-03-21 00:00:00-03', 'Perú', 'Bolivia', 3, 1),
  (63, TIMESTAMPTZ '2025-03-20 00:00:00-03', 'Brasil', 'Colombia', 2, 1),
  (64, TIMESTAMPTZ '2025-03-20 00:00:00-03', 'Paraguay', 'Chile', 1, 0),
  (65, TIMESTAMPTZ '2025-03-21 00:00:00-03', 'Ecuador', 'Venezuela', 2, 1),
  -- Fecha 14 (2025-03-25)
  (66, TIMESTAMPTZ '2025-03-25 00:00:00-03', 'Colombia', 'Paraguay', 2, 2),
  (67, TIMESTAMPTZ '2025-03-25 00:00:00-03', 'Venezuela', 'Perú', 1, 0),
  (68, TIMESTAMPTZ '2025-03-25 00:00:00-03', 'Bolivia', 'Uruguay', 0, 0),
  (69, TIMESTAMPTZ '2025-03-25 00:00:00-03', 'Argentina', 'Brasil', 4, 1),
  (70, TIMESTAMPTZ '2025-03-25 00:00:00-03', 'Chile', 'Ecuador', 0, 0),
  -- Fecha 15 (2025-06-05/06)
  (71, TIMESTAMPTZ '2025-06-05 00:00:00-03', 'Paraguay', 'Uruguay', 2, 0),
  (72, TIMESTAMPTZ '2025-06-05 00:00:00-03', 'Ecuador', 'Brasil', 0, 0),
  (73, TIMESTAMPTZ '2025-06-05 00:00:00-03', 'Chile', 'Argentina', 0, 1),
  (74, TIMESTAMPTZ '2025-06-06 00:00:00-03', 'Colombia', 'Perú', 0, 0),
  (75, TIMESTAMPTZ '2025-06-05 00:00:00-03', 'Venezuela', 'Bolivia', 2, 0),
  -- Fecha 16 (2025-06-10)
  (76, TIMESTAMPTZ '2025-06-10 00:00:00-03', 'Bolivia', 'Chile', 2, 0),
  (77, TIMESTAMPTZ '2025-06-10 00:00:00-03', 'Uruguay', 'Venezuela', 2, 0),
  (78, TIMESTAMPTZ '2025-06-10 00:00:00-03', 'Argentina', 'Colombia', 1, 1),
  (79, TIMESTAMPTZ '2025-06-10 00:00:00-03', 'Brasil', 'Paraguay', 1, 0),
  (80, TIMESTAMPTZ '2025-06-10 00:00:00-03', 'Perú', 'Ecuador', 0, 0),
  -- Fecha 17 (2025-09-04)
  (81, TIMESTAMPTZ '2025-09-04 00:00:00-03', 'Uruguay', 'Perú', 3, 0),
  (82, TIMESTAMPTZ '2025-09-04 00:00:00-03', 'Colombia', 'Bolivia', 3, 0),
  (83, TIMESTAMPTZ '2025-09-04 00:00:00-03', 'Paraguay', 'Ecuador', 0, 0),
  (84, TIMESTAMPTZ '2025-09-04 00:00:00-03', 'Argentina', 'Venezuela', 3, 0),
  (85, TIMESTAMPTZ '2025-09-04 00:00:00-03', 'Brasil', 'Chile', 3, 0),
  -- Fecha 18 (2025-09-09)
  (86, TIMESTAMPTZ '2025-09-09 00:00:00-03', 'Ecuador', 'Argentina', 1, 0),
  (87, TIMESTAMPTZ '2025-09-09 00:00:00-03', 'Perú', 'Paraguay', 0, 1),
  (88, TIMESTAMPTZ '2025-09-09 00:00:00-03', 'Venezuela', 'Colombia', 3, 6),
  (89, TIMESTAMPTZ '2025-09-09 00:00:00-03', 'Bolivia', 'Brasil', 1, 0),
  (90, TIMESTAMPTZ '2025-09-09 00:00:00-03', 'Chile', 'Uruguay', 0, 0)
) AS f(match_number, dt, home, away, hs, vs)
JOIN teams th ON th.competition_id = 'c0c00000-0000-4000-8000-000000000001' AND th.name = f.home
JOIN teams ta ON ta.competition_id = 'c0c00000-0000-4000-8000-000000000001' AND ta.name = f.away
ON CONFLICT (competition_id, match_number) DO NOTHING;

-- ============================================================================
-- 4. TEN-COMP publico asociado al tenant "Publico"
--    Sin bonus (la competencia no define tipos de bonus).
-- ============================================================================

INSERT INTO ten_comps (id, tenant_id, competition_id, name, slug, visibility,
                       join_code, status, menu_config, bonus_enabled)
VALUES ('c0c00000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'c0c00000-0000-4000-8000-000000000001',
        'Eliminatoria Sudamericana 2026', 'eliminatoria-sudamericana-2026', 'public',
        NULL, 'open',
        (SELECT default_menu FROM competitions WHERE id = 'c0c00000-0000-4000-8000-000000000001'),
        false)
ON CONFLICT (id) DO NOTHING;

-- Scoring del Ten-Comp <- defaults de la competencia
INSERT INTO ten_comp_scoring (ten_comp_id, exact_score_points, correct_winner_points,
  correct_draw_points, knockout_exact_score_bonus, correct_et_result_points, correct_pk_winner_points)
SELECT 'c0c00000-0000-4000-8000-000000000002',
  (default_scoring->>'exact_score_points')::smallint,
  (default_scoring->>'correct_winner_points')::smallint,
  (default_scoring->>'correct_draw_points')::smallint,
  (default_scoring->>'knockout_exact_score_bonus')::smallint,
  (default_scoring->>'correct_et_result_points')::smallint,
  (default_scoring->>'correct_pk_winner_points')::smallint
FROM competitions WHERE id = 'c0c00000-0000-4000-8000-000000000001'
ON CONFLICT (ten_comp_id) DO NOTHING;

COMMIT;

-- ============================================================================
-- VERIFICACION (opcional)
--   SELECT count(*) FROM teams   WHERE competition_id = 'c0c00000-0000-4000-8000-000000000001';  -- 10
--   SELECT count(*) FROM matches WHERE competition_id = 'c0c00000-0000-4000-8000-000000000001';  -- 90
--   SELECT count(*) FROM matches WHERE competition_id = 'c0c00000-0000-4000-8000-000000000001' AND status='finished'; -- 90
--   -- Cada seleccion juega 18 partidos (9 local + 9 visitante):
--   SELECT t.abbreviation, count(*) FROM matches m
--     JOIN teams t ON t.id IN (m.home_team_id, m.away_team_id)
--     WHERE m.competition_id = 'c0c00000-0000-4000-8000-000000000001'
--     GROUP BY t.abbreviation ORDER BY 1;  -- 18 c/u
-- ============================================================================
