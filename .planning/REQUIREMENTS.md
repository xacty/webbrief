# Requirements: WeBrief — UI System Refactor

**Defined:** 2026-05-08
**Core Value:** Que cliente, manager, editor, designer y dev colaboren sobre el mismo brief sin ambigüedad

## v1.0 Requirements (Milestone: UI System Refactor)

Los requirements de funcionalidad ya están validados en producción. Este milestone es **exclusivamente sistema visual**, evaluado contra el framework Refactoring UI (7 principios) con score promedio ≥ 8.5/10.

### Foundation

- [ ] **UI-01**: `frontend/src/styles/tokens.css` extendido con scales completas
  - Spacing: 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64 / 96 px
  - Typography: font-size scale (12 → 36) con line-height pareada (tight 1.1 / normal 1.5 / relaxed 1.75)
  - Shadows: xs / sm / md / lg / xl (5 niveles vs 2 actuales)
  - Radius: xs / sm / md / lg / xl / full (pill)
  - Z-index: base / dropdown / sticky / overlay / modal / popover / tooltip / toast
  - Sin breaking changes a tokens existentes (`--wb-bg`, `--wb-text`, etc. preservados)

- [ ] **UI-02**: Paleta de color con shades 50-900
  - Neutrales (`--wb-gray-50` … `--wb-gray-900`) con saturación cool (tinte azulado)
  - Primary, success, danger, warning con shades 50-900
  - Body text mínimo 4.5:1 contrast ratio (WCAG AA)
  - Validado con WebAIM contrast checker

### Components

- [ ] **UI-03**: Componentes compartidos en `frontend/src/components/ui/`
  - `Button` (variants: primary / secondary / ghost / danger; sizes: sm / md / lg)
  - `Input` (text/email/password con label, error, icon)
  - `Select` (con chevron normalizado del base.css existente)
  - `Modal` (overlay + card unificados; z-index del token)
  - `Card` (container con padding/radius/shadow del sistema)
  - `Badge` (status pills: neutral / success / warning / danger)
  - Cada componente con `.module.css` propio que consume tokens
  - Exportados desde `components/ui/index.js`

### Migración por área

- [ ] **UI-04**: Admin pages migradas a tokens + shared components
  - `CompaniesPage`, `CompanyPage`, `UsersPage`, `TrashPage` (archive y trash modes), `SecurityPage`, `NewProject`, `AccountSettingsPage`
  - Eliminada duplicación de `.modalOverlay`, `.modalCard`, `.input`, `.select` entre archivos
  - Sin regresión funcional (lista visible al hacer QA en cada página)

- [ ] **UI-05**: Auth pages migradas
  - `Login`, `SetPassword` consumen `AuthPage.module.css` ya compartido + reemplazan estilos locales por shared components
  - Reset password flow visualmente coherente con login

- [ ] **UI-06**: Editor unificado
  - `ProjectEditor.module.css`, `ProjectEditorNav.module.css`, `ProjectEditorToolbar.module.css`, `ProjectEditorPanels.module.css`, `ProjectEditorSeoRules.module.css` eliminan hardcoded `#212222`, `#2a2a2a`, `#d9d9d9`, `#1d4ed8`, `#2563eb`
  - Modales del editor (shareLink, export) usan el `Modal` shared
  - Floating tooltip preserva look (Google Docs–style) pero con tokens
  - Invariantes del editor preservados (ver CONTEXT.min.md `## Editor Invariants`)

- [ ] **UI-07**: Z-index unificado
  - Todos los modales usan `var(--wb-z-modal)`
  - Dropdowns, popovers, tooltips, comments cards mapeados a sus tokens respectivos
  - Eliminados los valores arbitrarios 9999 / 3000 / etc.

- [ ] **UI-08**: Public pages migradas
  - `SharePage` y `BriefPage` consumen tokens + shared components
  - Empty states con tratamiento sistemático (illustration o emoji + CTA)

### Verification & Quality Gate

- [ ] **UI-09**: Score Refactoring UI ≥ 8.5/10 promedio sobre 7 principios
  - Visual Hierarchy ≥ 8
  - Spacing & Sizing ≥ 9
  - Typography ≥ 9
  - Color ≥ 9
  - Depth & Shadows ≥ 8
  - Images & Icons ≥ 8 (mantener nivel)
  - Layout & Composition ≥ 8

- [ ] **UI-10**: Sin regresiones visuales en golden paths
  - Login → Companies → Open project → Editor (Brief mode) → Switch a Handoff → Switch a Preview → Share link
  - Verificado con `preview_*` tools (snapshot + screenshot por flow)
  - Comparativa antes/después documentada en SUMMARY.md de Phase 5

## v2 Requirements

Diferidos a milestones posteriores. Tracked, no en roadmap actual.

### Theming

- **THEME-01**: Dark mode con paleta y elevación adaptada (referenciado en `theming-dark-mode.md`)
- **THEME-02**: Theme switcher persistente en localStorage

### Motion

- **MOTION-01**: Sistema de easings y durations consistente (referenciado en `animation-microinteractions.md`)
- **MOTION-02**: Loading states con spinners/skeletons del sistema
- **MOTION-03**: Microinteractions (hover lift, button press, modal enter)

### Accessibility (más allá de contrast)

- **A11Y-01**: Focus rings consistentes con tokens
- **A11Y-02**: Keyboard navigation auditada con `accessibility-depth.md`
- **A11Y-03**: Screen reader labels en todos los icon-only buttons

### Data Visualization

- **DATAVIZ-01**: Tablas (admin Users, Security) con design system tokens
- **DATAVIZ-02**: Charts (si se añaden en analytics) con paleta sistemática

## Out of Scope

| Feature | Reason |
|---------|--------|
| Migración a Tailwind | Disrupción enorme; CSS Modules cumple bien |
| Migración a CSS-in-JS (styled-components, emotion) | Mismo motivo que Tailwind; añadiría runtime cost |
| Rediseño del editor TipTap (UX/flows) | Este milestone es visual, no funcional |
| Mobile responsive rediseño | Preservar comportamiento actual; rediseño móvil es milestone aparte |
| Internacionalización (i18n) | UI strings siguen en español; i18n fuera de alcance |
| Refactor del backend | Sólo frontend |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| UI-01 | Phase 1 | Pending |
| UI-02 | Phase 1 | Pending |
| UI-03 | Phase 2 | Pending |
| UI-04 | Phase 3 | Pending |
| UI-05 | Phase 3 | Pending |
| UI-06 | Phase 4 | Pending |
| UI-07 | Phase 4 | Pending |
| UI-08 | Phase 5 | Pending |
| UI-09 | Phase 5 | Pending |
| UI-10 | Phase 5 | Pending |

**Coverage:**
- v1 requirements: 10 total
- Mapped to phases: 10
- Unmapped: 0 ✓

---
*Requirements defined: 2026-05-08*
*Last updated: 2026-05-08 after bootstrap GSD*
