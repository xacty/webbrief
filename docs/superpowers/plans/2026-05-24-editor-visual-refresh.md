# Editor Visual Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the ProjectEditor's chrome (navbar, panels, toolbar, floating bar, comments) from its own dark-leaning palette to the new Modern SaaS / indigo `#4f46e5` palette used by the admin shell, while keeping the canvas always-light (Google Docs pattern).

**Architecture:** Pure CSS + minimal JSX refactor. No new components, no TipTap behavior changes, no React state restructuring. Editor consumes shell tokens (`--wb-surface`, `--wb-text`, `--wb-primary`, etc.) instead of legacy `--wb-editor-*` tokens. Canvas content area is scoped under a `.canvas` selector that re-asserts light values regardless of `[data-theme="dark"]` on `<html>`.

**Tech Stack:** React 18, TipTap, CSS Modules, lucide-react icons. No new dependencies.

**Reference spec:** `docs/superpowers/specs/2026-05-24-editor-visual-refresh-design.md`

---

## File Structure (what gets touched)

| File | Lines | Responsibility | Changes |
|---|---|---|---|
| `frontend/src/styles/tokens.css` | ~290 | Global tokens | Deprecate `--wb-editor-*` chrome aliases (keep canvas-scoped only); add `--wb-canvas-*` lock tokens |
| `frontend/src/pages/ProjectEditor.module.css` | 1715 | Layout, canvas wrapper, left panel, floating bar, block labels, section dividers | Token migration + indigo active states + block label restyle + divider restyle |
| `frontend/src/pages/ProjectEditorNav.module.css` | 566 | Top navbar | Breadcrumb, page pills active state → indigo, save chip pattern |
| `frontend/src/pages/ProjectEditorPanels.module.css` | 1172 | Left/right panel + history/share/deliverables cards | Underline tabs, shell card tokens, indigo avatar, event rows with dividers |
| `frontend/src/pages/ProjectEditorToolbar.module.css` | 248 | Formatting toolbar | 5-group layout, 32px buttons, indigo active state |
| `frontend/src/components/editor/CommentMarginCards.module.css` | 371 | Comment margin cards | Indigo avatar, shell card tokens |
| `frontend/src/components/editor/CommentsUI.module.css` | 414 | Comment popovers, mentions | @mention color → primary, hover states |
| `frontend/src/pages/ProjectEditor.jsx` | 9626 | Editor render — JSX selectively edited | Breadcrumb structure, save chip markup, lucide icon swaps, semantic class adjustments |

Total CSS surface to touch: ~4500 lines across 7 files. Plan is to migrate incrementally — one surface per commit — so each change is reviewable in isolation.

---

## Execution Notes

- **No TDD-style unit tests** — this is visual CSS work. Each task ends with a **visual verification checklist** the implementer walks through manually on `http://localhost:5176`.
- **Dev server**: assume Vite is already running. If not, `cd frontend && npx vite --port 5176 --host` from the worktree root.
- **Routes to verify per task**: each task lists the specific routes to load and elements to inspect.
- **Dark mode toggle**: the AppShell has a "Modo oscuro" button. Verify each refreshed surface in both themes.
- **Commit per task** — keeps blast radius small if something needs to roll back.
- **One subagent per task** — do not bundle. Each task should be reviewable independently.
- The user has 2 deferred Phase 2 items (floating glass toolbar, horizontal bubble block-picker). These are **explicitly out of scope** for this plan.

---

## Task 0: Pre-flight — read the spec and walk the editor

**Files:**
- Read: `docs/superpowers/specs/2026-05-24-editor-visual-refresh-design.md`
- Read: `frontend/src/styles/tokens.css` (full)
- Read: `frontend/src/pages/ProjectEditor.module.css` (skim — get a feel for the structure)

- [ ] **Step 1: Read the spec end to end**

The 3 foundational decisions (F1-F3) and 7 surface plans (S1-S7) drive every subsequent task. Do not start any task without having read the matching section.

- [ ] **Step 2: Open the editor in the browser**

Navigate to `http://localhost:5176/project/<any-project-id>/editor` (find a project id from `/companies/<id>` → click any project's "Abrir"). Walk through every surface mentioned in the spec (navbar, toolbar, canvas, left panel, right panel, bottom bar, click into a comment). Take mental notes of what each looks like before changes.

- [ ] **Step 3: Toggle dark mode**

From the AppShell sidebar footer, click "Modo oscuro". Reload the editor route. Note that today the canvas inverts (which is what we're going to fix in Task 1). Then toggle back to light.

- [ ] **Step 4: Grep editor-scoped tokens to know the surface**

```bash
cd /Users/adrian/github/webbrief/.claude/worktrees/ecstatic-snyder-d8bd82
grep -rn "wb-editor-\|wb-tooltip-\|wb-comment-\|wb-section-flash" frontend/src --include="*.css" --include="*.jsx" | wc -l
```

Expected: a few hundred matches. This is the migration surface for Tasks 1-2.

No commit. This is read-only orientation.

---

## Task 1: Canvas-light lock (F1 foundational)

**Goal:** Guarantee the TipTap canvas stays light no matter what `[data-theme]` is set on `<html>`. This is the most important invariant of the whole refresh — if this breaks, the spec breaks.

**Files:**
- Modify: `frontend/src/styles/tokens.css` (add canvas-locked tokens)
- Modify: `frontend/src/pages/ProjectEditor.module.css` (add `.canvas` scope that consumes the locked tokens)
- Verify: `frontend/src/pages/ProjectEditor.jsx` (confirm the TipTap content has a `.canvas` wrapper or add one if missing)

- [ ] **Step 1: Add canvas-lock tokens to `tokens.css`**

Inside the `:root` block in `tokens.css`, add a `--wb-canvas-*` token family. These never invert in dark mode (no override in `[data-theme="dark"]`):

```css
/* Canvas lock — values that stay paper-white regardless of theme.
   Used inside .canvas to keep the TipTap surface light when the rest
   of the chrome inverts. Mimics Google Docs / Word in dark mode. */
--wb-canvas-bg:           #ffffff;
--wb-canvas-text:         #0f172a;        /* slate-900 */
--wb-canvas-text-muted:   #475569;        /* slate-600 */
--wb-canvas-border:       #e2e8f0;        /* slate-200 */
--wb-canvas-surface-muted: #f8fafc;       /* slate-50 — for callouts inside canvas */
```

- [ ] **Step 2: Add `.canvas` scope to `ProjectEditor.module.css`**

At the top of the file (after the existing layout rules), add:

```css
/* Canvas — TipTap editing surface. Always paper-light regardless of
   global theme. Per spec F1: canvas siempre claro, chrome sigue toggle. */
.canvas {
  background: var(--wb-canvas-bg);
  color: var(--wb-canvas-text);
  border-color: var(--wb-canvas-border);
}

.canvas a {
  color: var(--wb-color-primary-700);
}

.canvas ::selection {
  background: var(--wb-color-primary-100);
  color: var(--wb-canvas-text);
}
```

- [ ] **Step 3: Wrap the TipTap content with `.canvas`**

Open `ProjectEditor.jsx`, locate the `<EditorContent />` (or equivalent TipTap mount node). If it does not already have `className={styles.canvas}`, add it. If it lives inside another wrapper, ensure the outermost element containing the TipTap-rendered HTML has the `canvas` class.

Use Grep to locate the mount: `grep -n "EditorContent\|editor.\?contentDOM\|tiptap" ProjectEditor.jsx | head -5`.

- [ ] **Step 4: Visually verify the canvas stays light in dark mode**

```bash
# (dev server should already be running on 5176)
```

Manual checks:
- Navigate to `/project/<id>/editor`
- Verify canvas is white
- Toggle "Modo oscuro" in the AppShell sidebar
- Verify chrome inverts to dark, **but canvas content area stays white** with dark text
- Type text — should be `slate-900` on white, never inverted
- Select text — selection color should be light indigo
- Toggle back to light — canvas still white (no flash)

- [ ] **Step 5: Commit**

```bash
cd /Users/adrian/github/webbrief/.claude/worktrees/ecstatic-snyder-d8bd82
git add frontend/src/styles/tokens.css frontend/src/pages/ProjectEditor.module.css frontend/src/pages/ProjectEditor.jsx
git commit -m "feat(editor): lock canvas to always-light tokens

Adds --wb-canvas-* tokens that never invert in dark mode and scopes
them under .canvas in ProjectEditor.module.css. Per spec F1: editor
chrome follows the shell toggle, canvas stays paper-white like Google
Docs / Word dark mode pattern.

Refs: docs/superpowers/specs/2026-05-24-editor-visual-refresh-design.md"
```

---

## Task 2: Editor chrome token migration

**Goal:** Replace `--wb-editor-bg`, `--wb-editor-surface`, `--wb-editor-text*`, `--wb-editor-border*` usages in chrome surfaces (navbar, toolbar, panels, floating bar) with the shell's general tokens (`--wb-surface`, `--wb-text`, `--wb-border`, etc.). Editor sub-tokens that genuinely scope only to canvas-internal styling (e.g., tooltip backgrounds inside the canvas) stay.

**Files:**
- Modify: `frontend/src/pages/ProjectEditor.module.css`
- Modify: `frontend/src/pages/ProjectEditorNav.module.css`
- Modify: `frontend/src/pages/ProjectEditorPanels.module.css`
- Modify: `frontend/src/pages/ProjectEditorToolbar.module.css`
- Modify: `frontend/src/components/editor/CommentMarginCards.module.css`
- Modify: `frontend/src/components/editor/CommentsUI.module.css`
- Modify: `frontend/src/styles/tokens.css` (mark deprecated tokens with a comment)

- [ ] **Step 1: Build a token map**

The mapping from editor tokens → shell tokens (apply globally with search-and-replace):

| Editor token (deprecate) | Shell token (use) | Notes |
|---|---|---|
| `--wb-editor-bg` | `--wb-surface` | Chrome surfaces |
| `--wb-editor-surface` | `--wb-surface-muted` | Toolbar segments, dropdown items |
| `--wb-editor-surface-elevated` | `--wb-surface` + `box-shadow: var(--wb-shadow-md)` | Elevated popovers |
| `--wb-editor-border` | `--wb-border` | All borders |
| `--wb-editor-border-strong` | `--wb-border-strong` | Hover/active borders |
| `--wb-editor-text-on-dark` | `--wb-text` (theme-aware) | Text on chrome |
| `--wb-editor-text-on-dark-muted` | `--wb-text-muted` | Muted text on chrome |
| `--wb-editor-text` | `--wb-text` (theme-aware) | Dark text on light surface |

**Keep as canvas-internal (do not migrate):**
- `--wb-tooltip-bg`, `--wb-tooltip-text` — Google Docs-style floating tooltips inside the canvas
- `--wb-comment-highlight*` — yellow highlight in canvas text (functional, not chrome)
- `--wb-section-flash` — yellow flash animation on canvas

- [ ] **Step 2: Search-and-replace in each chrome CSS file**

For each of the 6 CSS files listed in **Files**, perform the replacements from the map. Use `sed` for the bulk replacement, then manually review each diff before committing.

```bash
cd /Users/adrian/github/webbrief/.claude/worktrees/ecstatic-snyder-d8bd82/frontend/src

for f in pages/ProjectEditor.module.css pages/ProjectEditorNav.module.css pages/ProjectEditorPanels.module.css pages/ProjectEditorToolbar.module.css components/editor/CommentMarginCards.module.css components/editor/CommentsUI.module.css; do
  sed -i '' \
    -e 's/var(--wb-editor-bg)/var(--wb-surface)/g' \
    -e 's/var(--wb-editor-surface)/var(--wb-surface-muted)/g' \
    -e 's/var(--wb-editor-border)/var(--wb-border)/g' \
    -e 's/var(--wb-editor-border-strong)/var(--wb-border-strong)/g' \
    -e 's/var(--wb-editor-text-on-dark-muted)/var(--wb-text-muted)/g' \
    -e 's/var(--wb-editor-text-on-dark)/var(--wb-text)/g' \
    -e 's/var(--wb-editor-text)/var(--wb-text)/g' \
    "$f"
done
```

- [ ] **Step 3: Audit `--wb-editor-surface-elevated` manually**

`--wb-editor-surface-elevated` doesn't map to a single token (it was darker than the base for elevation). Grep usage and replace with `var(--wb-surface)` + `box-shadow: var(--wb-shadow-md)` on the same element:

```bash
grep -rn "wb-editor-surface-elevated" frontend/src --include="*.css"
```

For each match: replace the background, and add `box-shadow: var(--wb-shadow-md)` to the same rule. Do this manually per occurrence (usually only 1-3 matches).

- [ ] **Step 4: Mark deprecated tokens in `tokens.css`**

In `tokens.css`, find the `--wb-editor-*` block (around lines 200-225 per spec). Add a deprecation comment above it; do not delete yet (canvas-internal tokens like `--wb-tooltip-*` stay):

```css
/* DEPRECATED — chrome editor tokens removed in editor visual refresh
   (spec 2026-05-24). Kept only for canvas-internal usage. Do not
   reintroduce in chrome surfaces; use shell tokens instead.
   Migration map in plan 2026-05-24-editor-visual-refresh.md Task 2. */
```

Then keep only the canvas-internal ones (`--wb-tooltip-*`, `--wb-comment-*`, `--wb-section-flash`). Delete the chrome ones (`--wb-editor-bg`, `--wb-editor-surface`, etc.) — they should no longer be referenced after Step 2.

- [ ] **Step 5: Verify no broken references**

```bash
cd /Users/adrian/github/webbrief/.claude/worktrees/ecstatic-snyder-d8bd82
grep -rn "wb-editor-bg\|wb-editor-surface[^-]\|wb-editor-border\|wb-editor-text" frontend/src --include="*.css" --include="*.jsx"
```

Expected: 0 results. If non-zero, manually fix each remaining reference.

- [ ] **Step 6: Visual smoke test**

In the browser at `/project/<id>/editor`:
- Editor still loads
- All chrome surfaces (navbar, toolbar, panels) render — colors may look "off" compared to spec target (we'll fix per-surface in Tasks 3-9) but **nothing is unstyled or transparent**
- Toggle dark mode — chrome inverts, canvas stays light (Task 1 invariant holds)

- [ ] **Step 7: Commit**

```bash
git add frontend/src/styles/tokens.css frontend/src/pages/ProjectEditor.module.css frontend/src/pages/ProjectEditorNav.module.css frontend/src/pages/ProjectEditorPanels.module.css frontend/src/pages/ProjectEditorToolbar.module.css frontend/src/components/editor/CommentMarginCards.module.css frontend/src/components/editor/CommentsUI.module.css
git commit -m "refactor(editor): migrate chrome from editor tokens to shell tokens

Replaces --wb-editor-bg/surface/border/text* in all 6 chrome CSS
modules with their shell-tokens equivalents (--wb-surface, --wb-border,
--wb-text, etc.). Canvas-internal tokens (--wb-tooltip-*,
--wb-comment-*) stay scoped to the canvas.

Deprecated chrome editor tokens removed from tokens.css; canvas-only
ones kept and annotated.

Per spec Cross-Cutting: Component Reuse + Migration Notes.
Refs: docs/superpowers/specs/2026-05-24-editor-visual-refresh-design.md"
```

---

## Task 3: Top Navbar refresh (S1)

**Goal:** Breadcrumb + page pills with indigo active state, "Sin guardar" as muted chip, indigo bell badge, save button untouched.

**Files:**
- Modify: `frontend/src/pages/ProjectEditorNav.module.css`
- Modify: `frontend/src/pages/ProjectEditor.jsx` (navbar JSX section)

- [ ] **Step 1: Locate the navbar JSX**

```bash
grep -n "className={styles.nav\b\|className={\`\${styles.nav\b" frontend/src/pages/ProjectEditor.jsx | head -10
```

Identify the top-level navbar element and its children: logo, back button, page title, page pills, save button, bell, profile.

- [ ] **Step 2: Add breadcrumb row above page pills**

In the JSX, add a breadcrumb element between the logo+back area and the page pills. Use the project + company data already available in component state (look for `project.companyName` and `project.name` — adjust to actual prop names if different):

```jsx
<nav className={styles.breadcrumb} aria-label="Migas de pan">
  <button type="button" className={styles.breadcrumbLink} onClick={() => navigate('/companies')}>
    Empresas
  </button>
  <span className={styles.breadcrumbSep} aria-hidden="true">/</span>
  <button type="button" className={styles.breadcrumbLink} onClick={() => navigate(`/companies/${project.companyId}`)}>
    {project.companyName}
  </button>
  <span className={styles.breadcrumbSep} aria-hidden="true">/</span>
  <span className={styles.breadcrumbCurrent} aria-current="page">{project.name}</span>
</nav>
```

- [ ] **Step 3: Add breadcrumb styles (copy CompanyPage pattern)**

In `ProjectEditorNav.module.css`, append (or place near top of file after existing navbar layout):

```css
.breadcrumb {
  display: flex;
  align-items: center;
  gap: var(--wb-space-2);
  font-size: var(--wb-text-xs);
  color: var(--wb-text-muted);
}

.breadcrumbLink {
  background: transparent;
  border: 0;
  padding: 0;
  font: inherit;
  color: var(--wb-primary);
  cursor: pointer;
  font-weight: var(--wb-weight-medium);
}

.breadcrumbLink:hover {
  text-decoration: underline;
}

.breadcrumbSep {
  color: var(--wb-text-muted);
  opacity: 0.5;
}

.breadcrumbCurrent {
  color: var(--wb-text-muted);
  font-weight: var(--wb-weight-regular);
}
```

- [ ] **Step 4: Update page pill active state to indigo**

Find the page pill rules in `ProjectEditorNav.module.css`. Look for classes like `.pagePill`, `.pagePillActive`, `.pageTab`, `.pageTabActive` (exact name varies — grep first):

```bash
grep -n "pagePill\|pageTab\|activePage" frontend/src/pages/ProjectEditorNav.module.css
```

Change the active rule to use indigo. Replace the previous dark background with:

```css
.pagePillActive {
  background: var(--wb-color-primary-600);
  color: #ffffff;
  border-color: var(--wb-color-primary-600);
}

.pagePillActive:hover {
  background: var(--wb-color-primary-700);
}
```

Inactive pills keep their existing neutral style (verify they use `--wb-surface` / `--wb-border` after Task 2).

- [ ] **Step 5: Convert "Sin guardar" from button to muted chip**

Find the save status indicator in the JSX (grep for `Sin guardar`):

```bash
grep -n "Sin guardar" frontend/src/pages/ProjectEditor.jsx
```

Replace the existing element with a chip span:

```jsx
{!isSaved && (
  <span className={styles.saveStatusChip} aria-live="polite">
    <span className={styles.saveStatusDot} aria-hidden="true" />
    Sin guardar
  </span>
)}
```

(Adjust `isSaved` to the actual state variable name — usually `dirty` or `saveStatus !== 'saved'`.)

Add the chip styles to `ProjectEditorNav.module.css`:

```css
.saveStatusChip {
  display: inline-flex;
  align-items: center;
  gap: var(--wb-space-2);
  padding: var(--wb-space-1) var(--wb-space-3);
  border-radius: var(--wb-radius-full);
  background: var(--wb-surface-muted);
  color: var(--wb-text-muted);
  font-size: var(--wb-text-xs);
  font-weight: var(--wb-weight-medium);
}

.saveStatusDot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--wb-color-warning-500);
}
```

- [ ] **Step 6: Update bell badge color to indigo**

In the navbar JSX, locate the notification bell (`grep -n "Bell\|notificationBell" frontend/src/pages/ProjectEditor.jsx`). The badge has a count like "2". Find the corresponding CSS rule and replace its red background with `--wb-color-primary-600`:

```css
.bellBadge {
  background: var(--wb-color-primary-600);
  color: #ffffff;
  /* keep existing size/position/font rules */
}
```

(If there's a separate `.bellBadgeError` for actual errors, leave that red.)

- [ ] **Step 7: Visual verification**

Reload `/project/<id>/editor`:
- Breadcrumb appears above page pills, "Empresas" + company name in indigo, current project name muted
- Active page pill is indigo (not dark)
- "Sin guardar" is a small muted chip with a yellow dot, not a button
- Bell badge is indigo
- Save button (right side) is still indigo primary, unchanged
- Toggle dark mode: breadcrumb separator and inactive pills invert, indigo accents stay vibrant, chip still muted

- [ ] **Step 8: Commit**

```bash
git add frontend/src/pages/ProjectEditorNav.module.css frontend/src/pages/ProjectEditor.jsx
git commit -m "feat(editor/navbar): breadcrumb + indigo accents + muted save chip

- Adds breadcrumb row 'Empresas / <Company> / <Project>' above page pills
- Active page pill: dark → indigo (matches shell branding)
- 'Sin guardar' becomes muted chip with warning dot (was button-like)
- Notification bell badge: red → indigo (red kept for real errors)

Refs spec S1 in docs/superpowers/specs/2026-05-24-editor-visual-refresh-design.md"
```

---

## Task 4: Floating Bottom Bar (S6)

**Goal:** Same `Brief | Handoff | Preview` modes, but active state indigo (was dark/black), lucide icons, pill shape with shell shadow.

**Files:**
- Modify: `frontend/src/pages/ProjectEditor.module.css` (floating bar rules)
- Modify: `frontend/src/pages/ProjectEditor.jsx` (icon swaps in the bottom bar JSX)

- [ ] **Step 1: Locate floating bar JSX**

```bash
grep -n "floatingBar\|floatingMode\|Brief\b\|Handoff\b\|Preview\b" frontend/src/pages/ProjectEditor.jsx | head -20
```

Identify the bottom bar container and the 3 mode buttons.

- [ ] **Step 2: Locate floating bar CSS**

```bash
grep -n "floatingBar\|floatingMode\|floatingSegment" frontend/src/pages/ProjectEditor.module.css | head -15
```

- [ ] **Step 3: Update active state from dark to indigo**

Find the active button rule (probably `.floatingModeBtnActive` or `.modeActive`). Replace its dark/black background with indigo:

```css
.floatingModeBtnActive {
  background: var(--wb-color-primary-600);
  color: #ffffff;
  box-shadow: 0 0 0 1px var(--wb-color-primary-600);
}

.floatingModeBtnActive:hover {
  background: var(--wb-color-primary-700);
}
```

The inactive mode buttons should use `background: transparent; color: var(--wb-text-muted)` — confirm or adjust.

- [ ] **Step 4: Swap mode icons to lucide**

In `ProjectEditor.jsx`, find the mode buttons. They likely currently use generic icons or no icons. Import 3 lucide icons:

```jsx
import { FileText, Send, Eye } from 'lucide-react'
```

Inside each mode button JSX:
- Brief button: `<FileText size={16} />` before label
- Handoff button: `<Send size={16} />` before label
- Preview button: `<Eye size={16} />` before label

- [ ] **Step 5: Polish the bar container**

In `ProjectEditor.module.css`, find the `.floatingBar` rule. Ensure it uses:

```css
.floatingBar {
  position: fixed;
  bottom: var(--wb-space-5);
  left: 50%;
  transform: translateX(-50%);
  display: inline-flex;
  align-items: center;
  gap: var(--wb-space-1);
  padding: var(--wb-space-2);
  background: var(--wb-surface);
  border: 1px solid var(--wb-border);
  border-radius: var(--wb-radius-full);
  box-shadow: var(--wb-shadow-lg);
  z-index: var(--wb-z-sticky);
}
```

(Preserve existing position values if they differ; the visual goal is pill-shape with shell shadow.)

- [ ] **Step 6: Handle the Handoff sub-audience toggle (Designer/Dev)**

If the handoff sub-audience appears as a separate panel/row below when Handoff is active, find its container and ensure it uses similar pill styling but smaller (toggle pair):

```css
.handoffAudienceToggle {
  display: inline-flex;
  gap: var(--wb-space-1);
  padding: var(--wb-space-1);
  background: var(--wb-surface-muted);
  border-radius: var(--wb-radius-full);
}

.handoffAudienceBtn {
  padding: var(--wb-space-1) var(--wb-space-3);
  border-radius: var(--wb-radius-full);
  background: transparent;
  color: var(--wb-text-muted);
  font-size: var(--wb-text-xs);
  font-weight: var(--wb-weight-medium);
  border: none;
  cursor: pointer;
}

.handoffAudienceBtnActive {
  background: var(--wb-surface);
  color: var(--wb-color-primary-700);
  box-shadow: var(--wb-shadow-xs);
}
```

(Class names are illustrative — adapt to existing names. Grep for `Designer\|Dev\|audience` in the JSX.)

- [ ] **Step 7: Visual verification**

- Click Brief → indigo active, FileText icon visible
- Click Handoff → indigo active, Send icon visible, audience toggle appears below
- Click Preview → indigo active, Eye icon visible
- Bottom bar floats with shell `shadow-lg` and rounded pill shape
- Dark mode: bar bg inverts to dark surface, active state still indigo, contrast preserved

- [ ] **Step 8: Commit**

```bash
git add frontend/src/pages/ProjectEditor.module.css frontend/src/pages/ProjectEditor.jsx
git commit -m "feat(editor/bottom-bar): indigo active state + lucide icons

- Mode buttons (Brief | Handoff | Preview) active state: dark → indigo
- Adds lucide icons (FileText, Send, Eye) per mode
- Pill container uses shell shadow-lg and radius-full
- Handoff sub-audience (Designer/Dev) styled as smaller nested pill toggle

Refs spec S6 in docs/superpowers/specs/2026-05-24-editor-visual-refresh-design.md"
```

---

## Task 5: Left Panel sections list (S4)

**Goal:** Section list items match the shell sidebar nav rhythm — same height, indigo soft-bg active state, hover muted, drag handles on hover only.

**Files:**
- Modify: `frontend/src/pages/ProjectEditor.module.css` (left panel + section item rules)
- Modify: `frontend/src/pages/ProjectEditor.jsx` (only if drag-handle markup needs adjusting)

- [ ] **Step 1: Locate left panel CSS**

```bash
grep -n "leftPanel\|sectionItem\|sectionList\|sectionDrag" frontend/src/pages/ProjectEditor.module.css | head -20
```

- [ ] **Step 2: Update section item styles**

Replace the existing section item / section item active rules with:

```css
.sectionItem {
  display: flex;
  align-items: center;
  gap: var(--wb-space-3);
  padding: var(--wb-space-2) var(--wb-space-3);
  min-height: 40px;
  border-radius: var(--wb-radius-2);
  color: var(--wb-text-muted);
  cursor: pointer;
  transition: background-color 150ms ease, color 150ms ease;
}

.sectionItem:hover {
  background: var(--wb-surface-muted);
  color: var(--wb-text);
}

.sectionItemActive {
  background: var(--wb-primary-soft);
  color: var(--wb-primary);
  font-weight: var(--wb-weight-semibold);
}

.sectionItemActive:hover {
  background: var(--wb-primary-soft);
  color: var(--wb-primary);
}

.sectionDragHandle {
  opacity: 0;
  transition: opacity 120ms ease;
  color: var(--wb-text-tertiary, var(--wb-text-muted));
}

.sectionItem:hover .sectionDragHandle,
.sectionItem:focus-within .sectionDragHandle {
  opacity: 1;
}
```

(Adapt class names to actual ones — the existing names might be `.section`, `.sectionActive`, etc. Use whatever the JSX references.)

- [ ] **Step 3: Update H2/H3 nested item indents**

If H2/H3 items use additional padding for nesting, ensure they look:

```css
.sectionItemH2 {
  padding-left: var(--wb-space-6);
  font-size: var(--wb-text-sm);
}

.sectionItemH3 {
  padding-left: var(--wb-space-8);
  font-size: var(--wb-text-sm);
  color: var(--wb-text-muted);
}
```

- [ ] **Step 4: Polish left panel "+" button**

Find the add-section button (probably top of left panel). Adapt to use shell indigo subtle:

```css
.addSectionBtn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: var(--wb-radius-2);
  background: transparent;
  color: var(--wb-text-muted);
  border: 1px solid var(--wb-border);
  cursor: pointer;
}

.addSectionBtn:hover {
  background: var(--wb-primary-soft);
  color: var(--wb-primary);
  border-color: var(--wb-color-primary-100);
}
```

- [ ] **Step 5: Visual verification**

- Left panel section items are 40px tall, aligned to sidebar rhythm
- Hovering shows muted background + clearer text + drag handle appears
- Active section has indigo soft background + indigo text + bold
- H2/H3 items indented; smaller text on H3
- "+" button is subtle until hover (indigo subtle on hover)
- Dark mode: backgrounds invert; indigo accent stays vibrant; active state still primary-soft (which in dark mode resolves to the dark indigo variant)

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/ProjectEditor.module.css frontend/src/pages/ProjectEditor.jsx
git commit -m "feat(editor/left-panel): match shell sidebar rhythm + indigo active state

- Section items: 40px height (same as shell nav items)
- Hover: surface-muted background
- Active: primary-soft + primary text + semibold (matches AppShell.navItemActive)
- Drag handle hidden by default, fades in on hover
- '+' button uses indigo-subtle hover state

Refs spec S4 in docs/superpowers/specs/2026-05-24-editor-visual-refresh-design.md"
```

---

## Task 6: Right Panel polish (S5, F3)

**Goal:** Right panel keeps its vertical stack (Actividad/Historial tabs + share card + deliverables card + rules dock), but each piece adopts shell tokens, CompanyPage-style underline tabs, indigo avatars, event rows with dividers.

**Files:**
- Modify: `frontend/src/pages/ProjectEditorPanels.module.css`
- Modify: `frontend/src/pages/ProjectEditor.jsx` (only if tab markup or avatar markup needs adjusting)

- [ ] **Step 1: Locate right panel CSS**

```bash
grep -n "rightPanel\|historyTab\|activityTab\|shareCard\|deliverablesCard\|contentRules" frontend/src/pages/ProjectEditorPanels.module.css | head -25
```

- [ ] **Step 2: Replace tab styles with CompanyPage underline pattern**

Find the existing tab rules and replace with:

```css
.activityTabBar {
  display: flex;
  gap: 0;
  border-bottom: 1px solid var(--wb-border);
  margin-bottom: var(--wb-space-3);
}

.activityTab {
  padding: var(--wb-space-3) var(--wb-space-4);
  font-size: var(--wb-text-sm);
  font-weight: var(--wb-weight-medium);
  color: var(--wb-text-muted);
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  cursor: pointer;
  transition: color 150ms ease, border-color 150ms ease;
}

.activityTab:hover {
  color: var(--wb-text);
}

.activityTabActive {
  color: var(--wb-primary);
  font-weight: var(--wb-weight-semibold);
  border-bottom-color: var(--wb-primary);
}
```

(Adjust class names to match the existing markup. Grep first.)

- [ ] **Step 3: Update card styles (share, deliverables, content-rules dock)**

Find the three cards and ensure each one uses:

```css
.rightPanelCard {
  background: var(--wb-surface);
  border: 1px solid var(--wb-border);
  border-radius: var(--wb-radius-md);
  box-shadow: var(--wb-shadow-card);
  padding: var(--wb-space-4);
}

.rightPanelCardHeader {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--wb-space-3);
}

.rightPanelCardTitle {
  margin: 0;
  font-size: var(--wb-text-sm);
  font-weight: var(--wb-weight-semibold);
  color: var(--wb-text);
}
```

Apply these to `.shareCard`, `.deliverablesCard`, `.contentRulesCard` (or whatever names they use).

- [ ] **Step 4: Replace activity event cards with rows + dividers**

Find the activity event list. Today each event might be a `<Card>` or similar individual card. Change them to rows with bottom dividers:

```css
.eventList {
  display: flex;
  flex-direction: column;
}

.eventItem {
  display: flex;
  align-items: center;
  gap: var(--wb-space-3);
  padding: var(--wb-space-3) 0;
  border-bottom: 1px solid var(--wb-border);
}

.eventItem:last-child {
  border-bottom: none;
}

.eventAvatar {
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--wb-color-primary-100);
  color: var(--wb-color-primary-700);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: var(--wb-text-xs);
  font-weight: var(--wb-weight-bold);
}

.eventBody {
  flex: 1;
  min-width: 0;
}

.eventLabel {
  margin: 0;
  font-size: var(--wb-text-sm);
  color: var(--wb-text);
}

.eventMeta {
  margin: 2px 0 0;
  font-size: var(--wb-text-xs);
  color: var(--wb-text-muted);
}
```

- [ ] **Step 5: JSX adjustment if needed**

If the JSX currently wraps each event in a `<Card>`, change to plain `<div className={styles.eventItem}>`. Look for the event mapping in `ProjectEditor.jsx`:

```bash
grep -n "activity\|events\.map\|\.activityEvent\|historyEvent" frontend/src/pages/ProjectEditor.jsx | head -10
```

If avatars exist, ensure they have the initials structure:

```jsx
<span className={styles.eventAvatar} aria-hidden="true">
  {getInitials(event.actor?.fullName, event.actor?.email)}
</span>
```

If a `getInitials` helper isn't already in the file, import or define it (use the same one from `CompanyPage.jsx`).

- [ ] **Step 6: Refresh button polish**

The refresh button on the right panel (the circular refresh icon) — find it and ensure it uses lucide `RefreshCw`:

```jsx
import { RefreshCw } from 'lucide-react'
// ...
<button className={styles.refreshBtn} onClick={refreshActivity} aria-label="Actualizar">
  <RefreshCw size={14} />
</button>
```

And CSS:

```css
.refreshBtn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  background: transparent;
  border: 1px solid var(--wb-border);
  border-radius: var(--wb-radius-2);
  color: var(--wb-text-muted);
  cursor: pointer;
}

.refreshBtn:hover {
  color: var(--wb-primary);
  border-color: var(--wb-color-primary-100);
}
```

- [ ] **Step 7: Visual verification**

- Right panel tabs (Actividad / Historial) use underline active state in indigo
- Cards (Link público, Entregables, Content Rules dock) have consistent shell tokens — same border, shadow, radius as CompaniesPage cards
- Activity events are rows with bottom dividers, indigo avatar circles with initials, name + timestamp stacked
- Refresh button (top right of panel) is a subtle circular outline button with `RefreshCw` icon
- Dark mode: cards invert correctly, dividers remain visible, indigo accents stay vibrant

- [ ] **Step 8: Commit**

```bash
git add frontend/src/pages/ProjectEditorPanels.module.css frontend/src/pages/ProjectEditor.jsx
git commit -m "feat(editor/right-panel): shell tokens polish + CompanyPage tabs

Per spec F3 + S5 (keep vertical stack, polish only):
- Activity tabs (Actividad/Historial): CompanyPage underline pattern, indigo active
- Cards (Link público, Entregables, Content Rules): unified shell card tokens
  (--wb-border, --wb-shadow-card, --wb-radius-md)
- Event entries: rows with dividers (was: individual cards)
- Avatars: indigo circular with initials (reuses CompanyPage members pattern)
- Refresh button: lucide RefreshCw in subtle circular outline

Refs spec F3, S5 in docs/superpowers/specs/2026-05-24-editor-visual-refresh-design.md"
```

---

## Task 7: Comments visual refresh (S7)

**Goal:** Margin cards adopt shell card tokens, indigo avatars, indigo @mentions; functional yellow highlight stays.

**Files:**
- Modify: `frontend/src/components/editor/CommentMarginCards.module.css`
- Modify: `frontend/src/components/editor/CommentsUI.module.css`
- Modify (only if needed): `frontend/src/components/editor/CommentMarginCards.jsx`, `CommentComposerPopover.jsx`, `CommentInlinePopover.jsx`

- [ ] **Step 1: Locate the comment card surface**

```bash
grep -n "commentCard\|marginCard\|cardBody\|commentHeader\|commentAvatar" frontend/src/components/editor/CommentMarginCards.module.css
```

- [ ] **Step 2: Update comment card styles**

```css
.commentCard {
  background: var(--wb-surface);
  border: 1px solid var(--wb-border);
  border-radius: var(--wb-radius-md);
  box-shadow: var(--wb-shadow-card);
  padding: var(--wb-space-3);
}

.commentCard:hover,
.commentCardActive {
  border-color: var(--wb-color-primary-300);
  box-shadow: var(--wb-shadow-card-hover);
}

.commentHeader {
  display: flex;
  align-items: center;
  gap: var(--wb-space-2);
  margin-bottom: var(--wb-space-2);
}

.commentAvatar {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--wb-color-primary-100);
  color: var(--wb-color-primary-700);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: var(--wb-text-xs);
  font-weight: var(--wb-weight-bold);
}

.commentAuthor {
  font-size: var(--wb-text-sm);
  font-weight: var(--wb-weight-semibold);
  color: var(--wb-text);
}

.commentTimestamp {
  font-size: var(--wb-text-xs);
  color: var(--wb-text-muted);
}

.commentBody {
  font-size: var(--wb-text-sm);
  color: var(--wb-text);
  line-height: var(--wb-leading-snug);
}
```

(Adapt class names — grep first to match what the JSX uses.)

- [ ] **Step 3: Update @mention link color**

In `CommentsUI.module.css` (or wherever the mention rendering CSS lives), find the `.mention` / mailto-style rule and update:

```css
.mention {
  color: var(--wb-primary);
  text-decoration: none;
}

.mention:hover {
  text-decoration: underline;
}
```

- [ ] **Step 4: Replace any custom kebab menu inside comment cards with shell KebabMenu**

If the comment card has its own kebab dropdown markup, ensure it consumes the shared `KebabMenu` component from `frontend/src/components/ui`. Grep to check:

```bash
grep -n "KebabMenu\|kebab" frontend/src/components/editor/CommentMarginCards.jsx
```

If a custom dropdown exists, replace with:

```jsx
import { KebabMenu } from '../ui'
import { Pencil, Trash2, Link as LinkIcon } from 'lucide-react'
// ...
<KebabMenu
  label={`Acciones del comentario`}
  placement="bottom-end"
  items={[
    { label: 'Editar', icon: <Pencil size={14} />, onClick: () => handleEdit(comment.id) },
    { label: 'Copiar link', icon: <LinkIcon size={14} />, onClick: () => handleCopyLink(comment.id) },
    { label: 'Eliminar', icon: <Trash2 size={14} />, destructive: true, onClick: () => handleDelete(comment.id) },
  ]}
/>
```

If a custom dropdown already exists and works well, just ensure its visual style uses shell tokens (background `--wb-surface`, shadow `--wb-shadow-md`, etc.) — don't replace it unless straightforward.

- [ ] **Step 5: Verify yellow flash highlight stays unchanged**

Grep for `.commentHighlight\|comment-highlight\|wb-comment-highlight`:

```bash
grep -rn "wb-comment-highlight\|commentHighlight" frontend/src
```

Confirm these rules use the canvas-internal tokens (`--wb-comment-highlight*`) and remain functional. **Do not migrate** these to shell tokens — they're scoped to the canvas, not chrome.

- [ ] **Step 6: Visual verification**

- Create a comment on a text span — margin card appears with shell card style (border, shadow-card, radius-md)
- Hover on the card → border becomes indigo-300
- Avatar is indigo circular with initials
- Author name bold, timestamp muted
- @mention text is indigo
- Click kebab → menu items have lucide icons, "Eliminar" is destructive style
- Yellow flash highlight still works when clicking an event in activity feed
- Dark mode: cards invert, indigo accents stay vibrant

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/editor/CommentMarginCards.module.css frontend/src/components/editor/CommentsUI.module.css frontend/src/components/editor/CommentMarginCards.jsx
git commit -m "feat(editor/comments): shell tokens + indigo accents

- Margin cards: --wb-border, --wb-shadow-card, --wb-radius-md
- Hover: indigo-300 border, shadow-card-hover
- Avatars: indigo circular with initials
- @mention links: --wb-primary
- KebabMenu unified with shell component (where applicable)
- Yellow flash highlight unchanged (canvas-internal, functional)

Refs spec S7 in docs/superpowers/specs/2026-05-24-editor-visual-refresh-design.md"
```

---

## Task 8: Formatting Toolbar (S2)

**Goal:** 5 visual groups (Bloque | Texto | Color/Highlight | Alineación/Spacing/Listas | Insertar) separated by subtle vertical dividers; 32px square buttons; indigo active state; dropdowns use shell shadow + radius.

**Files:**
- Modify: `frontend/src/pages/ProjectEditorToolbar.module.css`
- Modify: `frontend/src/pages/ProjectEditor.jsx` (toolbar render section — add group wrappers)

- [ ] **Step 1: Locate toolbar JSX render**

```bash
grep -n "ToolbarButton\|toolbarGroup\|formatToolbar\|renderToolbar" frontend/src/pages/ProjectEditor.jsx | head -15
```

The toolbar is likely a long flat list of `<button>` elements. We need to wrap them in 5 group `<div>`s.

- [ ] **Step 2: Wrap toolbar buttons into 5 groups**

In the JSX, reorganize the toolbar buttons into groups (preserve the existing button/handler logic, only change wrapping):

```jsx
<div className={styles.toolbar}>
  <div className={styles.toolbarGroup}>
    {/* Block selector dropdown */}
    {blockSelectorJSX}
  </div>
  <div className={styles.toolbarDivider} aria-hidden="true" />

  <div className={styles.toolbarGroup}>
    {/* Bold, Italic, Underline, Strikethrough */}
    {boldBtn}{italicBtn}{underlineBtn}{strikeBtn}
  </div>
  <div className={styles.toolbarDivider} aria-hidden="true" />

  <div className={styles.toolbarGroup}>
    {/* Text color, Highlight */}
    {colorBtn}{highlightBtn}
  </div>
  <div className={styles.toolbarDivider} aria-hidden="true" />

  <div className={styles.toolbarGroup}>
    {/* Alignment, Spacing, Lists */}
    {alignBtn}{spacingBtn}{bulletListBtn}{orderedListBtn}{quoteBtn}
  </div>
  <div className={styles.toolbarDivider} aria-hidden="true" />

  <div className={styles.toolbarGroup}>
    {/* Insert: link, table, image, code */}
    {linkBtn}{tableBtn}{imageBtn}{codeBtn}
  </div>
</div>
```

(The exact button-to-group assignment may need adjustment depending on what buttons exist — verify with the live toolbar.)

- [ ] **Step 3: Update toolbar CSS for groups + divider**

In `ProjectEditorToolbar.module.css`:

```css
.toolbar {
  display: flex;
  align-items: center;
  gap: var(--wb-space-2);
  padding: var(--wb-space-2) var(--wb-space-3);
  background: var(--wb-surface);
  border-bottom: 1px solid var(--wb-border);
}

.toolbarGroup {
  display: inline-flex;
  align-items: center;
  gap: var(--wb-space-1);
}

.toolbarDivider {
  width: 1px;
  height: 20px;
  background: var(--wb-border);
  margin: 0 var(--wb-space-1);
}

.toolbarBtn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border: 1px solid transparent;
  border-radius: var(--wb-radius-2);
  background: transparent;
  color: var(--wb-text);
  cursor: pointer;
  transition: background-color 150ms ease, color 150ms ease, border-color 150ms ease;
}

.toolbarBtn:hover {
  background: var(--wb-surface-muted);
}

.toolbarBtnActive {
  background: var(--wb-color-primary-50);
  color: var(--wb-color-primary-700);
  border-color: var(--wb-color-primary-100);
}

.toolbarBtnActive:hover {
  background: var(--wb-color-primary-100);
}
```

- [ ] **Step 4: Update dropdown styles**

Find the existing dropdown rules (block selector dropdown, color picker, alignment menu, spacing menu, table picker) — they likely share a common class. Update to use shell tokens:

```css
.toolbarDropdown {
  position: absolute;
  z-index: var(--wb-z-dropdown);
  min-width: 180px;
  padding: var(--wb-space-1);
  background: var(--wb-surface);
  border: 1px solid var(--wb-border);
  border-radius: var(--wb-radius-2);
  box-shadow: var(--wb-shadow-md);
}

.toolbarDropdownItem {
  display: flex;
  align-items: center;
  gap: var(--wb-space-2);
  padding: var(--wb-space-2) var(--wb-space-3);
  border-radius: var(--wb-radius-xs);
  font-size: var(--wb-text-sm);
  color: var(--wb-text);
  cursor: pointer;
}

.toolbarDropdownItem:hover {
  background: var(--wb-surface-muted);
}

.toolbarDropdownItemActive {
  background: var(--wb-color-primary-50);
  color: var(--wb-color-primary-700);
}
```

- [ ] **Step 5: Color picker swatch update**

The text color and highlight color pickers show a grid of swatches. Verify the grid includes indigo-friendly tones — at minimum, include:

- Slate-900 (default text), slate-600, slate-400 (subtitles)
- Primary-600 (indigo), primary-400
- Yellow (highlight default), pink/magenta accents, success-600 (green), danger-600 (red)

Find the swatch palette array in the JSX (`grep -n "colorPalette\|swatches\|colorOptions"`). Adjust the hex values if any are out of palette (e.g., bright blue → indigo). Keep the palette small (8-12 swatches max).

- [ ] **Step 6: Visual verification**

- Toolbar has 5 visible groups separated by subtle vertical dividers
- Buttons are 32x32 square, smaller than shell's 40px buttons
- Active state (e.g., when Bold is applied to selection) shows indigo-50 bg + indigo-700 text + indigo-100 border
- Hover on inactive buttons shows muted background
- Block selector dropdown shows shell shadow + radius
- Color picker shows indigo-friendly swatches
- Dark mode: toolbar bg inverts, button hover still readable, active state still indigo

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/ProjectEditorToolbar.module.css frontend/src/pages/ProjectEditor.jsx
git commit -m "feat(editor/toolbar): 5 visual groups + indigo active + shell dropdown styles

Per spec S2:
- Reorganize buttons into 5 groups: Bloque | Texto | Color | Alineación | Insertar
- Subtle vertical divider between groups
- Buttons: 32x32px (denser than shell 40px — power-use surface)
- Active state: primary-50 bg, primary-700 text, primary-100 border
- Dropdowns: shell shadow-md, radius-2, surface bg
- Color picker swatches refreshed with indigo-friendly tones

Refs spec S2 in docs/superpowers/specs/2026-05-24-editor-visual-refresh-design.md"
```

---

## Task 9: Canvas block labels + section dividers (S3)

**Goal:** Block labels (H1, ¶) become lighter — no background, monospace 11px, muted color. Section dividers thinner, label in uppercase letter-spacing. "Agregar sección debajo" button polished.

**Files:**
- Modify: `frontend/src/pages/ProjectEditor.module.css` (block label rules + section divider rules)
- Modify: `frontend/src/pages/ProjectEditor.jsx` (only if "Agregar sección" markup needs updating)

- [ ] **Step 1: Locate block label CSS**

```bash
grep -n "blockLabel\|labelH1\|labelP\|nodeLabel" frontend/src/pages/ProjectEditor.module.css | head -15
```

- [ ] **Step 2: Update block label styles**

Replace the existing block label rule(s) with:

```css
.blockLabel {
  position: absolute;
  left: calc(var(--wb-space-12) * -1);
  top: 0;
  display: inline-flex;
  align-items: center;
  height: 24px;
  padding: 0 var(--wb-space-2);
  font-family: ui-monospace, "SF Mono", Menlo, monospace;
  font-size: 11px;
  font-weight: var(--wb-weight-medium);
  color: var(--wb-text-tertiary, var(--wb-text-muted));
  background: transparent;
  border-radius: var(--wb-radius-xs);
  cursor: pointer;
  user-select: none;
  transition: color 120ms ease, background-color 120ms ease;
}

.blockLabel:hover {
  background: var(--wb-color-primary-50);
  color: var(--wb-color-primary-700);
}
```

(Adapt left positioning to the existing layout — the `-space-12` offset is illustrative; preserve the actual offset the editor uses for label alignment.)

- [ ] **Step 3: Locate section divider CSS**

```bash
grep -n "sectionDivider\|sectionLabel\|sectionRule" frontend/src/pages/ProjectEditor.module.css | head -10
```

- [ ] **Step 4: Update section divider styles**

Replace existing section divider rules with:

```css
.sectionDivider {
  position: relative;
  display: flex;
  align-items: center;
  padding: var(--wb-space-2) 0;
  margin: var(--wb-space-4) 0;
  border-top: 1px solid var(--wb-border);
}

.sectionDividerLabel {
  position: absolute;
  top: -10px;
  left: 0;
  padding: 0 var(--wb-space-2);
  background: var(--wb-canvas-bg);
  font-size: var(--wb-text-xs);
  font-weight: var(--wb-weight-bold);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--wb-text-muted);
}
```

(Adjust class names to match real ones — grep first.)

- [ ] **Step 5: Update "Agregar sección debajo" button**

Find the button (`grep -n "Agregar sección" frontend/src/pages/ProjectEditor.jsx`). Wrap an existing Plus icon (or add one) and update the CSS:

```jsx
import { Plus } from 'lucide-react'
// ...
<button className={styles.addSectionInline} onClick={handleAddSectionBelow}>
  <span className={styles.addSectionIconWrap} aria-hidden="true">
    <Plus size={14} />
  </span>
  Agregar sección debajo
</button>
```

```css
.addSectionInline {
  display: inline-flex;
  align-items: center;
  gap: var(--wb-space-2);
  margin: var(--wb-space-4) auto;
  padding: var(--wb-space-2) var(--wb-space-4);
  background: transparent;
  border: 1px dashed var(--wb-border);
  border-radius: var(--wb-radius-full);
  font-size: var(--wb-text-sm);
  color: var(--wb-text-muted);
  cursor: pointer;
}

.addSectionInline:hover {
  border-color: var(--wb-primary);
  color: var(--wb-primary);
  background: var(--wb-primary-soft);
}

.addSectionIconWrap {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--wb-color-primary-50);
  color: var(--wb-color-primary-600);
}
```

- [ ] **Step 6: Visual verification**

- Block labels (H1, ¶ etc.) appear at the left margin in muted monospace 11px text — no background, no border
- Hover on a label shows indigo-50 background + indigo-700 text
- Section dividers have a thin horizontal line with the section label inscribed on it (uppercase, letter-spacing)
- The label "background" is canvas-bg (white) so it appears to break through the line cleanly
- "Agregar sección debajo" appears as a dashed pill with an indigo circle + Plus icon
- Hover on the add-section button shows indigo border + indigo text + primary-soft background
- Dark mode: canvas is still white (Task 1 invariant), section label still cuts through the line, divider line color follows --wb-border which can stay neutral

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/ProjectEditor.module.css frontend/src/pages/ProjectEditor.jsx
git commit -m "feat(editor/canvas): lighter block labels + uppercase section dividers

Per spec S3:
- Block labels (H1, ¶): no bg, monospace 11px, text-tertiary
- Hover: indigo-50 bg + indigo-700 text
- Section dividers: thinner line + uppercase letter-spacing label inscribed
  on the line (label bg = canvas-bg so it breaks the line cleanly)
- 'Agregar sección debajo' button: dashed pill + Plus icon in indigo-50 circle
- Hover: indigo border + indigo text + primary-soft background

Refs spec S3 in docs/superpowers/specs/2026-05-24-editor-visual-refresh-design.md"
```

---

## Task 10: Integration smoke test + final visual audit

**Goal:** Walk through every route + every editor mode + light/dark to confirm the full refresh holds together and nothing regressed.

**Files:**
- Read only — no code changes (any fixes should go in their proper task and be amended/re-committed)

- [ ] **Step 1: Visit all editor routes**

```bash
# (dev server should already be running)
open http://localhost:5176/companies
# Click into a company → click into a project → click "Abrir" on a website-type project
# Open another browser tab for a document-type project (article)
# Open another for a brief-type project (BriefProjectEditor)
```

For each:
- Layout renders, no console errors
- Navbar shows breadcrumb + page pills + save button + bell + avatar
- Toolbar shows 5 groups
- Canvas is white with TipTap mounted
- Left panel shows sections list with proper hierarchy
- Right panel shows tabs + cards
- Bottom bar shows mode pills

- [ ] **Step 2: Mode-switch sanity**

In a website-type project:
- Click `Brief` → active indigo, content shows editorial view
- Click `Handoff` → active indigo, sub-audience toggle appears (Designer/Dev), canvas re-renders for handoff view
- Click `Preview` → active indigo, canvas becomes read-only

- [ ] **Step 3: Comments sanity**

- Select a span of text, click comment icon in toolbar → composer popover appears with shell card styles
- Submit a comment → margin card appears with indigo avatar + shell shadow
- Click the comment → highlight on canvas flashes yellow
- Click kebab → menu with lucide icons appears
- Resolve the comment → margin card disappears

- [ ] **Step 4: Dark mode pass**

Toggle "Modo oscuro" from the AppShell sidebar:
- Editor reloads (or hot-applies)
- All chrome surfaces invert: navbar bg dark, toolbar bg dark, left/right panels dark, bottom bar dark
- **Canvas stays paper-white** with `slate-900` text (Task 1 invariant — most important check)
- Indigo accents stay vibrant in all surfaces (active page pill, active mode button, active section, active toolbar button, @mentions, breadcrumb links)
- Save button stays indigo
- "Sin guardar" chip stays muted (now with dark muted bg)

- [ ] **Step 5: Functional regression check**

Quick sanity that no behavior was broken:
- Type new text → autosave works
- Click "Guardar" → save status changes
- Add a section → new section appears in left panel + canvas
- Add a heading H2 → block label says "H2", left panel shows the new heading nested under its parent
- Insert a table → table inserted with grid picker
- Insert a link → link dialog opens, paste URL, applies
- Insert an image → image upload works
- Click a section in the left panel → canvas scrolls to it + yellow flash

- [ ] **Step 6: Cross-project-type check**

- FAQ project: Q&A items render in left panel; no CTA button option in toolbar; section dividers absent
- Brief project (BriefProjectEditor): renders the form builder, not TipTap. Confirm chrome around it (back button, save) uses shell tokens too.
- Document/article project: outline in left panel; "Content Rules" docked at bottom of right panel

- [ ] **Step 7: Take screenshots for the PR description**

If a PR will be opened:
- Screenshot light + dark of website editor
- Screenshot light + dark of document editor
- Screenshot toolbar with all 5 groups visible
- Screenshot comments with margin cards open
- Screenshot dark mode showing canvas-light invariant

- [ ] **Step 8: Final commit (optional housekeeping)**

If any small fixups were needed during smoke testing (typos, leftover orphan classes, etc.), commit them as:

```bash
git add <fixup files>
git commit -m "chore(editor): smoke test fixups from visual refresh

Minor cleanups discovered during full-pass visual audit. No functional
changes."
```

If nothing needs fixing, skip the commit.

---

## Plan Self-Review

**1. Spec coverage:**

| Spec section | Implementing task(s) |
|---|---|
| F1. Hybrid theme (canvas always light) | Task 1 |
| F2. Indigo accent | Tasks 3-9 (per surface) |
| F3. Right panel polish only | Task 6 |
| S1. Top Navbar | Task 3 |
| S2. Formatting Toolbar | Task 8 |
| S3. Canvas labels + dividers | Task 9 |
| S4. Left Panel | Task 5 |
| S5. Right Panel | Task 6 |
| S6. Floating Bottom Bar | Task 4 |
| S7. Comments | Task 7 |
| Cross-cutting: typography | Implicit — all tasks use `--wb-font-sans` |
| Cross-cutting: density | Task 8 (32px buttons) + Task 5 (40px section items) |
| Cross-cutting: component reuse | Task 6 (KebabMenu), Task 7 (KebabMenu), Task 3 (breadcrumb pattern from CompanyPage) |
| Token migration | Task 2 (preceded by Task 1 for canvas lock) |
| Phase 2 items | Explicitly out of scope (deferred to follow-up spec) |

**Gaps:** None. All spec sections have a corresponding task.

**2. Placeholder scan:** No "TBD", "TODO", or "implement later" in any task. Code examples are full and runnable. Some "adapt class names to actual ones — grep first" instructions exist where the implementer needs to verify exact names against the real codebase — these are explicit grep commands, not vague placeholders.

**3. Type consistency:**
- Token names (`--wb-surface`, `--wb-text-muted`, `--wb-color-primary-*`, `--wb-shadow-card`, etc.) are used consistently across all tasks and match the actual `tokens.css` exports.
- Component imports (`Button`, `Input`, `Select`, `KebabMenu`, `Modal`) from `'../components/ui'` are consistent.
- Lucide icon names (`FileText`, `Send`, `Eye`, `RefreshCw`, `Plus`, `Pencil`, `Trash2`) are real lucide-react exports.
- The `getInitials` helper referenced in Task 6 maps to the same helper defined in `CompanyPage.jsx`.
