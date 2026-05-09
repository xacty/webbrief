# WeBrief

## What This Is

WeBrief es una plataforma web para gestionar briefs de proyectos creativos: editor TipTap con secciones, comentarios anclados estilo Google Docs, modos de handoff/preview/share, y flujos de aprobación. Usado por agencias y equipos creativos para organizar entregables digitales (Página Web, Artículo, FAQs) con clientes y desarrolladores.

## Core Value

Que cliente, manager, editor, designer y dev colaboren sobre el mismo brief sin ambigüedad: el contenido editable y los entregables están en un solo lugar, con auditoría granular de cambios.

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

### Active

<!-- Scope actual: refactor del sistema visual -->

- [ ] **UI-01**: Sistema de design tokens completo (spacing, typography, shadows, radius, z-index)
- [ ] **UI-02**: Paleta de color extendida con shades 50-900 para neutrales/primary/success/danger/warning
- [ ] **UI-03**: Componentes compartidos (Button, Input, Select, Modal, Card, Badge) en `frontend/src/components/ui/`
- [ ] **UI-04**: Admin pages usan tokens + shared components, sin duplicación
- [ ] **UI-05**: Auth pages (Login, SetPassword) usan tokens + shared components
- [ ] **UI-06**: Editor unificado con tokens globales — eliminada paleta hardcoded paralela
- [ ] **UI-07**: Z-index unificado mediante tokens — sin valores arbitrarios
- [ ] **UI-08**: Public pages (Share, Brief) usan tokens + shared components
- [ ] **UI-09**: Score Refactoring UI ≥ 8.5/10 sobre los 7 principios al cierre del milestone
- [ ] **UI-10**: Sin regresiones visuales en golden paths (login → companies → editor → share)

### Out of Scope

- **Rediseño funcional** — este milestone es solo sistema visual; cambios de UX/flow se aplazan
- **Migración a Tailwind** — el stack se queda en CSS Modules + variables CSS; menos disrupción
- **Dark mode** — referenciado en `theming-dark-mode.md` pero diferido a milestone posterior
- **Animaciones/microinteracciones** — referenciado en `animation-microinteractions.md` pero diferido
- **Responsive móvil completo** — el refactor preserva el comportamiento responsive actual; rediseño móvil es trabajo aparte

## Context

**Stack actual**:
- Frontend: React + Vite, **CSS Modules** + variables CSS globales (no Tailwind)
- Backend: Express + Supabase (Postgres/Auth)
- Editor: TipTap con extensions custom (CommentMark, sections, tables, etc.)
- Producción: VPS Namecheap (`webrief.app`), Nginx + PM2 + Certbot

**Estado del sistema visual actual** (audit Refactoring UI promedio 5.1/10):
- Tokens parciales: `frontend/src/styles/tokens.css` (20 líneas, sólo color base + 2 shadows + 3 radius)
- Sin tokens de spacing, typography, z-index
- 7,500 líneas de CSS en 20 `.module.css`; el editor solo aporta 1,770 líneas en `ProjectEditor.module.css`
- Editor usa paleta hardcoded `#212222 / #2a2a2a / #d9d9d9` desconectada del sistema global
- Modales duplicados con z-index inconsistente entre `CompaniesPage` y `ProjectEditor`
- Z-index ad-hoc: 20 / 50 / 80 / 120 / 200 / 300 / 500 / 1000 / 1200 / 1400 / 3000 / 9999

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
| Refactor en branch `refactor/ui-system` aislada (worktree) | Permite trabajo en paralelo sin tocar dev server del usuario; merge controlado | — Pending |
| Bootstrap GSD mínimo (sin ingest completo) | 12 docs narrativos del repo arrastrarían fases pasadas (security, db, mcp); enfoque solo en refactor UI | — Pending |
| Mantener CSS Modules en lugar de migrar a Tailwind | Minimiza disrupción; 7,500 líneas de CSS no se reescriben en un milestone | — Pending |
| Aplicar framework Refactoring UI (Adam Wathan/Steve Schoger) como guía | Sistema opinionated y comprobado; 7 principios concretos vs juicio subjetivo | — Pending |

---
*Last updated: 2026-05-08 after bootstrap GSD para milestone v1.0 UI Refactor*
