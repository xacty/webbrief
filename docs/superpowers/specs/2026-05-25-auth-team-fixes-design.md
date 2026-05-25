# Auth + Team Management Fixes — Design Spec

- Date: 2026-05-25
- Status: Draft (pending user review)
- Author: Adrián + Claude
- Scope: 1 bug fix + 1 feature + 1 refactor, shipped as 3 separate PRs

---

## Problem Statement

Three issues reported after the v1.1 auth-hardening milestone went live:

1. **Bug — Invite link lands on `/login`**: when an admin creates a new company, the manager receives an invitation email whose CTA link redirects to `/login` instead of `/auth/set-password`. The manager cannot proceed until the admin manually goes to the Users page and clicks "Enviar acceso" — which sends a different email that lands correctly.

2. **Missing feature — Admins/managers cannot set passwords directly**: the only password recovery path is "send a recovery email". There is no WordPress-like flow where an admin can generate a temporary password (or type a custom one) for a user and hand it over manually.

3. **Partial coverage — Company team modal lacks parity with Users modal**: the password/access actions added in the Users page do not exist in the Company team sidecard. A manager editing a member from CompanyPage sees only Name + Role, no envelope action, no password actions.

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

```javascript
export function canSetPassword({ actor, target, actorMemberships, targetMemberships }) {
  if (!actor || !target) return false
  if (actor.id === target.id) return false                       // never self
  if (actor.platformRole === 'qa') return false                  // QA defensive guard
  if (actor.platformRole === 'admin') {
    if (target.platformRole === 'admin' && target.id !== actor.id) return true  // admin can edit other admins
    return true
  }
  // Manager path: must share at least one company AS MANAGER, target must not be platform-admin, target must not be a manager-peer in any shared company.
  if (target.platformRole === 'admin') return false
  const actorManagedCompanies = new Set(
    (actorMemberships || []).filter((m) => m.role === 'manager').map((m) => m.companyId)
  )
  if (actorManagedCompanies.size === 0) return false
  const sharedCompanies = (targetMemberships || []).filter((m) => actorManagedCompanies.has(m.companyId))
  if (sharedCompanies.length === 0) return false
  if (sharedCompanies.some((m) => m.role === 'manager')) return false  // no peer-manager overwrite
  return true
}

export function canViewSessions(args) {
  // Same gating as canSetPassword (admin/manager-of-shared-company, not self, not peer-manager).
  return canSetPassword(args)
}
```

Mirror in `frontend/src/lib/permissions.js`.

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
- Map each row to `{ id, deviceLabel: formatDeviceLabel(user_agent), ip: maskIpForActor(ip, actor), lastRefreshAt: refreshed_at || updated_at, createdAt: created_at }`
  - `maskIpForActor`: admin sees full IP; manager sees `192.168.*.*` (last two octets masked for v4, similar for v6)
- Return `{ sessions: [...], total: sessions.length }`

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
- `logSecurityEvent` action `password_set_by_admin` metadata `{ method: mode, sessionsRevokedCount: revokedCount || 0, viaSendAccess: false }`
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

## PR Sequencing

| PR | Scope | Approx LOC | Dependencies |
|----|-------|-----------|--------------|
| **PR 1** | Section A — bug fix | ~80 LOC backend + ~40 LOC tests | None |
| **PR 2** | Section C without password/sessions — pure refactor (shared modal + envelope on team row) | ~250 LOC new + ~150 LOC deleted | Independent of PR 1; can merge in parallel |
| **PR 3** | Section B — set-password + sessions feature (mounted in shared modal) | ~400 LOC backend + ~300 LOC frontend + 1 migration | Soft-depends on PR 2 for team-modal coverage |

Each PR is independently shippable. PR 1 and PR 2 are fully independent and can ship in any order. PR 3 is technically independent too, but if it ships without PR 2 merged, the password/sessions UI only lives in the UsersPage modal — the CompanyPage team modal stays without those actions until PR 2 lands. Strict ordering recommended: PR 1 → PR 2 → PR 3.

---

## Deploy Checklist

For **PR 3** (the only one with a migration):

1. Apply migration `20260525_user_sessions_rpcs.sql` to Supabase Dev via MCP `apply_migration`
2. Run backend tests locally against Dev
3. Apply same migration to Supabase Prod via MCP `apply_migration`
4. Push code to `main`
5. SSH to VPS: `cd /var/www/webrief && git pull && cd backend && npm install && pm2 restart webrief-backend && cd ../frontend && npm install && npm run build`
6. Smoke test on `https://webrief.app`: open Users edit modal, verify password + sessions sections render; open CompanyPage team modal, verify same; trigger generate-password + revoke-sessions; verify audit logs in `/security`

For **PR 1** and **PR 2**: standard deploy without migration step.

---

## Out of Scope

- Self-service password change for the actor (admin changing their own password) — falls back to the existing recovery flow.
- 2FA / MFA enrollment for users (separate milestone).
- IP geolocation or device fingerprinting beyond user_agent parsing.
- Session expiry policy changes (out of scope; Supabase defaults stay).
- Email template redesign (the unification to Resend lands as-is; visual polish in a future UI pass).
