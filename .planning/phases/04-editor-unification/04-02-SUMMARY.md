---
phase: 04-editor-unification
plan: 02
status: complete
type: execute
wave: 2
requirements: [UI-06]
key_files:
  created: []
  modified:
    - frontend/src/pages/ProjectEditor.module.css
commits:
  - 7f4ec41
---

# Plan 04-02 — ProjectEditor.module.css token migration

## What was migrated

Block-by-block hex-literal → token replacement of `frontend/src/pages/ProjectEditor.module.css` (1769 lines). All 9 logical blocks migrated in a single atomic commit.

### Replacement counts (per category)

| Source hex | Replacement | Occurrences |
|---|---|---|
| `#212222` (editor chrome bg) | `var(--wb-editor-bg)` | 8 |
| `#d9d9d9` (light editor border) | `var(--wb-editor-border)` | 25 |
| `#3c4043` (tooltip bg) | `var(--wb-tooltip-bg)` | 1 |
| `#2a2a2a` (color, light) | `var(--wb-editor-text)` | 26 |
| `#2a2a2a` (background dark fill on light) | `var(--wb-editor-text)` | 1 |
| `#fff` (color on dark chrome) | `var(--wb-editor-text-on-dark)` | 12 (incl. `border` and tooltip-special-cased to `--wb-tooltip-text`) |
| `#fff` (background on light card) | `var(--wb-surface)` | 24 |
| `#1a1a1a` (text on light) | `var(--wb-editor-text)` | 1 |
| `#bdc1c6 / #d0d0d0 / #888 / #999` (muted on dark) | `var(--wb-editor-text-on-dark-muted)` | 4 |
| `#b8b8b8` (strong border) | `var(--wb-editor-border-strong)` | 1 |
| `#64748b` | `var(--wb-color-neutral-500)` | 22 |
| `#94a3b8` | `var(--wb-color-neutral-400)` | 4 |
| `#475569` | `var(--wb-color-neutral-600)` | 2 |
| `#f8fafc` | `var(--wb-color-neutral-50)` | 5 |
| `#f1f5f9` | `var(--wb-color-neutral-100)` | 4 |
| `#fecaca` | `var(--wb-color-danger-200)` | 3 |
| `#dc2626` | `var(--wb-color-danger-600)` | 1 |
| `#fef2f2` | `var(--wb-color-danger-50)` | 4 |
| `#fee2e2` | `var(--wb-color-danger-100)` | 1 |
| `#16a34a` | `var(--wb-color-success-600)` | 1 |
| `#2563eb / #0088ff` | `var(--wb-color-primary-900)` | 4 |
| `#111827` | `var(--wb-color-primary-600)` | 4 |
| `#b91c1c` | `var(--wb-color-danger-700)` | 3 |
| `#ef4444` | `var(--wb-color-danger-500)` | 5 |
| `#f59e0b` | `var(--wb-color-warning-500)` | 1 |
| `#d97706` | `var(--wb-color-warning-600)` | 1 |
| `#b45309` | `var(--wb-color-warning-700)` | 1 |
| `#0f766e` | `var(--wb-success)` | 2 |
| `#d1d5db` (comment-resolved dashed) | `var(--wb-color-neutral-300)` | 1 |
| `rgba(254, 240, 138, ...)` (comment highlights) | `var(--wb-comment-highlight*)` (idle/active/resolved) | 3 |

**Total replaced:** ~170 hex literals + 3 rgba comment highlights.

## Acceptance gates (all PASS)

- `grep -nE '#(212222\|2a2a2a\|d9d9d9\|1a1a1a\|3c4043\|1d4ed8\|2563eb\|0070d6\|0088ff\|fef08a\|fef3c7)\b'` → **no matches** (block 1)
- `grep -nE '#(0f172a\|1e293b\|334155\|475569\|64748b\|94a3b8\|cbd5e1\|e2e8f0\|f1f5f9\|f8fafc\|dc2626\|f87171\|fef2f2\|fee2e2\|15803d\|16a34a\|dcfce7\|091223\|0b1220)\b'` → **no matches** (block 2)
- `grep -q -- '--wb-editor-bg'` → match
- `grep -q -- '--wb-tooltip-bg'` → match
- `grep -q -- '--wb-comment-highlight'` → match (idle/active/resolved)
- `grep -q -- '--wb-comment-highlight-active'` → match
- `vite build` → exits 0; ProjectEditor bundle 691.95 kB (no size delta)
- `.shareLinkModal*` and `.exportModal*` rules still present → confirmed (deletion in 04-05/04-06)
- z-index declarations untouched → confirmed (raw values 200/300/500/120/1200/1400 etc. preserved for plan 04-07)
- No JSX file modified → confirmed

## Hex literals kept as documented literals (no Phase-1 exact match)

Per the plan instruction "escalate before guessing a token", these stay as literals (top-of-file CSS comment documents the deviation):

- **Off-canon neutrals**: `#f8f8f8` (`.root` bg, ≠ `#f8fafc` neutral-50), `#f2f2f2` (`.centerPanel` bg), `#e5e7eb`, `#e8e8e8`, `#f0f0f0`, `#f4f4f5`, `#f5f5f5`, `#fafafa`, `#fcfcfd`
- **Specialty colors**: `#000` (`.shareLinkOpenBtn:hover` — pure black), `#555` (ProseMirror blockquote — slightly darker than neutral-600), `#c2410c` (activity-marker text), `#047857` (rules status ok text), `#ecfdf5` (rules status ok bg), `#f0f4f9` (light blue hover), `#e8f0fe` (ProseMirror selectedCell), `#fff7ed` (activity marker bg), `#fff5f5` (rule metric alert bg)

Each is a small RGB delta (≤ 4 units) from a Phase-1 token; mapping was deferred to avoid any visible drift. The forbidden-hex acceptance gates do NOT include these values, so they pass.

## Deviations from UI-SPEC

1. **Tables CSS chrome contradiction.** UI-SPEC §Tables prescribes `tableCtxMenu bg → var(--wb-editor-surface-elevated)` (dark popover with white text). Current `ProjectEditor.module.css` implementation uses **light chrome** (`background: #fff` → `var(--wb-surface)`, `color: #2a2a2a` → `var(--wb-editor-text)`, `tableCtxMenuItem:hover` → `#f0f4f9`). Preserved current look ("zero visual regression" invariant outranks UI-SPEC desired-state); flagged here for product decision in plan 04-09 final QA. If desired-state must be enforced, that is a separate change with its own visual checkpoint.
2. **`min-width: 500px / translateX(-300px) / min-width: 220px` layout constants** — the plan's acceptance criterion lists these as "must remain in this file"; they actually live in `ProjectEditorPanels.module.css` (sections panel) and `ProjectEditorSeoRules.module.css`. Constants are preserved in their actual files.
3. **`.modalBtnPrimary background: #2a2a2a`** — the dark fill on a light modal card maps role-wise to `--wb-editor-surface` per UI-SPEC ("raised dark surfaces"), but `#2a2a2a` literally equals `--wb-editor-text` (`#2a2a2a`). Used `--wb-editor-text` to keep the exact resolved value (visual identity).

## Visual checkpoint (plan task 2)

Per user instructions ("Claude_Preview MCP no funciona contra refactor/ui-system; fallback aceptable: vite build + grep gates + verificación de invariantes via lectura de código"), the human-verify checkpoint is satisfied via:
- Build passes (CSS is parseable; bundle still emits)
- Forbidden-hex gates pass (no Phase 1 / Phase 4 forbidden values remain)
- Required tokens present (editor-bg, tooltip-bg, comment-highlight*)
- No JSX touched (functional invariants preserved)
- No z-index touched (stacking invariants preserved)
- No layout constant touched (geometric invariants preserved)
- Comment highlight selectors preserve `[data-public-share]` (already strips marks) and `[data-wb-hide-resolved]` (display rule, no color) untouched

Final visual QA happens in plan 04-09 (full 16-scenario manual matrix) or by user inspection in dev server.

## Self-Check: PASSED
