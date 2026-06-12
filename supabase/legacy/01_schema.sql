-- ============================================================
-- 01_SCHEMA.SQL — Penca Mundial 2026
-- Ejecutar primero en el SQL Editor de Supabase
-- ============================================================

-- ============================================================
-- GRUPOS (A–L)
-- ============================================================
CREATE TABLE IF NOT EXISTS groups (
  id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name  VARCHAR(2)  NOT NULL UNIQUE,
  "order" SMALLINT  NOT NULL UNIQUE
);

-- ============================================================
-- FASES
-- ============================================================
CREATE TABLE IF NOT EXISTS phases (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             VARCHAR(50) NOT NULL UNIQUE,
  "order"          SMALLINT    NOT NULL UNIQUE,
  has_extra_time   BOOLEAN     NOT NULL DEFAULT false,
  has_penalties    BOOLEAN     NOT NULL DEFAULT false
);

-- ============================================================
-- ESTADIOS
-- ============================================================
CREATE TABLE IF NOT EXISTS stadiums (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(100) NOT NULL UNIQUE,
  city        VARCHAR(100) NOT NULL,
  country     VARCHAR(50)  NOT NULL,
  timezone    VARCHAR(50)  NOT NULL DEFAULT 'America/New_York',
  address     TEXT,
  capacity    INTEGER,
  photo_urls  TEXT[]       NOT NULL DEFAULT '{}',
  latitude    DECIMAL(9,6),
  longitude   DECIMAL(9,6)
);

-- ============================================================
-- EQUIPOS
-- ============================================================
CREATE TABLE IF NOT EXISTS teams (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             VARCHAR(100) NOT NULL,
  abbreviation     CHAR(3)      NOT NULL UNIQUE,
  flag_url         VARCHAR(255),
  group_id         UUID         NOT NULL REFERENCES groups(id),
  group_position   SMALLINT     NOT NULL CHECK (group_position BETWEEN 1 AND 4),
  is_confirmed     BOOLEAN      NOT NULL DEFAULT true,
  placeholder_name VARCHAR(100),
  UNIQUE(group_id, group_position)
);

-- ============================================================
-- PARTIDOS
-- ============================================================
CREATE TABLE IF NOT EXISTS matches (
  id               UUID     PRIMARY KEY DEFAULT gen_random_uuid(),
  match_number     SMALLINT NOT NULL UNIQUE CHECK (match_number BETWEEN 1 AND 104),
  phase_id         UUID     NOT NULL REFERENCES phases(id),
  group_id         UUID     REFERENCES groups(id),        -- NULL en eliminatorias
  home_team_id     UUID     REFERENCES teams(id),         -- NULL si TBD
  away_team_id     UUID     REFERENCES teams(id),         -- NULL si TBD
  home_slot_label  VARCHAR(30),  -- ej: '1A', 'W73', '3A/B/C/D/F'
  away_slot_label  VARCHAR(30),
  stadium_id       UUID     NOT NULL REFERENCES stadiums(id),
  match_datetime   TIMESTAMPTZ NOT NULL,                  -- Siempre en UTC
  status           VARCHAR(20)  NOT NULL DEFAULT 'scheduled'
                   CHECK (status IN ('scheduled', 'live', 'finished')),
  -- Resultado 90 minutos
  home_score_90    SMALLINT CHECK (home_score_90 >= 0),
  away_score_90    SMALLINT CHECK (away_score_90 >= 0),
  -- Tiempo extra (acumulado, incluye goles de los 90)
  home_score_et    SMALLINT CHECK (home_score_et >= 0),
  away_score_et    SMALLINT CHECK (away_score_et >= 0),
  -- Penales
  home_score_pk    SMALLINT CHECK (home_score_pk >= 0),
  away_score_pk    SMALLINT CHECK (away_score_pk >= 0),
  winner_team_id   UUID     REFERENCES teams(id)
);

CREATE INDEX IF NOT EXISTS idx_matches_datetime ON matches(match_datetime);
CREATE INDEX IF NOT EXISTS idx_matches_phase    ON matches(phase_id);
CREATE INDEX IF NOT EXISTS idx_matches_group    ON matches(group_id);
CREATE INDEX IF NOT EXISTS idx_matches_status   ON matches(status);

-- ============================================================
-- REGLAS DE LLAVES ELIMINATORIAS
-- ============================================================
CREATE TABLE IF NOT EXISTS knockout_slot_rules (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id         UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  slot             VARCHAR(4) NOT NULL CHECK (slot IN ('home', 'away')),
  rule_type        VARCHAR(20) NOT NULL
                   CHECK (rule_type IN ('group_position', 'match_winner', 'match_loser', 'best_third')),
  source_group_id  UUID REFERENCES groups(id),
  source_match_id  UUID REFERENCES matches(id),
  position         SMALLINT,      -- 1=1ro, 2=2do, 3=3ro del grupo
  third_groups     CHAR(1)[],     -- ej: '{A,B,C,D,F}' grupos elegibles para el 3ro
  UNIQUE(match_id, slot)
);

-- ============================================================
-- PERFILES DE USUARIO
-- ============================================================
CREATE TABLE IF NOT EXISTS profiles (
  id           UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username     VARCHAR(30) NOT NULL UNIQUE,
  display_name VARCHAR(60) NOT NULL,
  avatar_url   VARCHAR(255),
  is_active    BOOLEAN     NOT NULL DEFAULT true,   -- Activo por defecto; admin puede inactivar
  is_admin     BOOLEAN     NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- CONFIGURACIÓN DE PUNTUACIÓN
-- ============================================================
CREATE TABLE IF NOT EXISTS scoring_config (
  id                          UUID     PRIMARY KEY DEFAULT gen_random_uuid(),
  name                        VARCHAR(50) NOT NULL,
  is_active                   BOOLEAN     NOT NULL DEFAULT false,
  -- Fase de grupos
  exact_score_points          SMALLINT    NOT NULL DEFAULT 3,
  correct_winner_points       SMALLINT    NOT NULL DEFAULT 1,
  correct_draw_points         SMALLINT    NOT NULL DEFAULT 1,
  -- Bonus eliminatorias
  knockout_exact_score_bonus  SMALLINT    NOT NULL DEFAULT 2,
  -- Tiempo extra
  correct_et_result_points    SMALLINT    NOT NULL DEFAULT 1,
  -- Penales
  correct_pk_winner_points    SMALLINT    NOT NULL DEFAULT 1
);

-- Solo una config activa a la vez
CREATE UNIQUE INDEX IF NOT EXISTS idx_scoring_one_active
  ON scoring_config(is_active) WHERE is_active = true;

-- ============================================================
-- PREDICCIONES
-- ============================================================
CREATE TABLE IF NOT EXISTS predictions (
  id                    UUID     PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID     NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  match_id              UUID     NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  -- Predicción 90 min
  home_score            SMALLINT NOT NULL CHECK (home_score >= 0),
  away_score            SMALLINT NOT NULL CHECK (away_score >= 0),
  -- Tiempo extra (solo eliminatorias, si el usuario predijo empate)
  home_score_et         SMALLINT CHECK (home_score_et >= 0),
  away_score_et         SMALLINT CHECK (away_score_et >= 0),
  -- Ganador en penales
  predicted_pk_winner_id UUID    REFERENCES teams(id),
  -- Resultado
  points_earned         SMALLINT,   -- NULL hasta que termine el partido
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, match_id)
);

CREATE INDEX IF NOT EXISTS idx_predictions_user  ON predictions(user_id);
CREATE INDEX IF NOT EXISTS idx_predictions_match ON predictions(match_id);
