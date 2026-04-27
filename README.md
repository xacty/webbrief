# WeBrief

Webapp fullstack para gestion de briefs web.

## Stack

- **Frontend:** React + Vite
- **Backend:** Node.js + Express
- **Base de datos:** Supabase Postgres
- **Auth:** Supabase Auth

## Estructura

```
webbrief/
  frontend/   # React + Vite
  backend/    # Node.js + Express + Supabase
  supabase/   # SQL schema de referencia
```

## Inicio rápido

### Variables de entorno

Copiar:

- `frontend/.env.example` -> `frontend/.env`
- `backend/.env.example` -> `backend/.env`

Luego completar:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `FRONTEND_URL=http://localhost:5173`
- `PROJECT_ASSETS_BUCKET=project-assets`

### Base de datos

Ejecutar el SQL de `supabase/schema.sql` en el SQL editor de Supabase.

Crear también un bucket de Supabase Storage para assets del proyecto. Por defecto el backend usa `project-assets`.

Para que tu usuario local funcione como admin, necesitas:

1. crear el usuario en Supabase Auth
2. insertar su fila en `public.profiles` con `platform_role = 'admin'`
3. crear al menos una empresa en `public.companies`
4. crear una membresia en `public.company_memberships` para esa empresa

### Backend

```bash
cd backend
npm install
npm run dev
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

## Deploy

Para publicar en un VPS Ubuntu con Nginx, PM2 y Supabase hosted, ver [DEPLOY.md](DEPLOY.md).
