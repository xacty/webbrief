# PR 2 — Shared UserEditModal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the two divergent "edit user/member" modals (UsersPage and CompanyPage) into one shared component `UserEditModal.jsx` that takes `scope: 'global' | 'company'` and conditionally renders the right sections. Also add the "Enviar acceso" (envelope) icon button to the CompanyPage team row so managers gain parity with the UsersPage action set.

**Architecture:** One self-contained React component lives at `frontend/src/components/users/UserEditModal.jsx`. It receives props for `user`, `currentUser`, `scope`, `companyId`, `companyName`, and `onSaved`. Both pages drop their inline modals and mount `<UserEditModal />`. The component owns all internal form state, API calls, and conditional section rendering. Parent pages own only the "is open" state and post-save refresh strategy (full reload for UsersPage, optimistic local update for CompanyPage).

**Tech Stack:** React (functional + hooks), JSX (no TS), CSS modules co-located with parent pages (reused — modal pulls classnames via prop or imports its own minimal module). lucide-react icons. `apiFetch` from `../lib/api`. Permissions helpers from `../lib/roleCapabilities`. Shared role constants from `../../../shared/userRoles.js`.

**Reference spec:** [`docs/superpowers/specs/2026-05-25-auth-team-fixes-design.md`](../specs/2026-05-25-auth-team-fixes-design.md) — Section C.

**Out of scope for PR 2:** Password section, Sessions list, eye-icon for IP reveal, company-admin role gating. Those land in PR 3 + PR 4.

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `frontend/src/components/users/UserEditModal.jsx` | **Create** | Shared edit modal — all form state, JSX, API calls. ~280 LOC. |
| `frontend/src/components/users/UserEditModal.module.css` | **Create** | Minimal CSS for sections unique to the shared component (membership list reuses UsersPage classNames passed as className prop where needed). ~40 LOC. |
| `frontend/src/lib/sendAccessClient.js` | **Create** | Extracted `sendAccess(user)` async function — currently inlined in `UsersPage.handleSendAccess`. New file so CompanyPage can reuse the EXACT same logic without copy-paste. ~50 LOC. |
| `frontend/src/pages/UsersPage.jsx` | **Modify** | Remove inline modal JSX + state + handlers; mount `<UserEditModal scope="global" />`; switch `handleSendAccess` to call shared `sendAccess` from new file. |
| `frontend/src/pages/CompanyPage.jsx` | **Modify** | Remove inline `Editar miembro` modal JSX + state + handlers; mount `<UserEditModal scope="company" />`; add envelope icon button to team row + handler using shared `sendAccess`. |

No backend changes. No migration. No frontend tests added (existing codebase has no frontend test infra; QA via manual smoke + Opus pass).

---

## Task 1: Create `frontend/src/components/users/UserEditModal.jsx` + companion CSS + sendAccessClient.js

**Files:**
- Create: `frontend/src/components/users/UserEditModal.jsx`
- Create: `frontend/src/components/users/UserEditModal.module.css`
- Create: `frontend/src/lib/sendAccessClient.js`

### Step 1: Create `frontend/src/lib/sendAccessClient.js`

```javascript
// Shared client wrapper for POST /api/users/:id/send-access.
// Extracted from UsersPage.handleSendAccess so CompanyPage can reuse the
// EXACT same wire format (Bearer token via supabase session, raw fetch
// instead of apiFetch because we need to read Retry-After header on 429).
//
// Returns a normalized result object the caller can map to UI feedback.

import { supabase } from './supabase'

export async function sendAccess(targetUser) {
  if (!targetUser?.id) {
    return { ok: false, kind: 'invalid', message: 'Usuario inválido' }
  }

  let session
  try {
    const result = await supabase.auth.getSession()
    session = result?.data?.session
  } catch (err) {
    return { ok: false, kind: 'network', message: err?.message || 'Sesión no disponible' }
  }

  const headers = new Headers({ 'Content-Type': 'application/json' })
  if (session?.access_token) {
    headers.set('Authorization', `Bearer ${session.access_token}`)
  }

  let response
  try {
    response = await fetch(`/api/users/${targetUser.id}/send-access`, {
      method: 'POST',
      headers,
    })
  } catch (err) {
    return { ok: false, kind: 'network', message: err?.message || 'Error de red enviando acceso' }
  }

  if (response.status === 429) {
    const retryAfterHeader = response.headers.get('Retry-After')
    const seconds = Number(retryAfterHeader) || 900
    const minutes = Math.max(1, Math.ceil(seconds / 60))
    return {
      ok: false,
      kind: 'rate_limited',
      message: `Demasiados intentos. Esperá ~${minutes} minutos.`,
    }
  }

  const body = await response.json().catch(() => ({}))

  if (!response.ok) {
    const idHint = body.errorId ? ` (ID: ${body.errorId})` : ''
    return {
      ok: false,
      kind: 'server',
      message: body.error ? `${body.error}${idHint}` : `No se pudo enviar acceso${idHint}`,
    }
  }

  const expiresAt = body.expiresAt ? new Date(body.expiresAt) : null
  const expiresLabel = expiresAt
    ? expiresAt.toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })
    : ''
  const actionLabel = body.action === 'invite_resent' ? 'Invitación reenviada' : 'Email de restablecimiento enviado'
  const tail = body.emailSent ? `, caduca ${expiresLabel}` : ' (link generado, email no entregado)'

  return {
    ok: true,
    kind: 'sent',
    action: body.action,
    emailSent: Boolean(body.emailSent),
    expiresAt,
    message: `${actionLabel}${tail}`,
  }
}
```

### Step 2: Create `frontend/src/components/users/UserEditModal.module.css`

```css
/* UserEditModal.module.css
 * Minimal styles unique to the shared modal. Reuses .modalForm, .avatarEditor,
 * .membershipSection etc. by passing parent's styles via className prop where
 * possible; this module owns only what doesn't exist elsewhere.
 */

.subtitle {
  font-size: var(--wb-text-sm);
  color: var(--wb-color-neutral-600);
  margin: 0 0 var(--wb-space-md);
}

.fieldHint {
  font-size: var(--wb-text-sm);
  color: var(--wb-color-neutral-600);
  margin: 0;
}

.formNote {
  font-size: var(--wb-text-sm);
  color: var(--wb-color-neutral-600);
  font-style: italic;
  margin: 0;
}

.error {
  font-size: var(--wb-text-sm);
  color: var(--wb-color-danger-600);
  margin: 0;
}

.actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--wb-space-sm);
  margin-top: var(--wb-space-md);
}
```

### Step 3: Create `frontend/src/components/users/UserEditModal.jsx`

```jsx
import { useEffect, useState } from 'react'
import { Camera, Download } from 'lucide-react'
import { Button, Input, Select, Modal, Badge } from '../ui'
import { apiFetch } from '../../lib/api'
import { isAdmin } from '../../lib/roleCapabilities'
import {
  COMPANY_ROLE_ORDER,
  MANAGER_ASSIGNABLE_COMPANY_ROLE_ORDER,
  PLATFORM_ROLE_ORDER,
  getCompanyRoleLabel,
  getPlatformRoleLabel,
  isGlobalPlatformRole,
} from '../../../../shared/userRoles.js'
import styles from './UserEditModal.module.css'

const PLATFORM_ROLE_LABEL = (role) => getPlatformRoleLabel(role)
const COMPANY_ROLE_LABEL = (role) => getCompanyRoleLabel(role)

// Returns 2 initials from a full name or email local-part.
function userInitials(user) {
  const name = (user?.fullName || '').trim()
  if (name) {
    const parts = name.split(/\s+/).filter(Boolean)
    return (parts[0]?.[0] || '').toUpperCase() + (parts[1]?.[0] || '').toUpperCase()
  }
  const email = user?.email || ''
  return (email[0] || '?').toUpperCase()
}

// Avatar download helper — uses apiFetch under the hood via raw fetch with bearer.
async function downloadAvatarExport(userId, variant) {
  // Lazy import to avoid bundle-pulling supabase in modules that don't need it.
  // Falls back to opening URL if direct download is unavailable.
  const url = `/api/users/${userId}/avatar/export/${variant}`
  window.open(url, '_blank', 'noopener')
}

/**
 * Shared edit-user modal for both UsersPage (scope='global') and CompanyPage (scope='company').
 *
 * @param {object} props
 * @param {boolean} props.open
 * @param {object} props.user                Target user being edited. Shape:
 *                                           { id, fullName, email, platformRole, avatarUrl,
 *                                             companies?: [{ companyId, companyName, companySlug?, role }] }
 * @param {object} props.currentUser         The actor performing the edit (auth context).
 * @param {'global' | 'company'} props.scope Determines which sections render.
 * @param {string} [props.companyId]         Required when scope='company'.
 * @param {string} [props.companyName]       Label for the role select.
 * @param {string[]} [props.managedCompanyIds]  Company IDs where currentUser is manager.
 *                                              Used to gate per-row role editing in scope='global'.
 * @param {function} props.onClose           Called to close the modal.
 * @param {function} props.onSaved           Called after successful save with { fullName, role?, refreshed }.
 *                                           Parent decides whether to full-reload or optimistically update.
 */
export default function UserEditModal({
  open,
  user,
  currentUser,
  scope,
  companyId,
  companyName,
  managedCompanyIds = [],
  onClose,
  onSaved,
}) {
  const isAdminUser = isAdmin(currentUser)
  const [editForm, setEditForm] = useState({
    fullName: '',
    email: '',
    platformRole: 'user',
    companyRoles: {},
    singleRole: 'editor', // used in scope='company' for the one-company select
  })
  const [avatarFile, setAvatarFile] = useState(null)
  const [avatarPreview, setAvatarPreview] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // Reset form whenever the target user changes (modal opened with a new user).
  useEffect(() => {
    if (!user) return
    const companyRolesMap = (user.companies || []).reduce((acc, c) => {
      acc[c.companyId] = c.role
      return acc
    }, {})
    const currentCompanyRole = scope === 'company' && companyId
      ? (user.companies || []).find((c) => c.companyId === companyId)?.role || 'editor'
      : 'editor'
    setEditForm({
      fullName: user.fullName || '',
      email: user.email || '',
      platformRole: user.platformRole || 'user',
      companyRoles: companyRolesMap,
      singleRole: currentCompanyRole,
    })
    setAvatarFile(null)
    setAvatarPreview(user.avatarUrl || '')
    setError('')
  }, [user, scope, companyId])

  if (!user) return null

  // -------- Gating helpers --------
  function canManageMembership(company) {
    if (isAdminUser) return true
    return managedCompanyIds.includes(company.companyId) && company.role !== 'manager'
  }
  function membershipRoleOptions(company) {
    return isAdminUser
      ? COMPANY_ROLE_ORDER
      : MANAGER_ASSIGNABLE_COMPANY_ROLE_ORDER.filter((role) => role === company.role || role !== 'manager')
  }
  function singleCompanyRoleOptions() {
    if (isAdminUser) return COMPANY_ROLE_ORDER
    const base = MANAGER_ASSIGNABLE_COMPANY_ROLE_ORDER
    return base.includes(editForm.singleRole)
      ? base
      : [editForm.singleRole, ...base.filter((r) => r !== editForm.singleRole)]
  }

  // -------- Section flags --------
  const showEmailField = scope === 'global' && isAdminUser
  const showPlatformRoleField = scope === 'global' && isAdminUser
  const showMembershipsList = scope === 'global'
    && (user.companies || []).length > 0
    && !isGlobalPlatformRole(isAdminUser ? editForm.platformRole : user.platformRole || 'user')
  const showSingleCompanyRole = scope === 'company'
  const showFormNote = showPlatformRoleField && editForm.platformRole !== 'user'

  const subtitle = scope === 'global'
    ? (isAdminUser
        ? 'Actualiza identidad, email, rol de plataforma y roles por empresa.'
        : 'Actualiza el nombre y los roles por empresa.')
    : (isAdminUser
        ? 'Actualiza el nombre y el rol dentro de la empresa.'
        : 'Actualiza el nombre y el rol dentro de tu empresa.')

  // -------- Handlers --------
  function handleAvatarFileChange(event) {
    const file = event.target.files?.[0] || null
    setAvatarFile(file)
    if (!file) {
      setAvatarPreview(user?.avatarUrl || '')
      return
    }
    const reader = new FileReader()
    reader.onload = () => setAvatarPreview(String(reader.result || ''))
    reader.readAsDataURL(file)
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (busy) return

    setBusy(true)
    setError('')

    try {
      // 1. PATCH profile
      const profileBody = (scope === 'global' && isAdminUser)
        ? { fullName: editForm.fullName, email: editForm.email, platformRole: editForm.platformRole }
        : { fullName: editForm.fullName }

      const nameChanged = editForm.fullName.trim() !== (user.fullName || '').trim()
      const emailChanged = scope === 'global' && isAdminUser && editForm.email !== (user.email || '')
      const platformRoleChanged = scope === 'global' && isAdminUser && editForm.platformRole !== (user.platformRole || 'user')

      if (nameChanged || emailChanged || platformRoleChanged) {
        await apiFetch(`/api/users/${user.id}`, {
          method: 'PATCH',
          body: JSON.stringify(profileBody),
        })
      }

      // 2. PATCH membership(s)
      if (scope === 'company') {
        // Single-company update
        if (editForm.singleRole !== ((user.companies || []).find((c) => c.companyId === companyId)?.role)) {
          await apiFetch(`/api/users/${user.id}/memberships/${companyId}`, {
            method: 'PATCH',
            body: JSON.stringify({ role: editForm.singleRole }),
          })
        }
      } else if (showMembershipsList) {
        const targetPlatformRole = isAdminUser ? editForm.platformRole : user.platformRole
        if (targetPlatformRole === 'user') {
          const changes = (user.companies || []).filter((c) => {
            const next = editForm.companyRoles?.[c.companyId]
            if (!next || next === c.role) return false
            return canManageMembership(c)
          })
          for (const c of changes) {
            await apiFetch(`/api/users/${user.id}/memberships/${c.companyId}`, {
              method: 'PATCH',
              body: JSON.stringify({ role: editForm.companyRoles[c.companyId] }),
            })
          }
        }
      }

      // 3. POST avatar (if changed)
      if (avatarFile) {
        const formData = new FormData()
        formData.append('avatar', avatarFile)
        await apiFetch(`/api/users/${user.id}/avatar`, {
          method: 'POST',
          body: formData,
        })
      }

      // Done — let parent decide what to refresh.
      onSaved?.({
        fullName: editForm.fullName,
        role: scope === 'company' ? editForm.singleRole : null,
      })
      onClose?.()
    } catch (err) {
      setError(err?.message || 'No se pudo actualizar el usuario')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={scope === 'global' ? 'Editar usuario' : 'Editar miembro'}
      size={scope === 'global' ? 'lg' : 'md'}
      ariaDescribedBy="user-edit-modal-description"
    >
      <p id="user-edit-modal-description" className={styles.subtitle}>{subtitle}</p>

      <form onSubmit={handleSubmit}>
        {/* Avatar editor — both scopes */}
        <div className="user-edit-avatar-editor" style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 56, height: 56, borderRadius: '50%', background: 'var(--wb-color-neutral-200)', overflow: 'hidden' }}>
            {avatarPreview ? (
              <img src={avatarPreview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <span style={{ fontWeight: 600 }}>{userInitials(user)}</span>
            )}
          </span>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--wb-color-neutral-300)', cursor: 'pointer' }}>
              <Camera size={16} aria-hidden="true" />
              <span>Cambiar imagen</span>
              <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleAvatarFileChange} style={{ display: 'none' }} />
            </label>
            {user.avatarUrl && (
              <>
                <Button type="button" variant="secondary" size="md" icon={<Download size={16} />} onClick={() => downloadAvatarExport(user.id, 'original')}>Original</Button>
                <Button type="button" variant="secondary" size="md" icon={<Download size={16} />} onClick={() => downloadAvatarExport(user.id, 'web')}>WebP</Button>
              </>
            )}
          </div>
        </div>

        <Input
          label="Nombre"
          type="text"
          value={editForm.fullName}
          onChange={(e) => setEditForm((c) => ({ ...c, fullName: e.target.value }))}
          placeholder="Nombre completo"
        />

        {showEmailField && (
          <Input
            label="Email"
            type="email"
            value={editForm.email}
            onChange={(e) => setEditForm((c) => ({ ...c, email: e.target.value }))}
            required
          />
        )}

        {showPlatformRoleField && (
          <Select
            label="Rol plataforma"
            value={editForm.platformRole}
            onChange={(e) => setEditForm((c) => ({ ...c, platformRole: e.target.value }))}
          >
            {PLATFORM_ROLE_ORDER.map((role) => (
              <option key={role} value={role}>{PLATFORM_ROLE_LABEL(role)}</option>
            ))}
          </Select>
        )}

        {showFormNote && (
          <p className={styles.formNote}>Admin y QA usan acceso global, sin rol por empresa.</p>
        )}

        {showMembershipsList && (
          <div style={{ marginTop: '12px' }}>
            <p style={{ fontWeight: 600, marginBottom: '8px' }}>Roles por empresa</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {(user.companies || []).map((company) => {
                const manageable = canManageMembership(company)
                const currentRole = editForm.companyRoles?.[company.companyId] ?? company.role
                return (
                  <div key={company.companyId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', padding: '8px 12px', border: '1px solid var(--wb-color-neutral-200)', borderRadius: '8px' }}>
                    <div>
                      <p style={{ margin: 0, fontWeight: 600 }}>{company.companyName}</p>
                      {company.companySlug && <p style={{ margin: 0, fontSize: '0.85em', color: 'var(--wb-color-neutral-600)' }}>/{company.companySlug}</p>}
                    </div>
                    {manageable ? (
                      <Select
                        value={currentRole}
                        onChange={(e) => setEditForm((c) => ({ ...c, companyRoles: { ...c.companyRoles, [company.companyId]: e.target.value } }))}
                        fullWidth={false}
                      >
                        {membershipRoleOptions(company).map((role) => (
                          <option key={role} value={role}>{COMPANY_ROLE_LABEL(role)}</option>
                        ))}
                      </Select>
                    ) : (
                      <Badge variant="neutral" size="sm">{COMPANY_ROLE_LABEL(company.role)}</Badge>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {showSingleCompanyRole && (
          <>
            <Select
              label={`Rol en ${companyName || 'empresa'}`}
              value={editForm.singleRole}
              onChange={(e) => setEditForm((c) => ({ ...c, singleRole: e.target.value }))}
            >
              {singleCompanyRoleOptions().map((role) => (
                <option key={role} value={role}>{COMPANY_ROLE_LABEL(role)}</option>
              ))}
            </Select>
            <p className={styles.fieldHint}>Email: {user.email || 'Sin email'}</p>
          </>
        )}

        {error && <p className={styles.error}>{error}</p>}

        <div className={styles.actions}>
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>Cancelar</Button>
          <Button type="submit" variant="primary" disabled={busy} loading={busy}>
            {busy ? 'Guardando...' : 'Guardar cambios'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
```

### Step 4: Verify the component compiles (no runtime, just build)

```bash
cd /Users/adrian/GitHub/webbrief/frontend
npm run build 2>&1 | tail -30
```

Expected: successful Vite build, no syntax errors. If errors related to imports or JSX appear, fix inline before committing.

### Step 5: Commit

```bash
cd /Users/adrian/GitHub/webbrief
git add frontend/src/components/users/UserEditModal.jsx \
        frontend/src/components/users/UserEditModal.module.css \
        frontend/src/lib/sendAccessClient.js
git commit -m "feat(users): add shared UserEditModal + sendAccessClient

New self-contained component handles both UsersPage (scope='global')
and CompanyPage (scope='company') edit flows. Conditional sections
gate Email + Platform Role + per-company memberships list. Avatar
editor is in both scopes (per spec — less code duplication).

Extracted sendAccess client wrapper from UsersPage so CompanyPage
team row can mount the same envelope button without copy-paste."
```

---

## Task 2: Refactor UsersPage to use UserEditModal

**Files:**
- Modify: `frontend/src/pages/UsersPage.jsx`

### Step 1: Import the new component and shared sendAccess

At the top of `frontend/src/pages/UsersPage.jsx`, add to the imports block:

```javascript
import UserEditModal from '../components/users/UserEditModal'
import { sendAccess as sendAccessRequest } from '../lib/sendAccessClient'
```

### Step 2: Remove obsolete state hooks

Delete these state hooks (lines 94–98):

```javascript
const [editingUser, setEditingUser] = useState(null)
const [editForm, setEditForm] = useState({ fullName: '', email: '', platformRole: 'user', companyRoles: {} })
const [avatarFile, setAvatarFile] = useState(null)
const [avatarPreview, setAvatarPreview] = useState('')
```

Replace with just:

```javascript
const [editingUser, setEditingUser] = useState(null)
```

`expandedUserId` (line 98) stays.

### Step 3: Remove handler bodies — replace with thin wrappers

Delete these functions entirely:
- `openEditUser` (lines 287–304)
- `closeEditUser` (lines 306–310)
- `handleAvatarFileChange` (lines 312–326)
- `handleEditUser` (lines 328–386)

Replace with two tiny handlers:

```javascript
function openEditUser(user) {
  setEditingUser(user)
  setActionMessage('')
  setError('')
}

function handleUserSaved() {
  loadUsers()
  setActionMessage('Usuario actualizado')
}
```

### Step 4: Refactor `handleSendAccess` to use shared client

Replace `handleSendAccess` (lines 427–472) with:

```javascript
async function handleSendAccess(user) {
  setBusyKey(`send-access:${user.id}`)
  setError('')
  setActionMessage('')

  const result = await sendAccessRequest(user)

  if (result.ok) {
    setActionMessage(result.message)
  } else if (result.kind === 'rate_limited') {
    setActionMessage(result.message)
  } else {
    setError(result.message)
  }

  setBusyKey('')
}
```

### Step 5: Replace the inline Modal JSX

Find the modal at lines 912–1053 (the `<Modal>` with title `"Editar usuario"`). Delete the entire `<Modal open={Boolean(editingUser)}>...</Modal>` block.

In its place, insert:

```jsx
<UserEditModal
  open={Boolean(editingUser)}
  user={editingUser}
  currentUser={currentUser}
  scope="global"
  managedCompanyIds={managedCompanyIds}
  onClose={() => setEditingUser(null)}
  onSaved={handleUserSaved}
/>
```

### Step 6: Verify build

```bash
cd /Users/adrian/GitHub/webbrief/frontend
npm run build 2>&1 | tail -20
```

Expected: clean build, no warnings beyond the pre-existing ones.

### Step 7: Commit

```bash
cd /Users/adrian/GitHub/webbrief
git add frontend/src/pages/UsersPage.jsx
git commit -m "refactor(users-page): mount shared UserEditModal

Removes ~180 LOC of inline modal JSX + handlers from UsersPage,
replacing them with <UserEditModal scope='global' />. The page now
only owns 'editingUser' state and a post-save callback (loadUsers).

handleSendAccess now delegates to the extracted sendAccessClient
so CompanyPage can reuse it in PR 2's team-row envelope addition."
```

---

## Task 3: Refactor CompanyPage to use UserEditModal + add envelope on team row

**Files:**
- Modify: `frontend/src/pages/CompanyPage.jsx`

### Step 1: Add imports

At the top of `frontend/src/pages/CompanyPage.jsx`, modify the existing imports:

```javascript
// In the lucide-react import, ADD Mail to the existing list:
import { Archive, ArrowRight, Building2, Copy, Mail, Pencil, Trash2, Plus } from 'lucide-react'

// In the roleCapabilities import, ADD canSendAccess:
import {
  canCreateProjects as canCreateProjectsForRole,
  canInviteMembers,
  canManageProjectLifecycle as canManageProjectLifecycleForRole,
  canSendAccess,
  getInviteRoleOptions,
  isAdmin,
} from '../lib/roleCapabilities'

// Add NEW imports:
import UserEditModal from '../components/users/UserEditModal'
import { sendAccess as sendAccessRequest } from '../lib/sendAccessClient'
```

### Step 2: Remove obsolete state and handlers

Delete these state hooks (lines 99–102):

```javascript
const [editingMember, setEditingMember] = useState(null)
const [editForm, setEditForm] = useState({ fullName: '', role: 'editor' })
const [editError, setEditError] = useState('')
const [editBusy, setEditBusy] = useState(false)
```

Replace with:

```javascript
const [editingMember, setEditingMember] = useState(null)
const [accessBusyId, setAccessBusyId] = useState('')
const [accessMessage, setAccessMessage] = useState('')
const [accessError, setAccessError] = useState('')
```

Delete `openEditMember` (lines 234–241), `closeEditMember` (lines 243–246), and `handleSaveEditMember` (lines 248–294) entirely.

Replace with:

```javascript
function openEditMember(member) {
  setEditingMember(member)
  setAccessMessage('')
  setAccessError('')
}

function handleMemberSaved(updates) {
  if (!editingMember) return
  const nextMembers = members.map((existing) => (
    existing.userId === editingMember.userId
      ? { ...existing, fullName: updates.fullName, role: updates.role || existing.role }
      : existing
  ))
  setMembers(nextMembers)
  if (company) writeCompanyCache(companyId, { company, projects, members: nextMembers })
}

async function handleSendAccessForMember(member) {
  if (!member?.userId) return
  setAccessBusyId(member.userId)
  setAccessError('')
  setAccessMessage('')

  // Build a minimal "target user" shape that sendAccessRequest needs.
  const targetUser = { id: member.userId, email: member.email, companies: [{ companyId }] }
  const result = await sendAccessRequest(targetUser)

  if (result.ok || result.kind === 'rate_limited') {
    setAccessMessage(result.message)
  } else {
    setAccessError(result.message)
  }
  setAccessBusyId('')
}
```

### Step 3: Map members to the shape UserEditModal expects

`UserEditModal` expects `user.id` (auth user id) — CompanyPage members have `userId`. Add a small mapper just before passing the user:

In the `<UserEditModal>` mount (next step), use:

```jsx
user={editingMember ? {
  id: editingMember.userId,
  fullName: editingMember.fullName,
  email: editingMember.email,
  avatarUrl: editingMember.avatarUrl || '',
  platformRole: 'user',  // CompanyPage members don't carry platformRole; modal hides that section in scope='company' anyway
  companies: [{
    companyId,
    companyName: company?.name,
    role: editingMember.role,
  }],
} : null}
```

### Step 4: Replace the inline Modal

Find the `<Modal open={Boolean(editingMember)} ... title="Editar miembro">...</Modal>` block (lines 828–875). Delete the entire block and replace with:

```jsx
<UserEditModal
  open={Boolean(editingMember)}
  user={editingMember ? {
    id: editingMember.userId,
    fullName: editingMember.fullName,
    email: editingMember.email,
    avatarUrl: editingMember.avatarUrl || '',
    platformRole: 'user',
    companies: [{ companyId, companyName: company?.name, role: editingMember.role }],
  } : null}
  currentUser={currentUser}
  scope="company"
  companyId={companyId}
  companyName={company?.name || 'empresa'}
  onClose={() => setEditingMember(null)}
  onSaved={handleMemberSaved}
/>
```

### Step 5: Add envelope (send-access) icon to team row

Find the team member row JSX. In `CompanyPage.jsx` look for the pencil button on member rows (the existing block is around lines 806–816 — search for `openEditMember(member)` to locate it). The row currently renders only the pencil. Add a Mail icon button BEFORE the pencil:

Find this block:

```jsx
{memberManageable && (
  <Button
    type="button"
    variant="ghost"
    size="sm"
    icon={<Pencil size={16} />}
    onClick={() => openEditMember(member)}
    title="Editar miembro"
  />
)}
```

Replace with:

```jsx
{canSendAccess(currentUser, { id: member.userId, companies: [{ companyId }] }) && (
  <Button
    type="button"
    variant="ghost"
    size="sm"
    icon={<Mail size={16} />}
    onClick={() => handleSendAccessForMember(member)}
    disabled={accessBusyId === member.userId}
    title="Enviar acceso (invitación o restablecimiento)"
  />
)}
{memberManageable && (
  <Button
    type="button"
    variant="ghost"
    size="sm"
    icon={<Pencil size={16} />}
    onClick={() => openEditMember(member)}
    title="Editar miembro"
  />
)}
```

### Step 6: Surface accessMessage / accessError to the user

Above the team list (or wherever feedback banners already render), add:

```jsx
{accessMessage && <p style={{ color: 'var(--wb-color-success-600)', margin: '8px 0' }}>{accessMessage}</p>}
{accessError && <p style={{ color: 'var(--wb-color-danger-600)', margin: '8px 0' }}>{accessError}</p>}
```

Place these BEFORE the `<div>` that wraps the member list. Quick location: search for `Miembros` heading or the member-list container — feedback goes just above it.

### Step 7: Verify build

```bash
cd /Users/adrian/GitHub/webbrief/frontend
npm run build 2>&1 | tail -20
```

Expected: clean build.

### Step 8: Commit

```bash
cd /Users/adrian/GitHub/webbrief
git add frontend/src/pages/CompanyPage.jsx
git commit -m "refactor(company-page): mount shared UserEditModal + envelope on team row

Removes inline 'Editar miembro' modal (~75 LOC) in favor of <UserEditModal
scope='company' />. Adds a Mail icon button to each team row gated by
canSendAccess, mirroring UsersPage. Both pages now share one modal +
one send-access path."
```

---

## Task 4: Manual smoke test (HUMAN ONLY — not dispatched)

The user runs this; mark Task 4 complete only when they confirm.

### Steps

- [ ] **Step 1: Run frontend dev server**

```bash
cd /Users/adrian/GitHub/webbrief/frontend
npm run dev
```

Wait for Vite to print local URL.

- [ ] **Step 2: Verify UsersPage edit modal (scope='global')**

1. Log in as admin
2. Navigate to `/users`
3. Find a row, click pencil → modal opens with title "Editar usuario", size `lg`
4. Verify avatar editor + Name + Email + Platform Role + Memberships list (when target is platform-role='user') all render
5. Change name → Save → row updates in list
6. Click envelope (Mail) icon on a row → toast "Invitación reenviada..." or similar
7. Close modal — no console errors

- [ ] **Step 3: Verify CompanyPage edit modal (scope='company')**

1. Navigate to `/companies/{some-company-id}`
2. In Equipo sidecard, find a member, click pencil → modal opens with title "Editar miembro", size `md`
3. Verify avatar editor + Name + "Rol en {company}" Select + "Email: ..." hint render
4. Verify Email field, Platform Role select, and Memberships LIST do NOT render (those are scope='global' only)
5. Change role → Save → row updates in sidecard
6. **NEW:** Click envelope icon on a member row → toast appears (success or rate-limit message)

- [ ] **Step 4: Cross-check no visual regressions**

Compare with pre-refactor screenshots if available, OR just sanity-check spacing/typography matches the rest of the admin shell.

---

## Task 5: Opus Max QA pass + auto-debug

Dispatch a single Opus subagent with cross-cutting scope. It does the equivalent of Tasks 1+2+3 spec compliance + code quality review at once, AND auto-fixes any minor issues it finds.

The dispatcher prompt is in [`docs/superpowers/plans/2026-05-25-pr2-shared-user-edit-modal.md`](#) — Task 5 section — and is constructed at dispatch time with the actual base + head SHAs.

Acceptance after Opus pass:
- All issues marked Critical or Important must be fixed
- Minor issues can be deferred (documented)
- Build still passes

---

## Task 6: Push branch + open PR

- [ ] **Step 1: Verify branch state**

```bash
cd /Users/adrian/GitHub/webbrief
git status
git log --oneline main..HEAD
```

Expected: clean working tree (or only the pre-existing unrelated CSS modifications); 3–4 commits on the branch (one per task that touched code; +1 if Opus QA committed fixes).

- [ ] **Step 2: Push**

```bash
git push -u origin fix/shared-user-edit-modal
```

- [ ] **Step 3: Report compare URL**

```
https://github.com/xacty/webbrief/compare/fix/shared-user-edit-modal?expand=1
```

The user opens the PR manually (gh CLI not installed). Suggested title + body:

**Title:**
```
refactor(users): extract shared UserEditModal — UsersPage + CompanyPage parity
```

**Body:**
```markdown
## Summary

- New shared component `frontend/src/components/users/UserEditModal.jsx` consumed by BOTH `UsersPage` (scope='global') and `CompanyPage` (scope='company') team sidecard.
- Conditional sections per scope: global shows Email + Platform Role + multi-company memberships list; company shows single-company role select.
- Avatar editor available in both scopes (per spec — less code duplication).
- Adds Mail (send-access) icon button to CompanyPage team row, gated by `canSendAccess`. Closes the parity gap the user reported.
- Extracted `frontend/src/lib/sendAccessClient.js` so both pages reuse the same send-access wire format.

## Out of scope (deferred to PR 3 / PR 4)

- Company-admin role (Google Workspace-style) → PR 3
- Set-password + sessions feature → PR 4 (will mount inside the shared modal)

## Test plan

- [x] Frontend build passes (`cd frontend && npm run build`)
- [ ] Manual smoke: UsersPage edit modal opens, save works, envelope row button works
- [ ] Manual smoke: CompanyPage edit modal opens, single-company role select works, save works, envelope row button works (NEW)
- [ ] Visual sanity-check vs pre-refactor (no spacing/typography regressions)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

---

## Done When

- [ ] All 6 tasks complete
- [ ] Frontend build clean
- [ ] Smoke test passes (human-confirmed)
- [ ] Opus QA pass auto-fixed everything Important+
- [ ] PR branch pushed; compare URL delivered

## Out of Scope

- Frontend test infrastructure (codebase has none; will land in a separate effort)
- Password section in modal → PR 4
- Sessions list + eye-icon for IP reveal → PR 4
- Company-admin role gating in role selects → PR 3
- CSS module migration of inline styles in UserEditModal.jsx (avatar editor uses inline style for now; can be moved to module.css in a polish pass)
