# Reporte de ejecución — Deep-links del editor/share + Galería Documentos/Briefs

> **Para el agente verificador:** documento auto-contenido. Cubre los dos planes de
> `docs/superpowers/plans/2026-08-06-editor-deeplinks.md` y
> `2026-08-06-galeria-documentos-briefs.md`, ya ejecutados y mergeados.
> Tu tarea es la verificación en browser (sección "Qué verificar") — la parte
> que el agente ejecutor no pudo hacer por requerir sesión autenticada.

## Estado

- Rama de trabajo: `feat/editor-deeplinks` (creada desde `feat/project-folders`).
- **Ya mergeada a `main`** en el commit `4e8dc6a`; main quedó luego en **v2.15.0** (`179d654`).
- Suite backend **290/290** y `npx vite build` verdes en cada commit.
- Entorno de prueba: **Dev** (Supabase `iimqxacagxuemwgaunis`), dev server local
  (`npm run dev` en `frontend/`, proxy `/api` → backend local :3000). Jamás Prod.
- Cuenta de prueba: `claude-bot@test.local` — reglas y procedimiento en
  `docs/WEBRIEF_DEV_CREDENTIALS.md` y CLAUDE.md (el agente NO tipea la
  contraseña; el dueño loguea y desde ahí se prueba).

## Plan 1 — Deep-links del editor y share

| Commit | Contenido |
|---|---|
| `6b6e335` | El editor lee `?p=<pageId>` al cargar (página inicial, fallback silencioso a la primera si no matchea) y `?s=<sectionId>` (scroll + flash reusando `navigateToSection`) |
| `dbb9661` | `?p` sincronizado con la página activa vía `replace` (borra `s` al cambiar de página); "Copiar enlace" en kebab de pill de página; "Copiar enlace a la sección" en panel de secciones y FAQ; "Copiar apuntando a la página actual" en ShareLinkPanel |
| `6a1c9dc` | SharePage: consume `?p`/`?s` (scroll + flash), scroll-spy refleja la página visible en `?p`, botón "Copiar enlace" en el encabezado |
| `b593055` | `CONTEXT.min.md` → target `editor.deeplinks` |

Desviaciones documentadas:
- Los kebabs de pill de página y de sección ahora se renderizan **también sin
  permisos de estructura**, con "Copiar enlace" como único item (antes solo
  existían para quien podía renombrar/eliminar).
- El flash del share usa la clase global `.wb-section-flash`
  (`frontend/src/styles/base.css`) en vez de una clase del CSS module: Vite
  renombra `animation-name` aunque los keyframes sean globales.

### Qué verificar (Plan 1)

1. Editor: abrir `/project/<id>/editor?p=<idPágina2>` → cae en esa página.
   Agregar `&s=<idSección>` → scroll + flash amarillo en la sección.
2. Cambiar de página con las pills → la URL actualiza `?p` y borra `?s`, sin
   sumar entradas al historial (probar el botón "atrás": no debe recorrer
   páginas).
3. Kebab de pill → "Copiar enlace"; kebab de sección (panel izquierdo) →
   "Copiar enlace a la sección"; toast de confirmación; pegar ambas URLs en
   otra pestaña y verificar destino exacto.
4. Panel derecho (Actualizaciones) → ShareLinkPanel → "Copiar apuntando a la
   página actual" (URL del share con `?p=` appendeado, token intacto).
5. Share público: abrir el link con `?p&s` → scroll + flash a la posición;
   scrollear entre páginas → `?p` se actualiza; botón "Copiar enlace" del
   encabezado copia la posición actual.
6. Params basura (`?p=xxx&s=yyy`) → carga normal en la primera página, sin
   errores en consola.

Datos útiles en Dev: proyecto "Testing Test" (`25098d7c-4a8c-48c9-9655-253b4dbde780`,
4 páginas: Inicio / Catalogo / Producto / Carrito-Checkout) sirve para todo el
checklist. Página "Producto" = `f26f31bb-c795-4619-811d-2bea777057de`, primera
sección `29d0558f-957e-4562-98b7-753801471e90`.

Ya verificado sin sesión (no repetir): `/share/<token-inválido>` renderiza
"Link no encontrado o expirado" sin errores JS; el editor sin sesión redirige
a login preservando la URL.

## Plan 2 — Galería: tabs Documentos y Briefs

| Commit | Contenido |
|---|---|
| `74dcc1a` | Backend: `GET /api/companies/:companyId/library?section=documents\|briefs` — filtra por las categorías exactas de `summarizeUsage`, suma `page_id`/`section_id`/`uploaded_by` al select, devuelve `projects: [{id, name}]`; 3 tests nuevos (`backend/test/library-sections.test.js`) |
| `62daf0c` | Frontend: tab bar Biblioteca \| Documentos \| Briefs (`?tab=`), agrupación por proyecto (`ProjectAssetGroups`), "Descargar todas (N)" por grupo, "Ir al documento" (deep-link `?p&s`), toolbar reducida (búsqueda + orden + toggle; selección solo Exportar), no-imágenes con icono + Descargar directo |
| `367f7c1` | Docs (`CONTEXT.min.md` target `library`, `DESIGN-SYSTEM.md` inventario) + fix: `isImageAsset` acepta `mime_type` legacy `"image"` a secas (fila real en Dev) con fallback a width/height |

Decisiones tomadas donde el plan dejaba margen:
- El export ZIP **no necesitó cambios**: `resolveCompanyAssetForExport`
  resuelve por `id` + `company_id` sin filtrar `project_id`
  (`backend/src/lib/assetExport.js:104`).
- "Descargar todas" incluye **solo imágenes** del grupo (el ZIP pasa por
  transformaciones de ImageKit; un PDF saldría corrupto/vacío). Los no-imagen
  se bajan de a uno con "Descargar" (abre `public_url`).
- Tope de 100 ids del endpoint de export: un grupo con más falla con el 400
  del backend — no se trunca en silencio.
- El kebab de `AssetGrid` ahora se arma con los callbacks realmente pasados;
  el tab Biblioteca pasa los 5 de siempre → queda idéntico.

### Qué verificar (Plan 2)

1. `/c/<slug>/library` → tabs Biblioteca | Documentos | Briefs; el tab activo
   vive en `?tab=` y sobrevive un refresh.
2. Tab Documentos: agrupa por proyecto. En Dev hay 3 grupos: **Testing Test**
   (3 imágenes), **Ejemplo** (1, la de mime legacy `"image"` — debe mostrar
   miniatura igual), **Demo Artículo Visual** (1). "Ir al documento" cae en
   página+sección exactas (los 5 assets tienen `page_id` y `section_id`).
3. "Descargar todas (N)" baja el ZIP del grupo; selección múltiple → la
   toolbar muta y solo ofrece "Exportar".
4. Tab Briefs: en Dev está **vacío** (0 filas) → debe verse el empty state.
   Para probar no-imágenes (PDF con icono + Descargar directo) hay que subir
   un adjunto desde un brief público primero.
5. Barra de almacenamiento: clic en el segmento "En documentos" → `?tab=documents`;
   "Adjuntos de brief" → `?tab=briefs`.
6. Tab Biblioteca intacto: subida (botón y drag&drop), carpetas, papelera,
   kebab con los 5 items, drag&drop de assets a carpetas y al crumb raíz.
7. Modal "Información" en Documentos muestra la fila "Proyecto".
8. En Documentos/Briefs NO deben existir: dropzone, "Nueva carpeta",
   "Subir imágenes", papelera, renombrar, mover (ni en kebab ni en right-click).

## Al terminar

Reportar hallazgos al dueño. Si aparece un bug, NO arreglar sobre `main`
directo: rama nueva desde `main`, reglas estándar del repo (branch-check antes
de cada commit, staging selectivo, suite + build verdes, español neutro, jamás
push/deploy/Prod sin pedido explícito).
