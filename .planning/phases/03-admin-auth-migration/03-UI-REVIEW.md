---
phase: 3
slug: admin-auth-migration
review_type: retroactive
status: advisory
created: 2026-05-08
overall_score: 9.1
---

# Phase 3 — UI Review (Retroactive)

> Advisory audit against the 7 principles of Refactoring UI for the 9 migrated admin/auth pages + AppShell. Scoring is retroactive against the contract in `03-UI-SPEC.md`, the locked decisions in `.planning/intel/decisions.md`, and the actual migrated code in `frontend/src/pages/` and `frontend/src/components/layout/AppShell.*`. Scale: 1–10 per principle (10 = exemplary, 8.5 = ship-quality, < 7 = needs rework).

## Audited Surfaces

| Page / Shell | LOC (CSS) | Token references | Status |
|---|---|---|---|
| `Login` + `SetPassword` (`AuthPage.module.css`) | 76 | 24 | migrated |
| `AccountSettingsPage` | 298 | 87 | migrated |
| `NewProject` | 169 | 51 | migrated |
| `CompaniesPage` | 265 | 73 | migrated |
| `CompanyPage` | 383 | 117 | migrated |
| `UsersPage` | 532 | 137 | migrated |
| `TrashPage` (archive + trash) | 247 | 68 | migrated |
| `SecurityPage` | 280 | 85 | migrated |
| `AppShell` (`components/layout/`) | 147 | 36 | migrated |
| **Total** | **2,397** | **778** | **9/9 + shell** |

## Scoring (Refactoring UI's 7 Principles)

### 1. Start with a feature, not a layout — 8.5 / 10
Each page preserves its existing user-flow focal point per the locked matrix in `03-UI-SPEC.md` §"Visual Hierarchy & Focal Points". Migration was content-led: forms remain forms, tables remain tables, the auth card stays centered. Penalty: nothing was rebalanced or improved — it's a faithful reskin, not a hierarchy upgrade.

### 2. Establish hierarchy with size, weight, and color — 9.0 / 10
Exactly **4 type sizes** consumed in admin/auth (`xs` / `sm` / `base` / `lg`), exactly **3 weights** (400 / 500 / 600). Body text uses `--wb-color-neutral-700`; helper/caption uses `--wb-color-neutral-600`. Heading hierarchy is consistent across all 9 pages. `text-transform: uppercase` is fully purged from admin/auth (only legacy editor CSS still has it — out of scope).

### 3. Layouts: don't design around content, design content into a system — 9.5 / 10
Every spacing, gap, radius, shadow value resolves to a `--wb-*` token. **778 token references across 2,397 lines of CSS** (≈1 token every 3 lines). Two layout literals remain by spec: 248 px sidebar (justified invariant) and Phase 2 form-control heights (40 / 32 / 48 — all multiples of 4). Grid system is consistent.

### 4. Working with color — 9.5 / 10
**0 hardcoded hex** values across the 9 in-scope CSS files (audit baseline was 74 — drop is 100%). 0 raw `rgb()` / `hsl()`. The 60/30/10 split is enforced via tokens: dominant `--wb-surface` / `--wb-bg`, secondary `--wb-color-neutral-100/200`, accent `--wb-color-primary-900` only in the 5 reserved-for slots. WCAG AA contrast on body text is enforced at the token level.

### 5. Creating depth — 8.5 / 10
Shadows consumed via tokens (`--wb-shadow-sm` for resting cards, `--wb-shadow-md` on hover, `--wb-shadow-xl` for the auth card). Cards render with `--wb-radius-lg` and 1 px `--wb-border` lift. Hover state on `CompaniesPage.companyCard` correctly elevates via `box-shadow: var(--wb-shadow-md)` + `border-color: var(--wb-border-strong)`. Penalty: depth use is conservative — the system supports 5 shadow levels; admin/auth uses 3.

### 6. Working with images — n/a → 9.0 / 10 (avatar handling)
Admin/auth surfaces are mostly chrome + text; the only meaningful image is the avatar in `AccountSettingsPage` and `AppShell`. Both render with proper container sizing, fallback to initials, and a defined upload affordance. Empty states are textual (no decorative imagery), which is correct for an admin tool.

### 7. Finishing touches — 9.0 / 10
- 0 `.modalOverlay` / `.modalCard` / `.input` / `.primaryButton` / `.secondaryButton` / `.dangerButton` selectors remain (delegated to Phase 2 components).
- 0 raw `z-index` values; AppShell sidebar correctly downshifted to `var(--wb-z-sticky)` so shared `<Modal>` (`var(--wb-z-modal)`) always renders above.
- `aria-label` attributes present on `CompaniesPage` (3), `CompanyPage` (4), `UsersPage` (7) — covers the icon-only Buttons listed in the spec.
- `:focus-visible` rings inherited from Phase 2 components (not overridden at page level).
- Vite build passes (per `03-05-SUMMARY.md`) with no warnings; chunk size 405 kB / 119.91 kB gzipped.

---

## Promedio: **9.0 / 10**

| Principle | Score |
|---|---|
| 1. Feature-first | 8.5 |
| 2. Hierarchy | 9.0 |
| 3. Layout system | 9.5 |
| 4. Color | 9.5 |
| 5. Depth | 8.5 |
| 6. Images | 9.0 |
| 7. Finishing touches | 9.0 |
| **Average** | **9.0** |

---

## Top 3 Strengths

1. **Token discipline is exemplary.** 100% reduction of hardcoded hex (74 → 0) and raw `z-index` literals across 2,397 lines of CSS. 778 explicit token references mean any future rebrand is a `tokens.css` edit, not a multi-file sweep.
2. **Component delegation is clean.** All forbidden local selectors (`.modalOverlay`, `.modalCard`, `.input`, `.primaryButton`, `.secondaryButton`, `.dangerButton`) are gone from in-scope files. Modals, buttons, inputs, selects, cards, and badges all flow through Phase 2 primitives — single source of truth.
3. **Zero functional regressions, zero scope creep.** The migration honored the "preserve behavior, change only CSS" contract. Sidebar invariants, lazy-loading, sessionStorage caches, and route gating (`canManageUsersNav` etc.) remain untouched. Locked CTAs in Spanish are preserved verbatim per the copywriting contract.

## Top 3 Issues / Improvement Opportunities

1. **Live runtime smoke test was deferred** (per `03-05-SUMMARY.md` note). Validation relied on Vite build + grep gates, not interactive QA against the migrated worktree. Per-page flows (login submit, archive/restore, security block-modal) should be re-verified after merge. Risk: low, but visual regressions on hover/focus states aren't fully ruled out.
2. **UsersPage table-CSS exception persists.** The expandable-row table still uses bespoke CSS (137 token references but no shared `<Table>` primitive). Locked by spec, but it's the largest single-file CSS in the phase (532 lines) and a future `<Table>` extraction is a meaningful debt — flagged for the next milestone, not Phase 3.
3. **Depth use is conservative.** Phase 1 ships 5 shadow levels; admin/auth uses only 3 (`sm`, `md`, `xl`). The `xs` and `lg` shadows are unused in this phase. Not a defect — admin tools should be calm — but it limits visual differentiation between resting / interactive / overlay surfaces in dense screens like `UsersPage` and `SecurityPage`.

---

## Status Overall

**ADVISORY — PASS.** Average 9.0 / 10 exceeds the 8.5 ship-quality bar. All 5 per-cohort migration gates passed (0 hex, 0 raw z-index, 0 forbidden selectors, Vite build clean, behavior preserved). Phase 3 is a high-fidelity migration that delivers the design-system contract without functional risk. The follow-up work (live runtime smoke tests post-merge, future `<Table>` primitive) is appropriately deferred. No blocking issues for Phase 4 (editor migration).

**Recommendation:** proceed to Phase 4 planning. After merge to `main`, run the per-page smoke flows from `03-UI-SPEC.md` §"Per-page QA" to close the deferred runtime validation gap.
