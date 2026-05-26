# PR 1 — Invite Link Fix: Unify Case A to Resend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor `ensureUserProfile` Case A in `backend/src/lib/users.js` so the invite email for brand-new auth users goes through `generateLink + sendInviteEmail` (Resend, with the correct `redirect_to=/auth/set-password`) instead of Supabase's native `inviteUserByEmail` (which uses the Dashboard template and lands on `/login`).

**Architecture:** Extract a small, dependency-injectable helper `generateInviteLinkAndSendEmail` that performs `generateLink({type:'invite'}) → sendInviteEmail`. Refactor both Case A (`ensureUserProfile`) and Case B (`handleReinvite`) to call the helper. This kills the Case A/B code duplication AND makes the flow unit-testable with mocked Supabase + email sender.

**Tech Stack:** Node.js (ESM), `node --test` runner, `node:assert/strict`, Supabase JS Admin SDK, existing `wrapSupabaseAuthCall` from `applicationErrors.js`.

**Reference spec:** [`docs/superpowers/specs/2026-05-25-auth-team-fixes-design.md`](../specs/2026-05-25-auth-team-fixes-design.md) — Section A.

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `backend/src/lib/users.js` | Modify | Add helper `generateInviteLinkAndSendEmail`; refactor Case A and `handleReinvite` to call it |
| `backend/test/users-invite-flow.test.js` | Create | Unit tests for the new helper with mocked supabaseClient + emailSender |

No new files in frontend. No DB migration. No deploy steps beyond standard backend restart.

---

### Task 1: Set up test scaffold for the new helper

**Files:**
- Create: `backend/test/users-invite-flow.test.js`

- [ ] **Step 1: Write the failing test file**

Create `backend/test/users-invite-flow.test.js`:

```javascript
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { generateInviteLinkAndSendEmail } from '../src/lib/users.js'

function makeMockSupabaseClient({ generateLinkResponse }) {
  return {
    auth: {
      admin: {
        generateLink: async (_args) => generateLinkResponse,
      },
    },
  }
}

test('generateInviteLinkAndSendEmail: success path returns actionLink + user + emailSent=true', async () => {
  const calls = { generateLink: [], emailSender: [] }
  const supabaseClient = {
    auth: {
      admin: {
        generateLink: async (args) => {
          calls.generateLink.push(args)
          return {
            data: {
              properties: { action_link: 'https://example.supabase.co/auth/v1/verify?token=abc&redirect_to=https%3A%2F%2Fwebrief.app%2Fauth%2Fset-password#access_token=xyz&type=invite' },
              user: { id: 'new-user-id', email: 'fresh@example.com', user_metadata: { full_name: 'Fresh User' } },
            },
            error: null,
          }
        },
      },
    },
  }
  const emailSender = async (payload) => {
    calls.emailSender.push(payload)
    return { sent: true, id: 'email-id-123' }
  }

  const result = await generateInviteLinkAndSendEmail({
    supabaseClient,
    emailSender,
    email: 'fresh@example.com',
    fullName: 'Fresh User',
    redirectTo: 'https://webrief.app/auth/set-password',
    req: null,
  })

  assert.equal(result.error, null)
  assert.equal(result.user.id, 'new-user-id')
  assert.equal(result.actionLink.startsWith('https://example.supabase.co/'), true)
  assert.equal(result.emailSent, true)
  assert.equal(calls.generateLink.length, 1)
  assert.equal(calls.generateLink[0].type, 'invite')
  assert.equal(calls.generateLink[0].email, 'fresh@example.com')
  assert.equal(calls.generateLink[0].options.redirectTo, 'https://webrief.app/auth/set-password')
  assert.equal(calls.generateLink[0].options.data.full_name, 'Fresh User')
  assert.equal(calls.emailSender.length, 1)
  assert.equal(calls.emailSender[0].to, 'fresh@example.com')
  assert.equal(calls.emailSender[0].fullName, 'Fresh User')
  assert.equal(calls.emailSender[0].actionLink, result.actionLink)
})

test('generateInviteLinkAndSendEmail: Supabase error returns error and skips email', async () => {
  const calls = { emailSender: [] }
  const supabaseClient = {
    auth: {
      admin: {
        generateLink: async () => ({ data: null, error: new Error('Supabase down') }),
      },
    },
  }
  const emailSender = async (payload) => {
    calls.emailSender.push(payload)
    return { sent: true }
  }

  const result = await generateInviteLinkAndSendEmail({
    supabaseClient,
    emailSender,
    email: 'fresh@example.com',
    fullName: 'Fresh User',
    redirectTo: 'https://webrief.app/auth/set-password',
    req: null,
  })

  assert.equal(result.error.message, 'Supabase down')
  assert.equal(result.actionLink, null)
  assert.equal(result.user, null)
  assert.equal(result.emailSent, false)
  assert.equal(calls.emailSender.length, 0)
})

test('generateInviteLinkAndSendEmail: missing action_link in response returns error', async () => {
  const supabaseClient = {
    auth: {
      admin: {
        generateLink: async () => ({
          data: { properties: {}, user: { id: 'u1', email: 'x@y.com' } },
          error: null,
        }),
      },
    },
  }
  const emailSender = async () => ({ sent: true })

  const result = await generateInviteLinkAndSendEmail({
    supabaseClient,
    emailSender,
    email: 'x@y.com',
    fullName: '',
    redirectTo: 'https://webrief.app/auth/set-password',
    req: null,
  })

  assert.equal(result.error.message, 'No se pudo generar el link de invitación')
  assert.equal(result.actionLink, null)
  assert.equal(result.emailSent, false)
})

test('generateInviteLinkAndSendEmail: email send failure does not throw, returns emailSent=false', async () => {
  const supabaseClient = {
    auth: {
      admin: {
        generateLink: async () => ({
          data: {
            properties: { action_link: 'https://example.supabase.co/auth/v1/verify?type=invite' },
            user: { id: 'u1', email: 'x@y.com', user_metadata: {} },
          },
          error: null,
        }),
      },
    },
  }
  const emailSender = async () => ({ sent: false, reason: 'no_api_key' })

  const result = await generateInviteLinkAndSendEmail({
    supabaseClient,
    emailSender,
    email: 'x@y.com',
    fullName: '',
    redirectTo: 'https://webrief.app/auth/set-password',
    req: null,
  })

  assert.equal(result.error, null)
  assert.equal(result.actionLink.length > 0, true)
  assert.equal(result.user.id, 'u1')
  assert.equal(result.emailSent, false)
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run from `/Users/adrian/GitHub/webbrief/backend`:

```bash
NODE_ENV=test node --test test/users-invite-flow.test.js
```

Expected: 4 failing tests with errors like `SyntaxError: The requested module '../src/lib/users.js' does not provide an export named 'generateInviteLinkAndSendEmail'`.

- [ ] **Step 3: Commit the failing tests**

```bash
git add backend/test/users-invite-flow.test.js
git commit -m "test(users): scaffold for generateInviteLinkAndSendEmail helper (failing)"
```

---

### Task 2: Implement `generateInviteLinkAndSendEmail` helper

**Files:**
- Modify: `backend/src/lib/users.js` — add export

- [ ] **Step 1: Add the helper at the top of users.js (after imports, before `normalizeEmail`)**

Open `backend/src/lib/users.js`. After line 5 (the `notifyManagerAssigned` import) and BEFORE the `normalizeEmail` function on line 7, insert:

```javascript
/**
 * Generates an invite action_link via Supabase Auth admin.generateLink,
 * then sends it via the provided email sender (defaults to Resend).
 *
 * Supports BOTH "fresh user" (no auth row yet — Supabase creates it) and
 * "reinvite existing user" flows. Pure-input/output for unit testing.
 *
 * @param {object} args
 * @param {object} [args.supabaseClient]  Supabase Admin client (defaults to supabaseAdmin)
 * @param {function} [args.emailSender]   Email sender function (defaults to sendInviteEmail)
 * @param {string} args.email             Target email (must be normalized)
 * @param {string} args.fullName          Full name for user_metadata + email greeting
 * @param {string} args.redirectTo        Absolute URL of the SetPassword frontend route
 * @param {object|null} args.req          Express req for wrapSupabaseAuthCall (or null)
 * @param {string} [args.operationName]   Tag for application_errors logging
 * @returns {Promise<{error: Error|null, actionLink: string|null, user: object|null, emailSent: boolean}>}
 */
export async function generateInviteLinkAndSendEmail({
  supabaseClient,
  emailSender,
  email,
  fullName,
  redirectTo,
  req = null,
  operationName = 'generateLink:invite',
}) {
  const client = supabaseClient || supabaseAdmin
  const sender = emailSender || sendInviteEmail

  const { data, error } = await wrapSupabaseAuthCall({
    operation: () => client.auth.admin.generateLink({
      type: 'invite',
      email,
      options: {
        redirectTo,
        data: { full_name: fullName || '' },
      },
    }),
    operationName,
    req,
    args: { email, type: 'invite' },
  })

  if (error) {
    return { error, actionLink: null, user: null, emailSent: false }
  }

  const actionLink = data?.properties?.action_link
  const user = data?.user || null

  if (!actionLink) {
    return {
      error: new Error('No se pudo generar el link de invitación'),
      actionLink: null,
      user,
      emailSent: false,
    }
  }

  const emailResult = await sender({
    to: email,
    fullName,
    actionLink,
  })

  return {
    error: null,
    actionLink,
    user,
    emailSent: Boolean(emailResult?.sent),
  }
}
```

- [ ] **Step 2: Run the test to verify it passes**

Run from `/Users/adrian/GitHub/webbrief/backend`:

```bash
NODE_ENV=test node --test test/users-invite-flow.test.js
```

Expected output (4 tests pass):
```
# tests 4
# suites 0
# pass 4
# fail 0
# cancelled 0
# skipped 0
# todo 0
```

- [ ] **Step 3: Run the full backend test suite to verify no regression**

```bash
NODE_ENV=test node --test
```

Expected: All previously-passing tests still pass; the new 4 tests pass. No "fail" count > 0.

- [ ] **Step 4: Commit**

```bash
git add backend/src/lib/users.js
git commit -m "feat(users): add generateInviteLinkAndSendEmail helper (testable)"
```

---

### Task 3: Refactor Case A (`ensureUserProfile`) to call the helper

**Files:**
- Modify: `backend/src/lib/users.js:104-136` — replace `inviteUserByEmail` block

- [ ] **Step 1: Replace the Case A block in `ensureUserProfile`**

In `backend/src/lib/users.js`, find the block starting at line 104:

```javascript
  // -------- Case A: fresh invite --------
  if (decision.action === 'invited') {
    const { data, error: inviteError } = await wrapSupabaseAuthCall({
      operation: () => supabaseAdmin.auth.admin.inviteUserByEmail(normalizedEmail, {
        redirectTo,
        data: { full_name: fullName || '' },
      }),
      operationName: 'inviteUserByEmail',
      req,
      args: { email: normalizedEmail },
    })

    if (inviteError || !data?.user?.id) {
      // Race: another invite landed between our lookups and now. Re-resolve once.
      const fallback = await findAuthUserByEmail(normalizedEmail)
      if (!fallback?.id) {
        throw inviteError || new Error('No se pudo crear el usuario')
      }
      // Treat as Case B (reinvite) on the retry path.
      return await handleReinvite(fallback, normalizedEmail, fullName, normalizedPlatformRole, redirectTo, timestamp, req)
    }

    await upsertProfileRow(data.user.id, normalizedEmail, fullName, data.user, normalizedPlatformRole, timestamp)

    return {
      userId: data.user.id,
      email: normalizedEmail,
      fullName: fullName || data.user.user_metadata?.full_name || '',
      platformRole: normalizedPlatformRole,
      action: 'invited',
      inviteSent: true,
    }
  }
```

Replace it with:

```javascript
  // -------- Case A: fresh invite --------
  // Uses generateLink+sendInviteEmail (Resend) — NOT supabaseAdmin.auth.admin.inviteUserByEmail,
  // because the native Supabase template lands users on the Site URL root, which redirects to /login.
  // generateLink with type='invite' creates the auth user when it doesn't exist AND returns a
  // properly-redirected action_link that lands on /auth/set-password.
  if (decision.action === 'invited') {
    const { error: inviteError, actionLink, user: newAuthUser, emailSent } = await generateInviteLinkAndSendEmail({
      email: normalizedEmail,
      fullName,
      redirectTo,
      req,
      operationName: 'generateLink:invite:new',
    })

    if (inviteError || !newAuthUser?.id) {
      // Race: another invite landed between our lookups and now. Re-resolve once.
      const fallback = await findAuthUserByEmail(normalizedEmail)
      if (!fallback?.id) {
        throw inviteError || new Error('No se pudo crear el usuario')
      }
      // Treat as Case B (reinvite) on the retry path.
      return await handleReinvite(fallback, normalizedEmail, fullName, normalizedPlatformRole, redirectTo, timestamp, req)
    }

    await upsertProfileRow(newAuthUser.id, normalizedEmail, fullName, newAuthUser, normalizedPlatformRole, timestamp)

    return {
      userId: newAuthUser.id,
      email: normalizedEmail,
      fullName: fullName || newAuthUser.user_metadata?.full_name || '',
      platformRole: normalizedPlatformRole,
      action: 'invited',
      inviteSent: Boolean(emailSent),
    }
  }
```

**Note on the `inviteSent` change:** previously `inviteSent: true` was hardcoded because Supabase native invite "always sends" (we never knew if Resend succeeded since Resend wasn't involved). Now `inviteSent` reflects actual Resend delivery success, matching the contract of Case B `handleReinvite` (line 198). Callers that branch on `inviteSent: false` already exist (Plan C `shouldNotifyManagerAssigned`).

- [ ] **Step 2: Run the full backend test suite**

```bash
NODE_ENV=test node --test
```

Expected: All tests pass. The 4 new helper tests pass + the existing `users-ensure-profile.test.js` 5 tests pass + everything else (~89 tests) passes.

- [ ] **Step 3: Commit**

```bash
git add backend/src/lib/users.js
git commit -m "fix(users): Case A invite via generateLink+Resend, not Supabase native

Previously: ensureUserProfile Case A called supabaseAdmin.auth.admin.inviteUserByEmail,
which uses Supabase's native email template. That template's CTA points to the project's
Site URL root (https://webrief.app/), which renders App.jsx and redirects to /login
because the user has no session yet — leaving fresh invitees unable to set their password.

Now: Case A calls generateLink({type:'invite'}) + sendInviteEmail via Resend, identical
to Case B's handleReinvite path. The action_link includes redirect_to=/auth/set-password,
so the user lands directly on SetPassword and the hash captures type=invite.

The supabaseAdmin.auth.admin.generateLink documentation confirms that type='invite'
creates the auth user when it doesn't exist, mirroring inviteUserByEmail's behavior.

Closes the fresh-user invite bug reported after v1.1 auth-hardening."
```

---

### Task 4: Refactor `handleReinvite` to call the helper (cleanup; DRY)

**Files:**
- Modify: `backend/src/lib/users.js:168-200` — collapse Case B to use the helper

- [ ] **Step 1: Replace `handleReinvite` body**

In `backend/src/lib/users.js`, find the function starting at line 168:

```javascript
async function handleReinvite(authUser, normalizedEmail, fullName, normalizedPlatformRole, redirectTo, timestamp, req) {
  const { data: linkData, error: linkError } = await wrapSupabaseAuthCall({
    operation: () => supabaseAdmin.auth.admin.generateLink({
      type: 'invite',
      email: normalizedEmail,
      options: { redirectTo },
    }),
    operationName: 'generateLink:invite',
    req,
    args: { email: normalizedEmail, type: 'invite' },
  })

  if (linkError) throw linkError
  const actionLink = linkData?.properties?.action_link
  if (!actionLink) throw new Error('No se pudo regenerar el link de invitación')

  const emailResult = await sendInviteEmail({
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
    inviteSent: Boolean(emailResult?.sent),
  }
}
```

Replace it with:

```javascript
async function handleReinvite(authUser, normalizedEmail, fullName, normalizedPlatformRole, redirectTo, timestamp, req) {
  const { error, actionLink, emailSent } = await generateInviteLinkAndSendEmail({
    email: normalizedEmail,
    fullName,
    redirectTo,
    req,
    operationName: 'generateLink:invite:reinvite',
  })

  if (error) throw error
  if (!actionLink) throw new Error('No se pudo regenerar el link de invitación')

  await upsertProfileRow(authUser.id, normalizedEmail, fullName, authUser, normalizedPlatformRole, timestamp)

  return {
    userId: authUser.id,
    email: normalizedEmail,
    fullName: fullName || authUser.user_metadata?.full_name || '',
    platformRole: normalizedPlatformRole,
    action: 'reinvited',
    inviteSent: Boolean(emailSent),
  }
}
```

**Note:** the `operationName` changes from `'generateLink:invite'` to `'generateLink:invite:reinvite'` to disambiguate from the `:new` (Case A) variant in `application_errors` logs. The `:new` and `:reinvite` suffixes let operators tell apart "fresh user creation that failed" from "existing user reinvite that failed".

- [ ] **Step 2: Run the full backend test suite**

```bash
NODE_ENV=test node --test
```

Expected: All tests pass. If `manager-notifications.test.js` or other tests assert on specific operationName strings, they may need updates — check failures and fix accordingly.

- [ ] **Step 3: Commit**

```bash
git add backend/src/lib/users.js
git commit -m "refactor(users): handleReinvite uses shared generateInviteLinkAndSendEmail helper

Collapses Case A and Case B onto the same internal helper, eliminating ~25 LOC
of duplicated wrapSupabaseAuthCall+generateLink+sendInviteEmail boilerplate.
The operationName changes from 'generateLink:invite' to 'generateLink:invite:reinvite'
to disambiguate from Case A's 'generateLink:invite:new' in application_errors logs."
```

---

### Task 5: Manual smoke test on local dev

**This task is verification, not code.** Run before pushing to remote.

- [ ] **Step 1: Start backend locally**

From `/Users/adrian/GitHub/webbrief/backend`:

```bash
npm run dev
```

Wait for "Backend listening on port 3000".

- [ ] **Step 2: Start frontend locally**

In another terminal, from `/Users/adrian/GitHub/webbrief/frontend`:

```bash
npm run dev
```

Wait for Vite to print the local URL (typically `http://localhost:5173`).

- [ ] **Step 3: Verify env vars on backend**

In a third terminal, check that backend has the required env:

```bash
grep -E "RESEND_API_KEY|FRONTEND_URL|AUTH_EMAIL_FROM" /Users/adrian/GitHub/webbrief/backend/.env
```

Expected:
- `RESEND_API_KEY=re_...` (real key for actual email delivery)
- `FRONTEND_URL=http://localhost:5173` (or `https://webrief.app` if testing against prod redirect)
- `AUTH_EMAIL_FROM=WeBrief <noreply@webrief.app>` (optional fallback)

If `RESEND_API_KEY` is missing, the email won't actually send and the helper logs `[authEmails] RESEND_API_KEY missing; skipping invite email send`. That's a test-only observation — no need to fail the task, but flag it to the user.

- [ ] **Step 4: Create a test company with a fresh email**

1. Open browser to `http://localhost:5173`
2. Log in as admin
3. Navigate to "Empresas" → click "Nueva empresa"
4. Fill: company name `Test Bug Fix`, manager email `your.email+pr1test@yourdomain.com` (use plus-addressing to keep this isolated), manager full name `Test Manager`
5. **Do NOT check `testMode`** (testMode bypasses the invite flow)
6. Click "Crear"

Expected: success toast, new company appears in the list.

- [ ] **Step 5: Receive and inspect the email**

1. Open the inbox for `your.email+pr1test@yourdomain.com`
2. Find the email with subject `Te invitaron a WeBrief en Test Bug Fix`
3. Verify the email comes from `noreply@webrief.app` (Resend, NOT Supabase's `noreply@mail.app.supabase.io`)
4. Hover the CTA button "Crear mi contraseña" and inspect the URL

Expected URL format:
```
https://[supabase-project].supabase.co/auth/v1/verify?token=...&type=invite&redirect_to=http%3A%2F%2Flocalhost%3A5173%2Fauth%2Fset-password
```

The key element is `redirect_to=...%2Fauth%2Fset-password` (URL-encoded).

- [ ] **Step 6: Click the link and verify landing page**

1. Click "Crear mi contraseña"
2. Browser should open and navigate

Expected: the URL bar settles on `http://localhost:5173/auth/set-password#access_token=...&type=invite&...` and the SetPassword page renders with the password form ready.

**FAIL signal:** URL settles on `/login` instead of `/auth/set-password`. If this happens, the bug is not fixed — check that backend was restarted after the code change and that the email actually came from Resend (not Supabase native).

- [ ] **Step 7: Complete the password setup**

1. Enter a password (≥8 chars), confirm, click submit
2. Should land on `/companies` logged in as the new manager

- [ ] **Step 8: Record the smoke-test result**

Add a brief note to the PR description (later in Task 6) confirming smoke test passed, e.g., "Smoke test confirmed locally — email lands on /auth/set-password, password setup completes, new manager session created."

---

### Task 6: Push and open PR

- [ ] **Step 1: Ensure on a feature branch**

```bash
git status
git log --oneline -5
```

If currently on `main`, create the feature branch FROM `main`:

```bash
git checkout -b fix/case-a-invite-via-resend
```

If a feature branch is already in use (the 4 commits from Tasks 1-4 should be on it), confirm with:

```bash
git branch --show-current
```

Expected output: `fix/case-a-invite-via-resend` (or similar).

- [ ] **Step 2: Push the branch**

```bash
git push -u origin fix/case-a-invite-via-resend
```

- [ ] **Step 3: Open PR via gh**

```bash
gh pr create --title "fix(users): Case A invite via generateLink+Resend, not Supabase native" --body "$(cat <<'EOF'
## Summary

- `ensureUserProfile` Case A (fresh invite — auth user does not exist) now calls `generateLink({type:'invite'}) + sendInviteEmail` instead of `supabaseAdmin.auth.admin.inviteUserByEmail`.
- This routes the invite email through Resend with our `Crear mi contraseña` template, whose CTA includes `redirect_to=/auth/set-password` — landing users on the SetPassword page instead of `/login`.
- Internal cleanup: extracted shared helper `generateInviteLinkAndSendEmail` consumed by BOTH Case A (`ensureUserProfile`) and Case B (`handleReinvite`).

## Root Cause

`inviteUserByEmail` sends Supabase's native Dashboard template email, whose CTA is built from the project's Site URL root (`https://webrief.app/`). The frontend renders `App.jsx` → redirects to `/login` because the user has no session. Switching to `generateLink({type:'invite'})` returns an `action_link` with the correct `redirect_to` query, matching the path that already works for reinvites (Case B) and `/api/users/:id/send-access` (Plan B).

Full diagnosis in [docs/superpowers/specs/2026-05-25-auth-team-fixes-design.md](../blob/main/docs/superpowers/specs/2026-05-25-auth-team-fixes-design.md) — Section A.

## Test plan

- [ ] All backend tests pass (`cd backend && npm test`) — should be 4 new + ~94 existing = ~98 total passing
- [ ] Manual smoke test: create a company with a brand-new manager email, click the invite link in the received email, verify the URL lands on /auth/set-password (not /login), complete the password setup
- [ ] Verify email originates from Resend (noreply@webrief.app), not from Supabase native (noreply@mail.app.supabase.io)
- [ ] Reinvite flow (Case B) still works: send a manager invite to the same email a second time via /api/auth/invite-user or by re-adding to a company; verify a new email arrives and the link still lands correctly

## Out of scope

- Setting up a separate admin-can-set-password feature (PR 4 in the design bundle)
- Refactoring the company team modal (PR 2)
- Adding the company-admin membership role (PR 3)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 4: Capture PR URL**

The `gh pr create` command prints the PR URL. Note it down — it's the deliverable.

---

## Done When

- [ ] All 5 tasks above complete with all checkboxes ticked
- [ ] `npm test` from `backend/` exits with 0 failures
- [ ] Manual smoke test from Task 5 passed end-to-end
- [ ] PR opened with the URL recorded

## Out of Scope (defer to PR 2/3/4)

- Sharing `UserEditModal` between UsersPage and CompanyPage → PR 2
- Adding `company_memberships.role='admin'` (company-admin role) → PR 3
- Set-password feature (generate or custom) + sessions list + revoke endpoint → PR 4
- Documentation update to mark Supabase Dashboard "Invite user" template as dead config → follow-up doc task (optional)
- Updating `CONTEXT.min.md` to reflect the Case A unification → follow-up doc task (mention in PR comment but don't block)
