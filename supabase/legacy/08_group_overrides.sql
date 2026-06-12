-- ============================================================
-- 08_GROUP_OVERRIDES.SQL — Penca Mundial 2026
-- Tablas para que el admin resuelva empates no dirimibles
-- en posiciones de grupos y ranking de terceros.
-- Ejecutar DESPUÉS de 03_views_functions.sql
-- ============================================================

-- ── Tabla ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS group_position_overrides (
  team_id    UUID PRIMARY KEY REFERENCES teams(id) ON DELETE CASCADE,
  position   INT  NOT NULL CHECK (position BETWEEN 1 AND 4),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── RLS y permisos ────────────────────────────────────────────────────────────

ALTER TABLE group_position_overrides ENABLE ROW LEVEL SECURITY;

GRANT SELECT         ON public.group_position_overrides TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.group_position_overrides TO authenticated;

CREATE POLICY "gpo_public_read"  ON group_position_overrides FOR SELECT USING (true);
CREATE POLICY "gpo_admin_write"  ON group_position_overrides FOR ALL
  USING ((SELECT is_admin FROM profiles WHERE id = auth.uid()));

-- ── Vista group_standings actualizada ────────────────────────────────────────
-- Reemplaza la definida en 03_views_functions.sql.
-- Cuando existe un override para el equipo se usa esa posición;
-- si no, se usa la calculada automáticamente por criterios FIFA.

CREATE OR REPLACE VIEW group_standings AS
WITH resultados AS (
  SELECT
    m.group_id,
    m.home_team_id                                           AS team_id,
    CASE WHEN m.home_score_90 > m.away_score_90 THEN 1 ELSE 0 END AS won,
    CASE WHEN m.home_score_90 = m.away_score_90 THEN 1 ELSE 0 END AS drawn,
    CASE WHEN m.home_score_90 < m.away_score_90 THEN 1 ELSE 0 END AS lost,
    m.home_score_90::INT AS gf,
    m.away_score_90::INT AS gc
  FROM matches m
  WHERE m.status = 'finished'
    AND m.group_id IS NOT NULL
    AND m.home_score_90 IS NOT NULL
    AND m.home_team_id IS NOT NULL

  UNION ALL

  SELECT
    m.group_id,
    m.away_team_id,
    CASE WHEN m.away_score_90 > m.home_score_90 THEN 1 ELSE 0 END,
    CASE WHEN m.away_score_90 = m.home_score_90 THEN 1 ELSE 0 END,
    CASE WHEN m.away_score_90 < m.home_score_90 THEN 1 ELSE 0 END,
    m.away_score_90::INT,
    m.home_score_90::INT
  FROM matches m
  WHERE m.status = 'finished'
    AND m.group_id IS NOT NULL
    AND m.away_score_90 IS NOT NULL
    AND m.away_team_id IS NOT NULL
),
stats AS (
  SELECT
    group_id, team_id,
    COUNT(*)::INT                     AS pj,
    SUM(won)::INT                     AS pg,
    SUM(drawn)::INT                   AS pe,
    SUM(lost)::INT                    AS pp,
    SUM(gf)::INT                      AS gf,
    SUM(gc)::INT                      AS gc,
    (SUM(gf) - SUM(gc))::INT         AS gd,
    (SUM(won) * 3 + SUM(drawn))::INT AS pts
  FROM resultados
  GROUP BY group_id, team_id
),
ranked AS (
  SELECT
    t.id                              AS team_id,
    t.group_id,
    g.name                            AS group_name,
    g."order"                         AS group_order,
    t.name                            AS team_name,
    t.abbreviation                    AS team_abbreviation,
    t.flag_url                        AS team_flag_url,
    t.is_confirmed,
    t.placeholder_name,
    COALESCE(s.pj,  0)               AS pj,
    COALESCE(s.pg,  0)               AS pg,
    COALESCE(s.pe,  0)               AS pe,
    COALESCE(s.pp,  0)               AS pp,
    COALESCE(s.gf,  0)               AS gf,
    COALESCE(s.gc,  0)               AS gc,
    COALESCE(s.gd,  0)               AS gd,
    COALESCE(s.pts, 0)               AS pts,
    ROW_NUMBER() OVER (
      PARTITION BY t.group_id
      ORDER BY
        COALESCE(s.pts, 0) DESC,
        COALESCE(s.gd,  0) DESC,
        COALESCE(s.gf,  0) DESC,
        t.name ASC
    )::INT                            AS auto_position,
    gpo.position                      AS override_position
  FROM teams t
  JOIN groups g ON g.id = t.group_id
  LEFT JOIN stats s ON s.team_id = t.id AND s.group_id = t.group_id
  LEFT JOIN group_position_overrides gpo ON gpo.team_id = t.id
)
SELECT
  team_id, group_id, group_name, group_order,
  team_name, team_abbreviation, team_flag_url,
  is_confirmed, placeholder_name,
  pj, pg, pe, pp, gf, gc, gd, pts,
  COALESCE(override_position, auto_position)::INT AS position,
  (override_position IS NOT NULL)                 AS has_override
FROM ranked
ORDER BY group_order, COALESCE(override_position, auto_position);

-- ============================================================
-- TABLA: OVERRIDES RANKING DE TERCEROS
-- ============================================================

CREATE TABLE IF NOT EXISTS best_third_rank_overrides (
  team_id    UUID PRIMARY KEY REFERENCES teams(id) ON DELETE CASCADE,
  rank       INT  NOT NULL CHECK (rank BETWEEN 1 AND 12),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE best_third_rank_overrides ENABLE ROW LEVEL SECURITY;

GRANT SELECT                    ON public.best_third_rank_overrides TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE    ON public.best_third_rank_overrides TO authenticated;

CREATE POLICY "btro_public_read"  ON best_third_rank_overrides FOR SELECT USING (true);
CREATE POLICY "btro_admin_write"  ON best_third_rank_overrides FOR ALL
  USING ((SELECT is_admin FROM profiles WHERE id = auth.uid()));

-- ── Vista best_third_ranking actualizada ─────────────────────────────────────
-- Reemplaza la definida en 03_views_functions.sql.

CREATE OR REPLACE VIEW best_third_ranking AS
WITH auto_ranked AS (
  SELECT
    gs.team_id, gs.group_id, gs.group_name, gs.team_name, gs.team_flag_url,
    gs.is_confirmed, gs.placeholder_name,
    gs.pj, gs.pg, gs.pe, gs.pp, gs.gf, gs.gc, gs.gd, gs.pts,
    ROW_NUMBER() OVER (
      ORDER BY gs.pts DESC, gs.gd DESC, gs.gf DESC, gs.team_name ASC
    )::INT AS auto_rank,
    btro.rank AS override_rank
  FROM group_standings gs
  LEFT JOIN best_third_rank_overrides btro ON btro.team_id = gs.team_id
  WHERE gs.position = 3
)
SELECT
  team_id, group_id, group_name, team_name, team_flag_url,
  is_confirmed, placeholder_name,
  pj, pg, pe, pp, gf, gc, gd, pts,
  COALESCE(override_rank, auto_rank)::INT AS rank,
  (override_rank IS NOT NULL)             AS has_override
FROM auto_ranked
ORDER BY COALESCE(override_rank, auto_rank);
