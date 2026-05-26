# Editor Visual Refresh — Design Spec

**Date:** 2026-05-24
**Scope:** `ProjectEditor.jsx`, `BriefProjectEditor.jsx` chrome (toolbar, navbar, side panels, floating bottom bar, comments)
**Out of scope:** Editor functionality, TipTap behavior, project type logic, share/export flows, backend

## Goal

Bring the editor's visual language into alignment with the new admin shell (Modern SaaS / indigo `#4f46e5`) without changing what the editor *does*. The editor today predates the shell refresh — chrome uses its own dark-leaning palette, components don't share styling with the shell primitives, and the right panel has accumulated unrelated cards without clear hierarchy. This refresh closes that gap while keeping editorial focus (canvas as paper, dense chrome for power use).

## Locked Foundational Decisions

### F1. Theme: hybrid

- **Canvas always light.** The TipTap editing surface, block content, section dividers — always paper-white regardless of theme. Mimics Google Docs / Word / Pages.
- **Chrome follows shell toggle.** Navbar, side panels, toolbar, floating bottom bar invert when the user activates dark mode in the AppShell. One source of truth for theme preference.
- **In dark mode:** chrome dark + canvas light (paper-on-dark, exactly the Google Docs dark mode pattern).

**Implementation:** deprecate `--wb-editor-bg`, `--wb-editor-surface`, `--wb-editor-text` etc. Editor chrome consumes the same `--wb-surface`, `--wb-text`, `--wb-border` tokens as the shell. Canvas (`<EditorContent>`) hardcodes light values (or scopes them under a `.canvas` class with explicit light tokens).

### F2. Accent: indigo `#4f46e5` (same as shell)

Every primary surface in the editor that was previously dark/black/blue uses the shell's primary scale:

- Save button (already indigo)
- Floating bottom bar active mode (currently dark/black → indigo)
- Page pill active state in navbar (currently dark → indigo)
- Selected section in left panel (today unclear → `primary-soft` bg + `primary` text, matching shell sidebar)
- Active tab in right panel (today unclear → underline `primary` like CompanyPage tabs)
- @mention links in canvas → `primary` color
- Notification bell badge → `primary` (only red for real errors)
- Selection highlight & focus rings → `primary` scale

### F3. Right panel: keep vertical stack, polish visually only

The grab-bag flagged as messy is acceptable as structure. The fix is polish, not reorganization:

- Cards use `--wb-border`, `box-shadow: var(--wb-shadow-card)`, `border-radius: var(--wb-radius-md)` — same as CompaniesPage cards
- Section headers with consistent typography (semibold, text-base)
- Activity tab uses CompanyPage-style underline tabs (`Actividad | Historial`)
- Event items become rows with divisors (instead of individual cards)
- Avatars are circular indigo with initials (same component used in CompanyPage members list)
- "Reglas de contenido" stays docked at the bottom for document projects

## Per-Surface Refresh Plan

### S1. Top Navbar

**Current:** logo · back arrow · project title text · active page pill (dark) · page kebab · "+" page · layout selector · "Sin guardar" (button-like) · "Guardar" (indigo) · bell with red badge · profile avatar — all in one dense row.

**Refresh:**
- Logo + back arrow (icon-only with tooltip)
- Breadcrumb row above page pills: `Empresas / Clínica León / Brief MCP` in `--wb-text-muted` text-sm — same pattern as CompanyPage breadcrumb
- Page pills row with **active state indigo** (no dark/black)
- "Sin guardar" → muted chip/badge with small dot icon (not button)
- "Guardar" → unchanged (indigo primary, 40px height, same as shell)
- Bell badge → indigo by default; red only for actual errors
- 1px `border-bottom` separating navbar from toolbar

### S2. Formatting Toolbar (canvas top)

**Current:** ~12 inline controls (block selector, B/I/U/S, color/highlight, alignment, spacing, lists, tables, links, images, code, quote) with custom dropdowns. Pegged flush to the canvas top.

**Refresh:**
- 5 visual groups separated by subtle vertical divider: **Bloque** | **Texto** (B I U S) | **Color/Highlight** | **Alineación/Spacing/Listas** | **Insertar** (link, table, image, code, quote)
- 32px square buttons (denser than shell's 40px because power-use surface)
- Dropdowns adopt `shadow-md` + `radius-2` from shell
- Color pickers: grid of swatches that include indigo-friendly tones
- Active button state: `color-primary-50` background + `color-primary-700` text
- Tooltips with keyboard shortcut hints preserved as-is

### S3. Canvas, block labels, section dividers

**Current:** white canvas. Block labels (H1, ¶, etc.) float at left edge in a small gray square. Section dividers are a horizontal line with a label (e.g., "Hero").

**Refresh:**
- Canvas itself unchanged structurally — paper
- **Block labels** become lighter: no background, monospace text 11px, color `--wb-text-tertiary`, hover indigo subtle
- **Section dividers:** thinner line + label in uppercase letter-spacing (matching `.navSectionLabel` from AppShell sidebar)
- "Agregar sección debajo" button with `Plus` icon in indigo-subtle circle

### S4. Left Panel (sections list)

**Current:** sections with H1/H2/H3 hierarchy, drag handles, tag-icon badge. Active state unclear.

**Refresh:**
- Items same 40px height as shell sidebar nav items
- Active item: `primary-soft` background + `primary` text + bold
- Hover: `surface-muted` background
- Drag handle appears on hover only (cleaner resting state)
- Header "Page sections" + "+" button in indigo
- Search bar at top adopts shell's `Input` component styling

### S5. Right Panel (POLISH ONLY — locked F3)

Detailed in F3 above. No structural changes — just visual polish using shell tokens.

### S6. Floating Bottom Bar

**Current:** floating bar with `Brief | Handoff | Preview` modes + audience sub-toggle + save status. Active mode button is dark/black.

**Refresh:**
- Same structure, **active state indigo** (not dark/black)
- Pill shape with `radius-full`, `shadow-lg`, consistent internal padding
- Mode icons (lucide): `FileText` for Brief, `Send` for Handoff, `Eye` for Preview
- Handoff sub-audience (Designer/Dev) appears below as smaller pill toggle when Handoff active
- "Ver como Admin" corner pill adopts shell border + shadow

### S7. Comments (margin cards)

**Current:** Google Docs-style margin cards anchored to text spans. Functionally solid.

**Refresh visual:**
- Card body: `--wb-surface` bg + `--wb-border` + `shadow-card`
- Header: indigo avatar + name + muted timestamp
- KebabMenu component reused from shell
- @mentions → `--wb-primary` color (like shell links)
- Yellow flash highlight unchanged (functional signal)

## Cross-Cutting Decisions

### Typography

`system-ui` everywhere — same `--wb-font-sans` token as the shell. No new webfonts.

### Density

Chrome of the editor uses **denser** spacing than the shell (e.g., toolbar buttons 32px instead of 40px, panel item padding `space-2/3` instead of `space-3/4`). Canvas uses its content's natural rhythm.

### Component Reuse

The shell's `Button`, `Input`, `Select`, `Badge`, `KebabMenu`, `Modal` primitives are used wherever applicable inside the editor. Local copies / duplicate styles are removed. Tokens scoped under `--wb-editor-*` are deprecated and references are migrated to the global shell tokens.

## Phase 2 / Future Iterations (out of scope for this spec)

Two specific UX explorations the user wants to tackle **after** the visual refresh above ships:

### Phase 2a. Toolbar as floating glass bar

The formatting toolbar is currently pinned flush to the top of the canvas. The user wants it visually detached: a floating bar slightly below the navbar with a **glass / liquid-glass background** (`backdrop-filter: blur(...)` over a translucent surface). Still always-visible while scrolling (sticky), but feeling like it hovers over the canvas rather than being glued to it. Inspired by Apple's Vision OS / iOS 17 glass surfaces.

### Phase 2b. Block label horizontal bubble picker

Currently clicking a block label (H1, ¶, etc.) on the left margin opens a vertical dropdown listing the available block types. The user wants a **horizontal bubble cluster** instead: clicking the label expands a row of pill-shaped bubbles (one per block type) that float out from the label, animated outward. Clicking a bubble applies the change just like today. More playful, more visual, more "modern". Inspired by gesture-based interfaces (Linear's command bar interactions, Notion's inline menus).

Both are visual polish on top of the F1–F3 + S1–S7 plan. Defer to a follow-up spec once Phase 1 is shipped and stable.

## Non-Goals

- No changes to TipTap extensions, comments backend, share token generation, save flow, autosave logic, undo/redo, or any other editor *behavior*
- No project type restructure (`website`, `document`, `faq`, `brief` stay as-is)
- No new editor features (no AI assist, no slash commands, no templates)
- No changes to `BriefPage.jsx` (the public respondent view) beyond consuming the same shell tokens where applicable
- Mobile layout is not redesigned in this pass (responsive behavior preserved at its current quality)

## Migration Notes

- The `ProjectEditor.jsx` 9600-line monolith is **not refactored** in this spec. Visual changes ride on top of the current structure. A separate refactor effort is warranted but should not be coupled to this aesthetic refresh.
- Token migration (`--wb-editor-*` → shell tokens) needs careful audit so the editor canvas remains light. Suggest a single PR for the token deprecation that confirms canvas-light-always invariant before merging.
- Each surface (S1–S7) can be shipped independently — there's no hard dependency between them. Recommend the order: tokens first → navbar → toolbar → bottom bar → panels → comments → canvas labels. Lowest risk surfaces first.
