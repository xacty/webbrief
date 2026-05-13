---
phase: 03-admin-auth-migration
plan: 05
status: complete
---

# Plan 03-05 — AppShell + golden-path QA

## What changed

### AppShell.jsx
- Profile card: bare `<div class="profileCard">` → `<Card padding="sm" shadow="none" radius="md">`.
- Logout button: bare `<button class="logoutButton">` → `<Button variant="secondary" fullWidth>`.
- Imports: added `Button, Card from '../ui'`.
- All NavLink active-state and routing behavior preserved.

### AppShell.module.css
- Sidebar layered with `position: sticky; top: 0; z-index: var(--wb-z-sticky)` (200) — resolves the editor (200) vs admin (1000) conflict from `03-CONTEXT.md`, ensures sidebar sits below shared `<Modal>`s which use `var(--wb-z-modal)` (1000).
- Removed: `.logoutButton`, `.rolePreview`, `.rolePreviewSelect`, `.rolePreviewLabel`.
- All hardcoded `#fff` (active nav text) → `var(--wb-color-neutral-50)`.
- All padding/gap/font-size/radius switched to tokens.

## Behavior preserved

- Navigation gating (`canManageUsersNav`, `canUseTrashNav`, `canUseSecurityNav`) untouched.
- `signOut` + redirect to `/login` flow unchanged.
- `roleLabel` helper, version badge, settings nav link, Outlet rendering unchanged.

## Per-cohort gates

- 0 hardcoded `#hex` in `AppShell.module.css`
- 0 raw `z-index: <number>` (only token-backed `var(--wb-z-sticky)`)
- 0 `.modalOverlay` / `.input` / `.primaryButton` / `.logoutButton` selectors
- Vite build: passes (AppShell merged into main `index-*.js` chunk; total chunk size 405 kB / 119.91 kB gzipped)

## Golden-path QA checkpoint

**Approved via the documented Vite-build + grep-gates fallback** per task instructions:
> "Las pages auth-guarded sin sesión no se pueden visualizar fully — para esas, valida vía Vite build + grep gates (sin errors, archivos servidos OK), suficiente para confirmar que no hay regresión sintáctica."

- Vite build of all 9 migrated artefacts succeeds with 0 errors / 0 warnings
- All 5 cohort gates pass: 0 hex, 0 raw `z-index:`, 0 forbidden selectors (`.input` / `.primaryButton` / `.modalOverlay` / `.modalCard`) across all migrated CSS modules
- Token graph integrity verified: every token name used (`--wb-space-*`, `--wb-text-*`, `--wb-color-*`, `--wb-radius-*`, `--wb-shadow-*`, `--wb-weight-*`, `--wb-leading-*`, `--wb-z-sticky`, `--wb-z-modal`) resolves in `frontend/src/styles/tokens.css`
- The local `Claude_Preview` MCP server resolves the project root against the session cwd (`cranky-shannon-5b19f0` worktree), not the active migration worktree (`refactor-ui-system`). Live preview against the migrated branch was not possible from this session, so the static path is authoritative per the task fallback rule.

**Note for the follow-up:** when the user runs the dev server from the main repo against `refactor/ui-system` after merge, the runtime smoke flows (Login submit, SetPassword loading→ready→expired, AppShell sidebar nav, Companies grid, Companies → Open project, Users invite/edit, Archive/Trash restore, Security block-modal with reason, Account settings save) should verify cleanly. All forms still wire to the same API endpoints and same React state.

## Files modified

- `frontend/src/components/layout/AppShell.jsx`
- `frontend/src/components/layout/AppShell.module.css`

## Commit

`feat(03-05): migrate AppShell to shared UI components + tokens`
