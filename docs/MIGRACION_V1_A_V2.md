# Migración PencaLes 2026 (v1) → PencaLes 2.0 (v2)

> **⚠️ HISTÓRICO / NO EJECUTADO.** Este documento planteaba un ETL hacia un proyecto Supabase
> **nuevo**. La migración real (21/07/2026) se hizo **in-place** sobre el proyecto de prod
> existente — ver [`docs/MIGRA_PENCA_MULTIP.md`](MIGRA_PENCA_MULTIP.md), que es la que se
> ejecutó de verdad. Se deja este archivo solo como referencia de la estrategia descartada.

> **Cuándo:** después del 19/07/2026, con el Mundial terminado y la penca v1 congelada.
> **Quién:** operador con acceso de owner a ambos proyectos Supabase.
> **Duración estimada:** 1–2 horas + validación.
> **Resultado:** todos los datos de v1 quedan bajo
> Tenant **"Publico"** → Competencia **"Mundial Futbol 2026"** → Ten-Comp **"PencaLes 2026"**.

Este documento es autocontenido y pensado para ejecutarse meses después de escrito.
Asume cero memoria del contexto: seguí los pasos en orden.

---

## 0. Principios y red de seguridad

- **El proyecto v1 NO se toca.** Solo se lee (export). Si algo falla, se descarta el proyecto
  nuevo y se reintenta. No hay ventana de riesgo para los datos de producción.
- **Se preservan los UUID** de `auth.users` y de todas las entidades. Por eso los usuarios
  conservan email + contraseña (no se re-registran) y las foreign keys migran sin remapeo.
- **Validación dura:** al final, `recalculate_all()` en v2 debe reproducir el leaderboard
  final de v1 **fila a fila**. Si no da idéntico, hay un bug → no se lanza hasta resolverlo.

---

## 1. Herramientas necesarias

| Herramienta | Para qué | Notas |
|-------------|----------|-------|
| `psql` | Ejecutar SQL y restores | v16+ recomendado |
| `pg_dump` | Exportar v1 | **Debe ser ≥ la versión del servidor Postgres de Supabase.** Verificá en el dashboard de v1 (Settings → Infrastructure). |
| Acceso al SQL Editor de Supabase | Aplicar migraciones | Dashboard de cada proyecto |
| Las cadenas de conexión de **ambos** proyectos | Export/import | Dashboard → Settings → Database → Connection string (usar el **Session pooler** o la conexión directa con la contraseña de la DB) |

> En estos comandos:
> - `V1_DB_URL` = connection string del proyecto **viejo** (PencaLes 2026).
> - `V2_DB_URL` = connection string del proyecto **nuevo** (PencaLes 2.0).
> Tienen la forma `postgresql://postgres.[ref]:[password]@[host]:5432/postgres`.

---

## 2. Crear el proyecto Supabase nuevo y aplicar el esquema

1. Crear proyecto nuevo en Supabase. **Región sugerida: `sa-east-1` (São Paulo)** por latencia desde Uruguay.
2. En **Authentication → Providers**: habilitar Email (password). Configurar las plantillas de
   email con los HTML de `supabase/email-templates/` (quitar branding viejo si quedara).
3. Aplicar el esquema v2 en orden, desde el **SQL Editor** (o con `psql`), copiando el contenido de:
   ```
   supabase/migrations/01_schema.sql
   supabase/migrations/02_rls.sql
   supabase/migrations/03_functions_views.sql
   ```
   Con `psql`:
   ```bash
   psql "$V2_DB_URL" -f supabase/migrations/01_schema.sql
   psql "$V2_DB_URL" -f supabase/migrations/02_rls.sql
   psql "$V2_DB_URL" -f supabase/migrations/03_functions_views.sql
   ```

> **Importante — trigger de signup.** El esquema crea el trigger `on_auth_user_created` que genera
> un `profiles` automáticamente por cada alta en `auth.users`. Para que el import de usuarios del
> paso 4 no cree perfiles con datos por defecto, **deshabilitá el trigger antes de importar auth**:
> ```bash
> psql "$V2_DB_URL" -c "ALTER TABLE auth.users DISABLE TRIGGER on_auth_user_created;"
> ```
> Se reactiva en el paso 6.

---

## 3. Exportar la base v1

Trabajá en una carpeta limpia (ej: `migracion/`).

**3a. Usuarios y credenciales (schema `auth`)** — solo las tablas necesarias, data-only:
```bash
pg_dump "$V1_DB_URL" --data-only --no-owner --no-privileges \
  -t auth.users -t auth.identities \
  -f auth_v1.sql
```

**3b. Datos de la aplicación (schema `public`)** — estructura + datos:
```bash
pg_dump "$V1_DB_URL" --no-owner --no-privileges \
  --schema=public \
  -f public_v1.sql
```

> Si `pg_dump` se queja de versión, usá el binario que viene con la versión de Postgres del
> servidor (o un contenedor `postgres:16`). No continúes con una versión menor.

---

## 4. Importar `auth.users` en el proyecto nuevo

Con el trigger de signup ya deshabilitado (paso 2):
```bash
psql "$V2_DB_URL" -f auth_v1.sql
```

Verificá que la cantidad coincida:
```bash
psql "$V1_DB_URL" -c "SELECT count(*) FROM auth.users;"
psql "$V2_DB_URL" -c "SELECT count(*) FROM auth.users;"
```
Deben dar el mismo número. Los usuarios conservan `id`, email y `encrypted_password` (bcrypt),
por lo que su contraseña sigue funcionando.

> **Usuarios con login social (Google).** `auth.identities` viaja en el mismo dump. Al iniciar
> sesión, Supabase re-vincula por email. Si en v1 no hubo OAuth, ignorá esta nota.

---

## 5. Cargar los datos v1 bajo el schema `legacy` del proyecto nuevo

El dump `public_v1.sql` referencia el schema `public`. Lo redirigimos a un schema `legacy`
para que conviva con el esquema v2 (que ocupa `public`).

```bash
# Crear el schema destino
psql "$V2_DB_URL" -c "CREATE SCHEMA IF NOT EXISTS legacy;"

# Restaurar el dump dentro de 'legacy' fijando el search_path.
# (El dump no recrea el schema public; sus objetos caen en 'legacy' por el search_path.)
psql "$V2_DB_URL" -v ON_ERROR_STOP=0 \
  -c "SET search_path TO legacy;" \
  -f public_v1.sql
```

> **Si el dump trae prefijos `public.` explícitos** y los objetos terminan en `public` en vez de
> `legacy`, usá esta variante: editá `public_v1.sql` reemplazando `public.` por `legacy.` y
> `SCHEMA public` por `SCHEMA legacy` antes de restaurar. En Windows PowerShell:
> ```powershell
> (Get-Content public_v1.sql -Raw) `
>   -replace 'public\.', 'legacy.' -replace 'SCHEMA public', 'SCHEMA legacy' `
>   | Set-Content public_v1_legacy.sql -Encoding utf8
> psql "$V2_DB_URL" -f public_v1_legacy.sql
> ```

Verificá que `legacy` tenga las tablas:
```bash
psql "$V2_DB_URL" -c "SELECT count(*) FROM legacy.predictions;"
psql "$V2_DB_URL" -c "SELECT count(*) FROM legacy.matches;"
```

> Las foreign keys de `legacy.predictions.user_id` apuntan a `auth.users` (ya importados en el
> paso 4), así que el restore no falla por usuarios faltantes.

---

## 6. Ejecutar la migración

```bash
psql "$V2_DB_URL" -f supabase/migrations/90_migrate_from_v1.sql
```

Reactivar el trigger de signup (para los registros futuros en producción):
```bash
psql "$V2_DB_URL" -c "ALTER TABLE auth.users ENABLE TRIGGER on_auth_user_created;"
```

---

## 7. Validación (paso crítico — no saltear)

**7a. Conteos v1 vs v2** (deben coincidir):
```sql
-- Correr en V2. Compará cada par.
SELECT
  (SELECT count(*) FROM legacy.profiles)            AS v1_profiles,
  (SELECT count(*) FROM profiles)                   AS v2_profiles,
  (SELECT count(*) FROM legacy.predictions)         AS v1_preds,
  (SELECT count(*) FROM predictions)                AS v2_preds,
  (SELECT count(*) FROM legacy.matches)             AS v1_matches,   -- esperado 104
  (SELECT count(*) FROM matches)                    AS v2_matches,
  (SELECT count(*) FROM legacy.bonus_predictions)   AS v1_bonus,
  (SELECT count(*) FROM bonus_predictions)          AS v2_bonus;
```

**7b. Recalcular y comparar el leaderboard fila a fila.**
```sql
-- Recalcular puntos en v2 (mismo motor, scoring migrado).
SELECT recalculate_all('22222222-2222-4222-8222-222222222222');

-- Diferencias entre el leaderboard v1 y el v2 del Ten-Comp PencaLes 2026.
-- Debe devolver 0 filas.
WITH v1 AS (
  SELECT user_id, total_points, rank FROM legacy.leaderboard
),
v2 AS (
  SELECT user_id, total_points, rank
  FROM leaderboard WHERE ten_comp_id = '33333333-3333-4333-8333-333333333333'
)
SELECT v1.user_id, v1.total_points AS v1_pts, v2.total_points AS v2_pts,
       v1.rank AS v1_rank, v2.rank AS v2_rank
FROM v1 FULL JOIN v2 USING (user_id)
WHERE v1.total_points IS DISTINCT FROM v2.total_points
   OR v1.rank IS DISTINCT FROM v2.rank;
```
> Si esta consulta devuelve filas, **hay una discrepancia** entre v1 y v2. Causas típicas:
> diferencia en el scoring migrado, un bonus no replicado, o un partido sin recalcular.
> Resolver antes de continuar. Mientras no dé 0 filas, **no se lanza**.

**7c. Spot-check manual:** iniciá sesión en la app v2 con 2–3 cuentas reales y verificá que se
vean sus predicciones, su historial de puntos y su posición en el ranking.

---

## 8. Migrar avatares (Storage)

Los avatares viven en el bucket `avatars` (paths `{user_id}/...`). Como el dominio del proyecto
cambia, hay que copiar los archivos y reescribir las URLs.

**8a. Copiar archivos** (script Node con `@supabase/supabase-js`, usando la service-role key de
cada proyecto): listar el bucket `avatars` de v1 → descargar → subir al bucket `avatars` de v2
con el mismo path. (Si el volumen es chico, también sirve hacerlo a mano desde el dashboard.)

**8b. Reescribir las URLs** en `profiles.avatar_url` (cambia el subdominio del proyecto):
```sql
UPDATE profiles
SET avatar_url = replace(avatar_url, '<REF_VIEJO>.supabase.co', '<REF_NUEVO>.supabase.co')
WHERE avatar_url LIKE '%<REF_VIEJO>.supabase.co%';
```
Reemplazá `<REF_VIEJO>` / `<REF_NUEVO>` por los project refs de cada Supabase.

---

## 9. Configuración de plataforma (Supabase + Vercel)

**Supabase (proyecto nuevo):**
- **Authentication → URL Configuration:** Site URL + Redirect URLs del dominio nuevo.
- **Authentication → Email Templates:** cargar `resetpass.html` y `verificar.html`.
- Confirmar que `on_auth_user_created` quedó **habilitado** (paso 6).
- Activar backups / PITR si el plan lo permite.

**Vercel (proyecto nuevo, separado del de v1):**
- Variables de entorno (Settings → Environment Variables o `vercel env`):
  - `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (proyecto nuevo)
  - `SUPABASE_SERVICE_ROLE_KEY` (serverless de email)
  - `VITE_TURNSTILE_SITE_KEY`
  - `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM_NAME=PencaLes 2.0`
  - APIs de fútbol (`FOOTBALL_DATA_API_KEY`, etc.) si se usan
- Dominio nuevo apuntando al proyecto.
- Deploy de `main`.

---

## 10. Limpieza post-migración (opcional, tras validar)

Una vez confirmado todo, el schema `legacy` puede eliminarse del proyecto nuevo para dejarlo limpio:
```sql
DROP SCHEMA legacy CASCADE;
```
> Hacelo **solo** después de que la validación del paso 7 dé OK y la app esté funcionando.
> No hay apuro: `legacy` no interfiere con la operación.

---

## 11. Rollback

No hay rollback que ejecutar: el proyecto v1 quedó intacto. Si la migración salió mal:
1. No promover el dominio al proyecto nuevo.
2. Borrar (o vaciar) el proyecto nuevo.
3. Corregir lo que falló y repetir desde el paso 2.

---

## Apéndice — Mapeo de datos v1 → v2

| v1 | v2 | Notas |
|----|----|-------|
| — | `tenants` "Publico" | UUID `1111…` |
| — | `competitions` "Mundial Futbol 2026" | UUID `2222…`, motor `wc48_best_thirds`, `finished` |
| — | `ten_comps` "PencaLes 2026" | UUID `3333…`, público, `archived` |
| `auth.users` | `auth.users` | mismos UUID + passwords (paso 4) |
| `profiles` | `profiles` + `tenant_roles` | `is_admin`→super-admin + rol admin en Publico; `is_loader`→rol loader |
| `groups/phases/stadiums/teams` | ídem + `competition_id` | UUID preservados; `"order"`→`sort_order` |
| `matches` (con resultados) | `matches` | UUID preservados; `winner_team_id` se migra tal cual |
| `knockout_slot_rules`/`combinaciones`/overrides | ídem + `competition_id` | |
| `scoring_config` (activa) | `competitions.default_scoring` + `ten_comp_scoring` | mismo valor en ambos |
| `bonus_config` | `competition_bonus_types` + `ten_comp_bonus_config` | |
| `predictions` | `predictions` + `ten_comp_id` | `points_earned` se migra y se valida por recálculo |
| `bonus_predictions`/`bonus_points` | ídem + `ten_comp_id` | |
| `subgrupos`/`subgrupo_members` | ídem + `ten_comp_id` | |
| `*_audit` | ídem + `ten_comp_id` | histórico verbatim |
| `profiles` (todos) | `ten_comp_members` | todos `approved` |
| `email_queue` | — | no se migra (histórico irrelevante) |
| Storage `avatars` | Storage `avatars` | copiar archivos + reescribir URLs (paso 8) |
