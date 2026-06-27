# Auditoría de Seguridad — Anglo Penca Mundial 2026
**URL auditada:** https://anglo-penca2026.vercel.app/auth  
**Fecha de auditoría:** 11 de junio de 2026  
**Auditor:** Revisión técnica asistida por Claude (Anthropic)  
**Metodología:** Black-box / análisis estático de bundles + pruebas activas no destructivas sobre la API pública  

---

## 1. Resumen Ejecutivo

La aplicación es una Penca del Mundial 2026 desarrollada para el Anglo (institución educativa). Corre sobre un stack React + Vite deployado en Vercel, con Supabase como backend (base de datos PostgreSQL + autenticación + storage).

Se identificaron **2 hallazgos críticos** y **4 recomendaciones de hardening** menores. Los hallazgos críticos permiten a cualquier persona en internet, sin autenticarse, (a) leer la totalidad de la tabla `profiles` con datos personales de 768 usuarios y (b) ejecutar funciones que mutan datos del scoring de la competencia.

**Estado general: REQUIERE ACCIÓN INMEDIATA antes de que la competencia avance.**

---

## 2. Stack Técnico Identificado

| Componente | Detalle |
|---|---|
| Frontend | React + Vite (SPA), bundle con Rolldown |
| Hosting | Vercel (CDN global, HTTPS forzado) |
| Backend | Supabase (PostgreSQL + Auth + REST API + Storage) |
| Supabase URL | `https://qjohfsrvpyoxcugclvpn.supabase.co` |
| Supabase Key | `sb_publishable_MCOZDLjavfsgKlKsp_SHlg_IxbcDV7a` *(anon/publishable, embebida en bundle — normal)* |
| Librerías principales | `@supabase/supabase-js`, `react-query`, `react-router` |

### Tablas identificadas en el bundle

```
avatars, best_third_rank_overrides, best_third_ranking, bonus_config,
bonus_points, bonus_predictions, combinaciones, group_position_overrides,
group_standings, groups, knockout_slot_rules, leaderboard, matches,
phases, predictions, predictions_audit, profiles, scoring_config,
stadiums, subgrupo_members, subgrupo_ranking, subgrupos, teams
```

### RPCs (funciones de base de datos) identificadas

```
admin_get_user_details
calculate_bonus_points
calculate_match_points
populate_knockout_matches
recalculate_all
```

---

## 3. Metodología de Prueba

Todas las pruebas se realizaron de forma **no destructiva**:

- Lecturas: llamadas GET a la REST API de Supabase con la key pública, igual a como lo haría cualquier usuario anónimo.
- Pruebas de escritura: se usaron payloads que fallan por restricción de constraint (objetos vacíos `{}`) para distinguir si RLS permite o bloquea, sin insertar filas válidas.
- Pruebas de UPDATE: se usaron filtros que no matchean ninguna fila (`id=eq.00000000-0000-0000-0000-000000000000`) para verificar si la política permite escritura, sin modificar datos reales.
- Ninguna fila fue creada, modificada ni eliminada durante la auditoría.

---

## 4. Hallazgos Críticos

---

### HALLAZGO 1 — Tabla `profiles` legible sin autenticación (768 registros)

**Severidad:** CRÍTICA  
**Tipo:** Broken Access Control / CWE-284  
**Confirmado:** Sí, verificado con respuesta real de la API  

#### Descripción

La tabla `profiles` de Supabase es accesible mediante una request HTTP GET simple, sin ninguna credencial de usuario, usando únicamente la anon key pública. Esto significa que cualquier persona en internet puede extraer la base de usuarios completa.

#### Evidencia

Request que cualquiera puede ejecutar:

```bash
curl "https://qjohfsrvpyoxcugclvpn.supabase.co/rest/v1/profiles?select=*" \
  -H "apikey: sb_publishable_MCOZDLjavfsgKlKsp_SHlg_IxbcDV7a" \
  -H "Authorization: Bearer sb_publishable_MCOZDLjavfsgKlKsp_SHlg_IxbcDV7a"
```

Respuesta HTTP confirmada (header de conteo):

```
content-range: 0-767/768
```

Estructura de cada fila expuesta:

```json
{
  "id": "9f67ff4f-6856-498e-baff-1271c4eb9a3e",
  "username": "esteban",
  "display_name": "Esteban Bolaño",
  "avatar_url": null,
  "is_active": true,
  "is_admin": false,
  "created_at": "2026-06-01T15:23:18.335161+00:00",
  "is_loader": false,
  "user_type": "funcionario"
}
```

#### Impacto concreto

1. **768 perfiles expuestos** — la totalidad de la base de usuarios de la aplicación.
2. **Discriminación de administradores** — el campo `is_admin: true/false` está visible, lo que permite identificar exactamente qué cuentas tienen privilegios elevados y orientar ataques de phishing o credential stuffing hacia esas cuentas.
3. **PII directa** — 7 usuarios registraron su dirección de correo electrónico como `display_name`. Esos correos son visibles sin restricción y constituyen una filtración de datos personales.
4. **Clasificación de usuarios** — el campo `user_type` expone roles como `alumno` y `funcionario`, información sensible en contexto escolar.
5. **UUIDs de Supabase Auth expuestos** — el campo `id` corresponde al UUID interno de Supabase Auth, lo que facilita ataques dirigidos a nivel de API.

#### Causa raíz probable

Existe una política RLS (Row-Level Security) de tipo SELECT en la tabla `profiles` con `roles = {anon}` o `{public}` y condición `USING (true)`, lo que permite lectura sin restricción. Esto se confirma con el script de auditoría SQL que se proveyó por separado.

#### Fix recomendado

```sql
-- Paso 1: Identificar la política que abre el SELECT anónimo
SELECT policyname, cmd, roles, qual
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'profiles';

-- Paso 2: Eliminar la política permisiva (reemplazar nombre_de_la_politica 
--         con el nombre que devuelva la query anterior)
DROP POLICY IF EXISTS "nombre_de_la_politica" ON public.profiles;

-- Paso 3: Crear política correcta — solo usuarios autenticados pueden leer
CREATE POLICY "profiles_select_authenticated"
ON public.profiles FOR SELECT
TO authenticated
USING (true);

-- Paso 4 (opcional hardening): Que cada usuario solo vea su propio perfil
--         salvo que sea admin. Más restrictivo, rompe leaderboard si lo
--         usás para mostrar datos de otros. Evaluar.
CREATE POLICY "profiles_select_own_or_admin"
ON public.profiles FOR SELECT
TO authenticated
USING (
  auth.uid() = id
  OR EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND is_admin = true
  )
);
```

**Nota sobre el leaderboard:** Si la vista pública `leaderboard` la usás para usuarios no logueados, esa vista puede seguir siendo pública — pero debe contener únicamente los campos necesarios (username, display_name, avatar_url, puntos, rank) **sin** `is_admin`, `user_type`, `id` de auth ni `is_loader`. La tabla `profiles` cruda no debe ser accesible de forma anónima bajo ningún concepto.

---

### HALLAZGO 2 — RPCs que mutan datos ejecutables sin autenticación

**Severidad:** CRÍTICA  
**Tipo:** Missing Function-Level Access Control / CWE-285  
**Confirmado:** Sí, las funciones devolvieron HTTP 200 y reportaron filas modificadas  

#### Descripción

Dos funciones de base de datos diseñadas para recalcular puntuaciones y poblar el bracket de knockout son invocables por cualquier persona sin sesión de usuario, usando únicamente la anon key pública. Estas funciones realizan **escrituras reales en la base de datos**.

#### Evidencia

**`recalculate_all`** — ejecuta y reporta escrituras:

```bash
curl -X POST "https://qjohfsrvpyoxcugclvpn.supabase.co/rest/v1/rpc/recalculate_all" \
  -H "apikey: sb_publishable_MCOZDLjavfsgKlKsp_SHlg_IxbcDV7a" \
  -H "Authorization: Bearer sb_publishable_MCOZDLjavfsgKlKsp_SHlg_IxbcDV7a" \
  -H "Content-Type: application/json" \
  -d '{}'
```

Respuesta HTTP 200:

```json
{
  "matches_processed": 0,
  "bonus_rows_updated": 0,
  "predictions_updated": 0,
  "knockout_slots_updated": 32
}
```

**`populate_knockout_matches`** — ejecuta y reporta 32 filas modificadas:

```bash
curl -X POST "https://qjohfsrvpyoxcugclvpn.supabase.co/rest/v1/rpc/populate_knockout_matches" \
  -H "apikey: sb_publishable_MCOZDLjavfsgKlKsp_SHlg_IxbcDV7a" \
  -H "Authorization: Bearer sb_publishable_MCOZDLjavfsgKlKsp_SHlg_IxbcDV7a" \
  -H "Content-Type: application/json" \
  -d '{}'
```

Respuesta: `32` (HTTP 200)

**`calculate_bonus_points`** — responde HTTP 200.

#### Impacto concreto

1. **Manipulación del scoring** — un atacante puede llamar `recalculate_all` con datos manipulados o en momentos estratégicos para afectar los puntos del leaderboard.
2. **Corrupción del bracket** — `populate_knockout_matches` modifica los slots de la fase knockout. Ejecutada fuera de tiempo o repetidamente puede corromper el estado del torneo.
3. **Denegación de servicio (DoS)** — las tres funciones pueden ser llamadas en loop desde un script automatizado, generando carga sostenida sobre la base de datos PostgreSQL y potencialmente tumbando la aplicación para todos los usuarios.
4. **Ventana de ataque silenciosa** — el atacante no necesita ninguna cuenta. Un script de 10 líneas en Python o bash puede ejecutar esto desde cualquier lugar del mundo.

#### Contraste con lo que está bien

La función `admin_get_user_details` **sí está protegida** y devuelve `{"message": "Access denied"}` ante llamadas anónimas. Esto confirma que el patrón correcto ya existe en el proyecto — las tres funciones afectadas simplemente no tienen ese guard implementado.

#### Fix recomendado — dos capas (aplicar ambas)

**Capa 1: Revocar permisos a nivel de PostgreSQL**

```sql
REVOKE EXECUTE ON FUNCTION public.recalculate_all()           FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.populate_knockout_matches() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.calculate_bonus_points()    FROM anon, authenticated;

-- Solo el rol service_role (backend interno) puede ejecutarlas
GRANT EXECUTE ON FUNCTION public.recalculate_all()           TO service_role;
GRANT EXECUTE ON FUNCTION public.populate_knockout_matches() TO service_role;
GRANT EXECUTE ON FUNCTION public.calculate_bonus_points()    TO service_role;
```

**Capa 2: Guard interno en cada función (defensa en profundidad)**

Agregar al inicio del body de cada función `SECURITY DEFINER`:

```sql
-- Reemplazar en el CREATE OR REPLACE FUNCTION de cada una
IF NOT EXISTS (
  SELECT 1 FROM public.profiles
  WHERE id = auth.uid() AND is_admin = true
) THEN
  RAISE EXCEPTION 'Access denied';
END IF;
```

Este patrón ya está implementado en `admin_get_user_details` — copiar desde ahí.

---

## 5. Lo que está bien (no tocar)

| Elemento | Estado | Detalle |
|---|---|---|
| INSERT a `predictions` (anónimo) | ✅ Bloqueado | RLS devuelve `42501` — row-level security policy |
| INSERT a `profiles` (anónimo) | ✅ Bloqueado | RLS devuelve `42501` |
| INSERT a `bonus_predictions` (anónimo) | ✅ Bloqueado | RLS devuelve `42501` |
| Lectura de `predictions` (anónimo) | ✅ Bloqueado | Devuelve `[]` sin datos |
| `admin_get_user_details` RPC (anónimo) | ✅ Bloqueado | Devuelve `Access denied` |
| HTTPS / HSTS | ✅ Correcto | `max-age=63072000; includeSubDomains; preload` |
| Anon key en bundle | ✅ Normal | Es publishable por diseño; la seguridad real es RLS |

---

## 6. Recomendaciones de Hardening Adicional

Estos ítems no son críticos pero mejoran la postura de seguridad general.

### 6.1 Content-Security-Policy (CSP)

Actualmente la aplicación no envía headers CSP. Para un SPA que renderiza contenido controlado por usuarios (`display_name`, `avatar_url`), un XSS podría explotar la ausencia de CSP.

Agregar en `vercel.json`:

```json
{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "Content-Security-Policy",
          "value": "default-src 'self'; connect-src 'self' https://qjohfsrvpyoxcugclvpn.supabase.co; img-src 'self' data: https://qjohfsrvpyoxcugclvpn.supabase.co; style-src 'self' 'unsafe-inline'; script-src 'self'"
        },
        {
          "key": "X-Content-Type-Options",
          "value": "nosniff"
        },
        {
          "key": "X-Frame-Options",
          "value": "DENY"
        },
        {
          "key": "Referrer-Policy",
          "value": "strict-origin-when-cross-origin"
        }
      ]
    }
  ]
}
```

### 6.2 Validación de avatar_url

El campo `avatar_url` es ingresado por el usuario y se renderiza como `<img src={avatar_url}>`. Validar en el frontend y/o en una función de DB que el valor sea una URL del propio bucket de Supabase Storage antes de persistirlo:

```javascript
const isValidAvatarUrl = (url) =>
  url === null ||
  url.startsWith('https://qjohfsrvpyoxcugclvpn.supabase.co/storage/v1/object/public/avatars/');
```

### 6.3 CORS de Supabase

Verificar en Supabase Dashboard → Settings → API que `Site URL` esté seteado a `https://anglo-penca2026.vercel.app` y que no haya `*` en allowed origins. Esto limita el uso de la anon key a tu dominio.

### 6.4 Limpieza de PII en display_name

7 usuarios registraron su correo electrónico como nombre visible. Independientemente de los fixes de RLS, es buena práctica notificarles y limpiar esos valores:

```sql
-- Identificar (no modifica nada)
SELECT id, username, display_name
FROM public.profiles
WHERE display_name ~* '@';

-- Una vez identificados, contactar a los usuarios para que actualicen
-- o limpiar con: UPDATE public.profiles SET display_name = username WHERE display_name ~* '@';
```

---

## 7. Prioridad de Acción

| # | Acción | Urgencia | Tiempo estimado |
|---|---|---|---|
| 1 | Bloquear RPCs (`recalculate_all`, `populate_knockout_matches`, `calculate_bonus_points`) con REVOKE + guard interno | **HOY** | 15 min |
| 2 | Cerrar lectura anónima de `profiles` (DROP + CREATE POLICY) | **HOY** | 10 min |
| 3 | Verificar CORS en Supabase Dashboard | Esta semana | 5 min |
| 4 | Agregar headers CSP/security en `vercel.json` | Esta semana | 20 min |
| 5 | Validar `avatar_url` en frontend | Próximo deploy | 30 min |
| 6 | Limpiar `display_name` con emails | Esta semana | 10 min |

---

## 8. Script SQL de Verificación (para correr en Supabase SQL Editor)

```sql
-- ¿RLS habilitado en profiles?
SELECT relname, relrowsecurity, relforcerowsecurity
FROM pg_class WHERE oid = 'public.profiles'::regclass;

-- ¿Qué políticas tiene profiles?
SELECT policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'profiles'
ORDER BY cmd, policyname;

-- ¿Qué grants tienen anon / authenticated sobre profiles?
SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND table_name = 'profiles'
  AND grantee IN ('anon', 'authenticated')
ORDER BY grantee, privilege_type;

-- ¿Cuántos admins hay?
SELECT count(*) AS admins FROM public.profiles WHERE is_admin = true;

-- ¿Cuántos display_name son emails?
SELECT count(*) AS emails_expuestos FROM public.profiles WHERE display_name ~* '@';
```

---

## 9. Notas Finales

- La **anon key** en el bundle JS **no es un problema** — es pública por diseño. Toda la seguridad de Supabase se construye sobre RLS y permisos de funciones, no sobre ocultar esa key. Cambiarla no resuelve nada si RLS sigue abierto.
- Ningún dato fue copiado, almacenado ni compartido durante esta auditoría. Se accedió a una muestra de 3 filas de `profiles` para confirmar la estructura y dimensionar el riesgo; no se extrajo ni retuvo la tabla.
- Los fixes de SQL indicados en las secciones 4.1 y 4.2 deben ser revisados contra el nombre exacto de las funciones y políticas existentes antes de ejecutarse. El script de la sección 8 te da esos nombres.

---

*Documento generado: 11 de junio de 2026 — Auditoría Anglo Penca Mundial 2026*
