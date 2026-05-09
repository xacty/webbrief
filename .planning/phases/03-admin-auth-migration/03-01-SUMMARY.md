---
phase: 03-admin-auth-migration
plan: 01
status: complete
---

# Plan 03-01 — Auth pair migration

## What changed

- `Login.jsx`: replaced manual form (`<input class={styles.input}>`, manual eye-toggle, raw `<button>`s) with shared `<Card>`, `<Input>`, `<Button>`. The "Olvidé mi contraseña" toggle now uses `<Button variant="ghost">`.
- `SetPassword.jsx`: replaced manual form + custom passwordWrap/eyeBtn with `<Input type="password">` (built-in eye toggle). Expired-state now renders a `<Badge variant="danger">Expirado</Badge>` next to the subtitle and the "Ir al inicio de sesión" CTA is a `<Button>` (was an `<a>` styled like a button).
- `AuthPage.module.css`: reduced from 151 to 73 lines. Now layout + typography + status-message colors only. Removed: `.input`, `.passwordWrap`, `.eyeBtn`, `.button`, `.textButton`, `.label`, `.field`. Added: `.subtitleRow` for the badge layout in expired state.

## Behavior preserved

- Supabase `signInWithPassword` flow + redirect to `/dashboard`
- `resetPasswordForEmail` flow with `redirectTo: ${origin}/auth/set-password`
- `onAuthStateChange` + `getSession` for invite/reset detection (loading → ready → expired states)
- 5s expired-timer fallback
- `refreshUser({ force: true })` after password update + redirect to `/companies`

## Per-cohort gates

- 0 hardcoded `#hex` in `AuthPage.module.css`
- 0 raw `z-index:` declarations
- 0 `.input` / `.primaryButton` / `.linkButton` / `.modalOverlay` selectors
- Vite build smoke: passes (Login chunk 2.07 kB, SetPassword 3.50 kB)

## Files modified

- `frontend/src/pages/Login.jsx`
- `frontend/src/pages/SetPassword.jsx`
- `frontend/src/pages/AuthPage.module.css`

## Commit

`feat(03-01): migrate Login + SetPassword to shared UI components`
