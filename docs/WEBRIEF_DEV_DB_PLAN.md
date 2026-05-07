# WeBrief — Plan: separar Supabase Dev vs Prod (free tier)

Updated: 2026-05-06 (sesión 9).

## Objetivo

Hoy todo (local + VPS) usa el mismo proyecto Supabase Prod (`gmrlhhszrdahcxyoywvt`). Eso significa que cualquier experimento local (migraciones, seeds, RLS, schema) toca data real. Queremos un proyecto Supabase **Dev** separado para desarrollo local; Prod queda intacto y solo lo usa el VPS.

Restricción: gratis. Free tier de Supabase permite hasta 2 proyectos activos por organización. Si la org actual ya tiene 2, abrimos cuenta/org nueva (también free).

## Contexto que NO cambia

- VPS sigue apuntando a Prod (no se toca).
- Backend/frontend usan los mismos env var names (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`); solo cambian los valores en local.
- ImageKit y Resend siguen siendo cuentas únicas; les agregamos un prefix/flag para no mezclar dev y prod.
- Migraciones SQL siguen siendo la fuente de verdad (`supabase/migrations/`).

## Fases

### 1. Crear proyecto Supabase Dev

1. Login en [supabase.com](https://supabase.com).
2. Probar primero en la org actual (`Adrian's Org`). Click "New Project".
   - Si te deja crear → seguir.
   - Si dice "free tier limit reached (2 projects)" → crear cuenta nueva con otro email (ej. `+dev` alias) y nueva org.
3. Configuración del proyecto:
   - **Name**: `WeBrief Dev`
   - **Database password**: generar random (Supabase ofrece botón) y guardar en password manager.
   - **Region**: `us-west-2` (igual que Prod, para que las latencies sean comparables).
   - **Plan**: Free.
4. Esperar ~2 min a que provisione. Anotar el `PROJECT_REF` (la cadena tipo `abcdefghijk` en la URL del dashboard).

### 2. Aplicar schema + migraciones a Dev

El schema base vive en `supabase/schema.sql` y las migraciones incrementales en `supabase/migrations/`. Hay que aplicar todo en orden a Dev.

Vía MCP supabaseLocal (más rápido, requiere cambiar el `.env` del MCP a apuntar a Dev primero) o vía Dashboard SQL Editor (copy-paste por archivo).

**Vía MCP supabaseLocal** (recomendado):

1. Crear archivo aparte `mcp-supabase/.env.dev` con:
   ```
   SUPABASE_URL=https://<DEV_REF>.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=<service role key del proyecto Dev>
   SUPABASE_DB_URL="postgresql://postgres.<DEV_REF>:<DEV_PASSWORD>@aws-1-us-west-2.pooler.supabase.com:6543/postgres"
   ALLOWED_SQL_ROOT="/Users/adrian/GitHub/webbrief/supabase"
   ```
2. Agregar entrada nueva en `~/.codex/config.toml` y `~/.claude.json`:
   ```toml
   [mcp_servers.supabaseDev]
   command = "node"
   args = [
     "--env-file=/Users/adrian/GitHub/mcp-supabase/.env.dev",
     "/Users/adrian/GitHub/mcp-supabase/src/index.js",
   ]
   ```
   La entrada `supabaseLocal` actual queda apuntando a Prod (renombrar mentalmente a "supabaseProd" o renombrarla literalmente a `supabaseProd`).
3. Reabrir Codex/Claude Code para que cargue ambos MCPs.
4. Aplicar `supabase/schema.sql` completo a Dev usando `mcp__supabaseDev__run_sql` (allow_destructive=true, porque tiene `create or replace` que incluye `update`/`delete` en el regex defensivo del MCP).
5. Aplicar cada migración en `supabase/migrations/` en orden alfabético usando `mcp__supabaseDev__apply_migration_file`. Las que tienen `update`/`delete` en function bodies (ej. `rate_limit_buckets`) requieren `allow_destructive=true`.

**Vía Dashboard SQL Editor** (alternativa sin MCP):

1. Abrir el proyecto Dev → SQL Editor → New query.
2. Copiar contenido de `supabase/schema.sql`, ejecutar.
3. Por cada archivo en `supabase/migrations/`, copiar y ejecutar uno a uno.

Verificación post-aplicación (Dashboard → Database → Tables): deben existir todas las tablas que tiene Prod (companies, profiles, projects, project_pages, security_events, security_blocks, rate_limit_buckets, etc.).

### 3. Storage buckets

En Supabase Dashboard del proyecto Dev → Storage → New bucket. Crear los 3:

- `project-assets` — **Public**, file size limit 8 MB, MIME `image/jpeg, image/png, image/webp, image/svg+xml`.
- `user-avatars` — **Public**, file size limit 2 MB, MIME `image/jpeg, image/png, image/webp`.
- `brief-documents` — **Private**, file size limit 50 MB, MIME `Any` (backend ya filtra).

### 4. Auth setup

Dashboard → Authentication del proyecto Dev:

- **URL Configuration**:
  - Site URL: `http://localhost:5173`
  - Redirect URLs: solo `http://localhost:5173/auth/set-password` (sin webrief.app — eso queda Prod-only).
- **Providers → Email**:
  - `Allow new users to sign up` = **OFF**.
  - `Confirm email` = ON.
  - `Minimum password length` = 12 (consistencia con Prod).
- **Crear primer admin**:
  - Authentication → Users → Add user (email + password).
  - Después del create, vía SQL Editor: `update public.profiles set platform_role='admin' where id = '<user_id>';` (verificar que el insert en profiles ocurra automáticamente; si no, crear la fila a mano).
- **Email** (opcional):
  - Para no mandar emails reales en dev, dejá el SMTP default de Supabase (sandbox limitado a tu propio email). NO conectes Resend al Dev a menos que quieras emails reales.

### 5. Switchear envs locales a Dev

Los archivos `.env` actuales locales apuntan a Prod. Reemplazarlos:

1. Backup primero (por si querés volver a apuntar a Prod):
   ```bash
   cp /Users/adrian/GitHub/webbrief/backend/.env /Users/adrian/GitHub/webbrief/backend/.env.prod-backup
   cp /Users/adrian/GitHub/webbrief/frontend/.env /Users/adrian/GitHub/webbrief/frontend/.env.prod-backup
   ```
2. Editar `backend/.env`:
   - `SUPABASE_URL=https://<DEV_REF>.supabase.co`
   - `SUPABASE_SERVICE_ROLE_KEY=<service role del Dev>`
   - `FRONTEND_URL=http://localhost:5173` (probablemente ya estaba).
3. Editar `frontend/.env`:
   - `VITE_SUPABASE_URL=https://<DEV_REF>.supabase.co`
   - `VITE_SUPABASE_ANON_KEY=<anon del Dev>`
4. Editar `mcp-supabase/.env` para que apunte a Dev (mover el contenido actual de prod a `mcp-supabase/.env.prod`).

Reiniciar backend local (`cd backend && npm run dev`) y frontend (`cd frontend && npm run dev`). Login con el admin Dev creado en paso 4.

### 6. ImageKit (cuenta única, separar carpetas)

Para que dev no contamine los uploads reales de prod en ImageKit, agregar prefix.

Cambios de código necesarios (commit aparte):

1. Backend `backend/src/lib/imagekit.js`:
   ```js
   const FOLDER_PREFIX = process.env.IMAGEKIT_FOLDER_PREFIX || ''
   ```
   Y en cada `imagekit.upload({...})` prefixear el `folder`:
   ```js
   folder: `${FOLDER_PREFIX}${originalFolder}`.replace(/\/+/g, '/'),
   ```
2. `backend/.env` (local): `IMAGEKIT_FOLDER_PREFIX=dev/`
3. `backend/.env` del VPS: `IMAGEKIT_FOLDER_PREFIX=` (vacío) o `prod/` para mayor claridad.
4. Documentar en `CONTEXT.md` el nuevo env var.

Resultado: assets de dev quedan en `imagekit/dev/...`, prod en `imagekit/...` (o `imagekit/prod/...`).

### 7. Resend (cuenta única, gate de envío)

Para que dev no spammee emails reales:

Cambios de código:

1. Backend, donde se envíe email: leer `EMAIL_ENABLED` (default `true`); si es `false`, hacer log del email y skipear el send.
   ```js
   const emailEnabled = process.env.EMAIL_ENABLED !== 'false'
   if (!emailEnabled) {
     console.log('[email] skipped (EMAIL_ENABLED=false):', { to, subject })
     return
   }
   await resend.emails.send(...)
   ```
2. `backend/.env` (local): `EMAIL_ENABLED=false`
3. `backend/.env` del VPS: `EMAIL_ENABLED=true` (o no setearlo, ya que default es true).

Alternativa más sofisticada: usar [Mailpit](https://github.com/axllent/mailpit) (SMTP local) o [Resend test mode](https://resend.com/docs/dashboard/api-keys/managing-api-keys#test-mode) para inspeccionar emails en dev sin enviarlos.

### 8. Verificación end-to-end del Dev

Después de todo lo anterior:

1. Backend local arranca sin warnings (`npm run dev` en `backend/`).
2. Frontend local arranca, login con el admin Dev creado.
3. Crear una empresa de prueba (`testMode=true` para skipear invite manager).
4. Crear un proyecto en esa empresa.
5. Editar el proyecto, guardar, ver que `project_pages.content_html` se persiste.
6. Subir una imagen al editor, ver que aparezca en ImageKit con prefix `dev/`.
7. Llamar `mcp__supabaseDev__check_connection` desde Codex/Claude → `db.ok=true`.

Si todo eso pasa → Dev operativo.

### 9. Workflow nuevo de cambios de schema

Hasta ahora aplicabas migraciones directamente a Prod. Con dos DBs:

1. Cada nueva migración escribís en `supabase/migrations/` con timestamp.
2. Aplicar primero a **Dev** vía MCP (`mcp__supabaseDev__apply_migration_file`).
3. Validar local (correr backend, hacer la operación afectada, ver que no rompe).
4. Aplicar a **Prod** vía MCP (`mcp__supabaseProd__apply_migration_file`) o vía remote MCP de Supabase (`mcp__751e3c22-...__apply_migration`).
5. Commit de la migración + deploy del código que la usa.

**Nunca** aplicar una migración a Prod sin haberla probado en Dev primero. Eso era el riesgo que CONTEXT.min.md ya marcaba en Pendings ("Create a separate Supabase Dev project before DB/schema experiments").

### 10. Documentación a actualizar al ejecutar este plan

- `CONTEXT.md`:
  - Agregar `IMAGEKIT_FOLDER_PREFIX` y `EMAIL_ENABLED` a la lista de env vars del backend.
  - Sección nueva "Dev vs Prod" explicando los dos proyectos Supabase.
- `CONTEXT.min.md`:
  - Bullet "Dev Supabase project active; local apunta a Dev, VPS apunta a Prod".
  - Quitar el pending viejo "Create a separate Supabase Dev project".
- `docs/WEBRIEF_OPERATIONS_GUIDE.md`:
  - Nueva sección "Workflow de migraciones" (orden Dev → Prod).
- `mcp-supabase/.env.example`:
  - Mostrar el patrón de tener `.env` (Dev) y `.env.prod` (Prod).

## Riesgos y mitigaciones

- **Aplicar mal una migración a Prod en lugar de Dev**: usar nombres distintos en MCP (`supabaseDev` vs `supabaseProd`); evitar tener ambos abiertos simultáneamente al ejecutar destructivos; doble-check del `project_id` antes de cada `apply_migration`.
- **Schema drift Dev/Prod**: si en algún momento Dev queda atrás, dropear todo y reaplicar `schema.sql` + migraciones desde cero. Dev no tiene data crítica, es seguro.
- **Free tier de Supabase Dev se pausa por inactividad** (7 días sin actividad → DB se pausa): bastante con tocar el dashboard o correr una query para reactivar. No bloquea trabajo.
- **Rate limits diferentes Dev vs Prod**: Free tier comparte cuotas con Prod si están en la misma org. Si rompés rate limits en dev, Prod también podría bloquearse temporal. Con cuenta separada se aísla.
- **Olvidar prefix en ImageKit/Resend**: validar tras el primer upload que el path contiene `dev/`; si no, revisar el código.

## Out of scope de este plan

- Branching de Supabase (Pro only).
- Local Supabase con Docker (`supabase start`) — alternativa futura si dev cloud queda lento.
- Seed automático de data fake en Dev (script `seed.sql`) — opcional, no necesario para empezar.
- CI/CD que aplique migraciones automáticamente — fuera de alcance hoy.

## Tiempo estimado

- Fase 1 (crear proyecto): 5 min.
- Fase 2 (schema + migraciones): 15 min via MCP / 30 min via Dashboard SQL.
- Fase 3 (buckets): 3 min.
- Fase 4 (auth + admin): 5 min.
- Fase 5 (switchear envs): 5 min.
- Fase 6 (ImageKit prefix code change): 30 min (incluye test + commit).
- Fase 7 (Resend gate code change): 15 min.
- Fase 8 (verificación end-to-end): 15 min.
- **Total**: ~1.5–2 h en una sentada.

## Cuándo ejecutarlo

Idealmente cuando vayas a trabajar una nueva feature que toque schema o RLS. Mientras solo estés tocando UI/lógica que no requiera DB experiments, podés seguir contra Prod sin problema (con cuidado).
