# Admin Shell Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the WeBrief admin shell with Royal Blue accent, elevated tinted card shadows, a restructured sidebar with section labels and dark mode toggle, and a tab-based CompanyPage layout (Proyectos / Equipo / Actividad).

**Architecture:** Token-first approach — update CSS custom properties in `tokens.css` first so every downstream component inherits the new palette automatically. Sidebar and page layouts are then updated component by component. A new backend endpoint powers the Actividad tab. The editor is not touched.

**Tech Stack:** React + CSS Modules + Lucide icons (already installed) + Express/Supabase (backend). No new npm packages required.

**Branch:** Start from `main`. Create a new worktree via `superpowers:using-git-worktrees`.

---

## File Map

| File | Change |
|---|---|
| `frontend/src/styles/tokens.css` | Primary palette → Royal Blue; add `--wb-shadow-card*`; add `[data-theme="dark"]` block |
| `frontend/src/components/layout/AppShell.jsx` | Section labels, icons, dark mode toggle button + logic |
| `frontend/src/components/layout/AppShell.module.css` | Active state → blue tinted; section label styles; dark mode toggle styles |
| `frontend/src/pages/CompaniesPage.module.css` | Card elevation with `--wb-shadow-card` |
| `frontend/src/pages/CompanyPage.jsx` | Full tab refactor: Proyectos / Equipo / Actividad |
| `frontend/src/pages/CompanyPage.module.css` | Tab styles; card elevation |
| `backend/src/routes/companies.js` | Add `GET /:id/activity` endpoint |

---

## Task 1: Royal Blue tokens + shadow-card tokens + dark mode variables

**Files:**
- Modify: `frontend/src/styles/tokens.css`

### Context

Currently `--wb-color-primary-*` is a near-black/dark-navy scale (used as the app's dark brand color). We replace it with Royal Blue. **Critical:** `--wb-text` currently references `--wb-color-primary-900`. After the change, primary-900 is `#1e3a8a` (dark blue) — body text would turn blue, which the user explicitly rejected. Fix: point `--wb-text` to `--wb-color-neutral-900` instead.

- [ ] **Open `frontend/src/styles/tokens.css`**

- [ ] **Replace the primary palette block (lines ~23-32) with Royal Blue**

Find this block:
```css
  /* Primary (cool blue, base = #091223) */
  --wb-color-primary-50:  #f1f5f9;
  --wb-color-primary-100: #e2e8f0;
  --wb-color-primary-200: #cbd5e1;
  --wb-color-primary-300: #94a3b8;
  --wb-color-primary-400: #475569;
  --wb-color-primary-500: #1e293b;
  --wb-color-primary-600: #111827;
  --wb-color-primary-700: #0b1220;
  --wb-color-primary-800: #0a111e;
  --wb-color-primary-900: #091223; /* current --wb-primary */
```

Replace with:
```css
  /* Primary (Royal Blue — #2563eb at -600) */
  --wb-color-primary-50:  #eff6ff;
  --wb-color-primary-100: #dbeafe;
  --wb-color-primary-200: #bfdbfe;
  --wb-color-primary-300: #93c5fd;
  --wb-color-primary-400: #60a5fa;
  --wb-color-primary-500: #3b82f6;
  --wb-color-primary-600: #2563eb; /* main accent */
  --wb-color-primary-700: #1d4ed8;
  --wb-color-primary-800: #1e40af;
  --wb-color-primary-900: #1e3a8a;
```

- [ ] **Fix the legacy alias block — update `--wb-text`, `--wb-primary`, `--wb-primary-hover`, `--wb-primary-soft`**

Find:
```css
  --wb-bg: var(--wb-color-neutral-50);            /* was #f8fafc */
  --wb-surface: #ffffff;                          /* no canonical needed */
  --wb-surface-muted: var(--wb-color-neutral-100);/* was #f1f5f9 */
  --wb-border: #dbe3f0;                           /* keep literal — between 200 and 300 */
  --wb-border-strong: #c7d2e5;                    /* keep literal */
  --wb-text: var(--wb-color-primary-900);         /* was #091223 */
  --wb-text-muted: var(--wb-color-neutral-500);   /* was #64748b */
  --wb-primary: var(--wb-color-primary-900);      /* was #091223 */
  --wb-primary-hover: var(--wb-color-primary-500);/* was #1e293b */
  --wb-primary-soft: var(--wb-color-neutral-200); /* was #e2e8f0 */
```

Replace with:
```css
  --wb-bg: var(--wb-color-neutral-50);            /* #f8fafc */
  --wb-surface: #ffffff;
  --wb-surface-muted: var(--wb-color-neutral-100);/* #f1f5f9 */
  --wb-border: #dbe3f0;
  --wb-border-strong: #c7d2e5;
  --wb-text: var(--wb-color-neutral-900);         /* #0f172a — slate, NOT blue */
  --wb-text-muted: var(--wb-color-neutral-500);   /* #64748b */
  --wb-primary: var(--wb-color-primary-600);      /* #2563eb — Royal Blue */
  --wb-primary-hover: var(--wb-color-primary-700);/* #1d4ed8 */
  --wb-primary-soft: var(--wb-color-primary-50);  /* #eff6ff */
```

- [ ] **Add shadow-card tokens after the existing shadow scale** (after the `--wb-shadow-sm` line near the bottom of `:root`)

```css
  /* Card elevation — blue-tinted (light mode only; dark overrides below) */
  --wb-shadow-card:       0 4px 16px rgba(37, 99, 235, 0.10), 0 1px 3px rgba(0, 0, 0, 0.04);
  --wb-shadow-card-hover: 0 8px 24px rgba(37, 99, 235, 0.14), 0 2px 6px rgba(0, 0, 0, 0.06);
```

- [ ] **Add dark mode variable block at the very end of the file**, after the last closing brace of `:root`:

```css
/* ============================================================
   Dark mode overrides
   Applied by setting data-theme="dark" on <html>.
   Toggle persists to localStorage; applied before paint via
   inline script in index.html to avoid flash.
   ============================================================ */
[data-theme="dark"] {
  --wb-bg:            #0d0d10;
  --wb-surface:       #1c1c1e;
  --wb-surface-muted: #111113;
  --wb-border:        #1e1e22;
  --wb-border-strong: #2a2a2e;
  --wb-text:          #f5f5f7;
  --wb-text-muted:    #6b6b6e;

  /* Primary on dark: slightly lighter for contrast */
  --wb-color-primary-50:  #1a2a4a;
  --wb-color-primary-600: #3b82f6;
  --wb-color-primary-700: #60a5fa;
  --wb-primary:           var(--wb-color-primary-600);
  --wb-primary-hover:     var(--wb-color-primary-700);
  --wb-primary-soft:      var(--wb-color-primary-50);

  /* Neutral shadow — no blue tint on dark backgrounds */
  --wb-shadow-card:       0 4px 16px rgba(0, 0, 0, 0.30), 0 1px 3px rgba(0, 0, 0, 0.20);
  --wb-shadow-card-hover: 0 8px 24px rgba(0, 0, 0, 0.40), 0 2px 6px rgba(0, 0, 0, 0.24);
}
```

- [ ] **Start the dev server and open the app**

```bash
cd frontend && npm run dev
```

Open `http://localhost:5173`. The sidebar active item should now appear **blue** (not dark navy). Buttons should be blue. Body text should remain **dark/black**. If text turned blue, the `--wb-text` alias fix in step 2 was missed — re-check.

- [ ] **Commit**

```bash
git add frontend/src/styles/tokens.css
git commit -m "feat(tokens): royal blue primary palette + shadow-card + dark mode vars"
```

---

## Task 2: Sidebar — section labels, icons, dark mode toggle

**Files:**
- Modify: `frontend/src/components/layout/AppShell.jsx`
- Modify: `frontend/src/components/layout/AppShell.module.css`

### 2a — AppShell.jsx

- [ ] **Add Moon icon import** (Lucide already installed)

Find the existing import:
```js
import { Settings } from 'lucide-react'
```

Replace with:
```js
import { Settings, Building2, Users, Shield, Archive, Trash2, Moon, Sun } from 'lucide-react'
```

- [ ] **Add dark mode state and toggle function** inside the `AppShell` component, after the existing constants:

```js
  const [darkMode, setDarkMode] = useState(
    () => localStorage.getItem('wb-theme') === 'dark'
  )

  useEffect(() => {
    document.documentElement.dataset.theme = darkMode ? 'dark' : 'light'
    localStorage.setItem('wb-theme', darkMode ? 'dark' : 'light')
  }, [darkMode])
```

- [ ] **Replace the entire `<nav>` block** with the new version that adds section labels and icons:

Find:
```jsx
          <nav className={styles.nav}>
            <NavLink
              to="/companies"
              className={({ isActive }) => (
                isActive ? `${styles.navItem} ${styles.navItemActive}` : styles.navItem
              )}
            >
              Empresas
            </NavLink>
            {canManageUsers && (
              <NavLink
                to="/users"
                className={({ isActive }) => (
                  isActive ? `${styles.navItem} ${styles.navItemActive}` : styles.navItem
                )}
              >
                Usuarios
              </NavLink>
            )}
            {canUseTrash && (
              <>
                <NavLink
                  to="/archive"
                  className={({ isActive }) => (
                    isActive ? `${styles.navItem} ${styles.navItemActive}` : styles.navItem
                  )}
                >
                  Archivados
                </NavLink>
                <NavLink
                  to="/trash"
                  className={({ isActive }) => (
                    isActive ? `${styles.navItem} ${styles.navItemActive}` : styles.navItem
                  )}
                >
                  Papelera
                </NavLink>
              </>
            )}
            {canUseSecurity && (
              <NavLink
                to="/security"
                className={({ isActive }) => (
                  isActive ? `${styles.navItem} ${styles.navItemActive}` : styles.navItem
                )}
              >
                Seguridad
              </NavLink>
            )}
          </nav>
```

Replace with:
```jsx
          <nav className={styles.nav}>
            <p className={styles.navSectionLabel}>Principal</p>
            <NavLink
              to="/companies"
              className={({ isActive }) => (
                isActive ? `${styles.navItem} ${styles.navItemActive}` : styles.navItem
              )}
            >
              <Building2 className={styles.navIcon} aria-hidden="true" />
              Empresas
            </NavLink>
            {canManageUsers && (
              <NavLink
                to="/users"
                className={({ isActive }) => (
                  isActive ? `${styles.navItem} ${styles.navItemActive}` : styles.navItem
                )}
              >
                <Users className={styles.navIcon} aria-hidden="true" />
                Usuarios
              </NavLink>
            )}

            {(canUseSecurity || canUseTrash) && (
              <p className={styles.navSectionLabel}>Admin</p>
            )}
            {canUseSecurity && (
              <NavLink
                to="/security"
                className={({ isActive }) => (
                  isActive ? `${styles.navItem} ${styles.navItemActive}` : styles.navItem
                )}
              >
                <Shield className={styles.navIcon} aria-hidden="true" />
                Seguridad
              </NavLink>
            )}
            {canUseTrash && (
              <>
                <NavLink
                  to="/archive"
                  className={({ isActive }) => (
                    isActive ? `${styles.navItem} ${styles.navItemActive}` : styles.navItem
                  )}
                >
                  <Archive className={styles.navIcon} aria-hidden="true" />
                  Archivados
                </NavLink>
                <NavLink
                  to="/trash"
                  className={({ isActive }) => (
                    isActive ? `${styles.navItem} ${styles.navItemActive}` : styles.navItem
                  )}
                >
                  <Trash2 className={styles.navIcon} aria-hidden="true" />
                  Papelera
                </NavLink>
              </>
            )}
          </nav>
```

- [ ] **Add dark mode toggle button to the sidebar footer**, just before the `<Button variant="secondary"...>` logout button:

```jsx
          <button
            type="button"
            className={styles.darkToggle}
            onClick={() => setDarkMode((d) => !d)}
            aria-label={darkMode ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
          >
            {darkMode ? <Sun size={14} /> : <Moon size={14} />}
            {darkMode ? 'Modo claro' : 'Modo oscuro'}
          </button>
```

### 2b — AppShell.module.css

- [ ] **Rename `.navSection` → `.navSectionLabel`** and update its styles, **replace `.navItemActive`** with the blue-tinted version, and **add `.darkToggle`**:

Find `.navSection` (existing class in the CSS file) and replace the entire rule with:
```css
.navSectionLabel {
  margin: var(--wb-space-4) 0 var(--wb-space-1);
  padding: 0 var(--wb-space-4);
  font-size: var(--wb-text-xs);
  font-weight: var(--wb-weight-bold);
  color: var(--wb-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.navSectionLabel:first-child {
  margin-top: 0;
}
```

Find `.navItemActive` and replace:
```css
.navItemActive {
  background: var(--wb-primary-soft);
  color: var(--wb-primary);
  font-weight: var(--wb-weight-semibold);
}

.navItemActive:hover {
  background: var(--wb-primary-soft);
  color: var(--wb-primary);
}
```

Add `.darkToggle` at the end of the file:
```css
.darkToggle {
  display: flex;
  align-items: center;
  gap: var(--wb-space-2);
  width: 100%;
  padding: var(--wb-space-3) var(--wb-space-4);
  border: 1px solid var(--wb-border);
  border-radius: var(--wb-radius-2);
  background: transparent;
  color: var(--wb-text-muted);
  font-size: var(--wb-text-sm);
  font-family: var(--wb-font-sans);
  cursor: pointer;
  transition: background-color 150ms ease, color 150ms ease;
}

.darkToggle:hover {
  background: var(--wb-surface-muted);
  color: var(--wb-text);
}
```

- [ ] **Verify in browser**: sidebar shows "Principal" / "Admin" section labels with icons; active item is blue-tinted; dark mode toggle button appears; clicking it flips to dark mode and persists on reload.

- [ ] **Commit**

```bash
git add frontend/src/components/layout/AppShell.jsx frontend/src/components/layout/AppShell.module.css
git commit -m "feat(sidebar): section labels, icons, dark mode toggle"
```

---

## Task 3: Add flash-prevention script for dark mode

**Files:**
- Modify: `frontend/index.html`

Without this, users on dark mode will see a white flash before React mounts and reads localStorage.

- [ ] **Open `frontend/index.html`** and add an inline script as the **first child of `<head>`**:

```html
<script>
  (function () {
    var t = localStorage.getItem('wb-theme');
    if (t === 'dark') document.documentElement.dataset.theme = 'dark';
  })();
</script>
```

- [ ] **Verify**: set dark mode, reload — no white flash before the sidebar appears.

- [ ] **Commit**

```bash
git add frontend/index.html
git commit -m "feat(dark-mode): prevent flash-of-white on reload"
```

---

## Task 4: Card elevation — CompaniesPage

**Files:**
- Modify: `frontend/src/pages/CompaniesPage.module.css`

- [ ] **Find the company card class** in `CompaniesPage.module.css` (look for the class applied to each company item — likely `.companyCard`, `.card`, or similar). Add `box-shadow` and update `border` and `border-radius`:

```bash
grep -n "companyCard\|\.card\b" frontend/src/pages/CompaniesPage.module.css
```

- [ ] **Add or update the card rule** — replace whatever `box-shadow` currently exists (or add one if missing):

```css
/* exact class name from grep result above */
.companyCard {           /* or whatever the actual class is */
  /* existing rules stay — only add/change these: */
  border: 1px solid var(--wb-border);
  border-radius: var(--wb-radius-2);  /* 8px */
  box-shadow: var(--wb-shadow-card);
  transition: box-shadow 150ms ease, border-color 150ms ease;
}

.companyCard:hover {
  box-shadow: var(--wb-shadow-card-hover);
  border-color: var(--wb-color-primary-100);
}
```

- [ ] **Verify in browser**: company cards now have a subtle blue-tinted elevation. Hover intensifies the shadow.

- [ ] **Commit**

```bash
git add frontend/src/pages/CompaniesPage.module.css
git commit -m "feat(ui): elevated tinted shadow on company cards"
```

---

## Task 5: CompanyPage — tab layout (Proyectos + Equipo)

**Files:**
- Modify: `frontend/src/pages/CompanyPage.jsx`
- Modify: `frontend/src/pages/CompanyPage.module.css`

This is the largest task. The current 2-column layout (projects main + team sidebar) becomes a single-column layout with 3 tabs. All existing functionality is preserved — only the structural JSX changes.

### 5a — Add tab state

- [ ] **Add `activeTab` state** near the top of the `CompanyPage` component (after existing `useState` declarations):

```js
const [activeTab, setActiveTab] = useState('proyectos')
```

### 5b — Replace workspaceGrid with tab layout in JSX

- [ ] **Locate the section that renders the workspace grid** — it will be a `<div className={styles.workspaceGrid}>` wrapping the projects section and the team Card aside. Replace it with:

```jsx
{/* Tab bar */}
<div className={styles.tabBar} role="tablist">
  {['proyectos', 'equipo', 'actividad'].map((tab) => (
    <button
      key={tab}
      role="tab"
      aria-selected={activeTab === tab}
      className={activeTab === tab ? `${styles.tab} ${styles.tabActive}` : styles.tab}
      onClick={() => setActiveTab(tab)}
    >
      {tab.charAt(0).toUpperCase() + tab.slice(1)}
    </button>
  ))}
</div>

{/* Tab panels */}
<div role="tabpanel" hidden={activeTab !== 'proyectos'} className={styles.tabPanel}>
  {/* === existing projects section content goes here === */}
  {/* Move everything that was inside .projectsSection into this panel */}
</div>

<div role="tabpanel" hidden={activeTab !== 'equipo'} className={styles.tabPanel}>
  {/* === existing team Card (invite form + members list) goes here === */}
  {/* Move the <Card as="aside"> team card content into this panel */}
  {/* Remove the Card wrapper — the tabPanel itself provides the container */}
</div>

<div role="tabpanel" hidden={activeTab !== 'actividad'} className={styles.tabPanel}>
  {/* Actividad content — implemented in Task 7 */}
  <p className={styles.emptyStateCompact}>
    Actividad reciente próximamente.
  </p>
</div>
```

### 5c — Update project card elevation

- [ ] **In `CompanyPage.module.css`**, find `.projectCard` and update its shadow:

```css
.projectCard {
  /* keep all existing rules, replace/add box-shadow and transition */
  box-shadow: var(--wb-shadow-card);
  transition: transform 150ms ease, border-color 150ms ease, box-shadow 150ms ease;
}

.projectCard:hover,
.projectCard:focus-visible {
  transform: translateY(-2px);
  border-color: var(--wb-color-primary-100);
  box-shadow: var(--wb-shadow-card-hover);
  outline: none;
}
```

### 5d — Add tab CSS

- [ ] **Add to `CompanyPage.module.css`**:

```css
.tabBar {
  display: flex;
  gap: 0;
  border-bottom: 1px solid var(--wb-border);
  margin-bottom: var(--wb-space-5);
}

.tab {
  padding: var(--wb-space-3) var(--wb-space-5);
  font-size: var(--wb-text-sm);
  font-weight: var(--wb-weight-medium);
  color: var(--wb-text-muted);
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  cursor: pointer;
  transition: color 150ms ease, border-color 150ms ease;
  font-family: var(--wb-font-sans);
}

.tab:hover {
  color: var(--wb-text);
}

.tabActive {
  color: var(--wb-primary);
  font-weight: var(--wb-weight-semibold);
  border-bottom-color: var(--wb-primary);
}

.tabPanel {
  /* panels are full-width — no sidebar constraint */
}
```

- [ ] **Remove or repurpose `.workspaceGrid` and `.teamCard`** — they're no longer used once the tab layout is applied. Delete those CSS rules (or leave unused ones — they won't cause harm, but clean code is better).

- [ ] **Verify in browser**: Proyectos tab shows the full-width project grid. Equipo tab shows the invite form + members list. Clicking between tabs works. All bulk actions, kebab menus, and invite functionality still work within their respective tabs.

- [ ] **Commit**

```bash
git add frontend/src/pages/CompanyPage.jsx frontend/src/pages/CompanyPage.module.css
git commit -m "feat(company-page): tab layout — Proyectos / Equipo / Actividad"
```

---

## Task 6: Backend — company activity endpoint

**Files:**
- Modify: `backend/src/routes/companies.js`

- [ ] **Open `backend/src/routes/companies.js`** and find the end of the file (before `export default router`).

- [ ] **Add the new endpoint** before `export default router`:

```js
/**
 * GET /api/companies/:id/activity
 * Returns last 50 project_activity events across all projects in this company.
 * Requires: authenticated user with access to this company.
 */
router.get('/:id/activity', requireAuth, async (req, res) => {
  const { id: companyId } = req.params
  const userId = req.user.id

  // Verify user has access to this company
  const { data: membership, error: memberError } = await req.supabase
    .from('company_members')
    .select('role')
    .eq('company_id', companyId)
    .eq('user_id', userId)
    .maybeSingle()

  const isAdmin = req.user.platformRole === 'admin'

  if (!isAdmin && (!membership || memberError)) {
    return res.status(403).json({ error: 'Sin acceso a esta empresa' })
  }

  // Fetch all project IDs for this company
  const { data: projects, error: projectsError } = await req.supabase
    .from('projects')
    .select('id')
    .eq('company_id', companyId)

  if (projectsError) {
    return res.status(500).json({ error: 'Error al cargar proyectos' })
  }

  if (!projects || projects.length === 0) {
    return res.json({ activity: [] })
  }

  const projectIds = projects.map((p) => p.id)

  const { data: activity, error: activityError } = await req.supabase
    .from('project_activity')
    .select('id, event_type, metadata, created_at, project_id, user_id')
    .in('project_id', projectIds)
    .order('created_at', { ascending: false })
    .limit(50)

  if (activityError) {
    if (activityError.code === '42P01') {
      // Table doesn't exist yet — return empty gracefully
      return res.json({ activity: [] })
    }
    return res.status(500).json({ error: 'Error al cargar actividad' })
  }

  return res.json({ activity: activity ?? [] })
})
```

- [ ] **Verify the endpoint manually**:

```bash
# Start backend (from backend/ dir)
node src/index.js

# In another terminal — replace TOKEN and COMPANY_ID with real values
curl -H "Authorization: Bearer TOKEN" \
  http://localhost:3000/api/companies/COMPANY_ID/activity
```

Expected: `{ "activity": [...] }` or `{ "activity": [] }` if no events yet. Should NOT return 404 or 500.

- [ ] **Commit**

```bash
git add backend/src/routes/companies.js
git commit -m "feat(api): GET /companies/:id/activity endpoint"
```

---

## Task 7: CompanyPage — Actividad tab content

**Files:**
- Modify: `frontend/src/pages/CompanyPage.jsx`
- Modify: `frontend/src/pages/CompanyPage.module.css`

### 7a — Fetch activity data

- [ ] **Add activity state** near the other `useState` declarations in `CompanyPage`:

```js
const [activity, setActivity] = useState([])
const [activityLoading, setActivityLoading] = useState(false)
```

- [ ] **Add `useEffect` to load activity when the tab becomes active** (after the existing effects):

```js
useEffect(() => {
  if (activeTab !== 'actividad' || !companyId) return
  let active = true
  setActivityLoading(true)

  apiFetch(`/api/companies/${companyId}/activity`)
    .then((data) => {
      if (active) setActivity(data.activity ?? [])
    })
    .catch(() => {
      if (active) setActivity([])
    })
    .finally(() => {
      if (active) setActivityLoading(false)
    })

  return () => { active = false }
}, [activeTab, companyId])
```

### 7b — Render the Actividad tab panel

- [ ] **Replace the placeholder in the Actividad tabpanel** (from Task 5) with:

```jsx
<div role="tabpanel" hidden={activeTab !== 'actividad'} className={styles.tabPanel}>
  {activityLoading ? (
    <p className={styles.info}>Cargando actividad...</p>
  ) : activity.length === 0 ? (
    <div className={styles.emptyState}>
      <p className={styles.emptyTitle}>Sin actividad registrada</p>
      <p className={styles.emptyText}>
        La actividad de los proyectos de esta empresa aparecerá aquí.
      </p>
    </div>
  ) : (
    <ol className={styles.activityList}>
      {activity.map((event) => (
        <li key={event.id} className={styles.activityItem}>
          <span className={styles.activityType}>{event.event_type}</span>
          <time
            className={styles.activityDate}
            dateTime={event.created_at}
          >
            {formatDate(event.created_at)}
          </time>
        </li>
      ))}
    </ol>
  )}
</div>
```

### 7c — Add activity list CSS

- [ ] **Add to `CompanyPage.module.css`**:

```css
.activityList {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 0;
}

.activityItem {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--wb-space-4);
  padding: var(--wb-space-3) 0;
  border-bottom: 1px solid var(--wb-border);
  font-size: var(--wb-text-sm);
}

.activityItem:last-child {
  border-bottom: none;
}

.activityType {
  color: var(--wb-text);
  font-weight: var(--wb-weight-medium);
}

.activityDate {
  color: var(--wb-text-muted);
  font-size: var(--wb-text-xs);
  flex-shrink: 0;
}
```

- [ ] **Verify**: click the Actividad tab — shows loading state briefly, then either a list of events or the empty state. No console errors.

- [ ] **Commit**

```bash
git add frontend/src/pages/CompanyPage.jsx frontend/src/pages/CompanyPage.module.css
git commit -m "feat(company-page): Actividad tab with company-level activity feed"
```

---

## Task 8: Visual verification pass

No code changes expected — this is a verification sweep.

- [ ] **Start the full dev stack** (frontend + backend)

- [ ] **Check each admin page in light mode:**
  - `/companies` — company cards have blue-tinted elevation, hover works
  - `/companies/:id` — tabs work, project cards elevated, team content in Equipo tab, Actividad tab loads data
  - `/users` — picks up blue primary automatically (buttons, badges)
  - `/security` — no visual regressions
  - `/archive` and `/trash` — no visual regressions
  - Sidebar — section labels visible, icons present, active state is blue-tinted

- [ ] **Toggle dark mode** and check each page:
  - Sidebar goes dark, content panels go dark
  - Cards have neutral (non-blue) shadow
  - Text is light (`#f5f5f7`), not washed out
  - Buttons remain blue (slightly lighter `#3b82f6`)
  - Reload — no white flash

- [ ] **If any regressions found**, fix and commit with `fix(ui): <description>` before marking this task done.

- [ ] **Final commit** (only if any fixes were needed in this task):

```bash
git add -p  # stage only the regression fixes
git commit -m "fix(ui): visual verification fixes"
```

---

## Merge note

The `sad-bell-a5595c` branch has 7 smaller polish commits (aria labels, border separator, etc.). Those are superseded by this redesign for CompanyPage, but the accessibility improvements (aria-live, focus-visible on bulkLink) are worth preserving. After this redesign is merged, cherry-pick commits `72b3ea9` (aria-live) and `ac3e19b` (bulkLink focus-visible) from that branch if they don't conflict.
