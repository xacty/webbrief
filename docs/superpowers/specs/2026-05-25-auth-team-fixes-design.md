# Auth + Team Management Fixes — Design Spec

- Date: 2026-05-25
- Status: Draft v2 (pending user review)
- Author: Adrián + Claude
- Scope: 1 bug fix + 1 feature + 1 refactor + 1 new role, shipped as 4 separate PRs

---

## Problem Statement

Three issues reported after the v1.1 auth-hardening milestone went live, plus one role-model gap surfaced during design discussion:

1. **Bug — Invite link lands on `/login`**: when an admin creates a new company, the manager receives an invitation email whose CTA link redirects to `/login` instead of `/auth/set-password`. The manager cannot proceed until the admin manually goes to the Users page and clicks "Enviar acceso" — which sends a different email that lands correctly.

2. **Missing feature — Admins/managers cannot set passwords directly**: the only password recovery path is "send a recovery email". There is no WordPress-like flow where an admin can generate a temporary password (or type a custom one) for a user and hand it over manually.

3. **Partial coverage — Company team modal lacks parity with Users modal**: the password/access actions added in the Users page do not exist in the Company team sidecard. A manager editing a member from CompanyPage sees only Name + Role, no envelope action, no password actions.

4. **Role-model gap — No "company-admin" role (Google Workspace-style)**: WeBrief currently has `platform_role='admin'` (WeBrief team, sees everything) and `company_memberships.role={manager|editor|viewer}`. There is no role that represents "the admin OF a company" — the person who handles billing (future), promotes/demotes managers, reveals sensitive data like IPs of session devices, and generally owns the tenant. Today the highest in-company role is `manager`, but two peer managers have no authority over each other, which creates awkward gaps (cannot reset each other's password, no clear "owner" for billing/permissions when it lands).

---

## Root Cause (Issue 1)

`ensureUserProfile` in [`backend/src/lib/users.js:104-136`](../../backend/src/lib/users.js) handles Case A (fresh invite — auth user does not exist) by calling:

```javascript
supabaseAdmin.auth.admin.inviteUserByEmail(email, { redirectTo, data })
```

`inviteUserByEmail` sends Supabase's **native** template email (configured in the Supabase Dashboard), not the custom `sendInviteEmail` via Resend. The native template points to the project's Site URL root (`https://webrief.app/`), which renders `App.jsx` → redirects to `/login` because the user is not yet authenticated.

By contrast:
- Case B (reinvite, `handleReinvite` at lines 168-200) uses `generateLink({type:'invite'}) → sendInviteEmail`
- `/api/users/:id/send-access` (Plan B, [`backend/src/routes/users.js:923-1047`](../../backend/src/routes/users.js)) uses `generateLink({type:'invite' | 'recovery'}) → sendInviteEmail | sendResetPasswordEmail`

Both correct paths bake the explicit `redirect_to=https://webrief.app/auth/set-password` into the `action_link` query, so the frontend lands on SetPassword and captures `type=invite|recovery` from the hash.

**Fix:** unify Case A onto the same `generateLink + sendInviteEmail` path. Single source of truth for invite emails; the Supabase Dashboard "Invite user" template becomes dead config.

---

## Design

### Section A — Bug Fix: Unify Case A to Resend

Refactor `ensureUserProfile` Case A (`decision.action === 'invited'`):

**Before:**
```javascript
const { data, error } = await wrapSupabaseAuthCall({
  operation: () => supabaseAdmin.auth.admin.inviteUserByEmail(normalizedEmail, {
    redirectTo,
    data: { full_name: fullName || '' },
  }),
  operationName: 'inviteUserByEmail',
  req,
  args: { email: normalizedEmail },
})
```

**After:**
```javascript
const { data: linkData, error } = await wrapSupabaseAuthCall({
  operation: () => supabaseAdmin.auth.admin.generateLink({
    type: 'invite',
    email: normalizedEmail,
    options: {
      redirectTo,
      data: { full_name: fullName || '' },
    },
  }),
  operationName: 'generateLink:invite:new',
  req,
  args: { email: normalizedEmail, type: 'invite' },
})

if (error) { /* race fallback to handleReinvite */ }
const actionLink = linkData?.properties?.action_link
const newAuthUser = linkData?.user
if (!actionLink || !newAuthUser?.id) throw new Error('No se pudo crear el usuario o el link')

const emailResult = await sendInviteEmail({
  to: normalizedEmail,
  fullName,
  actionLink,
})

await upsertProfileRow(newAuthUser.id, normalizedEmail, fullName, newAuthUser, normalizedPlatformRole, timestamp)

return {
  userId: newAuthUser.id,
  email: normalizedEmail,
  fullName: fullName || newAuthUser.user_metadata?.full_name || '',
  platformRole: normalizedPlatformRole,
  action: 'invited',
  inviteSent: Boolean(emailResult?.sent),
}
```

**Notes:**
- `generateLink({type:'invite'})` creates the auth user if it does not exist; this is documented Supabase Admin SDK behavior.
- `linkData.user` is populated on creation; safer to read it from the response than to re-query.
- `inviteSent` now reflects actual Resend delivery (matching the Case B contract), not just "the attempt was made". This is a behavior tightening — callers already handle `inviteSent: false` (Plan C does).
- The race fallback at line 117 (`fallback = await findAuthUserByEmail(...)`) is preserved: if `generateLink` errors because another invite just landed, re-resolve and delegate to `handleReinvite`.
- The Supabase Dashboard "Invite user" template stays as-is (dead config); a follow-up doc note will mark it as no longer used.

#### Tests

- `backend/test/ensureUserProfile.test.js` (new or extend existing): assert Case A now calls `generateLink` then `sendInviteEmail` (mocks); assert `inviteSent` reflects email result; assert race fallback still works.
- Full backend suite must remain green.

---

### Section B — Set-Password Feature

#### B.1 — Migration

`supabase/migrations/20260525_user_sessions_rpcs.sql`:

```sql
-- List active sessions of a user (service-role only).
CREATE OR REPLACE FUNCTION public.list_user_sessions(p_user_id uuid)
RETURNS TABLE (
  id uuid,
  created_at timestamptz,
  updated_at timestamptz,
  refreshed_at timestamptz,
  user_agent text,
  ip inet,
  not_after timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = auth, public
AS $$
  SELECT id, created_at, updated_at, refreshed_at, user_agent, ip, not_after
  FROM auth.sessions
  WHERE user_id = p_user_id
    AND (not_after IS NULL OR not_after > now())
  ORDER BY refreshed_at DESC NULLS LAST, created_at DESC
$$;

REVOKE EXECUTE ON FUNCTION public.list_user_sessions(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_user_sessions(uuid) TO service_role;

-- Revoke specific sessions of a user (service-role only).
CREATE OR REPLACE FUNCTION public.revoke_user_sessions(p_user_id uuid, p_session_ids uuid[])
RETURNS int
LANGUAGE sql
SECURITY DEFINER
SET search_path = auth, public
AS $$
  WITH deleted AS (
    DELETE FROM auth.sessions
    WHERE user_id = p_user_id AND id = ANY(p_session_ids)
    RETURNING 1
  )
  SELECT count(*)::int FROM deleted
$$;

REVOKE EXECUTE ON FUNCTION public.revoke_user_sessions(uuid, uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_user_sessions(uuid, uuid[]) TO service_role;
```

Apply to **Dev + Prod** via MCP `apply_migration` BEFORE deploying backend code.

#### B.2 — Permission Helper

`backend/src/lib/passwordPermissions.js` (new):

This module assumes the `admin` company-membership role from Section D exists. The PR sequence is **PR 4 → PR 3** for the permission code to compile against the expanded role set. Until PR 4 lands, code only references `manager|editor|viewer` and the matrix below collapses to its pre-company-admin rows.

```javascript
// Membership role hierarchy: admin > manager > editor > viewer
function highestRoleInShared(actorMemberships, targetCompanyId) {
  return (actorMemberships || [])
    .filter((m) => m.companyId === targetCompanyId)
    .map((m) => m.role)
    .sort((a, b) => roleRank(b) - roleRank(a))[0] || null
}

function roleRank(role) {
  return { admin: 4, manager: 3, editor: 2, viewer: 1 }[role] || 0
}

export function canSetPassword({ actor, target, actorMemberships, targetMemberships }) {
  if (!actor || !target) return false
  if (actor.id === target.id) return false                       // never self via this flow
  if (actor.platformRole === 'qa') return false                  // QA defensive guard
  if (actor.platformRole === 'admin') return true                // platform-admin: omnipotent

  // Target is platform-admin and actor is not? Block.
  if (target.platformRole === 'admin') return false

  // Per-company evaluation. Actor must out-rank target in at least one shared company.
  const sharedCompanyIds = new Set(
    (actorMemberships || []).map((m) => m.companyId)
  )
  for (const tm of (targetMemberships || [])) {
    if (!sharedCompanyIds.has(tm.companyId)) continue
    const actorRole = highestRoleInShared(actorMemberships, tm.companyId)
    if (!actorRole) continue
    // Strict out-rank: company-admin can edit manager/editor/viewer in same company; manager can edit editor/viewer only.
    if (roleRank(actorRole) > roleRank(tm.role)) return true
  }
  return false
}

export function canViewSessions(args) {
  // Same gating as canSetPassword.
  return canSetPassword(args)
}

export function canRevealIp({ actor, target, actorMemberships, targetMemberships }) {
  // Only platform-admin or company-admin (of shared company where target is a member).
  if (!actor || !target) return false
  if (actor.platformRole === 'admin') return true
  if (actor.platformRole === 'qa') return false
  const adminCompanies = new Set(
    (actorMemberships || []).filter((m) => m.role === 'admin').map((m) => m.companyId)
  )
  return (targetMemberships || []).some((m) => adminCompanies.has(m.companyId))
}
```

Mirror in `frontend/src/lib/permissions.js`.

**Resulting matrix:**

| Actor role | Target role (in shared company) | canSetPassword | canRevealIp |
|------------|----------------------------------|----------------|-------------|
| platform-admin | anyone (except self) | ✓ | ✓ |
| company-admin X | company-admin Y (peer, X≠Y) | ✗ (peer) | ✓ |
| company-admin X | manager | ✓ | ✓ |
| company-admin X | editor / viewer | ✓ | ✓ |
| manager | company-admin | ✗ | ✗ |
| manager | manager (peer) | ✗ (peer) | ✗ |
| manager | editor / viewer | ✓ | ✗ |
| editor / viewer | anyone | ✗ | ✗ |
| QA | anyone | ✗ | ✗ |

"Peer" = same role in same company = no authority over each other. Only platform-admin overrides this.

#### B.3 — Password Generator

`backend/src/lib/passwordGenerator.js` (new):

```javascript
const CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%^&*'
// Excludes 0Oo1lI for visual clarity.

export function generateSecurePassword(length = 16) {
  const { randomInt } = require('node:crypto')
  let result = ''
  for (let i = 0; i < length; i += 1) {
    result += CHARSET[randomInt(0, CHARSET.length)]
  }
  return result
}
```

#### B.4 — User-Agent Parser

`backend/src/lib/userAgent.js` (new): regex-based parser. Returns `{ browser, version, os }`. No external dependency.

```javascript
// Sketch (full impl in code review):
export function parseUserAgent(ua) {
  if (!ua) return { browser: 'Desconocido', version: '', os: 'Desconocido' }
  const browser = /Chrome\/(\d+)/.test(ua) ? `Chrome ${RegExp.$1}` :
                  /Safari\/.+Version\/(\d+)/.test(ua) ? `Safari ${RegExp.$1}` :
                  /Firefox\/(\d+)/.test(ua) ? `Firefox ${RegExp.$1}` :
                  'Otro'
  const os = /Mac OS X/.test(ua) ? 'macOS' :
             /Windows NT/.test(ua) ? 'Windows' :
             /Linux/.test(ua) ? 'Linux' :
             /iPhone|iPad/.test(ua) ? 'iOS' :
             /Android/.test(ua) ? 'Android' :
             'Otro'
  return { browser, os }
}

export function formatDeviceLabel(ua) {
  const { browser, os } = parseUserAgent(ua)
  return `${browser} · ${os}`
}
```

Mirror in `frontend/src/lib/userAgent.js`. Tests: 5-6 cases (Chrome/Safari/Firefox/empty/garbage/Edge).

#### B.5 — Backend Endpoints

**`GET /api/users/:id/sessions`** — `backend/src/routes/users.js`

- Auth: `requireAuth` + `rateLimiters.sensitiveAction`
- Load target profile + memberships
- `canViewSessions({ actor, target, actorMemberships, targetMemberships })` → 403 if false
- `supabaseAdmin.rpc('list_user_sessions', { p_user_id: targetId })`
- Map each row to `{ id, deviceLabel: formatDeviceLabel(user_agent), ip: maskedIp, ipFull: null | string, lastRefreshAt: refreshed_at || updated_at, createdAt: created_at }`
  - `maskedIp`: always masked (`192.168.*.*` for v4, `2001:db8::***` for v6)
  - `ipFull`: included ONLY when `canRevealIp(actor, target, ...)` returns true; null otherwise
  - The frontend "eye" toggle uses `ipFull` when present, otherwise the eye icon is hidden
- Return `{ sessions: [...], total: sessions.length, canRevealIp: boolean }`

**`POST /api/users/:id/sessions/revoke`** — same file

- Auth + `rateLimiters.sensitiveAction`
- Body: `{ sessionIds: string[] }` (validate non-empty, all UUIDs)
- Permission check (same as above)
- `supabaseAdmin.rpc('revoke_user_sessions', { p_user_id: targetId, p_session_ids: sessionIds })`
- `logSecurityEvent` action `user_sessions_revoked` metadata `{ count, sessionIds, via: 'modal' }`
- Return `{ revokedCount }`

**`POST /api/users/:id/set-password`** — same file

- Auth + `rateLimiters.passwordReset`
- Body: `{ mode: 'generate' | 'custom', password?: string, revokeSessionIds?: string[] }`
- Validate:
  - `mode` is one of the two literals
  - `mode='custom'`: `password` is a string of length ≥ 8 (Supabase default)
  - `revokeSessionIds`: optional array of UUIDs
- Load target profile + memberships
- `canSetPassword(...)` → 403 if false
- If `mode='generate'`: `finalPassword = generateSecurePassword(16)`. If `mode='custom'`: `finalPassword = password`.
- `wrapSupabaseAuthCall(() => supabaseAdmin.auth.admin.updateUserById(targetId, { password: finalPassword }))`
- Invalidate `password_reset_requests`: `UPDATE password_reset_requests SET used_at=now() WHERE user_id=$1 AND used_at IS NULL`
- If `revokeSessionIds?.length > 0`: `supabaseAdmin.rpc('revoke_user_sessions', { p_user_id: targetId, p_session_ids: revokeSessionIds })` → capture `revokedCount`. The RPC's `WHERE user_id=$1 AND id=ANY(...)` ensures IDs from other users are silently filtered (no leak, no error).
- `logSecurityEvent` action `password_changed` metadata `{ initiator: 'other', method: mode, sessionsRevokedCount: revokedCount || 0, actorRole: actor.platformRole === 'admin' ? 'platform_admin' : highestSharedRole(actor, target) }`. This neutral action name lets the future self-service password-change flow ride the same bucket with `initiator: 'self'`.
- Response:
  - `mode='generate'`: `{ ok: true, password: finalPassword, revokedCount }`
  - `mode='custom'`: `{ ok: true, revokedCount }`

#### B.6 — Frontend Components (mounted later in Section C)

**`frontend/src/components/users/PasswordSection.jsx`** (new):

Props: `userId`, `canSet`, `onChanged`.

Renders the "Contraseña" section described in design discussion:
- `<Button>` "Generar contraseña aleatoria" → confirm step → POST `mode='generate'` with current `revokeSessionIds` → swap to "Password generado" view (monospace + copy + "Listo, ya la copié")
- `<Disclosure>` "Establecer contraseña manual" → password + confirm + submit → POST `mode='custom'`
- Reads `revokeSessionIds` from a shared parent context (or via prop callback)
- Toast on success/failure

**`frontend/src/components/users/SessionsList.jsx`** (new):

Props: `userId`, `canManage`, `selectedIds`, `onSelectionChange`, `onRevokedStandalone`.

- On mount: GET `/api/users/:id/sessions`. Shows skeleton while loading.
- Renders one row per session: checkbox + device label + IP + "hace X tiempo" (Intl.RelativeTimeFormat)
- Smart toggle button: shows "Seleccionar todas" when `selectedIds.size < sessions.length`, otherwise "Deseleccionar todas". One click flips to the appropriate state.
- "Cerrar sesiones seleccionadas" button: disabled when `selectedIds.size === 0`. POST `/api/users/:id/sessions/revoke` → refresh list → call `onRevokedStandalone()` toast.
- Empty state: "Sin sesiones activas".

#### B.7 — Tests

- `backend/test/passwordPermissions.test.js`: ≥10 tests covering the matrix (admin-vs-self, admin-vs-admin, admin-vs-user, manager-vs-self, manager-vs-member-of-company, manager-vs-non-member, manager-vs-peer-manager, manager-vs-admin, QA-blocked, editor-blocked)
- `backend/test/passwordGenerator.test.js`: 3 tests (length, charset includes no `0Oo1lI`, two consecutive calls differ)
- `backend/test/userAgent.test.js`: 5 tests (Chrome, Safari, Firefox, empty, garbage)
- `backend/test/sessions-routes.test.js`: list endpoint gating + masking + revoke endpoint + audit log assertion
- `backend/test/set-password-route.test.js`: gating + mode='generate' response includes password + mode='custom' validates length + revokeSessionIds wired through + invalidates password_reset_requests + audit log

---

### Section C — Shared `UserEditModal`

#### C.1 — Extraction

New file `frontend/src/components/users/UserEditModal.jsx`. Extracts the current Users-page modal verbatim (avatar editor, name, email, platformRole, per-company memberships, save handler), then parametrizes via `scope` prop.

Props:

```javascript
{
  open: boolean,
  user: { id, email, fullName, platformRole, avatarUrl, memberships: [{ companyId, companyName, role }] },
  currentUser: { id, platformRole, memberships: [...] },
  scope: 'global' | 'company',
  companyId?: string,        // required when scope='company'
  companyName?: string,      // for label "Rol en {companyName}"
  companies?: Array,         // full list for scope='global' (already fetched by UsersPage)
  onClose: () => void,
  onUserUpdated: (updatedFields) => void,
}
```

#### C.2 — Conditional Sections

| Section | scope='global' | scope='company' | Extra gating |
|---------|----------------|-----------------|---------------|
| Avatar + Nombre | ✓ | ✓ | `canEditIdentity(actor, target)` |
| Email | ✓ (admin only) | hidden, read-only hint below | `actor.platformRole === 'admin'` |
| Rol plataforma | ✓ (admin only) | hidden | `actor.platformRole === 'admin'` |
| Roles por empresa (full list) | ✓ | hidden | per-row `canEditMembership` |
| Rol en esta empresa (1 select) | hidden | ✓ | `canEditMembership(target, companyId)` |
| Password (Section B.6) | ✓ | ✓ | `canSetPassword(...)` |
| Sesiones activas (Section B.6) | ✓ | ✓ | `canViewSessions(...)` |
| Botón inline "Enviar acceso" | ✓ | ✓ | `canSendAccess(...)` |

#### C.3 — File Changes

| File | Action |
|------|--------|
| `frontend/src/components/users/UserEditModal.jsx` | **New** — extracted shared modal |
| `frontend/src/components/users/PasswordSection.jsx` | **New** (Section B.6) |
| `frontend/src/components/users/SessionsList.jsx` | **New** (Section B.6) |
| `frontend/src/lib/permissions.js` | **New or extend** — `canSetPassword`, `canSendAccess` (already exists), `canViewSessions` |
| `frontend/src/lib/userAgent.js` | **New** — mirror of `backend/src/lib/userAgent.js` |
| `frontend/src/pages/UsersPage.jsx` | Replace inline modal with `<UserEditModal scope="global" />` |
| `frontend/src/pages/CompanyPage.jsx` | Replace inline "Editar miembro" modal with `<UserEditModal scope="company" companyId={...} companyName={...} />`; add envelope (send-access) icon button next to pencil in team row |

#### C.4 — Envelope on Team Row

Hoy en `frontend/src/pages/CompanyPage.jsx:806-816` la team row solo tiene un pencil. Agregar **antes** del pencil un envelope icon button:

```jsx
{canSendAccess(currentUser, member, ...) && (
  <Button
    type="button"
    variant="ghost"
    size="sm"
    icon={<Mail size={16} />}
    onClick={() => handleSendAccess(member)}
    title="Enviar acceso (invitación o restablecimiento)"
  />
)}
```

Mismo handler que UsersPage (extraer si conviene a un hook compartido).

#### C.5 — Risks / Watch

- **Visual regression**: avatar editor and modal layout from UsersPage must be preserved byte-for-byte in the extraction (snapshot test or manual visual diff).
- **`memberships` shape**: scope='company' must pass the target user's full memberships array, not just the current company's. CompanyPage must fetch enriched member rows (currently has only `{ userId, role, email, fullName }`). Add a backend extension to `GET /api/companies/:id` or a per-row lazy `GET /api/users/:id` fetch when modal opens.
- **Bundle hygiene**: `UserEditModal` must not pull editor/TipTap code. Verify with `vite-bundle-visualizer` or quick `npm run build` size check before/after.
- **`platformRole=qa` UX**: a QA user with manager membership currently sees no special UI; the defensive backend guard returns 403. UI should also hide the password section for `actor.platformRole === 'qa'` to avoid a misleading affordance.

#### C.6 — Tests

- `frontend/test/UserEditModal.test.jsx`: 4 scenarios (admin-global, admin-company, manager-company, manager-without-permission) asserting section visibility matrix.
- Manual smoke: open from UsersPage, edit name, save → verify list refresh. Open from CompanyPage, change role + send-access → verify both work.

---

### Section D — Company-Admin Role (Google Workspace-style)

#### D.1 — Concept

Introduce `company_memberships.role = 'admin'` as a new value. This is the company-level administrator: the person who owns the tenant inside WeBrief — separate from `profiles.platform_role = 'admin'` (the WeBrief team).

**Hierarchy inside a company:** `admin > manager > editor > viewer`

**Why now:** the gaps in Section B's permission matrix (peer-manager cannot reset peer-manager, no IP-reveal authority, no clear owner for future billing) all dissolve when this role exists. Permission matrix in B.2 is written assuming this role; landing it as PR 4 of this bundle keeps the matrix internally consistent.

#### D.2 — Migration

`supabase/migrations/20260525_company_admin_role.sql`:

```sql
-- 1. Allow 'admin' as a valid role value.
-- The column is text without CHECK constraint today (verified via MCP describe_table).
-- No DDL needed — frontend/backend just need to accept the new value.
-- (If a CHECK constraint is added later, it must include 'admin'.)

-- 2. Backfill: for each company that has NO admin yet, promote the earliest manager
-- (by created_at ASC, id ASC as tiebreaker) to admin. Idempotent: re-running this
-- statement does nothing once every eligible company has an admin.
WITH companies_without_admin AS (
  SELECT id FROM companies c
  WHERE NOT EXISTS (
    SELECT 1 FROM company_memberships m
    WHERE m.company_id = c.id AND m.role = 'admin'
  )
),
first_managers AS (
  SELECT DISTINCT ON (company_id) id, company_id
  FROM company_memberships
  WHERE role = 'manager' AND company_id IN (SELECT id FROM companies_without_admin)
  ORDER BY company_id, created_at ASC, id ASC
)
UPDATE company_memberships
SET role = 'admin', updated_at = now()
WHERE id IN (SELECT id FROM first_managers);

-- 3. Companies with no managers at all (admin-only test companies, edge case)
-- get no automatic admin. Platform-admins can manually promote later.
```

**Validate column type** before applying: if `company_memberships.role` has a CHECK constraint that enumerates `(manager|editor|viewer)`, the migration must `ALTER TABLE ... DROP CONSTRAINT ...` and re-add it including `admin`. Confirm via `describe_table` MCP before deploy.

Apply to **Dev + Prod** via MCP `apply_migration` before deploying code.

#### D.3 — Backend changes

**`shared/userRoles.js`** — add `'admin'` to valid membership roles array (if defined there); update any validators.

**`backend/src/routes/companies.js`** — `POST /api/companies`:
- Change line where the manager email is assigned: `role: 'manager'` → `role: 'admin'`
- Update success log / response label
- For `testMode=true` companies (admin-created without invite), no change (no membership created at creation time)

**`backend/src/routes/users.js`** — `PATCH /api/users/:id/memberships/:companyId`:
- Accept `'admin'` in the role validator
- Enforce **last-admin protection**: if request would change role of last admin in company to non-admin, return 422 with `{ error: 'No se puede dejar la empresa sin administrador' }`
- Enforce **promote authority**: only platform-admin or current company-admin can promote anyone to `admin`. Managers cannot promote.
- Enforce **demote authority**: only platform-admin or another company-admin can demote a company-admin. (Self-demote allowed if last-admin protection passes.)

**`backend/src/lib/sendAccess.js`** — extend `canSendAccess` matrix mirror of `canSetPassword` so company-admins gain send-access power within their company.

**`backend/src/routes/users.js`** — `GET /api/users/:id/sessions`:
- Compute `canRevealIp` via the helper
- If true, return `ipFull` in each session row alongside `ip` (masked)

**New endpoint:** `POST /api/users/:id/sessions/:sessionId/reveal-ip`
- Auth + `rateLimiters.sensitiveAction`
- Permission: `canRevealIp(actor, target, ...)`
- Returns `{ ipFull }` for the specific session
- `logSecurityEvent` action `ip_revealed` metadata `{ sessionId, viewerRole: 'platform_admin' | 'company_admin' }`

Note on UX trade-off: alternative is to return all `ipFull` values in `GET /sessions` (one less round-trip) but then every list-fetch logs an `ip_revealed` event per session — too noisy. Per-session reveal endpoint = one audit event per actual reveal click. The list response includes `ipFull: null` and the frontend calls the reveal endpoint only when the eye is clicked.

#### D.4 — Frontend changes

**`frontend/src/lib/userRoles.js`** — `roleLabel`, `getMemberRoleOptions`:
- Add `admin` → "Admin" label
- `getMemberRoleOptions` returns `[admin, manager, editor, viewer]` if actor can promote to admin, else `[manager, editor, viewer]`

**`frontend/src/lib/permissions.js`** — mirror of backend `canRevealIp`, `canSetPassword`, `canSendAccess` (updated matrix).

**`frontend/src/pages/CompanyPage.jsx`**:
- Team row badge: render "Admin" badge (color: violet or amber, distinct from "Manager" gray) for `member.role === 'admin'`
- "Invitar usuario" form's role select: add Admin option (gated by `canPromoteToAdmin` helper)
- Counter at top: "Equipo: 1 admin · 2 managers · 3 editores"

**`frontend/src/components/users/SessionsList.jsx`** (already new in Section B.6):
- Each session row: render IP masked + small eye icon AFTER the IP if `sessionsResponse.canRevealIp === true`
- Click eye → POST `/sessions/:id/reveal-ip` → swap masked IP for full IP + toggle eye to "eye-off"
- Click again → re-mask (frontend-only, no API call)
- The actual reveal only happens once per session per modal lifecycle (cache the ipFull in component state after first reveal)

**`frontend/src/pages/UsersPage.jsx`** — per-company column:
- Show admin badge for companies where target is admin
- "Roles por empresa" section in `UserEditModal`: row label for admin role

#### D.5 — Tests

- **Migration test**: apply on a seed dataset with 3 companies (one with 2 managers, one with only 1 manager, one with no managers); assert backfill picks the right manager in each case; assert re-running is a no-op.
- **`backend/test/passwordPermissions.test.js`**: expand matrix to ≥18 cases covering admin × {admin-peer, manager, editor, viewer, platform-admin, self} and manager × {admin, manager-peer, editor, viewer, platform-admin, self}.
- **`backend/test/lastAdminProtection.test.js`**: 4 cases (demote last admin → 422; demote non-last admin → 200; promote to admin → 200 if authority; promote without authority → 403).
- **`backend/test/revealIp.test.js`**: 3 cases (platform-admin reveals → audit; company-admin reveals → audit; manager attempts → 403).
- **E2E manual**: create new company → verify first member is `admin` (not `manager`); promote a manager to admin → verify; try to demote sole admin → expect error.

#### D.6 — Files affected

| File | Action |
|------|--------|
| `supabase/migrations/20260525_company_admin_role.sql` | **New** — value backfill |
| `shared/userRoles.js` | Extend valid roles with `admin` |
| `backend/src/routes/companies.js` | `POST` creates `role='admin'` instead of `manager` |
| `backend/src/routes/users.js` | Memberships PATCH validates + last-admin protection; sessions GET includes `canRevealIp` flag; new reveal-ip endpoint |
| `backend/src/lib/sendAccess.js` | `canSendAccess` updated for company-admin |
| `backend/src/lib/passwordPermissions.js` | Already updated in Section B.2 (assumes admin role exists) |
| `frontend/src/lib/userRoles.js` | `roleLabel`, `getMemberRoleOptions` |
| `frontend/src/lib/permissions.js` | Mirror backend matrix |
| `frontend/src/pages/CompanyPage.jsx` | Admin badge + role select option + counter |
| `frontend/src/components/users/SessionsList.jsx` | Eye icon + reveal-ip call |
| `frontend/src/pages/UsersPage.jsx` | Admin badge in per-company column |

#### D.7 — Risks / Watch

- **Constraint drift**: if `company_memberships.role` is constrained (CHECK or enum) in Prod but not Dev (or vice versa, given the schema-sync session 18 history), the migration will fail. Run `describe_table` on both before applying.
- **Backfill side-effect**: existing companies suddenly have a member whose role changed from manager to admin. This is an upgrade (more powers), not a downgrade, but the user may not expect it. Add a one-time `application_errors` log line per promotion with `level='info'` for forensics if needed, or skip and rely on `company_memberships.updated_at`.
- **Send-access matrix interaction**: today `canSendAccess` allows manager-of-shared-company. After PR 4, that becomes "admin-or-manager-of-shared-company, except cannot send-access to a peer or higher". Need to update Plan B's `canSendAccess` tests.
- **Existing tests for "no last-manager downgrade"**: the rule from CONTEXT.min.md (`watch: no last-manager downgrade`) becomes outdated. Replace with "no last-admin downgrade".

---

## PR Sequencing

| PR | Scope | Approx LOC | Dependencies |
|----|-------|-----------|--------------|
| **PR 1** | Section A — bug fix (Resend unification) | ~80 LOC backend + ~40 LOC tests | None |
| **PR 2** | Section C without password/sessions — pure refactor (shared modal + envelope on team row) | ~250 LOC new + ~150 LOC deleted | Independent of PR 1; can merge in parallel |
| **PR 3** | Section D — company-admin role + migration + last-admin protection + reveal-ip endpoint | ~300 LOC backend + ~200 LOC frontend + 1 migration | Independent of PR 1 and PR 2; but **must merge before PR 4** because PR 4's permission helpers reference the admin role |
| **PR 4** | Section B — set-password + sessions feature (mounted in shared modal, with company-admin gating live) | ~400 LOC backend + ~300 LOC frontend + 1 migration | Hard-depends on PR 3 (permission matrix). Soft-depends on PR 2 for team-modal coverage. |

**Recommended order: PR 1 → PR 2 → PR 3 → PR 4.**

- PR 1 can ship immediately and unblocks new-user invites.
- PR 2 is a pure refactor; safe to land any time after PR 1.
- PR 3 introduces the role, which is a behavior change visible everywhere a member role is shown. Worth shipping alone so any regression is isolated.
- PR 4 is the password/sessions feature, built on top of the new role's gating.

Skipping or reordering PR 3 before PR 4 means PR 4's permission code has to be written in a "company-admin doesn't exist yet" mode and rewritten when PR 3 lands — wasted effort.

---

## Deploy Checklist

For **PR 1** and **PR 2**: standard deploy without migration step. Git pull + backend restart (PR 1) and frontend rebuild (PR 2).

For **PR 3** (company-admin role + reveal-ip endpoint):

1. Run MCP `describe_table` on `company_memberships` in Dev AND Prod; confirm whether `role` column has a CHECK constraint that needs updating
2. Apply migration `20260525_company_admin_role.sql` to Supabase Dev via MCP `apply_migration`
3. Spot-check: `SELECT company_id, role, count(*) FROM company_memberships GROUP BY 1,2 ORDER BY 1` — each previously-managed company should now have exactly 1 admin
4. Run backend tests locally against Dev
5. Apply same migration to Supabase Prod via MCP `apply_migration` + repeat spot-check
6. Push code to `main`
7. VPS: `git pull && cd backend && npm install && pm2 restart webrief-backend --update-env && cd ../frontend && npm install && npm run build`
8. Smoke test on `https://webrief.app`: open any existing company → verify previously-manager user now shows "Admin" badge; try to demote sole admin → expect error; eye icon on a session → IP reveals + new event in `/security`

For **PR 4** (set-password + sessions feature):

1. Apply migration `20260525_user_sessions_rpcs.sql` to Supabase Dev via MCP `apply_migration`
2. Verify RPC grants: `SELECT proname, proacl FROM pg_proc WHERE proname IN ('list_user_sessions','revoke_user_sessions')` — should show `service_role=X/postgres` only
3. Run backend tests locally against Dev
4. Apply same migration to Supabase Prod via MCP `apply_migration`
5. Push code to `main`
6. VPS: same deploy commands as PR 3
7. Smoke test: open Users edit modal → verify password + sessions sections render; trigger generate-password → password shown once; trigger custom password → toast confirms; checkboxes select sessions → revoke flow works; open CompanyPage team modal → same functionality via shared modal; verify `password_changed` events in `/security`

---

## Out of Scope

- **Self-service password change** for the actor (any user changing their own password from a profile menu) — falls back to the existing recovery-email flow. The `password_changed` action name + metadata is forward-compatible for when this lands.
- **Billing / subscription powers for company-admin** — the role lands here with its permission surface (members, passwords, IPs). Billing UI and Stripe integration is a future milestone; the role is the prerequisite.
- **2FA / MFA enrollment** for users (separate milestone).
- **IP geolocation or device fingerprinting** beyond user_agent parsing.
- **Session expiry policy changes** (Supabase defaults stay).
- **Email template redesign** — the unification to Resend lands as-is; visual polish in a future UI pass.
- **Multi-admin invite from create-company flow** — `POST /api/companies` creates one admin. Adding more admins is done from the team management UI afterward.
