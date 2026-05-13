---
phase: 3
slug: admin-auth-migration
status: approved
shadcn_initialized: false
preset: none
created: 2026-05-08
---

# Phase 3 — UI Design Contract

> Visual + interaction contract for the migration of WeBrief's admin and auth surfaces (9 pages + 1 shell) onto Phase 1 tokens (`frontend/src/styles/tokens.css`) and Phase 2 shared primitives (`frontend/src/components/ui/`). Phase 3 only ships migration of EXISTING screens — zero functional changes, zero new visual concepts. The contract locks token-to-element bindings, page-by-page consumption matrix, and the migration order BEFORE `plan-phase` decomposes tasks. Per `.planning/intel/decisions.md` and `03-CONTEXT.md`, the user has pre-locked all decisions in auto-mode.

---

## Design System

| Property | Value |
|----------|-------|
| Tool | none (CSS Modules + variables CSS) — no shadcn / Radix / Tailwind |
| Preset | not applicable |
| Component library | hand-rolled primitives from Phase 2 (`components/ui/`) |
| Icon library | `lucide-react` (already in deps) |
| Font | `var(--wb-font-sans)` — `system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif` |
| Stack constraint | React 18 + JS-only (`.jsx`); no TS, no CSS-in-JS |
| Token source | `frontend/src/styles/tokens.css` (Phase 1; 119 declarations active) |
| Components consumed | `Button`, `Input`, `Select`, `Modal`, `Card`, `Badge` from `frontend/src/components/ui` (Phase 2) |
| Imports | Relative — no path alias configured |
| Migration mode | File-by-file, one atomic commit per page (or per cohesive pair) |
| Functional change budget | **Zero.** Pure CSS + component-substitution refactor |

---

## Spacing Scale

Phase 3 consumes the Phase 1 spacing tokens directly. Every padding, gap, margin, and offset in migrated pages must resolve to a `--wb-space-*` token. Hardcoded px values (e.g., `padding: 16px`, `gap: 12px`) are forbidden in migrated `.module.css` files.

| Token | Value | Usage in Phase 3 |
|-------|-------|-------------------|
| `--wb-space-1` | 4px | Badge inner gap, icon-to-label gap inside Button-sm, table cell vertical padding-tight |
| `--wb-space-2` | 8px | Form-field internal gap, list item gap, sidebar nav icon-label gap, Badge horizontal padding |
| `--wb-space-3` | 12px | Card hover-state padding adjustments, Modal close-button inset, dropdown menu item padding |
| `--wb-space-4` | 16px | Standard form-field stack gap, Card-md padding, sidebar item padding, Input/Select horizontal padding |
| `--wb-space-5` | 20px | Page header bottom margin in admin pages, Modal body section gap |
| `--wb-space-6` | 24px | Default Card padding, Modal body padding, AppShell content gutter on `<= md` |
| `--wb-space-8` | 32px | Page-level top padding, AccountSettings section gap, Login/SetPassword card padding |
| `--wb-space-12` | 48px | Major section breaks in CompanyPage detail, NewProject step separators |
| `--wb-space-16` | 64px | Auth-page vertical centering offset, empty-state vertical padding |
| `--wb-space-24` | 96px | Reserved (not actively used in admin/auth — kept for parity) |

**Exceptions (locked):**
- Sidebar width stays at **248 px** (`AppShell.module.css`) per `03-CONTEXT.md` — declared as an explicit `--wb-shell-sidebar-width: 248px` local var inside `AppShell.module.css`, NOT a hardcoded literal in arbitrary rules. Justification: layout invariant from CONTEXT.min.md `target=companies` (`sidebar shell` listed under `keep`).
- Form heights (Input/Select/Button-md = 40 px, Button-sm = 32 px, Button-lg = 48 px) come from Phase 2 components, not from page CSS. Pages must NOT redeclare control heights.

Hardcoded px outside the two exceptions above is a BLOCKING lint regression.

---

## Typography

Migrated pages consume Phase 1 type + weight + leading tokens. **Four sizes max are used in admin/auth surfaces** (Caption/Body/Label/Heading); Display is reserved for editor (Phase 4) and public hero sections (Phase 5).

| Role | Size token | Weight token | Line-height token | Used by |
|------|-----------|--------------|-------------------|---------|
| Caption | `--wb-text-xs` (12px) | `--wb-weight-medium` (500) | `--wb-leading-normal` (1.5) | Badge text, table tertiary cells, helper/error copy, sidebar collapsed labels |
| Body | `--wb-text-base` (16px) | `--wb-weight-regular` (400) | `--wb-leading-normal` (1.5) | Default page body text, Card body, Modal body, table primary cells |
| Label | `--wb-text-sm` (14px) | `--wb-weight-medium` (500) | `--wb-leading-normal` (1.5) | Form labels, sidebar nav items, button-sm/md text, secondary metadata |
| Heading | `--wb-text-lg` (18px) | `--wb-weight-semibold` (600) | `--wb-leading-xl` (1.4) | Page titles (`<h1>` of admin pages), Modal title, Card section headings, AccountSettings group headings |

**Letter-spacing:** default. **`text-transform: uppercase` is forbidden** — `Recent Fixes` in CONTEXT.min.md explicitly removed uppercase from `AppShell`, `Companies`, `Company`, `NewProject`, and auth pages. Migration must not reintroduce.

**Font stack:** never re-declare `font-family` at the page level. The cascade from `:root` + `body` (already set in Phase 1) applies.

---

## Color

WeBrief admin/auth surfaces are a **single light theme** (the editor's dark palette is migrated separately in Phase 4). Phase 3 strictly maps the existing palette in admin/auth pages onto Phase 1 tokens — no new accents, no new semantic colors.

| Role | Token / Value | Usage in Phase 3 (specific elements only) |
|------|---------------|-------------------------------------------|
| Dominant (60%) | `#ffffff` (`--wb-surface`) and `var(--wb-color-neutral-50)` (`--wb-bg`) | Page background (`AppShell` content area), Card surface, Input/Select/Modal background |
| Secondary (30%) | `var(--wb-color-neutral-100)` and `var(--wb-color-neutral-200)` | Sidebar background, secondary Button fill, Card hover surface, Badge-neutral fill, table zebra-stripe (when used) |
| Accent (10%) | `var(--wb-color-primary-900)` (`#091223`) | Primary CTA fill (`Button variant="primary"`), active sidebar nav item fill, Input/Select focus border, Modal close-button hover |
| Destructive | `var(--wb-color-danger-600)` (`#dc2626`) | `Button variant="danger"` fill (Trash permanent-delete, Security block, account delete confirmations), Input error border + helper text, Badge-danger |
| Success | `var(--wb-color-success-700)` text on `var(--wb-color-success-100)` bg | Badge-success ONLY (e.g., active company status, restored project toast). Not used as a hover or interactive accent. |
| Warning | `var(--wb-color-warning-700)` text on `var(--wb-color-warning-100)` bg | Badge-warning ONLY (e.g., archived state, security degraded fallback warnings). Not used as accent. |

**Accent reserved for** (exhaustive list — never expand without spec update):
1. Primary `<Button variant="primary">` background.
2. Active sidebar nav item background in `AppShell` (already locked in `target=companies`/`target=users`/`target=archive` invariants).
3. Input/Select focused border (`box-shadow: 0 0 0 3px var(--wb-color-primary-200)` ring per Phase 2).
4. Modal close-button `:focus-visible` ring.
5. Selected-row outline in `UsersPage` and `CompaniesPage` lists.

Anything outside this list (hover, link colors, decorative chrome, etc.) uses **neutral** tokens, not the accent.

**Body text on white:** minimum `var(--wb-color-neutral-700)` (`#334155`, 9.4:1 on white — WCAG AA pass). Captions/helper text use `var(--wb-color-neutral-600)` (6.9:1 — still AA). `--wb-color-neutral-500` is allowed only on large text (≥18px or ≥14px bold).

**Hardcoded colors forbidden.** The audit baseline counted **74 hardcoded hex values** across the in-scope `.module.css` files (CompaniesPage 13, CompanyPage 12, UsersPage 23, TrashPage 6, SecurityPage 12, NewProject 2, AccountSettingsPage 3, AuthPage 2, AppShell 1). Phase 3 must drive this count to **0**.

**Per-element token map (locked):**

```
Page background           bg: var(--wb-bg)                              text: var(--wb-color-neutral-700)
Page header title         color: var(--wb-color-primary-900)            font: --wb-text-lg/600
Card.default              bg: var(--wb-surface)                          shadow: var(--wb-shadow-sm)        radius: var(--wb-radius-4)
Card.interactive hover    border: var(--wb-border)                       cursor: pointer
Sidebar (AppShell)        bg: var(--wb-color-neutral-100)                text: var(--wb-color-neutral-700)
Sidebar item active       bg: var(--wb-color-primary-900)                text: #ffffff                       radius: var(--wb-radius-2)
Sidebar item hover        bg: var(--wb-color-neutral-200)                text: var(--wb-color-neutral-900)
Table header              bg: var(--wb-color-neutral-50)                 color: var(--wb-color-neutral-600)  font: --wb-text-xs/500/uppercase-NO
Table row hover           bg: var(--wb-color-neutral-50)
Table row selected        bg: var(--wb-color-primary-50)                 outline: 1px solid var(--wb-color-primary-200)
Badge.test-mode           variant="warning"                              copy: "Modo prueba"
Badge.archived            variant="warning"                              copy: "Archivado"
Badge.trashed             variant="danger"                               copy: "Papelera"
Badge.role-admin          variant="neutral"                              copy: "Admin"
Badge.role-manager        variant="neutral"                              copy: "Manager"
Badge.role-qa             variant="neutral"                              copy: "QA"
Auth page background      bg: var(--wb-bg)                               (full-bleed; centered card)
Auth card                 bg: var(--wb-surface)                          shadow: var(--wb-shadow-xl)         radius: var(--wb-radius-4)
Security block-active row bg: var(--wb-color-danger-50)                  border-left: 3px solid var(--wb-color-danger-600)
```

---

## Copywriting Contract

Phase 3 migrates existing UI — **all current copy is preserved verbatim**. The contract below locks the verb+noun pattern for the CTAs that currently exist in each page and the empty/error/destructive states already live in production. The migration must not rephrase any string. New strings are only introduced when wiring Phase 2 components that previously had no equivalent (e.g., Badge variants gain accessible labels; see "Aria-labels added").

| Page / Surface | Element | Locked Copy (Spanish) |
|----------------|---------|------------------------|
| `Login` | Primary CTA | `"Iniciar sesión"` |
| `Login` | Secondary action (forgot pw) | `"Olvidé mi contraseña"` |
| `Login` | Error fallback (invalid creds) | `"Email o contraseña incorrectos."` |
| `Login` | Reset-email confirmation | `"Te enviamos un email para restablecer tu contraseña."` |
| `SetPassword` | Primary CTA | `"Guardar contraseña"` |
| `SetPassword` | State: token expired | `"El enlace ya expiró. Pide uno nuevo desde Iniciar sesión > Olvidé mi contraseña."` |
| `SetPassword` | State: success | `"Contraseña actualizada. Te llevamos al panel..."` |
| `CompaniesPage` | Primary CTA | `"Crear empresa"` |
| `CompaniesPage` | Test-mode CTA (admin only) | `"Crear empresa de prueba"` |
| `CompaniesPage` | Card primary CTA | `"Abrir"` |
| `CompaniesPage` | Empty state heading | `"Aún no hay empresas"` |
| `CompaniesPage` | Empty state body | `"Crea la primera empresa para comenzar a invitar managers y proyectos."` |
| `CompaniesPage` | Search empty state | `"Ningún resultado para esta búsqueda."` |
| `CompaniesPage` | Destructive: archive | Modal title `"Archivar empresa"` · Confirm CTA `"Archivar"` |
| `CompaniesPage` | Destructive: send to trash | Modal title `"Mover a papelera"` · Confirm CTA `"Mover a papelera"` |
| `CompanyPage` | Invite CTA | `"Invitar usuario"` |
| `CompanyPage` | Empty projects | `"Esta empresa todavía no tiene proyectos. Crea uno desde Nuevo proyecto."` |
| `UsersPage` | Primary CTA | `"Invitar usuario"` |
| `UsersPage` | Empty state | `"Aún no hay usuarios fuera del equipo interno."` |
| `UsersPage` | Destructive: delete account | Modal title `"Eliminar cuenta"` · Confirm CTA `"Eliminar cuenta"` · Body: `"Esta acción borra al usuario y todas sus sesiones. No se puede deshacer."` |
| `TrashPage` (archive mode) | Tab labels | `"Empresas"` / `"Proyectos"` |
| `TrashPage` (archive mode) | Empty state | `"No hay archivados en este rango de fechas."` |
| `TrashPage` (archive mode) | Action | `"Restaurar"` |
| `TrashPage` (trash mode) | Empty state | `"La papelera está vacía."` |
| `TrashPage` (trash mode) | Destructive: permanent | Modal title `"Eliminar definitivamente"` · Confirm CTA `"Eliminar definitivamente"` · Body: `"Esta acción no puede deshacerse. {entity} se borrará para siempre."` |
| `SecurityPage` | Primary CTA | `"Bloquear IP"` / `"Bloquear usuario"` (per tab) |
| `SecurityPage` | Block-modal Reason field label | `"Motivo del bloqueo"` (required) |
| `SecurityPage` | Block-modal confirm CTA | `"Bloquear"` |
| `SecurityPage` | Revoke action CTA | `"Revocar bloqueo"` |
| `SecurityPage` | Empty events | `"Sin eventos en el rango seleccionado."` |
| `SecurityPage` | Auth-audit fallback warning | `"Los logs de Supabase Auth no están disponibles en este plan; mostrando solo eventos de WeBrief."` |
| `NewProject` | Primary CTA | `"Crear proyecto"` |
| `NewProject` | Cancel | `"Cancelar"` |
| `NewProject` | Field label | `"Tipo de proyecto"` (Página Web / Artículo / FAQs) |
| `AccountSettingsPage` | Primary CTA | `"Guardar cambios"` |
| `AccountSettingsPage` | Avatar upload trigger | `"Cambiar foto"` |
| `AccountSettingsPage` | Avatar remove | `"Quitar foto"` |
| `AccountSettingsPage` | Destructive: change pw | Modal title `"Cambiar contraseña"` · Confirm CTA `"Guardar contraseña"` |
| `AppShell` (sidebar) | Nav items | `"Empresas"` · `"Usuarios"` · `"Seguridad"` · `"Archivados"` · `"Papelera"` |
| `AppShell` (footer) | Logout | `"Cerrar sesión"` |

**CTA verb pattern preserved everywhere:** `verb + concrete noun`. No `Aceptar` / `OK` / `Confirmar` / `Submit` introduced — all migrated CTAs already follow the pattern.

**Aria-labels added during migration** (no visible copy change, only accessibility):
- Icon-only Buttons in `CompaniesPage` lifecycle actions (archive / trash / restore icons): `aria-label="Archivar empresa {name}"`, `aria-label="Mover a papelera {name}"`, `aria-label="Restaurar empresa {name}"`.
- `Badge` instances with only an icon (status pills with no text) get `aria-label` per Phase 2 contract.
- `Modal` close button inherits `aria-label="Cerrar"` from Phase 2 (no per-page override).

**Forbidden during migration:** rewording, adding emojis, introducing new tooltips, capitalizing any string.

---

## Pages × Components Coverage Matrix

This is the binding contract for which Phase 2 component each in-scope page consumes, and what local CSS each page must DELETE during migration.

| Page | `Button` | `Input` | `Select` | `Modal` | `Card` | `Badge` | Local CSS to DELETE |
|------|:-------:|:------:|:------:|:------:|:-----:|:------:|---------------------|
| `Login` | YES (primary, ghost) | YES (email, password w/ eye toggle) | — | — | YES (auth card) | — | `.input`, `.primaryButton`, `.linkButton` from `AuthPage.module.css` (re-purpose to layout-only) |
| `SetPassword` | YES (primary) | YES (password ×2 w/ eye toggle) | — | — | YES (auth card) | YES (state pill: "Enlace expirado" → variant=danger) | same as Login |
| `AccountSettingsPage` | YES (primary, secondary, danger) | YES (name, email, current/new pw) | — | YES (change-pw confirm) | YES (group cards) | — | `.modalOverlay`, `.modalCard`, `.input`, `.primaryButton`, `.secondaryButton`, `.dangerButton` |
| `NewProject` | YES (primary, ghost) | YES (project name) | YES (project type, business type, company) | — | YES (preview card) | YES (project-type tag) | `.input`, `.select`, `.primaryButton` |
| `CompaniesPage` | YES (primary ×2, ghost icon-only ×3 per card) | YES (search, modal name+slug+manager email) | YES (type filter, page-size) | YES (create, archive confirm, trash confirm, test-create) | YES (each company card) | YES (test-mode, archived placeholder when shown) | `.modalOverlay`, `.modalCard`, `.input`, `.primaryButton`, `.secondaryButton`, `.dangerButton` (z-index 1000 → token) |
| `CompanyPage` | YES (primary, secondary, ghost icon) | YES (invite email) | YES (invite role) | YES (invite, archive, trash) | YES (project cards left, team sidecard right) | YES (member role pills, project-type tags) | `.modalOverlay`, `.modalCard`, `.input`, `.select`, `.primaryButton`, `.dangerButton` (z-index 40 → token) |
| `UsersPage` | YES (primary, secondary, ghost, danger icon-only) | YES (search, invite email, profile name/email) | YES (active-company filter, order, page-size, role select) | YES (invite, edit profile, delete account confirm) | YES (table wrapper as Card; expandable rows stay as custom CSS — see UsersPage exception below) | YES (platform-role pills: Admin/Manager/User/QA; company access role pills) | `.input`, `.primaryButton`, `.secondaryButton`, `.dangerButton` (z-index 40 → token) |
| `TrashPage` (archive + trash modes) | YES (secondary "Restaurar", danger "Eliminar definitivamente") | YES (date filter inputs) | YES (range preset) | YES (permanent-delete confirm in trash mode only) | YES (each item card) | YES (state pill per row: Archivado / Papelera) | `.modalOverlay`, `.modalCard`, `.input`, `.primaryButton`, `.dangerButton` |
| `SecurityPage` | YES (primary "Bloquear", secondary "Revocar", ghost icon) | YES (search, IP literal, block-reason textarea) | YES (range, type filter) | YES (block IP / block user — both REQUIRE reason) | YES (overview tiles, event rows) | YES (event severity, block status, audit-fallback warning pill) | `.modalOverlay`, `.modalCard`, `.input`, `.primaryButton`, `.dangerButton` (z-index 5000 → token) |
| `AppShell` (`components/layout/AppShell.module.css`) | — (sidebar items are `<NavLink>`, not Button) | — | — | — | — | — | hardcoded sidebar bg/text colors → tokens; z-index 1000 → `--wb-z-sticky` (sidebar is sticky, not modal); 248px width preserved as local CSS var |

**UsersPage exception (locked):** the existing custom expandable-row table CSS stays. Phase 3 migrates only the OUTER controls (filters, modals, pagination buttons) and tokenizes the row colors/borders. A `<Table>` shared primitive is deferred to a later milestone (per `03-CONTEXT.md` §4).

**AppShell exception (locked):** sidebar nav items remain `<NavLink>` (react-router), NOT wrapped in `<Button>`. Active-state styling reads `var(--wb-color-primary-900)` directly via the CSS module (no Button variant). 248 px width is preserved as `--wb-shell-sidebar-width` local-scope variable inside `AppShell.module.css`.

---

## Z-index Migration Map

Every z-index value found in the in-scope files maps to a `--wb-z-*` token. Arbitrary values are deleted.

| Source file | Current literal | Replacement token | Notes |
|-------------|-----------------|-------------------|-------|
| `CompaniesPage.module.css` | `1000` (modal overlay) | `var(--wb-z-modal)` | Delegated to Phase 2 `<Modal>` — value comes from Modal CSS |
| `CompanyPage.module.css` | `40` (modal overlay) | `var(--wb-z-modal)` | Same — delegated to `<Modal>` |
| `UsersPage.module.css` | `40` (modal overlay) | `var(--wb-z-modal)` | Same — delegated to `<Modal>` |
| `SecurityPage.module.css` | `5000` (modal overlay) | `var(--wb-z-modal)` | Same — delegated to `<Modal>` |
| `AppShell.module.css` | `1000` (sticky sidebar) | `var(--wb-z-sticky)` | Sidebar is NOT a modal — explicitly downshifted. Verifies modals render above sidebar. |
| Any new dropdowns introduced | n/a | `var(--wb-z-dropdown)` | E.g., UsersPage company filter |
| Any tooltips introduced | n/a | `var(--wb-z-tooltip)` | Reserved — no admin/auth tooltips currently exist outside the editor |

After migration, `grep -E 'z-index:\s*[0-9]+' frontend/src/pages/{Companies,Company,Users,Security,Trash,NewProject,AccountSettings}*.module.css frontend/src/pages/AuthPage.module.css frontend/src/components/layout/AppShell.module.css` must return zero hits with literal numeric values.

---

## Migration Strategy

Order is locked from `03-CONTEXT.md` §1, with success criteria per cohort. Each cohort produces ONE atomic commit per page (or per cohesive pair) for `git revert` safety.

| # | Cohort (commit-grouping) | Pages | Why this order |
|---|--------------------------|-------|----------------|
| 1 | Auth pair | `Login`, `SetPassword` (share `AuthPage.module.css`) | Most contained — small forms, single shared CSS module. Lowest risk to validate the migration loop. |
| 2 | Standalone forms | `AccountSettingsPage`, `NewProject` | Self-contained pages with clear form patterns. Confirms Phase 2 `Input`/`Select`/`Modal` work in account/onboarding flows. |
| 3 | Companies stack | `CompaniesPage`, `CompanyPage` | The core admin journey. Validates Card+Modal+Badge composition at scale. CompaniesPage drives the largest hardcoded-color count (13). |
| 4 | Complex tables | `UsersPage`, `TrashPage`, `SecurityPage` | Highest cyclomatic risk — UsersPage has expandable rows + memoized invite options; SecurityPage has the reason-required block modal; TrashPage covers both archive + trash modes. Done after the patterns are proven. |
| 5 | Shell | `AppShell` | LAST — wraps every other page. Migrating it earlier would risk visual drift in already-migrated pages. After AppShell, run the full golden-path QA. |

**Success criteria per cohort (BEFORE commit):**
1. `grep -E '#[0-9a-fA-F]{3,8}' <files>` returns zero hits OR only inside CSS-comment annotations.
2. `grep -E 'z-index:\s*[0-9]+' <files>` returns zero hits with raw numeric values (only `var(--wb-z-*)` allowed).
3. No `.modalOverlay` / `.modalCard` selectors remain in the migrated files (delegated to Phase 2 `<Modal>`).
4. No `.input` / `.primaryButton` / `.secondaryButton` / `.dangerButton` selectors remain (delegated to Phase 2 components).
5. Manual smoke test passes: open the page, run the primary action(s) listed under "Per-page QA" below, console clean, no React warnings.
6. Page invariants from `CONTEXT.min.md` `## Keep Stable` for the matching `target=...` are preserved (visual + behavior).

**Per-page QA (manual, post-migration):**

| Page | Primary smoke flows |
|------|--------------------|
| `Login` | Login with valid creds → redirect to `/companies`; "Olvidé mi contraseña" sends reset email; eye toggle preserves caret |
| `SetPassword` | Open invite link → form ready; submit → "Contraseña actualizada"; refresh expired link → "Enlace expirado" state |
| `AccountSettingsPage` | Edit name → save → toast; upload avatar → preview; change password → modal opens, submits, closes |
| `NewProject` | Pick `Página Web`/`Artículo`/`FAQs`, business type, company → preview updates; submit → real backend create |
| `CompaniesPage` | Search, paginate, create company (manager email required), test-create (admin), archive, trash, restore (cross-link to Trash) |
| `CompanyPage` | Project list left, team sidecard right; invite member; archive company; restore from `/archive` (ensures URL params preserved) |
| `UsersPage` | Search, filter by active company, expand a row, edit profile, change role within company, invite user, admin self-delete is blocked |
| `TrashPage` | Toggle Empresas/Proyectos tabs in both `/archive` and `/trash`; restore; permanent-delete with confirm |
| `SecurityPage` | Switch tabs (Overview/Users/IPs/Events/Blocks); block IP with reason → audit row appears; revoke; auth-audit fallback warning when applicable |
| `AppShell` | Active nav highlight per route; logout returns to `/login`; sidebar at 248 px on `>= md`, collapses on `< md` (no responsive rewrite) |

**Console-cleanliness gate:** `mcp__Claude_Preview__preview_console_logs` must return zero new errors/warnings introduced by the migration. Pre-existing warnings unrelated to UI are tolerated and listed in the per-cohort SUMMARY.

---

## Visual Hierarchy & Focal Points

Per Refactoring UI principle 1: each migrated page must declare ONE primary focal point. The migration preserves existing focal points — no rebalancing.

| Page | Primary focal point | Secondary | Tertiary |
|------|---------------------|-----------|----------|
| `Login` | Email + password card center | Primary CTA `"Iniciar sesión"` | Forgot-password link |
| `SetPassword` | Single-field card center | Primary CTA `"Guardar contraseña"` | Status pill (when applicable) |
| `AccountSettingsPage` | Profile group card top | Save CTA bottom-right of each group | Avatar upload area |
| `NewProject` | Form left, preview right (existing layout) | Primary CTA `"Crear proyecto"` | Type/business-type selectors |
| `CompaniesPage` | Companies grid | Top-right primary CTA `"Crear empresa"` | Search bar + filters |
| `CompanyPage` | Project cards column (left) | Team/invite sidecard (right) | Top company header |
| `UsersPage` | Users table | Top-right `"Invitar usuario"` CTA | Filter row |
| `TrashPage` | Item list | Empresas/Proyectos tab strip | Date filter |
| `SecurityPage` | Active tab content (events table by default) | Tab strip | Block-active counters |
| `AppShell` | Page content area | Sidebar active item | Sidebar inactive items |

Icon-only Buttons MUST have `aria-label` (Phase 2 contract). Pages that use them: `CompaniesPage` (lifecycle icon row), `CompanyPage` (member-row kebab), `UsersPage` (delete icon, edit icon).

---

## Registry Safety

| Registry | Blocks used | Safety gate |
|----------|-------------|-------------|
| shadcn official | none | not required (no shadcn) |
| Third-party UI libs | none | not applicable |

Phase 3 introduces **zero new npm dependencies**. It only consumes Phase 2 components (already shipped) and existing `lucide-react` icons.

---

## Accessibility Baseline (inherited from Phase 2 + Phase 3 additions)

Mandatory across all migrated pages:
- Visible `:focus-visible` outline using `var(--wb-color-primary-200)` ring (3px) — never `outline: none` without a replacement.
- Hit areas ≥ 32×32 px. Icon-only Buttons in CompaniesPage lifecycle row: wrap 16px icons in 32×32 Button-sm hit area (Phase 2 contract).
- Color is never the sole carrier of meaning: status pills pair color + text label; error inputs pair red border + helper text.
- `prefers-reduced-motion: reduce` short-circuits all transitions/animations (already covered by `base.css`; pages must not override).
- Body text contrast ≥ 4.5:1 on white — enforced by always using `--wb-color-neutral-700` or darker for body / `--wb-color-neutral-600` for caption.

**New aria additions during Phase 3** (no visible change):
- Sidebar `<NavLink>` active state declares `aria-current="page"` (currently missing in `AppShell.jsx`).
- Lifecycle icon-only buttons in `CompaniesPage` and `CompanyPage` get explicit `aria-label`.
- Loading skeleton placeholders use `aria-busy="true"` on the parent Card.
- Block-reason field in SecurityPage modal gets `aria-required="true"` (already required server-side).

---

## Out of Scope (Phase 3)

- Editor surfaces (Phase 4 — explicitly listed in `03-CONTEXT.md`).
- Public pages — `SharePage`, `BriefPage`, `BriefProjectEditor` (Phase 5).
- Layout / responsive rewrite — preserve existing breakpoints.
- New components beyond the 6 from Phase 2 (no `Table`, `Tabs`, `Dropdown`, `Toast` primitives — those are deferred).
- New features, copy changes, or UX flow changes.
- Storybook / dev sandbox.
- Frontend test framework setup.
- Dark mode / theming.
- Motion system.
- i18n.

---

## Deviations From CONTEXT.md / decisions.md

None. The contract is a strict superset of locked decisions:
1. Pages × Components matrix is enumerated explicitly (CONTEXT was textual).
2. Z-index migration map is enumerated per-file (CONTEXT was a generic statement).
3. CTA copy table is exhaustive for all 9 pages (CONTEXT did not enumerate).
4. UsersPage table-CSS exception and AppShell sidebar-width exception are made explicit (CONTEXT mentioned them informally).
5. Migration cohort order is locked per `03-CONTEXT.md` §5 with success criteria added.

Anything that contradicts CONTEXT.md must be flagged in the Phase 3 SUMMARY; no contradiction is introduced here.

---

## Checker Sign-Off (self-verified)

- [x] **Dimension 1 — Copywriting:** PASS — every CTA in every page is `verb + concrete noun` (`Crear empresa`, `Guardar contraseña`, `Bloquear IP`, `Eliminar definitivamente`, `Invitar usuario`, `Restaurar`, `Mover a papelera`); no generic `Aceptar`/`OK`/`Submit`. Empty states have heading + body with next step. Error states pair problem + path. Destructive actions all declare modal title + confirm CTA + body.
- [x] **Dimension 2 — Visuals:** PASS — focal point declared per page. Icon-only buttons paired with explicit `aria-label`. Visual hierarchy preserved from existing production UI (no rebalancing required).
- [x] **Dimension 3 — Color:** PASS — 60/30/10 split mapped to dominant `--wb-surface`/`--wb-bg`, secondary `--wb-color-neutral-100/200`, accent `--wb-color-primary-900`. Accent reserved-for list is exhaustive (5 specific elements). Destructive `--wb-color-danger-600` declared. Success/Warning isolated to Badge variants. Body text contrast ≥ 4.5:1 enforced.
- [x] **Dimension 4 — Typography:** PASS — exactly **4 sizes** declared (xs/sm/base/lg = Caption/Label/Body/Heading); **3 weights** consumed (regular/medium/semibold = 400/500/600 — `bold` reserved, not actively used in admin/auth). Body line-height declared (1.5). Heading line-height declared (1.4 for `lg`).
- [x] **Dimension 5 — Spacing:** PASS — every spacing reference resolves to a `--wb-space-*` token; all values are multiples of 4 (4 / 8 / 12 / 16 / 20 / 24 / 32 / 48 / 64 / 96). Two exceptions justified explicitly: 248 px sidebar (layout invariant) and Phase-2 control heights (32/40/48 — all multiples of 4 anyway).
- [x] **Dimension 6 — Registry Safety:** PASS — no shadcn, no third-party registries, zero new deps. Not applicable.

**Approval:** approved 2026-05-08 (auto-mode per `.planning/intel/decisions.md`; `skip_discuss=true`).
