# WeBrief VPS Deploy

Guia para publicar WeBrief en un VPS Ubuntu usando:

- Nginx para servir el frontend y hacer proxy de `/api`
- Node.js + PM2 para el backend Express
- Supabase hosted para Auth, Postgres y Storage
- GitHub como fuente del codigo

## Arquitectura

```text
webrief.app
  -> VPS Ubuntu
     -> Nginx sirve frontend/dist
     -> Nginx proxy /api a 127.0.0.1:3000
     -> PM2 mantiene backend/src/index.js vivo
  -> Supabase hosted para Auth/DB/Storage
```

## 1. DNS

En Namecheap, apuntar el dominio al IP publico del VPS:

```text
A     @      VPS_IP
A     www    VPS_IP
```

La propagacion puede tardar. Mientras tanto se puede preparar el servidor por SSH usando el IP.

## 2. Acceso inicial al VPS

Entrar por SSH con el usuario inicial que entregue Namecheap:

```bash
ssh root@VPS_IP
```

Crear usuario de deploy:

```bash
adduser deploy
usermod -aG sudo deploy
```

Copiar tu llave SSH publica al usuario `deploy` y probar:

```bash
ssh deploy@VPS_IP
```

## 3. Paquetes base

En el VPS:

```bash
sudo apt update
sudo apt upgrade -y
sudo apt install -y nginx git curl ufw
```

Instalar Node.js LTS. Ejemplo con NodeSource:

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node -v
npm -v
```

Instalar PM2:

```bash
sudo npm install -g pm2
```

Configurar firewall:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
```

Opcional pero recomendado en VPS pequenos: crear swap.

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

## 4. Clonar repo

Para repo privado, primero crear una SSH key en el VPS y agregar la public key como Deploy key en GitHub.

```bash
ssh-keygen -t ed25519 -C "webrief-vps"
cat ~/.ssh/id_ed25519.pub
```

Luego clonar:

```bash
sudo mkdir -p /var/www
sudo chown deploy:deploy /var/www
git clone git@github.com:OWNER/REPO.git /var/www/webrief
cd /var/www/webrief
```

Si el repo es publico, tambien se puede clonar por HTTPS.

## 5. Variables de entorno

Crear backend `.env`:

```bash
cp backend/.env.production.example backend/.env
nano backend/.env
```

Crear frontend `.env.production`:

```bash
cp frontend/.env.production.example frontend/.env.production
nano frontend/.env.production
```

Valores esperados:

```text
backend/.env
SUPABASE_URL=https://PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
FRONTEND_URL=https://webrief.app
PROJECT_ASSETS_BUCKET=project-assets
PORT=3000

frontend/.env.production
VITE_SUPABASE_URL=https://PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=...
```

No commitear `.env` ni `.env.production`.

## 6. Primer build y backend

Desde `/var/www/webrief`:

```bash
cd backend
npm ci --omit=dev
pm2 start src/index.js --name webrief-backend
pm2 save
pm2 startup
```

Ejecutar el comando que PM2 imprime despues de `pm2 startup`.

Compilar frontend:

```bash
cd /var/www/webrief/frontend
npm ci
npm run build
```

Probar backend localmente:

```bash
curl -s http://127.0.0.1:3000/api/health
```

## 7. Nginx

Copiar la config de referencia:

```bash
sudo cp /var/www/webrief/deploy/nginx/webrief.app.conf /etc/nginx/sites-available/webrief.app
sudo ln -s /etc/nginx/sites-available/webrief.app /etc/nginx/sites-enabled/webrief.app
sudo nginx -t
sudo systemctl reload nginx
```

Si existe el sitio default, se puede desactivar:

```bash
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

## 8. HTTPS

Cuando DNS ya apunte al VPS:

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d webrief.app -d www.webrief.app
```

## 9. Supabase

En Supabase Auth, configurar Site URL y Redirect URLs:

```text
https://webrief.app
https://webrief.app/auth/set-password
https://www.webrief.app
https://www.webrief.app/auth/set-password
```

Ejecutar `supabase/schema.sql` en el SQL editor de Supabase si el proyecto productivo aun no tiene schema.

Crear/verificar bucket:

```text
project-assets
```

## 10. Deploy manual desde GitHub

Despues de hacer push a `main` desde local, entrar al VPS:

```bash
ssh deploy@VPS_IP
cd /var/www/webrief
./scripts/deploy.sh
```

El script hace:

- `git pull origin main`
- instala dependencias si cambiaron lockfiles
- compila el frontend
- reinicia el backend con PM2
- recarga Nginx si la config es valida

## 11. Datos que se necesitan

Del VPS/Namecheap:

- IP publico
- usuario inicial para SSH
- si el DNS de `webrief.app` y `www.webrief.app` ya apuntan al VPS

De GitHub:

- URL del repo
- si el repo es privado o publico
- rama de produccion, recomendado `main`
- acceso para agregar la deploy key del VPS si el repo es privado

De Supabase:

- Project URL
- anon key
- service role key
- confirmacion de redirects de Auth
- confirmacion de bucket `project-assets`
