# Workspace Switcher — Fase A: Plumbing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire up the data layer for the workspace switcher (Opción A) — a `WorkspaceContext` provider that owns the active-company state plus a `WorkspaceSwitcher` sidebar component — *without* yet reorganizing routes or removing the old `/companies` entries. After Fase A the app behavior is unchanged for end users, but every piece needed for Fase B (routes) is in place and tested.

**Architecture:** Add a `WorkspaceContext` mounted under `AuthProvider` that resolves the active company from URL → localStorage → first non-internal membership, and persists across sessions. A new `WorkspaceSwitcher` component mounts above the existing sidebar nav, reading from the context. The old `/companies` link and `CompanyPage` remain functional through this fase — Fase B will swap them out.

**Tech Stack:** React 18, Vite, react-router-dom v6, lucide-react. No new npm dependencies.

**Working directory:** `/Users/adrian/GitHub/webbrief/.claude/worktrees/workspace-switcher`. All commands assume this is the cwd.

**Companion spec:** [`docs/superpowers/specs/2026-06-22-workspace-switcher-design.md`](../specs/2026-06-22-workspace-switcher-design.md) — §Architecture (Resolving the active company), §Component decomposition.

**Out of scope for Fase A** (will be Fase B/C):
- New routes `/c/:companySlug/*`
- Removing `/companies` from the sidebar
- Splitting `CompanyPage.jsx` into Projects/Team/Activity pages
- NotFoundPage
- Updating onboarding task-click handlers

---

## File map (Fase A only)

| File | Action | Responsibility |
|---|---|---|
| `frontend/src/lib/companySlug.js` | **Create** | Pure helpers: `companyToSlug(company)`, `findCompanyBySlug(companies, slug)`, `activeCompanyStorageKey(userId)` |
| `frontend/src/contexts/WorkspaceContext.jsx` | **Create** | Provider + `useWorkspace()` hook. Owns `currentCompany`, `accessibleCompanies`, `switchCompany`, `openCreateCompanyModal` |
| `frontend/src/App.jsx` | **Modify** | Mount `<WorkspaceProvider>` immediately under `<AuthProvider>` |
| `frontend/src/components/layout/WorkspaceSwitcher.jsx` | **Create** | Sidebar dropdown. Trigger = company avatar+name+chevron. Portal-positioned dropdown with list, create-empresa, ver-todas |
| `frontend/src/components/layout/WorkspaceSwitcher.module.css` | **Create** | All styles for the trigger pill, dropdown panel, items, search input |
| `frontend/src/components/layout/AppShell.jsx` | **Modify** | Mount `<WorkspaceSwitcher />` between the brand block and the first nav section. Old Empresas/Usuarios/Integraciones items unchanged in this fase |

---

## Task A1: Slug helpers module

**Files:**
- Create: `frontend/src/lib/companySlug.js`

- [ ] **Step 1: Write the module**

Create `frontend/src/lib/companySlug.js` with this EXACT content:

```js
/**
 * Pure helpers for company slug → company resolution.
 * No React, no localStorage, no side effects. Safe to import anywhere.
 *
 * Companies have a `slug` field server-side. This module assumes that
 * field is the canonical identifier in URLs. If a company has no slug
 * (legacy rows), `companyToSlug` falls back to a kebab-cased name.
 */

const NON_SLUG_CHARS = /[^a-z0-9-]+/g;
const MULTI_DASH = /-{2,}/g;
const TRIM_DASH = /^-+|-+$/g;

export function companyToSlug(company) {
  if (!company) return '';
  if (company.slug) return company.slug;
  const name = (company.name || '').toLowerCase().trim();
  return name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(NON_SLUG_CHARS, '-')
    .replace(MULTI_DASH, '-')
    .replace(TRIM_DASH, '');
}

export function findCompanyBySlug(companies, slug) {
  if (!Array.isArray(companies) || !slug) return null;
  return companies.find((c) => companyToSlug(c) === slug) || null;
}

export function activeCompanyStorageKey(userId) {
  if (!userId) return null;
  return `wb-active-company:${userId}`;
}

export function readStoredActiveCompany(userId) {
  if (typeof window === 'undefined') return null;
  const key = activeCompanyStorageKey(userId);
  if (!key) return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStoredActiveCompany(userId, slug) {
  if (typeof window === 'undefined') return;
  const key = activeCompanyStorageKey(userId);
  if (!key) return;
  try {
    if (slug) {
      window.localStorage.setItem(key, slug);
    } else {
      window.localStorage.removeItem(key);
    }
  } catch {
    // Swallow QuotaExceededError or denial in private modes.
  }
}

/**
 * Pick the default active company for a user.
 * Priority:
 *   1. last-used (from localStorage) if it still resolves
 *   2. first non-internal membership-backed company
 *   3. first company at all
 *   4. null  → caller should redirect to /companies for setup
 */
export function pickDefaultCompany(accessibleCompanies, userId) {
  if (!Array.isArray(accessibleCompanies) || accessibleCompanies.length === 0) {
    return null;
  }
  const storedSlug = readStoredActiveCompany(userId);
  if (storedSlug) {
    const stored = findCompanyBySlug(accessibleCompanies, storedSlug);
    if (stored) return stored;
  }
  const nonInternal = accessibleCompanies.find((c) => !c.isInternal);
  if (nonInternal) return nonInternal;
  return accessibleCompanies[0];
}
```

- [ ] **Step 2: Verify the module loads in Vite**

```bash
cd /Users/adrian/GitHub/webbrief/.claude/worktrees/workspace-switcher/frontend
npx vite build --mode development 2>&1 | tail -5
```

Expected: build succeeds. Pre-existing chunk-size warnings about ProjectEditor are fine. No errors mentioning `companySlug.js`.

- [ ] **Step 3: Commit**

```bash
cd /Users/adrian/GitHub/webbrief/.claude/worktrees/workspace-switcher
git add frontend/src/lib/companySlug.js
git commit -m "$(cat <<'EOF'
feat(workspace): add companySlug helpers

Pure ES module exposing companyToSlug, findCompanyBySlug,
pickDefaultCompany, and localStorage read/write for the per-user
active-company persistence. No React, no side effects beyond
localStorage IO. Foundation for the WorkspaceContext in the next
task.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task A2: WorkspaceContext provider

**Files:**
- Create: `frontend/src/contexts/WorkspaceContext.jsx`

- [ ] **Step 1: Write the provider**

Create `frontend/src/contexts/WorkspaceContext.jsx` with this EXACT content:

```jsx
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { apiFetch } from '../lib/api'
import {
  companyToSlug,
  findCompanyBySlug,
  pickDefaultCompany,
  writeStoredActiveCompany,
} from '../lib/companySlug'

const WorkspaceContext = createContext(null)

const COMPANIES_CACHE_KEY = 'webrief:companies'

function readCompaniesCache() {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.sessionStorage.getItem(COMPANIES_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed?.companies) ? parsed.companies : null
  } catch {
    return null
  }
}

function writeCompaniesCache(companies) {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.setItem(
      COMPANIES_CACHE_KEY,
      JSON.stringify({ companies, cachedAt: new Date().toISOString() }),
    )
  } catch {
    // Quota exceeded — skip cache, app still works.
  }
}

export function WorkspaceProvider({ children }) {
  const { isAuthenticated, realCurrentUser, loading: authLoading } = useAuth()
  const [accessibleCompanies, setAccessibleCompanies] = useState(() => readCompaniesCache() || [])
  const [currentCompany, setCurrentCompany] = useState(null)
  const [loading, setLoading] = useState(true)
  const [createCompanyModalOpen, setCreateCompanyModalOpen] = useState(false)

  // Fetch companies list whenever authentication settles.
  useEffect(() => {
    if (authLoading) return undefined
    if (!isAuthenticated || !realCurrentUser?.id) {
      setAccessibleCompanies([])
      setCurrentCompany(null)
      setLoading(false)
      return undefined
    }
    let cancelled = false
    async function loadCompanies() {
      try {
        const data = await apiFetch('/api/companies')
        if (cancelled) return
        const list = Array.isArray(data?.companies) ? data.companies : []
        setAccessibleCompanies(list)
        writeCompaniesCache(list)
      } catch {
        // Fallback to cached list — if there is none, we render empty state.
        const cached = readCompaniesCache()
        if (!cancelled && cached) setAccessibleCompanies(cached)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    loadCompanies()
    return () => {
      cancelled = true
    }
  }, [authLoading, isAuthenticated, realCurrentUser?.id])

  // Resolve current company from accessibleCompanies + localStorage default.
  useEffect(() => {
    if (loading) return
    if (!realCurrentUser?.id) {
      setCurrentCompany(null)
      return
    }
    setCurrentCompany((prev) => {
      // If prev still resolves, keep it.
      if (prev) {
        const stillThere = accessibleCompanies.find((c) => c.id === prev.id)
        if (stillThere) return stillThere
      }
      return pickDefaultCompany(accessibleCompanies, realCurrentUser.id)
    })
  }, [accessibleCompanies, loading, realCurrentUser?.id])

  const switchCompany = useCallback(
    (slug) => {
      if (!slug) return null
      const target = findCompanyBySlug(accessibleCompanies, slug)
      if (!target) return null
      setCurrentCompany(target)
      if (realCurrentUser?.id) {
        writeStoredActiveCompany(realCurrentUser.id, slug)
      }
      return target
    },
    [accessibleCompanies, realCurrentUser?.id],
  )

  const openCreateCompanyModal = useCallback(() => setCreateCompanyModalOpen(true), [])
  const closeCreateCompanyModal = useCallback(() => setCreateCompanyModalOpen(false), [])

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

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext)
  if (!ctx) {
    throw new Error('useWorkspace must be used inside <WorkspaceProvider>')
  }
  return ctx
}
```

- [ ] **Step 2: Verify the module loads**

```bash
cd /Users/adrian/GitHub/webbrief/.claude/worktrees/workspace-switcher/frontend
npx vite build --mode development 2>&1 | tail -5
```

Expected: build succeeds. No errors mentioning `WorkspaceContext`.

- [ ] **Step 3: Commit**

```bash
cd /Users/adrian/GitHub/webbrief/.claude/worktrees/workspace-switcher
git add frontend/src/contexts/WorkspaceContext.jsx
git commit -m "$(cat <<'EOF'
feat(workspace): add WorkspaceContext provider

WorkspaceProvider fetches /api/companies once after auth settles,
caches in sessionStorage:webrief:companies (sharing the existing
cache used by CompaniesPage), resolves the active company via
pickDefaultCompany, and exposes switchCompany + the create-modal
gate. useWorkspace() throws outside the provider so misuse is loud.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task A3: Mount WorkspaceProvider in App.jsx

**Files:**
- Modify: `frontend/src/App.jsx`

- [ ] **Step 1: Add the import**

Open `frontend/src/App.jsx` and add this import after the existing `AuthContext` import (around line 3):

```jsx
import { WorkspaceProvider } from './contexts/WorkspaceContext'
```

- [ ] **Step 2: Wrap AppRoutes with WorkspaceProvider**

Find the `App` function (it's near the bottom, around line 210). Current shape:

```jsx
function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}
```

Replace it with:

```jsx
function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <WorkspaceProvider>
          <AppRoutes />
        </WorkspaceProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
```

- [ ] **Step 3: Verify build**

```bash
cd /Users/adrian/GitHub/webbrief/.claude/worktrees/workspace-switcher/frontend
npx vite build --mode development 2>&1 | tail -5
```

Expected: build succeeds.

- [ ] **Step 4: Smoke test — context loads at runtime**

Start the dev server on port 5174 (5173 is in use by the user's onboarding session):

```bash
cd /Users/adrian/GitHub/webbrief/.claude/worktrees/workspace-switcher/frontend
npx vite --port 5174 &
sleep 3
curl -sf http://localhost:5174/ | head -5 || echo "FAIL: server did not respond"
pkill -f "vite --port 5174" || true
```

Expected: the curl returns an HTML document starting with `<!DOCTYPE html>` (no error). No errors in the response.

- [ ] **Step 5: Commit**

```bash
cd /Users/adrian/GitHub/webbrief/.claude/worktrees/workspace-switcher
git add frontend/src/App.jsx
git commit -m "$(cat <<'EOF'
feat(workspace): mount WorkspaceProvider under AuthProvider

Wraps AppRoutes so every page can call useWorkspace() to read the
active company, switch it, and open the create-company modal. No
functional change yet — provider mounted but unused by the UI in
this fase.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task A4: WorkspaceSwitcher component

**Files:**
- Create: `frontend/src/components/layout/WorkspaceSwitcher.jsx`
- Create: `frontend/src/components/layout/WorkspaceSwitcher.module.css`

- [ ] **Step 1: Write the CSS module**

Create `frontend/src/components/layout/WorkspaceSwitcher.module.css` with this EXACT content:

```css
.root {
  position: relative;
  margin: 0 0 var(--wb-space-2);
}

.trigger {
  appearance: none;
  display: flex;
  align-items: center;
  gap: var(--wb-space-2);
  width: 100%;
  padding: var(--wb-space-2) var(--wb-space-2-5, 10px); /* keep literal — 10px gap not in scale */
  background: var(--wb-color-neutral-50);
  color: var(--wb-text);
  border: 0.5px solid var(--wb-border);
  border-radius: var(--wb-radius-2);
  font-size: var(--wb-text-sm);
  font-weight: var(--wb-weight-medium);
  cursor: pointer;
  text-align: left;
  transition: background 120ms ease-out;
}

.trigger:hover {
  background: var(--wb-color-neutral-100);
}

.trigger:focus-visible {
  outline: 2px solid var(--wb-color-primary-600);
  outline-offset: 2px;
}

.avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: var(--wb-radius-2);
  background: var(--wb-color-primary-100);
  color: var(--wb-color-primary-700);
  font-size: var(--wb-text-xs);
  font-weight: var(--wb-weight-semibold);
  flex-shrink: 0;
}

.avatarInternal {
  background: var(--wb-color-neutral-200, var(--wb-color-neutral-100));
  color: var(--wb-color-neutral-700, var(--wb-text));
}

.triggerName {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.triggerCaret {
  flex-shrink: 0;
  color: var(--wb-color-neutral-500);
}

/* Dropdown panel — portaled to document.body */
.dropdown {
  position: fixed;
  width: 240px;
  padding: var(--wb-space-1);
  background: var(--wb-surface);
  border: 0.5px solid var(--wb-border);
  border-radius: var(--wb-radius-2);
  box-shadow: var(--wb-shadow-lg);
  z-index: var(--wb-z-popover);
}

.searchWrap {
  padding: var(--wb-space-2);
}

.searchInput {
  width: 100%;
  padding: 6px 10px; /* keep literal — compact dropdown search */
  border: 0.5px solid var(--wb-border);
  border-radius: var(--wb-radius-2);
  background: var(--wb-surface);
  color: var(--wb-text);
  font-size: var(--wb-text-xs);
  outline: none;
}

.searchInput:focus {
  border-color: var(--wb-color-primary-600);
}

.list {
  display: flex;
  flex-direction: column;
  gap: 1px;
  max-height: 280px;
  overflow-y: auto;
}

.item {
  appearance: none;
  display: flex;
  align-items: center;
  gap: var(--wb-space-2);
  width: 100%;
  padding: var(--wb-space-2);
  background: transparent;
  border: none;
  border-radius: var(--wb-radius-2);
  font-size: var(--wb-text-sm);
  color: var(--wb-text);
  text-align: left;
  cursor: pointer;
  transition: background 120ms ease-out;
}

.item:hover,
.item:focus-visible {
  background: var(--wb-color-neutral-50);
  outline: none;
}

.itemActive {
  background: var(--wb-color-primary-50, var(--wb-color-primary-100));
}

.itemActive:hover {
  background: var(--wb-color-primary-100);
}

.itemName {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.itemBadge {
  font-size: var(--wb-text-xs);
  color: var(--wb-color-neutral-500);
}

.itemCheck {
  color: var(--wb-color-primary-700);
  flex-shrink: 0;
}

.separator {
  height: 0.5px;
  background: var(--wb-border);
  margin: var(--wb-space-1) 0;
}

.empty {
  padding: var(--wb-space-3);
  text-align: center;
  color: var(--wb-text-muted);
  font-size: var(--wb-text-xs);
}

@media (prefers-reduced-motion: reduce) {
  .trigger,
  .item {
    transition: none;
  }
}
```

- [ ] **Step 2: Write the component**

Create `frontend/src/components/layout/WorkspaceSwitcher.jsx` with this EXACT content:

```jsx
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown, List, Plus, Search } from 'lucide-react'
import { useWorkspace } from '../../contexts/WorkspaceContext'
import { companyToSlug } from '../../lib/companySlug'
import styles from './WorkspaceSwitcher.module.css'

const SEARCH_THRESHOLD = 5

function initials(name) {
  if (!name) return '?'
  const trimmed = name.trim()
  const parts = trimmed.split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0][0].toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export default function WorkspaceSwitcher({
  canCreateCompany = false,
  canViewAllCompanies = false,
  onViewAllCompanies,
}) {
  const { currentCompany, accessibleCompanies, switchCompany, openCreateCompanyModal, loading } =
    useWorkspace()

  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState(null)
  const [query, setQuery] = useState('')
  const triggerRef = useRef(null)
  const dropdownRef = useRef(null)
  const searchRef = useRef(null)

  const computePosition = useCallback(() => {
    const node = triggerRef.current
    if (!node) return null
    const rect = node.getBoundingClientRect()
    const vh = typeof window !== 'undefined' ? window.innerHeight : 0
    const gap = 4
    return {
      top: Math.min(rect.bottom + gap, vh - 8),
      left: rect.left,
      width: rect.width,
    }
  }, [])

  useLayoutEffect(() => {
    if (!open) {
      setPosition(null)
      return undefined
    }
    function update() {
      const next = computePosition()
      if (next) setPosition(next)
    }
    update()
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
  }, [open, computePosition])

  useEffect(() => {
    if (!open) return undefined
    function onDocMouseDown(e) {
      if (triggerRef.current && triggerRef.current.contains(e.target)) return
      if (dropdownRef.current && dropdownRef.current.contains(e.target)) return
      setOpen(false)
    }
    function onKeyDown(e) {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setOpen(false)
        triggerRef.current?.focus?.()
      }
    }
    document.addEventListener('mousedown', onDocMouseDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  useEffect(() => {
    if (open && accessibleCompanies.length >= SEARCH_THRESHOLD) {
      searchRef.current?.focus?.()
    }
    if (!open) setQuery('')
  }, [open, accessibleCompanies.length])

  const filteredCompanies = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return accessibleCompanies
    return accessibleCompanies.filter((c) =>
      [c.name, c.slug].filter(Boolean).some((v) => v.toLowerCase().includes(q)),
    )
  }, [accessibleCompanies, query])

  function handleSelect(slug) {
    switchCompany(slug)
    setOpen(false)
    triggerRef.current?.focus?.()
  }

  function handleCreate() {
    setOpen(false)
    openCreateCompanyModal()
  }

  function handleViewAll() {
    setOpen(false)
    if (onViewAllCompanies) onViewAllCompanies()
  }

  if (loading && !currentCompany) {
    return (
      <div className={styles.root}>
        <div className={styles.trigger} aria-busy="true">
          <span className={`${styles.avatar} ${styles.avatarInternal}`} aria-hidden="true">…</span>
          <span className={styles.triggerName}>Cargando…</span>
        </div>
      </div>
    )
  }

  if (!currentCompany) {
    return null
  }

  const activeSlug = companyToSlug(currentCompany)
  const showSearch = accessibleCompanies.length >= SEARCH_THRESHOLD

  return (
    <div className={styles.root}>
      <button
        ref={triggerRef}
        type="button"
        className={styles.trigger}
        aria-haspopup="listbox"
        aria-expanded={open ? 'true' : 'false'}
        aria-label={`Empresa activa: ${currentCompany.name}. Cambiar de empresa.`}
        onClick={() => setOpen((v) => !v)}
      >
        <span
          className={`${styles.avatar} ${currentCompany.isInternal ? styles.avatarInternal : ''}`}
          aria-hidden="true"
        >
          {initials(currentCompany.name)}
        </span>
        <span className={styles.triggerName}>{currentCompany.name}</span>
        <ChevronDown size={14} className={styles.triggerCaret} aria-hidden="true" />
      </button>

      {open &&
        position &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={dropdownRef}
            className={styles.dropdown}
            role="listbox"
            aria-label="Seleccionar empresa"
            style={{ top: position.top, left: position.left, width: position.width }}
          >
            {showSearch && (
              <div className={styles.searchWrap}>
                <div style={{ position: 'relative' }}>
                  <Search
                    size={14}
                    aria-hidden="true"
                    style={{
                      position: 'absolute',
                      left: 8,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      color: 'var(--wb-color-neutral-500)',
                    }}
                  />
                  <input
                    ref={searchRef}
                    type="search"
                    placeholder="Buscar empresa"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    className={styles.searchInput}
                    style={{ paddingLeft: 26 }}
                    aria-label="Buscar empresa"
                  />
                </div>
              </div>
            )}

            <div className={styles.list}>
              {filteredCompanies.length === 0 && (
                <p className={styles.empty}>Sin resultados</p>
              )}
              {filteredCompanies.map((company) => {
                const slug = companyToSlug(company)
                const isActive = slug === activeSlug
                return (
                  <button
                    key={company.id}
                    type="button"
                    role="option"
                    aria-selected={isActive ? 'true' : 'false'}
                    className={`${styles.item} ${isActive ? styles.itemActive : ''}`}
                    onClick={() => handleSelect(slug)}
                  >
                    <span
                      className={`${styles.avatar} ${company.isInternal ? styles.avatarInternal : ''}`}
                      aria-hidden="true"
                    >
                      {initials(company.name)}
                    </span>
                    <span className={styles.itemName}>{company.name}</span>
                    {company.isInternal && <span className={styles.itemBadge}>interna</span>}
                    {isActive && (
                      <Check size={14} className={styles.itemCheck} aria-hidden="true" />
                    )}
                  </button>
                )
              })}
            </div>

            {(canCreateCompany || canViewAllCompanies) && <div className={styles.separator} />}

            {canCreateCompany && (
              <button type="button" className={styles.item} onClick={handleCreate}>
                <Plus size={16} aria-hidden="true" style={{ marginLeft: 4 }} />
                <span className={styles.itemName}>Crear empresa</span>
              </button>
            )}

            {canViewAllCompanies && (
              <button type="button" className={styles.item} onClick={handleViewAll}>
                <List size={16} aria-hidden="true" style={{ marginLeft: 4 }} />
                <span className={styles.itemName}>
                  Ver todas ({accessibleCompanies.length})
                </span>
              </button>
            )}
          </div>,
          document.body,
        )}
    </div>
  )
}
```

- [ ] **Step 3: Verify build**

```bash
cd /Users/adrian/GitHub/webbrief/.claude/worktrees/workspace-switcher/frontend
npx vite build --mode development 2>&1 | tail -5
```

Expected: build succeeds. The new component is tree-shaken out because nothing imports it yet — that's fine, we mount it in Task A5.

- [ ] **Step 4: Commit**

```bash
cd /Users/adrian/GitHub/webbrief/.claude/worktrees/workspace-switcher
git add frontend/src/components/layout/WorkspaceSwitcher.jsx frontend/src/components/layout/WorkspaceSwitcher.module.css
git commit -m "$(cat <<'EOF'
feat(workspace): add WorkspaceSwitcher sidebar component

Pill trigger + portal-positioned dropdown showing accessible
companies with the active one checked. Search input appears when
the user has 5+ companies. Optional "Crear empresa" + "Ver todas"
rows controlled by props gated at the call site. Reuses the
KebabMenu positioning pattern (fixed coords from
getBoundingClientRect, resynced on scroll capture + resize).

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task A5: Mount WorkspaceSwitcher in AppShell sidebar

**Files:**
- Modify: `frontend/src/components/layout/AppShell.jsx`

In this Fase A task we ONLY mount the switcher. The existing `<NavLink>` to "Empresas" stays where it is — Fase B will reorganize the nav.

- [ ] **Step 1: Read AppShell.jsx to confirm structure**

```bash
cd /Users/adrian/GitHub/webbrief/.claude/worktrees/workspace-switcher
sed -n '1,30p;110,130p' frontend/src/components/layout/AppShell.jsx
```

Expected: imports at the top, then the function. The brand block is around line 115; the first nav `<p className={styles.navSectionLabel}>Principal</p>` is around line 120.

- [ ] **Step 2: Add the imports**

Near the other imports at the top of `frontend/src/components/layout/AppShell.jsx` (alongside the existing `import OnboardingChecklist from '../onboarding/OnboardingChecklist'` line) add:

```jsx
import WorkspaceSwitcher from './WorkspaceSwitcher'
import { useWorkspace } from '../../contexts/WorkspaceContext'
import { isAdmin } from '../../lib/roleCapabilities'
```

If `isAdmin` is already imported in this file, do NOT duplicate — just merge into the existing import line.

- [ ] **Step 3: Add the switcher mount inside the AppShell body**

Inside the `AppShell` function body, find the existing block:

```jsx
const navigate = useNavigate()
```

Immediately AFTER it (or alongside the other top-of-function hooks), add:

```jsx
const { accessibleCompanies } = useWorkspace()
const canCreateCompany = isAdmin(currentUser) || currentUser?.memberships?.some((m) => m.role === 'manager')
const canViewAllCompaniesFromSwitcher =
  isAdmin(currentUser) || accessibleCompanies.length >= 3
```

(Make sure `currentUser` is already destructured from `useAuth()` in this file. Look for `useAuth()` and confirm.)

- [ ] **Step 4: Mount `<WorkspaceSwitcher />` between brand and first nav section**

Find the JSX (around lines 115–121):

```jsx
        <div className={styles.brand}>
          <img src={webriefLogo} alt="WeBrief" className={styles.brandLogo} />
        </div>
        <nav className={styles.nav}>
          <div className={styles.navSection}>
            <p className={styles.navSectionLabel}>Principal</p>
```

Insert the switcher between the brand `<div>` and the `<nav>`:

```jsx
        <div className={styles.brand}>
          <img src={webriefLogo} alt="WeBrief" className={styles.brandLogo} />
        </div>
        <div className={styles.workspaceSwitcherSlot}>
          <WorkspaceSwitcher
            canCreateCompany={canCreateCompany}
            canViewAllCompanies={canViewAllCompaniesFromSwitcher}
            onViewAllCompanies={() => navigate('/companies')}
          />
        </div>
        <nav className={styles.nav}>
          <div className={styles.navSection}>
            <p className={styles.navSectionLabel}>Principal</p>
```

- [ ] **Step 5: Add the slot CSS for spacing**

Open `frontend/src/components/layout/AppShell.module.css` and append at the end:

```css
.workspaceSwitcherSlot {
  margin: 0 var(--wb-space-3) var(--wb-space-3);
}
```

(If a `.workspaceSwitcherSlot` class already exists for any reason, don't duplicate — adjust instead.)

- [ ] **Step 6: Verify build**

```bash
cd /Users/adrian/GitHub/webbrief/.claude/worktrees/workspace-switcher/frontend
npx vite build --mode development 2>&1 | tail -8
```

Expected: build succeeds.

- [ ] **Step 7: Smoke test the rendered shell**

Start the worktree's dev server on port 5174 (5173 stays untouched by the main repo's dev session):

```bash
cd /Users/adrian/GitHub/webbrief/.claude/worktrees/workspace-switcher/frontend
npx vite --port 5174 &
sleep 3
curl -sf "http://localhost:5174/" -o /tmp/ws-shell.html
grep -c "workspaceSwitcherSlot\|WorkspaceSwitcher" /tmp/ws-shell.html || true
pkill -f "vite --port 5174" || true
```

Expected: the curl downloads the HTML index (the class name won't appear in raw index HTML — Vite serves the JSX module separately). To verify the JSX itself compiles cleanly:

```bash
cd /Users/adrian/GitHub/webbrief/.claude/worktrees/workspace-switcher/frontend
npx vite --port 5174 &
sleep 3
curl -sf "http://localhost:5174/src/components/layout/WorkspaceSwitcher.jsx" -o /tmp/ws.js
grep -c "WorkspaceSwitcher\|workspaceSwitcherSlot" /tmp/ws.js
pkill -f "vite --port 5174" || true
```

Expected output of the grep: at least 1 (the module compiled and Vite served the transformed code). Detailed visual verification (user logged in, switcher visible) is deferred to the controller's E2E pass after this task lands.

- [ ] **Step 8: Commit**

```bash
cd /Users/adrian/GitHub/webbrief/.claude/worktrees/workspace-switcher
git add frontend/src/components/layout/AppShell.jsx frontend/src/components/layout/AppShell.module.css
git commit -m "$(cat <<'EOF'
feat(workspace): mount WorkspaceSwitcher in AppShell sidebar

Inserts the switcher between the brand block and the existing nav.
Old "Empresas" / "Usuarios" / "Integraciones" nav items remain in
place — Fase B will reorganize them. canCreateCompany gates the
"Crear empresa" row on admin OR any-company-manager; the "Ver todas"
row appears for platform admins or for users with 3+ companies.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task A6: Controller E2E verification

This task is performed by the orchestrator (you), not delegated to a subagent. It validates that Fase A's user-visible behavior is what the spec promised.

- [ ] **Step 1: Build once and confirm**

```bash
cd /Users/adrian/GitHub/webbrief/.claude/worktrees/workspace-switcher/frontend
npx vite build --mode development 2>&1 | tail -3
```

Expected: `✓ built in …s`.

- [ ] **Step 2: Run a preview MCP smoke test**

Start a preview on the worktree (port 5174), load `/src/App.jsx` via the dev server to confirm the new provider import resolves:

```js
// preview_eval
const mod = await import('/src/contexts/WorkspaceContext.jsx?t=' + Date.now())
return { hasProvider: typeof mod.WorkspaceProvider === 'function', hasHook: typeof mod.useWorkspace === 'function' }
```

Expected: `{ hasProvider: true, hasHook: true }`.

- [ ] **Step 3: Validate slug helpers in isolation**

```js
// preview_eval
const m = await import('/src/lib/companySlug.js?t=' + Date.now())
const sample = [
  { id: '1', name: 'Testing', slug: 'testing', isInternal: false },
  { id: '2', name: 'WeBrief', slug: 'webrief', isInternal: true },
  { id: '3', name: 'Capilea ARG', slug: null, isInternal: false },
]
return {
  toSlug_uses_field: m.companyToSlug(sample[0]) === 'testing',
  toSlug_fallback_kebab: m.companyToSlug(sample[2]) === 'capilea-arg',
  find_by_slug: m.findCompanyBySlug(sample, 'testing')?.id === '1',
  pick_skips_internal: m.pickDefaultCompany(sample, 'user-a')?.id === '1',
  storage_key: m.activeCompanyStorageKey('user-a') === 'wb-active-company:user-a',
}
```

Expected: every value `true`.

- [ ] **Step 4: Confirm AppShell still renders (no auth)**

```js
// preview_eval
window.location.href = window.location.origin + '/login'
```

Then take a screenshot. The login page should still render unchanged — Fase A does not touch unauthenticated routes.

- [ ] **Step 5: Stop the preview**

```bash
pkill -f "vite --port 5174" 2>/dev/null || true
```

- [ ] **Step 6: Final stat + commit log**

```bash
cd /Users/adrian/GitHub/webbrief/.claude/worktrees/workspace-switcher
git log --oneline 08c8ebc..HEAD
git diff --stat 08c8ebc..HEAD
```

Expected: 5 commits (A1, A2, A3, A4, A5). Files: 4 new + 2 modified. ~600-700 LOC added.

---

## Self-Review

**Spec coverage** (compared against `2026-06-22-workspace-switcher-design.md`):

| Spec section | Covered by | Notes |
|---|---|---|
| §"Resolving the active company" | A2 (WorkspaceContext) | Resolution algorithm 1–4 implemented in `pickDefaultCompany` + the effect |
| §"WorkspaceContext exposes …" | A2 | All 4 properties + 2 modal helpers exposed |
| §"Switcher dropdown" anatomy | A4 | Trigger, dropdown, search ≥5 threshold, separator, create/view-all rows |
| §"Switcher dropdown" empty state | A4 | "Sin resultados" rendered when filtered list empty |
| §"Mount in sidebar" | A5 | Mounted between brand and first nav section |
| §"localStorage key" | A1 (`activeCompanyStorageKey`) + A2 (write on switch) | Per-user scoped key |
| §"NotFoundPage" | NOT in Fase A | Fase B |
| §"New routes /c/:slug/*" | NOT in Fase A | Fase B |
| §"Reorganize sidebar nav" | NOT in Fase A | Fase B |
| §"Onboarding handlers" | NOT in Fase A | Fase C |

**Placeholder scan:** No TBD / TODO / "fill in later" anywhere. Every step has runnable code or a precise command.

**Type consistency:**
- Hook name: `useWorkspace()` — used identically in A4 and A5.
- Context value shape: `{ currentCompany, currentCompanySlug, accessibleCompanies, switchCompany, loading, createCompanyModalOpen, openCreateCompanyModal, closeCreateCompanyModal }` — A2 defines, A4/A5 consume only `currentCompany`, `accessibleCompanies`, `switchCompany`, `openCreateCompanyModal`, `loading`. No mismatches.
- Helper signatures: `companyToSlug(company)`, `findCompanyBySlug(companies, slug)`, `pickDefaultCompany(companies, userId)`, `activeCompanyStorageKey(userId)`, `readStoredActiveCompany(userId)`, `writeStoredActiveCompany(userId, slug)` — A1 defines, A2 consumes with the right arity. Confirmed.

---

## What happens next (Fase B preview, NOT in this plan)

After Fase A merges:
1. **Fase B plan** is written with full task breakdowns for: new `/c/:slug/{projects,team,activity}` routes, `WorkspaceLayout`, split CompanyPage into 3 pages, NotFoundPage, sidebar nav reorg, redirects from `/companies/:id`.
2. **Fase C plan** is written for: onboarding task-click route updates, delete old `CompanyPage.jsx`, final grep sweep.

Each fase ships as its own PR-sized branch (`feat/workspace-switcher` already exists; we can either continue on it for B and C, or branch off it per fase — controller decides at the time).
