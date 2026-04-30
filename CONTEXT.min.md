# WeBrief Min Context

- Read order rule:
  - Read `AI_GLOBAL.md` first.
  - Read this file second for fastest/highest-signal project context.
  - Read `CONTEXT.md` only if task needs more detail, implementation history, or stronger guardrails.
  - If user explicitly says "read/review CONTEXT", start with this file, then expand to `CONTEXT.md` only if needed.
- Updated: 2026-04-27

## Targets

- `login`
- `dashboard`
- `new-project`
- `users`
- `archive`
- `trash`
- `editor.navbar`
- `editor.sections-panel`
- `editor.canvas`
- `editor.document-structure`
- `editor.updates-panel`
- `editor.handoff`
- `share`
- `backend.activity`
- `backend.assets`
- `backend.auth`
- `backend.db`

## Core Facts

- Cross-model repo workflow exists: `AI_GLOBAL.md` -> `CONTEXT.min.md` -> `CONTEXT.md`
- `AGENTS.md` and `CLAUDE.md` are bridge files to the shared repo contract
- Frontend routes: `login`, `companies`, `companies/:companyId`, `users`, `archive`, `trash`, `new-project`, `project/:id/editor`, `share/:token`
- Frontend pages are lazy-loaded; `ProjectEditor`/TipTap must not load on admin pages like `companies`
- Companies page and company detail/project list use sessionStorage stale-while-revalidate cache for faster repeat navigation
- Auth: Supabase Auth session in frontend; backend validates bearer token via Supabase
- Dashboard/New Project use real backend data
- Admin shell now uses sidebar + dedicated companies home; `WeBrief` stays as internal company
- Admin shell sidebar now exposes `Empresas`, admin/manager `Usuarios`, `Archivados`, and `Papelera`
- Admin can create test companies with `testMode=true`; this bypasses initial manager invite and marks `companies.is_test=true`
- `profiles.platform_role` supports `admin`, `user`, and `qa`; Admin/QA are global roles, while `user` requires active company access
- Editor is TipTap with 3 columns: sections panel | canvas | updates panel
- Editor modes: `Brief`, `Handoff`, `Preview`
- Handoff is copy-safe: semantic labels/actions live in gutters, not inside selectable text
- Editor activity uses section-level review events: autosave can create/update unread `section_edited` records by page/section/user; canvas markers and right activity items are linked
- Right activity panel orders current-page section review events by `derivedSections` order, not chronology; general activity is separated below; compact deliverables UI is connected there
- Page review flow: pages start `draft`; `Enviar a revisión` creates `project_page_versions` baseline and switches page to `ready_for_review`; section alerts only emit for pages in review/approved/changes_requested
- Editor top navbar is reserved for logo/undo/page pills/profile; mode, handoff audience, review status/action, save status/action live in a bottom floating editor bar
- Backend: Express + Supabase Postgres/Auth
- Production deploy is live at `https://webrief.app` on Namecheap VPS `199.192.22.74` as user `deploy`
- Prod stack: Nginx serves `frontend/dist`, proxies `/api` to PM2 process `webrief-backend` on `127.0.0.1:3000`, Certbot manages HTTPS
- GitHub `main` is the production code source; deploy flow is local commit -> push `main` -> VPS `git pull` -> backend install/restart + frontend build
- Operational guide lives at `docs/WEBRIEF_OPERATIONS_GUIDE.md`
- Local `.env` files currently determine whether local dev hits Supabase Prod or a future Supabase Dev; using Prod locally is risky for DB/schema tests

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
- CTA/button is a semantic TipTap node with `ctaText` + `ctaUrl`
- Handoff must not place H1/H2/P/CTA/link metadata inside selectable content
- Handoff copy uses rich clipboard (`text/html` + `text/plain`) when available

## Keep Stable

- cross-model read order and shared-contract workflow
- `editor.sections-panel`: doc-derived list, active sync, no flicker
- `editor.canvas`: internal scroll, toolbar (full formatting + table), block labels top-aligned to their content block
- `editor.document-structure`: divider model, first-section logic, HTML hydration
- `editor.navbar`: page switching + undo/redo wiring
- `login`: Supabase session flow

## Touch / Keep / Watch

- `target=login`
  - `keep`: valid Supabase session -> redirect to dashboard
  - `watch`: session bootstrap must never leave the app stuck on global `Cargando...`
- `target=dashboard`
  - `keep`: open project route, logout behavior
  - `watch`: legacy route should redirect to companies home
- `target=companies`
  - `keep`: searchable/paginable companies home, sidebar shell, company counts, primary `Abrir` CTA per card, compact lifecycle icon actions for admin, explicit test-company mode for admin
- `target=company-detail`
  - `keep`: company page without tabs, project cards on left, team sidecard on right
- `target=new-project`
  - `keep`: business-type -> preview linkage
  - `watch`: selected company should prefer a non-internal company when one exists and accept company from route query
- `target=users`
  - `keep`: admin global visibility of user profiles + platform roles including Admin/QA; manager scope limited to active companies where they are manager
  - `watch`: company filter/order behavior, archived/trashed companies hidden, no company-access deletion, no last-manager downgrade, no admin self-delete, platform roles admin-only
- `target=trash`
  - `keep`: `/trash` lists only `trashed_at` rows; restore clears archive/trash columns; permanent delete is destructive
  - `watch`: sessionStorage company caches after archive/trash/restore/delete
- `target=archive`
  - `keep`: `/archive` lists only `archived_at not null` and `trashed_at is null`; no permanent delete action there
  - `watch`: unnumbered Empresas/Proyectos tabs and date filter should not mix archived rows with trashed rows
- `target=editor.navbar`
  - `keep`: page switch flow, undo/redo, page pill menu (rename/delete), delete confirmation modal, single-open menu (openMenuId)
  - `watch`: per-page `fullContent`
- `target=editor.sections-panel`
  - `keep`: no flicker, real active section, heading navigation, drag & drop reorder
  - `watch`: `editor.document-structure`, `editor.canvas`
- `target=editor.canvas`
  - `keep`: TipTap editing behavior, internal scroll, type labels outside canvas and top-aligned to their content block, context-sensitive dropdown (lists vs text), table support (grid picker, contextual toolbar, right-click menu, inline + buttons), non-interactive type labels for tables (`t`) and images (`img`)
  - `watch`: selection/caret, sidebar sync
- `target=editor.document-structure`
  - `keep`: all editor invariants
  - `watch`: add/delete/rename/hydration
- `target=editor.updates-panel`
  - `keep`: panel shows section review activity, pending notifications, compact deliverables, and share-link action; click activity scrolls to its section marker
- `target=editor.handoff`
  - `keep`: copy-safe central content; labels/actions outside selectable text
- `target=share`
  - `keep`: public token route with email gate, comments, approvals/change requests
- `target=backend.auth`
  - `keep`: login contract unless requested
  - `watch`: frontend login flow
- `target=backend.db`
  - `keep`: company/project/page schema + backend-owned authorization

## New Data/Auth Baseline

- frontend uses `@supabase/supabase-js`
- backend uses service-role Supabase client
- login uses Supabase password auth
- login supports Supabase password-reset email flow (`resetPasswordForEmail`) redirecting to `/auth/set-password`
- Supabase Auth redirect allowlist must include `http://localhost:5173/auth/set-password` for local invite/reset links
- auth bootstrap uses a timeout fallback so the UI can recover even if Supabase session init hangs
- onboarding route exists at `auth/set-password`
- backend routes: `GET /api/auth/me`, `POST /api/auth/invite-user`, `GET /api/companies`, `GET /api/companies/:id`, `POST /api/companies`, `GET /api/trash?state=archived|trashed`, `GET/POST /api/projects`, `GET /api/projects/:id`, `PUT /api/projects/:id/pages`
- added backend routes for activity, deliverables, assets, share links, notifications, public share comments/approvals, archive/trash/restore/permanent-delete
- `POST /api/companies` requires manager email and creates/assigns a `manager`; if manager setup fails, the newly inserted company is deleted before responding
- exception: admin `POST /api/companies` with `testMode=true` creates `companies.is_test=true` without manager/invite to avoid Supabase invite rate limits in test setup
- `WeBrief` is the internal platform company for admin/demo/site use, not the default client company model
- project creation is real and seeds template pages by `businessType`
- editor save/load is real; save is manual via navbar button and persists `content_html` + `content_json`
- editor autosave persists pages with `source=autosave`; generic `brief_saved` activity is intentionally not emitted
- page save uses simple `version` conflict guard
- raster uploads go through backend to Supabase Storage and convert to WebP; SVG uploads are non-inline attachments
- Supabase remote schema is synced with `supabase/schema.sql` for archive/trash columns, deliverables, comments, approvals, share links, assets, activity/notifications/page versions; `project-assets` bucket is public with 8 MB image/SVG limit
- Supabase remote schema includes `companies.is_test`, `companies.created_for_testing_by`, `profiles.platform_role='qa'`, `profiles.avatar_url`, and public `user-avatars` bucket

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
- moved type-labels column outside the editor canvas (own column to the left, not inside the page)
- type-label dropdown is context-sensitive: lists show ul/ol options, text blocks show H1–H6/Párrafo; current type is excluded from dropdown
- type-label list toggle changes the entire list at once via `setNodeMarkup`, not per-item
- drag & drop section reordering in sidebar (native HTML5 DnD, no library); custom drag ghost shows grip icon + section name in bordered box
- page pills have MoreVertical menu with rename (inline input) and delete (confirmation modal); PagePill component with controlled props
- contextual menus (page pills + section items) share `openMenuId` in ProjectEditor — only one open at a time
- new-page initial section is seeded in `protectedEmptySectionIds` to prevent immediate auto-remove when user adds a second section; same protection applied on page switch (`handlePageClick`)
- toolbar expanded: strikethrough, bullet list, ordered list, blockquote, table (grid picker 1×1–8×8)
- table extensions: `@tiptap/extension-table`, `table-row`, `table-header`, `table-cell`
- table manipulation: 3 approaches — contextual toolbar (add/remove row/col, delete table), right-click context menu, inline "+" buttons at right & bottom edges
- type labels: `t` for tables, `img` for images — both non-interactive (no dropdown, dimmed)
- renamed visible app branding from `WebBrief` to `WeBrief`
- dashboard now loads real projects and supports invite flow for admin/manager
- dashboard now supports admin company creation and treats `WeBrief` as internal
- admin shell now uses sidebar navigation with dedicated companies home
- companies home now supports search, type filter, pagination controls, modal company creation, company stats, and non-clickable cards with explicit `Abrir`
- companies home cards now hide slug in the visible UI, use lighter metric hierarchy, and keep archive/trash as compact icon actions
- sitewide selects now use normalized chevron spacing instead of browser-default right padding
- company creation modal now requires an initial manager user; companies should not be created without at least one `manager`
- company detail now shows compact project cards on the left and a team/invite sidecard on the right, without tabs or top-level last-activity summary
- removed uppercase styling from active admin/auth surfaces (`AppShell`, `Companies`, `Company`, `NewProject`, auth pages)
- login and set-password now use shared CSS Module auth styles instead of inline style objects
- login now includes "Olvidé mi contraseña" flow through Supabase reset email
- added global/scoped `Usuarios` page with compact table UI, expandable access rows, search, active-company filter, ordering, pagination, invites, profile edits, avatar upload, company role changes without access deletion, admin-only account deletion, and real data from `profiles` + `company_memberships`
- new-project now creates real projects against backend
- new-project accepts preselected company from route query
- fixed auth bootstrap so frontend no longer gets stuck indefinitely on global `Cargando...`
- added autosave + page version conflict guard
- replaced updates-panel placeholder with activity/pending/share controls
- added Handoff mode for Designer/Dev with copy-safe gutters and rich clipboard copying
- added semantic CTA/button node
- added public `/share/:token` preview with email gate, comments, approvals/change requests, and print/PDF
- added Supabase Storage asset endpoint with raster-to-WebP and SVG no-inline policy
- added archive/trash backend baseline, project/company archive/trash actions, `/archive` Archivados UI, and `/trash` Papelera UI
- lazy-loaded frontend pages so `ProjectEditor`/TipTap are split out of the initial admin bundle
- deduped frontend `/api/auth/me` hydration and removed backend auth's extra company-name lookup from every authenticated request
- companies/project lists now filter out archived/trashed rows; direct project access also excludes archived/trashed unless restore/permanent routes request inactive rows
- archive/papelera lifecycle UI has unnumbered `Empresas`/`Proyectos` tabs, no duplicate panel heading, and shared date filter/refresh actions in the tab toolbar; archived and trashed states are not mixed
- editor updates panel now includes compact deliverables creation/status management backed by `project_deliverables`
- public share document is gated behind viewer name/email before rendering, then supports comments/approvals/change requests
- added admin-only test-company creation mode and QA platform role plumbing
- section-level activity markers live to the right of the canvas, aligned by existing section DOM measurements; do not alter the editor scroll/height model
- deployed WeBrief to Namecheap VPS with Nginx, PM2, Certbot HTTPS, firewall, Supabase hosted, and GitHub deploy key
- fixed frontend audit vulnerabilities by updating lockfile to Vite 6.4.2, PostCSS 8.5.12, and Picomatch 4.0.4; audit is 0 vulnerabilities locally and on VPS
- documented basic operations/deploy flow in `docs/WEBRIEF_OPERATIONS_GUIDE.md`
- added project types `page`/`document`/`faq`; visible labels are `Página Web`, `Artículo`, and `FAQs`
- project type behavior differs by editor mode: `Página Web` keeps section dividers; `Artículo` is linear with heading outline; `FAQs` derives FAQ items from H2 question blocks and supports CSV export
- editor paste supports SEO metadata extraction, H1/H2 section splitting for Página Web, FAQ question/answer creation, and rich-format preservation for common Google Docs/Word paste content
- editor toolbar now includes alignment, indentation, color/highlight, spacing controls, table picker, and dropdown dismissal behavior
- page-level SEO metadata and document content rules persist on `project_pages.seo_metadata` and `project_pages.content_rules`
- content rules UI is a compact floating card; editors/managers/admin can edit limits, content writers can see status/limits
- role preview exists for admin testing; auth applies a local role preview without mutating the real profile
- role capability matrix is shared in frontend/backend helpers; manager/editor/content_writer/designer/developer actions are gated by capability rather than ad hoc checks
- designer proposal flow exists via `project_page_change_proposals`; reviewers can accept/reject pending designer content proposals
- company project cards display inferred project type for legacy projects whose `projects.project_type` is null
- app shell private routes use a rooted layout with relative children; `UsersPage` memoizes invite role options to avoid render loops that can freeze navigation

## Pending

- richer deliverables UI beyond compact editor panel
- notification read/unread UI actions
- CRITICAL deploy follow-up: Namecheap VPS CPU does not support current prebuilt `sharp` linux-x64 binary (`requires v2 microarchitecture`). Backend now lazy-loads `sharp` so API can boot, but raster project asset uploads and avatar processing may return 503 until image processing is fixed. Resolve before serious beta/production because image uploads are core to app value.
- Create a separate Supabase Dev project before DB/schema experiments; do not test destructive SQL or schema changes against Supabase Prod first.
