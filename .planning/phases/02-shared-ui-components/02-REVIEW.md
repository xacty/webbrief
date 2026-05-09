---
phase: 02-shared-ui-components
reviewed: 2026-05-09T01:49:39Z
depth: standard
files_reviewed: 14
files_reviewed_list:
  - frontend/src/components/ui/Badge.jsx
  - frontend/src/components/ui/Badge.module.css
  - frontend/src/components/ui/Button.jsx
  - frontend/src/components/ui/Button.module.css
  - frontend/src/components/ui/Card.jsx
  - frontend/src/components/ui/Card.module.css
  - frontend/src/components/ui/Input.jsx
  - frontend/src/components/ui/Input.module.css
  - frontend/src/components/ui/Modal.jsx
  - frontend/src/components/ui/Modal.module.css
  - frontend/src/components/ui/Select.jsx
  - frontend/src/components/ui/Select.module.css
  - frontend/src/components/ui/cn.js
  - frontend/src/components/ui/index.js
findings:
  critical: 0
  warning: 4
  info: 1
  total: 5
status: issues_found
---

# Phase 2: Code Review Report

**Reviewed:** 2026-05-09T01:49:39Z
**Depth:** standard
**Files Reviewed:** 14
**Status:** issues_found

## Summary

Reviewed the 13 component files (Button, Badge, Input, Select, Card, Modal × `.jsx` + `.module.css`) plus `cn.js` and `index.js` against the Phase 2 UI-SPEC. The library is well-structured: React functional components with hooks, `forwardRef` applied where the spec requires (Button, Input, Select), zero new npm dependencies, all colors/spacing/radii/typography pulled from `--wb-*` tokens (only the explicitly authorized exceptions: `#ffffff` text inside Button primary/danger, and `rgba(15,23,42,0.36)` overlay on Modal because CSS variables don't expand inside `rgba()`). Imports are all relative within `components/ui/` or from existing dependencies (`react`, `react-dom`, `lucide-react`). No security issues — no `dangerouslySetInnerHTML`, no `eval`, no string-built HTML, no hardcoded credentials.

Four accessibility/correctness warnings worth fixing before consumers (Phase 3+) start adopting the primitives:

- **Spread order on Input/Select clobbers ARIA wiring** — callers can accidentally override `aria-invalid`, `aria-describedby`, or `id` via `...rest`.
- **Modal initial-focus effect re-runs on `initialFocusRef` identity changes** — if a consumer creates the ref inline or memo-busts it, the effect cleanup re-fires while the modal is still open, corrupting `previousActiveRef`.
- **Modal allows `title`-less usage with no `aria-label` fallback** — produces a dialog with no accessible name when `title` prop is omitted.

One Info-level dead-CSS rule in Badge.

## Critical Issues

(none)

## Warnings

### WR-01: Input — `{...rest}` spread overrides explicit ARIA wiring

**File:** `frontend/src/components/ui/Input.jsx:86-97`
**Issue:** The `<input>` lists `id`, `type`, `disabled`, `required`, `aria-required`, `aria-invalid`, `aria-describedby`, and `className` BEFORE `{...rest}`. JSX prop merging makes the LAST value win, so a caller passing `aria-invalid={false}`, `aria-describedby="x"`, or `id="custom"` via spread will silently disable the component's own error-wiring and break the `<label htmlFor>` ↔ `<input id>` link the component just built. Same risk for `type` (overrides password toggle's behavior) and `disabled` (out of sync with `passwordToggle.disabled`).
**Fix:** Move `{...rest}` BEFORE the explicit attributes that the component owns:
```jsx
<input
  {...rest}
  ref={ref}
  id={inputId}
  type={effectiveType}
  disabled={disabled}
  required={required}
  aria-required={required ? 'true' : undefined}
  aria-invalid={errorFlag ? 'true' : undefined}
  aria-describedby={helperId}
  className={styles.input}
/>
```
This preserves the escape hatch (`...rest` for `name`, `value`, `onChange`, `placeholder`, `autoComplete`, etc.) while making the component's a11y contract authoritative.

### WR-02: Select — `{...rest}` spread overrides explicit ARIA wiring

**File:** `frontend/src/components/ui/Select.jsx:63-77`
**Issue:** Same pattern as WR-01. The `<select>` element places `id`, `disabled`, `required`, `aria-required`, `aria-invalid`, `aria-describedby`, and `className` BEFORE `{...rest}`, so spread props can clobber the wiring that ties the helper/error message and label to the control.
**Fix:** Move `{...rest}` to first position on the `<select>` element, mirroring the WR-01 fix:
```jsx
<select
  {...rest}
  ref={ref}
  id={selectId}
  name={name}
  value={value}
  defaultValue={defaultValue}
  onChange={onChange}
  disabled={disabled}
  required={required}
  aria-required={required ? 'true' : undefined}
  aria-invalid={errorFlag ? 'true' : undefined}
  aria-describedby={helperId}
  className={styles.select}
>
```

### WR-03: Modal — focus-restore effect cleanup re-runs on `initialFocusRef` changes

**File:** `frontend/src/components/ui/Modal.jsx:70-105`
**Issue:** The `useLayoutEffect` depends on `[open, initialFocusRef]`. If a parent re-renders with a different `initialFocusRef` identity (common when callers do `useRef()` inline or pass `useMemo`-ed refs that get recomputed), React tears down the effect WHILE the modal is still open. The cleanup at lines 100-103 calls `previousActiveRef.current.focus()` — focus jumps back to the pre-modal element mid-interaction. The effect body then runs again (line 72-73) and re-saves `document.activeElement` (which is now the previous element, since cleanup just focused it) into `previousActiveRef.current`, so the real close-time restore now points to the wrong element. End result: focus pops out of the modal during use, and on close it doesn't return to the original trigger.
**Fix:** Split the effect — capture/restore `previousActiveRef` only on `open` transitions; let initial-focus logic depend on `[open, initialFocusRef]` separately and not run cleanup against `previousActiveRef`. Minimal patch:
```jsx
// Effect 1: save & restore previously active element ONLY on open toggle
useLayoutEffect(() => {
  if (!open) return undefined;
  previousActiveRef.current =
    typeof document !== 'undefined' ? document.activeElement : null;
  return () => {
    const prev = previousActiveRef.current;
    if (prev && typeof prev.focus === 'function') prev.focus();
  };
}, [open]); // <-- depend on open only

// Effect 2: initial focus, can re-run if initialFocusRef changes without
// touching previousActiveRef
useLayoutEffect(() => {
  if (!open) return undefined;
  const raf = window.requestAnimationFrame
    ? window.requestAnimationFrame(focusInitial)
    : setTimeout(focusInitial, 0);
  function focusInitial() {
    if (initialFocusRef?.current) { initialFocusRef.current.focus?.(); return; }
    const focusables = getFocusable(cardRef.current);
    if (focusables.length > 0) focusables[0].focus?.();
    else cardRef.current?.focus?.();
  }
  return () => {
    if (window.cancelAnimationFrame && typeof raf === 'number') {
      window.cancelAnimationFrame(raf);
    } else { clearTimeout(raf); }
  };
}, [open, initialFocusRef]);
```

### WR-04: Modal — no accessible name when `title` is omitted

**File:** `frontend/src/components/ui/Modal.jsx:161-170`
**Issue:** UI-SPEC §4 requires `role="dialog"` + `aria-modal="true"` + `aria-labelledby={titleId}`. The component sets `aria-labelledby={title ? titleId : undefined}`, so when a consumer renders a modal WITHOUT a title (valid use: confirmation dialogs, image previews), the dialog has neither `aria-labelledby` nor `aria-label` — screen readers announce it as an unnamed dialog. There is no `ariaLabel` prop to compensate.
**Fix:** Accept an optional `ariaLabel` prop and apply it when there's no title. Add to the destructure and the dialog element:
```jsx
// destructure
ariaLabel,

// on the dialog div
aria-labelledby={title ? titleId : undefined}
aria-label={!title ? ariaLabel : undefined}
aria-describedby={ariaDescribedBy}
```
Optionally `console.warn` in dev when neither `title` nor `ariaLabel` is provided, mirroring the Button icon-only warning pattern (Button.jsx:28-38).

## Info

### IN-01: Badge — empty `.size_md` rule is dead CSS

**File:** `frontend/src/components/ui/Badge.module.css:16-18`
**Issue:** `.size_md { /* base — no overrides needed */ }` declares an empty rule. CSS Modules will still emit a hashed class name and an empty rule into the bundle. Harmless but adds noise.
**Fix:** Remove the empty rule and the corresponding modifier output by either deleting the block entirely OR documenting via comment without selector:
```css
/* Size modifiers — md is the base; sm tightens vertical padding (no .size_md class needed) */
.size_sm {
  padding: 2px var(--wb-space-2);
}
```
The `cn(...)` call in Badge.jsx will resolve `styles['size_md']` to `undefined`, which `cn` already skips silently — no JSX change required.

---

_Reviewed: 2026-05-09T01:49:39Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
