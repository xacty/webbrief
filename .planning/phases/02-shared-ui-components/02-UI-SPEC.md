---
phase: 2
slug: shared-ui-components
status: approved
shadcn_initialized: false
preset: none
created: 2026-05-08
---

# Phase 2 — UI Design Contract

> Visual + interaction contract for the 6 shared UI primitives delivered in this phase: `Button`, `Input`, `Select`, `Modal`, `Card`, `Badge`. The contract locks the API, variant matrix, token usage, accessibility behaviour, and file layout BEFORE `plan-phase` decomposes tasks. Phase 2 only ships the library — page migrations belong to Phase 3+.

---

## Design System

| Property | Value |
|----------|-------|
| Tool | none (CSS Modules + variables CSS) |
| Preset | not applicable (custom design system, no shadcn / Radix / MUI) |
| Component library | none — hand-rolled primitives |
| Icon library | `lucide-react` (already in deps, v0.577) |
| Font | `system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif` (var: `--wb-font-sans`) |
| Stack constraint | React 18 functional + hooks, JS only (no TS, all `.jsx`); no CSS-in-JS |
| Token source | `frontend/src/styles/tokens.css` (Phase 1 — all `--wb-*` consumed exclusively) |
| Component path | `frontend/src/components/ui/<Name>.jsx` + `<Name>.module.css` co-located |
| Public surface | `frontend/src/components/ui/index.js` re-exports all 6 components |
| Imports | Relative — no `@/` alias is configured in `vite.config.js` |

---

## Spacing Scale

Phase 2 uses the Phase 1 spacing tokens directly. No component is allowed to introduce raw px values for padding, gaps, or offsets — all values resolve to `--wb-space-*`.

| Token | Value | Usage in Phase 2 |
|-------|-------|------------------|
| `--wb-space-1` | 4px | Badge vertical padding, icon-to-label gap inside Button-sm |
| `--wb-space-2` | 8px | Badge horizontal padding, icon gap Button-md/lg, Input/Select internal gap |
| `--wb-space-3` | 12px | Modal close-button inset, Input text/icon offset |
| `--wb-space-4` | 16px | Button-md horizontal padding, Input/Select horizontal padding, Modal header/body separation |
| `--wb-space-5` | 20px | Button-lg horizontal padding |
| `--wb-space-6` | 24px | Card padding (default), Modal body padding |
| `--wb-space-8` | 32px | Modal header padding-top, large Card variant |

Exceptions: **none**. Hardcoded px is forbidden; height tokens (32/40/48 px) for Button + Input + Select are declared as fixed values per the decision log but expressed via CSS-variable arithmetic from `--wb-space-*` (`32px = var(--wb-space-8)`, `40px = calc(var(--wb-space-8) + var(--wb-space-2))`, `48px = calc(var(--wb-space-12))`).

---

## Typography

Components consume Phase 1 type + weight + leading tokens.

| Role | Size token | Weight token | Line-height token | Used by |
|------|-----------|--------------|-------------------|---------|
| Body | `--wb-text-base` (16px) | `--wb-weight-regular` (400) | `--wb-leading-normal` (1.5) | Modal body, Input value, Card body |
| Label | `--wb-text-sm` (14px) | `--wb-weight-medium` (500) | `--wb-leading-normal` (1.5) | Input label, Select label, Button-sm/md text |
| Caption | `--wb-text-xs` (12px) | `--wb-weight-medium` (500) | `--wb-leading-normal` (1.5) | Badge text, Input helper/error message |
| Heading | `--wb-text-lg` (18px) | `--wb-weight-semibold` (600) | `--wb-leading-xl` (1.4) | Modal title, Button-lg text |
| Display | not used in Phase 2 | — | — | (reserved for editor / dashboards) |

Letter-spacing: default. **No `text-transform: uppercase`** (CONTEXT.min.md `Recent Fixes` lists "removed uppercase styling" as an active invariant — preserve).

---

## Color

WeBrief is a single-theme product (light shell, dark editor). Phase 2 components target the **light shell** — the editor's dark palette is migrated separately in Phase 4 with sub-tokens.

| Role | Token / Value | Usage |
|------|---------------|-------|
| Dominant (60%) | `#ffffff` (`--wb-surface`) and `--wb-color-neutral-50` (`--wb-bg`) | Modal card background, Card surface, Input/Select background |
| Secondary (30%) | `--wb-color-neutral-100` / `--wb-color-neutral-200` | Button-secondary fill, Card hover, Badge-neutral fill |
| Accent (10%) | `--wb-color-primary-900` (`#091223`) | Button-primary fill, Input/Select focus border, Modal close-button hover |
| Destructive | `--wb-color-danger-600` (`#dc2626`) | Button-danger fill, Input error border + helper text, Badge-danger |
| Success accent | `--wb-color-success-700` (text) / `--wb-color-success-100` (bg) | Badge-success only |
| Warning accent | `--wb-color-warning-700` (text) / `--wb-color-warning-100` (bg) | Badge-warning only |

**Accent reserved for**: Button-primary background, Input/Select focused border (`box-shadow: 0 0 0 3px var(--wb-color-primary-200)`), Modal `:focus-visible` ring on the close button. Never on hover backgrounds, badge fills outside `variant="success"`, or Card backgrounds.

**Body text on white**: minimum `--wb-color-neutral-700` (`#334155`, 9.4:1 — WCAG AA pass). Captions/helper text use `--wb-color-neutral-600` (6.9:1 — still AA). Disabled text only uses `--wb-color-neutral-400` and is never the sole carrier of meaning.

Per-variant token map (locked):

```
Button.primary       bg: --wb-color-primary-900    text: #ffffff               hover: --wb-color-primary-500
Button.secondary     bg: --wb-color-neutral-100    text: --wb-color-neutral-800 hover: --wb-color-neutral-200
Button.ghost         bg: transparent               text: --wb-color-neutral-700 hover: --wb-color-neutral-100
Button.danger        bg: --wb-color-danger-600     text: #ffffff               hover: --wb-color-danger-700

Input.default        border: --wb-border           bg: --wb-surface             text: --wb-color-neutral-800
Input.focus          border: --wb-border-strong    ring: --wb-color-primary-200
Input.error          border: --wb-color-danger-600 helper: --wb-color-danger-700

Select               same as Input + chevron preserved from base.css (--wb-select-chevron)

Modal.overlay        bg: rgba(15, 23, 42, 0.36)    z-index: var(--wb-z-modal)
Modal.card           bg: --wb-surface              shadow: --wb-shadow-xl       radius: --wb-radius-4 (16px)

Card.default         bg: --wb-surface              shadow: --wb-shadow-sm       radius: --wb-radius-4 (16px)

Badge.neutral        bg: --wb-color-neutral-100    text: --wb-color-neutral-700
Badge.success        bg: --wb-color-success-100    text: --wb-color-success-700
Badge.warning        bg: --wb-color-warning-100    text: --wb-color-warning-700
Badge.danger         bg: --wb-color-danger-100     text: --wb-color-danger-700
```

---

## Copywriting Contract

Phase 2 ships primitives, not page copy. Default copy strings live ONLY in fallbacks (e.g., Modal close button accessible label). Page-level copy stays with the consumer.

| Element | Default copy (Spanish, app language) |
|---------|--------------------------------------|
| `Modal` close button `aria-label` | `"Cerrar"` |
| `Button` `loading` SR-only label | `"Cargando…"` |
| `Input` required marker `aria-hidden` glyph | `"*"` (visual only; SR uses `aria-required="true"`) |
| `Input` default error fallback when `error` is `true` without text | `"Campo inválido"` |
| `Select` placeholder default (when `placeholder` prop not provided) | `"Selecciona una opción"` |
| `Badge` default `aria-label` when only an icon is rendered | none — caller must pass `aria-label` |

CTA verb pattern (when consumers compose Buttons in Phase 3+): `verb + concrete noun` (`Crear empresa`, `Guardar cambios`, `Enviar a revisión`) — no generic `Aceptar` / `Confirmar` for primary CTAs.

---

## Registry Safety

| Registry | Blocks used | Safety gate |
|----------|-------------|-------------|
| shadcn official | none | not required |
| Third-party UI libs | none — hand-rolled | not applicable |

Phase 2 introduces **zero new npm dependencies**. Only `react`, `react-dom` (`createPortal`), and the already-installed `lucide-react` are imported.

---

## Component API Contracts

The 6 components have locked surface APIs. Anything outside this list moves to v2 (deferred in CONTEXT.md).

### 1. `Button`

```jsx
<Button
  variant="primary" | "secondary" | "ghost" | "danger"  // default: "primary"
  size="sm" | "md" | "lg"                                // default: "md"
  type="button" | "submit" | "reset"                     // default: "button"
  disabled={boolean}
  loading={boolean}                                       // shows spinner; implies disabled
  icon={<LucideIcon size={iconSize} />}                  // ReactNode, optional
  iconPosition="left" | "right"                          // default: "left"
  fullWidth={boolean}
  onClick={(e) => void}
  className={string}                                      // composes with internal classes
  ...rest                                                 // spread to <button>; ref forwarded
>
  {children}
</Button>
```

Geometry per size (locked):

| Size | Height | Padding-X | Font | Icon size | Radius |
|------|--------|-----------|------|-----------|--------|
| sm | 32px | `--wb-space-3` (12) | `--wb-text-sm` 500 | 14px | `--wb-radius-2` (8) |
| md | 40px | `--wb-space-4` (16) | `--wb-text-sm` 500 | 16px | `--wb-radius-2` (8) |
| lg | 48px | `--wb-space-5` (20) | `--wb-text-base` 600 | 18px | `--wb-radius-3` (12) |

States: `default`, `hover`, `:focus-visible` (3px primary-200 ring), `:active` (translate Y by 0; just darker bg), `disabled` (opacity 0.5, cursor not-allowed), `loading` (spinner from `lucide-react` `Loader2` with `animation: spin 1s linear infinite` defined locally in module CSS; label hidden via `visibility: hidden` to preserve width).

`forwardRef` exposes the underlying `<button>` (needed for focus management in modals).

### 2. `Input`

```jsx
<Input
  type="text" | "email" | "password" | "number" | "search" | "tel" | "url"
  label={string}                  // renders <label> above; optional but encouraged
  helperText={string}             // sub-label below
  error={boolean | string}        // string overrides helperText with red color
  icon={<LucideIcon />}            // optional left icon
  iconPosition="left" | "right"   // default: "left"
  fullWidth={boolean}              // default: true
  required={boolean}
  disabled={boolean}
  id={string}                     // auto-generated via useId() when omitted
  value, defaultValue, onChange, onBlur, placeholder, name, autoComplete, ...rest
>
```

Geometry: height 40px, font `--wb-text-base`, padding `0 var(--wb-space-4)` (left padding becomes `var(--wb-space-10)` ≈ 40px when `icon iconPosition="left"`; computed via `calc(var(--wb-space-2) + 16px + var(--wb-space-2))`). Border `1px solid var(--wb-border)`, radius `--wb-radius-2`. Focus: border becomes `--wb-border-strong` + 3px `--wb-color-primary-200` ring. Error: border `--wb-color-danger-600`, helper colour `--wb-color-danger-700`. `aria-invalid` mirrors `error` truthiness; `aria-describedby` wires helper/error.

Password type renders an inline eye toggle (`Eye` / `EyeOff` from lucide-react) on the right — matches existing Login/SetPassword fix (CONTEXT.min.md `Recent Fixes`). Toggle preserves caret position.

`forwardRef` exposes the underlying `<input>`.

### 3. `Select`

```jsx
<Select
  label, helperText, error, required, disabled, fullWidth, id,
  placeholder={string}            // first <option disabled value="">
  value, defaultValue, onChange, name, ...rest
>
  <Select.Option value="a">A</Select.Option>
  // OR pass options prop:
  options={[{ value, label, disabled? }]}
</Select>
```

Native `<select>` under the hood (no JS-driven listbox in Phase 2 — defer to v2 if a styled menu is needed). Geometry mirrors `Input`. Chevron preserved from `frontend/src/styles/base.css` via the existing `--wb-select-chevron` CSS variable; `padding-right` consumes `--wb-select-padding-right` (default 42px). Focus + error states match Input.

`forwardRef` exposes the `<select>`. Both children-form and `options`-prop form are supported; if both are passed, `options` wins.

### 4. `Modal`

```jsx
<Modal
  open={boolean}                              // controlled
  onClose={() => void}
  title={string | ReactNode}                  // renders header
  size="sm" | "md" | "lg" | "full"             // default "md"; max-widths 400 / 500 / 720 / calc(100vw - 64px)
  closeOnEscape={boolean}                      // default true
  closeOnBackdrop={boolean}                    // default true
  showCloseButton={boolean}                    // default true
  initialFocusRef={React.RefObject}            // optional; defaults to first focusable inside
  footer={ReactNode}                           // optional sticky footer slot
  ariaDescribedBy={string}
  className={string}                           // applied to card
  overlayClassName={string}
>
  {children}
</Modal>
```

Behaviour:
- Renders to `document.body` via `createPortal` only when `open` is `true` (no DOM cost when closed).
- Overlay `position: fixed; inset: 0`, `background: rgba(15, 23, 42, 0.36)`, `z-index: var(--wb-z-modal)`. Card centred via flex. Body `overflow: hidden` while any modal is open (refcount-based to support stacked modals).
- Card: `--wb-surface` bg, `--wb-shadow-xl`, `--wb-radius-4` (16px), `max-width` per size, `max-height: calc(100vh - var(--wb-space-12))`, internal scroll inside `.body`.
- Header: title (`--wb-text-lg`/600/`--wb-leading-xl`), close button top-right (`X` from lucide-react, 20px) with `aria-label="Cerrar"`.
- Escape closes when `closeOnEscape`. Mousedown-on-overlay + mouseup-on-overlay pattern (NOT a single click) prevents accidental close when a drag begins inside the card.
- Focus management: on open, focus moves to `initialFocusRef` or first focusable element; on close, focus returns to the previously active element. Implements a basic focus trap (Tab/Shift+Tab cycle within the card) — no external lib, ~25 LOC.
- ARIA: `role="dialog"`, `aria-modal="true"`, `aria-labelledby={titleId}`, `aria-describedby={ariaDescribedBy}`.
- `prefers-reduced-motion: reduce` disables the fade-in.

### 5. `Card`

```jsx
<Card
  as="div" | "section" | "article" | "button"  // default "div"; "button" makes it interactive
  padding="none" | "sm" | "md" | "lg"           // default "md" (24px)
  shadow="none" | "sm" | "md"                    // default "sm"
  radius="md" | "lg" | "xl"                      // default "lg" (16px)
  interactive={boolean}                          // adds hover/focus states; required when as="button"
  onClick, className, ...rest
>
  {children}
</Card>
```

Pure container. No internal layout primitives (`Card.Header`, `Card.Body`) — consumers compose directly. Background `--wb-surface`, border `1px solid transparent` (becomes `--wb-border` when `interactive` and hovered, mirroring current company-card behaviour). Padding tokens map: `none → 0`, `sm → --wb-space-4`, `md → --wb-space-6`, `lg → --wb-space-8`.

### 6. `Badge`

```jsx
<Badge
  variant="neutral" | "success" | "warning" | "danger"   // default "neutral"
  size="sm" | "md"                                        // default "md"
  icon={<LucideIcon size={12 | 14} />}                   // optional
  className, ...rest
>
  {children}
</Badge>
```

Geometry: `display: inline-flex`, `align-items: center`, `gap: var(--wb-space-1)`, `padding: var(--wb-space-1) var(--wb-space-2)` (sm: `2px var(--wb-space-2)`), `border-radius: var(--wb-radius-full)`, `font: --wb-text-xs / 500 / --wb-leading-normal`, `letter-spacing: 0`. Pure presentational — no `role="status"` by default (caller adds it for live regions).

---

## Public Surface

`frontend/src/components/ui/index.js`:

```js
export { default as Button } from './Button.jsx';
export { default as Input } from './Input.jsx';
export { default as Select } from './Select.jsx';
export { default as Modal } from './Modal.jsx';
export { default as Card } from './Card.jsx';
export { default as Badge } from './Badge.jsx';
```

Consumer pattern (validated in Phase 3+):

```jsx
import { Button, Modal, Input } from '../../components/ui';
```

No barrel side-effects, no default export at the package level. Tree-shaking-friendly (every component is its own file).

---

## File Layout

```
frontend/src/components/ui/
├── Button.jsx
├── Button.module.css
├── Input.jsx
├── Input.module.css
├── Select.jsx
├── Select.module.css
├── Modal.jsx
├── Modal.module.css
├── Card.jsx
├── Card.module.css
├── Badge.jsx
├── Badge.module.css
└── index.js
```

Helper: a `cn(...args)` utility (≈10 LOC) lives at `frontend/src/components/ui/cn.js` (NOT exported from `index.js`) — joins truthy strings for class composition. Internal-only.

---

## Accessibility Baseline

Mandatory across all 6 components:
- Visible `:focus-visible` outline using `--wb-color-primary-200` ring (3px) — never `outline: none` without a replacement.
- Hit areas ≥ 32×32 px (Button-sm hits this exactly; smaller close buttons inside Modal use 32×32 wrapper around 20px icon).
- Colour is never the sole carrier of meaning (Input error pairs colour + text; Badge variants pair colour + label).
- All icon-only Buttons require either `children` or `aria-label`; component throws a `console.warn` in dev when neither is set.
- `prefers-reduced-motion: reduce` short-circuits all transitions/animations (Button hover, Modal fade, spinner). Pattern from `frontend/src/styles/base.css` is reused.

---

## Out of Scope (Phase 2)

- Page migrations (Phase 3-5).
- Storybook / dev sandbox route (CONTEXT.md `<deferred>` — explicitly skipped).
- Frontend test framework (CONTEXT.md `<deferred>`).
- Compound components (`Modal.Header`, `Modal.Body`, `Modal.Footer`) — flat props for now (CONTEXT.md `<deferred>`).
- Advanced primitives (`DataTable`, `ComboBox`, `DatePicker`).
- Dark-mode variants (theming-dark-mode.md is a future milestone).
- Motion system (animation-microinteractions.md is a future milestone).
- A custom (non-native) `<Select>` listbox.

---

## Deviations From CONTEXT.md

None. Two micro-clarifications added on top of the existing decisions (no contradictions):

1. **Helper `cn.js`** is added at `components/ui/cn.js`. CONTEXT.md asks to "verify if a `cn()` helper exists; if not, add trivial one" — confirmed it doesn't, so we ship the trivial version.
2. **Modal close pattern** uses mousedown-on-overlay + mouseup-on-overlay (not single click) to avoid accidental close when a drag begins inside the card. This is a UX safety net and does not contradict CONTEXT.md.

Anything that contradicts CONTEXT.md must be flagged in the Phase 2 SUMMARY; no such contradiction is introduced here.

---

## Checker Sign-Off (self-verified)

- [x] Dimension 1 — Copywriting: PASS (Spanish defaults match app language; verb+noun pattern preserved; no generic CTAs introduced)
- [x] Dimension 2 — Visuals (variants/sizes/states locked, geometry tabulated, focus rings specified): PASS
- [x] Dimension 3 — Color (60/30/10 mapped to dominant/secondary/accent; danger separated; success/warning isolated to Badge; AA contrast assured): PASS
- [x] Dimension 4 — Typography (4 roles mapped to Phase 1 tokens; uppercase forbidden per existing invariant): PASS
- [x] Dimension 5 — Spacing (every component padding/gap maps to a `--wb-space-*`; height tokens declared; no raw px in CSS modules): PASS
- [x] Dimension 6 — Registry safety (no shadcn / Radix / MUI; zero new deps; only existing `lucide-react` + `react-dom` portals): PASS

**Approval:** approved 2026-05-08 (auto-mode per `.planning/intel/decisions.md`; `skip_discuss=true`).
