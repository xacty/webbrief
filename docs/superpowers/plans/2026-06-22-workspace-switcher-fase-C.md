# Workspace Switcher — Fase C: Onboarding Integration + Cleanup

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:subagent-driven-development`. Steps use `- [ ]` syntax.

**Goal:** Make the existing onboarding tutorial workspace-aware (route the 6 checklist tasks at the new `/c/:slug/*` URLs), retire the legacy `CompanyPage.jsx` (no longer referenced by any route), and consolidate the helpers that were duplicated when CompanyPage was split into 3 workspace pages.

**Architecture:** Three loose concerns, each addressable as a 1-2 commit chunk:
1. Wire onboarding navigation through the workspace context — every `handleTaskClick` case picks up the active company slug from `useWorkspace()`.
2. Move the duplicated `getCompanyCacheKey/read/write/clear`, `formatDate`, `formatRelativeDate`, and `projectTypeLabel` helpers into shared modules under `frontend/src/lib/`. Refactor the 3 workspace pages to import from there.
3. `git rm` the legacy `CompanyPage.jsx` + `CompanyPage.module.css` after replacing the shared CSS import in the workspace pages with their own.

**Tech Stack:** Same as A+B. No new npm deps.

**Working directory:** `/Users/adrian/GitHub/webbrief/.claude/worktrees/workspace-switcher`

**Depends on:** Fase A + Fase B merged into this branch. HEAD = `61fbfc4` (Fase B critical fix).

---

## File map

| File | Action | Responsibility |
|---|---|---|
| `frontend/src/components/layout/AppShell.jsx` | **Modify** | Update `handleTaskClick` switch cases to use the active company slug |
| `frontend/src/lib/companyCache.js` | **Create** | Shared sessionStorage helpers (key, read, write, clear) used by Projects/Team/Activity pages |
| `frontend/src/lib/companyFormatters.js` | **Create** | Shared `formatDate`, `formatRelativeDate`, `projectTypeLabel` |
| `frontend/src/pages/workspace/ProjectsPage.jsx` | **Modify** | Import helpers from new shared modules; drop local copies |
| `frontend/src/pages/workspace/TeamPage.jsx` | **Modify** | Same |
| `frontend/src/pages/workspace/ActivityPage.jsx` | **Modify** | Same |
| `frontend/src/pages/workspace/workspace.module.css` | **Create** | New CSS module (copy of CompanyPage.module.css verbatim — clean handoff) |
| `frontend/src/pages/workspace/ProjectsPage.jsx` ... | **Modify** | Switch CSS import from `'../CompanyPage.module.css'` to `'./workspace.module.css'` |
| `frontend/src/App.jsx` | **Modify** | Remove the now-unused `CompanyPage` lazy import |
| `frontend/src/pages/CompanyPage.jsx` | **Delete** | No longer referenced |
| `frontend/src/pages/CompanyPage.module.css` | **Delete** | Replaced by `pages/workspace/workspace.module.css` |

---

## Task C1: Update OnboardingChecklist handleTaskClick

**Files:**
- Modify: `frontend/src/components/layout/AppShell.jsx`

### Step 1: Inspect the current handler

```bash
cd /Users/adrian/GitHub/webbrief/.claude/worktrees/workspace-switcher
grep -n "handleTaskClick" frontend/src/components/layout/AppShell.jsx
sed -n '80,115p' frontend/src/components/layout/AppShell.jsx
```

You'll see a switch statement with cases for each task key. Today each case navigates to either `/companies?new=1`, `/companies`, or `/new-project`.

### Step 2: Source the workspace context

`useWorkspace()` is already destructured at the top of AppShell (Fase A wired `accessibleCompanies`; Fase B added `currentCompanySlug`). Confirm `currentCompanySlug` is in scope. If not, expand the destructure:

```jsx
const { accessibleCompanies, currentCompanySlug } = useWorkspace()
```

### Step 3: Replace the switch cases

Find the existing `handleTaskClick` function. Replace its body so each case targets workspace-aware routes:

```jsx
function handleTaskClick(key) {
  const slug = currentCompanySlug
  switch (key) {
    case 'create_company':
      // No active workspace yet (user with 0 companies) → fall back to /companies?new=1.
      // Otherwise still open the create-company modal in /companies.
      navigate('/companies?new=1')
      break
    case 'invite_member':
      navigate(slug ? `/c/${slug}/team?invite=1` : '/companies')
      break
    case 'create_project':
      navigate(slug ? `/new-project?company=${slug}` : '/new-project')
      break
    case 'edit_page':
      navigate(slug ? `/c/${slug}/projects` : '/companies')
      break
    case 'create_share_link':
      navigate(slug ? `/c/${slug}/projects` : '/companies')
      break
    case 'leave_comment':
      navigate(slug ? `/c/${slug}/projects` : '/companies')
      break
    default:
      navigate(slug ? `/c/${slug}/projects` : '/companies')
  }
}
```

### Step 4: Make TeamPage honor `?invite=1` query param

`frontend/src/pages/workspace/TeamPage.jsx`

Find where the invite modal state lives (likely `inviteModalOpen` or similar). Add a `useEffect` that reads the search params and opens the modal if `invite=1`, then strips the param to avoid re-opening on re-render.

Pattern (mirrors CompaniesPage's `?new=1` handler from the onboarding feature):

```jsx
import { useSearchParams } from 'react-router-dom'

// ...inside TeamPage:
const [searchParams, setSearchParams] = useSearchParams()
useEffect(() => {
  if (searchParams.get('invite') === '1') {
    setInviteModalOpen(true)  // adapt to the actual setter name
    const next = new URLSearchParams(searchParams)
    next.delete('invite')
    setSearchParams(next, { replace: true })
  }
}, [searchParams, setSearchParams])
```

Verify the actual setter name by reading TeamPage; adapt accordingly. If multiple setters exist (e.g. inviteModalOpen + a focus call), only set the `Open` state.

### Step 5: Make NewProject honor `?company=:slug` query param

`frontend/src/pages/NewProject.jsx`

Today NewProject accepts a `?companyId=:id` query param (per the spec we read earlier). The onboarding `create_project` task now passes a slug. Two options:

(A) Update NewProject to accept either `?company=:slug` (priority) or `?companyId=:id` (legacy). Resolve the slug via `findCompanyBySlug` against `useWorkspace().accessibleCompanies`.

(B) Have the onboarding handler still pass `?companyId=:id` — but the handler doesn't have direct access to ids, only slugs.

(A) is cleaner. Apply:

```jsx
import { useSearchParams } from 'react-router-dom'
import { useWorkspace } from '../contexts/WorkspaceContext'
import { findCompanyBySlug } from '../lib/companySlug'

// ...inside NewProject:
const [searchParams] = useSearchParams()
const { accessibleCompanies } = useWorkspace()
const initialCompany = useMemo(() => {
  const slug = searchParams.get('company')
  if (slug) {
    const bySlug = findCompanyBySlug(accessibleCompanies, slug)
    if (bySlug) return bySlug
  }
  const id = searchParams.get('companyId')
  if (id) {
    return accessibleCompanies.find((c) => c.id === id) || null
  }
  return null
}, [searchParams, accessibleCompanies])
```

Then use `initialCompany` in the page's existing "pre-fill the company picker" logic. Read the page to see where the pre-fill happens; replace whatever it does today.

### Step 6: Verify + commit

```bash
cd /Users/adrian/GitHub/webbrief/.claude/worktrees/workspace-switcher/frontend
npx vite build --mode development 2>&1 | tail -3
cd ..
git add frontend/src/components/layout/AppShell.jsx frontend/src/pages/workspace/TeamPage.jsx frontend/src/pages/NewProject.jsx
git commit -m "feat(workspace): rewire onboarding handlers to workspace routes

OnboardingChecklist task-clicks now target /c/:slug/team?invite=1,
/c/:slug/projects, and /new-project?company=:slug. TeamPage handles
?invite=1 (auto-opens the invite modal + cleans the param);
NewProject prefers ?company=:slug over the legacy ?companyId=:id.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task C2: Extract companyCache helpers

**Files:**
- Create: `frontend/src/lib/companyCache.js`
- Modify: `frontend/src/pages/workspace/ProjectsPage.jsx`
- Modify: `frontend/src/pages/workspace/TeamPage.jsx`
- Modify: `frontend/src/pages/workspace/ActivityPage.jsx`
- Modify: `frontend/src/pages/CompaniesPage.jsx` (it imports the same helpers)

### Step 1: Create the shared module

Inspect the duplicated helpers in `frontend/src/pages/workspace/ProjectsPage.jsx`:

```bash
cd /Users/adrian/GitHub/webbrief/.claude/worktrees/workspace-switcher
grep -nA8 "function getCompanyCacheKey\|function readCompanyCache\|function writeCompanyCache\|function clearCompaniesCache" frontend/src/pages/workspace/ProjectsPage.jsx | head -40
```

Create `frontend/src/lib/companyCache.js` with the exact same function bodies copied from ProjectsPage (the helpers are identical across the 3 workspace pages, verified by the controller earlier). Export them.

### Step 2: Update consumers

In each of `ProjectsPage.jsx`, `TeamPage.jsx`, `ActivityPage.jsx`, `CompaniesPage.jsx`:

- Remove the local copies of `getCompanyCacheKey`, `readCompanyCache`, `writeCompanyCache`, `clearCompaniesCache`, `clearCompanyDetailCaches` (if any).
- Add `import { getCompanyCacheKey, readCompanyCache, writeCompanyCache, clearCompaniesCache, clearCompanyDetailCaches } from '../lib/companyCache'` (workspace pages need `'../../lib/companyCache'`).
- Verify all references still resolve.

### Step 3: Verify + commit

```bash
cd /Users/adrian/GitHub/webbrief/.claude/worktrees/workspace-switcher/frontend
npx vite build --mode development 2>&1 | tail -3
cd ..
git add frontend/src/lib/companyCache.js frontend/src/pages/workspace/ frontend/src/pages/CompaniesPage.jsx
git commit -m "refactor(workspace): extract companyCache helpers to shared module

Removes the 4-way duplication across ProjectsPage, TeamPage,
ActivityPage, and CompaniesPage. All four now import from
lib/companyCache.js.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task C3: Extract formatters

**Files:**
- Create: `frontend/src/lib/companyFormatters.js`
- Modify: `frontend/src/pages/workspace/ProjectsPage.jsx`, `TeamPage.jsx`, `ActivityPage.jsx`, `CompaniesPage.jsx`, possibly `CompanyPage.jsx` (still on disk)

### Step 1: Identify and extract

The helpers in the workspace pages:
- `formatDate(value)` — ISO-or-date → "26 may 2026" style
- `formatRelativeDate(value)` — "hace 4 semanas" style
- `projectTypeLabel(type)` — `page` → "Página Web", `document` → "Artículo", `faq` → "FAQs", `brief` → "Brief"
- `getCompanyRoleLabel` is imported from `shared/userRoles.js` — DO NOT touch

```bash
cd /Users/adrian/GitHub/webbrief/.claude/worktrees/workspace-switcher
grep -nA10 "function formatDate\|function formatRelativeDate\|function projectTypeLabel" frontend/src/pages/workspace/ProjectsPage.jsx | head -40
```

Verify the bodies are identical across files.

Create `frontend/src/lib/companyFormatters.js`. Export the 3 functions.

### Step 2: Update consumers

Same pattern as C2 — remove local copies, add imports.

### Step 3: Verify + commit

```bash
cd /Users/adrian/GitHub/webbrief/.claude/worktrees/workspace-switcher/frontend
npx vite build --mode development 2>&1 | tail -3
cd ..
git add frontend/src/lib/companyFormatters.js frontend/src/pages/workspace/ frontend/src/pages/CompaniesPage.jsx
git commit -m "refactor(workspace): extract date + projectType formatters to shared module

Removes triplication of formatDate, formatRelativeDate, and
projectTypeLabel across the 3 workspace pages.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task C4: Move CSS module out of CompanyPage scope

**Files:**
- Create: `frontend/src/pages/workspace/workspace.module.css` (verbatim copy of `CompanyPage.module.css`)
- Modify: `ProjectsPage.jsx`, `TeamPage.jsx`, `ActivityPage.jsx` (change CSS import path)

### Step 1: Copy the CSS module

```bash
cd /Users/adrian/GitHub/webbrief/.claude/worktrees/workspace-switcher
cp frontend/src/pages/CompanyPage.module.css frontend/src/pages/workspace/workspace.module.css
```

### Step 2: Update imports

In each of the 3 workspace pages, find:

```jsx
import styles from '../CompanyPage.module.css'
```

Replace with:

```jsx
import styles from './workspace.module.css'
```

### Step 3: Verify + commit

```bash
cd /Users/adrian/GitHub/webbrief/.claude/worktrees/workspace-switcher/frontend
npx vite build --mode development 2>&1 | tail -3
cd ..
git add frontend/src/pages/workspace/workspace.module.css frontend/src/pages/workspace/*.jsx
git commit -m "refactor(workspace): move CSS module out of CompanyPage scope

Workspace pages now import their own workspace.module.css. Prepares
for the CompanyPage.jsx + .module.css deletion in the next task.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task C5: Delete legacy CompanyPage

**Files:**
- Delete: `frontend/src/pages/CompanyPage.jsx`
- Delete: `frontend/src/pages/CompanyPage.module.css`
- Modify: `frontend/src/App.jsx` (remove unused lazy import)

### Step 1: Confirm no references

```bash
cd /Users/adrian/GitHub/webbrief/.claude/worktrees/workspace-switcher
grep -rEn "CompanyPage" frontend/src --include="*.jsx" --include="*.js" --include="*.css"
```

Expected: only matches are the `App.jsx` lazy import line + the file's own contents. If any other reference appears, STOP and investigate.

### Step 2: Remove the lazy import from App.jsx

Find this line:

```jsx
const CompanyPage = lazy(() => import('./pages/CompanyPage'))
```

Delete it.

### Step 3: Delete the files

```bash
cd /Users/adrian/GitHub/webbrief/.claude/worktrees/workspace-switcher
git rm frontend/src/pages/CompanyPage.jsx frontend/src/pages/CompanyPage.module.css
```

### Step 4: Verify

```bash
cd /Users/adrian/GitHub/webbrief/.claude/worktrees/workspace-switcher/frontend
npx vite build --mode development 2>&1 | tail -5
```

Expected: ✓ built. The bundle should NOT contain a `CompanyPage` chunk anymore.

### Step 5: Commit

```bash
cd /Users/adrian/GitHub/webbrief/.claude/worktrees/workspace-switcher
git add frontend/src/App.jsx  # the removed import line
git commit -m "$(cat <<'EOF'
chore(workspace): delete legacy CompanyPage

No routes reference it anymore (Fase B routed /companies/:id through
CompanyRedirect → /c/:slug/projects). All tab content has been
extracted into pages/workspace/{Projects,Team,Activity}Page.jsx
which import from the shared workspace.module.css.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task C6: Controller E2E verification + grep sweep

Performed by the orchestrator.

- [ ] **Step 1: Build clean**

```bash
cd /Users/adrian/GitHub/webbrief/.claude/worktrees/workspace-switcher/frontend
npx vite build --mode development 2>&1 | tail -3
```

- [ ] **Step 2: No stale CompanyPage references**

```bash
cd /Users/adrian/GitHub/webbrief/.claude/worktrees/workspace-switcher
grep -rEn "CompanyPage" frontend/src 2>&1 | head -10 || echo "0 matches"
```

Expected: `0 matches`.

- [ ] **Step 3: No `/companies/:id` direct navigations remain**

```bash
grep -rEn "navigate\(\\\`/companies/\\\$|navigate\('/companies/" frontend/src 2>&1 | head -10 || echo "0 matches"
```

Expected: `0 matches` (CompanyRedirect lives at that route, but is reached via deep links, not via in-app navigation).

- [ ] **Step 4: Spanish neutro**

```bash
grep -rEn "podés|tenés|abrí|copiá|querés|contactá|hacé|invitá|guardá|pedí" frontend/src/lib/companyCache.js frontend/src/lib/companyFormatters.js frontend/src/pages/workspace/ 2>&1 | head -10 || echo "0 matches"
```

Expected: `0 matches`.

- [ ] **Step 5: Stats**

```bash
git log --oneline 61fbfc4..HEAD
git diff --stat 61fbfc4..HEAD
```

Expected: 5 commits (C1-C5), net LOC change negative (deleted CompanyPage + duplicates outweighs the new shared modules).

---

## Self-Review

**Spec coverage** vs `2026-06-22-workspace-switcher-design.md`:
- §"Onboarding integration → handlers" → C1 ✓
- §"Migration → Cleanup" → C5 ✓
- Deduplication of helpers (review Minor #9/#10 from Fase B) → C2/C3 ✓

**Placeholder scan:** No TBD/TODO/FIXME. Every step has runnable code.

**Type consistency:** All shared module exports (`getCompanyCacheKey`, `readCompanyCache`, `writeCompanyCache`, `clearCompaniesCache`, `clearCompanyDetailCaches`, `formatDate`, `formatRelativeDate`, `projectTypeLabel`) are referenced by the same names in their consumers (already verified verbatim across Fase B's extracted pages).

---

## After Fase C lands

Fase A+B+C together = a complete workspace switcher refactor. Ready for:
1. Merge `feat/workspace-switcher` → `feat/onboarding-tutorial` (the parent branch). The onboarding feature now uses the new routes.
2. Eventually merge `feat/onboarding-tutorial` → `main`.

Other deferred items (Fase B review Minor #5/#7/#11) are post-merge polish, not blockers.
