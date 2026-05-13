# WeBrief

## What This Is

WeBrief es una plataforma web para gestionar briefs de proyectos creativos: editor TipTap con secciones, comentarios anclados estilo Google Docs, modos de handoff/preview/share, y flujos de aprobación. Usado por agencias y equipos creativos para organizar entregables digitales (Página Web, Artículo, FAQs) con clientes y desarrolladores.

## Core Value

Que cliente, manager, editor, designer y dev colaboren sobre el mismo brief sin ambigüedad: el contenido editable y los entregables están en un solo lugar, con auditoría granular de cambios.

## Current State

**Shipped milestone:** v1.0 UI System Refactor (2026-05-09)

Sistema visual unificado contra el framework Refactoring UI: design tokens completos (spacing/typography/shadows/radius/z-index + paleta 50-900), 6 shared components en `frontend/src/components/ui/`, migración por área (admin/auth → editor → públicas) con score promedio 8.5/10. CSS Modules + variables CSS preservados (no Tailwind, no CSS-in-JS). 27 plans, ~75 commits, 1,643 referencias `var(--wb-*)` milestone-wide.

**Deferred tech debt for v1.1:** 3 editor CSS sub-thresholds (Spacing 7.5, Typography 7.5, Color 7.8 vs UI-09 minimum 9.0) tracked en `.planning/todos/pending/001-003`.

## Requirements

### Validated

<!-- Shipped y en producción en webrief.app -->

- ✓ Auth con Supabase + invitaciones por email — Producción
- ✓ Editor TipTap con sections panel + canvas + updates panel — Producción
- ✓ Modos Brief / Handoff / Preview con copy-safe gutters — Producción
- ✓ Project types Página Web / Artículo / FAQs con plantillas por tipo — Producción
- ✓ Comments anclados Google Docs–style con @menciones, replies, resolve — Producción
- ✓ Public share con email gate, comments, approvals, change requests — Producción
- ✓ Activity panel con eventos granulares (title_changed, text_changed, etc.) — Producción
- ✓ Admin shell sidebar con Empresas/Usuarios/Seguridad/Archivados/Papelera — Producción
- ✓ Backend security baseline (rate limits, audit, IP/user blocks, CORS, headers) — Producción
- ✓ Image pipeline ImageKit con WebP conversion — Producción
- ✓ **UI-01**: Sistema de design tokens completo (spacing, typography, shadows, radius, z-index) — v1.0
- ✓ **UI-02**: Paleta de color extendida con shades 50-900 (neutrales/primary/success/danger/warning) WCAG AA — v1.0
- ✓ **UI-03**: Componentes compartidos (Button, Input, Select, Modal, Card, Badge) en `frontend/src/components/ui/` — v1.0
- ✓ **UI-04**: Admin pages migradas a tokens + shared components, sin duplicación — v1.0
- ✓ **UI-05**: Auth pages (Login, SetPassword) migradas a tokens + shared components — v1.0
- ✓ **UI-06**: Editor unificado con tokens globales — paleta hardcoded paralela eliminada — v1.0
- ✓ **UI-07**: Z-index unificado mediante tokens — sin valores arbitrarios — v1.0
- ✓ **UI-08**: Public pages (Share, Brief) migradas a tokens + shared components — v1.0
- ✓ **UI-09**: Score Refactoring UI 8.5/10 promedio sobre los 7 principios — v1.0 (advisory: 3 sub-thresholds editor CSS deferidos a v1.1)
- ✓ **UI-10**: Sin regresiones visuales en golden paths (Paths A-F PASS) — v1.0

### Active

<!-- Scope para v1.1 — to be defined via /gsd-new-milestone -->

(None yet — milestone v1.0 archived; next milestone pending definition.)

Candidate carry-forward items from v1.0 tech debt:

- [ ] **UI-09b** (v1.1 candidate): Editor CSS Spacing 9.0 — sweep 9 editor `.module.css` files (~288 raw padding|margin|gap px) → `--wb-space-*` tokens
- [ ] **UI-09c** (v1.1 candidate): Editor CSS Typography 9.0 — sweep ~149 raw `font-size` px en 7 editor CSS → `--wb-text-*` tokens
- [ ] **UI-09d** (v1.1 candidate): Editor CSS Color 9.0 — sweep 96 hex literals + add `--wb-editor-selection-soft` sub-token + `--wb-color-warning-50`

### Next Milestone Goals

To be defined via `/gsd-new-milestone`. Likely candidates:

- v1.1 polish (cleanup of advisory tech debt: editor CSS spacing/typography/color)
- New feature work (user-driven priorities)

### Out of Scope

- **Rediseño funcional** — milestones de UI son sistema visual; cambios de UX/flow se aplazan
- **Migración a Tailwind** — el stack se queda en CSS Modules + variables CSS; menos disrupción
- **Dark mode** — referenciado en `theming-dark-mode.md` pero diferido a milestone posterior
- **Animaciones/microinteracciones** — referenciado en `animation-microinteractions.md` pero diferido
- **Responsive móvil completo** — el refactor v1.0 preservó comportamiento responsive actual; rediseño móvil es trabajo aparte

## Context

**Stack actual**:
- Frontend: React + Vite, **CSS Modules** + variables CSS globales (no Tailwind)
- Backend: Express + Supabase (Postgres/Auth)
- Editor: TipTap con extensions custom (CommentMark, sections, tables, etc.)
- Producción: VPS Namecheap (`webrief.app`), Nginx + PM2 + Certbot

**Estado del sistema visual post-v1.0**:
- `frontend/src/styles/tokens.css` extendido (color palette 50-900 + spacing/typography/shadow/radius/z-index scales)
- `frontend/src/components/ui/` con 6 primitives (Button, Input, Select, Modal, Card, Badge) + cn() helper
- 26 `.module.css` files audited; 1,643 referencias `var(--wb-*)` milestone-wide
- Editor sub-tokens (`--wb-editor-*`, `--wb-tooltip-*`, `--wb-comment-*`, `--wb-section-*`) eliminan paleta paralela
- Z-index ad-hoc reemplazado con tokens scale (base/dropdown/sticky/overlay/modal/popover/tooltip/toast)
- Refactor branch: `refactor/ui-system` (worktree); pendiente merge a `main` por decisión del usuario

**Documentos de referencia** (no se procesan por ingest, pero los agentes pueden leerlos):
- `CONTEXT.md` — autoritative project context
- `CONTEXT.min.md` — fast-path context
- `AI_GLOBAL.md` — cross-AI workflow contract
- `AGENTS.md` / `CLAUDE.md` — bridge files

## Constraints

- **Tech stack**: CSS Modules + variables CSS globales — no migración a Tailwind ni CSS-in-JS
- **Estabilidad**: producción está activa en `webrief.app`; cero regresiones funcionales aceptables
- **Stable behavior bias** (de AI_GLOBAL.md): preservar invariantes del editor, sections panel, document structure, login flow
- **Working directory rule** (de AI_GLOBAL.md): cambios deben aplicarse al repo principal eventualmente; este worktree es temporal hasta merge
- **Deploy**: nunca deploy a VPS sin pedido explícito del usuario (memoria persistente)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Refactor en branch `refactor/ui-system` aislada (worktree) | Permite trabajo en paralelo sin tocar dev server del usuario; merge controlado | ✓ Good — 27 plans / 75 commits sin afectar dev server; pendiente merge |
| Bootstrap GSD mínimo (sin ingest completo) | 12 docs narrativos del repo arrastrarían fases pasadas (security, db, mcp); enfoque solo en refactor UI | ✓ Good — milestone shipped focused, sin scope creep |
| Mantener CSS Modules en lugar de migrar a Tailwind | Minimiza disrupción; 7,500 líneas de CSS no se reescriben en un milestone | ✓ Good — refactor entregado sin migrar stack |
| Aplicar framework Refactoring UI (Adam Wathan/Steve Schoger) como guía | Sistema opinionated y comprobado; 7 principios concretos vs juicio subjetivo | ✓ Good — score 8.5/10 promedio meets bar |
| Editor sub-tokens (`--wb-editor-*`, `--wb-tooltip-*`, `--wb-comment-*`, `--wb-section-*`) | Preservar la paleta dark del editor sin paleta paralela; consume tokens base de Phase 1 | ✓ Good — 5 named hex literals eliminated; 16 invariants preserved |
| Native controls preserved (textarea/file/radio/checkbox) | Phase 2 sin primitive equivalente; tokenizar in-place via CSS modules | ✓ Good — sin regresión funcional + tokens consumidos |
| Advisory verdict para UI-09 sub-thresholds | Spacing/Typography/Color editor gaps clusterizan en Phase 4; tracked como TODOs v1.1 vs blocking gate | ⚠️ Revisit — milestone shipped con tech debt explícito; v1.1 polish necesario |

---
*Last updated: 2026-05-09 after v1.0 milestone close*
