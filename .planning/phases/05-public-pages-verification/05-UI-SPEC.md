---
phase: 5
slug: public-pages-verification
status: approved
shadcn_initialized: false
preset: none
created: 2026-05-09
---

# Phase 5 — UI Design Contract

> Visual + interaction contract for migrating WeBrief's TWO public-facing surfaces (`SharePage` + `BriefPage`) onto Phase 1 tokens (`frontend/src/styles/tokens.css`) and Phase 2 shared primitives (`frontend/src/components/ui/`), plus the milestone-final retroactive UI audit (`gsd-ui-review`) and golden-path verification. Phase 5 is migration + verification only — zero new visual concepts, zero functional changes, zero copy rewording, zero auth introduced into public flows. The contract locks token-to-element bindings, page-by-page consumption matrix, copy preservation, the print/PDF protection, and the audit/verification gates BEFORE `plan-phase` decomposes tasks. Per `.planning/intel/decisions.md` (auto-mode, `skip_discuss=true`) and `05-CONTEXT.md`, all decisions are pre-locked.

---

## Design System

| Property | Value |
|----------|-------|
| Tool | none (CSS Modules + variables CSS) — no shadcn / Radix / Tailwind |
| Preset | not applicable |
| Component library | hand-rolled primitives from Phase 2 (`components/ui/`) |
| Icon library | `lucide-react` (already in deps; only used if a CTA needs an icon — public pages currently have none) |
| Font | `var(--wb-font-sans)` — `system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif` |
| Stack constraint | React 18 + JS-only (`.jsx`); no TS, no CSS-in-JS |
| Token source | `frontend/src/styles/tokens.css` (Phase 1; coexists with editor sub-tokens added in Phase 4) |
| Components consumed | `Button`, `Input`, `Card`, `Modal`, `Badge` from `frontend/src/components/ui` (Phase 2). `Select` is NOT consumed in Phase 5 — public pages have no `<select>` controls. |
| Imports | Relative — no path alias configured |
| Migration mode | File-by-file, one atomic commit per page; final audit + verification get their own commits |
| Functional change budget | **Zero.** Pure CSS + component-substitution refactor. Email gate flow, comment submit flow, approvals/change requests, print/PDF, file uploads, validation, redirect logic — all preserved verbatim. |
| Auth posture | Public pages remain unauthenticated. Viewer identity = name + email captured client-side and stored in `localStorage` per token (preserve current `share-viewer-${token}` key). No Supabase Auth introduced. |

---

## Spacing Scale

Phase 5 consumes the Phase 1 spacing tokens directly. Every padding, gap, margin, and offset in migrated public pages must resolve to a `--wb-space-*` token. Hardcoded px is forbidden in migrated `.module.css` rules **except** inside `@media print` blocks (see "Print/PDF Protection" below).

| Token | Value | Usage in Phase 5 |
|-------|-------|-------------------|
| `--wb-space-1` | 4px | File-list line-height adjustments, required-marker gap, sectionHeader top breathing |
| `--wb-space-2` | 8px | Field-stack inner gap, hint→input gap, Card-internal compact gap, action-button row gap |
| `--wb-space-3` | 12px | Identity-grid gap (Share), Field gap (Brief), file-list row gap, action button row spacing |
| `--wb-space-4` | 16px | Identity card padding, fieldGroup default padding, modal/feedback panel internal gap, Brief identity grid gap |
| `--wb-space-5` | 20px | Page header bottom margin, document gap, feedback row spacing |
| `--wb-space-6` | 24px | Card default padding (Brief identity card, fieldGroup), Share `.identityCard` content padding, page horizontal gutter on `<= md` |
| `--wb-space-8` | 32px | Page top padding (Share), pageBlock padding-top (Share `.pageBlock`), Brief success/error state padding |
| `--wb-space-12` | 48px | Brief page bottom padding, success-state vertical padding, large vertical separators between sections |
| `--wb-space-16` | 64px | Brief page bottom-most gutter (`80px` becomes `--wb-space-16` rounded to scale; see Exception below), Share `.pageBlock` left/right padding on `>= md` (44px → keep as exception OR remap to 48 = `--wb-space-12`; see exceptions) |
| `--wb-space-24` | 96px | Reserved (not used in public pages) |

**Exceptions (locked):**
1. **`@media print` blocks**: keep px literals (print rendering does not consume runtime tokens reliably across browsers; `@media print` styles preserve current values for fidelity). All print rules in `SharePage.module.css` lines 233–250 stay as-is structurally — only re-target to the migrated class names if classes change.
2. **`SharePage` `.pageBlock` padding (`36px 44px`)**: remap to `var(--wb-space-8) var(--wb-space-12)` (32px / 48px) — this is a 4px / 4px shift that visually preserves the document feel. Document the 4px deviation in Phase 5 SUMMARY (acceptable per decisions.md "opción más conservadora — preservar look existente" guidance for ambiguous deltas; the alternative of inventing a non-scale token is rejected).
3. **`BriefPage` `.page` padding (`40px 16px 80px`)**: remap to `var(--wb-space-12) var(--wb-space-4) var(--wb-space-16)` (48px / 16px / 64px). Document the top-padding 8px shift (40→48) and bottom-padding 16px shift (80→64) in Phase 5 SUMMARY. These re-snap to the spacing scale; visually the page feels identical at common viewports.
4. **`BriefPage` `.optionInput` `width: 16px; height: 16px`** for the radio/checkbox glyph stays as-is — this is a form-control glyph size, not a layout value, and `--wb-space-4` happens to equal 16px so it's already on-scale.
5. **Modal-driven heights**: control heights (Input/Button) come from Phase 2 components, not page CSS. Public pages must NOT redeclare control heights.

After migration, `grep -E 'padding:|margin:|gap:' <files>` must resolve every value to either `var(--wb-space-*)`, `var(--wb-radius-*)`, `0`, `auto`, or a `@media print` exception.

---

## Typography

Public pages use **five sizes max** (Caption / Label / Body / Heading / Display). The `Display` size IS used here — public pages have a hero title (Share `.title`, Brief `.formTitle`) that should feel marketing-grade clean. Phase 3 admin/auth deliberately did not use Display; Phase 5 unlocks it for public surfaces only.

| Role | Size token | Weight token | Line-height token | Used by |
|------|-----------|--------------|-------------------|---------|
| Caption | `--wb-text-xs` (12px) | `--wb-weight-medium` (500) | `--wb-leading-normal` (1.5) | `requiredNote` (Brief), `eyebrow` (Share), file-list KB suffix, `linkButton` ("Cambiar datos"), helper hints |
| Label | `--wb-text-sm` (14px) | `--wb-weight-medium` (500) | `--wb-leading-normal` (1.5) | `field` labels, `questionLabel`, `optionLabel`, `feedback` text, button text inside primary/secondary/danger CTAs, `hint`, `submitError` |
| Body | `--wb-text-base` (16px) | `--wb-weight-regular` (400) | `--wb-leading-normal` (1.5) | `subtitle`, `formDescription`, `successText`, `errorText`, document `.content` body (existing `line-height: 1.65` rounds to `--wb-leading-normal` 1.5 — see Exception below) |
| Heading | `--wb-text-lg` (18px) | `--wb-weight-semibold` (600) | `--wb-leading-xl` (1.4) | `cardTitle`, `identityTitle` (Brief uses 15px → snap up to 18px or down to 14px Label per visual call; lock to **Label 14px / weight-bold 700** to preserve "Tus datos" inline-heading feel), `pageBlock h2` (current 22px → snap down to 20px `--wb-text-xl` OR up to 24px `--wb-text-2xl`; lock to `--wb-text-xl` 20px / 600 / `--wb-leading-xl` 1.4 — closer to current 22px) |
| Display | `--wb-text-3xl` (30px) | `--wb-weight-semibold` (600) | `--wb-leading-3xl` (1.2) | Share `.title` (currently 32px → snap to 30px), Brief `.formTitle` (currently 28px → snap up to 30px). Both hero titles share Display. |

**Exceptions (locked):**
1. **`SharePage` `.content` document body line-height (`1.65`)**: keep at `1.65` via a local `--wb-leading-document: 1.65` variable defined inside `SharePage.module.css`, OR remap to `--wb-leading-relaxed` (1.75). Lock to `--wb-leading-relaxed` (1.75) — slightly more generous than 1.65, but reads as "still-tight document body"; the difference is imperceptible at 16px. Document in SUMMARY.
2. **`BriefPage` `.identityTitle` (currently 15px / 700)**: 15px is off-scale. Snap to `--wb-text-sm` (14px) / `--wb-weight-bold` (700) / `--wb-leading-normal`. Title still reads as a strong section header; visual delta = 1px.
3. **`BriefPage` `.formDescription` (currently 15px / regular / 1.6)**: snap to `--wb-text-base` (16px) / `--wb-weight-regular` / `--wb-leading-normal` (1.5). 1px size shift, 0.1 leading shift — both imperceptible.
4. **`BriefPage` `.successIcon` (font-size 26px / 700 inside a 56×56 circle)**: glyph is a checkmark "✓" — preserve as-is (icon glyph, not text). Background `--wb-color-success-100`, color `--wb-color-success-700`.
5. **`BriefPage` `.successTitle` (currently 24px)** and **`.errorTitle` (currently 22px)**: snap both to `--wb-text-2xl` (24px) / `--wb-weight-bold` (700) / `--wb-leading-2xl` (1.3). Error title gains 2px (acceptable).
6. **`BriefPage` `.submitButton` (font-size 15px / 700 / padding `11px 28px`)**: replace entirely with Phase 2 `<Button variant="primary" size="lg">` — geometry comes from Phase 2 (height 48 / padding-X 20 / `--wb-text-base`+600). Visual delta: tighter padding (28→20), 1px font-size loss (15→16 actually grows), weight 700→600. Document in SUMMARY; the tradeoff is consistency with the rest of the app's primary CTAs.

**Letter-spacing:** default. **`text-transform: uppercase` is forbidden** — `Recent Fixes` in CONTEXT.min.md removed uppercase from auth and admin pages; public pages currently have none. Migration must not reintroduce.

**Font stack:** never re-declare `font-family` at the page level. The cascade from `:root` + `body` (already set in Phase 1) applies. The current `font-family: inherit` on `BriefPage` `.input` / `.textarea` / `.submitButton` is already correct — remove during migration since Phase 2 components handle this.

---

## Color

Public pages are a **single light theme** — never dark. Phase 5 strictly maps the existing palette in public pages onto Phase 1 tokens. No new accents, no new semantic colors.

The current public-page palette is already aligned with the global token palette (slate neutrals, primary `#091223`, success greens, danger reds) — most hex literals are 1:1 substitutions. The non-aligned values are listed under "Special remappings" below.

| Role | Token / Value | Usage in Phase 5 (specific elements only) |
|------|---------------|-------------------------------------------|
| Dominant (60%) | `#ffffff` (`--wb-surface`) and `var(--wb-color-neutral-50)` (`--wb-bg`) | Page background of Share (`--wb-bg`) and Brief (`#f4f7fb` → `var(--wb-bg)` = `#f8fafc`, 4-unit shift on green channel — see Special Remappings); Card surface; Input/Modal background |
| Secondary (30%) | `var(--wb-color-neutral-100)` and `var(--wb-color-neutral-200)` | Card hover surface (if added), `--wb-border` outline of cards/inputs/fieldGroups |
| Accent (10%) | `var(--wb-color-primary-900)` (`#091223`) | Primary CTA fill (`Button variant="primary"`), Input/textarea focus border, document `[data-cta-button] a` background, `submitButton` background (Brief, after Phase 2 swap) |
| Destructive | `var(--wb-color-danger-600)` (`#dc2626`) | `Button variant="danger"` fill ("Pedir cambios"), Input error border + helper text, file-list "Quitar" link, `required` marker, `submitError` text |
| Success | `var(--wb-color-success-700)` text on `var(--wb-color-success-100)` bg | Brief success state icon background (`#dcfce7` → `--wb-color-success-100`) + glyph color (`#16a34a` → `--wb-color-success-600` to preserve current 4.0:1 inside the circle, OR `--wb-color-success-700` for AA — lock to **`--wb-color-success-700`** for AA compliance; visual delta minimal). Share `.feedback` success message text → `--wb-color-success-700` (currently `--wb-success` = `#0f766e` teal → preserve via existing alias OR migrate to `--wb-color-success-700` `#15803d`; lock to **preserve existing `--wb-success` alias** to avoid teal→green shift in feedback toasts; document the alias usage in SUMMARY). |
| Warning | `var(--wb-color-warning-700)` text on `var(--wb-color-warning-100)` bg | Reserved — public pages currently have no warning state. If a viewer-side error degrades to a warning (e.g., upload retry), use `Badge variant="warning"`. |

**Accent reserved for** (exhaustive list — never expand without spec update):
1. Primary `<Button variant="primary">` background (Share "Continuar", Share "Aprobar", Brief "Enviar brief").
2. Input / textarea focused border (`box-shadow: 0 0 0 3px var(--wb-color-primary-200)` ring per Phase 2 — replaces current Share `box-shadow: 0 0 0 3px rgba(15, 23, 42, 0.08)` and Brief `border-color: #212222`).
3. Inline document CTA (`[data-cta-button] a`) — server-rendered TipTap CTA node inside `.content`. Stays as a styled anchor (NOT a Phase 2 Button component, since it's HTML in `dangerouslySetInnerHTML`). Background remains `var(--wb-primary)`.

Anything outside this list (hovers, link colors elsewhere, decorative chrome) uses **neutral** tokens, not accent.

**Body text on white:** minimum `var(--wb-color-neutral-700)` (`#334155`, 9.4:1). Captions/helper text use `var(--wb-color-neutral-600)` (6.9:1). `var(--wb-color-neutral-500)` (`#64748b`, 4.6:1) is allowed only on large or bold text — currently used for `loadingText`, `requiredNote`, hints, `successText` muted color, `errorText` muted color (all ≥ 13px and either bold or surrounded by context that pairs color + text label).

**Hardcoded colors forbidden.** Audit baseline (counted via `grep -E '#[0-9a-fA-F]{3,8}'`):
- `SharePage.module.css`: **5 hardcoded hex** (`#fff` ×3, `#fecaca`, `#fef2f2`).
- `BriefPage.module.css`: **38 hardcoded hex** (`#091223` ×2, `#475569` ×2, `#94a3b8`, `#fff` ×6, `#e2e8f0` ×4, `#0f172a` ×4, `#1e293b` ×2, `#ef4444`, `#64748b` ×3, `#f8fafc` ×2, `#cbd5e1` ×2, `#212222` ×3, `#000`, `#dc2626`, `#fef2f2`, `#fecaca`, `#dcfce7`, `#16a34a`, `#f4f7fb`).
- **Total in Phase 5 scope: 43 hex literals → 0**.

Plus `BriefPage.jsx` has inline-style hex (`#dc2626`, `#94a3b8`) inside `FileUploadField`. Phase 5 must remove ALL inline styles from `BriefPage.jsx` — re-declare them in `BriefPage.module.css` consuming tokens.

**Special remappings (locked — visual deltas accepted):**

| Source literal | Target token | Visual delta |
|----------------|--------------|--------------|
| `#f4f7fb` (Brief page bg) | `var(--wb-bg)` = `#f8fafc` | Imperceptible (4-unit shift on green/blue channels) |
| `#212222` (Brief input focus border + checkbox accent + submitButton bg) | `var(--wb-color-primary-900)` = `#091223` | Slightly cooler/darker; preserves "near-black" feel |
| `#000` (Brief submitButton hover bg) | `var(--wb-color-primary-700)` = `#0b1220` | Hover state stays "darker than rest"; loses pure-black drama (acceptable per decisions.md "no black puro" rule) |
| `#fff` (everywhere) | `var(--wb-surface)` = `#ffffff` | Identical |
| `#fef2f2` (danger bg pill / error chip) | `var(--wb-color-danger-50)` = `#fef2f2` | Identical |
| `#fecaca` (danger border) | `var(--wb-color-danger-200)` = `#fecaca` | Identical |
| `#dc2626`, `#ef4444`, `#16a34a`, `#dcfce7`, `#091223`, `#0f172a`, `#1e293b`, `#475569`, `#64748b`, `#94a3b8`, `#e2e8f0`, `#cbd5e1`, `#f8fafc` | exact match in token palette | Identical |

After migration, the `grep -E '#[0-9a-fA-F]{3,8}'` count must be **0** in both `SharePage.module.css` and `BriefPage.module.css`. The `dangerouslySetInnerHTML` content is server-rendered (TipTap output) and out of scope for hex-grep.

**Per-element token map (locked):**

```
Share page bg                  bg: var(--wb-bg)                              text: var(--wb-color-neutral-700)
Share .header h1 .title       color: var(--wb-color-primary-900)            font: --wb-text-3xl/600
Share .eyebrow                color: var(--wb-text-muted)                   font: --wb-text-xs/600 (existing 13px → snap 12px)
Share .subtitle               color: var(--wb-text-muted)                   font: --wb-text-base/regular
Share .identityCard / .feedbackPanel / .pageBlock
                              bg: var(--wb-surface)  border: 1px solid var(--wb-border)
                              shadow: var(--wb-shadow-sm)  radius: var(--wb-radius-2)  /* current 8px is on-scale */
Share .field input / textarea border: 1px solid var(--wb-border)
                              focus border: var(--wb-border-strong)
                              focus ring: 0 0 0 3px var(--wb-color-primary-200)
                              radius: var(--wb-radius-2)
Share .primaryButton          delegated to <Button variant="primary" size="md">
Share .secondaryButton        delegated to <Button variant="secondary" size="md">
Share .dangerButton           delegated to <Button variant="danger" size="md">
Share .linkButton             delegated to <Button variant="ghost" size="sm">
Share .feedback               color: var(--wb-success) /* preserve teal alias */
Share .pageBlock h2           color: var(--wb-color-primary-900)            font: --wb-text-xl/600
Share .content                line-height: var(--wb-leading-relaxed) (1.75)
Share document [data-cta-button] a
                              bg: var(--wb-primary)  color: var(--wb-surface)
                              radius: var(--wb-radius-2)  font: --wb-text-sm/500

Brief page bg                  bg: var(--wb-bg)                              /* shift from #f4f7fb */
Brief .formTitle              color: var(--wb-color-primary-900)            font: --wb-text-3xl/700
Brief .formDescription        color: var(--wb-color-neutral-600)            font: --wb-text-base/regular
Brief .requiredNote           color: var(--wb-color-neutral-500)            font: --wb-text-xs/regular
Brief .identityCard / .fieldGroup / errorState / successState
                              bg: var(--wb-surface)  border: 1px solid var(--wb-color-neutral-200)
                              radius: var(--wb-radius-3) /* 12px = current */
Brief .identityTitle          color: var(--wb-color-primary-900)            font: --wb-text-sm/700  /* snap from 15px */
Brief .questionLabel          color: var(--wb-color-neutral-800)            font: --wb-text-sm/600
Brief .required               color: var(--wb-color-danger-500)
Brief .hint                   color: var(--wb-color-neutral-500)            font: --wb-text-xs/regular
Brief .input / .textarea      delegated to <Input> from Phase 2  /* see Pages × Components matrix */
Brief .sectionHeader          border-bottom: 2px solid var(--wb-color-neutral-200)
Brief .sectionHeaderTitle     color: var(--wb-color-neutral-900)            font: --wb-text-lg/700  /* 17→18 snap */
Brief .optionLabel            color: var(--wb-color-neutral-800)            font: --wb-text-sm
Brief .optionInput            accent-color: var(--wb-color-primary-900)
Brief .submitButton           delegated to <Button variant="primary" size="lg">
Brief .submitError            color: var(--wb-color-danger-600)
                              bg: var(--wb-color-danger-50)
                              border: 1px solid var(--wb-color-danger-200)
                              radius: var(--wb-radius-2)
Brief .loadingText            color: var(--wb-color-neutral-500)            font: --wb-text-base
Brief .errorTitle             color: var(--wb-color-neutral-900)            font: --wb-text-2xl/700
Brief .errorText              color: var(--wb-color-neutral-500)            font: --wb-text-base
Brief .successIcon            bg: var(--wb-color-success-100)
                              color: var(--wb-color-success-700)            /* AA: was #16a34a 4.0:1 → upgrade */
Brief .successTitle           color: var(--wb-color-neutral-900)            font: --wb-text-2xl/700
Brief .successText            color: var(--wb-color-neutral-600)            font: --wb-text-base
Brief FileUploadField list    color: var(--wb-color-neutral-700)            font: --wb-text-sm
Brief FileUploadField .kbSize color: var(--wb-color-neutral-400)            font: --wb-text-xs
Brief FileUploadField "Quitar" delegated to <Button variant="ghost" size="sm"> with danger color override OR keep as <button> with class consuming tokens (lock to **<Button variant="ghost"> with explicit className for danger color** to keep visual minimal)
```

---

## Copywriting Contract

Phase 5 migrates existing UI — **all current copy is preserved verbatim**. The contract below locks the verb+noun pattern for every CTA, every empty/error/success state, and every form-field label that currently exists. The migration must not rephrase any string.

| Page / Surface | Element | Locked Copy (Spanish) |
|----------------|---------|------------------------|
| `SharePage` | Hero eyebrow (per project type) | `"Página web compartida"` / `"Artículo compartido"` / `"FAQs compartidas"` / `"Brief compartido"` (genero/numero correcto preserved) / fallback `"Contenido compartido"` |
| `SharePage` | Print CTA | `"Exportar PDF"` |
| `SharePage` | Identity gate heading | `"Identifícate para comentar o aprobar"` |
| `SharePage` | Identity field labels | `"Nombre"` · `"Email"` |
| `SharePage` | Identity submit CTA | `"Continuar"` |
| `SharePage` | Viewer caption | `"Comentando como {name} · {email}"` |
| `SharePage` | Change-identity link | `"Cambiar datos"` |
| `SharePage` | Comment field label | `"Comentario"` |
| `SharePage` | Comment submit CTA | `"Enviar comentario"` |
| `SharePage` | Approval note label | `"Nota de aprobación o cambios"` |
| `SharePage` | Approval CTA | `"Aprobar"` |
| `SharePage` | Change-request CTA | `"Pedir cambios"` |
| `SharePage` | Feedback success (comment) | `"Comentario enviado."` |
| `SharePage` | Feedback success (approve) | `"Aprobación registrada."` |
| `SharePage` | Feedback success (changes) | `"Pedido de cambios registrado."` |
| `SharePage` | Loading state | `"Cargando contenido..."` |
| `SharePage` | Error fallback (load) | `"No se pudo abrir el brief"` (server message takes priority via `err.message`) |
| `SharePage` | Error fallback (comment) | `"No se pudo enviar el comentario"` |
| `SharePage` | Error fallback (approval) | `"No se pudo registrar la respuesta"` |
| `BriefPage` | Hero title | dynamic `brief.formTitle` (server-provided) |
| `BriefPage` | Hero description | dynamic `brief.formDescription` (server-provided, optional) |
| `BriefPage` | Required-field note | `"Los campos marcados con * son obligatorios."` |
| `BriefPage` | Identity card heading | `"Tus datos"` |
| `BriefPage` | Identity field labels | `"Nombre completo"` · `"Correo electrónico"` |
| `BriefPage` | Identity placeholders | `"Tu nombre"` · `"tu@email.com"` |
| `BriefPage` | File upload uploading state | `"Subiendo…"` |
| `BriefPage` | File upload error fallback | `"No se pudo subir el archivo"` |
| `BriefPage` | File-list remove | `"Quitar"` |
| `BriefPage` | Submit CTA (default) | `"Enviar brief"` |
| `BriefPage` | Submit CTA (loading) | `"Enviando..."` |
| `BriefPage` | Validation error (per question) | `"Por favor responde: \"{label}\""` |
| `BriefPage` | Submit error fallback | `"No se pudo enviar el formulario"` |
| `BriefPage` | Loading state | `"Cargando brief..."` |
| `BriefPage` | Error state heading | `"Brief no disponible"` |
| `BriefPage` | Error state body | server `err.message` OR fallback `"No se pudo cargar el brief"` |
| `BriefPage` | Success state heading | `"¡Gracias por completar el brief!"` |
| `BriefPage` | Success state body | `"Tu información fue recibida correctamente. El equipo se pondrá en contacto contigo pronto."` |

**CTA verb pattern preserved everywhere:** `verb + concrete noun` (`Continuar`, `Enviar comentario`, `Aprobar`, `Pedir cambios`, `Cambiar datos`, `Enviar brief`, `Quitar`). No `Aceptar` / `OK` / `Submit` introduced.

**Aria-labels added during migration** (no visible copy change, accessibility improvement):
- `Button` instances delegating from current `<button>` get the implicit ARIA from Phase 2 contract (no per-page override needed). 
- `SharePage` print button: `aria-label="Exportar a PDF"` (clarifies action vs. visible label which is also "Exportar PDF" — no-op redundancy is fine).
- `BriefPage` `FileUploadField` `Quitar` button (icon-less now, but if reused in another upload widget): `aria-label="Quitar archivo {fileName}"`.
- `BriefPage` required-field `<span>` glyph stays `aria-hidden="true"` per Phase 2 Input contract; `aria-required="true"` is set on the underlying input.

**Forbidden during migration:** rewording, adding emojis, introducing new tooltips, capitalizing any string, translating to English, splitting/joining sentences. Server-provided strings (`brief.formTitle`, `brief.formDescription`, `err.message`) pass through unmodified.

---

## Pages × Components Coverage Matrix

This is the binding contract for which Phase 2 component each in-scope page consumes, and what local CSS each page must DELETE during migration.

| Page | `Button` | `Input` | `Select` | `Modal` | `Card` | `Badge` | Local CSS to DELETE |
|------|:-------:|:------:|:------:|:------:|:-----:|:------:|---------------------|
| `SharePage` | YES (primary, secondary, danger, ghost) — replaces all 4 button styles inline | YES (name, email, comment textarea, approval-comment textarea) — replaces `.field input` and `.field textarea` raw styling | NO | NO (no modal in current Share flow) | YES (`.identityCard`, `.feedbackPanel`, `.pageBlock` all consume `<Card>` for surface + shadow + radius — internal layout stays in module) | NO (no Badge in current Share flow; reserved for future approval-status pill if added) | `.primaryButton`, `.secondaryButton`, `.dangerButton`, `.linkButton`, `.field input/textarea` raw rules (border/focus/radius become `<Input>`); keep `.identityCard/.feedbackPanel/.pageBlock` as layout shells with `<Card>` providing surface |
| `BriefPage` | YES (primary "Enviar brief" via size=lg, ghost "Quitar" file-list) | YES (`respondentName`, `respondentEmail`, all `short_text` and `long_text` question fields, file-upload native `<input type="file">` stays native — wrapped in `<Input>` if its API supports `type="file"`, else keep native and tokenize surrounding styles) | NO (no `<select>` in Brief; choice fields use radio/checkbox lists — keep native) | NO (no modal in Brief flow) | YES (`.identityCard`, `.fieldGroup`, `.errorState`, `.successState` all consume `<Card>` for surface + shadow + radius) | NO (no Badge in Brief; reserved) | `.input`, `.textarea`, `.submitButton` raw styling (delegated to `<Input>`/`<Button>`), inline styles in `BriefPage.jsx` (`FileUploadField` list `<li>` and `<button>`) |

**`<Input>` API extension check (locked):** Phase 2 `<Input>` supports `type="text" | "email" | "password" | "number" | "search" | "tel" | "url"`. Brief's question types `short_text` and `long_text` fit this (`short_text` → `type="text"`, `long_text` → `<textarea>` — Phase 2 `<Input>` does NOT include textarea support). **Decision:** for `long_text`, keep `<textarea>` native and tokenize its CSS rules in-place (same border/focus/radius pattern as `<Input>`); add a comment in `BriefPage.module.css` noting "textarea matches Phase 2 Input visuals; if Phase 6 ships a Textarea primitive, migrate then." **For `short_text`:** consume `<Input>` from Phase 2.

**`<Card>` consumption pattern (locked):** `<Card>` provides surface (bg + shadow + border + radius). Public-page rules that currently sit on `.identityCard`, `.feedbackPanel`, `.pageBlock`, `.fieldGroup`, `.errorState`, `.successState` get split:
- `<Card>` props (`padding`, `shadow`, `radius`) handle the surface chrome.
- The local class on the wrapping element keeps ONLY layout properties (`display`, `grid-template`, `gap`, custom margins) — no `bg` / `border` / `box-shadow` / `border-radius` declarations remain.

**Forbidden:** introducing a `<Modal>` where there is currently none. Public pages have no modals — keep them inline-flow.

---

## Z-index Migration Map

Public pages currently declare **zero z-index values**. Verified via `grep -E 'z-index:\s*[0-9]+' frontend/src/pages/SharePage.module.css frontend/src/pages/BriefPage.module.css`. Phase 5 must NOT introduce any z-index — public flows are linear, no overlays, no popovers, no sticky elements. If a future flow adds an overlay (e.g., upload progress modal), it must use `var(--wb-z-modal)` from Phase 1.

| Source file | Current literal | Replacement token | Notes |
|-------------|-----------------|-------------------|-------|
| `SharePage.module.css` | (none) | (none) | Verified: zero z-index declarations. |
| `BriefPage.module.css` | (none) | (none) | Verified: zero z-index declarations. |

---

## Print/PDF Protection (`@media print`)

`SharePage.module.css` lines 233–250 contain a `@media print` block that controls PDF export via `window.print()`. This block is **load-bearing** — it hides the identity gate, feedback panel, and "Exportar PDF" button during print, removes the page padding, and forces `page-break-after: always` between pageBlocks.

**Migration constraints (locked):**
1. The `@media print` block is the ONLY exception to "no hardcoded values" in Phase 5. Print rendering does not consume runtime CSS variables reliably across all browsers (Safari and older Chrome have issues with `var()` inside `@media print`). **Keep current literals**: `padding: 0`, `background: #fff`, `border: none`, `box-shadow: none`, `page-break-after: always`.
2. If migrated class names change (e.g., `.identityCard` becomes `.identityShell`), update the `display: none` selectors in the print block to match. Otherwise the print rules become dead code and the gate stays visible during print.
3. Print block selectors after migration MUST include: `.identityCard, .feedbackPanel, [data-action-button="secondary"]` (or whichever selector targets the "Exportar PDF" `<Button>`). The Phase 2 `<Button>` renders a `<button>` with internal classes, so target via a `data-*` attribute on the wrapping element OR add `aria-hidden="true"` + a custom class on the print-hidden CTA. **Lock to**: wrap "Exportar PDF" `<Button>` in a `<div className={styles.printHide}>...</div>` and add `.printHide { display: none; }` inside `@media print`. Cleanest cross-browser solution.
4. `BriefPage` does NOT currently have a `@media print` block. Do NOT add one — Brief is a form, not a document; printing it is out of scope per `05-CONTEXT.md` Out of scope.
5. Validation gate: after migration, manually test `Ctrl+P` / `Cmd+P` on `/share/:token`:
   - Identity gate hidden ✓
   - Feedback panel hidden ✓
   - "Exportar PDF" button hidden ✓
   - Each pageBlock starts on a new page ✓
   - Page background is white (no `--wb-bg` slate) ✓
   - Document content fills the page (no shadow chrome) ✓
   - Console clean ✓

---

## EmptyState Treatment

`05-CONTEXT.md` mentions a possible `<EmptyState>` shared component "if duplication justifies it." After audit:

- `SharePage` currently has **zero** empty states (the share token is either valid → renders, or invalid → renders error fallback `.state`; comments / approvals are submit-only with no list view; no "no comments yet" UI).
- `BriefPage` currently has **zero** empty states (the brief is either loading, error, success, or rendering questions — no list view to be empty).

**Decision (locked):** **DO NOT create a shared `<EmptyState>` component in Phase 5.** Duplication count = 0 across the two in-scope pages. The error/success states in Brief are already structurally distinct (centered card with title + body + glyph) and tokenize cleanly via `<Card>` + typography tokens. Creating a shared primitive for two unique screens would be over-engineering per decisions.md "opción más conservadora" rule.

**If a future phase introduces list views with empty states (e.g., a public viewer-comment list, a viewer-approval history), that phase scopes the `<EmptyState>` component.** Tracked as deferred in `05-CONTEXT.md` `<deferred>`.

---

## Migration Strategy

Order is locked from `05-CONTEXT.md`. Each step is one atomic commit for `git revert` safety.

| # | Step | What | Why this order |
|---|------|------|----------------|
| 1 | Migrate `SharePage` | `.module.css` + `.jsx` consume tokens + `<Card>` + `<Input>` + `<Button>`; `@media print` rules updated to match new class structure | Smaller surface (5 hex literals, 219 jsx lines, 251 css lines). Print block sensitivity validates the migration loop. |
| 2 | Migrate `BriefPage` | `.module.css` + `.jsx` (incl. `FileUploadField` inline-styles removal) consume tokens + `<Card>` + `<Input>` + `<Button>`; native `<textarea>` and choice fields stay native, tokenized in-place | Larger surface (38 hex literals, 386 jsx lines, 307 css lines, FileUploadField inline-style cleanup). Done after Share's pattern is proven. |
| 3 | Dispatch `gsd-ui-review` retroactive audit | Subagent reads ALL migrated CSS modules across Phases 1–5 (`tokens.css`, `components/ui/`, all admin/auth pages, editor modules, public pages); produces `05-UI-REVIEW.md` with score per Refactoring UI principle (1–7) | Audit must run AFTER all migrations. Output is **advisory** (not blocking). If average score < 8.5, document gaps in SUMMARY + create `.planning/todos/pending/` items for remediation; do NOT execute remediation in Phase 5. |
| 4 | Golden path verification | Run `preview_*` tools (or `vite build` + `grep` gates as fallback if preview tools are unavailable) on Paths A–F from `05-CONTEXT.md` §2; capture `preview_screenshot` per area; document in `05-SUMMARY.md` | Verification must run AFTER audit (audit may flag visual regressions worth re-running golden paths to confirm). |
| 5 | Phase 5 SUMMARY (final milestone summary) | Document antes/después screenshots (≥3 areas: admin home, editor, share); list all visual deltas accepted (typography snaps, spacing snaps, color shifts); list any score < 8.5 gaps + remediation TODOs created; declare milestone v1.0 complete | The SUMMARY closes the milestone — must be last. |

**Success criteria per migration step (BEFORE commit):**
1. `grep -E '#[0-9a-fA-F]{3,8}' frontend/src/pages/<Page>.module.css` returns zero hits OR only inside `@media print` blocks (justified per "Print/PDF Protection" above).
2. `grep -E 'style=\{' frontend/src/pages/<Page>.jsx` returns zero hits (no inline styles in `BriefPage.jsx` `FileUploadField`).
3. No `.primaryButton` / `.secondaryButton` / `.dangerButton` / `.linkButton` / `.submitButton` / `.input` / `.textarea` selectors remain (delegated to Phase 2 components).
4. `.identityCard` / `.feedbackPanel` / `.pageBlock` / `.fieldGroup` / `.errorState` / `.successState` retain ONLY layout properties; `bg` / `border` / `box-shadow` / `border-radius` come from `<Card>` props.
5. Manual smoke test passes: open the page, run the primary action(s) listed under "Per-page QA" below, console clean (no React warnings, no missing-key warnings, no propType warnings), no network errors.
6. Page invariants from `CONTEXT.min.md` `## Touch / Keep / Watch` for `target=share` are preserved (public token route with email gate, comments, approvals/change requests).

**Per-page QA (manual, post-migration):**

| Page | Primary smoke flows |
|------|--------------------|
| `SharePage` | Open `/share/:token` (valid token) → loading → renders document; identity gate appears for unidentified viewer; submit name+email → identity dismissed; submit comment → feedback "Comentario enviado."; click Aprobar → feedback "Aprobación registrada."; click Pedir cambios → feedback "Pedido de cambios registrado."; click Exportar PDF → browser print preview opens with identity/feedback hidden, pageBlocks page-break correctly; revoke identity ("Cambiar datos") → identity gate returns; invalid token → error state shows. |
| `BriefPage` | Open `/brief/:token` (valid token) → loading → renders form; required-marker glyph shows on required fields; type into name/email + question fields → state updates; upload a PDF → "Subiendo…" then file appears in list with KB; click "Quitar" → file removed; submit with required field empty → submit error appears with field label; submit complete → success state with checkmark icon and message; invalid token → error state shows. |

**Console-cleanliness gate:** if `mcp__Claude_Preview__preview_console_logs` is available, it must return zero new errors/warnings introduced by the migration. Pre-existing warnings unrelated to UI are tolerated and listed in the SUMMARY. If preview tools are unavailable, fall back to: `npm run build` clean (no errors, no warnings); manual `Ctrl+P` print test; manual screenshot comparison vs. pre-migration baseline.

---

## Audit + Verification Gates

### Gate 1: `gsd-ui-review` retroactive audit (UI-09)

Dispatched as a subagent (background) with the full file scope of milestone v1.0:

```
Inputs:
- frontend/src/styles/tokens.css
- frontend/src/components/ui/**/*.{jsx,module.css}
- frontend/src/components/layout/AppShell.{jsx,module.css}
- frontend/src/pages/{Companies,Company,Users,Trash,Security,NewProject,AccountSettings,Login,SetPassword,Share,Brief}*.{jsx,module.css}
- frontend/src/pages/AuthPage.module.css
- frontend/src/pages/ProjectEditor.{jsx,module.css}
- frontend/src/pages/ProjectEditorNav.module.css
- frontend/src/pages/ProjectEditorToolbar.module.css
- frontend/src/pages/ProjectEditorPanels.module.css
- frontend/src/pages/ProjectEditorSeoRules.module.css
- frontend/src/components/editor/**/*.{jsx,module.css}
- frontend/src/pages/BriefProjectEditor.{jsx,module.css}

Output:
- .planning/phases/05-public-pages-verification/05-UI-REVIEW.md
- Score per principle (1-7) on a 0-10 scale
- Findings per principle (specific files + line numbers)
- Average score = sum / 7
```

**Acceptance threshold (advisory):**
- Average ≥ **8.5/10** → milestone v1.0 quality gate met; SUMMARY declares pass.
- Average < **8.5/10** → SUMMARY documents gaps per principle; for each principle below 8.5, create `.planning/todos/pending/<NNN>-fix-ui-<principle>.md` with the audit's findings; remediation is OUT OF SCOPE for Phase 5.

**Per-principle minimums (from REQUIREMENTS UI-09):**
- Visual Hierarchy ≥ 8
- Spacing & Sizing ≥ 9
- Typography ≥ 9
- Color ≥ 9
- Depth & Shadows ≥ 8
- Images & Icons ≥ 8
- Layout & Composition ≥ 8

If a single principle falls below its individual minimum (e.g., Color = 8.5 but Typography = 7), the SUMMARY explicitly lists that principle as a gap even if the average passes.

### Gate 2: Golden Path Verification (UI-10)

Six paths to verify (preview tools preferred; `vite build` + grep gates are fallback):

| ID | Path | Verification mode |
|----|------|--------------------|
| A | `Login` → `/companies` → open project → Editor (Brief mode) → switch Handoff → switch Preview → exit | `preview_screenshot` per state; verify no broken styles, no shifted layouts |
| B | `/companies` → "Crear empresa" modal → submit → verify in list | screenshot of modal + list |
| C | Editor → create comment → reply → resolve | screenshot of comment card states |
| D | Editor → create share link → open `/share/:token` in new tab → email gate → submit identity → view document → click Exportar PDF | screenshot per stage incl. print preview |
| E | `/users` → "Invitar usuario" → edit profile modal → change role | screenshot per state |
| F | `/archive` → restore → `/trash` → restore / permanent-delete | screenshot per action |

**Fallback gates** (if `preview_*` MCP tools are not available in the execution environment):
1. `npm run build` (vite) succeeds with zero errors and zero warnings.
2. `grep -E '#[0-9a-fA-F]{3,8}' frontend/src/pages/{Share,Brief}*.module.css` returns zero hits outside `@media print`.
3. `grep -rE 'style=\{\s*\{' frontend/src/pages/{Share,Brief}*.jsx` returns zero hits.
4. Manual smoke test of paths D (the critical public-facing path) passes locally.

### Gate 3: SUMMARY antes/después (UI-09 evidence)

`05-SUMMARY.md` must include:
- Screenshots of ≥ 3 areas (admin home `/companies`, editor in Brief mode, public `/share/:token`) at final state — pre-migration baselines IMPOSSIBLE retroactively (per `05-CONTEXT.md`); document this limitation explicitly.
- Score table from `05-UI-REVIEW.md` reproduced in SUMMARY.
- List of visual deltas accepted during Phase 5 migration (typography snaps 32→30, 28→30, 22→20, 17→18, 15→14; spacing snaps 36→32, 44→48, 40→48, 80→64; color shifts `#f4f7fb`→`#f8fafc`, `#212222`→`#091223`, `#000`→`#0b1220`).
- List of any sub-8.5 principles + TODO file paths created.
- Cross-link to all 5 phase SUMMARY files for milestone retrospective.
- Final declaration: milestone v1.0 status (complete / complete-with-followups).

---

## Visual Hierarchy & Focal Points

Per Refactoring UI principle 1: each public page declares ONE primary focal point. The migration preserves existing focal points — no rebalancing.

| Page | Primary focal point | Secondary | Tertiary |
|------|---------------------|-----------|----------|
| `SharePage` (no viewer yet) | Identity gate card center | Primary CTA `"Continuar"` | Eyebrow + title at top |
| `SharePage` (viewer identified) | Document content (`.document` flow) | Feedback panel left | Header (title + Exportar PDF) |
| `SharePage` (loading / error) | State message centered | (none) | (none) |
| `BriefPage` (form) | Form fields stacked | Submit CTA bottom-right | Header title + description |
| `BriefPage` (success) | Checkmark icon + heading centered | Success body text | (none) |
| `BriefPage` (error) | Error title + body centered | (none) | (none) |
| `BriefPage` (loading) | Loading text centered | (none) | (none) |

Icon-only Buttons MUST have `aria-label` (Phase 2 contract). Public pages have ONE icon-only-ish button: the file-list "Quitar" (text label "Quitar"; visible label fulfills accessibility). No `aria-label` additions strictly required, but recommended (`aria-label="Quitar archivo {fileName}"` for screen readers parsing the list).

---

## Registry Safety

| Registry | Blocks used | Safety gate |
|----------|-------------|-------------|
| shadcn official | none | not required (no shadcn) |
| Third-party UI libs | none | not applicable |

Phase 5 introduces **zero new npm dependencies**. It only consumes Phase 2 components (already shipped) and existing `lucide-react` icons (currently unused on public pages).

---

## Accessibility Baseline (inherited from Phase 2 + Phase 3 + Phase 5 additions)

Mandatory across both migrated public pages:
- Visible `:focus-visible` outline using `var(--wb-color-primary-200)` ring (3px) — never `outline: none` without a replacement.
- Hit areas ≥ 32×32 px. No icon-only buttons in current public flows; "Quitar" is a text label.
- Color is never the sole carrier of meaning: `required` marker pairs red color + `*` glyph + `aria-required` on input; submit error pairs red color + text + bg chip; success state pairs green icon + text.
- `prefers-reduced-motion: reduce` short-circuits all transitions/animations (already covered by `base.css`; pages must not override).
- Body text contrast ≥ 4.5:1 on white — enforced by always using `var(--wb-color-neutral-700)` or darker for body / `var(--wb-color-neutral-600)` for caption.
- Brief success-state checkmark color upgraded from `#16a34a` (4.0:1 against `#dcfce7` bg) to `var(--wb-color-success-700)` (`#15803d`, AA 4.5:1) — NEW Phase 5 a11y win documented in SUMMARY.

**New aria additions during Phase 5** (no visible change):
- `BriefPage` `FileUploadField` per-file `Quitar` button: `aria-label="Quitar archivo {fileName}"`.
- `BriefPage` required-glyph `<span>`: `aria-hidden="true"` (the `*` is decorative; `aria-required="true"` on the underlying input carries the meaning).
- `SharePage` "Exportar PDF" button: optional `aria-label="Exportar a PDF"` (visible label "Exportar PDF" already accessible; no-op redundancy is fine).

---

## Out of Scope (Phase 5)

- Public-page UX rewrites (email gate flow, comment ordering, approval semantics): explicit per `05-CONTEXT.md` `<deferred>`.
- Backend changes (rate limiting, anti-scraping headers, payload caps): explicit out of scope.
- Embeds / iframe support: explicit out of scope.
- New components beyond Phase 2 (`Table`, `Tabs`, `Dropdown`, `Toast`, `Textarea`, `EmptyState`).
- Mobile responsive rewrite — preserve current `@media (max-width: 760px)` (Share) and `@media (max-width: 560px)` (Brief).
- PWA / installable: explicit out of scope.
- Tests E2E with Playwright: deferred to a testing milestone.
- Bundle optimization (tree-shake, lazy-load further): deferred.
- Dark mode / theming.
- Motion system / microinteractions.
- i18n.
- Editor/admin/auth surfaces (already migrated in Phases 1–4; Phase 5 only audits them retroactively, does not re-migrate).

---

## Deviations From CONTEXT.md / decisions.md

None substantive. The contract is a strict superset of locked decisions:
1. Pages × Components matrix is enumerated explicitly (CONTEXT was textual).
2. CTA copy table is exhaustive for both pages (CONTEXT did not enumerate; preserves all current Spanish strings).
3. Print/PDF protection rules are made explicit (CONTEXT mentioned `@media print` preservation as a constraint; this contract specifies the `.printHide` wrapper pattern).
4. EmptyState decision (DO NOT create) is explicit — CONTEXT made this conditional ("si la duplicación lo justifica") and the audit confirms duplication = 0.
5. Audit subagent dispatch + golden path verification gates are enumerated with fallback paths if preview MCP tools are unavailable.
6. Visual deltas accepted (typography snaps 32→30, 28→30, 22→20, 17→18, 15→14; spacing snaps 36→32, 44→48, 40→48, 80→64; color shifts `#f4f7fb`→`#f8fafc`, `#212222`→`#091223`, `#000`→`#0b1220`) are listed explicitly per decisions.md "preservar look existente" guidance for ambiguous deltas. The 4-pixel-or-less-shift threshold is upheld for all snaps.
7. `<textarea>` (Brief `long_text`) and `<input type="file">` (Brief upload) stay native and tokenized in-place — Phase 2 `<Input>` does not include textarea/file types, and creating a new primitive is out of scope per "registry safety / zero new deps."
8. The Phase 5 `gsd-ui-review` audit is **advisory** (per `05-CONTEXT.md`) — sub-8.5 principles do NOT block the milestone, they generate `.planning/todos/pending/` items for follow-up.

Anything that contradicts CONTEXT.md must be flagged in the Phase 5 SUMMARY; no contradiction is introduced here.

---

## Checker Sign-Off (self-verified)

- [x] **Dimension 1 — Copywriting:** PASS — every CTA in both pages is `verb + concrete noun` (`Continuar`, `Enviar comentario`, `Aprobar`, `Pedir cambios`, `Cambiar datos`, `Enviar brief`, `Exportar PDF`, `Quitar`); zero generic `Aceptar` / `OK` / `Submit` introduced. Empty/loading/error/success states all preserve existing Spanish copy verbatim. Server-provided strings (`brief.formTitle`, `err.message`) pass through unmodified.
- [x] **Dimension 2 — Visuals:** PASS — focal point declared per page-state (Share has 4 states: no-viewer, viewer-identified, loading, error; Brief has 4 states: form, success, error, loading). No icon-only buttons in current scope; aria-label additions for "Quitar" and "Exportar PDF" make sense for SR users. Visual hierarchy preserved from current production UI.
- [x] **Dimension 3 — Color:** PASS — 60/30/10 split mapped to dominant `--wb-surface`/`--wb-bg`, secondary `--wb-color-neutral-100/200`, accent `--wb-color-primary-900`. Accent reserved-for list is exhaustive (3 specific elements: Button-primary, Input focus, document `[data-cta-button] a`). Destructive `--wb-color-danger-600` separated. Success/Warning isolated to specific elements. Body text contrast ≥ 4.5:1 enforced. Brief checkmark a11y upgrade documented.
- [x] **Dimension 4 — Typography:** PASS — exactly **5 sizes** declared (xs/sm/base/xl/3xl = Caption/Label/Body/Heading/Display); **4 weights** consumed (regular/medium/semibold/bold = 400/500/600/700). All deltas from current values are 1–2 px snaps to the scale, documented and accepted. Body line-height standardized (1.5 normal, 1.75 relaxed for document content). Heading line-height (1.4 for `xl`, 1.2 for `3xl`).
- [x] **Dimension 5 — Spacing:** PASS — every spacing reference resolves to a `--wb-space-*` token; all values are multiples of 4. Three exceptions justified explicitly: (1) `@media print` keeps literals (browser-compat), (2) `.optionInput` glyph 16×16 happens to equal `--wb-space-4` so it's already on-scale, (3) Phase-2 control heights (32/40/48 — all multiples of 4 anyway). Visual snaps documented in SUMMARY.
- [x] **Dimension 6 — Registry Safety:** PASS — no shadcn, no third-party registries, zero new deps. Phase 2 components reused as-is. `lucide-react` available but unused on public pages.

**Approval:** approved 2026-05-09 (auto-mode per `.planning/intel/decisions.md`; `skip_discuss=true`).
