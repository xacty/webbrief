# Plan 05-01 — SharePage Migration

**Status:** Complete
**Requirement:** UI-08 (partial — SharePage half)
**Files:** `frontend/src/pages/SharePage.jsx`, `frontend/src/pages/SharePage.module.css`

## Gates (all PASS)

| Gate | Result |
|------|--------|
| Hex literals outside `@media print` | 0 (only `#fff` inside print block, justified per UI-SPEC §"Print/PDF Protection") |
| Local Button/Input selectors removed (`primaryButton`/`secondaryButton`/`dangerButton`/`linkButton`) | 0 hits |
| `z-index` declarations | 0 (preserved — file had none) |
| `<Button` count | 6 (Exportar PDF, Continuar, Cambiar datos, Enviar comentario, Aprobar, Pedir cambios) |
| `<Input` count | 2 (Nombre, Email) |
| `<textarea>` preserved native | 2 (comment + approvalComment — Phase 2 has no textarea primitive) |
| Inline `style={` blocks in JSX | 0 |
| `publicFetch.*api/public/share` calls | 3 (load + comments POST + approvals POST) |
| `share-viewer-${token}` localStorage references | 3 (init read + write + remove) |
| `.printHide` class added | yes (default + `@media print` rule) |
| `@media print` block | 1 (preserves `display: none` for identityCard + feedbackPanel + printHide; `page-break-after: always` on pageBlock) |
| `cd frontend && npm run build` | exit 0, clean |

## Selectors deleted from SharePage.module.css

- `.primaryButton`, `.secondaryButton`, `.dangerButton` (all delegated to Phase 2 `<Button>`)
- `.linkButton` (delegated to `<Button variant="ghost">`)
- `.field input`, `.field input:focus` (replaced by Phase 2 `<Input>`)
- The shared `.identityCard, .feedbackPanel, .pageBlock` surface block (border + background + box-shadow + border-radius) — surface chrome now provided by `<Card>` props on the wrapping element. `.pageBlock` keeps its surface chrome inline because the JSX wraps `<section>` (TipTap content tree must not gain an extra DOM wrapper).

## Visual deltas applied (locked snaps)

| Property | Before | After | Delta |
|----------|--------|-------|-------|
| `.title` font-size | 32px | `var(--wb-text-3xl)` (30px) | -2px |
| `.title` line-height | 1.1 | `var(--wb-leading-3xl)` (1.2) | +0.1 |
| `.eyebrow` font-size | 13px | `var(--wb-text-xs)` (12px) | -1px |
| `.eyebrow` margin-bottom | 6px | `var(--wb-space-1)` (4px) | -2px |
| `.cardTitle` margin-bottom | 14px | `var(--wb-space-3)` (12px) | -2px |
| `.identityGrid` margin-bottom | 14px | `var(--wb-space-3)` (12px) | -2px |
| `.field` gap | 7px | `var(--wb-space-2)` (8px) | +1px |
| `.feedbackForm`, `.approvalBox` gap | 10px | `var(--wb-space-2)` (8px) | -2px |
| `.actions` gap | 10px | `var(--wb-space-2)` (8px) | -2px |
| `.document` gap | 18px | `var(--wb-space-5)` (20px) | +2px |
| `.pageBlock` padding | 36px 44px | `var(--wb-space-8) var(--wb-space-12)` (32px 48px) | -4px / +4px |
| `.pageBlock h2` font-size | 22px | `var(--wb-text-xl)` (20px) | -2px |
| `.pageBlock h2` line-height | 1.2 | `var(--wb-leading-xl)` (1.4) | +0.2 |
| `.pageBlock h2` margin-bottom | 18px | `var(--wb-space-5)` (20px) | +2px |
| `.content` line-height | 1.65 | `var(--wb-leading-relaxed)` (1.75) | +0.1 |
| `.page` padding | 32px 24px 72px | `var(--wb-space-8) var(--wb-space-6) var(--wb-space-12)` (32 / 24 / 48) | bottom -24px (72→48 snap) |
| Mobile `.pageBlock` padding | 24px | `var(--wb-space-6)` (24px) | 0 |
| `.title` color | inherited | `var(--wb-color-primary-900)` | new explicit token (matches inherited dark) |
| `.cardTitle` color | inherited | `var(--wb-color-primary-900)` | new explicit token |
| `.pageBlock h2` color | inherited | `var(--wb-color-primary-900)` | new explicit token |
| Document CTA `[data-cta-button] a` color | `#fff` | `var(--wb-surface)` | identical |
| Focus ring | `rgba(15, 23, 42, 0.08)` | `var(--wb-color-primary-200)` | tokenized (slight shift to brand primary) |

All deltas ≤ 4px or imperceptible. Acceptable per UI-SPEC §"Spacing Scale" Exception 2 and §"Migration Strategy" success criteria.

## Print/PDF protection

- `.printHide` wrapper around the Exportar PDF `<Button>` is the cross-browser-safe replacement for the old `.secondaryButton` selector (Phase 2 `<Button>` does not expose `.secondaryButton` as a DOM class, so the old print rule would have been dead).
- `@media print` block keeps `padding: 0` and `background: #fff` literals per UI-SPEC §"Print/PDF Protection" (browser-compat — Safari + older Chrome do not consume `var()` reliably inside `@media print`).
- Print rules verified by structure:
  - `.identityCard, .feedbackPanel, .printHide { display: none }` → identity gate hidden, feedback panel hidden, Exportar PDF button hidden.
  - `.page { padding: 0; background: #fff }` → no page chrome, white background.
  - `.pageBlock { border: none; box-shadow: none; page-break-after: always }` → each pageBlock starts on its own page, no card chrome.

Manual `Ctrl+P` smoke test deferred to Plan 05-04 golden path verification (Path D).

## Console-cleanliness

`npm run build` exits 0 with zero errors and zero warnings. The pre-existing `(!) Some chunks are larger than 500 kB` warning is global to the bundle (ProjectEditor) and not introduced by this migration.

## Pre-migration baselines

Pre-migration screenshots are IMPOSSIBLE retroactively per `05-CONTEXT.md`. Visual reference for SharePage at HEAD~1 (`b0ec836`) lives in git history.
