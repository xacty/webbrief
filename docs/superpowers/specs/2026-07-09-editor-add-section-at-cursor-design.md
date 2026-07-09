# Editor — Add Section at Cursor (Right-Click)

**Date:** 2026-07-09
**Branch:** `feat/editor-add-section-at-cursor`
**Scope:** Editor UX — right-click menu action to split a section by inserting a new `sectionDivider` at the clicked position.

---

## Problem

Users editing long content in a `page` project cannot currently split a section mid-content. The sidebar `+` button and the per-section kebab "Agregar sección debajo" both create the new section *after* an existing one, not *at* the cursor. When a section like "FAQs - Sobre Plena" grows to hold many H3 questions that should live in 4 separate sections, the only workaround is manual cut/paste — error-prone and slow.

## Goal

Add a right-click menu item **"Nueva sección aquí"** that inserts a fresh `sectionDivider` at the clicked position, so all content from that point down (until the next existing divider, or end of doc) becomes part of the new section — no cut/paste, no modal, no interruption.

## Non-Goals

- No change to the sidebar `+` button.
- No change to the kebab "Agregar sección debajo" flow.
- No modal to name the section — auto-name only (rename later from sidebar kebab).
- No support for `document` project type (no sections).
- No visual preview of insertion line (nice-to-have, out of scope).

---

## User Flow

1. User right-clicks on any content block inside the editor canvas.
2. Custom `EditorContextMenu` opens; new item **"Nueva sección aquí"** appears above the "Tipo de bloque" submenu, between "Insertar enlace" and formatting toggles.
3. User clicks it.
4. New `sectionDivider` node inserted at the top-level block boundary immediately before the block containing the click.
5. Auto-name assigned: `Sección N` (page) or `Pregunta Frecuente N` (faq).
6. Active section switches to new one; scroll+yellow-flash lands on it.
7. Content below the click point is now inside the new section (derived from divider positions).
8. Rename via sidebar kebab if desired.

---

## Architecture

Two files touched:

### 1. `frontend/src/pages/ProjectEditor.jsx`

**Context-menu handler (~L7313):**

Extend `handleContextMenu` to compute a top-level block-boundary position from the click's viewport coords:

```js
const coord = editor.view.posAtCoords({ left: e.clientX, top: e.clientY })
let insertBoundary = null
if (coord) {
  const $pos = editor.state.doc.resolve(coord.pos)
  if ($pos.depth >= 1) insertBoundary = $pos.before(1)
}
setContextMenuInsertBoundary(insertBoundary)
```

Store in new state `contextMenuInsertBoundary`. Reset to `null` when the menu closes (mirror `contextMenuPos` lifecycle).

**New function `addSectionAtPos(insertPos)`:**

Variant of existing `addSection(name, insertAfterSectionId)`. Shared: generation of `id`, auto-name via `getNextSectionNumber`, `protectedEmptySectionIds` add, `renumberAutoSections`, `setActiveSectionId`, `setScrollRequest`. Different: uses `insertPos` directly (validated) instead of computing via `getSectionInsertPos`. No `afterDividerNode` inserted — the content already at that boundary becomes the new section's first block.

```js
function addSectionAtPos(insertPos) {
  if (!canEditProjectStructure) return
  if (!editorRef.current) return
  if (typeof insertPos !== 'number' || insertPos < 0) return

  const id = `s_${Date.now()}`
  const currentSections = deriveSectionsFromDoc(editorRef.current, projectType)
  const autoPrefix = projectType === 'faq' ? 'Pregunta Frecuente' : 'Sección'
  const finalName = `${autoPrefix} ${getNextSectionNumber(currentSections)}`

  protectedEmptySectionIds.current.add(id)

  editorRef.current
    .chain()
    .insertContentAt(insertPos, {
      type: 'sectionDivider',
      attrs: { sectionId: id, sectionName: finalName },
    })
    .run()

  renumberAutoSections(editorRef.current)
  setActiveSectionId(id)
  setScrollRequest({ type: 'section', sectionId: id, requestId: Date.now() })
}
```

**Wire to context menu:**

Pass `onAddSectionHere` and `canAddSectionHere` props to `<EditorContextMenu>`:

```jsx
<EditorContextMenu
  ...
  canAddSectionHere={
    canEditProjectStructure &&
    projectType !== 'document' &&
    contextMenuInsertBoundary !== null &&
    !isBoundaryImmediatelyAfterDivider(editor, contextMenuInsertBoundary)
  }
  onAddSectionHere={() => addSectionAtPos(contextMenuInsertBoundary)}
  addSectionLabel={projectType === 'faq' ? 'Nueva pregunta aquí' : 'Nueva sección aquí'}
/>
```

Where `isBoundaryImmediatelyAfterDivider` is a small helper that returns `true` iff the top-level node ending at `insertPos` is a `sectionDivider` (i.e., inserting here would leave an empty section above).

### 2. `frontend/src/components/editor/EditorContextMenu.jsx`

**New props:** `onAddSectionHere` (function), `canAddSectionHere` (boolean), `addSectionLabel` (string).

**New menu item** rendered between "Insertar enlace" and the format Separator, only when `canAddSectionHere === true`:

```jsx
<MenuItem
  icon={SquareSplitVertical}
  label={addSectionLabel}
  onSelect={() => { onClose?.(); onAddSectionHere?.() }}
/>
```

Icon from `lucide-react` — `SquareSplitVertical` visually reads as "divide horizontally". If unavailable in the installed version, fall back to `Plus`.

No submenu, no shortcut. No selection restore needed (this action doesn't operate on the text selection; it operates on the click position captured at right-click time).

---

## Edge Cases

| Case | Behavior |
|---|---|
| Click on a `sectionDivider` node itself | `$pos.before(1)` lands on the divider's own start; helper detects "previous top-level node is a divider" → item hidden. |
| Click immediately below an existing divider (first block of a section) | Same as above — insertion would produce an empty section between two dividers → item hidden. |
| Click in the last block of doc | Item shown; new section receives all content from that block to end. |
| Click in doc empty area (below last block) | `posAtCoords` may return the end position; boundary resolves to end. New section appended with no content (empty, protected). |
| `projectType === 'document'` | Item hidden. |
| `projectType === 'faq'` | Item shown, labeled "Nueva pregunta aquí". |
| User lacks `canEditProjectStructure` | Item hidden. |
| Right-click on a table | Existing code delegates to `TableRightClickMenu`; our menu doesn't open. No conflict. |

---

## Non-Regressions to Verify

- Sidebar `+` button unchanged (opens `AddSectionModal`).
- Kebab "Agregar sección debajo" unchanged (opens `AddSectionModal` with `insertAfterSectionId`).
- Existing cut / copy / paste / comment / link / format menu items still work.
- `FakeSelection` overlay still paints correctly when there's a selection at right-click.
- Autosave still fires `section_added` event for the new section.

---

## Testing (manual, browser-driven)

1. Open a `page` project with one long section.
2. Right-click at a mid-content block → menu shows "Nueva sección aquí".
3. Click → new "Sección N" appears in sidebar, active, yellow-flashed. Content from click-block down is under it.
4. Sidebar navigation to old and new sections works.
5. Right-click on a `sectionDivider` label → menu item is hidden.
6. Right-click in `faq` project → label reads "Nueva pregunta aquí".
7. Save → activity panel shows `section_added`.

---

## Estimate

~10 min agent-execution time.

- `addSectionAtPos` implementation: ~3 min
- Context-menu wiring + click-position capture: ~3 min
- `EditorContextMenu` new MenuItem + props: ~2 min
- Browser verification: ~2 min

No migrations, no backend changes, no new tests.
