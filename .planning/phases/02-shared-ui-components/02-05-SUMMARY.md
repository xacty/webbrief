---
phase: 02-shared-ui-components
plan: 05
status: complete
date: 2026-05-08
---

# Plan 02-05 Summary — index.js + vite build smoke + cross-library gates

## What was built

- `frontend/src/components/ui/index.js` — public barrel re-exporting all 6 components in UI-SPEC order: Button, Input, Select, Modal, Card, Badge. Internal class-name helper is intentionally NOT re-exported per UI-SPEC §"File Layout".
- Ran `vite build` from `frontend/` against the worktree — succeeded (exit 0).
- Verified cross-library token-purity gates across the 6 module CSS files.

## Vite build output (last 5 lines)

```
(!) Some chunks are larger than 500 kB after minification. Consider:
- Using dynamic import() to code-split the application
- Use build.rollupOptions.output.manualChunks to improve chunking: https://rollupjs.org/configuration-options/#output-manualchunks
- Adjust chunk size limit for this warning via build.chunkSizeWarningLimit.
✓ built in 2.34s
```

Build exit: 0. The 500 kB warning is a pre-existing chunking warning for `ProjectEditor-*.js` (TipTap editor bundle) and is unrelated to Phase 2 — no new code was added that contributes to that chunk.

## Cross-library grep gates (all clean)

1. **Raw hex sweep** (allowed exceptions: `#ffffff` in Button, `rgba(15, 23, 42, 0.36)` in Modal): **0 matches**
2. **`text-transform: uppercase` sweep**: **0 matches**
3. **Numeric z-index in `Modal.module.css`**: **0 matches** (overlay uses `var(--wb-z-modal)` exclusively)
4. **`--wb-select-*` overrides in `Select.module.css` / `Input.module.css`**: **0 matches** (base.css remains canonical owner of the chevron contract)

## Per-component one-liners

- **Button**: 4 variants × 3 sizes (32/40/48 px), forwardRef, loading state with `Loader2` (width-stable via absolute overlay)
- **Input**: 7 types, label/helper/error wired via `useId` + `aria-describedby`, password type with caret-preserving Eye/EyeOff toggle, forwardRef
- **Select**: native `<select>`, forwardRef, `Select.Option` ergonomic alias, supports both `options` prop and children-form (options wins), preserves base.css chevron
- **Modal**: portal-only-when-open, 4 sizes, drag-safe mousedown→mouseup overlay close, focus trap + focus restore, body-scroll refcount supports stacked modals, `var(--wb-z-modal)`-only z-index
- **Card**: polymorphic via `as` prop, padding/shadow/radius modifiers from canonical tokens, interactive mode for hover/focus
- **Badge**: 4 variants × 2 sizes, pill via `--wb-radius-full`, pure presentational (no `role="status"` by default)

## Files created

- `frontend/src/components/ui/index.js` (21 lines)

## Verification

- `index.js` exists with exactly 6 `export { default as ... }` lines in UI-SPEC order
- No `cn` reference in `index.js` (internal-only helper preserved)
- No side-effect imports in `index.js` (zero `^import ` matches)
- `cd frontend && npm run build` exit 0
- `frontend/dist/index.html` regenerated (gitignored, not committed)
- Zero new entries in `frontend/package.json` (UI-SPEC §Registry Safety contract honored)
- Zero edits to Phase 1 artifacts (`tokens.css`, `base.css`)
- Zero edits to existing pages (Phase 3-5 work, not Phase 2)

## Notes

- Phase 2 deliverable is now ready for Phase 3 admin/auth migration to consume:
  ```jsx
  import { Button, Modal, Input, Select, Card, Badge } from '../../components/ui';
  ```
- Cross-library token-purity is enforced by negative greps; any future contributor adding a raw hex or numeric z-index to these modules will fail the gates.
