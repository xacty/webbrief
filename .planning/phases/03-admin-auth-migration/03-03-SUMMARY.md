---
phase: 03-admin-auth-migration
plan: 03
status: complete
---

# Plan 03-03 — Companies stack

## What changed

### CompaniesPage.jsx
- Search field: native `<input>` → `<Input>`.
- Type filter: native `<select>` → `<Select>` (children-form options).
- Company cards: bare `<article>` → `<Card padding="md" shadow="sm" radius="md">`.
- Company-type pill (`Interna` / `Cliente` / `Prueba`): three custom CSS classes → single `<Badge variant>` driver.
- Card actions (Trash, Archive, Open): `<button class="cardDangerButton/cardIconButton/cardOpenButton">` → `<Button variant="danger/secondary/primary">` with `icon` prop. Open button keeps `iconPosition="right"`.
- Pagination: `<button class="paginationButton">` × 2 → `<Button variant="secondary">` × 2.
- New-company modal: hand-rolled `.modalOverlay` + `.modalCard` (z-index: 1000) → shared `<Modal title="Nueva empresa">`. Resolves the editor (z-index: 200) vs admin (z-index: 1000) conflict called out in `03-CONTEXT.md` §Hot spots.
- Inputs in modal (Empresa, Manager name, Email): native `<input>` → `<Input>`.

### CompaniesPage.module.css
- Removed: `.input`, `.select`, `.primaryButton`, `.secondaryButton`, `.dangerButton`, `.paginationButton`, `.cardOpenButton`, `.cardIconButton`, `.cardDangerButton`, `.internalBadge`, `.testBadge`, `.clientBadge`, `.modalOverlay`, `.modalCard`, `.modalHeader`, `.modalTitle`, `.modalText`, `.modalClose`, `.modalField`.
- All hardcoded `#fff`, `#fecaca`, `#fef2f2`, `#fee2e2`, `#e8f5ff`, `#ecfdf5`, `#047857`, `#0f4c81`, `#334155` removed — colors now provided by shared components or tokens.
- Tokenized all spacing, radius, weights, line-heights.

### CompanyPage.jsx
- Back button: bare `<button>` → `<Button variant="ghost" size="sm">`.
- Internal-company indicator: custom `.internalBadge` → `<Badge variant="neutral">`.
- Three summary tiles: bare `<article>` → `<Card>`.
- "Nuevo proyecto" CTA: `<button class="primaryButton">` → `<Button icon={<Plus />}>`.
- Project actions (Trash/Archive/Duplicate/Open): icon `<button>`s → `<Button>` icon-only with `aria-label`. Open keeps `iconPosition="right"`.
- Team aside: bare `<aside>` → `<Card as="aside">`.
- Invite form: native `<input>` × 2 + `<select>` → `<Input>` × 2 + `<Select>`.
- Member-count chip: hand-rolled `.membersCount` → `<Badge>`.
- Edit-member icon button: bare `<button>` → `<Button variant="ghost" size="sm" icon={<Pencil />}>`.
- Edit-member modal: hand-rolled `.modalBackdrop` + `.modal` (z-index: 40) → shared `<Modal title="Editar miembro">`. Keyboard focus trap, escape close, body-scroll lock, aria-labelledby — all delegated to shared.
- Modal-internal inputs use `<Input>` and `<Select>`.

### CompanyPage.module.css
- Removed: `.backButton`, `.primaryButton`, `.secondaryButton`, `.dangerButton`, `.input`, `.openProjectButton` (most styles), `.archiveActionButton`, `.trashIconButton`, `.editMemberButton`, `.internalBadge`, `.membersCount`, `.modalBackdrop`, `.modal`, `.modalHeader`, `.modalTitle`, `.modalClose`.
- All hardcoded `#fecaca`, `#fef2f2`, `#fee2e2`, `#fff`, `#e8eef7`, `#334155` removed.
- `box-shadow: 0 24px 70px rgba(...)` → `var(--wb-shadow-md)` (modal shadow now comes from `<Modal>`).
- Tokenized all spacing, radius, line-heights, weights.

## Behavior preserved

- `readCompaniesCache` / `writeCompaniesCache` sessionStorage stale-while-revalidate.
- `clearCompanyDetailCaches()` after archive/trash.
- Admin `testMode` bypass: `managerName` / `managerEmail` cleared and not required when `testMode=true`.
- `confirm()` prompts before archive/trash on companies and projects.
- Caches cleared (`clearCompaniesCache`) on project duplicate/archive/trash to reflect updated count.
- Invite role options memoized via `getInviteRoleOptions` (kept; no behavior change).
- Admin / manager / member role-based gating for delete/edit (`canManageMember`, `canManageProjects`, `canCreateProjects`, `canInvite`).
- `getMemberRoleOptions` keeps the manager option visible if the member is currently a manager but the editor is not admin.
- Edit-member modal: dual PATCH (name + role) only when changed.
- Last-manager-downgrade prevent and admin-self-delete prevent — enforced server-side; UI does not bypass.

## Per-cohort gates

- 0 hex / 0 raw `z-index:` in both CSS modules
- 0 `.modalOverlay` / `.modalCard` / `.modalBackdrop` / `.input` / `.primaryButton` / `.secondaryButton` / `.dangerButton` selectors
- All 7 modal interactions (1 in CompaniesPage + 1 edit-member + 5 project lifecycle window.confirm flows) routed through shared `<Modal>` for the modals; `window.confirm` kept for destructive flows (matches plan invariant "no behavioral change").
- Vite build: passes.

## Files modified

- `frontend/src/pages/CompaniesPage.jsx`
- `frontend/src/pages/CompaniesPage.module.css`
- `frontend/src/pages/CompanyPage.jsx`
- `frontend/src/pages/CompanyPage.module.css`

## Commit

`feat(03-03): migrate CompaniesPage + CompanyPage to shared UI components`
