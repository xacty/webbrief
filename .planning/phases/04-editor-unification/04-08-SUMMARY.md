---
phase: 04-editor-unification
plan: 08
status: complete
type: execute
wave: 7
requirements: [UI-06, UI-07]
key_files:
  created: []
  modified:
    - frontend/src/pages/BriefProjectEditor.module.css
commits:
  - c651e06
---

# Plan 04-08 — BriefProjectEditor migration

## Task 1 outcome: zero local modals

```
$ grep -nE "(className|class).*[Mm]odal" frontend/src/pages/BriefProjectEditor.jsx
(empty)
$ grep -nE "^\s*\.[a-zA-Z]*[Mm]odal" frontend/src/pages/BriefProjectEditor.module.css
(empty)
$ grep -nE "^\s*\.[a-zA-Z]*[Oo]verlay" frontend/src/pages/BriefProjectEditor.module.css
(empty)
```

Decision: **CSS-only migration**. No `<Modal>` swap, no dead-code deletion. JSX is byte-identical to pre-commit.

## CSS migrations applied (755 lines)

~106 hex literal replacements:

| Source | Replacement | Notes |
|---|---|---|
| `#212222` | `var(--wb-editor-bg)` | Brief navbar dark border (light shell still touches dark) |
| `#d9d9d9` | `var(--wb-editor-border)` | standard editor border |
| `#2a2a2a` (color) | `var(--wb-editor-text)` | dark text on light surfaces |
| `#fff` (color) | `var(--wb-editor-text-on-dark)` | white-on-dark text |
| `#fff` (background) | `var(--wb-surface)` | light card bg |
| `#0f172a` | `var(--wb-color-neutral-900)` | full Phase 1 neutral mapping |
| `#334155` | `var(--wb-color-neutral-700)` | |
| `#475569` | `var(--wb-color-neutral-600)` | |
| `#64748b` | `var(--wb-color-neutral-500)` | |
| `#94a3b8` | `var(--wb-color-neutral-400)` | |
| `#cbd5e1` | `var(--wb-color-neutral-300)` | |
| `#e2e8f0` | `var(--wb-color-neutral-200)` | |
| `#f1f5f9` | `var(--wb-color-neutral-100)` | |
| `#f8fafc` | `var(--wb-color-neutral-50)` | |
| `#c7c7c7` | `var(--wb-editor-text-on-dark-muted)` | muted-on-dark |
| `#a5b4fc / #e0e7ff` | `var(--wb-color-primary-200/100)` | indigo accent collapsed |
| `#dc2626 / #fecaca / #fee2e2 / #fef2f2` | `var(--wb-color-danger-{600,200,100,50})` | full danger mapping |
| `#16a34a` | `var(--wb-color-success-600)` | success accent |
| `z-index: 100` | `var(--wb-z-sticky)` | single z-index, navbar sticky chrome |

## Off-canon literals kept (no Phase 1 exact match)

- `#f8f8f8` (root bg), `#f0f0f0` (navbar bg)
- `#f0f4f9` (light blue hover state, multiple)
- `#000` (button hover pure-dark, multiple)
- `#e8eef5` (subtle card border, multiple)

## Acceptance gates (all PASS)

- `grep -cE '#(212222|2a2a2a|d9d9d9|1a1a1a|3c4043|1d4ed8|2563eb|0f172a|1e293b|334155|475569|64748b|94a3b8|cbd5e1|e2e8f0|f1f5f9|f8fafc|dc2626|f87171|fef2f2|fee2e2|15803d|16a34a|dcfce7|091223|0b1220)\b'` returns 0
- `grep -nE '^\s*z-index:\s*[0-9]+'` returns 0
- File contains `--wb-color-*` and `--wb-z-*` tokens
- `git diff frontend/src/pages/BriefProjectEditor.jsx` empty (JSX untouched)
- `vite build` exits 0; bundle 16.76 kB unchanged

## Observation: editor-sub-token usage

UI-SPEC §"Brief variant" says the variant follows the **light shell** palette and editor sub-tokens shouldn't be needed. **Divergence found**: the navbar in `BriefProjectEditor.module.css` carries:
- `border-bottom: 1px solid #212222` (dark border on light navbar) → mapped to `var(--wb-editor-bg)` because it's literally the dark editor color
- Several `color: #2a2a2a` (dark text on light) → mapped to `var(--wb-editor-text)`
- Some `color: #fff` (white text on dark navbar accents) → mapped to `var(--wb-editor-text-on-dark)`

So `--wb-editor-*` tokens DO appear in this file (3 of them: `editor-bg`, `editor-border`, `editor-text`, `editor-text-on-dark`, `editor-text-on-dark-muted`). This is a documented divergence from UI-SPEC's "no sub-tokens needed" expectation, but the alternative (introducing 3 new tokens just for this file, or using neutral-900 in place of the sharper editor dark) was less faithful to the existing visual.

## Visual checkpoint (plan task 3)

Per user instructions ("fallback aceptable"):
- Build passes
- Forbidden-hex gate passes
- Z-index tokenization gate passes
- JSX byte-identical (no behavior change possible)
- Layout/geometry untouched

Final visual matrix in plan 04-09.

## Self-Check: PASSED
