# Workspace Switcher Refactor — Design Spec

**Date:** 2026-06-22
**Status:** Approved design — ready for implementation plan
**Replaces:** the current `/companies` list + `/companies/:id` tabbed detail pattern
**Out of scope (deferred):** project slugs (`/project/web-capilea-x-a3f9e2/editor`), v3.0.0 version bump. Tracked separately.

---

## Context

WeBrief currently treats "empresa" (workspace) as a top-level entity with its own listing screen. Most users have 1-2 companies, so this dedicated screen is a heavy chrome for a low-cardinality concept. The new design folds companies into the projects experience using a **workspace switcher** in the sidebar (the Linear / Vercel / Slack / Notion pattern). Each section that used to be a tab inside `CompanyPage` (Proyectos / Equipo / Actividad) becomes a top-level nav item scoped to the active company.

**Goal:** make a user with 1 company feel like there is no "companies" concept to manage — just *their workspace*. Scale gracefully to 2+ companies via the switcher.

---

## Architecture

### Route map

```
BEFORE                          AFTER
/companies                      /c/:companySlug/projects     ← was the "Proyectos" tab
/companies/:companyId           /c/:companySlug/team         ← was the "Equipo" tab
                                /c/:companySlug/activity     ← was the "Actividad" tab
                                /companies                   ← still exists, listing screen, hidden from sidebar unless user has ≥3 companies OR is platform admin
                                /companies/:companyId        ← 301-style redirect → /c/:slug/projects (bookmark compat)
                                /not-found                   ← 404 page
                                *                            ← catch-all → /not-found
/                               ← redirect → /c/:defaultSlug/projects (resolved per §"Default company resolution")
/new-project                    (unchanged; accepts ?company=:slug to prefill)
/project/:id/editor             (unchanged; project knows its company via project.company_id)
```

URLs use **English path segments** for consistency with the rest of the codebase (`/users`, `/security`, `/integrations`). Labels in the UI stay in Spanish neutro.

### Resolving the active company

A new `WorkspaceContext` is mounted under `AuthProvider`. It exposes:

```js
{
  currentCompany,            // the resolved company object, or null while loading
  accessibleCompanies,       // array of companies the user has access to (non-archived, non-trashed)
  switchCompany(slug),       // changes active + writes localStorage + navigates
  loading,                   // true during initial fetch
}
```

Resolution algorithm on mount (and on every URL change containing `:companySlug`):

1. **URL has `/c/:slug/...`** → that slug is the truth. Write to localStorage. If slug doesn't exist or user has no access → render `<NotFoundPage>` inline (preserves URL).
2. **No URL slug** → read `localStorage["wb-active-company:" + userId]`.
3. **Still nothing** → first non-internal company in `currentUser.memberships`.
4. **Still nothing** (admin with zero memberships, rare) → redirect to `/companies` (the listing).

`switchCompany(slug)` updates the URL by swapping the slug segment **while preserving the section**: `/c/testing/team` → `/c/capilea/team`. This way the user stays on the same conceptual page when they switch.

**Project navigation cross-company side-effect**: when the user opens `/project/:id/editor` and that project's `company_id` differs from `currentCompany.id`, the `WorkspaceContext` silently updates the active company (and localStorage) so the "Back" / sidebar links lead to the right place.

### Component decomposition

| Component | File | Responsibility |
|---|---|---|
| `WorkspaceContext` | `frontend/src/contexts/WorkspaceContext.jsx` | Provider + `useCurrentCompany()` hook. Owns active-company state and localStorage persistence |
| `WorkspaceSwitcher` | `frontend/src/components/layout/WorkspaceSwitcher.jsx` | Sidebar dropdown. Lists `accessibleCompanies`, surfaces "Crear empresa" + "Ver todas" |
| `WorkspaceLayout` | `frontend/src/components/layout/WorkspaceLayout.jsx` | Route wrapper for `/c/:companySlug/*`. Reads slug → resolves company → renders 404 if invalid → renders nested `<Outlet />` |
| `ProjectsPage` | `frontend/src/pages/workspace/ProjectsPage.jsx` | Extracted from `CompanyPage` tab. Consumes `useCurrentCompany()` |
| `TeamPage` | `frontend/src/pages/workspace/TeamPage.jsx` | Extracted from `CompanyPage` tab |
| `ActivityPage` | `frontend/src/pages/workspace/ActivityPage.jsx` | Extracted from `CompanyPage` tab |
| `CompaniesListPage` | `frontend/src/pages/CompaniesListPage.jsx` | Renamed from current `CompaniesPage.jsx`. No functional change |
| `NotFoundPage` | `frontend/src/pages/NotFoundPage.jsx` | 404 surface, reuses `EmptyState` primitive from Fase 3a |

### Sidebar layout

```
┌─────────────────────────────────┐
│  W  WeBrief                     │  brand (unchanged)
│                                 │
│  ┌─────────────────────────┐    │
│  │ T  Testing            ▾ │    │  ← WorkspaceSwitcher (NEW)
│  └─────────────────────────┘    │
│                                 │
│  PRINCIPAL                      │
│  📁 Proyectos                   │  ← /c/:slug/projects (NEW nav item)
│  👥 Equipo                      │  ← /c/:slug/team    (NEW nav item)
│  📊 Actividad                   │  ← /c/:slug/activity (NEW nav item)
│  🔌 Integraciones               │  ← /integrations (unchanged)
│                                 │
│  ADMIN                          │  (gated by canManageUsersNav OR canUseSecurityNav OR ≥3 companies)
│  👤 Usuarios                    │  ← /users (unchanged)
│  🛡  Seguridad                  │  ← /security (admin-only, unchanged)
│  🏢 Empresas                    │  ← /companies — VISIBLE only if user has ≥3 companies OR platformRole === 'admin'
│  📦 Archivados                  │  ← /archive (unchanged)
│  🗑  Papelera                   │  ← /trash (unchanged)
│                                 │
│  [user card · settings · dark · logout · v2.0.0]
└─────────────────────────────────┘
```

**Diff vs. current sidebar:**
- ➕ `<WorkspaceSwitcher>` mounted between brand and first nav section
- ➕ Three new "PRINCIPAL" items: Proyectos / Equipo / Actividad (each is a `NavLink` to `/c/:currentSlug/<section>`)
- ➖ "Empresas" leaves "PRINCIPAL", moves to "ADMIN", appears conditionally
- The "PRINCIPAL" / "ADMIN" labels and surrounding chrome remain

### Switcher dropdown

```
┌─────────────────────────────────┐
│  🔍  Buscar empresa             │  ← input, shown only if accessibleCompanies.length >= 5
│  ─────────────────────────────  │
│  ✓ T  Testing                   │  ← active, has chk icon, --wb-color-primary-100 background
│    C  Capilea                   │  ← inactive, plain
│    W  WeBrief             interna │ ← internal company gets a "interna" badge
│  ─────────────────────────────  │
│  +    Crear empresa             │  ← only if canCreateCompanies(user)
│  ☰    Ver todas (4)             │  ← only if accessibleCompanies.length >= 3 OR platformRole === 'admin'
└─────────────────────────────────┘
```

Interactions:
- Click on a non-active company → `switchCompany(slug)` → updates localStorage + navigates to `/c/:newSlug/<currentSection>`
- "Crear empresa" → opens the existing create-company `Modal` directly (no route navigation needed)
- "Ver todas" → `navigate('/companies')` (the listing screen)
- ESC closes the dropdown; click-outside closes
- Pattern reuses `KebabMenu`'s portal + scroll-resync logic (the dropdown is portaled to `document.body` to escape the sidebar's stacking context)

Empty / pending states inside the dropdown:
- `accessibleCompanies.length === 0` → only "Crear empresa" is shown (no list)
- `loading` → small skeleton row inside the dropdown

### Default company resolution at app boot

When the user lands at `/` (post-login redirect from `AppShell`'s root route):

```js
function pickDefaultCompany(user, accessibleCompanies) {
  const stored = readLocalStorage(`wb-active-company:${user.id}`)
  if (stored && accessibleCompanies.find(c => c.slug === stored)) return stored
  const nonInternal = accessibleCompanies.find(c => !c.isInternal)
  if (nonInternal) return nonInternal.slug
  if (accessibleCompanies.length > 0) return accessibleCompanies[0].slug
  return null  // → redirect to /companies for setup
}
```

### NotFoundPage

Renders inside `AppShell` (so the sidebar stays visible) using `EmptyState`:

```jsx
<EmptyState
  icon={FileQuestion}
  title="No encontrado"
  body="La página que buscas no existe o no tienes acceso a ella."
  cta={{ label: 'Volver al inicio', onClick: () => navigate(`/c/${defaultSlug}/projects`) }}
/>
```

**Important security property:** the same component is rendered for *"company slug doesn't exist"* and *"company exists but you're not a member"*. This avoids leaking which companies exist to non-members. Backend already enforces this for `/api/companies/:id`.

Mounted via:
- Inside `WorkspaceLayout` when slug resolution fails (preserves the failing URL in the address bar)
- As a top-level catch-all route: `<Route path="*" element={<NotFoundPage />} />`
- Top-level `/not-found` explicit route for canonical linking from emails, etc.

### Data flow

```
   ┌─────────────────┐
   │   AuthProvider  │
   └────────┬────────┘
            │
   ┌────────▼────────┐    fetches /api/companies once
   │ WorkspaceProvider │ ──→ accessibleCompanies (cached in sessionStorage:webrief:companies)
   └────────┬────────┘
            │
   ┌────────▼────────┐
   │   <Routes>      │
   │                 │
   │  /c/:slug/* ──→ WorkspaceLayout ─┬─ ProjectsPage ──→ fetches /api/companies/:id/projects
   │                                  ├─ TeamPage     ──→ fetches /api/companies/:id/members
   │                                  └─ ActivityPage ──→ fetches /api/companies/:id/activity
   └─────────────────┘
```

The 1011-LOC `CompanyPage` is split because each tab today fetches its own data but they're tangled in one file. Splitting yields three focused ~300-400 LOC files, each with one clear data dependency.

### sessionStorage caches

- **Existing**: `webrief:companies` (full list, ~1h cache) — keep as-is
- **Existing**: `webrief:company:<id>` (per-company detail with projects/members) — keep but write happens from each page (Projects writes the projects portion, Team writes members, Activity writes activity)
- **New**: `localStorage["wb-active-company:" + userId]` (just the slug string) — persisted across sessions, scoped per-user so account switching doesn't carry stale state

### Onboarding integration

The current `OnboardingChecklist` task-click handlers navigate to routes that will change:

| Task key | Old route | New route |
|---|---|---|
| `create_company` | `/companies?new=1` | Open the create-company modal directly (calls `WorkspaceContext.openCreateModal()`) |
| `invite_member` | `/companies` | `/c/:slug/team?invite=1` |
| `create_project` | `/new-project` | `/new-project?company=:slug` (the slug pre-fills the company picker) |
| `edit_page` | `/companies` | `/c/:slug/projects` |
| `create_share_link` | `/companies` | `/c/:slug/projects` |
| `leave_comment` | `/companies` | `/c/:slug/projects` |

The `data-firsttime` anchors in `ProjectEditor` and the `FirstTimeTooltipsRoot` orchestrator are unaffected.

---

## Migration & rollout

### Code migration

1. **Add `WorkspaceContext`** under `AuthProvider`. Existing pages keep working because they don't yet consume it.
2. **Add new routes** (`/c/:slug/...`) but DON'T remove old ones yet. New routes mount the 3 new pages.
3. **Add `WorkspaceSwitcher`** to `AppShell` sidebar above the existing nav. Old "Empresas" link still works.
4. **Switch the sidebar** to show new nav items (Proyectos/Equipo/Actividad). Move "Empresas" to Admin, gate on ≥3 companies.
5. **Replace old `CompanyPage` route** (`/companies/:id`) with a redirect to `/c/:slug/projects`.
6. **Update `OnboardingChecklist`** task-click handlers to new routes.
7. **Add 404 page** and catch-all route.
8. **Update root redirect** (`/` → `/c/:defaultSlug/projects`).
9. **Cleanup**: delete `CompanyPage.jsx` once all references migrated.

### URL compat (zero-breaking for bookmarks)

- `/companies/:companyId` → React Router `Navigate` to `/c/:slug/projects` (server-side: not needed; SPA handles it client-side after auth resolves)
- `/companies` → still works, shows the list (hidden from sidebar for users with <3 companies)
- Old internal `navigate('/companies/...')` calls grep'd and replaced

### Risk surface

| Risk | Mitigation |
|---|---|
| User loses their session-stored active company mid-flow | localStorage write is idempotent; resolution falls back to `memberships[0]` |
| `accessibleCompanies` doesn't load before first URL parse | `WorkspaceLayout` shows a brief loading skeleton, no redirect until loaded |
| Two browser tabs editing different companies → localStorage thrash | Use `BroadcastChannel` or simply accept eventual consistency (last-write-wins) — eventual consistency is fine since reads always re-validate against `accessibleCompanies` |
| Old shared bookmark to `/companies/old-id` | Client-side `Navigate` redirects to `/c/:slug/projects` once the id resolves to a slug. If the id is dead → 404 |
| Cache `webrief:company:<id>` invalidated by other tab | Already handled by `storage` event in current code |

---

## Out of scope (will be separate work)

- **Project slugs in URLs** (`/project/web-capilea-x-a3f9e2/editor`) — needs a separate migration (new column `projects.short_id`), backend endpoint changes, and editor route changes. Standalone effort.
- **Version bump to v3.0.0** — happens alongside the project-slug work or when both ship together.
- **Multi-tab broadcast channel** — current `storage` event sync is sufficient.
- **Sticky sidebar collapse state** — if the user collapses the sidebar, that's a different feature.
- **Switching companies inside the editor** — the editor stays scoped to its project's company; switching only happens from the shell.

---

## Definition of done

A user with 1 company:
- Lands on `/c/:theirSlug/projects` post-login
- Sees their company name in the sidebar switcher (no dropdown click needed — single-company is just a label)
- "Empresas" item is NOT in their sidebar
- Bookmark of `/companies/<their-id>` redirects them to `/c/:theirSlug/projects` transparently

A user with 2+ companies:
- Lands on the company they used last (localStorage), or their first non-internal membership
- Clicking the switcher shows a dropdown with all their companies + a check on the active
- Switching navigates them to the equivalent section in the new company (Proyectos → Proyectos)

An admin with 0 memberships:
- Lands on `/companies` (the listing) to create or get invited
- Once they have 1 membership, behaves like a 1-company user

Edge cases:
- `/c/nonexistent/projects` → 404 page (URL preserved)
- `/companies/<deleted-id>` → 404 page
- Random typed route `/foo/bar` → 404 page
- All redirects from old URLs are SPA-side, single-hop, lossless

Build is clean (`npx vite build`). No new npm deps. Spanish neutro strict.

---

## Implementation phases (preview, not committed yet)

Tentatively, the work decomposes into ~3 PR-sized phases:

- **Phase A — Plumbing**: `WorkspaceContext`, helpers, sidebar `WorkspaceSwitcher`, no nav reorganization yet
- **Phase B — Routes**: new `/c/:slug/*` routes, split `CompanyPage` into 3 pages, redirects from old routes, sidebar reorg, 404 page
- **Phase C — Onboarding integration + cleanup**: update onboarding task targets, delete old `CompanyPage.jsx`, final grep sweep

Each phase ships independently and the app stays functional throughout.

---

## Spec self-review

- [x] **No placeholders**: every decision is committed (URL pattern, default resolution, sidebar position, dropdown anatomy, route compat strategy).
- [x] **Internal consistency**: the sidebar diagram matches the routes diagram matches the component table.
- [x] **Scope**: focused on workspace switcher. Project slugs and v3 bump explicitly deferred.
- [x] **Ambiguity**: edge cases (cross-company project, admin with zero memberships, accessibility load race) have explicit answers.
- [x] **Pattern reuse**: `EmptyState` (Fase 3a), `KebabMenu` portal pattern (existing). No new primitives needed beyond `WorkspaceSwitcher`.
