# WebBrief Min Context

- Read order rule:
  - Read `AI_GLOBAL.md` first.
  - Read this file second for fastest/highest-signal project context.
  - Read `CONTEXT.md` only if task needs more detail, implementation history, or stronger guardrails.
  - If user explicitly says "read/review CONTEXT", start with this file, then expand to `CONTEXT.md` only if needed.
- Updated: 2026-03-20

## Targets

- `login`
- `dashboard`
- `new-project`
- `editor.navbar`
- `editor.sections-panel`
- `editor.canvas`
- `editor.document-structure`
- `editor.updates-panel`
- `backend.auth`
- `backend.db`

## Core Facts

- Cross-model repo workflow exists: `AI_GLOBAL.md` -> `CONTEXT.min.md` -> `CONTEXT.md`
- `AGENTS.md` and `CLAUDE.md` are bridge files to the shared repo contract
- Frontend routes: `login`, `dashboard`, `new-project`, `project/:id/editor`
- Auth: JWT in `localStorage`; protected frontend routes
- Dashboard/New Project use mock data
- Editor is TipTap with 3 columns: sections panel | canvas | updates panel
- Backend: Express + SQLite; auth only partially connected to frontend

## Editor Invariants

- All sections, including first, use `sectionDivider`
- Sidebar sections/headings derive from document, not parallel state
- `sectionDivider` HTML must preserve `sectionId` + `sectionName`
- Typing into doc with no sections auto-creates `Sección 1`
- Empty section auto-remove only if more than one section exists
- Section modal can confirm with empty input; empty name falls back to auto-name
- Newly added empty sections are protected from immediate auto-remove, even when several are created in a row
- Section numbering follows total section order, not only visible auto-named sections
- Custom-named sections still consume their ordinal internally; the number is hidden by the custom label
- Auto section names are renumbered contiguously after deletes so there are no gaps
- Caret after first-section creation must land in first editable textblock, not gap cursor
- Active section = computed from `sectionDivider` positions
- Active section also updates from cursor/focus position when user clicks into content and starts editing
- Active heading = computed only inside active section
- Sidebar click scroll and heading click scroll share one programmatic scroll flow
- During programmatic scroll, ignore scroll-listener state updates
- At container bottom, last section stays active

## Keep Stable

- cross-model read order and shared-contract workflow
- `editor.sections-panel`: doc-derived list, active sync, no flicker
- `editor.canvas`: internal scroll, toolbar, block labels top-aligned to their content block
- `editor.document-structure`: divider model, first-section logic, HTML hydration
- `editor.navbar`: page switching + undo/redo wiring
- `login`: JWT/session flow

## Touch / Keep / Watch

- `target=login`
  - `keep`: JWT -> `localStorage`, redirect to dashboard
- `target=dashboard`
  - `keep`: open project route, logout behavior
- `target=new-project`
  - `keep`: business-type -> preview linkage
- `target=editor.navbar`
  - `keep`: page switch flow, undo/redo
  - `watch`: per-page `fullContent`
- `target=editor.sections-panel`
  - `keep`: no flicker, real active section, heading navigation
  - `watch`: `editor.document-structure`, `editor.canvas`
- `target=editor.canvas`
  - `keep`: TipTap editing behavior, internal scroll, type labels top-aligned to their content block
  - `watch`: selection/caret, sidebar sync
- `target=editor.document-structure`
  - `keep`: all editor invariants
  - `watch`: add/delete/rename/hydration
- `target=editor.updates-panel`
  - `keep`: panel exists, currently placeholder
- `target=backend.auth`
  - `keep`: login contract unless requested
  - `watch`: frontend login flow
- `target=backend.db`
  - `keep`: `designers` table for current auth

## Recent Fixes

- added shared AI workflow files and startup/read-order rules
- added agent rules for clarification, validation, change scope, and done criteria
- fixed first-section vertical typing bug
- fixed `sectionDivider` attr hydration from HTML
- fixed false-active sidebar state
- fixed upward scroll threshold mismatch
- fixed sidebar-click flicker during smooth scroll
- fixed last-section active state at bottom
- enabled section creation from modal with empty name
- fixed consecutive empty section creation so a new section no longer renames/replaces the previous empty one
- fixed section auto-numbering to use total section order, including custom-named sections
- fixed auto-number renumbering after delete to keep `Sección N` contiguous
- fixed active section sync when user positions the cursor directly inside canvas content
- fixed `TypeLabels` vertical alignment so each label sits at the top of its corresponding block

## Pending

- real project save/load
- drag/drop section ordering
- real updates-panel data
- real save behavior
