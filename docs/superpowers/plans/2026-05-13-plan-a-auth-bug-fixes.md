# Plan A — Auth Bug Fixes Implementation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the two production bugs blocking invite reliability: (1) test-company checkbox is visible to non-admin/QA users; (2) invite email is silently skipped when the target email has an existing profile row, forcing operators into the "delete and recreate" loop that triggers Supabase's email rate limit.

**Architecture:** Replace `ensureUserProfile`'s profile-existence check with `auth.users.last_sign_in_at` discrimination. Adds a minimal `authEmails.js` (just `sendInviteEmail`) so the re-invite path can use `generateLink({ type: 'invite' })` and ship its own email via Resend, bypassing Supabase's `inviteUserByEmail` "user already exists" failure mode. Frontend gates the test-mode checkbox by `platformRole`. Backend allows QA to create test companies, keeps real-company creation admin-only.

**Tech Stack:** Node 20+, Express, Supabase JS Admin SDK, Resend REST API, Vitest-style assertions via Node's native test runner (`node --test`).

**References:**
- Spec: [docs/superpowers/specs/2026-05-13-auth-security-hardening-design.md](../specs/2026-05-13-auth-security-hardening-design.md) sections 5.1 (A.1, A.2, A.3) and 5.2 (B.3, just `sendInviteEmail`)
- Production case: spec section 1.1 (contact@avinovapower.com timeline)

---

## Pre-deploy: Supabase Custom SMTP + invite TTL (manual, NO CODE)

> **DO THIS BEFORE deploying Task 5 to production.** Without it, the re-invite path will still hit Supabase's native SMTP rate limit, and the link will still expire in ~1h.

- [ ] **Step P1: Configure Custom SMTP in Supabase Dashboard**

In Supabase Studio for project `gmrlhhszrdahcxyoywvt`:
1. Navigate to **Authentication → Email Settings → SMTP Settings**
2. Toggle **"Enable Custom SMTP"** ON
3. Fill in:
   - **Host:** `smtp.resend.com`
   - **Port:** `465`
   - **Username:** `resend`
   - **Password:** value of `RESEND_API_KEY` from VPS `.env` (run `ssh deploy@199.192.22.74 'grep RESEND_API_KEY /var/www/webrief/backend/.env'` to retrieve)
   - **Sender email:** `no-reply@webrief.app` (or current `COMMENTS_EMAIL_FROM` value)
   - **Sender name:** `WeBrief`
4. Click **Save**

- [ ] **Step P2: Raise OTP expiry to 24h**

In the same **Authentication → Email Settings** page (or **Email Templates → OTP Settings** depending on Supabase UI version):
1. Find **"Email OTP Expiration"** setting (or `email_otp_exp`)
2. Set to `86400` (24 hours in seconds)
3. Click **Save**

- [ ] **Step P3: Verify Resend has `webrief.app` domain configured**

1. Open https://resend.com/domains in browser
2. Confirm `webrief.app` is listed with SPF and DKIM verified (green checkmarks)
3. If not verified, follow Resend's domain verification flow before proceeding

- [ ] **Step P4: Test email delivery**

In Supabase Studio → Authentication → Users → "Invite User":
1. Invite a throwaway test address (e.g., a Gmail alias you control)
2. Within 30 seconds, confirm the email arrives
3. Confirm the email's `Received: from` headers reference Resend, not Supabase native SMTP
4. Click the link, confirm it lands on `https://webrief.app/auth/set-password` and the form loads
5. Delete the test user from Supabase Studio → Authentication → Users when done

If any step fails, do NOT proceed with code deployment. Roll back the SMTP toggle and investigate.

---

## Task 1: Backend allows QA to create test companies

**Files:**
- Modify: [backend/src/routes/companies.js:332-344](../../../backend/src/routes/companies.js)
- Test: `backend/test/companies-create.test.js` (new)

- [ ] **Step 1.1: Write failing test for QA + testMode=true allowed**

Create `backend/test/companies-create.test.js`:

```javascript
import assert from 'node:assert/strict'
import { test } from 'node:test'

// We test only the permission gate logic by extracting it.
// Real route requires Supabase mocks which are heavy; we lift the
// gate into a pure function exported from companies.js (Task 1.3).

import { canCreateCompany } from '../src/routes/companies.js'

test('canCreateCompany: admin can create real or test', () => {
  assert.equal(canCreateCompany({ platformRole: 'admin' }, false), true)
  assert.equal(canCreateCompany({ platformRole: 'admin' }, true), true)
})

test('canCreateCompany: QA can create test only', () => {
  assert.equal(canCreateCompany({ platformRole: 'qa' }, false), false)
  assert.equal(canCreateCompany({ platformRole: 'qa' }, true), true)
})

test('canCreateCompany: user cannot create at all', () => {
  assert.equal(canCreateCompany({ platformRole: 'user' }, false), false)
  assert.equal(canCreateCompany({ platformRole: 'user' }, true), false)
})

test('canCreateCompany: missing user returns false', () => {
  assert.equal(canCreateCompany(null, true), false)
  assert.equal(canCreateCompany(undefined, false), false)
})
```

- [ ] **Step 1.2: Run test to verify it fails**

```bash
cd backend && npm test -- --test-name-pattern="canCreateCompany"
```

Expected: FAIL with `SyntaxError` or `canCreateCompany is not a function` — the export does not exist yet.

- [ ] **Step 1.3: Extract gate and allow QA testMode**

Edit `backend/src/routes/companies.js`. Add the export above the existing `router.post('/', ...)`:

```javascript
export function canCreateCompany(currentUser, testMode) {
  if (!currentUser) return false
  if (currentUser.platformRole === 'admin') return true
  if (currentUser.platformRole === 'qa' && testMode === true) return true
  return false
}
```

Then replace lines 333-335 (the existing admin-only gate) with:

```javascript
router.post('/', async (req, res) => {
  const { name, managerName, managerFullName, managerEmail, testMode = false } = req.body
  const wantsTestMode = Boolean(testMode)

  if (!canCreateCompany(req.currentUser, wantsTestMode)) {
    return res.status(403).json({
      error: wantsTestMode
        ? 'Solo admin o QA pueden crear empresas de prueba'
        : 'Solo admin puede crear empresas',
    })
  }

  const createAsTest = wantsTestMode
```

Then update the line that previously was `const createAsTest = req.currentUser.platformRole === 'admin' && Boolean(testMode)` — it is replaced by the assignment above. Remove the original lines 337-338 (the old `const { name, ... } = req.body` and `const createAsTest = ...` lines) since they are now inside the new block.

- [ ] **Step 1.4: Run test to verify it passes**

```bash
cd backend && npm test -- --test-name-pattern="canCreateCompany"
```

Expected: all 4 cases PASS.

- [ ] **Step 1.5: Commit**

```bash
cd /Users/adrian/GitHub/webbrief
git add backend/src/routes/companies.js backend/test/companies-create.test.js
git commit -m "$(cat <<'EOF'
feat(backend.auth): allow QA to create test companies

Extracts canCreateCompany gate as a pure exported function and
allows platformRole=qa when testMode=true. Real companies remain
admin-only.

Part of v1.1-auth-hardening Plan A (decision D-1).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Frontend gates test-mode checkbox by role

**Files:**
- Modify: [frontend/src/pages/CompaniesPage.jsx:631-638](../../../frontend/src/pages/CompaniesPage.jsx)
- Modify: [frontend/src/lib/roleCapabilities.js](../../../frontend/src/lib/roleCapabilities.js) (add helper)

- [ ] **Step 2.1: Add capability helper**

Edit `frontend/src/lib/roleCapabilities.js`. Add near the other capability helpers (after `canUseSecurityNav`):

```javascript
export function canCreateTestCompany(currentUser) {
  const platformRole = currentUser?.realPlatformRole || currentUser?.platformRole
  return platformRole === 'admin' || platformRole === 'qa'
}
```

- [ ] **Step 2.2: Import helper in CompaniesPage**

Edit `frontend/src/pages/CompaniesPage.jsx`. In the existing import block at the top of the file, find the line that imports from `'../lib/roleCapabilities'` (or add it if missing). Add `canCreateTestCompany` to the named imports.

Example resulting import (adjust to match the actual existing import line):

```javascript
import { canCreateTestCompany /*, other helpers already imported */ } from '../lib/roleCapabilities'
```

If no import from that file exists yet, add this line below the other `from '../lib/...'` imports:

```javascript
import { canCreateTestCompany } from '../lib/roleCapabilities'
```

- [ ] **Step 2.3: Conditionally render the test-mode checkbox**

Edit `frontend/src/pages/CompaniesPage.jsx` around line 631-638. Replace the existing `<label className={styles.checkboxRow}>...</label>` block with:

```jsx
{canCreateTestCompany(currentUser) && (
  <label className={styles.checkboxRow}>
    <input
      type="checkbox"
      checked={testMode}
      onChange={(event) => setTestMode(event.target.checked)}
    />
    <span>Empresa de prueba</span>
  </label>
)}
```

Note: `currentUser` should already be available in this component from `useAuth()`. If it is not, add `const { user: currentUser } = useAuth()` near the existing hooks. Verify by searching for `useAuth` in the file before assuming.

- [ ] **Step 2.4: Manual verification**

```bash
cd /Users/adrian/GitHub/webbrief/frontend && npm run dev
```

Then in the browser:

1. Log in as admin. Open `/companies` → click "Nueva empresa". Confirm checkbox "Empresa de prueba" is **visible**.
2. Log out. Log in as a non-admin/non-QA user (e.g., a manager). Open `/companies` → click "Nueva empresa". Confirm checkbox is **hidden** and the form requires manager fields.
3. (Optional, if a QA user is set up) Log in as QA. Confirm checkbox is **visible**.

Use `preview_screenshot` to capture state if desired.

- [ ] **Step 2.5: Commit**

```bash
cd /Users/adrian/GitHub/webbrief
git add frontend/src/pages/CompaniesPage.jsx frontend/src/lib/roleCapabilities.js
git commit -m "$(cat <<'EOF'
feat(companies): gate test-company checkbox to admin + QA

Adds canCreateTestCompany helper and conditionally renders the
'Empresa de prueba' checkbox in the new-company modal. Non-admin
and non-QA users see only the regular client-company form.

Part of v1.1-auth-hardening Plan A (decision D-1).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Add `findAuthUserByEmail` helper using paginated listUsers (or getUserByEmail when available)

**Files:**
- Modify: [backend/src/lib/users.js](../../../backend/src/lib/users.js)
- Test: `backend/test/users-find-by-email.test.js` (new)

> **Why:** Current code uses `admin.listUsers({ perPage: 1000 })` which silently fails for >1000 users. Replace with paginated lookup. The SDK does not have `getUserByEmail` in the Supabase JS v2 client used by this project (verified during planning); we paginate until found.

- [ ] **Step 3.1: Write failing test**

Create `backend/test/users-find-by-email.test.js`:

```javascript
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { findAuthUserByEmailPaginated } from '../src/lib/users.js'

function makeMockClient({ pages }) {
  let calls = 0
  return {
    auth: {
      admin: {
        async listUsers({ page, perPage }) {
          calls += 1
          const idx = (page - 1)
          if (idx >= pages.length) return { data: { users: [] }, error: null }
          return { data: { users: pages[idx] }, error: null }
        },
      },
    },
    _getCalls: () => calls,
  }
}

test('findAuthUserByEmailPaginated: finds in first page', async () => {
  const client = makeMockClient({
    pages: [[
      { id: 'u1', email: 'foo@example.com' },
      { id: 'u2', email: 'bar@example.com' },
    ]],
  })
  const result = await findAuthUserByEmailPaginated(client, 'bar@example.com')
  assert.equal(result.id, 'u2')
  assert.equal(client._getCalls(), 1)
})

test('findAuthUserByEmailPaginated: paginates and finds on page 3', async () => {
  const page1 = Array.from({ length: 200 }, (_, i) => ({ id: `p1u${i}`, email: `p1u${i}@x.com` }))
  const page2 = Array.from({ length: 200 }, (_, i) => ({ id: `p2u${i}`, email: `p2u${i}@x.com` }))
  const page3 = [{ id: 'target', email: 'WANTED@example.com' }]
  const client = makeMockClient({ pages: [page1, page2, page3] })

  const result = await findAuthUserByEmailPaginated(client, 'wanted@example.com')
  assert.equal(result.id, 'target')
  assert.equal(client._getCalls(), 3)
})

test('findAuthUserByEmailPaginated: returns null when not found', async () => {
  const client = makeMockClient({
    pages: [[{ id: 'u1', email: 'other@example.com' }]],
  })
  const result = await findAuthUserByEmailPaginated(client, 'missing@example.com')
  assert.equal(result, null)
})

test('findAuthUserByEmailPaginated: handles empty pages', async () => {
  const client = makeMockClient({ pages: [] })
  const result = await findAuthUserByEmailPaginated(client, 'any@example.com')
  assert.equal(result, null)
})

test('findAuthUserByEmailPaginated: matches case-insensitively', async () => {
  const client = makeMockClient({
    pages: [[{ id: 'u1', email: 'MixedCase@Example.COM' }]],
  })
  const result = await findAuthUserByEmailPaginated(client, 'mixedcase@example.com')
  assert.equal(result.id, 'u1')
})
```

- [ ] **Step 3.2: Run test to verify it fails**

```bash
cd backend && npm test -- --test-name-pattern="findAuthUserByEmailPaginated"
```

Expected: FAIL with `findAuthUserByEmailPaginated is not a function`.

- [ ] **Step 3.3: Implement paginated helper**

Edit `backend/src/lib/users.js`. **Replace** the current `findAuthUserByEmail` function (lines 12-21) with a new exported version that accepts a client argument for testability:

```javascript
const AUTH_USERS_PAGE_SIZE = 200
const AUTH_USERS_MAX_PAGES = 100 // 20k user cap; raise if needed

export async function findAuthUserByEmailPaginated(client, email) {
  const normalized = normalizeEmail(email)
  if (!normalized) return null

  for (let page = 1; page <= AUTH_USERS_MAX_PAGES; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({
      page,
      perPage: AUTH_USERS_PAGE_SIZE,
    })
    if (error) throw error

    const users = data?.users || []
    const match = users.find((user) => normalizeEmail(user.email) === normalized)
    if (match) return match
    if (users.length < AUTH_USERS_PAGE_SIZE) return null
  }

  return null
}

// Convenience wrapper bound to supabaseAdmin (preserves existing import sites).
async function findAuthUserByEmail(email) {
  return findAuthUserByEmailPaginated(supabaseAdmin, email)
}
```

Note: keep the existing internal `findAuthUserByEmail` reference in `ensureUserProfile` working — the convenience wrapper above preserves the same signature.

- [ ] **Step 3.4: Run tests to verify all 5 pass**

```bash
cd backend && npm test -- --test-name-pattern="findAuthUserByEmailPaginated"
```

Expected: all 5 PASS.

- [ ] **Step 3.5: Commit**

```bash
cd /Users/adrian/GitHub/webbrief
git add backend/src/lib/users.js backend/test/users-find-by-email.test.js
git commit -m "$(cat <<'EOF'
refactor(backend.auth): paginate findAuthUserByEmail and inject client

Replaces single-page listUsers({ perPage: 1000 }) with paginated
findAuthUserByEmailPaginated that takes the client as argument for
testability. Caps lookup at 20k users (100 pages of 200). The
existing findAuthUserByEmail wrapper stays for callers.

Part of v1.1-auth-hardening Plan A.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Minimal `authEmails.sendInviteEmail` (Resend)

**Files:**
- Create: `backend/src/lib/authEmails.js`
- Test: `backend/test/auth-emails.test.js` (new)

- [ ] **Step 4.1: Write failing test**

Create `backend/test/auth-emails.test.js`:

```javascript
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildInviteEmailPayload } from '../src/lib/authEmails.js'

test('buildInviteEmailPayload: basic shape', () => {
  const payload = buildInviteEmailPayload({
    to: 'user@example.com',
    fullName: 'Ana Pérez',
    actionLink: 'https://webrief.app/auth/set-password#access_token=abc',
    companyName: 'Avinova',
  })

  assert.equal(payload.to, 'user@example.com')
  assert.match(payload.subject, /Avinova/)
  assert.match(payload.subject, /WeBrief/)
  assert.match(payload.html, /Ana Pérez/)
  assert.match(payload.html, /https:\/\/webrief\.app\/auth\/set-password/)
  assert.match(payload.text, /Ana Pérez/)
})

test('buildInviteEmailPayload: omits company name when not provided', () => {
  const payload = buildInviteEmailPayload({
    to: 'user@example.com',
    fullName: 'Bob',
    actionLink: 'https://webrief.app/auth/set-password',
  })

  assert.equal(payload.to, 'user@example.com')
  assert.match(payload.subject, /WeBrief/)
  assert.doesNotMatch(payload.html, /undefined/)
  assert.doesNotMatch(payload.text, /undefined/)
})

test('buildInviteEmailPayload: handles missing fullName gracefully', () => {
  const payload = buildInviteEmailPayload({
    to: 'user@example.com',
    actionLink: 'https://webrief.app/auth/set-password',
  })

  assert.match(payload.html, /Hola/)
  assert.doesNotMatch(payload.html, /undefined/)
})
```

- [ ] **Step 4.2: Run test to verify it fails**

```bash
cd backend && npm test -- --test-name-pattern="buildInviteEmailPayload"
```

Expected: FAIL with `Cannot find module '../src/lib/authEmails.js'`.

- [ ] **Step 4.3: Implement authEmails.js**

Create `backend/src/lib/authEmails.js`:

```javascript
// Auth-flow emails sent directly via Resend REST.
//
// Used when we need to send an invite/recovery link from outside
// Supabase's native inviteUserByEmail flow — i.e., when the auth
// user already exists and we use admin.generateLink() to mint a
// new link without auto-emailing.
//
// Env:
//   RESEND_API_KEY      — required for real sends; functions are
//                         no-ops if missing (logs warning)
//   AUTH_EMAIL_FROM     — e.g. "WeBrief <no-reply@webrief.app>"
//                         falls back to COMMENTS_EMAIL_FROM, then
//                         a hard-coded default.

const RESEND_ENDPOINT = 'https://api.resend.com/emails'

function getSender() {
  return (
    process.env.AUTH_EMAIL_FROM
    || process.env.COMMENTS_EMAIL_FROM
    || 'WeBrief <no-reply@webrief.app>'
  )
}

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function buildInviteEmailPayload({ to, fullName, actionLink, companyName }) {
  const safeName = fullName?.trim() || ''
  const greeting = safeName ? `Hola ${safeName}` : 'Hola'
  const companyClause = companyName ? ` en ${companyName}` : ''
  const subject = companyName
    ? `Te invitaron a WeBrief${companyClause}`
    : `Te invitaron a WeBrief`

  const html = `
    <!doctype html>
    <html lang="es"><head><meta charset="utf-8"></head><body style="font-family:system-ui,-apple-system,sans-serif;color:#222;max-width:560px;margin:0 auto;padding:24px">
      <h1 style="font-size:20px;margin:0 0 16px">${escapeHtml(greeting)}</h1>
      <p style="font-size:15px;line-height:1.5;margin:0 0 16px">
        Recibiste una invitación para acceder a WeBrief${escapeHtml(companyClause)}.
        Hacé clic en el botón para crear tu contraseña y entrar.
      </p>
      <p style="margin:24px 0">
        <a href="${escapeHtml(actionLink)}"
           style="display:inline-block;background:#0f172a;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600">
          Crear mi contraseña
        </a>
      </p>
      <p style="font-size:13px;color:#666;margin:24px 0 0">
        Si el botón no funciona, copiá esta dirección en tu navegador:<br>
        <span style="word-break:break-all">${escapeHtml(actionLink)}</span>
      </p>
      <p style="font-size:12px;color:#888;margin:24px 0 0">
        Si no esperabas esta invitación, ignorá este mensaje.
      </p>
    </body></html>
  `.trim()

  const text = [
    greeting + '.',
    '',
    `Recibiste una invitación para acceder a WeBrief${companyClause}.`,
    'Abrí el siguiente enlace para crear tu contraseña:',
    actionLink,
    '',
    'Si no esperabas esta invitación, ignorá este mensaje.',
  ].join('\n')

  return { to, subject, html, text, from: getSender() }
}

export async function sendInviteEmail(args) {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.warn('[authEmails] RESEND_API_KEY missing; skipping invite email send')
    return { sent: false, reason: 'no_api_key' }
  }

  const payload = buildInviteEmailPayload(args)

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
      console.warn('[authEmails] Resend send failed', response.status, errorBody)
      return { sent: false, reason: `resend_${response.status}`, errorBody }
    }

    const data = await response.json().catch(() => null)
    return { sent: true, id: data?.id || null }
  } catch (error) {
    console.warn('[authEmails] Resend send threw', error?.message)
    return { sent: false, reason: 'exception', errorMessage: error?.message }
  }
}
```

- [ ] **Step 4.4: Run tests to verify all 3 pass**

```bash
cd backend && npm test -- --test-name-pattern="buildInviteEmailPayload"
```

Expected: all 3 PASS.

- [ ] **Step 4.5: Add `AUTH_EMAIL_FROM` env doc**

Edit [docs/WEBRIEF_OPERATIONS_GUIDE.md](../../WEBRIEF_OPERATIONS_GUIDE.md). Find the env-vars section (search for `RESEND_API_KEY` or `COMMENTS_EMAIL_FROM`). Add a row/line:

```
AUTH_EMAIL_FROM    Optional. Sender for invite/recovery emails sent via Resend.
                   Falls back to COMMENTS_EMAIL_FROM if unset.
                   Example: "WeBrief <no-reply@webrief.app>"
```

If the operations guide does not have an env-var section, add a short paragraph under the existing Resend-related content.

- [ ] **Step 4.6: Commit**

```bash
cd /Users/adrian/GitHub/webbrief
git add backend/src/lib/authEmails.js backend/test/auth-emails.test.js docs/WEBRIEF_OPERATIONS_GUIDE.md
git commit -m "$(cat <<'EOF'
feat(backend.auth): add authEmails.sendInviteEmail (Resend)

Minimal email sender for auth flows when Supabase's native invite
is not usable (e.g., re-inviting an existing auth user via
generateLink). Pure-function buildInviteEmailPayload separated for
testability. Gated by RESEND_API_KEY; no-op if missing.

Part of v1.1-auth-hardening Plan A (precursor to D-3/B fix).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Refactor `ensureUserProfile` to discriminate by `last_sign_in_at`

**Files:**
- Modify: [backend/src/lib/users.js:50-117](../../../backend/src/lib/users.js)
- Test: `backend/test/users-ensure-profile.test.js` (new)

- [ ] **Step 5.1: Write failing tests for all 3 cases**

Create `backend/test/users-ensure-profile.test.js`:

```javascript
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { decideEnsureProfileAction } from '../src/lib/users.js'

test('decideEnsureProfileAction: case A — no auth user exists', () => {
  const result = decideEnsureProfileAction({ authUser: null, profile: null })
  assert.equal(result.action, 'invite')
})

test('decideEnsureProfileAction: case A — no auth user but stale profile exists', () => {
  // Edge case: profile orphan (auth user was deleted but profile remained).
  // Treat as Case A — invite fresh.
  const result = decideEnsureProfileAction({
    authUser: null,
    profile: { id: 'stale', email: 'x@y.com' },
  })
  assert.equal(result.action, 'invite')
})

test('decideEnsureProfileAction: case B — auth user exists, never signed in', () => {
  const result = decideEnsureProfileAction({
    authUser: { id: 'u1', email: 'x@y.com', last_sign_in_at: null },
    profile: { id: 'u1', email: 'x@y.com' },
  })
  assert.equal(result.action, 'reinvite')
  assert.equal(result.userId, 'u1')
})

test('decideEnsureProfileAction: case B — auth user exists, never signed in, no profile yet', () => {
  // Edge case: auth user was created but profile upsert failed last time.
  const result = decideEnsureProfileAction({
    authUser: { id: 'u1', email: 'x@y.com', last_sign_in_at: null },
    profile: null,
  })
  assert.equal(result.action, 'reinvite')
  assert.equal(result.userId, 'u1')
})

test('decideEnsureProfileAction: case C/D — auth user signed in at least once', () => {
  const result = decideEnsureProfileAction({
    authUser: { id: 'u1', email: 'x@y.com', last_sign_in_at: '2026-04-01T00:00:00Z' },
    profile: { id: 'u1', email: 'x@y.com' },
  })
  assert.equal(result.action, 'assign_existing')
  assert.equal(result.userId, 'u1')
})
```

- [ ] **Step 5.2: Run tests to verify they fail**

```bash
cd backend && npm test -- --test-name-pattern="decideEnsureProfileAction"
```

Expected: FAIL with `decideEnsureProfileAction is not a function`.

- [ ] **Step 5.3: Refactor users.js: extract decision + new ensureUserProfile**

Edit `backend/src/lib/users.js`. **Replace** the body of `ensureUserProfile` (lines 50-117) with the following. Keep the existing `getSetPasswordRedirectUrl`, `normalizeEmail`, and `updateExistingProfile` helpers. Keep the `findAuthUserByEmailPaginated` and `findAuthUserByEmail` from Task 3.

Add the imports at the top of the file (after the existing `import { supabaseAdmin }` line):

```javascript
import { sendInviteEmail } from './authEmails.js'
```

Add the pure decision function (export it) above `ensureUserProfile`:

```javascript
export function decideEnsureProfileAction({ authUser, profile }) {
  if (!authUser) {
    return { action: 'invite', userId: null }
  }
  if (!authUser.last_sign_in_at) {
    return { action: 'reinvite', userId: authUser.id }
  }
  return { action: 'assign_existing', userId: authUser.id }
}
```

Then **replace** `ensureUserProfile` with this new version:

```javascript
export async function ensureUserProfile({ email, fullName, platformRole = 'user' }) {
  const normalizedEmail = normalizeEmail(email)
  if (!normalizedEmail) {
    throw new Error('email es requerido')
  }
  const normalizedPlatformRole = normalizePlatformRole(platformRole)
  const timestamp = new Date().toISOString()

  // Look up both sources of truth in parallel.
  const [authUser, existingProfileResult] = await Promise.all([
    findAuthUserByEmail(normalizedEmail),
    supabaseAdmin
      .from('profiles')
      .select('id, email, full_name, platform_role')
      .eq('email', normalizedEmail)
      .maybeSingle(),
  ])

  if (existingProfileResult.error) throw existingProfileResult.error
  const existingProfile = existingProfileResult.data || null

  const decision = decideEnsureProfileAction({ authUser, profile: existingProfile })
  const redirectTo = getSetPasswordRedirectUrl()

  // -------- Case A: fresh invite --------
  if (decision.action === 'invite') {
    const { data, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(normalizedEmail, {
      redirectTo,
      data: { full_name: fullName || '' },
    })

    if (inviteError || !data?.user?.id) {
      // Race: another invite landed between our lookups and now. Re-resolve once.
      const fallback = await findAuthUserByEmail(normalizedEmail)
      if (!fallback?.id) {
        throw inviteError || new Error('No se pudo crear el usuario')
      }
      // Treat as Case B (reinvite) on the retry path.
      return await handleReinvite(fallback, normalizedEmail, fullName, normalizedPlatformRole, redirectTo, timestamp)
    }

    await upsertProfileRow(data.user.id, normalizedEmail, fullName, data.user, normalizedPlatformRole, timestamp)

    return {
      userId: data.user.id,
      email: normalizedEmail,
      fullName: fullName || data.user.user_metadata?.full_name || '',
      platformRole: normalizedPlatformRole,
      action: 'invited',
      inviteSent: true,
      existingUser: false,
    }
  }

  // -------- Case B: reinvite (auth user exists, never activated) --------
  if (decision.action === 'reinvite') {
    return await handleReinvite(authUser, normalizedEmail, fullName, normalizedPlatformRole, redirectTo, timestamp)
  }

  // -------- Case C/D: assign existing (auth user active) --------
  if (existingProfile) {
    const updatedProfile = await updateExistingProfile(existingProfile, fullName, normalizedPlatformRole)
    return {
      userId: updatedProfile.id,
      email: updatedProfile.email,
      fullName: updatedProfile.full_name || '',
      platformRole: updatedProfile.platform_role,
      action: 'assigned_existing',
      inviteSent: false,
      existingUser: true,
    }
  }

  // Active auth user but no profile row — upsert one.
  await upsertProfileRow(authUser.id, normalizedEmail, fullName, authUser, normalizedPlatformRole, timestamp)
  return {
    userId: authUser.id,
    email: normalizedEmail,
    fullName: fullName || authUser.user_metadata?.full_name || '',
    platformRole: normalizedPlatformRole,
    action: 'assigned_existing',
    inviteSent: false,
    existingUser: true,
  }
}

// Helpers below

async function handleReinvite(authUser, normalizedEmail, fullName, normalizedPlatformRole, redirectTo, timestamp) {
  const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
    type: 'invite',
    email: normalizedEmail,
    options: { redirectTo },
  })

  if (linkError) throw linkError
  const actionLink = linkData?.properties?.action_link
  if (!actionLink) throw new Error('No se pudo regenerar el link de invitación')

  await sendInviteEmail({
    to: normalizedEmail,
    fullName,
    actionLink,
  })

  await upsertProfileRow(authUser.id, normalizedEmail, fullName, authUser, normalizedPlatformRole, timestamp)

  return {
    userId: authUser.id,
    email: normalizedEmail,
    fullName: fullName || authUser.user_metadata?.full_name || '',
    platformRole: normalizedPlatformRole,
    action: 'reinvited',
    inviteSent: true,
    existingUser: false,
  }
}

async function upsertProfileRow(userId, normalizedEmail, fullName, authUser, normalizedPlatformRole, timestamp) {
  // Never downgrade an existing admin profile. We use upsert with onConflict on id.
  const { error } = await supabaseAdmin
    .from('profiles')
    .upsert(
      {
        id: userId,
        email: normalizedEmail,
        full_name: fullName || authUser?.user_metadata?.full_name || '',
        platform_role: normalizedPlatformRole,
        updated_at: timestamp,
      },
      { onConflict: 'id' }
    )

  if (error) throw error
}
```

Make sure `normalizePlatformRole` is imported at the top of the file — it should already be (`import { normalizePlatformRole } from '../../../shared/userRoles.js'`).

- [ ] **Step 5.4: Run tests to verify decideEnsureProfileAction tests pass**

```bash
cd backend && npm test -- --test-name-pattern="decideEnsureProfileAction"
```

Expected: all 5 PASS.

- [ ] **Step 5.5: Run full backend test suite**

```bash
cd backend && npm test
```

Expected: All tests pass, no regression. If `comments.test.js` or `security.test.js` fail because of an import-side-effect from your changes, fix imports.

- [ ] **Step 5.6: Verify `inviteUserToCompany` still works with new return shape**

Read [backend/src/lib/users.js](../../../backend/src/lib/users.js) lines 136-149 (`inviteUserToCompany`). Confirm it destructures from `ensureUserProfile`'s return as:

```javascript
const profile = await ensureUserProfile({ email, fullName, platformRole })
```

And later returns:

```javascript
return {
  id: profile.userId,
  email: profile.email,
  fullName: profile.fullName,
  role,
  companyId,
  inviteSent: profile.inviteSent,
  existingUser: profile.existingUser,
}
```

Update it to also propagate `action`:

```javascript
return {
  id: profile.userId,
  email: profile.email,
  fullName: profile.fullName,
  role,
  companyId,
  inviteSent: profile.inviteSent,
  existingUser: profile.existingUser,
  action: profile.action, // 'invited' | 'reinvited' | 'assigned_existing'
}
```

- [ ] **Step 5.7: Update callers to log granular events**

Create `shared/inviteActions.js` (new file) so all three callers reference the same mapping:

```javascript
// Maps ensureUserProfile's decision action to the security_events action name.
export const INVITE_ACTION_TO_EVENT = {
  invited: 'invite_sent',
  reinvited: 'invite_resent',
  assigned_existing: 'invite_skipped_existing_user',
}

export function toInviteSecurityAction(decisionAction) {
  return INVITE_ACTION_TO_EVENT[decisionAction] || 'invite_sent'
}
```

Edit [backend/src/routes/auth.js](../../../backend/src/routes/auth.js). Add import at top:

```javascript
import { toInviteSecurityAction } from '../../../shared/inviteActions.js'
```

In `POST /invite-user`, replace the existing `logSecurityEvent` call (lines 49-56) with:

```javascript
await logSecurityEvent(req, {
  action: toInviteSecurityAction(invitedUser.action),
  resourceType: 'user',
  resourceId: invitedUser.id,
  companyId: targetCompanyId,
  targetUserId: invitedUser.id,
  metadata: {
    role,
    platformRole: allowedPlatformRole,
    inviteSent: invitedUser.inviteSent,
    decisionAction: invitedUser.action,
    via: 'manual_invite',
  },
})
```

Apply the analogous change in [backend/src/routes/users.js](../../../backend/src/routes/users.js) `POST /api/users` — there are two `logSecurityEvent` blocks (one for the global-role path at lines ~415-421, one for the company-role path at lines ~445-452). Both should use `toInviteSecurityAction(invitedUser.action)` (or `profile.action` for the global path) and add `via: 'manual_invite'` plus `decisionAction` in metadata. Add the import at the top of users.js as well.

For [backend/src/routes/companies.js](../../../backend/src/routes/companies.js) `POST /api/companies`, the manager flow does NOT currently log a security event. Add import at top:

```javascript
import { toInviteSecurityAction } from '../../../shared/inviteActions.js'
```

Then add a log call after the `inviteUserToCompany` call succeeds (after line 411, after `manager = await inviteUserToCompany(...)` inside the `if (!createAsTest)` block):

```javascript
await logSecurityEvent(req, {
  action: toInviteSecurityAction(manager.action),
  resourceType: 'user',
  resourceId: manager.id,
  companyId: company.id,
  targetUserId: manager.id,
  metadata: {
    role: 'manager',
    inviteSent: manager.inviteSent,
    decisionAction: manager.action,
    via: 'company_create',
  },
})
```

`logSecurityEvent` should already be imported in companies.js (verified during planning).

- [ ] **Step 5.8: Smoke test on local dev**

```bash
cd /Users/adrian/GitHub/webbrief/backend && npm run dev
```

In another terminal:

```bash
cd /Users/adrian/GitHub/webbrief/frontend && npm run dev
```

In browser (incognito recommended to avoid Supabase session caching):

1. Log in as admin@webrief.app.
2. Open `/companies` → click "Nueva empresa".
3. Create company "Test A1" with manager email `qa-test-fresh-<timestamp>@example.com` (use a Mailinator/Gmail-alias you control). This should be **Case A**: new auth user + invite email sent by Supabase natively.
4. Verify in Supabase Studio → Auth → Users that the user appears with `invited_at` set.
5. Without clicking the invite link, go back to WeBrief → `/companies` → "Nueva empresa" again. Use the SAME email but create company "Test B1" with that as manager email. This should be **Case B**: re-invite via `generateLink` + email sent via Resend.
6. Check the inbox for the new email. Confirm it has different headers (Resend sender) than the first.
7. Click the new link, complete set-password.
8. Go back to WeBrief → `/companies` → "Nueva empresa" again with the SAME email, company "Test C1". This should be **Case C/D**: silent assign, no email.
9. Verify in Supabase Studio that no new invite email was sent.
10. Check `security_events` table for 3 rows: `invite_sent`, `invite_resent`, `invite_skipped_existing_user`, each with correct `metadata.decisionAction`.

If any step fails, **STOP and debug** before committing. Check `application_errors` won't exist yet (Plan D), so failures will surface as backend console logs and 500 responses.

- [ ] **Step 5.9: Clean up test data**

In Supabase Studio:
1. Delete the 3 test companies (Test A1, Test B1, Test C1) and their auth user.
2. Verify `security_events` rows for the test remain (we keep them for audit; do not delete).

- [ ] **Step 5.10: Commit**

```bash
cd /Users/adrian/GitHub/webbrief
git add backend/src/lib/users.js backend/src/routes/auth.js backend/src/routes/users.js backend/src/routes/companies.js backend/test/users-ensure-profile.test.js shared/inviteActions.js
git commit -m "$(cat <<'EOF'
fix(backend.auth): re-invite pending users instead of silently skipping

ensureUserProfile now discriminates by auth.users.last_sign_in_at
instead of profile-row existence. Three cases:

  - Case A (no auth user): inviteUserByEmail as before.
  - Case B (auth user, never activated): generateLink({ type:
    'invite' }) and send email via Resend authEmails.sendInviteEmail.
    Fixes the bug where re-inviting a pending user silently no-op'd
    and forced operators into the delete-and-recreate loop that
    triggers Supabase's over_email_send_rate_limit.
  - Case C/D (auth user active): assign membership/profile only, no
    invite. Returns action='assigned_existing' so callers can trigger
    a 'manager assigned to new company' notification in Plan C.

Granular security events: invite_sent, invite_resent,
invite_skipped_existing_user. POST /api/companies now logs the
manager invite outcome (previously silent).

Part of v1.1-auth-hardening Plan A (decisions D-2, D-3, D-4 and
section E.2).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Document operational deployment steps

**Files:**
- Modify: [docs/WEBRIEF_OPERATIONS_GUIDE.md](../../WEBRIEF_OPERATIONS_GUIDE.md)

- [ ] **Step 6.1: Add a "v1.1 Auth Hardening — Deploy" section**

Append to the bottom of `docs/WEBRIEF_OPERATIONS_GUIDE.md`:

```markdown
## v1.1 Auth Hardening Deploy (Plan A)

Before pushing Plan A code to production:

1. Custom SMTP must be configured in Supabase Dashboard (one-time).
   See spec §5.1.A.3 for steps.
2. `email_otp_exp` must be raised to `86400` (24h).
3. Test invite delivery via Supabase Studio's "Invite User" UI.

After pushing Plan A:

1. SSH into VPS and verify `RESEND_API_KEY` is present in
   `/var/www/webrief/backend/.env`.
2. Optionally set `AUTH_EMAIL_FROM` to override the sender for
   invite/recovery emails. Defaults to `COMMENTS_EMAIL_FROM` or
   `WeBrief <no-reply@webrief.app>`.
3. Restart PM2: `pm2 restart webrief-backend`.
4. Smoke test from production:
   - Create a test company with a Gmail-alias manager email.
   - Confirm invite email arrives within 30s.
   - Without clicking the link, create another company with the
     same manager email. Confirm a SECOND email arrives (re-invite
     via Resend).
   - Click the second link, set password, log in.
   - Create a third company with the same email. Confirm NO email
     is sent (case C/D — silent assign).
   - In `/security` events page, confirm 3 rows: `invite_sent`,
     `invite_resent`, `invite_skipped_existing_user`.
5. Clean up test data in Supabase Studio.
```

- [ ] **Step 6.2: Commit**

```bash
cd /Users/adrian/GitHub/webbrief
git add docs/WEBRIEF_OPERATIONS_GUIDE.md
git commit -m "$(cat <<'EOF'
docs(ops): add v1.1 auth-hardening Plan A deploy steps

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Update project context files

**Files:**
- Modify: [CONTEXT.min.md](../../../CONTEXT.min.md)

- [ ] **Step 7.1: Add Plan A changes to CONTEXT.min.md**

The CONTEXT files are long. Read the existing structure first:

```bash
grep -n "## " /Users/adrian/GitHub/webbrief/CONTEXT.min.md | head -20
```

Add a one-line entry at the top of "Recent Fixes" (or equivalent latest-changes section) summarizing Plan A:

```
- v1.1 Plan A shipped (2026-05-XX): testMode checkbox gated to admin+QA via canCreateTestCompany helper; ensureUserProfile now discriminates by auth.users.last_sign_in_at → invite | reinvite | assign_existing actions; new authEmails.sendInviteEmail (Resend) for the reinvite path; granular security_events actions invite_sent | invite_resent | invite_skipped_existing_user; POST /api/companies now logs the manager invite outcome. Resolves over_email_send_rate_limit cascade from session 11 (contact@avinovapower.com case).
```

Also update the `target=backend.auth` entry in "Touch / Keep / Watch" with the new invariants:

```
- target=backend.auth
  - keep: login contract unless requested; ensureUserProfile case-by-case behavior (A/B/C/D); authEmails.sendInviteEmail gated by RESEND_API_KEY
  - watch: frontend login flow; granular security_events action names; backend assumes Supabase Custom SMTP (Resend) is configured — without it, all email-auth flows hit Supabase's native ~3-4/h rate limit
```

- [ ] **Step 7.2: Commit**

```bash
cd /Users/adrian/GitHub/webbrief
git add CONTEXT.min.md
git commit -m "$(cat <<'EOF'
docs(context): record v1.1 Plan A — auth bug fixes

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Post-deployment verification (run on production)

After deploying the merged Plan A code to `main` and pulling on the VPS:

- [ ] **PV-1: Resend domain status check**

In Resend dashboard, confirm `webrief.app` is verified and the API key has send permissions.

- [ ] **PV-2: Re-test the contact@avinovapower.com class of bug**

In production:

1. Open `/users`. Find contact@avinovapower.com (already exists from session 11 testing).
2. Confirm the user has `last_sign_in_at = null` in Supabase Studio (they have not activated yet).
3. From `/companies`, create a temporary new test company "PV-Test" with `contact@avinovapower.com` as manager email.
4. Verify in Supabase Auth logs (via MCP `get_logs service:auth`) that:
   - `POST /generateLink` succeeded (not `POST /invite`)
   - No `over_email_send_rate_limit` errors
5. Check Resend dashboard logs: the email was sent within seconds.
6. Verify `security_events` contains a row with `action = 'invite_resent'` and `actor_email = admin@webrief.app`.
7. Delete "PV-Test" company from `/companies`. Confirm contact@avinovapower.com still exists with the same auth user ID (not deleted).

- [ ] **PV-3: Confirm no rate-limit triggered**

Repeat PV-2 four more times in quick succession (5 re-invites total) using the same email. With Custom SMTP + Resend, this should succeed every time — Resend's free plan is 100/day. If any retry fails with `over_email_send_rate_limit`, the SMTP config did not take effect; investigate Supabase Dashboard.

---

## Plan A self-review (run after writing all tasks)

Performed inline. Findings:

1. **Spec coverage:** A.1 (testMode gate) → Tasks 1-2. A.2 (ensureUserProfile refactor) → Tasks 3-5. A.3 (Custom SMTP config) → Pre-deploy steps. Granular security events from E.2 partial scope (invite_sent/resent/skipped) → Task 5.7. ✓
2. **Placeholder scan:** No `TODO`/`TBD` in steps. Date stamps for context commits are `2026-05-XX` intentionally — the implementor stamps it. ✓
3. **Type consistency:** `action` enum values are consistent: `'invited' | 'reinvited' | 'assigned_existing'` returned by `ensureUserProfile`, mapped to `'invite_sent' | 'invite_resent' | 'invite_skipped_existing_user'` for `security_events.action`. The mapping is duplicated in 3 caller files (auth.js, users.js, companies.js) — kept inline rather than extracted to keep the diff minimal. If preferred, the implementor can extract to `shared/inviteActions.js` during Task 5.7.
4. **Out-of-plan items intentionally deferred:** `password_reset_requests` table (Plan B), `application_errors` table (Plan D), `track-invite-accepted` endpoint (Plan E), `/security/errors` view (Plan D), manager-assigned email/notification on case C/D (Plan C). The current Plan A leaves case C/D silent (matches current production behavior).

---

## What this plan does NOT do (covered by Plans B-E)

- "Enviar acceso" button in Users page (Plan B)
- Reset password endpoint with 1h server-side TTL (Plan B)
- Manager-assigned-to-new-company email + notification (Plan C)
- `application_errors` table + `callSupabaseAuth` wrapper + `/security/errors` view (Plan D)
- Invite-accepted tracking, rate-limit-blocked logging, "Bloqueos activos" view (Plan E)
