# Milestones — WeBrief

Tracking de milestones del proyecto WeBrief en el contexto de planning con GSD. Los milestones anteriores al bootstrap (auth, editor, security, etc.) ya están en producción y documentados en `CONTEXT.md` / `CONTEXT.min.md`; no se backfillean aquí.

## Active

(None — v1.0 archived; next milestone pending definition via `/gsd-new-milestone`.)

## Completed

### ✅ v1.0 — UI System Refactor

- **Started:** 2026-05-08
- **Shipped:** 2026-05-09
- **Goal:** Sistema visual unificado contra el framework Refactoring UI (score promedio ≥ 8.5/10)
- **Phases:** 5 (Phases 1-5)
- **Plans:** 27 (3 + 5 + 5 + 9 + 5)
- **Commits:** ~75 atomic commits on `refactor/ui-system`
- **Branch:** `refactor/ui-system` (worktree) — pendiente merge a `main`
- **Audit status:** `tech_debt` (advisory only)
- **Score:** 8.5/10 average on 7 Refactoring UI principles (meets threshold)

**Key accomplishments:**

1. Design tokens completos (`tokens.css`): color palette 50-900 (neutral/primary/success/danger/warning) + spacing/typography/shadow/radius/z-index scales — 29 tokens validated via getComputedStyle, legacy preserved byte-for-byte.
2. Shared UI library (`frontend/src/components/ui/`): 6 primitives (Button, Input, Select, Modal, Card, Badge) + `cn()` helper, public barrel export, build smoke green.
3. Admin & auth migration: 7 admin pages + Login + SetPassword + AppShell — 0 hex literals, 0 numeric z-index, golden-path QA pass.
4. Editor unification: 5 named hex literals (`#212222`, `#2a2a2a`, `#d9d9d9`, `#1d4ed8`, `#2563eb`) eliminated; 14 editor sub-tokens added; zero numeric z-index across 9 editor CSS modules; 16 editor invariants preserved; exportModal swapped to shared `<Modal>`.
5. Public pages migration: SharePage + BriefPage migrated to tokens + shared primitives; 43 hex → 0 outside `@media print`; A11y upgrade for success-icon contrast (4.0:1 → 4.5:1 AA).
6. Verification: retroactive UI audit (8.5/10 average), 6/6 golden paths PASS via build + grep + code-read fallback, per-cohort grep gates clean, build exit 0.

**Known deferred items at close:** 3 advisory TODOs (sub-threshold UI-09 principles in editor CSS) tracked in `.planning/todos/pending/001-003`; scheduled for v1.1 polish milestone. Plus 2 minor `#ffffff` cleanups in Button.module.css under TODO 003.

**Archives:**
- Roadmap: `.planning/milestones/v1.0-ROADMAP.md`
- Requirements: `.planning/milestones/v1.0-REQUIREMENTS.md`
- Audit: `.planning/milestones/v1.0-MILESTONE-AUDIT.md`
- Closing summary: `.planning/phases/05-public-pages-verification/05-SUMMARY.md`

*(Pre-GSD milestones; ver `CONTEXT.md` para historia funcional)*
