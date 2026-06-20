# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Proyecto

**PencaLes 2.0** — Plataforma SaaS multi-tenant de pencas deportivas.
Plan completo de desarrollo y migración: [`docs/PLAN_MULTITENANT.md`](docs/PLAN_MULTITENANT.md)

**Estado actual:** Desarrollo de v2 (multi-tenant). La v1 (PencaLes 2026, Mundial FIFA) corre en producción hasta 19/07/2026; su schema SQL está en `supabase/legacy/` solo como referencia.

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
- **Reseteo de contraseña por admin:** endpoint `api/admin-reset-password.ts` (service role) setea una pass temporal autogenerada vía `auth.admin.updateUserById` y prende `profiles.must_change_password`. Autoriza a super-admin o al admin de un tenant donde el target es miembro. Botón "Pass" en el tab Miembros (`PencaAdminPage` → `resetUserPassword`). El gate en `Layout` bloquea la app con `ForcePasswordChange` mientras `must_change_password = true`; al setear la nueva pass el dueño apaga el flag (permitido por `profiles_update_own`). Migración `97`.

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

### Flujo de cálculo de puntos

1. Cargador (admin/loader de tenant) carga resultado → RPC `set_match_result(competition_id, match_id, ...)`
2. RPC `calculate_match_points(match_id)` itera **todos los Ten-Comps** de esa competencia y aplica el scoring propio de cada uno
3. RPC `calculate_bonus_points(competition_id)` — idempotente, corre por cada Ten-Comp con `bonus_enabled = true`
4. El resultado es un hecho deportivo compartido; los puntos son por Ten-Comp

### Known gotcha: columna `sort_order` (antes `order`)

En v2 la columna se renombró a `sort_order` para evitar el conflicto con el parámetro reservado `order` de PostgREST. Ya no es necesario el workaround de filtrado client-side que existía en `matchService.ts` de la v1.

### Bonus por Ten-Comp

Los tipos de bonus (podio, empates, rango de goles, etc.) se definen por competencia en `competition_bonus_types`. Al crear un Ten-Comp se copian a `bonus_config` si `bonus_enabled = true`. El tenant-admin puede editar los puntos pero no agregar tipos. Si `bonus_enabled = false`, el Ten-Comp no tiene sección de bonus.

### Correos (multi-tenant)

**Emisor de plataforma:** un único SMTP global (env vars `SMTP_HOST/PORT/USER/PASS/SECURE/FROM_NAME`) en `api/send-email.ts` (Vercel serverless + nodemailer). No hay SMTP por-tenant; lo único que varía por penca es el **branding**: el "from name" se deriva del nombre del tenant y las URLs/textos del cuerpo salen del Ten-Comp y su competencia (sin config extra en el tenant).

- **Alcance por penca:** el panel es el tab **"Correos"** en `PencaAdminPage` (`/p/:slug/admin`) — componente `src/components/admin/CorreosTab.tsx`. Lo gestiona el admin de la penca (tenant-admin incluido). Cada destinatario es un miembro **aprobado** de ese Ten-Comp.
- **Servicio:** `src/services/v2/emailService.ts` — todo scopeado por `tenCompId`; builders de HTML parametrizados por `EmailBrand`. Usa las RPCs `admin_get_user_details(p_ten_comp)` (emails + conteo de predicciones) y `admin_get_match_predictions(p_ten_comp, p_match_id)`, ambas guardadas por `is_ten_comp_admin`.
- **Cola `email_queue`** (en `01_schema.sql`): trae `tenant_id` + `ten_comp_id`; RLS `is_tenant_admin`. `api/send-email.ts` autoriza con super-admin **o** admin del tenant dueño del correo.
- **Tipos de correo:** `sin_predicciones`, `ranking`, `partido_M{n}` (resultado), `invitacion`, `recordatorio`. Envío masivo con pausa de 15 s entre cada uno.
- **Pendiente:** auto-disparo de "resultado cargado" al cargar un resultado (hoy es manual desde el tab).

### Migración de datos (post 19/07/2026)

ETL desde proyecto Supabase v1 al nuevo. Script Node/TS con dos conexiones. Los UUIDs de `auth.users` se preservan (pg_dump del schema auth con passwords). Validación: `recalculate_all()` en el nuevo sistema debe reproducir el leaderboard final de producción fila a fila.

Tenant de migración: **"Publico"** · Competencia: **"Mundial Futbol 2026"** · Ten-Comp: **"PencaLes 2026"** (público, archivado).

Ver plan completo: `docs/PLAN_MULTITENANT.md`
