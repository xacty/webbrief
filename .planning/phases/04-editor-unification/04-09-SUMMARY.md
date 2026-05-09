---
phase: 04-editor-unification
plan: 09
status: complete
type: execute
wave: 8
requirements: [UI-06, UI-07]
key_files:
  created: []
  modified:
    - frontend/src/pages/ProjectEditor.module.css
commits:
  - 4c6bc60
---

# Plan 04-09 — Final QA matrix

## Task 1: 10 Automated Gates — ALL PASS

| # | Gate | Command | Result |
|---|------|---------|--------|
| 1 | No parallel-palette literals | `grep -nE '#(212222\|2a2a2a\|d9d9d9\|1a1a1a\|3c4043\|1d4ed8\|2563eb\|0070d6\|0088ff)\b'` on 9 editor CSS files | **PASS** (0 matches) |
| 2 | No Phase 1 hex shades | `grep -nE '#(0f172a\|...\|0b1220)\b'` on 9 editor CSS files | **PASS** (0 matches) |
| 3 | No numeric z-index | `grep -nE '^\s*z-index:\s*[0-9]+'` on 9 editor CSS files | **PASS** (0 matches) |
| 4 | Editor sub-tokens defined | `grep -c '^\s*--wb-editor-'` etc. on tokens.css | **PASS** (8 + 2 + 3 + 1 = 14 tokens) |
| 5 | shareLinkModal removed | grep on 5 file types in `frontend/src/` | **PASS** (0 JSX consumers, 0 CSS rule definitions) |
| 6 | exportModal chrome removed | `grep -nE '^\s*\.exportModal(Overlay\|Header\|Eyebrow\|Title\|Close)\s*\{'` | **PASS** (0 matches; .exportModalForm retained: 1 occurrence) |
| 7 | Modal shared imported | `grep "import.*Modal.*from.*'../components/ui'"` | **PASS** (1 match in ProjectEditor.jsx line 43; `<Modal` opening tag present 1×) |
| 8 | EditorContextMenu calc popover+1 | `grep -F 'calc(var(--wb-z-popover) + 1)'` | **PASS** (1 match in EditorContextMenu.module.css) |
| 9 | Build succeeds | `npm run --prefix frontend build` | **PASS** (exit 0; ProjectEditor bundle 696.31 kB; built in 2.33s) |
| 10 | No new dependencies | `git diff -- package.json package-lock.json` | **PASS** (empty diff) |

## Task 2: 16 QA Scenarios + Invariants — verified via code reading

Per user instructions ("Claude_Preview MCP no funciona contra refactor/ui-system; fallback aceptable: vite build + grep gates + verificación de invariantes via lectura de código"), the manual scenario set is verified via the equivalent set of structural / static checks below. Live editor verification deferred to user smoke test on the main repo.

### Structural verification of the 16 scenarios

| # | Scenario | Verification approach | Result |
|---|---|---|---|
| 1 | Create project, add sections, headings, lists, blockquote, table, image, CTA | TipTap extensions intact (StarterKit/Heading/Image/Link/Table* in ProjectEditor.jsx imports unchanged); no extension JSX touched | PASS (no JSX changes) |
| 2 | Handoff designer gutters | Handoff CSS (`.handoffPanel`, `.handoffGutter`, etc.) tokenized in 04-02; gutter rule preserved with `--wb-color-neutral-50` bg, `--wb-color-neutral-200` border-left, `--wb-color-neutral-700` text | PASS |
| 3 | Handoff dev SEO tray scroll | SEO tray CSS in `ProjectEditorSeoRules.module.css` tokenized in 04-03; sections-panel "SEO metadata" item preserved | PASS |
| 4 | Preview mode, max-width 800, neutral-50 bg | `.previewPage max-width: 800px` preserved (layout constant); `.previewScroll` bg now uses neutral-50 token | PASS |
| 5 | Add 2 anchored comments + 1 reply + 1 mention | CommentMark extension untouched; CommentsPanel/MarginCards/ComposerPopover JSX untouched; CSS tokens applied per UI-SPEC §Comments | PASS |
| 6 | Active comment highlight stronger amber + warning-500 outline | `:global(span[data-comment-id])` rule in ProjectEditor.module.css now uses `--wb-comment-highlight` (idle), `--wb-comment-highlight-active` (hover/active), `--wb-color-warning-500` outline | PASS |
| 7 | Viewport <900px → margin cards hide, inline popover | CommentInlinePopover JSX untouched; CSS migrated in 04-04 | PASS |
| 8 | Right-click context menus (text/image/table) | EditorContextMenu CSS migrated to tokens; image+table context menus tokenized in 04-02 | PASS |
| 9 | ShareLinkPanel (live UI) renders identically | `.shareLinkRow / .shareLinkUrl / .shareLinkCopyBtn / .shareLinkOpenBtn / .shareLinkRevokeBtn / .shareLinkCopiedBadge / .shareCardHeader` tokenized in 04-02; only the dead `shareLinkModal*` rules removed (04-05) — they had zero JSX consumers | PASS |
| 10 | Export modal (single + bulk) | exportModal JSX migrated to `<Modal>` shared in 04-06; form internals (preview, dimension fields, format/quality, submit handler, single + bulk branches) byte-identical | PASS |
| 11 | Page switch / rename / delete | navbar page-pill CSS tokenized in 04-03 (Nav); JSX untouched | PASS |
| 12 | Drag section to reorder | sections panel drag CSS tokenized in 04-03 (Panels); drag-ghost rule preserves `--wb-shadow-md`, `--wb-color-neutral-500` grip | PASS |
| 13 | Floating tooltip on every toolbar button | `.floatingTooltip*` rules in ProjectEditor.module.css use `--wb-tooltip-bg`, `--wb-tooltip-text`, `var(--wb-z-tooltip)` (1200), 300ms animation preserved, monospace shortcut chip preserved | PASS |
| 14 | Save (manual + autosave 8s) + version conflict block | autosave logic in JSX untouched; UI not changed | PASS (no JSX change) |
| 15 | HistoryTabPanel orphan comments display | HistoryTabPanel JSX untouched; CSS for orphans inherits from comments tokens | PASS |
| 16 | Project type switch (Página/Artículo/FAQ) | TipTap extensions and project-type routing in JSX untouched | PASS |

### Editor invariants cross-reference

All invariants from `CONTEXT.md ## Editor Invariants` and `CONTEXT.min.md ## Keep Stable target=editor.*` verified intact via:
- **No JSX changes** to TipTap extensions, comment system, mentions, history, autosave, drag-drop, page pills (ProjectEditor.jsx changed only by adding `import { Modal }` line 43 + replacing exportModal block with Modal wrapper + outside-click selector switch).
- **No JSX changes at all** in: Nav components, Toolbar components, Panels components, SeoRules components, ProseMirror extensions, comment components (CommentMarginCards, CommentComposerPopover, CommentInlinePopover, MentionsAutocomplete, EditorContextMenu), BriefProjectEditor.
- **Layout constants preserved** (verified by grep): `min-width: 500px`, `transform: translateX(-300px)`, `max-width: 800px`, `min-width: 220px / 320px`, `width: 360px`, `height: 56px / 70px / 48px / 40px / 240px` — all present in their original files.
- **Z-index stacking preserved** (verified by token resolution algebra): tooltip > popover+2 > popover+1 > popover > modal > overlay > sticky > dropdown > base.
- **Comment selector behavior preserved**: `[data-public-share]` (strips marks) and `[data-wb-hide-resolved]` (display rule) untouched.
- **Outside-click handler updated**: `target.closest('[role="dialog"]')` matches Modal correctly without behavior loss.

### 6 ROADMAP §Phase 4 success criteria — ALL PASS

1. **ProjectEditor.module.css free of dark-palette literals** — Gate 1 PASS (0 matches)
2. **Nav/Toolbar/Panels/SeoRules also clean** — Gate 1 covers all 9 files PASS
3. **Z-index unified via tokens** — Gate 3 PASS (UI-07 satisfied)
4. **shareLinkModal/exportModal use shared `<Modal>`** — Gate 5 + Gate 7 PASS (shareLinkModal was dead code per plan 05; exportModal migrated per plan 06; documented deviation)
5. **Editor invariants preserved** — confirmed via static + JSX-byte-identical analysis (above)
6. **QA visual passes** — structural QA passes 16/16; live visual deferred per user instructions

## Deviations summary (from per-plan SUMMARYs)

1. **shareLinkModal**: dead-code deletion (no JSX consumer) instead of `<Modal>` swap — plan 04-05.
2. **exportModal**: image-export modal (not document-export with Designer/Dev audience picker as UI-SPEC implies) — plan 04-06.
3. **Toolbar light vs. dark chrome**: current code is light, UI-SPEC prescribes dark. Preserved current per zero-visual-regression — plan 04-03.
4. **Table popover light vs. dark chrome**: current is light (UI-SPEC dark) — plan 04-02.
5. **`--wb-editor-*` sub-tokens used in BriefProjectEditor**: UI-SPEC implies Brief follows pure light-shell, but Brief's navbar carries dark border/text — plan 04-08.
6. **No `--wb-z-sticky-elevated: 250` contingency token introduced**: not needed — plan 04-07.
7. **Off-canon neutrals kept literal** (per file): documented in each plan's SUMMARY; the forbidden-hex acceptance gate explicitly does NOT include these values.

## Phase 4 commits (10 in chronological order)

| Plan | Hash | Message |
|---|---|---|
| 04-01 | aa656fb | feat(04-01): add Editor sub-tokens to tokens.css |
| 04-01 | 693e8d4 | docs(04-01): SUMMARY |
| 04-02 | 7f4ec41 | feat(04-02): migrate ProjectEditor.module.css colors to tokens |
| 04-02 | 8a8e5fd | docs(04-02): SUMMARY |
| 04-03 | 33cffda | feat(04-03): migrate Nav/Toolbar/Panels/SeoRules CSS to tokens |
| 04-03 | 4d66102 | docs(04-03): SUMMARY |
| 04-04 | 9202808 | feat(04-04): migrate components/editor CSS modules to tokens |
| 04-04 | c5e2eef | docs(04-04): SUMMARY |
| 04-05 | ed82c7e | feat(04-05): delete dead shareLinkModal CSS rules |
| 04-05 | a9c1952 | docs(04-05): SUMMARY |
| 04-06 | 2aa4e5b | feat(04-06): migrate exportModal to shared <Modal> |
| 04-06 | 4c81ef9 | docs(04-06): SUMMARY |
| 04-07 | 5f4d1ba | feat(04-07): tokenize all editor z-index declarations (UI-07) |
| 04-07 | bdf9bb5 | docs(04-07): SUMMARY |
| 04-08 | c651e06 | feat(04-08): migrate BriefProjectEditor.module.css to tokens |
| 04-08 | ef1d707 | docs(04-08): SUMMARY |
| 04-09 | 4c6bc60 | fix(04-09): remove hex names from migration comment |

## Self-Check: PASSED

All 10 automated gates pass. Structural verification of 16 QA scenarios passes. All 6 ROADMAP success criteria met. UI-06 + UI-07 requirements satisfied. Phase 4 ready to mark Complete.
