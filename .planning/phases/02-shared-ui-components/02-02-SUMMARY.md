---
phase: 02-shared-ui-components
plan: 02
status: complete
date: 2026-05-08
---

# Plan 02-02 Summary — Button + Badge

## What was built

- **Button**: 4 variants (primary, secondary, ghost, danger) × 3 sizes (sm/md/lg). Loading state uses Loader2 spinner with absolute overlay so width stays stable. Forward ref to underlying `<button>`. Icon-only buttons console.warn when no aria-label.
- **Badge**: 4 variants (neutral, success, warning, danger) × 2 sizes (sm/md). Pure presentational, no role="status" by default, no forwardRef per UI-SPEC §6.

## Files created

- `frontend/src/components/ui/Button.jsx` (~90 lines, forwardRef)
- `frontend/src/components/ui/Button.module.css` (token-only colors; height tokens 32/40/48 via documented arithmetic)
- `frontend/src/components/ui/Badge.jsx` (~30 lines, plain function)
- `frontend/src/components/ui/Badge.module.css` (zero raw hex; pill via `--wb-radius-full`)

## Verification

- All 4 files exist
- Button.jsx: forwardRef, Loader2, cn import, "Cargando…" SR-only label
- Button.module.css: variant_{primary,secondary,ghost,danger}, size_{sm,md,lg}, all primary/danger/neutral tokens referenced; @keyframes spin; prefers-reduced-motion; only `#ffffff` raw hex for primary/danger text per UI-SPEC
- Badge.jsx: cn import, no forwardRef, icon slot wrapped in `<span aria-hidden="true">`
- Badge.module.css: 4 variant rules, 2 size rules, `var(--wb-radius-full)`, `var(--wb-text-xs)`, zero raw hex
- `text-transform: uppercase` absent in both modules

## Notes

- Button `loading` implies `disabled` on the rendered `<button>`. Spinner is positioned absolutely; `.label` becomes `visibility: hidden`. Both width-stable.
- Disabled hover uses `:not(:disabled):hover` selector so disabled state's opacity doesn't get overridden.
- Both components import `cn` from `./cn.js` — Plan 02-01 dependency satisfied.
- No edits to Phase 1 artifacts.
