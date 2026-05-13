---
phase: 04-editor-unification
plan: 01
status: complete
type: execute
wave: 1
requirements: [UI-06, UI-07]
key_files:
  created: []
  modified:
    - frontend/src/styles/tokens.css
commits:
  - aa656fb
---

# Plan 04-01 — Editor Sub-Tokens

## What was built

Appended the **Editor sub-tokens (Phase 4)** banner block at the bottom of `frontend/src/styles/tokens.css`, inside the existing `:root { ... }` rule, after the legacy `--wb-content-width` alias. **14 new tokens** declared with the exact resolved values from `04-UI-SPEC.md > Editor Sub-Tokens`:

- **Editor surfaces** (3): `--wb-editor-bg #212222`, `--wb-editor-surface #2a2a2a`, `--wb-editor-surface-elevated #1a1a1a`
- **Editor borders** (2): `--wb-editor-border #d9d9d9`, `--wb-editor-border-strong #b8b8b8`
- **Editor text** (3): `--wb-editor-text-on-dark #ffffff`, `--wb-editor-text-on-dark-muted #aaaaaa`, `--wb-editor-text #2a2a2a`
- **Floating tooltip** (2): `--wb-tooltip-bg #3c4043`, `--wb-tooltip-text #ffffff`
- **Comments** (3): `--wb-comment-highlight rgba(254,240,138,0.5)`, `--wb-comment-highlight-active rgba(254,240,138,0.9)`, `--wb-comment-highlight-resolved transparent`
- **Section flash** (1): `--wb-section-flash rgba(254,240,138,0.6)`

## Verification

- `grep -c '^\s*--wb-editor-' tokens.css` → **8** ✓
- `grep -c '^\s*--wb-tooltip-' tokens.css` → **2** ✓
- `grep -E '^\s*--wb-comment-[a-z-]+:' tokens.css | wc -l` → **3** ✓ (the raw `^\s*--wb-comment-` count was 4 due to a non-declaration line in the banner comment listing the namespace prefix; stricter regex confirms 3 declarations)
- `grep -E '^\s*--wb-section-[a-z-]+:' tokens.css | wc -l` → **1** ✓
- `grep -c '^}' tokens.css` → **1** ✓ (still a single `:root` rule)
- `grep -E "^\s*--wb-editor-bg:\s*#212222;" tokens.css` → match ✓
- `grep -E "^\s*--wb-tooltip-bg:\s*#3c4043;" tokens.css` → match ✓
- Banner string `Editor sub-tokens (Phase 4)` present ✓

## Behavioral / visual change

**None.** Tokens are defined but no consumer file references them yet. The next 8 plans (`04-02` through `04-09`) will replace hex literals with these tokens.

## Self-Check: PASSED
