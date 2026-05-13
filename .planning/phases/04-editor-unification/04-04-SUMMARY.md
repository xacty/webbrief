---
phase: 04-editor-unification
plan: 04
status: complete
type: execute
wave: 4
requirements: [UI-06]
key_files:
  created: []
  modified:
    - frontend/src/components/editor/CommentMarginCards.module.css
    - frontend/src/components/editor/CommentsUI.module.css
    - frontend/src/components/editor/EditorContextMenu.module.css
commits:
  - 9202808
---

# Plan 04-04 — components/editor CSS migration

## Import map verified

```
CommentComposerPopover.jsx -> ./CommentsUI.module.css
CommentInlinePopover.jsx   -> ./CommentsUI.module.css + ./CommentMarginCards.module.css (marginStyles)
MentionsAutocomplete.jsx   -> ./CommentsUI.module.css
CommentMarginCards.jsx     -> ./CommentsUI.module.css + ./CommentMarginCards.module.css
EditorContextMenu.jsx      -> ./EditorContextMenu.module.css
```

The plan's note that "CommentComposerPopover.module.css / CommentInlinePopover.module.css / MentionsAutocomplete.module.css" do not exist as separate files is confirmed — all three components share `CommentsUI.module.css`. Plan scope is satisfied by the 3 files migrated.

## What was migrated (3 files, 885 total lines)

| File | Lines | Forbidden-block gate | Tokens present |
|---|---|---|---|
| CommentMarginCards.module.css | 371 | PASS | --wb-editor-bg, --wb-surface, --wb-border, --wb-color-{primary,neutral,danger,warning}-* |
| CommentsUI.module.css | 414 | PASS | same + warning-900 (#78350f), primary-200/300 |
| EditorContextMenu.module.css | 100 | PASS | --wb-color-danger-700 (UI-SPEC §Comments), neutral-100 (item hover) |

## Hex literal mapping summary

| Source hex | Replacement | Notes |
|---|---|---|
| `#212222` | `var(--wb-editor-bg)` | dark chrome reference |
| `#ffffff` | `var(--wb-surface)` | light card surfaces |
| `#e5e7eb` | `var(--wb-border)` | standard editor border (Phase 1 alias) |
| `#0070d6 / #0088ff / #1a4ea8 / #1a73e8` | `var(--wb-color-primary-900)` | blue accents collapsed |
| `#93c5fd` | `var(--wb-color-primary-300)` | tailwind blue-300 |
| `#c7daff` | `var(--wb-color-primary-200)` | softer tailwind blue |
| `#374151` | `var(--wb-color-neutral-700)` | text default |
| `#4b5563` | `var(--wb-color-neutral-600)` | secondary text |
| `#6b7280` | `var(--wb-color-neutral-500)` | muted text |
| `#9ca3af` | `var(--wb-color-neutral-400)` | placeholder |
| `#d1d5db` | `var(--wb-color-neutral-300)` | divider |
| `#f3f4f6` | `var(--wb-color-neutral-100)` | hover bg |
| `#f9fafb` | `var(--wb-color-neutral-50)` | very-light bg |
| `#dc2626` (CommentMargin/CommentsUI) | `var(--wb-color-danger-600)` | delete |
| `#dc2626` (EditorContextMenu) | `var(--wb-color-danger-700)` | per UI-SPEC §Comments table for context-menu danger items |
| `#fef2f2` | `var(--wb-color-danger-50)` | danger hover bg |
| `#f59e0b` | `var(--wb-color-warning-500)` | comment indicator amber |
| `#fde68a` | `var(--wb-color-warning-200)` | resolved warning chip |
| `#fef3c7` | `var(--wb-color-warning-100)` | inline highlight bg |
| `#78350f` | `var(--wb-color-warning-900)` | dark amber text on warning bg |

## Off-canon literals kept (no Phase 1 exact match)

- `#f0f4f9` — light blue hover state (used across all 3 files for ⋮ menu hover, item hover variants)
- `#e8f0fe` — selected/active item background (CommentsUI for mentions selected state)

These are 1-3 RGB unit deltas from existing Phase-1 light blue tokens; mapping was deferred to avoid any visible drift. The forbidden-hex acceptance gate explicitly does NOT include these values.

## Acceptance gates (all PASS)

- Zero matches for `#(212222|2a2a2a|d9d9d9|1a1a1a|3c4043|1d4ed8|2563eb|fef08a|fef3c7|0f172a|1e293b|334155|475569|64748b|94a3b8|cbd5e1|e2e8f0|f1f5f9|f8fafc|dc2626|f87171|fef2f2|fee2e2|15803d|16a34a|dcfce7|091223|0b1220)` in any of the 3 files
- `CommentMarginCards.module.css` references `--wb-shadow-sm` (idle card) and `--wb-shadow-md` (active card) — confirmed
- `CommentMarginCards.module.css` references `--wb-color-primary-300` (active card border) — confirmed via `#93c5fd` mapping
- `CommentMarginCards.module.css` references `--wb-color-primary-700` — present (`var(--wb-color-primary-700)` for mention chip)
- `CommentsUI.module.css` references `--wb-color-primary-100` and `--wb-color-primary-700` — confirmed
- `EditorContextMenu.module.css` references `--wb-color-danger-700` and `--wb-color-neutral-100` — confirmed
- JSX files byte-identical to pre-commit (`git diff --stat frontend/src/components/editor/*.jsx` empty)
- z-index lines unchanged (raw values 6, 1500, etc. preserved for plan 04-07)
- `vite build` exits 0

## Visual checkpoint (plan task 3)

Per user instructions ("Claude_Preview MCP fallback aceptable: vite build + grep gates + verificación de invariantes"), the human-verify checkpoint is satisfied via:
- Build passes
- Forbidden-hex gates pass (3 files × 1 unified block = 3 gates, all PASS)
- JSX untouched (verified via git diff --stat)
- z-index untouched (per-file grep for `z-index:` shows same line numbers, same raw values)
- Comment invariants preserved (no `<span data-comment-id>` selector touched; resolved/active/orphan-resolve states delegated to ProjectEditor.module.css :global rules already migrated in 04-02)

Final visual matrix in plan 04-09.

## Self-Check: PASSED
