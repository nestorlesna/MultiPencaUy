-- ============================================================
-- 00_RESET_INIT.SQL — PencaLes 2026
-- Script de inicialización completa.
-- - Borra TODOS los datos del torneo y predicciones.
-- - Deja solo el usuario Néstor Lesna como administrador.
-- - Recarga todos los equipos, partidos y configuración.
--
-- IMPORTANTE: Ejecutar en el SQL Editor de Supabase.
-- Requiere que el schema (01_schema.sql) y las funciones
-- (02_auth_rls.sql, 03_views_functions.sql) ya estén aplicados.
-- ============================================================

-- ============================================================
-- PASO 1: USUARIO ADMINISTRADOR
-- Conserva solo a Néstor Lesna y lo configura como admin activo.
-- El resto de perfiles y predicciones se eliminan en cascada.
-- ============================================================
DO $$
DECLARE
  v_admin_id UUID;
BEGIN
  -- Buscar el UUID del admin por email en auth.users
  SELECT id INTO v_admin_id
  FROM auth.users
  WHERE email = 'nestor.lesna@gmail.com';

  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'Usuario nestor.lesna@gmail.com no encontrado en auth.users. Registrate primero en la app.';
  END IF;

  -- Eliminar predicciones y bonus de todos los usuarios que no son el admin
  DELETE FROM predictions       WHERE user_id != v_admin_id;
  DELETE FROM bonus_predictions WHERE user_id != v_admin_id;
  DELETE FROM bonus_points      WHERE user_id != v_admin_id;

  -- Limpiar overrides de posición (datos calculados, no de usuario)
  DELETE FROM group_position_overrides;
  DELETE FROM best_third_rank_overrides;

  -- Eliminar perfiles de usuarios que no son el admin
  DELETE FROM profiles
  WHERE id != v_admin_id;

  -- Asegurar que el admin esté activo y con is_admin = true
  UPDATE profiles
  SET is_active = true,
      is_admin  = true,
      display_name = COALESCE(NULLIF(display_name,''), 'Néstor Lesna')
  WHERE id = v_admin_id;

  RAISE NOTICE 'Usuario admin configurado: % (id: %)',
    (SELECT display_name FROM profiles WHERE id = v_admin_id),
    v_admin_id;
END;
$$;

-- ============================================================
-- PASO 2: LIMPIAR DATOS DEL TORNEO
-- Se usa CASCADE para respetar las FK.
-- ============================================================
TRUNCATE TABLE
  knockout_slot_rules,
  predictions,
  bonus_predictions,
  bonus_points,
  predictions_audit,
  bonus_predictions_audit,
  matches,
  teams,
  stadiums,
  groups,
  phases,
  scoring_config
RESTART IDENTITY CASCADE;

-- ============================================================
-- PASO 3: GRUPOS (A–L)
-- ============================================================
INSERT INTO groups (name, "order") VALUES
  ('A', 1), ('B', 2), ('C', 3),  ('D', 4),
  ('E', 5), ('F', 6), ('G', 7),  ('H', 8),
  ('I', 9), ('J', 10),('K', 11), ('L', 12);

-- ============================================================
-- PASO 4: FASES
-- ============================================================
INSERT INTO phases (name, "order", has_extra_time, has_penalties) VALUES
  ('Fase de Grupos',   1, false, false),
  ('Dieciseisavos',    2, true,  true),
  ('Octavos de Final', 3, true,  true),
  ('Cuartos de Final', 4, true,  true),
  ('Semifinales',      5, true,  true),
  ('Tercer Puesto',    6, true,  true),
  ('Final',            7, true,  true);

-- ============================================================
-- PASO 5: ESTADIOS (16 sedes)
-- ============================================================
INSERT INTO stadiums (name, city, country, timezone, capacity) VALUES
  ('Mercedes-Benz Stadium',   'Atlanta',         'Estados Unidos', 'America/New_York',    71000),
  ('Gillette Stadium',        'Foxborough',       'Estados Unidos', 'America/New_York',    65878),
  ('AT&T Stadium',            'Arlington',        'Estados Unidos', 'America/Chicago',     80000),
  ('NRG Stadium',             'Houston',          'Estados Unidos', 'America/Chicago',     72220),
  ('Arrowhead Stadium',       'Kansas City',      'Estados Unidos', 'America/Chicago',     76416),
  ('SoFi Stadium',            'Inglewood',        'Estados Unidos', 'America/Los_Angeles', 70240),
  ('Hard Rock Stadium',       'Miami Gardens',    'Estados Unidos', 'America/New_York',    65326),
  ('MetLife Stadium',         'East Rutherford',  'Estados Unidos', 'America/New_York',    82500),
  ('Lincoln Financial Field', 'Philadelphia',     'Estados Unidos', 'America/New_York',    69176),
  ('Levi''s Stadium',         'Santa Clara',      'Estados Unidos', 'America/Los_Angeles', 68500),
  ('Lumen Field',             'Seattle',          'Estados Unidos', 'America/Los_Angeles', 69000),
  ('Estadio Akron',           'Guadalajara',      'México',         'America/Mexico_City', 46456),
  ('Estadio Azteca',          'Ciudad de México', 'México',         'America/Mexico_City', 87523),
  ('Estadio BBVA',            'Monterrey',        'México',         'America/Monterrey',   53500),
  ('BMO Field',               'Toronto',          'Canadá',         'America/Toronto',     30000),
  ('BC Place',                'Vancouver',        'Canadá',         'America/Vancouver',   54500);

-- ============================================================
-- PASO 6: CONFIGURACIÓN DE PUNTAJE
-- ============================================================
INSERT INTO scoring_config (
  name, is_active,
  exact_score_points,
  correct_winner_points,
  correct_draw_points,
  knockout_exact_score_bonus,
  correct_et_result_points,
  correct_pk_winner_points
) VALUES (
  'Configuración PencaLes 2026', true,
  5,  -- Resultado exacto
  2,  -- Ganador correcto
  2,  -- Empate correcto
  2,  -- Bonus resultado exacto (eliminatorias)
  3,  -- Resultado ET exacto
  2   -- Ganador penales correcto
);

-- ============================================================
-- PASO 6b: CONFIGURACIÓN DE BONUS (+PUNTOS)
-- ============================================================
INSERT INTO bonus_config (bonus_type, points) VALUES
  ('podio_exacto',    10),
  ('podio_presencia',  5),
  ('empates_grupos',  15),
  ('rango_goles',     20),
  ('final_cero',      25),
  ('top_scorer_team', 20),
  ('top_group_goals', 13)
ON CONFLICT (bonus_type) DO UPDATE SET points = EXCLUDED.points, is_active = true;

-- ============================================================
-- PASO 7: EQUIPOS (48)
-- flag_url usa flagcdn.com — formato /w40/{iso2}.png
-- ============================================================
INSERT INTO teams
  (name, abbreviation, flag_url, group_id, group_position, is_confirmed, placeholder_name)
SELECT v.name, v.abbreviation, v.flag_url, g.id,
       v.group_position, v.is_confirmed, v.placeholder_name
FROM (VALUES
  -- GRUPO A
  ('México',          'MEX', 'https://flagcdn.com/w40/mx.png',     'A', 1, true,  NULL),
  ('Corea del Sur',   'KOR', 'https://flagcdn.com/w40/kr.png',     'A', 2, true,  NULL),
  ('Sudáfrica',       'RSA', 'https://flagcdn.com/w40/za.png',     'A', 3, true,  NULL),
  ('UEFA Playoff D',  'UPD', NULL,                                 'A', 4, false, 'Ganador Playoff UEFA D (Dinamarca/Chequia)'),
  -- GRUPO B
  ('Canadá',          'CAN', 'https://flagcdn.com/w40/ca.png',     'B', 1, true,  NULL),
  ('Suiza',           'SUI', 'https://flagcdn.com/w40/ch.png',     'B', 2, true,  NULL),
  ('Catar',           'QAT', 'https://flagcdn.com/w40/qa.png',     'B', 3, true,  NULL),
  ('UEFA Playoff A',  'UPA', NULL,                                 'B', 4, false, 'Ganador Playoff UEFA A (Italia/Bosnia)'),
  -- GRUPO C
  ('Brasil',          'BRA', 'https://flagcdn.com/w40/br.png',     'C', 1, true,  NULL),
  ('Marruecos',       'MAR', 'https://flagcdn.com/w40/ma.png',     'C', 2, true,  NULL),
  ('Haití',           'HAI', 'https://flagcdn.com/w40/ht.png',     'C', 3, true,  NULL),
  ('Escocia',         'SCO', 'https://flagcdn.com/w40/gb-sct.png', 'C', 4, true,  NULL),
  -- GRUPO D
  ('Estados Unidos',  'USA', 'https://flagcdn.com/w40/us.png',     'D', 1, true,  NULL),
  ('Paraguay',        'PAR', 'https://flagcdn.com/w40/py.png',     'D', 2, true,  NULL),
  ('Australia',       'AUS', 'https://flagcdn.com/w40/au.png',     'D', 3, true,  NULL),
  ('UEFA Playoff C',  'UPC', NULL,                                 'D', 4, false, 'Ganador Playoff UEFA C (Kosovo/Turquía)'),
  -- GRUPO E
  ('Alemania',        'GER', 'https://flagcdn.com/w40/de.png',     'E', 1, true,  NULL),
  ('Costa de Marfil', 'CIV', 'https://flagcdn.com/w40/ci.png',     'E', 2, true,  NULL),
  ('Curazao',         'CUR', 'https://flagcdn.com/w40/cw.png',     'E', 3, true,  NULL),
  ('Ecuador',         'ECU', 'https://flagcdn.com/w40/ec.png',     'E', 4, true,  NULL),
  -- GRUPO F
  ('Países Bajos',    'NED', 'https://flagcdn.com/w40/nl.png',     'F', 1, true,  NULL),
  ('Japón',           'JPN', 'https://flagcdn.com/w40/jp.png',     'F', 2, true,  NULL),
  ('Túnez',           'TUN', 'https://flagcdn.com/w40/tn.png',     'F', 3, true,  NULL),
  ('UEFA Playoff B',  'UPB', NULL,                                 'F', 4, false, 'Ganador Playoff UEFA B (Polonia/Suecia)'),
  -- GRUPO G
  ('Bélgica',         'BEL', 'https://flagcdn.com/w40/be.png',     'G', 1, true,  NULL),
  ('Egipto',          'EGY', 'https://flagcdn.com/w40/eg.png',     'G', 2, true,  NULL),
  ('Irán',            'IRN', 'https://flagcdn.com/w40/ir.png',     'G', 3, true,  NULL),
  ('Nueva Zelanda',   'NZL', 'https://flagcdn.com/w40/nz.png',     'G', 4, true,  NULL),
  -- GRUPO H
  ('España',          'ESP', 'https://flagcdn.com/w40/es.png',     'H', 1, true,  NULL),
  ('Cabo Verde',      'CPV', 'https://flagcdn.com/w40/cv.png',     'H', 2, true,  NULL),
  ('Arabia Saudita',  'KSA', 'https://flagcdn.com/w40/sa.png',     'H', 3, true,  NULL),
  ('Uruguay',         'URU', 'https://flagcdn.com/w40/uy.png',     'H', 4, true,  NULL),
  -- GRUPO I
  ('Francia',         'FRA', 'https://flagcdn.com/w40/fr.png',     'I', 1, true,  NULL),
  ('Senegal',         'SEN', 'https://flagcdn.com/w40/sn.png',     'I', 2, true,  NULL),
  ('Noruega',         'NOR', 'https://flagcdn.com/w40/no.png',     'I', 3, true,  NULL),
  ('IC Playoff 2',    'IC2', NULL,                                 'I', 4, false, 'Ganador IC Playoff 2 (Irak/Bolivia)'),
  -- GRUPO J
  ('Argentina',       'ARG', 'https://flagcdn.com/w40/ar.png',     'J', 1, true,  NULL),
  ('Argelia',         'ALG', 'https://flagcdn.com/w40/dz.png',     'J', 2, true,  NULL),
  ('Austria',         'AUT', 'https://flagcdn.com/w40/at.png',     'J', 3, true,  NULL),
  ('Jordania',        'JOR', 'https://flagcdn.com/w40/jo.png',     'J', 4, true,  NULL),
  -- GRUPO K
  ('Portugal',        'POR', 'https://flagcdn.com/w40/pt.png',     'K', 1, true,  NULL),
  ('Colombia',        'COL', 'https://flagcdn.com/w40/co.png',     'K', 2, true,  NULL),
  ('Uzbekistán',      'UZB', 'https://flagcdn.com/w40/uz.png',     'K', 3, true,  NULL),
  ('IC Playoff 1',    'IC1', NULL,                                 'K', 4, false, 'Ganador IC Playoff 1 (Jamaica/RD Congo)'),
  -- GRUPO L
  ('Inglaterra',      'ENG', 'https://flagcdn.com/w40/gb-eng.png', 'L', 1, true,  NULL),
  ('Croacia',         'CRO', 'https://flagcdn.com/w40/hr.png',     'L', 2, true,  NULL),
  ('Ghana',           'GHA', 'https://flagcdn.com/w40/gh.png',     'L', 3, true,  NULL),
  ('Panamá',          'PAN', 'https://flagcdn.com/w40/pa.png',     'L', 4, true,  NULL)
) AS v(name, abbreviation, flag_url, group_name, group_position, is_confirmed, placeholder_name)
JOIN groups g ON g.name = v.group_name;

-- ============================================================
-- PASO 8: PARTIDOS — FASE DE GRUPOS (1–72)
-- Horarios en EDT (UTC-4). Fuente: FIFA.
-- ============================================================
INSERT INTO matches
  (match_number, phase_id, group_id, home_team_id, away_team_id, stadium_id, match_datetime, status)
SELECT
  v.num,
  (SELECT id FROM phases  WHERE "order" = 1),
  (SELECT id FROM groups  WHERE name = v.grp),
  (SELECT id FROM teams   WHERE abbreviation = v.home),
  (SELECT id FROM teams   WHERE abbreviation = v.away),
  (SELECT id FROM stadiums WHERE name = v.stad),
  v.dt,
  'scheduled'
FROM (VALUES
  -- GRUPO A
  (1,  'A','MEX','RSA','Estadio Azteca',            '2026-06-11 15:00:00-04'::timestamptz),
  (2,  'A','KOR','UPD','Estadio Akron',              '2026-06-11 22:00:00-04'::timestamptz),
  (3,  'A','UPD','RSA','Mercedes-Benz Stadium',      '2026-06-18 12:00:00-04'::timestamptz),
  (4,  'A','MEX','KOR','Estadio Akron',              '2026-06-18 21:00:00-04'::timestamptz),
  (5,  'A','UPD','MEX','Estadio Azteca',             '2026-06-24 21:00:00-04'::timestamptz),
  (6,  'A','RSA','KOR','Estadio BBVA',               '2026-06-24 21:00:00-04'::timestamptz),
  -- GRUPO B
  (7,  'B','CAN','UPA','BMO Field',                  '2026-06-12 15:00:00-04'::timestamptz),
  (8,  'B','QAT','SUI','Levi''s Stadium',            '2026-06-13 15:00:00-04'::timestamptz),
  (9,  'B','SUI','UPA','SoFi Stadium',               '2026-06-18 15:00:00-04'::timestamptz),
  (10, 'B','CAN','QAT','BC Place',                   '2026-06-18 18:00:00-04'::timestamptz),
  (11, 'B','SUI','CAN','BC Place',                   '2026-06-24 15:00:00-04'::timestamptz),
  (12, 'B','UPA','QAT','Lumen Field',                '2026-06-24 15:00:00-04'::timestamptz),
  -- GRUPO C
  (13, 'C','BRA','MAR','MetLife Stadium',            '2026-06-13 18:00:00-04'::timestamptz),
  (14, 'C','HAI','SCO','Gillette Stadium',           '2026-06-13 21:00:00-04'::timestamptz),
  (15, 'C','SCO','MAR','Gillette Stadium',           '2026-06-19 18:00:00-04'::timestamptz),
  (16, 'C','BRA','HAI','Lincoln Financial Field',    '2026-06-19 21:00:00-04'::timestamptz),
  (17, 'C','SCO','BRA','Hard Rock Stadium',          '2026-06-24 18:00:00-04'::timestamptz),
  (18, 'C','MAR','HAI','Mercedes-Benz Stadium',      '2026-06-24 18:00:00-04'::timestamptz),
  -- GRUPO D
  (19, 'D','USA','PAR','SoFi Stadium',               '2026-06-12 21:00:00-04'::timestamptz),
  (20, 'D','AUS','UPC','BC Place',                   '2026-06-13 00:00:00-04'::timestamptz),
  (21, 'D','UPC','PAR','Levi''s Stadium',            '2026-06-19 03:00:00-04'::timestamptz),
  (22, 'D','USA','AUS','Lumen Field',                '2026-06-19 15:00:00-04'::timestamptz),
  (23, 'D','UPC','USA','SoFi Stadium',               '2026-06-25 22:00:00-04'::timestamptz),
  (24, 'D','PAR','AUS','Levi''s Stadium',            '2026-06-25 22:00:00-04'::timestamptz),
  -- GRUPO E
  (25, 'E','GER','CUR','NRG Stadium',                '2026-06-14 13:00:00-04'::timestamptz),
  (26, 'E','CIV','ECU','Lincoln Financial Field',    '2026-06-14 19:00:00-04'::timestamptz),
  (27, 'E','GER','CIV','BMO Field',                  '2026-06-20 16:00:00-04'::timestamptz),
  (28, 'E','ECU','CUR','Arrowhead Stadium',          '2026-06-20 20:00:00-04'::timestamptz),
  (29, 'E','CUR','CIV','Lincoln Financial Field',    '2026-06-25 16:00:00-04'::timestamptz),
  (30, 'E','ECU','GER','MetLife Stadium',            '2026-06-25 16:00:00-04'::timestamptz),
  -- GRUPO F
  (31, 'F','NED','JPN','AT&T Stadium',               '2026-06-14 16:00:00-04'::timestamptz),
  (32, 'F','UPB','TUN','Estadio BBVA',               '2026-06-14 22:00:00-04'::timestamptz),
  (33, 'F','NED','UPB','NRG Stadium',                '2026-06-20 13:00:00-04'::timestamptz),
  (34, 'F','TUN','JPN','Estadio BBVA',               '2026-06-20 00:00:00-04'::timestamptz),
  (35, 'F','JPN','UPB','AT&T Stadium',               '2026-06-25 19:00:00-04'::timestamptz),
  (36, 'F','TUN','NED','Arrowhead Stadium',          '2026-06-25 19:00:00-04'::timestamptz),
  -- GRUPO G
  (37, 'G','BEL','EGY','Lumen Field',                '2026-06-15 15:00:00-04'::timestamptz),
  (38, 'G','IRN','NZL','SoFi Stadium',               '2026-06-15 21:00:00-04'::timestamptz),
  (39, 'G','BEL','IRN','SoFi Stadium',               '2026-06-21 15:00:00-04'::timestamptz),
  (40, 'G','NZL','EGY','BC Place',                   '2026-06-21 21:00:00-04'::timestamptz),
  (41, 'G','EGY','IRN','Lumen Field',                '2026-06-26 23:00:00-04'::timestamptz),
  (42, 'G','NZL','BEL','BC Place',                   '2026-06-26 23:00:00-04'::timestamptz),
  -- GRUPO H
  (43, 'H','ESP','CPV','Mercedes-Benz Stadium',      '2026-06-15 12:00:00-04'::timestamptz),
  (44, 'H','KSA','URU','Hard Rock Stadium',          '2026-06-15 18:00:00-04'::timestamptz),
  (45, 'H','ESP','KSA','Mercedes-Benz Stadium',      '2026-06-21 12:00:00-04'::timestamptz),
  (46, 'H','URU','CPV','Hard Rock Stadium',          '2026-06-21 18:00:00-04'::timestamptz),
  (47, 'H','CPV','KSA','NRG Stadium',                '2026-06-26 20:00:00-04'::timestamptz),
  (48, 'H','URU','ESP','Estadio Akron',              '2026-06-26 20:00:00-04'::timestamptz),
  -- GRUPO I
  (49, 'I','FRA','SEN','MetLife Stadium',            '2026-06-16 15:00:00-04'::timestamptz),
  (50, 'I','IC2','NOR','Gillette Stadium',           '2026-06-16 18:00:00-04'::timestamptz),
  (51, 'I','FRA','IC2','Lincoln Financial Field',    '2026-06-22 17:00:00-04'::timestamptz),
  (52, 'I','NOR','SEN','MetLife Stadium',            '2026-06-22 20:00:00-04'::timestamptz),
  (53, 'I','NOR','FRA','Gillette Stadium',           '2026-06-26 15:00:00-04'::timestamptz),
  (54, 'I','SEN','IC2','BMO Field',                  '2026-06-26 15:00:00-04'::timestamptz),
  -- GRUPO J
  (55, 'J','ARG','ALG','Arrowhead Stadium',          '2026-06-16 21:00:00-04'::timestamptz),
  (56, 'J','AUT','JOR','Levi''s Stadium',            '2026-06-16 00:00:00-04'::timestamptz),
  (57, 'J','ARG','AUT','AT&T Stadium',               '2026-06-22 13:00:00-04'::timestamptz),
  (58, 'J','JOR','ALG','Levi''s Stadium',            '2026-06-22 23:00:00-04'::timestamptz),
  (59, 'J','JOR','ARG','AT&T Stadium',               '2026-06-27 22:00:00-04'::timestamptz),
  (60, 'J','ALG','AUT','Arrowhead Stadium',          '2026-06-27 22:00:00-04'::timestamptz),
  -- GRUPO K
  (61, 'K','POR','IC1','NRG Stadium',                '2026-06-17 13:00:00-04'::timestamptz),
  (62, 'K','UZB','COL','Estadio Azteca',             '2026-06-17 22:00:00-04'::timestamptz),
  (63, 'K','POR','UZB','NRG Stadium',                '2026-06-23 13:00:00-04'::timestamptz),
  (64, 'K','COL','IC1','Estadio Akron',              '2026-06-23 22:00:00-04'::timestamptz),
  (65, 'K','COL','POR','Hard Rock Stadium',          '2026-06-27 19:30:00-04'::timestamptz),
  (66, 'K','IC1','UZB','Mercedes-Benz Stadium',      '2026-06-27 19:30:00-04'::timestamptz),
  -- GRUPO L
  (67, 'L','ENG','CRO','AT&T Stadium',               '2026-06-17 16:00:00-04'::timestamptz),
  (68, 'L','GHA','PAN','BMO Field',                  '2026-06-17 19:00:00-04'::timestamptz),
  (69, 'L','ENG','GHA','Gillette Stadium',           '2026-06-23 16:00:00-04'::timestamptz),
  (70, 'L','PAN','CRO','BMO Field',                  '2026-06-23 19:00:00-04'::timestamptz),
  (71, 'L','PAN','ENG','MetLife Stadium',            '2026-06-27 17:00:00-04'::timestamptz),
  (72, 'L','CRO','GHA','Lincoln Financial Field',    '2026-06-27 17:00:00-04'::timestamptz)
) AS v(num, grp, home, away, stad, dt);

-- ============================================================
-- PASO 9: PARTIDOS — ELIMINATORIAS (73–104)
-- home_team_id / away_team_id = NULL (se calculan después)
-- ============================================================
INSERT INTO matches
  (match_number, phase_id, group_id,
   home_team_id, away_team_id,
   home_slot_label, away_slot_label,
   stadium_id, match_datetime, status)
SELECT
  v.num,
  (SELECT id FROM phases WHERE "order" = v.phase_order),
  NULL, NULL, NULL,
  v.home_label, v.away_label,
  (SELECT id FROM stadiums WHERE name = v.stad),
  v.dt,
  'scheduled'
FROM (VALUES
  -- DIECISEISAVOS (order=2)
  (73, 2, '2A',         '2B',          'SoFi Stadium',            '2026-06-28 18:00:00-04'::timestamptz),
  (74, 2, '1E',         '3A/B/C/D/F',  'Gillette Stadium',        '2026-06-29 18:00:00-04'::timestamptz),
  (75, 2, '1F',         '2C',          'Estadio BBVA',            '2026-06-29 21:00:00-04'::timestamptz),
  (76, 2, '1C',         '2F',          'NRG Stadium',             '2026-06-29 00:00:00-04'::timestamptz),
  (77, 2, '1I',         '3C/D/F/G/H',  'MetLife Stadium',         '2026-06-30 18:00:00-04'::timestamptz),
  (78, 2, '2E',         '2I',          'AT&T Stadium',            '2026-06-30 21:00:00-04'::timestamptz),
  (79, 2, '1A',         '3C/E/F/H/I',  'Estadio Azteca',          '2026-06-30 00:00:00-04'::timestamptz),
  (80, 2, '1L',         '3E/H/I/J/K',  'Mercedes-Benz Stadium',   '2026-07-01 18:00:00-04'::timestamptz),
  (81, 2, '1D',         '3B/E/F/I/J',  'Levi''s Stadium',         '2026-07-01 21:00:00-04'::timestamptz),
  (82, 2, '1G',         '3A/E/H/I/J',  'Lumen Field',             '2026-07-01 00:00:00-04'::timestamptz),
  (83, 2, '2K',         '2L',          'BMO Field',               '2026-07-02 18:00:00-04'::timestamptz),
  (84, 2, '1H',         '2J',          'SoFi Stadium',            '2026-07-02 21:00:00-04'::timestamptz),
  (85, 2, '1B',         '3E/F/G/I/J',  'BC Place',                '2026-07-02 00:00:00-04'::timestamptz),
  (86, 2, '1J',         '2H',          'Hard Rock Stadium',       '2026-07-03 18:00:00-04'::timestamptz),
  (87, 2, '1K',         '3D/E/I/J/L',  'Arrowhead Stadium',       '2026-07-03 21:00:00-04'::timestamptz),
  (88, 2, '2D',         '2G',          'AT&T Stadium',            '2026-07-03 00:00:00-04'::timestamptz),
  -- OCTAVOS (order=3)
  (89, 3, 'W74',        'W77',         'Lincoln Financial Field',  '2026-07-04 18:00:00-04'::timestamptz),
  (90, 3, 'W73',        'W75',         'NRG Stadium',              '2026-07-04 21:00:00-04'::timestamptz),
  (91, 3, 'W76',        'W78',         'MetLife Stadium',          '2026-07-05 18:00:00-04'::timestamptz),
  (92, 3, 'W79',        'W80',         'Estadio Azteca',           '2026-07-05 21:00:00-04'::timestamptz),
  (93, 3, 'W83',        'W84',         'AT&T Stadium',             '2026-07-06 18:00:00-04'::timestamptz),
  (94, 3, 'W81',        'W82',         'Lumen Field',              '2026-07-06 21:00:00-04'::timestamptz),
  (95, 3, 'W86',        'W88',         'Mercedes-Benz Stadium',    '2026-07-07 18:00:00-04'::timestamptz),
  (96, 3, 'W85',        'W87',         'BC Place',                 '2026-07-07 21:00:00-04'::timestamptz),
  -- CUARTOS (order=4)
  (97, 4, 'W89',        'W90',         'Gillette Stadium',         '2026-07-09 18:00:00-04'::timestamptz),
  (98, 4, 'W93',        'W94',         'SoFi Stadium',             '2026-07-10 18:00:00-04'::timestamptz),
  (99, 4, 'W91',        'W92',         'Hard Rock Stadium',        '2026-07-11 18:00:00-04'::timestamptz),
  (100,4, 'W95',        'W96',         'Arrowhead Stadium',        '2026-07-11 21:00:00-04'::timestamptz),
  -- SEMIFINALES (order=5)
  (101,5, 'W97',        'W98',         'AT&T Stadium',             '2026-07-14 18:00:00-04'::timestamptz),
  (102,5, 'W99',        'W100',        'Mercedes-Benz Stadium',    '2026-07-15 18:00:00-04'::timestamptz),
  -- TERCER PUESTO (order=6)
  (103,6, 'L101',       'L102',        'Hard Rock Stadium',        '2026-07-18 18:00:00-04'::timestamptz),
  -- FINAL (order=7)
  (104,7, 'W101',       'W102',        'MetLife Stadium',          '2026-07-19 18:00:00-04'::timestamptz)
) AS v(num, phase_order, home_label, away_label, stad, dt);

-- ============================================================
-- PASO 10: REGLAS DE LLAVES ELIMINATORIAS
-- ============================================================
DO $$
DECLARE
  mid UUID;
BEGIN
  -- ── DIECISEISAVOS: slots de grupo_position ──────────────────

  SELECT id INTO mid FROM matches WHERE match_number = 73;
  INSERT INTO knockout_slot_rules (match_id, slot, rule_type, source_group_id, position) VALUES
    (mid,'home','group_position',(SELECT id FROM groups WHERE name='A'),2),
    (mid,'away','group_position',(SELECT id FROM groups WHERE name='B'),2);

  SELECT id INTO mid FROM matches WHERE match_number = 74;
  INSERT INTO knockout_slot_rules (match_id, slot, rule_type, source_group_id, position, third_groups) VALUES
    (mid,'home','group_position',(SELECT id FROM groups WHERE name='E'),1,NULL),
    (mid,'away','best_third',    NULL,                                  NULL,ARRAY['A','B','C','D','F']);

  SELECT id INTO mid FROM matches WHERE match_number = 75;
  INSERT INTO knockout_slot_rules (match_id, slot, rule_type, source_group_id, position) VALUES
    (mid,'home','group_position',(SELECT id FROM groups WHERE name='F'),1),
    (mid,'away','group_position',(SELECT id FROM groups WHERE name='C'),2);

  SELECT id INTO mid FROM matches WHERE match_number = 76;
  INSERT INTO knockout_slot_rules (match_id, slot, rule_type, source_group_id, position) VALUES
    (mid,'home','group_position',(SELECT id FROM groups WHERE name='C'),1),
    (mid,'away','group_position',(SELECT id FROM groups WHERE name='F'),2);

  SELECT id INTO mid FROM matches WHERE match_number = 77;
  INSERT INTO knockout_slot_rules (match_id, slot, rule_type, source_group_id, position, third_groups) VALUES
    (mid,'home','group_position',(SELECT id FROM groups WHERE name='I'),1,NULL),
    (mid,'away','best_third',    NULL,                                  NULL,ARRAY['C','D','F','G','H']);

  SELECT id INTO mid FROM matches WHERE match_number = 78;
  INSERT INTO knockout_slot_rules (match_id, slot, rule_type, source_group_id, position) VALUES
    (mid,'home','group_position',(SELECT id FROM groups WHERE name='E'),2),
    (mid,'away','group_position',(SELECT id FROM groups WHERE name='I'),2);

  SELECT id INTO mid FROM matches WHERE match_number = 79;
  INSERT INTO knockout_slot_rules (match_id, slot, rule_type, source_group_id, position, third_groups) VALUES
    (mid,'home','group_position',(SELECT id FROM groups WHERE name='A'),1,NULL),
    (mid,'away','best_third',    NULL,                                  NULL,ARRAY['C','E','F','H','I']);

  SELECT id INTO mid FROM matches WHERE match_number = 80;
  INSERT INTO knockout_slot_rules (match_id, slot, rule_type, source_group_id, position, third_groups) VALUES
    (mid,'home','group_position',(SELECT id FROM groups WHERE name='L'),1,NULL),
    (mid,'away','best_third',    NULL,                                  NULL,ARRAY['E','H','I','J','K']);

  SELECT id INTO mid FROM matches WHERE match_number = 81;
  INSERT INTO knockout_slot_rules (match_id, slot, rule_type, source_group_id, position, third_groups) VALUES
    (mid,'home','group_position',(SELECT id FROM groups WHERE name='D'),1,NULL),
    (mid,'away','best_third',    NULL,                                  NULL,ARRAY['B','E','F','I','J']);

  SELECT id INTO mid FROM matches WHERE match_number = 82;
  INSERT INTO knockout_slot_rules (match_id, slot, rule_type, source_group_id, position, third_groups) VALUES
    (mid,'home','group_position',(SELECT id FROM groups WHERE name='G'),1,NULL),
    (mid,'away','best_third',    NULL,                                  NULL,ARRAY['A','E','H','I','J']);

  SELECT id INTO mid FROM matches WHERE match_number = 83;
  INSERT INTO knockout_slot_rules (match_id, slot, rule_type, source_group_id, position) VALUES
    (mid,'home','group_position',(SELECT id FROM groups WHERE name='K'),2),
    (mid,'away','group_position',(SELECT id FROM groups WHERE name='L'),2);

  SELECT id INTO mid FROM matches WHERE match_number = 84;
  INSERT INTO knockout_slot_rules (match_id, slot, rule_type, source_group_id, position) VALUES
    (mid,'home','group_position',(SELECT id FROM groups WHERE name='H'),1),
    (mid,'away','group_position',(SELECT id FROM groups WHERE name='J'),2);

  SELECT id INTO mid FROM matches WHERE match_number = 85;
  INSERT INTO knockout_slot_rules (match_id, slot, rule_type, source_group_id, position, third_groups) VALUES
    (mid,'home','group_position',(SELECT id FROM groups WHERE name='B'),1,NULL),
    (mid,'away','best_third',    NULL,                                  NULL,ARRAY['E','F','G','I','J']);

  SELECT id INTO mid FROM matches WHERE match_number = 86;
  INSERT INTO knockout_slot_rules (match_id, slot, rule_type, source_group_id, position) VALUES
    (mid,'home','group_position',(SELECT id FROM groups WHERE name='J'),1),
    (mid,'away','group_position',(SELECT id FROM groups WHERE name='H'),2);

  SELECT id INTO mid FROM matches WHERE match_number = 87;
  INSERT INTO knockout_slot_rules (match_id, slot, rule_type, source_group_id, position, third_groups) VALUES
    (mid,'home','group_position',(SELECT id FROM groups WHERE name='K'),1,NULL),
    (mid,'away','best_third',    NULL,                                  NULL,ARRAY['D','E','I','J','L']);

  SELECT id INTO mid FROM matches WHERE match_number = 88;
  INSERT INTO knockout_slot_rules (match_id, slot, rule_type, source_group_id, position) VALUES
    (mid,'home','group_position',(SELECT id FROM groups WHERE name='D'),2),
    (mid,'away','group_position',(SELECT id FROM groups WHERE name='G'),2);

  -- ── OCTAVOS: ganadores de dieciseisavos ────────────────────

  SELECT id INTO mid FROM matches WHERE match_number = 89;
  INSERT INTO knockout_slot_rules (match_id, slot, rule_type, source_match_id) VALUES
    (mid,'home','match_winner',(SELECT id FROM matches WHERE match_number=74)),
    (mid,'away','match_winner',(SELECT id FROM matches WHERE match_number=77));

  SELECT id INTO mid FROM matches WHERE match_number = 90;
  INSERT INTO knockout_slot_rules (match_id, slot, rule_type, source_match_id) VALUES
    (mid,'home','match_winner',(SELECT id FROM matches WHERE match_number=73)),
    (mid,'away','match_winner',(SELECT id FROM matches WHERE match_number=75));

  SELECT id INTO mid FROM matches WHERE match_number = 91;
  INSERT INTO knockout_slot_rules (match_id, slot, rule_type, source_match_id) VALUES
    (mid,'home','match_winner',(SELECT id FROM matches WHERE match_number=76)),
    (mid,'away','match_winner',(SELECT id FROM matches WHERE match_number=78));

  SELECT id INTO mid FROM matches WHERE match_number = 92;
  INSERT INTO knockout_slot_rules (match_id, slot, rule_type, source_match_id) VALUES
    (mid,'home','match_winner',(SELECT id FROM matches WHERE match_number=79)),
    (mid,'away','match_winner',(SELECT id FROM matches WHERE match_number=80));

  SELECT id INTO mid FROM matches WHERE match_number = 93;
  INSERT INTO knockout_slot_rules (match_id, slot, rule_type, source_match_id) VALUES
    (mid,'home','match_winner',(SELECT id FROM matches WHERE match_number=83)),
    (mid,'away','match_winner',(SELECT id FROM matches WHERE match_number=84));

  SELECT id INTO mid FROM matches WHERE match_number = 94;
  INSERT INTO knockout_slot_rules (match_id, slot, rule_type, source_match_id) VALUES
    (mid,'home','match_winner',(SELECT id FROM matches WHERE match_number=81)),
    (mid,'away','match_winner',(SELECT id FROM matches WHERE match_number=82));

  SELECT id INTO mid FROM matches WHERE match_number = 95;
  INSERT INTO knockout_slot_rules (match_id, slot, rule_type, source_match_id) VALUES
    (mid,'home','match_winner',(SELECT id FROM matches WHERE match_number=86)),
    (mid,'away','match_winner',(SELECT id FROM matches WHERE match_number=88));

  SELECT id INTO mid FROM matches WHERE match_number = 96;
  INSERT INTO knockout_slot_rules (match_id, slot, rule_type, source_match_id) VALUES
    (mid,'home','match_winner',(SELECT id FROM matches WHERE match_number=85)),
    (mid,'away','match_winner',(SELECT id FROM matches WHERE match_number=87));

  -- ── CUARTOS DE FINAL ────────────────────────────────────────

  SELECT id INTO mid FROM matches WHERE match_number = 97;
  INSERT INTO knockout_slot_rules (match_id, slot, rule_type, source_match_id) VALUES
    (mid,'home','match_winner',(SELECT id FROM matches WHERE match_number=89)),
    (mid,'away','match_winner',(SELECT id FROM matches WHERE match_number=90));

  SELECT id INTO mid FROM matches WHERE match_number = 98;
  INSERT INTO knockout_slot_rules (match_id, slot, rule_type, source_match_id) VALUES
    (mid,'home','match_winner',(SELECT id FROM matches WHERE match_number=93)),
    (mid,'away','match_winner',(SELECT id FROM matches WHERE match_number=94));

  SELECT id INTO mid FROM matches WHERE match_number = 99;
  INSERT INTO knockout_slot_rules (match_id, slot, rule_type, source_match_id) VALUES
    (mid,'home','match_winner',(SELECT id FROM matches WHERE match_number=91)),
    (mid,'away','match_winner',(SELECT id FROM matches WHERE match_number=92));

  SELECT id INTO mid FROM matches WHERE match_number = 100;
  INSERT INTO knockout_slot_rules (match_id, slot, rule_type, source_match_id) VALUES
    (mid,'home','match_winner',(SELECT id FROM matches WHERE match_number=95)),
    (mid,'away','match_winner',(SELECT id FROM matches WHERE match_number=96));

  -- ── SEMIFINALES ─────────────────────────────────────────────

  SELECT id INTO mid FROM matches WHERE match_number = 101;
  INSERT INTO knockout_slot_rules (match_id, slot, rule_type, source_match_id) VALUES
    (mid,'home','match_winner',(SELECT id FROM matches WHERE match_number=97)),
    (mid,'away','match_winner',(SELECT id FROM matches WHERE match_number=98));

  SELECT id INTO mid FROM matches WHERE match_number = 102;
  INSERT INTO knockout_slot_rules (match_id, slot, rule_type, source_match_id) VALUES
    (mid,'home','match_winner',(SELECT id FROM matches WHERE match_number=99)),
    (mid,'away','match_winner',(SELECT id FROM matches WHERE match_number=100));

  -- ── TERCER PUESTO (perdedores de semis) ─────────────────────

  SELECT id INTO mid FROM matches WHERE match_number = 103;
  INSERT INTO knockout_slot_rules (match_id, slot, rule_type, source_match_id) VALUES
    (mid,'home','match_loser',(SELECT id FROM matches WHERE match_number=101)),
    (mid,'away','match_loser',(SELECT id FROM matches WHERE match_number=102));

  -- ── FINAL ───────────────────────────────────────────────────

  SELECT id INTO mid FROM matches WHERE match_number = 104;
  INSERT INTO knockout_slot_rules (match_id, slot, rule_type, source_match_id) VALUES
    (mid,'home','match_winner',(SELECT id FROM matches WHERE match_number=101)),
    (mid,'away','match_winner',(SELECT id FROM matches WHERE match_number=102));

END;
$$;

-- ============================================================
-- VERIFICACIÓN FINAL
-- ============================================================
DO $$
DECLARE
  cnt_groups   INT; cnt_phases    INT; cnt_stadiums INT;
  cnt_teams    INT; cnt_matches   INT; cnt_ksr      INT;
  cnt_config   INT; cnt_profiles  INT; admin_name   TEXT;
  cnt_bonus    INT; cnt_comb      INT;
BEGIN
  SELECT COUNT(*) INTO cnt_groups   FROM groups;
  SELECT COUNT(*) INTO cnt_phases   FROM phases;
  SELECT COUNT(*) INTO cnt_stadiums FROM stadiums;
  SELECT COUNT(*) INTO cnt_teams    FROM teams;
  SELECT COUNT(*) INTO cnt_matches  FROM matches;
  SELECT COUNT(*) INTO cnt_ksr      FROM knockout_slot_rules;
  SELECT COUNT(*) INTO cnt_config   FROM scoring_config WHERE is_active = true;
  SELECT COUNT(*) INTO cnt_profiles FROM profiles;
  SELECT COUNT(*) INTO cnt_bonus    FROM bonus_config   WHERE is_active = true;
  SELECT COUNT(*) INTO cnt_comb     FROM combinaciones;
  SELECT display_name INTO admin_name FROM profiles WHERE is_admin = true LIMIT 1;

  RAISE NOTICE '';
  RAISE NOTICE '══════════════════════════════════════';
  RAISE NOTICE '  PencaLes 2026 — Inicialización OK  ';
  RAISE NOTICE '══════════════════════════════════════';
  RAISE NOTICE '  Grupos:        % / 12',  cnt_groups;
  RAISE NOTICE '  Fases:         % / 7',   cnt_phases;
  RAISE NOTICE '  Estadios:      % / 16',  cnt_stadiums;
  RAISE NOTICE '  Equipos:       % / 48',  cnt_teams;
  RAISE NOTICE '  Partidos:      % / 104', cnt_matches;
  RAISE NOTICE '  Reglas llave:  % / 64',  cnt_ksr;
  RAISE NOTICE '  Config activa: %',        cnt_config;
  RAISE NOTICE '  Bonus config:  % / 7',   cnt_bonus;
  RAISE NOTICE '  Combinaciones: % / 495', cnt_comb;
  RAISE NOTICE '  Usuarios:      %',        cnt_profiles;
  RAISE NOTICE '  Admin:         %',        admin_name;
  RAISE NOTICE '══════════════════════════════════════';

  -- Alertas si algo no cuadra
  IF cnt_groups   != 12  THEN RAISE WARNING 'Grupos incorrectos: %',        cnt_groups;   END IF;
  IF cnt_phases   != 7   THEN RAISE WARNING 'Fases incorrectas: %',         cnt_phases;   END IF;
  IF cnt_stadiums != 16  THEN RAISE WARNING 'Estadios incorrectos: %',      cnt_stadiums; END IF;
  IF cnt_teams    != 48  THEN RAISE WARNING 'Equipos incorrectos: %',       cnt_teams;    END IF;
  IF cnt_matches  != 104 THEN RAISE WARNING 'Partidos incorrectos: %',      cnt_matches;  END IF;
  IF cnt_ksr      != 64  THEN RAISE WARNING 'Reglas llave incorrectas: %',  cnt_ksr;      END IF;
  IF cnt_config   != 1   THEN RAISE WARNING 'No hay config activa!';                       END IF;
  IF cnt_bonus    != 7   THEN RAISE WARNING 'Bonus config incompleta: % / 7', cnt_bonus;  END IF;
  IF cnt_comb     != 495 THEN RAISE WARNING '⚠ Combinaciones vacías o incompletas: % / 495. Ejecutar 09_combinaciones.sql', cnt_comb; END IF;
END;
$$;
