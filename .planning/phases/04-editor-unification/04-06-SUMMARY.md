---
phase: 04-editor-unification
plan: 06
status: complete
type: execute
wave: 6
requirements: [UI-06, UI-07]
key_files:
  created: []
  modified:
    - frontend/src/pages/ProjectEditor.jsx
    - frontend/src/pages/ProjectEditor.module.css
commits:
  - 2aa4e5b
---

# Plan 04-06 — exportModal -> shared `<Modal>`

## Modal import

```js
// frontend/src/pages/ProjectEditor.jsx line 43
import { Modal } from '../components/ui'
```

Named export from `frontend/src/components/ui/index.js`. Path is `'../components/ui'` (no extension; folder index resolves to `index.js`).

## JSX changes (3 edits)

1. **Add import** (line 43): `import { Modal } from '../components/ui'`
2. **Outside-click handler** (line 8090): selector changed from `target.closest(\`.\${styles.exportModal}\`)` to `target.closest('[role="dialog"]')`. Modal renders `role="dialog"` on its card; the new selector matches the new exportModal location AND any other future `<Modal>` instance the user clicks inside. This preserves the original intent (don't deselect images when clicking inside the modal).
3. **JSX block** (line 8538): replaced the 8-line overlay+card+header+title+close JSX with a `<Modal>` wrapper. The eyebrow chip was moved inside the Modal body. The form internals are byte-identical.

```jsx
<Modal
  open={Boolean(exportModal)}
  onClose={closeImageExport}
  title="Configurar export"
  size="md"
  showCloseButton={true}
>
  {exportModal && (
    <>
      <p className={styles.exportEyebrow}>Exportación de imagen</p>
      <form className={styles.exportModalForm} onSubmit={handleImageExportSubmit}>
        {/* unchanged form internals: preview, fields, submit */}
      </form>
    </>
  )}
</Modal>
```

`{exportModal && (<>…</>)}` is a defensive fragment so the form internals (which dereference `exportModal.image`, `exportModal.images`, etc.) don't crash when `exportModal` is `null` and `Modal` is in its `open=false` (unmounted) state — Modal returns `null` when not open, but we keep the guard for clarity.

## CSS rule changes

**Deleted** from `ProjectEditor.module.css` (~70 lines):
- `.exportModalOverlay`
- `.exportModal`
- `.exportModalHeader`
- `.exportModalEyebrow`
- `.exportModalTitle`
- `.exportModalClose`

**Preserved**: `.exportModalForm` (consumed inside new Modal body).

**Added**: `.exportEyebrow` (10 lines, chip styling per UI-SPEC):
```css
.exportEyebrow {
  display: inline-block;
  margin-bottom: var(--wb-space-2);
  padding: var(--wb-space-1) var(--wb-space-2);
  background: var(--wb-color-neutral-100);
  color: var(--wb-color-neutral-700);
  font-size: var(--wb-text-xs);
  font-weight: var(--wb-weight-medium);
  border-radius: var(--wb-radius-full);
}
```

## Acceptance gates (all PASS)

- `import { Modal } from '../components/ui'` present in `ProjectEditor.jsx`
- `<Modal` opening tag present (1 occurrence)
- `^\s*\.exportModal(Overlay|Header|Eyebrow|Title|Close)\s*\{` returns 0 matches in `ProjectEditor.module.css`
- `.exportModalForm {` present (line 1357)
- `.exportEyebrow {` present (line 1346)
- `vite build` exits 0
- ProjectEditor bundle: 696.31 kB (+4 kB from Modal import — within tolerance)

## Behavior delegated to shared `<Modal>`

- Body-scroll lock with refcount (handles stacked modals)
- Escape close
- Focus trap (Tab cycling)
- Overlay click close (mousedown→mouseup gate to avoid drag-out)
- Close-button X click
- `z-index: var(--wb-z-modal)` (replaces literal `z-index: 1200`)
- Restoration of previous active element on close
- ARIA accessible name from `title` prop

## Single + bulk mode preserved

The form internals at lines 8550-8650 contain the `exportModal.mode === 'bulk' ? ... : ...` branches, all preserved byte-identically. Both modes:
- Render correct preview (single image vs. grid of thumbs)
- Show correct field labels ("Nombre de archivo" vs. "Base del nombre", "Ancho" vs. "Máx. ancho", "Alto" hidden in bulk, etc.)
- Submit to correct endpoint (`/api/projects/:id/assets/export` vs. `/api/projects/:id/assets/export-bulk`)

## DEVIATION from UI-SPEC

UI-SPEC §"Modal Migration Contract → exportModal" describes the modal as containing an "audience picker (Designer / Dev)" — but verified at planning time the actual exportModal is for **image export** (Spanish: "Exportación de imagen"), not document/handoff export. The eyebrow text and form fields are different. The UI-SPEC's audience-picker description does not apply; the migration to `<Modal>` chrome still applies, with the existing image-export form preserved as the body. Plan 04-06's `<deviation>` block in the plan body documented this prior to execution.

## Visual checkpoint (plan task 2)

Per user instructions ("Claude_Preview MCP fallback aceptable: vite build + grep gates + verificación de invariantes"):
- Build passes (CSS + JSX both parse)
- Plan acceptance gates pass (all 6)
- Modal API contract honored (open/onClose/title/size/showCloseButton)
- Outside-click handler updated to use `[role="dialog"]` (preserves intent)
- Form internals + submit handler byte-identical (no API contract drift)

Final visual matrix in plan 04-09 (network payload smoke check + single + bulk QA flows).

## Self-Check: PASSED
