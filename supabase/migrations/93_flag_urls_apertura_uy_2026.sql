-- ============================================================================
-- 93_FLAG_URLS_APERTURA_UY_2026.SQL — PencaLes 2.0
-- Asigna los escudos de los 16 equipos del Apertura UY 2026.
-- Fuente: estadisticas.tenfield.com.uy/primera-division/
-- Idempotente: UPDATE solo donde flag_url IS NULL o coincide con este dominio.
-- ============================================================================

UPDATE teams SET flag_url = 'https://estadisticas.tenfield.com.uy/wp-content/uploads/2020/04/escudo-racing.png'
  WHERE competition_id = 'c0a00000-0000-4000-8000-000000000001' AND name = 'Racing';

UPDATE teams SET flag_url = 'https://estadisticas.tenfield.com.uy/wp-content/uploads/2020/04/escudo-deportivo-maldonado.png'
  WHERE competition_id = 'c0a00000-0000-4000-8000-000000000001' AND name = 'D. Maldonado';

UPDATE teams SET flag_url = 'https://estadisticas.tenfield.com.uy/wp-content/uploads/2020/04/escudo-albion.png'
  WHERE competition_id = 'c0a00000-0000-4000-8000-000000000001' AND name = 'Albion';

UPDATE teams SET flag_url = 'https://estadisticas.tenfield.com.uy/wp-content/uploads/2020/04/escudo-penarol.png'
  WHERE competition_id = 'c0a00000-0000-4000-8000-000000000001' AND name = 'Peñarol';

UPDATE teams SET flag_url = 'https://estadisticas.tenfield.com.uy/wp-content/uploads/2020/04/escudo-central-espanol.png'
  WHERE competition_id = 'c0a00000-0000-4000-8000-000000000001' AND name = 'Central Español';

UPDATE teams SET flag_url = 'https://estadisticas.tenfield.com.uy/wp-content/uploads/2020/04/escudo-montevideo-city-torque.png'
  WHERE competition_id = 'c0a00000-0000-4000-8000-000000000001' AND name = 'M.C. Torque';

UPDATE teams SET flag_url = 'https://estadisticas.tenfield.com.uy/wp-content/uploads/2020/04/escudo-nacional.png'
  WHERE competition_id = 'c0a00000-0000-4000-8000-000000000001' AND name = 'Nacional';

UPDATE teams SET flag_url = 'https://estadisticas.tenfield.com.uy/wp-content/uploads/2020/04/escudo-defensor-sporting.png'
  WHERE competition_id = 'c0a00000-0000-4000-8000-000000000001' AND name = 'Def. Sporting';

UPDATE teams SET flag_url = 'https://estadisticas.tenfield.com.uy/wp-content/uploads/2020/04/escudo-liverpool.png'
  WHERE competition_id = 'c0a00000-0000-4000-8000-000000000001' AND name = 'Liverpool';

UPDATE teams SET flag_url = 'https://estadisticas.tenfield.com.uy/wp-content/uploads/2020/04/escudo-wanderers.png'
  WHERE competition_id = 'c0a00000-0000-4000-8000-000000000001' AND name = 'Wanderers';

UPDATE teams SET flag_url = 'https://estadisticas.tenfield.com.uy/wp-content/uploads/2020/04/escudo-danubio.png'
  WHERE competition_id = 'c0a00000-0000-4000-8000-000000000001' AND name = 'Danubio';

UPDATE teams SET flag_url = 'https://estadisticas.tenfield.com.uy/wp-content/uploads/2020/04/escudo-cerro-largo.png'
  WHERE competition_id = 'c0a00000-0000-4000-8000-000000000001' AND name = 'Cerro Largo';

UPDATE teams SET flag_url = 'https://estadisticas.tenfield.com.uy/wp-content/uploads/2020/04/escudo-boston-river.png'
  WHERE competition_id = 'c0a00000-0000-4000-8000-000000000001' AND name = 'Boston River';

UPDATE teams SET flag_url = 'https://estadisticas.tenfield.com.uy/wp-content/uploads/2020/04/escudo-juventud.png'
  WHERE competition_id = 'c0a00000-0000-4000-8000-000000000001' AND name = 'Juventud';

UPDATE teams SET flag_url = 'https://estadisticas.tenfield.com.uy/wp-content/uploads/2020/04/escudo-progreso.png'
  WHERE competition_id = 'c0a00000-0000-4000-8000-000000000001' AND name = 'Progreso';

UPDATE teams SET flag_url = 'https://estadisticas.tenfield.com.uy/wp-content/uploads/2020/04/escudo-cerro.png'
  WHERE competition_id = 'c0a00000-0000-4000-8000-000000000001' AND name = 'Cerro';
