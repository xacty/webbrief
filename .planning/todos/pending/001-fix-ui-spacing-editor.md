# TODO: Fix UI Spacing & Sizing — Editor CSS

**Source:** Phase 5 retroactive UI audit (`.planning/phases/05-public-pages-verification/05-UI-REVIEW.md`)
**Score:** 7.5 / 10 (UI-09 minimum: 9.0)
**Severity:** Below UI-09 threshold (advisory; deferred to future milestone)

## Findings

~288 raw `padding | margin | gap: NNpx` declarations across 9 editor `.module.css` files; only 4 `--wb-space-*` references in editor CSS (vs 1,643 milestone-wide token references). Per `04-UI-REVIEW.md` Top Priority Fix #2, this gap was flagged at audit time and remained unaddressed.

**File-by-file editor offenders (from Phase 4 audit):**
- `frontend/src/pages/ProjectEditor.module.css` (~67 raw spacing px)
- `frontend/src/pages/ProjectEditorPanels.module.css` (~45 raw)
- `frontend/src/pages/ProjectEditorNav.module.css` (~21 raw)
- `frontend/src/pages/BriefProjectEditor.module.css`
- `frontend/src/pages/ProjectEditorToolbar.module.css`
- `frontend/src/pages/ProjectEditorSeoRules.module.css`
- `frontend/src/components/editor/CommentsUI.module.css`
- `frontend/src/components/editor/CommentMarginCards.module.css`
- `frontend/src/components/editor/EditorContextMenu.module.css`

## Recommended Remediation

Sweep editor chrome CSS — replace numerics with `--wb-space-*` tokens:

| Raw | Token |
|-----|-------|
| 4px | `var(--wb-space-1)` |
| 8px | `var(--wb-space-2)` |
| 12px | `var(--wb-space-3)` |
| 16px | `var(--wb-space-4)` |
| 20px | `var(--wb-space-5)` |
| 24px | `var(--wb-space-6)` |
| 32px | `var(--wb-space-8)` |
| 48px | `var(--wb-space-12)` |
| 64px | `var(--wb-space-16)` |

**Preserve documented layout constants** as raw px (per `04-UI-SPEC.md`):
- `min-width: 500px` (canvas)
- Sidebar widths (`220px`, `300px`, `360px`)
- Header heights (`56px`, `48px`, `40px`)
- Drag-ghost sizing

**Skip:** `:global(.ProseMirror …)` selectors — content invariant.

**Out of scope for Phase 5.** Schedule for milestone v1.1 or a dedicated cleanup phase.

## Acceptance Criteria (when scheduled)

- `grep -rE "(padding|margin|gap):\s*[0-9]+px" frontend/src/pages/ProjectEditor*.module.css frontend/src/pages/BriefProjectEditor.module.css frontend/src/components/editor/*.module.css` returns ≤ 30 hits (all justified layout constants).
- `--wb-space-*` token consumption in editor CSS ≥ 80 references.
