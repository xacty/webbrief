# Phase 4: Editor Unification - Context

**Gathered:** 2026-05-08
**Status:** Ready for planning (después de Phase 3 complete)
**Mode:** Auto-generated (skip_discuss=true; decisiones en `.planning/intel/decisions.md`)

<domain>
## Phase Boundary

Eliminar la **paleta paralela** del editor TipTap (`#212222 / #2a2a2a / #d9d9d9` hardcoded) y migrarlo al sistema unificado de tokens. Reemplazar modales locales del editor por el `<Modal>` shared del Phase 2. Unificar z-index del editor con tokens semánticos.

**Archivos en alcance** (5, los más grandes del proyecto):
- `pages/ProjectEditor.jsx` (1200+ líneas)
- `pages/ProjectEditor.module.css` (**1,770 líneas** — el más grande)
- `pages/ProjectEditorNav.module.css` (562 líneas)
- `pages/ProjectEditorToolbar.module.css` (~180 líneas)
- `pages/ProjectEditorPanels.module.css` (~200 líneas)
- `pages/ProjectEditorSeoRules.module.css` (~180 líneas)
- `pages/BriefProjectEditor.jsx` + `.module.css` (variante compacta)

**Componentes especializados del editor** (también en alcance):
- `components/editor/CommentMarginCards.jsx` + `.module.css`
- `components/editor/CommentComposerPopover.jsx` + `.module.css`
- `components/editor/CommentInlinePopover.jsx` + `.module.css`
- `components/editor/MentionsAutocomplete.jsx` + `.module.css`
- `components/editor/EditorContextMenu.jsx` + `.module.css`

**DECISIÓN CLAVE**: el look oscuro del editor se **preserva** (no se convierte a tema claro). La migración solo:
1. Reemplaza hardcoded `#212222 / #2a2a2a / #d9d9d9 / #1d4ed8 / #2563eb` por tokens
2. Si hace falta, crea sub-tokens `--wb-editor-*` que aliasean a los globales sin contaminar el sistema general
3. Modales (shareLinkModal, exportModal) usan `<Modal>` shared
4. Z-index del editor usa tokens (`--wb-z-modal`, `--wb-z-popover`, `--wb-z-tooltip`, etc.)

</domain>

<decisions>
## Implementation Decisions

Pre-locked en `.planning/intel/decisions.md`. Específicos para esta phase:

- **Sub-tokens del editor**: si un color del editor no encaja directo en la paleta global (e.g., el dark `#212222` no es `gray-900`), crear `--wb-editor-bg`, `--wb-editor-surface`, `--wb-editor-border`, `--wb-editor-text` como tokens dedicados al editor en `tokens.css`. Estos tokens **derivan de la paleta global** (e.g., `--wb-editor-bg: var(--wb-color-neutral-900)` o un valor cercano), pero son independientes para que el resto de la app no se vea forzada al mismo dark.
- **Floating tooltip**: preservar el look Google Docs–style (`#3c4043` aprox dark). Tokenizar como `--wb-tooltip-bg`.
- **Comments highlight color**: mantener amarillo claro de las cards y `<span data-comment-id>`. Tokenizar como `--wb-comment-highlight: rgba(254, 249, 195, 0.5)`.
- **Section flash animation** (de `base.css`): preservar.
- **Invariantes del editor** (CONTEXT.min.md `## Editor Invariants` + `## Keep Stable target=editor.*`): TODOS preservados:
  - sectionDivider markup intacto
  - Sidebar derivada del documento, sin flicker
  - First-section logic, auto-naming, protected empty sections
  - Active section/heading sync
  - HTML hydration de divider attrs
  - Drag & drop de secciones
  - Page pills + MoreVertical menu (rename/delete)
  - Toolbar context-sensitive (lists vs text)
  - Tables: contextual toolbar, right-click menu, inline + buttons
  - Type labels: `t` para tables, `img` para images, no-interactive
  - Handoff copy-safe (labels/actions fuera de selectable text)
  - Comments anchoring (`<span data-comment-id>`), 15-min edit window, mentions, right-click custom menu, fake selection overlay
  - HistoryTabPanel funciona en page/document/faq
  - 480ms delay en page-switch race condition
  - autosave 8s delay, blocked en version-conflict, runner en ref
  - SEO metadata extraction en handoff dev
- **Cero cambios funcionales**: solo CSS y consumo de Modal shared. No tocar lógica de edición, comments, sections, etc.

</decisions>

<code_context>
## Existing Code Insights

**Distribución del CSS del editor** (audit baseline):
- `.root` — layout principal flex column (root container)
- `.centerPanel` — editor canvas
- `.editorScrollArea` — contenedor ProseMirror con scroll
- `.imageNode*` — wrappers, resize handles, context menu
- `.imageContextMenu*` — menú derecha sobre imágenes
- `.floatingBar` — toolbar inferior con status, mode toggles, review btn
- `.floatingTooltip` — Google Docs–style dark tooltip
- `.shareLinkModal*` — **migra a `<Modal>` shared**
- `.exportModal*` — **migra a `<Modal>` shared**
- `.tableContextBar`, `.tableCtxMenu`, `.tableInlineBtn*` — gestión tablas
- `:global(span[data-comment-id])` — highlights de comments (preservar amarillo)
- `:global(.ProseMirror)` — reset del editor
- `:global(.ProseMirror h1/h2/h3...)` — tipografía dentro editor (revisar si va a tokens o se mantiene custom)

**Floating UI**:
- ProjectEditorNav: navbar con back, project name, page pills, save, profile, bell, undo/redo
- ProjectEditorToolbar: B/I/U/Strike/Lists/Quote/Heading/Color/Highlight/Align/Indent/Spacing/Table picker
- ProjectEditorPanels: left (sections + SEO panel) + right (comments + updates)
- ProjectEditorSeoRules: top bar con title/desc/keyword inputs + word count, chars, reading time

**Modos del editor** (preservar, solo migra estilos):
- Brief mode (default)
- Handoff mode (designer / dev audiences) — copy-safe gutters
- Preview mode (max-width 800px, hide tools)

**Comments invariantes específicos** (CONTEXT.min.md `target=editor.comments`):
- Cards flotan en margen derecho, ancladas al span `[data-comment-id]`
- Idle minimal (header + body + replies badge), active expandido con ReplyComposer
- ⋮ menu por comment (Editar/Eliminar/Copiar link); ✓ resolver al lado del ⋮ en root
- @menciones con keyboard nav (↓↑ Enter Tab Esc), requieren ≥1 char
- Menciones renderizadas como mailto links azules cuando matchean perfil real
- Right-click custom menu (cut/copy/paste/comment/link/format)
- Selección preservada en right-click via stableSelectionRef + rightClickSnapshotRef + FakeSelection overlay gris
- Canvas se shifta 300px a la izquierda cuando hay comments visibles
- editorCanvas min-width 500px
- Viewport <900px oculta cards y abre CommentInlinePopover flotante al click del highlight
- Orphan auto-resolve en backend al guardar (regex sobre HTML detecta IDs ausentes)
- HistoryTabPanel en page/document/faq
- Realtime via supabase_realtime
- Emails via Resend gated por RESEND_API_KEY

</code_context>

<specifics>
## Specific Ideas

1. **Estrategia de migración (arriesgada — el editor es el corazón de la app)**:
   - **Step 1**: definir sub-tokens del editor en `tokens.css` (`--wb-editor-bg`, `--wb-editor-surface`, etc.) DERIVADOS de paleta global. Cero cambios visuales aún.
   - **Step 2**: find-replace masivo en cada `.module.css` del editor: `#212222` → `var(--wb-editor-bg)`, `#2a2a2a` → `var(--wb-editor-surface)`, etc. Verificación visual tras CADA find-replace.
   - **Step 3**: migrar modales (shareLink, export) a `<Modal>` shared. Esto es cambio JSX, requiere QA de los modales específicamente.
   - **Step 4**: tokenizar z-index. Cada `z-index: NNN` → `z-index: var(--wb-z-XXX)`.
   - **Step 5**: QA visual completo del flow (Brief → Handoff → Preview, comments, mentions, tables, images, share).

2. **Página de QA**: el editor tiene mucha funcionalidad — crear un proyecto de prueba con: 3 secciones, headings H1-H6, párrafos, listas, tabla 3x3, imagen, CTA, 2 comentarios con replies, una mention. Validar que:
   - Brief mode renderiza limpio
   - Handoff mode (designer audience) muestra gutters correctos
   - Handoff mode (dev audience) muestra SEO metadata + JSON
   - Preview mode esconde toolbar y panels
   - Switching entre modos es smooth
   - Comments cards se anclan correctamente al margen
   - Right-click context menu funciona en texto, imagen, tabla
   - Mentions autocomplete dispara y selecciona

3. **Riesgo principal**: invariantes del editor son MUCHOS y delicados. Si una migración rompe una invariante, las consecuencias son malas. **Mitigación**:
   - Plan-phase debe incluir un task explícito de "lista invariantes del CONTEXT.md y verificar cada una post-migración"
   - Si algo se rompe, rollback al commit anterior (atomic commits)
   - QA después de cada commit, no big bang

4. **Plan tasks sugeridos** (orientativo):
   - Task 1: Definir sub-tokens del editor en `tokens.css`
   - Task 2: Migrar `ProjectEditor.module.css` (el más grande) a tokens — bloques pequeños
   - Task 3: Migrar `ProjectEditorNav.module.css`, `ProjectEditorToolbar.module.css`, `ProjectEditorPanels.module.css`, `ProjectEditorSeoRules.module.css` a tokens
   - Task 4: Migrar componentes de comments y mentions a tokens
   - Task 5: Migrar modales (shareLink, export) a `<Modal>` shared
   - Task 6: Tokenizar z-index del editor
   - Task 7: QA exhaustivo de todos los modos e invariantes

</specifics>

<deferred>
## Deferred Ideas

- **Rediseño UX del editor** (e.g., panel layout, toolbar reordering): out of scope, sólo visual tokens.
- **Optimización de performance** (memoization, virtual scrolling para documentos largos): defer a milestone aparte.
- **Migración de TipTap extensions**: las extensions (`CommentMark`, etc.) en `frontend/src/extensions/` no necesitan tokens (son lógica). Solo CSS de cómo se renderizan, que ya está cubierto via `:global(span[data-comment-id])` etc.
- **Dark mode toggle del editor**: no, ya es dark por default. Theme switching (light/dark) está en v2 out of scope.
</deferred>
