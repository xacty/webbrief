---
phase: 01-design-tokens-foundation
plan: 01
status: complete
files_modified:
  - frontend/src/styles/tokens.css
commits:
  - "feat(tokens): add 45 color tokens (neutral/primary/success/danger/warning shades 50-900)"
  - "feat(tokens): re-express 12 legacy color tokens as aliases of new palette"
---

# Plan 01-01 — Color Palette 50-900 Foundation

## What was built

Extended `frontend/src/styles/tokens.css` with the full color foundation per `.planning/intel/decisions.md` (Color section).

### Tokens added (45 new)

| Family   | Shades | Token shape                  |
|----------|--------|------------------------------|
| neutral  | 50-900 | `--wb-color-neutral-{shade}` |
| primary  | 50-900 | `--wb-color-primary-{shade}` |
| success  | 50-900 | `--wb-color-success-{shade}` |
| danger   | 50-900 | `--wb-color-danger-{shade}`  |
| warning  | 50-900 | `--wb-color-warning-{shade}` |

Each family has 9 shades (50/100/200/300/400/500/600/700/800/900) → **45 new color tokens** total.

### Legacy tokens re-expressed as aliases (12)

| Token             | Resolves to                  | Original literal |
|-------------------|------------------------------|------------------|
| `--wb-bg`         | `var(--wb-color-neutral-50)` | `#f8fafc`        |
| `--wb-surface`    | `#ffffff` (literal kept)     | `#ffffff`        |
| `--wb-surface-muted` | `var(--wb-color-neutral-100)` | `#f1f5f9`   |
| `--wb-border`     | `#dbe3f0` (literal kept)     | `#dbe3f0`        |
| `--wb-border-strong` | `#c7d2e5` (literal kept)  | `#c7d2e5`        |
| `--wb-text`       | `var(--wb-color-primary-900)` | `#091223`       |
| `--wb-text-muted` | `var(--wb-color-neutral-500)` | `#64748b`       |
| `--wb-primary`    | `var(--wb-color-primary-900)` | `#091223`       |
| `--wb-primary-hover` | `var(--wb-color-primary-500)` | `#1e293b`    |
| `--wb-primary-soft`  | `var(--wb-color-neutral-200)` | `#e2e8f0`    |
| `--wb-success`    | `#0f766e` (literal kept — teal accent preserved) | `#0f766e` |
| `--wb-danger`     | `var(--wb-color-danger-600)` | `#dc2626`        |

**Invariant satisfied**: every pre-existing legacy color token still resolves byte-for-byte to its original computed hex value.

## Contrast confirmation (gray ramp on white)

Inline comments in `tokens.css` document WCAG AA compliance:

- `--wb-color-neutral-500` = `#64748b` → 4.6:1 (AA *large only*)
- `--wb-color-neutral-600` = `#475569` → 6.9:1 (AA body-safe)
- `--wb-color-neutral-700` = `#334155` → 9.4:1 (AA body-safe, recommended for body text per decisions.md)

`--wb-color-success-700` (`#15803d`) flagged inline as "AA on white: 4.5:1 — text safe".

## Deviations from decisions.md

None. All 45 hex values match the slate-family / amber / red / green ramps prescribed in the plan and decisions doc.

The 4 legacy tokens that kept literal values (`--wb-surface`, `--wb-border`, `--wb-border-strong`, `--wb-success`) did so because no canonical palette shade matches their literal exactly:
- `#ffffff` is shared white, not in any ramp.
- `#dbe3f0` and `#c7d2e5` sit between neutral-200 (`#e2e8f0`) and neutral-300 (`#cbd5e1`).
- `#0f766e` is teal, not green-700; preserving it intentionally (per plan: "Phase 1 preserves teal accent").

## Verification

Both automated verifies passed:
- `OK 45 color tokens present`
- `OK 12 legacy color tokens preserve computed values`

## Out of scope (deferred to Plan 01-02)

Spacing, typography, shadow, radius, z-index scales — all added in Plan 01-02 to the same file.
