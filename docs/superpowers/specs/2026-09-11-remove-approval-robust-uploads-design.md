# Quitar la aprobación de cambios y hacer robustas las subidas de imágenes — Diseño

- Fecha: 2026-09-11
- Estado: propuesto (pendiente de revisión del owner)
- Versión objetivo: 2.16.0 (MINOR: cambio visible de comportamiento)

## Contexto

- **Incidente 2026-09-11 (Prod, SoyPlenna → Locaciones):** un Company Admin aprobó 5 propuestas de diseño del 3–4 de agosto. Cada propuesta es una copia de la página completa, así que aprobarla pisó 7 secciones editadas ese mismo día. Ya se restauró con el criterio "lo más nuevo gana" y no queda ninguna propuesta pendiente en Prod.
- **Bug "se sube y desaparece":** el 08/09 un Manager subió 11 imágenes a Coapa y Del Valle. Las 11 existen en `project_assets`, pero ninguna quedó en el HTML guardado. No tiene que ver con la aprobación: los Manager publican directo.
- **Decisión del owner:** eliminar la aprobación para todos los roles. La red de seguridad es el historial por sección ("Ver detalle" → "Restaurar esta versión"), que ya existe.

## Objetivos

1. Todos los roles con permiso de escritura publican directo, incluido Diseño.
2. Una imagen subida nunca se pierde en silencio: termina insertada donde se soltó o el usuario recibe un aviso claro con lo que pasó y dónde está el archivo.

## No objetivos

- Reinsertar las 11 imágenes del 08/09 (decisión aparte, ver "Pendiente").
- Borrar la tabla `project_page_change_proposals`: se conserva como historial.
- Cambiar los permisos de estructura de Diseño: sigue sin poder crear, renombrar ni reordenar páginas.
- Cambiar la retención del historial (50 entradas por fila de actividad).

## Parte A — Eliminar el sistema de propuestas

### Backend (`backend/src/routes/projects.js`)

- `PUT /:id/pages`: quitar la rama `isDesignerProposalMode`. Diseño pasa por el mismo camino que el resto: guard de versión (409), saneo, actividad por sección y auto-resolución de comentarios huérfanos.
- `GET /:id`: quitar el overlay de la propuesta y el campo `pendingProposal`.
- Borrar `loadPendingPageProposals`, `upsertDesignerProposals`, `normalizeProposalStatus`, el flag `projectPageChangeProposalsTableAvailable` y `POST /:id/pages/:pageId/proposals/:proposalId/decision`, que pasa a responder 404.
- `backend/src/lib/assetReferences.js`: dejar de consultar propuestas, porque ya no habrá pendientes. Ajustar el comentario y el caso correspondiente de `backend/test/library-trash.test.js`.
- Sin migraciones: la tabla y sus filas quedan como historial.

### Frontend

- `frontend/src/pages/ProjectEditor.jsx`: quitar `pendingProposal` de `mapPersistedPage`, el estado `proposalViewOpen` / `isDecidingProposal`, `openProposalView`, `canSeeProposalReview`, `handleDesignerProposalDecision`, `ProposalReviewPanel`, el control Publicado/Propuesta, la caja "Propuesta de diseño / Tu propuesta" del panel derecho, `proposalDiffSummary` y los mensajes "Propuesta autoguardada/guardada".
- `frontend/src/lib/roleCapabilities.js`: quitar `canReviewDesignerProposals` e `isDesigner`.
- `frontend/src/lib/activityOrdering.js`: `buildSectionOrderIndex` deja de recibir `proposalHtml`. Actualizar `backend/test/activity-ordering.test.js`.
- Borrar `frontend/src/lib/proposalDiff.js`, `frontend/src/lib/proposalBlockDiff.js`, `backend/test/proposal-diff.test.js` y `backend/test/proposal-block-diff.test.js`, más el CSS exclusivo del comparador en `ProjectEditor.module.css` y `ProjectEditorPanels.module.css`. Antes de borrar clases compartidas (`.previewPage`, `__wb-diff-*`) y el import de `diff`, verificar que el historial no las use.
- `frontend/src/components/onboarding/FirstTimeTooltipsRoot.jsx`: quitar "propuesta aprobada" del texto.
- Las notificaciones viejas `designer_proposal_*` se siguen mostrando con su título guardado; no requieren cambios.

### Compatibilidad

- Un frontend viejo contra el backend nuevo sigue funcionando: sin `proposalSaved`, muestra "Autoguardado".
- El MCP no tiene referencias a propuestas. Los guardados de Diseño vía MCP pasan a publicar directo.

## Parte B — Subidas de imágenes robustas

### Causa raíz (código actual)

- Las tres entradas de subida (`Toolbar.handleImageUpload`, `EditorPanel.handleDrop` y `EditorPanel.handlePaste`) insertan un marcador `<img src="blob:…">` y, al terminar, llaman a `replaceImageSrc` sobre el editor montado. Si el marcador ya no está, la función devuelve `false` y nadie se entera: la imagen queda subida pero nunca se inserta.
- `snapshotActivePage()` quita los `blob:` del estado cada vez que se llama, no solo al guardar. Se llama:
  - al sincronizar: el merge y el `setContent` posterior borran el marcador del propio editor;
  - al cambiar de página: al volver, la página ya no tiene el marcador;
  - al cambiar de modo (Preview/Handoff): el editor se desmonta y la subida apunta a una instancia destruida.
- `beforeunload` solo avisa si hay cambios sin guardar. Tras un autoguardado (8 s) se puede recargar con una subida en curso sin ningún aviso.

### Diseño

**B1. Nueva invariante: los marcadores `blob:` viven solo en memoria (editor y `pages`); todo lo que viaja al servidor pasa por el filtro.**

- `snapshotActivePage()` deja de filtrar.
- `saveProjectPages` filtra el payload de **todas** las páginas (hoy solo filtra la activa) y cuenta los marcadores descartados para mantener el aviso del guardado manual.
- `buildSectionActivityEvents` y `buildDocumentActivityEvents` comparan contra el estado previo ya filtrado, para no generar `image_added` / `image_removed` falsos.
- `syncRemoteChanges` usa el snapshot sin filtrar como `local`, así el marcador sobrevive al merge y al `setContent`.

**B2. Registro de subidas en curso en `ProjectEditor`** (`pendingUploadsRef`: tempUrl → { pageId, fileName }). `Toolbar` y `EditorPanel` reportan inicio, fin y error por callbacks.

- Al terminar la subida:
  1. Si el editor montado tiene el marcador → `replaceImageSrc`, como hoy.
  2. Si no, y alguna página del estado lo tiene → reemplazo puro en su HTML y su JSON, y se marca `isDirty` (lo persiste el autoguardado).
  3. Si no está en ningún lado (el usuario lo borró, o eligió la versión remota en un conflicto) → no se inserta y se muestra un toast: "La imagen «x» se subió, pero ya no estaba en el documento. La encuentras en Biblioteca › Documentos."
- Al fallar la subida: se quita el marcador del editor y del estado, y se muestra un toast de error en lugar de `window.alert`.
- El object URL se revoca solo cuando el marcador ya se resolvió.

**B3.** `beforeunload` también avisa si hay subidas en curso.

**B4.** Mientras el `src` sea `blob:`, `EditableImageView` muestra "Subiendo…" sobre la imagen, para que nadie la dé por guardada.

**Helpers puros nuevos** en `frontend/src/lib/pendingUploads.js`: `hasPendingUpload`, `replacePendingUploadInHtml/Json` y `removePendingUploadFromHtml/Json`. Sus tests van en `backend/test/pending-uploads.test.js`.

## Pruebas

- **Unitarias:**
  - los helpers nuevos;
  - el payload filtra todas las páginas;
  - los eventos de actividad no dan falsos positivos con marcadores;
  - `activityOrdering` funciona sin propuestas.
  - La suite completa del backend (`npm test`) debe quedar en verde.
- **Navegador en Dev** (requiere restaurar Dev), con latencia simulada de ~6 s en `POST /assets` interceptando `fetch`:
  1. Subir y esperar → la imagen sigue guardada tras recargar.
  2. Subir y cambiar de página a mitad → la imagen aparece en la página original.
  3. Subir y pasar a Preview a mitad → la imagen está al volver a Brief.
  4. Dos pestañas: subir en A mientras B guarda → la imagen queda en A.
  5. Intentar recargar con una subida en curso → el navegador avisa.
  6. Subida fallida (archivo no permitido) → el marcador desaparece y se muestra un toast.
  7. Cuenta con rol Diseño: editar texto y subir una imagen → se publica directo y otra sesión lo recibe por el timbre.
- **UX:** medir la latencia percibida de la inserción y verificar los estados de carga y los toasts.

## Despliegue y versión

- Rama nueva desde `main` (sin mezclar con los cambios de CSP que hoy están sin commitear). Bump MINOR → 2.16.0 en `frontend/package.json`.
- Backend y frontend van en el mismo deploy, solo cuando el owner lo pida.
- Documentación: actualizar `CONTEXT.min.md` (eliminar `target=editor.proposals`, agregar la invariante de marcadores `blob:`) y `CONTEXT.md`.

## Riesgos

- Diseño ahora publica texto directo: lo aceptó el owner; el historial por sección permite restaurar.
- Conflicto de merge en una sección con marcador: si el usuario elige "Usar la suya", la imagen cae en el caso 3 (toast con la ubicación del archivo).
- Páginas no activas con `blob:` en el estado: las cubre el filtro del payload (B1).

## Estimado (tiempo de agente)

A ~15 min, B ~25 min, QA en navegador ~15 min. Total: ~55 min, más la espera a que se restaure Dev (depende del owner).

## Pendiente (fuera de este cambio)

- ¿Reinsertar las 11 imágenes del 08/09 en Coapa y Del Valle, o que el Manager las vuelva a subir?
