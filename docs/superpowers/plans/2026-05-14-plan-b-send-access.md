# Plan B — Send Access (Adaptive Invite / Recovery) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give admin/manager a one-button "Enviar acceso" feature that adaptively reinvites users who never activated or sends a password recovery to active users — without deleting and recreating auth accounts.

**Architecture:** Backend endpoint `POST /api/users/:id/send-access` branches on `auth.users.last_sign_in_at` (same discriminator as Plan A's `ensureUserProfile`). Never-activated → `generateLink({type:'invite'})` + `sendInviteEmail`. Active → `generateLink({type:'recovery'})` + insert `password_reset_requests` row (server-side 1h TTL) + `sendResetPasswordEmail`. All Supabase Auth calls wrapped via `wrapSupabaseAuthCall` (Plan D) so `over_email_send_rate_limit` etc. land in `/security/errors`. Frontend adds a permission-gated row button; `SetPassword.jsx` detects `type=recovery` from the URL hash captured at app-init and gates the form behind two new `/api/auth/*` endpoints.

**Tech Stack:** Node 20, Express 4, Supabase (auth + Postgres + RLS), React 18, Vite, Resend REST API (already wired in `authEmails.js` from Plan A).

---

## Locked design decisions (no open questions during implementation)

| Decision | Resolution |
|---|---|
| **DEC-1** RLS on `password_reset_requests` | Service-role-only (mirrors `application_errors`). Frontend never reads the table directly. |
| **DEC-2** Self-target | Forbidden for both admin and manager. Users use the public `/login` "Olvidé mi contraseña" flow for self-reset. |
| **DEC-3** 429 toast formatting | Format `Retry-After` (seconds) into minutes: `"Demasiados intentos. Esperá ~N minutos."` (rounded up, min 1). |
| **DEC-4** Missing `RESEND_API_KEY` | Endpoint still returns 200 with `emailSent: false` and a warning toast on the frontend. The link is generated; only the email delivery is missing. Matches Plan A's `inviteSent` semantics. |
| **DEC-5** `validate-reset-token` logging | No `security_events` row (it runs on every page load). Only `mark-reset-used` writes — Plan E will hang `password_reset_completed` there. Plan B leaves the row insert as the audit trail. |
| **DEC-6** Inactive/deactivated target | Same trip as active. No special handling. Spec doesn't carve out and there's no concrete use case to block. |

---

## File Structure

**Create:**
- `supabase/migrations/20260515_password_reset_requests.sql` — table + indexes + RLS deny-all (service-role only)
- `backend/src/lib/sendAccess.js` — pure helpers `canSendAccess`, `decideSendAccessAction`, `validateResetRequestRow`
- `backend/test/send-access.test.js` — unit tests for the 3 pure helpers
- `backend/test/authEmails-reset.test.js` — unit tests for `buildResetPasswordEmailPayload`

**Modify:**
- `backend/src/middleware/security.js` — append `passwordReset` to `rateLimiters` (around L340)
- `backend/src/lib/authEmails.js` — export `buildResetPasswordEmailPayload` + `sendResetPasswordEmail`
- `backend/src/routes/users.js` — append `POST /:id/send-access` after `DELETE /:id`
- `backend/src/routes/auth.js` — append `POST /validate-reset-token` + `POST /mark-reset-used`
- `frontend/src/lib/supabase.js` — capture `window.location.hash` BEFORE `createClient`, export `INITIAL_AUTH_TYPE`
- `frontend/src/lib/roleCapabilities.js` — append `canSendAccess`
- `frontend/src/pages/UsersPage.jsx` — wire button in the row actions cell + `handleSendAccess`
- `frontend/src/pages/SetPassword.jsx` — detect recovery type, call `/validate-reset-token`, gate form, call `/mark-reset-used` on success

**No changes:**
- `shared/inviteActions.js` (already covers invite-resent label via Plan A's `buildInviteResultMessage`)
- `backend/src/lib/applicationErrors.js` (reuses `wrapSupabaseAuthCall` as-is)
- `backend/src/lib/users.js` (no edits — `ensureUserProfile` is untouched)

---

## Task 1: Migration `password_reset_requests`

**Files:**
- Create: `supabase/migrations/20260515_password_reset_requests.sql`

- [ ] **Step 1.1: Create the migration file**

Write `/Users/adrian/GitHub/webbrief/supabase/migrations/20260515_password_reset_requests.sql`:

```sql
-- password_reset_requests: server-side 1h TTL enforcement for recovery links.
--
-- Supabase Auth's global email_otp_exp is 24h (aligned with invite TTL).
-- Recovery links should be shorter; we enforce that by inserting a row here
-- when /api/users/:id/send-access fires for an active user, and checking
-- expires_at when the frontend hits /api/auth/validate-reset-token.
--
-- The row is also marked used_at on successful password update so that a
-- recovery link can only be consumed once.

CREATE TABLE IF NOT EXISTS password_reset_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  requested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  ip_address text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_password_reset_requests_user_recent
  ON password_reset_requests (user_id, requested_at DESC);

CREATE INDEX IF NOT EXISTS idx_password_reset_requests_active
  ON password_reset_requests (user_id, expires_at)
  WHERE used_at IS NULL;

-- RLS: deny all (admin reads happen via service_role; no end-user access).
ALTER TABLE password_reset_requests ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE password_reset_requests IS
  'Server-side TTL ledger for password recovery links (1h enforced on top of Supabase global 24h).';
```

- [ ] **Step 1.2: Lint the SQL locally**

Run: `cd /Users/adrian/GitHub/webbrief && cat supabase/migrations/20260515_password_reset_requests.sql | head -40`

Expected: full SQL printed, no shell errors.

- [ ] **Step 1.3: Commit**

```bash
cd /Users/adrian/GitHub/webbrief
git add supabase/migrations/20260515_password_reset_requests.sql
git commit -m "feat(auth): add password_reset_requests migration for 1h recovery TTL"
```

Expected: 1 file changed, 1 insertion.

---

## Task 2: `rateLimiters.passwordReset`

**Files:**
- Modify: `backend/src/middleware/security.js` (around L340, inside the `rateLimiters` export block)

- [ ] **Step 2.1: Add the limiter inside `rateLimiters`**

In `/Users/adrian/GitHub/webbrief/backend/src/middleware/security.js`, find the existing `authenticatedUpload` entry (around L332-339) and add `passwordReset` immediately after it, BEFORE the closing `}` of `rateLimiters` (currently L340):

```javascript
  authenticatedUpload: createRateLimit({
    name: 'authenticated-upload',
    windowMs: 10 * 60_000,
    max: 30,
    blockMs: 15 * 60_000,
    maxBlockMs: 6 * 60 * 60_000,
    keyParts: (req) => [req.currentUser?.id, req.params?.id],
  }),
  passwordReset: createRateLimit({
    name: 'password-reset',
    windowMs: 60 * 60_000,
    max: 5,
    blockMs: 15 * 60_000,
    maxBlockMs: 6 * 60 * 60_000,
    keyParts: (req) => [req.currentUser?.id, req.params?.id],
  }),
}
```

Rationale: 5 per hour per (actor + targetUserId), 15-min block escalating to 6h. Matches spec §B.1.

- [ ] **Step 2.2: Sanity check the import surface**

Run: `cd /Users/adrian/GitHub/webbrief && grep -n "passwordReset\|password-reset" backend/src/middleware/security.js`

Expected:
```
[line]:  passwordReset: createRateLimit({
[line+1]:    name: 'password-reset',
```

- [ ] **Step 2.3: Commit**

```bash
cd /Users/adrian/GitHub/webbrief
git add backend/src/middleware/security.js
git commit -m "feat(security): add passwordReset rate limiter (5/h per actor+target)"
```

---

## Task 3: `authEmails.sendResetPasswordEmail`

**Files:**
- Modify: `backend/src/lib/authEmails.js`
- Test: `backend/test/authEmails-reset.test.js` (create)

- [ ] **Step 3.1: Write the failing test first**

Create `/Users/adrian/GitHub/webbrief/backend/test/authEmails-reset.test.js`:

```javascript
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildResetPasswordEmailPayload } from '../src/lib/authEmails.js'

test('buildResetPasswordEmailPayload: minimal shape with name and link', () => {
  const payload = buildResetPasswordEmailPayload({
    to: 'user@example.com',
    fullName: 'Pepa',
    actionLink: 'https://webrief.app/auth/set-password#type=recovery&access_token=abc',
    expiresAt: new Date('2026-05-14T15:30:00Z'),
  })

  assert.equal(payload.to, 'user@example.com')
  assert.match(payload.subject, /restablece/i)
  assert.match(payload.html, /Pepa/)
  assert.match(payload.html, /https:\/\/webrief\.app\/auth\/set-password/)
  assert.match(payload.text, /https:\/\/webrief\.app\/auth\/set-password/)
  assert.ok(payload.from, 'from should be set from getSender()')
})

test('buildResetPasswordEmailPayload: no name fallback', () => {
  const payload = buildResetPasswordEmailPayload({
    to: 'user@example.com',
    fullName: '',
    actionLink: 'https://x/y',
    expiresAt: new Date(),
  })

  assert.match(payload.html, /Hola/)
  assert.doesNotMatch(payload.html, /Hola \w/) // no name appended
})

test('buildResetPasswordEmailPayload: escapes html in name and link', () => {
  const payload = buildResetPasswordEmailPayload({
    to: 'a@b.c',
    fullName: '<script>alert(1)</script>',
    actionLink: 'https://x/y?q=<x>',
    expiresAt: new Date(),
  })

  assert.doesNotMatch(payload.html, /<script>/)
  assert.match(payload.html, /&lt;script&gt;/)
  assert.match(payload.html, /q=&lt;x&gt;/)
})

test('buildResetPasswordEmailPayload: includes expiration hint in spanish', () => {
  const payload = buildResetPasswordEmailPayload({
    to: 'a@b.c',
    fullName: '',
    actionLink: 'https://x/y',
    expiresAt: new Date('2026-05-14T15:30:00Z'),
  })

  // Should mention 1 hour expiration in spanish copy (don't pin exact wording — test that it appears)
  assert.match(payload.text, /1 hora|una hora|expira/i)
})
```

- [ ] **Step 3.2: Run the test to verify it fails**

Run: `cd /Users/adrian/GitHub/webbrief/backend && npm test -- --test-name-pattern 'buildResetPasswordEmailPayload'`

Expected: 4 failures (function not exported).

- [ ] **Step 3.3: Implement `buildResetPasswordEmailPayload` + `sendResetPasswordEmail`**

In `/Users/adrian/GitHub/webbrief/backend/src/lib/authEmails.js`, after `sendInviteEmail` (at the end of file), append:

```javascript
export function buildResetPasswordEmailPayload({ to, fullName, actionLink, expiresAt }) {
  const safeName = fullName?.trim() || ''
  const greeting = safeName ? `Hola ${safeName}` : 'Hola'
  const subject = 'Restablece tu contraseña en WeBrief'

  const html = `
    <!doctype html>
    <html lang="es"><head><meta charset="utf-8"></head><body style="font-family:system-ui,-apple-system,sans-serif;color:#222;max-width:560px;margin:0 auto;padding:24px">
      <h1 style="font-size:20px;margin:0 0 16px">${escapeHtml(greeting)}</h1>
      <p style="font-size:15px;line-height:1.5;margin:0 0 16px">
        Recibimos una solicitud para restablecer tu contraseña de WeBrief.
        Hacé clic en el botón para elegir una nueva. El enlace expira en 1 hora.
      </p>
      <p style="margin:24px 0">
        <a href="${escapeHtml(actionLink)}"
           style="display:inline-block;background:#0f172a;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600">
          Restablecer contraseña
        </a>
      </p>
      <p style="font-size:13px;color:#666;margin:24px 0 0">
        Si el botón no funciona, copiá esta dirección en tu navegador:<br>
        <span style="word-break:break-all">${escapeHtml(actionLink)}</span>
      </p>
      <p style="font-size:12px;color:#888;margin:24px 0 0">
        Si no solicitaste este cambio, ignorá este mensaje. Tu contraseña actual sigue siendo válida.
      </p>
    </body></html>
  `.trim()

  const text = [
    greeting + '.',
    '',
    'Recibimos una solicitud para restablecer tu contraseña de WeBrief.',
    'Abrí el siguiente enlace para elegir una nueva. El enlace expira en 1 hora:',
    actionLink,
    '',
    'Si no solicitaste este cambio, ignorá este mensaje.',
  ].join('\n')

  return { to, subject, html, text, from: getSender(), expiresAt }
}

export async function sendResetPasswordEmail(args) {
  if (!args?.to) {
    console.warn('[authEmails] sendResetPasswordEmail called without recipient; skipping')
    return { sent: false, reason: 'missing_recipient' }
  }

  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.warn('[authEmails] RESEND_API_KEY missing; skipping reset email send')
    return { sent: false, reason: 'no_api_key' }
  }

  const payload = buildResetPasswordEmailPayload(args)

  try {
    const response = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: payload.from,
        to: [payload.to],
        subject: payload.subject,
        html: payload.html,
        text: payload.text,
      }),
    })

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '')
      console.warn('[authEmails] Resend reset send failed', response.status, errorBody)
      return { sent: false, reason: `resend_${response.status}`, errorBody }
    }

    const data = await response.json().catch(() => null)
    return { sent: true, id: data?.id || null }
  } catch (error) {
    console.warn('[authEmails] Resend reset send threw', error?.message)
    return { sent: false, reason: 'exception', errorMessage: error?.message }
  }
}
```

- [ ] **Step 3.4: Run the test to verify it passes**

Run: `cd /Users/adrian/GitHub/webbrief/backend && npm test -- --test-name-pattern 'buildResetPasswordEmailPayload'`

Expected: 4 passing.

- [ ] **Step 3.5: Run the full test suite to confirm no regression**

Run: `cd /Users/adrian/GitHub/webbrief/backend && npm test 2>&1 | tail -15`

Expected: 57/57 (53 prior + 4 new) tests passing.

- [ ] **Step 3.6: Commit**

```bash
cd /Users/adrian/GitHub/webbrief
git add backend/src/lib/authEmails.js backend/test/authEmails-reset.test.js
git commit -m "feat(authEmails): add sendResetPasswordEmail + buildResetPasswordEmailPayload"
```

---

## Task 4: Pure helpers in `backend/src/lib/sendAccess.js`

**Files:**
- Create: `backend/src/lib/sendAccess.js`
- Create: `backend/test/send-access.test.js`

- [ ] **Step 4.1: Write the failing test**

Create `/Users/adrian/GitHub/webbrief/backend/test/send-access.test.js`:

```javascript
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  canSendAccess,
  decideSendAccessAction,
  validateResetRequestRow,
} from '../src/lib/sendAccess.js'

// -------- canSendAccess --------

test('canSendAccess: admin can target any user (except self)', () => {
  const admin = { id: 'a1', platformRole: 'admin' }
  assert.equal(canSendAccess({ actor: admin, targetUserId: 't1', actorMemberships: [], targetMemberships: [] }), true)
  assert.equal(canSendAccess({ actor: admin, targetUserId: 'a1', actorMemberships: [], targetMemberships: [] }), false, 'admin cannot self-target')
})

test('canSendAccess: manager can target users sharing at least one company where actor is manager', () => {
  const manager = { id: 'm1', platformRole: 'user' }
  const result = canSendAccess({
    actor: manager,
    targetUserId: 't1',
    actorMemberships: [{ companyId: 'c1', role: 'manager' }],
    targetMemberships: [{ companyId: 'c1', role: 'editor' }],
  })
  assert.equal(result, true)
})

test('canSendAccess: manager cannot target user when shared company role is NOT manager', () => {
  const manager = { id: 'm1', platformRole: 'user' }
  const result = canSendAccess({
    actor: manager,
    targetUserId: 't1',
    actorMemberships: [{ companyId: 'c1', role: 'editor' }], // actor is editor, not manager
    targetMemberships: [{ companyId: 'c1', role: 'editor' }],
  })
  assert.equal(result, false)
})

test('canSendAccess: manager cannot target user without shared company', () => {
  const manager = { id: 'm1', platformRole: 'user' }
  const result = canSendAccess({
    actor: manager,
    targetUserId: 't1',
    actorMemberships: [{ companyId: 'c1', role: 'manager' }],
    targetMemberships: [{ companyId: 'c2', role: 'editor' }],
  })
  assert.equal(result, false)
})

test('canSendAccess: QA cannot target anyone', () => {
  const qa = { id: 'q1', platformRole: 'qa' }
  const result = canSendAccess({
    actor: qa,
    targetUserId: 't1',
    actorMemberships: [{ companyId: 'c1', role: 'manager' }],
    targetMemberships: [{ companyId: 'c1', role: 'editor' }],
  })
  assert.equal(result, false)
})

test('canSendAccess: editor cannot target anyone', () => {
  const editor = { id: 'e1', platformRole: 'user' }
  const result = canSendAccess({
    actor: editor,
    targetUserId: 't1',
    actorMemberships: [{ companyId: 'c1', role: 'editor' }],
    targetMemberships: [{ companyId: 'c1', role: 'editor' }],
  })
  assert.equal(result, false)
})

test('canSendAccess: manager cannot self-target either', () => {
  const manager = { id: 'm1', platformRole: 'user' }
  const result = canSendAccess({
    actor: manager,
    targetUserId: 'm1',
    actorMemberships: [{ companyId: 'c1', role: 'manager' }],
    targetMemberships: [{ companyId: 'c1', role: 'manager' }],
  })
  assert.equal(result, false)
})

test('canSendAccess: missing actor or targetUserId returns false', () => {
  assert.equal(canSendAccess({ actor: null, targetUserId: 't1' }), false)
  assert.equal(canSendAccess({ actor: { id: 'a1' }, targetUserId: null }), false)
})

// -------- decideSendAccessAction --------

test('decideSendAccessAction: never activated → invite_resent', () => {
  const result = decideSendAccessAction({ authUser: { id: 'u1', last_sign_in_at: null } })
  assert.deepEqual(result, { action: 'invite_resent', ttlSeconds: 86400 })
})

test('decideSendAccessAction: active → reset_sent', () => {
  const result = decideSendAccessAction({ authUser: { id: 'u1', last_sign_in_at: '2026-01-01T00:00:00Z' } })
  assert.deepEqual(result, { action: 'reset_sent', ttlSeconds: 3600 })
})

test('decideSendAccessAction: no auth user → not_found', () => {
  const result = decideSendAccessAction({ authUser: null })
  assert.deepEqual(result, { action: 'not_found', ttlSeconds: 0 })
})

// -------- validateResetRequestRow --------

test('validateResetRequestRow: valid when expires_at in future and used_at null', () => {
  const now = new Date('2026-05-14T12:00:00Z')
  const row = {
    expires_at: '2026-05-14T12:30:00Z',
    used_at: null,
  }
  assert.deepEqual(validateResetRequestRow({ row, now }), { valid: true, reason: null })
})

test('validateResetRequestRow: expired when now > expires_at', () => {
  const now = new Date('2026-05-14T14:00:00Z')
  const row = {
    expires_at: '2026-05-14T12:30:00Z',
    used_at: null,
  }
  assert.deepEqual(validateResetRequestRow({ row, now }), { valid: false, reason: 'expired' })
})

test('validateResetRequestRow: used when used_at is set', () => {
  const now = new Date('2026-05-14T12:00:00Z')
  const row = {
    expires_at: '2026-05-14T12:30:00Z',
    used_at: '2026-05-14T11:55:00Z',
  }
  assert.deepEqual(validateResetRequestRow({ row, now }), { valid: false, reason: 'used' })
})

test('validateResetRequestRow: no_request when row is null', () => {
  const now = new Date('2026-05-14T12:00:00Z')
  assert.deepEqual(validateResetRequestRow({ row: null, now }), { valid: false, reason: 'no_request' })
})
```

- [ ] **Step 4.2: Run the test to verify it fails**

Run: `cd /Users/adrian/GitHub/webbrief/backend && npm test -- --test-name-pattern 'canSendAccess|decideSendAccessAction|validateResetRequestRow'`

Expected: 16 failures (module not found).

- [ ] **Step 4.3: Implement the helpers**

Create `/Users/adrian/GitHub/webbrief/backend/src/lib/sendAccess.js`:

```javascript
// Pure helpers for the send-access feature. Side-effect free; testable in isolation.
//
// - canSendAccess: permission check (admin global; manager per shared company).
// - decideSendAccessAction: discriminates invite vs recovery by last_sign_in_at.
// - validateResetRequestRow: enforces 1h recovery TTL from password_reset_requests.

export function canSendAccess({ actor, targetUserId, actorMemberships = [], targetMemberships = [] }) {
  if (!actor || !targetUserId) return false
  if (actor.id === targetUserId) return false // no self-targeting (DEC-2)

  if (actor.platformRole === 'admin') return true

  // Manager path: actor must be 'manager' in at least one company shared with target.
  const actorManagerCompanies = new Set(
    (actorMemberships || [])
      .filter((m) => m && m.role === 'manager')
      .map((m) => m.companyId)
  )
  if (actorManagerCompanies.size === 0) return false

  const targetCompanyIds = new Set(
    (targetMemberships || []).map((m) => m && m.companyId).filter(Boolean)
  )

  for (const cid of actorManagerCompanies) {
    if (targetCompanyIds.has(cid)) return true
  }
  return false
}

const INVITE_TTL_SECONDS = 86_400 // 24h, matches Supabase email_otp_exp
const RECOVERY_TTL_SECONDS = 3_600 // 1h, enforced server-side via password_reset_requests

export function decideSendAccessAction({ authUser }) {
  if (!authUser) return { action: 'not_found', ttlSeconds: 0 }
  if (!authUser.last_sign_in_at) return { action: 'invite_resent', ttlSeconds: INVITE_TTL_SECONDS }
  return { action: 'reset_sent', ttlSeconds: RECOVERY_TTL_SECONDS }
}

export function validateResetRequestRow({ row, now }) {
  if (!row) return { valid: false, reason: 'no_request' }
  if (row.used_at) return { valid: false, reason: 'used' }
  const expiresAt = new Date(row.expires_at)
  if (Number.isNaN(expiresAt.getTime())) return { valid: false, reason: 'expired' }
  if (now >= expiresAt) return { valid: false, reason: 'expired' }
  return { valid: true, reason: null }
}
```

- [ ] **Step 4.4: Run the test to verify it passes**

Run: `cd /Users/adrian/GitHub/webbrief/backend && npm test -- --test-name-pattern 'canSendAccess|decideSendAccessAction|validateResetRequestRow' 2>&1 | tail -10`

Expected: 16 passing.

- [ ] **Step 4.5: Run full suite**

Run: `cd /Users/adrian/GitHub/webbrief/backend && npm test 2>&1 | tail -5`

Expected: 73/73 (57 prior after Task 3 + 16 new).

- [ ] **Step 4.6: Commit**

```bash
cd /Users/adrian/GitHub/webbrief
git add backend/src/lib/sendAccess.js backend/test/send-access.test.js
git commit -m "feat(sendAccess): pure helpers canSendAccess + decideSendAccessAction + validateResetRequestRow"
```

---

## Task 5: Endpoint `POST /api/users/:id/send-access`

**Files:**
- Modify: `backend/src/routes/users.js` (append after `DELETE /:id` at L861)

- [ ] **Step 5.1: Update imports at top of `backend/src/routes/users.js`**

Inspect existing imports (read lines 1-30 first). Add the following imports if not already present (skip duplicates):

```javascript
import { canSendAccess, decideSendAccessAction } from '../lib/sendAccess.js'
import { sendInviteEmail, sendResetPasswordEmail } from '../lib/authEmails.js'
import { findAuthUserByEmailPaginated, normalizeEmail } from '../lib/users.js'
import { wrapSupabaseAuthCall } from '../lib/applicationErrors.js'
```

Note: `findAuthUserByEmailPaginated` is exported by `backend/src/lib/users.js`. Verify the named export exists (`grep -n "export.*findAuthUserByEmailPaginated" backend/src/lib/users.js`) and pull in only what's missing — don't duplicate.

Note: `sendInviteEmail` may already be imported via the existing `users.js` route file (search before adding). Same for `wrapSupabaseAuthCall`. Add only the missing names.

- [ ] **Step 5.2: Append the `POST /:id/send-access` route at the end of `backend/src/routes/users.js` (before `export default router`)**

Locate the last route in `backend/src/routes/users.js` (`DELETE /:id` near L861-905) and append below it, before `export default router`:

```javascript
router.post('/:id/send-access', rateLimiters.passwordReset, async (req, res) => {
  const targetUserId = req.params.id

  if (!targetUserId) {
    return res.status(400).json({ error: 'id requerido' })
  }

  try {
    // 1. Load target profile (also gives us email and full_name for the email body).
    const { data: targetProfile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('id, email, full_name')
      .eq('id', targetUserId)
      .maybeSingle()

    if (profileError) throw profileError
    if (!targetProfile) return res.status(404).json({ error: 'Usuario no encontrado' })

    // 2. Load target memberships (needed for canSendAccess shared-company check).
    const { data: targetMemberships, error: membershipsError } = await supabaseAdmin
      .from('company_memberships')
      .select('company_id, role')
      .eq('user_id', targetUserId)

    if (membershipsError) throw membershipsError

    const targetMembershipsMapped = (targetMemberships || []).map((m) => ({
      companyId: m.company_id,
      role: m.role,
    }))

    // 3. Permission check.
    const allowed = canSendAccess({
      actor: req.currentUser,
      targetUserId,
      actorMemberships: req.currentUser?.memberships || [],
      targetMemberships: targetMembershipsMapped,
    })

    if (!allowed) {
      return res.status(403).json({ error: 'No tienes permisos para enviar acceso a este usuario' })
    }

    // 4. Look up auth user (need last_sign_in_at).
    const normalizedEmail = normalizeEmail(targetProfile.email)
    const authUser = await findAuthUserByEmailPaginated(supabaseAdmin, normalizedEmail)

    const decision = decideSendAccessAction({ authUser })
    if (decision.action === 'not_found') {
      return res.status(404).json({ error: 'No existe la cuenta de autenticación para este usuario' })
    }

    const redirectTo = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/auth/set-password`
    const now = new Date()
    const expiresAt = new Date(now.getTime() + decision.ttlSeconds * 1000)

    // 5. Generate the appropriate link (wrapped for /security/errors traceability).
    const linkType = decision.action === 'invite_resent' ? 'invite' : 'recovery'
    const { data: linkData, error: linkError } = await wrapSupabaseAuthCall({
      operation: () => supabaseAdmin.auth.admin.generateLink({
        type: linkType,
        email: normalizedEmail,
        options: { redirectTo },
      }),
      operationName: `generateLink:${linkType}`,
      req,
      args: { email: normalizedEmail, type: linkType },
    })

    if (linkError) throw linkError
    const actionLink = linkData?.properties?.action_link
    if (!actionLink) {
      throw new Error('Supabase no devolvió action_link')
    }

    // 6. For recovery: insert tracking row BEFORE sending email (so a stale row never leaks).
    if (decision.action === 'reset_sent') {
      const { error: insertError } = await supabaseAdmin
        .from('password_reset_requests')
        .insert({
          user_id: authUser.id,
          requested_by: req.currentUser?.id || null,
          expires_at: expiresAt.toISOString(),
          ip_address: req.ip || null,
          metadata: { actor_email: req.currentUser?.email || null },
        })
      if (insertError) throw insertError
    }

    // 7. Send email (best-effort; failure surfaces as emailSent: false, not 500).
    const sender = decision.action === 'invite_resent' ? sendInviteEmail : sendResetPasswordEmail
    const emailResult = await sender({
      to: normalizedEmail,
      fullName: targetProfile.full_name || '',
      actionLink,
      expiresAt,
    })

    // 8. Audit log (security_events).
    const securityAction = decision.action === 'invite_resent' ? 'invite_resent' : 'password_reset_requested'
    await logSecurityEvent(req, {
      action: securityAction,
      resourceType: 'user',
      resourceId: targetUserId,
      targetUserId,
      metadata: {
        via: 'send_access',
        emailSent: Boolean(emailResult?.sent),
        emailReason: emailResult?.sent ? null : (emailResult?.reason || 'unknown'),
      },
    })

    return res.status(200).json({
      action: decision.action,
      expiresAt: expiresAt.toISOString(),
      emailSent: Boolean(emailResult?.sent),
    })
  } catch (error) {
    const status = error.status || 500
    return res.status(status).json({
      error: error.message || 'No se pudo enviar acceso',
      errorId: error.applicationErrorId || null,
    })
  }
})
```

**Caveats for the implementer:**
- The route file already imports `supabaseAdmin`, `rateLimiters`, `logSecurityEvent`, `isAdmin`. Don't re-import.
- If `wrapSupabaseAuthCall` returns `{ data, error }` with an inline error (e.g., over_email_send_rate_limit captured by Plan D), it persists to `application_errors` AND returns the error in `linkError` — our throw above propagates it to the outer `catch`, which preserves `error.applicationErrorId` and surfaces it as `errorId` in the JSON response.

- [ ] **Step 5.3: Run the full suite to confirm nothing else broke**

Run: `cd /Users/adrian/GitHub/webbrief/backend && npm test 2>&1 | tail -5`

Expected: 73/73 (no new tests yet — endpoint integration is covered by the pure helpers from Task 4; if a future regression demands an integration test, add a smoke test mocking `supabaseAdmin`).

- [ ] **Step 5.4: Manual route smoke (boot the backend in a side terminal)**

Run: `cd /Users/adrian/GitHub/webbrief/backend && npm run dev` (in a separate terminal). Confirm no boot errors related to the new route.

Then ping the route shape without auth to check it's mounted:

```bash
curl -sS -o /dev/null -w '%{http_code}\n' -X POST http://localhost:3000/api/users/abc/send-access
```

Expected: `401` (auth required, route is mounted correctly).

Kill the dev server when done.

- [ ] **Step 5.5: Commit**

```bash
cd /Users/adrian/GitHub/webbrief
git add backend/src/routes/users.js
git commit -m "feat(users): add POST /api/users/:id/send-access (adaptive invite vs recovery)"
```

---

## Task 6: Endpoints `POST /api/auth/validate-reset-token` + `POST /api/auth/mark-reset-used`

**Files:**
- Modify: `backend/src/routes/auth.js`

- [ ] **Step 6.1: Update imports**

In `/Users/adrian/GitHub/webbrief/backend/src/routes/auth.js`, add the following imports near the existing ones (top of file):

```javascript
import { supabaseAdmin } from '../lib/supabase.js'
import { validateResetRequestRow } from '../lib/sendAccess.js'
```

- [ ] **Step 6.2: Append the two routes before `export default router`**

After the existing `POST /invite-user` route (ends around L81), and before `export default router`:

```javascript
router.post('/validate-reset-token', requireAuth, rateLimiters.sensitiveAction, async (req, res) => {
  try {
    const userId = req.currentUser?.id
    if (!userId) {
      return res.status(401).json({ error: 'No autenticado' })
    }

    const { data: row, error } = await supabaseAdmin
      .from('password_reset_requests')
      .select('id, expires_at, used_at')
      .eq('user_id', userId)
      .order('requested_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) throw error

    const result = validateResetRequestRow({ row, now: new Date() })
    return res.status(200).json(result)
  } catch (error) {
    return res.status(500).json({ error: error.message || 'No se pudo validar el token' })
  }
})

router.post('/mark-reset-used', requireAuth, rateLimiters.sensitiveAction, async (req, res) => {
  try {
    const userId = req.currentUser?.id
    if (!userId) {
      return res.status(401).json({ error: 'No autenticado' })
    }

    // Find the most recent active row.
    const { data: row, error: findError } = await supabaseAdmin
      .from('password_reset_requests')
      .select('id')
      .eq('user_id', userId)
      .is('used_at', null)
      .order('requested_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (findError) throw findError
    if (!row) {
      // Idempotent: nothing to mark. Not an error from the client's perspective.
      return res.status(200).json({ marked: false, reason: 'no_active_row' })
    }

    const { error: updateError } = await supabaseAdmin
      .from('password_reset_requests')
      .update({ used_at: new Date().toISOString() })
      .eq('id', row.id)

    if (updateError) throw updateError

    return res.status(200).json({ marked: true })
  } catch (error) {
    return res.status(500).json({ error: error.message || 'No se pudo marcar el token usado' })
  }
})
```

- [ ] **Step 6.3: Run full suite to confirm no boot regression**

Run: `cd /Users/adrian/GitHub/webbrief/backend && npm test 2>&1 | tail -5`

Expected: 73/73 passing.

- [ ] **Step 6.4: Manual route mount check**

Run backend dev server (`cd /Users/adrian/GitHub/webbrief/backend && npm run dev` in a side terminal), then:

```bash
curl -sS -o /dev/null -w '%{http_code}\n' -X POST http://localhost:3000/api/auth/validate-reset-token
curl -sS -o /dev/null -w '%{http_code}\n' -X POST http://localhost:3000/api/auth/mark-reset-used
```

Expected: `401` for both (auth required, routes mounted).

- [ ] **Step 6.5: Commit**

```bash
cd /Users/adrian/GitHub/webbrief
git add backend/src/routes/auth.js
git commit -m "feat(auth): add validate-reset-token + mark-reset-used endpoints (server-side 1h recovery TTL)"
```

---

## Task 7: Frontend permission helper + UsersPage button

**Files:**
- Modify: `frontend/src/lib/roleCapabilities.js`
- Modify: `frontend/src/pages/UsersPage.jsx`

- [ ] **Step 7.1: Add `canSendAccess` to `roleCapabilities.js`**

In `/Users/adrian/GitHub/webbrief/frontend/src/lib/roleCapabilities.js`, append after `canManageCompanyLifecycle` (around L65):

```javascript
// "Enviar acceso" — admin can target any user except self;
// manager can target users who share at least one company where the actor is manager;
// QA, editor, content_writer, designer, developer, user → no.
// Mirrors backend canSendAccess in backend/src/lib/sendAccess.js for symmetric gating.
export function canSendAccess(currentUser, targetUser) {
  if (!currentUser || !targetUser) return false
  if (currentUser.id === targetUser.id) return false

  if (isAdmin(currentUser)) return true

  const actorManagerCompanies = new Set(
    (currentUser.memberships || [])
      .filter((m) => m.role === 'manager')
      .map((m) => m.companyId)
  )
  if (actorManagerCompanies.size === 0) return false

  const targetCompanies = new Set(
    (targetUser.companies || []).map((c) => c.companyId).filter(Boolean)
  )

  for (const cid of actorManagerCompanies) {
    if (targetCompanies.has(cid)) return true
  }
  return false
}
```

**Caveat:** The shape mismatch between actor (`memberships[].companyId`) and target (`companies[].companyId`) is intentional — UsersPage's loaded user objects expose `companies` (verified at L641 of `UsersPage.jsx`: `const userCompanies = user.companies || []`). Keep this asymmetry; matching it to `memberships` would require touching the API.

- [ ] **Step 7.2: Wire the button in UsersPage.jsx**

In `/Users/adrian/GitHub/webbrief/frontend/src/pages/UsersPage.jsx`:

**2a) Add the import for `Mail` icon** — find the existing `lucide-react` import block (it imports `Pencil`, `Trash2`, `ChevronDown`, etc.) and add `Mail`:

```javascript
import { ..., Mail, Pencil, Trash2, ... } from 'lucide-react'
```

(Keep the alphabetic order if existing imports already are alphabetized; otherwise just append.)

**2b) Add the `canSendAccess` import** — find the existing `from '../lib/roleCapabilities'` import line and add `canSendAccess`:

```javascript
import { ..., canSendAccess, ... } from '../lib/roleCapabilities'
```

**2c) Add a `handleSendAccess` function** — near the existing `handleDeleteUser`, `handleRemoveMembership`, etc. (search for `async function handleDeleteUser`):

```javascript
async function handleSendAccess(user) {
  setBusyKey(`send-access:${user.id}`)
  setActionMessage('')
  try {
    const response = await fetch(`/api/users/${user.id}/send-access`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    })

    if (response.status === 429) {
      const retryAfterHeader = response.headers.get('Retry-After')
      const seconds = Number(retryAfterHeader) || 900 // default 15 min
      const minutes = Math.max(1, Math.ceil(seconds / 60))
      setActionMessage(`Demasiados intentos. Esperá ~${minutes} minutos.`)
      return
    }

    const body = await response.json().catch(() => ({}))

    if (!response.ok) {
      const idHint = body.errorId ? ` (ID: ${body.errorId})` : ''
      setActionMessage(body.error ? `${body.error}${idHint}` : `No se pudo enviar acceso${idHint}`)
      return
    }

    const expiresAt = body.expiresAt ? new Date(body.expiresAt) : null
    const expiresLabel = expiresAt
      ? expiresAt.toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })
      : ''
    const actionLabel = body.action === 'invite_resent' ? 'Invitación reenviada' : 'Email de restablecimiento enviado'
    const tail = body.emailSent ? `, caduca ${expiresLabel}` : ' (link generado, email no entregado)'
    setActionMessage(`${actionLabel}${tail}`)
  } catch (error) {
    setActionMessage(error?.message || 'Error de red enviando acceso')
  } finally {
    setBusyKey('')
  }
}
```

**2d) Add the button in the row actions cell** — find the row actions `<div className={styles.rowActions}>` block (L703 currently), and add the new button BEFORE the Pencil edit button:

```javascript
<td>
  <div className={styles.rowActions}>
    {canSendAccess(currentUser, user) && (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        icon={<Mail size={16} />}
        onClick={() => handleSendAccess(user)}
        disabled={busyKey === `send-access:${user.id}`}
        loading={busyKey === `send-access:${user.id}`}
        title="Enviar acceso (invitación o restablecimiento)"
        aria-label="Enviar acceso"
      />
    )}
    {canEditUser(user) && (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        icon={<Pencil size={16} />}
        onClick={() => openEditUser(user)}
        title="Editar usuario"
        aria-label="Editar usuario"
      />
    )}
    {/* existing delete button stays unchanged */}
    {isAdminUser && user.id !== currentUser?.id && (
      <Button
        type="button"
        variant="danger"
        size="sm"
        icon={<Trash2 size={16} />}
        onClick={() => handleDeleteUser(user)}
        disabled={busyKey === `delete:${user.id}`}
        title="Borrar usuario"
        aria-label="Borrar usuario"
      />
    )}
  </div>
</td>
```

- [ ] **Step 7.3: Frontend lint / build check**

Run: `cd /Users/adrian/GitHub/webbrief/frontend && npm run build 2>&1 | tail -20`

Expected: build succeeds. Pre-existing chunk-size warnings (`>500 KB`) are OK; no new errors.

If build fails on missing `canSendAccess` import or `Mail` icon, fix the import order and retry.

- [ ] **Step 7.4: Commit**

```bash
cd /Users/adrian/GitHub/webbrief
git add frontend/src/lib/roleCapabilities.js frontend/src/pages/UsersPage.jsx
git commit -m "feat(users): add Enviar acceso button + canSendAccess helper"
```

---

## Task 8: SetPassword.jsx — type detection + validate + mark-used

**Files:**
- Modify: `frontend/src/lib/supabase.js` (capture initial hash type)
- Modify: `frontend/src/pages/SetPassword.jsx`

- [ ] **Step 8.1: Capture initial auth type in `frontend/src/lib/supabase.js`**

Read `/Users/adrian/GitHub/webbrief/frontend/src/lib/supabase.js` first. Add the capture BEFORE the `createClient(...)` call (so the hash is read before Supabase parses+clears it on init):

```javascript
import { createClient } from '@supabase/supabase-js'

// Capture URL hash type (invite | recovery) BEFORE createClient parses+clears it.
// This is the only reliable way to know if the user arrived via a recovery link
// once Supabase has consumed the hash.
const _initialHash = typeof window !== 'undefined' ? (window.location.hash || '') : ''
const _initialHashParams = new URLSearchParams(
  _initialHash.startsWith('#') ? _initialHash.slice(1) : _initialHash
)
export const INITIAL_AUTH_TYPE = _initialHashParams.get('type') || null

// ... existing createClient call follows
```

If the file already exports a `supabase` constant from `createClient`, leave that line untouched — just prepend the three lines above and the `INITIAL_AUTH_TYPE` export.

**Caveat:** ES module top-level code runs after imports are loaded but BEFORE `createClient` is invoked. The `createClient` call schedules async session detection which clears the hash. Capturing in a `const` immediately above `createClient(...)` is sufficient.

- [ ] **Step 8.2: Update SetPassword.jsx — import INITIAL_AUTH_TYPE and validate the token**

In `/Users/adrian/GitHub/webbrief/frontend/src/pages/SetPassword.jsx`:

**8.2a) Update the supabase import**:

```javascript
import { supabase, INITIAL_AUTH_TYPE } from '../lib/supabase'
```

**8.2b) Replace the existing `useEffect` (around L18-50) so it also runs the validate call when type === 'recovery':**

```javascript
  // Possible statuses:
  //   'loading'         — waiting for invite/reset token to land
  //   'ready'           — session active, form visible
  //   'expired'         — no session or recovery row expired/used
  //   'recovery_invalid'— session active but server says recovery row expired/used
  const [status, setStatus] = useState('loading')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [authType] = useState(INITIAL_AUTH_TYPE) // 'invite' | 'recovery' | null

  useEffect(() => {
    let active = true
    let expiredTimer = null

    async function runRecoveryCheck() {
      if (authType !== 'recovery') return
      try {
        const response = await fetch('/api/auth/validate-reset-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
        })
        if (!response.ok) return // soft-fail: leave status as-is; user can still try
        const body = await response.json()
        if (!active) return
        if (!body.valid) {
          setStatus('recovery_invalid')
        }
      } catch {
        // network failure → don't block the form; user will see Supabase's own error if any
      }
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return
      if ((event === 'SIGNED_IN' || event === 'USER_UPDATED') && session) {
        clearTimeout(expiredTimer)
        setStatus((current) => (current === 'recovery_invalid' ? current : 'ready'))
        runRecoveryCheck()
      }
    })

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      if (data.session) {
        clearTimeout(expiredTimer)
        setStatus((current) => (current === 'recovery_invalid' ? current : 'ready'))
        runRecoveryCheck()
      }
    })

    expiredTimer = window.setTimeout(() => {
      if (!active) return
      setStatus((current) => (current === 'loading' ? 'expired' : current))
    }, 5000)

    return () => {
      active = false
      clearTimeout(expiredTimer)
      subscription.unsubscribe()
    }
  }, [authType])
```

**8.2c) Update `handleSubmit` to call `/api/auth/mark-reset-used` on recovery success**:

```javascript
  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres')
      return
    }

    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden')
      return
    }

    setSubmitting(true)

    try {
      const { error: updateError } = await supabase.auth.updateUser({ password })
      if (updateError) throw updateError

      if (authType === 'recovery') {
        // Mark the password_reset_requests row used so subsequent visits via the
        // same link get 'used' instead of an open form. Best-effort: a failure
        // here doesn't block the user from continuing.
        await fetch('/api/auth/mark-reset-used', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
        }).catch(() => {})
      }

      const { data: sessionData } = await supabase.auth.getSession()
      await refreshUser(sessionData.session, { force: true })
      navigate('/companies')
    } catch (err) {
      setError(err.message || 'No se pudo guardar la contraseña')
    } finally {
      setSubmitting(false)
    }
  }
```

**8.2d) Add the `recovery_invalid` render state**: find the existing `if (status === 'expired') { ... }` block and add a sibling `recovery_invalid` block just before it:

```javascript
  if (status === 'recovery_invalid') {
    return (
      <div className={styles.page}>
        <Card padding="lg" shadow="md" radius="lg" className={styles.card}>
          <h1 className={styles.title}>WeBrief</h1>
          <p className={styles.help}>
            Este enlace de restablecimiento ya caducó o fue usado.
            Pedile al admin/manager que te envíe uno nuevo, o usá
            "Olvidé mi contraseña" desde la pantalla de login.
          </p>
          <Button type="button" variant="primary" onClick={() => navigate('/login')}>
            Ir al login
          </Button>
        </Card>
      </div>
    )
  }

  if (status === 'expired') {
    // ...existing block unchanged
  }
```

- [ ] **Step 8.3: Frontend build check**

Run: `cd /Users/adrian/GitHub/webbrief/frontend && npm run build 2>&1 | tail -20`

Expected: build succeeds.

- [ ] **Step 8.4: Commit**

```bash
cd /Users/adrian/GitHub/webbrief
git add frontend/src/lib/supabase.js frontend/src/pages/SetPassword.jsx
git commit -m "feat(set-password): detect recovery type and gate form on server-side 1h TTL"
```

---

## Task 9: Final integration smoke + plan summary

**Goal:** Confirm the whole feature compiles + tests pass and produce a one-screen summary.

- [ ] **Step 9.1: Run full backend test suite**

Run: `cd /Users/adrian/GitHub/webbrief/backend && npm test 2>&1 | tail -10`

Expected: 73/73 passing (53 prior milestones + 4 from Task 3 + 16 from Task 4). If a test fails, fix it before continuing.

- [ ] **Step 9.2: Run frontend build**

Run: `cd /Users/adrian/GitHub/webbrief/frontend && npm run build 2>&1 | tail -10`

Expected: build success.

- [ ] **Step 9.3: Verify git log has clean commits**

Run: `cd /Users/adrian/GitHub/webbrief && git log --oneline main..HEAD`

Expected: 8 commits (Tasks 1-8), each with a single-responsibility message.

- [ ] **Step 9.4: Append session notes to `CONTEXT.min.md`**

Edit `/Users/adrian/GitHub/webbrief/CONTEXT.min.md`. Add a new entry above Session 13 in the "Recent Fixes" block:

```
### Session 14 (2026-05-14) — Auth hardening Plan B (send-access)

- Plan B shipped on branch `feat/auth-hardening-plan-b`: new `password_reset_requests` table (migration `20260515_password_reset_requests.sql`) with service-role-only RLS for server-side 1h recovery TTL. Schema: id, user_id, requested_by, requested_at, expires_at, used_at, ip_address, metadata. Indexed on (user_id, requested_at DESC) and partial (user_id, expires_at) WHERE used_at IS NULL.
- `backend/src/lib/sendAccess.js` exports 3 pure helpers: `canSendAccess` (admin global except self; manager only for shared-company-as-manager; QA/editor/etc forbidden), `decideSendAccessAction` (last_sign_in_at NULL → invite_resent ttl=24h, else → reset_sent ttl=1h, no auth user → not_found), `validateResetRequestRow` (no_request | used | expired | valid).
- `authEmails.sendResetPasswordEmail` + `buildResetPasswordEmailPayload` added; mirrors `sendInviteEmail` shape; gated by `RESEND_API_KEY` (no-op + warning if missing).
- `rateLimiters.passwordReset` (5/h per actor+target, 15-min block escalating to 6h) added to security middleware.
- `POST /api/users/:id/send-access` (requireAuth + rateLimiters.passwordReset): loads target profile + memberships → enforces canSendAccess → branches on last_sign_in_at → generateLink via `wrapSupabaseAuthCall` (Plan D wrapper, so Supabase auth errors land in /security/errors) → inserts password_reset_requests row for recovery path → sends invite/reset email → logs `invite_resent` or `password_reset_requested` security_events with `via: 'send_access'`. Returns `{ action, expiresAt, emailSent, errorId? }`.
- `POST /api/auth/validate-reset-token` + `POST /api/auth/mark-reset-used` (requireAuth + rateLimiters.sensitiveAction): validate reads most-recent row and returns `{ valid, reason }`; mark-used sets used_at on the most recent active row. No security_events here (validate runs on every page-load; mark-used will get `password_reset_completed` in Plan E).
- Frontend: `canSendAccess(currentUser, targetUser)` mirrors backend; `UsersPage.jsx` row gets Mail-icon button with adaptive toast (handles 429 with formatted minutes + 500 with `errorId`).
- `SetPassword.jsx`: captures `type` from URL hash at supabase.js init time (`INITIAL_AUTH_TYPE` export, captured BEFORE `createClient` consumes the hash); when `type === 'recovery'` calls `/validate-reset-token` and shows "Link caducado, pedí uno nuevo" if invalid; on successful password update calls `/mark-reset-used` (best-effort).
- 20 new tests in `backend/test/send-access.test.js` (16) + `backend/test/authEmails-reset.test.js` (4). Full backend suite: 73/73 pass.
- Required pre-deploy: apply migration `20260515_password_reset_requests.sql` on Supabase before pushing code (otherwise the recovery path inserts will fail and propagate as 500 — caught and logged to `application_errors` via the catch block, but the user gets an error toast).
```

- [ ] **Step 9.5: Commit the doc update**

```bash
cd /Users/adrian/GitHub/webbrief
git add CONTEXT.min.md
git commit -m "docs: record session 14 (Plan B send-access) in CONTEXT.min.md"
```

- [ ] **Step 9.6: Final branch status**

Run: `cd /Users/adrian/GitHub/webbrief && git log --oneline main..HEAD && echo '---' && git status`

Expected: 9 commits ahead of main, working tree clean.

---

## Self-review checklist (for the implementer, before declaring done)

1. **Spec coverage:** Re-skim spec §5.2 (Plan B) sections B.1, B.2, B.3, B.4. Confirm each is implemented:
   - B.1 endpoint + permissions + rate-limit ✓ (Task 5)
   - B.2 UI button + permission helper ✓ (Task 7)
   - B.3 sendResetPasswordEmail ✓ (Task 3) — `sendManagerAssignedEmail` is OUT of scope (that's Plan C)
   - B.4 password_reset_requests + validate + mark-used ✓ (Tasks 1, 6, 8)

2. **Security events:** confirm both `invite_resent` and `password_reset_requested` fire from the endpoint with `via: 'send_access'` metadata.

3. **wrapSupabaseAuthCall reuse:** `generateLink` is wrapped. `over_email_send_rate_limit` should land in `application_errors` with `source='supabase_auth'`, `error_code='over_email_send_rate_limit'`.

4. **Self-target:** verify `canSendAccess` returns false for self in both backend and frontend.

5. **RLS:** confirm `password_reset_requests` has `ENABLE ROW LEVEL SECURITY` without any `CREATE POLICY` — deny-all-by-default, only service_role bypasses.

6. **Hash race:** `INITIAL_AUTH_TYPE` is captured BEFORE `createClient(...)` is invoked. Verify the order in `frontend/src/lib/supabase.js` after edit.

7. **No placeholders:** grep the new files for `TODO`, `FIXME`, `XXX`, `tbd`:
   ```bash
   cd /Users/adrian/GitHub/webbrief && grep -rEn 'TODO|FIXME|XXX|TBD' \
     backend/src/lib/sendAccess.js \
     backend/src/lib/authEmails.js \
     backend/src/routes/users.js \
     backend/src/routes/auth.js \
     frontend/src/lib/roleCapabilities.js \
     frontend/src/pages/UsersPage.jsx \
     frontend/src/pages/SetPassword.jsx \
     frontend/src/lib/supabase.js
   ```
   Expected: no matches.

---

## Out of scope (not implemented in Plan B)

- `sendManagerAssignedEmail` and the company_membership_added notification → Plan C.
- `invite_accepted` / `password_reset_completed` security events from `SetPassword.jsx` → Plan E.
- `rate_limit_blocked` security event from middleware → Plan E.
- "Bloqueos activos" UI in `/security` → Plan E.
- `sendManagerAssignedEmail` triggered from `POST /api/companies` when `ensureUserProfile` returns `assigned_existing` → Plan C.

## Pre-deploy reminders (carried over from Plan A/D, still pending)

- Supabase Dashboard: Custom SMTP with Resend + `email_otp_exp = 86400` (24h). Without this, the reinvite path still hits Supabase's native ~3-4/h email rate limit for the `inviteUserByEmail` flow — but Plan B's recovery path uses `generateLink({type:'recovery'})` which doesn't trigger that limit, so Plan B is partially functional even without Custom SMTP.
- Apply migrations in this order on Supabase before push: `20260514_application_errors.sql` (Plan D, if not yet applied) → `20260515_password_reset_requests.sql` (Plan B).
