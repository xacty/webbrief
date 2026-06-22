# Workspace Switcher — Fase B: Routes + Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development`. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Wire the new routes (`/c/:companySlug/projects`, `/team`, `/activity`), split the 1110-LOC `CompanyPage.jsx` into 3 focused pages, add the `NotFoundPage`, reorganize the AppShell sidebar (3 new nav items + conditional "Empresas" in Admin), redirect old `/companies/:id` URLs, and ship the Important fixes deferred from Fase A's review.

**Architecture:** A new `WorkspaceLayout` (mounted at `/c/:companySlug`) resolves the slug → calls `switchCompany(slug)` on context → renders 404 if unresolvable → renders nested routes via `<Outlet />`. The three nested route components (ProjectsPage, TeamPage, ActivityPage) each receive the active `currentCompany` from `useWorkspace()` and own the data + UI for their tab today. The legacy `/companies/:id` route is redirected client-side to `/c/:slug/projects`. `/companies` (the listing) stays — just hidden from the sidebar when fewer than 3 companies.

**Tech Stack:** Same as Fase A. No new npm dependencies.

**Working directory:** `/Users/adrian/GitHub/webbrief/.claude/worktrees/workspace-switcher`.

**Depends on:** Fase A committed (HEAD = `3f06aa5` or later). All Fase A primitives must be in place.

**Companion spec:** `docs/superpowers/specs/2026-06-22-workspace-switcher-design.md`.

---

## File map

| File | Action | Responsibility |
|---|---|---|
| `frontend/src/lib/roleCapabilities.js` | **Modify** | Add `canCreateCompany(user)` helper (consolidates AppShell + CompaniesPage gates — fixes Fase A review Important #5) |
| `frontend/src/contexts/WorkspaceContext.jsx` | **Modify** | Add `refresh()` method (fixes Fase A review Important #3) |
| `frontend/src/pages/NotFoundPage.jsx` | **Create** | 404 surface, reuses `EmptyState` primitive |
| `frontend/src/pages/NotFoundPage.module.css` | **Create** | Centered layout |
| `frontend/src/components/layout/WorkspaceLayout.jsx` | **Create** | Route wrapper for `/c/:companySlug/*`. Resolves slug → renders 404 or `<Outlet />` |
| `frontend/src/pages/workspace/ProjectsPage.jsx` | **Create** | Extracted from `CompanyPage.jsx` lines 685-885 (proyectos tab). Consumes `useWorkspace()` |
| `frontend/src/pages/workspace/TeamPage.jsx` | **Create** | Extracted from `CompanyPage.jsx` lines 887-985 (equipo tab) |
| `frontend/src/pages/workspace/ActivityPage.jsx` | **Create** | Extracted from `CompanyPage.jsx` lines 987-1011 (actividad tab) |
| `frontend/src/components/layout/CompanyRedirect.jsx` | **Create** | Tiny component that resolves `:companyId` from URL → finds company in `accessibleCompanies` → `<Navigate>` to `/c/:slug/projects`. 404 if not found |
| `frontend/src/App.jsx` | **Modify** | Add 5 new routes (workspace layout + children + companyId redirect + not-found + catch-all). Update `/` root redirect to default company slug |
| `frontend/src/components/layout/AppShell.jsx` | **Modify** | Add 3 new NavLinks (Proyectos / Equipo / Actividad). Move "Empresas" to ADMIN, gated. Update gates to use the new `canCreateCompany` helper. |
| `frontend/src/pages/CompaniesPage.jsx` | **Modify** | Wire `refresh()` from `useWorkspace()` after company mutations (create / archive / trash) — fixes Fase A Important #3 |
| `frontend/src/pages/CompanyPage.jsx` | **NOT TOUCHED in B** | Stays as fallback. Delete in Fase C after all references migrated. |

---

## Task B1: canCreateCompany capability helper

**Files:**
- Modify: `frontend/src/lib/roleCapabilities.js`

- [ ] **Step 1: Read existing capability helpers**

```bash
cd /Users/adrian/GitHub/webbrief/.claude/worktrees/workspace-switcher
grep -n "^export function" frontend/src/lib/roleCapabilities.js
```

Expected: list of exported capability functions like `isAdmin`, `canManageUsersNav`, `canUseSecurityNav`, `canUseTrashNav`, `canCreateTestCompany`. Confirm `canCreateTestCompany` exists (AppShell's Fase A code referenced it) and `isAdmin` exists.

- [ ] **Step 2: Add the new helper**

Append at the end of `frontend/src/lib/roleCapabilities.js`:

```js
/**
 * canCreateCompany — gate the "Crear empresa" CTA across the app.
 * Single source of truth so AppShell's WorkspaceSwitcher and CompaniesPage
 * can't drift. Includes QA users (who can create test companies) and any
 * manager-tier membership.
 */
export function canCreateCompany(user) {
  if (!user) return false
  if (isAdmin(user)) return true
  if (canCreateTestCompany(user)) return true
  const memberships = Array.isArray(user.memberships) ? user.memberships : []
  return memberships.some((m) => m.role === 'manager')
}
```

- [ ] **Step 3: Verify build**

```bash
cd /Users/adrian/GitHub/webbrief/.claude/worktrees/workspace-switcher/frontend
npx vite build --mode development 2>&1 | tail -3
```

Expected: ✓ built.

- [ ] **Step 4: Commit**

```bash
cd /Users/adrian/GitHub/webbrief/.claude/worktrees/workspace-switcher
git add frontend/src/lib/roleCapabilities.js
git commit -m "feat(workspace): add canCreateCompany capability helper

Single source of truth for the 'Crear empresa' gate. Aligns the
sidebar switcher and CompaniesPage so QA users see the row in both
places. Fixes Fase A review Important #5.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task B2: useWorkspace.refresh() method

**Files:**
- Modify: `frontend/src/contexts/WorkspaceContext.jsx`

- [ ] **Step 1: Extract the fetch into a callable**

Read the current `useEffect` block in `WorkspaceContext.jsx` that calls `loadCompanies()` (lines 47-75). We need to:
1. Extract `loadCompanies` into a `useCallback` available outside the effect
2. Keep the effect that runs it on auth change
3. Expose `refresh` in the context value

Replace the entire fetch-effect block + the value definition. Open the file and find the section starting with `// Fetch companies list whenever authentication settles.` (around line 46).

Replace from `// Fetch companies list whenever authentication settles.` through the closing `}, [authLoading, isAuthenticated, realCurrentUser?.id])` (about 30 lines) with:

```jsx
  // Fetch companies list (callable for manual refresh after mutations).
  const refresh = useCallback(async () => {
    if (!isAuthenticated || !realCurrentUser?.id) return null
    try {
      const data = await apiFetch('/api/companies')
      const list = Array.isArray(data?.companies) ? data.companies : []
      setAccessibleCompanies(list)
      writeCompaniesCache(list)
      return list
    } catch {
      const cached = readCompaniesCache()
      if (cached) setAccessibleCompanies(cached)
      return null
    }
  }, [isAuthenticated, realCurrentUser?.id])

  // Run refresh once whenever authentication settles.
  useEffect(() => {
    if (authLoading) return undefined
    if (!isAuthenticated || !realCurrentUser?.id) {
      setAccessibleCompanies([])
      setCurrentCompany(null)
      setLoading(false)
      return undefined
    }
    let cancelled = false
    setLoading(true)
    refresh().finally(() => {
      if (!cancelled) setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [authLoading, isAuthenticated, realCurrentUser?.id, refresh])
```

- [ ] **Step 2: Expose `refresh` in the context value**

Find the `value = useMemo(...)` block (around line 110). Add `refresh` to the object literal AND to the deps array.

Current:
```jsx
  const value = useMemo(
    () => ({
      currentCompany,
      currentCompanySlug: currentCompany ? companyToSlug(currentCompany) : null,
      accessibleCompanies,
      switchCompany,
      loading,
      createCompanyModalOpen,
      openCreateCompanyModal,
      closeCreateCompanyModal,
    }),
    [
      currentCompany,
      accessibleCompanies,
      switchCompany,
      loading,
      createCompanyModalOpen,
      openCreateCompanyModal,
      closeCreateCompanyModal,
    ],
  )
```

Add `refresh` to both:

```jsx
  const value = useMemo(
    () => ({
      currentCompany,
      currentCompanySlug: currentCompany ? companyToSlug(currentCompany) : null,
      accessibleCompanies,
      switchCompany,
      loading,
      refresh,
      createCompanyModalOpen,
      openCreateCompanyModal,
      closeCreateCompanyModal,
    }),
    [
      currentCompany,
      accessibleCompanies,
      switchCompany,
      loading,
      refresh,
      createCompanyModalOpen,
      openCreateCompanyModal,
      closeCreateCompanyModal,
    ],
  )
```

- [ ] **Step 3: Verify build**

```bash
cd /Users/adrian/GitHub/webbrief/.claude/worktrees/workspace-switcher/frontend
npx vite build --mode development 2>&1 | tail -3
```

Expected: ✓ built.

- [ ] **Step 4: Commit**

```bash
cd /Users/adrian/GitHub/webbrief/.claude/worktrees/workspace-switcher
git add frontend/src/contexts/WorkspaceContext.jsx
git commit -m "feat(workspace): add refresh() method to useWorkspace

Callable for any consumer that mutates the companies list (create,
archive, trash, restore) and needs to immediately reflect the change
in the switcher. Fixes Fase A review Important #3 (race between
CompaniesPage mutations and stale WorkspaceContext state).

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task B3: NotFoundPage component

**Files:**
- Create: `frontend/src/pages/NotFoundPage.jsx`
- Create: `frontend/src/pages/NotFoundPage.module.css`

- [ ] **Step 1: Write the CSS module**

Create `frontend/src/pages/NotFoundPage.module.css`:

```css
.wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 60vh;
  padding: var(--wb-space-8) var(--wb-space-6);
}
```

- [ ] **Step 2: Write the JSX component**

Create `frontend/src/pages/NotFoundPage.jsx`:

```jsx
import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileQuestionMark } from 'lucide-react'
import EmptyState from '../components/onboarding/EmptyState'
import { useWorkspace } from '../contexts/WorkspaceContext'
import { companyToSlug } from '../lib/companySlug'
import styles from './NotFoundPage.module.css'

export default function NotFoundPage() {
  const navigate = useNavigate()
  const { currentCompany } = useWorkspace()

  const goHome = useCallback(() => {
    if (currentCompany) {
      navigate(`/c/${companyToSlug(currentCompany)}/projects`)
    } else {
      navigate('/companies')
    }
  }, [navigate, currentCompany])

  return (
    <div className={styles.wrap}>
      <EmptyState
        icon={FileQuestionMark}
        title="No encontrado"
        body="La página que buscas no existe o no tienes acceso a ella."
        cta={{ label: 'Volver al inicio', onClick: goHome }}
      />
    </div>
  )
}
```

If `FileQuestionMark` is not exported by the project's lucide-react version, fall back to `Search` or `HelpCircle`. Verify with:

```bash
grep -E "^(FileQuestionMark|HelpCircle):" frontend/node_modules/lucide-react/dist/lucide-react.d.ts | head -3
```

The onboarding Fase 2 work confirmed `CircleQuestionMark` and `FileQuestionMark` are present in this version.

- [ ] **Step 3: Verify build**

```bash
cd /Users/adrian/GitHub/webbrief/.claude/worktrees/workspace-switcher/frontend
npx vite build --mode development 2>&1 | tail -3
```

- [ ] **Step 4: Commit**

```bash
cd /Users/adrian/GitHub/webbrief/.claude/worktrees/workspace-switcher
git add frontend/src/pages/NotFoundPage.jsx frontend/src/pages/NotFoundPage.module.css
git commit -m "feat(workspace): add NotFoundPage

Reuses EmptyState primitive (created in onboarding Fase 3a). Used by
WorkspaceLayout (for invalid company slugs) and as the catch-all
route. CTA navigates to the active company's projects page if there
is one, otherwise to /companies.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task B4: WorkspaceLayout route wrapper

**Files:**
- Create: `frontend/src/components/layout/WorkspaceLayout.jsx`

- [ ] **Step 1: Write the component**

Create `frontend/src/components/layout/WorkspaceLayout.jsx`:

```jsx
import { useEffect } from 'react'
import { Outlet, useParams } from 'react-router-dom'
import { useWorkspace } from '../../contexts/WorkspaceContext'
import { findCompanyBySlug, companyToSlug } from '../../lib/companySlug'
import NotFoundPage from '../../pages/NotFoundPage'

/**
 * Route wrapper for /c/:companySlug/*. Resolves the URL slug → company,
 * syncs the active company in WorkspaceContext (and localStorage), and
 * renders either the children outlet or a 404 surface.
 *
 * Loading semantics: while the context is still fetching companies, we
 * render null (not 404) so we don't flash an error during the first
 * paint after login.
 */
export default function WorkspaceLayout() {
  const { companySlug } = useParams()
  const { accessibleCompanies, currentCompany, switchCompany, loading } = useWorkspace()

  const resolved = findCompanyBySlug(accessibleCompanies, companySlug)

  // Sync the URL slug into the workspace state so the switcher reflects it.
  useEffect(() => {
    if (loading) return
    if (!resolved) return
    if (currentCompany && companyToSlug(currentCompany) === companySlug) return
    switchCompany(companySlug)
  }, [loading, resolved, currentCompany, companySlug, switchCompany])

  if (loading) return null
  if (!resolved) return <NotFoundPage />
  return <Outlet />
}
```

- [ ] **Step 2: Verify build**

```bash
cd /Users/adrian/GitHub/webbrief/.claude/worktrees/workspace-switcher/frontend
npx vite build --mode development 2>&1 | tail -3
```

- [ ] **Step 3: Commit**

```bash
cd /Users/adrian/GitHub/webbrief/.claude/worktrees/workspace-switcher
git add frontend/src/components/layout/WorkspaceLayout.jsx
git commit -m "feat(workspace): add WorkspaceLayout route wrapper

Resolves :companySlug from the URL against accessibleCompanies. If
the slug matches, sync it into the workspace state (writes to
localStorage via switchCompany) and render the nested Outlet.
Otherwise render NotFoundPage. While loading, render null to avoid
the 404 flash on first paint.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task B5: ProjectsPage (extract from CompanyPage tab)

**Files:**
- Create: `frontend/src/pages/workspace/ProjectsPage.jsx`

- [ ] **Step 1: Understand the source**

```bash
cd /Users/adrian/GitHub/webbrief/.claude/worktrees/workspace-switcher
wc -l frontend/src/pages/CompanyPage.jsx
sed -n '685,886p' frontend/src/pages/CompanyPage.jsx > /tmp/proyectos-tab.jsx
echo "Lines extracted: $(wc -l < /tmp/proyectos-tab.jsx)"
```

The "Proyectos" tab JSX lives at lines 685-885. It includes:
- The bulk-actions toolbar (when `selectedIds.size > 0`)
- The project grid (3 columns)
- Per-project cards with Abrir / Duplicar / kebab actions
- MoveToCompanyModal trigger

The state + handlers it depends on are scattered through `CompanyPage.jsx` lines 1-684. The complete list:
- `projects`, `setProjects`, `loading`, `selectedIds`, `setSelectedIds`, `pendingAction`
- `isAdmin(currentUser)`, `canManageProjects`, `membershipRole`
- `handleProjectArchive`, `handleProjectTrash`, `handleProjectDuplicate`, `handleBulkArchive`, `handleBulkTrash`, `handleBulkMove`
- `openMoveModal`, `closeMoveModal`, `moveModalState`
- The data fetch in `useEffect` (around line 220) for projects
- Activity log entries on mutation

Rather than re-write all of this, the subagent should:
1. Read `CompanyPage.jsx` in full
2. Identify ALL state, effects, handlers, imports, and utility components used inside the proyectos tab JSX (lines 685-885)
3. Port them into a new `ProjectsPage.jsx` component that takes the company from `useWorkspace()` instead of from URL params
4. The new component imports everything it needs (apiFetch, etc.) standalone

The full proyectos-tab JSX (already extracted to `/tmp/proyectos-tab.jsx`) is the target. The dependencies sit in lines 1-684 of CompanyPage.jsx.

- [ ] **Step 2: Write the extracted page**

This task is too large for a single inline code paste. Instead, the IMPLEMENTER's job is:

1. Open `frontend/src/pages/CompanyPage.jsx`
2. Identify everything the "Proyectos" tab JSX uses: state vars, effects, handlers, imports
3. Carry over all imports the proyectos branch uses (lucide icons, Modal, Button, KebabMenu, MoveToCompanyModal, apiFetch, etc.)
4. Replace the URL-based company resolution (`const { companyId } = useParams()` + the company-load effect) with `const { currentCompany, refresh: refreshWorkspace } = useWorkspace()`
5. Replace `companyId` with `currentCompany.id` throughout
6. Keep the data-load effects but trigger them on `currentCompany.id` change instead of route param change
7. Drop the tabs UI (no longer needed — this IS the proyectos page)
8. Render a header consistent with the design spec:

```jsx
<div className={styles.pageHeader}>
  <div className={styles.pageHeaderInner}>
    <h1 className={styles.title}>{currentCompany.name}</h1>
    <p className={styles.meta}>{projectCount} proyectos · {memberCount} miembros · {roleLabel}</p>
  </div>
</div>
```

(Reuse `CompanyPage.module.css` classes — the new file can import that same CSS module.)

9. After successful create / archive / trash / move actions, call `refreshWorkspace()` so the sidebar switcher updates (Fase A Important #3 fix).

- [ ] **Step 3: Verify build**

```bash
cd /Users/adrian/GitHub/webbrief/.claude/worktrees/workspace-switcher/frontend
npx vite build --mode development 2>&1 | tail -5
```

- [ ] **Step 4: Commit**

```bash
cd /Users/adrian/GitHub/webbrief/.claude/worktrees/workspace-switcher
git add frontend/src/pages/workspace/ProjectsPage.jsx
git commit -m "feat(workspace): extract ProjectsPage from CompanyPage

Carries the 'Proyectos' tab UI + state + handlers from CompanyPage
into its own page component. Sources the active company from
useWorkspace() instead of URL params. Reuses CompanyPage.module.css
classes for visual continuity. Calls workspace.refresh() after
create/archive/trash/move so the sidebar switcher stays in sync.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task B6: TeamPage (extract from CompanyPage tab)

**Files:**
- Create: `frontend/src/pages/workspace/TeamPage.jsx`

Same extraction pattern as B5, but for the "Equipo" tab (CompanyPage.jsx lines 887-985).

- [ ] **Step 1: Extract**

```bash
cd /Users/adrian/GitHub/webbrief/.claude/worktrees/workspace-switcher
sed -n '887,986p' frontend/src/pages/CompanyPage.jsx > /tmp/equipo-tab.jsx
```

The "Equipo" tab depends on:
- `members`, `loading`, `pendingInviteEmail`, `inviteRole`, `inviteModalOpen`
- `handleInvite`, `handleResendAccess`, `handleEditMember`, `handleRemoveMember`
- `getCompanyRoleLabel` (shared/userRoles.js)
- `DEMO_MEMBERS` (CompanyPage lines 137-162)
- `canInvite`, `currentUser`, `membershipRole`

- [ ] **Step 2: Write the page**

Implementer reads `CompanyPage.jsx`, identifies all dependencies for the equipo branch, and writes a standalone `TeamPage.jsx`. Source company from `useWorkspace().currentCompany`. Header same shape as ProjectsPage but title "{companyName} · Equipo" or just "Equipo" inside `<WorkspaceLayout>` (decide based on visual hierarchy; the sidebar already shows the active company, so the page header can lead with "Equipo").

- [ ] **Step 3: Verify build + commit**

```bash
cd /Users/adrian/GitHub/webbrief/.claude/worktrees/workspace-switcher/frontend
npx vite build --mode development 2>&1 | tail -3
cd ..
git add frontend/src/pages/workspace/TeamPage.jsx
git commit -m "feat(workspace): extract TeamPage from CompanyPage

Carries the 'Equipo' tab UI + state + handlers into its own page.
Sources the active company from useWorkspace(). DEMO_MEMBERS logic
preserved.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task B7: ActivityPage (extract from CompanyPage tab)

**Files:**
- Create: `frontend/src/pages/workspace/ActivityPage.jsx`

Same pattern, for the "Actividad" tab (CompanyPage.jsx lines 987-1010).

- [ ] **Step 1: Extract**

```bash
sed -n '987,1011p' frontend/src/pages/CompanyPage.jsx > /tmp/actividad-tab.jsx
```

The "Actividad" tab depends on:
- `activity`, `activityLoading`
- The activity-load effect (CompanyPage.jsx lines 278-294 — fires when activeTab === 'actividad')
- Activity event rendering helpers

- [ ] **Step 2: Write the page**

Implementer extracts to a standalone `ActivityPage.jsx`. Source company from `useWorkspace().currentCompany`. Trigger the activity fetch on mount (it's lazy in the original because it was tab-gated; in the standalone page it always loads).

- [ ] **Step 3: Verify build + commit**

```bash
cd /Users/adrian/GitHub/webbrief/.claude/worktrees/workspace-switcher/frontend
npx vite build --mode development 2>&1 | tail -3
cd ..
git add frontend/src/pages/workspace/ActivityPage.jsx
git commit -m "feat(workspace): extract ActivityPage from CompanyPage

Carries the 'Actividad' tab into its own page. Activity fetch now
runs on mount (no longer gated by tab switch).

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task B8: App.jsx — mount new routes + redirects

**Files:**
- Modify: `frontend/src/App.jsx`

- [ ] **Step 1: Add lazy imports**

Near the other `lazy(() => import(...))` lines at the top of `frontend/src/App.jsx`, add:

```jsx
const WorkspaceLayout = lazy(() => import('./components/layout/WorkspaceLayout'))
const ProjectsPage = lazy(() => import('./pages/workspace/ProjectsPage'))
const TeamPage = lazy(() => import('./pages/workspace/TeamPage'))
const ActivityPage = lazy(() => import('./pages/workspace/ActivityPage'))
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'))
```

Also add a non-lazy import for the `CompanyRedirect` helper (next sub-step):

```jsx
import CompanyRedirect from './components/layout/CompanyRedirect'
```

- [ ] **Step 2: Create CompanyRedirect**

Create `frontend/src/components/layout/CompanyRedirect.jsx`:

```jsx
import { Navigate, useParams } from 'react-router-dom'
import { useWorkspace } from '../../contexts/WorkspaceContext'
import { companyToSlug } from '../../lib/companySlug'
import NotFoundPage from '../../pages/NotFoundPage'

/**
 * /companies/:companyId → /c/:companySlug/projects.
 * Preserves legacy bookmarks. If the id doesn't resolve, render 404.
 */
export default function CompanyRedirect() {
  const { companyId } = useParams()
  const { accessibleCompanies, loading } = useWorkspace()

  if (loading) return null
  const company = accessibleCompanies.find((c) => c.id === companyId)
  if (!company) return <NotFoundPage />
  return <Navigate to={`/c/${companyToSlug(company)}/projects`} replace />
}
```

- [ ] **Step 3: Mount the routes**

Inside `AppRoutes` in `frontend/src/App.jsx`, find the existing route block under `<Route path="/" element={<PrivateRoute><AppShell /></PrivateRoute>}>`. Add THREE new child route entries BEFORE the existing `<Route path="companies" ...>` line:

```jsx
            <Route path="c/:companySlug" element={<WorkspaceLayout />}>
              <Route index element={<Navigate to="projects" replace />} />
              <Route path="projects" element={<ProjectsPage />} />
              <Route path="team" element={<TeamPage />} />
              <Route path="activity" element={<ActivityPage />} />
            </Route>
            <Route path="companies/:companyId" element={<CompanyRedirect />} />
            <Route path="not-found" element={<NotFoundPage />} />
```

After the existing `<Route path="new-project" ...>` (or wherever the AppShell children end), add a catch-all:

```jsx
            <Route path="*" element={<NotFoundPage />} />
```

- [ ] **Step 4: Update the root redirect**

Find the existing `<Route index element={<Navigate to="companies" replace />} />` and add a `<DefaultRedirect />` alongside it OR replace its element. Simpler: create a small `DefaultRedirect` component INLINE inside App.jsx (above `AppRoutes`):

```jsx
function DefaultRedirect() {
  const { currentCompany, accessibleCompanies, loading } = useWorkspace()
  if (loading) return null
  if (currentCompany) {
    return <Navigate to={`/c/${companyToSlug(currentCompany)}/projects`} replace />
  }
  // No accessible companies — go to the listing page (admin without memberships).
  if (accessibleCompanies.length === 0) return <Navigate to="/companies" replace />
  // Fallback: send to first accessible company.
  return <Navigate to={`/c/${companyToSlug(accessibleCompanies[0])}/projects`} replace />
}
```

Add these imports at the top of `App.jsx`:

```jsx
import { useWorkspace } from './contexts/WorkspaceContext'
import { companyToSlug } from './lib/companySlug'
```

Replace the existing root index route:

```jsx
            <Route index element={<Navigate to="companies" replace />} />
```

with:

```jsx
            <Route index element={<DefaultRedirect />} />
```

Also update the `/dashboard` redirect:

```jsx
            <Route path="dashboard" element={<Navigate to="/companies" replace />} />
```

→

```jsx
            <Route path="dashboard" element={<DefaultRedirect />} />
```

- [ ] **Step 5: Verify build + smoke test**

```bash
cd /Users/adrian/GitHub/webbrief/.claude/worktrees/workspace-switcher/frontend
npx vite build --mode development 2>&1 | tail -5
```

- [ ] **Step 6: Commit**

```bash
cd /Users/adrian/GitHub/webbrief/.claude/worktrees/workspace-switcher
git add frontend/src/App.jsx frontend/src/components/layout/CompanyRedirect.jsx
git commit -m "feat(workspace): mount new /c/:companySlug routes + redirects

- /c/:companySlug → WorkspaceLayout (resolves slug → 404 or Outlet)
  - index → redirect to projects
  - /projects, /team, /activity → respective pages
- /companies/:companyId → CompanyRedirect → /c/:slug/projects
- /not-found → NotFoundPage (canonical link target)
- * → NotFoundPage (catch-all)
- / and /dashboard → DefaultRedirect (active company or /companies)

Old /companies (listing) route preserved for now.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task B9: AppShell sidebar reorganization

**Files:**
- Modify: `frontend/src/components/layout/AppShell.jsx`

- [ ] **Step 1: Update imports**

In `frontend/src/components/layout/AppShell.jsx`, replace the existing lucide-react import line to add `Folder`, `Activity`, `Building`, and keep the existing icons. Find:

```jsx
import { Settings, Building2, Users, Shield, Archive, Trash2, Moon, Sun, Plug } from 'lucide-react'
```

Replace with:

```jsx
import { Settings, Building2, Users, Shield, Archive, Trash2, Moon, Sun, Plug, Folder, Activity, UserSquare2 } from 'lucide-react'
```

(If `UserSquare2` is not available, use `Users` for the "Equipo" item too — they're visually distinct enough by label.)

Also replace the existing `roleCapabilities` import to add `canCreateCompany`:

```jsx
import { canManageUsersNav, canUseSecurityNav, canUseTrashNav, isAdmin } from '../../lib/roleCapabilities'
```

→

```jsx
import { canManageUsersNav, canUseSecurityNav, canUseTrashNav, isAdmin, canCreateCompany } from '../../lib/roleCapabilities'
```

- [ ] **Step 2: Use the new capability**

Find the line in AppShell that computes `canCreateCompany`:

```jsx
const canCreateCompany = isAdmin(currentUser) || (currentUser?.memberships || []).some((m) => m.role === 'manager')
```

Replace with the import-based one (rename the local to avoid shadowing if needed — but JS allows shadowing). The cleanest is:

```jsx
const canCreateCompanyLocal = canCreateCompany(currentUser)
```

Then use `canCreateCompanyLocal` in the `<WorkspaceSwitcher>` mount instead of `canCreateCompany`. OR rename the import:

```jsx
import { ..., canCreateCompany as canCreateCompanyCapability } from '../../lib/roleCapabilities'
// ...
const canCreateCompany = canCreateCompanyCapability(currentUser)
```

Pick one approach and stick to it. Document the choice in the diff.

- [ ] **Step 3: Add Workspace nav items**

Find the existing "Principal" nav section in AppShell.jsx:

```jsx
<div className={styles.navSection}>
  <p className={styles.navSectionLabel}>Principal</p>
  <NavLink to="/companies" ...>...Empresas</NavLink>
  {canManageUsers && <NavLink ...>Usuarios</NavLink>}
  <NavLink to="/integrations" ...>Integraciones</NavLink>
</div>
```

You need:
1. Compute the active company slug:
```jsx
const { currentCompanySlug } = useWorkspace()
```
2. Replace the `<NavLink to="/companies">` block (Empresas) with THREE new items pointed at the workspace routes, gated on the slug being present:

```jsx
{currentCompanySlug && (
  <>
    <NavLink to={`/c/${currentCompanySlug}/projects`} className={...}>
      <Folder className={styles.navIcon} aria-hidden="true" />
      Proyectos
    </NavLink>
    <NavLink to={`/c/${currentCompanySlug}/team`} className={...}>
      <UserSquare2 className={styles.navIcon} aria-hidden="true" />
      Equipo
    </NavLink>
    <NavLink to={`/c/${currentCompanySlug}/activity`} className={...}>
      <Activity className={styles.navIcon} aria-hidden="true" />
      Actividad
    </NavLink>
  </>
)}
```

Mirror the className pattern of the existing NavLinks (`isActive ? styles.navItemActive : styles.navItem`).

- [ ] **Step 4: Move "Empresas" to Admin section, gated**

In the existing Admin section (where Seguridad / Archivados / Papelera live), add a conditional Empresas NavLink ONLY if the user has ≥3 companies OR is platform admin:

```jsx
const canSeeCompaniesListNav = isAdmin(currentUser) || accessibleCompanies.length >= 3

// ...inside Admin section JSX...
{canSeeCompaniesListNav && (
  <NavLink to="/companies" className={...}>
    <Building2 className={styles.navIcon} aria-hidden="true" />
    Empresas
  </NavLink>
)}
```

And the Admin section's outer conditional needs to include this new gate so the section appears for `canSeeCompaniesListNav` users too:

```jsx
{(canUseSecurity || canUseTrash || canSeeCompaniesListNav) && (
  <>
    <p className={styles.navSectionLabel}>Admin</p>
    ...
  </>
)}
```

- [ ] **Step 5: Verify build + smoke test**

```bash
cd /Users/adrian/GitHub/webbrief/.claude/worktrees/workspace-switcher/frontend
npx vite build --mode development 2>&1 | tail -5
```

- [ ] **Step 6: Commit**

```bash
cd /Users/adrian/GitHub/webbrief/.claude/worktrees/workspace-switcher
git add frontend/src/components/layout/AppShell.jsx
git commit -m "feat(workspace): reorganize sidebar — 3 nav items + Empresas to Admin

Replaces the single 'Empresas' nav item with three workspace-scoped
items (Proyectos, Equipo, Actividad) pointed at /c/:slug/*. The old
'Empresas' link moves to the Admin section and only renders when
the user has 3+ companies or is a platform admin.

Uses the new canCreateCompany capability helper for the switcher
gate (replaces inline duplication).

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task B10: CompaniesPage — call workspace.refresh() after mutations

**Files:**
- Modify: `frontend/src/pages/CompaniesPage.jsx`

- [ ] **Step 1: Import useWorkspace**

At the top of `frontend/src/pages/CompaniesPage.jsx`, add:

```jsx
import { useWorkspace } from '../contexts/WorkspaceContext'
```

- [ ] **Step 2: Use refresh after mutations**

Inside `CompaniesPage`, near the other top-of-function hooks:

```jsx
const { refresh: refreshWorkspace } = useWorkspace()
```

Find the mutation handlers — they're around lines 165-265 (`handleCreateCompany`, `handleCompanyArchive`, `handleCompanyTrash`, `handleBulkArchive`, `handleBulkTrash`). After each one's successful path, add:

```jsx
refreshWorkspace()
```

Be careful NOT to await it — these handlers shouldn't block on a refresh. Fire and forget.

- [ ] **Step 3: Verify build + commit**

```bash
cd /Users/adrian/GitHub/webbrief/.claude/worktrees/workspace-switcher/frontend
npx vite build --mode development 2>&1 | tail -3
cd ..
git add frontend/src/pages/CompaniesPage.jsx
git commit -m "feat(workspace): refresh workspace after CompaniesPage mutations

After create/archive/trash (single or bulk) on /companies, call
useWorkspace().refresh() so the sidebar switcher picks up the change
immediately. Fire-and-forget — handlers don't await.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task B11: Controller E2E verification (Fase B)

Performed by the orchestrator (no subagent dispatch).

- [ ] **Step 1: Build**

```bash
cd /Users/adrian/GitHub/webbrief/.claude/worktrees/workspace-switcher/frontend
npx vite build --mode development 2>&1 | tail -3
```

Expected: ✓ built.

- [ ] **Step 2: Module load checks via curl**

```bash
cd /Users/adrian/GitHub/webbrief/.claude/worktrees/workspace-switcher/frontend
(npx vite --port 5174 > /tmp/vite-b.log 2>&1 &)
sleep 4
# Each new module compiles cleanly
for p in \
  /src/pages/NotFoundPage.jsx \
  /src/components/layout/WorkspaceLayout.jsx \
  /src/pages/workspace/ProjectsPage.jsx \
  /src/pages/workspace/TeamPage.jsx \
  /src/pages/workspace/ActivityPage.jsx \
  /src/components/layout/CompanyRedirect.jsx; do
  status=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:5174$p")
  echo "$p -> $status"
done
pkill -f "vite --port 5174" 2>/dev/null
```

Expected: every line shows `200`.

- [ ] **Step 3: Stats**

```bash
cd /Users/adrian/GitHub/webbrief/.claude/worktrees/workspace-switcher
git log --oneline 3f06aa5..HEAD
git diff --stat 3f06aa5..HEAD
```

Expected: 9-10 new commits (B1-B10), several new files under `frontend/src/pages/workspace/`, ~1500-2500 LOC delta (some additions for new pages, the rest reusable from the old CompanyPage tabs).

- [ ] **Step 4: Spanish neutro check**

```bash
grep -rE "podés|tenés|abrí|copiá|querés|contactá|hacé|invitá|guardá|pedí" \
  frontend/src/pages/workspace/ \
  frontend/src/components/layout/WorkspaceLayout.jsx \
  frontend/src/components/layout/CompanyRedirect.jsx \
  frontend/src/pages/NotFoundPage.jsx \
  2>&1 | grep -v "Binary" | head -10 || echo "0 matches"
```

Expected: `0 matches`.

- [ ] **Step 5: Hex hardcoded check**

```bash
grep -rE "#[0-9a-fA-F]{3,6}" \
  frontend/src/components/layout/WorkspaceLayout.jsx \
  frontend/src/components/layout/CompanyRedirect.jsx \
  frontend/src/pages/NotFoundPage.* \
  frontend/src/pages/workspace/ \
  2>&1 | grep -v "Binary" | head -10 || echo "0 matches"
```

Expected: `0 matches`.

---

## Self-Review

**Spec coverage:**
- §"Route map" → B4 (WorkspaceLayout) + B8 (App.jsx routes + redirects)
- §"WorkspaceContext API → refresh" → B2
- §"NotFoundPage" → B3
- §"Switcher dropdown / Crear empresa" → already fixed in A6 critical
- §"Sidebar reorganized" → B9
- §"3 split pages" → B5/B6/B7
- §"Onboarding handlers" → Fase C
- §"Pick default company" → already in Fase A; B8 DefaultRedirect uses it indirectly via WorkspaceContext

**Placeholder scan:** No TBD/TODO/FIXME — every step has runnable code or commands.

**Type consistency:**
- `currentCompany`, `currentCompanySlug`, `accessibleCompanies`, `switchCompany`, `refresh`, `loading` — consistent shape across B2 / B4 / B8 / B9
- `companyToSlug(company)`, `findCompanyBySlug(companies, slug)` — Fase A signatures unchanged

**Risk surface:**
- The extraction tasks (B5/B6/B7) are large and depend on `CompanyPage.jsx`. We DO NOT delete the original in Fase B — Fase C handles cleanup after grep sweep confirms no remaining references.
- `WorkspaceLayout`'s `switchCompany` effect could race with the user clicking the sidebar switcher; the early-return on already-matching slug prevents the loop.

---

## What happens next (Fase C preview)

After Fase B merges:
1. Update onboarding `OnboardingChecklist` task-click handlers to navigate to `/c/:slug/projects` etc. — currently they navigate to `/companies`.
2. Delete `frontend/src/pages/CompanyPage.jsx` once a grep sweep confirms no remaining references.
3. Final clean-up: `grep -rn "CompanyPage\|/companies/" frontend/src` should be empty for non-redirect references.
4. Optional: add tests for `companySlug.js` helpers (deferred from Fase A).
