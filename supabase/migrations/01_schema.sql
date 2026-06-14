-- ============================================================================
-- 01_SCHEMA.SQL — PencaLes 2.0 (multi-tenant)
-- Crea TODAS las tablas, índices y triggers a nivel fila.
-- RLS y políticas → 02_rls.sql · Vistas y RPCs → 03_functions_views.sql
--
-- Jerarquía:  Tenant (empresa) → Ten-Comp (instancia) → Usuario
--             Competencia (catálogo deportivo compartido)
--
-- Orden de ejecución: 01 → 02 → 03  (luego 90_migrate_from_v1 si aplica)
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid()

-- ════════════════════════════════════════════════════════════════════════════
-- NÚCLEO DE PLATAFORMA
-- ════════════════════════════════════════════════════════════════════════════

-- Perfiles: espejo global de auth.users. Un usuario = una cuenta para toda la plataforma.
CREATE TABLE IF NOT EXISTS profiles (
  id              UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username        VARCHAR(30) NOT NULL UNIQUE,
  display_name    VARCHAR(60) NOT NULL,
  avatar_url      VARCHAR(255),
  is_super_admin  BOOLEAN     NOT NULL DEFAULT false,   -- acceso total a la plataforma
  is_active       BOOLEAN     NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tenants: empresas que contratan el servicio.
CREATE TABLE IF NOT EXISTS tenants (
  id                         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name                       VARCHAR(100) NOT NULL,
  slug                       VARCHAR(40)  NOT NULL UNIQUE,   -- reservado para subdominios futuros
  logo_url                   VARCHAR(255),
  status                     VARCHAR(20)  NOT NULL DEFAULT 'active'
                             CHECK (status IN ('active', 'suspended')),
  plan                       VARCHAR(30)  NOT NULL DEFAULT 'free',  -- sin lógica en v1
  max_ten_comps              INT,         -- límite soft; NULL = sin límite
  max_members_per_ten_comp   INT,         -- límite soft; NULL = sin límite
  notes                      TEXT,
  created_at                 TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Roles por tenant. 'admin' implica 'loader' en los chequeos (ver 02_rls.sql).
CREATE TABLE IF NOT EXISTS tenant_roles (
  tenant_id  UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id    UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role       VARCHAR(10) NOT NULL CHECK (role IN ('admin', 'loader')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_tenant_roles_user ON tenant_roles(user_id);

-- ════════════════════════════════════════════════════════════════════════════
-- CATÁLOGO DEPORTIVO (competencias compartidas)
-- Los partidos y resultados se cargan UNA vez por competencia.
-- ════════════════════════════════════════════════════════════════════════════

-- Motores de avance modulares. La regla de cruces no es configurable, pero sí
-- QUÉ programa se usa. fn_name es la función SQL que implementa el motor.
CREATE TABLE IF NOT EXISTS advancement_engines (
  id          TEXT PRIMARY KEY,           -- ej: 'wc48_best_thirds'
  name        TEXT NOT NULL,
  description TEXT,
  fn_name     TEXT NOT NULL               -- función que recibe (p_competition_id uuid)
);

CREATE TABLE IF NOT EXISTS competitions (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name               VARCHAR(100) NOT NULL,
  sport              VARCHAR(30)  NOT NULL DEFAULT 'futbol',
  season             VARCHAR(20),                          -- ej: '2026'
  status             VARCHAR(20)  NOT NULL DEFAULT 'draft'
                     CHECK (status IN ('draft', 'active', 'finished', 'archived')),
  start_date         DATE,
  end_date           DATE,
  advancement_engine TEXT REFERENCES advancement_engines(id),
  owner_tenant_id    UUID REFERENCES tenants(id) ON DELETE SET NULL,  -- NULL = global (v1 siempre NULL)
  -- Defaults que se copian al crear cada Ten-Comp (luego el tenant los edita):
  default_scoring    JSONB NOT NULL DEFAULT
                     '{"exact_score_points":3,"correct_winner_points":1,"correct_draw_points":1,"knockout_exact_score_bonus":2,"correct_et_result_points":1,"correct_pk_winner_points":1}'::jsonb,
  default_menu       JSONB NOT NULL DEFAULT
                     '{"fixture":true,"grupos":true,"cuadro":true,"ranking":true,"mis_predicciones":true,"mas_puntos":true,"subgrupos":true,"ayuda":true}'::jsonb,
  created_by         UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Tipos de bonus disponibles POR competencia + puntos default.
-- Al crear un Ten-Comp con bonus_enabled se copian a ten_comp_bonus_config.
CREATE TABLE IF NOT EXISTS competition_bonus_types (
  competition_id UUID NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
  bonus_type     TEXT NOT NULL,
  default_points INT  NOT NULL,
  PRIMARY KEY (competition_id, bonus_type)
);

CREATE TABLE IF NOT EXISTS phases (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id UUID        NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
  name           VARCHAR(50) NOT NULL,
  sort_order     SMALLINT    NOT NULL,           -- renombrado de "order" (gotcha PostgREST)
  has_extra_time BOOLEAN     NOT NULL DEFAULT false,
  has_penalties  BOOLEAN     NOT NULL DEFAULT false,
  UNIQUE (competition_id, name),
  UNIQUE (competition_id, sort_order)
);

CREATE TABLE IF NOT EXISTS groups (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id UUID        NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
  name           VARCHAR(4)  NOT NULL,
  sort_order     SMALLINT    NOT NULL,
  UNIQUE (competition_id, name),
  UNIQUE (competition_id, sort_order)
);

CREATE TABLE IF NOT EXISTS stadiums (
  id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id UUID         NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
  name           VARCHAR(100) NOT NULL,
  city           VARCHAR(100) NOT NULL,
  country        VARCHAR(50)  NOT NULL,
  timezone       VARCHAR(50)  NOT NULL DEFAULT 'America/New_York',
  address        TEXT,
  capacity       INTEGER,
  photo_urls     TEXT[]       NOT NULL DEFAULT '{}',
  latitude       DECIMAL(9,6),
  longitude      DECIMAL(9,6),
  UNIQUE (competition_id, name)
);

CREATE TABLE IF NOT EXISTS teams (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id   UUID         NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
  name             VARCHAR(100) NOT NULL,
  abbreviation     CHAR(3)      NOT NULL,
  flag_url         VARCHAR(255),
  group_id         UUID         REFERENCES groups(id),   -- NULL si la competencia no tiene grupos
  group_position   SMALLINT     CHECK (group_position BETWEEN 1 AND 4),
  is_confirmed     BOOLEAN      NOT NULL DEFAULT true,
  placeholder_name VARCHAR(100),
  UNIQUE (competition_id, abbreviation),
  UNIQUE (group_id, group_position)
);
CREATE INDEX IF NOT EXISTS idx_teams_competition ON teams(competition_id);

CREATE TABLE IF NOT EXISTS matches (
  id               UUID     PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id   UUID     NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
  match_number     SMALLINT NOT NULL,
  phase_id         UUID     NOT NULL REFERENCES phases(id),
  group_id         UUID     REFERENCES groups(id),
  home_team_id     UUID     REFERENCES teams(id),
  away_team_id     UUID     REFERENCES teams(id),
  home_slot_label  VARCHAR(30),
  away_slot_label  VARCHAR(30),
  stadium_id       UUID     REFERENCES stadiums(id),
  match_datetime   TIMESTAMPTZ NOT NULL,             -- siempre UTC
  status           VARCHAR(20) NOT NULL DEFAULT 'scheduled'
                   CHECK (status IN ('scheduled', 'live', 'finished')),
  home_score_90    SMALLINT CHECK (home_score_90 >= 0),
  away_score_90    SMALLINT CHECK (away_score_90 >= 0),
  home_score_et    SMALLINT CHECK (home_score_et >= 0),
  away_score_et    SMALLINT CHECK (away_score_et >= 0),
  home_score_pk    SMALLINT CHECK (home_score_pk >= 0),
  away_score_pk    SMALLINT CHECK (away_score_pk >= 0),
  winner_team_id   UUID     REFERENCES teams(id),
  UNIQUE (competition_id, match_number)
);
CREATE INDEX IF NOT EXISTS idx_matches_competition ON matches(competition_id);
CREATE INDEX IF NOT EXISTS idx_matches_datetime    ON matches(competition_id, match_datetime);
CREATE INDEX IF NOT EXISTS idx_matches_phase       ON matches(phase_id);
CREATE INDEX IF NOT EXISTS idx_matches_group       ON matches(group_id);
CREATE INDEX IF NOT EXISTS idx_matches_status      ON matches(status);

CREATE TABLE IF NOT EXISTS knockout_slot_rules (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id   UUID        NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
  match_id         UUID        NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  slot             VARCHAR(4)  NOT NULL CHECK (slot IN ('home', 'away')),
  rule_type        VARCHAR(20) NOT NULL
                   CHECK (rule_type IN ('group_position', 'match_winner', 'match_loser', 'best_third')),
  source_group_id  UUID REFERENCES groups(id),
  source_match_id  UUID REFERENCES matches(id),
  position         SMALLINT,
  third_groups     CHAR(1)[],
  UNIQUE (match_id, slot)
);
CREATE INDEX IF NOT EXISTS idx_ksr_competition ON knockout_slot_rules(competition_id);

-- Tabla FIFA de combinaciones de mejores terceros (formato WC48). Scoped por competencia.
CREATE TABLE IF NOT EXISTS combinaciones (
  competition_id UUID       NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
  combinacion    VARCHAR(8) NOT NULL,    -- 8 letras de grupos ordenadas
  rival_1a       VARCHAR(3) NOT NULL,
  rival_1b       VARCHAR(3) NOT NULL,
  rival_1d       VARCHAR(3) NOT NULL,
  rival_1e       VARCHAR(3) NOT NULL,
  rival_1g       VARCHAR(3) NOT NULL,
  rival_1i       VARCHAR(3) NOT NULL,
  rival_1k       VARCHAR(3) NOT NULL,
  rival_1l       VARCHAR(3) NOT NULL,
  PRIMARY KEY (competition_id, combinacion)
);

-- Overrides manuales del admin para empates no dirimibles.
CREATE TABLE IF NOT EXISTS group_position_overrides (
  competition_id UUID NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
  team_id        UUID PRIMARY KEY REFERENCES teams(id) ON DELETE CASCADE,
  position       INT  NOT NULL CHECK (position BETWEEN 1 AND 4),
  updated_at     TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS best_third_rank_overrides (
  competition_id UUID NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
  team_id        UUID PRIMARY KEY REFERENCES teams(id) ON DELETE CASCADE,
  rank           INT  NOT NULL CHECK (rank BETWEEN 1 AND 12),
  updated_at     TIMESTAMPTZ DEFAULT now()
);

-- ════════════════════════════════════════════════════════════════════════════
-- TEN-COMPS Y PARTICIPACIÓN
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS ten_comps (
  id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  competition_id UUID         NOT NULL REFERENCES competitions(id) ON DELETE RESTRICT,
  name           VARCHAR(100) NOT NULL,                 -- ej: "Copa América 25 - Empleados"
  slug           VARCHAR(50)  NOT NULL UNIQUE,          -- para /p/:slug
  visibility     VARCHAR(10)  NOT NULL DEFAULT 'private'
                 CHECK (visibility IN ('public', 'private')),
  join_code      CHAR(8)      UNIQUE                    -- solo privados; 8 letras A-Z
                 CHECK (join_code IS NULL OR join_code ~ '^[A-Z]{8}$'),
  status         VARCHAR(10)  NOT NULL DEFAULT 'open'
                 CHECK (status IN ('open', 'closed', 'archived')),
  menu_config    JSONB        NOT NULL DEFAULT '{}'::jsonb,
  bonus_enabled  BOOLEAN      NOT NULL DEFAULT true,
  created_by     UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ten_comps_tenant      ON ten_comps(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ten_comps_competition ON ten_comps(competition_id);

-- Scoring editable por Ten-Comp (copiado de competitions.default → ten_comp al crear).
CREATE TABLE IF NOT EXISTS ten_comp_scoring (
  ten_comp_id                UUID PRIMARY KEY REFERENCES ten_comps(id) ON DELETE CASCADE,
  exact_score_points         SMALLINT NOT NULL DEFAULT 3,
  correct_winner_points      SMALLINT NOT NULL DEFAULT 1,
  correct_draw_points        SMALLINT NOT NULL DEFAULT 1,
  knockout_exact_score_bonus SMALLINT NOT NULL DEFAULT 2,
  correct_et_result_points   SMALLINT NOT NULL DEFAULT 1,
  correct_pk_winner_points   SMALLINT NOT NULL DEFAULT 1
);

-- Puntos de cada bonus por Ten-Comp (copiado de competition_bonus_types al crear).
CREATE TABLE IF NOT EXISTS ten_comp_bonus_config (
  ten_comp_id UUID    NOT NULL REFERENCES ten_comps(id) ON DELETE CASCADE,
  bonus_type  TEXT    NOT NULL,
  points      INT     NOT NULL,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  PRIMARY KEY (ten_comp_id, bonus_type)
);

CREATE TABLE IF NOT EXISTS ten_comp_members (
  ten_comp_id UUID        NOT NULL REFERENCES ten_comps(id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status      VARCHAR(10) NOT NULL DEFAULT 'pending'
              CHECK (status IN ('pending', 'approved', 'blocked')),
  joined_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_at TIMESTAMPTZ,
  approved_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  PRIMARY KEY (ten_comp_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_ten_comp_members_user ON ten_comp_members(user_id);

CREATE TABLE IF NOT EXISTS predictions (
  id                     UUID     PRIMARY KEY DEFAULT gen_random_uuid(),
  ten_comp_id            UUID     NOT NULL REFERENCES ten_comps(id) ON DELETE CASCADE,
  user_id                UUID     NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  match_id               UUID     NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  home_score             SMALLINT NOT NULL CHECK (home_score >= 0),
  away_score             SMALLINT NOT NULL CHECK (away_score >= 0),
  home_score_et          SMALLINT CHECK (home_score_et >= 0),
  away_score_et          SMALLINT CHECK (away_score_et >= 0),
  predicted_pk_winner_id UUID     REFERENCES teams(id),
  points_earned          SMALLINT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (ten_comp_id, user_id, match_id)
);
CREATE INDEX IF NOT EXISTS idx_predictions_tencomp_match ON predictions(ten_comp_id, match_id);
CREATE INDEX IF NOT EXISTS idx_predictions_user          ON predictions(user_id);
CREATE INDEX IF NOT EXISTS idx_predictions_match         ON predictions(match_id);

CREATE TABLE IF NOT EXISTS bonus_predictions (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ten_comp_id        UUID NOT NULL REFERENCES ten_comps(id) ON DELETE CASCADE,
  user_id            UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  podio_1st_id       UUID REFERENCES teams(id),
  podio_2nd_id       UUID REFERENCES teams(id),
  podio_3rd_id       UUID REFERENCES teams(id),
  podio_4th_id       UUID REFERENCES teams(id),
  empates_grupos     SMALLINT CHECK (empates_grupos BETWEEN 0 AND 72),
  rango_goles        TEXT,
  final_cero         BOOLEAN,
  top_scorer_team_id UUID REFERENCES teams(id),
  top_group_id       UUID REFERENCES groups(id),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (ten_comp_id, user_id)
);

CREATE TABLE IF NOT EXISTS bonus_points (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ten_comp_id   UUID NOT NULL REFERENCES ten_comps(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  bonus_type    TEXT NOT NULL,
  points_earned INT  NOT NULL DEFAULT 0,
  detail        JSONB,
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (ten_comp_id, user_id, bonus_type)
);

CREATE TABLE IF NOT EXISTS subgrupos (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ten_comp_id UUID NOT NULL REFERENCES ten_comps(id) ON DELETE CASCADE,
  name        TEXT NOT NULL CHECK (char_length(name) BETWEEN 2 AND 50),
  creator_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (ten_comp_id, name)
);
CREATE INDEX IF NOT EXISTS idx_subgrupos_tencomp ON subgrupos(ten_comp_id);
CREATE INDEX IF NOT EXISTS idx_subgrupos_creator ON subgrupos(creator_id);

CREATE TABLE IF NOT EXISTS subgrupo_members (
  subgrupo_id UUID NOT NULL REFERENCES subgrupos(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  joined_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (subgrupo_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_subgrupo_members_user ON subgrupo_members(user_id);

-- ── Auditoría ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS predictions_audit (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  changed_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  action            TEXT        NOT NULL CHECK (action IN ('INSERT','UPDATE','DELETE')),
  ten_comp_id       UUID        NOT NULL REFERENCES ten_comps(id) ON DELETE CASCADE,
  user_id           UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  match_id          UUID        NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  old_home_score    SMALLINT, old_away_score    SMALLINT,
  old_home_score_et SMALLINT, old_away_score_et SMALLINT,
  old_pk_winner_id  UUID REFERENCES teams(id) ON DELETE SET NULL,
  new_home_score    SMALLINT, new_away_score    SMALLINT,
  new_home_score_et SMALLINT, new_away_score_et SMALLINT,
  new_pk_winner_id  UUID REFERENCES teams(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_tencomp ON predictions_audit(ten_comp_id);
CREATE INDEX IF NOT EXISTS idx_audit_user    ON predictions_audit(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_changed ON predictions_audit(changed_at DESC);

CREATE TABLE IF NOT EXISTS bonus_predictions_audit (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  changed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  action      TEXT        NOT NULL CHECK (action IN ('INSERT','UPDATE')),
  ten_comp_id UUID        NOT NULL REFERENCES ten_comps(id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  old_data    JSONB,
  new_data    JSONB
);

CREATE TABLE IF NOT EXISTS email_queue (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID        REFERENCES tenants(id) ON DELETE CASCADE,
  ten_comp_id   UUID        REFERENCES ten_comps(id) ON DELETE SET NULL,
  to_email      TEXT        NOT NULL,
  to_name       TEXT        NOT NULL,
  subject       TEXT        NOT NULL,
  body_html     TEXT        NOT NULL,
  status        TEXT        NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending', 'sent', 'failed')),
  category      TEXT        NOT NULL DEFAULT 'general',
  error_message TEXT,
  user_id       UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at       TIMESTAMPTZ
);

-- ════════════════════════════════════════════════════════════════════════════
-- TRIGGERS A NIVEL FILA
-- ════════════════════════════════════════════════════════════════════════════

-- Crear perfil al registrarse.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.profiles (id, username, display_name, is_active, is_super_admin)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name',
             split_part(NEW.email, '@', 1)),
    true, false
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- updated_at genérico.
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_predictions_updated_at ON predictions;
CREATE TRIGGER trg_predictions_updated_at
  BEFORE UPDATE ON predictions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_bonus_pred_updated_at ON bonus_predictions;
CREATE TRIGGER trg_bonus_pred_updated_at
  BEFORE UPDATE ON bonus_predictions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Auto-calcular ganador al cerrar un partido.
CREATE OR REPLACE FUNCTION auto_set_match_winner()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'finished' AND NEW.home_score_90 IS NOT NULL THEN
    IF NEW.home_score_pk IS NOT NULL AND NEW.away_score_pk IS NOT NULL THEN
      NEW.winner_team_id := CASE WHEN NEW.home_score_pk > NEW.away_score_pk
                                 THEN NEW.home_team_id ELSE NEW.away_team_id END;
    ELSIF NEW.home_score_et IS NOT NULL AND NEW.away_score_et IS NOT NULL
          AND NEW.home_score_et != NEW.away_score_et THEN
      NEW.winner_team_id := CASE WHEN NEW.home_score_et > NEW.away_score_et
                                 THEN NEW.home_team_id ELSE NEW.away_team_id END;
    ELSIF NEW.home_score_90 != NEW.away_score_90 THEN
      NEW.winner_team_id := CASE WHEN NEW.home_score_90 > NEW.away_score_90
                                 THEN NEW.home_team_id ELSE NEW.away_team_id END;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_match_winner ON matches;
CREATE TRIGGER trg_match_winner
  BEFORE UPDATE ON matches
  FOR EACH ROW WHEN (NEW.status = 'finished')
  EXECUTE FUNCTION auto_set_match_winner();

-- Auditoría de predicciones.
CREATE OR REPLACE FUNCTION fn_audit_predictions()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO predictions_audit (action, ten_comp_id, user_id, match_id,
      new_home_score, new_away_score, new_home_score_et, new_away_score_et, new_pk_winner_id)
    VALUES ('INSERT', NEW.ten_comp_id, NEW.user_id, NEW.match_id,
      NEW.home_score, NEW.away_score, NEW.home_score_et, NEW.away_score_et, NEW.predicted_pk_winner_id);
  ELSIF TG_OP = 'UPDATE' THEN
    IF (OLD.home_score, OLD.away_score, COALESCE(OLD.home_score_et,-1),
        COALESCE(OLD.away_score_et,-1), COALESCE(OLD.predicted_pk_winner_id::text,''))
       IS DISTINCT FROM
       (NEW.home_score, NEW.away_score, COALESCE(NEW.home_score_et,-1),
        COALESCE(NEW.away_score_et,-1), COALESCE(NEW.predicted_pk_winner_id::text,''))
    THEN
      INSERT INTO predictions_audit (action, ten_comp_id, user_id, match_id,
        old_home_score, old_away_score, old_home_score_et, old_away_score_et, old_pk_winner_id,
        new_home_score, new_away_score, new_home_score_et, new_away_score_et, new_pk_winner_id)
      VALUES ('UPDATE', NEW.ten_comp_id, NEW.user_id, NEW.match_id,
        OLD.home_score, OLD.away_score, OLD.home_score_et, OLD.away_score_et, OLD.predicted_pk_winner_id,
        NEW.home_score, NEW.away_score, NEW.home_score_et, NEW.away_score_et, NEW.predicted_pk_winner_id);
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO predictions_audit (action, ten_comp_id, user_id, match_id,
      old_home_score, old_away_score, old_home_score_et, old_away_score_et, old_pk_winner_id)
    VALUES ('DELETE', OLD.ten_comp_id, OLD.user_id, OLD.match_id,
      OLD.home_score, OLD.away_score, OLD.home_score_et, OLD.away_score_et, OLD.predicted_pk_winner_id);
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_predictions ON predictions;
CREATE TRIGGER trg_audit_predictions
  AFTER INSERT OR UPDATE OR DELETE ON predictions
  FOR EACH ROW EXECUTE FUNCTION fn_audit_predictions();

-- Auditoría de bonus_predictions.
CREATE OR REPLACE FUNCTION audit_bonus_predictions()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO bonus_predictions_audit (action, ten_comp_id, user_id, new_data)
    VALUES ('INSERT', NEW.ten_comp_id, NEW.user_id, to_jsonb(NEW));
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO bonus_predictions_audit (action, ten_comp_id, user_id, old_data, new_data)
    VALUES ('UPDATE', NEW.ten_comp_id, NEW.user_id, to_jsonb(OLD), to_jsonb(NEW));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_bonus_predictions ON bonus_predictions;
CREATE TRIGGER trg_audit_bonus_predictions
  AFTER INSERT OR UPDATE ON bonus_predictions
  FOR EACH ROW EXECUTE FUNCTION audit_bonus_predictions();

-- Subgrupos: auto-agregar creador como miembro + límite de 3 por usuario por Ten-Comp.
CREATE OR REPLACE FUNCTION auto_add_creator_to_subgrupo()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO subgrupo_members (subgrupo_id, user_id) VALUES (NEW.id, NEW.creator_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_add_creator ON subgrupos;
CREATE TRIGGER trg_auto_add_creator
  AFTER INSERT ON subgrupos
  FOR EACH ROW EXECUTE FUNCTION auto_add_creator_to_subgrupo();

CREATE OR REPLACE FUNCTION check_subgrupo_limit()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF (SELECT count(*) FROM subgrupos
      WHERE creator_id = NEW.creator_id AND ten_comp_id = NEW.ten_comp_id) >= 3 THEN
    RAISE EXCEPTION 'Un usuario puede crear máximo 3 subgrupos por penca';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_subgrupo_limit ON subgrupos;
CREATE TRIGGER trg_subgrupo_limit
  BEFORE INSERT ON subgrupos
  FOR EACH ROW EXECUTE FUNCTION check_subgrupo_limit();
