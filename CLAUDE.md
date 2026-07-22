# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Proyecto

**PencaLes 2.0** — Plataforma SaaS multi-tenant de pencas deportivas.
Plan completo de desarrollo: [`docs/PLAN_MULTITENANT.md`](docs/PLAN_MULTITENANT.md) · Migración a producción ejecutada: [`docs/MIGRA_PENCA_MULTIP.md`](docs/MIGRA_PENCA_MULTIP.md)

**Estado actual:** **En producción** (migrado 21/07/2026, in-place sobre el Supabase/Vercel de Penca2026). v1 quedó congelada en el schema `legacy` de la misma base (no en un proyecto aparte); `supabase/legacy/` en el repo sigue siendo solo referencia histórica de scripts. `docs/MIGRACION_V1_A_V2.md` (ETL a proyecto nuevo) quedó obsoleto — la migración real fue in-place, ver `MIGRA_PENCA_MULTIP.md`.

### Modelo conceptual

```
Tenant (empresa)
  └── Ten-Comp (tenant × competencia = unidad de participación)
        ├── Competencia (catálogo global: equipos, partidos, resultados)
        ├── Miembros (predicen en este Ten-Comp)
        ├── Scoring propio (copiado de la competencia, editable)
        ├── Ranking (solo suma puntos de este Ten-Comp)
        ├── Bonus (opt-in por Ten-Comp, tipos definidos por competencia)
        └── Subgrupos (mini-ligas dentro del Ten-Comp)
```

**Ten-Comp público:** acceso inmediato al ranking.
**Ten-Comp privado:** código de 8 letras A-Z → puede predecir al instante, aparece en ranking solo tras aprobación del admin.

### Roles

| Rol | Alcance |
|-----|---------|
| Super-admin | Toda la plataforma: tenants, competencias, resultados |
| Admin de tenant | Sus Ten-Comps, scoring, menú, aprobaciones de miembros, asignar cargadores |
| Cargador | Carga resultados de competencias usadas por su tenant (resultado es compartido) |
| Usuario | Se une a Ten-Comps, predice, ve rankings |

Los admins de tenant siempre son también cargadores.

## Comandos

```bash
npm run dev      # Vite dev server en puerto 5173
npm run build    # tsc && vite build
npm run lint     # eslint . --ext ts,tsx
npm run preview  # Preview production build
```

## Tech Stack

| Layer | Choice |
|-------|--------|
| Framework | React 19 + TypeScript |
| Build | Vite 8 |
| Styling | Tailwind CSS 3 + custom theme (dark) |
| Icons | Lucide React |
| Routing | React Router v7 (nested Layout) |
| Data fetching | TanStack Query v5 |
| Backend | Supabase (PostgreSQL + Auth + Storage) |
| Toasts | Sonner |
| Dates | date-fns con `es` locale |
| Mobile | Capacitor 8 (Android / web, sin stores) |

## Design System

Dark theme, modern y minimalista. Todos los valores en `tailwind.config.js`:

```js
colors: {
  background: '#0B0F1A',
  surface:    '#141925',
  border:     '#1E2535',
  primary: { DEFAULT: '#10B981', hover: '#059669' },   // emerald
  accent:  { DEFAULT: '#F59E0B', hover: '#D97706' },   // amber/gold
  text: { primary: '#F8FAFC', secondary: '#94A3B8', muted: '#475569' },
}
```

Font: Inter. UI y rutas en español.

## Arquitectura

### Estructura de directorios

```
api/                      # Vercel serverless (Node) — send-email.ts (SMTP global), admin-reset-password.ts, feeds deportivos
src/
├── main.tsx
├── App.tsx               # BrowserRouter + Routes
├── index.css             # Tailwind globals
├── components/
│   ├── ui/               # Modal, Badge, Button, Input, TeamFlag, etc.
│   ├── layout/           # Layout.tsx, BottomNav.tsx, Header.tsx
│   ├── admin/            # ResultFormV2, CorreosTab (panel de correos por penca)
│   ├── groups/           # GroupTable
│   └── matches/          # MatchCard, PredictionModal
├── hooks/                # useAuth, useTenComp (contexto activo), useMatches, etc.
├── pages/
│   ├── PencasPage.tsx         # /pencas — home: mis Ten-Comps, explorar públicos, unirse
│   ├── FixturePage.tsx
│   ├── GruposPage.tsx / GrupoDetailPage.tsx / EquipoPage.tsx
│   ├── BracketPage.tsx
│   ├── RankingPage.tsx
│   ├── MasPuntosPage.tsx
│   ├── MisPrediccionesPage.tsx
│   ├── SubgruposPage.tsx / SubgrupoDetailPage.tsx
│   ├── AyudaPage.tsx
│   ├── AuthPage.tsx / PerfilPage.tsx / NotFoundPage.tsx
│   └── admin/            # ResultadosPage, PartidosAdminPage, etc.
├── services/             # Funciones de query Supabase (no hooks)
│   ├── v2/               # Servicios multi-tenant: adminService, emailService, matchService, leaderboardService, ...
│   ├── matchService.ts
│   ├── predictionService.ts
│   ├── bonusService.ts
│   ├── adminService.ts
│   ├── leaderboardService.ts
│   └── ...
├── lib/
│   └── supabase.ts       # Supabase client singleton
├── types/                # Interfaces TypeScript compartidas
└── utils/
    ├── constants.ts
    └── formatters.ts

supabase/
├── legacy/         # Scripts v1 (PencaLes 2026) — SOLO REFERENCIA para migración ETL
├── migrations/     # Migraciones v2 numeradas desde cero (se llenan en Fase 1)
└── email-templates/ # resetpass.html, verificar.html
```

### Routing (rutas en español)

```
/                     → redirect a /pencas
/pencas               → home: mis Ten-Comps + explorar públicos + unirse por código
/perfil               → perfil global del usuario
/auth, /auth-callback → login/registro

/p/:slug/             → contexto de un Ten-Comp (redirect a /p/:slug/fixture)
/p/:slug/fixture
/p/:slug/grupos[/:grupo]
/p/:slug/cuadro
/p/:slug/ranking
/p/:slug/mis-predicciones
/p/:slug/mas-puntos
/p/:slug/subgrupos[/:id]
/p/:slug/ayuda
/p/:slug/admin/*      → admin del Ten-Comp

/t/:tenantSlug/admin  → admin del tenant

/admin/*              → super-admin (tenants, competencias, resultados, usuarios)
```

### Supabase client

```ts
// src/lib/supabase.ts
import { createClient } from '@supabase/supabase-js'
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
)
```

### Auth y autorización

- Supabase Auth (email/password)
- `profiles` espeja `auth.users` — creado por trigger en signup
- Roles via `tenant_roles(tenant_id, user_id, role)` — no flags booleanos en profiles
- `is_super_admin` en profiles para acceso a toda la plataforma
- RLS usa funciones helper `SECURITY DEFINER`: `is_super_admin()`, `is_tenant_admin(tenant_id)`, `is_tenant_loader(tenant_id)`, `is_approved_member(ten_comp_id)`
- Lock de predicciones: RLS usa `now()` del servidor — inmune a manipulación de reloj
- **Reseteo de contraseña por admin:** endpoint `api/admin-reset-password.ts` (service role) setea una pass temporal autogenerada vía `auth.admin.updateUserById` y prende `profiles.must_change_password`. Autoriza a super-admin o al admin de un tenant donde el target es miembro. Botón "Pass" en el tab Miembros (`PencaAdminPage`) y en `/admin/usuarios` (super-admin), ambos vía `resetUserPassword` + `ResetPasswordModal` (componente compartido). El gate en `Layout` bloquea la app con `ForcePasswordChange` mientras `must_change_password = true`; al setear la nueva pass el dueño apaga el flag (permitido por `profiles_update_own`). Migración `97`.
- **Emails de usuarios (super-admin):** `/admin/usuarios` muestra el email vía RPC global `admin_get_all_user_emails()` (guardado por `is_super_admin()`, lee `auth.users`) → `fetchAllUserEmails`. Migración `98`. (El RPC `admin_get_user_details(p_ten_comp)` es por-penca; este es la lista completa de la plataforma.)

### Tablas principales v2

| Tabla | Propósito |
|-------|-----------|
| `profiles` | Usuarios globales; `is_super_admin`, `is_active` |
| `tenants` | Empresas; `slug`, `plan`, `max_ten_comps`, `max_members_per_ten_comp` |
| `tenant_roles` | Rol (admin/loader) por usuario por tenant |
| `competitions` | Catálogo: torneos deportivos con `advancement_engine` y defaults de scoring/menú/bonus |
| `competition_bonus_types` | Tipos de bonus y puntos default por competencia |
| `phases` | Fases de la competencia (con `competition_id`) |
| `groups` | Grupos (con `competition_id`) |
| `stadiums` | Estadios (con `competition_id`) |
| `teams` | Equipos (con `competition_id`) |
| `matches` | Partidos con resultados (con `competition_id`); resultados compartidos entre Ten-Comps |
| `knockout_slot_rules` | Reglas de cruce knockout por competencia |
| `advancement_engines` | Catálogo de motores de avance (v1: solo `wc48_best_thirds`) |
| `ten_comps` | Instancias tenant×competencia; `slug`, `visibility`, `join_code`, `bonus_enabled` |
| `ten_comp_scoring` | Scoring editable por Ten-Comp |
| `ten_comp_members` | Membresías con status `pending`/`approved`/`blocked` |
| `predictions` | Predicciones scoped a `(ten_comp_id, user_id, match_id)` |
| `bonus_config` | Puntos de bonus por Ten-Comp (copiado de competition_bonus_types) |
| `bonus_predictions` | Respuestas de bonus por Ten-Comp |
| `bonus_points` | Puntos ganados por bonus por Ten-Comp |
| `subgrupos` / `subgrupo_members` | Mini-ligas dentro de un Ten-Comp |
| `predictions_audit` | Log de cambios en predicciones |

### Servicios — convención importante

Todos los servicios en `src/services/` reciben scope **explícito** como parámetro:
- Funciones de competencia reciben `competitionId`
- Funciones de Ten-Comp reciben `tenCompId`
- Nunca leen contexto desde el módulo — la separación servicios/hooks se mantiene

### Motor de avance (advancement_engine)

Los cruces knockout se calculan via un dispatcher SQL que llama a la función configurada en `competitions.advancement_engine`. En v1 solo existe `wc48_best_thirds` (Mundial 48 equipos + mejores terceros, port de los scripts legacy). El dispatcher queda implementado para agregar motores sin tocar el resto del sistema.

### Formatos de competencia soportados

El mismo schema cubre varios formatos sin cambios estructurales; lo que cambia es la configuración:

| Formato | `advancement_engine` | Fases | Grupos | `round_number` | Tablas de posiciones |
|---------|----------------------|-------|--------|----------------|----------------------|
| Grupos + eliminatoria (Mundial) | `wc48_best_thirds` | varias | sí (A–L) | no | `group_standings` por grupo + cuadro |
| Liga de tabla única (Apertura UY) | `NULL` | 1 ("Fase Regular") | no | sí (fechas) | tabla única vía `leagueStandingsService`, menú `posiciones` |
| Liga por series (Intermedio UY) | `NULL` | 1 ("Fase Regular") | sí (una por serie) | sí (fechas) | una `group_standings` por serie, menú `grupos` |

- **Intermedio UY 2026** (seed `supabase/migrations/95_seed_intermedio_uy_2026.sql`; Apertura es la `91`): 16 equipos en 2 series (grupos `A`/`B`), todos contra todos **dentro** de cada serie, 7 fechas, sin final. Cada serie lleva su propia tabla vía `group_standings` (desempate PTS→DG→GF). Como `groups.name` es `VARCHAR(4)`, las series se nombran `A`/`B` y la UI las muestra como "Grupo A/B".
- **Eliminatoria Sudamericana 2026** (seed `supabase/migrations/96_seed_eliminatoria_sudamericana_2026.sql`): liga de tabla única (como Apertura). 10 selecciones CONMEBOL, todos contra todos ida y vuelta = 18 fechas / 90 partidos que suman a una sola tabla (sin dividir 1ra/2da rueda). `round_number` = fecha; cargada con resultados reales (status `finished`).
- **Admin de partidos** (`PartidosAdminPage`): además del filtro de fase ofrece filtro por grupo (Mundial/Intermedio) y por fecha (Apertura/Intermedio/Eliminatoria); cada uno aparece solo si la competencia tiene esos datos. El filtro de fecha se envuelve en varias filas (`flex-wrap`) para competencias con muchas fechas.

### Clonado de competencias (con transformación de equipos)

`clone_competition` está implementado en **frontend** como `cloneCompetition` (`src/services/v2/adminService.ts`), no como RPC. Duplica una competencia como template en estado `draft`:
- Copia fases, grupos, estadios, equipos, partidos (sin resultados, `scheduled`), `knockout_slot_rules`, `combinaciones`, `competition_bonus_types` y los defaults `default_menu` / `default_scoring`.
- Reagenda fechas: jornada 1 = `startDate`, cada jornada siguiente +7 días (usa `round_number`; sin él agrupa por fecha original). Opción `mirror` invierte local/visitante.
- **Transformación de equipos:** un mapa opcional `old_team_id → { name, abbreviation, flag_url }` renombra cada equipo en la copia manteniendo intacta la estructura (series/grupos y fixture). El remapeo `old→new` se reconstruye por la **nueva** abreviatura, así sigue funcionando aunque se renombre todo. El modal precarga la identidad original, exige completar todas las filas y valida que las abreviaturas sean únicas.
- **Penca en Publico automática:** al terminar el clonado se crea una penca pública (Ten-Comp) en el tenant **Publico** vía `createPublicoTenComp` (slug libre derivado del nombre, `visibility: public`, `bonus_enabled: false`). Una competencia es catálogo **global** (no pertenece a un tenant); lo que la asocia a una empresa es un Ten-Comp. Si falla la creación de la penca (o no existe el tenant Publico) la competencia clonada **no** se revierte: se avisa por toast. Para sumarla a otros tenants: `/t/:slug/admin` → "Nueva penca" (el selector incluye competencias en `draft`).

### Limpieza de datos (super-admin)

`/admin/limpieza` (`LimpiezaPage`) borra físicamente competencias y tenants. El borrado es **transaccional vía RPC** (migración `99_admin_cleanup.sql`, guardadas por `is_super_admin()`); el frontend `adminCleanupService.ts` solo llama `admin_delete_competition(p_competition_id)` / `admin_delete_tenant(p_tenant_id)`.

- `admin_delete_competition` borra en orden seguro: `ten_comps` (cascada predicciones/bonus) → `matches` → `teams` → `competitions`. Hace falta borrar `ten_comps` primero porque `ten_comps.competition_id` es `ON DELETE RESTRICT`; y borrar `matches`/predicciones antes que `teams` porque las FKs a `teams` son `NO ACTION`. **Los equipos se eliminan, no se huerfanizan** — no se comparten entre competencias (el clonado crea filas nuevas).
- `admin_delete_tenant`: por cada competencia propia, si otro tenant la usa quita la propiedad (`owner_tenant_id = NULL`), si no la borra entera; al final `DELETE tenants` cascada los `ten_comps` restantes y `tenant_roles`. El tenant Público no se puede borrar.

### Estados de penca y competencia (archivado)

`ten_comps.status`: `open` (predice / se une) · `closed` (congela: ni nuevos miembros ni predicciones, pero **sigue visible**) · `archived` (solo lectura histórica; además se oculta del switcher y de "explorar públicas", y no es candidata de `EntryRedirect`). Cerrada y archivada bloquean igual la escritura (RLS exige `status = 'open'`); la única diferencia es la **visibilidad**.

**Archivar una COMPETENCIA (`competitions.status = 'archived'`) propaga ese bloqueo a TODAS sus pencas, en todos los tenants** (migración `103`). El gate de escritura, antes solo `ten_comps.status = 'open'`, ahora también exige `competitions.status <> 'archived'` en: RLS de `predictions` (insert/update), RLS de `bonus_predictions` (insert/update) y las RPC `join_ten_comp_public` / `join_ten_comp_private` (lanzan "La competencia está archivada"). La lectura queda abierta. En el frontend el helper `isPencaArchived(p)` = `tenComp.status === 'archived' || competition.status === 'archived'` (`types/tenant.ts`) unifica el criterio; lo usan `fetchPublicTenComps`, `resolveEntryTenCompSlug` y `CompetitionSwitcher` para ocultar ambos casos.

### Stats de "qué apostaron los demás" (popup de carga)

`PredictionModal` muestra, bajo el marcador, la opinión del resto de la competencia para ese partido (migración `104`, dos RPC `SECURITY DEFINER` que devuelven **solo conteos** agregados y excluyen la apuesta propia vía `auth.uid()` — nunca filas individuales):
- `match_prediction_stats(p_match_id)` → distribución 1X2 a 90' (barra local / empate / visitante).
- `match_top_scores(p_match_id, p_limit)` → top 5 de resultados exactos más repetidos (mini gráfica de barras).

Como un partido pertenece a una sola competencia, agregar por `match_id` cubre las apuestas de **todas las pencas** de esa competencia. Servicios en `src/services/v2/predictionService.ts` (`fetchMatchPredictionStats`, `fetchMatchTopScores`).

### Fixture: posición inicial

`PencaFixturePage` agrupa los partidos por fecha y, al entrar (vista sin filtro, una sola vez por competencia vía `scrolledForRef`), hace auto-scroll a la sección del **día actual** — o a la primera fecha futura, o a la última si el campeonato ya terminó. Compara `matchDateKey` (YYYY-MM-DD en zona local) con hoy; muestra **todos** los partidos del día sin importar la hora. Cada `<section>` lleva `scroll-mt-20` para no quedar tapada por el header sticky.

### Flujo de cálculo de puntos

1. Cargador (admin/loader de tenant) carga resultado → RPC `set_match_result(competition_id, match_id, ...)`
2. RPC `calculate_match_points(match_id)` itera **todos los Ten-Comps** de esa competencia y aplica el scoring propio de cada uno
3. RPC `calculate_bonus_points(competition_id)` — idempotente, corre por cada Ten-Comp con `bonus_enabled = true`
4. El resultado es un hecho deportivo compartido; los puntos son por Ten-Comp

**Ligas vs eliminatorias en el scoring (migración `100`):** un partido es *knockout* (suma `knockout_exact_score_bonus` y evalúa ET/penales) **solo si la competencia tiene `advancement_engine` y el partido no es de grupo**. Antes se asumía knockout por `group_id IS NULL`, lo que rompía en ligas (Apertura) donde *todos* los partidos no tienen grupo. Por la misma razón `recalculate_all` ahora solo llama a `populate_knockout` si la competencia tiene motor de avance (sin motor lanzaba "sin motor de avance" y abortaba todo el recálculo).

**Posiciones:**
- *Liga de tabla única* (Apertura): se calcula en el frontend (`leagueStandingsService.fetchLeagueStandings`). Lista **todos** los equipos del fixture (arrancan en 0 aunque no hayan jugado), desempate PTS→DG→GF→**enfrentamiento directo**→nombre. No se persiste ni se "crea al clonar": es derivada en vivo.
- *Series* (Intermedio): vista `group_standings` (una tabla por serie), ya lista todos los equipos en 0; desempate PTS→DG→GF→nombre (sin head-to-head).

### Evolución del jugador en el ranking (gráficas, migración `108`)

En el detalle del ranking (`UserScoreDetailModal`, se abre al tocar un usuario) hay dos **tabs**: "Detalle" (partidos con puntos + +Puntos, lo de siempre) y "Evolución" (`UserEvolutionTab`), con dos gráficas de línea SVG propias (sin librería):
- **Puesto por día:** puesto en el ranking al cierre de cada día con partidos (eje Y invertido, #1 arriba).
- **Puntos partido a partido:** acumulado desde 0; los **+Puntos (bonus)** se suman en el partido donde se resuelven (marcado en ámbar). Atribución: `empates_grupos`/`top_group_goals` → último partido de la fase de grupos; el resto (`podio`, `rango_goles`, `final_cero`, `top_scorer_team`) → último partido del torneo.

Se materializan en `ten_comp_points_progress` (por partido) y `ten_comp_rank_progress` (por día), por Ten-Comp × usuario. Se regeneran enteras (borrar + reinsertar, set-based) vía `rebuild_progress(competition_id)`:
- Automático (best-effort, no aborta la carga) dentro de `set_match_result` y `recalculate_all`.
- Manual: botón **"Recargar evolución"** en `AdminResultadosV2Page` (para competencias ya jugadas, ej. Mundial).

Lectura por RPC `SECURITY DEFINER` guardado por `is_approved_member`: `member_get_user_points_progress` / `member_get_user_rank_progress` (RLS de ambas tablas sin políticas de cliente; solo se leen por estos RPC). El día se calcula en `America/Montevideo`.

### Known gotcha: columna `sort_order` (antes `order`)

En v2 la columna se renombró a `sort_order` para evitar el conflicto con el parámetro reservado `order` de PostgREST. Ya no es necesario el workaround de filtrado client-side que existía en `matchService.ts` de la v1.

### Bonus por Ten-Comp

Los tipos de bonus (podio, empates, rango de goles, etc.) se definen por competencia en `competition_bonus_types`. Al crear un Ten-Comp se copian a `bonus_config` si `bonus_enabled = true`. El tenant-admin puede editar los puntos pero no agregar tipos. Si `bonus_enabled = false`, el Ten-Comp no tiene sección de bonus.

### Correos (multi-tenant)

**Emisor de plataforma:** un único SMTP global (env vars `SMTP_HOST/PORT/USER/PASS/SECURE/FROM_NAME`) en `api/send-email.ts` (Vercel serverless + nodemailer). No hay SMTP por-tenant; lo único que varía por penca es el **branding**: el "from name" se deriva del nombre del tenant y las URLs/textos del cuerpo salen del Ten-Comp y su competencia (sin config extra en el tenant).

- **Alcance por penca:** el panel es el tab **"Correos"** en `PencaAdminPage` (`/p/:slug/admin`) — componente `src/components/admin/CorreosTab.tsx`. Lo gestiona el admin de la penca (tenant-admin incluido). Cada destinatario es un miembro **aprobado** de ese Ten-Comp.
- **Servicio:** `src/services/v2/emailService.ts` — todo scopeado por `tenCompId`; builders de HTML parametrizados por `EmailBrand`. Usa las RPCs `admin_get_user_details(p_ten_comp)` (emails + conteo de predicciones) y `admin_get_match_predictions(p_ten_comp, p_match_id)`, ambas guardadas por `is_ten_comp_admin`.
- **Cola `email_queue`** (en `01_schema.sql`): trae `tenant_id` + `ten_comp_id`; RLS `is_tenant_admin`. `api/send-email.ts` autoriza con super-admin **o** admin del tenant dueño del correo.
- **Tipos de correo:** `sin_predicciones`, `ranking`, `partido_M{n}` (resultado), `invitacion`, `invitacion_externa`, `recordatorio`. Envío masivo con pausa de 15 s entre cada uno.
- **Invitaciones (migración `101`):** dos vías además de los miembros aprobados.
  1. *Usuarios registrados* — `admin_get_invitable_users(p_ten_comp)` (guardada por `is_ten_comp_admin`, acotada al **mismo tenant**) lista jugadores de **otras** pencas de la empresa que aún no están en esta; el correo lleva `user_id`. Sirve para invitar a los de la competencia A a la nueva B. (La migración `102` corrige una ambigüedad de columna `id` en el `SELECT … INTO` que hacía abortar el RPC con "column reference id is ambiguous" → 0 invitables.)
  2. *Externos* — el admin pega emails sueltos (no registrados); se encolan con `user_id = NULL` (`email_queue.user_id` es nullable, el envío solo usa `to_email`). Categoría `invitacion_externa`.
  Ambas incluyen el **código de acceso** si la penca es privada, vía `admin_get_ten_comp_join_code(p_ten_comp)` (el `join_code` no se expone por SELECT).
- **Preferencia de novedades (migraciones `110`/`111`):** `profiles.wants_news` (BOOLEAN, default true / opt-out). El usuario la elige al registrarse (checkbox en `AuthPage`, viaja en `raw_user_meta_data.wants_news` → la lee `handle_new_user`) y la edita en su perfil (toggle "Novedades por email"). En `CorreosTab` **cada sección respeta la preferencia por defecto**: los destinatarios con `wants_news = false` salen deshabilitados con badge "Sin novedades" y no se pueden seleccionar. El helper `useRespectNews` + `RespectNewsToggle` dan al admin la opción de **desmarcar "Respetar la preferencia de novedades"** por sección para un correo importante que igual deba llegar a todos. Los miembros aprobados traen `wants_news` por el join de `fetchMembers`; los invitables por `admin_get_invitable_users` (mig. `111` la agrega al `RETURNS TABLE`). Los **externos** no registrados no tienen preferencia → siempre enviables (sin toggle).
- **Pendiente:** auto-disparo de "resultado cargado" al cargar un resultado (hoy es manual desde el tab).

### Migración de datos (post 19/07/2026)

ETL desde proyecto Supabase v1 al nuevo. Script Node/TS con dos conexiones. Los UUIDs de `auth.users` se preservan (pg_dump del schema auth con passwords). Validación: `recalculate_all()` en el nuevo sistema debe reproducir el leaderboard final de producción fila a fila.

Tenant de migración: **"Publico"** · Competencia: **"Mundial Futbol 2026"** · Ten-Comp: **"PencaLes 2026"** (público, archivado).

Ver plan completo: `docs/PLAN_MULTITENANT.md`
