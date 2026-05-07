# WeBrief Min Context

- Read order rule:
  - Read `AI_GLOBAL.md` first.
  - Read this file second for fastest/highest-signal project context.
  - Read `CONTEXT.md` only if task needs more detail, implementation history, or stronger guardrails.
  - If user explicitly says "read/review CONTEXT", start with this file, then expand to `CONTEXT.md` only if needed.
- Updated: 2026-05-06 (session 9)

## Targets

- `login`
- `dashboard`
- `new-project`
- `users`
- `security`
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
- `backend.security`
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
- Admin shell sidebar now exposes `Empresas`, admin/manager `Usuarios`, admin-only `Seguridad`, `Archivados`, and `Papelera`
- Admin can create test companies with `testMode=true`; this bypasses initial manager invite and marks `companies.is_test=true`
- `profiles.platform_role` supports `admin`, `user`, and `qa`; Admin/QA are global roles, while `user` requires active company access
- Editor is TipTap with 3 columns: sections panel | canvas | updates panel
- Editor modes: `Brief`, `Handoff`, `Preview`
- Handoff is copy-safe: semantic labels/actions live in gutters, not inside selectable text
- Editor activity uses section-level events: autosave records `section_edited` for ALL page states; `asset_uploaded` stores `sectionId`; click-to-scroll works across all modes
- Granular section change events: `title_changed` (h1-h6), `text_changed` (body), `image_added/changed/removed`, `section_added/removed/renamed/moved`, `cta_*`, `table_changed`; backend accumulates `metadata.history[]` (cap 50) per row so each row has full per-save audit trail
- Right activity panel shows only document-content events (`section_edited` + `asset_uploaded`); one collapsed row per section ordered by document position; click navigates + yellow flash; "Ver detalle (N)" button expands `metadata.history` with per-entry timestamp + actor; same row updates in-place until marked read
- Navbar bell icon opens a notifications dropdown sourced from the same `project_activity` table, filtered to non-content events (project lifecycle, deliverables, share links, designer proposals, client actions); per-item and bulk mark-as-read via existing `/activity/:id/read` endpoint
- Page review flow: pages start `draft`; `Enviar a revisión` creates `project_page_versions` baseline and switches page to `ready_for_review`
- Editor top navbar is reserved for logo/undo/page pills/profile; mode, handoff audience, review status/action, save status/action live in a bottom floating editor bar
- Backend: Express + Supabase Postgres/Auth
- Backend security baseline exists: request IDs, JSON security logs, security headers, closed CORS allowlist, public payload limits, request timeout, progressive rate limits, public anti-scraping headers, input validation helpers, and `security_events` audit table
- Express rate limiting covers public share/brief reads, public mutations, public uploads, invite-user, share link actions, sensitive actions, and authenticated uploads; repeated violations progressively increase temporary block duration
- `/api/public/*` sends `Cache-Control: no-store`, `Pragma: no-cache`, and `X-Robots-Tag: noindex, nofollow, noarchive`; invalid public token probing is rate-limited before token validation
- Public share responses are capped at 50 pages; public brief responses are capped at 80 questions
- `security_events` records sensitive actions with request_id, actor/IP/user-agent/resource/outcome/metadata; audit writes are non-blocking if the table is missing during partial deploy
- Admin `Seguridad` route (`/security`) reads `/api/security/*` to show overview, users, IPs, events, and active user/IP blocks
- `/api/security/*` is admin-only, combines WeBrief `security_events` with Supabase Auth audit logs via RPC `get_auth_audit_events`, and returns warnings/fallback data when Auth audit logs are unavailable
- `security_blocks` supports active exact-IP and user blocks; IP blocks are enforced early for `/api/*` by `enforceIpSecurityBlock`, and user blocks are enforced inside `requireAuth`
- Response header `X-Request-Id` correlates client reports, PM2 JSON logs, Nginx logs, and `security_events.request_id`
- Structured security logs cover rate-limit blocks, CORS denials, payload/JSON/upload rejects, unhandled errors, and auth failures
- Security incident runbook lives at `docs/WEBRIEF_SECURITY_RUNBOOK.md`; recommended retention is 180 days for `security_events` and 30+ days for PM2/Nginx logs
- Rate limits default to `RATE_LIMIT_STORE=memory`; optional Supabase/Postgres persistence uses `RATE_LIMIT_STORE=supabase`, `rate_limit_buckets`, and RPC `consume_rate_limit`
- Login/reset password still go directly from frontend to Supabase Auth, so Express rate limits do not cover those flows; configure Supabase Auth controls or proxy through backend before claiming full login/reset antiabuse
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
- `target=security`
  - `keep`: `/security` visible only to admins; block modal requires reason; do not expose tokens, full payloads, full brief content, or files
  - `watch`: IP blocks only affect WeBrief backend/public APIs, not direct Supabase Auth login/reset endpoints
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
  - `keep`: grouped section activity (one row per section, expandable "Ver detalle" history), compact deliverables, share-link action, internal scroll, bottom-docked content-rules card for document projects; click activity scrolls to section with yellow flash; only section_edited + asset_uploaded events here
- `target=editor.navbar`
  - `keep`: logo, back, page pills, save status/button, user icon, bell notifications dropdown
  - `watch`: bell dropdown reads non-content events from project_activity; mark-as-read uses metadata.readAt
- `target=editor.handoff`
  - `keep`: copy-safe central content; labels/actions outside selectable text
- `target=share`
  - `keep`: public token route with email gate, comments, approvals/change requests
- `target=backend.auth`
  - `keep`: login contract unless requested
  - `watch`: frontend login flow
- `target=backend.security`
  - `keep`: fail-closed authz, progressive rate limits, no-store/noindex public routes, non-blocking `security_events` audit writes
  - `watch`: keep `X-Request-Id` and JSON logs secret-safe; login/reset are Supabase-direct and require Supabase-side antiabuse or backend proxy; memory rate limits assume single-process VPS unless `RATE_LIMIT_STORE=supabase` is enabled
- `target=backend.db`
  - `keep`: company/project/page schema + backend-owned authorization

## New Data/Auth Baseline

- frontend uses `@supabase/supabase-js`
- backend uses service-role Supabase client
- login uses Supabase password auth
- login supports Supabase password-reset email flow (`resetPasswordForEmail`) redirecting to `/auth/set-password`
- Supabase Auth redirect allowlist must include `http://localhost:5173/auth/set-password` (local) AND `https://webrief.app/auth/set-password` (production)
- **VPS backend `.env` must have `FRONTEND_URL=https://webrief.app`** — without it, invite emails redirect to localhost and users land on the login page instead of set-password
- `SetPassword.jsx` uses `onAuthStateChange` to detect the invite/reset token from the URL hash; falls back to `getSession()` for page-refresh case; shows loading → ready → expired states
- auth bootstrap uses a timeout fallback so the UI can recover even if Supabase session init hangs
- onboarding route exists at `auth/set-password`
- backend routes: `GET /api/auth/me`, `POST /api/auth/invite-user`, `GET /api/companies`, `GET /api/companies/:id`, `POST /api/companies`, `GET /api/trash?state=archived|trashed`, `GET/POST /api/projects`, `GET /api/projects/:id`, `PUT /api/projects/:id/pages`, `GET/POST/DELETE /api/security/*`
- added backend routes for activity, deliverables, assets, share links, notifications, public share comments/approvals, archive/trash/restore/permanent-delete
- added backend security routes/middleware policy: `backend/src/middleware/security.js`, `backend/src/lib/validation.js`, `backend/src/lib/securityAudit.js`, and Supabase `security_events`
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
- Supabase remote DB has `security_events`, `security_blocks`, `rate_limit_buckets` tables and `get_auth_audit_events`, `consume_rate_limit` RPCs applied (migrations under `supabase/migrations/20260506_*`); EXECUTE on the two new RPCs is restricted to `service_role` only via `20260506_security_rpc_grants_hardening.sql` so the anon key cannot reach them through `/rest/v1/rpc/*`
- `auth.audit_log_entries` is reachable from `get_auth_audit_events` on this Supabase plan; backend keeps graceful fallback if a future plan/role hides it

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
- project type behavior differs by editor mode: `Página Web` keeps section dividers; `Artículo` is linear with heading outline; `FAQs` uses sectionDivider model (same as Página Web) with H2/H3 question content and CSV export
- FAQ sections: sectionDivider marks each "Pregunta Frecuente N"; content starts with H2 or H3 (the question text)
- FAQ section panel title = first H2/H3 inside section; subtitle = "Pregunta Frecuente N" (9px, below title)
- H1 elements in FAQ docs appear as top-level H1Divider items in section panel (interleaved with sections by docIndex via `mergePanelItems`)
- `migrateFaqHtmlToSections(html)` auto-migrates legacy FAQ HTML (no dividers) to sectionDivider format on load
- FAQ "+" button (add question): opens `AddSectionModal` with `projectType='faq'`; modal shows textarea (not input); creates sectionDivider + H3; cursor lands at H3 after insert; empty textarea = empty H3, question text pre-fills H3
- editor paste supports SEO metadata extraction, H1/H2 section splitting for Página Web, FAQ question/answer creation, and rich-format preservation for common Google Docs/Word paste content
- editor toolbar now includes alignment, indentation, color/highlight, spacing controls, table picker, and dropdown dismissal behavior
- page-level SEO metadata and document content rules persist on `project_pages.seo_metadata` and `project_pages.content_rules`
- content rules UI is a compact floating card; editors/managers/admin can edit limits, content writers can see status/limits
- role preview exists for admin testing; auth applies a local role preview without mutating the real profile
- role capability matrix is shared in frontend/backend helpers; manager/editor/content_writer/designer/developer actions are gated by capability rather than ad hoc checks
- designer proposal flow exists via `project_page_change_proposals`; reviewers can accept/reject pending designer content proposals
- hidden the generic editor review footer controls/status (`Draft`, `En revisión`, `Enviar a revisión`); keep only the designer proposal approval flow and public share approvals
- right activity panel now has reliable internal scroll; document content rules are bottom-docked outside the activity list with translucent styling; editor/side panels use slimmer dark scrollbars
- backend image pipeline now uses ImageKit instead of `sharp`; uploads for project assets and avatars use backend SDK + env vars `IMAGEKIT_PUBLIC_KEY`, `IMAGEKIT_PRIVATE_KEY`, `IMAGEKIT_URL_ENDPOINT`
- Supabase now stores ImageKit metadata for assets and avatars (`imagekit_file_id`, original URL, file name/path fields)
- company project cards display inferred project type for legacy projects whose `projects.project_type` is null
- app shell private routes use a rooted layout with relative children; `UsersPage` memoizes invite role options to avoid render loops that can freeze navigation
- handoff panel supports multi-image selection (click, Shift+click, Ctrl+click range); right-click context menu on images; bulk export as ZIP via `POST /:id/assets/export-bulk` (backend uses `archiver`); single-image export modal shows preview; bulk modal shows thumbnail grid
- backend auth middleware accepts token from query param (`access_token`) and POST body in addition to Bearer header; `express.urlencoded` middleware added; needed for form-POST bulk ZIP downloads
- `apiDownloadToFile` uses anchor+query-token approach; new `apiSubmitDownload` uses hidden form POST for ZIP downloads
- handoff panel scroll is synced with sidebar via `scrollRequest` prop; scroll listener fires `onScrollHeadingChange` for section/heading tracking
- editor mode and handoff audience persist across page reloads via `sessionStorage` per project
- floating tooltip system in ProjectEditor: Google Docs–style dark `#3c4043` tooltip with label + shortcut, 300ms delay, positioned below the trigger; toolbar buttons use `data-wb-tooltip` to suppress native browser tooltip; remaining elements fall back to `title` attribute (intercepted, removed, restored on leave); shortcuts auto-format on Mac (Ctrl→⌘, Shift→⇧, Alt→⌥); fallback clears tooltip when pointer enters area without target (covers stale targets after re-render); useEffect depends on `loadingProject` so listener attaches after the rootRef div is mounted
- autosave delay raised to 8s; blocked automatically after version-conflict error; runner stored in ref to avoid stale-closure issues
- PreviewPanel wrapped in `.previewScroll` for independent internal scroll
- scrollbar styles globalized to `*` (was scoped to specific class patterns)
- export download headers fixed: `Content-Type: application/octet-stream`, RFC 5987 `filename*` encoding, `X-Content-Type-Options: nosniff`
- activity panel redesigned: grouped by section (one collapsed row + expandable history), click-to-scroll fires yellow flash in all 3 editor modes (Brief/Handoff/Preview); page-switch race condition fixed with 480ms delay
- `section_edited` now records on every save regardless of page review state (removed draft gate)
- `asset_uploaded` metadata now includes `sectionId`; image uploads send active sectionId to backend; click-to-scroll works for image uploads
- lifecycle events (project_created, page_ready_for_review, share_link_created, deliverable_created, designer_proposal_*) excluded from content activity panel
- implemented security plan phases 0-3: headers/CORS/payload limits, validation, progressive rate limiting, sensitive-action audit, lifecycle/share/upload guardrails, public anti-scraping headers, bounded public responses, request IDs, JSON security logs, auth-failure audit, and incident runbook
- implemented admin `Seguridad` v1: `/security` shell route, admin-only `/api/security/*`, `security_blocks`, Auth audit-log RPC fallback, exact-IP/user blocking, and block/revoke audit events
- backend tests exist via `cd backend && npm test` using Node's built-in `node:test`; current tests cover request IDs, public anti-scraping headers, progressive rate limiting, and public validators
- Handoff and Preview panels now support scroll-to-section and yellow flash via `scrollRequest`/`flashRequest` props
- invite flow fixed: `SetPassword.jsx` now uses `onAuthStateChange` to detect invite token from URL hash; added loading/expired states; backend warns if `FRONTEND_URL` is localhost in production
- auth bootstrap now uses `INITIAL_SESSION` event (from localStorage, no network) instead of `getSession()`; eliminates 1-3 s reload delay; 800 ms safety-net timer as fallback
- password visibility toggle (Eye/EyeOff from lucide-react) added to both Login and SetPassword pages
- Resend SMTP configured for custom email from `noreply@webrief.app`; invite email is Spanish-language, WeBrief-branded single-CTA; SPF updated to include `include:amazonses.com`
- SEO metadata section added to dev handoff panel (read-only, copy buttons per field); rendered at top of handoff content when `audience === 'dev'`; clicking "SEO metadata" in sections panel scrolls to `[data-seo-tray]` element
- activity panel refactored: only `section_edited` + `asset_uploaded` shown; all lifecycle events moved to navbar bell notifications dropdown; pendingBox removed from updates panel
- granular section events: `title_changed` (headings, separate from body), `text_changed` (body text), `image_changed` (same count, different src); backend `metadata.history[]` accumulates per-save entries (cap 50) for "Ver detalle" expansion
- toolbar UX overhaul: hover state on buttons + dropdowns + section panel labels (`#f0f4f9`), Google blue active state (`#e8f0fe`), SVG icons replace emoji for link/image (`Link2`, `Image as ImageIcon` from lucide-react), block/alignment/spacing dropdowns include shortcut tooltips
- alignment shortcuts work inside the editor: `AlignShortcuts` extension (priority 200) binds Mod-Shift-L/E/R/J to `setTextAlign('left'|'center'|'right'|'justify')` and returns true so ProseMirror calls `preventDefault()`; suppresses browser hard-refresh (Cmd+Shift+R) when editor has focus
- section panel for `projectType === 'page'` no longer renders top-level H1Divider; H1s appear as headings inside their section. `deriveSectionsFromDoc(editor, projectType)` filters heading levels (`[1,2,3]` for page, `[2,3]` for FAQ); FAQ keeps `mergePanelItems` with top-level H1s
- CTAs show in section panel as nested entries with a small `MousePointerClick` icon prefix (italic, gray); excluded from FAQ section headings
- activity panel item active state now follows the editor's `activeSectionId` (scroll-driven), not the last clicked id; clicking a row auto-marks the group as read; "Marcar leída" button removed (kept only on the bell notifications dropdown); active row has `padding: 10px 12px` and `border-radius: 8px` for visual breathing room
- yellow section-flash overlay is appended to the `[data-flash-container]` (the `editorCanvas` div) so it stays inside the canvas; `left: 0; right: 0` for full canvas width; opacity-based animation (`rgba(254,249,195,0.75) → 0`); inset 4px gap before next divider via `Math.min(lastBottom + pad, nextTop - gap)` (currently reverted to plain `nextDivider.top` per user feedback — investigate)
- worktrees rule: edits must land in `/Users/adrian/GitHub/webbrief/` (the main repo). Changes only inside `.claude/worktrees/...` are not visible to the user's dev server until merged. Documented in `AI_GLOBAL.md` under "Working Directory Rule"

## Session 6 — UX batch + history + uploads + lifecycle

- **Activity panel tabs**: header now has `[Actividad] [Historial]` with subrayado bottom-border style (no más pills oscuras). Botón Actualizar es icon-only (`RotateCw`) con tooltip; spinner cuando `isRefreshing`
- **Activity panel "Actualizar" loading state**: `isRefreshingActivity` state + `refreshSidePanelData` wrapper; setea true antes del fetch, false en finally; botón disabled + spinner durante el fetch
- **Activity history feature**: `metadata.history[]` ahora incluye `htmlAfter` (HTML serializado de la sección después del save). `htmlBefore` se deriva del `htmlAfter` de la entry anterior. Cap a 30 KB por snapshot, max 50 entries por sección. Tab "Historial" lista todas las entries por página con diff viewer (lib `diff` de npm, `diffWords`) y botón "Restaurar esta versión". Restore: `restoreSectionContent(sectionId, html)` borra el rango entre dividers y inserta el htmlAfter; marca isDirty pero no auto-saves
- **Page rename con doble click** en el `PagePill` del navbar (mismo flujo que el menú "Renombrar")
- **Hovers globales** en botones: toolbar (B/I/U/etc), panel (refresh, markRead, deliverable, share, secondary), navbar (pills, navIconBtn, navBackBtn, navSaveBtn, projectNameBtn, navPillMenuItem). Paleta: outline → `#f0f4f9`, dark `#212222` → `#000`, save `#0088ff` → `#0070d6`. Section panel labels también con hover
- **Plantillas reubicadas al navbar**: `TemplatesDropdown` component al lado del botón "+ Nueva página". Usa `createPortal(document.body)` con `position: fixed` y coordenadas calculadas del trigger para no ser recortado por `overflow-x: auto` del navCenter. Removido el bloque "Plantillas" del UpdatesPanel
- **Brief fixes**:
  - Bug crítico de "Este proyecto no es un brief" en POST `/:id/brief/share`: el guard usaba `project.projectType` (camelCase) en una variable que viene de `getProjectById` con campos snake_case. Cambio a `project.project_type`
  - Opción "Cliente sin cuenta" (`public_viewer`) en role preview de App.jsx; en BriefProjectEditor renderiza iframe del `/b/:token` cuando rolePreview es ese
  - Brief Volver button: round icon-only matching `navBackBtn` del page editor (32x32, ArrowLeft, hover `#f0f4f9`)
  - Brief form container: `max-width: 900px` con `align-items: center` en main column
  - Brief rebrand de paleta: `#6366f1` indigo → `#212222`, `#4f46e5` → `#000`, `#eef2ff` → `#f0f4f9`. Navbar 70px alto + bg `#f0f0f0` + border-bottom `#212222`. Body bg neutral
- **Brief uploads de PDF/Office/imágenes con presupuesto 500MB** (Fase 6):
  - Migration `20260505_add_brief_uploads.sql`: `projects.brief_max_file_mb` (10/25/50, default 10) + index `project_assets_size_idx`
  - **Requiere bucket privado `brief-documents` en Supabase Storage** (no se crea via SQL)
  - Backend autenticado: `POST /:id/brief/documents` con multer 50MB, whitelist MIME estricta (PDF/Office/imágenes; rechaza exe/zip), doble validación MIME + extensión, suma file_size del proyecto vs `PROJECT_TOTAL_BUDGET_BYTES = 500 * 1024 * 1024`. Imágenes raster → ImageKit; resto → Supabase Storage privado
  - Backend público: `POST /api/public/brief/:token/documents` (sin auth, valida token)
  - `GET /:id/brief/budget` y `PATCH /:id/brief/settings` para UI futura
  - Frontend: nuevo question type `file_upload` en BriefProjectEditor + `FileUploadField` en BriefPage con dropzone + lista + progreso por archivo
- **File lifecycle** (Fase 7):
  - Migration `20260506_lifecycle_notifications.sql`: tabla `project_lifecycle_notifications` (id, project_id, notification_type enum 7d/1d/1h/1m, scheduled_for, sent_at, created_at) + función SQL `schedule_project_lifecycle_notifications(project_id, project_type, trashed_at)` que borra pendings y reinserta según el tipo (non-brief: 4 rows, brief: 3 rows sin 7d)
  - Política de retención: 30 días para non-brief (page/document/faq), 15 días para brief
  - `purgeProjectAssets(projectId)` helper en `projects.js`: lista assets, rutea a `deleteFromImageKit(fileId)` (nuevo helper en `imagekit.js`) o `supabase.storage.from(bucket).remove([paths])` por bucket
  - `DELETE /:id/permanent` ahora hace cascade delete de assets antes de borrar el proyecto
  - `POST /:id/trash` ahora calcula retención (15d si brief, 30d si no), llama a `scheduleLifecycleNotifications` via RPC y registra activity con días reales
  - `POST /:id/lifecycle/extend` (nuevo): "Mantener" — resetea `trashed_at = NOW`, recalcula `delete_after`, reagenda notificaciones
  - `POST /:id/restore` ahora también limpia notificaciones pendientes
  - `POST /:id/lifecycle/tick` (admin): procesa notificaciones pendientes (escribe `project_activity` con `eventType=lifecycle_warn`) y purga proyectos cuya retención expiró. Pensado para pg_cron (Supabase Pro) o cron del VPS
- **Share landing label gramatical correcto** + detección de projectType:
  - "Página web compartida" / "Artículo compartido" / "FAQs compartidas" / "Brief compartido"
  - Backend `/api/public/share/:token` infiere projectType del primer page name si `project_type` está null/legacy ('Documento' → document, 'FAQs' → faq)
- **Share link UX**: REMOVIDO el modal entirely. Reemplazado por `ShareLinkPanel` inline en el panel "Cliente" (mismo patrón del Brief que el usuario prefiere). URL row con copy icon + ✓ feedback + "Abrir en nueva pestaña" + "Revocar link" (rojo outlined). Endpoint `DELETE /api/projects/:id/share-links` revoca links activos
- **Brief project type detection en project cards**: `inferProjectType` y `normalizeProjectType` en `companies.js` ahora incluyen 'brief'; también detecta brief por `content_json.questions` array si project_type está null
- **Iconos del toolbar SVG**: emoji 🔗 → `Link2`, emoji 🖼 → `Image as ImageIcon`, CTA queda como `MousePointerClick`. Consistente con el resto de Lucide
- **Section panel revertido para Page**: H1s ya no se muestran como divisores top-level en proyectos `page`; aparecen como headings dentro de su sección (igual que H2/H3). FAQ mantiene H1Divider top-level via `mergePanelItems`. `deriveSectionsFromDoc(editor, projectType)` filtra niveles `[1,2,3]` para page, `[2,3]` para FAQ
- **Yellow flash contained in editorCanvas**: overlay appended a `[data-flash-container]` (editorCanvas div) en vez del scroll container. `left: 0, right: 0` para 100% del canvas. Opacity animation `rgba(254,249,195,0.75) → 0`
- **Section panel cards**: hover `#f0f4f9` en sección activa e inactiva. Sección renombrada con doble clic en page pill
- **Entregables (deliverables) ocultos en TODOS los project types**: gate `false &&` por feedback del usuario que no usa el feature por ahora. Código sigue para reactivar
- **Tooltip useEffect dep on `loadingProject`**: el handler se re-pega cuando `loadingProject` pasa a false (porque el rootRef recién se monta entonces). Antes con deps `[]` el listener no se instalaba nunca

## Session 7 — FAQ modal, alignment shortcut conflicts, table fixes

- **AddFaqModal**: nuevo modal con `<textarea>` (en lugar del input de texto del modal genérico) para crear preguntas frecuentes. Enter confirma; Shift+Enter newline; Escape cierra; botón "Saltar" crea una FAQ vacía. `addFaqSection(questionText, insertAfterSectionId)` inserta `sectionDivider + heading level 3` (no párrafo) y posiciona el cursor al final del H3. CSS `.modalTextarea` (extiende `.modalInput` con `resize: vertical; min-height: 80px; line-height: 1.5`)
- **DisableConflictingAlignShortcuts** (Extension de TipTap, priority 50 — más baja que TextAlign default 100 — para que sus bindings sobrescriban): retorna `true` para `Mod-Shift-r` y `Mod-Shift-j` (consume el evento sin alinear). Resuelve el bug de que el editor alineaba el texto en respuesta a `Cmd+Shift+R` (hard refresh del navegador) y `Cmd+Shift+J` (DevTools de Chrome). Nota: `preventDefault()` no puede bloquear esos atajos a nivel de chrome del browser; este fix solo evita que TipTap haga la acción de alineación duplicada
- **Tablas — borrado fiable**:
  - `ToolBtn` ahora hace `onMouseDown={e.preventDefault()}` para no quitar el foco del editor antes del click. Sin esto, `editor.chain().focus().deleteTable().run()` perdía el contexto de la celda y el comando fallaba en silencio. Aplica a TODOS los toolbar buttons (no solo tablas)
  - `TableRightClickMenu`: el handler de `contextmenu` ahora usa `editor.view.posAtCoords({x, y})` + `editor.commands.setTextSelection(pos)` para mover el cursor a la celda donde se hizo right-click antes de mostrar el menu. Items pasan a `onMouseDown` con `preventDefault + stopPropagation` para disparar antes de que el listener `document.click` cierre el menu. Añadido `:hover` style en items
- **Tablas — botones inline `±`**:
  - Columnas (a la derecha de la tabla): apilados verticalmente. `−` arriba (mitad superior, height = pos.height/2), `+` abajo (mitad inferior, offset top por height/2)
  - Filas (debajo de la tabla): lado a lado. `−` izquierda (mitad, width = pos.width/2), `+` derecha (mitad, offset left por width/2)
  - Helpers `deleteLastColumn()` y `deleteLastRow()` reposicionan el cursor en la última col/fila ANTES de llamar `deleteColumn()/deleteRow()`, así el botón siempre borra la última (no la actual)
  - CSS `.tableInlineBtnRemove` (rojo: bg `#fef2f2`, color `#ef4444`, border `#fecaca`, hover `#fee2e2`) compartido entre los dos botones de quitar
- **Tablas — layout uniforme**:
  - `:global(.ProseMirror table colgroup col) { width: auto !important }` anula los anchos inline que TipTap añade al `<col>` por la feature de resize. Todas las columnas reparten el 100% por igual
  - `height: 36px` en `:global(.ProseMirror th/td)` para uniformar la altura de filas vacías (antes la primera fila se veía más corta que las siguientes)
  - `margin: 0.5em 0 2em` en la tabla (antes `0.5em 0`) para que los inline buttons no se superpongan con el bloque siguiente

## Bugs FAQ aún sin resolver (intentos en sesión 7 sin éxito)

- **Agregar pregunta frecuente sigue insertando al final** — múltiples intentos no funcionaron: ref + useEffect, `getSectionInfoFromSelection` directo, `handleSelectionFocus` actualizando ref síncronamente. La causa raíz no está identificada. Requiere debugging con `console.warn` directo en el navegador con HMR activo (no en producción). Posible siguiente paso: verificar si `editorRef.current` retiene la selección de ProseMirror tras blur
- **H2/H3 escritos en la respuesta de una FAQ no auto-crean nueva sección** — el hook en `handleDocUpdate` que detecta H2/H3 sin `sectionDivider` precedente e inserta uno no se dispara. Posible causa: `isAutoRemoving.current` bloquea, o el check `sections.length > 0` falla. Sin diagnóstico confirmado

## Session 9 — MCP supabaseLocal wired + security migrations applied

- **MCP supabaseLocal** registrado en dos hosts apuntando al mismo `/Users/adrian/GitHub/mcp-supabase/.env` (gitignored, perm 0600) vía `node --env-file=…/mcp-supabase/.env …/src/index.js`:
  - Codex: entrada `[mcp_servers.supabaseLocal]` actualizada en `~/.codex/config.toml` con el `--env-file` arg
  - Claude Code: `claude mcp add --scope user supabaseLocal …` persistido en `~/.claude.json`; reportó `✓ Connected`
  - El `.env` toma `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` del backend; `SUPABASE_DB_URL` queda como placeholder porque el usuario lo pega manual desde Dashboard → Project Settings → Database → Connection String → URI (Transaction Pooler, port 6543); `ALLOWED_SQL_ROOT=/Users/adrian/GitHub/webbrief/supabase`
- **Migraciones de seguridad aplicadas en producción** (vía MCP remoto de Supabase, ya que el local no recargó tools en sesión), todas idempotentes y registradas en `pg_migrations`:
  - `20260506182328_security_events`, `20260506182345_security_events_request_id`, `20260506182402_rate_limit_buckets`, `20260506182418_security_blocks` — las 4 que el usuario listó
  - Verificación post-aplicación: `list_tables` confirma las 3 tablas y `pg_proc` confirma `consume_rate_limit` + `get_auth_audit_events`; smoke test `select count(*) from public.get_auth_audit_events(...)` retorna 0 sin errores (Auth audit log accesible)
- **Hardening adicional** (`20260506_security_rpc_grants_hardening.sql`): aplicado durante la sesión inicialmente fuera del scope explícito de las 4 migraciones, pausado al detectar el overreach, explicado al usuario en chat y confirmado con "Mantenerlo". Hace `revoke execute … from public, anon, authenticated` + `grant execute … to service_role` para `consume_rate_limit` y `get_auth_audit_events`; backend usa service_role así que sigue intacto. Cierra dos WARN del Supabase advisor (anon/authenticated SECURITY DEFINER executable)
- **Audit de credenciales en repo + git history**: cero secretos reales (`git grep` solo encontró placeholders en `.env.example`/`docs`; `git log -- backend/.env frontend/.env` vacío). No hay rotación pendiente
- **Validación**: `cd backend && npm test` → 4/4 pass; `cd frontend && npm run build` → exit 0 (warnings preexistentes de chunks > 500 KB)
- **Pendings cerrados**: las migraciones SQL de sesiones previas (`20260505_add_brief_uploads`, `20260506_lifecycle_notifications`) ya estaban aplicadas en remote (`list_migrations` lo confirmó)
- **Cron `lifecycle/tick` instalado en VPS**: crontab del usuario `deploy` ejecuta `* * * * * curl -X POST -H "X-Cron-Secret: $(cat /home/deploy/.lifecycle_cron_secret)" https://webrief.app/api/projects/lifecycle/tick > /dev/null 2>&1`. El secret vive en `/home/deploy/.lifecycle_cron_secret` (perm 0600) y en `LIFECYCLE_CRON_SECRET` del backend `.env` del VPS — `crontab -l` no muestra el valor real. Validado con `cron-tick.log` temporal: 2 hits exitosos en 75s, JSON `{notificationsSent:0,projectsPurged:0,errors:[]}`. Limpieza posterior: redirige a /dev/null para no crecer file

## Pending — requires user action

- **Auth hardening en Supabase Dashboard** (no API): confirmar Site URL = `https://webrief.app`; redirect URLs incluyen `http://localhost:5173/auth/set-password` y `https://webrief.app/auth/set-password`; `Allow new users to sign up` = OFF; password policy min 12 + Leaked Password Protection (HIBP) = ON; revisar TTL de invite (≤24h), reset (≤1h), OTP (5–10min)
- ~~Crear bucket privado `brief-documents`~~ ✓ existe en Supabase Storage (verificado sesión 9: privado, 50 MB, MIME=Any porque el backend ya filtra)
- ~~pg_cron job / VPS cron para `lifecycle/tick`~~ ✓ instalado en VPS (sesión 9, `* * * * *`); endpoint hace notifs + cleanup en una sola call (no necesita 2 entries)
- **Pre-existing advisor WARNs no introducidos por sesión 9** (no urgentes pero conviene cerrar): `function_search_path_mutable` en `set_updated_at` y `schedule_project_lifecycle_notifications`; `anon/authenticated_security_definer_function_executable` en `rls_auto_enable()`
- **Rotación de credenciales** (qué/cómo/cuándo): playbook completo en `CONTEXT.md` → "Credential Rotation Playbook". Cubre service role, anon key, DB password (con la espera de 20–30 s del Pooler), ImageKit, Resend, LIFECYCLE_CRON_SECRET, deploy keys. Aplicar tras cualquier exposición en chat/log/screenshot.
- **CAPTCHA en login/reset (mini-proyecto)**: login + password reset siguen yendo del frontend directo a Supabase Auth, así que los rate limits de Express NO los cubren. Cierra credential stuffing y reset spam. Stack recomendado: Cloudflare Turnstile (free, sin migrar DNS — usar el widget de Turnstile, no "Add a site"). Pasos: cuenta CF → Turnstile → Add site (dominios `webrief.app`, `localhost`) → Site Key + Secret Key → Supabase Dashboard → Attack Protection → Enable CAPTCHA + Turnstile + pegar Secret. Código: instalar `@marsidev/react-turnstile`, env `VITE_TURNSTILE_SITE_KEY`, agregar widget en `Login.jsx` (login + forgot) y `SetPassword.jsx`, pasar `captchaToken` en `signInWithPassword`/`resetPasswordForEmail`/`updateUser`. Detalle: si activás Supabase sin código frontend, login se rompe — coordinar deploy
- **Leaked Password Protection (HIBP)**: requiere Supabase Pro (US$25/mes). En Free tier el toggle existe pero el Save tira error. Mantener apagado hasta upgrade

## Pending

- richer deliverables UI beyond compact editor panel
- SEO changes (`seo_changed` event) as granular activity for page + article projects
- document-type activity (article has no sections — needs global change tracking or single-section treatment)
- FAQ activity: verify each Q+A section tracked correctly
- Create a separate Supabase Dev project before DB/schema experiments; do not test destructive SQL or schema changes against Supabase Prod first.

(Bugs FAQ pendientes movidos a la sección "Bugs FAQ aún sin resolver" arriba)
