---
phase: 03-admin-auth-migration
reviewed: 2026-05-08T00:00:00Z
depth: standard
files_reviewed: 19
files_reviewed_list:
  - frontend/src/components/layout/AppShell.jsx
  - frontend/src/components/layout/AppShell.module.css
  - frontend/src/pages/AccountSettingsPage.jsx
  - frontend/src/pages/AccountSettingsPage.module.css
  - frontend/src/pages/AuthPage.module.css
  - frontend/src/pages/CompaniesPage.jsx
  - frontend/src/pages/CompaniesPage.module.css
  - frontend/src/pages/CompanyPage.jsx
  - frontend/src/pages/CompanyPage.module.css
  - frontend/src/pages/Login.jsx
  - frontend/src/pages/NewProject.jsx
  - frontend/src/pages/NewProject.module.css
  - frontend/src/pages/SecurityPage.jsx
  - frontend/src/pages/SecurityPage.module.css
  - frontend/src/pages/SetPassword.jsx
  - frontend/src/pages/TrashPage.jsx
  - frontend/src/pages/TrashPage.module.css
  - frontend/src/pages/UsersPage.jsx
  - frontend/src/pages/UsersPage.module.css
findings:
  critical: 0
  warning: 2
  info: 3
  total: 5
status: issues_found
---

# Phase 3: Code Review Report

**Reviewed:** 2026-05-08T00:00:00Z
**Depth:** standard
**Files Reviewed:** 19 (10 JSX + 9 CSS)
**Status:** issues_found

## Summary

Phase 3 migrates 7 admin pages, 2 auth pages, and the global AppShell to the shared UI primitives (`Button`, `Input`, `Select`, `Card`, `Modal`, `Badge`) and design tokens. The migration is clean: behavioral invariants are preserved, all CSS modules pass the per-cohort gates (0 hex, 0 raw `z-index:`, 0 forbidden selectors except documented `.fileInputLabel` and `.tabButton`), z-index is unified via tokens, and the cohort-by-cohort plan was executed without regressions detected by static analysis.

No Critical issues found — no security vulnerabilities, no auth bypasses, no data-loss paths, and no crash vectors. Two Warning-level issues affect robustness but not correctness in normal flow. Three Info items track minor stylistic improvements.

Static gate matrix confirmed by grep:
- `0` hardcoded `#hex` colors across all 9 CSS modules
- `0` raw `z-index:<int>` declarations (all use `var(--wb-z-*)` tokens)
- `0` forbidden selectors (`.modalOverlay`, `.modalCard`, `.input`, `.primaryButton`, `.linkButton`) — `.fileInputLabel` (UsersPage, AccountSettings) and `.tabButton` (TrashPage) preserved per documented exceptions
- `0` `console.log`/`debugger`/`eval`/`innerHTML` in JSX
- `0` empty catch blocks (catches in cache helpers carry "Ignore storage failures" comments — defensive, not silent)

## Warnings

### WR-01: `loadUsers` in UsersPage doesn't respect unmount lifecycle

**File:** `frontend/src/pages/UsersPage.jsx:116-128`
**Issue:** The component declares two parallel loaders. The mount effect uses an inner `loadInitialUsers` (line 133) gated by an `active` flag — correct. But the outer `loadUsers` (line 116), invoked from `handleInvite`, `handleEditUser`, `handleMembershipRoleChange`, `handleDeleteUser`, `handleRemoveMembership`, etc., has no `active`-flag guard. If the user triggers any of those mutations and navigates away before the request completes, `setUsers`, `setCompanies`, `setError`, `setLoading` will fire on an unmounted component (React 18 emits a state-update-after-unmount warning; in 17 the same path leaks state). Also, the two loaders duplicate logic — the inner one is dead-on-unmount-safe, the outer one is not.
**Fix:** Either (a) collapse to a single loader factory that returns `(activeRef) => promise`, or (b) wrap the outer `loadUsers` calls in an `AbortController`/ref-based guard so post-unmount state writes are skipped:
```js
// Option B (minimal): track an unmount ref at the top of the component
const aliveRef = useRef(true)
useEffect(() => () => { aliveRef.current = false }, [])

async function loadUsers() {
  try {
    setLoading(true)
    const data = await apiFetch('/api/users')
    if (!aliveRef.current) return
    setUsers(data.users || [])
    setCompanies(data.companies || [])
    setError('')
  } catch (err) {
    if (!aliveRef.current) return
    setError(err.message || 'No se pudieron cargar los usuarios')
  } finally {
    if (aliveRef.current) setLoading(false)
  }
}
```

### WR-02: Login feedback message leaks vendor name to end users

**File:** `frontend/src/pages/Login.jsx:48`
**Issue:** The success feedback after `resetPasswordForEmail` reads: `"Si el email existe, Supabase enviará un enlace para crear una nueva contraseña."` Exposing the auth provider name in user-facing UI is a small information disclosure surface (helps an attacker target provider-specific exploits, e.g. Supabase Auth admin endpoints) and inconsistent with the rest of the product copy, which never mentions Supabase. Pre-Phase-3 copy had the same leak, but the migration is the natural moment to fix it.
**Fix:** Replace with a vendor-neutral phrasing:
```jsx
setFeedback('Si el email existe, recibirás un enlace para crear una nueva contraseña.')
```

## Info

### IN-01: Unnecessary `react-hooks/exhaustive-deps` suppression in NewProject `estructura` memo

**File:** `frontend/src/pages/NewProject.jsx:213`
**Issue:** The disable comment is paired with deps `[businessType, projectType, templateId, selectedCompanyTemplate]`. `selectedCompanyTemplate` is computed on every render (line 195) from `companyTemplates` and `templateId`, so a missing dep would only matter if the lint rule expected `companyTemplates` directly. Including `selectedCompanyTemplate` in the deps already covers that transitive read; the suppression is no longer needed and masks any future genuine miss.
**Fix:** Remove the `// eslint-disable-next-line react-hooks/exhaustive-deps` line. If the rule then flags `companyTemplates`, add it to the deps array (it's already referenced via `selectedCompanyTemplate`, so the addition is a no-op for behavior).

### IN-02: TrashPage mount effect omits `loadItems` from deps

**File:** `frontend/src/pages/TrashPage.jsx:116-120`
**Issue:** The effect runs `loadItems()` and depends on `[mode]`. `loadItems` is defined inside the component and closes over `mode` and `pageCopy.title`; React's exhaustive-deps rule will flag it. Behavior is correct because `mode` is the only changing capture, but the lint warning is a future trap (someone adds a new capture and forgets the manual update).
**Fix:** Either add `// eslint-disable-next-line react-hooks/exhaustive-deps` with a one-line rationale, or wrap `loadItems` in `useCallback([mode])` and depend on it.

### IN-03: SecurityPage effect deps miss `loadSecurity`

**File:** `frontend/src/pages/SecurityPage.jsx:103-105`
**Issue:** Same pattern as IN-02. `useEffect(() => { loadSecurity() }, [days, outcome, actionFilter])` will trigger an exhaustive-deps lint. The function captures all three of those plus stable references, so behavior is correct, but the suppression is implicit.
**Fix:** Same options as IN-02 — explicit eslint-disable with rationale, or wrap in `useCallback([days, outcome, actionFilter])`.

---

_Reviewed: 2026-05-08T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer, standard depth)_
_Depth: standard_
