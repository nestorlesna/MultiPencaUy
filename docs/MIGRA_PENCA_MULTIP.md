# MIGRA_PENCA_MULTIP — Migración Penca2026 (v1) → MultiPenca (v2) EN PRODUCCIÓN

> **Objetivo:** que el proyecto de producción actual (Vercel + Supabase de Penca2026) pase a
> correr la aplicación multi-tenant (este repo, MultiPencaUy) **sin perder nada**: usuarios,
> contraseñas, predicciones, resultados del Mundial, avatares — todo queda, transformado al
> modelo Tenant → Ten-Comp, y se suman las competencias nuevas (Apertura, Intermedio,
> Eliminatoria Sudamericana).
>
> **Cuándo:** con el Mundial 2026 terminado (post 19/07/2026). La app v1 está congelada:
> no hay predicciones nuevas, solo consultas. La ventana de mantenimiento puede ser de horas
> sin impacto real.
>
> **Quién:** operador con acceso owner a ambos proyectos Supabase, ambos proyectos Vercel
> y ambos repos GitHub.

---

## 0. Estrategia y decisiones tomadas

| Decisión | Elección |
|----------|----------|
| Base de datos | **Transformación in-place del Supabase de PROD (Penca2026).** Los datos v1 se mueven al schema `legacy` dentro de la misma base; el schema v2 se aplica en `public`; la ETL (`90_migrate_from_v1.sql`) puebla v2 desde `legacy`. |
| Vercel | **Se conserva el proyecto Vercel de PROD** (dominio intacto). Solo se le cambia el repo Git conectado (→ MultiPencaUy) y se agregan env vars. |
| GitHub | Queda el repo nuevo (MultiPencaUy). El repo viejo (Penca2026uy) se taggea y archiva. |
| Datos del Supabase dev de MultiPenca | **Descartables** (solo pruebas). Las competencias nuevas se recrean en prod vía las migraciones seed (91/95/96). |
| Par dev (Supabase + Vercel de MultiPenca) | **Queda como staging permanente**: ahí se ensaya esta migración y, a futuro, toda migración/feature antes de prod. |

**Por qué in-place y no ETL a proyecto nuevo** (que era lo que planteaba `docs/MIGRACION_V1_A_V2.md`):

- `auth.users` **no se toca**: los usuarios conservan email + contraseña + identidades OAuth sin export/import.
- Storage **no se toca**: los avatares quedan donde están, las URLs en `profiles.avatar_url` siguen válidas (mismo project ref) — se elimina el paso de copiar archivos y reescribir URLs.
- Project ref, anon key, service-role key, dominio, Site URL, providers de auth, secret de Turnstile: **todo queda igual**.
- La contra: producción se modifica en el lugar. Se mitiga con backup completo previo (Fase 1), ensayo completo en staging (Fase 3) y plan de rollback (Fase 8). El riesgo es aceptable porque el torneo terminó y la app está en modo lectura.

**Qué se reutiliza del repo:** la migración `supabase/migrations/90_migrate_from_v1.sql` sirve tal cual (solo espera: schema v2 en `public`, datos v1 en `legacy`, `auth.users` presentes — las tres cosas se cumplen igual en esta dirección). El doc viejo `MIGRACION_V1_A_V2.md` queda obsoleto en su dirección (ETL hacia proyecto nuevo) pero su sección de validación se retoma acá en la Fase 5.

### Nomenclatura usada en los comandos

| Variable | Qué es | Dónde conseguirla |
|----------|--------|-------------------|
| `PROD_DB_URL` | Connection string del Supabase de **prod** (Penca2026) | Dashboard → Settings → Database (Session pooler o directa) |
| `STG_DB_URL` | Connection string del Supabase de **staging** (MultiPenca dev, ref `kxwwkdpxhcrfevauhpgy`) | ídem |
| `PROD_REF` | Project ref del Supabase de prod (el subdominio `xxxx.supabase.co`) | Dashboard de prod |

---

## 1. Fase 1 — Backups (ambas apps) — *hacer aunque sobre*

Trabajar en una carpeta fechada, ej. `C:\DATOS\BACKUPS\migracion-multipenca-2026-07\`.
`pg_dump` debe ser **≥ la versión del Postgres del servidor** (ver Settings → Infrastructure en cada dashboard; si no coincide, usar un contenedor `postgres:17`).

### 1a. Base de PROD (Penca2026) — el backup crítico

```bash
# Dump completo custom-format de los schemas que importan (restaurable selectivamente)
pg_dump "$PROD_DB_URL" -Fc -n public -n auth -n storage -f prod_full.dump

# Dump plano SOLO de public (el que usa el rollback rápido y sirve para inspección)
pg_dump "$PROD_DB_URL" --schema=public -f prod_public.sql

# Dump data-only de usuarios/credenciales (cinturón y tiradores)
pg_dump "$PROD_DB_URL" --data-only --no-owner --no-privileges \
  -t auth.users -t auth.identities -f prod_auth.sql
```

Verificar que los tres archivos tengan tamaño razonable y guardar además:

- **Archivos del bucket `avatars`**: descargarlos (script Node con service-role listando el bucket, o a mano desde el dashboard si son pocos). El dump de `storage` solo trae metadata, no los archivos.
- **Env vars del Vercel de prod**: export con `vercel env pull` o captura del dashboard (Settings → Environment Variables).
- **Config de Auth de prod**: captura de Site URL, Redirect URLs, providers habilitados, templates de email, config de captcha.
- Si el plan de Supabase lo permite, **anotar el último backup automático / punto PITR** disponible.

### 1b. Base de staging (MultiPenca dev)

Aunque sus datos son de prueba, el usuario del backup sos vos dentro de seis meses:

```bash
pg_dump "$STG_DB_URL" -Fc -n public -f staging_pre_migracion.dump
```

### 1c. Repos

```bash
# En el repo viejo (Penca2026uy): tag del estado final del Mundial
git tag final-mundial-2026 && git push origin final-mundial-2026

# En este repo (MultiPencaUy): tag previo a la migración
git tag pre-migracion-prod && git push origin pre-migracion-prod
```

---

## 2. Fase 2 — Preparar el código (este repo)

Cambios que deben estar mergeados en `main` **antes** del día D:

1. **`vercel.json` — CSP**: hoy el header `Content-Security-Policy` referencia al Supabase de
   staging (`kxwwkdpxhcrfevauhpgy.supabase.co`). Agregar el ref de **prod** en `connect-src`
   (https y wss) e `img-src`. Recomendado: dejar **ambos** refs, así el mismo `vercel.json`
   sirve para staging y prod sin ramas distintas.
2. **`capacitor.config.ts`** (opcional, cosmético): `appName: 'PencaLes 2026'` → `'PencaLes'`.
   Mantener el `appId` (`com.pencales.app`) para que el APK nuevo actualice al viejo.
3. Merge `develop` → `main`. La rama de producción en Vercel será `main`.
4. Verificar build local: `npm run build` y `npm run lint` limpios.

> **Nota Turnstile:** la app usa `VITE_TURNSTILE_SITE_KEY` (widget) y el secret vive en la
> config de Supabase Auth (Attack Protection), que no cambia. Solo confirmar que la site key
> que quede en Vercel prod sea la del dominio de prod.

---

## 3. Fase 3 — Ensayo general en staging (obligatorio)

Es la red de seguridad principal: ejecutar la migración **entera** contra una copia real de prod,
días antes del día D. Se usa la base de staging (sus datos actuales son descartables).

1. **Vaciar staging** y dejarla como una foto de prod:
   ```bash
   psql "$STG_DB_URL" -c "DROP SCHEMA IF EXISTS legacy CASCADE;"
   psql "$STG_DB_URL" -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;
                          GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
                          GRANT ALL ON SCHEMA public TO postgres;"
   ```
2. **Restaurar `auth.users`/`auth.identities` de prod ANTES que `public`** (orden crítico,
   ver nota de abajo):
   ```bash
   psql "$STG_DB_URL" -c "TRUNCATE auth.users CASCADE;"
   psql "$STG_DB_URL" -v ON_ERROR_STOP=1 -f prod_auth.sql   # el dump plano del punto 1a #3
   ```
   No usar `pg_restore --disable-triggers` para esto: en Supabase el rol `postgres` del pooler
   no es *owner* de las tablas de `auth` (son de `supabase_auth_admin`) y el flag falla con
   `must be owner of table`. Tampoco hace falta: el trigger `handle_new_user` sobre
   `auth.users` tiene `ON CONFLICT (id) DO NOTHING`, así que reinsertar usuarios no rompe nada.
3. **Restaurar `public` de prod** (recién ahora, con `auth.users` ya correcto):
   ```bash
   pg_restore -d "$STG_DB_URL" -n public --no-owner prod_full.dump
   ```
   > **Por qué el orden importa:** `profiles.id` tiene FK a `auth.users(id)`. Si se restaura
   > `public` primero (con el `auth.users` viejo de staging todavía puesto), el `COPY` de
   > `profiles` viola la FK y falla — y como `pg_restore` no frena por defecto ante un error,
   > sigue con el resto de las tablas en silencio. El resultado es un restore que *parece*
   > haber terminado bien pero deja `profiles`, `predictions`, `bonus_predictions`,
   > `bonus_points`, `subgrupos`, `subgrupo_members`, `predictions_audit` y
   > `bonus_predictions_audit` completamente vacías (cualquier tabla con FK directa o indirecta
   > a `profiles`/`auth.users`). Se nota recién en la Fase 5 (o antes, si se corre
   > `SELECT count(*) FROM legacy.<tabla>` tabla por tabla). Restaurando `auth` primero, este
   > problema no existe.
   >
   > Si aun así hace falta recuperar tablas que quedaron vacías por haber restaurado en el
   > orden incorrecto: volver a dumpearlas de prod en texto plano y data-only
   > (`pg_dump --data-only -t public.<tabla> ...`), reemplazar `public.` por `legacy.` en las
   > líneas `COPY` del archivo resultante, y antes de cargarlo desactivar los triggers de v1
   > que hacen inserts sin qualificar contra tablas de auditoría (`legacy.trg_audit_predictions`,
   > `legacy.trg_audit_bonus_predictions`, `legacy.trg_subgrupo_limit` — fallan con
   > `relation "..." does not exist` porque el dump de `pg_dump` fuerza `search_path=''`).
   > Truncar la tabla destino antes de cada reintento: `COPY` no es idempotente como los
   > `INSERT ... ON CONFLICT`.
   >
   > Si `mover_a_legacy.sql` ya corrió y las tablas están en `legacy`, correr `90_migrate_from_v1.sql`
   > de nuevo después de arreglar `legacy` — es idempotente, rellena lo que faltaba sin duplicar.
4. Si staging ya tuvo alguna vez v2 corriendo (como el par dev de MultiPenca), `02_rls.sql`
   puede fallar en las policies de Storage del bucket **`logos`** (`logos_public_read`, etc.)
   con `policy ... already exists` — `mover_a_legacy.sql` solo dropea las de `avatars` (nombres
   v1), no las de `logos`. Si pasa: `DROP POLICY IF EXISTS "logos_*" ON storage.objects;` para
   las 4 policies y correr manualmente el resto de `02_rls.sql` desde esa sección. **No debería
   pasar en prod real** (nunca corrió v2 ahí), pero vale la pena verificarlo el día D por las dudas.
5. Ejecutar **toda la Fase 4** (transformación) contra `STG_DB_URL`.
6. Ejecutar **toda la Fase 5** (validación). La query del leaderboard debe dar **0 filas**.
   `rebuild_progress`/`recalculate_all` están guardadas por `can_load_results()`, que depende de
   `auth.uid()` — inexistente si se llama por `psql` directo (sin JWT real de la API). Para
   simularlo en la misma sesión/transacción:
   ```sql
   BEGIN;
   SELECT set_config('request.jwt.claims', '{"sub":"<uuid-de-un-super-admin>"}', true);
   SELECT rebuild_progress('22222222-2222-4222-8222-222222222222');
   COMMIT;
   ```
   (tiene que ir en un único `BEGIN...COMMIT`: el `true` de `set_config` = "solo esta
   transacción", se pierde si cada sentencia se manda por separado, como hace `psql -f` por
   default sin transacción explícita).
7. Apuntar la app local (`npm run dev` con `.env` → staging) y hacer el smoke test de la Fase 5c.
8. Anotar tiempos y cualquier desvío: eso corrige este documento antes del día D.

> **Nota:** todo lo de los puntos 2–4 es exclusivo del *ensayo* — existe porque staging es un
> proyecto Supabase distinto al de prod y hay que traerle `auth.users` a mano para simular la
> migración. En el día D real (Fase 4, sobre `PROD_DB_URL`) la migración es **in-place sobre la
> misma base**: `auth.users` de prod nunca se toca ni se restaura desde ningún lado, así que la
> condición de carrera del punto 3 no puede darse — `mover_a_legacy.sql` solo mueve metadata
> (`ALTER TABLE ... SET SCHEMA`), no copia filas. El punto 6 (simular JWT para `psql` directo)
> sí aplica igual en prod, si se corre `rebuild_progress`/`recalculate_all` a mano por consola
> en vez de desde el panel admin.

---

## 4. Fase 4 — Día D: transformación de la base de PROD

> Ventana de mantenimiento: desde que empieza este paso, la app v1 en el dominio deja de
> funcionar (su schema `public` se muda). Elegir un horario de bajo tráfico y, si se quiere,
> avisar antes por el canal habitual. Duración esperada: 30–60 min + validación.

Todos los comandos con `ON_ERROR_STOP`: si algo falla, **parar y evaluar** (rollback en Fase 8).

### 4a. Mover el mundo v1 de `public` → `legacy`

```bash
psql "$PROD_DB_URL" -v ON_ERROR_STOP=1 -f mover_a_legacy.sql
```

Contenido de `mover_a_legacy.sql` (ver también Apéndice B):

```sql
BEGIN;

CREATE SCHEMA IF NOT EXISTS legacy;

DO $$
DECLARE r record;
BEGIN
  -- Tablas, vistas y sequences sueltas de public → legacy.
  -- Se excluyen: objetos de extensiones (deptype 'e') y sequences owned por columnas
  -- (deptype 'a'/'i'), que viajan solas con su tabla.
  FOR r IN
    SELECT c.oid, c.relname, c.relkind
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r','v','m','S')
      AND NOT EXISTS (SELECT 1 FROM pg_depend d
                      WHERE d.objid = c.oid AND d.deptype IN ('e'))
      AND NOT (c.relkind = 'S' AND EXISTS (
                 SELECT 1 FROM pg_depend d
                 WHERE d.objid = c.oid AND d.deptype IN ('a','i')))
  LOOP
    EXECUTE format('ALTER %s public.%I SET SCHEMA legacy',
      CASE r.relkind WHEN 'r' THEN 'TABLE'
                     WHEN 'v' THEN 'VIEW'
                     WHEN 'm' THEN 'MATERIALIZED VIEW'
                     ELSE 'SEQUENCE' END,
      r.relname);
  END LOOP;

  -- Funciones propias de public → legacy (las de extensiones se excluyen).
  FOR r IN
    SELECT p.oid, p.proname,
           pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND NOT EXISTS (SELECT 1 FROM pg_depend d
                      WHERE d.objid = p.oid AND d.deptype = 'e')
  LOOP
    EXECUTE format('ALTER FUNCTION public.%I(%s) SET SCHEMA legacy',
                   r.proname, r.args);
  END LOOP;
END $$;

-- Policies de storage de v1: chocan por NOMBRE con las que crea 02_rls.sql.
DROP POLICY IF EXISTS "avatars_public_read" ON storage.objects;
DROP POLICY IF EXISTS "avatars_user_upload" ON storage.objects;
DROP POLICY IF EXISTS "avatars_user_update" ON storage.objects;
DROP POLICY IF EXISTS "avatars_user_delete" ON storage.objects;

COMMIT;

-- Verificación: public debe quedar (casi) vacío y legacy con ~20 tablas de v1
SELECT 'public' AS schema, count(*) FROM pg_tables WHERE schemaname = 'public'
UNION ALL
SELECT 'legacy', count(*) FROM pg_tables WHERE schemaname = 'legacy';
SELECT count(*) AS legacy_predictions FROM legacy.predictions;
SELECT count(*) AS legacy_matches     FROM legacy.matches;      -- esperado: 104
```

Notas sobre este paso:

- Índices, constraints, **RLS policies y datos viajan con cada tabla**; las FKs a `auth.users`
  siguen intactas. Las vistas siguen apuntando a sus tablas (la referencia es por OID, no por
  nombre), así que `legacy.leaderboard` sigue funcionando para la validación.
- El trigger v1 `on_auth_user_created` sobre `auth.users` queda apuntando a
  `legacy.handle_new_user` — funciona igual, y `01_schema.sql` lo reemplaza con
  `DROP TRIGGER IF EXISTS` + versión v2. No requiere acción manual.
- El schema `legacy` **no** está expuesto por PostgREST (solo `public`), así que nada de v1
  queda accesible desde la API.

### 4b. Aplicar el schema v2 + ETL + migraciones incrementales

En **este orden exacto** (el orden alfabético de archivos NO sirve: `100` ordena antes que `90`):

```bash
cd C:\DATOS\DESARROLLOS\React\MultiPencaUy

for f in 01_schema 02_rls 03_functions_views 04_grants \
         90_migrate_from_v1 \
         91_seed_apertura_uy_2026 92_add_round_number 93_flag_urls_apertura_uy_2026 \
         94_teams_competition_nullable 95_seed_intermedio_uy_2026 \
         96_seed_eliminatoria_sudamericana_2026 97_must_change_password \
         98_admin_all_user_emails 99_admin_cleanup 100_league_scoring \
         101_invitations 102_fix_invitable_users 103_competition_archived \
         104_match_prediction_stats 105_security_hardening \
         106_member_user_bonus_points 107_muro 108_progress_history \
         109_fix_match_loser 110_profile_wants_news 111_invitable_users_wants_news; do
  echo "=== $f ==="
  psql "$PROD_DB_URL" -v ON_ERROR_STOP=1 -f "supabase/migrations/$f.sql" || break
done
```

Qué hace cada bloque:

- **01–04**: schema v2 completo en `public` (tablas, RLS, funciones/vistas, grants, buckets
  `avatars`/`logos` — el bucket `avatars` ya existe, el `ON CONFLICT DO NOTHING` lo respeta).
- **90**: la ETL. Crea Tenant **Publico** (`1111…`) → Competencia **Mundial Futbol 2026**
  (`2222…`, `finished`) → Ten-Comp **PencaLes 2026** (`3333…`, público, `archived`) y vuelca
  todo v1 preservando UUIDs: perfiles (el `is_admin` de v1 pasa a super-admin), catálogo,
  partidos con resultados, predicciones con puntos, bonus, subgrupos, auditoría, membresías
  (todos `approved`). Es idempotente (`ON CONFLICT`), se puede reejecutar.
- **91–111**: seeds de Apertura/Intermedio/Eliminatoria y todas las features incrementales
  (invitaciones, archivado, stats de apuestas, muro, evolución, `wants_news`, etc.).

> **Importante:** como los perfiles ya existen antes de aplicar `110_profile_wants_news`,
> todos los usuarios migrados quedan con `wants_news = true` (default de la columna) —
> comportamiento correcto (opt-out).

### 4c. Post-ETL

```sql
-- Materializar las gráficas de evolución del Mundial (tabs "Evolución" del ranking)
SELECT rebuild_progress('22222222-2222-4222-8222-222222222222');

-- Higiene: si quedaron tablas legacy en la publicación de Realtime, sacarlas
SELECT * FROM pg_publication_tables WHERE schemaname = 'legacy';
-- por cada fila: ALTER PUBLICATION supabase_realtime DROP TABLE legacy.<tabla>;
```

---

## 5. Fase 5 — Validación (no saltear; con la DB lista pero ANTES del switch de Vercel)

### 5a. Conteos v1 vs v2 (deben coincidir par a par)

```sql
SELECT
  (SELECT count(*) FROM legacy.profiles)          AS v1_profiles,
  (SELECT count(*) FROM profiles)                 AS v2_profiles,
  (SELECT count(*) FROM legacy.predictions)       AS v1_preds,
  (SELECT count(*) FROM predictions)              AS v2_preds,
  (SELECT count(*) FROM legacy.matches)           AS v1_matches,   -- 104
  (SELECT count(*) FROM matches
    WHERE competition_id = '22222222-2222-4222-8222-222222222222') AS v2_matches_mundial,
  (SELECT count(*) FROM legacy.bonus_predictions) AS v1_bonus,
  (SELECT count(*) FROM bonus_predictions)        AS v2_bonus,
  (SELECT count(*) FROM ten_comp_members
    WHERE ten_comp_id = '33333333-3333-4333-8333-333333333333')    AS v2_members;
```

### 5b. Recalcular y comparar el leaderboard **fila a fila** (la validación dura)

```sql
SELECT recalculate_all('22222222-2222-4222-8222-222222222222');

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
-- DEBE devolver 0 filas. Si devuelve algo, hay una discrepancia (scoring migrado,
-- bonus no replicado o partido sin recalcular). No se lanza hasta que dé 0.
```

### 5c. Smoke test funcional (app local contra la DB de prod ya migrada)

Con un `.env` local apuntando `VITE_SUPABASE_URL` al **prod** y `VITE_V2_ENABLED=true`:

- [ ] Login con 2–3 cuentas reales (contraseñas de siempre — no se tocaron).
- [ ] En `/pencas` aparece "PencaLes 2026" (archivada, solo lectura) y las públicas nuevas.
- [ ] Ranking del Mundial idéntico al final oficial; detalle de un usuario abre con sus partidos.
- [ ] Tab "Evolución" grafica puesto y puntos (validó `rebuild_progress` de 4c).
- [ ] Avatares se ven (URLs intactas).
- [ ] Apertura/Intermedio/Eliminatoria visibles; la Eliminatoria con resultados cargados.
- [ ] Un usuario de prueba puede predecir en una competencia **abierta** (RLS de escritura OK).
- [ ] Panel super-admin accesible con la cuenta que era `is_admin` en v1.

---

## 6. Fase 6 — Switch de Vercel (código nuevo en el proyecto de prod)

En el **proyecto Vercel de prod** (el del dominio actual):

1. **Env vars** (Settings → Environment Variables) — pueden precargarse antes del día D,
   no afectan al deployment vigente hasta el próximo build:

   | Variable | Valor | Estado |
   |----------|-------|--------|
   | `VITE_SUPABASE_URL` | `https://<PROD_REF>.supabase.co` | ya existe, no cambia |
   | `VITE_SUPABASE_ANON_KEY` | anon key de prod | ya existe, no cambia |
   | `VITE_V2_ENABLED` | `true` | **NUEVA — crítica** (sin ella la app no consulta el modelo multi-tenant) |
   | `VITE_TURNSTILE_SITE_KEY` | site key del dominio | verificar |
   | `SUPABASE_URL` | `https://<PROD_REF>.supabase.co` | para serverless (`send-email`, `admin-reset-password`) |
   | `SUPABASE_SERVICE_ROLE_KEY` | service-role de prod | verificar/crear |
   | `SMTP_HOST/PORT/USER/PASS/SECURE` | SMTP global de plataforma | ya existen si v1 mandaba mails |
   | `SMTP_FROM_NAME` | ej. `PencaLes` (fallback; el from por penca se deriva del tenant) | actualizar |
   | `FOOTBALL_DATA_API_KEY`, `API_FOOTBALL_KEY`, `SPORTSDB_API_KEY` | feeds deportivos | opcionales |

2. **Cambiar el repo conectado**: Settings → Git → Disconnect (repo Penca2026uy) →
   Connect Git Repository → **MultiPencaUy**, production branch `main`.
3. Verificar Build settings: framework **Vite**, build `npm run build`, output `dist`
   (el `vercel.json` del repo ya trae rewrites SPA + headers).
4. **Deploy** (push a `main` o "Redeploy"). El dominio no se toca.
5. Smoke test en el dominio real: repetir los puntos clave de 5c + **probar el envío de un
   correo** desde el tab Correos de una penca (valida serverless + SMTP + service role) +
   un **reset de contraseña por admin** (valida `admin-reset-password`).
6. Confirmar en las DevTools que el CSP no bloquea nada (si aparece un bloqueo a
   `*.supabase.co`, faltó el ref de prod en `vercel.json` — Fase 2.1).

---

## 7. Fase 7 — Config de Supabase prod (ajustes finos)

- **Auth → Email Templates**: cargar `supabase/email-templates/resetpass.html` y
  `verificar.html` (branding nuevo, sin "PencaLes 2026" mundialista).
- **Auth → URL Configuration**: sin cambios (mismo dominio), pero verificar que
  `https://<dominio>/auth-callback` esté en Redirect URLs.
- **Providers**: sin cambios (email/password y Google si estaba). El captcha Turnstile
  sigue con su secret configurado.
- **Backups/PITR**: confirmar que siguen activos tras la migración.

---

## 8. Rollback (si algo sale mal)

La señal de rollback es: validación 5b con diferencias irresolubles, o la app nueva rota en
prod sin fix rápido.

**Código (instantáneo):** en Vercel, "Instant Rollback" al deployment anterior (v1). Si ya se
desconectó el repo viejo, el deployment anterior sigue existiendo y es promovible igual.

**Base de datos:** dos niveles, del más quirúrgico al más grueso:

1. *Deshacer la transformación* (si `legacy` está sano — es v1 intacto, solo mudado):
   ```sql
   -- Tirar el mundo v2 y devolver v1 a public
   DROP SCHEMA public CASCADE;
   ALTER SCHEMA legacy RENAME TO public;
   -- Recrear grants base del schema public (Supabase los espera):
   GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
   GRANT ALL ON SCHEMA public TO postgres;
   -- Restaurar las 4 policies de storage de v1 (supabase/legacy/05_storage.sql)
   ```
   > Ojo: el trigger `on_auth_user_created` quedó apuntando a la función v2 (borrada por el
   > `DROP ... CASCADE`); recrearlo desde `supabase/legacy/02_auth_rls.sql`.
2. *Restore desde backup* (si `legacy` quedó comprometido):
   ```bash
   psql "$PROD_DB_URL" -c "DROP SCHEMA IF EXISTS legacy CASCADE;
                           DROP SCHEMA public CASCADE; CREATE SCHEMA public;
                           GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
                           GRANT ALL ON SCHEMA public TO postgres;"
   pg_restore -d "$PROD_DB_URL" -n public --no-owner prod_full.dump
   ```
   `auth` y `storage` no se tocaron en ningún paso, no necesitan restore. Como plan C existe
   el PITR/backup automático de Supabase.

---

## 9. Fase 9 — Post-migración

- [ ] Monitorear 48 h: logs de Vercel (funciones `send-email` / `admin-reset-password`),
      logs de Postgres, reportes de usuarios.
- [ ] **APK Android**: el APK viejo tiene la web v1 embebida (Capacitor empaqueta `dist`) y
      dejará de funcionar contra la DB migrada. Compilar y distribuir el APK nuevo con
      `scripts/release.ps1` (ya corregido para apuntar a este repo y a `PencaLes.apk`);
      mismo `appId` ⇒ actualiza sobre el instalado.
- [ ] Archivar el repo GitHub **Penca2026uy** (Settings → Archive) — ya taggeado en 1c.
- [ ] Vercel viejo de MultiPenca dev: renombrarlo como staging explícito y dejar documentado
      el flujo: *toda migración SQL nueva se aplica primero en staging, después en prod*.
- [ ] Restaurar en staging una base de trabajo (puede quedar la foto de prod migrada del
      ensayo de la Fase 3 — es el mejor staging posible).
- [x] Actualizar `CLAUDE.md` y `docs/PLAN_MULTITENANT.md`: la migración está hecha; marcar
      `docs/MIGRACION_V1_A_V2.md` como histórico/no ejecutado (la dirección real fue in-place).
- [ ] Anunciar a los usuarios las pencas nuevas (tab Correos → invitaciones ya migradas 😉).
- [ ] **Recién a las 2–4 semanas**, con todo estable:
      ```sql
      DROP SCHEMA legacy CASCADE;
      ```
      y borrar el trigger/función huérfanos si quedara alguno. Sin apuro: `legacy` no
      interfiere ni es visible desde la API. Mientras tanto, los backups locales en
      `Datos/` (fuera de git, ver `.gitignore`) son la red de seguridad — plan Free sin PITR.

---

## Apéndice A — Mapeo de datos v1 → v2 (lo que hace `90_migrate_from_v1.sql`)

| v1 (schema `legacy`) | v2 (schema `public`) | Notas |
|----|----|-------|
| — | `tenants` "Publico" | UUID `1111…` |
| — | `competitions` "Mundial Futbol 2026" | UUID `2222…`, motor `wc48_best_thirds`, `finished` |
| — | `ten_comps` "PencaLes 2026" | UUID `3333…`, público, **archived** (solo lectura) |
| `auth.users` | `auth.users` | **sin tocar** (misma base) |
| `profiles` | `profiles` + `tenant_roles` | `is_admin`→super-admin + admin de Publico; `is_loader`→loader |
| `groups/phases/stadiums/teams` | ídem + `competition_id` | UUIDs preservados; `"order"`→`sort_order` |
| `matches` | `matches` | resultados y `winner_team_id` tal cual |
| `knockout_slot_rules`/`combinaciones`/overrides | ídem + `competition_id` | |
| `scoring_config` (activa) | `competitions.default_scoring` + `ten_comp_scoring` | |
| `bonus_config` | `competition_bonus_types` + config del Ten-Comp | |
| `predictions` | `predictions` + `ten_comp_id` | `points_earned` migrado y validado por recálculo |
| `bonus_predictions`/`bonus_points` | ídem + `ten_comp_id` | |
| `subgrupos`/`subgrupo_members` | ídem + `ten_comp_id` | |
| `*_audit` | ídem + `ten_comp_id` | histórico verbatim |
| `profiles` (todos) | `ten_comp_members` | todos `approved` |
| `email_queue` | — | histórico v1 no se migra |
| Storage `avatars` | sin cambios | mismas URLs (mismo project ref) |

## Apéndice B — Por qué el script de mudanza es genérico

En vez de listar las ~20 tablas v1 a mano, `mover_a_legacy.sql` mueve **todo** lo que viva en
`public` filtrando por catálogo:

- `pg_depend deptype 'e'` excluye objetos que pertenecen a extensiones (no hay que moverlos
  y Postgres no lo permitiría limpio).
- `deptype 'a'/'i'` excluye las sequences *owned* por columnas serial/identity: se mudan solas
  con su tabla; intentar moverlas dos veces daría error.
- Mover una tabla arrastra datos, índices, constraints, FKs, RLS policies y triggers propios.
- Las vistas referencian tablas por OID ⇒ siguen funcionando desde `legacy`.

Colisiones conocidas y ya resueltas en el plan:
- **Triggers sobre `auth.users`**: v2 hace `DROP TRIGGER IF EXISTS` antes de crear el suyo.
- **Policies de `storage.objects`**: v1 y v2 usan los mismos nombres (`avatars_*`) ⇒ se
  dropean las v1 en `mover_a_legacy.sql` antes de aplicar `02_rls.sql`.
- **Tipos**: ni v1 ni v2 definen `CREATE TYPE` ⇒ cero conflicto.

## Apéndice C — Checklist ejecutiva del día D

- [x] Backups Fase 1 hechos y verificados (prod_full.dump + avatares + env vars)
- [x] Ensayo en staging (Fase 3) pasó con leaderboard-diff = 0
- [x] `main` tiene el CSP con el ref de prod y build verde
- [x] Env vars precargadas en Vercel prod (incl. `VITE_V2_ENABLED=true`)
- [x] `mover_a_legacy.sql` ejecutado — public vacío, legacy con v1
- [x] Migraciones 01→04, 90, 91→111 aplicadas sin error
- [x] `rebuild_progress('2222…')` ejecutado
- [x] Validación 5a (conteos) y 5b (leaderboard fila a fila = 0 diferencias)
- [x] Smoke test 5c con cuentas reales
- [x] Vercel: repo → MultiPencaUy, deploy en el dominio, smoke test + correo + reset pass
- [x] Templates de email de Auth actualizados
- [x] Rollback NO necesario → tag `migracion-completada` en el repo

**Ejecutado:** 21/07/2026. Hallazgos post-D-Day (no cubiertos por el ensayo de staging, quedan
para el próximo ensayo): el CSP (`vercel.json`) también necesitaba el dominio de los escudos de
Apertura/Intermedio (`estadisticas.tenfield.com.uy`) en `img-src` — bloqueado en prod porque
`vite dev` local no aplica el header y el ensayo de staging tampoco lo hace vía CLI. Y el pipeline
de release de APK (`scripts/release.ps1`, `.github/workflows/release-apk.yml`, `build.gradle`,
`useUpdateCheck.ts`, `DescargarAppPage.tsx`) seguía todo apuntando al repo viejo `Penca2026uy` —
se corrigió a `MultiPencaUy` / `PencaLes.apk`.
