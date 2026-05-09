---
phase: 02-shared-ui-components
plan: 03
status: complete
date: 2026-05-08
---

# Plan 02-03 Summary — Input + Select

## What was built

- **Input**: 7 supported types (text/email/password/number/search/tel/url). Label + input + helper/error wired via `useId()` and `aria-describedby`. Password type renders eye toggle (Eye/EyeOff lucide-react) on the right; `onMouseDown preventDefault` preserves caret position. ForwardRef to underlying `<input>`. `aria-invalid`, `aria-required` set per props. Spanish fallback "Campo inválido" when `error===true` without text. Optional left/right icon (right disabled & warned for password).
- **Select**: native `<select>` element. Forward ref. Label/helper/error wired identically to Input. Supports BOTH children-form (`<Select.Option>`) AND `options` prop; if both, `options` wins. Placeholder rendered as a hidden disabled `<option value="">`. Chevron preserved from base.css via the existing `--wb-select-*` variables — Select.module.css does not redeclare them, does not paint a `background-image`, and does not set `appearance: none`.

## Files created

- `frontend/src/components/ui/Input.jsx` (~120 lines, forwardRef + useState for password reveal)
- `frontend/src/components/ui/Input.module.css` (token-only colors; 40px height via `calc(var(--wb-space-8) + var(--wb-space-2))`)
- `frontend/src/components/ui/Select.jsx` (~95 lines, forwardRef + `Select.Option` ergonomic alias)
- `frontend/src/components/ui/Select.module.css` (no background-image; no appearance reset; preserves base.css chevron)

## Verification

- All 4 files exist
- Input.jsx: forwardRef, useId, useState; imports Eye/EyeOff; "Mostrar contraseña" / "Ocultar contraseña" / "Campo inválido" Spanish strings; aria-describedby + aria-invalid wired; password toggle uses `onMouseDown preventDefault` for caret preservation
- Input.module.css: 40px height arithmetic; icon_left/icon_right + hasIcon_left/hasIcon_right rules; passwordToggle absolute right; prefers-reduced-motion present; zero raw hex; no `--wb-select-*` references
- Select.jsx: forwardRef + useId; static `Select.Option`; both `options` prop AND children supported (`options ? options.map(...) : children`); "Campo inválido" string; aria wiring identical to Input
- Select.module.css: no `background-image`, no `--wb-select-*` overrides, no `appearance: none`; 40px height arithmetic; prefers-reduced-motion; zero raw hex

## Notes

- Both share identical focus-ring and helper/error patterns — visual coherence guaranteed for Phase 3 page migrations.
- Select preserves the base.css chevron contract — verified via negative grep gates.
- No new npm dependencies introduced.
- No edits to Phase 1 artifacts.
