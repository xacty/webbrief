# TODO: Fix UI Typography — Editor CSS

**Source:** Phase 5 retroactive UI audit (`.planning/phases/05-public-pages-verification/05-UI-REVIEW.md`)
**Score:** 7.5 / 10 (UI-09 minimum: 9.0)
**Severity:** Below UI-09 threshold (advisory; deferred to future milestone)

## Findings

~149 raw `font-size: NNpx` declarations across 7 editor CSS files; only 1 `--wb-text-*` reference in editor chrome. Per `04-UI-REVIEW.md` Top Priority Fix #1, the executor did not interpret "migrate chrome typography to tokens" as binding.

**File-by-file editor offenders (from Phase 4 audit):**
- `frontend/src/pages/ProjectEditor.module.css` — 67 raw font-size (mix of chrome + content)
- `frontend/src/pages/ProjectEditorPanels.module.css` — 45 raw (chrome — sections/updates panels)
- `frontend/src/pages/ProjectEditorNav.module.css` — 21 raw (navbar chrome)
- `frontend/src/components/editor/CommentsUI.module.css` — 18 raw
- `frontend/src/components/editor/CommentMarginCards.module.css` — 12 raw
- `frontend/src/pages/ProjectEditorToolbar.module.css` — 5 raw
- `frontend/src/components/editor/EditorContextMenu.module.css` — 2 raw

`--wb-weight-*` similarly under-consumed (1 reference); `--wb-leading-*` 0 references.

## Recommended Remediation

Sweep editor chrome CSS — replace numerics with `--wb-text-*` tokens:

| Raw | Token |
|-----|-------|
| 12px | `var(--wb-text-xs)` |
| 13/14px | `var(--wb-text-sm)` |
| 16px | `var(--wb-text-base)` |
| 18px | `var(--wb-text-lg)` |
| 20px | `var(--wb-text-xl)` |
| 24px | `var(--wb-text-2xl)` |
| 30px | `var(--wb-text-3xl)` |

Replace `font-weight` numerics with `--wb-weight-{regular,medium,semibold,bold}`.
Replace `line-height` numerics with `--wb-leading-{normal,xl,2xl,3xl,relaxed}` where applicable.

**Skip ProseMirror content selectors** (`:global(.ProseMirror h1-h6 / p / blockquote / td)`) — these stay raw per `04-UI-SPEC.md` (content-level invariant — TipTap output sizing is design-locked).

**Out of scope for Phase 5.** Schedule for milestone v1.1 or a dedicated cleanup phase.

## Acceptance Criteria (when scheduled)

- `grep -rE "font-size:\s*[0-9]+px" frontend/src/pages/ProjectEditor*.module.css frontend/src/pages/BriefProjectEditor.module.css frontend/src/components/editor/*.module.css | grep -v ProseMirror` returns ≤ 5 hits (all justified glyph sizes).
- `--wb-text-*` token consumption in editor CSS ≥ 50 references.
