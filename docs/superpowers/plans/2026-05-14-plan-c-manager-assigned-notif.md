# Plan C — Manager Assigned Notification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When an existing active user is added as `manager` to a company (via company creation or manual invite), fire an in-app notification + Resend email so they discover it without inspecting their account.

**Architecture:** Wire a new `notifyManagerAssigned` helper into `inviteUserToCompany` (the single chokepoint that all 3 invite endpoints — `POST /api/companies`, `POST /api/auth/invite-user`, `POST /api/users` — funnel through). Trigger condition: `action === 'assigned_existing' && role === 'manager'`. The helper inserts a row into the existing `notifications` table and calls `authEmails.sendManagerAssignedEmail` best-effort. Failures log to `application_errors` (Plan D wrapper) and never throw — membership creation is the source of truth, not the notification.

**Tech Stack:** Node 20, Express 4, Supabase (existing `notifications` + `companies` tables — no migration), React 18 (no UI changes; existing bell-icon notification dropdown already polls `notifications` for the target user), Resend REST.

---

## Locked design decisions

| Decision | Resolution |
|---|---|
| **DEC-1** Trigger condition | `action === 'assigned_existing' && role === 'manager'`. Fresh invite emails already cover Case A/B. Editor/etc roles don't trigger (manager is the privileged role that warrants a heads-up). |
| **DEC-2** Failure mode | Best-effort. Both notif insert AND email send wrapped so failures log to `application_errors` (Plan D) and never propagate. Membership row is the source of truth. |
| **DEC-3** URL in email + notif metadata | `${FRONTEND_URL}/companies/{companyId}` — matches the existing `companies/:companyId` frontend route. |
| **DEC-4** `addedBy` source | `req.currentUser` plumbed via existing `req` parameter on `inviteUserToCompany` (added in Plan A). |
| **DEC-5** Single chokepoint location | Inside `inviteUserToCompany` (lib/users.js). All 3 invite endpoints call this function → fires automatically for all paths without per-endpoint wiring. |
| **DEC-6** Email subject + body language | Spanish, matches existing `sendInviteEmail` brand tone. |
| **DEC-7** Notification event_type | `'company_membership_added'` (matches spec §C.2; consistent with existing event_type strings). |
| **DEC-8** Idempotency | None enforced server-side. If `inviteUserToCompany` is called twice for the same (target, company), 2 notifications fire. Acceptable trade-off (no concrete deduplication policy in scope). |

---

## File Structure

**Create:**
- `backend/src/lib/managerNotifications.js` — `notifyManagerAssigned({ targetUserId, companyId, actor, req })` + pure helpers `buildNotificationRow` and `buildCompanyUrl`
- `backend/test/manager-notifications.test.js` — unit tests for pure helpers
- `backend/test/authEmails-manager-assigned.test.js` — unit tests for `buildManagerAssignedEmailPayload`

**Modify:**
- `backend/src/lib/authEmails.js` — add `buildManagerAssignedEmailPayload` + `sendManagerAssignedEmail`
- `backend/src/lib/users.js` — call `notifyManagerAssigned` inside `inviteUserToCompany` when trigger condition matches

**No schema changes.** Reuses existing `notifications` table (verified: columns `id`, `user_id` FK profiles, `project_id` nullable, `event_type`, `title`, `body`, `read_at`, `metadata`, `created_at`).

---

## Task 1: `sendManagerAssignedEmail` (TDD)

**Files:**
- Modify: `backend/src/lib/authEmails.js`
- Create: `backend/test/authEmails-manager-assigned.test.js`

- [ ] **Step 1.1: Write the failing test**

Create `/Users/adrian/GitHub/webbrief/backend/test/authEmails-manager-assigned.test.js`:

```javascript
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildManagerAssignedEmailPayload } from '../src/lib/authEmails.js'

test('buildManagerAssignedEmailPayload: minimal shape with name + company + url', () => {
  const payload = buildManagerAssignedEmailPayload({
    to: 'manager@example.com',
    fullName: 'Pepa',
    companyName: 'ACME S.A.',
    addedByLabel: 'Adrián',
    companyUrl: 'https://webrief.app/companies/c-123',
  })

  assert.equal(payload.to, 'manager@example.com')
  assert.match(payload.subject, /manager en ACME/i)
  assert.match(payload.html, /Pepa/)
  assert.match(payload.html, /ACME S\.A\./)
  assert.match(payload.html, /Adrián/)
  assert.match(payload.html, /https:\/\/webrief\.app\/companies\/c-123/)
  assert.match(payload.text, /https:\/\/webrief\.app\/companies\/c-123/)
  assert.ok(payload.from, 'from should be set from getSender()')
})

test('buildManagerAssignedEmailPayload: no name fallback', () => {
  const payload = buildManagerAssignedEmailPayload({
    to: 'a@b.c',
    fullName: '',
    companyName: 'X',
    addedByLabel: 'Admin',
    companyUrl: 'https://x/y',
  })
  assert.match(payload.html, /Hola/)
  assert.doesNotMatch(payload.html, /Hola \w/)
})

test('buildManagerAssignedEmailPayload: escapes html in name + company + url', () => {
  const payload = buildManagerAssignedEmailPayload({
    to: 'a@b.c',
    fullName: '<script>x</script>',
    companyName: '<b>Co</b>',
    addedByLabel: '<x>',
    companyUrl: 'https://x/y?q=<a>',
  })
  assert.doesNotMatch(payload.html, /<script>x<\/script>/)
  assert.match(payload.html, /&lt;script&gt;/)
  assert.match(payload.html, /&lt;b&gt;Co&lt;\/b&gt;/)
  assert.match(payload.html, /q=&lt;a&gt;/)
})

test('buildManagerAssignedEmailPayload: addedBy fallback when label is empty', () => {
  const payload = buildManagerAssignedEmailPayload({
    to: 'a@b.c',
    fullName: 'Pepa',
    companyName: 'ACME',
    addedByLabel: '',
    companyUrl: 'https://x/y',
  })
  // Should mention admin/team generically without a name (don't pin exact wording)
  assert.match(payload.text, /agregaron|asignaron|nuevo manager/i)
})
```

- [ ] **Step 1.2: Run failing test**

```bash
cd /Users/adrian/GitHub/webbrief/backend && npm test -- --test-name-pattern 'buildManagerAssignedEmailPayload' 2>&1 | tail -6
```

Expected: failures (function not exported yet).

- [ ] **Step 1.3: Implement `buildManagerAssignedEmailPayload` + `sendManagerAssignedEmail`**

In `/Users/adrian/GitHub/webbrief/backend/src/lib/authEmails.js`, append AFTER `sendResetPasswordEmail` (at end of file):

```javascript
export function buildManagerAssignedEmailPayload({ to, fullName, companyName, addedByLabel, companyUrl }) {
  const safeName = fullName?.trim() || ''
  const greeting = safeName ? `Hola ${safeName}` : 'Hola'
  const safeAddedBy = addedByLabel?.trim() || ''
  const subject = `Te agregaron como manager en ${companyName || 'WeBrief'}`

  const introLine = safeAddedBy
    ? `${safeAddedBy} te asignó como manager en ${companyName}.`
    : `Te agregaron como manager en ${companyName} (nuevo manager asignado).`

  const html = `
    <!doctype html>
    <html lang="es"><head><meta charset="utf-8"></head><body style="font-family:system-ui,-apple-system,sans-serif;color:#222;max-width:560px;margin:0 auto;padding:24px">
      <h1 style="font-size:20px;margin:0 0 16px">${escapeHtml(greeting)}</h1>
      <p style="font-size:15px;line-height:1.5;margin:0 0 16px">
        ${escapeHtml(introLine)}
      </p>
      <p style="font-size:15px;line-height:1.5;margin:0 0 16px">
        Como manager podés invitar usuarios, crear proyectos y gestionar la empresa.
      </p>
      <p style="margin:24px 0">
        <a href="${escapeHtml(companyUrl)}"
           style="display:inline-block;background:#0f172a;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600">
          Ir a ${escapeHtml(companyName)}
        </a>
      </p>
      <p style="font-size:13px;color:#666;margin:24px 0 0">
        Si el botón no funciona, copiá esta dirección en tu navegador:<br>
        <span style="word-break:break-all">${escapeHtml(companyUrl)}</span>
      </p>
      <p style="font-size:12px;color:#888;margin:24px 0 0">
        Si creés que esto es un error, contactá al administrador.
      </p>
    </body></html>
  `.trim()

  const text = [
    greeting + '.',
    '',
    introLine,
    'Como manager podés invitar usuarios, crear proyectos y gestionar la empresa.',
    '',
    'Abrí la empresa en:',
    companyUrl,
  ].join('\n')

  return { to, subject, html, text, from: getSender() }
}

export async function sendManagerAssignedEmail(args) {
  if (!args?.to) {
    console.warn('[authEmails] sendManagerAssignedEmail called without recipient; skipping')
    return { sent: false, reason: 'missing_recipient' }
  }

  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.warn('[authEmails] RESEND_API_KEY missing; skipping manager-assigned email send')
    return { sent: false, reason: 'no_api_key' }
  }

  const payload = buildManagerAssignedEmailPayload(args)

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
      console.warn('[authEmails] Resend manager-assigned send failed', response.status, errorBody)
      return { sent: false, reason: `resend_${response.status}`, errorBody }
    }

    const data = await response.json().catch(() => null)
    return { sent: true, id: data?.id || null }
  } catch (error) {
    console.warn('[authEmails] Resend manager-assigned send threw', error?.message)
    return { sent: false, reason: 'exception', errorMessage: error?.message }
  }
}
```

- [ ] **Step 1.4: Run failing test → passing**

```bash
cd /Users/adrian/GitHub/webbrief/backend && npm test -- --test-name-pattern 'buildManagerAssignedEmailPayload' 2>&1 | tail -6
```

Expected: 4 passing.

- [ ] **Step 1.5: Full suite**

```bash
cd /Users/adrian/GitHub/webbrief/backend && npm test 2>&1 | tail -6
```

Expected: 83/83 (79 prior + 4 new).

- [ ] **Step 1.6: Commit**

```bash
cd /Users/adrian/GitHub/webbrief
git add backend/src/lib/authEmails.js backend/test/authEmails-manager-assigned.test.js
git commit -m "feat(authEmails): add sendManagerAssignedEmail + buildManagerAssignedEmailPayload (Plan C)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 2: `managerNotifications.js` helper (TDD pure parts)

**Files:**
- Create: `backend/src/lib/managerNotifications.js`
- Create: `backend/test/manager-notifications.test.js`

- [ ] **Step 2.1: Write failing test**

Create `/Users/adrian/GitHub/webbrief/backend/test/manager-notifications.test.js`:

```javascript
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  shouldNotifyManagerAssigned,
  buildManagerNotificationRow,
  buildCompanyUrl,
  buildAddedByLabel,
} from '../src/lib/managerNotifications.js'

// -------- shouldNotifyManagerAssigned --------

test('shouldNotifyManagerAssigned: true when role=manager AND action=assigned_existing', () => {
  assert.equal(shouldNotifyManagerAssigned({ role: 'manager', action: 'assigned_existing' }), true)
})

test('shouldNotifyManagerAssigned: false when role is not manager', () => {
  assert.equal(shouldNotifyManagerAssigned({ role: 'editor', action: 'assigned_existing' }), false)
  assert.equal(shouldNotifyManagerAssigned({ role: 'designer', action: 'assigned_existing' }), false)
})

test('shouldNotifyManagerAssigned: false when action is invited/reinvited', () => {
  assert.equal(shouldNotifyManagerAssigned({ role: 'manager', action: 'invited' }), false)
  assert.equal(shouldNotifyManagerAssigned({ role: 'manager', action: 'reinvited' }), false)
})

test('shouldNotifyManagerAssigned: false on missing inputs', () => {
  assert.equal(shouldNotifyManagerAssigned({}), false)
  assert.equal(shouldNotifyManagerAssigned(null), false)
  assert.equal(shouldNotifyManagerAssigned(undefined), false)
})

// -------- buildManagerNotificationRow --------

test('buildManagerNotificationRow: required fields populated', () => {
  const row = buildManagerNotificationRow({
    targetUserId: 'u-target',
    companyId: 'c-1',
    companyName: 'ACME',
    actor: { id: 'u-admin', fullName: 'Adrián', email: 'admin@example.com' },
  })

  assert.equal(row.user_id, 'u-target')
  assert.equal(row.project_id, null)
  assert.equal(row.event_type, 'company_membership_added')
  assert.equal(row.title, 'Te agregaron como manager')
  assert.match(row.body, /Adrián/)
  assert.match(row.body, /ACME/)
  assert.equal(row.metadata.companyId, 'c-1')
  assert.equal(row.metadata.role, 'manager')
  assert.equal(row.metadata.addedBy, 'u-admin')
})

test('buildManagerNotificationRow: actor without fullName uses email', () => {
  const row = buildManagerNotificationRow({
    targetUserId: 'u-target',
    companyId: 'c-1',
    companyName: 'ACME',
    actor: { id: 'u-admin', email: 'admin@example.com' },
  })
  assert.match(row.body, /admin@example\.com/)
})

test('buildManagerNotificationRow: actor null uses generic label', () => {
  const row = buildManagerNotificationRow({
    targetUserId: 'u-target',
    companyId: 'c-1',
    companyName: 'ACME',
    actor: null,
  })
  assert.match(row.body, /agregaron/)
  assert.equal(row.metadata.addedBy, null)
})

// -------- buildCompanyUrl --------

test('buildCompanyUrl: uses FRONTEND_URL when set', () => {
  const url = buildCompanyUrl({ companyId: 'c-1', frontendUrl: 'https://webrief.app' })
  assert.equal(url, 'https://webrief.app/companies/c-1')
})

test('buildCompanyUrl: localhost fallback when frontendUrl missing', () => {
  const url = buildCompanyUrl({ companyId: 'c-1', frontendUrl: undefined })
  assert.equal(url, 'http://localhost:5173/companies/c-1')
})

test('buildCompanyUrl: strips trailing slash from frontendUrl', () => {
  const url = buildCompanyUrl({ companyId: 'c-1', frontendUrl: 'https://webrief.app/' })
  assert.equal(url, 'https://webrief.app/companies/c-1')
})

// -------- buildAddedByLabel --------

test('buildAddedByLabel: prefers fullName, falls back to email, then null', () => {
  assert.equal(buildAddedByLabel({ fullName: 'Adrián', email: 'a@b.c' }), 'Adrián')
  assert.equal(buildAddedByLabel({ fullName: '', email: 'a@b.c' }), 'a@b.c')
  assert.equal(buildAddedByLabel({ fullName: null, email: null }), '')
  assert.equal(buildAddedByLabel(null), '')
})
```

- [ ] **Step 2.2: Run failing test**

```bash
cd /Users/adrian/GitHub/webbrief/backend && npm test -- --test-name-pattern 'shouldNotifyManagerAssigned|buildManagerNotificationRow|buildCompanyUrl|buildAddedByLabel' 2>&1 | tail -6
```

Expected: failures (module missing).

- [ ] **Step 2.3: Implement the helper module**

Create `/Users/adrian/GitHub/webbrief/backend/src/lib/managerNotifications.js`:

```javascript
// Notification + email for "manager assigned to company" event.
// Spec §5.3 (Plan C). Fires only when an EXISTING active user is added as
// manager — fresh invites are already covered by the invite email path.

import { supabaseAdmin } from './supabase.js'
import { sendManagerAssignedEmail } from './authEmails.js'
import { logApplicationError } from './applicationErrors.js'

const DEFAULT_FRONTEND_URL = 'http://localhost:5173'

export function shouldNotifyManagerAssigned(input) {
  if (!input || typeof input !== 'object') return false
  return input.role === 'manager' && input.action === 'assigned_existing'
}

export function buildAddedByLabel(actor) {
  if (!actor) return ''
  return (actor.fullName?.trim() || actor.email?.trim() || '')
}

export function buildCompanyUrl({ companyId, frontendUrl }) {
  const base = (frontendUrl || DEFAULT_FRONTEND_URL).replace(/\/+$/, '')
  return `${base}/companies/${companyId}`
}

export function buildManagerNotificationRow({ targetUserId, companyId, companyName, actor }) {
  const addedByLabel = buildAddedByLabel(actor)
  const body = addedByLabel
    ? `${addedByLabel} te agregó a ${companyName} como manager.`
    : `Te agregaron a ${companyName} como manager.`

  return {
    user_id: targetUserId,
    project_id: null,
    event_type: 'company_membership_added',
    title: 'Te agregaron como manager',
    body,
    metadata: {
      companyId,
      role: 'manager',
      addedBy: actor?.id || null,
      companyName,
    },
  }
}

// Fires the notification + email. Best-effort: any failure logs to
// application_errors and returns silently. Never throws.
export async function notifyManagerAssigned({ targetUserId, companyId, actor, req = null }) {
  try {
    if (!targetUserId || !companyId) return { skipped: true, reason: 'missing_ids' }

    // Load the target's email/full_name and the company's name in parallel.
    const [profileResult, companyResult] = await Promise.all([
      supabaseAdmin
        .from('profiles')
        .select('id, email, full_name')
        .eq('id', targetUserId)
        .maybeSingle(),
      supabaseAdmin
        .from('companies')
        .select('id, name')
        .eq('id', companyId)
        .maybeSingle(),
    ])

    if (profileResult.error) throw profileResult.error
    if (companyResult.error) throw companyResult.error
    const profile = profileResult.data
    const company = companyResult.data
    if (!profile || !company) {
      return { skipped: true, reason: !profile ? 'profile_not_found' : 'company_not_found' }
    }

    // 1. Insert in-app notification (best-effort; isolate failure).
    let notificationInserted = false
    try {
      const row = buildManagerNotificationRow({
        targetUserId,
        companyId,
        companyName: company.name,
        actor,
      })
      const { error } = await supabaseAdmin.from('notifications').insert(row)
      if (error) throw error
      notificationInserted = true
    } catch (notifError) {
      await logApplicationError(req, notifError, {
        source: 'route',
        metadata: { operation: 'notifyManagerAssigned:insert', targetUserId, companyId },
      })
    }

    // 2. Send email (best-effort; isolate failure).
    let emailSent = false
    try {
      const companyUrl = buildCompanyUrl({
        companyId,
        frontendUrl: process.env.FRONTEND_URL,
      })
      const result = await sendManagerAssignedEmail({
        to: profile.email,
        fullName: profile.full_name,
        companyName: company.name,
        addedByLabel: buildAddedByLabel(actor),
        companyUrl,
      })
      emailSent = Boolean(result?.sent)
      if (!result?.sent && result?.reason && result.reason !== 'no_api_key' && result.reason !== 'missing_recipient') {
        await logApplicationError(req, new Error(`Manager-assigned email failed: ${result.reason}`), {
          source: 'email',
          metadata: { operation: 'sendManagerAssignedEmail', targetUserId, companyId, reason: result.reason },
        })
      }
    } catch (emailError) {
      await logApplicationError(req, emailError, {
        source: 'email',
        metadata: { operation: 'sendManagerAssignedEmail', targetUserId, companyId },
      })
    }

    return { notificationInserted, emailSent }
  } catch (error) {
    // Outer-catch: profile/company lookup failed. Log + swallow.
    await logApplicationError(req, error, {
      source: 'route',
      metadata: { operation: 'notifyManagerAssigned', targetUserId, companyId },
    }).catch(() => {})
    return { error: true }
  }
}
```

- [ ] **Step 2.4: Re-run failing test → passing**

```bash
cd /Users/adrian/GitHub/webbrief/backend && npm test 2>&1 | tail -6
```

Expected: 95/95 (83 prior + 12 new — 4 shouldNotify + 3 buildRow + 3 buildUrl + 2 buildLabel).

- [ ] **Step 2.5: Commit**

```bash
cd /Users/adrian/GitHub/webbrief
git add backend/src/lib/managerNotifications.js backend/test/manager-notifications.test.js
git commit -m "feat(notifications): add notifyManagerAssigned helper (Plan C)

Pure helpers shouldNotifyManagerAssigned + buildManagerNotificationRow
+ buildCompanyUrl + buildAddedByLabel cover the trigger condition and
row/url shapes. notifyManagerAssigned orchestrates profile + company
lookup, notifications insert, and sendManagerAssignedEmail — both
wrapped so failures land in application_errors and never throw.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 3: Wire `notifyManagerAssigned` into `inviteUserToCompany`

**Files:**
- Modify: `backend/src/lib/users.js`

- [ ] **Step 3.1: Add import + fire-and-forget call**

In `/Users/adrian/GitHub/webbrief/backend/src/lib/users.js`, add the import near the top (next to existing `sendInviteEmail` import):

```javascript
import { notifyManagerAssigned, shouldNotifyManagerAssigned } from './managerNotifications.js'
```

Find the `inviteUserToCompany` function (currently at the bottom of the file, ending with `return { ... action }`). Replace it with:

```javascript
export async function inviteUserToCompany({ email, fullName, companyId, role, platformRole = 'user', req = null }) {
  const profile = await ensureUserProfile({ email, fullName, platformRole, req })
  await assignUserToCompany({ companyId, userId: profile.userId, role })

  // Plan C: notify when an existing active user is promoted to manager.
  // Fire-and-forget (notifyManagerAssigned is best-effort and never throws),
  // but await so any logApplicationError side-effects complete before we
  // return. The membership row is already committed — failures here only
  // affect notification delivery.
  if (shouldNotifyManagerAssigned({ role, action: profile.action })) {
    await notifyManagerAssigned({
      targetUserId: profile.userId,
      companyId,
      actor: req?.currentUser || null,
      req,
    })
  }

  return {
    id: profile.userId,
    email: profile.email,
    fullName: profile.fullName,
    role,
    companyId,
    inviteSent: profile.inviteSent,
    action: profile.action, // 'invited' | 'reinvited' | 'assigned_existing'
  }
}
```

- [ ] **Step 3.2: Run full suite**

```bash
cd /Users/adrian/GitHub/webbrief/backend && npm test 2>&1 | tail -6
```

Expected: 95/95 (no new tests; `inviteUserToCompany` is exercised by existing tests that mock the chain).

If a previously-passing test now fails because it mocks `ensureUserProfile` but doesn't mock the new `notifyManagerAssigned` import, the mock infrastructure may need adjustment. Most likely: tests use the live function (which short-circuits when `targetUserId`/`companyId` are missing or when supabaseAdmin throws), so no test churn.

- [ ] **Step 3.3: Commit**

```bash
cd /Users/adrian/GitHub/webbrief
git add backend/src/lib/users.js
git commit -m "feat(users): wire notifyManagerAssigned into inviteUserToCompany (Plan C)

Fires notification + email when a user is added as manager via any
invite endpoint (POST /api/companies, /api/auth/invite-user, /api/users)
AND the user already existed as active. Best-effort, never blocks
membership creation.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 4: CONTEXT.min.md + final smoke

- [ ] **Step 4.1: Run full backend suite + frontend build**

```bash
cd /Users/adrian/GitHub/webbrief/backend && npm test 2>&1 | tail -6
cd /Users/adrian/GitHub/webbrief/frontend && npm run build 2>&1 | tail -3
```

Expected: 95/95 tests, frontend build green (no frontend changes in Plan C; bell-icon notification dropdown polling `notifications` already handles new rows).

- [ ] **Step 4.2: Placeholder scan**

```bash
cd /Users/adrian/GitHub/webbrief && grep -rEn 'TODO|FIXME|XXX|TBD' \
  backend/src/lib/managerNotifications.js \
  backend/src/lib/authEmails.js \
  backend/src/lib/users.js
```

Expected: no matches.

- [ ] **Step 4.3: Append Session 16 to `CONTEXT.min.md`**

In `/Users/adrian/GitHub/webbrief/CONTEXT.min.md`, insert above Session 15:

```
### Session 16 (2026-05-14) — Auth hardening Plan C (manager-assigned notif)

- Plan C shipped on branch `feat/auth-hardening-plan-c`: fires in-app notification + Resend email when an existing active user is added as manager to a company. Single chokepoint in `inviteUserToCompany` — covers all 3 invite endpoints (POST /api/companies, /api/auth/invite-user, /api/users) without per-endpoint wiring.
- `backend/src/lib/managerNotifications.js` exports 4 pure helpers (`shouldNotifyManagerAssigned` — role=manager AND action=assigned_existing; `buildManagerNotificationRow` — shape for notifications table; `buildCompanyUrl` — FRONTEND_URL + /companies/{id}; `buildAddedByLabel` — fullName||email||'') + the orchestrator `notifyManagerAssigned({ targetUserId, companyId, actor, req })`. Orchestrator loads profile + company in parallel, inserts notifications row best-effort, calls sendManagerAssignedEmail best-effort, logs any failure to application_errors (Plan D). Never throws — membership row is source of truth.
- `authEmails.sendManagerAssignedEmail` + `buildManagerAssignedEmailPayload` added; Spanish subject "Te agregaron como manager en {companyName}"; CTA button to /companies/{companyId}; gated on RESEND_API_KEY (no-op + warning if missing, matching other authEmails functions).
- `inviteUserToCompany` (lib/users.js) now calls notifyManagerAssigned after assignUserToCompany when shouldNotifyManagerAssigned returns true. Existing call sites untouched.
- 12 new tests in `backend/test/manager-notifications.test.js` (4 shouldNotify + 3 buildRow + 3 buildUrl + 2 buildLabel) + `backend/test/authEmails-manager-assigned.test.js` (4). Full backend suite: 95/95 pass.
- No new migrations. Reuses existing `notifications` table (event_type='company_membership_added'); bell icon notification dropdown already polls this table — no UI changes required.
- v1.1 auth-hardening milestone now complete: Plans A + B + C + D + E all shipped to main local.
```

- [ ] **Step 4.4: Commit**

```bash
cd /Users/adrian/GitHub/webbrief
git add CONTEXT.min.md
git commit -m "docs: record session 16 (Plan C manager-assigned notif) in CONTEXT.min.md

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Self-review checklist (for the implementer)

1. **Spec §5.3 coverage:**
   - C.1 email via Resend ✓ Task 1
   - C.2 in-app notification via existing `notifications` table ✓ Task 2 (insert) + Task 3 (wire)

2. **Trigger fidelity:** confirm `shouldNotifyManagerAssigned` matches the spec language ("Fires when ensureUserProfile returns action: 'assigned_existing' from inside the company creation OR manager re-assignment flows"). Implementation: `role==='manager' && action==='assigned_existing'`. Covers all 3 invite endpoints automatically via the lib/users.js chokepoint.

3. **Best-effort guarantee:** if `notifyManagerAssigned` throws, the outer `try/catch` swallows + logs. Verify by checking the function has no `throw` outside its outer-catch (intentional — `throw error` inside the inner inserts is caught by the surrounding wrappers).

4. **No double-fire:** `inviteUserToCompany` is called once per (target, company, role) tuple per request. Even if 2 admins invite the same user concurrently, race goes to the membership upsert (conflict on (company_id, user_id)) and either path may produce 0 or 2 notifications — acceptable per DEC-8.

5. **Bell icon UI:** verify (via codebase grep, no work) that the existing bell-icon notification dropdown polls `notifications` table for the user_id. Plan C produces correctly-shaped rows that the existing UI consumes without code changes.

---

## Out of scope

- De-duplication for repeated notifications (DEC-8 documented).
- UI cards for `company_membership_added` event_type beyond what the existing bell dropdown renders.
- Notifications for editor/designer/developer/etc role assignments (Plan C is manager-only per spec).
- Notifications for company REMOVAL or role-downgrade events.
