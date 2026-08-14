# Galería: tabs Documentos y Briefs ("Ola B") — Plan de implementación

> **Para el agente ejecutor (sesión limpia):** documento auto-contenido. PREREQUISITO DURO: el plan `2026-08-06-editor-deeplinks.md` debe estar COMPLETO y verde antes de empezar este (la acción "Ir al documento" usa sus URLs `?p&s`). Antes de empezar: lee `AI_GLOBAL.md` → `CONTEXT.min.md` → `DESIGN-SYSTEM.md`. Tasks en serie.

**Problema:** la Biblioteca solo muestra lo subido directamente a ella (`project_id IS NULL`). Las imágenes insertadas en documentos y los archivos adjuntados por respuestas de briefs existen (la barra de almacenamiento ya los cuenta como categorías "En documentos" y "Adjuntos de brief") pero no hay dónde VERLOS ni gestionarlos. El dueño del producto quiere: verlos agrupados automáticamente por proyecto, poder descargar todas las de un documento de una vez, y saltar al lugar exacto del documento donde vive cada imagen.

**Goal:** tabs **Biblioteca | Documentos | Briefs** en la página de Biblioteca. Documentos/Briefs son vistas de solo-lectura+export agrupadas por proyecto, con "Ir al documento" (deep-link) por imagen y "Descargar todas" por grupo.

**Rama:** continuar en `feat/editor-deeplinks` (o crear `feat/galeria-documentos` desde ella — a criterio según el estado; documentar la elección).

**Decisiones cerradas (no reabrir):**
- Las categorías son EXACTAMENTE las de `summarizeUsage` (backend/src/lib/storageQuota.js): brief = `uploaded_by IS NULL`; documentos = `project_id NOT NULL` con `uploaded_by NOT NULL`; biblioteca = `project_id IS NULL`. Papelera queda fuera de los tabs nuevos (tiene su vista propia).
- En Documentos/Briefs NO hay: subida, carpetas, mover, renombrar, papelera. Solo: ver (lightbox/info), Exportar/Descargar, "Ir al documento" (solo Documentos). Razón: esos archivos viven en contenido de documentos o son material recibido — borrarlos desde la galería rompería documentos (la protección server-side de referencias ya existe, pero mejor ni ofrecer la acción).
- Briefs puede contener NO-imágenes (PDF, Office — subidas del brief público): esas muestran icono de archivo, sin lightbox, y "Descargar" abre su `public_url` directo.
- "Ir al documento" → `/project/{project_id}/editor?p={page_id}&s={section_id}`; si el asset no tiene `page_id` (imágenes viejas o docs de brief), el link va sin `p`/`s` (abre el proyecto y ya). Nunca ocultar la acción por falta de esos campos en Documentos.
- "Descargar todas (N)" del grupo = el endpoint de export ZIP EXISTENTE de biblioteca (`POST /api/companies/:companyId/library/assets/export {ids}`) con los ids del grupo — verifica que ese endpoint no filtre por `project_id IS NULL` (resuelve por `resolveCompanyAssetForExport`, que va por `company_id` — debería servir tal cual; si filtra, ajústalo con test).

**Hechos verificados (base `5549868`):**
- Router de biblioteca: `backend/src/routes/library.js` — `GET /` arma `{subfolders, breadcrumb, allFolders, assets, usage, role}`; el select de assets incluye `project_id` y `folder_id` pero NO `page_id`/`section_id` ni `uploaded_by` (agregar). Query params ya soportados: `folderId`, `projectId`, `view=trash`.
- `project_assets` tiene `page_id`, `section_id`, `uploaded_by` desde siempre (schema).
- Nombres de proyecto: NO están en el shape del listado — la empresa tiene sus proyectos en `GET /api/companies/:id` (los consume ProjectsPage). Para agrupar, el backend debe devolver un mapa mínimo (ver B1) — NO hagas fetch extra desde el frontend por cada grupo.
- Frontend: `LibraryPage.jsx` orquesta todo; tab pattern del repo en DESIGN-SYSTEM §3 (underline `--wb-color-primary-600`); `AssetGrid` ya soporta modo lista/grid, lightbox, info; el context menu es genérico (`organizer/ItemContextMenu`, items planos).
- La barra de almacenamiento (`StorageUsageBar`) ya pinta estas categorías — los tabs son la vista navegable de lo mismo; buen lugar para linkear: click en el segmento "En documentos"/"Adjuntos de brief" podría llevar a su tab (extra barato, hazlo).

**Reglas estándar del repo:** branch-check antes de cada commit; staging selectivo; suite + build verdes por commit; español neutro (pluralización con tilde: `${n === 1 ? 'imagen' : 'imágenes'}`); tokens `--wb-*`; JAMÁS main/push/deploy/Prod; sin bump (se decide al merge).

---

### B1 — Backend: parámetro `section` + campos + mapa de proyectos (~12 min)

- `GET /api/companies/:companyId/library` acepta `section=documents|briefs` (default: comportamiento actual = biblioteca). Con `section`: ignora `folderId`, filtra por la categoría (queries arriba, siempre `trashed_at IS NULL`), y el select suma `page_id, section_id, uploaded_by`. Respuesta suma `projects: [{ id, name }]` (solo los proyectos referenciados por los assets devueltos — una query a `projects` con `id IN (...)`).
- Cap defensivo tipo el existente (limit 500) + mismo `readAccess`.
- TDD: helper puro para clasificar/particionar si extraes lógica (o tests de la forma de respuesta si montas test de handler puro); verifica también que export ZIP acepta ids de assets con `project_id NOT NULL` (test o inspección documentada).
- Commit: `feat(backend): secciones documentos y briefs en el listado de biblioteca`

### B2 — Frontend: tabs + grupos por proyecto + acciones (~18 min)

- Tab bar (patrón DESIGN-SYSTEM §3) encima de la toolbar en `LibraryPage`: Biblioteca | Documentos | Briefs. Estado en query param `tab=` (para poder linkear desde la barra de storage). En tabs nuevos: ocultar dropzone/subida/carpetas/papelera de la UI (la toolbar muta: solo búsqueda + orden + toggle grid/lista; selección solo habilita Exportar).
- Render agrupado: encabezado por proyecto (nombre + `N ${n===1?'imagen':'imágenes'}` + botón "Descargar todas") y debajo su grid/lista con `AssetGrid` (reusar; pasar los props de acciones REDUCIDOS: sin rename/move/trash — el componente ya es tolerante a callbacks ausentes; verifica que kebab/context muestren solo lo pasado).
- Acciones por asset en Documentos: Vista previa, Información, Exportar, **Ir al documento** (icono ExternalLink) → navega a la URL de deep-link (nueva pestaña NO — misma app, `navigate()`). En Briefs: Vista previa/Info/Descargar (los no-imagen: icono por tipo + Descargar directo).
- Barra de storage: click en segmento "En documentos" → `?tab=documents`; "Adjuntos de brief" → `?tab=briefs` (además de los clicks existentes).
- Info modal: en estos tabs muestra además el nombre del proyecto (ya lo tienes en el mapa `projects`).
- Commit: `feat(frontend): tabs Documentos y Briefs con grupos por proyecto e ir al documento`

### B3 — Verificación + docs (~8 min)

- Suite + build. Browser checklist: tab Documentos agrupa por proyecto y "Ir al documento" cae en página+sección exactas (requiere deep-links funcionando); "Descargar todas" baja ZIP del grupo; Briefs muestra PDF con icono y descarga directa; tab Biblioteca intacto (subida/carpetas/papelera solo ahí); links desde la barra de storage.
- `CONTEXT.min.md`: actualizar target `library` (tabs, solo-lectura en documentos/briefs, agrupación por proyecto). Commit docs + reporte final.
