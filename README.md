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

## Funcionalidades

- **Pencas públicas y privadas.** Las públicas se exploran y se juegan al instante; las privadas requieren un código de 8 letras. Quien no es miembro de una penca pública la ve en **modo visualización** (ranking y fixture) y puede unirse con un click.
- **Predicciones y scoring por penca.** Cada Ten-Comp tiene su propio scoring (editable, copiado de la competencia), su ranking y sus subgrupos. El resultado deportivo se carga una vez y se comparte; los puntos se calculan por penca.
- **Formatos de competencia.** Grupos + eliminatoria (Mundial), liga de tabla única (Apertura UY), liga por series (Intermedio UY) y eliminatoria de tabla única (Eliminatoria Sudamericana) sobre el mismo schema.
- **Clonado de competencias.** Duplica una competencia como template, reagenda fechas y permite renombrar equipos; crea automáticamente una penca pública en el tenant "Publico".
- **Correos por penca.** Tab "Correos" en el admin de cada penca: sin-predicciones, ranking, resultado de partido, recordatorio e **invitaciones** (a usuarios registrados de otras pencas del tenant o a externos por email). Emisor SMTP global, branding por tenant.
- **Roles.** Super-admin (plataforma), admin de tenant, cargador de resultados y usuario.
- **Limpieza de datos** (super-admin): borrado físico y transaccional de competencias y tenants.

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
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=

# Multi-tenant: 'true' habilita el modelo Tenant/Ten-Comp (rutas /pencas, /p/:slug)
VITE_V2_ENABLED=true

# Auth / CAPTCHA
VITE_TURNSTILE_SITE_KEY=

# Email (SMTP global de plataforma)
SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
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


## Backup de base de datos

Backup completo de la base PostgreSQL de Supabase con `pg_dump`. Ejecutar en PowerShell:

```powershell
$env:PGPASSWORD = '<password-de-la-base>'
cd 'C:\Program Files\PostgreSQL\17\bin\'
.\pg_dump.exe `
  --host=aws-1-sa-east-1.pooler.supabase.com `
  --port=5432 `
  --username=postgres.kxwwkdpxhcrfevauhpgy `
  --dbname=postgres `
  --no-owner --no-privileges `
  -f /datos/backup.sql
```