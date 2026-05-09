---
phase: 04-editor-unification
plan: 05
status: complete
type: execute
wave: 5
requirements: [UI-06, UI-07]
key_files:
  created: []
  modified:
    - frontend/src/pages/ProjectEditor.module.css
commits:
  - ed82c7e
---

# Plan 04-05 — Dead `shareLinkModal*` CSS deletion

## Dead-code verification

```
$ grep -rnE 'shareLinkModal(Header|Title|Note)?' frontend/src/ \
    --include='*.jsx' --include='*.js' --include='*.ts' --include='*.tsx'
(no output, exit 1)
```

Confirmed zero JSX/JS/TS consumers. The 4 CSS rule blocks were dead code.

## Rule blocks deleted

| Class | Lines | Removed |
|---|---|---|
| `.shareLinkModal` | 10 | yes |
| `.shareLinkModalHeader` | 6 | yes |
| `.shareLinkModalTitle` | 5 | yes |
| `.shareLinkModalNote` | 6 | yes |

Total: ~31 lines removed; 1 stub comment line added documenting the deletion.

## Live share UI

`ShareLinkPanel` (a component, NOT a dialog) is the live share UI. It consumes these classes (preserved, untouched):
- `.shareLinkRow`
- `.shareLinkUrl`
- `.shareLinkCopyBtn`
- `.shareLinkOpenBtn`
- `.shareLinkRevokeBtn`
- `.shareLinkCopiedBadge`
- `.shareLinkCloseBtn`
- `.shareCardHeader`

These remain in `ProjectEditor.module.css` and continue to consume tokens (already migrated in plan 04-02).

## DEVIATION from UI-SPEC §Modal Migration Contract

UI-SPEC §"Modal Migration Contract" §"shareLinkModal" prescribes:

> Replace `shareLinkModal` JSX + CSS with `<Modal>` shared. Modal opens with focus trap, Escape close, mousedown→mouseup overlay close — all delegated to `<Modal>`.

This deviation is **structural**: there is no `shareLinkModal` JSX to replace. The live `ShareLinkPanel` is rendered inline inside the editor's right panel (`panelStyles.shareBox`); it is not a modal at all. The 4 CSS rule blocks were leftover from a prior implementation. Per plan 04-05's premise (verified at planning time), the correct action is dead-code deletion, not a JSX migration. No `<Modal>` import is added.

## Acceptance gates (all PASS)

- `grep -rnE 'shareLinkModal(Header|Title|Note)?' frontend/src/ --include='*.jsx' --include='*.js' --include='*.ts' --include='*.tsx'` → 0 matches
- `grep -nE '^\s*\.shareLinkModal[A-Z]?' frontend/src/pages/ProjectEditor.module.css` → 0 matches
- `git diff frontend/src/pages/ProjectEditor.jsx` → empty (JSX untouched)
- `vite build` → exits 0
- ShareLinkPanel renders identically (it never used the deleted rules)

## Self-Check: PASSED
