# Plan de Desarrollo — PencaLes 2.0 (SaaS Multi-Tenant Multi-Competencia)

> **Fecha:** 2026-06-11 · **Actualizado:** 2026-06-14 — avance significativo en Fase 3; Supabase v2 funcionando
> **Origen:** Evolución de PencaLes 2026 (repo clonado) hacia plataforma SaaS.

## Avance global (2026-06-14)

| Fase | Estado |
|------|--------|
| 0 · Preparación | 🟡 repo OK + Supabase v2 operativo; falta renombrar paquete y `.env.example` |
| 1 · Schema + RLS | 🟡 desplegado y funcionando contra Supabase nuevo; **sin tests de RLS** |
| 2 · Auth, contexto y selector | ✅ completo y funcionando contra backend v2 |
| 3 · Refactor páginas de juego | 🟡 páginas de usuario completas (Fixture, Ranking, Jugar, Grupos, Ayuda); faltan Cuadro, +Puntos, Subgrupos, Admin |
| 4 · Motor de cálculo | 🟡 SQL escrito junto al schema — sin probar contra datos reales |
| 5 · Administración | ⬜ |
| 6 · Integración y pulido | ⬜ |
| 7 · Migración de datos | 🟡 script + guía listos; ejecución post-Mundial |
| 8 · QA, seguridad y lanzamiento | ⬜ |

**Próximo paso recomendado:** Fase 3 — completar Cuadro y +Puntos (los más complejos),
luego arrancar Fase 5 (Admin mínimo para crear Ten-Comps y cargar resultados). Detalle por fase en §5.

---

## 1. Decisiones tomadas

| Decisión | Resolución |
|----------|-----------|
| Corte de PencaLes 2026 | **Post-Mundial.** La penca actual corre intacta hasta el 19/07/2026. El nuevo sistema se desarrolla en paralelo; la migración se hace con datos finales congelados. |
| Supabase | **Proyecto nuevo.** Schema multi-tenant desde cero; la migración es un ETL desde el proyecto viejo. |
| Acceso / URLs | **App única + selector.** Un solo dominio, rutas `/p/:slug/...`. El modelo de datos guarda `slug` por tenant para habilitar subdominios a futuro. |
| Facturación | **Fuera de alcance v1.** Alta de tenants manual por super-admin. Campos `plan` y `status` quedan modelados para el futuro. |

## 2. Glosario y modelo conceptual

```
Plataforma (super-admins)
├── Tenants (empresas que contratan)           ej: "Empresa ABC"
├── Competencias (catálogo deportivo global)   ej: "Copa Mundial 2026", "Copa América 2025"
│     └── equipos, partidos, grupos, fases, reglas de avance, resultados oficiales
└── Ten-Comps (tenant × competencia)           ej: "Copa América 25 - Empleados"
      └── miembros, predicciones, scoring propio, menú propio, ranking, subgrupos, bonus
```

- **Tenant (Empresa):** cliente del SaaS. Tiene administradores y cargadores propios.
- **Competencia:** evento deportivo del catálogo. Sus datos (partidos, equipos, resultados) son
  **compartidos** entre todos los Ten-Comps que la usan. Se cargan una sola vez.
- **Ten-Comp:** instancia de una competencia dentro de un tenant. Es la **unidad de participación**:
  el usuario se une a un Ten-Comp, predice en él, y su ranking solo suma puntos de ese Ten-Comp.
  Un tenant puede tener dos Ten-Comps de la misma competencia con nombres distintos.
- **Público / Privado:** Ten-Comp público → cualquier usuario entra y queda habilitado al instante.
  Privado → se entra con código de 8 letras mayúsculas; puede predecir de inmediato pero
  necesita aprobación del admin del Ten-Comp para aparecer en el ranking.

### Roles

| Rol | Alcance | Permisos |
|-----|---------|----------|
| Super-admin | Plataforma | Todo: tenants, competencias, resultados, usuarios. Mínimo 1, configurable más. |
| Admin de tenant | Tenant | Crea/gestiona Ten-Comps del tenant, edita scoring y menú, aprueba miembros, asigna cargadores. **Siempre es también cargador.** |
| Cargador | Tenant | Carga resultados de las competencias usadas por su tenant. Asignado por super-admin o admin del tenant. |
| Usuario | Ten-Comp | Se une a Ten-Comps, predice, ve rankings. |

> **Decisión de diseño (a confirmar, §10.1):** como los resultados son hechos deportivos compartidos,
> se cargan **una vez por competencia** y benefician a todos los Ten-Comps. Un cargador de un tenant
> puede cargar resultados de las competencias que su tenant usa. Todo queda auditado.

---

## 3. Modelo de datos (Supabase nuevo)

### 3.1 Núcleo plataforma

```sql
profiles            -- global, espejo de auth.users (trigger on signup)
  id uuid PK → auth.users, username, display_name, avatar_url,
  is_super_admin bool DEFAULT false, is_active bool DEFAULT true, created_at

tenants
  id uuid PK, name, slug text UNIQUE,          -- slug reservado para subdominios futuros
  logo_url, status text CHECK (active|suspended) DEFAULT 'active',
  plan text DEFAULT 'free',                    -- sin lógica en v1, solo modelado
  max_ten_comps int,                           -- límites soft (NULL = sin límite),
  max_members_per_ten_comp int,                -- los asigna el super-admin
  notes, created_at

tenant_roles
  tenant_id FK, user_id FK, role text CHECK (admin|loader),
  PK (tenant_id, user_id)
  -- regla: admin implica loader en todas las funciones de chequeo
```

### 3.2 Catálogo deportivo (competencias compartidas)

Las tablas actuales pasan a estar scoped por `competition_id`:

```sql
competitions
  id uuid PK, name, sport text DEFAULT 'futbol', season text,   -- "2026"
  status text CHECK (draft|active|finished|archived),
  start_date, end_date,
  advancement_engine text,         -- §3.5: nombre del programa de reglas de avance
  default_scoring jsonb,           -- se copia al crear cada Ten-Comp
  default_menu jsonb,              -- ídem (qué ítems del menú se ven)
  owner_tenant_id uuid NULL,       -- NULL = competencia global (v1 siempre NULL);
                                   -- reservado para competencias privadas de tenant a futuro
  created_by, created_at

phases     (id, competition_id FK, name, "order", has_extra_time, has_penalties)
groups     (id, competition_id FK, name, "order")        -- 0 filas si la competencia no tiene grupos
stadiums   (id, competition_id FK, name, city, country, timezone, photo_urls, ...)
teams      (id, competition_id FK, name, abbreviation, flag_url, group_id FK,
            is_confirmed, placeholder_name)
matches    (id, competition_id FK, match_number, phase_id, group_id,
            home/away_team_id, home/away_slot_label, stadium_id,
            match_datetime, status, scores 90/et/pk, winner_team_id,
            UNIQUE (competition_id, match_number))
knockout_slot_rules   (competition_id FK, match_id, slot, rule_type, ...)
combinaciones_terceros (competition_id FK, ...)           -- ex 09_combinaciones
group_position_overrides (competition_id FK, ...)         -- ex 08_group_overrides
```

> Los resultados (`matches.*_score`) viven a nivel competencia: **se cargan una sola vez**
> y todos los Ten-Comps que usan esa competencia los ven.

### 3.3 Ten-Comps y participación

```sql
ten_comps
  id uuid PK, tenant_id FK, competition_id FK,
  name text,                       -- "Copa América 25 - Empleados"
  slug text UNIQUE,                -- para /p/:slug
  visibility text CHECK (public|private),
  join_code char(8) UNIQUE,        -- solo privados; 8 letras A-Z, generado server-side
  status text CHECK (open|closed|archived) DEFAULT 'open',
  menu_config jsonb,               -- copiado de competitions.default_menu, editable
  bonus_enabled bool DEFAULT true, -- el Ten-Comp decide si usa los bonus de la competencia
  created_by, created_at

ten_comp_scoring                   -- copiado de competitions.default_scoring, editable
  ten_comp_id PK FK,
  exact_score_points, correct_winner_points, correct_draw_points,
  knockout_exact_score_bonus, correct_et_result_points, correct_pk_winner_points

ten_comp_members
  ten_comp_id FK, user_id FK,
  status text CHECK (pending|approved|blocked),
  -- público: approved al instante · privado: pending hasta aprobación
  joined_at, approved_at, approved_by,
  PK (ten_comp_id, user_id)

predictions
  id, ten_comp_id FK, user_id FK, match_id FK,
  home_score, away_score, home/away_score_et, predicted_pk_winner_id,
  points_earned, created_at, updated_at,
  UNIQUE (ten_comp_id, user_id, match_id)
  -- pending puede predecir; el ranking filtra por status='approved'

-- Bonus: los TIPOS de bonus y sus puntos default se definen POR COMPETENCIA
-- (ej: podio, empates, rango_goles son del Mundial; otra competencia puede tener otros).
-- El Ten-Comp decide si los incluye (bonus_enabled) y puede editar los puntos.
competition_bonus_types (competition_id FK, bonus_type, default_points,
                         PK (competition_id, bonus_type))
bonus_config        (ten_comp_id FK, bonus_type, points)   -- copiado al crear el Ten-Comp si bonus_enabled
bonus_predictions   (ten_comp_id FK, user_id FK, ...)      -- UNIQUE(ten_comp_id, user_id)
bonus_points        (ten_comp_id FK, user_id FK, bonus_type, points_earned)

subgrupos           (id, ten_comp_id FK, name, creator_id, ...)
subgrupo_members    (subgrupo_id FK, user_id FK, ...)

predictions_audit        (+ ten_comp_id)   -- trigger SECURITY DEFINER, igual que hoy
bonus_predictions_audit  (+ ten_comp_id)
email_queue              (+ tenant_id, ten_comp_id nullable)
```

### 3.4 Vistas

| Vista | Cambio respecto a hoy |
|-------|----------------------|
| `group_standings` | + columna `competition_id`; calcula por competencia |
| `best_third_ranking` | + `competition_id` |
| `leaderboard` | + `ten_comp_id`; suma `predictions.points_earned` + `bonus_points` **del mismo Ten-Comp**; solo miembros `approved`; rank con `PARTITION BY ten_comp_id` |
| `subgrupo_ranking` | + `ten_comp_id` |

### 3.5 Reglas de avance modulares ("programas")

La regla de cómo se arman los cruces no es configurable en sí, pero sí **qué programa se usa**:

```sql
advancement_engines
  id text PK,                 -- 'wc48_best_thirds', 'top2_groups', 'knockout_only', 'league_only'
  name, description,
  fn_name text                -- función SQL que implementa la regla

-- Dispatcher:
CREATE FUNCTION populate_knockout(p_competition_id uuid) ... AS $$
  -- lee competitions.advancement_engine y hace
  -- EXECUTE format('SELECT %I($1)', v_fn) USING p_competition_id;
$$;
```

Motores:
- **v1 (solo Mundial):** `wc48_best_thirds` — lógica actual del Mundial 2026
  (12 grupos + mejores terceros, port de `09_combinaciones.sql`). El dispatcher queda
  implementado desde v1, así agregar motores no toca el resto del sistema.
- **v1.1+ (cuando se diseñen otras competencias):** `top2_groups` (Copa América, Euro),
  `knockout_only` (eliminación directa), `league_only` (Campeonato Uruguayo).

El mismo patrón aplica a otros cálculos parametrizables a futuro (criterios de desempate, etc.).

### 3.6 RLS — estrategia

Funciones helper (`SECURITY DEFINER`, `STABLE`):

```sql
is_super_admin()                          -- profiles.is_super_admin
is_tenant_admin(p_tenant uuid)
is_tenant_loader(p_tenant uuid)           -- true si admin O loader
can_load_results(p_competition uuid)      -- super_admin OR loader de algún tenant
                                          -- con ten_comp activo sobre esa competencia
is_member(p_ten_comp uuid)                -- pending o approved
is_approved_member(p_ten_comp uuid)
```

Políticas principales:

| Tabla | SELECT | INSERT/UPDATE |
|-------|--------|----------------|
| Catálogo (competitions, matches, teams...) | autenticados | super-admin; resultados también `can_load_results()` |
| `tenants`, `tenant_roles` | super-admin + admins del propio tenant | super-admin (alta tenant); tenant-admin (roles loader) |
| `ten_comps` | públicos: todos · privados: solo miembros | tenant-admin del tenant |
| `ten_comp_members` | miembros del mismo ten_comp | unirse: RPC `join_ten_comp()` · aprobar: tenant-admin |
| `predictions` | propias + (de otros, solo si el partido ya empezó — igual que hoy) | propias, **lock server-side**: `match_datetime > now()` Y ten_comp `open` |
| `bonus_predictions` | propias | propias, lock: torneo no iniciado (server `now()`) |
| `ten_comp_scoring`, `menu_config` | miembros | tenant-admin |

Reglas que se conservan del sistema actual (ya endurecidas en `14`–`16_security_fixes`):
- Lock de predicciones con `now()` del servidor — inmune a manipulación de reloj.
- Self profile edit no puede escalar flags (`is_super_admin`, `is_active`).
- RPCs `SECURITY DEFINER` con guard de rol explícito al inicio.
- `join_code` **nunca** se expone por SELECT: unirse vía RPC `join_ten_comp(p_code)` que
  busca el código internamente y crea la membresía.

### 3.7 RPCs principales

| RPC | Guard | Función |
|-----|-------|---------|
| `join_ten_comp(p_code)` | autenticado | Une a Ten-Comp privado por código (status `pending`) |
| `set_match_result(...)` | `can_load_results()` | Carga resultado en la competencia |
| `calculate_match_points(p_match)` | ídem | Itera predicciones de **todos los Ten-Comps** de esa competencia, aplicando el scoring de cada uno |
| `calculate_bonus_points(p_competition)` | ídem | Ídem, por Ten-Comp, idempotente |
| `populate_knockout(p_competition)` | ídem | Dispatcher de motores de avance |
| `recalculate_all(p_competition)` | super-admin | Recalcula todo |
| `approve_member(p_ten_comp, p_user)` | tenant-admin | Aprueba miembro pendiente |
| `clone_competition(p_id)` | super-admin | Duplica una competencia como template (útil para crear "Copa América 2028" desde 2025) |

---

## 4. Arquitectura frontend

### 4.1 Routing

```
/                          → landing / redirect según sesión
/auth, /auth-callback      → login global (una cuenta para todo)
/pencas                    → HOME del usuario: mis Ten-Comps + explorar públicos + unirse por código
/perfil                    → perfil global

/p/:slug/                  → contexto de UN Ten-Comp (redirect a /p/:slug/fixture)
/p/:slug/fixture           ┐
/p/:slug/grupos[/:grupo]   │
/p/:slug/cuadro            │  páginas actuales, scoped al Ten-Comp,
/p/:slug/ranking           │  visibles según menu_config
/p/:slug/mis-predicciones  │
/p/:slug/mas-puntos        │
/p/:slug/subgrupos[/:id]   │
/p/:slug/ayuda             ┘  (muestra el scoring REAL del Ten-Comp)

/p/:slug/admin/*           → admin del Ten-Comp (miembros/aprobaciones, scoring, menú)
/t/:tenantSlug/admin       → admin del tenant (sus Ten-Comps, cargadores)
/admin/*                   → super-admin (tenants, competencias, resultados, motores, usuarios, auditoría)
```

### 4.2 Contextos y datos

- **`TenCompProvider`** envuelve `/p/:slug/*`: resuelve slug → ten_comp + competencia + membresía +
  scoring + menu_config en una sola query. Expone `useTenComp()`.
- **`useAuth`** se amplía: `isSuperAdmin`, `tenantRoles[]` (tenants donde es admin/loader).
- **Servicios:** todos reciben `tenCompId` o `competitionId` explícito (nunca leen contexto —
  se mantiene la separación servicios/hooks actual).
- **Query keys** de TanStack Query incluyen siempre el scope: `['matches', competitionId, ...]`,
  `['leaderboard', tenCompId]`.
- **Menú dinámico:** `Header`/`BottomNav` leen `menu_config` del Ten-Comp activo y filtran ítems.
- Se conserva el gotcha de PostgREST con la columna `order` (renombrar a `sort_order` en el
  schema nuevo y eliminar el workaround de `matchService.ts`).

### 4.3 Páginas nuevas

| Página | Ruta | Para |
|--------|------|------|
| Mis Pencas (home) | `/pencas` | Usuario: lista, explorar públicos, unirse por código |
| Admin Ten-Comp | `/p/:slug/admin` | Aprobaciones, scoring, menú, cerrar/archivar |
| Admin Tenant | `/t/:tenantSlug/admin` | CRUD Ten-Comps, asignar cargadores |
| Plataforma: Tenants | `/admin/tenants` | Super-admin: alta/baja empresas, asignar admins |
| Plataforma: Competencias | `/admin/competencias` | CRUD competencias, equipos, partidos, fases, motor de avance, scoring/menú default |
| Plataforma: Resultados | `/admin/resultados` | Selector de competencia + carga (evoluciona la actual) |

---

## 5. Plan de desarrollo por fases

> Estimaciones en semanas-persona aproximadas. El Mundial termina 19/07; la meta es tener
> el sistema listo para migrar a fin de julio y lanzar en agosto.
>
> **Leyenda:** ✅ hecho · 🟡 en progreso / parcial · ⬜ pendiente
> Última actualización del avance: **2026-06-12**.

### Fase 0 — Preparación (0.5 sem) — 🟡 parcial
- ✅ Crear proyecto Supabase nuevo (operativo, migraciones aplicadas)
- ⬜ Crear proyecto Vercel nuevo apuntando a este repo (§7)
- 🟡 Branding **"PencaLes 2.0"**: CLAUDE.md actualizado; falta renombrar el paquete
      (`pencales-2026` → `pencales-2`) y limpiar nombres hardcodeados (plantillas email, SMTP_FROM_NAME)
      — dominio a definir
- ✅ Convención de migraciones: `supabase/migrations/` numerada desde cero; v1 en `supabase/legacy/`
- 🟡 Repo reorganizado; falta actualizar `.env.example`. Ramas `main`/`develop` operativas

### Fase 1 — Schema núcleo + RLS (1.5 sem) — 🟡 desplegado y funcionando; sin tests de RLS
- ✅ `01_schema.sql`: TODAS las tablas + triggers. `sort_order` en vez de `order`
- ✅ `02_rls.sql`: funciones helper + todas las políticas + Storage
- ✅ `03_functions_views.sql`: vistas + RPCs + seed de `advancement_engines`
- ⬜ Seed de desarrollo (tenant demo + competencia corta de prueba)
- ✅ **01/02/03 corriendo contra el Supabase nuevo** (app funcionando en producción)
- ⬜ Tests de RLS (matriz rol × tabla × operación)

### Fase 2 — Auth, contexto y selector (1 sem) — ✅ completo, funcionando contra backend v2
> Probado contra Supabase v2. Build OK. Todas las rutas v2 operativas.
- ✅ `useAuth` ampliado: `isSuperAdmin`, `tenantRoles`, `isTenantAdmin()`, `isTenantLoader()`
- ✅ `TenCompProvider` + `useTenComp()`/`useTenCompState()` + `resolveTenCompBySlug`
- ✅ Página **Mis Pencas** (`/pencas`): mis Ten-Comps, explorar públicos, unirse por código (RPCs)
- ✅ Flujo privado: `MembershipBanner` "pendiente de aprobación"
- ✅ Routing `/p/:slug/*` con `TenCompLayout` + navegación dinámica según `menu_config`
- ⬜ Selector de penca en el header global (diferido: el cambio de penca es vía `/pencas`)

> Archivos: `types/tenant.ts`, `services/tenCompService.ts`, `contexts/TenCompContext.tsx`,
> `components/tencomp/{TenCompLayout,MembershipBanner}.tsx`, `pages/PencasPage.tsx`,
> `pages/penca/{PencaDashboardPage,PencaPlaceholderPage}.tsx`.

### Fase 3 — Refactor páginas de juego (2 sem) — 🟡 páginas de usuario completas; faltan Cuadro, +Puntos, Subgrupos, Admin
> Patrón establecido: servicios v2 en `src/services/v2/` (schema con `competition_id`/`ten_comp_id`,
> alias `order:sort_order`). Páginas v1 actualizadas para compatibilidad con schema v2
> (alias `sort_order` en matchService, predictionService, groupService). Build OK.
- ✅ Servicios: `v2/leaderboardService`, `v2/matchService`, `v2/predictionService`, `v2/groupStandingsService`
- ✅ **Ranking** (`PencaRankingPage`) + `LeaderboardView` compartido con v1
- ✅ **Fixture** (`PencaFixturePage`) — tabs de fase y filtro de grupo dinámicos, read-only
- ✅ **Jugar / Mis Predicciones** (`PencaMisPrediccionesPage`) — próximos y jugados, `PredictionModal`
      adaptado para v2 (prop `tenCompId`, invalidación scoped)
- ✅ **Grupos** (`PencaGruposPage`) — `group_standings` scoped por `competition_id`, filtro por grupo,
      link a detalle
- ✅ **Grupo Detalle** (`PencaGrupoDetailPage`) — posiciones + partidos del grupo
- ✅ **Ayuda** (`PencaAyudaPage`) — scoring dinámico del Ten-Comp activo + calculadora de puntos
- ⬜ **Cuadro** (bracket) — `virtualBracket.ts` parametrizado para leer `knockout_slot_rules`;
      hoy asume M73–M104 hardcodeado
- ⬜ **+ Puntos** — bonus predictions scoped a `ten_comp_id`; requiere `v2/bonusService`
- ⬜ **Subgrupos** — mini-ligas scoped a `ten_comp_id`; requiere `v2/subgrupoService`
- ⬜ **Admin Ten-Comp** (`/p/:slug/admin`) — aprobaciones, scoring, menú (Fase 5)
- ⬜ Equipo (`/p/:slug/equipos/:id`) — detalle de equipo scoped

> Archivos nuevos esta sesión: `services/v2/{predictionService,groupStandingsService}.ts`,
> `pages/penca/{PencaMisPrediccionesPage,PencaGruposPage,PencaGrupoDetailPage,PencaAyudaPage}.tsx`.
> Fix `sort_order` en v1 matchService, predictionService, groupService.
> Rutas `/p/:slug/{ranking,fixture,mis-predicciones,grupos,grupos/:grupo,ayuda}` operativas.

### Fase 4 — Motor de cálculo (1.5 sem) — 🟡 escrito junto al schema, sin probar
> El SQL se escribió en `03_functions_views.sql` durante la Fase 1.
- ✅ `calculate_match_points` multi-Ten-Comp (lee `ten_comp_scoring` de cada penca)
- ✅ `calculate_bonus_points(competition_id)` por Ten-Comp, idempotente
- ✅ Motores de avance: dispatcher `populate_knockout` + `engine_wc48_best_thirds` (port)
- ✅ `recalculate_all(competition_id)` + `set_match_result(...)` (orquestación)
- ⬜ Tests de regresión: con datos del Mundial migrados, los puntos deben dar **idénticos**
      a producción (es también la validación de la migración, §6.5) — requiere DB con datos

### Fase 5 — Administración (2 sem) — ⬜ pendiente
- [ ] Super-admin: CRUD tenants + asignación de admins
- [ ] Super-admin: CRUD competencias (wizard: datos → fases → grupos → equipos → partidos →
      reglas de avance → scoring/menú default) + `clone_competition`
- [ ] Carga de resultados con selector de competencia (evolución de ResultadosPage + ResultForm)
- [ ] Admin tenant: CRUD Ten-Comps (crear desde competencia → copia scoring/menú/bonus → genera join_code)
- [ ] Admin tenant: asignar cargadores
- [ ] Límites soft: enforcement de `max_ten_comps` / `max_members_per_ten_comp` en RPCs de
      creación y `join_ten_comp` (mensaje claro al usuario cuando se alcanza el límite)
- [ ] Admin Ten-Comp: aprobaciones de miembros, editar scoring, editar menú, cerrar/archivar
- [ ] Auditoría y Usuarios adaptados a multi-tenant; Correos con scope tenant

### Fase 6 — Integración y pulido (1 sem) — ⬜ pendiente
- [ ] Emails multi-tenant (plantillas con nombre del Ten-Comp; `api/` serverless adaptado)
- [ ] ResultAutoPage (APIs externas) con mapeo por competencia
- [ ] Capacitor: misma app, el selector resuelve el multi-tenant. **Sin stores en v1**:
      distribución web + APK directo (página /descargar), como hoy
- [ ] UpdateModal / version.json
- [ ] Revisión de performance: índices (`predictions(ten_comp_id, match_id)`,
      `ten_comp_members(user_id)`, `matches(competition_id, match_datetime)`)

### Fase 7 — Migración de datos (§6) (1 sem, post 19/07) — 🟡 script y guía listos
- ✅ Script SQL `90_migrate_from_v1.sql` (transforma `legacy.*` → v2, UUIDs preservados)
- ✅ Guía de ejecución paso a paso `docs/MIGRACION_V1_A_V2.md` (autocontenida)
- ⬜ Ejecución real + validación (post-Mundial, requiere ambos proyectos Supabase)

### Fase 8 — QA, seguridad y lanzamiento (1 sem) — ⬜ pendiente
- [ ] Pentest casero: matriz RLS completa, intentos de escalación, join_code brute-force
      (rate limit en RPC), manipulación de reloj
- [ ] Carga de prueba: 1 competencia × 10 Ten-Comps × 500 usuarios simulados
- [ ] Smoke E2E del flujo completo: alta tenant → crear Ten-Comp → unirse → predecir →
      resultado → puntos → ranking
- [ ] Corte: DNS/dominio, comunicación a usuarios, freeze del proyecto viejo (solo lectura)

**Total estimado: ~9–10 semanas.** Fases 1–6 pueden empezar ya (junio–julio, en paralelo al Mundial);
Fases 7–8 después del 19/07.

---

## 6. Plan de migración de datos (PencaLes 2026 → MultiPenca)

> **Implementado.** La migración es **SQL** (no Node/TS): se restaura la v1 en un schema `legacy`
> del proyecto nuevo y un único script la transforma. Artefactos:
> - `supabase/migrations/90_migrate_from_v1.sql` — el script de transformación
> - `docs/MIGRACION_V1_A_V2.md` — guía de ejecución paso a paso (autocontenida, para meses después)

### 6.1 Principios

1. **Se ejecuta post-Mundial** con datos congelados (proyecto viejo en solo-lectura).
2. **Se preservan TODOS los UUIDs** (no solo los de usuarios): `auth.users`, perfiles, equipos,
   partidos, predicciones, etc. Como el proyecto nuevo está vacío no hay colisión, y las FKs
   migran sin tabla de mapeo. La única columna nueva es el scope (`competition_id` / `ten_comp_id`).
3. **Script SQL idempotente** (`ON CONFLICT DO NOTHING/UPDATE`), re-ejecutable. Lee de `legacy.*`,
   escribe en `public.*`. Anclas con UUID fijos para tenant/competencia/Ten-Comp.
4. **Validación = recálculo**: tras migrar, `recalculate_all()` en el nuevo sistema debe
   reproducir exactamente el leaderboard final de producción (diff fila a fila = 0).

### 6.2 Mapeo de entidades

| Origen (viejo) | Destino (nuevo) | Notas |
|----------------|-----------------|-------|
| — | `tenants` | Crear tenant **"Publico"** (tenant de la plataforma para pencas públicas abiertas) |
| — | `competitions` | Crear **"Mundial Futbol 2026"**, motor `wc48_best_thirds`, status `finished` |
| — | `ten_comps` | Crear **"PencaLes 2026"** bajo tenant Publico (visibility `public`, status `archived`) |
| `auth.users` | `auth.users` | §6.3 — con hashes de password, mismos UUIDs |
| `profiles` | `profiles` | `is_admin` → `tenant_roles(admin)` + decidir quién es super-admin; `is_loader` → `tenant_roles(loader)` |
| `groups, phases, stadiums, teams` | ídem + `competition_id` | IDs nuevos + id_map |
| `matches` (con resultados) | `matches` | + competition_id; remapear team/stadium/phase ids |
| `knockout_slot_rules`, `combinaciones`, `group_overrides` | ídem | remapeo de ids |
| `scoring_config` | `competitions.default_scoring` **y** `ten_comp_scoring` | mismo valor en ambos |
| `predictions` | `predictions` + `ten_comp_id` | user_id intacto; match_id remapeado; `points_earned` se migra y luego se valida por recálculo |
| `bonus_config` | `competition_bonus_types` (defaults) **y** `bonus_config` del Ten-Comp | el Ten-Comp histórico migra con `bonus_enabled = true` |
| `bonus_predictions / bonus_points` | ídem + `ten_comp_id` | |
| `subgrupos / subgrupo_members` | ídem + `ten_comp_id` | |
| `predictions_audit`, `bonus_predictions_audit` | ídem | histórico, insert directo con timestamps originales |
| `profiles` activos | `ten_comp_members` | todos `approved`, `joined_at` = `profiles.created_at` |
| Storage `avatars` | Storage nuevo | §6.4 |
| `email_queue` | no migrar | histórico irrelevante; conservar dump |

### 6.3 Migración de `auth.users`

- `pg_dump` selectivo del schema `auth` del proyecto viejo (tabla `auth.users` + `auth.identities`),
  restaurando en el nuevo **preservando `id` y `encrypted_password`** (bcrypt) — los usuarios
  conservan email y contraseña sin re-registro.
- Verificar config de Auth nueva idéntica (email confirm, plantillas `resetpass`/`verificar`).
- Plan B si pg_dump de auth se complica: Admin API `createUser` con `password_hash` + `id` explícito.
- Usuarios OAuth (si los hay): migrar `auth.identities`; el login social re-vincula por email.

### 6.4 Storage (avatares)

- Script con storage API: listar bucket `avatars` viejo → descargar → subir al nuevo
  (mismos paths `{user_id}/...`).
- Reescribir `profiles.avatar_url` (cambia el dominio del proyecto Supabase):
  `UPDATE profiles SET avatar_url = replace(avatar_url, '<old>.supabase.co', '<new>.supabase.co')`.

### 6.5 Orden de ejecución y validación

```
1. auth.users + identities          →  count usuarios viejo == nuevo
2. profiles                         →  count + spot-check flags
3. tenant + tenant_roles            →  admins/loaders correctos
4. competition + catálogo deportivo →  104 matches, 48 teams, 12 groups, 64 rules
5. ten_comp + scoring + members     →  members == profiles activos
6. predictions                      →  count + SUM(points_earned) == viejo
7. bonus_* + subgrupos + audits     →  counts
8. storage avatares                 →  count objetos + URLs reescritas
9. recalculate_all(competition)     →  ★ DIFF leaderboard nuevo vs export del viejo:
                                        debe ser IDÉNTICO fila a fila (user, puntos, rank)
10. Smoke manual: login de 2-3 usuarios reales, ver sus predicciones e historial
```

Si el paso 9 no da idéntico, hay un bug en el motor nuevo o en el mapeo — **no se lanza** hasta
que dé exacto. Es la mejor red de seguridad gratuita que tenemos.

### 6.6 Rollback

El proyecto viejo no se toca (solo se pone en read-only a nivel app). Si algo falla,
se descarta el proyecto nuevo y se repite el ETL. No hay ventana de riesgo para los datos.

---

## 7. Cambios en Vercel

| Ítem | Acción |
|------|--------|
| Proyecto | Crear proyecto Vercel **nuevo** (ej: `multipenca`) apuntando a este repo. El proyecto viejo de PencaLes queda intacto sirviendo la penca actual hasta el corte. |
| Env vars | `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` (proyecto nuevo) · `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` (serverless) · `VITE_TURNSTILE_SITE_KEY` · SMTP (`SMTP_*`, considerar `SMTP_FROM_NAME` dinámico por tenant) · API keys de fútbol (`FOOTBALL_DATA_API_KEY`, etc.) — gestionar con `vercel env` |
| Dominios | Dominio nuevo (ej: `multipenca.uy`). El slug de tenant queda en DB para soportar wildcard `*.multipenca.uy` a futuro (requeriría middleware de resolución — fuera de v1). |
| `api/` functions | Las serverless de email siguen igual, apuntando al Supabase nuevo. Revisar que ninguna asuma single-tenant (ej: nombre "PencaLes 2026" hardcodeado en plantillas). |
| `vercel.json` | Revisar rewrites para las rutas nuevas `/p/:slug/*` (SPA fallback ya cubre). Considerar migrar a `vercel.ts` si se agrega lógica. |
| Deploy flow | Igual que hoy: `develop` → preview, `main` → producción. |

## 8. Cambios en Supabase

| Ítem | Acción |
|------|--------|
| Proyecto | Nuevo proyecto. Elegir región (sa-east-1 São Paulo minimiza latencia UY). |
| Auth | Email/password + mismas plantillas de email (`resetpass.email.html`, `verificar.email.html` — quitar branding hardcodeado). Configurar redirect URLs del dominio nuevo. |
| Schema | Migraciones nuevas numeradas desde cero (Fase 1). Adoptar `supabase` CLI + `supabase/migrations/` versionadas (mejora sobre los scripts manuales actuales). |
| Storage | Buckets `avatars` (+ `logos` para tenants). Policies por owner como hoy. |
| Realtime | Igual que hoy si se usa; habilitar por tabla según necesidad. |
| Backups | Activar PITR si el plan lo permite, antes del lanzamiento. |

---

## 9. Estructura del menú configurable (`menu_config`)

```jsonc
// competitions.default_menu → copiado a ten_comps.menu_config
{
  "fixture": true,
  "grupos": true,        // false para competencias sin grupos
  "cuadro": true,        // false para league_only
  "ranking": true,
  "mis_predicciones": true,
  "mas_puntos": true,    // false si el Ten-Comp no usa bonus
  "subgrupos": true,
  "ayuda": true
}
```

El Header/BottomNav filtran por esto. Las rutas también validan (un ítem oculto con URL directa → redirect).

---

## 10. Decisiones resueltas (2026-06-12)

1. **Alcance de cargadores:** ✅ Confirmado — un cargador de tenant puede cargar resultados de las
   competencias que su tenant usa; el resultado es compartido entre todos los tenants. Auditado.
2. **Quién crea competencias:** ✅ **Solo super-admin.** Se modela `competitions.owner_tenant_id`
   nullable para habilitar competencias privadas de tenant a futuro, sin UI en v1.
3. **Nombre del producto:** ✅ **"PencaLes 2.0"**. Package `pencales-2`. Dominio a definir.
4. **Migración:** ✅ Tenant = **"Publico"** (tenant de plataforma para pencas públicas abiertas);
   competencia = **"Mundial Futbol 2026"**; el Ten-Comp histórico "PencaLes 2026" cuelga de ahí.
   Este tenant Publico queda como hogar natural de futuras pencas abiertas de la plataforma.
5. **Bonus:** ✅ Los tipos de bonus se definen **por competencia** (`competition_bonus_types`);
   cada Ten-Comp decide si los incluye (`bonus_enabled`) y puede editar los puntos (`bonus_config`).
6. **App móvil:** ✅ Sin stores en v1 — web + APK directo (página /descargar), como hoy.
7. **Límites soft:** ✅ Sí — `tenants.max_ten_comps` y `max_members_per_ten_comp` (NULL = sin
   límite), asignados por super-admin, enforcement en RPCs de creación y join.
8. **Otras competencias / ligas largas:** ✅ v1 arranca **solo con el Mundial** (motor
   `wc48_best_thirds`). El dispatcher de motores queda implementado; los demás motores y la UI
   de ligas por fechas se diseñan e implementan después, competencia por competencia.
