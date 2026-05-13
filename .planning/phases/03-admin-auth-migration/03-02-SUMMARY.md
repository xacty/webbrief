---
phase: 03-admin-auth-migration
plan: 02
status: complete
---

# Plan 03-02 — AccountSettings + NewProject

## What changed

### AccountSettingsPage.jsx
- Replaced all manual `<input className={styles.input}>` with shared `<Input>`.
- Replaced manual `passwordWrap` + `eyeBtn` × 3 with `<Input type="password">` (built-in eye toggle).
- Replaced manual `primaryButton` / `secondaryButton` with shared `<Button>`. Avatar download buttons use `variant="secondary"` + `icon={<Download />}`.
- Wrapped each panel in `<Card as="section">`.
- Kept the native file-input as a `<label>` (cannot wrap a Button) — styled inline as `.fileInputLabel` (only place that retains a custom button-shaped element).
- Removed local `showCurrent/New/ConfirmPassword` state — now handled inside `<Input type="password">`.

### AccountSettingsPage.module.css
- Removed `.input`, `.passwordWrap`, `.eyeBtn`, `.primaryButton`, `.secondaryButton`, `.avatarSecondaryAction`, `.buttonIcon`, `.fieldLabel` — replaced by shared components.
- Tokenized all spacing / radius / typography / weight (no leftover hex literals — `#e8f5ff` and `#0f4c81` swapped for primary-100 / primary-900; `#fff` removed).

### NewProject.jsx
- Replaced project-name `<input>` with `<Input>`.
- Replaced 2 `<select>`s with `<Select>` (optgroups preserved as children — `<Select>` accepts JSX children including optgroups).
- Preview panel + form now use `<Card>` wrappers.
- Project-type label rendered as `<Badge variant="primary">` next to header.
- "Volver" + "Cancelar" use `<Button variant="ghost">` / `<Button variant="secondary">`.
- Document content rules grid uses `<Input type="number">` × 6.

### NewProject.module.css
- Removed `.input`, `.select`, `.primaryButton`, `.secondaryButton`, `.backButton` — replaced by shared components.
- Tokenized spacing / radius / weights.
- `#e8eef7` (page-block border) replaced with `var(--wb-border)`.

## Behavior preserved

- AccountSettings: `profileDirty` memo, signIn-with-current-password then updateUser, refreshUser({ force }), aria-live status messages.
- NewProject: `getDefaultCompanyId` auto-prefers non-internal company; `requestedCompanyId` from route query honored; per-company templates loaded for `page` + `brief`; document content rules conditional on `projectType === 'document'`; permission check `isAdmin(currentUser) || ['manager','editor'].includes(selectedCompanyRole)`.

## Per-cohort gates

- 0 hex / 0 raw `z-index:` in both CSS modules
- 0 `.input` / `.primaryButton` / `.secondaryButton` / `.modalOverlay` / `.eyeBtn` / `.passwordWrap` selectors
- Vite build: passes (AccountSettingsPage chunk 9.95 kB, NewProject 13.93 kB)

## Files modified

- `frontend/src/pages/AccountSettingsPage.jsx`
- `frontend/src/pages/AccountSettingsPage.module.css`
- `frontend/src/pages/NewProject.jsx`
- `frontend/src/pages/NewProject.module.css`

## Commit

`feat(03-02): migrate AccountSettings + NewProject to shared UI components`
