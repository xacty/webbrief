# Plan 05-02 — BriefPage Migration

**Status:** Complete
**Requirement:** UI-08 (BriefPage half — Phase 5 UI-08 fully satisfied combined with 05-01)
**Files:** `frontend/src/pages/BriefPage.jsx`, `frontend/src/pages/BriefPage.module.css`

## Gates (all PASS)

| Gate | Result |
|------|--------|
| Hex literals in BriefPage.module.css | **0 (38 → 0)** |
| Inline `style={` in BriefPage.jsx | **0** (FileUploadField inline styles eliminated) |
| Local `.input` / `.submitButton` selectors | 0 (delegated to Phase 2) |
| `z-index` declarations | 0 |
| `<Button` count | 3 (submit + Quitar — instantiated per-file in FileUploadField) |
| `<Input` count | 2 (respondentName + respondentEmail) — `short_text` questions also use `<Input>` per-render |
| `<textarea>` count | 1 (long_text questions — preserved native, tokenized in-place) |
| `.textarea` selector exists, tokenized | 1+ |
| `var(--wb-color-success-700)` (.successIcon AA upgrade) | 1 hit (locked) |
| `accent-color: var(--wb-color-primary-900)` (.optionInput) | 1 hit |
| `var(--wb-bg)` (.page background replaced) | 1 hit |
| All Spanish strings preserved verbatim (Tus datos / Nombre completo / Correo electrónico / Tu nombre / tu@email.com / Subiendo… / Quitar / Enviar brief / Enviando... / Cargando brief... / Brief no disponible / ¡Gracias por completar el brief! / Tu información fue recibida correctamente. ... / Los campos marcados con * son obligatorios. / Por favor responde: / No se pudo subir el archivo / No se pudo enviar el formulario / No se pudo cargar el brief) | All present |
| `npm run build` | exit 0, clean (no errors, no warnings beyond pre-existing chunk-size note) |

## Selectors deleted from BriefPage.module.css

- `.input`, `.input:focus` (delegated to Phase 2 `<Input>`)
- `.submitButton`, `.submitButton:hover:not(:disabled)`, `.submitButton:disabled` (delegated to Phase 2 `<Button variant="primary" size="lg" loading={submitting}>`)

## Surface chrome migration via `<Card>`

`.identityCard`, `.errorState`, `.successState` no longer carry `background` / `border` / `border-radius` / `box-shadow` declarations — surface comes from `<Card padding="md|lg" shadow="sm" radius="md">` props on the wrapping element. Local classes retain only layout (`text-align: center` for state cards; identity-card layout-only).

`.fieldGroup` keeps its surface chrome inline (background + border + radius + padding) because each question is rendered inline without a `<Card>` wrapper — wrapping every question in Card would add DOM depth without visual benefit.

## Visual deltas applied (locked snaps from UI-SPEC)

| Property | Before | After | Delta |
|----------|--------|-------|-------|
| `.page` background | `#f4f7fb` | `var(--wb-bg)` (`#f8fafc`) | imperceptible (4-channel shift) |
| `.page` padding | 40px 16px 80px | `var(--wb-space-12)` 48 / `var(--wb-space-4)` 16 / `var(--wb-space-16)` 64 | top +8, bottom -16 (re-snapped to scale) |
| `.formTitle` font-size | 28px | `var(--wb-text-3xl)` (30px) | +2px |
| `.formTitle` color | `#091223` | `var(--wb-color-primary-900)` (`#091223`) | identical |
| `.formDescription` font-size | 15px | `var(--wb-text-base)` (16px) | +1px |
| `.formDescription` line-height | 1.6 | `var(--wb-leading-normal)` (1.5) | -0.1 |
| `.formDescription` color | `#475569` | `var(--wb-color-neutral-600)` (`#475569`) | identical |
| `.requiredNote` color | `#94a3b8` | `var(--wb-color-neutral-500)` (`#64748b`) | slightly darker (was off-spec light) |
| `.identityTitle` font-size | 15px | `var(--wb-text-sm)` (14px) | -1px |
| `.identityTitle` color | `#091223` | `var(--wb-color-primary-900)` | identical |
| `.fieldGroup` border | `#e2e8f0` | `var(--wb-color-neutral-200)` | identical |
| `.fieldGroup` border-radius | 12px | `var(--wb-radius-3)` (12px) | identical |
| `.questionLabel` color | `#1e293b` | `var(--wb-color-neutral-800)` (`#1e293b`) | identical |
| `.required` color | `#ef4444` | `var(--wb-color-danger-500)` | identical |
| `.hint` color | `#64748b` | `var(--wb-color-neutral-500)` | identical |
| `.sectionHeader` border-bottom color | `#e2e8f0` | `var(--wb-color-neutral-200)` | identical |
| `.sectionHeaderTitle` font-size | 17px | `var(--wb-text-lg)` (18px) | +1px |
| `.sectionHeaderTitle` color | `#0f172a` | `var(--wb-color-neutral-900)` (`#0f172a`) | identical |
| `.optionInput` accent-color | `#212222` | `var(--wb-color-primary-900)` (`#091223`) | slightly cooler (locked Special Remap) |
| `.textarea` focus border | `#212222` | `var(--wb-color-primary-900)` | locked Special Remap |
| `.errorTitle` font-size | 22px | `var(--wb-text-2xl)` (24px) | +2px (Exception 5) |
| `.errorTitle` color | `#0f172a` | `var(--wb-color-neutral-900)` | identical |
| `.successIcon` background | `#dcfce7` | `var(--wb-color-success-100)` | identical |
| **`.successIcon` color** | **`#16a34a` (4.0:1 vs `#dcfce7`)** | **`var(--wb-color-success-700)` (`#15803d`, 4.5:1 vs `#dcfce7`)** | **AA upgrade** |
| `.successTitle` font-size | 24px | `var(--wb-text-2xl)` (24px) | identical |
| `.submitButton` (geometry) | 11px 28px / 15px / 700 | Phase 2 `<Button size="lg">` (height 48 / pad-X 20 / `--wb-text-base` 16 / `--wb-weight-semibold` 600) | accepted per UI-SPEC §"Typography" Exception 6 |
| `.submitButton:hover` bg | `#000` | (n/a — delegated; `--wb-color-primary-700` for hover via Phase 2) | locked |

**Total color literals replaced:** 38 → 0 (`#091223` ×2, `#475569` ×2, `#94a3b8`, `#fff` ×6, `#e2e8f0` ×4, `#0f172a` ×4, `#1e293b` ×2, `#ef4444`, `#64748b` ×3, `#f8fafc` ×2, `#cbd5e1` ×2, `#212222` ×3, `#000`, `#dc2626`, `#fef2f2`, `#fecaca`, `#dcfce7`, `#16a34a`, `#f4f7fb`).

## Inline-styles eliminated from BriefPage.jsx

The `FileUploadField` previously inlined ~6 `style={{...}}` blocks. Each absorbed into a CSS class:

| Inline (deleted) | New CSS class | Selector body |
|------------------|---------------|---------------|
| `<p style={{ color: '#dc2626' }}>` (uploadError) | `.uploadError` | `color: var(--wb-color-danger-600)` |
| `<ul style={{ marginTop: 8, listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>` | `.fileList` | tokenized list flex layout |
| `<li style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>` | `.fileItem` | tokenized row layout + `--wb-text-sm` |
| `<span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>` | `.fileName` | identical layout, no color literal |
| `<span style={{ color: '#94a3b8', fontSize: 11 }}>` (KB suffix) | `.kbSize` | `color: var(--wb-color-neutral-400); font-size: var(--wb-text-xs)` |
| `<button style={{ background: 'transparent', border: 'none', color: '#dc2626', cursor: 'pointer' }}>Quitar</button>` | `<Button variant="ghost" size="sm" className={styles.removeFile}>` + `.removeFile { color: var(--wb-color-danger-600); }` | delegates structure to Phase 2 Button, scopes danger-color override locally |

## A11y upgrade

- `.successIcon` color upgraded from `#16a34a` (contrast 4.0:1 vs `#dcfce7` background) to `var(--wb-color-success-700)` = `#15803d` (4.5:1) — meets WCAG AA. Locked in UI-SPEC §"Accessibility Baseline".
- Required-marker `*` spans now have `aria-hidden="true"` per UI-SPEC §"Accessibility Baseline" → screen readers don't announce decorative glyphs; `required` prop on `<Input>` carries `aria-required="true"` to the underlying input automatically.
- File-list `Quitar` button gains `aria-label={`Quitar archivo ${f.fileName}`}` for SR users (visible label is still just "Quitar").
- `<textarea>` and `<input type="radio|checkbox">` carry `aria-required={required}` and `aria-label={label}` since the visible legend/label is rendered separately.

## Console-cleanliness

`npm run build` exits 0 with zero errors, zero warnings (the chunk-size note is a pre-existing global bundle warning, not introduced by this migration).

## Pre-migration baselines

Pre-migration screenshots are IMPOSSIBLE retroactively per `05-CONTEXT.md`. Visual reference for BriefPage at HEAD~2 (`b0ec836`) is in git history.
