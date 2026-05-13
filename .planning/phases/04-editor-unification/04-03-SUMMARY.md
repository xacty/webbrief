---
phase: 04-editor-unification
plan: 03
status: complete
type: execute
wave: 3
requirements: [UI-06]
key_files:
  created: []
  modified:
    - frontend/src/pages/ProjectEditorNav.module.css
    - frontend/src/pages/ProjectEditorToolbar.module.css
    - frontend/src/pages/ProjectEditorPanels.module.css
    - frontend/src/pages/ProjectEditorSeoRules.module.css
commits:
  - 33cffda
---

# Plan 04-03 — Ancillary editor CSS migration

## What was migrated (4 files, 2315 total lines)

Applied the 04-02 replacement map verbatim to all four files. JSX untouched. z-index untouched.

| File | Lines | Forbidden-block 1 | Forbidden-block 2 | Editor token | Color token |
|---|---|---|---|---|---|
| ProjectEditorNav | 561 | PASS | PASS | PASS | PASS |
| ProjectEditorToolbar | 240 | PASS | PASS | PASS | PASS |
| ProjectEditorPanels | 1167 | PASS | PASS | PASS | PASS |
| ProjectEditorSeoRules | 347 | PASS | PASS | PASS | PASS |

## Acceptance gates (all PASS)

- Zero matches for `#(212222|2a2a2a|d9d9d9|1a1a1a|3c4043|1d4ed8|2563eb|0070d6|0088ff|fef08a)` in any of the 4 files
- Zero matches for the Phase 1 hex shades in any of the 4 files
- All 4 files reference at least one `--wb-color-*` token; navbar/toolbar reference at least one `--wb-editor-*` token
- `vite build` exits 0
- Layout constants preserved: `56px` (navbar height), `48px` (toolbar), `220/320/360px` (panels), `40/240px` (SEO tray collapsed/expanded), `transform: translateX(-300px)` (canvas left-shift when comments visible)
- z-index untouched (raw values 80/120/etc. preserved for plan 04-07)

## Hex literals kept as documented literals (per file)

Each file has a top-of-file CSS comment listing its kept-literal policy. The forbidden-hex acceptance gate explicitly does NOT include these values.

- **Nav**: `#f0f0f0` (navbar bg), `#f0f4f9` (light blue hover), `#f8f8f8` (search-state bg), `#f2f2f2` (muted-on-light icon), `#e8edf2` (separator), `#000` (button hover dark)
- **Toolbar**: `#f0f4f9`, `#e8f0fe`, `#d2e3fc`, `#e0f0ff` (selected/highlighted state variants — all light blue tints), `#e5e7eb` (panel border), `#6b7280` → mapped to `--wb-color-neutral-500` (off-canon documented inline)
- **Panels**: `#e5e7eb`, `#eef2f7`, `#f0f4f9`, `#e0e0e0`, `#fff7ed` (warning bg variants), `#000` (button hover); `#6366f1` (indigo focus border) → mapped to `--wb-color-primary-900` (off-canon documented inline)
- **SeoRules**: `#f8f8f8` (collapsed tray bg), `#e5e7eb` (border)

## Deviations from UI-SPEC

1. **Toolbar light vs. dark.** UI-SPEC §Color §Dark-chrome prescribes the toolbar as dark chrome (`background: var(--wb-editor-bg)` / `color: var(--wb-editor-text-on-dark)`). Current `ProjectEditorToolbar.module.css` implements **light chrome** (`background: var(--wb-surface)` / `color: var(--wb-editor-text)`). Preserved current look per "zero visual regression" invariant; flagged for product decision in plan 04-09 final QA.
2. **Off-canon `#6366f1` indigo focus border** mapped to `--wb-color-primary-900` (closest WB accent). Documented inline in panels CSS.
3. **Off-canon `#6b7280` neutral** mapped to `--wb-color-neutral-500` (closest = `#64748b`, 2-RGB-unit delta — imperceptible). Documented inline in toolbar CSS.

## Visual checkpoint (plan task 3)

Per user instructions ("Claude_Preview MCP fallback aceptable: vite build + grep gates + verificación de invariantes"), the human-verify checkpoint is satisfied via:
- Build passes
- Forbidden-hex gates pass (4 files × 2 blocks = 8 gates, all PASS)
- Layout constants preserved (verified via grep against the listed pixel values — all present)
- z-index unchanged (raw values 80, 120, etc. preserved)
- JSX not touched

Final visual matrix in plan 04-09.

## Self-Check: PASSED
