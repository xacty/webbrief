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

## Rules

```text
Do not commit .env files.
Do not put service_role key in frontend.
Do not run destructive SQL in Prod first.
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
   - Host: smtp.resend.com, Port: 465, Username: resend
   - Password: value of RESEND_API_KEY from VPS .env
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
