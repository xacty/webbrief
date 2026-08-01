# Biblioteca de imágenes — Fase 1 — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Biblioteca de imágenes por empresa con carpetas anidadas, ingesta con conversión automática (fotos → WebP q80 ≤2560px, PNG sin pérdida, original descartado), cuota de 100 MB por empresa, acciones bulk, export ZIP con "papelera tras exportar", y picker "Desde biblioteca" en el editor.

**Architecture:** Nueva tabla `asset_folders` + extensión de `project_assets` (`company_id`, `folder_id`, `origin`, `source_metadata`; `project_id` nullable). Router nuevo `backend/src/routes/library.js` montado en `/api/companies/:companyId/library` (mergeParams). Ingesta vía ImageKit con pre-transformación en el upload (fallback codificado: subir original temporal → fetch transformado → re-subir → borrar temporal). Cuota centralizada en `lib/storageQuota.js` aplicada en biblioteca, editor y conversiones. Frontend: sub-ruta `library` bajo `/c/:companySlug/*` + link de sidebar, componentes en `frontend/src/components/library/`.

**Tech Stack:** Express + Supabase (service role) + `@imagekit/nodejs` + multer + archiver. React JSX (sin TS), CSS Modules con tokens `--wb-*`, react-router. Tests `node:test` solo backend; frontend se verifica con `npx vite build` + browser.

**Spec:** `docs/superpowers/specs/2026-07-19-image-library-phase1-design.md` — leerlo completo antes de cualquier task.

**Reglas globales para TODOS los tasks:**
- Working dir: `/Users/adrian/GitHub/webbrief`, rama `feat/image-library` (NUNCA solo en worktree). **Antes de CADA commit: `git branch --show-current` debe decir `feat/image-library`** — el usuario trabaja en paralelo en este repo y la rama activa puede cambiar entre sesiones.
- Árbol limpio verificado al momento del merge base. **Staging selectivo igual**: `git add <archivos del task>` explícitos, jamás `git add -A` ni `git add .`. Si aparecieran cambios ajenos sin commitear, no incluirlos y reportarlo.
- Leer `DESIGN-SYSTEM.md` completo antes de cualquier task frontend. Español neutro en todo copy (nada de "podés/hacé").
- Backend se verifica con `cd backend && npm test` (suite completa SIEMPRE verde antes de commitear). Frontend con `cd frontend && npx vite build`.
- Los números de línea citados son orientativos (relevados en `e581971`; la rama ahora incluye `main` mergeado en `a3d4701`, que tocó `projects.js`, `projectAccess.js`, `App.jsx` y `ProjectEditor.jsx`) — SIEMPRE verificar con grep antes de editar.
- Tokens/radios: `--wb-radius-2` en clickables, `--wb-radius-3` en contenedores, `--wb-radius-full` SOLO pills de estado. Cero hex hardcodeado.
- NO deployar, NO tocar Supabase Prod, NO `git push` sin pedido explícito del usuario. Migración solo en Dev (MCP `supabaseDev`).

**Hechos del código existente (verificados):**
- SDK: `@imagekit/nodejs` — `imagekit.files.upload({ file: await toFile(buffer, name), fileName, folder, useUniqueFileName:false, overwriteFile:false, tags })` en `backend/src/lib/imagekit.js:141-159`. Tras mergear F0, `uploadToImageKit` acepta `preTransformation` (string estilo `w-2560,h-2560,c-at_max,f-webp,q-80`) y existe `backend/src/lib/imageIngest.js` con la política de conversión completa. Transformaciones URL vía `buildImageKitTransformations` (opciones `width/height/format/quality/fit/cropMode/x/y/focus`) + `buildImageKitUrl` (líneas 79-130). Prefijo Dev/Prod: `applyImageKitFolderPrefix`.
- Upload editor existente: `POST /api/projects/:id/assets` en `backend/src/routes/projects.js:1993` (multer memoria, instancia línea ~42; raster→ImageKit, SVG→Supabase Storage `project-assets`). Copiar de ahí el branch SVG y el shape de inserción en `project_assets`.
- Helpers export NO exportados hoy: `normalizeExportOptions` (projects.js:509), `buildExportFileName` (:534), `resolveProjectAssetForExport` (:543). Export bulk ZIP con `archiver`: `POST /:id/assets/export-bulk` (:2159). Convert-and-save: `POST /:id/assets/convert` (:2341) — usar como referencia del fallback de ingesta.
- Permisos: `canWriteProjectContent(currentUser, companyId)` en `backend/src/lib/projectAccess.js:97` (ya es company-scoped). `requireAuth` se aplica dentro de cada router (ver cómo lo hace projects.js).
- Detección "usada en documentos": patrón regex sobre `content_html` como el orphan-resolve de comments en `backend/src/routes/projects.js` (buscar `comment_orphaned`).
- Mount de routers: `backend/src/index.js:56-64`. El de library debe declararse ANTES de `app.use('/api/companies', companiesRoutes)`.
- Tests: `cd backend && npm test` = `NODE_ENV=test node --test`. Patrón: funciones puras exportadas desde el módulo real, sin mocks de Supabase (ver `backend/test/companies-create.test.js`).
- Frontend fetch: `apiFetch(path, options)` en `frontend/src/lib/api.js:12` (agrega bearer de sesión Supabase; FormData soportado — no fuerza Content-Type). Descargas: `apiSubmitDownload` y `apiDownloadToFile` exportados del mismo módulo.
- Rutas: `frontend/src/App.jsx:135-139` — `/c/:companySlug` (WorkspaceLayout) con hijos `projects`, `team`, `activity`. `WorkspaceLayout.jsx` es wrapper fino que resuelve slug→company y hace `<Outlet/>`; los links del workspace viven en el sidebar de `AppShell.jsx`. La empresa activa se obtiene con el mismo hook/contexto que usa `ProjectsPage.jsx` (grep `currentCompany`).
- Editor: input file de imagen en `ProjectEditor.jsx:~7662`; nodo `EditableImageNode` (extiende `Image`, attrs `width/originalWidth/originalHeight/assetId/fileName/storagePath`) en :517; estado `exportModal` en :9719 y submit ZIP en :10131.
- UI primitives: `Button/Input/Select/Modal/Card/Badge/KebabMenu` + `cn()` en `frontend/src/components/ui/` (Modal: props `open,onClose,title`; KebabMenu: `items:[{label,icon,onClick,destructive,disabled}]`, portal a body). Iconos `lucide-react`.

---

### Task 1: Migración de esquema (solo Dev)

**Files:**
- Create: `supabase/migrations/20260719_image_library.sql`

- [ ] **Step 1: Escribir la migración**

Contenido exacto (§3 del spec):

```sql
-- Biblioteca de imágenes F1: carpetas + extensión de project_assets + cuota por empresa

create table if not exists public.asset_folders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  parent_folder_id uuid references public.asset_folders(id) on delete cascade,
  name text not null,
  position integer not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  trashed_at timestamptz,
  delete_after timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists asset_folders_company_parent_idx
  on public.asset_folders(company_id, parent_folder_id) where trashed_at is null;

alter table public.asset_folders enable row level security;

drop trigger if exists asset_folders_set_updated_at on public.asset_folders;
create trigger asset_folders_set_updated_at
before update on public.asset_folders
for each row execute function public.set_updated_at();

alter table public.project_assets
  add column if not exists company_id uuid references public.companies(id) on delete cascade,
  add column if not exists folder_id uuid references public.asset_folders(id) on delete set null,
  add column if not exists origin text not null default 'editor',
  add column if not exists source_metadata jsonb;

do $$ begin
  alter table public.project_assets
    add constraint project_assets_origin_check
    check (origin in ('upload','drive','converted','editor'));
exception when duplicate_object then null; end $$;

alter table public.project_assets alter column project_id drop not null;

update public.project_assets a set company_id = p.company_id
  from public.projects p
  where a.project_id = p.id and a.company_id is null;

create index if not exists project_assets_company_idx
  on public.project_assets(company_id, folder_id, created_at desc)
  where trashed_at is null;

alter table public.companies
  add column if not exists storage_quota_mb integer not null default 100;
```

- [ ] **Step 2: Aplicar en Dev** con MCP `mcp__supabaseDev__apply_migration_file` (project Dev `iimqxacagxuemwgaunis`). NUNCA en Prod.
- [ ] **Step 3: Verificar**: `mcp__supabaseDev__describe_table` de `asset_folders` y `project_assets` (columnas nuevas presentes) + `run_sql`: `select count(*) from project_assets where company_id is null` → debe ser 0.
- [ ] **Step 4: Commit** — `git add supabase/migrations/20260719_image_library.sql && git commit -m "feat(db): tablas de biblioteca de imágenes + cuota por empresa"`

### Task 2: `lib/storageQuota.js` (TDD)

**Files:**
- Create: `backend/src/lib/storageQuota.js`
- Test: `backend/test/storage-quota.test.js`

- [ ] **Step 1: Test que falla**

```js
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { evaluateQuota, summarizeUsage } from '../src/lib/storageQuota.js'

test('summarizeUsage: separa activos y papelera, ignora tamaños inválidos', () => {
  const rows = [
    { file_size: 1000, trashed_at: null },
    { file_size: 2000, trashed_at: '2026-07-01T00:00:00Z' },
    { file_size: null, trashed_at: null },
  ]
  assert.deepEqual(summarizeUsage(rows), { usedBytes: 3000, activeBytes: 1000, trashedBytes: 2000 })
})

test('evaluateQuota: permite bajo cuota, bloquea al llegar', () => {
  const mb = 1024 * 1024
  assert.equal(evaluateQuota({ usedBytes: 50 * mb, quotaMb: 100 }).allowed, true)
  const full = evaluateQuota({ usedBytes: 100 * mb, quotaMb: 100 })
  assert.equal(full.allowed, false)
  assert.equal(full.code, 'quota_exceeded')
})

test('evaluateQuota: overshoot de un solo archivo permitido si aún hay espacio', () => {
  const mb = 1024 * 1024
  // 99 MB usados + entrante 5 MB → permitido (el check es "uso actual < cuota")
  assert.equal(evaluateQuota({ usedBytes: 99 * mb, quotaMb: 100, incomingBytes: 5 * mb }).allowed, true)
})

test('evaluateQuota: cuota inválida o faltante usa default 100', () => {
  const mb = 1024 * 1024
  assert.equal(evaluateQuota({ usedBytes: 150 * mb, quotaMb: null }).allowed, false)
  assert.equal(evaluateQuota({ usedBytes: 50 * mb, quotaMb: 0 }).allowed, true)
})
```

- [ ] **Step 2: Correr** `cd backend && npm test -- --test-name-pattern="Quota|Usage"` → FAIL (módulo no existe).
- [ ] **Step 3: Implementación**

```js
// backend/src/lib/storageQuota.js
// Cuota de almacenamiento por empresa. La cuota cuenta activos + papelera
// (la papelera ocupa storage real hasta purgarse). Regla: se bloquea cuando
// uso actual >= cuota; un único archivo puede "pasarse" (overshoot) porque
// el tamaño post-conversión no se conoce a priori.
import { supabaseAdmin } from './supabase.js'

const DEFAULT_QUOTA_MB = 100
const MB = 1024 * 1024

export function summarizeUsage(rows = []) {
  let activeBytes = 0
  let trashedBytes = 0
  for (const row of rows) {
    const size = Number(row?.file_size)
    if (!Number.isFinite(size) || size <= 0) continue
    if (row?.trashed_at) trashedBytes += size
    else activeBytes += size
  }
  return { usedBytes: activeBytes + trashedBytes, activeBytes, trashedBytes }
}

export function evaluateQuota({ usedBytes = 0, quotaMb = DEFAULT_QUOTA_MB, incomingBytes = 0 } = {}) {
  const normalizedQuota = Number.isFinite(Number(quotaMb)) && Number(quotaMb) > 0
    ? Number(quotaMb)
    : DEFAULT_QUOTA_MB
  const quotaBytes = normalizedQuota * MB
  if (usedBytes >= quotaBytes) {
    return {
      allowed: false,
      code: 'quota_exceeded',
      quotaMb: normalizedQuota,
      usedBytes,
      message: `Espacio lleno: ${Math.round(usedBytes / MB)} de ${normalizedQuota} MB. Libera espacio o vacía la papelera de la biblioteca.`,
    }
  }
  return { allowed: true, quotaMb: normalizedQuota, usedBytes, remainingBytes: quotaBytes - usedBytes }
}

export async function fetchCompanyUsage(companyId) {
  const { data, error } = await supabaseAdmin
    .from('project_assets')
    .select('file_size, trashed_at')
    .eq('company_id', companyId)
  if (error) throw new Error(`No se pudo calcular el uso de almacenamiento: ${error.message}`)
  return summarizeUsage(data || [])
}

export async function checkCompanyStorageQuota(companyId, incomingBytes = 0) {
  const [usage, companyRes] = await Promise.all([
    fetchCompanyUsage(companyId),
    supabaseAdmin.from('companies').select('storage_quota_mb').eq('id', companyId).single(),
  ])
  const quotaMb = companyRes?.data?.storage_quota_mb
  return { ...evaluateQuota({ usedBytes: usage.usedBytes, quotaMb, incomingBytes }), usage }
}
```

- [ ] **Step 4: Correr tests** → PASS. Suite completa `npm test` → verde.
- [ ] **Step 5: Commit** — `git add backend/src/lib/storageQuota.js backend/test/storage-quota.test.js && git commit -m "feat(backend): helper de cuota de almacenamiento por empresa"`

### Task 3: Extraer helpers de export a `lib/assetExport.js`

**Files:**
- Create: `backend/src/lib/assetExport.js`
- Modify: `backend/src/routes/projects.js` (líneas ~509-570: eliminar definiciones locales, importar del lib)

- [ ] **Step 1:** Mover VERBATIM (sin cambiar una línea de lógica) `normalizeExportOptions`, `buildExportFileName` y `resolveProjectAssetForExport` de `projects.js` a `backend/src/lib/assetExport.js`, exportándolas. `resolveProjectAssetForExport` usa `supabaseAdmin` — importarlo en el lib. Agregar una variante `resolveCompanyAssetForExport(companyId, { assetId })` (misma query pero filtrando `company_id` en vez de `project_id`; la necesita Task 8):

```js
export async function resolveCompanyAssetForExport(companyId, { assetId = null } = {}) {
  if (!assetId) return null
  const { data } = await supabaseAdmin
    .from('project_assets')
    .select('*')
    .eq('id', assetId)
    .eq('company_id', companyId)
    .maybeSingle()
  return data || null
}
```

- [ ] **Step 2:** En `projects.js`: `import { normalizeExportOptions, buildExportFileName, resolveProjectAssetForExport } from '../lib/assetExport.js'`. Borrar las definiciones locales. Grep para confirmar cero referencias rotas.
- [ ] **Step 3:** `cd backend && npm test` → la suite completa verde ES el test de este task (refactor sin cambio de comportamiento).
- [ ] **Step 4: Commit** — `git add backend/src/lib/assetExport.js backend/src/routes/projects.js && git commit -m "refactor(backend): extraer helpers de export de assets a lib compartida"`

### Task 4: Ingesta — lib compartida `imageIngest` (YA construida en F0)

**Pre-requisito de rama:** F0 (`feat/upload-auto-convert`, commits `7dfe889` lib + `2d617d2` wiring + `3ac1067` v2.12.0) debe estar mergeado aquí — vía `git merge main` si F0 ya llegó a main, o mergeando la rama F0 directamente. Verificar: `ls backend/src/lib/imageIngest.js` existe y `grep preTransformation backend/src/lib/imagekit.js` matchea.

**Qué provee la lib** (`backend/src/lib/imageIngest.js`, tests en `backend/test/image-ingest.test.js`, smoke-verificada contra ImageKit Dev — pre-transformación aceptada por el SDK y no-upscale con `c-at_max` confirmados):

- Constantes: `MAX_INGEST_WIDTH = 2560`, `PHOTO_WEBP_QUALITY = 80`, `MAX_UPLOAD_BYTES = 30 MB`.
- `decideUploadConversion({ mimeType, size })` → `{ ok: true, action: 'photo-webp' | 'png-resize' | 'passthrough' }` o `{ ok: false, reason: 'size_exceeded' | 'unsupported_mime' }`. Fotos (JPEG/WebP) → webp q80; PNG → resize sin pérdida conservando formato; GIF y SVG → passthrough.
- `uploadWithIngest({ buffer, fileName, folder, tags, mimeType, size, uploadFn? })` → `{ ok, action, converted, finalName, mimeType, upload }` — aplica la pre-transformación correcta y ajusta extensión/mime.
- `adjustFileNameForAction(fileName, action)` y `mimeTypeForAction(mime, action)`.

- [ ] **Step 1:** Hacer el merge del pre-requisito si falta y correr `cd backend && npm test` (la suite ya incluye los tests de la lib) → verde.
- [ ] **Step 2:** NO crear `libraryIngest.js` ni duplicar lógica — Task 7 importa directo de `imageIngest.js`. Si la biblioteca necesitara un helper específico (p. ej. naming con slug), agregarlo a `imageIngest.js` con test.
- [ ] **Step 3: Commit** — solo el merge, si se hizo aquí.

### Task 5: Router de biblioteca — carpetas CRUD (TDD del ciclo)

**Files:**
- Create: `backend/src/routes/library.js`
- Modify: `backend/src/index.js` (import + mount ANTES de companiesRoutes)
- Test: `backend/test/library-folders.test.js`

- [ ] **Step 1: Test que falla** (helpers puros del router)

```js
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { wouldCreateFolderCycle, validateFolderName, resolveLibraryRole } from '../src/routes/library.js'

test('wouldCreateFolderCycle: detecta mover a descendiente y a sí misma', () => {
  const folders = [
    { id: 'a', parent_folder_id: null },
    { id: 'b', parent_folder_id: 'a' },
    { id: 'c', parent_folder_id: 'b' },
  ]
  assert.equal(wouldCreateFolderCycle(folders, 'a', 'c'), true)
  assert.equal(wouldCreateFolderCycle(folders, 'a', 'a'), true)
  assert.equal(wouldCreateFolderCycle(folders, 'c', 'a'), false)
  assert.equal(wouldCreateFolderCycle(folders, 'b', null), false)
})

test('validateFolderName: recorta, limita a 80, rechaza vacío', () => {
  assert.equal(validateFolderName('  Fotos  '), 'Fotos')
  assert.equal(validateFolderName(''), null)
  assert.equal(validateFolderName('x'.repeat(200))?.length, 80)
})

test('resolveLibraryRole: admin write, manager/editor write en su empresa, qa read, resto null', () => {
  const admin = { platform_role: 'admin', memberships: [] }
  const qa = { platform_role: 'qa', memberships: [] }
  const manager = { platform_role: 'user', memberships: [{ company_id: 'c1', role: 'manager' }] }
  const outsider = { platform_role: 'user', memberships: [{ company_id: 'c2', role: 'editor' }] }
  assert.equal(resolveLibraryRole(admin, 'c1'), 'write')
  assert.equal(resolveLibraryRole(qa, 'c1'), 'read')
  assert.equal(resolveLibraryRole(manager, 'c1'), 'write')
  assert.equal(resolveLibraryRole(outsider, 'c1'), null)
})
```

- [ ] **Step 2:** FAIL (módulo no existe).
- [ ] **Step 3: Router base + carpetas.** Estructura de `library.js` (los endpoints de assets llegan en Tasks 6-8; dejar el esqueleto listo):

```js
// backend/src/routes/library.js
// Biblioteca de imágenes por empresa. Montado en /api/companies/:companyId/library
import express from 'express'
import { requireAuth } from '../middleware/auth.js'
import { rateLimiters } from '../middleware/security.js'
import { supabaseAdmin } from '../lib/supabase.js'
import { logSecurityEvent } from '../lib/securityAudit.js'

const router = express.Router({ mergeParams: true })
router.use(requireAuth)

export function validateFolderName(raw) {
  const name = String(raw ?? '').trim().slice(0, 80)
  return name || null
}

export function wouldCreateFolderCycle(folders, folderId, nextParentId) {
  if (!nextParentId) return false
  if (nextParentId === folderId) return true
  const byId = new Map(folders.map((f) => [f.id, f]))
  let cursor = byId.get(nextParentId)
  const seen = new Set()
  while (cursor) {
    if (cursor.id === folderId) return true
    if (seen.has(cursor.id)) return false
    seen.add(cursor.id)
    cursor = cursor.parent_folder_id ? byId.get(cursor.parent_folder_id) : null
  }
  return false
}

export function resolveLibraryRole(currentUser, companyId) {
  if (!currentUser) return null
  if (currentUser.platform_role === 'admin') return 'write'
  if (currentUser.platform_role === 'qa') return 'read'
  const membership = (currentUser.memberships || []).find((m) => m.company_id === companyId)
  if (!membership) return null
  return ['manager', 'editor'].includes(membership.role) ? 'write' : 'read'
}

// Middleware: resuelve companyId + rol; adjunta req.libraryAccess
async function requireLibraryAccess(req, res, next, { write = false } = {}) {
  const companyId = req.params.companyId
  const role = resolveLibraryRole(req.currentUser, companyId)
  if (!role) return res.status(404).json({ error: 'Empresa no encontrada' })
  if (write && role !== 'write') return res.status(403).json({ error: 'Tu rol no puede modificar la biblioteca' })
  req.libraryAccess = { companyId, role }
  next()
}
const readAccess = (req, res, next) => requireLibraryAccess(req, res, next, { write: false })
const writeAccess = (req, res, next) => requireLibraryAccess(req, res, next, { write: true })

router.post('/folders', rateLimiters.sensitiveAction, writeAccess, async (req, res) => {
  const name = validateFolderName(req.body?.name)
  if (!name) return res.status(400).json({ error: 'Nombre de carpeta requerido' })
  const parentFolderId = req.body?.parentFolderId || null
  if (parentFolderId) {
    const { data: parent } = await supabaseAdmin
      .from('asset_folders').select('id').eq('id', parentFolderId)
      .eq('company_id', req.libraryAccess.companyId).is('trashed_at', null).maybeSingle()
    if (!parent) return res.status(400).json({ error: 'Carpeta padre no encontrada' })
  }
  const { data, error } = await supabaseAdmin
    .from('asset_folders')
    .insert({
      company_id: req.libraryAccess.companyId,
      parent_folder_id: parentFolderId,
      name,
      created_by: req.currentUser.id,
    })
    .select('*')
    .single()
  if (error) return res.status(500).json({ error: error.message })
  res.status(201).json({ folder: data })
})

router.patch('/folders/:folderId', rateLimiters.sensitiveAction, writeAccess, async (req, res) => {
  const updates = {}
  if (req.body?.name !== undefined) {
    const name = validateFolderName(req.body.name)
    if (!name) return res.status(400).json({ error: 'Nombre inválido' })
    updates.name = name
  }
  if (req.body?.parentFolderId !== undefined) {
    const nextParent = req.body.parentFolderId || null
    const { data: folders } = await supabaseAdmin
      .from('asset_folders').select('id, parent_folder_id')
      .eq('company_id', req.libraryAccess.companyId)
    if (wouldCreateFolderCycle(folders || [], req.params.folderId, nextParent)) {
      return res.status(400).json({ error: 'No puedes mover una carpeta dentro de sí misma' })
    }
    updates.parent_folder_id = nextParent
  }
  if (!Object.keys(updates).length) return res.status(400).json({ error: 'Nada que actualizar' })
  const { data, error } = await supabaseAdmin
    .from('asset_folders').update(updates)
    .eq('id', req.params.folderId).eq('company_id', req.libraryAccess.companyId)
    .select('*').single()
  if (error) return res.status(500).json({ error: error.message })
  res.json({ folder: data })
})

export default router
```

(Papelera de carpetas llega en Task 8 junto con la de assets — comparten helpers.)

- [ ] **Step 4: Mount.** En `index.js`, antes de la línea `app.use('/api/companies', companiesRoutes)`:

```js
import libraryRoutes from './routes/library.js'
// ...
app.use('/api/companies/:companyId/library', libraryRoutes)
```

- [ ] **Step 5:** `npm test` → 3 tests nuevos PASS + suite verde.
- [ ] **Step 6: Commit** — `git add backend/src/routes/library.js backend/src/index.js backend/test/library-folders.test.js && git commit -m "feat(backend): router de biblioteca con CRUD de carpetas y permisos"`

### Task 6: Listado, uso y búsqueda

**Files:**
- Modify: `backend/src/routes/library.js`
- Test: `backend/test/library-folders.test.js` (agregar tests de `buildLibraryListing`)

- [ ] **Step 1: Test que falla** — helper puro que arma la respuesta del listado:

```js
import { buildLibraryListing } from '../src/routes/library.js'

test('buildLibraryListing: separa subcarpetas del folder actual y filtra papelera', () => {
  const folders = [
    { id: 'a', parent_folder_id: null, trashed_at: null },
    { id: 'b', parent_folder_id: 'a', trashed_at: null },
    { id: 'z', parent_folder_id: null, trashed_at: '2026-07-01' },
  ]
  const out = buildLibraryListing({ folders, currentFolderId: null })
  assert.deepEqual(out.subfolders.map((f) => f.id), ['a'])
  assert.deepEqual(out.breadcrumb, [])
  const inA = buildLibraryListing({ folders, currentFolderId: 'a' })
  assert.deepEqual(inA.subfolders.map((f) => f.id), ['b'])
  assert.deepEqual(inA.breadcrumb.map((f) => f.id), ['a'])
})
```

- [ ] **Step 2: Implementar** `buildLibraryListing({ folders, currentFolderId })` (exportado): filtra `trashed_at`, arma `subfolders` (hijos directos) y `breadcrumb` (cadena de padres del folder actual, raíz→actual). Luego los endpoints:

```js
router.get('/', readAccess, async (req, res) => {
  const folderId = req.query.folderId || null
  const projectId = req.query.projectId || null
  const view = req.query.view === 'trash' ? 'trash' : 'active'
  const [foldersRes, assetsQuery] = await Promise.all([
    supabaseAdmin.from('asset_folders')
      .select('id, parent_folder_id, name, position, trashed_at, created_at')
      .eq('company_id', req.libraryAccess.companyId)
      .order('position').order('name'),
    (() => {
      let q = supabaseAdmin.from('project_assets')
        .select('id, file_name, storage_bucket, storage_path, mime_type, asset_kind, public_url, file_size, width, height, folder_id, project_id, origin, trashed_at, created_at')
        .eq('company_id', req.libraryAccess.companyId)
        .order('created_at', { ascending: false })
        .limit(500)
      if (view === 'trash') q = q.not('trashed_at', 'is', null)
      else {
        q = q.is('trashed_at', null)
        if (projectId) q = q.eq('project_id', projectId)
        else q = folderId ? q.eq('folder_id', folderId) : q.is('folder_id', null)
      }
      return q
    })(),
  ])
  if (foldersRes.error) return res.status(500).json({ error: foldersRes.error.message })
  if (assetsQuery.error) return res.status(500).json({ error: assetsQuery.error.message })
  const listing = buildLibraryListing({ folders: foldersRes.data || [], currentFolderId: folderId })
  const usage = await fetchCompanyUsage(req.libraryAccess.companyId)
  const { data: company } = await supabaseAdmin.from('companies').select('storage_quota_mb').eq('id', req.libraryAccess.companyId).single()
  res.json({
    ...listing,
    assets: assetsQuery.data || [],
    usage: { ...usage, quotaMb: company?.storage_quota_mb ?? 100 },
    role: req.libraryAccess.role,
  })
})

router.get('/usage', readAccess, async (req, res) => {
  const usage = await fetchCompanyUsage(req.libraryAccess.companyId)
  const { data: company } = await supabaseAdmin.from('companies').select('storage_quota_mb').eq('id', req.libraryAccess.companyId).single()
  res.json({ ...usage, quotaMb: company?.storage_quota_mb ?? 100 })
})

router.get('/search', readAccess, async (req, res) => {
  const q = String(req.query.q || '').trim()
  if (q.length < 2) return res.json({ assets: [] })
  const { data, error } = await supabaseAdmin
    .from('project_assets')
    .select('id, file_name, public_url, storage_path, storage_bucket, mime_type, width, height, folder_id')
    .eq('company_id', req.libraryAccess.companyId)
    .is('trashed_at', null)
    .ilike('file_name', `%${q.replace(/[%_]/g, '\\$&')}%`)
    .limit(60)
  if (error) return res.status(500).json({ error: error.message })
  res.json({ assets: data || [] })
})
```

Import arriba: `import { fetchCompanyUsage } from '../lib/storageQuota.js'`.

- [ ] **Step 3:** `npm test` → PASS + suite verde.
- [ ] **Step 4: Commit** — `git add backend/src/routes/library.js backend/test/library-folders.test.js && git commit -m "feat(backend): listado, uso y búsqueda de biblioteca"`

### Task 7: Endpoint de ingesta

**Files:**
- Modify: `backend/src/routes/library.js`
- Test: `backend/test/library-ingest.test.js` (ya cubre la lógica; este task es wiring)

- [ ] **Step 1: Multer propio del router** (30 MB, memoria) + endpoint:

```js
import multer from 'multer'
import crypto from 'node:crypto'
import { decideUploadConversion, uploadWithIngest, adjustFileNameForAction, MAX_UPLOAD_BYTES } from '../lib/imageIngest.js'
import { checkCompanyStorageQuota } from '../lib/storageQuota.js'
import { buildImageKitPath, sanitizeFileName } from '../lib/imagekit.js'

const libraryUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES },
})

router.post('/assets', rateLimiters.authenticatedUpload, writeAccess, libraryUpload.single('file'), async (req, res) => {
  try {
    const file = req.file
    if (!file) return res.status(400).json({ error: 'Archivo requerido' })
    const plan = decideUploadConversion({ mimeType: file.mimetype, size: file.size })
    if (!plan.ok) {
      const messages = {
        size_exceeded: 'El archivo supera el límite de 30 MB',
        unsupported_mime: 'Formato no soportado (JPG, PNG, WebP o SVG)',
      }
      return res.status(400).json({ error: messages[plan.reason] || 'Archivo inválido', code: plan.reason })
    }
    const quota = await checkCompanyStorageQuota(req.libraryAccess.companyId, file.size)
    if (!quota.allowed) return res.status(413).json({ error: quota.message, code: quota.code })

    const folderId = req.body?.folderId || null
    const assetId = crypto.randomUUID()
    let assetRow

    if (file.mimetype !== 'image/svg+xml') {
      const ikFolder = buildImageKitPath('companies', req.libraryAccess.companyId, 'library', folderId || 'root')
      const ingest = await uploadWithIngest({
        buffer: file.buffer,
        fileName: `${assetId}-${sanitizeFileName(file.originalname)}`,
        folder: ikFolder,
        tags: ['library-asset'],
        mimeType: file.mimetype,
        size: file.size,
      })
      if (!ingest.ok) return res.status(400).json({ error: 'Archivo inválido', code: ingest.reason })
      const upload = ingest.upload
      assetRow = {
        id: assetId,
        company_id: req.libraryAccess.companyId,
        project_id: null,
        folder_id: folderId,
        uploaded_by: req.currentUser.id,
        file_name: adjustFileNameForAction(file.originalname, ingest.action),
        storage_bucket: 'imagekit',
        storage_path: upload.filePath,
        imagekit_file_id: upload.fileId || null,
        mime_type: ingest.mimeType,
        asset_kind: 'image',
        public_url: upload.url || null,
        file_size: upload.size || 0,
        width: upload.width || null,
        height: upload.height || null,
        render_inline: true,
        origin: 'upload',
        source_metadata: {
          originalFileName: file.originalname,
          originalSize: file.size,
          originalMime: file.mimetype,
        },
      }
    } else {
      // SVG passthrough — replicar el branch SVG del upload del editor
      // (projects.js POST /:id/assets, buscar `image/svg`): mismo bucket
      // `project-assets`, mismo límite de 8 MB para SVG, asset_kind 'svg'.
      if (file.size > 8 * 1024 * 1024) return res.status(400).json({ error: 'Los SVG no pueden superar 8 MB' })
      // <copiar aquí el flujo storage.upload + getPublicUrl del branch citado,
      //  con path `companies/${companyId}/library/${assetId}-${sanitizeFileName(...)}`>
    }

    const { data: asset, error } = await supabaseAdmin
      .from('project_assets').insert(assetRow).select('*').single()
    if (error) return res.status(500).json({ error: error.message })
    res.status(201).json({
      asset,
      savings: plan.action !== 'passthrough'
        ? { originalBytes: file.size, finalBytes: asset.file_size }
        : null,
    })
  } catch (error) {
    console.error('library ingest error', error)
    res.status(502).json({ error: 'No se pudo procesar la imagen. Intenta de nuevo.' })
  }
})
```

El branch SVG debe quedar COMPLETO en el código final (el comentario `<copiar...>` es instrucción para el implementador, que replica las ~15 líneas exactas del branch existente adaptando el path; no debe quedar en el código).

- [ ] **Step 2:** Manejo del error de multer `LIMIT_FILE_SIZE`: agregar error-handler del router al final del archivo:

```js
router.use((error, req, res, next) => {
  if (error?.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: 'El archivo supera el límite de 30 MB', code: 'size_exceeded' })
  }
  next(error)
})
```

- [ ] **Step 3:** `npm test` → suite verde. Smoke manual: levantar backend local (`npm run dev`) apuntando a Dev y subir un JPG grande con curl:

```bash
curl -s -X POST "http://localhost:3000/api/companies/<companyId>/library/assets" -H "Authorization: Bearer <token claude-bot>" -F "file=@/ruta/foto.jpg" | head -c 400
```

Esperado: 201 con `asset.mime_type: "image/webp"`, `width ≤ 2560`, `savings.finalBytes` ≪ `originalBytes`. (La pre-transformación ya está smoke-verificada en F0; este curl valida el wiring del endpoint, no la lib.)

- [ ] **Step 4: Commit** — `git add backend/src/routes/library.js && git commit -m "feat(backend): ingesta de biblioteca con conversión automática y cuota"`

### Task 8: Bulk, papelera, referencias y export

**Files:**
- Modify: `backend/src/routes/library.js`
- Create: `backend/src/lib/assetReferences.js`
- Test: `backend/test/library-trash.test.js`

- [ ] **Step 1: Tests que fallan**

```js
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { extractReferencedAssetIds } from '../src/lib/assetReferences.js'
import { partitionTrashableAssets } from '../src/routes/library.js'

test('extractReferencedAssetIds: detecta storage_path y public_url en html', () => {
  const assets = [
    { id: 'a1', storage_path: '/companies/c/library/x.webp', public_url: 'https://ik.io/co/companies/c/library/x.webp' },
    { id: 'a2', storage_path: '/companies/c/library/y.webp', public_url: null },
  ]
  const pages = [{ content_html: '<img src="https://ik.io/co/companies/c/library/x.webp?tr=w-800">' }]
  assert.deepEqual([...extractReferencedAssetIds(assets, pages)], ['a1'])
})

test('partitionTrashableAssets: separa referenciados', () => {
  const out = partitionTrashableAssets({
    assets: [{ id: 'a1' }, { id: 'a2' }],
    referencedIds: new Set(['a1']),
  })
  assert.deepEqual(out.trashable.map((a) => a.id), ['a2'])
  assert.deepEqual(out.kept, [{ id: 'a1', reason: 'referenced' }])
})
```

- [ ] **Step 2: `lib/assetReferences.js`**

```js
// Detección de assets usados en páginas: regex sobre content_html, mismo
// enfoque que el orphan-resolve de comments (projects.js, `comment_orphaned`).
import { supabaseAdmin } from './supabase.js'

export function extractReferencedAssetIds(assets, pages) {
  const referenced = new Set()
  const haystack = (pages || []).map((p) => p?.content_html || '').join('\n')
  if (!haystack) return referenced
  for (const asset of assets || []) {
    const needles = [asset.storage_path, asset.public_url].filter(Boolean)
    if (needles.some((n) => haystack.includes(n))) referenced.add(asset.id)
  }
  return referenced
}

export async function findReferencedAssetIds(companyId, assets) {
  if (!assets?.length) return new Set()
  const { data: projects } = await supabaseAdmin
    .from('projects').select('id').eq('company_id', companyId)
  const projectIds = (projects || []).map((p) => p.id)
  if (!projectIds.length) return new Set()
  const { data: pages } = await supabaseAdmin
    .from('project_pages').select('content_html').in('project_id', projectIds)
  return extractReferencedAssetIds(assets, pages || [])
}
```

- [ ] **Step 3: Endpoints** en `library.js` (usar helpers; `partitionTrashableAssets` exportado):

```js
import { findReferencedAssetIds } from '../lib/assetReferences.js'
import { resolveCompanyAssetForExport, normalizeExportOptions, buildExportFileName } from '../lib/assetExport.js'
import { deleteFromImageKit, buildImageKitUrl, buildImageKitTransformations } from '../lib/imagekit.js'
import archiver from 'archiver'

export function partitionTrashableAssets({ assets, referencedIds }) {
  const trashable = []
  const kept = []
  for (const asset of assets || []) {
    if (referencedIds.has(asset.id)) kept.push({ id: asset.id, reason: 'referenced' })
    else trashable.push(asset)
  }
  return { trashable, kept }
}
```

- `POST /assets/bulk/move` `{ ids, folderId }`: valida folder destino de la empresa (o null=raíz), `update project_assets set folder_id where id in ids and company_id = X`, responde 207-style `{ moved: n, failed: [] }`.
- `POST /assets/bulk/trash` `{ ids, force? }`: carga assets por ids+company, `findReferencedAssetIds`, si `force !== true` particiona; setea `trashed_at = now()`, `delete_after = now() + interval '30 days'` a los trashables. Respuesta `{ trashed, kept }` (kept incluye `reason:'referenced'` y `fileName` para el toast).
- `POST /assets/bulk/restore` `{ ids }`: limpia `trashed_at/delete_after` (si `folder_id` apunta a carpeta trasheada/inexistente → `folder_id = null`).
- `POST /folders/:folderId/trash` y `/restore`: papelera de carpeta = carpeta + descendientes + assets contenidos (misma marca de tiempo); restore repone el subárbol; si el padre quedó trasheado, el restore cuelga la carpeta en raíz.
- `POST /trash/empty`: lista assets trasheados de la empresa; por cada uno, `imagekit` → `deleteFromImageKit(imagekit_file_id)`, storage → `supabase.storage.from(bucket).remove([path])` (patrón `purgeProjectAssets`, projects.js — buscar `purgeProjectAssets`); borra filas + carpetas trasheadas. Respuesta `{ purged: n, freedBytes }`. `logSecurityEvent` acción `library_trash_emptied`.
- `POST /assets/export` `{ ids, format?, width?, quality?, trashAfterExport? }`: streaming ZIP con `archiver` replicando `export-bulk` (projects.js:2159) pero resolviendo por `resolveCompanyAssetForExport`; al terminar el ZIP, si `trashAfterExport`, aplicar la misma lógica de bulk/trash (partition + kept en header `X-Library-Kept` con JSON `[{id, fileName}]` — el frontend lo lee para el toast).

- [ ] **Step 4:** `npm test` → PASS + suite verde.
- [ ] **Step 5: Commit** — `git add backend/src/routes/library.js backend/src/lib/assetReferences.js backend/test/library-trash.test.js && git commit -m "feat(backend): bulk, papelera con protección de referencias y export ZIP de biblioteca"`

### Task 9: Cuota en endpoints existentes

**Files:**
- Modify: `backend/src/routes/projects.js` (`POST /:id/assets` ~1993 y `POST /:id/assets/convert` ~2341)

- [ ] **Step 1:** En ambos endpoints, tras resolver `project` y permisos, insertar:

```js
const quota = await checkCompanyStorageQuota(project.company_id, req.file?.size || 0)
if (!quota.allowed) {
  return res.status(413).json({ error: quota.message, code: quota.code })
}
```

Import: `import { checkCompanyStorageQuota } from '../lib/storageQuota.js'`. En `/convert` pasar `0` como incoming (tamaño desconocido pre-conversión).

- [ ] **Step 2:** `npm test` → suite verde (sin tests nuevos: la lógica de cuota ya está testeada en Task 2; esto es wiring).
- [ ] **Step 3: Commit** — `git add backend/src/routes/projects.js && git commit -m "feat(backend): cuota de empresa aplicada a uploads del editor y conversiones"`

### Task 10: Cliente API frontend — `lib/libraryApi.js`

**Files:**
- Create: `frontend/src/lib/libraryApi.js`

- [ ] **Step 1: Implementación completa** (apiFetch para JSON; XHR para upload con progreso — apiFetch no expone progress):

```js
// frontend/src/lib/libraryApi.js
import { apiFetch, apiSubmitDownload } from './api'
import { supabase } from './supabase'

const base = (companyId) => `/api/companies/${companyId}/library`

export function fetchLibrary(companyId, { folderId, projectId, view } = {}) {
  const params = new URLSearchParams()
  if (folderId) params.set('folderId', folderId)
  if (projectId) params.set('projectId', projectId)
  if (view) params.set('view', view)
  const qs = params.toString()
  return apiFetch(`${base(companyId)}${qs ? `?${qs}` : ''}`)
}

export const createFolder = (companyId, body) => apiFetch(`${base(companyId)}/folders`, { method: 'POST', body: JSON.stringify(body) })
export const updateFolder = (companyId, folderId, body) => apiFetch(`${base(companyId)}/folders/${folderId}`, { method: 'PATCH', body: JSON.stringify(body) })
export const trashFolder = (companyId, folderId) => apiFetch(`${base(companyId)}/folders/${folderId}/trash`, { method: 'POST' })
export const restoreFolder = (companyId, folderId) => apiFetch(`${base(companyId)}/folders/${folderId}/restore`, { method: 'POST' })
export const moveAssets = (companyId, ids, folderId) => apiFetch(`${base(companyId)}/assets/bulk/move`, { method: 'POST', body: JSON.stringify({ ids, folderId }) })
export const trashAssets = (companyId, ids, { force } = {}) => apiFetch(`${base(companyId)}/assets/bulk/trash`, { method: 'POST', body: JSON.stringify({ ids, force }) })
export const restoreAssets = (companyId, ids) => apiFetch(`${base(companyId)}/assets/bulk/restore`, { method: 'POST', body: JSON.stringify({ ids }) })
export const emptyLibraryTrash = (companyId) => apiFetch(`${base(companyId)}/trash/empty`, { method: 'POST' })
export const searchLibrary = (companyId, q) => apiFetch(`${base(companyId)}/search?q=${encodeURIComponent(q)}`)
export const exportLibraryAssets = (companyId, body) => apiSubmitDownload(`${base(companyId)}/assets/export`, body)

export async function uploadLibraryAsset({ companyId, folderId, file, onProgress, signal }) {
  const { data: { session } } = await supabase.auth.getSession()
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${base(companyId)}/assets`)
    if (session?.access_token) xhr.setRequestHeader('Authorization', `Bearer ${session.access_token}`)
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100))
    }
    xhr.onload = () => {
      let payload = null
      try { payload = xhr.responseText ? JSON.parse(xhr.responseText) : null } catch { payload = null }
      if (xhr.status >= 200 && xhr.status < 300) resolve(payload)
      else reject(Object.assign(new Error(payload?.error || `Error ${xhr.status}`), { status: xhr.status, code: payload?.code }))
    }
    xhr.onerror = () => reject(new Error('Error de red al subir'))
    if (signal) signal.addEventListener('abort', () => { xhr.abort(); reject(new DOMException('Aborted', 'AbortError')) })
    const form = new FormData()
    form.append('folderId', folderId || '')
    form.append('file', file)
    xhr.send(form)
  })
}
```

Nota: verificar la firma real de `apiSubmitDownload` en `lib/api.js` y ajustar la llamada a su contrato (POST con body JSON → descarga blob). Backend: `folderId` llega como string vacío cuando es raíz — normalizar con `req.body?.folderId || null` (ya cubierto en Task 7).

- [ ] **Step 2:** `cd frontend && npx vite build` → OK.
- [ ] **Step 3: Commit** — `git add frontend/src/lib/libraryApi.js && git commit -m "feat(frontend): cliente API de biblioteca con upload con progreso"`

### Task 11: Página Biblioteca — shell, ruta, navegación, grid, barra de uso

**Files:**
- Create: `frontend/src/pages/LibraryPage.jsx` + `frontend/src/pages/LibraryPage.module.css`
- Create: `frontend/src/components/library/AssetGrid.jsx` + `.module.css`
- Create: `frontend/src/components/library/StorageUsageBar.jsx` + `.module.css`
- Create: `frontend/src/components/library/NewFolderModal.jsx`
- Modify: `frontend/src/App.jsx` (ruta lazy)
- Modify: `frontend/src/components/layout/AppShell.jsx` (link sidebar)

- [ ] **Step 1: Ruta.** En `App.jsx`, junto a los hijos de `/c/:companySlug` (línea ~137):

```jsx
const LibraryPage = lazy(() => import('./pages/LibraryPage'))
// ...
<Route path="library" element={<LibraryPage />} />
```

- [ ] **Step 2: Sidebar.** En `AppShell.jsx`, replicar el item del workspace "Proyectos" (grep `projects` / `Proyectos`) con: label `Biblioteca`, icono `Images` de lucide-react, ruta `library`. Mismo gate de visibilidad que Proyectos/Equipo (miembros del workspace; QA/admin ven).
- [ ] **Step 3: LibraryPage.** Orquestador con el hook de empresa activa que use `ProjectsPage.jsx` (grep `currentCompany` ahí y replicar):

```jsx
// frontend/src/pages/LibraryPage.jsx — ver DESIGN-SYSTEM.md §page header
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { FolderPlus, Upload, Trash2, ChevronRight, Images } from 'lucide-react'
import { Button } from '../components/ui'
import AssetGrid from '../components/library/AssetGrid'
import StorageUsageBar from '../components/library/StorageUsageBar'
import NewFolderModal from '../components/library/NewFolderModal'
import { fetchLibrary } from '../lib/libraryApi'
import styles from './LibraryPage.module.css'

export default function LibraryPage() {
  const currentCompany = /* mismo hook que ProjectsPage */ null
  const [searchParams, setSearchParams] = useSearchParams()
  const folderId = searchParams.get('folderId')
  const projectId = searchParams.get('projectId')
  const view = searchParams.get('view')
  const [data, setData] = useState(null)
  const [loadState, setLoadState] = useState('loading')
  const [newFolderOpen, setNewFolderOpen] = useState(false)

  const reload = useCallback(async () => {
    if (!currentCompany?.id) return
    setLoadState('loading')
    try {
      setData(await fetchLibrary(currentCompany.id, { folderId, projectId, view }))
      setLoadState('ready')
    } catch {
      setLoadState('error')
    }
  }, [currentCompany?.id, folderId, projectId, view])

  useEffect(() => { reload() }, [reload])

  const openFolder = (id) => setSearchParams(id ? { folderId: id } : {})
  const canWrite = data?.role === 'write'

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <nav className={styles.breadcrumb} aria-label="Carpetas">
          <button type="button" onClick={() => openFolder(null)} className={styles.crumb}>Biblioteca</button>
          {(data?.breadcrumb || []).map((f) => (
            <span key={f.id} className={styles.crumbGroup}>
              <ChevronRight size={14} aria-hidden />
              <button type="button" onClick={() => openFolder(f.id)} className={styles.crumb}>{f.name}</button>
            </span>
          ))}
        </nav>
        {canWrite && (
          <div className={styles.actions}>
            <Button variant="ghost" onClick={() => setNewFolderOpen(true)}><FolderPlus size={16} /> Nueva carpeta</Button>
            <Button variant="primary" onClick={() => document.getElementById('library-file-input')?.click()}><Upload size={16} /> Subir imágenes</Button>
          </div>
        )}
      </header>
      {/* Task 12 agrega aquí <UploadDropzone> envolviendo el contenido */}
      <AssetGrid
        folders={data?.subfolders || []}
        assets={data?.assets || []}
        loading={loadState === 'loading'}
        error={loadState === 'error'}
        onRetry={reload}
        onOpenFolder={openFolder}
        canWrite={canWrite}
        view={view}
      />
      <footer className={styles.footer}>
        <StorageUsageBar usage={data?.usage} />
        <button type="button" className={styles.trashLink} onClick={() => setSearchParams(view === 'trash' ? {} : { view: 'trash' })}>
          <Trash2 size={14} aria-hidden /> {view === 'trash' ? 'Volver a la biblioteca' : 'Papelera'}
        </button>
      </footer>
      <NewFolderModal
        open={newFolderOpen}
        onClose={() => setNewFolderOpen(false)}
        companyId={currentCompany?.id}
        parentFolderId={folderId}
        onCreated={reload}
      />
    </div>
  )
}
```

- [ ] **Step 4: AssetGrid** — grid `repeat(auto-fill, minmax(160px, 1fr))`; subcarpetas primero (cards con icono `Folder` + nombre + conteo), luego assets (`AssetCard` interno: thumb `public_url` + `?tr=w-300` cuando `storage_bucket==='imagekit'`, si no `public_url` directo; nombre truncado con ellipsis + `min-width: 0`). Estados: skeleton (8 bloques `background: var(--wb-surface-muted)` con animación de opacidad), vacío ("Arrastra imágenes o crea una carpeta para empezar" + icono `Images`), error con botón Reintentar. Vista `view==='trash'`: cards con overlay atenuado + acciones Restaurar / botón global "Vaciar papelera" (Task 13 los conecta).
- [ ] **Step 5: StorageUsageBar**

```jsx
// frontend/src/components/library/StorageUsageBar.jsx
import styles from './StorageUsageBar.module.css'
import { cn } from '../ui'

const MB = 1024 * 1024
export default function StorageUsageBar({ usage }) {
  if (!usage) return null
  const quotaBytes = (usage.quotaMb || 100) * MB
  const pct = Math.min(100, Math.round((usage.usedBytes / quotaBytes) * 100))
  const level = pct >= 100 ? 'full' : pct >= 80 ? 'warn' : 'ok'
  return (
    <div className={styles.wrap} role="status" aria-label="Uso de almacenamiento">
      <div className={styles.track}>
        <div className={cn(styles.fill, level === 'warn' && styles.fillWarn, level === 'full' && styles.fillFull)} style={{ width: `${pct}%` }} />
      </div>
      <span className={styles.label}>
        {Math.round(usage.usedBytes / MB)} de {usage.quotaMb} MB
        {usage.trashedBytes > 0 && ` · ${Math.round(usage.trashedBytes / MB)} MB en papelera`}
      </span>
    </div>
  )
}
```

CSS: track `height: 6px; border-radius: var(--wb-radius-full); background: var(--wb-color-neutral-200)`; fill `background: var(--wb-color-primary-600)`; `fillWarn` → `--wb-color-warning-500`; `fillFull` → `--wb-color-danger-600`; label `font-size: var(--wb-text-xs); color: var(--wb-text-muted)`.

- [ ] **Step 6: NewFolderModal** — `Modal` + `Input` + acciones (patrón §Modal anatomy); submit llama `createFolder(companyId, { name, parentFolderId })`, cierra y `onCreated()`.
- [ ] **Step 7:** `npx vite build` → OK. Verificación visual mínima en dev server (la sesión principal la hace en Task 15; aquí solo build).
- [ ] **Step 8: Commit** — `git add frontend/src/App.jsx frontend/src/pages/LibraryPage.jsx frontend/src/pages/LibraryPage.module.css frontend/src/components/library/ frontend/src/components/layout/AppShell.jsx && git commit -m "feat(frontend): página Biblioteca con carpetas, grid y barra de uso"`

### Task 12: Subida — dropzone, cola, panel de progreso, carpetas arrastradas

**Files:**
- Create: `frontend/src/components/library/UploadDropzone.jsx` + `.module.css`
- Create: `frontend/src/components/library/UploadQueuePanel.jsx` + `.module.css`
- Create: `frontend/src/components/library/FolderUploadConfirmModal.jsx`
- Create: `frontend/src/lib/uploadQueue.js`
- Modify: `frontend/src/pages/LibraryPage.jsx`

- [ ] **Step 1: `lib/uploadQueue.js`** — cola con concurrencia 3, cancelación y reintento:

```js
// frontend/src/lib/uploadQueue.js
import { uploadLibraryAsset } from './libraryApi'

export const ACCEPTED_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'])
export const MAX_FILE_BYTES = 30 * 1024 * 1024

export function partitionFiles(files) {
  const accepted = []
  const excluded = []
  for (const file of files) {
    if (!ACCEPTED_MIMES.has(file.type)) excluded.push({ file, reason: 'unsupported' })
    else if (file.size > MAX_FILE_BYTES) excluded.push({ file, reason: 'too_big' })
    else accepted.push(file)
  }
  return { accepted, excluded }
}

export async function readDroppedItems(dataTransferItems) {
  // Devuelve { files: [{file, relativePath}], folderName|null }
  const entries = [...dataTransferItems].map((i) => i.webkitGetAsEntry?.()).filter(Boolean)
  const files = []
  let folderName = null
  async function walk(entry, prefix) {
    if (entry.isFile) {
      const file = await new Promise((res, rej) => entry.file(res, rej))
      files.push({ file, relativePath: prefix })
    } else if (entry.isDirectory) {
      if (!prefix && !folderName) folderName = entry.name
      const reader = entry.createReader()
      let batch
      do {
        batch = await new Promise((res, rej) => reader.readEntries(res, rej))
        for (const child of batch) await walk(child, prefix ? `${prefix}/${entry.name}` : entry.name)
      } while (batch.length)
    }
  }
  for (const entry of entries) await walk(entry, '')
  return { files, folderName }
}

export function createUploadQueue({ companyId, onUpdate, concurrency = 3 }) {
  const items = []
  let active = 0
  const notify = () => onUpdate([...items])

  function pump() {
    while (active < concurrency) {
      const next = items.find((i) => i.status === 'queued')
      if (!next) break
      active += 1
      next.status = 'uploading'
      notify()
      uploadLibraryAsset({
        companyId,
        folderId: next.folderId,
        file: next.file,
        onProgress: (pct) => { next.progress = pct; if (pct === 100) next.status = 'converting'; notify() },
      })
        .then((payload) => { next.status = 'done'; next.result = payload; notify() })
        .catch((error) => {
          next.status = 'error'
          next.error = error.code === 'quota_exceeded' ? 'Espacio lleno' : (error.message || 'Error')
          next.errorCode = error.code || null
          notify()
        })
        .finally(() => { active -= 1; pump() })
    }
  }

  return {
    add(files) {
      for (const { file, folderId } of files) {
        items.push({ id: `${file.name}-${file.size}-${items.length}`, file, folderId, status: 'queued', progress: 0 })
      }
      notify(); pump()
    },
    retry(id) {
      const item = items.find((i) => i.id === id)
      if (item && item.status === 'error') { item.status = 'queued'; item.error = null; notify(); pump() }
    },
    clearDone() {
      for (let i = items.length - 1; i >= 0; i--) if (items[i].status === 'done') items.splice(i, 1)
      notify()
    },
    items,
  }
}
```

- [ ] **Step 2: UploadDropzone** — envuelve el contenido de LibraryPage; escucha `dragenter/over/leave/drop` en el contenedor; overlay `position:absolute; inset:0; border: 2px dashed var(--wb-color-primary-600); background: color-mix(in srgb, var(--wb-color-primary-50) 85%, transparent); z-index: var(--wb-z-overlay)` con texto "Suelta para subir en «{carpeta actual}»" + subtexto de formatos. En `drop`: `readDroppedItems`; si `folderName` → abrir `FolderUploadConfirmModal` con `{files, excluded, folderName}`; si no → `partitionFiles` y `queue.add(...)` directo a la carpeta actual (excluidos → toast). Input file oculto `id="library-file-input"` multiple accept=".jpg,.jpeg,.png,.webp,.svg" conecta el botón "Subir imágenes".
- [ ] **Step 3: FolderUploadConfirmModal** — Modal con: árbol resumido (carpeta raíz + subcarpetas con conteos, derivado de `relativePath`), total (`N imágenes · X MB`), nota azul de conversión ("Se convertirán a WebP ≤2560px al subir; los PNG conservan su formato"), bloque ámbar de excluidos (nombre + motivo), CTA `Subir N imágenes`. Al confirmar: crear carpetas vía `createFolder` en orden (raíz → hijas, cache path→id), luego `queue.add` con cada archivo apuntando al `folderId` de su `relativePath`. Sin estimación de ahorro exacta — usar "~97%" fijo del spec.
- [ ] **Step 4: UploadQueuePanel** — card `position: fixed` abajo-derecha (`right: var(--wb-space-6); bottom: var(--wb-space-6); z-index: var(--wb-z-toast); width: 320px; box-shadow: var(--wb-shadow-card)`); header "Subiendo X de N" (o "Subida completa · ahorro {sum original → sum final}") + minimizar/cerrar; filas: nombre truncado + estado (barra de progreso 4px / "convirtiendo…" / check verde con `original → final` formateado / error rojo con botón Reintentar). Al completarse todo: refrescar listado (`onAllDone`) y toast resumen. "Cerrar" solo si no hay activos (si hay, confirm nativo).
- [ ] **Step 5:** Integrar en LibraryPage (estado `queueItems`, `queue` en `useRef`, `onAllDone: reload`). `npx vite build` → OK.
- [ ] **Step 6: Commit** — `git add frontend/src/components/library/ frontend/src/lib/uploadQueue.js frontend/src/pages/LibraryPage.jsx frontend/src/pages/LibraryPage.module.css && git commit -m "feat(frontend): subida con cola, panel de progreso y carpetas arrastradas"`

### Task 13: Multiselección, bulk, mover, papelera

**Files:**
- Create: `frontend/src/components/library/MoveToFolderModal.jsx`
- Modify: `frontend/src/components/library/AssetGrid.jsx` (checkboxes + kebab)
- Modify: `frontend/src/pages/LibraryPage.jsx` (selección + toolbar + handlers)

- [ ] **Step 1: Selección** — replicar el patrón bulk de `ProjectsPage.jsx` (grep `selectedIds`): `Set` en estado; checkbox top-right visible en hover o select-mode; click en card = toggle si hay selección, abrir/preview si no; ESC limpia (sin robar a modales); toolbar sticky con `N seleccionadas · Mover | Exportar | Papelera | Cancelar`.
- [ ] **Step 2: Kebab por asset** — `KebabMenu` items: Renombrar (prompt modal simple sobre `file_name`, PATCH no existe → usar `moveAssets`?? NO: agregar en backend `PATCH /assets/:assetId` con `{ fileName }` en `library.js` — 10 líneas, mismo patrón que folders), Mover a carpeta, Exportar, Enviar a papelera (destructive). Kebab de carpeta: Renombrar / Mover / Enviar a papelera.
- [ ] **Step 3: MoveToFolderModal** — Modal con árbol de carpetas (lista indentada por profundidad, construida de `folders` que ya vienen en el fetch; raíz seleccionable); al confirmar `moveAssets(companyId, ids, folderId)` y reload. Reusar para carpeta (PATCH parentFolderId).
- [ ] **Step 4: Papelera** — en `view==='trash'`: toolbar propia (Restaurar seleccionadas / Vaciar papelera con confirm modal "Se eliminarán definitivamente N imágenes (X MB). Esta acción no se puede deshacer."). `trashAssets` normal: si respuesta trae `kept.length`, toast ámbar "N enviadas a papelera · M conservadas (usadas en documentos)".
- [ ] **Step 5:** `npx vite build` → OK. Commit — `git add frontend/src/components/library/ frontend/src/pages/LibraryPage.jsx backend/src/routes/library.js && git commit -m "feat(frontend): multiselección, mover, renombrar y papelera de biblioteca"`

### Task 14: Export con limpieza + picker en el editor

**Files:**
- Create: `frontend/src/components/library/LibraryExportModal.jsx`
- Create: `frontend/src/components/library/LibraryPickerModal.jsx`
- Modify: `frontend/src/pages/LibraryPage.jsx` (abrir export modal)
- Modify: `frontend/src/pages/ProjectEditor.jsx` (picker + link)

- [ ] **Step 1: LibraryExportModal** — formato segmented (WebP/PNG/JPG — patrón segmented control de DESIGN-SYSTEM §3), ancho máx (Input numérico, default 2560), calidad (Input numérico 1-100, default 80), toggle "Enviar a papelera tras exportar" (default ON, persistir preferencia en `localStorage['wb:library:trashAfterExport']`), texto de ayuda "Recuperables por 30 días". Submit: `exportLibraryAssets(companyId, { ids, format, width, quality, trashAfterExport })`; si el response header `X-Library-Kept` trae items, toast "«{fileName}» está usada en documentos — se exportó pero se conserva" (leer header: `apiSubmitDownload` debe exponerlo; si no lo expone, cambiar el contrato del backend para devolver los kept como query previa: llamada `trashAssets` separada post-descarga desde el cliente — decidirlo al implementar y documentar en el commit).
- [ ] **Step 2: Picker en el editor.** En `ProjectEditor.jsx`, junto al input file de imagen (~7662), agregar opción "Desde biblioteca" (mismo menú/flujo donde vive "subir imagen"; grep el handler del input). Abre `LibraryPickerModal` (`companyId` viene del proyecto cargado — grep `company_id` en el fetch del proyecto): búsqueda (`searchLibrary` con debounce 300ms) + grid compacto + carpetas navegables (reusar `fetchLibrary`); al confirmar, insertar con el mismo comando que usa el flujo de imagen por URL existente (attrs `src: public_url` con `?tr=w-1600` si es imagekit, `assetId`, `fileName`, `storagePath`) — grep cómo construye attrs el upload actual y replicar.
- [ ] **Step 3: Link inverso.** En LibraryPage, si `projectId` en query: chip "Filtrando por proyecto {nombre} ✕" (quitar = volver a raíz). En el editor, botón/entrada "Ver imágenes del proyecto" (donde viva el acceso natural — junto al picker) que navega a `/c/{slug}/library?projectId={id}`.
- [ ] **Step 4:** `npx vite build` → OK. Commit — `git add frontend/src/components/library/ frontend/src/pages/LibraryPage.jsx frontend/src/pages/ProjectEditor.jsx && git commit -m "feat(frontend): export con limpieza opcional y picker desde biblioteca"`

### Task 15: Verificación integral, docs y bump

**Files:**
- Modify: `CONTEXT.min.md`, `CONTEXT.md`, `DESIGN-SYSTEM.md`, `frontend/package.json` + `frontend/package-lock.json`

- [ ] **Step 1:** `cd backend && npm test` → TODA la suite verde. `cd frontend && npx vite build` → OK.
- [ ] **Step 2 (sesión principal, no subagent):** verificación browser con dev server + cuenta `claude-bot` (el usuario loguea — ver memoria de workflow): checklist = los 7 pasos del mockup + cuota (subir hasta 80% → barra ámbar; 100% → bloqueo con mensaje; vaciar papelera libera). Guardar screenshots de evidencia.
- [ ] **Step 3: Docs.** Agregar a `CONTEXT.min.md`: target `library` (keep/watch), hechos nuevos (rutas library, cuota, tabla asset_folders, project_id nullable). `DESIGN-SYSTEM.md` §5: componentes library. `CONTEXT.md`: entrada de sesión.
- [ ] **Step 4: Bump MINOR** — `cd frontend && npm version minor --no-git-tag-version` (2.12.0 → 2.13.0; F0 ya ocupó 2.12.0).
- [ ] **Step 5: Commits finales** — `git add CONTEXT.min.md CONTEXT.md DESIGN-SYSTEM.md && git commit -m "docs(context): biblioteca de imágenes F1"` y luego `git add frontend/package.json frontend/package-lock.json && git commit -m "chore(release): v2.13.0"`.
- [ ] **Step 6:** Reporte final al usuario: qué quedó commiteado, qué quedó dirty y por qué, migración pendiente de Prod (`20260719_image_library.sql`) y ajuste Nginx `client_max_body_size 35m` para el deploy (NO ejecutar el deploy).

---

## Self-review del plan (hecho)

- **Cobertura del spec:** §3 migración→T1; §4 ingesta→T4+T7; §5 cuota→T2+T9+barra T11; §6 limpieza→T8+T14; §7 UI→T11-T14 (rutas nuevas por WorkspaceLayout, no tabs — el spec decía "pestaña en CompanyPage" pero el código real migró a `/c/:slug/*`; la decisión equivalente es sub-ruta + sidebar, documentada aquí); §8 permisos→T5; §9 endpoints→T5-T8 (+PATCH asset rename agregado en T13); §10 edge cases→T7 (excluidos), T8 (referencias/ciclos), T12 (cola); §11 testing→tests por task + T15; §12 verificaciones→T4 Step 1 (pre-transform con fallback), T8 (purga en trash/empty + delete_after queda para job futuro: el spec permitía decidir "lazy vs job" — decisión: solo purga manual v1, el `delete_after` queda sembrado), T15 Step 6 (Nginx).
- **Sin placeholders:** el único hueco intencional es el branch SVG de T7 que se copia de código existente citado con instrucción explícita de dejarlo completo.
- **Consistencia de tipos:** `evaluateQuota` → `{allowed, code, message}` usado igual en T7/T9; `decideIngestPlan` → `{ok, kind, target, convert, reason}` consistente T4/T7; respuesta de listado (`subfolders/breadcrumb/assets/usage/role`) consistente T6/T10/T11; `trashAssets` → `{trashed, kept}` consistente T8/T13/T14.
