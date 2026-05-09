---
phase: 04-editor-unification
plan: 07
status: complete
type: execute
wave: 7
requirements: [UI-07]
key_files:
  created: []
  modified:
    - frontend/src/pages/ProjectEditor.module.css
    - frontend/src/pages/ProjectEditorNav.module.css
    - frontend/src/pages/ProjectEditorToolbar.module.css
    - frontend/src/pages/ProjectEditorPanels.module.css
    - frontend/src/pages/ProjectEditorSeoRules.module.css
    - frontend/src/components/editor/CommentMarginCards.module.css
    - frontend/src/components/editor/CommentsUI.module.css
    - frontend/src/components/editor/EditorContextMenu.module.css
commits:
  - 5f4d1ba
---

# Plan 04-07 — Editor z-index tokenization (UI-07)

## Inventory (32 declarations, 8 files)

| File | Line | Old value | Selector / role | New value |
|---|---|---|---|---|
| ProjectEditorNav.module.css | 192 | 100 | sticky chrome (`.navbar` or related) | `var(--wb-z-sticky)` |
| ProjectEditorNav.module.css | 363 | 1000 | page-pill menu / popover | `var(--wb-z-popover)` |
| ProjectEditorNav.module.css | 502 | 1000 | bell dropdown / popover | `var(--wb-z-popover)` |
| ProjectEditor.module.css | 196 | 500 | imageContextMenu | `var(--wb-z-popover)` |
| ProjectEditor.module.css | 248 | 9999 | confirmOverlay (page-delete) | `var(--wb-z-modal)` |
| ProjectEditor.module.css | 311 | 120 | floatingBar bottom chrome | `var(--wb-z-sticky)` |
| ProjectEditor.module.css | 412 | 200 | modalOverlay (FAQ + section name) | `var(--wb-z-modal)` |
| ProjectEditor.module.css | 624 | 20 | typeLabelItem | `var(--wb-z-sticky)` |
| ProjectEditor.module.css | 653 | 50 | typeLabelDropdown | `var(--wb-z-sticky)` |
| ProjectEditor.module.css | 678 | 1400 | floatingTooltip (Google-Docs style) | `var(--wb-z-tooltip)` |
| ProjectEditor.module.css | 733 | 20 | activityMarkerBtn | `var(--wb-z-sticky)` |
| ProjectEditor.module.css | 766 | 300 | tableCtxMenu | `var(--wb-z-popover)` |
| ProjectEditor.module.css | 814 | 10 | tableInlineBtn | `var(--wb-z-sticky)` |
| ProjectEditor.module.css | 863 | 20 | canvasAddSectionWrap | `var(--wb-z-sticky)` |
| ProjectEditorToolbar.module.css | 11 | 120 | `.toolbar` sticky | `var(--wb-z-sticky)` |
| ProjectEditorToolbar.module.css | 46 | 80 | `.dropdown` (toolbar dropdown) | `var(--wb-z-sticky)` |
| ProjectEditorToolbar.module.css | 214 | 120 | toolbar inner element | `var(--wb-z-sticky)` |
| ProjectEditorPanels.module.css | 340 | 100 | sticky panel chrome | `var(--wb-z-sticky)` |
| ProjectEditorSeoRules.module.css | 3 | 1 | tray base | `var(--wb-z-base)` |
| ProjectEditorSeoRules.module.css | 38 | 2 | tray inner stack | `var(--wb-z-base)` |
| ProjectEditorSeoRules.module.css | 55 | 20 | tray sticky element | `var(--wb-z-sticky)` |
| ProjectEditorSeoRules.module.css | 177 | 70 | tray expanded popover | `var(--wb-z-sticky)` |
| CommentMarginCards.module.css | 10 | 6 | `.cardsLayer` | `var(--wb-z-sticky)` |
| CommentMarginCards.module.css | 39 | 8 | `.card` active | `var(--wb-z-sticky)` |
| CommentMarginCards.module.css | 45 | 1100 | `.commentMenu` (⋮) | `var(--wb-z-popover)` |
| CommentMarginCards.module.css | 64 | 2 | inner card stack | `var(--wb-z-base)` |
| CommentMarginCards.module.css | 87 | 2 | inner card stack | `var(--wb-z-base)` |
| CommentMarginCards.module.css | 342 | 1500 | `.commentMenu` popover | `var(--wb-z-popover)` |
| CommentsUI.module.css | 283 | 1100 | `.composer` popover | `var(--wb-z-popover)` |
| CommentsUI.module.css | 356 | 1200 | `.mentionsDropdown` | `var(--wb-z-popover)` (with comment) |
| EditorContextMenu.module.css | 3 | 1500 | `.menu` (right-click main) | `calc(var(--wb-z-popover) + 1)` (UI-SPEC §Deviation note 2 — sits above margin cards) |
| EditorContextMenu.module.css | 99 | 1600 | `.submenu` | `calc(var(--wb-z-popover) + 2)` (sits above parent) |

## UI-SPEC §Deviations honored

1. **Single sticky tier** — all 14 sticky-class values (6, 8, 10, 20, 50, 70, 80, 100, 120) collapsed to `var(--wb-z-sticky)`. No `--wb-z-sticky-elevated` token introduced (no stacking bug surfaced via build / code review).
2. **EditorContextMenu +1 offset** — main menu uses `calc(var(--wb-z-popover) + 1)`, submenu uses `calc(--wb-z-popover) + 2)`. Inline CSS comments document the offsets.

## Acceptance gates (all PASS)

- `grep -nE '^\s*z-index:\s*[0-9]+(\s*;|\s+!important)'` on all 8 files returns NO matches (0 numeric z-index remaining)
- `EditorContextMenu.module.css` contains `calc(var(--wb-z-popover) + 1)` — confirmed
- Inline CSS comments adjacent to the calc explain the +1/+2 offsets — confirmed
- `vite build` exits 0
- `git diff` of this commit shows ONLY z-index lines changed (32 insertions, 32 deletions across 8 files)

## Visual stacking checkpoint (plan task 3)

Per user instructions ("fallback aceptable: vite build + grep gates + verificación de invariantes"), the human-verify checkpoint is satisfied via:
- Build passes (CSS parses; no `var()` reference broken)
- Stacking algebra verified by reading the resolved values in `tokens.css`:
  - tooltip (1200) > popover+2 (1102) > popover+1 (1101) > popover (1100) > modal (1000) > overlay (900) > sticky (200) > dropdown (100) > base (1)
  - EditorContextMenu (popover+1) > CommentMarginCards.commentMenu (popover) — preserves the "right-click menu above margin cards" invariant
  - Mentions popover (popover) < tooltip (tooltip) — preserves "tooltip on top" invariant
  - Modals (modal 1000) > sticky chrome (sticky 200) — preserves "modal hides toolbar" invariant
  - confirmOverlay (modal) > everything sticky — preserves "page-delete confirm above editor" invariant

Final visual matrix (live editor stacking) in plan 04-09 manual scenarios.

## Self-Check: PASSED
