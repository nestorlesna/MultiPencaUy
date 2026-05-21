# PencaLes 2026

Aplicación web de predicciones para la Copa Mundial de Fútbol FIFA 2026. Los usuarios registrados predicen resultados de partidos, acumulan puntos y compiten en un ranking global.

**Torneo:** 48 equipos · 12 grupos (A–L) · 104 partidos · 16 estadios · 11 jun – 19 jul 2026

---

## Funcionalidades

### Para usuarios
- **Fixture** — grilla completa de los 104 partidos, filtrable por fase/grupo/fecha
- **Grupos** — dos pestañas: **Grupos del Torneo** (posiciones oficiales en tiempo real con criterios FIFA: Pts → DG → GF) y **Mis Grupos** (posiciones virtuales calculadas con las apuestas del usuario en la fase de grupos). El detalle de cada grupo respeta la pestaña activa vía `?vista=mias`
- **Cuadro** — bracket visual del torneo eliminatorio (dieciseisavos → Final) con banderas y marcadores
- **Mis apuestas** — historial de predicciones y puntos ganados por partido; tab **Mi Cuadro** con el bracket eliminatorio personal
- **+ Puntos** — apuestas especiales antes del torneo (podio, empates, rango de goles, etc.) con resultado real y puntos ganados visibles por sección
- **Ranking** — tabla de líderes global con puntos totales (partidos + bonus)
- **Subgrupos** — agrupaciones privadas entre jugadores con ranking propio (cada usuario puede crear hasta 3)
- **Ayuda** — reglas detalladas con ejemplos dinámicos según la config activa

### Para administradores
- **Resultados** — carga de resultados con botones +/− para 90', tiempo extra y penales; al guardar recalcula puntos de predicciones, propaga ganadores al cuadro eliminatorio, recalcula +Puntos, y encola automáticamente un correo por cada usuario activo; botón **"Recalcular todo"** para reprocesar todos los partidos
- **Partidos** — edición de fecha/hora, equipos y estadio de cada partido
- **Equipos** — edición de nombre, abreviación y bandera de cada equipo
- **Terceros** — ranking de los 12 terceros de grupo para el armado del R32
- **Usuarios** — aprobación y activación/desactivación de usuarios
- **Auditoría** — historial de cambios en predicciones con filtros
- **Configuración** — puntajes parametrizables para todos los tipos de acierto y bonus
- **Correos** — gestión de cola de correos salientes: encolado manual por tipo (sin apuestas, grupos incompletos, ranking, partido), envío individual o masivo vía SMTP, vista previa de HTML, filtros y eliminación
- **Resultados Auto** — consulta de solo lectura de 3 APIs externas de fútbol (football-data.org, api-football.com, thesportsdb.com) para comparar resultados y explorar datos; no modifica nada en la penca

---

## Stack técnico

| Capa | Tecnología |
|------|-----------|
| Framework | React 18 + TypeScript |
| Build | Vite 5 |
| Estilos | Tailwind CSS 3 + tema dark personalizado |
| Iconos | Lucide React |
| Routing | React Router v6 |
| Data fetching | TanStack Query v5 |
| Backend | Supabase (PostgreSQL + Auth + Storage) |
| Toasts | Sonner |
| Fechas | date-fns (`es` locale) |
| Deploy | Vercel (frontend + funciones serverless) + Supabase (backend) |

---

## Setup local

### Requisitos
- Node.js 22+
- Cuenta en [Supabase](https://supabase.com)

### 1. Clonar e instalar

```bash
git clone https://github.com/nestorlesna/Penca2026uy.git
cd Penca2026uy
npm install
```

### 2. Variables de entorno

Crear `.env` en la raíz copiando `.env.example` y completando los valores. Las variables `VITE_*` son las mínimas para correr en desarrollo local:

```env
VITE_SUPABASE_URL=https://<tu-proyecto>.supabase.co
VITE_SUPABASE_ANON_KEY=<tu-anon-key>
VITE_TURNSTILE_SITE_KEY=<tu-site-key-de-cloudflare-turnstile>
```

Las demás variables (`SUPABASE_SERVICE_ROLE_KEY`, `SMTP_*`, claves de APIs externas) solo se necesitan para ejecutar las funciones serverless de Vercel en local. Ver sección **Despliegue** para cómo configurarlas en producción.

### 3. Inicializar base de datos

Ejecutar los scripts **en orden** desde el **SQL Editor de Supabase**:

```
supabase/01_schema.sql           # Tablas base
supabase/02_auth_rls.sql         # RLS policies
supabase/03_views_functions.sql  # Vistas, funciones PL/pgSQL y triggers
supabase/05_storage.sql          # Buckets de Storage
supabase/06_audit.sql            # Tabla de auditoría de predicciones
supabase/07_bonus.sql            # Tablas y función de apuestas especiales (+Puntos)
supabase/08_group_overrides.sql  # Overrides admin para posiciones y terceros
supabase/09_combinaciones.sql    # 495 combinaciones FIFA de mejores terceros
supabase/10_recalculate_all.sql  # Función de recálculo global
supabase/11_loader_role.sql      # Rol de cargador de resultados
supabase/12_subgrupos.sql        # Tablas, RLS, funciones y vistas de subgrupos
supabase/13_admin_functions.sql  # Funciones auxiliares para el panel de admin
supabase/00_reset_init.sql       # Carga datos del torneo (grupos, equipos, partidos, etc.)
```

> `04_seed.sql` es opcional — contiene datos de prueba.

> **Importante:** `00_reset_init.sql` requiere que exista un usuario con email `nestor.lesna@gmail.com` en `auth.users` antes de ejecutarse. Ese usuario quedará como administrador.

**Para resets posteriores** (borrar datos y recargar el torneo sin tocar el schema):

```
supabase/00_reset_init.sql
```

### 4. Ejecutar en desarrollo

```bash
npm run dev      # http://localhost:5173
npm run build    # Build de producción
npm run lint     # ESLint
npm run preview  # Preview del build
```

---

## Sistema de puntos

### Por partido

| Situación | Grupos | Eliminatorias |
|-----------|--------|---------------|
| Marcador exacto | 5 pts | 5 + 2 bonus = 7 pts |
| Ganador correcto | 2 pts | 2 pts |
| Empate correcto | 2 pts | — |
| ET resultado exacto | — | 3 pts |
| Ganador en penales | — | 2 pts |

*(valores configurables desde Admin → Configuración)*

### Apuestas especiales (+ Puntos)

| Apuesta | Puntos | Se calcula cuando... |
|---------|--------|----------------------|
| Podio exacto (posición correcta) | 10 pts c/u | M103 y M104 terminados |
| Equipo en top 4 pero posición incorrecta | 5 pts c/u | M103 y M104 terminados |
| Cantidad exacta de empates en grupos | 15 pts | 72 partidos de grupos terminados |
| Rango de goles del torneo | 20 pts | M103 y M104 terminados |
| ¿0-0 en la Final? | 25 pts | M103 y M104 terminados |
| Equipo con más goles | 20 pts | M103 y M104 terminados |
| Grupo con más goles | 13 pts | 72 partidos de grupos terminados |

*(todos configurables desde Admin → Configuración)*

---

## Flujo de cálculo de puntos

```
Admin carga resultado (Admin → Resultados)
  └─ setMatchResult()              → actualiza scores + status='finished' en BD
       └─ trigger auto_set_match_winner  → calcula winner_team_id automáticamente
  └─ calculateMatchPoints()        → RPC: calcula puntos de todas las predicciones del partido
  └─ populate_knockout_matches()   → RPC: propaga ganadores al cuadro eliminatorio (idempotente)
  └─ calculate_bonus_points()      → RPC: recalcula +Puntos si se cumplen condiciones (idempotente)
  └─ enqueueMatchResultEmails()    → encola 1 correo por cada usuario activo en email_queue
                                     (omite usuarios que ya tienen correo para ese partido)
```

Si por algún motivo los puntos no se actualizaron, el botón **"Recalcular todo"** en Admin → Resultados ejecuta `recalculate_all()` que procesa todos los partidos finalizados de una vez.

---

## Sistema de correos (Admin → Correos)

Los correos se gestionan mediante una cola en Supabase (`email_queue`) y se envían bajo demanda desde el panel de admin. El envío real se hace vía la función serverless `api/send-email.ts` usando SMTP.

### Cola de correos (`email_queue`)

Cada fila representa un correo pendiente de enviar con los campos:
`to_email`, `to_name`, `subject`, `body_html`, `category`, `user_id`, `status` (`pending` / `sent` / `failed`), `error_message`, `sent_at`.

### Tipos de correo y cuándo se generan

| Categoría | Descripción | Generación |
|-----------|-------------|------------|
| `partido_M{N}` | Resultados del partido N con tabla de predicciones de todos y top 5 ranking | **Automática** al cargar resultado en Admin → Resultados; también disponible en Admin → Correos → "Por partido" |
| `no_apuestas` | Recordatorio a usuarios sin ninguna apuesta cargada | Manual desde Admin → Correos |
| `grupos_incompletos` | Recordatorio a usuarios con menos predicciones que partidos de grupo | Manual desde Admin → Correos |
| `ranking` | Ranking actualizado con posición personalizada de cada usuario | Manual desde Admin → Correos |

### Flujo de envío

1. Los correos llegan a la cola con `status = 'pending'`
2. El admin los revisa en Admin → Correos (filtros por estado, categoría, búsqueda)
3. Presiona **Enviar** (individual o masivo)
4. El frontend llama a `POST /api/send-email` con el `email_id` y el JWT de sesión
5. La función serverless verifica que sea admin, obtiene el correo de la cola, envía por SMTP y actualiza el estado a `sent` o `failed`

### Variables de entorno requeridas para correos

Configurar en Vercel → Settings → Environment Variables:

```
SUPABASE_URL              # URL del proyecto Supabase
SUPABASE_SERVICE_ROLE_KEY # Service role key (acceso total, solo serverless)
SMTP_HOST                 # Servidor SMTP (ej: smtp.gmail.com)
SMTP_PORT                 # Puerto (587 para TLS, 465 para SSL)
SMTP_SECURE               # false para 587/TLS, true para 465/SSL
SMTP_USER                 # Dirección de email remitente
SMTP_PASS                 # Contraseña SMTP (para Gmail: "Contraseña de aplicación")
SMTP_FROM_NAME            # Nombre del remitente (ej: PencaLes 2026)
```

---

## APIs externas — Resultados Automáticos (Admin → Resultados Auto)

Pantalla de **solo lectura** para consultar datos de partidos desde 3 APIs externas. No modifica ningún dato de la penca. Útil para comparar resultados y explorar disponibilidad de datos antes de integrarlos al flujo real.

Cada API tiene su propia función serverless que actúa como proxy seguro: las claves nunca llegan al navegador.

| API | Proxy serverless | Descripción |
|-----|-----------------|-------------|
| [football-data.org](https://www.football-data.org) | `api/football-data.ts` | REST v4 · Competiciones, partidos, posiciones, equipos |
| [api-football.com](https://www.api-football.com) | `api/api-football.ts` | REST v3 vía api-sports.io · Fixtures, estadísticas, jugadores |
| [thesportsdb.com](https://www.thesportsdb.com) | `api/sportsdb.ts` | REST v1 · Eventos, equipos, ligas, imágenes |

Cada sección de la pantalla tiene consultas rápidas prearmadas (info de la competición, partidos por estado/fecha, equipos) y un campo libre para escribir cualquier endpoint con parámetros.

### Variables de entorno requeridas

Configurar en Vercel → Settings → Environment Variables:

```
FOOTBALL_DATA_API_KEY  # Key de football-data.org (registro gratuito en el sitio)
API_FOOTBALL_KEY       # Key de api-football.com / api-sports.io (dashboard del sitio)
SPORTSDB_API_KEY       # Key de thesportsdb.com ("3" para el plan gratuito)
```

---

## Estructura del proyecto

```
api/                           # Funciones serverless de Vercel
├── send-email.ts              # Envío de correos via SMTP desde la cola email_queue
├── football-data.ts           # Proxy hacia api.football-data.org/v4
├── api-football.ts            # Proxy hacia v3.football.api-sports.io
└── sportsdb.ts                # Proxy hacia thesportsdb.com/api/v1/json

src/
├── App.tsx
├── components/
│   ├── layout/                # Header, BottomNav, Layout
│   ├── ui/                    # Modal, Badge, TeamFlag, etc.
│   ├── admin/                 # ResultForm
│   ├── groups/                # GroupTable
│   └── matches/               # MatchCard, PredictionModal
├── pages/
│   ├── FixturePage.tsx
│   ├── GruposPage.tsx / GrupoDetailPage.tsx / EquipoPage.tsx
│   ├── BracketPage.tsx        # /cuadro
│   ├── RankingPage.tsx
│   ├── MasPuntosPage.tsx      # /mas-puntos
│   ├── MisPrediccionesPage.tsx
│   ├── SubgruposPage.tsx      # /subgrupos
│   ├── SubgrupoDetailPage.tsx # /subgrupos/:id
│   ├── AyudaPage.tsx
│   └── admin/
│       ├── ResultadosPage.tsx
│       ├── PartidosAdminPage.tsx
│       ├── EquiposAdminPage.tsx
│       ├── TercerosPage.tsx
│       ├── UsuariosPage.tsx
│       ├── AuditoriaPage.tsx
│       ├── ConfigPage.tsx
│       ├── CorreosPage.tsx    # /admin/correos — gestión de cola de correos
│       └── ResultAutoPage.tsx # /admin/resultauto — consulta de APIs externas
├── services/
│   ├── matchService.ts
│   ├── predictionService.ts
│   ├── bonusService.ts
│   ├── adminService.ts
│   ├── emailService.ts        # Cola de correos: enqueue, send, builders HTML, enqueueMatchResultEmails()
│   ├── combinacionesService.ts
│   ├── leaderboardService.ts
│   ├── auditService.ts
│   ├── teamService.ts
│   ├── groupService.ts
│   ├── profileService.ts
│   └── subgrupoService.ts
├── hooks/                     # useAuth, usePredictions, useStandings, etc.
├── types/                     # Interfaces TypeScript
└── lib/supabase.ts            # Cliente Supabase singleton

supabase/
├── 00_reset_init.sql          # Reset de datos + carga completa del torneo
├── 01_schema.sql              # Tablas base
├── 02_auth_rls.sql            # RLS policies
├── 03_views_functions.sql     # group_standings, best_third_ranking, leaderboard,
│                              #   calculate_match_points(), populate_knockout_matches(),
│                              #   trigger auto_set_match_winner
├── 04_seed.sql                # (opcional) datos de prueba
├── 05_storage.sql             # Buckets Storage
├── 06_audit.sql               # predictions_audit + trigger
├── 07_bonus.sql               # bonus_config, bonus_predictions, bonus_points,
│                              #   calculate_bonus_points(), leaderboard view actualizado
├── 08_group_overrides.sql     # group_position_overrides, best_third_rank_overrides,
│                              #   vistas group_standings/best_third_ranking actualizadas
├── 09_combinaciones.sql       # 495 combinaciones FIFA de mejores terceros
├── 10_recalculate_all.sql     # recalculate_all() — recálculo global idempotente
├── 11_loader_role.sql         # Rol de cargador de resultados
├── 12_subgrupos.sql           # subgrupos, subgrupo_members, RLS, RPC, triggers, vistas
└── 13_admin_functions.sql     # admin_get_user_details(), admin_get_match_predictions(), etc.
```

---

## Despliegue

### Vercel

1. Conectar el repositorio en [vercel.com](https://vercel.com)
2. Framework preset: **Vite**
3. Agregar todas las variables de entorno en **Settings → Environment Variables**:

**Variables frontend (todos los entornos):**
```
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
VITE_TURNSTILE_SITE_KEY
```

**Variables serverless (marcar como "Server" o todos los entornos):**
```
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
SMTP_HOST
SMTP_PORT
SMTP_SECURE
SMTP_USER
SMTP_PASS
SMTP_FROM_NAME
FOOTBALL_DATA_API_KEY
API_FOOTBALL_KEY
SPORTSDB_API_KEY
```

Ver `.env.example` para descripción detallada de cada variable y cómo obtenerla.

### Supabase
- Ejecutar los scripts SQL en orden (ver sección Setup)
- Configurar buckets de Storage: `avatars` y `flags` (públicos)
- Activar Auth providers: Email/Password y Google (ver sección siguiente)

### Configurar Login con Google (OAuth)

#### 1. Google Cloud Console

1. Ir a [console.cloud.google.com](https://console.cloud.google.com) → **APIs & Services → Credentials**
2. Crear credencial: **OAuth 2.0 Client ID** → tipo **Web application**
3. En **Authorized redirect URIs**, agregar la URL de callback de Supabase:
   ```
   https://<tu-proyecto>.supabase.co/auth/v1/callback
   ```
4. Copiar el **Client ID** y **Client Secret** generados

#### 2. Supabase Dashboard

1. Ir a **Authentication → Providers → Google**
2. Habilitar el proveedor
3. Pegar el **Client ID** y **Client Secret** obtenidos en el paso anterior
4. Guardar

> **Importante:** El Client ID y Client Secret son credenciales privadas. Nunca deben quedar en el código fuente ni en el README. Guardarlos únicamente en el dashboard de Supabase.

#### Datos de la configuración actual

| Campo | Valor |
|-------|-------|
| Supabase Redirect URL | `https://twdruhhhnsbrpyzlfxmg.supabase.co/auth/v1/callback` |
| Client ID | Configurado en Supabase Dashboard |
| Client Secret | Configurado en Supabase Dashboard (nunca exponer) |

> Si necesitás regenerar las credenciales: Google Cloud Console → APIs & Services → Credentials → seleccionar el OAuth client → Edit → Regenerate secret. Luego actualizar en Supabase Dashboard.

#### Comportamiento en la app

- El botón **"Continuar con Google"** aparece en los tabs Ingresar y Registrarse.
- Al autenticarse con Google por primera vez, el trigger de Supabase crea automáticamente el perfil en la tabla `profiles` con `is_active = true`.
- Los usuarios quedan activos por defecto y pueden predecir de inmediato. El administrador puede desactivarlos desde Admin → Usuarios si es necesario.

---

## Aplicación Android (Capacitor)

La app móvil se genera con Capacitor, que empaqueta el build web en una app nativa Android.

### Requisitos
- **Android Studio** ([descargar](https://developer.android.com/studio))
- **JDK 17+** (viene incluido con Android Studio)
- **Node.js 22+** (requerido por Capacitor 8)

### Primer setup

```bash
# 1. Instalar dependencias (si no están instaladas)
npm install

# 2. Build del proyecto web + sync con Capacitor
npm run cap:sync
```

### Generar APK para instalar

#### Opción A: Desde la terminal (rápido)

```bash
# Build + sync
npm run cap:sync

# Generar APK debug directamente
cd android
./gradlew assembleDebug
# En Windows: gradlew.bat assembleDebug
```

El APK se genera en `android/app/build/outputs/apk/debug/app-debug.apk`. Se puede instalar directamente en cualquier dispositivo Android (habilitar "Orígenes desconocidos" en ajustes).

#### Opción B: Desde Android Studio (recomendado)

1. Abrir Android Studio → **File → Open** → seleccionar la carpeta `android/`
2. Esperar a que Gradle sincronice el proyecto
3. Conectar un dispositivo Android por USB (con depuración USB activada) o usar un emulador
4. Click en **Run** (▶) o `Shift + F10`

Esto instala la app directamente en el dispositivo/emulador. Para generar un APK manualmente:

**Build → Build Bundle(s) / APK(s) → Build APK(s)**

El APK queda en `android/app/build/outputs/apk/debug/`.

### Generar APK de producción (firmado)

Para distribuir la app fuera de Play Store:

1. Generar un keystore:
```bash
keytool -genkey -v -keystore pencales-release.keystore -alias pencales -keyalg RSA -keysize 2048 -validity 10000
```

2. Crear `android/app/keystore.properties`:
```properties
storePassword=<tu-password>
keyPassword=<tu-password>
keyAlias=pencales
storeFile=../pencales-release.keystore
```

3. En Android Studio: **Build → Generate Signed Bundle / APK** → seleccionar el keystore → elegir **APK** → **Build**

El APK firmado queda en `android/app/release/`.

### Sincronizar cambios del código web

Cada vez que modifiques el código de la app web:

```bash
npm run cap:sync    # Build + copia los archivos a Android
```

O si ya hiciste build manualmente:

```bash
npx cap copy        # Solo copia archivos sin rebuild
npx cap sync        # Copy + actualiza plugins nativos
```

### Actualizar el logo/icono

El logo fuente está en `resources/icon.svg`. Para regenerar todos los iconos y splash screens:

```bash
npx capacitor-assets generate
npx cap sync
```

### Scripts npm disponibles

| Comando | Descripción |
|---------|-------------|
| `npm run dev` | Servidor de desarrollo web |
| `npm run build` | Build de producción web |
| `npm run cap:sync` | Build web + sync con Capacitor |
| `npm run cap:android` | Build + sync + abre Android Studio |
| `npm run cap:ios` | Build + sync + abre Xcode (solo macOS) |

---

## Distribución de actualizaciones (sin Play Store)

La app verifica automáticamente si hay una versión nueva al iniciar. Si la hay, muestra un modal con un botón para descargar el APK directamente desde GitHub Releases.

El chequeo compara el `versionCode` del APK instalado con el valor en [`version.json`](./version.json) (en la raíz del repo, servido vía `raw.githubusercontent.com`).

### Pasos para publicar una nueva versión

**1. Actualizar el número de versión en el código**

Editar `android/app/build.gradle`:

```groovy
versionCode 2          // ← incrementar siempre (entero)
versionName "1.1.0"    // ← string visible para el usuario
```

**2. Actualizar `version.json`**

Editar la raíz del repo con los nuevos datos:

```json
{
  "version_code": 2,
  "version_name": "1.1.0",
  "apk_url": "https://github.com/nestorlesna/Penca2026uy/releases/download/v1.1.0/Penca2026uy.apk",
  "release_notes": "Descripción de los cambios de esta versión.",
  "force_update": false
}
```

> Cambiar `force_update` a `true` si la versión es obligatoria (el modal no tendrá botón de cerrar).

**3. Generar el APK firmado**

Primero sincronizar los cambios del build web con el proyecto Android:

```bash
npm run cap:sync
```

Luego en **Android Studio**:

1. **Build → Build Bundle(s) / APK(s) → Build APK(s)**
2. Esperar que termine el build
3. El APK queda en `android/app/build/outputs/apk/debug/Penca2026uy.apk`

**4. Hacer commit y push**

```bash
git add android/app/build.gradle version.json
git commit -m "chore: bump version to v1.1.0"
git push
```

**5. Crear el Release en GitHub**

1. Ir a [github.com/nestorlesna/Penca2026uy/releases/new](https://github.com/nestorlesna/Penca2026uy/releases/new)
2. Tag: `v1.1.0`
3. Título: `PencaLes 2026 v1.1.0`
4. Subir el APK como asset (arrastrar el archivo con nombre Penca2026uy.apk)
5. Click en **Publish release**

A partir de ese momento, los usuarios con la versión anterior verán el modal de actualización al abrir la app.

---

## Licencia

Proyecto privado · Todos los derechos reservados · 2025-2026

---

## Backup de base de datos

Backup completo de la base PostgreSQL de Supabase con `pg_dump`. Ejecutar en PowerShell:

```powershell
$env:PGPASSWORD = '<password-de-la-base>'
.\pg_dump.exe `
  --host=aws-1-us-east-2.pooler.supabase.com `
  --port=5432 `
  --username=postgres.twdruhhhnsbrpyzlfxmg `
  --dbname=postgres `
  --no-owner --no-privileges `
  -f backup.sql
```

> **Importante:** nunca dejar la contraseña real en el README ni en el código. Obtenerla desde Supabase → Project Settings → Database. El archivo `.sql` resultante contiene datos de usuarios — no commitearlo al repo.
