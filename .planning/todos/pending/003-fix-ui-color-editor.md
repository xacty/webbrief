# TODO: Fix UI Color — Editor CSS

**Source:** Phase 5 retroactive UI audit (`.planning/phases/05-public-pages-verification/05-UI-REVIEW.md`)
**Score:** 7.8 / 10 (UI-09 minimum: 9.0)
**Severity:** Below UI-09 threshold (advisory; deferred to future milestone)

## Findings

96 hex literals concentrated in editor CSS:

| File | Hex literals |
|------|-------------:|
| `frontend/src/pages/ProjectEditor.module.css` | 27 |
| `frontend/src/pages/ProjectEditorPanels.module.css` | 15 |
| `frontend/src/pages/ProjectEditorNav.module.css` | 14 |
| `frontend/src/pages/BriefProjectEditor.module.css` | 10 |
| `frontend/src/pages/ProjectEditorToolbar.module.css` | 9 |
| `frontend/src/components/editor/CommentsUI.module.css` | 9 |
| `frontend/src/components/editor/CommentMarginCards.module.css` | 5 |
| `frontend/src/pages/ProjectEditorSeoRules.module.css` | 3 |
| `frontend/src/components/editor/EditorContextMenu.module.css` | 1 |
| `frontend/src/components/ui/Button.module.css` | 2 |

**Top hex patterns:**
- `#f0f4f9` — selection-soft surface (8+ occurrences) — **needs new sub-token**
- `#f8f8f8` / `#e8e8e8` — off-canon neutrals — documented as accepted exceptions in `04-UI-SPEC.md` §"Color"
- `#000` — decorative dividers (intentional opacity?)
- `#fff7ed` / `#c2410c` — warning oranges — **needs `--wb-color-warning-50` / `--wb-color-warning-700` migration**
- `#ffffff` (Phase 2 `Button.module.css` lines 62/86) — equivalent to `var(--wb-surface)` — low priority cleanup

## Recommended Remediation

1. **Extend `tokens.css`:**
   ```css
   --wb-editor-selection-soft: #f0f4f9;   /* editor-scoped sub-token */
   --wb-color-warning-50: #fff7ed;         /* missing Phase 1 shade */
   --wb-color-warning-700: #c2410c;        /* missing Phase 1 shade */
   ```

2. **Sweep editor CSS:**
   - `#f0f4f9` → `var(--wb-editor-selection-soft)` (or `var(--wb-color-primary-50)` if visually equivalent)
   - `#fff7ed` → `var(--wb-color-warning-50)`
   - `#c2410c` → `var(--wb-color-warning-700)`
   - `#ecfdf5` / `#047857` → `var(--wb-color-success-50)` / `var(--wb-color-success-700)`

3. **Leave alpha overlays literal** (`rgb(... / NN%)` and `rgba(...)`) per `04-UI-SPEC.md` §"Color" note (b).

4. **Phase 2 cleanup (low priority):** `frontend/src/components/ui/Button.module.css` lines 62/86 `#ffffff` → `var(--wb-surface)`.

5. Document any remaining `#000` decorative dividers as intentional exceptions or migrate to `var(--wb-color-neutral-900)`.

**Out of scope for Phase 5.** Schedule for milestone v1.1 or a dedicated cleanup phase.

## Acceptance Criteria (when scheduled)

- `grep -rnE "#[0-9a-fA-F]{3,8}" frontend/src/pages/ProjectEditor*.module.css frontend/src/pages/BriefProjectEditor.module.css frontend/src/components/editor/*.module.css | grep -v rgba | grep -v "/\*"` returns ≤ 5 hits (all justified per documentation).
- New sub-tokens defined in `frontend/src/styles/tokens.css` with WCAG-validated contrast notes.
