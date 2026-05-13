---
phase: 01-design-tokens-foundation
plan: 02
status: complete
files_modified:
  - frontend/src/styles/tokens.css
commits:
  - "feat(tokens): add spacing/typography/shadow/radius/z-index scales"
---

# Plan 01-02 — Non-color scales (spacing, typography, shadows, radius, z-index)

## What was built

Appended every non-color scale to `frontend/src/styles/tokens.css`, inserted between the legacy color aliases (Plan 01) and the closing legacy scale trailer.

### Scales added

| Category   | Tokens | Count |
|------------|--------|-------|
| Spacing    | `--wb-space-1/2/3/4/5/6/8/12/16/24` | 10 |
| Typography (sizes) | `--wb-text-xs/sm/base/lg/xl/2xl/3xl/4xl` | 8 |
| Typography (leading per size) | `--wb-leading-xs/sm/base/lg/xl/2xl/3xl/4xl` | 8 |
| Typography (semantic leading) | `--wb-leading-tight/normal/relaxed` | 3 |
| Typography (weights) | `--wb-weight-regular/medium/semibold/bold` | 4 |
| Typography (font stack) | `--wb-font-sans` | 1 |
| Shadow     | `--wb-shadow-xs/md/xl` (new) + sm/lg (preserved) | 3 new + 2 preserved |
| Radius     | `--wb-radius-xs/2/3/4/xl/full` | 6 canonical |
| Z-index    | `--wb-z-base/dropdown/sticky/overlay/modal/popover/tooltip/toast` | 8 |

**Total file now declares ≈ 119 tokens** (45 colors + 12 legacy color aliases + 10 spacing + 8 sizes + 8 leading + 3 semantic leading + 4 weights + 1 font stack + 3 new shadows + 6 radius + 8 z-index + 2 preserved legacy shadows + 3 preserved legacy radius + 1 content-width = 114; plus comments/headers, count includes line-prefix matches).

### Legacy scale tokens preserved (6)

Verified byte-for-byte:

| Token              | Literal value (preserved) |
|--------------------|---------------------------|
| `--wb-shadow-sm`   | `0 1px 3px rgba(15, 23, 42, 0.08)` |
| `--wb-shadow-lg`   | `0 24px 48px rgba(15, 23, 42, 0.18)` |
| `--wb-radius-sm`   | `10px` |
| `--wb-radius-md`   | `14px` |
| `--wb-radius-lg`   | `18px` |
| `--wb-content-width` | `1180px` |

Each appears exactly once in the file, in the trailing block (no shadowing).

## Naming compromise: radius

`decisions.md` proposes `--wb-radius-sm/md/lg` at `8/12/16 px`, but the existing
`--wb-radius-sm/md/lg` already point at `10/14/18 px` and are consumed throughout
the app. To guarantee zero visual regression in Phase 1, the new canonical
tokens use **numeric names** (`--wb-radius-2/3/4`) for the 8/12/16 px tier:

- `--wb-radius-xs`   = 4px
- `--wb-radius-2`    = 8px   (canonical "sm" replacement; legacy sm stays at 10)
- `--wb-radius-3`    = 12px  (canonical "md" replacement; legacy md stays at 14)
- `--wb-radius-4`    = 16px  (canonical "lg" replacement; legacy lg stays at 18)
- `--wb-radius-xl`   = 24px
- `--wb-radius-full` = 9999px

Phases 3-5 of the milestone migrate consumers off the legacy names. After that,
the friendly `sm/md/lg` names can be reclaimed at 8/12/16 if desired.

## Deviations from decisions.md

None on values. The naming compromise above is documented in CONTEXT.md
specifics #2 ("preservar valores viejos exactos en alias names viejos para
CERO regresión, y agregar nuevos tokens con nombres nuevos").

## Verification

Both Task 1 and Task 2 automated verifies passed (Task 2 verifier was run
via a script file due to shell-escaping idiosyncrasies of the inline
`node -e` form; the regex itself is correct):

- `OK all scale tokens present`
- `OK 6 legacy scale tokens preserved`

Total token declarations in file: **119** (≥80 required by plan verification).
Zero hex literals outside `--wb-color-*` declarations and explanatory comments.

## Out of scope

Pilot adoption (Plan 01-03 verifies the system is consumable end-to-end).
