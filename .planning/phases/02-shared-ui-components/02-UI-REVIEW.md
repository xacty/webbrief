---
phase: 2
slug: shared-ui-components
status: passed
mode: advisory
date: 2026-05-08
auditor: gsd-ui-review (retroactive)
spec_baseline: 02-UI-SPEC.md
decisions_baseline: .planning/intel/decisions.md
components_audited:
  - Button
  - Input
  - Select
  - Modal
  - Card
  - Badge
---

# Phase 2 — UI Review (Retroactive)

> Advisory 7-pillar audit of the 6 shared UI primitives delivered in Phase 2 (`Button`, `Input`, `Select`, `Modal`, `Card`, `Badge`). Scored against the **7 Refactoring UI principles** (visual hierarchy, spacing, typography, color, depth/shadows, images/icons, layout) plus alignment to the locked `02-UI-SPEC.md` and `decisions.md` contracts.
>
> Score is informative (advisory). The phase has already passed its build + grep gates (`02-VERIFICATION.md`). This document highlights strengths, weak spots, and follow-ups for Phase 3+ migration work — it is not a blocker.

---

## Score Summary

| # | Principle | Score (1-10) | One-line verdict |
|---|-----------|-------------|------------------|
| 1 | Visual hierarchy | 8.5 | Sizes/weights/colors stratify primary CTAs, body, captions cleanly. |
| 2 | Spacing | 9.5 | Every CSS Module path through `--wb-space-*`; zero raw-px violations. |
| 3 | Typography | 9.0 | Roles map 1:1 to Phase 1 tokens; no uppercase; weights respected. |
| 4 | Color | 9.0 | 60/30/10 dominant/secondary/accent locked; AA-safe text colors. |
| 5 | Depth / shadows | 8.0 | `--wb-shadow-sm` Card + `--wb-shadow-xl` Modal map well; Button lacks elevation hover delta. |
| 6 | Images / icons | 8.5 | Single icon source (`lucide-react`), per-size icon table, decorative `aria-hidden`. |
| 7 | Layout | 8.5 | Hand-rolled flex compositions, sane defaults, predictable widths via tokens; full-bleed Modal full-size could trip on small viewports. |

**Average: 8.71 / 10** — overall **status: passed (advisory)**.

---

## Pillar 1 — Visual Hierarchy

**Score: 8.5**

### What works

- **Button.lg** correctly bumps both font (`--wb-text-base`) and weight (`--wb-weight-semibold`) versus md/sm, so primary CTAs visually outweigh secondary actions without relying on color alone (`Button.module.css` `.size_lg`).
- **Input/Select label vs. value** uses `--wb-text-sm`/medium (label) over `--wb-text-base`/regular (value), giving the typed content typographic primacy — a textbook hierarchy reversal that prevents labels from dominating the field.
- **Modal title** at `--wb-text-lg`/600 sits clearly above body text at `--wb-text-base`/regular and footer chrome on `--wb-color-neutral-50`. Three layers of contrast (title/body/footer) without competing.
- **Badge** correctly de-emphasized to `--wb-text-xs`/medium — never competes with primary content even when colored.

### What weakens

- **Button hover state** changes background but not elevation. Per Refactoring UI, "things that move when you hover" is a useful affordance signal; staying flat misses a chance to differentiate primary CTAs from non-clickable accents at a glance. (Phase 2 deferred motion; acceptable.)
- **Card interactive hover** only changes border/background — no shadow lift, which leaves the elevation static while interactivity is implied. Minor.

### Verdict

Solid hierarchy through size/weight/color. Lacks the small motion/depth deltas that Refactoring UI uses to signal interactivity, but that is consciously deferred (`decisions.md` "Out of scope: motion system").

---

## Pillar 2 — Spacing

**Score: 9.5**

### What works

- **Zero raw-px** in any of the six `*.module.css` files. Every `padding`, `gap`, `margin`, `width`, `height` resolves to `--wb-space-*` or its `calc()` arithmetic per UI-SPEC §Spacing Scale.
- **Linear scale used predictably**: Badge 4/8, Button-md 16/40, Modal body 24/32, Modal full padding 48 — each step clearly distinct from the previous.
- **Height arithmetic via tokens** (`calc(var(--wb-space-8) + var(--wb-space-2))` = 40px) is documented inline in CSS and matches the locked spec — no magic numbers smuggled in.
- **Verified by grep gate** (`02-VERIFICATION.md`): raw-hex/raw-px sweep returned 0 matches across all six modules.

### What weakens

- `Modal.module.css` carries one literal `2px` for Badge sm padding-bottom (actually it is in `Badge.module.css` `.size_sm`). The 2px is the only fractional non-token value. Documented in UI-SPEC §6 ("sm: `2px var(--wb-space-2)`") — intentional, but it does contradict the otherwise-pure token policy. Could be `calc(var(--wb-space-1) / 2)` for purity, or absorbed into a `--wb-space-0_5` if one is added later.
- `Modal.module.css` overlay uses `rgba(15, 23, 42, 0.36)` literal because `var(... )` does not expand in `rgba()`. Not a spacing issue but the same purity concern; tracked already in the file comment.

### Verdict

Best-in-class. The 2px Badge exception is the only break in an otherwise perfect token discipline.

---

## Pillar 3 — Typography

**Score: 9.0**

### What works

- **4 typographic roles** (body / label / caption / heading) cleanly mapped to Phase 1 tokens, exactly as UI-SPEC §Typography prescribed.
- **No uppercase** anywhere. Validated by grep gate — preserves the existing app invariant from CONTEXT.min.md ("removed uppercase styling from active admin/auth surfaces").
- **No webfonts**, no Google Fonts import — pure system stack via `--wb-font-sans`. Aligns with `decisions.md` "Mantener system-ui... No introducir webfonts."
- **Weight discipline**: only 400/500/600 used; 700 reserved (per decisions.md); no <400 weights for body.
- **Line-height pairing**: every `font-size` line is followed by an explicit `line-height: var(--wb-leading-*)` — no implicit browser fallback, no value drift.

### What weakens

- **Body line-height in Modal** uses `--wb-leading-base` (1.5) which is correct, but Modal title uses `--wb-leading-xl` (1.4) per UI-SPEC. The Refactoring UI heuristic "tighter leading on larger text" is respected, but only at one breakpoint; not really a weakness, more a note that the system has no `--wb-leading-display` for future hero typography.
- **Helper text uses font-weight 500** (medium) which is heavier than typical caption/helper conventions (regular 400). Visually fine in this context, but slightly louder than the Refactoring UI default for utility microcopy.

### Verdict

Strong adherence to Phase 1 tokens. Weight choice on helper text is a minor stylistic deviation worth revisiting in Phase 3 once real form layouts are built.

---

## Pillar 4 — Color

**Score: 9.0**

### What works

- **60/30/10 distribution** mapped explicitly: dominant white/`neutral-50`, secondary `neutral-100/200`, accent `primary-900` reserved for CTAs + focus ring + close-button hover. UI-SPEC §Color matrix is followed exactly in every variant CSS rule.
- **Per-variant token map locked** — Button primary/secondary/ghost/danger, Badge neutral/success/warning/danger, Input/Select default/focus/error all reference UI-SPEC color rows directly, not raw hex.
- **AA contrast on body text** (`neutral-700` = 9.4:1 on white per `tokens.css` comments). Helper text at `neutral-600` (6.9:1) — also AA. Badges use 700-on-100 pairs which all sit at AA or better.
- **No black** anywhere. Strongest dark is `--wb-color-primary-900` (#091223) per decisions.md "No black puro".
- **Color is paired with text** for state — Input error uses both red border and red helper string, never color alone. Aligns with UI-SPEC §Accessibility Baseline.

### What weakens

- **`#ffffff` literal** appears in Button primary/danger and Card surface — but UI-SPEC explicitly allows it ("dominant 60% = `#ffffff` (`--wb-surface`)"). The token `--wb-surface` exists and could absorb these, slightly tightening discipline.
- **Modal overlay `rgba(15, 23, 42, 0.36)`** is a literal because CSS variables can't expand inside `rgba()` in current syntax. Acceptable trade-off, but flag if `color-mix()` becomes broadly supported.
- **Disabled state uses `opacity: 0.5`** uniformly across Button, Input, Select. Refactoring UI prefers separate disabled colors (lighter neutrals) over opacity, because opacity composites unpredictably on non-white backgrounds. Works fine on the current light shell; could fail when consumers nest disabled controls inside colored Cards.

### Verdict

Color contract is one of the cleanest parts of this phase. Opacity-based disabled state is the only risk for Phase 3+ when forms land inside colored containers.

---

## Pillar 5 — Depth / Shadows

**Score: 8.0**

### What works

- **2-shadow ladder used correctly**: Card default `--wb-shadow-sm` (subtle) → Modal `--wb-shadow-xl` (dramatic). Two clearly separated layers, matching the Refactoring UI "use shadows to convey elevation" rule.
- **Card has `shadow="none" | "sm" | "md"`** exposed as a prop — gives consumers explicit elevation control without creating ad-hoc shadow utilities.
- **Modal card animation** translates 8px on enter, signaling depth via motion in addition to shadow. Subtle and bounded.
- **Border-as-elevation-substitute** for interactive Card hover (`border-color: --wb-border`) — a valid Refactoring UI pattern when shadow can't be used.

### What weakens

- **Button has zero elevation/shadow at any state.** No `--wb-shadow-xs` on default, no shadow-on-hover. UI-SPEC didn't require it, but Refactoring UI specifically calls out subtle shadows on primary buttons as a hierarchy lever. Phase 2 leaves Button visually flat even at the `lg`/primary level.
- **Card interactive hover** doesn't lift via shadow change — just border + bg color. The interactive affordance reads more like a list item than a clickable card.
- **Modal overlay** has no inset/edge shadow on the card — the `--wb-shadow-xl` is dramatic enough that this is fine, but a thin `1px solid var(--wb-border)` inside the overlay could improve definition on bright backgrounds.

### Verdict

Foundational depth ladder is correct, but Button + Card interactive states leave shadow capacity on the table. Easy upgrade in Phase 3.

---

## Pillar 6 — Images / Icons

**Score: 8.5**

### What works

- **Single icon source** (`lucide-react`) — already in deps, zero new packages added. Aligns with UI-SPEC §Registry Safety.
- **Per-size icon mapping table** in `Button.jsx` (`ICON_SIZES = { sm: 14, md: 16, lg: 18 }`) — explicit, discoverable, type-friendly.
- **Decorative icons hidden from a11y tree** via `aria-hidden="true"` on every icon wrapper (Button, Input, Badge, Modal close).
- **Icon-only Buttons enforce labels** — dev-time `console.warn` if neither `children` nor `aria-label` is supplied. Stops a common a11y regression at the component boundary.
- **Password toggle** uses `Eye` / `EyeOff` with `aria-pressed` and dynamic `aria-label`. Pattern matches existing app behavior (CONTEXT.min.md "password visibility toggle... added to both Login and SetPassword pages").
- **No raster assets, no SVG inline strings** introduced — the Select chevron remains owned by `base.css` per UI-SPEC §3.

### What weakens

- **No icon size for Modal close** beyond a hardcoded `<X size={20} />` — fine, but if icon-size tokens existed (`--wb-icon-sm/md/lg`), the chrome would be tunable globally. Not a Phase 2 ask.
- **Badge icon size unspecified** in component code — UI-SPEC §6 says `12 | 14` but the component blindly renders whatever the consumer passes. Could enforce `<Badge.Icon>` or accept a `iconSize="sm" | "md"`.

### Verdict

Icon discipline is tight. Two small ergonomics gaps (no icon-size tokens, Badge icon free-for-all) that are realistically Phase 3 polish.

---

## Pillar 7 — Layout

**Score: 8.5**

### What works

- **Predictable widths via tokens**: Modal sizes (400/500/720/full) are explicit and tied to viewport math (`calc(100vw - var(--wb-space-12) * 2)` for full).
- **Flex composition over grid** — appropriate for chrome-level primitives. Header/body/footer in Modal use simple flex column with `overflow-y: auto` body scroll. Footer sticks via flex order, not absolute positioning.
- **`fullWidth` prop on Button/Input/Select** — explicit opt-in. Prevents the common bug of "block-level form control accidentally dominates a flex row".
- **Card padding scale (none/sm/md/lg → 0/16/24/32)** — three clearly-stepped rhythms; consumer can pick one without thinking about px values.
- **Modal body internal scroll** prevents page scroll bleed; refcount-based body lock (`openModalCount`) supports stacked modals correctly. A subtle bug-class avoided.
- **`text-align: left` on Card** — important when `as="button"` because UA stylesheet centers button text. Easy to forget.

### What weakens

- **Modal `size="full"`** at small viewports could yield negative max-width if `100vw < 96px`. Theoretical (no real device), but unguarded; a `max(...)` or `min(...)` clamp would harden it.
- **Modal overlay `padding: var(--wb-space-12)`** = 48px on all sides. On phones this consumes 96px of horizontal space before the modal even renders. Acceptable per current scope (no responsive redesign in this milestone), but worth flagging when mobile work begins.
- **Card has no built-in header/body/footer slots** by design (UI-SPEC defers compound components). Consumers will likely re-implement spacing patterns in Phase 3+; some duplication risk.

### Verdict

Layout primitives are robust for desktop. Mobile robustness and compound-component ergonomics are deferred — known and tracked.

---

## Top 3 Strengths

1. **Token discipline is exemplary.** Zero raw-hex (excluding the documented two literals `#ffffff` and `rgba(15, 23, 42, 0.36)`) and zero raw-px in any of the six CSS Modules. Verified by grep gate in `02-VERIFICATION.md`. This is the foundational win of the milestone.
2. **Spec-to-code traceability is complete.** Every variant, size, and state in `Button.module.css`, `Input.module.css`, `Modal.module.css`, etc. maps directly to a row in `02-UI-SPEC.md`'s color/spacing/typography tables. A reviewer can audit any CSS rule against the spec in seconds.
3. **Accessibility baseline is enforced at the component boundary.** Icon-only Button warns at runtime when missing `aria-label`; Input wires `aria-required`/`aria-invalid`/`aria-describedby` automatically; Modal implements `role="dialog"` + focus trap + body-scroll refcount + restore-on-close — all without external libs. Consumers cannot accidentally ship inaccessible primitives.

## Top 3 Issues / Follow-ups (advisory, non-blocking)

1. **Disabled state via `opacity: 0.5`** (Button, Input, Select) will fail visually when these primitives are nested inside colored Cards or alerts in Phase 3+. Consider migrating to dedicated `--wb-color-neutral-300` text + `--wb-color-neutral-100` background pairs for disabled. Refactoring UI principle: "color > opacity for state".
2. **Button has no elevation ladder.** No `--wb-shadow-xs` on default, no shadow-on-hover for primary CTAs. The current flat-on-flat-on-flat hierarchy relies entirely on color/size, missing one of the cheapest depth signals available. Easy add in Phase 3 once the rest of the shell migrates.
3. **Card interactive hover signals weakly.** Border-color + background-color shift only — no shadow lift, no transform. When Phase 3 migrates company cards, the interactivity affordance may feel less tangible than the legacy implementation. Consider a `--wb-shadow-sm → --wb-shadow-md` ladder on `:hover`.

---

## Spec Conformance Check

| Contract | Status | Notes |
|----------|--------|-------|
| 6 components delivered (`Button`, `Input`, `Select`, `Modal`, `Card`, `Badge`) | PASS | All present; barrel exports them in spec order. |
| Zero new npm dependencies | PASS | `frontend/package.json` untouched per `02-VERIFICATION.md`. |
| Token-only CSS (`--wb-*`) | PASS | Verified by grep gate; only documented literals (`#ffffff`, `rgba(15, 23, 42, 0.36)`, `2px`) remain — all sanctioned in UI-SPEC. |
| `forwardRef` on Button/Input/Select/Modal | MIXED | Button/Input/Select forward refs (PASS). Modal does NOT forwardRef (UI-SPEC §4 didn't require it; `cardRef` is internal). Acceptable per spec but worth noting if consumers want to programmatically focus the card. |
| Icon-only Button enforcement | PASS | `console.warn` in dev when no `children` and no `aria-label`. |
| Modal portal-only-when-open | PASS | `if (!open) return null;` guards the `createPortal` call. |
| Modal body-scroll refcount | PASS | `openModalCount` module-level counter; supports stacked modals. |
| Modal mousedown→mouseup overlay close | PASS | `handleOverlayMouseDown` arms; `handleOverlayMouseUp` confirms — prevents accidental close on drag-from-card. |
| `prefers-reduced-motion` honored | PASS | All six modules ship the media-query short-circuit. |
| No `text-transform: uppercase` | PASS | grep gate clean. |
| Select preserves base.css chevron | PASS | `Select.module.css` deliberately omits `padding-right`, `appearance: none`, `background-image` per UI-SPEC §3. |
| Helper `cn.js` not exported from `index.js` | PASS | `index.js` exports the 6 components only. |

**One ambiguity**: Modal does not `forwardRef` to the card element. UI-SPEC §4 lists `initialFocusRef` as the focus mechanism (which IS implemented) but does not require a `ref` to the card. Treat as expected behavior; flag for Phase 3 only if consumers complain.

---

## Phase 2 Status (Advisory)

**Overall: passed (advisory).**

- All 7 Refactoring UI principles average ≥ 8.0; weighted average 8.71/10.
- Zero blocking issues. Zero spec deviations.
- Three follow-ups documented above; all are stylistic/UX upgrades, not correctness bugs.
- Phase 2's contract gates (`02-VERIFICATION.md`) already passed independently.

This review is informational. Phase 3 (page migrations) can proceed without changes to the Phase 2 library. Follow-ups can land opportunistically as part of Phase 3+ migrations or be tracked in `.planning/todos/pending/` for a Phase 6 polish pass.

---

## Next

`/clear` then one of:

- `/gsd-verify-work 2` — UAT testing
- `/gsd-plan-phase 3` — plan next phase
