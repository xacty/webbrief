# WeBrief Operations Guide

## URLs

```text
Prod app: https://webrief.app
Prod API health: https://webrief.app/api/health
VPS SSH: deploy@199.192.22.74
Repo: git@github.com:xacty/webbrief.git
Production branch: main
```

## Local Frontend

```bash
cd /Users/adrian/GitHub/webbrief/frontend
npm install
npm run dev
```

Open:

```text
http://localhost:5173
```

Build:

```bash
cd /Users/adrian/GitHub/webbrief/frontend
npm run build
```

Audit:

```bash
cd /Users/adrian/GitHub/webbrief/frontend
npm audit
```

## Local Backend

```bash
cd /Users/adrian/GitHub/webbrief/backend
npm install
npm run dev
```

Health:

```bash
curl http://localhost:3000/api/health
```

## Local Env Files

Backend:

```bash
cd /Users/adrian/GitHub/webbrief/backend
nano .env
```

```env
SUPABASE_URL=https://PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=SECRET_KEY
FRONTEND_URL=http://localhost:5173
IMAGEKIT_PUBLIC_KEY=public_xxx
IMAGEKIT_PRIVATE_KEY=private_xxx
IMAGEKIT_URL_ENDPOINT=https://ik.imagekit.io/your_imagekit_id
PORT=3000
# Optional — transactional email via Resend
RESEND_API_KEY=re_xxx
COMMENTS_EMAIL_FROM=WeBrief <noreply@webrief.app>
AUTH_EMAIL_FROM=WeBrief <noreply@webrief.app>
```

Email env vars:

```text
RESEND_API_KEY        Required for real sends. If unset, email senders no-op.
COMMENTS_EMAIL_FROM   Sender for comment notifications. Default: WeBrief <noreply@webrief.app>.
AUTH_EMAIL_FROM       Sender for invite/recovery emails sent via Resend
                      (outside Supabase's native invite flow). Falls back
                      to COMMENTS_EMAIL_FROM if unset.
```

Frontend:

```bash
cd /Users/adrian/GitHub/webbrief/frontend
nano .env
```

```env
VITE_SUPABASE_URL=https://PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=PUBLISHABLE_KEY
```

## GitHub

Check changes:

```bash
cd /Users/adrian/GitHub/webbrief
git status
```

Commit and push:

```bash
cd /Users/adrian/GitHub/webbrief
git add .
git commit -m "Describe change"
git push origin main
```

Latest commits:

```bash
git log --oneline -5
```

## VPS Login

```bash
ssh deploy@199.192.22.74
```

Exit:

```bash
exit
```

## Manual Deploy To VPS

```bash
ssh deploy@199.192.22.74
cd /var/www/webrief
git pull origin main
```

Backend:

```bash
cd /var/www/webrief/backend
npm ci --omit=dev
pm2 restart webrief-backend --update-env
pm2 save
```

Frontend:

```bash
cd /var/www/webrief/frontend
npm ci
npm run build
```

Verify:

```bash
curl -I https://webrief.app
curl -I https://webrief.app/api/health
```

## Deploy Script

```bash
ssh deploy@199.192.22.74
cd /var/www/webrief
./scripts/deploy.sh
```

## Backend Status

```bash
ssh deploy@199.192.22.74
pm2 status
pm2 logs webrief-backend --lines 80
pm2 restart webrief-backend --update-env
```

Clear logs:

```bash
pm2 flush webrief-backend
```

## Nginx Status

```bash
ssh deploy@199.192.22.74
sudo nginx -t
sudo systemctl status nginx --no-pager
sudo systemctl reload nginx
```

Config file:

```text
/etc/nginx/sites-available/webrief.app
```

Repo copy:

```text
/var/www/webrief/deploy/nginx/webrief.app.conf
```

## HTTPS

Check renewal:

```bash
ssh deploy@199.192.22.74
sudo certbot renew --dry-run
```

## Server Status

```bash
ssh deploy@199.192.22.74
free -h
df -h
uptime
```

## Production Env Files On VPS

Backend:

```bash
ssh deploy@199.192.22.74
cd /var/www/webrief
ls -l backend/.env
```

Frontend:

```bash
ssh deploy@199.192.22.74
cd /var/www/webrief
ls -l frontend/.env.production
```

Do not commit:

```text
backend/.env
frontend/.env
frontend/.env.production
```

## Supabase Prod

Auth URLs:

```text
Site URL:
https://webrief.app

Redirect URLs:
https://webrief.app/**
https://www.webrief.app/**
https://webrief.app/auth/set-password
https://www.webrief.app/auth/set-password
http://localhost:5173/**
http://localhost:5173/auth/set-password
```

Storage buckets:

```text
project-assets
user-avatars
```

## Supabase Dev Recommended

Create:

```text
Supabase Dashboard -> New project -> WeBrief Dev
```

Apply schema:

```text
SQL Editor -> paste supabase/schema.sql -> Run
```

Create buckets:

```text
Storage -> New bucket -> project-assets -> Public
Storage -> New bucket -> user-avatars -> Public
```

Dev Auth URLs:

```text
Site URL:
http://localhost:5173

Redirect URLs:
http://localhost:5173/**
http://localhost:5173/auth/set-password
```

Use Dev keys locally:

```text
backend/.env -> DEV Supabase URL + DEV secret key
frontend/.env -> DEV Supabase URL + DEV publishable key
```

Keep Prod keys on VPS:

```text
/var/www/webrief/backend/.env
/var/www/webrief/frontend/.env.production
```

### Keepalive del free-tier

Dev free-tier se pausa tras ~7 días sin actividad. El workflow `.github/workflows/keepalive-supabase-dev.yml` hace un `GET` al REST API cada 5 días (`cron '0 12 */5 * *'`) y también acepta `workflow_dispatch` manual.

Secrets del repo `xacty/webbrief`:

```text
SUPABASE_DEV_URL       = https://iimqxacagxuemwgaunis.supabase.co
SUPABASE_DEV_ANON_KEY  = <anon/publishable key del proyecto Dev>
```

Trigger manual y verificación:

```bash
gh workflow run keepalive-supabase-dev.yml
gh run list --workflow=keepalive-supabase-dev.yml --limit 5
```

Si el cron falla varias corridas seguidas (ej. rotación de anon key), la DB terminará pausándose. GitHub notifica los failures por email al owner del repo por defecto.

## DB Change Flow

```text
1. Edit supabase/schema.sql
2. Run SQL in Supabase Dev
3. Test locally
4. Commit and push
5. Run SQL in Supabase Prod
6. Deploy VPS
7. Verify https://webrief.app/api/health
```

## Backups de la base de Prod

Prod está en el plan Free de Supabase, que **no incluye backups**. La única copia es un dump lógico nocturno que hacemos nosotros.

| Qué | Dónde |
|---|---|
| Workflow | `.github/workflows/backup-prod-db.yml` en el repo **privado** `xacty/webbrief-backups` |
| Horario | Todos los días a las 06:17 UTC, y a mano con `gh workflow run` |
| Contenido | `roles.sql`, `schema.sql` y `data.sql` (incluye `auth.users`), más `row-counts.tsv`, `manifest.txt` y `SHA256SUMS` |
| Formato | `webrief-prod-db-<fecha>.tar.gz.age`, cifrado con age hacia la clave pública del owner |
| Retención | 30 días (artifacts de GitHub Actions; se borran solos) |
| Clave privada | `~/.config/webrief-backups/prod-db-backup.agekey` en la Mac del owner, **más una copia en su gestor de contraseñas** |

- El workflow no vive en `xacty/webbrief` porque ese repo es público: cualquier usuario de GitHub puede descargar sus artifacts.
- **Sin la clave privada, los backups no se pueden leer.** Si se pierde, genera una nueva (ver "Rotación") y asume que los backups anteriores son inaccesibles.
- No cubre las imágenes (viven en ImageKit), la configuración de Auth/SMTP/buckets del dashboard ni los `.env` del VPS. Hoy Supabase Storage de Prod tiene 0 objetos.
- Si el dump sale vacío o faltan filas en `companies`, `projects`, `project_pages`, `profiles` o `auth.users`, el job falla.

### Configuración (una sola vez)

```text
Secret   SUPABASE_PROD_DB_URL  → lo carga el owner a mano:
         github.com/xacty/webbrief-backups → Settings → Secrets and variables → Actions → New repository secret
         Valor: Supabase (proyecto WeBrief) → Connect → Session pooler → URI, con la contraseña de la base
         (postgresql://postgres.gmrlhhszrdahcxyoywvt:<password>@aws-…pooler.supabase.com:5432/postgres)
Variable BACKUP_AGE_RECIPIENT  → clave pública age (age1…); no es secreta
```

- Usa el **Session pooler (puerto 5432)**. La conexión directa `db.<ref>.supabase.co` es solo IPv6 y falla en los runners de GitHub. El puerto 6543 (transaction pooler) no sirve para `pg_dump`.
- Si cambias la contraseña de la base de Prod, actualiza el secret o el próximo backup va a fallar.

### Monitoreo

- Si una corrida programada falla, GitHub manda un email a `xacty`. Revisa que las notificaciones de Actions estén activas en github.com/settings/notifications.
- Una vez al mes, confirma que haya backups recientes:

```bash
gh run list -R xacty/webbrief-backups --workflow backup-prod-db.yml -L 5
```

### Descargar y descifrar

Trabaja siempre **fuera de cualquier repo** y borra la carpeta al terminar: contiene datos reales de clientes, emails y hashes de contraseñas.

```bash
brew install age libpq                      # una vez; psql queda en $(brew --prefix libpq)/bin
mkdir -p ~/webrief-restore && cd ~/webrief-restore
gh run list -R xacty/webbrief-backups --workflow backup-prod-db.yml -L 10
gh run download <RUN_ID> -R xacty/webbrief-backups -D .
age -d -i ~/.config/webrief-backups/prod-db-backup.agekey -o backup.tar.gz webrief-prod-db-*/*.tar.gz.age
shasum -a 256 backup.tar.gz                 # debe coincidir con el sha256 del resumen del run
tar -xzf backup.tar.gz && shasum -a 256 -c SHA256SUMS
cat manifest.txt
```

### Recuperar filas puntuales (el caso más común)

Por ejemplo, una página sobrescrita. Se carga **solo la tabla necesaria** en un Postgres 17 local y desechable (Docker), sin tocar Prod ni Dev:

```bash
docker run -d --name wb-restore -e POSTGRES_PASSWORD=restore -p 127.0.0.1:55432:5432 postgres:17
export PGURL=postgresql://postgres:restore@127.0.0.1:55432/postgres
export PATH="$(brew --prefix libpq)/bin:$PATH"
T=project_pages
# DDL de la tabla sin DEFAULTs (pueden depender de extensiones de Supabase) + sus filas
awk -v t="CREATE TABLE IF NOT EXISTS \"public\".\"$T\" (" 'index($0, t) == 1 {p = 1} p {print} p && /^\);/ {exit}' schema.sql \
  | sed -E 's/ DEFAULT .*[^,]//' > table.sql
awk -v t="COPY \"public\".\"$T\" " 'index($0, t) == 1 {p = 1} p {print} p && $0 == "\\." {exit}' data.sql >> table.sql
psql "$PGURL" -v ON_ERROR_STOP=1 -f table.sql
psql "$PGURL" -c "select id, name, version, updated_at, length(content_html) from public.$T where project_id = '<project-uuid>'"
```

Para aplicar lo recuperado en Prod:

1. Corre el workflow a mano (`gh workflow run backup-prod-db.yml -R xacty/webbrief-backups`) para guardar el estado actual antes de tocar nada.
2. Prepara un `UPDATE` por `id` que escriba **`content_html` y `content_json` juntos** (nunca dejes `content_json` en NULL) y que sume 1 a `version`, para que los editores abiertos detecten el cambio.
3. **Solo con el OK explícito del owner**, aplícalo en Prod y verifica la página en la app.
4. Limpia: `docker rm -f wb-restore && rm -rf ~/webrief-restore`.

### Restauración completa (desastre: proyecto borrado o corrupto)

1. Crea un proyecto Supabase nuevo en la misma región (us-west-2) con Postgres 17 y toma su URI del Session pooler (`NEW_DB_URL`).
2. Restaura siguiendo el procedimiento de Supabase:

```bash
psql --single-transaction --variable ON_ERROR_STOP=1 \
  --file roles.sql --file schema.sql \
  --command 'SET session_replication_role = replica' \
  --file data.sql --dbname "$NEW_DB_URL"
```

3. Reconfigura en el dashboard lo que no viaja en el dump: Auth (Site URL, redirect URLs, SMTP de Resend, plantillas), buckets y publicación Realtime de `project_comments`.
4. Apunta el VPS al proyecto nuevo (`SUPABASE_URL` y claves en `backend/.env`, `VITE_SUPABASE_*` en el frontend), `pm2 restart webrief-backend --update-env`, rebuild del frontend y actualiza el secret `SUPABASE_PROD_DB_URL`.
5. Los usuarios conservan sus contraseñas (se restauran los hashes), pero todas las sesiones se cierran.

### Simulacro de restauración en Dev

Sirve para comprobar que un backup realmente se puede restaurar. Se hace **siempre en Dev (`iimqxacagxuemwgaunis`), nunca en Prod**, y con el OK del owner.

- Todo corre dentro de una transacción que termina en `rollback`: Dev **nunca cambia**, ni siquiera por unos minutos, y los datos reales no quedan en Dev.
- Dev ya tiene el esquema, así que solo se cargan los datos de `public` y `auth` sobre tablas vaciadas dentro de la misma transacción.
- `DEV_DB_URL` = URI del Session pooler de Dev (puerto 5432). Tenla solo en la variable del shell, nunca en archivos.

```bash
cd ~/webrief-restore && export PATH="$(brew --prefix libpq)/bin:$PATH"
# 1. Solo los bloques de public y auth del backup de Prod
awk -v q="'" '
  /^COPY / { keep = ($2 ~ /^"(public|auth)"\./); inblk = 1 }
  inblk { if (keep) print; if ($0 == "\\.") inblk = 0; next }
  /^SELECT pg_catalog.setval/ { if (index($0, "setval(" q "\"public\".") || index($0, "setval(" q "\"auth\".")) print; next }
  { print }
' data.sql > data-public-auth.sql
# 2. Vaciar, cargar, contar y deshacer, todo en una transacción
cat > drill.sql <<'SQL'
\set ON_ERROR_STOP 1
begin;
do $$ declare r record; begin
  for r in select tablename from pg_tables where schemaname = 'public' loop
    execute format('truncate table public.%I cascade', r.tablename);
  end loop;
end $$;
delete from auth.users;
delete from auth.audit_log_entries;
delete from auth.flow_state;
set session_replication_role = replica;
\i data-public-auth.sql
set session_replication_role = origin;
select 'auth.users' t, count(*) from auth.users union all
select 'public.companies', count(*) from public.companies union all
select 'public.profiles', count(*) from public.profiles union all
select 'public.projects', count(*) from public.projects union all
select 'public.project_pages', count(*) from public.project_pages union all
select 'public.project_comments', count(*) from public.project_comments union all
select 'public.project_activity', count(*) from public.project_activity order by 1;
rollback;
SQL
psql "$DEV_DB_URL" -q -At -F $'\t' -f drill.sql 2>&1 | grep -v NOTICE
# 3. Los conteos tienen que ser idénticos a los del backup
grep -E '^(public\.(companies|profiles|projects|project_pages|project_comments|project_activity)|auth\.users)\s' row-counts.tsv
```

Si la carga falla por un error de esquema (`violates not-null constraint`, columna inexistente…), es una **deriva entre Dev y Prod**. La transacción se deshace sola y Dev no cambia. Anota la deriva y corrígela con el flujo normal de migraciones.

Al terminar: `rm -rf ~/webrief-restore`.

> Validado el 2026-09-21 con el backup `webrief-prod-db-2026-09-21T2059Z`: 7 empresas, 14 perfiles/usuarios, 17 proyectos, 40 páginas, 94 comentarios y 876 actividades, idénticos al backup. Dev quedó intacto. Los pasos de "Recuperar filas puntuales" (Docker local) siguen **pendientes de validar**.

### Rotación

- **Contraseña de la base de Prod:** actualiza el secret `SUPABASE_PROD_DB_URL`.
- **Clave age:** `age-keygen -o` a un archivo nuevo, actualiza la variable `BACKUP_AGE_RECIPIENT` con la clave pública nueva y guarda la privada nueva en el gestor de contraseñas. Conserva la clave vieja 30 días (lo que duran los backups cifrados con ella).

## Rules

```text
Do not commit .env files.
Do not put service_role key in frontend.
Do not run destructive SQL in Prod first.
Never restore a backup into Prod without the owner's explicit OK; restore drills go to Dev.
Do not assume local uses Dev unless .env points to Dev.
Resolve sharp/image processing before serious beta.
```

## Known Critical Pending

```text
Namecheap VPS CPU does not support current prebuilt sharp linux-x64 binary.
Backend lazy-loads sharp so API can boot.
Raster project asset uploads and avatar processing may return 503.
Resolve before serious beta/production.
```

## Lifecycle Cron Setup (papelera + retention notifications)

Endpoint:
```text
POST /api/projects/lifecycle/tick
```

Procesa notificaciones pendientes (escribe in-app vía project_activity) y
purga proyectos cuya retención expiró (30d non-brief, 15d brief).

Auth: admin user OR shared header `X-Cron-Secret: <LIFECYCLE_CRON_SECRET>`.

### 1. Generar secret y guardar en VPS

```bash
ssh deploy@199.192.22.74
openssl rand -hex 32
# Copia el output — será tu LIFECYCLE_CRON_SECRET
```

Editar `/var/www/webrief/backend/.env` y agregar:
```env
LIFECYCLE_CRON_SECRET=<el-secret-generado>
```

Reiniciar el backend:
```bash
pm2 restart webrief-backend --update-env
```

### 2. Crear cron job del VPS

```bash
crontab -e
```

Agregar (reemplazar `<SECRET>` por el valor real):
```cron
# Lifecycle: tick cada minuto procesa notifs + cleanup
* * * * * curl -fsS -X POST -H "X-Cron-Secret: <SECRET>" https://webrief.app/api/projects/lifecycle/tick > /dev/null
```

Una sola llamada — el endpoint procesa notifs + cleanup en cada tick.

### 3. Probar manualmente

```bash
curl -X POST -H "X-Cron-Secret: <SECRET>" https://webrief.app/api/projects/lifecycle/tick
# Esperado: {"notificationsSent":N,"projectsPurged":M,"errors":[]}
```

### Alternativa: pg_cron + pg_net (Supabase Pro)

Si en el futuro pasamos a Supabase Pro y queremos que la DB se auto-llame
sin depender del VPS:

```sql
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.schedule('lifecycle-tick', '* * * * *', $$
  SELECT net.http_post(
    url := 'https://webrief.app/api/projects/lifecycle/tick',
    headers := jsonb_build_object('X-Cron-Secret', '<SECRET>')
  );
$$);
```

Por ahora el setup recomendado es VPS cron por simplicidad.

## v1.1 Auth Hardening Deploy (Plan A)

Before pushing Plan A code to production:

1. Custom SMTP must be configured in Supabase Dashboard (one-time).
   See spec §5.1.A.3 for steps:
   - Authentication → Email Settings → SMTP Settings
   - Use Resend SMTP (host `smtp.resend.com`, port 465, username `resend`)
   - For the SMTP secret field, paste the `RESEND_API_KEY` value from the VPS `.env`
   - Sender: WeBrief <noreply@webrief.app>
2. `email_otp_exp` must be raised to `86400` (24h) in Supabase Auth settings.
3. Test invite delivery via Supabase Studio's "Invite User" UI (use a
   throwaway address — confirm email arrives within 30s and headers
   reference Resend).

After pushing Plan A code:

1. SSH into VPS and verify `RESEND_API_KEY` is present in
   `/var/www/webrief/backend/.env`.
2. Optionally set `AUTH_EMAIL_FROM` to override the sender for
   invite/recovery emails. Defaults to `COMMENTS_EMAIL_FROM` or
   `WeBrief <noreply@webrief.app>`.
3. Restart PM2: `pm2 restart webrief-backend`.
4. Smoke test from production (Plan A PV-2 scenario):
   - Find an existing pending user in `/users` (one with no
     `last_sign_in_at`).
   - From `/companies`, create a temporary new test company using
     that user's email as manager.
   - Confirm the user receives a new invite email via Resend.
   - Verify `/security` shows a row with `action = 'invite_resent'`.
   - Click the new link, complete set-password.
   - Create another company with the same email → should be
     case C/D (no email, `security_events` action
     `invite_skipped_existing_user`).
5. Clean up test data in Supabase Studio.

Plan A delivers:
- D-1 — Test-company checkbox + creation gated to admin OR QA.
- D-2/D-3 — Re-invite for pending users (eliminates the
  delete-and-recreate loop that triggered Supabase's
  `over_email_send_rate_limit`).
- D-4 — Active users assigned to new companies skip invite cleanly.
- Granular security events: `invite_sent`, `invite_resent`,
  `invite_skipped_existing_user`. POST /api/companies now also
  logs the manager invite outcome.
- New shared helper `shared/inviteActions.js` maps decision actions
  to event names and Spanish user-facing messages.

## v1.1 Auth Hardening Deploy (Plan D)

Before pushing Plan D code:

1. Apply the migration `supabase/migrations/20260514_application_errors.sql`
   via Supabase Studio SQL editor (or `supabase db push` if your local
   project is linked). Verify the table exists with the 3 indexes.
2. Confirm RLS is enabled on the table (`ALTER TABLE ... ENABLE ROW LEVEL SECURITY`).

After pushing Plan D code:

1. Smoke test the `/security/errors` admin view — should show "Sin errores
   en los últimos 7 día(s). Todo bien." (empty state).
2. Trigger an intentional 5xx (e.g., authenticated request to a deleted
   resource) and verify a row appears with `source='unhandled'`.
3. Re-test PV-2 from Plan A. The reinvite should still work, AND any
   Supabase Auth failure (rate limits, etc.) should now appear in
   `/security/errors` with `source='supabase_auth'` and `error_code`
   like `over_email_send_rate_limit`.

Plan D delivers:
- New `application_errors` table for technical/operator diagnostics
  (separate from `security_events` audit trail).
- `logApplicationError(req, error, ctx)` helper + `wrapSupabaseAuthCall`
  wrapper around Supabase Auth admin calls (4 sites wrapped).
- Catch-all 5xx handler persists unhandled errors and returns `errorId`
  in 500 responses for trace correlation.
- Admin-only `/security/errors` view with filters (days, level, source,
  search) and modal detail with stack trace + metadata.
- Closes the visibility gap from session 11 — the
  `over_email_send_rate_limit` cascade would now be visible.
