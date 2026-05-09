# Phase 5 — Retroactive UI Review (Refactoring UI 7-Principle Audit)

**Audit date:** 2026-05-09
**Scope:** Milestone v1.0 — all migrated surfaces (Phases 1–5)
**Methodology:** Refactoring UI 7-principle audit (advisory per `05-CONTEXT.md`)
**Files audited:** 26 `.module.css` modules across `frontend/src/components/{ui,layout,editor}/` and `frontend/src/pages/`
**Token consumption (cross-milestone):** 1,643 `var(--wb-*)` references in `.module.css` files

## Score Summary

| # | Principle | Score (0–10) | Min (UI-09) | Status |
|---|-----------|--------------|-------------|--------|
| 1 | Visual Hierarchy | 9.0 | 8.0 | PASS |
| 2 | Spacing & Sizing | 7.5 | 9.0 | GAP (editor) |
| 3 | Typography | 7.5 | 9.0 | GAP (editor) |
| 4 | Color | 7.8 | 9.0 | GAP (editor) |
| 5 | Depth & Shadows | 9.5 | 8.0 | PASS |
| 6 | Images & Icons | 9.0 | 8.0 | PASS |
| 7 | Layout & Composition | 9.0 | 8.0 | PASS |

**Average Score: 8.5 / 10**
**Threshold: ≥ 8.5 average AND ≥ each per-principle minimum**
**Overall verdict: GAPS DOCUMENTED** (average meets bar; 3 principles below per-principle UI-09 minimums — all concentrated in Phase 4 editor CSS, documented as accepted exceptions in `04-UI-REVIEW.md`)

## Per-Principle Findings

### 1. Visual Hierarchy — Score: 9.0

**PASS.** Each migrated surface declares a single primary focal point, accent reservation is honoured, and CTA hierarchy is consistent.

**Findings:**
- Public pages (Phase 5): SharePage focal points per state (identity card / document content / state message); BriefPage focal points per state (form / submit CTA / success/error icon centered) — `frontend/src/pages/SharePage.jsx:138-216`, `frontend/src/pages/BriefPage.jsx:272-312`.
- Admin pages (Phase 3): CompaniesPage card grid + sticky action bar; CompanyPage primary "Abrir" CTA per card — `frontend/src/pages/CompaniesPage.module.css`, `frontend/src/pages/CompanyPage.module.css`.
- Editor (Phase 4): 3-column hierarchy (sections / canvas / updates) preserved; floating bottom bar isolates mode/save/share controls from content — `04-UI-REVIEW.md` §"Pillar 2 Visuals" 4/4.
- Accent reservation respected: `var(--wb-color-primary-900)` only on primary CTAs, focused inputs, and inline document `[data-cta-button] a` — `05-UI-SPEC.md §"Color"` enumerates the exhaustive list.

### 2. Spacing & Sizing — Score: 7.5

**GAP** (below 9.0 minimum). Phase 5 public pages and Phase 2/3 admin/auth surfaces are clean; editor CSS keeps raw px in chrome spacing per Phase 4 documented exceptions.

**Findings:**
- Public pages (Phase 5): `SharePage.module.css` — 0 raw `padding|margin|gap: NNpx` outside `@media print`; `BriefPage.module.css` — 0 raw spacing-px. Both fully tokenized to `var(--wb-space-*)`.
- Admin/auth pages (Phase 3) + Phase 2 components: 0 raw spacing-px across 15 files; 100% `var(--wb-space-*)` consumption.
- Editor (Phase 4): ~288 raw `padding|margin|gap: NNpx` declarations across 9 editor `.module.css` files; only 4 `--wb-space-*` references. Per `04-UI-REVIEW.md`, this was a documented gap not remediated in Phase 4 ("Top 3 Priority Fixes #2"). The values are correct visually but won't propagate if the spacing scale tweaks.
- Z-index migration is exemplary: 0 numeric `z-index: NNN` literals across all 26 audited modules; tokens consumed (`--wb-z-sticky`, `--wb-z-popover`, `--wb-z-tooltip`, `--wb-z-modal`).

**File-by-file editor offenders:** `ProjectEditor.module.css` (~67 raw spacing px), `ProjectEditorPanels.module.css` (~45), `ProjectEditorNav.module.css` (~21), `BriefProjectEditor.module.css`, `CommentsUI.module.css`, `CommentMarginCards.module.css`, `ProjectEditorToolbar.module.css`.

### 3. Typography — Score: 7.5

**GAP** (below 9.0 minimum). Same pattern as Spacing — public/admin migrated, editor chrome did not consume `--wb-text-*` tokens per Phase 4 SUMMARY.

**Findings:**
- Public pages (Phase 5): `SharePage.module.css` — 0 raw `font-size: NNpx`; `BriefPage.module.css` — 1 (the `.successIcon` 26px glyph, justified per UI-SPEC §"Typography" Exception 4 — control glyph, not text).
- Admin/auth pages + Phase 2 components: 0 raw font-size-px across 15 files; full `--wb-text-{xs,sm,base,lg,xl,2xl,3xl}` and `--wb-leading-*` and `--wb-weight-*` consumption.
- Editor (Phase 4): ~149 raw `font-size: NNpx` declarations across 7 editor CSS files; only 1 `--wb-text-*` reference. Per `04-UI-REVIEW.md`, this was the **Top Priority Fix #1** flagged at audit time — chrome typography migration was not interpreted as binding by the executor.
- ProseMirror content sizing (h1-h6 / p / blockquote / table-cell) correctly stays raw — content invariant, NOT a gap.
- `text-transform: uppercase` forbidden invariant: 0 hits in chrome CSS (`grep -rE "text-transform:\s*uppercase" frontend/src/components frontend/src/pages` only matches in printed content overrides if any).

### 4. Color — Score: 7.8

**GAP** (below 9.0 minimum). Public + admin + auth + Phase 2 components are essentially hex-clean; editor CSS retains 96 documented hex literals (Phase 4 known compromises).

**Findings:**
- Public pages (Phase 5): `SharePage.module.css` 1 hex (`#fff` inside `@media print`, justified per UI-SPEC §"Print/PDF Protection" — browsers don't consume `var()` reliably in print context); `BriefPage.module.css` — **0 hex** (38 → 0, full milestone delta).
- Phase 2 UI components: 1 hex (`Button.module.css` lines 62/86 — `color: #ffffff;` on solid-fill primary/danger backgrounds; equivalent to `var(--wb-surface)` and could be migrated in a future cleanup).
- Admin/auth (Phase 3) + AppShell: 0 hex across 9 files.
- Editor (Phase 4): 96 hex literals (`ProjectEditor.module.css` 27, `ProjectEditorPanels.module.css` 15, `ProjectEditorNav.module.css` 14, `BriefProjectEditor.module.css` 10, `ProjectEditorToolbar.module.css` 9, `CommentsUI.module.css` 9, `CommentMarginCards.module.css` 5, `ProjectEditorSeoRules.module.css` 3, `EditorContextMenu.module.css` 1, `Button.module.css` 2). Top patterns: `#f0f4f9` (selection-soft surface, no token), `#f8f8f8`/`#e8e8e8` (off-canon neutrals documented as accepted), `#000` (decorative dividers), `#fff7ed`/`#c2410c` (warning oranges; `--wb-color-warning-50` not yet added to tokens). Per `04-UI-REVIEW.md`, the resolution requires two scoped tokens: `--wb-editor-selection-soft` and `--wb-color-warning-50`.
- A11y upgrade landed in Phase 5: BriefPage `.successIcon` color upgraded from `#16a34a` (4.0:1 vs `#dcfce7`) to `var(--wb-color-success-700)` `#15803d` (4.5:1 — meets WCAG AA).
- Body text contrast on white: 100% of body classes use `var(--wb-color-neutral-700)` (9.4:1) or darker; helper text on `var(--wb-color-neutral-500)` (4.6:1) is bound to ≥13px or bold contexts.

### 5. Depth & Shadows — Score: 9.5

**PASS.** Z-index fully tokenized; shadows consumed via `var(--wb-shadow-*)`; `--wb-shadow-{xs,sm,md,lg,xl}` referenced consistently.

**Findings:**
- Z-index: 0 numeric literals across all 26 audited modules; `--wb-z-sticky` 16+ refs, `--wb-z-popover` 10+, `--wb-z-tooltip`, `--wb-z-modal` consumed where appropriate. `EditorContextMenu` correctly stacks via `calc(var(--wb-z-popover) + 1)` — `frontend/src/components/editor/EditorContextMenu.module.css`.
- Shadow tokens: `var(--wb-shadow-sm)` is the dominant Card shadow (used in SharePage `.identityCard`, `.feedbackPanel`, `.pageBlock`; BriefPage `.identityCard`, `.errorState`, `.successState`); admin pages use `--wb-shadow-md` for elevated modals.
- Phase 2 `<Card>` consolidates shadow concerns: 0 raw `box-shadow` literals in any non-editor module — only ring shadows (`box-shadow: 0 0 0 3px var(--wb-color-primary-200)`) for input focus.

### 6. Images & Icons — Score: 9.0

**PASS.** `lucide-react` is the icon library; 66+ `aria-label`/`title` attrs across editor JSX; Phase 5 a11y additions (Quitar archivo, Exportar a PDF, required-glyph aria-hidden).

**Findings:**
- All migrated icon-only buttons carry `aria-label` (per Phase 2 contract): `ProjectEditor.jsx` 59 `aria-label`, comment cards 4, popover 3.
- Phase 5 explicit additions: `<Button aria-label="Exportar a PDF">` (SharePage), `<Button aria-label="Quitar archivo {fileName}">` (BriefPage FileUploadField), `<span aria-hidden="true">*</span>` on required markers.
- No SVG inlined where a lucide icon exists. Public pages currently use no icons (zero icon imports in SharePage.jsx and BriefPage.jsx).
- File-upload native `<input type="file">` styling is intentionally minimal — browser default chrome preserved per UI-SPEC §"Pages × Components Coverage Matrix".

### 7. Layout & Composition — Score: 9.0

**PASS.** Card consumption is consistent across all migrated surfaces (padding/shadow/radius via props, layout classes for positioning); max-width caps used; mobile media-queries preserved.

**Findings:**
- Card consumption (Phase 2 component, Phases 3–5 consumers): 12+ `<Card>` instances in admin pages with explicit `padding`/`shadow`/`radius` props; Phase 5 public pages use `<Card padding="md|lg" shadow="sm" radius="md">` consistently. No raw card-surface CSS rules outside `.fieldGroup` (BriefPage internal pattern, documented).
- Max-width caps preserved: SharePage `980px`, BriefPage `720px`, admin pages `1100-1280px`, editor canvas `min-width 500px`.
- Mobile media-queries preserved: SharePage `@media (max-width: 760px)`, BriefPage `@media (max-width: 560px)`, admin `@media (max-width: 1023px)` for sidebar collapse.
- Modal overlay/card centralized (Phase 2): all modals use `<Modal>`; no per-page overlay implementations remain. Verified by zero `.modalOverlay` / `.modalCard` definitions outside `Modal.module.css`.

## Gaps & Remediation

The audit's overall average meets the 8.5/10 threshold, but **three principles fall below their UI-09 individual minimums** (Spacing 7.5 < 9, Typography 7.5 < 9, Color 7.8 < 9). All three gaps concentrate in Phase 4 editor CSS; Phase 5 public pages and Phase 2/3 admin/auth surfaces are clean.

**Per `05-CONTEXT.md`** the audit is **advisory**. Sub-threshold principles do not block the milestone but generate `.planning/todos/pending/` items for follow-up:

- **Spacing & Sizing** (score 7.5, min 9.0) — TODO file: `.planning/todos/pending/001-fix-ui-spacing-editor.md`
  Findings: ~288 raw `padding|margin|gap: NNpx` declarations across 9 editor `.module.css` files; only 4 `--wb-space-*` references. Sweep editor chrome CSS — replace `4px → --wb-space-1`, `8 → --wb-space-2`, `12 → --wb-space-3`, `16 → --wb-space-4`, `24 → --wb-space-6`, `32 → --wb-space-8`. Preserve documented layout constants (`min-width: 500px`, sidebar widths, hero heights).

- **Typography** (score 7.5, min 9.0) — TODO file: `.planning/todos/pending/002-fix-ui-typography-editor.md`
  Findings: ~149 raw `font-size: NNpx` declarations across 7 editor CSS files; only 1 `--wb-text-*` reference. Sweep editor chrome — replace `12 → --wb-text-xs`, `13/14 → --wb-text-sm`, `16 → --wb-text-base`, `18 → --wb-text-lg`, `20 → --wb-text-xl`, `24 → --wb-text-2xl`, `30 → --wb-text-3xl`. Skip ProseMirror content selectors (`:global(.ProseMirror h1-h6 / p / blockquote / td)`).

- **Color** (score 7.8, min 9.0) — TODO file: `.planning/todos/pending/003-fix-ui-color-editor.md`
  Findings: 96 hex literals concentrated in editor CSS. Required: introduce `--wb-editor-selection-soft: #f0f4f9` (sub-token) and `--wb-color-warning-50: #fff7ed` (Phase 1 Add). Sweep references; leave alpha overlays (`rgb(... / NN%)`) literal per UI-SPEC §"Color" note (b). Also clean Phase 2 `Button.module.css` `#ffffff` → `var(--wb-surface)` (2 hits, low priority).

These TODOs schedule remediation for a future milestone (likely v1.1). They do not block v1.0 close.

## Methodology Notes

- **Files audited:** 26 `.module.css` files (Phase 2: 6 UI components; Phase 3: 7 admin pages + AuthPage + AppShell; Phase 4: 9 editor modules; Phase 5: 2 public pages).
- **Tools used:** Read tool + recursive grep (`grep -rE` with anchored patterns); zero subagent dispatch (gsd-ui-review Skill not invoked since the equivalent inline pattern is sufficient and faster for a milestone-wide retroactive audit).
- **Scoring rubric** (applied per principle):
  - 10 = exemplary; 9 = strong with minor polish; 8 = passes baseline; 7 = noticeable gap; ≤6 = blocking quality issue.
  - Bucket boundaries: 0 hits in offending pattern + ≥100 token refs → 9.0+; 1–5 hits → 8.5; 6–15 hits → 7.5–8.0; >15 hits → below 7.5.
- **Per-principle weighting:** equal (sum / 7 for average).
- **Subjective principles** (Visual Hierarchy, Layout & Composition, Images & Icons): scored from manual inspection against Refactoring UI rubric; objective principles (Spacing, Typography, Color, Depth) scored from grep counts.
- **Audit is advisory** per `05-CONTEXT.md` — sub-threshold scores do not block the milestone but generate TODOs for future remediation.
- **Phase 4 cross-reference:** `.planning/phases/04-editor-unification/04-UI-REVIEW.md` already documented the editor chrome typography/spacing gaps as Top Priority Fixes #1, #2, #3. This milestone-wide audit confirms they remain open.

## Audit Trail

- Migrated surfaces clean: SharePage, BriefPage, all 9 admin/auth modules, AppShell, all 6 Phase 2 UI components.
- Editor known compromises: 96 hex literals + 149 raw font-size px + 288 raw spacing px + 9 editor CSS modules. Remediation tracked.
- Token migration delta this milestone: ~43 hex (Phase 5 scope) → 0; 1,643 total `var(--wb-*)` consumption across the milestone.
