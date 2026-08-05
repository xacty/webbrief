# Organización de Proyectos (Ola 2) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development o executing-plans, task por task EN SERIE (nunca dos agentes commiteando a la vez en este working tree).

**Goal:** Que 100 proyectos por empresa sean navegables: carpetas, búsqueda, filtros, orden, vista lista y drag & drop en ProjectsPage, reutilizando los componentes construidos en la biblioteca de imágenes (F1/F1.2).

**Architecture:** Nueva tabla `project_folders` + `projects.folder_id` (nullable). Componentes UX genéricos extraídos de `components/library/` a `components/organizer/` (la biblioteca pasa a importarlos de ahí). ProjectsPage adopta la misma gramática: barra persistente que muta con la selección, chips de carpetas, grid/lista, DnD con toast-deshacer, right-click.

**Semántica clave (decisión de producto):** borrar una carpeta de proyectos **JAMÁS toca los proyectos** — contenidos y subcarpetas se reparentan a la carpeta padre (o raíz). Sin papelera de carpetas de proyectos en v1: eliminar carpeta = hard delete del label, previa confirmación con conteo. Un proyecto es data de cliente; la carpeta es pura organización.

**Base:** rama `feat/project-folders` (nace de `feat/image-library` en `284ffe9`, con F0+F1+F1.1+F1.2-A incluidos). Bump: NINGUNO aquí — se decide al merge (sugerido v2.14.0 si se libera separado de la biblioteca).

**Reglas globales (idénticas a las del plan de biblioteca, resumidas):** `git branch --show-current` = `feat/project-folders` antes de CADA commit; staging selectivo; `cd backend && npm test` verde + `cd frontend && npx vite build` limpio antes de cada commit; DESIGN-SYSTEM.md leído antes de tocar UI; tokens `--wb-*`, radius rule, español neutro, pluralización `${n === 1 ? 'x' : 'xs'}` con tildes correctas; migraciones SOLO Supabase Dev (mcp__supabaseDev); JAMÁS main/push/deploy/Prod; líneas citadas son orientativas — grep antes de editar.

**Hechos verificados del código (base 284ffe9):**
- ProjectsPage: `frontend/src/pages/ProjectsPage.jsx` (grep `selectedIds` para el patrón bulk existente; cards con `[Abrir][Duplicar][⋮]`, checkbox hover, toolbar sticky, kebab `Mover de empresa/Archivar/Papelera`). Cache sessionStorage `webrief:company:<id>` — se invalida tras mutaciones (grep `companyCache`).
- Bulk endpoints existentes que NO cambian: `POST /api/projects/bulk/{archive,trash,move-company}` (207 Multi-Status).
- Biblioteca (referencia + fuente de extracción): `frontend/src/components/library/` — `ActionToast.jsx` (toast+deshacer), `LibraryContextMenu.jsx` (portal clamp/flip, close-on-scroll), `LibraryToolbar.jsx` (shell siempre montado que muta), `AssetGrid.jsx` (chips de carpeta + grid/lista con `<table>` sorteable + DnD con mime types namespaced + selección click/dblclick con `event.detail > 1`), `AssetInfoModal.jsx`.
- Backend biblioteca (referencia): `backend/src/routes/library.js` (`wouldCreateFolderCycle`, `validateFolderName`, `resolveLibraryRole`, mount con mergeParams ANTES de companiesRoutes en index.js:58). `req.currentUser` es camelCase (`platformRole`, memberships `companyId`).
- Empresa interna WeBrief (`isInternal`): sus cards NO llevan checkbox/kebab — invariante a conservar.

---

### O2.a — Extraer componentes compartidos a `components/organizer/`

**Objetivo:** generalizar sin cambiar comportamiento de la biblioteca. Build verde y biblioteca idéntica = criterio de éxito.

- Crear `frontend/src/components/organizer/` y MOVER ahí (renombrando a genérico): `ActionToast` (ya es genérico), `LibraryContextMenu` → `ItemContextMenu` (recibe items como props, sin conocimiento de assets), y extraer de `LibraryToolbar` el shell "barra que muta" → `MorphingToolbar` (slots `idle`/`selection`, min-height fija) que `LibraryToolbar` pasa a envolver.
- Los chips de carpeta y la tabla-lista NO se extraen como componentes (están entretejidos con AssetGrid); en su lugar extraer a `organizer/` los HELPERS reutilizables: `dnd.js` (mime types namespaced + createDragGhost + handlers de dragover/leave con guard de relatedTarget) y `sorting.js` (comparadores nombre/fecha/tamaño asc/desc). AssetGrid importa de ahí.
- Biblioteca actualiza imports; CERO cambios visuales/funcionales. `npx vite build` verde.
- Commit: `refactor(frontend): extraer componentes de organización compartidos (organizer/)`

### O2.b — Migración + backend project-folders

- Migración `supabase/migrations/20260805_project_folders.sql`: tabla `project_folders` (id, company_id FK cascade, parent_folder_id FK cascade, name, position, created_by, created_at, updated_at + trigger set_updated_at + índice company/parent + RLS enable sin policies) y `projects.folder_id uuid references project_folders(id) on delete set null` + índice parcial. SIN columnas de papelera (ver semántica). Aplicar SOLO en Dev (mcp__supabaseDev__apply_migration_file) + verificar con describe_table.
- Extraer `wouldCreateFolderCycle` y `validateFolderName` de `routes/library.js` a `backend/src/lib/folderTree.js` (library los re-importa; suite sigue verde — refactor verbatim).
- Router nuevo `backend/src/routes/projectFolders.js` montado en `/api/companies/:companyId/project-folders` (mergeParams, ANTES de companiesRoutes): `GET /` (todas las carpetas de la empresa + conteo de proyectos por carpeta), `POST /` (crear), `PATCH /:folderId` (renombrar/mover con validación de ciclo), `DELETE /:folderId` (hard delete: reparentar subcarpetas a su padre y `projects.folder_id` de contenidos al padre — en UNA transacción o secuencia segura; responde `{ deleted, reparentedProjects, reparentedFolders }`). Permisos: mismo `resolveLibraryRole` (write = admin/manager/editor de la empresa) — impórtalo o muévelo también a lib compartida.
- `PATCH /api/projects/:id` o endpoint bulk nuevo `POST /api/projects/bulk/move-to-folder` `{ ids, folderId }` (validar carpeta de la MISMA empresa que cada proyecto; 207-style; declarar antes de `/:id/*`). Listado de proyectos: agregar `folder_id` al select existente que consume ProjectsPage (grep dónde se listan: probablemente `GET /api/companies/:id` o `/api/projects?companyId=`).
- Tests TDD (patrón suite): ciclos (reusa los de library como referencia), semántica de DELETE reparent (helper puro `planFolderDeletion(folders, projects, folderId)` → `{ reparentedFolderIds, reparentedProjectIds, newParentId }`), validación de nombre. Suite completa verde.
- Commit: `feat(backend): carpetas de proyectos con borrado que reparenta`

### O2.c — UI ProjectsPage

- **Barra persistente** (`MorphingToolbar`): idle = búsqueda por nombre/cliente (input con debounce 200ms, client-side sobre la lista cargada) + Select tipo de proyecto (Todos/Contenido Web/Artículo/FAQs/Brief/Documento) + Select orden (Recientes/Nombre A-Z/Z-A/Últ. edición) + toggle grid/lista (localStorage `wb:projects:layout`). Con selección: muta a `N seleccionados · Mover a carpeta | Mover de empresa | Archivar | Papelera | Cancelar` (mismos handlers bulk existentes + el nuevo move-to-folder). Altura constante, cero reflow.
- **Chips de carpetas** arriba del grid (crear/renombrar/eliminar desde kebab del chip; eliminar = modal de confirmación mostrando "N proyectos y M subcarpetas se moverán a {destino}"); navegación por `?folderId=` (query param, como biblioteca); breadcrumb si hay anidamiento.
- **Vista lista**: `<table>` con Nombre, Tipo, Últ. edición, Estado (badge actual si existe) — headers sorteables `aria-sort`; filas con click=seleccionar / dblclick=Abrir / right-click=menú; <720px fuerza grid.
- **DnD**: cards de proyecto (single/multi con ghost "N proyectos") → chips y crumb raíz; mime `application/x-webrief-projects`; el drag interno no debe chocar con nada (ProjectsPage no tiene dropzone de archivos — más simple que biblioteca).
- **ActionToast + deshacer (15s)**: mover a carpeta (undo = snapshot de folder_id previos, mover de vuelta por grupos). Archivar/papelera bulk existentes se mantienen con su flujo actual (banner) — NO cambiar su semántica en esta ola; solo "mover a carpeta" usa el toast.
- **Right-click** (`ItemContextMenu`): proyecto = Abrir, Duplicar, Mover a carpeta, Mover de empresa, Archivar, Enviar a papelera (destructive); multi = las bulk; carpeta = Renombrar, Mover, Eliminar (destructive). Sobre WeBrief interna: NO menú.
- **Invariantes**: cards visualmente iguales (solo se agrega drag + right-click); checkbox/kebab de WeBrief interna ausentes como hoy; caches `webrief:company:<id>` invalidados tras mover-a-carpeta; ESC limpia selección sin robar a modales.
- Commit: `feat(frontend): carpetas, búsqueda, filtros, vista lista y drag & drop en Proyectos`

### O2.d — Verificación integral + docs

- Suite backend completa + `npx vite build`.
- CONTEXT.min.md: target `projects.org` (keep: semántica reparent, barra que muta, invariante WeBrief interna; watch: caches, mime types DnD, folderId en query). DESIGN-SYSTEM.md §5: inventario `components/organizer/`.
- Reporte final de la noche (ver contrato en la conversación).
- Commit docs: `docs(context): organización de proyectos Ola 2`
