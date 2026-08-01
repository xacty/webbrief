# Biblioteca de imágenes — Fase 1 (diseño)

- Fecha: 2026-07-19
- Rama: `feat/image-library`
- Estado: aprobado en conversación (diseño + mockup de flujo de 7 pasos); pendiente revisión final de este documento
- Versión objetivo: bump MINOR → `2.13.0` en el commit deployable de la feature (F0 — auto-conversión en subidas existentes, rama `feat/upload-auto-convert` — ocupó `2.12.0`)

## 1. Contexto y objetivo

WeBrief hoy maneja imágenes solo como assets atados a un proyecto (subidas desde el editor, almacenadas en ImageKit con metadata en `project_assets`). No existe organización por carpetas ni una vista por cliente. El objetivo de Fase 1 es una **biblioteca de imágenes por empresa** con carpetas, conversión automática a formato web en la ingesta, acciones bulk, cuota de almacenamiento por cliente, y limpieza opcional tras exportar — reutilizando el pipeline ImageKit y el modal de conversión/export existentes.

**Fuera de alcance (fases futuras):**
- **Fase 2 — Google Drive**: importación vía Google Picker + scope `drive.file` (sin verificación pesada de Google). La decisión de qué cuentas se conectan (solo agencia vs. cada manager) quedó abierta a propósito; la arquitectura de F1 soporta ambas (tabla `user_integrations` futura + botón de importación como segunda puerta al mismo pipeline).
- **Fase 3 — Planes de pago**: subir límites de espacio por empresa. F1 deja el gancho: la cuota vive en `companies.storage_quota_mb`, cambiar de plan = cambiar ese número.

## 2. Decisiones cerradas

| Tema | Decisión |
|---|---|
| Usuarios | Solo equipo interno (admin, managers, editors). Nada en share público. |
| Ámbito | Biblioteca a nivel empresa + vista filtrada por proyecto ("ambas vistas"). |
| Originales | No se guardan. Ingesta convierte fotos a ≤2560px WebP q80 y descarta el original (solo transita por memoria). PNG conserva formato sin pérdida (solo resize). Tope 2560 = big image threshold de WordPress. |
| Limpieza | Modo importar→exportar→limpiar: toggle "enviar a papelera tras exportar" visible y activado por defecto en exports de biblioteca. |
| Formatos | Fotos JPG/WebP → WebP q80; PNG → sin pérdida (resize); GIF y SVG → passthrough. Sin HEIC/TIFF en v1. |
| Límite por archivo | 30 MB en la ingesta de biblioteca (el flujo del editor mantiene su límite actual de 8 MB). |
| Presupuesto | Estricto free tier. Contador de uso visible. |
| Cuota por cliente | **100 MB por empresa** (default), columna `companies.storage_quota_mb`. |

### Defaults adoptados (validados tácitamente; se pueden voltear en esta revisión)

- Carpetas anidadas sin límite de profundidad, navegación por breadcrumb.
- Papelera de biblioteca como vista dentro de la pestaña Biblioteca (no se mezcla con `/trash` global).
- v1 solo vista grid de miniaturas (sin vista lista).
- Búsqueda por nombre en la biblioteca y en el picker del editor.
- Carpeta arrastrada: se recrea la estructura recursivamente, con modal de confirmación previo (árbol + ahorro estimado + excluidos).
- Panel de subida flotante no bloqueante (estilo Drive) con reintento por archivo.

## 3. Modelo de datos

Migración `supabase/migrations/20260719_image_library.sql` (Dev primero, Prod al deploy):

```sql
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

alter table public.project_assets
  add column if not exists company_id uuid references public.companies(id) on delete cascade,
  add column if not exists folder_id uuid references public.asset_folders(id) on delete set null,
  add column if not exists origin text not null default 'editor'
    check (origin in ('upload','drive','converted','editor')),
  add column if not exists source_metadata jsonb;
alter table public.project_assets alter column project_id drop not null;

-- backfill company_id desde projects; luego (post-verificación) set not null
update public.project_assets a set company_id = p.company_id
  from public.projects p where a.project_id = p.id and a.company_id is null;

alter table public.companies
  add column if not exists storage_quota_mb integer not null default 100;

create index if not exists project_assets_company_idx
  on public.project_assets(company_id, folder_id, created_at desc) where trashed_at is null;
```

Notas:
- `project_id` pasa a nullable: assets de biblioteca pueden no pertenecer a un proyecto. Los del editor siguen llevando `project_id` + `section_id` como hoy.
- `origin` distingue procedencia; `'drive'` queda reservado para F2.
- `source_metadata` guarda `{ originalFileName, originalSize, originalWidth, originalHeight }` (F2 agrega `driveFileId`).
- Trigger `set_updated_at` reutilizado en `asset_folders`.
- RLS habilitada sin policies (patrón del repo: backend con service_role; INFO advisors esperados).
- **Cascade delete**: `purgeProjectAssets` se extiende a `purgeCompanyAssets` para el delete permanente de empresa.

## 4. Pipeline de ingesta

`POST /api/companies/:id/library/assets` (multer memoria, límite 30 MB, `rateLimiters.authenticatedUpload`):

1. Validar permiso (ver §8) y cuota (ver §5) **antes** de aceptar el archivo.
2. Raster: vía la lib compartida `backend/src/lib/imageIngest.js` (construida en F0) — fotos con pre-transformación `w-2560,h-2560,c-at_max,f-webp,q-80`, PNG solo `w-2560,h-2560,c-at_max` conservando formato; el original nunca se persiste. Carpeta ImageKit: `companies/{companyId}/library/{folderId}`.
   - Verificado en F0 con smoke test contra ImageKit Dev: pre-transformación aceptada por el SDK y sin upscale de imágenes más chicas (`c-at_max`).
3. SVG: passthrough a Supabase Storage `project-assets` (límite actual 8 MB aplica), `asset_kind='svg'`.
4. Insertar fila `project_assets` con `company_id`, `folder_id`, `origin='upload'`, `source_metadata`, dimensiones/tamaño reales post-conversión.
5. Respuesta por archivo (el frontend sube en cola, N paralelo bajo, p. ej. 3): `{ ok, asset }` o `{ ok:false, reason }` — el panel flotante muestra progreso, ahorro (`8,2 MB → 290 KB`) y reintento individual.

**Carpeta arrastrada** (webkitGetAsEntry, recursivo): el frontend arma el árbol, muestra el modal de confirmación (subcarpetas, conteo, tamaño total, ahorro estimado ~97%, excluidos por formato o >30 MB), crea las carpetas vía API y encola los archivos. No hay endpoint "bulk folder" — es orquestación del cliente sobre los endpoints atómicos.

## 5. Cuota de almacenamiento por empresa

- **Definición de uso**: `SUM(file_size)` de `project_assets` de la empresa con `delete_after` no vencido — es decir, **activos + papelera** (la papelera ocupa storage real). El breakdown se muestra: "82 MB usados · 12 MB en papelera".
- **Enforcement** en un helper único `checkCompanyStorageQuota(companyId, incomingBytes)` aplicado en: ingesta de biblioteca, subida desde editor (`POST /:id/assets`), y conversiones que crean assets (`/assets/convert`, MCP `assets_convertAndSave`).
  - Regla: si `uso actual ≥ cuota` → 413 con mensaje claro ("Espacio lleno: 100 de 100 MB. Libera espacio o vacía la papelera."). Si el archivo convertido empuja por encima, se permite ese único overshoot (el tamaño post-conversión no se conoce a priori); el siguiente upload ya queda bloqueado.
- **UI**: barra al pie de la biblioteca "X de 100 MB" (token primary; warning ≥80%, danger al 100%) + botón "Vaciar papelera" que purga (ImageKit + Storage + filas) y libera cuota al instante.
- **Nota de comportamiento existente**: el flujo del editor gana un caso de error nuevo cuando la empresa está llena. Aceptado explícitamente — la cuota es total por cliente. Mensaje de error específico para ese contexto.
- El contador global del free tier de ImageKit (3-5 GB) queda como métrica interna: endpoint admin-only que suma `file_size` global; visible solo para `platform_role='admin'` (en `/security` overview o en la propia biblioteca si admin).

## 6. Regla de limpieza post-export

- Export de biblioteca (single/bulk): toggle "Enviar a papelera tras exportar", **default ON**, recordado por usuario (localStorage).
- Protección: assets referenciados en `content_html` de alguna página (detección por regex de `storage_path`/`public_url`, mismo patrón que orphan-comments) se exportan pero **no** van a papelera; el modal lo informa antes de exportar ("«hero-home.webp» está usada en «Home v2» — se conserva").
- Papelera: `trashed_at` + `delete_after = now() + 30 días`; purga real vía job/lazy purge al listar (decisión de plan) o "Vaciar papelera" manual.
- Exports desde handoff (imágenes de documento) **no** muestran el toggle — comportamiento actual intacto.

## 7. UI

- **Pestaña "Biblioteca"** en `CompanyPage` (cuarto tab, patrón tabBar existente con subrayado `--wb-color-primary-600`).
- Componentes nuevos (`frontend/src/components/library/`, cada uno `.jsx + .module.css`, tokens únicamente):
  - `LibraryTab` (orquestador: breadcrumb, toolbar, grid, barra de uso)
  - `FolderChips` / `FolderBreadcrumb`
  - `AssetGrid` + `AssetCard` (thumb ImageKit `w-300`, checkbox hover, KebabMenu: Renombrar/Mover/Exportar/Papelera)
  - `UploadDropzone` (overlay drag, detección carpeta)
  - `UploadQueuePanel` (flotante bottom-right, no bloqueante, minimizable)
  - `FolderUploadConfirmModal` (árbol + ahorro + excluidos)
  - `MoveToFolderModal` (árbol de carpetas destino)
  - `StorageUsageBar`
  - `LibraryPickerModal` (editor: "Desde biblioteca" — búsqueda + grid + Insertar, inserta por URL pública como el flujo actual)
- **Vista por proyecto**: filtro "Este proyecto" dentro de la propia biblioteca (`?projectId=`), enlazado desde el editor ("Ver imágenes del proyecto"). No se agregan pestañas ni paneles al editor — el updates-panel y el handoff quedan intactos (invariantes de CONTEXT.min).
- Multiselección + toolbar sticky: mismo patrón bulk de proyectos (ESC limpia, click toggle en select-mode).
- Estados: vacío ("Arrastra imágenes o crea una carpeta"), cargando skeletons, error de carga con retry, papelera (filtro con Restaurar / Eliminar ya / Vaciar papelera).
- Modales siguen anatomía §3 de DESIGN-SYSTEM.md; radios según regla (§1); sin hex fuera de tokens.

## 8. Permisos

- Reutiliza `membershipPermissions`: admin global todo; `manager`/`editor` de la empresa: ver/subir/organizar/exportar en su empresa; QA: lectura global sin mutaciones; sin acceso público/share.
- Todas las rutas nuevas con `requireAuth` + rate limits existentes (`authenticatedUpload` para ingesta, `sensitiveAction` para folder CRUD/move/trash bulk).

## 9. Endpoints backend

Router nuevo `backend/src/routes/library.js` montado en `/api/companies/:companyId/library`:

| Método/Ruta | Descripción |
|---|---|
| `GET /` | Carpeta raíz o `?folderId=`: subcarpetas + assets paginados + uso/cuota |
| `POST /folders` | Crear carpeta (`name`, `parentFolderId?`) |
| `PATCH /folders/:folderId` | Renombrar / mover (`name?`, `parentFolderId?`) |
| `POST /folders/:folderId/trash` · `POST /folders/:folderId/restore` | Papelera de carpeta (cascada a contenido) |
| `POST /assets` | Ingesta (multipart, 30 MB, ver §4) |
| `POST /assets/bulk/move` | `{ ids, folderId }` → 207 Multi-Status |
| `POST /assets/bulk/trash` · `/restore` | Papelera bulk → 207 |
| `POST /assets/export` | Reusa lógica de export-bulk ZIP + transformaciones + flag `trashAfterExport` (aplica regla §6) |
| `GET /usage` | `{ usedBytes, trashedBytes, quotaMb }` |
| `POST /trash/empty` | Purga definitiva de la papelera de la empresa |
| `GET /search?q=` | Búsqueda por `file_name` en la empresa |

Rutas `bulk/*` declaradas antes de `/:id` (lección del repo). Los endpoints existentes de export/convert de proyecto no cambian de contrato; `/assets/convert` y subida de editor suman el check de cuota.

## 10. Errores y edge cases

- ImageKit caído / upload falla: sin fila huérfana (insert solo tras upload OK); fila de error con reintento en el panel.
- Cuota llena a mitad de un lote: los restantes fallan con `quota_exceeded`; el panel lo agrupa ("12 no subidas: espacio lleno").
- Nombres duplicados: permitidos (IDs únicos); el grid muestra el nombre tal cual.
- Carpeta con ciclo (mover a su propio descendiente): rechazado 400.
- Borrar carpeta → contenido va a papelera con ella; restaurar carpeta restaura contenido; si el padre ya no existe, restaura a raíz.
- Asset referenciado en página: protegido de auto-trash (§6); si igual se manda a papelera manualmente, la página muestra el fallback de imagen rota — la papelera avisa antes ("usada en N documentos").
- Excluidos en carpeta arrastrada: nunca se envían al backend (filtro client-side por MIME/tamaño), listados en el modal.

## 11. Testing

- Backend (node test, patrón suite existente): CRUD carpetas + validación de ciclos; `checkCompanyStorageQuota` (límites, overshoot, papelera cuenta); regla auto-trash con/sin referencia en páginas; permisos por rol; backfill `company_id`.
- Manual UI (dev server + cuenta `claude-bot` en Dev): flujo de 7 pasos del mockup como checklist de verificación, incluida cuota al 80%/100%.
- MCP: `assets_list` sigue funcionando (assets con `project_id` null no rompen contratos); tools de carpetas quedan para iteración MCP posterior.

## 12. Verificaciones pendientes (fase de plan)

1. ~~Sintaxis de pre-transformación y no-upscale~~ — **resuelto en F0** (smoke test contra ImageKit Dev, 2026-07-19).
2. Estrategia de purga de papelera (lazy vs. job) según lo que ya exista para `delete_after`. Decisión tomada en el plan: purga manual v1 ("Vaciar papelera"); `delete_after` queda sembrado para un job futuro.
3. Límite Nginx `client_max_body_size` en VPS para el endpoint de 30 MB (ajuste de config en deploy — aplica ya al deploy de F0).

## 13. Estimación (tiempo de ejecución de agente)

- F1.a Migración + backend library + cuota: ~25 min
- F1.b UI biblioteca (tab, grid, carpetas, subida, panel) : ~25 min
- F1.c Export/limpieza + picker editor + vista proyecto: ~15 min
- F1.d Tests + verificación browser + docs/context: ~15 min
- **Total: ~80 min** de agente. Espera humana aparte: revisión tuya, migración en Dev (MCP la aplica el agente), deploy solo cuando lo pidas.
