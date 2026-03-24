# WebBrief Context

- Read order rule:
  - Read `AI_GLOBAL.md` first.
  - Read `CONTEXT.min.md` second.
  - Read this file only if more detail is needed.
  - If user explicitly asks to review/read `CONTEXT.md`, treat this file as authoritative expanded context.
- Updated: 2026-03-20
- Scope: current repo state; use as authoritative project context when user says "review/read CONTEXT.md", unless user says some part is outdated.
- Goal: optimize for AI consumption; prefer this file over inferring intent from stale code comments.

## Repo Map

- `AI_GLOBAL.md`
- `AGENTS.md`
- `CLAUDE.md`
- `CONTEXT.min.md`
- `frontend/src/pages/Login.jsx`
- `frontend/src/pages/Dashboard.jsx`
- `frontend/src/pages/NewProject.jsx`
- `frontend/src/pages/ProjectEditor.jsx`
- `backend/src/index.js`
- `backend/src/routes/auth.js`
- `backend/src/middleware/auth.js`
- `backend/src/db.js`

## Runtime

- Frontend: `cd ~/GitHub/webbrief/frontend && npm run dev` -> `localhost:5173`
- Backend: `cd ~/GitHub/webbrief/backend && npm run dev` -> `localhost:3000`

## Product Surface

- `ai.workflow`: shared cross-model repo instructions.
- `login`: auth screen + session bootstrap.
- `dashboard`: project list + primary entry actions.
- `new-project`: project creation form + suggested structure preview.
- `editor.navbar`: page tabs + global editor actions.
- `editor.sections-panel`: left sidebar for sections/headings.
- `editor.canvas`: central TipTap document area.
- `editor.document-structure`: internal section/divider rules.
- `editor.updates-panel`: right sidebar; placeholder only.
- `backend.auth`: register/login/JWT.
- `backend.db`: SQLite designer store.

## Current Features

- AI workflow:
  - `AI_GLOBAL.md` is the shared cross-model contract
  - read order = `AI_GLOBAL.md` -> `CONTEXT.min.md` -> `CONTEXT.md` if needed
  - `AGENTS.md` bridges Codex to shared repo rules
  - `CLAUDE.md` bridges Claude/Sonnet/Opus to shared repo rules
  - Codex global memory points to `AI_GLOBAL.md` when present
  - long-thread warning is heuristic, not based on exact token knowledge
- Auth:
  - login via `/api/auth/login`
  - JWT stored in `localStorage`
  - protected frontend routes
  - backend `register` only allows first designer
- Dashboard:
  - mock project grid
  - "Cambios" badge
  - open project -> editor
  - logout
  - new project CTA
- New Project:
  - fields: project name, client name, client email, business type
  - business-type-driven structure preview
  - supported types: `clinica`, `ecommerce`, `restaurante`, `agencia`, `inmobiliaria`, `educacion`, `otro`
- Editor:
  - 3-column layout
  - navbar with page tabs, add page, undo/redo, save button placeholder
  - left sidebar derives sections/headings from actual editor document
  - central fixed-page editor with internal scroll
  - toolbar: block type, bold, italic, underline, link, text color, image upload
  - block type labels column (`H1`, `H2`, `¶`, etc.)
  - add/rename/delete sections
  - add page (mock)
  - per-page `fullContent` cached in memory when switching pages
  - right panel exists but no real update history yet
- Backend:
  - `/api/health`
  - `/api/auth/register`
  - `/api/auth/login`
  - `requireAuth` middleware ready for future protected APIs
  - SQLite `designers` table

## Editor Invariants

- All sections, including the first, use TipTap node `sectionDivider`.
- Section metadata source of truth = document node attrs, not separate refs/state.
- `deriveSectionsFromDoc()` derives sidebar sections only from document structure.
- `buildDocumentHTML()` emits a divider for every section.
- If user types into a doc with no sections, auto-insert divider `"Sección 1"` at doc start.
- Empty section auto-remove applies only when section count > 1.
- Add-section modal can confirm with empty input; empty name falls back to auto-name.
- Newly added empty sections are protected from immediate auto-remove, including consecutive manual creations.
- Section numbering is based on total section position, not only sections currently showing `Sección N`.
- Custom-named sections still consume their ordinal internally; they hide the number visually but not logically.
- Auto-named sections are renumbered contiguously after deletes so there are no visible gaps.
- `renameSection` and `deleteSection` are uniform for all sections.
- Active section must also follow the real cursor/focus position inside the editor when user clicks into content to write.
- Scroll-based active-section detection and sidebar-click navigation remain authoritative for scroll/programmatic navigation and must keep working unchanged.
- Type labels in the canvas must stay vertically aligned to the top of their corresponding content block.

## Stable Behavior: Do Not Change Unless Explicitly Requested

- Cross-model read order should remain `AI_GLOBAL.md` -> `CONTEXT.min.md` -> `CONTEXT.md`.
- `AI_GLOBAL.md` should remain the shared repo contract; tool-specific files are bridges, not replacements.
- First section uses same divider logic as all other sections.
- Caret placement after first-section creation must land inside first editable textblock, not gap cursor.
- `sectionId` and `sectionName` must survive HTML parse/render.
- Sidebar active section must follow real document scroll.
- Active section should be computed from `sectionDivider` positions, not global headings.
- Heading active state is scoped inside already-active section.
- Sidebar clicks and heading clicks use one programmatic scroll path.
- During programmatic scroll, scroll listener must not overwrite active section state.
- Last section should remain active when scrolled to container bottom even if offset cannot match exactly.
- Sidebar contents must be derived from editor document, not mock data clones.

## Today Completed (2026-03-20)

- Added shared AI workflow files: `AI_GLOBAL.md`, `AGENTS.md`, `CLAUDE.md`, Codex memory bridge.
- Added startup/read-order rules so new chats load repo context consistently.
- Added agent behavior rules for conversation hygiene, clarification, validation, change scope, and definition of done.
- Fixed first-section typing bug caused by caret falling near atomic divider/gap cursor.
- Fixed `sectionDivider` attr hydration so loaded HTML preserves `sectionId` + `sectionName`.
- Fixed left sidebar false-active bug where all sections appeared as `"Section"` with same id.
- Fixed upward scroll threshold mismatch by basing active section on divider position.
- Fixed sidebar-click flicker by pausing scroll listener during programmatic smooth scroll.
- Fixed bottom-of-document case so last section can remain active.
- Enabled section creation from modal even when the input is empty.
- Fixed consecutive empty section creation so creating a new section no longer renames or replaces the previous empty one.
- Changed auto-numbering to use total section order, even when intermediate sections have custom names.
- Fixed post-delete renumbering so visible `Sección N` labels remain contiguous.
- Fixed active section sync so clicking into canvas content updates the highlighted section from cursor position.
- Fixed `TypeLabels` alignment so the label column matches the visual top of each block.

## Technical Decisions

- `sectionDivider` is `atom: true`, `selectable: true`, `draggable: false`.
- For first-section insertion, `focus('end')` alone is insufficient; explicitly set selection into first editable textblock.
- `sectionDivider` attrs require both `parseHTML` and `renderHTML`.
- Use `isAutoRemoving` to guard re-entrant `handleDocUpdate` flows.
- Use a protected set of manually created empty section ids so consecutive empty sections are not auto-removed between creations.
- Renumber auto-named sections from document order; custom names keep their position in the sequence while hiding the ordinal.
- Resolve cursor-based section sync from the current ProseMirror selection/focus without changing the existing scroll listener behavior.
- Position `TypeLabels` from the rendered block bounds relative to the labels column, not from raw `offsetTop`.
- Use one scroll orchestration flow inside `EditorPanel` for both section and heading navigation.

## Prompt Shortcuts

- Use `target:` for the primary area to edit.
- Use `keep:` for invariants that must remain unchanged.
- Use `watch:` for adjacent systems likely to regress.

### Short Tags

- `target=login`
- `target=dashboard`
- `target=new-project`
- `target=editor.navbar`
- `target=editor.sections-panel`
- `target=editor.canvas`
- `target=editor.document-structure`
- `target=editor.updates-panel`
- `target=backend.auth`
- `target=backend.db`

### Touch / Keep / Watch Map

- `login`
  - `touch`: form UI, validation copy, submit flow
  - `keep`: JWT in `localStorage`, redirect to `dashboard`
  - `watch`: backend auth responses
- `dashboard`
  - `touch`: card UI, layout, navigation actions
  - `keep`: open-project path, logout behavior
  - `watch`: mock data shape
- `new-project`
  - `touch`: form UX, preview presentation
  - `keep`: business-type preview linkage
  - `watch`: future create-project persistence
- `editor.navbar`
  - `touch`: tab UI, action layout
  - `keep`: page switching flow, undo/redo hooks
  - `watch`: in-memory `fullContent` preservation
- `editor.sections-panel`
  - `touch`: sidebar UI, rename/delete affordances, active styling
  - `keep`: doc-derived sections/headings, scroll sync, no flicker
  - `watch`: `editor.document-structure`, `editor.canvas`
- `editor.canvas`
  - `touch`: editor layout, toolbar UX, block labels
  - `keep`: internal scroll, TipTap editing behavior, type labels top-aligned to their content block
  - `watch`: selection/caret behavior, sidebar sync
- `editor.document-structure`
  - `touch`: only when explicitly changing section model
  - `keep`: all section invariants listed above
  - `watch`: add/delete/rename/scroll sync/HTML hydration
- `editor.updates-panel`
  - `touch`: UI, placeholder state, future history integration
  - `keep`: current panel presence
  - `watch`: none yet
- `backend.auth`
  - `touch`: auth routes, JWT rules, middleware usage
  - `keep`: login contract unless requested
  - `watch`: frontend login/session flow
- `backend.db`
  - `touch`: schema only if needed
  - `keep`: `designers` table support for current auth flow
  - `watch`: register/login queries

## Pending

- connect editor to backend for real project save/load
- drag and drop for section ordering
- real data for updates panel
- real save behavior
