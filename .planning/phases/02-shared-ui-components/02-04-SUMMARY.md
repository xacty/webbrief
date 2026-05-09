---
phase: 02-shared-ui-components
plan: 04
status: complete
date: 2026-05-08
---

# Plan 02-04 Summary — Card + Modal

## What was built

- **Card**: polymorphic via `as` prop (`'div' | 'section' | 'article' | 'button'`). Padding sm/md/lg/none, shadow none/sm/md, radius md/lg/xl. `interactive` (or `as='button'`) enables hover/focus styles. When `as='button'` and no `type` is passed, defaults to `type='button'` so the Card never accidentally submits a parent form.
- **Modal**: renders to `document.body` via `createPortal` ONLY when `open === true` (zero DOM cost when closed). 4 sizes (sm/md/lg/full) at 400/500/720/calc(100vw - 96px) max-widths. ESC closes (when `closeOnEscape`). Drag-safe overlay close via mousedown→mouseup pattern: tracks `downOnOverlayRef` so a click that begins inside the card never triggers close. Focus management: captures previously active element on open; on render, focuses `initialFocusRef` if provided else first focusable inside the card. On close, focus restored. Tab/Shift+Tab focus trap inside card. `role="dialog"`, `aria-modal="true"`, `aria-labelledby={titleId}`. Close button uses `aria-label="Cerrar"` (Spanish per UI-SPEC §Copywriting). Body-scroll refcount via module-level `openModalCount` supports stacked modals.

## Files created

- `frontend/src/components/ui/Card.jsx` (~38 lines, plain function — UI-SPEC §5 says no forwardRef)
- `frontend/src/components/ui/Card.module.css` (token-only colors; padding/shadow/radius modifiers from canonical tokens)
- `frontend/src/components/ui/Modal.jsx` (~190 lines, hooks-based focus trap + body-scroll refcount + mousedown→mouseup overlay)
- `frontend/src/components/ui/Modal.module.css` (uses `var(--wb-z-modal)` exclusively — no numeric z-index; only the documented `rgba(15, 23, 42, 0.36)` overlay literal as raw color)

## Verification

- All 4 files exist
- Card.jsx: cn import, polymorphic via `as`, defaults type=button when as='button'
- Card.module.css: all 4 padding rules, all 3 shadow rules, all 3 radius rules; uses `var(--wb-shadow-sm)`, `var(--wb-radius-4)`; prefers-reduced-motion; zero raw hex; no uppercase
- Modal.jsx: createPortal, role="dialog", aria-modal, aria-labelledby, aria-label="Cerrar"; openModalCount + lockBodyScroll; onMouseDown + onMouseUp on overlay; Escape handler; previousActiveRef restores focus on cleanup; early `if (!open) return null` for zero DOM cost when closed
- Modal.module.css: `var(--wb-z-modal)`, `var(--wb-shadow-xl)`, `var(--wb-radius-4)`, `rgba(15, 23, 42, 0.36)` (single documented exception), all 4 size rules; prefers-reduced-motion disables animations; no numeric z-index; no uppercase

## Notes

- Modal solves the duplication target flagged in CONTEXT.md (CompaniesPage `.modalOverlay` z-index 1000 vs ProjectEditor `.modalCard` z-index 200). The unified overlay sits at exactly one z-index token.
- Body-scroll refcount lets future Phase 4 editor stack modals (e.g., share-link modal over export modal) without losing the lock prematurely.
- No new npm dependencies introduced; only react, react-dom (`createPortal`), lucide-react (`X`).
- No edits to Phase 1 artifacts.
