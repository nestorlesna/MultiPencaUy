# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**PencaLes 2026** — FIFA World Cup 2026 prediction pool web app. Users register, predict match results, earn points, and compete on a leaderboard. Deployed on Vercel (frontend) + Supabase (PostgreSQL backend, auth, storage).

Tournament data: 48 teams · 12 groups (A–L) · 104 matches · 16 stadiums · June 11 – July 19, 2026.

## Commands

```bash
npm run dev      # Vite dev server on port 5173
npm run build    # tsc && vite build
npm run lint     # eslint . --ext ts,tsx
npm run preview  # Preview production build
```

## Tech Stack

| Layer | Choice |
|-------|--------|
| Framework | React 18 + TypeScript |
| Build | Vite 5 |
| Styling | Tailwind CSS 3 + custom theme (dark, see below) |
| Icons | Lucide React |
| Routing | React Router v6 (nested Layout) |
| Data fetching | TanStack Query v5 |
| Backend | Supabase (PostgreSQL + Auth + Storage + Realtime) |
| Toasts | Sonner |
| Dates | date-fns with `es` locale |

## Design System

Dark theme, modern and minimalist. All values go in `tailwind.config.js`:

```js
colors: {
  background: '#0B0F1A',   // app background
  surface:    '#141925',   // cards, panels
  border:     '#1E2535',   // dividers, borders
  primary: {
    DEFAULT: '#10B981',    // emerald — main CTA, highlights
    hover:   '#059669',
  },
  accent: {
    DEFAULT: '#F59E0B',    // amber/gold — rankings, trophies
    hover:   '#D97706',
  },
  text: {
    primary:   '#F8FAFC',
    secondary: '#94A3B8',
    muted:     '#475569',
  },
}
```

Font: Inter. Spanish language throughout UI and route paths.

## Architecture

### Directory layout

```
src/
├── main.tsx
├── App.tsx               # BrowserRouter + Routes
├── index.css             # Tailwind globals
├── components/
│   ├── ui/               # Reusable: Modal, Badge, Button, Input, TeamFlag, etc.
│   ├── layout/           # Layout.tsx, BottomNav.tsx, Header.tsx
│   ├── admin/            # ResultForm
│   ├── groups/           # GroupTable
│   └── matches/          # MatchCard, PredictionModal
├── pages/
│   ├── FixturePage.tsx
│   ├── GruposPage.tsx / GrupoDetailPage.tsx / EquipoPage.tsx
│   ├── BracketPage.tsx       # /cuadro — visual knockout bracket
│   ├── RankingPage.tsx
│   ├── MasPuntosPage.tsx     # /mas-puntos — bonus predictions
│   ├── MisPrediccionesPage.tsx
│   ├── AyudaPage.tsx
│   ├── AuthPage.tsx / PerfilPage.tsx / NotFoundPage.tsx
│   └── admin/
│       ├── ResultadosPage.tsx
│       ├── PartidosAdminPage.tsx
│       ├── EquiposAdminPage.tsx
│       ├── TercerosPage.tsx
│       ├── UsuariosPage.tsx
│       ├── AuditoriaPage.tsx
│       └── ConfigPage.tsx
├── hooks/                # useAuth, usePredictions, useStandings, etc.
├── services/             # Supabase query functions (not hooks)
│   ├── matchService.ts
│   ├── predictionService.ts
│   ├── bonusService.ts       # bonus predictions + calculate_bonus_points RPC
│   ├── adminService.ts       # setMatchResult, calculateMatchPoints (calls bonus too)
│   ├── leaderboardService.ts
│   ├── auditService.ts
│   ├── teamService.ts
│   └── groupService.ts
├── lib/
│   └── supabase.ts       # Supabase client singleton
├── types/                # Shared TypeScript interfaces
└── utils/
    ├── constants.ts
    └── formatters.ts     # Date, score, duration formatters (es locale)
```

### Routing (Spanish paths)

```
/                     → redirect to /fixture
/fixture              → Full schedule, filterable by phase/group/date
/grupos               → All 12 groups; tabs "Grupos del Torneo" (official) / "Mis Grupos" (virtual standings from user predictions)
/grupos/:grupo        → Group detail + matches; ?vista=mias shows user's predicted standings/scores
/equipos/:id          → Team profile
/cuadro               → Visual knockout bracket (R32 → Final)
/mis-predicciones     → Logged-in user's predictions + points history
/mas-puntos           → Bonus predictions (podio, draws count, goal range, etc.)
/ranking              → Global leaderboard (match points + bonus points)
/perfil               → Edit profile + avatar
/ayuda                → Scoring rules + bonus rules with live examples
/admin/resultados     → Enter match results (admin only)
/admin/partidos       → Edit match data — datetime, teams, stadium (admin only)
/admin/equipos        → Edit team data — name, flag, abbreviation (admin only)
/admin/terceros       → Best-thirds ranking table (admin only)
/admin/usuarios       → Approve/deactivate users (admin only)
/admin/auditoria      → Prediction change log with filters (admin only)
/admin/config         → Scoring config (admin only)
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

### Auth & Authorization

- Supabase Auth (email/password)
- `profiles` table mirrors `auth.users` — created via trigger on signup
- `profiles.is_active` = false by default; admin must activate user before they can predict
- `profiles.is_admin` = false by default
- RLS policies: public read on fixture data; predictions are user-owned; admin writes via `is_admin` check
- Prediction lock: RLS uses server-side `now()` vs `match_datetime` — immune to client clock manipulation

### Key database tables

| Table | Purpose |
|-------|---------|
| `groups` | A–L, order 1–12 |
| `phases` | Group/R32/R16/QF/SF/3rd/Final with has_extra_time flag |
| `stadiums` | 16 venues with city, country, address, photo_urls[] |
| `teams` | 48 teams; is_confirmed=false + placeholder for 6 TBD slots |
| `matches` | 104 matches; home/away nullable; slot_label for TBD display (e.g. "1A", "W73") |
| `knockout_slot_rules` | Defines how knockout matchups are calculated (group_position / match_winner / best_third / match_loser) |
| `profiles` | Auth user profiles; is_active, is_admin flags |
| `predictions` | User predictions; UNIQUE(user_id, match_id); locked when match starts |
| `scoring_config` | Parametric points: exact_score, correct_winner, correct_draw, et_exact, pk_winner, knockout_bonus |
| `predictions_audit` | INSERT/UPDATE audit log for predictions (SECURITY DEFINER trigger) |
| `bonus_config` | Points per bonus type (podio_exacto, podio_presencia, empates_grupos, rango_goles, final_cero, top_scorer_team, top_group_goals) |
| `bonus_predictions` | One row per user; all 6 bonus answers stored as nullable columns |
| `bonus_points` | UNIQUE(user_id, bonus_type); updated by calculate_bonus_points() |
| `bonus_predictions_audit` | Audit log for bonus prediction changes |

**Views (calculated in SQL):**
- `group_standings` — PJ/PG/PE/PP/GF/GC/GD/Pts per team, ranked within group by FIFA criteria
- `best_third_ranking` — 12 third-place teams ranked for R32 qualification
- `leaderboard` — total points (predictions.points_earned + bonus_points.points_earned) + rank

### SQL files execution order

```
01_schema.sql          # base tables
02_auth_rls.sql        # RLS policies
03_views_functions.sql # views + calculate_match_points() + populate_knockout_matches()
04_seed.sql            # optional test data
05_storage.sql         # Storage buckets
06_audit.sql           # predictions_audit table + trigger
07_bonus.sql           # bonus tables + calculate_bonus_points() + updated leaderboard view
```

`00_reset_init.sql` — full reset + complete tournament data (groups, phases, stadiums, 48 teams, 104 matches, 64 knockout rules). Requires `nestor.lesna@gmail.com` in auth.users; that user becomes the admin.

### Prediction model for knockout matches

Group phase: predict `home_score` + `away_score` (90 min only).

Knockout phase: progressive UI —
1. User always predicts 90min score
2. If predicted 90min is a draw → show ET fields (additional goals in ET)
3. If ET also draw → show penalty winner selector

Points are awarded independently per layer (90min correct, ET correct, PK correct).

### Knockout bracket structure

Left half (feeds SF M101 → Final M104):
- R32: M73,M74,M75,M77 → R16: M89,M90 → QF: M97
- R32: M81,M82,M83,M84 → R16: M93,M94 → QF: M98

Right half (feeds SF M102 → Final M104):
- R32: M76,M78,M79,M80 → R16: M91,M92 → QF: M99
- R32: M85,M86,M87,M88 → R16: M95,M96 → QF: M100

Third place: M103 (losers of M101 and M102). Final: M104.

### Score calculation flow

1. Admin loads result via `ResultForm` → calls `setMatchResult()` + `calculateMatchPoints()` in `adminService.ts`
2. `calculateMatchPoints()` calls Supabase RPC `calculate_match_points(match_id)` which iterates all predictions for that match and awards points based on `scoring_config`
3. After that, `calculateMatchPoints()` also calls RPC `calculate_bonus_points()` — idempotent, checks conditions internally:
   - Group-stage bonuses (empates_grupos, top_group_goals): triggered when all 72 group matches are finished
   - Final bonuses (podio, rango_goles, final_cero, top_scorer_team): triggered when M103 and M104 are both finished

### Known gotcha: PostgREST reserved word `order`

The `phases` table has a column named `order` which conflicts with PostgREST's `order` query parameter. Never use `.eq('order', value)` — it will be interpreted as ORDER BY instead of a WHERE filter. Workaround (already implemented in `matchService.ts`): fetch all phases and filter client-side.

### Bonus predictions locking

Bonus predictions are locked when the tournament has started (any match is not `scheduled`). This is enforced client-side in `MasPuntosPage` via `isTournamentStarted()`. The DB does not enforce a hard lock, relying on the UI gate.
