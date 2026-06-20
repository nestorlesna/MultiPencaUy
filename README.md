# PencaLes 2.0

Plataforma SaaS multi-tenant de pencas deportivas. Empresas (tenants) crean y gestionan sus propias pencas (Ten-Comps) sobre competencias deportivas compartidas; los usuarios predicen resultados, acumulan puntos y compiten en rankings por penca.

**Stack:** React 19 + TypeScript · Vite 8 · Tailwind CSS 3 · TanStack Query v5 · React Router 7 · Supabase (PostgreSQL + Auth + Storage) · Vercel · Capacitor 8 (Android / web)

---

## Modelo conceptual

```
Tenant (empresa) → Ten-Comp (instancia) → Usuario
                       ↑
               Competencia (catálogo)
```

- **Tenant:** empresa que contrata el servicio. Tiene admins y cargadores propios.
- **Competencia:** catálogo deportivo global (Mundial, Copa América…). Partidos y resultados se cargan una sola vez y son compartidos.
- **Ten-Comp:** una competencia instanciada dentro de un tenant. Aquí viven las predicciones, el ranking, el scoring propio y los subgrupos. Puede ser pública o privada (código de 8 letras).

Ver plan completo: [`docs/PLAN_MULTITENANT.md`](docs/PLAN_MULTITENANT.md)

---

## Comandos

```bash
npm run dev        # Vite dev server — puerto 5173
npm run build      # tsc + vite build
npm run lint       # ESLint
npm run preview    # Preview del build de producción
npm run cap:sync   # Sync Capacitor (requiere build previo)
```

## Estructura del repo

```
src/
├── components/     # UI, layout, admin, matches, groups
├── hooks/          # useAuth, useTenComp, useMatches…
├── pages/          # Páginas por ruta
├── services/       # Acceso a datos (Supabase) — siempre reciben scope explícito
├── types/          # Interfaces TypeScript
└── utils/          # Formatters, constantes, virtualBracket

supabase/
├── legacy/         # Schema v1 (PencaLes 2026) — solo referencia para migración
├── migrations/     # Nuevas migraciones v2 (multi-tenant) + seeds de competencias públicas
└── email-templates/ # Plantillas HTML de email (Auth)

docs/
├── PLAN_MULTITENANT.md     # Plan de desarrollo y migración v2
├── MIGRACION_V1_A_V2.md    # Guía paso a paso del ETL v1 → v2
└── descarga_apk.md         # Flujo de distribución APK
```

> Las migraciones `9x_seed_*.sql` cargan competencias públicas de ejemplo bajo el tenant
> **"Publico"** (Apertura UY 2026 — liga de tabla única; Intermedio UY 2026 — liga por
> series). Son idempotentes (`ON CONFLICT DO NOTHING`) y se aplican desde el SQL Editor.

## Variables de entorno

```bash
# Supabase
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Auth / CAPTCHA
VITE_TURNSTILE_SITE_KEY=

# Email (SMTP)
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM_NAME=PencaLes 2.0

# APIs externas de fútbol (resultados automáticos — opcional)
FOOTBALL_DATA_API_KEY=
API_FOOTBALL_KEY=
```

Ver `.env.example` para el listado completo.

## Distribución móvil

Sin publicación en stores. Distribución vía web + APK directo desde la página `/descargar`.
El workflow `.github/workflows/release-apk.yml` compila y firma el APK automáticamente al hacer push de un tag `v*`.

## Estado del proyecto

- **v1 (PencaLes 2026):** en producción hasta 19/07/2026 (Mundial FIFA). Schema legacy en `supabase/legacy/`.
- **v2 (PencaLes 2.0):** en desarrollo. Migración de datos post-Mundial.
