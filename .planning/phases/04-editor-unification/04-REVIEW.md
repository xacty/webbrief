---
phase: 04-editor-unification
reviewed: 2026-05-09T00:00:00Z
depth: standard
files_reviewed: 11
files_reviewed_list:
  - frontend/src/components/editor/CommentMarginCards.module.css
  - frontend/src/components/editor/CommentsUI.module.css
  - frontend/src/components/editor/EditorContextMenu.module.css
  - frontend/src/pages/BriefProjectEditor.module.css
  - frontend/src/pages/ProjectEditor.jsx
  - frontend/src/pages/ProjectEditor.module.css
  - frontend/src/pages/ProjectEditorNav.module.css
  - frontend/src/pages/ProjectEditorPanels.module.css
  - frontend/src/pages/ProjectEditorSeoRules.module.css
  - frontend/src/pages/ProjectEditorToolbar.module.css
  - frontend/src/styles/tokens.css
findings:
  critical: 0
  warning: 1
  info: 0
  total: 1
status: issues_found
fix_status: all_fixed
fix_report: 04-REVIEW-FIX.md
---

# Phase 4: Code Review Report

**Reviewed:** 2026-05-09
**Depth:** standard
**Files Reviewed:** 11
**Status:** issues_found

## Summary

Phase 4 ("Editor Unification") migrated 9 editor CSS modules to consume Phase 1 tokens
plus 14 new editor sub-tokens (`--wb-editor-*`, `--wb-tooltip-*`, `--wb-comment-*`,
`--wb-section-*`), unified all editor z-index declarations to semantic tokens, and
swapped one inline modal (image export) for the shared `<Modal>` primitive in
`ProjectEditor.jsx`. The three automated gates pass:

- **Gate 1 (forbidden hex literals from the parallel dark palette):** PASS — zero
  occurrences of `#212222 / #2a2a2a / #d9d9d9 / #1d4ed8 / #2563eb` across all 9
  editor CSS modules.
- **Gate 2 (Phase-1 canonical hex literals):** PASS — zero occurrences of any
  Phase-1 canonical hex (e.g. `#091223`, `#dc2626`, `#64748b`, `#0f172a`).
- **Gate 3 (numeric z-index in editor CSS):** PASS — every z-index either references
  a `--wb-z-*` token directly or uses `calc(var(--wb-z-popover) + N)` with explanatory
  comment (EditorContextMenu lines 3, 99).

Off-canon literal hexes remain (28 unique values across the editor: `#f8f8f8`,
`#f0f4f9`, `#e8f0fe`, `#000`, etc.) — these are intentional, file-headed
documented exceptions per UI-SPEC §Color and the per-plan SUMMARY.md "kept-literal
inventory" sections. They do not represent forbidden palette regressions.

The `ProjectEditor.jsx` change is scoped: the only Phase 4 commit affecting it
(`2aa4e5b`, plan 04-06) shows a 32-line diff (15 insertions, 17 deletions) limited to
(a) `Modal` import on line 43, (b) `<Modal>`-based wrapping of the image-export
dialog block (~25 lines), and (c) one outside-click selector swap from
`.${styles.exportModal}` to `[role="dialog"]` (line 8090). All editor invariants
(comments anchoring, 15-min edit window, mentions, autosave 8s, version-conflict
block, page-switch 480ms delay, HistoryTabPanel, sectionDivider semantics, handoff
copy-safe, etc.) are preserved — none of the 11 reviewed files touch the JSX/JS
logic that implements them; the Modal swap delegates body-scroll lock, focus trap,
Escape, and overlay-click to the shared primitive (`Modal.jsx` verified to
implement all four correctly with ref-counted body scroll for stacked modals).

One issue surfaced: a no-op `:hover` rule introduced by the migration in
`ProjectEditorNav.module.css`. See WR-01.

## Warnings

### WR-01: `.navSaveBtn` hover rule is visually a no-op

**File:** `frontend/src/pages/ProjectEditorNav.module.css:297-299`
**Issue:** Phase 4 introduced a `:hover:not(.navSaveBtnDisabled)` rule for the
"Guardar" navbar button. Both the base state (line 286, `background:
var(--wb-color-primary-900)`) and the new hover state (line 298, `background:
var(--wb-color-primary-900)`) resolve to the same color (`#091223`). Because the
hover declaration matches the base, hovering produces zero visual change — the
new selector is dead CSS that gives a misleading affordance signal in the source.

Pre-Phase-4 the file had no `:hover` rule for `.navSaveBtn` and a different base
color (`#0088ff`). The migration to `--wb-color-primary-900` was correct (same
intent: keep the dark "save" CTA), but the added hover should darken/lighten the
base — either by reusing the `:hover { background: #000 }` pattern other dark CTAs
in the codebase use (see `BriefProjectEditor.module.css:115-117`,
`ProjectEditor.module.css:489-491`) or by introducing a `--wb-color-primary-hover`
token usage.

This is a regression in user-perceptible affordance, not a token-migration
correctness bug. Severity: Warning (UX degradation, not a functional defect).

**Fix:**
```css
.navSaveBtn:hover:not(.navSaveBtnDisabled) {
  background: #000;
}
```

Or, preferably (if a hover token is desired and consistent with the rest of the
navbar dark CTAs):
```css
.navSaveBtn:hover:not(.navSaveBtnDisabled) {
  background: var(--wb-primary-hover); /* token already exists in tokens.css */
}
```

Note: `--wb-primary-hover` resolves to `var(--wb-color-primary-500)` (`#1e293b`),
which is one shade lighter than `--wb-color-primary-900` — exactly the hover affordance
intent.

---

_Reviewed: 2026-05-09_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
