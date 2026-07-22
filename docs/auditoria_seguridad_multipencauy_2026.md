# Auditoría de Seguridad — PencaLes 2.0 (MultiPencaUy)

**Proyecto Supabase auditado:** `twdruhhhnsbrpyzlfxmg` (producción, `VITE_SUPABASE_URL` del `.env` local)
**Fecha:** 22 de julio de 2026
**Metodología:** Revisión estática del código (RLS, RPCs `SECURITY DEFINER`, funciones serverless `api/*.ts`, frontend) + pruebas activas no destructivas contra la REST API de Supabase en producción con la anon key pública. Ninguna fila fue creada, modificada ni eliminada durante la auditoría.

---

## 1. Resumen ejecutivo

Comparado con la auditoría previa de la app predecesora (`docs/auditoria_seguridad_anglo_penca2026.md`), este proyecto está en una postura **considerablemente mejor**: los dos hallazgos críticos de aquella auditoría (lectura anónima de `profiles`, RPCs de recálculo invocables sin autenticar) ya están corregidos aquí y además hay una migración dedicada (`105_security_hardening.sql`) que endurece un patrón similar. Las pruebas activas contra la API en vivo no encontraron ninguna fuga de datos ni mutación no autenticada.

Se identificó **1 hallazgo de severidad alta** (escalación de privilegios en el reseteo de contraseña por admin), **1 de severidad media** (inconsistencia de control de acceso sobre el código de invitación), **1 hallazgo funcional que falla en modo seguro** (columna inexistente bloquea sin querer una feature de admin) y **vulnerabilidades de dependencias** con parches disponibles, incluida una en `react-router-dom` (paquete de producción, no solo build tooling).

**Estado general: sin hallazgos críticos explotables por un atacante anónimo. Sí hay una vía real de escalación de privilegios para un rol ya autenticado (tenant-admin) y dependencias de producción desactualizadas que conviene resolver antes de crecer el número de tenants.**

**Actualización 22/07/2026 — los 4 hallazgos quedaron resueltos**, incluyendo el despliegue en producción de la migración de base de datos (Hallazgo 2). Ver el estado detallado en cada sección y la tabla de prioridades (§5).

---

## 2. Hallazgos

### HALLAZGO 1 — Escalación de privilegios en `api/admin-reset-password.ts`

**Severidad:** ALTA
**Tipo:** Broken Access Control / CWE-863 (Incorrect Authorization)
**Confirmado:** Sí, por lectura del código (`api/admin-reset-password.ts:40-69`)
**Estado:** ✅ **RESUELTO** (22/07/2026). Se agregó el guard anti-escalación descrito abajo en la rama de tenant-admin: un tenant-admin ya no puede resetear a un super-admin ni a un admin de otro tenant que él no administre, aunque compartan una penca pública. Verificado con `tsc` + `eslint`.

#### Descripción

El endpoint autoriza a un tenant-admin a resetear la contraseña de cualquier `user_id` que sea **miembro de alguna penca de su tenant** (líneas 50-66). No hay ninguna verificación de que el **target** no sea a su vez un `super_admin` de la plataforma, ni admin de **otro** tenant. La única gate es "¿el que llama administra un tenant del que el target es miembro?" — nunca "¿el target tiene un privilegio igual o mayor que el que llama?".

Como `join_ten_comp_public` (03_functions_views.sql:578) permite a **cualquier usuario autenticado** unirse a una penca pública al instante, y el tenant "Publico" aloja varias pencas públicas abiertas a todos, un usuario cualquiera —incluido un super-admin haciendo pruebas, o el admin de otro tenant participando por diversión— puede terminar siendo "miembro" de una penca administrada por un tenant-admin sin relación de confianza con esa persona.

#### Escenario de explotación concreto

1. Un super-admin de la plataforma se une (como jugador normal) a una penca pública del tenant "Publico" — algo natural para probar la UX.
2. Un tenant-admin legítimo de **otro** tenant (con acceso ya otorgado por el super-admin para administrar *su propio* negocio) llama a `POST /api/admin-reset-password` con el `user_id` de ese super-admin.
3. El endpoint solo valida "¿soy admin de un tenant cuyas pencas incluyen a este usuario?" → si el tenant-admin administra también alguna penca de "Publico" (o si el super-admin se unió a una penca del propio tenant del atacante), la respuesta es `authorized = true`.
4. El endpoint devuelve la contraseña temporal en el body (`password`) y fuerza `must_change_password`. El tenant-admin ahora puede loguearse como el super-admin antes de que este note el cambio.

El mismo patrón aplica entre dos tenant-admins de distintas empresas: uno puede secuestrar la cuenta del otro si ambos comparten una penca pública.

#### Impacto

- Toma de cuenta (account takeover) de cualquier usuario, incluido un super-admin, por parte de un tenant-admin sin relación de negocio con esa cuenta.
- Rompe el modelo de aislamiento multi-tenant: un tenant-admin solo debería poder gestionar contraseñas de miembros de **su propio** tenant, nunca de cuentas con igual o mayor privilegio.

#### Fix recomendado

Agregar, antes de autorizar por membresía, una verificación explícita de que el target no es super-admin ni admin de un tenant ajeno al que administra el que llama:

```ts
// Después de obtener callerProfile:
const { data: targetProfile } = await supabaseAdmin
  .from('profiles')
  .select('is_super_admin')
  .eq('id', targetId)
  .single()

if (targetProfile?.is_super_admin) {
  return res.status(403).json({ error: 'No autorizado para resetear a este usuario' })
}

// Y en la rama de "admin de tenant", excluir si el target administra OTRO tenant
// distinto de los que administra el caller:
const { data: targetRoles } = await supabaseAdmin
  .from('tenant_roles')
  .select('tenant_id')
  .eq('user_id', targetId)
  .eq('role', 'admin')

const targetAdminsElsewhere = (targetRoles ?? [])
  .some(r => !adminTenantIds.includes(r.tenant_id))
if (targetAdminsElsewhere) {
  return res.status(403).json({ error: 'No autorizado para resetear a este usuario' })
}
```

Alternativa más simple y más segura: restringir el reset por tenant-admin a targets que **no tengan ningún rol en `tenant_roles`** (es decir, solo "usuarios simples"), dejando el reset de cualquier admin exclusivamente al super-admin. Esto es más fácil de razonar y cierra el vector por completo.

---

### HALLAZGO 2 — El `join_code` de una penca privada es legible por cualquier miembro aprobado, no solo por el admin

**Severidad:** MEDIA
**Tipo:** Broken Access Control / inconsistencia de diseño
**Confirmado:** Sí, por lectura de la política RLS (`02_rls.sql:210-211`). No explotado en vivo porque en producción las 4 pencas existentes son públicas (`Content-Range: 0-0/4`, ninguna `visibility=private` todavía).
**Estado:** ✅ **RESUELTO** (22/07/2026), opción 1. Migración `112_join_code_column_grant.sql`: `REVOKE SELECT (join_code) ON ten_comps FROM authenticated` + RPC `admin_get_tenant_join_codes(p_tenant)` (`SECURITY DEFINER`, guardada por `is_tenant_admin`) para reponer la única lectura legítima que dependía del `SELECT` directo (`fetchTenantTenComps` en `src/services/v2/adminService.ts`, usada por `/t/:slug/admin`). Verificado con `tsc` que nada más en el frontend seleccionaba `join_code` fuera de las RPC ya existentes (`admin_get_ten_comp_join_code` en `emailService.ts`). **Migración aplicada en producción el 22/07/2026** (corrida manualmente por el usuario vía SQL Editor de Supabase) — el `REVOKE` y la RPC ya están activos en `twdruhhhnsbrpyzlfxmg`.

#### Descripción

La intención documentada (`CLAUDE.md`, migración `101_invitations.sql`) es que el código de acceso de una penca privada solo se obtenga vía la RPC `admin_get_ten_comp_join_code`, guardada por `is_ten_comp_admin(p_ten_comp)`. Sin embargo, la política de lectura de la tabla base es a nivel de fila, no de columna:

```sql
-- 02_rls.sql:210-211
CREATE POLICY "ten_comps_read" ON ten_comps FOR SELECT
  USING (visibility = 'public' OR is_member(id) OR is_ten_comp_admin(id));
```

`is_member(id)` (no solo `is_ten_comp_admin`) habilita la fila completa — incluida la columna `join_code` — para cualquier miembro **aprobado** de esa penca privada, vía REST directo:

```
GET /rest/v1/ten_comps?id=eq.<privado>&select=join_code
Authorization: Bearer <jwt de un miembro cualquiera>
```

Esto no expone el código a gente fuera de la penca (que no cumple `is_member`), pero sí anula el control que el admin cree tener: cualquier miembro puede leer y redistribuir el código de invitación sin pasar por el admin, contradiciendo el modelo de "el admin decide a quién invitar".

#### Fix recomendado

Dos opciones, de menor a mayor esfuerzo:

1. **Restringir columna a nivel de grant** (recomendado, cambio acotado): revocar `SELECT` sobre la columna `join_code` para `authenticated` y otorgarla solo vía la RPC `SECURITY DEFINER` que ya existe:
   ```sql
   REVOKE SELECT (join_code) ON ten_comps FROM authenticated;
   -- admin_get_ten_comp_join_code sigue funcionando: corre como el dueño de la función.
   ```
   Verificar que ningún servicio del frontend dependa hoy de leer `join_code` vía `select('*')` sobre `ten_comps` (grep rápido en `src/services/v2/adminService.ts` antes de aplicar).

2. **Vista sin la columna**: crear una vista `ten_comps_public` sin `join_code` y apuntar ahí las lecturas de frontend que no sean del admin, dejando la tabla base sin política de `SELECT` para miembros no-admin.

La opción 1 es más simple y no rompe el modelo de RLS existente.

---

### HALLAZGO 3 — `api/football-data.ts`, `api/api-football.ts`, `api/sportsdb.ts` referencian una columna inexistente (`profiles.is_admin`)

**Severidad:** BAJA (falla en modo seguro — no es explotable, es un bug funcional)
**Confirmado:** Sí, `01_schema.sql:19-27` solo define `is_super_admin`, no `is_admin`.
**Estado:** ✅ **RESUELTO** (22/07/2026). Reemplazado `is_admin` → `is_super_admin` en las tres funciones (`api/football-data.ts`, `api/api-football.ts`, `api/sportsdb.ts`). Verificado con `tsc`.

#### Descripción

Las tres funciones serverless usan:
```ts
const { data: profile } = await supabaseAdmin.from('profiles').select('is_admin').eq('id', user.id).single()
if (!profile?.is_admin) return res.status(403).json({ error: 'No autorizado' })
```
`is_admin` no existe en el schema v2 (es un remanente de v1, donde sí existía ese flag booleano plano). La query de Supabase devuelve error de columna inexistente → `profile` queda `null`/`undefined` → `profile?.is_admin` es `undefined` → **siempre 403**, para cualquier usuario, incluido un super-admin real.

No es un hallazgo de seguridad (falla cerrado, no abierto), pero significa que la pantalla `/admin/resultauto` (mencionada en `CLAUDE.md` como "solo lectura, resultados automáticos") está actualmente inutilizable en producción para todo el mundo.

#### Fix recomendado

Reemplazar en las tres funciones:
```ts
const { data: profile } = await supabaseAdmin.from('profiles').select('is_super_admin').eq('id', user.id).single()
if (!profile?.is_super_admin) return res.status(403).json({ error: 'No autorizado' })
```

---

### HALLAZGO 4 — Dependencias de producción con vulnerabilidades conocidas

**Severidad:** ALTA para `react-router-dom` (paquete de producción), MEDIA para `nodemailer` (solo `api/send-email.ts`, superficie acotada), BAJA para el resto (herramientas de build, no llegan al navegador)
**Estado:** ✅ **RESUELTO** (22/07/2026) para las dependencias de producción. `npm audit fix` subió `react-router-dom`/`react-router` a `7.18.1` dentro del mismo rango `^7.13.2` de `package.json` (sin cambios de API, no se usan `loader`/`action`). `nodemailer` requería salto de major para salir del rango vulnerable (`<=9.0.0`); se instaló `^9.0.3` — API de `createTransport`/`sendMail` usada en `api/send-email.ts` sin cambios, tipos ahora vienen del propio paquete (se puede desinstalar `@types/nodemailer`, ya sin versión 9.x). Verificado con `tsc -b && vite build` y `npm audit --omit=dev` → **0 vulnerabilidades** en dependencias de producción. Quedan pendientes `tar`/`ws`/`brace-expansion`/`@xmldom/xmldom`/`undici`/`uuid`, todas transitivas de devDependencies (Capacitor, `@vercel/node`) — fuera del bundle servido al navegador, ver ítem 6 de la tabla de prioridades.

`npm audit` sobre dependencias de producción:

| Paquete | Versión instalada | Rango vulnerable | Severidad | Notas |
|---|---|---|---|---|
| `react-router-dom` | 7.13.2 | 7.0.0-pre.0 – 7.14.1 | **Alta** | RCE vía deserialización de `turbo-stream` (GHSA-49rj-9fvp-4h2h), open redirect `//host`, CSRF en PUT/PATCH/DELETE, DoS. Se sirve al navegador — impacto real. |
| `react-router` | (dependencia de la anterior) | 7.0.0 – 7.15.0 | Alta | Mismas CVEs. |
| `nodemailer` | 8.0.7 | ≤ 9.0.0 | Alta | Bypass de `disableFileAccess`/`disableUrlAccess`, SSRF vía opción `raw`. Mitigado en parte porque `send-email.ts` (`api/send-email.ts:76-82`) no expone `raw` ni acepta HTML controlado por el llamante directamente — el `body_html` lo arma `emailService.ts` server-side desde datos ya en la cola —, pero conviene actualizar igual. |
| `tar`, `ws`, `brace-expansion`, `@xmldom/xmldom` | — | varias | Alta/Crítica | Transitivas de tooling de build/Capacitor — no se embeben en el bundle servido al navegador. Riesgo de supply-chain en tiempo de build, no en producción runtime. |

#### Fix recomendado

```bash
npm audit fix
# Si react-router-dom no sube de major automáticamente, forzar:
npm install react-router-dom@latest
npm run build   # validar que las rutas /p/:slug/* y el Layout anidado siguen funcionando
```
Revisar el changelog de React Router 7.15→actual por breaking changes en `loader`/`action` antes de mergear (no se usan en este proyecto ya que la data fetching es TanStack Query, así que el riesgo de romper algo es bajo).

---

## 3. Lo que está bien (no tocar)

| Elemento | Estado |
|---|---|
| Lectura anónima de `profiles`, `predictions`, `email_queue`, `tenant_roles` | ✅ Bloqueada (`[]` o RLS `42501`) |
| INSERT anónimo a `predictions` | ✅ Bloqueado, `42501` |
| RPCs de orquestación (`recalculate_all`, `set_match_result`, `calculate_match_points`, `calculate_bonus_points`, `populate_knockout`, `engine_wc48_best_thirds`) | ✅ Guardadas por `can_load_results()`, confirmado en código y en vivo (`admin_delete_tenant` anónimo → `Access denied`) |
| RPCs admin (`admin_get_user_details`, `admin_get_ten_comp_join_code`, `admin_get_all_user_emails`, `admin_delete_competition/tenant`) | ✅ Guardadas por `is_ten_comp_admin`/`is_super_admin`, confirmado en vivo |
| Vista `leaderboard` | ✅ Ya endurecida en `105_security_hardening.sql` para respetar visibilidad de pencas privadas |
| `profiles_update_own` | ✅ `WITH CHECK` impide que un usuario escale `is_super_admin`/`is_active` en su propia fila |
| CSP / headers (`vercel.json`) | ✅ CSP estricta con `object-src 'none'`, `frame-ancestors 'none'`, `script-src 'self'` + Turnstile únicamente |
| `.env` con secretos reales | ✅ Nunca commiteado (`.gitignore` cubre `.env*`, `git log` sobre `.env` vacío) |
| Frontend | ✅ Sin `dangerouslySetInnerHTML`/`innerHTML`, React escapa por defecto |
| `api/football-data.ts` anti-SSRF | ✅ Doble validación de host antes y después de construir la URL |
| CORS `Access-Control-Allow-Origin: *` de Supabase REST | ✅ Es el comportamiento esperado/documentado de Supabase — la seguridad real la da RLS, no CORS |

---

## 4. Nota fuera de alcance

- **✅ RESUELTO / verificado en producción (22/07/2026).** El `.env` local tenía `SUPABASE_URL` apuntando al proyecto `twdruhhhnsbrpyzlfxmg` pero el JWT de `SUPABASE_SERVICE_ROLE_KEY` en ese mismo archivo traía `"ref":"kxwwkdpxhcrfevauhpgy"` — un proyecto Supabase **distinto** (el de la migración/legacy). Se corrigió el `.env` local para que ambas variables pertenezcan al mismo proyecto, y se verificó en Vercel → Settings → Environment Variables que `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` de **producción** ya correspondían al proyecto correcto (`twdruhhhnsbrpyzlfxmg`). No había, por tanto, impacto en producción; el desajuste era solo del archivo local.

---

## 5. Prioridad de acción

| # | Acción | Urgencia | Tiempo estimado |
|---|---|---|---|
| 1 | ✅ **HECHO** — Cerrar escalación de privilegios en `admin-reset-password.ts` (Hallazgo 1) | **Ya** | 20 min |
| 2 | ✅ **HECHO** — `.env` corregido y verificado en Vercel: `SUPABASE_SERVICE_ROLE_KEY` de prod pertenece al mismo proyecto que `SUPABASE_URL` (nota §4) | **Ya** | 5 min |
| 3 | ✅ **HECHO** — `REVOKE SELECT (join_code)` + RPC `admin_get_tenant_join_codes` (Hallazgo 2); migración `112` aplicada en producción | Esta semana | 30 min |
| 4 | ✅ **HECHO** — Actualizado `react-router-dom`/`react-router` (7.18.1) y `nodemailer` (^9.0.3), `npm audit fix`, `tsc -b && vite build` OK (Hallazgo 4) | Esta semana | 45 min |
| 5 | ✅ **HECHO** — `profiles.is_admin` → `is_super_admin` en las 3 funciones de fútbol externo (Hallazgo 3) | Próximo deploy | 10 min |
| 6 | (Opcional, bajo impacto) Actualizar `tar`/`ws`/`brace-expansion`/`xmldom` de devDependencies | Cuando convenga | 15 min |

---

*Documento generado: 22 de julio de 2026 — Auditoría PencaLes 2.0 / MultiPencaUy*
