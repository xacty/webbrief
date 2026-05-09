---
phase: 02-shared-ui-components
fixed_at: 2026-05-09T01:52:23Z
review_path: .planning/phases/02-shared-ui-components/02-REVIEW.md
iteration: 1
findings_in_scope: 4
fixed: 4
skipped: 0
status: all_fixed
---

# Phase 2: Code Review Fix Report

**Fixed at:** 2026-05-09T01:52:23Z
**Source review:** `.planning/phases/02-shared-ui-components/02-REVIEW.md`
**Iteration:** 1

**Summary:**
- Findings in scope (Critical + Warning): 4
- Fixed: 4
- Skipped: 0
- Out of scope (Info, fix_scope=critical_warning): 1 (IN-01 left for documentation)

## Fixed Issues

### WR-01: Input — `{...rest}` spread overrides explicit ARIA wiring

**Files modified:** `frontend/src/components/ui/Input.jsx`
**Commit:** df9b266
**Applied fix:** Moved `{...rest}` to the first prop on the `<input>` element so that the component-owned `id`, `type`, `disabled`, `required`, `aria-required`, `aria-invalid`, `aria-describedby`, and `className` are now applied AFTER the spread and become authoritative. Callers can still pass `name`, `value`, `onChange`, `placeholder`, `autoComplete`, etc. via rest.

### WR-02: Select — `{...rest}` spread overrides explicit ARIA wiring

**Files modified:** `frontend/src/components/ui/Select.jsx`
**Commit:** a00a188
**Applied fix:** Same pattern as WR-01 — `{...rest}` moved to first position on `<select>`, with explicit `id`, `name`, `value`, `defaultValue`, `onChange`, `disabled`, `required`, `aria-required`, `aria-invalid`, `aria-describedby`, and `className` now winning over any rest-spread overrides.

### WR-03: Modal — focus-restore effect cleanup re-runs on `initialFocusRef` changes

**Files modified:** `frontend/src/components/ui/Modal.jsx`
**Commit:** c5ce438 (combined with WR-04)
**Applied fix:** Split the previous `useLayoutEffect` (deps `[open, initialFocusRef]`) into two effects:
- **Effect 1** depends on `[open]` only and owns the previously-active-element capture/restore. Cleanup on close focuses `previousActiveRef.current`. Decoupled from `initialFocusRef` identity so a parent re-render with a new ref does not corrupt the saved reference mid-modal.
- **Effect 2** depends on `[open, initialFocusRef]` and only runs the deferred initial-focus logic. Its cleanup cancels the rAF/timeout but does NOT touch `previousActiveRef`.

Net effect: focus on the modal trigger is now reliably restored on close, even when consumers pass an `initialFocusRef` that changes identity across renders.

### WR-04: Modal — no accessible name when `title` is omitted

**Files modified:** `frontend/src/components/ui/Modal.jsx`
**Commit:** c5ce438 (combined with WR-03)
**Applied fix:** Added `ariaLabel` prop to the destructured props. When `title` is absent, the dialog now renders `aria-label={ariaLabel}` instead of nothing, satisfying the WAI-ARIA requirement that `role="dialog"` carry an accessible name. Added a `console.warn` fired once per instance when both `title` and `ariaLabel` are missing — mirrors the existing icon-only Button warning pattern. `ariaLabel` is documented for future migration to UI-SPEC §4.

## Skipped Issues

(none — all in-scope findings were fixed)

## Out-of-Scope (Info)

### IN-01: Badge — empty `.size_md` rule is dead CSS

Not applied (fix_scope=critical_warning). Defer until a follow-up cleanup pass; harmless dead rule, no behavioral impact.

## Verification

- **Tier 1 (re-read):** All three modified files re-read post-edit; fix text confirmed present, surrounding code intact.
- **Tier 2 (syntax check):** `node --check` does not support `.jsx` (Node 25 ESM loader). Tier 1 fallback applied per `verification_strategy.md`.
- **Tier 3 (build smoke):** Ran `npx vite build` from `frontend/` — build succeeded in 2.39s, all 14 chunks emitted, no errors. This validates JSX parses, all imports resolve, and the new `ariaLabel` prop in Modal.jsx is syntactically valid React.

---

_Fixed: 2026-05-09T01:52:23Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
