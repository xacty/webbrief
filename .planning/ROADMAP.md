# Roadmap: WeBrief — UI System Refactor

## Overview

Refactor sistemático del sistema visual de WeBrief contra el framework Refactoring UI (7 principios). El milestone v1.0 entrega: design tokens completos, librería de componentes compartidos, y migración por área (admin/auth → editor → públicas) con score ≥ 8.5/10 al cierre. Sin cambios funcionales, sin regresiones, sin migración de stack.

## Milestones

- 🚧 **v1.0 UI System Refactor** - Phases 1-5 (in progress)

## Phases

### 🚧 v1.0 UI System Refactor (In Progress)

**Milestone Goal:** Sistema visual unificado con tokens completos, componentes reutilizables y score ≥ 8.5/10 en Refactoring UI sobre todas las áreas (admin, auth, editor, públicas), sin regresiones funcionales.

- [ ] **Phase 1: Design Tokens Foundation** - Extender `tokens.css` con scales completas (spacing, typography, shadows, radius, z-index) y paleta 50-900
- [ ] **Phase 2: Shared UI Components** - Crear `components/ui/` con Button, Input, Select, Modal, Card, Badge
- [ ] **Phase 3: Admin & Auth Migration** - Migrar Companies, Users, Archive, Trash, Security, NewProject, Settings, Login, SetPassword
- [ ] **Phase 4: Editor Unification** - Eliminar paleta paralela del editor; unificar navbar, toolbar, panels, canvas, modales con tokens
- [ ] **Phase 5: Public Pages & Verification** - Migrar Share, Brief; auditar score final; verificar golden paths con preview tools

## Phase Details

### Phase 1: Design Tokens Foundation
**Goal**: Sistema de design tokens completo en `frontend/src/styles/tokens.css` que cubra los 7 principios de Refactoring UI, sin breaking changes a tokens existentes.
**Depends on**: Nothing (first phase)
**Requirements**: UI-01, UI-02
**Success Criteria** (what must be TRUE):
  1. `tokens.css` define spacing scale (4-96px), type scale (12-36px con line-heights), shadow scale (xs-xl), radius scale (xs-full), z-index scale (base-toast)
  2. Paleta neutral/primary/success/danger/warning con 9 shades cada una (50-900)
  3. Body text alcanza ≥4.5:1 contrast en blanco (`gray-700` o más oscuro)
  4. Tokens existentes (`--wb-bg`, `--wb-text`, etc.) preservados como aliases compatibles
  5. Una página piloto (a elegir) compila y renderiza sin errores consumiendo los nuevos tokens

**Plans**: TBD — definidos en plan-phase

**UI hint**: yes

### Phase 2: Shared UI Components
**Goal**: Librería de componentes reutilizables (`components/ui/`) que reemplaza la duplicación actual de modales, botones, inputs, selects entre páginas.
**Depends on**: Phase 1
**Requirements**: UI-03
**Success Criteria** (what must be TRUE):
  1. `frontend/src/components/ui/` exporta Button, Input, Select, Modal, Card, Badge
  2. Cada componente tiene `.module.css` propio que consume exclusivamente tokens (cero hardcoded)
  3. Button cubre variants primary/secondary/ghost/danger × sizes sm/md/lg
  4. Modal centraliza overlay + card + close behavior; z-index único desde token
  5. Componentes documentados con JSDoc o ejemplo de uso en cada archivo

**Plans**: TBD — definidos en plan-phase

**UI hint**: yes

### Phase 3: Admin & Auth Migration
**Goal**: Páginas admin y auth migradas al nuevo sistema, eliminando duplicación de estilos y consumiendo shared components.
**Depends on**: Phase 2
**Requirements**: UI-04, UI-05
**Success Criteria** (what must be TRUE):
  1. CompaniesPage, CompanyPage, UsersPage, TrashPage, SecurityPage, NewProject, AccountSettingsPage usan shared components
  2. Login y SetPassword usan shared components y `AuthPage.module.css` actualizado a tokens
  3. Cero referencias a `.modalOverlay`/`.modalCard` definidas localmente en estas páginas (delegado a `Modal`)
  4. Cero hardcoded colors (`#xxx`) en estos archivos — sólo tokens
  5. Manual QA pasa: invitar usuario, crear empresa, archivar, restaurar, login, reset password — sin regresiones

**Plans**: 5 plans
  - [ ] 03-01-PLAN.md — Cohort 1 (Auth pair): Login + SetPassword + AuthPage.module.css → shared Button/Input/Card/Badge
  - [ ] 03-02-PLAN.md — Cohort 2 (Standalone forms): AccountSettingsPage (extend pilot) + NewProject → shared Button/Input/Select/Modal/Card/Badge
  - [ ] 03-03-PLAN.md — Cohort 3 (Companies stack): CompaniesPage (4 modals) + CompanyPage (3 modals) → shared primitives
  - [ ] 03-04-PLAN.md — Cohort 4 (Complex tables): UsersPage + TrashPage + SecurityPage; UsersPage expandable-row CSS preserved per exception
  - [ ] 03-05-PLAN.md — Cohort 5 (Shell): AppShell tokens; sidebar 248px as `--wb-shell-sidebar-width`; sticky z-index → token; full golden-path QA checkpoint

**UI hint**: yes

### Phase 4: Editor Unification
**Goal**: Editor TipTap unificado con el sistema visual global, eliminando la paleta paralela hardcoded y migrando modales/dropdowns a tokens.
**Depends on**: Phase 3
**Requirements**: UI-06, UI-07
**Success Criteria** (what must be TRUE):
  1. `ProjectEditor.module.css` (1770 líneas) sin `#212222`, `#2a2a2a`, `#d9d9d9` hardcoded
  2. `ProjectEditorNav.module.css`, `ProjectEditorToolbar.module.css`, `ProjectEditorPanels.module.css`, `ProjectEditorSeoRules.module.css` también limpios
  3. Z-index del editor (toolbar, dropdowns, modals, comments cards, tooltips) consume tokens unificados
  4. Modales `shareLinkModal`/`exportModal` usan `Modal` shared
  5. Invariantes del editor preservadas (ver CONTEXT.min.md `## Editor Invariants` y `## Keep Stable`): sections panel sin flicker, document-structure intacto, handoff copy-safe, comments anchoring funcional
  6. QA visual pasa: Brief mode → Handoff (designer/dev audiences) → Preview, comments crear/editar/resolver, mode switching, page switching

**Plans**: TBD — definidos en plan-phase

**UI hint**: yes

### Phase 5: Public Pages & Verification
**Goal**: Páginas públicas migradas + audit final completo + verificación de golden paths sin regresiones.
**Depends on**: Phase 4
**Requirements**: UI-08, UI-09, UI-10
**Success Criteria** (what must be TRUE):
  1. SharePage y BriefPage usan tokens + shared components
  2. Audit retroactivo `gsd-ui-review` produce score promedio ≥ 8.5/10 sobre los 7 principios
  3. Golden paths verificados con preview tools: login → companies → editor → handoff → share link → public viewer
  4. Antes/después documentado en SUMMARY de la phase con screenshots de ≥3 áreas (admin, editor, share)
  5. Cero regresiones funcionales reportadas (manual QA + preview console logs limpios)

**Plans**: TBD — definidos en plan-phase

**UI hint**: yes

## Progress

**Execution Order:** 1 → 2 → 3 → 4 → 5

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Design Tokens Foundation | v1.0 | 0/TBD | Not started | - |
| 2. Shared UI Components | v1.0 | 0/TBD | Not started | - |
| 3. Admin & Auth Migration | v1.0 | 0/TBD | Not started | - |
| 4. Editor Unification | v1.0 | 0/TBD | Not started | - |
| 5. Public Pages & Verification | v1.0 | 0/TBD | Not started | - |
