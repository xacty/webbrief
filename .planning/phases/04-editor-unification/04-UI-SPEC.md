---
phase: 4
slug: editor-unification
status: approved
shadcn_initialized: false
preset: none
created: 2026-05-08
---

# Phase 4 — UI Design Contract

> Visual + interaction contract for migrating the TipTap editor (`ProjectEditor` and friends) onto the unified design-token system delivered by Phase 1 and the shared primitives delivered by Phase 2 — **without** changing any editor functionality, keyboard shortcuts, or document semantics. The editor keeps its dark look; only the way it expresses colors, spacing, z-index, and modal chrome changes.
>
> Scope is exclusively CSS + a narrow JSX swap (`shareLinkModal` / `exportModal` → `<Modal>` shared). Document model, sectionDivider invariants, comments anchoring, autosave, history, mentions, right-click, fake-selection, etc. are all preserved 1:1.

---

## Design System

| Property | Value |
|----------|-------|
| Tool | none (CSS Modules + variables CSS) — same as Phase 2 |
| Preset | not applicable (no shadcn / Radix / MUI) |
| Component library | none — the editor is hand-rolled on TipTap; only the shared `<Modal>` primitive (Phase 2) is consumed |
| Icon library | `lucide-react` (already in use across editor: `Save`, `Eye`, `EyeOff`, `Bold`, `Italic`, `Loader2`, `MoreVertical`, etc.) |
| Font | `--wb-font-sans` (system stack, already inherited) — **no editor-specific webfont** |
| Token source | `frontend/src/styles/tokens.css` (Phase 1 — all `--wb-*` consumed exclusively, plus a small set of Phase-4-introduced sub-tokens listed below) |
| Files in scope | `pages/ProjectEditor.{jsx,module.css}`, `pages/ProjectEditorNav.module.css`, `pages/ProjectEditorToolbar.module.css`, `pages/ProjectEditorPanels.module.css`, `pages/ProjectEditorSeoRules.module.css`, `pages/BriefProjectEditor.{jsx,module.css}`, `components/editor/CommentMarginCards.{jsx,module.css}`, `CommentComposerPopover.{jsx,module.css}`, `CommentInlinePopover.{jsx,module.css}`, `MentionsAutocomplete.{jsx,module.css}`, `EditorContextMenu.{jsx,module.css}` |
| Files **out** of scope | `frontend/src/extensions/*.js` (TipTap extensions are JS logic, no CSS), backend, public share `/share/:token` page (handled in Phase 5) |
| Stack constraint | React 18 + JSX (no TS); CSS Modules; tokens-only — zero new hardcoded `#xxxxxx` after this phase |

### What “preserve the dark look” means concretely

The editor today uses three hardcoded surface colors that define its look (`#212222` for navbar/toolbar/floating bar, `#2a2a2a` for editor-canvas surfaces and dark text on light, `#d9d9d9` for borders/dividers between dark and light zones). These colors are visually correct and are NOT to change. They are simply re-expressed as **dedicated editor sub-tokens** that derive from the global palette so the system stays coherent without forcing the rest of the app dark.

---

## Editor Sub-Tokens (new, added to `tokens.css`)

These tokens are introduced in this phase. They live in the same `:root` block as the global tokens but are namespaced `--wb-editor-*` / `--wb-tooltip-*` / `--wb-comment-*` so the rest of the app is unaffected.

| Token | Resolves to | Rationale | Replaces |
|-------|-------------|-----------|----------|
| `--wb-editor-bg` | `#212222` | Dark surface for navbar, toolbar, floating bottom bar, button backgrounds inside dark chrome. Visually identical to current. Cannot be `--wb-color-neutral-900` (`#0f172a`) because that is too cool/blue — would shift the look. | `#212222` literals |
| `--wb-editor-surface` | `#2a2a2a` | One step lighter than `--wb-editor-bg`; used for raised surfaces inside the dark chrome (toolbar segments, dropdown items, dark text on light backgrounds for type labels, dark borders inside light panels). | `#2a2a2a` literals |
| `--wb-editor-surface-elevated` | `#1a1a1a` | Slightly darker than `--wb-editor-bg`; used by `imageContextMenu` and other elevated dark popovers that sit on top of dark chrome. | `#1a1a1a` literals (only used in image context menu) |
| `--wb-editor-border` | `#d9d9d9` | Light-mode border color used inside the editor canvas (between sections, around editor cards, inside light dropdowns rendered on dark chrome). | `#d9d9d9` literals |
| `--wb-editor-border-strong` | `#b8b8b8` | Stronger variant currently used as a hover/active border on light editor controls. Already present in CSS. | `#b8b8b8` literals |
| `--wb-editor-text-on-dark` | `#ffffff` | White text on dark chrome (toolbar buttons, navbar). Stays white — token aliases for clarity. | `#fff` / `#ffffff` literals on dark chrome |
| `--wb-editor-text-on-dark-muted` | `#aaaaaa` | Muted/disabled text on dark chrome. | `#aaa` / `#888` / `#999` literals on dark chrome |
| `--wb-editor-text` | `#2a2a2a` | Dark text on light editor surfaces (sections panel labels, type labels). Same hex as `--wb-editor-surface` but role-named. | `#2a2a2a` color literals |
| `--wb-tooltip-bg` | `#3c4043` | Google-Docs-style floating tooltip background. **Must stay this exact hex** — the design copies Google Docs intentionally. | `#3c4043` literal |
| `--wb-tooltip-text` | `#ffffff` | Tooltip text. | `#fff` literal inside `.floatingTooltip` |
| `--wb-comment-highlight` | `rgba(254, 240, 138, 0.5)` | Yellow highlight on `<span data-comment-id>`. Resolved value chosen to match existing `#fef08a` at ~50% alpha. | `#fef08a` / inline `rgba(...)` for comment highlight |
| `--wb-comment-highlight-active` | `rgba(254, 240, 138, 0.9)` | Stronger yellow when the comment is active. | hardcoded active variant |
| `--wb-comment-highlight-resolved` | transparent | Resolved comment: highlight removed but DOM mark retained. | hardcoded transparent |
| `--wb-section-flash` | `rgba(254, 240, 138, 0.6)` | Yellow flash on click-to-scroll. Re-uses the existing `base.css` `@keyframes wb-section-flash` — token aliases the value. | hardcoded animation color |

These sub-tokens are added to `tokens.css` **after** the global tokens block, in their own `/* Editor sub-tokens */` section. They MUST NOT be referenced by non-editor code; the linter rule (manual review only — no eslint plugin in this phase) is: if a file outside `frontend/src/pages/ProjectEditor*`, `frontend/src/pages/BriefProjectEditor*`, or `frontend/src/components/editor/*` consumes `--wb-editor-*`, that is a deviation and must be justified in the plan task SUMMARY.

### Z-index — promotes existing arbitrary values to tokens

Current editor uses 12+ raw z-index values: `1, 2, 10, 20, 50, 70, 80, 100, 120, 200, 300, 500, 1000, 1100, 1200, 1400, 1500, 1600, 9999`. They MUST collapse to the Phase 1 scale + a small set of editor-internal tiers:

| Surface | Old value(s) | New token | Notes |
|---------|--------------|-----------|-------|
| Editor base content (canvas, sections) | `1`, `2` | `var(--wb-z-base)` (1) | |
| Editor sticky chrome (sticky toolbar, floatingBar bottom) | `10`, `20`, `50`, `70`, `80`, `100`, `120`, `200`, `300` | `var(--wb-z-sticky)` (200) — **single value** | All editor sticky layers collapse to one token. The visual stacking inside the editor is achieved via DOM order / `position` / `transform`, not arbitrary z-index ladders. |
| Comment highlight active state, mention popover, table inline + buttons | `500`, `1100` | `var(--wb-z-popover)` (1100) | |
| Right-click context menu (`EditorContextMenu`), image context menu, table context menu | `1200`, `1500`, `1600` | `var(--wb-z-popover)` (1100) for menus, **but** `EditorContextMenu` MUST stay above comment cards: use `calc(var(--wb-z-popover) + 1)` — namedLite rationale: a single context menu at a time, never stacked. |
| Floating tooltip (Google-Docs style) | `1200` | `var(--wb-z-tooltip)` (1200) | |
| Modals (`shareLinkModal`, `exportModal`, page-delete confirm, asset upload preview) | `1000`, `1400`, `9999` | `var(--wb-z-modal)` (1000) — once they consume `<Modal>` shared, the token comes for free | The `9999` outliers are eliminated. |
| Page-switch-pending overlay | `1400` | `var(--wb-z-overlay)` (900) | This is a non-blocking semi-transparent veil during page switch; below modals, above sticky. |

After this migration, **no editor file may declare a numeric z-index in CSS**. Any new z-index need must add a token, not a literal.

---

## Spacing Scale

The editor’s existing spacing is mostly already on a 4-pt grid (4 / 6 / 8 / 12 / 16 / 20 / 24 / 32 / 40), with a handful of off-grid offsets that exist for optical reasons inside the editor (e.g., `min-width: 500px` on the editor canvas, `300px` left-shift when comments are visible). All paddings, gaps, and margins MUST migrate to `--wb-space-*`. **The semantic measurements** (`min-width: 500px` for canvas, `300px` comment-shift, `48px` toolbar height, `40px` floating-bar height, `56px` navbar height, `220px` sections panel min-width, `360px` updates panel width) stay as **layout constants** — they are documented here but may remain as raw px in CSS because they encode editor-specific geometry, not design rhythm.

| Token | Value | Locations in editor |
|-------|-------|---------------------|
| `--wb-space-1` | 4px | Toolbar button gap, type-label vertical offset, comment-card internal grid gap |
| `--wb-space-2` | 8px | Default toolbar internal padding, sections-panel item gap, mentions popover internal padding |
| `--wb-space-3` | 12px | Floating-bar internal gap, image-context-menu item padding, dropdown vertical padding |
| `--wb-space-4` | 16px | Default panel padding (sections, updates), modal header→body gap (delegated to `<Modal>`), tooltip horizontal padding |
| `--wb-space-5` | 20px | Section item vertical padding, page-pill horizontal padding |
| `--wb-space-6` | 24px | Editor canvas horizontal padding (compact mode), Brief / Handoff section vertical rhythm |
| `--wb-space-8` | 32px | Editor canvas horizontal padding (default mode), top of editor canvas |
| `--wb-space-12` | 48px | Toolbar height (semantic constant — kept as `48px` in CSS for clarity, but referenced as `var(--wb-space-12)` where it expresses padding rhythm) |

Layout constants (raw px allowed, documented):

```
Editor canvas min-width:        500px
Editor canvas max-width Preview: 800px
Sections panel min-width:       220px
Sections panel max-width:       320px
Updates panel width (default):  360px
Comments-visible left-shift:    300px
Editor navbar height:           56px
Floating bottom bar height:     40px
SEO rules tray height:          collapsed 40 / expanded 240
```

Exceptions to the 4-pt rule: **the layout constants above only**. They cannot move to tokens because changing them changes the editor’s functional geometry (anchoring, comment overlap math, scroll math) — that is explicit out-of-scope per CONTEXT.md.

---

## Typography

The editor has TWO typography contexts, and both must stay distinct:

1. **Editor chrome** (navbar, toolbar, sections panel, updates panel, floating bar, tooltips) — this is app UI. Migrate to Phase 1 tokens.
2. **ProseMirror content** (the document text the user is editing) — this is content, not UI. Sizes/weights for `h1-h6, p, blockquote, li` inside `:global(.ProseMirror)` are content-level tokens that must NOT change appearance, because that would alter how authored documents render. Keep current pixel sizes; tokenize only the line-heights and weights that already match the global scale.

| Role | Size token | Weight token | Line-height token | Editor location |
|------|-----------|--------------|-------------------|-----------------|
| Editor body chrome | `--wb-text-sm` (14px) | `--wb-weight-regular` (400) | `--wb-leading-normal` (1.5) | Sections panel labels, updates panel rows, page pills, floating-bar status text |
| Editor caption | `--wb-text-xs` (12px) | `--wb-weight-medium` (500) | `--wb-leading-normal` (1.5) | Type labels (`t` for tables, `img` for images, `H1`/`P`/etc.), section subtitles (FAQ "Pregunta Frecuente N"), tooltip body |
| Editor heading-chrome | `--wb-text-lg` (18px) | `--wb-weight-semibold` (600) | `--wb-leading-xl` (1.4) | Modal titles (delegated to `<Modal>`), SEO rules tray title |
| Toolbar button label | `--wb-text-xs` (12px) | `--wb-weight-semibold` (600) | `--wb-leading-tight` (1.1) | Toolbar dropdown selected option text, alignment indicator |
| ProseMirror H1 | 32px (kept as raw — content) | `--wb-weight-bold` (700) | `--wb-leading-tight` (1.1) | `:global(.ProseMirror h1)` |
| ProseMirror H2 | 24px (raw) | `--wb-weight-bold` (700) | `--wb-leading-tight` (1.1) | `:global(.ProseMirror h2)` |
| ProseMirror H3 | 20px (raw) | `--wb-weight-semibold` (600) | `--wb-leading-xl` (1.4) | `:global(.ProseMirror h3)` |
| ProseMirror H4-H6 | 18 / 16 / 14 px (raw) | `--wb-weight-semibold` (600) | `--wb-leading-xl` (1.4) | as-is |
| ProseMirror paragraph | `--wb-text-base` (16px) | `--wb-weight-regular` (400) | `--wb-leading-normal` (1.5) | `:global(.ProseMirror p)` |
| ProseMirror blockquote | `--wb-text-base` (16px) | `--wb-weight-regular` (400) | `--wb-leading-relaxed` (1.75) | `:global(.ProseMirror blockquote)` |
| ProseMirror table cell | `--wb-text-sm` (14px) | `--wb-weight-regular` (400) | `--wb-leading-normal` (1.5) | `:global(.ProseMirror td, .ProseMirror th)` |

`text-transform: uppercase` is forbidden across editor chrome — preserves the “removed uppercase styling” invariant from CONTEXT.min.md `Recent Fixes`.

---

## Color

The editor has a **dual palette** — dark chrome + light editor canvas — and a small set of accent colors. The rules below replace every hex literal currently in editor CSS.

### 60 / 30 / 10 split

| Role | Token / value | Locations |
|------|---------------|-----------|
| Dominant (60%) — dark chrome | `--wb-editor-bg` (`#212222`) | Editor navbar, toolbar, floating bottom bar, dark dropdowns |
| Secondary (30%) — light editor canvas | `--wb-surface` (`#ffffff`) and `--wb-color-neutral-50` | ProseMirror background, sections panel, updates panel, modals |
| Accent (10%) | `--wb-color-primary-900` (`#091223`) | Primary button on light surfaces (delegated to Phase 2 `<Button variant="primary">`); active toolbar button background on dark chrome → `--wb-editor-surface`; active section pill on light → `--wb-color-primary-100` border + `--wb-color-primary-900` text |
| Destructive (10% sub-slot) | `--wb-color-danger-600` (`#dc2626`) | Delete actions (image/page/section delete), error states in autosave, danger-variant items in context menus |

Accent reserved for: primary CTA in editor modals (Save share link, Send invite, Export, Confirm delete), active toolbar button on dark chrome, active sections-panel item border, and focus rings (`--wb-color-primary-200` 3px ring on inputs/selects inside the editor — same as Phase 2). **Never** on hover backgrounds across the whole toolbar, never on neutral pills, never on table cell backgrounds.

### Dark-chrome palette (token map)

```
Editor navbar bg              --wb-editor-bg               (#212222)
Editor navbar text            --wb-editor-text-on-dark     (#ffffff)
Editor navbar muted text      --wb-editor-text-on-dark-muted (#aaaaaa)
Editor navbar bottom border   --wb-editor-border           (#d9d9d9, only on light-zone seam)
Toolbar bg                    --wb-editor-bg               (#212222)
Toolbar button hover          rgb(255 255 255 / 12%)        (literal kept — alpha-on-dark, can stay; documented)
Toolbar button active         --wb-editor-surface          (#2a2a2a)
Toolbar separator             rgb(255 255 255 / 16%)        (literal kept — alpha-on-dark)
Floating bottom bar bg        --wb-editor-bg               (#212222)
Floating bottom bar text      --wb-editor-text-on-dark     (#ffffff)
Image context menu bg         --wb-editor-surface-elevated (#1a1a1a)
Image context menu border     rgb(255 255 255 / 8%)         (literal kept — alpha-on-dark)
Image context menu danger     --wb-color-danger-400        (#f87171) text on dark
Table context bar bg          --wb-editor-bg               (#212222)
Table context menu bg         --wb-editor-surface-elevated (#1a1a1a)
```

### Light-canvas palette (token map)

```
ProseMirror canvas bg         --wb-surface                 (#ffffff)
ProseMirror text              --wb-color-neutral-800       (#1e293b)  — already AA on white
Sections panel bg             --wb-color-neutral-50        (#f8fafc)
Sections panel border         --wb-border                  (current literal kept via Phase 1 alias)
Sections panel item hover     --wb-color-neutral-100       (#f1f5f9)
Sections panel item active    --wb-color-primary-100       border + text --wb-color-primary-900
Updates panel bg              --wb-surface                 (#ffffff)
Updates panel row hover       --wb-color-neutral-100       (#f1f5f9)
Type label text               --wb-editor-text             (#2a2a2a)  — preserves current dimmed look
Type label disabled (t / img) --wb-color-neutral-400       (#94a3b8)  — confirms "no-interactive, dimmed"
Floating tooltip bg           --wb-tooltip-bg              (#3c4043)
Floating tooltip text         --wb-tooltip-text            (#ffffff)
Comment highlight             --wb-comment-highlight       (rgba(254,240,138,0.5))
Comment highlight active      --wb-comment-highlight-active(rgba(254,240,138,0.9))
Comment highlight resolved    --wb-comment-highlight-resolved (transparent)
Comment card bg               --wb-surface                 (#ffffff)
Comment card border           --wb-border                  (#dbe3f0)
Comment card active border    --wb-color-primary-300       (#94a3b8)
Mention link in body          --wb-color-primary-700       (#0b1220) underline
Mention popover bg            --wb-surface                 (#ffffff)
Mention popover hover         --wb-color-neutral-100       (#f1f5f9)
Fake-selection overlay        rgb(15 23 42 / 16%)          (literal — alpha-on-light, documented)
```

### Removed hex literals (sample — full list verified at execution)

`#212222`, `#2a2a2a`, `#d9d9d9`, `#1a1a1a`, `#3c4043`, `#fef08a`, `#fef3c7`, `#1d4ed8`, `#2563eb`, `#0070d6`, `#0088ff`, `#aaa`, `#888`, `#999`, `#b8b8b8`, `#bdc1c6`, `#c7c7c7`, `#d0d0d0`, `#e0e0e0`, `#e8e8e8`, `#f0f0f0`, `#f2f2f2`, `#f5f5f5`, `#f8f8f8`, `#fafafa`, `#fcfcfd`, `#ffffff`, `#fff`, all hardcoded shades that belong to Phase 1 palette (`#0f172a`, `#1e293b`, `#334155`, `#475569`, `#64748b`, `#94a3b8`, `#cbd5e1`, `#e2e8f0`, `#f1f5f9`, `#f8fafc`, `#dc2626`, `#15803d`, `#16a34a`, `#dcfce7`, `#fef2f2`, `#fee2e2`, `#fecaca`, `#fef3c7`, `#fde68a`, `#f59e0b`, `#d97706`, `#b45309`, `#92400e`, `#78350f`).

The `rgb(... / NN%)` modern-syntax alpha values that overlay white-on-dark or black-on-light to express elevation may stay as literals, **documented in CSS comments**, because adding a token for every alpha tier would bloat the system. A new `--wb-editor-overlay-on-dark-XX` token is **not** introduced.

### Body text contrast on white inside the editor

`--wb-color-neutral-800` (`#1e293b`) on `--wb-surface` (`#ffffff`) → 12.6:1 (AAA). `--wb-editor-text` (`#2a2a2a`) on `--wb-surface` → 14.5:1 (AAA). Both safe.

---

## Copywriting Contract

This phase **does not introduce new copy**. Editor user-facing strings (modal titles, button labels, toasts, tooltips, empty states for sections panel / updates panel / comments) all exist already and stay in Spanish. The tooltip catalog (`data-wb-tooltip` map in `ProjectEditor.jsx`) is preserved verbatim; only the visual treatment migrates.

| Element | Existing copy (preserved) |
|---------|---------------------------|
| Save button label (floating bar) | `"Guardar"` / `"Guardando…"` (loading) / `"Guardado"` (idle confirmation) |
| Save status pill | `"Sin cambios"` / `"Cambios sin guardar"` / `"Guardado"` |
| Page-pill rename input placeholder | `"Nombre de la página"` |
| Page-delete confirm modal title | `"Eliminar página"` |
| Page-delete confirm body | existing copy preserved |
| Share-link modal title | `"Compartir enlace"` |
| Share-link generate CTA | `"Generar enlace"` |
| Export modal title | `"Exportar"` |
| Export modal CTA | `"Descargar"` |
| Comment composer placeholder | `"Escribe un comentario… usa @ para mencionar"` |
| Comment empty state (no comments yet) | `"No hay comentarios aún"` |
| Mention autocomplete empty state | `"Sin coincidencias"` |
| Right-click context menu items | `"Cortar"`, `"Copiar"`, `"Pegar"`, `"Comentar"`, `"Enlazar"`, `"Formato"` |
| Floating tooltip shortcut formatting | Mac `⌘`/`⇧`/`⌥` (existing logic preserved) |
| FAQ add question modal | `"Añadir pregunta frecuente"` |
| Section add modal | `"Nueva sección"` |
| Auto-resolved comment activity reason | `"Comentario huérfano (texto eliminado)"` (existing — backend-driven) |

CTA verb pattern (already followed): `verb + concrete noun` — `Guardar enlace`, `Generar enlace`, `Eliminar página`, `Añadir pregunta`. No phase-4 copy change deviates from this.

If during execution a string is found to violate the verb+noun pattern, the fix lives in **Phase 5** (public pages + final audit), not here — Phase 4 is strictly visual.

---

## Modal Migration Contract (`shareLinkModal`, `exportModal`)

These two modals migrate from local CSS modules to the shared `<Modal>` component delivered in Phase 2. The migration is JSX + CSS deletion; behavior is identical.

### `shareLinkModal`

Before:

```
.shareLinkModal { /* ~50 lines of overlay+card+header+title+note in ProjectEditor.module.css */ }
```

After:

```jsx
<Modal
  open={shareLinkOpen}
  onClose={() => setShareLinkOpen(false)}
  title="Compartir enlace"
  size="md"                      // 500px max-width — matches current
>
  <ShareLinkForm ... />          // existing inner content stays in place,
                                 // only the chrome (overlay + card + header + close) is replaced
</Modal>
```

CSS removed: `.shareLinkModalOverlay`, `.shareLinkModal`, `.shareLinkModalHeader`, `.shareLinkModalTitle`, `.shareLinkModalNote` rules (note text styling moves into the body content block). Form-internal styling stays.

Behavior: focus trap, Escape close, mousedown→mouseup overlay close — all delegated to `<Modal>`. Previously, ProjectEditor.jsx implemented its own click-outside handler; that handler is removed. **Verify:** the previous implementation may have intentionally NOT closed the modal on overlay click in some flows; the executor must check by inspection — if so, pass `closeOnBackdrop={false}`.

### `exportModal`

Before: `.exportModalOverlay`, `.exportModal`, `.exportModalHeader`, `.exportModalEyebrow`, `.exportModalTitle`, `.exportModalClose`, `.exportModalForm` (~80 lines).

After:

```jsx
<Modal
  open={exportOpen}
  onClose={() => setExportOpen(false)}
  title="Exportar"
  size="md"                      // 500px max-width — matches current
  showCloseButton={true}
>
  {/* Eyebrow ("Designer" / "Dev") becomes the first line of the body, not a custom header element */}
  <p className={styles.exportEyebrow}>{audience}</p>
  {/* Existing form (audience pickers, range, format, CTA) stays */}
</Modal>
```

CSS removed: all `.exportModal*` rules from ProjectEditor.module.css. The eyebrow chip styling (`.exportEyebrow`) is moved to a small new rule (~6 lines) consuming `--wb-color-neutral-100` bg, `--wb-color-neutral-700` text, `--wb-text-xs`, `--wb-weight-medium`, `--wb-radius-full`.

### What does NOT migrate

These editor surfaces are **not** modals in the dialog sense and stay as bespoke editor CSS (consuming the new tokens):

- `imageContextMenu` — context menu on right-click of an image. Popover, not modal.
- `tableContextBar` and `tableCtxMenu` — contextual table chrome.
- `EditorContextMenu` — generic right-click menu. Popover.
- `MentionsAutocomplete` — popover.
- `CommentMarginCards`, `CommentInlinePopover`, `CommentComposerPopover` — all popovers.
- `floatingTooltip` — tooltip, not modal.
- Page-delete confirmation: this is **already** rendered through the page-pill menu; review during execution. If it is a true dialog, it should also migrate to `<Modal>`. If it is a tiny inline confirm, leave as-is and tokenize only.

The executor lists each candidate during the plan-phase task breakdown and decides per-instance.

---

## Comments — Visual + Token Contract

All comment invariants from `CONTEXT.min.md target=editor.comments` are preserved. This phase only touches CSS:

| Element | Token map |
|---------|-----------|
| `<span data-comment-id>` idle | `background: var(--wb-comment-highlight)` |
| `<span data-comment-id>:hover` | `background: var(--wb-comment-highlight-active)` |
| `<span data-comment-id>[data-wb-active='true']` | `background: var(--wb-comment-highlight-active)`; `outline: 2px solid var(--wb-color-warning-500)` (existing amber — tokenized) |
| `<span data-comment-id>[data-comment-resolved='true']` | `background: var(--wb-comment-highlight-resolved)` (transparent) |
| `[data-wb-hide-resolved='true'] span[data-comment-id][data-comment-resolved='true']` | unchanged — display rule, no color |
| `[data-public-share] span[data-comment-id]` | unchanged — already strips marks |
| `CommentMarginCards` card bg | `var(--wb-surface)` |
| `CommentMarginCards` card border | `var(--wb-border)` (idle) / `var(--wb-color-primary-300)` (active) |
| `CommentMarginCards` card shadow | `var(--wb-shadow-sm)` (idle) / `var(--wb-shadow-md)` (active) |
| `CommentMarginCards` card radius | `var(--wb-radius-3)` (12px) |
| Reply nesting indent | `var(--wb-space-4)` (16px) |
| Mention chip in card body | `color: var(--wb-color-primary-700)`; `text-decoration: underline` |
| Mention chip non-real (no profile) | `color: var(--wb-color-neutral-700)`; no underline |
| Comment composer popover bg | `var(--wb-surface)` |
| Comment composer popover border | `var(--wb-border)` |
| Comment composer popover shadow | `var(--wb-shadow-md)` |
| Comment composer popover radius | `var(--wb-radius-3)` |
| Comment composer mention button | `var(--wb-color-primary-700)` text on transparent (ghost) |
| `MentionsAutocomplete` popover | `var(--wb-surface)` bg, `var(--wb-border)` border, `var(--wb-shadow-md)`, `var(--wb-radius-2)` |
| `MentionsAutocomplete` selected item | `var(--wb-color-primary-100)` bg, `var(--wb-color-primary-900)` text |
| `EditorContextMenu` (right-click) bg | `var(--wb-surface)` |
| `EditorContextMenu` border | `var(--wb-border)` |
| `EditorContextMenu` shadow | `var(--wb-shadow-md)` |
| `EditorContextMenu` radius | `var(--wb-radius-2)` |
| `EditorContextMenu` item hover | `var(--wb-color-neutral-100)` |
| `EditorContextMenu` danger item text | `var(--wb-color-danger-700)` |
| Fake-selection overlay (`FakeSelection`) | `background: rgb(15 23 42 / 16%)` (kept literal — alpha overlay; documented in CSS comment) |

The 300px left-shift of the canvas when comments are visible (`editorCanvas` `transform: translateX(-300px)`) and the `min-width: 500px` rule on the canvas remain untouched — they are layout, not color.

The `<900px viewport oculta cards y abre CommentInlinePopover` invariant remains. The popover styling consumes the same tokens above; only the responsive switch logic stays as-is.

The orphan auto-resolve flow (backend regex on save, frontend `comment_orphaned` activity entry, HistoryTabPanel display with snippet) is backend behavior and **outside** this phase.

---

## Floating Tooltip Contract

| Property | Value |
|----------|-------|
| Background | `var(--wb-tooltip-bg)` (`#3c4043`) |
| Text | `var(--wb-tooltip-text)` (`#ffffff`) |
| Padding | `var(--wb-space-2) var(--wb-space-3)` (8 / 12) |
| Radius | `var(--wb-radius-xs)` (4px) — kept compact |
| Font | `--wb-text-xs` / `--wb-weight-medium` / `--wb-leading-tight` |
| Shortcut chip | `font-family: ui-monospace, SFMono-Regular, monospace` (kept literal) — `color: rgb(255 255 255 / 70%)` (kept literal — alpha on dark) |
| Shadow | `var(--wb-shadow-md)` |
| z-index | `var(--wb-z-tooltip)` |
| Delay | 300ms (existing, unchanged) |
| Position | below trigger (existing, unchanged) |
| Mac shortcut format | `⌘ ⇧ ⌥` (existing, unchanged) |

Look is identical to current Google-Docs-style tooltip. Source-of-truth invariant preserved: `data-wb-tooltip` on toolbar buttons suppresses native `title`; `useEffect` depends on `loadingProject` so listener attaches after rootRef mounts.

---

## Modes — visual contract preserved

| Mode | Visual treatment |
|------|------------------|
| Brief | Default — sections panel left, canvas centered, updates panel right, comments cards in margin |
| Handoff (designer audience) | Adds copy-safe gutters with type labels (`H1`/`H2`/`P`/`CTA`/`Link metadata`) outside selectable content. Gutters consume `--wb-color-neutral-50` bg, `--wb-color-neutral-200` border-left, `--wb-text-xs` / `--wb-weight-medium` / `--wb-color-neutral-700` text. **Copy-safe invariant preserved** — labels are non-selectable. |
| Handoff (dev audience) | Same as designer + SEO metadata tray at top (rendered at `[data-seo-tray]` element, scroll-target from sections panel "SEO metadata" item). Tray bg `--wb-color-neutral-50`, border `--wb-border`. |
| Preview | Hides toolbar + panels; canvas `max-width: 800px` (layout constant, kept). Background flips to `--wb-color-neutral-50` to differentiate from authoring. |

Mode toggle UI lives in floating bottom bar, dark chrome — uses `--wb-editor-bg` bg, `--wb-editor-text-on-dark` text, active mode pill `--wb-color-primary-900` bg + white text.

---

## Tables — visual contract preserved

Existing 3-approach manipulation (contextual toolbar, right-click menu, inline + buttons) remains. Tokens:

| Element | Token |
|---------|-------|
| `tableContextBar` bg | `var(--wb-editor-bg)` |
| `tableContextBar` button text | `var(--wb-editor-text-on-dark)` |
| `tableContextBar` button hover | `rgb(255 255 255 / 12%)` (alpha on dark, documented literal) |
| `tableCtxMenu` bg | `var(--wb-editor-surface-elevated)` |
| `tableCtxMenu` item text | `var(--wb-editor-text-on-dark)` |
| `tableCtxMenu` item hover | `rgb(255 255 255 / 8%)` (alpha on dark) |
| `tableCtxMenu` divider | `rgb(255 255 255 / 16%)` |
| `tableCtxMenu` danger item | text `var(--wb-color-danger-400)` (`#f87171`) on dark |
| `tableInlineBtn` (right + bottom +) | `var(--wb-color-primary-100)` bg, `var(--wb-color-primary-900)` text, `var(--wb-radius-full)` |

Type label `t` for tables and `img` for images stays **non-interactive**, dimmed (`var(--wb-color-neutral-400)`).

---

## Page Pills (navbar) — visual contract preserved

| Element | Token |
|---------|-------|
| Page pill bg (idle) | transparent |
| Page pill bg (active) | `rgb(255 255 255 / 12%)` (alpha on dark, kept) |
| Page pill text | `var(--wb-editor-text-on-dark)` |
| Page pill hover bg | `rgb(255 255 255 / 16%)` |
| Page pill rename input bg | `var(--wb-surface)` |
| Page pill rename input text | `var(--wb-color-neutral-800)` |
| MoreVertical icon | `var(--wb-editor-text-on-dark-muted)` (idle) → `var(--wb-editor-text-on-dark)` (hover) |
| Page-delete confirm modal | delegated to `<Modal>` if it is a true dialog (executor decides per-instance) |

Single-open menu invariant (`openMenuId`) preserved.

---

## Drag & Drop, Sections Panel — visual contract preserved

| Element | Token |
|---------|-------|
| Sections panel item bg | `var(--wb-color-neutral-50)` |
| Active section item border | `var(--wb-color-primary-300)` left border 3px |
| Active section item text | `var(--wb-color-primary-900)`, `--wb-weight-semibold` |
| Drag ghost bg | `var(--wb-surface)` |
| Drag ghost border | `var(--wb-border)` |
| Drag ghost shadow | `var(--wb-shadow-md)` |
| Drag ghost grip icon | `var(--wb-color-neutral-500)` |
| Drag-over indicator | `var(--wb-color-primary-500)` 2px line |

Sidebar derived from document, no flicker, no parallel state — **invariant preserved**, no CSS change forces this; documenting for completeness.

---

## SEO Rules tray (`ProjectEditorSeoRules.module.css`)

| Element | Token |
|---------|-------|
| Tray bg (collapsed) | `var(--wb-color-neutral-50)` |
| Tray bg (expanded) | `var(--wb-surface)` |
| Tray top border | `var(--wb-border)` |
| Title | `--wb-text-sm` / `--wb-weight-semibold` / `--wb-color-neutral-800` |
| Field label | `--wb-text-xs` / `--wb-weight-medium` / `--wb-color-neutral-700` |
| Field input | shared `<Input>` from Phase 2 (already migrated chrome — height 40px, `--wb-radius-2`, `--wb-border` etc.) |
| Word/char count | `--wb-text-xs` / `--wb-color-neutral-600` |
| Reading-time pill | `--wb-color-neutral-100` bg, `--wb-color-neutral-700` text, `--wb-radius-full` |

Optional consideration (deferred unless trivial during execution): replace the local SEO field markup with `<Input>` from `components/ui`. If the existing SEO inputs already follow the same geometry, leave them alone — only re-style.

---

## Brief variant (`BriefProjectEditor.{jsx,module.css}`)

The compact variant of the editor (used for Brief views in dashboard/preview contexts) follows the **light shell** palette, not the dark editor chrome. It is closer to a Phase 3 admin page than a Phase 4 editor — but is included in this phase because it shares CSS patterns with the main editor.

Migration rule: every hex literal → Phase 1 token; modals (if any) → `<Modal>` shared. No sub-tokens needed unless the executor finds a divergence; at that point a divergence is flagged in the SUMMARY.

---

## Migration Strategy (consumed by `plan-phase`)

This is **risk-managed** because the editor is the highest-traffic surface in the app and has the densest invariant set. Plan-phase MUST decompose Phase 4 into the following sequence; each step is a separate atomic commit:

| Step | Goal | Files | Verification gate |
|------|------|-------|-------------------|
| 1 | Add editor sub-tokens to `tokens.css` | `frontend/src/styles/tokens.css` | App still compiles; no visual change anywhere (tokens unused yet) |
| 2 | Migrate `ProjectEditor.module.css` color literals → tokens. Block-by-block (Editor chrome → Canvas → ProseMirror → Tables → Image context → Comments globals → Modals chrome). | `pages/ProjectEditor.module.css` | After each block, visual diff in the editor: Brief mode + page switch + section open. No regressions. |
| 3 | Migrate `ProjectEditorNav.module.css`, `ProjectEditorToolbar.module.css`, `ProjectEditorPanels.module.css`, `ProjectEditorSeoRules.module.css` | as listed | Visual diff in editor; verify navbar / toolbar / panels / SEO tray look unchanged |
| 4 | Migrate `components/editor/*.module.css` (5 files) to tokens | `CommentMarginCards.module.css`, `CommentComposerPopover.module.css`, `CommentInlinePopover.module.css`, `MentionsAutocomplete.module.css`, `EditorContextMenu.module.css` | Comments / mentions / right-click visual QA. Active comment, idle comment, resolved comment, mention pop, right-click on text/image/table. |
| 5 | Replace `shareLinkModal` JSX + CSS with `<Modal>` shared | `pages/ProjectEditor.jsx` (≤ 30-line diff) + delete corresponding CSS rules | Modal opens, focus trap, Escape close, overlay close (with `closeOnBackdrop` decision), Enter submits |
| 6 | Replace `exportModal` JSX + CSS with `<Modal>` shared | same | Same as 5; verify designer/dev audience switching works inside the body |
| 7 | Tokenize all `z-index: NNN` declarations across editor files | all editor `.module.css` | No visual change; verify stacking by reproducing comment-vs-context-menu, modal-on-mention, tooltip-over-everything cases |
| 8 | `BriefProjectEditor.{jsx,module.css}` migration | as listed | Brief view loads in dashboard/preview |
| 9 | Final QA pass per CONTEXT.md scenario list | n/a | Full QA (see below) |

Atomic commits per step — gsd-execute-phase / gsd-quick handles this automatically.

### QA scenario set (Phase 4 success criterion 6)

Plan-phase produces a checklist; here is the seed:

1. Create a new project of type Página Web. Add 3 sections, mix headings H1-H6, paragraphs, 1 bullet list, 1 ordered list, 1 blockquote, 1 table 3×3, 1 image, 1 CTA.
2. Switch to Handoff designer → verify gutters render with type labels, copy-safe.
3. Switch to Handoff dev → verify SEO tray + JSON metadata appear; click sections-panel "SEO metadata" → verify scroll.
4. Switch to Preview → verify max-width 800, no toolbar, no panels.
5. Back to Brief → add 2 anchored comments + 1 reply + 1 @mention to a real profile.
6. Click into highlighted comment → margin card expands.
7. Resize viewport < 900px → margin cards hide, inline popover opens at click.
8. Right-click in text → menu at cursor with cut/copy/paste/comment/link/format. Right-click on image → image context menu. Right-click in table → table context menu.
9. Open Share Link modal → generate → copy. Close.
10. Open Export modal (in handoff designer / dev) → toggle audience inside, change format, close.
11. Switch pages, rename a page, delete a page (confirm modal).
12. Drag a section to reorder; verify drag ghost styling.
13. Verify floating tooltip on every toolbar button (300ms delay, Mac shortcuts).
14. Save (manual + autosave 8s). Trigger version conflict (open page in second tab, save in first → verify autosave blocks).
15. Open HistoryTabPanel for a page; verify orphan comments display with snippet.
16. Switch project type to Artículo → verify linear layout still works. To FAQ → verify question/answer flow.

Each scenario must pass with **zero visual regression** and **zero functional regression**.

---

## Registry Safety

| Registry | Blocks used | Safety gate |
|----------|-------------|-------------|
| shadcn official | none | not required |
| Third-party UI libs | none — all chrome is hand-rolled or consumed from Phase 2 (`<Modal>` only) | not applicable |

Phase 4 introduces **zero new npm dependencies**. No new TipTap extensions, no new icon packs. `lucide-react`, `react`, `react-dom` only — already installed.

---

## Out of Scope (Phase 4)

Per CONTEXT.md `<deferred>` and the milestone Out-of-Scope section in PROJECT.md:

- Editor UX rediseño (panel layout, toolbar reordering, mode-toggle relocation).
- Performance optimization (memoization, virtual scrolling).
- TipTap extension migration / replacement.
- Light-mode editor toggle (the editor stays dark; theming-dark-mode.md belongs to a future milestone, and that future milestone is the *opposite* — light/dark switching for the rest of the app, not the editor).
- Public Share page migration — that is **Phase 5**.
- Mobile responsive rediseño of the editor — explicitly out of scope per PROJECT.md.
- Backend changes (orphan-resolve regex, autosave delays, comment emails, realtime channel) — out of scope; this phase is frontend CSS + JSX-narrow.
- New animations / transitions / motion system.

---

## Deviations From CONTEXT.md

None substantive. Three micro-clarifications added on top of CONTEXT.md decisions (no contradictions):

1. **Z-index collapse to a single sticky tier** (`var(--wb-z-sticky)` for all 9 different sticky/sub-sticky values currently in use across editor chrome). CONTEXT.md says "z-index del editor → tokens semánticos del sistema" without prescribing the granularity. Consolidating to one sticky tier reduces cognitive load and the visual stacking is achieved by DOM order. If during execution this collapse causes a real stacking bug (e.g., toolbar dropdown clipped under sections panel), the fix is to introduce a one-off `--wb-z-sticky-elevated: 250` token, not return to literal numbers.

2. **`EditorContextMenu` requires a `+1` offset** above the popover tier because it is the only popover that must always sit above margin comment cards (which are also popover-tier). Expressed via `calc(var(--wb-z-popover) + 1)`. Documented in CSS comment, not a new token.

3. **Brief variant** (`BriefProjectEditor`) is included in this phase. CONTEXT.md lists "Brief variante compacta" in the in-scope file list but the migration strategy section in CONTEXT.md focuses on the main editor. Step 8 in the plan handles it explicitly.

Three observations that are **not** deviations but are flagged for the planner:

a. The `rgb(255 255 255 / NN%)` and `rgb(0 0 0 / NN%)` alpha overlays (toolbar hover, separator, fake-selection) stay as literals with CSS comments. They are **not** tokenized to keep the system small. Plan-phase confirms.

b. Some hex literals on dark chrome (`#888`, `#aaa`, `#999`, `#bdc1c6`, `#c7c7c7`, `#d0d0d0`) currently encode 3 distinct levels of muted text. The token `--wb-editor-text-on-dark-muted` collapses them all to `#aaa`. If plan-phase finds a contrast issue, introduce `--wb-editor-text-on-dark-muted-strong: #c7c7c7` rather than reverting to literals.

c. The `imageContextMenu` uses `#1a1a1a` background with `rgb(255 255 255 / 8%)` border. The new token `--wb-editor-surface-elevated` covers the `#1a1a1a` case. The border alpha stays as literal.

---

## Checker Sign-Off (self-verified)

- [x] Dimension 1 — Copywriting: PASS (no new copy; existing Spanish strings + verb+noun pattern preserved)
- [x] Dimension 2 — Visuals: PASS (every editor surface mapped to tokens; modals delegated to `<Modal>` shared; no behavior change)
- [x] Dimension 3 — Color: PASS (60/30/10 split: dark chrome 60% / light canvas 30% / primary-900 + danger-600 accent 10%; AAA contrast on body text; comment highlight tokenized; Google Docs tooltip preserved)
- [x] Dimension 4 — Typography: PASS (chrome typography → Phase 1 tokens; ProseMirror content sizes preserved; uppercase forbidden; shortcut monospace preserved)
- [x] Dimension 5 — Spacing: PASS (every padding/gap → `--wb-space-*`; layout constants documented as exceptions)
- [x] Dimension 6 — Registry safety: PASS (zero new deps; `<Modal>` from Phase 2 is internal; tokenized z-index)

**Approval:** approved 2026-05-08 (auto-mode per `.planning/intel/decisions.md`; `skip_discuss=true`).
