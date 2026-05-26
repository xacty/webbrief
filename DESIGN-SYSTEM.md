# WeBrief Design System

> Single source of truth for design tokens, UI patterns, and visual conventions.
> Read this before touching any `frontend/src/` file that produces a visible
> surface. Read order: `AI_GLOBAL.md` → `CONTEXT.min.md` → this file.

---

## 1. Tokens

All visual values live as CSS custom properties in
[`frontend/src/styles/tokens.css`](frontend/src/styles/tokens.css). **Never
hardcode hex colors, pixel sizes, font sizes, or shadows in CSS modules.** If a
value you need doesn't have a token, add the token to `tokens.css` first.

### Token families

| Family | Examples | What it's for |
|---|---|---|
| `--wb-color-*` | `--wb-color-primary-500`, `--wb-color-neutral-50`, `--wb-color-danger-600` | Branded color scales (50–900) |
| `--wb-text`, `--wb-text-muted`, `--wb-bg`, `--wb-surface`, `--wb-surface-muted`, `--wb-border`, `--wb-border-strong` | semantic surface roles | Surfaces that **invert in dark mode** |
| `--wb-canvas-*` | `--wb-canvas-bg`, `--wb-canvas-text`, `--wb-canvas-link` | Editor canvas — **NEVER inverts** (always paper-light) |
| `--wb-glass-*` | `--wb-glass-bg`, `--wb-glass-border`, `--wb-glass-shadow` | Translucent floating chrome (toolbars, pills) |
| `--wb-space-*` | `--wb-space-1` (4px) … `--wb-space-16` (64px) | Spacing scale; use these, not raw `px` |
| `--wb-text-*` | `--wb-text-xs` (12px) … `--wb-text-4xl` (36px) | Font sizes |
| `--wb-leading-*` | `--wb-leading-tight`, `--wb-leading-snug`, `--wb-leading-base`, `--wb-leading-relaxed` | Line heights |
| `--wb-weight-*` | `--wb-weight-regular`, `--wb-weight-medium`, `--wb-weight-semibold`, `--wb-weight-bold` | Font weights |
| `--wb-radius-*` | `--wb-radius-xs` (4px), `--wb-radius-2` (8px), `--wb-radius-3` (12px), `--wb-radius-4` (16px), `--wb-radius-full` (9999px) | Border radii; see Border-radius rule below |
| `--wb-shadow-*` | `--wb-shadow-sm`, `--wb-shadow-md`, `--wb-shadow-lg`, `--wb-shadow-card` | Elevation shadows |
| `--wb-z-*` | `--wb-z-base` (1), `--wb-z-sticky` (200), `--wb-z-overlay` (900), `--wb-z-modal` (1000), `--wb-z-popover` (1100), `--wb-z-tooltip` (1200) | Stacking tiers |
| `--wb-content-width` | `1100px` | Max content column width |

### Deprecated tokens — do NOT use

These were the legacy editor chrome tokens before the visual refresh. They
still exist for canvas-internal styling (tooltip backgrounds inside the
canvas) but should NOT be used for chrome surfaces:

- `--wb-editor-bg`, `--wb-editor-surface`, `--wb-editor-text*`, `--wb-editor-border*` → use shell tokens (`--wb-surface`, `--wb-text`, `--wb-border`, etc.)

### Border-radius rule

This came out of a UI session and is **load-bearing** — get it wrong and the
app feels inconsistent.

- `--wb-radius-full` — **labels and status pills ONLY** (e.g., role badge,
  notification indicator). Never on a clickable element.
- `--wb-radius-3` (12px) — **container pills that contain clickables**
  (e.g., floating "Ver como" pill, toolbar, Brief/Handoff/Preview wrapper).
- `--wb-radius-2` (8px) — **buttons, inputs, selects, individual clickables**.
- `--wb-radius-xs` (4px) — dropdown items, small interactive surfaces inside
  containers.

If you find yourself adding `border-radius: 50%` or `9999px` to a button,
stop. Use `--wb-radius-2`.

### Off-canon literals (kept on purpose)

A few hex literals survive the token migration because they don't have a
clean token equivalent yet. They're commented `/* keep literal — ... */`
right in the CSS module. Examples:

- `#f0f4f9`, `#e8f0fe`, `#d2e3fc`, `#e0f0ff`, `#e5e7eb` (legacy neutrals)
- Some `rgba(...)` alpha overlays that aren't expressible as a token alpha

Don't add new ones. Reuse existing literals if you must, and flag for a
follow-up palette decision.

---

## 2. Visual principles

These principles come from real bugs caught in review. They're listed
deliberately because every one of them has bitten us.

### Gestalt proximity → groups are visual

Tightly-related elements get *small* spacing between them; unrelated
elements get *large* spacing. Headers and their subtitles are ONE block.
Section breaks are TWO blocks. Pull this off with margins, not borders, where
possible — borders read as harder separation than is usually intended.

**Case study (UserEditModal):** The modal's subtitle drifted ~32px below the
title because Modal's header `padding-bottom: var(--wb-space-4)` and body
`padding-top: var(--wb-space-4)` stacked. Fix: a `margin-top:
calc(var(--wb-space-2) * -1)` on the subtitle pulled it close so title + subtitle
read as one header group.

### Hierarchy through typography, not just position

A section title is `var(--wb-text-base)` + `--wb-weight-semibold`. A section
hint underneath is `var(--wb-text-sm)` + `--wb-color-neutral-600`. Don't
use **bold** as the only differentiator — pair it with size and color so
the eye groups correctly even at low contrast.

### Section anatomy (replicable)

Every section in a long modal/page follows this pattern:

```
┌─ border-top (var(--wb-border)) ──────────────┐
│  Section title           (semibold)          │  ← title
│  One-line contextual hint (text-sm, muted)   │  ← .sectionHint
│                                              │
│  Content (list, form, actions)               │  ← whatever
│                                              │
│  Optional footer (stable layout)             │  ← if present
└──────────────────────────────────────────────┘
```

Examples:
- [`UserEditModal`](frontend/src/components/users/UserEditModal.jsx) — three
  stacked sections (identity form, Sesiones activas, Contraseña), each with
  the same anatomy
- [`SessionsList`](frontend/src/components/users/SessionsList.jsx)
- [`PasswordSection`](frontend/src/components/users/PasswordSection.jsx)

When adding a new section to an existing modal, copy this pattern. Don't
invent a new vocabulary.

### Stable layouts — no jumpy reflows

If the same row has a different number of children depending on state, it
will reflow visibly (often jumping from 1 line to 2). Two ways to avoid:

1. **Communicate state through the SAME child's content** (e.g., button label
   reads "Cerrar seleccionadas" vs "Cerrar seleccionadas (3)") instead of
   adding a new sibling.
2. **Move the variable-length text OUT of the row** (e.g., put a contextual
   hint above the action row, not between its buttons).

**Case study (SessionsList footer):** The footer had `[toggle] [hint] [close]`
with `flex-wrap: wrap`. The hint swelled from "Marcá sesiones para cerrar."
to "Las marcadas se cerrarán al guardar contraseña." once items were selected,
pushing the close button onto a second line. Fix: moved the hint out of the
footer into a `.sectionHint` above the list; footer became a stable 2-column
layout (toggle left, close right).

---

## 3. Component patterns

### Modal anatomy

The base [`Modal`](frontend/src/components/ui/Modal.jsx) is a shell —
header (title + close button) and body (your content). Anything more
structured belongs in YOUR module CSS, not in Modal's.

Use this skeleton for any user-edit-like modal:

```jsx
<Modal title="..." ariaDescribedBy="some-id">
  <p id="some-id" className={styles.subtitle}>{subtitle}</p>

  <div className={styles.avatarRow}>{...}</div>      {/* optional */}

  <form className={styles.form}>
    {/* identity fields, uniform gap via .form */}
    <div className={styles.actions}>                  {/* border-top divides */}
      <Button variant="ghost">Cancelar</Button>
      <Button variant="primary" type="submit">Guardar cambios</Button>
    </div>
  </form>

  {/* Additional independent sections (Sessions, Password, etc.) live
      OUTSIDE the form so they don't share submit state. */}
  <SessionsList ... />
  <PasswordSection ... />
</Modal>
```

Key rules:
- Subtitle uses `margin-top: calc(var(--wb-space-2) * -1)` to fight Modal's
  body padding-top.
- `.actions` has `border-top: 1px solid var(--wb-border)` and `padding-top`
  so it visually separates from the form.
- Additional sections (Sessions, Password) live as siblings of `<form>`,
  each with their own `.section` class that owns its own border-top.

### Page header pattern (Modern SaaS shell)

Used on every admin-shell page (Empresas, Usuarios, Trash, Integraciones,
Security trio):

```
.pageHeader
  └── .pageHeaderInner
       └── .titleRow
            └── .headerMain
                 ├── <h1 className={styles.title}>{Page title}</h1>
                 └── <p className={styles.headerMeta}>{meta line}</p>
```

The header anchors to the top of the content column with a subtle bottom
divider. The "meta line" includes counts and quick description
(e.g., `"6 proyectos · 0 miembros · Admin de plataforma"`).

### Tab pattern

Used by [`CompanyPage`](frontend/src/pages/CompanyPage.jsx) (Proyectos /
Equipo / Actividad) and [`SecurityShell`](frontend/src/components/SecurityShell.jsx)
(Eventos / Bloqueos activos / Errores técnicos):

```jsx
<div className={styles.tabBar} role="tablist">
  {tabs.map((tab) => (
    <button
      role="tab"
      aria-selected={activeTab === tab}
      className={activeTab === tab ? `${styles.tab} ${styles.tabActive}` : styles.tab}
      onClick={() => setActiveTab(tab)}
    >
      {label}
    </button>
  ))}
</div>

{tabs.map((tab) => (
  <div role="tabpanel" hidden={activeTab !== tab} className={styles.tabPanel}>
    {...}
  </div>
))}
```

Active state is an underline indicator under the label, NOT a background
fill. Underline color is `--wb-color-primary-600`.

### Segmented control (Tesla-style)

Used for Brief/Handoff/Preview switching and Des/Dev audience toggle in the
editor. The indicator is an absolutely-positioned pill that slides via
`transform: translateX(...)` based on `--seg-index`:

```css
.segmentedControl {
  position: relative;
  display: grid;
  grid-template-columns: repeat(var(--seg-count, 2), 1fr);
}
.segmentedIndicator {
  position: absolute;
  inset: 0 auto 0 0;
  width: calc(100% / var(--seg-count, 2));
  transform: translateX(calc(var(--seg-index, 0) * 100%));
  transition: transform 340ms cubic-bezier(0.4, 0, 0.2, 1);
  background: var(--wb-color-primary-600);
  border-radius: var(--wb-radius-2);
  z-index: 0;
}
.segmentedOption {
  position: relative;
  z-index: 1;
  /* text color flips via .segmentedOptionActive */
}
```

JSX sets the count and index as inline CSS custom properties:

```jsx
<div className={styles.segmentedControl} style={{ '--seg-count': options.length, '--seg-index': activeIndex }}>
  <span className={styles.segmentedIndicator} aria-hidden />
  {options.map((opt, i) => (
    <button className={cx(styles.segmentedOption, i === activeIndex && styles.segmentedOptionActive)}>
      {opt.label}
    </button>
  ))}
</div>
```

---

## 4. Layout patterns

### `min-width: 0` on flex children

Flex items have `min-width: auto` by default, which means they refuse to
shrink below their *content's natural width*. In a row layout this lets a
wide child force the row to expand — silently breaking any overflow logic
that depends on the container's clientWidth.

**Always add `min-width: 0`** to flex children that:
- Need to shrink when the container narrows
- Host their own overflow detection (toolbar with overflow menu)
- Contain `text-overflow: ellipsis` content
- Have `overflow: hidden` themselves but live inside a wider flex parent

**Case study (editor toolbar overflow):** `.centerPanel` (the canvas column,
a flex item inside `.body` which is a flex row) lacked `min-width: 0`. With
its default `min-width: auto`, it grew to the toolbar's natural content
width, so the toolbar's `clientWidth` always equaled the natural width —
the overflow detector concluded "everything fits" regardless of viewport
width. Adding `min-width: 0` fixed it.

### Stacking contexts and `backdrop-filter`

`backdrop-filter` **always** creates a new stacking context per spec — and
that context **traps any z-index inside the element**. If a child needs to
appear over content outside that subtree, you cannot lift the child's
z-index past it; you have to lift the **parent's z-index** to take the
entire stacking context up.

**Case study (toolbar dropdown vs sticky bubbles):** The editor toolbar has
`backdrop-filter: saturate(180%) blur(14px)`. A dropdown inside the toolbar
was being painted under the canvas's section-divider bubbles (which sit at
`--wb-z-sticky = 200`) even though the dropdown was set to
`--wb-z-popover = 1100`. The dropdown's z lived inside the toolbar's
stacking context, which itself was at default z. Fix: bump the toolbar to
`--wb-z-overlay = 900` so its whole stacking context floats above the
sticky bubbles (200), staying under modals (1000), popovers (1100), and
tooltips (1200).

### CSS module class specificity

CSS modules generate scoped class names but the **cascade still applies**.
Two single-class selectors with the same specificity (0,1,0) resolve by
order of declaration in the source. If your "hidden" or "active" modifier
ships AFTER the base class in the same file, you lose.

Prefer the **double-class modifier pattern** for state modifiers that must
beat the base:

```css
/* WRONG — same specificity, declaration order decides, fragile */
.toolbarGroup { display: inline-flex; }       /* declared later → wins */
.toolbarGroupHidden { display: none; }        /* declared earlier → loses */

/* RIGHT — higher specificity (0,2,0), wins regardless of order */
.toolbarGroup.toolbarGroupHidden { display: none; }
```

Apply both classes in JSX: `cx(styles.toolbarGroup, isHidden && styles.toolbarGroupHidden)`.

### Editor toolbar overflow math

Documented because it bit us twice. When summing the natural width of a
flex container's children to detect overflow:

```
natural width = padding
              + sum(child widths)
              + (n - 1) × (gap + divider + gap)
```

The `gap` (from `gap: var(--wb-space-2)` on the flex container) applies
**between every pair of adjacent children**, and dividers are themselves
flex children — so between two groups the actual spacing is
`gap + divider + gap = 25px`, not 9px.

When reserving room for a "more" button that appears only when overflow
exists, reserve `gap + divider + gap + button = 57px` (button + its leading
divider + gaps on both sides of the divider).

Implementation lives in [`Toolbar.computeOverflow`](frontend/src/pages/ProjectEditor.jsx)
inside `ProjectEditor.jsx`.

### `useLayoutEffect` closure stale on resize observers

If your `useLayoutEffect` sets up a `ResizeObserver` with empty deps `[]`
and the callback reads state from the closure, that state value is **frozen
at mount time** — never updates as the component re-renders.

Always use **functional setState** inside resize observer callbacks:

```js
// WRONG — guard reads closure value (mount-time []), never fires
if (overflowedGroupIds.length > 0) setOverflowedGroupIds([])

// RIGHT — setter sees the latest state via prev
setOverflowedGroupIds((prev) => (prev.length === 0 ? prev : []))
```

This bit us when "expand the window after items overflowed" never restored
the hidden items because the guard always read `[]`.

---

## 5. Component inventory

Where things live and when to use each. **If a component listed here
already exists, use it.** Do not re-author the inline form, inline tabs,
inline section card, etc.

### Modals

| Component | Path | When to use |
|---|---|---|
| `Modal` | [`frontend/src/components/ui/Modal.jsx`](frontend/src/components/ui/Modal.jsx) | Base shell for any modal. Title + close button + body slot. |
| `UserEditModal` | [`frontend/src/components/users/UserEditModal.jsx`](frontend/src/components/users/UserEditModal.jsx) | Edit a user. Use `scope="global"` from UsersPage (full identity edit), `scope="company"` from CompanyPage Equipo tab (single-company role edit). Mounts `SessionsList` + `PasswordSection` inside when caller has permission. |
| `MoveToCompanyModal` | [`frontend/src/components/MoveToCompanyModal.jsx`](frontend/src/components/MoveToCompanyModal.jsx) | Bulk-move projects between companies. |

### Modal sub-sections

| Component | Path | Pattern |
|---|---|---|
| `SessionsList` | [`frontend/src/components/users/SessionsList.jsx`](frontend/src/components/users/SessionsList.jsx) | Section anatomy. List of active sessions with checkboxes, stable 2-column footer (toggle + close-selected). |
| `PasswordSection` | [`frontend/src/components/users/PasswordSection.jsx`](frontend/src/components/users/PasswordSection.jsx) | Section anatomy. Generate-random OR set-manual flow. Section hint communicates the relationship to selected sessions. |

### Shells

| Component | Path | When to use |
|---|---|---|
| `AppShell` | [`frontend/src/components/layout/AppShell.jsx`](frontend/src/components/layout/AppShell.jsx) | The admin sidebar + main column. Used by every authenticated route except the editor. |
| `SecurityShell` | [`frontend/src/components/SecurityShell.jsx`](frontend/src/components/SecurityShell.jsx) | Tabbed shell for the /security/* routes (Eventos / Bloqueos / Errores). |

### UI primitives

[`frontend/src/components/ui/`](frontend/src/components/ui/)

`Badge`, `Button`, `Card`, `Input`, `KebabMenu`, `Modal`, `Select`. All
take a consistent `size`/`variant` API where applicable. The `Select`
component is a branded listbox (replaces native `<select>` for any user-
facing dropdown).

---

## 6. Anti-patterns — do NOT

These came up in real PRs / scans. Re-introducing them costs review time.

- **No `RESEND_API_*` strings as labels in demo data.** GitGuardian's
  pattern matches the env-var name even when the string isn't a key.
  Use `EmailProviderError` or similar. (Same rule for `SUPABASE_SERVICE_ROLE`,
  `STRIPE_*`, `AWS_*` etc. — if you need a literal that contains the env-var
  name, rename it to a generic equivalent.)
- **No hints inside flex footers that change length based on state.**
  Move the hint above the row; communicate state via button labels instead.
- **No inline `style={{ ... }}` for any pattern that repeats.** Extract a
  class. Inline styles fight tokens (you'll hardcode `8px` next to a token
  consumer) and break dark mode.
- **No legacy `--wb-editor-*` chrome tokens in new code.** The migration
  is complete except inside the canvas itself. Use shell tokens.
- **No `border-radius: 9999px` / `50%` / `var(--wb-radius-full)` on buttons,
  inputs, or anything clickable.** See Border-radius rule §1.
- **No `flex: 1` without `min-width: 0`** if anything inside might overflow.
- **No `setOverflowedGroupIds([])` (closure-stale guard).** Use functional
  setState everywhere inside resize observer callbacks.
- **No reading from `scrollWidth` in overflow detection** when the visible
  content shrinks as state changes — use cached `offsetWidth` measured
  during the all-visible mount, with proper gap math (see §4).

---

## 7. Maintenance

This file is part of the read-order chain for new AI sessions:
`AI_GLOBAL.md` → `CONTEXT.min.md` → this file (when touching UI).

**Update this file whenever:**
- A new token family is added to `tokens.css`
- A new component pattern is established that other pages should reuse
- An anti-pattern is discovered in code review
- A "case study" lesson is learned the hard way (like the closure-stale
  bug, the `min-width: 0` bug, the stacking-context bug)

**Don't update it for:**
- One-off bug fixes that don't generalize
- Feature work that's specific to one screen
- Implementation details that should live in the file's own comments

Conventional-commit prefix for changes here: `docs(design-system): ...`

When making a code change that references this doc, link to the section
in the relevant file's leading comment:

```jsx
/**
 * Section anatomy — see DESIGN-SYSTEM.md §"Section anatomy"
 */
```

This lets any IA or dev opening the file know which pattern applies
without having to reverse-engineer it.
