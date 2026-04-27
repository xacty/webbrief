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
PROJECT_ASSETS_BUCKET=project-assets
PORT=3000
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
