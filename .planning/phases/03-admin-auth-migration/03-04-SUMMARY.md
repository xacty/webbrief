---
phase: 03-admin-auth-migration
plan: 04
status: complete
---

# Plan 03-04 — UsersPage + TrashPage + SecurityPage

## What changed

### UsersPage.jsx
- Invite panel: native `<input>` × 2 + 4 `<select>`s → shared `<Input>` × 2 + `<Select>` × 4 (admin Plataforma/empresa/rol-empresa).
- Toolbar: search `<input>`, company filter `<select>`, sort `<select>` → `<Input>`/`<Select>`.
- Table actions:
  - Expand row trigger: bare `<button>` → `<Button variant="ghost" size="sm" icon={<ChevronDown/Right>}>`.
  - Edit/delete row icons: bare `<button>` → `<Button variant="ghost|danger" size="sm" icon>`.
- Admin/QA/user platform-role chips: hand-rolled `.adminBadge/.qaBadge/.userBadge` → single `<Badge variant>` driver.
- Company-access pills (incl. "+N more"): hand-rolled `.companyPill/.countPill/.globalPill` → `<Badge>`.
- Per-row membership role select + remove: native `<select>` + `<button>` → `<Select>` + `<Button variant="danger" icon>`.
- "Solicitar baja" CTA → `<Button variant="secondary">`.
- Edit-user modal: hand-rolled backdrop+card → shared `<Modal title="Editar usuario" size="lg">`. Avatar download buttons now `<Button variant="secondary" icon={<Download/>}>`.
- Pagination: `<button class="paginationButton">` × 2 → `<Button variant="secondary">` × 2.

### UsersPage.module.css
- Removed: `.input`, `.select`, `.roleSelect`, `.primaryButton`, `.secondaryButton`, `.tertiaryButton`, `.dangerButton`, `.iconButton`, `.iconDangerButton`, `.rowActionButton`, `.rowDangerButton`, `.expandButton`, `.paginationButton`, `.adminBadge`, `.qaBadge`, `.userBadge`, `.companyPill`, `.countPill`, `.globalPill`, `.membershipBadge`, `.modalBackdrop`, `.modal`.
- Removed `.userCard` family (legacy mobile fallback) — table-only layout retained.
- All hardcoded `#fef2f2`/`#fee2e2`/`#fecaca`/`#e8f5ff`/`#0f4c81`/`#ecfdf5`/`#047857`/`#fff`/`#334155` replaced by tokens or component variants.
- Custom `.fileInputLabel` retained — only place native `<input type=file>` cannot be wrapped in `<Button>`.

### TrashPage.jsx
- Card: bare `<article>` → `<Card padding="md" shadow="sm">`.
- Mode badge: hand-rolled `.archivedBadge/.trashedBadge` → `<Badge variant="danger|neutral">`.
- Restore + delete CTAs: bare `<button class="primaryButton/dangerButton">` → `<Button variant="primary|danger">`.
- Refresh button: `<Button variant="secondary" icon={<RefreshCw>}>`. Spin animation preserved via local `.refreshIconLoading` keyframe (animation belongs to the icon, not Button).
- Date filter: native `<select>` → `<Select>` (kept `fullWidth={false}` so it sits next to refresh).
- Tabs (Empresas/Proyectos): kept native `role="tablist"` + bespoke `.tabButton` because the shared `<Button>` does not implement `role="tab"` keyboard semantics; this matches the plan invariant "no behavioral change" — preserves Arrow/Home/End keyboard nav, focus-management via `requestAnimationFrame`, and `aria-selected/aria-controls`.

### TrashPage.module.css
- Removed: `.input`, `.select`, `.primaryButton`, `.secondaryButton`, `.dangerButton`, `.tertiaryButton`, `.archivedBadge`, `.trashedBadge`, `.dateFilter` legacy label.
- Tokenized all spacing / radius / shadow / colors. `.tabButton` retained (intentional bespoke tablist).

### SecurityPage.jsx
- KPI cards: `<div class="kpiCard">` → `<Card padding="md" shadow="sm" radius="md">`.
- Two table panels: `<section class="panel">` → `<Card as="section" padding="md" shadow="sm">`.
- Filters bar: native `<select>` × 2 + `<input>` → `<Select>` × 2 + `<Input>`.
- Status badges (`Activo`/`Bloqueado`/`Bloqueada`/`Activa` / event outcome / source): hand-rolled `.badgeOk/.badgeDanger/.sourceBadge` → `<Badge variant="success|danger|neutral">`.
- Block/unblock action buttons: bare `<button class="textButton">` → `<Button variant="ghost" size="sm">`.
- Refresh button: `<Button variant="secondary" icon={<RefreshCw>}>`.
- Block modal: hand-rolled `.modalBackdrop` (z-index: 5000) + `.modal` form → shared `<Modal title>` (size="md"). Reason textarea kept as native `<textarea>` (no `<Textarea>` component in Phase 2 surface) — wrapped in `.fieldGroup` with explicit label and tokenized focus ring. Block submit stays disabled until reason non-empty (`disabled={busy === 'block' || !blockReason.trim()}`).

### SecurityPage.module.css
- Removed: `.modalBackdrop`, `.modal` (delegated to shared Modal), `.textButton`, `.secondaryButton`, `.dangerButton`, `.badgeOk`, `.badgeDanger`, `.sourceBadge`.
- All hardcoded warning palette (`#fed7aa`, `#fff7ed`, `#9a3412`) → `var(--wb-color-warning-300/50/700)`.
- Danger palette (`#fecaca`, `#fef2f2`, `#fff7f7`) → `var(--wb-color-danger-200/50)` etc.
- Success palette (`#ecfdf5`, `#047857`) → handled inside `<Badge variant="success">`.

## Behavior preserved

- UsersPage: `inviteRoleOptions` memoized; admin self-delete check (`isAdminUser && user.id !== currentUser?.id`); last-manager-downgrade and admin-self-delete prevents are server-enforced — UI does not bypass; `request-removal` flow for shared-membership users; `canEditUser` / `canManageMembership` / `getMemberRoleOptions` rules unchanged; window.confirm prompts retained for delete user / remove membership; `Promise.all` parallel load preserved.
- TrashPage: sessionStorage `webrief:companies` + `webrief:company:*` cleared after restore + permanent-delete; per-mode endpoint routing (`/companies/:id/restore` vs `/projects/:id/restore`); permanent-delete only available for admin in trashed mode; tablist keyboard nav (Arrow/Home/End/Tab) untouched.
- SecurityPage: `Promise.all` 4-call dashboard load; reason required (`required` + `disabled` until non-empty trim); `expiresAt` optional; revoke confirmation via single button; warnings `Set` dedup; block modal cleared on close.

## Per-cohort gates

- 0 hex / 0 raw `z-index:` in any of the 3 CSS modules.
- 0 forbidden selectors except documented exceptions: `.tabButton` (TrashPage tablist — bespoke ARIA component), `.fileInputLabel` (UsersPage — native input wrapping limitation).
- Vite build passes (UsersPage chunk 20.89 kB — was 23.64 kB before; SecurityPage 11.34 kB; TrashPage 8.6 kB).

## Files modified

- `frontend/src/pages/UsersPage.jsx`
- `frontend/src/pages/UsersPage.module.css`
- `frontend/src/pages/TrashPage.jsx`
- `frontend/src/pages/TrashPage.module.css`
- `frontend/src/pages/SecurityPage.jsx`
- `frontend/src/pages/SecurityPage.module.css`

## Commit

`feat(03-04): migrate UsersPage + TrashPage + SecurityPage to shared UI components`
