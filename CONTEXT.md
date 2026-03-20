# WebBrief — Estado actual del proyecto

## Última actualización
Fecha: 20 marzo 2026

## Archivos principales
- `frontend/src/pages/ProjectEditor.jsx` — Editor principal (~1828 líneas)
- `frontend/src/pages/Dashboard.jsx` — Dashboard del diseñador
- `frontend/src/pages/NewProject.jsx` — Formulario de nuevo proyecto con estructura sugerida
- `backend/` — API REST con Node.js + Express + SQLite

## Servidores
- Frontend: `cd ~/GitHub/webbrief/frontend && npm run dev` → localhost:5173
- Backend: `cd ~/GitHub/webbrief/backend && npm run dev` → localhost:3000

## Implementado
- Auth: registro/login con JWT, rutas protegidas
- Dashboard: grilla de proyectos con mock data
- NewProject: formulario + preview de estructura por tipo de negocio
- ProjectEditor: layout 3 columnas (sidebar secciones | TipTap | document updates)
  - Navbar con tabs de páginas, undo/redo, save
  - Sidebar izquierdo: secciones con headings extraídos del contenido real
  - Editor de altura fija (Google Docs style) con scroll interno
  - Modal para agregar sección con nombre opcional
  - Etiquetas de tipo de bloque (H1/H2/¶) con dropdown para cambiar tipo
  - Subida de imágenes local con preview
  - Toolbar: Bold, Italic, Underline, Link, Imagen, Color de texto
  - Mock data: E-commerce (Home, Catálogo, Contacto)

### Sistema de secciones (estado al 20/03/2026)
- **Identificador (sectionDivider):** Todas las secciones —incluida la primera— tienen un nodo TipTap `sectionDivider` en el documento. Antes, la primera sección no tenía divider y su metadata vivía en un ref separado (`firstSectionMeta`). Esto fue refactorizado completamente.
- **`deriveSectionsFromDoc`:** Ya no recibe `firstSectionMeta`. Deriva todas las secciones exclusivamente de los nodos `sectionDivider` presentes en el documento.
- **`buildDocumentHTML`:** Genera identificador para todas las secciones sin excepción.
- **Auto-create:** Si el usuario escribe en un documento vacío (sin secciones), se inserta automáticamente un identificador "Sección 1" en la posición 0 del documento.
- **Auto-remove:** Aplica a todas las secciones (incluida la primera). Si hay más de una sección y alguna queda vacía, se auto-elimina. Si solo queda una sección, no se elimina aunque esté vacía.
- **Auto-numeración:** Las secciones sin nombre reciben "Sección N" donde N = máximo número existente en nombres tipo "Sección N" + 1. Ejemplo: si existen "Sección 1", "About us", "Sección 3" → la próxima sin nombre será "Sección 4".
- **Operaciones unificadas:** `renameSection` y `deleteSection` usan la misma lógica para todas las secciones (sin casos especiales para la primera).
- **`justAddedSectionId`:** Protege cualquier sección recién creada (incluyendo la primera) del auto-remove mientras está vacía.

## Decisiones técnicas
- El `sectionDivider` es un nodo TipTap `atom: true`, `selectable: true`. Se puede borrar seleccionándolo + Delete/Backspace.
- La numeración de secciones es persistente: si se crea "Sección 3" y se borra "Sección 1", la siguiente sin nombre será "Sección 4" (no se renumera).
- El `firstSectionMeta` ref fue eliminado por completo. Toda la metadata de secciones vive en los nodos del documento.
- Se usa `isAutoRemoving` ref como guard para evitar re-entradas en `handleDocUpdate` durante inserciones/eliminaciones automáticas.

## Pendiente
- [ ] Conectar editor al backend (guardar/cargar proyectos reales)
- [ ] Drag & drop de secciones en el sidebar
- [ ] Panel "Document updates" con historial de cambios reales
- [ ] Funcionalidad de "Save" en el navbar
