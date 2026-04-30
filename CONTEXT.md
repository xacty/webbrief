# WeBrief Context

- Read order rule:
  - Read `AI_GLOBAL.md` first.
  - Read `CONTEXT.min.md` second.
  - Read this file only if more detail is needed.
  - If user explicitly asks to review/read `CONTEXT.md`, treat this file as authoritative expanded context.
- Updated: 2026-04-26
- Scope: current repo state; use as authoritative project context when user says "review/read CONTEXT.md", unless user says some part is outdated.
- Goal: optimize for AI consumption; prefer this file over inferring intent from stale code comments.

## Repo Map

- `AI_GLOBAL.md`
- `AGENTS.md`
- `CLAUDE.md`
- `CONTEXT.min.md`
- `frontend/src/pages/Login.jsx`
- `frontend/src/pages/CompaniesPage.jsx`
- `frontend/src/pages/CompanyPage.jsx`
- `frontend/src/pages/UsersPage.jsx`
- `frontend/src/pages/TrashPage.jsx`
- `frontend/src/pages/NewProject.jsx`
- `frontend/src/pages/ProjectEditor.jsx`
- `frontend/src/auth/AuthContext.jsx`
- `frontend/src/components/layout/AppShell.jsx`
- `backend/src/index.js`
- `backend/src/routes/auth.js`
- `backend/src/routes/companies.js`
- `backend/src/routes/users.js`
- `backend/src/routes/projects.js`
- `backend/src/middleware/auth.js`
- `backend/src/lib/supabase.js`
- `backend/src/lib/users.js`
- `supabase/schema.sql`

## Runtime

- Frontend: `cd ~/GitHub/webbrief/frontend && npm run dev` -> `localhost:5173`
- Backend: `cd ~/GitHub/webbrief/backend && npm run dev` -> `localhost:3000`

## Product Surface

- `ai.workflow`: shared cross-model repo instructions.
- `login`: auth screen + session bootstrap.
- `companies`: admin home for company discovery/filters/pagination.
- `company-detail`: company workspace with project cards + team sidecard.
- `users`: admin/manager user management for profiles and company memberships.
- `archive`: restore surface for archived companies and projects.
- `trash`: restore/delete surface for trashed companies and projects.
- `new-project`: project creation form + suggested structure preview.
- `editor.navbar`: page tabs + global editor actions.
- `editor.sections-panel`: left sidebar for sections/headings.
- `editor.canvas`: central TipTap document area.
- `editor.document-structure`: internal section/divider rules.
- `editor.updates-panel`: right sidebar for activity, pending notifications, compact deliverables, and share-link action.
- `editor.review-markers`: right-side canvas markers for unread section-level review activity.
- `editor.handoff`: copy-safe Designer/Dev handoff view.
- `share`: public token preview with email gate, comments, approvals/change requests, and print/PDF.
- `backend.activity`: project activity + notifications.
- `backend.assets`: Supabase Storage uploads; raster -> WebP, SVG attachment-only.
- `backend.auth`: Supabase-backed session + invite flow.
- `backend.db`: Supabase Postgres company/project store.

## Current Features

- AI workflow:
  - `AI_GLOBAL.md` is the shared cross-model contract
  - read order = `AI_GLOBAL.md` -> `CONTEXT.min.md` -> `CONTEXT.md` if needed
  - `AGENTS.md` bridges Codex to shared repo rules
  - `CLAUDE.md` bridges Claude/Sonnet/Opus to shared repo rules
  - Codex global memory points to `AI_GLOBAL.md` when present
  - long-thread warning is heuristic, not based on exact token knowledge
- Auth:
  - frontend login via Supabase password auth
  - login supports password reset via Supabase `resetPasswordForEmail`, redirecting to `/auth/set-password`
  - Supabase Auth redirect allowlist must include `http://localhost:5173/auth/set-password` for local invite/reset links
  - auth bootstrap includes timeout fallback to avoid infinite global loading state
  - onboarding route `/auth/set-password`
  - `/auth/set-password` handles both invite links and password recovery links
  - login + set-password screens use shared CSS Module auth styles instead of inline style objects
  - backend validates bearer token via Supabase
  - backend route `GET /api/auth/me`
  - backend route `POST /api/auth/invite-user`
  - invite flow upserts `profiles` + `company_memberships`; real user base lives in `auth.users` + `profiles` + `company_memberships`
- Companies:
  - backend route `GET /api/companies`
  - backend route `GET /api/companies/:id`
  - backend route `POST /api/companies`
  - `POST /api/companies` requires an initial manager email; company creation inserts company + creates/assigns a `manager`
  - exception: admin can send `testMode=true` to create `companies.is_test=true` without manager/invite for QA/test setup
  - if manager setup fails during company creation, backend deletes the newly inserted company before responding
  - `WeBrief` is the internal platform company for demos/admin/site usage
  - list endpoint now returns project/member counts + last activity
  - detail endpoint returns company + projects + members
  - active list/detail endpoints filter archived/trashed companies and projects when archive columns exist
- Companies Home:
  - real companies list from backend
  - sessionStorage stale-while-revalidate cache for faster repeat navigation
  - search field
  - type filter (`all`, `clients`, `internal`)
  - pagination controls
  - modal company creation requires company name + initial manager email
  - modal has explicit `Empresa de prueba` mode for admins; manager fields are omitted and backend records `is_test=true`
  - card grid uses explicit `Abrir` CTA instead of whole-card click; admin can archive or send non-internal companies to Papelera via compact icon actions
  - visible company cards do not show slug; slug remains technical/searchable data, not a primary visual signal
- Company Detail:
  - header summary for one company
  - sessionStorage stale-while-revalidate cache for company/project/member payloads by `companyId`
  - no tabs
  - project cards on the left
  - team + invite sidecard on the right
  - top-level CTA remains `Nuevo proyecto`
  - invite form is visible inside the sidecard
  - project cards expose archive/papelera actions for admins/managers; sessionStorage company caches are cleared after lifecycle changes
- Trash:
  - frontend routes `/archive` and `/trash`
  - backend route `GET /api/trash?state=archived|trashed`
  - admin sees lifecycle companies and projects
  - managers see lifecycle projects for companies they manage
  - `/archive` shows only `archived_at not null` + `trashed_at is null`
  - `/trash` shows only `trashed_at not null`
  - both screens have unnumbered `Empresas`/`Proyectos` tabs, no duplicate panel title, and a compact toolbar for shared date filter/refresh
  - restore uses existing company/project restore endpoints and clears sessionStorage caches
  - permanent delete is exposed only on `/trash`
- Users:
  - sidebar entry is visible to admins and managers
  - backend route `GET/POST /api/users`
  - backend route `PATCH/DELETE /api/users/:id`
  - backend route `PATCH/DELETE /api/users/:id/memberships/:companyId`
  - global search by name/email/company/role
  - company filter lists active companies only; archived/trashed companies are hidden
  - sort options (`name`, `recent`, `company`)
  - pagination controls
  - user management list uses a compact table; company-access editing lives in expandable rows
  - table shows platform role to admins and scoped company memberships to managers
  - user avatars live in `profiles.avatar_url`; UI shows avatar image when present and initials fallback otherwise
  - admins can invite, edit name/email/platform role/avatar, manage company roles, and delete non-self accounts
  - managers can invite/edit names/avatars/manage non-manager company roles only inside companies where they are manager
  - company access cannot be deleted from the users panel; change the role or delete the account instead
  - platform roles supported: `admin`, `user`, `qa`; Admin/QA are global roles, while `user` requires active company access
- New Project:
  - fields: project name, client name, client email, business type
  - company selector from real companies API
  - default company prefers a non-internal company when one exists
  - accepts preselected company from route query (`?companyId=...`)
  - business-type-driven structure preview
  - supported types: `clinica`, `ecommerce`, `restaurante`, `agencia`, `inmobiliaria`, `educacion`, `otro`
  - creates real project + seeded pages
- Editor:
  - 3-column layout
  - `ProjectEditor`/TipTap is lazy-loaded and should not be imported eagerly into admin pages
  - navbar with page tabs (rename/delete via MoreVertical menu), add page, undo/redo, real save button; only one pill/section menu open at a time (shared `openMenuId` at ProjectEditor level)
  - modes: `Brief`, `Handoff`, `Preview`
  - left sidebar derives sections/headings from actual editor document
  - central fixed-page editor with internal scroll
  - toolbar: block type, bold, italic, underline, strikethrough, bullet list, ordered list, blockquote, link, CTA/button, text color, image upload, table (grid picker)
  - block type labels column (`H1`, `H2`, `¶`, `ul`, `ol`, `CTA`, `t`, `img`); `CTA`, `t`, and `img` are non-interactive
  - table support: grid picker (1×1 to 8×8), contextual toolbar, right-click context menu, inline "+" buttons at edges
  - semantic CTA/button node stores `ctaText` + `ctaUrl`
  - add/rename/delete sections
  - add page locally before save
  - per-page `fullContent` cached in memory when switching pages
  - loads project/pages from backend
  - saves pages to backend as `content_html` + `content_json` + page `version`
  - autosave persists with `source=autosave`; generic `brief_saved` activity is intentionally not emitted
  - autosave can create/update `section_edited` activity grouped by user/page/section while unread
  - section review markers render to the right of the canvas and link bidirectionally with activity items
  - Handoff keeps labels/actions in gutters, never inside selectable text; paragraph copies use rich clipboard (`text/html` + `text/plain`) when available
  - Preview is read-only and supports browser print/PDF
  - right panel shows project activity, pending notifications, and private share-link creation
  - right panel includes compact deliverables creation and status management backed by `project_deliverables`
- Backend:
  - `/api/health`
  - `/api/auth/me`
  - `/api/auth/invite-user`
  - `/api/companies`
  - `/api/users`
  - `/api/trash?state=archived|trashed`
  - `/api/projects`
  - `/api/projects/:id`
  - `/api/projects/:id/pages`
  - `/api/projects/:id/activity`
  - `/api/projects/:id/deliverables`
  - `/api/projects/:id/assets`
  - `/api/projects/:id/share-links`
  - `/api/notifications`
  - `/api/public/share/:token`
  - `/api/public/share/:token/comments`
  - `/api/public/share/:token/approvals`
  - `requireAuth` middleware validates Supabase session and loads profile + memberships
  - Supabase remote schema is synced with `supabase/schema.sql` for archive/trash columns, deliverables, comments, approvals, share links, assets, page versions, activity and notifications
  - Supabase remote schema includes `companies.is_test`, `companies.created_for_testing_by`, `profiles.platform_role='qa'`, `profiles.avatar_url`, and public `user-avatars` bucket
  - Storage bucket `project-assets` is public, limited to 8 MB, and allows JPEG/PNG/WebP/SVG uploads through the backend

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
- Type labels live outside the editor canvas in their own column to the left, vertically aligned to the top of their corresponding content block.
- Type-label dropdown is context-sensitive: list blocks (ul/ol) show only list options; text blocks show H1–H6/Párrafo. Current type is excluded from dropdown.
- Type-label list toggle changes the entire list at once (not per-item).
- Type labels for tables (`t`) and images (`img`) are non-interactive: no dropdown, dimmed appearance, no click action.
- Sidebar sections can be reordered via drag & drop; reorder moves the corresponding content in the ProseMirror document.
- Tables are inserted via grid picker (1×1 to 8×8). Once inserted, 3 manipulation approaches: contextual toolbar bar, right-click context menu, and inline "+" buttons at right/bottom edges.
- CTA/button is a semantic node, not a paragraph with a textual prefix.
- Handoff labels (`H1`, `H2`, `P`, `CTA`, URLs, actions) must stay outside selectable text so triple-click/copy remains clean.
- Handoff Dev can expose Markdown/HTML/JSON copy actions; Designer prioritizes clean text and URL copying.

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

## Today Completed (2026-03-30)

- Mutual-exclusion for contextual menus: shared `openMenuId` in `ProjectEditor` ensures only one dropdown (page pill or section item) is open at a time.
- Fixed new-page empty section auto-remove bug: `addPage` now initializes `protectedEmptySectionIds` with the new section's id (`new Set([sectionId])`); `handlePageClick` now adds all loaded section IDs to the protected set after deriving sections. Prevents `handleDocUpdate` from auto-removing the initial empty section when the user adds a second one.

## Completed (2026-03-24)

- Expanded toolbar: strikethrough, bullet list, ordered list, blockquote buttons.
- Full table support: `@tiptap/extension-table` + row/header/cell; grid picker (1×1–8×8); 3 manipulation approaches (contextual toolbar, right-click menu, inline "+" buttons).
- Type labels for tables show `t` (non-interactive, dimmed); images show `img` (also non-interactive).
- Canvas padding adjusted to `60px 50px 1000px` to prevent inline table buttons from overflowing.

## Completed (2026-03-20)

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
- `addPage` seeds `protectedEmptySectionIds` with the new page's initial section id. `handlePageClick` adds all section ids from the loaded page. `syncProtectedEmptySections` cleans up ids once sections gain content.
- Renumber auto-named sections from document order; custom names keep their position in the sequence while hiding the ordinal.
- Resolve cursor-based section sync from the current ProseMirror selection/focus without changing the existing scroll listener behavior.
- Position `TypeLabels` from the rendered block bounds relative to the labels column, not from raw `offsetTop`.
- Type-labels column lives outside `editorPage` in its own flex sibling (`editorPageRow`); dropdown options are determined by block type.
- List type switching uses `tr.setNodeMarkup()` on the list node to swap between `bulletList`/`orderedList` without destroying/recreating list items.
- Section reorder uses `tr.replaceWith()` to rebuild entire doc content from reordered section slices (single undoable transaction). Native HTML5 drag-and-drop, no library. Custom drag ghost via `setDragImage()` shows grip icon + section name in bordered box (created as temporary DOM element, removed on next frame).
- Page pills use `PagePill` component with local state for inline rename (input) and MoreVertical menu. Delete triggers a confirmation modal from parent state (`deletePageConfirm`). `renamePage` updates the `pages` array; `deletePage` removes the page and navigates to first remaining if active page was deleted.
- Contextual menus (page pills and section items) share a single `openMenuId` state in `ProjectEditor` (values: `page-{id}` or `section-{id}`). Opening any menu closes all others; components receive `menuOpen`, `onOpenMenu`, `onCloseMenu` props instead of local state.
- Toolbar expanded with strikethrough, bullet list, ordered list, blockquote buttons (all from StarterKit). Table uses `@tiptap/extension-table` + row/header/cell extensions.
- Table insertion via `TableGridPicker` component: hover grid (8×8) highlights cells, click inserts table with selected dimensions.
- Table manipulation: `TableContextBar` (toolbar row with add/remove row/col buttons), `TableRightClickMenu` (context menu positioned relative to wrapper), `TableInlineButtons` (absolute-positioned "+" at right edge for column, bottom edge for row).
- `getBlockLabel` returns `'t'` for `<table>` (or wrapper div containing table) and `'img'` for images/figures. These labels are rendered with `opacity: 0.5` and `cursor: default`; clicking them does nothing (no dropdown).
- Canvas `editorPage` padding: `60px 50px 1000px` to accommodate inline table buttons without overflow.
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
  - `keep`: redirect to `dashboard` after valid session
  - `watch`: Supabase session bootstrap + backend `/api/auth/me`; bootstrap must never leave the app stuck on global `Cargando...`
- `dashboard`
  - `touch`: legacy compatibility only
  - `keep`: redirect to `companies`
- `companies`
  - `touch`: list layout, filters, pagination, company creation modal
  - `keep`: company discovery is admin home
  - `watch`: stats accuracy, internal/company distinction, card click/open behavior
- `users`
  - `touch`: filters, sort, pagination, compact membership cards
  - `keep`: admin-only global visibility of user/company relationships
  - `watch`: data shape from `profiles` + `company_memberships`, company filter consistency
- `company-detail`
  - `touch`: summary cards, project-card grid, team sidecard, inline invite form
  - `keep`: company as main container for projects/equipo
  - `watch`: invite flow, project navigation, responsive two-column layout
- `new-project`
  - `touch`: form UX, preview presentation
  - `keep`: business-type preview linkage
  - `watch`: real create-project persistence, non-internal default company selection, company query inheritance
- `editor.navbar`
  - `touch`: tab UI, action layout
  - `keep`: page switching flow, undo/redo hooks, page pill menu (rename/delete), delete confirmation modal
  - `watch`: in-memory `fullContent` preservation
- `editor.sections-panel`
  - `touch`: sidebar UI, rename/delete affordances, active styling
  - `keep`: doc-derived sections/headings, scroll sync, no flicker, drag & drop reorder
  - `watch`: `editor.document-structure`, `editor.canvas`
- `editor.canvas`
  - `touch`: editor layout, toolbar UX, block labels
  - `keep`: internal scroll, TipTap editing behavior, type labels outside canvas and top-aligned to their content block, context-sensitive dropdown (lists vs text), table support (grid picker + 3 manipulation approaches), non-interactive labels for tables/images
  - `watch`: selection/caret behavior, sidebar sync
- `editor.document-structure`
  - `touch`: only when explicitly changing section model
  - `keep`: all section invariants listed above
  - `watch`: add/delete/rename/scroll sync/HTML hydration
- `editor.updates-panel`
  - `touch`: activity list, pending state, private share action
  - `keep`: lightweight right-side operations panel with section activity click-through
  - `watch`: activity endpoint, unread section metadata, and notification unread state
- `editor.review-markers`
  - `touch`: marker icon style, selected marker state, mark-read behavior
  - `keep`: markers must align using existing section DOM measurements and must not change editor scroll/height calculations
  - `watch`: marker click should select the activity; activity click should scroll via existing `scrollRequest`
- `editor.handoff`
  - `touch`: copy actions, gutters, CTA/link URL actions
  - `keep`: no labels/metadata in selectable text
  - `watch`: active-page snapshot before leaving Brief mode
- `share`
  - `touch`: public preview, email gate, comment/approval forms
  - `keep`: no account required for clients in MVP
  - `watch`: token expiry/revocation, public route must not expose service-role data
- `backend.auth`
  - `touch`: Supabase session validation, invite routes, middleware usage
  - `keep`: backend-authorized contract unless requested
  - `watch`: frontend login/session flow
- `backend.db`
  - `touch`: company/profile/membership/project/page schema
  - `keep`: backend-owned authorization over company/project access
  - `watch`: Supabase schema + project save/load
- `archive`
  - `touch`: archived company/project lifecycle UI
  - `keep`: archive and trash are separate states; no destructive delete from archive
  - `watch`: tabs are labels only, date filters should not mix archived and trashed rows
- `trash`
  - `touch`: archived/trashed company/project lifecycle UI
  - `keep`: trash only shows `trashed_at` rows; admin can manage companies; admin/managers can manage projects; permanent delete is destructive
  - `watch`: sessionStorage caches after restore/delete
- `users`
  - `touch`: user invite/edit/delete and company membership management UI/API
  - `keep`: QA/platform roles are admin-only; managers are scoped to companies where they have manager membership
  - `watch`: do not remove the last manager from a company or let admins delete themselves

## Completed (2026-04-20)

- Added company management base: admin can create companies from dashboard; company list is now real data from backend.
- Kept `WeBrief` as the internal platform company instead of treating it as the default client-company model.
- Added `/api/companies` route family in backend and wired dashboard/new-project to real company data.
- New Project now prefers a non-internal company by default when one exists.
- Fixed frontend auth bootstrap so a stalled Supabase session initialization no longer leaves the app stuck on global `Cargando...`.
- Replaced the mixed admin dashboard with a real app shell + sidebar + dedicated companies home.
- Companies home now supports search, type filtering, pagination controls, modal creation, and backend-provided stats.
- Switched companies home from row list to cards with explicit `Abrir` CTA and compact admin lifecycle icon actions.
- Tightened density of companies/project cards: lighter metric hierarchy, no visible slug in company cards, fewer nested boxes, and single-line primary CTAs.
- Normalized select chevron spacing across the site so dropdowns no longer use browser-default right padding.
- Reworked company detail from tabbed layout to a simultaneous two-column workspace: compact project cards on the left and team/invite sidecard on the right, with the duplicated top `Última actividad` summary removed.
- New Project now reads the company context from route query instead of transient navigation state.

## Completed (2026-04-21)

- Company creation now enforces the product invariant that a company cannot be created without an initial `manager`.
- Added shared backend user helper for invite/profile/membership creation; `POST /api/auth/invite-user` and `POST /api/companies` both use it.
- Added login password reset flow using Supabase reset email and existing `/auth/set-password` route.
- Added autosave and simple page-version conflict guard for editor saves.
- Replaced updates-panel placeholder with real project activity, pending notifications, and private share-link action.
- Added Handoff mode for Designer/Dev with copy-safe gutters, rich clipboard paragraph copy, CTA/link URL copy actions, and Dev Markdown/HTML/JSON copy actions.
- Added semantic CTA/button TipTap node with `ctaText` + `ctaUrl`.
- Added Preview mode and public `/share/:token` page with email gate, comments, approvals/change requests, and print/PDF.
- Added backend tables/routes for activity, notifications, deliverables, comments, approvals, share links, assets, and archive/trash baseline.
- Added asset upload route using Supabase Storage; raster images convert to WebP, SVG stays attachment-only and non-inline.
- Added project card archive/trash actions for manager/admin.
- Lazy-loaded frontend pages so `ProjectEditor`/TipTap are split out of the initial admin bundle.
- Deduped frontend `/api/auth/me` hydration and removed backend auth's extra company-name lookup from every authenticated request.
- Added temporary schema-compat fallbacks for archive columns, project page optional columns, activity, and notifications while Supabase migrations were still rolling out.
- Autosave section review events use `event_type=section_edited` with `metadata.pageId`, `pageName`, `sectionId`, `sectionName`, `changeTypes`, and optional `readAt/readBy`; unread records are updated instead of duplicated.
- Right activity panel orders current-page section review events by the current `derivedSections` order, not by chronology; non-section activity stays in a separate general group below.
- Page review flow: pages start as `draft`; `Enviar a revisión` creates a `project_page_versions` baseline and switches the page to `ready_for_review`; section alerts only emit for pages in `ready_for_review`, `approved`, or `changes_requested`.
- Editor top navbar is now reserved for logo, undo/redo, page pills, and profile/notifications; mode switch, handoff audience, review status/action, save status/action live in a bottom floating editor bar.
- Future review/versioning plan: add named versions UI, restore version action, compare baseline/current diff, per-user read state table, and client-facing review milestones.

## Completed (2026-04-22)

- Added admin-only test company mode: skips manager invite/rate limit path, auto-generates a test name when needed, and records `companies.is_test=true`.
- Added `qa` platform role to `profiles.platform_role`; Users page lets admins choose Admin/QA/User platform roles. Admin/QA are global roles; User requires active company access.
- Synced remote Supabase schema with `supabase/schema.sql`: archive/trash columns, deliverables, comments, approvals, share links, assets, activity, notifications, page versions, triggers, constraints, and indexes are present.
- Created public `project-assets` Storage bucket with 8 MB limit and JPEG/PNG/WebP/SVG MIME allowlist.
- Active company/project lists now filter archived/trashed rows; direct project access also excludes inactive rows unless restore/permanent routes request them.
- Added `/api/trash?state=archived|trashed`, frontend `/archive` Archivados, and frontend `/trash` Papelera. Admin sees companies/projects; managers see projects for managed companies.
- Lifecycle UI separates `Empresas` and `Proyectos` into unnumbered tabs, avoids duplicate panel headings, and keeps shared date filter/refresh actions in the tab toolbar; archived rows are no longer mixed into Papelera.
- Companies home exposes archive/papelera actions for non-internal companies; company detail project archive/trash clears stale sessionStorage caches.
- Editor updates panel now includes compact deliverables creation and status management backed by `project_deliverables`.
- Public share route now gates document rendering behind viewer name/email, then allows comments and approvals/change requests.
- Users page now supports admin/manager user management: invites, profile edits, avatar upload, company role changes without access deletion, and admin-only account deletion with guardrails.
- Users page UI moved from cards to a compact table with expandable access rows for denser admin/manager workflows.

## Completed (2026-04-27)

- Deployed WeBrief to Namecheap VPS `199.192.22.74` at `https://webrief.app`.
- Production stack: Nginx serves `/var/www/webrief/frontend/dist`; `/api` proxies to PM2 process `webrief-backend` on `127.0.0.1:3000`; Certbot manages HTTPS; UFW allows OpenSSH + Nginx Full.
- GitHub `main` is production source. Manual deploy flow: local commit/push -> VPS `git pull origin main` -> `backend npm ci --omit=dev` + PM2 restart -> `frontend npm ci` + `npm run build`.
- Supabase hosted is production DB/Auth/Storage; local development depends on local `.env` values. If local `.env` points to Prod, local tests mutate Prod.
- Added operation/deploy guide at `docs/WEBRIEF_OPERATIONS_GUIDE.md`.
- Fixed frontend audit vulnerabilities by updating lockfile to Vite 6.4.2, PostCSS 8.5.12, and Picomatch 4.0.4. `npm audit` reports 0 vulnerabilities locally and on VPS.
- Added GitHub deploy key for VPS read access and local GitHub SSH push flow.
- Verified production: app loads, login works, `/api/health` returns OK, Nginx active, PM2 online, Certbot dry-run successful.

## Completed (2026-04-30)

- Added project types `page`, `document`, and `faq`. Visible UI labels are `Página Web`, `Artículo`, and `FAQs`; the internal `document` value remains unchanged for data compatibility.
- Página Web keeps the section-divider model. Artículo uses a linear document flow with a heading outline. FAQs uses H2 questions with answer content below and CSV export semantics.
- Paste handling now extracts SEO metadata lines, splits Página Web content into sections from H1/H2, creates FAQ question/answer groups from H2, preserves common rich formatting from Google Docs/Word, and supports prefixed labels like H1/H2/H3/CTA.
- Added page SEO metadata and content rules persistence through `project_pages.seo_metadata` and `project_pages.content_rules`; Supabase schema and migration files were updated accordingly.
- Added compact editor-side content rules UI with editable limits for authorized roles and read/status visibility for content writers.
- Expanded editor toolbar with text alignment, indentation, color, highlight, spacing, table picker behavior, and global dropdown dismissal fixes.
- Added role preview for admins, shared frontend/backend capability helpers, scoped role behavior for manager/editor/content_writer/designer/developer, and route/action gating aligned with those capabilities.
- Added designer proposal support through `project_page_change_proposals`; reviewer roles can accept/reject pending designer proposals.
- Company project cards now display project type and infer legacy project types from first page names when `projects.project_type` is null.
- App shell routing was normalized to a rooted layout with relative children. `UsersPage` now memoizes invite role options and avoids no-op invite form state writes to prevent render loops that freeze shell navigation.
- Removed the visible `Operación` label from the app shell sidebar.

## Pending

- richer deliverables UI beyond compact editor panel
- notification read/unread UI actions
- CRITICAL deploy follow-up: Namecheap VPS CPU does not support current prebuilt `sharp` linux-x64 binary (`requires v2 microarchitecture`). Backend now lazy-loads `sharp` so API can boot, but raster project asset uploads and avatar processing may return 503 until image processing is fixed. Resolve before serious beta/production because image uploads are core to app value. Options to evaluate: build `sharp` from source/system libvips on VPS, use an image-processing service, temporarily store originals without conversion, or move to a VPS CPU/provider that supports the binary.
- Create a separate Supabase Dev project before DB/schema experiments; do not test destructive SQL or schema changes against Supabase Prod first.
