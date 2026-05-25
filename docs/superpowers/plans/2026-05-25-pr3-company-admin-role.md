# PR 3 — Company-Admin Role Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Each task dispatches with `model: opus` + "ultrathink" in prompt because the security surface (role hierarchy + last-admin protection + permission matrix) demands maximum reasoning.

**Goal:** Introduce `company_memberships.role = 'admin'` as a company-level administrator role (Google Workspace-style). Establish role hierarchy `admin > manager > editor > {content_writer | designer | developer}` enforced in backend permission helpers + frontend UI. Migration already applied to Dev.

**Architecture:** Pure permission helpers in `backend/src/lib/membershipPermissions.js` (new) rank-based gating. Existing `canManageMembership`, `canAssignRole`, and `assertCompanyKeepsManager` in `backend/src/routes/users.js` refactored to consume the new helpers. `canSendAccess` in `backend/src/lib/sendAccess.js` extended to recognize company-admin. `shared/userRoles.js` adds `admin` to role enums. Frontend mirrors get the same rank logic via `frontend/src/lib/roleCapabilities.js`. UI shows admin badge + Admin option in role selects when actor is authorized.

**Tech Stack:** Same as PR 2 — Node ESM backend, React/JSX frontend, `node --test`, MCP Supabase Dev.

**Reference spec:** [`docs/superpowers/specs/2026-05-25-auth-team-fixes-design.md`](../specs/2026-05-25-auth-team-fixes-design.md) — Section D.

**Migration status (Task 0):** `supabase/migrations/20260525_company_admin_role.sql` already applied to Supabase Dev via MCP. Verified: CHECK constraint now allows `admin`. Backfill was no-op (Dev has no managers to promote). Prod application is a manual step the user runs before deploying code.

**Real role list discovered via Dev introspection** (spec had wrong assumption — said `viewer`, actual columns are below):

```
admin, manager, editor, content_writer, designer, developer
```

`admin` is new from this PR. The other 5 pre-existed.

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `supabase/migrations/20260525_company_admin_role.sql` | ✓ Already created + applied to Dev | Constraint + backfill |
| `shared/userRoles.js` | Modify | Add `admin` to role enums + labels + assignable lists; export `roleRank()`; update `getInviteRoleOptionsForMembership` |
| `backend/src/lib/membershipPermissions.js` | **Create** | Pure helpers: `roleRank`, `canPromoteToRole`, `canDemoteFromRole`, `wouldLeaveCompanyWithoutAdmin` |
| `backend/src/routes/users.js` | Modify | Refactor `canManageMembership`, `canAssignRole` to use rank helpers; rename `assertCompanyKeepsManager` → `assertCompanyKeepsAdmin` + invoke when demoting admin |
| `backend/src/routes/companies.js` | Modify | POST creates `role: 'admin'` instead of `role: 'manager'` |
| `backend/src/lib/sendAccess.js` | Modify | `canSendAccess` matrix extended for company-admin power |
| `backend/src/lib/users.js` | Modify | `inviteUserToCompany` accepts the new `admin` role value (validation) |
| `backend/test/membership-permissions.test.js` | **Create** | Matrix: ~15 tests for rank helpers + last-admin protection |
| `frontend/src/lib/roleCapabilities.js` | Modify | Mirror updated `canSendAccess` + add `canPromoteToAdmin` helper |
| `frontend/src/components/users/UserEditModal.jsx` | Modify | `singleCompanyRoleOptions` includes `admin` when actor authorized |
| `frontend/src/pages/CompanyPage.jsx` | Modify | Admin badge on team row + role counter (e.g. "1 admin · 2 managers · 3 editores") |

No new frontend files. No frontend tests added (codebase pattern).

---

## Task 2 — `shared/userRoles.js`: add admin to role enums

**File:** `shared/userRoles.js`

### Step 1: Read current state

```bash
cat /Users/adrian/GitHub/webbrief/shared/userRoles.js
```

### Step 2: Update `COMPANY_ROLE_ORDER` and label

Find:
```javascript
export const COMPANY_ROLE_ORDER = ['manager', 'editor', 'content_writer', 'designer', 'developer']
```

Replace with:
```javascript
export const COMPANY_ROLE_ORDER = ['admin', 'manager', 'editor', 'content_writer', 'designer', 'developer']
```

Find `COMPANY_ROLE_LABELS`:
```javascript
export const COMPANY_ROLE_LABELS = {
  manager: 'Manager',
  editor: 'Editor',
  content_writer: 'Content Writer',
  designer: 'Diseño',
  developer: 'Dev',
}
```

Replace with:
```javascript
export const COMPANY_ROLE_LABELS = {
  admin: 'Admin',
  manager: 'Manager',
  editor: 'Editor',
  content_writer: 'Content Writer',
  designer: 'Diseño',
  developer: 'Dev',
}
```

### Step 3: Add `ADMIN_ASSIGNABLE_COMPANY_ROLE_ORDER` and `roleRank`

After `MANAGER_ASSIGNABLE_COMPANY_ROLE_ORDER` declaration, ADD:

```javascript
// Company-admins can assign any company role including 'admin' (peer or new).
// Platform-admins effectively use the same list (they bypass company-level checks
// in the per-endpoint admin shortcut, so this list is what UI shows them too).
export const ADMIN_ASSIGNABLE_COMPANY_ROLE_ORDER = COMPANY_ROLE_ORDER

// Role rank for hierarchy comparisons. Higher = more authority.
// 'admin' (4) > 'manager' (3) > 'editor' (2) > worker roles (1, peers among themselves).
const COMPANY_ROLE_RANK = {
  admin: 4,
  manager: 3,
  editor: 2,
  content_writer: 1,
  designer: 1,
  developer: 1,
}

export function getCompanyRoleRank(role) {
  return COMPANY_ROLE_RANK[role] || 0
}
```

### Step 4: Update `getInviteRoleOptionsForMembership` for the admin role

Find:
```javascript
export function getInviteRoleOptionsForMembership(currentUserPlatformRole, membershipRole) {
  if (currentUserPlatformRole === 'admin') {
    return COMPANY_ROLE_ORDER
  }

  if (membershipRole === 'manager') {
    return MANAGER_ASSIGNABLE_COMPANY_ROLE_ORDER
  }

  if (membershipRole === 'editor') {
    return ['content_writer', 'designer', 'developer']
  }

  if (membershipRole === 'designer' || membershipRole === 'developer') {
    return ['editor', 'designer', 'developer']
  }

  return []
}
```

Replace with:
```javascript
export function getInviteRoleOptionsForMembership(currentUserPlatformRole, membershipRole) {
  // Platform-admins can invite any role to any company.
  if (currentUserPlatformRole === 'admin') {
    return COMPANY_ROLE_ORDER
  }

  // Company-admin (the new role) can invite anything — they own the company.
  if (membershipRole === 'admin') {
    return ADMIN_ASSIGNABLE_COMPANY_ROLE_ORDER
  }

  // Manager can invite worker roles + editor, but NOT manager or admin.
  if (membershipRole === 'manager') {
    return MANAGER_ASSIGNABLE_COMPANY_ROLE_ORDER
  }

  if (membershipRole === 'editor') {
    return ['content_writer', 'designer', 'developer']
  }

  if (membershipRole === 'designer' || membershipRole === 'developer') {
    return ['editor', 'designer', 'developer']
  }

  return []
}
```

### Step 5: Verify backend tests still pass

```bash
cd /Users/adrian/GitHub/webbrief/backend && NODE_ENV=test node --test 2>&1 | tail -8
```

Expected: all tests still pass (no new tests added in this task; just verifying no regression in existing tests that import these constants).

### Step 6: Commit

```bash
cd /Users/adrian/GitHub/webbrief
git add shared/userRoles.js supabase/migrations/20260525_company_admin_role.sql
git commit -m "feat(roles): add company-admin role + role rank helpers

shared/userRoles.js gains 'admin' as a valid company_memberships.role:
- COMPANY_ROLE_ORDER prepends 'admin'
- COMPANY_ROLE_LABELS adds 'Admin' label
- New ADMIN_ASSIGNABLE_COMPANY_ROLE_ORDER (= COMPANY_ROLE_ORDER for now)
- New getCompanyRoleRank() with admin=4, manager=3, editor=2, workers=1
- getInviteRoleOptionsForMembership() recognizes membershipRole='admin' (invites anyone)

Companion migration 20260525_company_admin_role.sql already applied to
Supabase Dev via MCP. Constraint updated to allow 'admin'. Backfill is
idempotent — promotes the earliest manager per company to admin (no-op
when company already has an admin)."
```

---

## Task 3 — Backend: rank-based permission helpers + last-admin protection + companies POST creates admin

**Files:**
- Create: `backend/src/lib/membershipPermissions.js`
- Modify: `backend/src/routes/users.js`
- Modify: `backend/src/routes/companies.js`
- Modify: `backend/src/lib/sendAccess.js`

### Step 1: Create `backend/src/lib/membershipPermissions.js`

```javascript
// Pure, side-effect-free permission helpers for company_memberships
// role transitions. Side-effect free for unit testability.
//
// Rank hierarchy: admin(4) > manager(3) > editor(2) > workers(1).
// A platform-admin (global) implicitly outranks everyone in every company.

import { getCompanyRoleRank } from '../../../shared/userRoles.js'

/**
 * Can the actor manage (edit role / remove) a membership where the target
 * currently has `targetRole` in `companyId`?
 *
 * Rule: actor's role in the same company must strictly outrank target's role.
 * Platform-admin bypasses (returns true unconditionally).
 *
 * @param {object} args
 * @param {string} args.actorPlatformRole  e.g. 'admin' | 'user' | 'qa'
 * @param {Array<{companyId: string, role: string}>} args.actorMemberships
 * @param {string} args.companyId
 * @param {string} args.targetRole
 */
export function canManageMembershipRanked({ actorPlatformRole, actorMemberships, companyId, targetRole }) {
  if (actorPlatformRole === 'admin') return true
  const actorMembership = (actorMemberships || []).find((m) => m.companyId === companyId)
  if (!actorMembership) return false
  return getCompanyRoleRank(actorMembership.role) > getCompanyRoleRank(targetRole)
}

/**
 * Can the actor ASSIGN `role` in `companyId`?
 *
 * Rule: actor must strictly outrank the role they want to assign (or be platform-admin).
 * Prevents a manager from promoting someone to manager (peer) or admin.
 */
export function canAssignRoleRanked({ actorPlatformRole, actorMemberships, companyId, role }) {
  if (actorPlatformRole === 'admin') return true
  const actorMembership = (actorMemberships || []).find((m) => m.companyId === companyId)
  if (!actorMembership) return false
  return getCompanyRoleRank(actorMembership.role) > getCompanyRoleRank(role)
}

/**
 * Would changing this membership's role demote the LAST admin of a company?
 *
 * @param {object} args
 * @param {string} args.currentRole       Target's current role
 * @param {string} args.nextRole          Target's would-be new role
 * @param {string[]} args.companyAdminUserIds  user_ids of all current admins in the company
 * @param {string} args.targetUserId      The user being demoted
 * @returns {boolean} true if the change would leave the company with zero admins
 */
export function wouldLeaveCompanyWithoutAdmin({ currentRole, nextRole, companyAdminUserIds, targetUserId }) {
  if (currentRole !== 'admin') return false
  if (nextRole === 'admin') return false
  const otherAdmins = (companyAdminUserIds || []).filter((id) => id !== targetUserId)
  return otherAdmins.length === 0
}

/**
 * Updated send-access matrix (mirrors backend/src/lib/sendAccess.js extension).
 * Returns true if actor can send-access to target.
 *
 * Rule: actor outranks target in at least one shared company (or is platform-admin).
 * QA always denied. Self always denied.
 */
export function canSendAccessRanked({ actor, targetUserId, actorMemberships, targetMemberships }) {
  if (!actor || !targetUserId) return false
  if (actor.id === targetUserId) return false
  if (actor.platformRole === 'admin') return true
  if (actor.platformRole === 'qa') return false

  const sharedCompanies = new Set(
    (actorMemberships || []).map((m) => m.companyId)
  )

  for (const tm of (targetMemberships || [])) {
    if (!sharedCompanies.has(tm.companyId)) continue
    const actorMembership = (actorMemberships || []).find((m) => m.companyId === tm.companyId)
    if (!actorMembership) continue
    if (getCompanyRoleRank(actorMembership.role) > getCompanyRoleRank(tm.role)) return true
  }
  return false
}
```

### Step 2: Refactor `backend/src/routes/users.js` helpers

Find `canAssignRole` (lines 66-69):
```javascript
function canAssignRole(currentUser, companyId, role) {
  if (!COMPANY_ROLE_SET.has(role)) return false
  return canInviteCompanyRole(currentUser, companyId, role)
}
```

Replace with (calls into the new rank helper):
```javascript
function canAssignRole(currentUser, companyId, role) {
  if (!COMPANY_ROLE_SET.has(role)) return false
  return canAssignRoleRanked({
    actorPlatformRole: currentUser?.platformRole,
    actorMemberships: currentUser?.memberships || [],
    companyId,
    role,
  })
}
```

Find `canManageMembership` (lines 71-74):
```javascript
function canManageMembership(currentUser, companyId, targetRole) {
  if (!canManageCompanyUsers(currentUser, companyId)) return false
  return isAdmin(currentUser) || targetRole !== 'manager'
}
```

Replace with:
```javascript
function canManageMembership(currentUser, companyId, targetRole) {
  if (!canManageCompanyUsers(currentUser, companyId)) return false
  return canManageMembershipRanked({
    actorPlatformRole: currentUser?.platformRole,
    actorMemberships: currentUser?.memberships || [],
    companyId,
    targetRole,
  })
}
```

Add the imports at the top of the file (after existing imports of `canInviteCompanyRole`):
```javascript
import {
  canAssignRoleRanked,
  canManageMembershipRanked,
  wouldLeaveCompanyWithoutAdmin,
} from '../lib/membershipPermissions.js'
```

### Step 3: Replace `assertCompanyKeepsManager` with `assertCompanyKeepsAdmin`

Find function (lines 137-150):
```javascript
async function assertCompanyKeepsManager(companyId, removedManagerId) {
  const { data, error } = await supabaseAdmin
    .from('company_memberships')
    .select('user_id')
    .eq('company_id', companyId)
    .eq('role', 'manager')

  if (error) throw error

  const remainingManagers = (data || []).filter((membership) => membership.user_id !== removedManagerId)
  if (remainingManagers.length === 0) {
    throw httpError(400, 'La empresa debe conservar al menos un manager')
  }
}
```

Replace with:
```javascript
// Returns the list of admin user_ids for a company.
async function getCompanyAdminUserIds(companyId) {
  const { data, error } = await supabaseAdmin
    .from('company_memberships')
    .select('user_id')
    .eq('company_id', companyId)
    .eq('role', 'admin')

  if (error) throw error
  return (data || []).map((m) => m.user_id).filter(Boolean)
}

// Throws 400 if changing this membership would leave the company without an admin.
// Pass the new role; pass null when fully removing the membership.
async function assertCompanyKeepsAdmin(companyId, targetUserId, nextRole) {
  const adminIds = await getCompanyAdminUserIds(companyId)
  // We need the CURRENT role to know if we're actually demoting an admin.
  const currentMembership = await getMembership(targetUserId, companyId)
  const currentRole = currentMembership?.role
  if (wouldLeaveCompanyWithoutAdmin({
    currentRole,
    nextRole: nextRole === null ? 'editor' : nextRole, // "removed" treated as demoted
    companyAdminUserIds: adminIds,
    targetUserId,
  })) {
    throw httpError(400, 'La empresa debe conservar al menos un admin')
  }
}
```

Now update the 2 call sites (PATCH at line 720-722, DELETE at line 758-760):

In `router.patch('/:id/memberships/:companyId', ...)` find:
```javascript
    if (membership.role === 'manager' && role !== 'manager') {
      await assertCompanyKeepsManager(companyId, userId)
    }
```

Replace with:
```javascript
    if (membership.role === 'admin' && role !== 'admin') {
      await assertCompanyKeepsAdmin(companyId, userId, role)
    }
```

In `router.delete('/:id/memberships/:companyId', ...)` find:
```javascript
    if (membership.role === 'manager') {
      await assertCompanyKeepsManager(companyId, userId)
    }
```

Replace with:
```javascript
    if (membership.role === 'admin') {
      await assertCompanyKeepsAdmin(companyId, userId, null)
    }
```

### Step 4: `backend/src/routes/companies.js` — POST creates admin

Find line 413 (inside the `POST /` handler):
```javascript
        manager = await inviteUserToCompany({
          email: normalizedManagerEmail,
          fullName: managerFullName || managerName || '',
          role: 'manager',
          companyId: company.id,
          req,
        })
```

Replace `role: 'manager'` with `role: 'admin'`:
```javascript
        manager = await inviteUserToCompany({
          email: normalizedManagerEmail,
          fullName: managerFullName || managerName || '',
          role: 'admin',
          companyId: company.id,
          req,
        })
```

Also update the variable name where possible. Find a few lines down:
```javascript
        metadata: {
          role: 'manager',
          inviteSent: manager.inviteSent,
          ...
```

Update `role: 'admin'` in the metadata too:
```javascript
        metadata: {
          role: 'admin',
          inviteSent: manager.inviteSent,
          ...
```

NOTE: The local variable name `manager` is misleading now (the user gets created as admin), but renaming it would ripple through the response shape (`return res.status(201).json({ company, manager })`). KEEP the variable name as-is for backward API compatibility (clients consume `body.manager` expecting that field). Add a comment above the assignment explaining the keep-name decision:

```javascript
    // Note: local variable is named `manager` for API-response backward compat
    // (the response shape is `{ company, manager }` and clients consume body.manager).
    // The user is actually created as company-admin (role: 'admin') as of PR 3 of
    // the auth-team-fixes bundle.
    let manager = null
```

### Step 5: `backend/src/lib/sendAccess.js` — replace `canSendAccess` with ranked version

Find the existing `canSendAccess` function (entire body, ~lines 7-33). Replace the entire function with:

```javascript
import { canSendAccessRanked } from './membershipPermissions.js'

export function canSendAccess({ actor, targetUserId, actorMemberships = [], targetMemberships = [] }) {
  return canSendAccessRanked({
    actor,
    targetUserId,
    actorMemberships,
    targetMemberships,
  })
}
```

Make sure to remove the OLD canSendAccess body (the one that only checks manager — now the ranked version handles admin too).

The `decideSendAccessAction` and `validateResetRequestRow` functions in this file STAY UNCHANGED.

### Step 6: Update `backend/src/lib/users.js` to accept the new role

The `inviteUserToCompany` function does NOT validate the `role` parameter — it passes it through to `assignUserToCompany` which writes it via `supabaseAdmin.from('company_memberships').upsert({role})`. The DB constraint (already updated by the migration) is the source of truth.

NO code change needed in `backend/src/lib/users.js`. The new `role: 'admin'` value flows through unchanged.

### Step 7: Verify build + run backend tests

```bash
cd /Users/adrian/GitHub/webbrief/backend && NODE_ENV=test node --test 2>&1 | tail -10
```

Expected: all existing tests still pass.

Some existing tests in `backend/test/send-access.test.js` use the old `canSendAccess` shape — if they import the function directly and pass legacy args, they should still work because the new wrapper has the same signature. If any test fails, investigate WHY before mass-patching.

### Step 8: Commit

```bash
cd /Users/adrian/GitHub/webbrief
git add backend/src/lib/membershipPermissions.js \
        backend/src/routes/users.js \
        backend/src/routes/companies.js \
        backend/src/lib/sendAccess.js
git commit -m "feat(backend): company-admin role + rank-based permissions

New backend/src/lib/membershipPermissions.js exports pure helpers:
- canManageMembershipRanked / canAssignRoleRanked: strict-outrank checks
- wouldLeaveCompanyWithoutAdmin: last-admin protection logic
- canSendAccessRanked: matrix extended for company-admin

Refactors in routes/users.js delegate to these helpers. The legacy
assertCompanyKeepsManager is renamed/rewritten as assertCompanyKeepsAdmin
(now the new last-admin protection). DELETE and PATCH endpoints invoke
it when demoting an admin.

POST /api/companies now creates the first member with role='admin'
instead of 'manager' (the company-admin is the natural owner of a
freshly-created tenant). Response shape (\`{ company, manager }\`) stays
unchanged for API compat — only the role value changes.

backend/src/lib/sendAccess.js's canSendAccess now delegates to the
ranked helper so company-admins gain send-access on any subordinate
member in their company (managers, editors, workers)."
```

---

## Task 4 — Frontend: admin badge + role labels + counter

**Files:**
- Modify: `frontend/src/lib/roleCapabilities.js`
- Modify: `frontend/src/components/users/UserEditModal.jsx`
- Modify: `frontend/src/pages/CompanyPage.jsx`

### Step 1: `frontend/src/lib/roleCapabilities.js` — mirror updated canSendAccess + add helpers

Find the existing `canSendAccess` function (lines 71-95) and replace with:

```javascript
// "Enviar acceso" — admin global can target any user except self;
// company-admin or manager can target users with LOWER company role in the same company;
// peer-rank (admin↔admin, manager↔manager) is forbidden;
// QA, editor, content_writer, designer, developer → cannot send access.
// Mirrors backend canSendAccess in backend/src/lib/sendAccess.js for symmetric gating.
export function canSendAccess(currentUser, targetUser) {
  if (!currentUser || !targetUser) return false
  if (currentUser.id === targetUser.id) return false

  if (isAdmin(currentUser)) return true

  const platformRole = currentUser.realPlatformRole || currentUser.platformRole
  if (platformRole === 'qa') return false

  // Map actor's memberships to a {companyId: role} dict
  const actorRoleByCompany = new Map()
  for (const m of (currentUser.memberships || [])) {
    actorRoleByCompany.set(m.companyId, m.role)
  }
  if (actorRoleByCompany.size === 0) return false

  // For each target company, check if actor outranks target there.
  for (const targetCompany of (targetUser.companies || [])) {
    const actorRole = actorRoleByCompany.get(targetCompany.companyId)
    if (!actorRole) continue
    if (getCompanyRoleRank(actorRole) > getCompanyRoleRank(targetCompany.role)) return true
  }
  return false
}

// "Can the current user promote anyone to company-admin in this company?"
// Used by UI to gate the 'Admin' option in role selects.
export function canPromoteToAdmin(currentUser, companyId) {
  if (isAdmin(currentUser)) return true
  const m = (currentUser?.memberships || []).find((mm) => mm.companyId === companyId)
  return m?.role === 'admin'
}
```

Add the import at the top of the file (alongside the existing import from `shared/userRoles.js`):

```javascript
import {
  COMPANY_ROLE_ORDER,
  getInviteRoleOptionsForMembership,
  getCompanyRoleRank,
} from '../../../shared/userRoles.js'
```

(The existing import already pulls `COMPANY_ROLE_ORDER` and `getInviteRoleOptionsForMembership` — just add `getCompanyRoleRank` to the list.)

### Step 2: `UserEditModal.jsx` — extend `singleCompanyRoleOptions`

Find the existing `singleCompanyRoleOptions` function inside `UserEditModal.jsx`:

```javascript
function singleCompanyRoleOptions() {
  if (isAdminUser) return COMPANY_ROLE_ORDER
  const base = MANAGER_ASSIGNABLE_COMPANY_ROLE_ORDER
  return base.includes(editForm.singleRole)
    ? base
    : [editForm.singleRole, ...base.filter((r) => r !== editForm.singleRole)]
}
```

Replace with (now respects company-admin authority):

```javascript
function singleCompanyRoleOptions() {
  if (isAdminUser) return COMPANY_ROLE_ORDER
  // Company-admin in the active company can assign anything including 'admin'.
  const actorMembership = (currentUser?.memberships || []).find((m) => m.companyId === companyId)
  if (actorMembership?.role === 'admin') return COMPANY_ROLE_ORDER
  // Manager: editor + worker roles. Keep current role even if not normally assignable.
  const base = MANAGER_ASSIGNABLE_COMPANY_ROLE_ORDER
  return base.includes(editForm.singleRole)
    ? base
    : [editForm.singleRole, ...base.filter((r) => r !== editForm.singleRole)]
}
```

NOTE: The component imports `MANAGER_ASSIGNABLE_COMPANY_ROLE_ORDER` from `shared/userRoles.js` already. No additional import needed.

### Step 3: `CompanyPage.jsx` — admin badge on team row + counter

Find the team-list row JSX. Each member row currently shows the role as a Badge (or similar). Add color/variant differentiation: `member.role === 'admin'` → Badge variant `'warning'` (amber) or `'primary'` (whatever's most distinct from manager's default neutral). Sketch:

Find the member-list row JSX (search for `member.role` inside the map). Likely looks like:
```jsx
<Badge variant="neutral" size="sm">{roleLabel(member.role)}</Badge>
```

Replace with:
```jsx
<Badge
  variant={member.role === 'admin' ? 'warning' : 'neutral'}
  size="sm"
>
  {roleLabel(member.role)}
</Badge>
```

Add a counter line above the member list. Find where the "Miembros" heading or member count is rendered (search for `Miembros` or `members.length`). Add this just above:

```jsx
{(() => {
  const counts = members.reduce((acc, m) => {
    acc[m.role] = (acc[m.role] || 0) + 1
    return acc
  }, {})
  const parts = []
  if (counts.admin) parts.push(`${counts.admin} ${counts.admin === 1 ? 'admin' : 'admins'}`)
  if (counts.manager) parts.push(`${counts.manager} ${counts.manager === 1 ? 'manager' : 'managers'}`)
  if (counts.editor) parts.push(`${counts.editor} ${counts.editor === 1 ? 'editor' : 'editores'}`)
  const workerCount = (counts.content_writer || 0) + (counts.designer || 0) + (counts.developer || 0)
  if (workerCount) parts.push(`${workerCount} ${workerCount === 1 ? 'colaborador' : 'colaboradores'}`)
  return parts.length ? <p style={{ fontSize: '0.85em', color: 'var(--wb-color-neutral-600)', margin: '4px 0' }}>{parts.join(' · ')}</p> : null
})()}
```

This renders e.g. "1 admin · 2 managers · 3 editores".

### Step 4: Verify frontend build

```bash
cd /Users/adrian/GitHub/webbrief/frontend && npm run build 2>&1 | tail -10
```

Expected: clean build.

### Step 5: Commit

```bash
cd /Users/adrian/GitHub/webbrief
git add frontend/src/lib/roleCapabilities.js \
        frontend/src/components/users/UserEditModal.jsx \
        frontend/src/pages/CompanyPage.jsx
git commit -m "feat(frontend): company-admin role UI (badge + counter + role select option)

- roleCapabilities.canSendAccess rewritten as rank-based mirror of backend
- new canPromoteToAdmin helper for UI gating
- UserEditModal.singleCompanyRoleOptions includes Admin option when actor
  is platform-admin or company-admin of the active company
- CompanyPage team row: Admin badge gets distinct 'warning' variant
- CompanyPage member counter: '1 admin · 2 managers · 3 editores · N colaboradores'"
```

---

## Task 5 — Backend tests for permission helpers

**Files:**
- Create: `backend/test/membership-permissions.test.js`

### Step 1: Create the test file

```javascript
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  canManageMembershipRanked,
  canAssignRoleRanked,
  wouldLeaveCompanyWithoutAdmin,
  canSendAccessRanked,
} from '../src/lib/membershipPermissions.js'

// -------------------- canManageMembershipRanked --------------------

test('canManageMembershipRanked: platform-admin can manage anyone', () => {
  assert.equal(canManageMembershipRanked({
    actorPlatformRole: 'admin',
    actorMemberships: [],
    companyId: 'c1',
    targetRole: 'admin',
  }), true)
})

test('canManageMembershipRanked: company-admin can manage manager + below', () => {
  const actorMemberships = [{ companyId: 'c1', role: 'admin' }]
  assert.equal(canManageMembershipRanked({ actorPlatformRole: 'user', actorMemberships, companyId: 'c1', targetRole: 'manager' }), true)
  assert.equal(canManageMembershipRanked({ actorPlatformRole: 'user', actorMemberships, companyId: 'c1', targetRole: 'editor' }), true)
  assert.equal(canManageMembershipRanked({ actorPlatformRole: 'user', actorMemberships, companyId: 'c1', targetRole: 'designer' }), true)
})

test('canManageMembershipRanked: company-admin cannot manage peer admin', () => {
  assert.equal(canManageMembershipRanked({
    actorPlatformRole: 'user',
    actorMemberships: [{ companyId: 'c1', role: 'admin' }],
    companyId: 'c1',
    targetRole: 'admin',
  }), false)
})

test('canManageMembershipRanked: manager cannot manage admin', () => {
  assert.equal(canManageMembershipRanked({
    actorPlatformRole: 'user',
    actorMemberships: [{ companyId: 'c1', role: 'manager' }],
    companyId: 'c1',
    targetRole: 'admin',
  }), false)
})

test('canManageMembershipRanked: manager cannot manage peer manager', () => {
  assert.equal(canManageMembershipRanked({
    actorPlatformRole: 'user',
    actorMemberships: [{ companyId: 'c1', role: 'manager' }],
    companyId: 'c1',
    targetRole: 'manager',
  }), false)
})

test('canManageMembershipRanked: manager can manage editor + workers', () => {
  const actorMemberships = [{ companyId: 'c1', role: 'manager' }]
  assert.equal(canManageMembershipRanked({ actorPlatformRole: 'user', actorMemberships, companyId: 'c1', targetRole: 'editor' }), true)
  assert.equal(canManageMembershipRanked({ actorPlatformRole: 'user', actorMemberships, companyId: 'c1', targetRole: 'content_writer' }), true)
  assert.equal(canManageMembershipRanked({ actorPlatformRole: 'user', actorMemberships, companyId: 'c1', targetRole: 'designer' }), true)
  assert.equal(canManageMembershipRanked({ actorPlatformRole: 'user', actorMemberships, companyId: 'c1', targetRole: 'developer' }), true)
})

test('canManageMembershipRanked: editor cannot manage anyone', () => {
  const actorMemberships = [{ companyId: 'c1', role: 'editor' }]
  assert.equal(canManageMembershipRanked({ actorPlatformRole: 'user', actorMemberships, companyId: 'c1', targetRole: 'manager' }), false)
  assert.equal(canManageMembershipRanked({ actorPlatformRole: 'user', actorMemberships, companyId: 'c1', targetRole: 'designer' }), false)
})

test('canManageMembershipRanked: actor without membership in company returns false', () => {
  assert.equal(canManageMembershipRanked({
    actorPlatformRole: 'user',
    actorMemberships: [{ companyId: 'c2', role: 'admin' }],
    companyId: 'c1',
    targetRole: 'editor',
  }), false)
})

// -------------------- canAssignRoleRanked --------------------

test('canAssignRoleRanked: platform-admin can assign anything', () => {
  assert.equal(canAssignRoleRanked({ actorPlatformRole: 'admin', actorMemberships: [], companyId: 'c1', role: 'admin' }), true)
})

test('canAssignRoleRanked: company-admin can assign all roles below admin', () => {
  const actorMemberships = [{ companyId: 'c1', role: 'admin' }]
  assert.equal(canAssignRoleRanked({ actorPlatformRole: 'user', actorMemberships, companyId: 'c1', role: 'manager' }), true)
  assert.equal(canAssignRoleRanked({ actorPlatformRole: 'user', actorMemberships, companyId: 'c1', role: 'editor' }), true)
})

test('canAssignRoleRanked: company-admin cannot assign peer admin', () => {
  assert.equal(canAssignRoleRanked({
    actorPlatformRole: 'user',
    actorMemberships: [{ companyId: 'c1', role: 'admin' }],
    companyId: 'c1',
    role: 'admin',
  }), false)
})

test('canAssignRoleRanked: manager cannot assign admin or peer manager', () => {
  const actorMemberships = [{ companyId: 'c1', role: 'manager' }]
  assert.equal(canAssignRoleRanked({ actorPlatformRole: 'user', actorMemberships, companyId: 'c1', role: 'admin' }), false)
  assert.equal(canAssignRoleRanked({ actorPlatformRole: 'user', actorMemberships, companyId: 'c1', role: 'manager' }), false)
})

// -------------------- wouldLeaveCompanyWithoutAdmin --------------------

test('wouldLeaveCompanyWithoutAdmin: demoting sole admin → true', () => {
  assert.equal(wouldLeaveCompanyWithoutAdmin({
    currentRole: 'admin',
    nextRole: 'manager',
    companyAdminUserIds: ['u1'],
    targetUserId: 'u1',
  }), true)
})

test('wouldLeaveCompanyWithoutAdmin: demoting one of multiple admins → false', () => {
  assert.equal(wouldLeaveCompanyWithoutAdmin({
    currentRole: 'admin',
    nextRole: 'manager',
    companyAdminUserIds: ['u1', 'u2'],
    targetUserId: 'u1',
  }), false)
})

test('wouldLeaveCompanyWithoutAdmin: promoting to admin → false', () => {
  assert.equal(wouldLeaveCompanyWithoutAdmin({
    currentRole: 'manager',
    nextRole: 'admin',
    companyAdminUserIds: ['u1'],
    targetUserId: 'u2',
  }), false)
})

test('wouldLeaveCompanyWithoutAdmin: non-admin role change is always false', () => {
  assert.equal(wouldLeaveCompanyWithoutAdmin({
    currentRole: 'editor',
    nextRole: 'designer',
    companyAdminUserIds: ['u1'],
    targetUserId: 'u2',
  }), false)
})

// -------------------- canSendAccessRanked --------------------

test('canSendAccessRanked: platform-admin can send to anyone', () => {
  assert.equal(canSendAccessRanked({
    actor: { id: 'a', platformRole: 'admin' },
    targetUserId: 't',
    actorMemberships: [],
    targetMemberships: [],
  }), true)
})

test('canSendAccessRanked: self forbidden', () => {
  assert.equal(canSendAccessRanked({
    actor: { id: 'a', platformRole: 'admin' },
    targetUserId: 'a',
  }), false)
})

test('canSendAccessRanked: QA never', () => {
  assert.equal(canSendAccessRanked({
    actor: { id: 'a', platformRole: 'qa' },
    targetUserId: 't',
    actorMemberships: [{ companyId: 'c1', role: 'admin' }],
    targetMemberships: [{ companyId: 'c1', role: 'editor' }],
  }), false)
})

test('canSendAccessRanked: company-admin can send to manager + below in same company', () => {
  const args = {
    actor: { id: 'a', platformRole: 'user' },
    targetUserId: 't',
    actorMemberships: [{ companyId: 'c1', role: 'admin' }],
  }
  assert.equal(canSendAccessRanked({ ...args, targetMemberships: [{ companyId: 'c1', role: 'manager' }] }), true)
  assert.equal(canSendAccessRanked({ ...args, targetMemberships: [{ companyId: 'c1', role: 'editor' }] }), true)
})

test('canSendAccessRanked: company-admin cannot send to peer admin', () => {
  assert.equal(canSendAccessRanked({
    actor: { id: 'a', platformRole: 'user' },
    targetUserId: 't',
    actorMemberships: [{ companyId: 'c1', role: 'admin' }],
    targetMemberships: [{ companyId: 'c1', role: 'admin' }],
  }), false)
})

test('canSendAccessRanked: manager cannot send to peer manager', () => {
  assert.equal(canSendAccessRanked({
    actor: { id: 'a', platformRole: 'user' },
    targetUserId: 't',
    actorMemberships: [{ companyId: 'c1', role: 'manager' }],
    targetMemberships: [{ companyId: 'c1', role: 'manager' }],
  }), false)
})

test('canSendAccessRanked: manager can send to editor + below', () => {
  const args = {
    actor: { id: 'a', platformRole: 'user' },
    targetUserId: 't',
    actorMemberships: [{ companyId: 'c1', role: 'manager' }],
  }
  assert.equal(canSendAccessRanked({ ...args, targetMemberships: [{ companyId: 'c1', role: 'editor' }] }), true)
  assert.equal(canSendAccessRanked({ ...args, targetMemberships: [{ companyId: 'c1', role: 'designer' }] }), true)
})

test('canSendAccessRanked: cross-company → false', () => {
  assert.equal(canSendAccessRanked({
    actor: { id: 'a', platformRole: 'user' },
    targetUserId: 't',
    actorMemberships: [{ companyId: 'c1', role: 'admin' }],
    targetMemberships: [{ companyId: 'c2', role: 'editor' }],
  }), false)
})
```

### Step 2: Run + verify

```bash
cd /Users/adrian/GitHub/webbrief/backend && NODE_ENV=test node --test 2>&1 | tail -8
```

Expected: ~19 new tests pass, full suite at ~118 total (99 before + 19 new).

### Step 3: Commit

```bash
cd /Users/adrian/GitHub/webbrief
git add backend/test/membership-permissions.test.js
git commit -m "test(membership-permissions): 19 tests covering the rank matrix

8 tests for canManageMembershipRanked (admin/manager/editor × admin/manager/editor/workers; peer rules; cross-company guard)
4 tests for canAssignRoleRanked (platform-admin/company-admin/manager × admin/manager/peer-rank)
4 tests for wouldLeaveCompanyWithoutAdmin (sole admin / multiple / promotion / non-admin)
8 tests for canSendAccessRanked (admin path / self / QA / cross-company / rank gating)"
```

---

## Task 6 — Opus Max QA pass + auto-debug

Dispatch ONE Opus subagent with cross-cutting scope over the whole branch. It does:
- Spec compliance check (Section D of the design doc)
- Code quality review (rank logic, missing edge cases, naming clarity)
- Security review (any way to escalate privileges? any way to bypass last-admin protection?)
- Auto-fix Critical + Important issues; document Minor

Constructed at dispatch time using current SHAs.

---

## Task 7 — Manual smoke test (HUMAN ONLY)

The user runs:

1. Frontend dev server + backend dev
2. Log in as platform-admin
3. Create a new company → verify response shape includes `manager` field, role is `'admin'` in DB:
   ```sql
   SELECT * FROM company_memberships WHERE company_id = '<new-id>';
   ```
4. Open `/companies/<id>` → verify the new member has "Admin" badge (amber/warning variant)
5. Verify counter renders ("1 admin")
6. Open the edit-member modal → role select shows "Admin" option (since actor is platform-admin)
7. Try to demote the sole admin → expect 400 "La empresa debe conservar al menos un admin"
8. Promote another member to admin → succeeds → now 2 admins → can demote one of them

---

## Task 8 — Push + open PR

```bash
cd /Users/adrian/GitHub/webbrief
git push -u origin fix/company-admin-role
```

URL: `https://github.com/xacty/webbrief/pull/new/fix/company-admin-role`

Title: `feat(roles): company-admin role (Google Workspace-style) + rank-based permissions`

Body sketch:

```markdown
## Summary

Introduces `company_memberships.role = 'admin'` (the company-admin role) — distinct from `profiles.platform_role = 'admin'` (platform-admin / WeBrief team). Hierarchy: admin > manager > editor > workers.

## Changes

**Backend**
- Migration `20260525_company_admin_role.sql` (CHECK constraint + idempotent backfill of earliest manager per company → admin)
- New `backend/src/lib/membershipPermissions.js` with rank-based pure helpers (canManageMembershipRanked, canAssignRoleRanked, wouldLeaveCompanyWithoutAdmin, canSendAccessRanked)
- `routes/users.js` PATCH/DELETE memberships now use rank checks + new last-admin protection (replaces last-manager protection)
- `routes/companies.js` POST creates `role: 'admin'` (was: `'manager'`)
- `lib/sendAccess.js` `canSendAccess` delegates to rank helper — company-admin gains send-access on all subordinates

**Frontend**
- `shared/userRoles.js` adds `admin` to COMPANY_ROLE_ORDER + label + getCompanyRoleRank()
- `roleCapabilities.canSendAccess` mirror rewritten + new canPromoteToAdmin
- `UserEditModal.singleCompanyRoleOptions` includes Admin when actor authorized
- `CompanyPage` admin badge (amber) + member counter

**Tests**
- 19 new unit tests in `membership-permissions.test.js`

## Migration deployment

- ✓ Applied to Supabase Dev via MCP (Task 0)
- [ ] Apply to Prod BEFORE deploying code:
  ```
  Apply migration 20260525_company_admin_role.sql to Prod via MCP
  Spot-check: SELECT role, count(*) FROM company_memberships GROUP BY role;
  ```

## Out of scope (PR 4)

- Sessions list + eye-icon for IP reveal
- Set-password (generate / custom) feature
- These will use the company-admin role gating that PR 3 establishes
```

---

## Done When

- [ ] Migration applied to Dev ✓ (done in Task 0)
- [ ] All implementation tasks (2-5) committed
- [ ] Backend suite passes (99 + 19 = ~118 tests)
- [ ] Frontend build clean
- [ ] Opus QA pass complete + critical issues fixed
- [ ] Branch pushed
- [ ] Smoke test pending (human)
- [ ] Prod migration application pending (human)

## Out of Scope

- Sessions endpoints + reveal-ip route — moved to PR 4 (proximity to sessions infra in that migration)
- Set-password feature — PR 4
- Update of CONTEXT.min.md role bullets — follow-up doc task
- Profile updates that depend on the new role (e.g. dashboard cards showing "Tu rol: Admin de empresa") — out of scope
