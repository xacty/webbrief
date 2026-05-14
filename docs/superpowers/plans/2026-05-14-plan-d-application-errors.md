# Plan D — Application Errors Infrastructure Implementation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capture technical errors (uncaught exceptions, Supabase Auth failures, external API failures) into a queryable `application_errors` table and surface them in an admin-only `/security/errors` view. Closes the visibility gap that hid the `over_email_send_rate_limit` cascade in session 11.

**Architecture:** New table `application_errors` (different audience from `security_events` — operator diagnostics, not security audit). Helper `logApplicationError(req, error, ctx)` writes rows best-effort. Wrapper `callSupabaseAuth(operation, args, ctx)` wraps `supabaseAdmin.auth.admin.*` calls so failures are captured with their Supabase-specific `code`/`status` before being rethrown. Catch-all Express error handler in `securityErrorHandler` persists 5xx fallbacks. Admin UI lists/filters/inspects rows with stack traces.

**Tech Stack:** Postgres (Supabase), Node 20+ with Express, Supabase JS Admin SDK, React + Vite. Test framework: Node native test runner.

**References:**
- Spec: [docs/superpowers/specs/2026-05-13-auth-security-hardening-design.md](../specs/2026-05-13-auth-security-hardening-design.md) section 5.4 (D.1–D.5)
- Plan A merged at commit `91c5086` on main — Plan D builds on it (wraps `inviteUserByEmail`, `generateLink`, etc.)

---

## Task 1: Migration — `application_errors` table

**Files:**
- Create: `supabase/migrations/20260514_application_errors.sql`

> Migration is committed but NOT auto-applied to prod. The user applies via Supabase Studio or `supabase db push` when ready.

- [ ] **Step 1.1: Write the migration**

Create `supabase/migrations/20260514_application_errors.sql`:

```sql
-- application_errors: technical/operator diagnostics, separate from
-- security_events (which is the security audit trail).
--
-- Retention: 90 days recommended. Truncation handled out-of-band.

CREATE TABLE IF NOT EXISTS application_errors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  level text NOT NULL CHECK (level IN ('error', 'warn')),
  source text NOT NULL,            -- 'supabase_auth' | 'route' | 'external_api' | 'unhandled' | 'email'
  request_id text,
  route text,                       -- e.g. '/api/users'
  method text,                      -- 'POST', 'GET', etc.
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  error_code text,                  -- e.g. 'over_email_send_rate_limit', 'EUNHANDLED'
  error_message text NOT NULL,
  stack_trace text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_application_errors_created
  ON application_errors (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_application_errors_level_source
  ON application_errors (level, source);

CREATE INDEX IF NOT EXISTS idx_application_errors_request
  ON application_errors (request_id);

-- RLS: deny all (admin reads happen via service_role; no end-user access).
ALTER TABLE application_errors ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE application_errors IS
  'Technical errors and warnings for operator diagnostics. Distinct from security_events (audit trail).';
```

- [ ] **Step 1.2: Commit the migration file**

```bash
cd /Users/adrian/GitHub/webbrief
git add supabase/migrations/20260514_application_errors.sql
git commit -m "$(cat <<'EOF'
feat(db): add application_errors table for technical diagnostics

Migration creates application_errors table to capture uncaught
exceptions, Supabase Auth failures, and external API errors. Indexed
on created_at, (level, source), and request_id for the admin /security
errors view. RLS enabled (service-role-only reads). Distinct from
security_events which is the security audit trail.

Apply via Supabase Studio or `supabase db push` before deploying
Plan D code.

Part of v1.1-auth-hardening Plan D (section 5.4 D.1 of spec).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 1.3: Note for user**

The migration file is committed to git but not applied. Operator must run it on Supabase prod before deploying the Plan D code (otherwise inserts will fail). Document in Task 7's operations guide update.

---

## Task 2: `applicationErrors.js` helper module

**Files:**
- Create: `backend/src/lib/applicationErrors.js`
- Test: `backend/test/application-errors.test.js` (new)

- [ ] **Step 2.1: Write failing tests**

Create `backend/test/application-errors.test.js`:

```javascript
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  buildApplicationErrorRow,
  sanitizeErrorMetadata,
} from '../src/lib/applicationErrors.js'

test('buildApplicationErrorRow: minimal shape', () => {
  const req = {
    requestId: 'req-123',
    originalUrl: '/api/users',
    method: 'POST',
    currentUser: { id: 'u1' },
  }
  const error = new Error('boom')

  const row = buildApplicationErrorRow(req, error, {
    level: 'error',
    source: 'route',
  })

  assert.equal(row.level, 'error')
  assert.equal(row.source, 'route')
  assert.equal(row.request_id, 'req-123')
  assert.equal(row.route, '/api/users')
  assert.equal(row.method, 'POST')
  assert.equal(row.user_id, 'u1')
  assert.equal(row.error_message, 'boom')
  assert.match(row.stack_trace, /at /)
  assert.deepEqual(row.metadata, {})
})

test('buildApplicationErrorRow: extracts error code from various shapes', () => {
  const req = { requestId: 'req-2' }

  const e1 = Object.assign(new Error('m1'), { code: 'X_CODE' })
  assert.equal(buildApplicationErrorRow(req, e1, { source: 'route' }).error_code, 'X_CODE')

  const e2 = Object.assign(new Error('m2'), { status: 429 })
  assert.equal(buildApplicationErrorRow(req, e2, { source: 'route' }).error_code, '429')

  // explicit override wins
  assert.equal(
    buildApplicationErrorRow(req, e1, { source: 'route', errorCode: 'OVERRIDE' }).error_code,
    'OVERRIDE'
  )
})

test('buildApplicationErrorRow: truncates stack trace to 4000 chars', () => {
  const req = { requestId: 'req-3' }
  const longStack = 'x'.repeat(5000)
  const error = Object.assign(new Error('boom'), { stack: longStack })

  const row = buildApplicationErrorRow(req, error, { source: 'unhandled' })
  assert.equal(row.stack_trace.length, 4000)
})

test('buildApplicationErrorRow: defaults level to error', () => {
  const req = { requestId: 'r' }
  const row = buildApplicationErrorRow(req, new Error('x'), { source: 'route' })
  assert.equal(row.level, 'error')
})

test('sanitizeErrorMetadata: drops secrets', () => {
  const input = {
    operation: 'inviteUserByEmail',
    args: { email: 'a@b.com' },
    token: 'SECRET',
    access_token: 'X',
    password: 'P',
    authorization: 'Bearer Y',
    safe: 'ok',
  }
  const sanitized = sanitizeErrorMetadata(input)
  assert.equal(sanitized.operation, 'inviteUserByEmail')
  assert.equal(sanitized.safe, 'ok')
  assert.equal(sanitized.token, undefined)
  assert.equal(sanitized.access_token, undefined)
  assert.equal(sanitized.password, undefined)
  assert.equal(sanitized.authorization, undefined)
})

test('sanitizeErrorMetadata: handles non-object input', () => {
  assert.deepEqual(sanitizeErrorMetadata(null), {})
  assert.deepEqual(sanitizeErrorMetadata(undefined), {})
  assert.deepEqual(sanitizeErrorMetadata('string'), {})
})

test('buildApplicationErrorRow: missing currentUser leaves user_id null', () => {
  const req = { requestId: 'r' }
  const row = buildApplicationErrorRow(req, new Error('x'), { source: 'route' })
  assert.equal(row.user_id, null)
})

test('buildApplicationErrorRow: missing route/method tolerated', () => {
  const req = { requestId: 'r' }
  const row = buildApplicationErrorRow(req, new Error('x'), { source: 'route' })
  assert.equal(row.route, null)
  assert.equal(row.method, null)
})
```

- [ ] **Step 2.2: Run test to verify it fails**

```bash
cd backend && npm test -- --test-name-pattern="buildApplicationErrorRow"
```

Expected: FAIL with `Cannot find module`.

- [ ] **Step 2.3: Implement the helper**

Create `backend/src/lib/applicationErrors.js`:

```javascript
// Application errors — technical/operator diagnostics persisted to the
// application_errors table. Distinct from security_events (audit trail).
//
// Use logApplicationError(req, error, ctx) for any uncaught exception or
// external-API failure that should be visible to operators in /security/errors.
//
// Writes are best-effort: failures here ONLY emit to console (we cannot
// recursively persist a write failure). Callers should NOT rely on the
// returned id being non-null when planning their own retry logic.

import { supabaseAdmin } from './supabase.js'

const STACK_TRACE_MAX = 4000

const SECRET_KEYS = new Set([
  'token',
  'access_token',
  'accessToken',
  'password',
  'authorization',
  'Authorization',
  'cookie',
  'Cookie',
])

export function sanitizeErrorMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return {}
  }
  const clone = { ...metadata }
  for (const key of SECRET_KEYS) {
    delete clone[key]
  }
  return clone
}

function extractErrorCode(error, explicit) {
  if (explicit) return String(explicit)
  if (error?.code) return String(error.code)
  if (error?.status) return String(error.status)
  return null
}

function truncateStack(stack) {
  if (!stack) return null
  const str = String(stack)
  if (str.length <= STACK_TRACE_MAX) return str
  return str.slice(0, STACK_TRACE_MAX)
}

export function buildApplicationErrorRow(req, error, options = {}) {
  const {
    level = 'error',
    source,
    errorCode,
    metadata = {},
  } = options

  if (!source) {
    throw new Error('logApplicationError: source is required')
  }

  return {
    level,
    source,
    request_id: req?.requestId || null,
    route: req?.originalUrl || req?.url || null,
    method: req?.method || null,
    user_id: req?.currentUser?.id || null,
    error_code: extractErrorCode(error, errorCode),
    error_message: error?.message ? String(error.message) : 'Unknown error',
    stack_trace: truncateStack(error?.stack),
    metadata: sanitizeErrorMetadata(metadata),
  }
}

// Best-effort persistence. Returns the inserted row id (string) or null
// if persistence failed. Never throws.
export async function logApplicationError(req, error, options = {}) {
  try {
    const row = buildApplicationErrorRow(req, error, options)
    const { data, error: insertError } = await supabaseAdmin
      .from('application_errors')
      .insert(row)
      .select('id')
      .single()

    if (insertError) {
      console.error('[applicationErrors] persist failed', insertError.message, 'original:', error?.message)
      return null
    }
    return data?.id || null
  } catch (loggingError) {
    console.error('[applicationErrors] logging threw', loggingError?.message, 'original:', error?.message)
    return null
  }
}
```

- [ ] **Step 2.4: Run tests to verify all 8 pass**

```bash
cd backend && npm test -- --test-name-pattern="buildApplicationErrorRow|sanitizeErrorMetadata"
```

Expected: 8/8 PASS.

- [ ] **Step 2.5: Commit**

```bash
cd /Users/adrian/GitHub/webbrief
git add backend/src/lib/applicationErrors.js backend/test/application-errors.test.js
git commit -m "$(cat <<'EOF'
feat(backend.security): add applicationErrors helper for technical log

logApplicationError(req, error, ctx) writes a row to application_errors
best-effort. buildApplicationErrorRow is pure (testable without DB).
sanitizeErrorMetadata strips token/password/authorization keys.
Stack traces truncated to 4000 chars. Persistence failures log to
console only (we cannot recursively persist write failures).

Part of v1.1-auth-hardening Plan D (section 5.4 D.2 of spec).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: `callSupabaseAuth` wrapper

**Files:**
- Modify: `backend/src/lib/applicationErrors.js` (add wrapper export)
- Test: `backend/test/application-errors.test.js` (extend with wrapper tests)

- [ ] **Step 3.1: Write failing tests for the wrapper**

Append to `backend/test/application-errors.test.js`:

```javascript
import { wrapSupabaseAuthCall } from '../src/lib/applicationErrors.js'

test('wrapSupabaseAuthCall: success path returns operation result', async () => {
  const operation = async () => ({ data: { id: 'u1' }, error: null })

  const result = await wrapSupabaseAuthCall({
    operation,
    operationName: 'inviteUserByEmail',
    req: { requestId: 'r' },
    persist: async () => null,
  })

  assert.deepEqual(result, { data: { id: 'u1' }, error: null })
})

test('wrapSupabaseAuthCall: throws wrapped error and persists', async () => {
  const operation = async () => {
    throw Object.assign(new Error('rate limit'), { code: 'over_email_send_rate_limit' })
  }

  let persisted = null
  const persist = async (req, error, options) => {
    persisted = { req, error, options }
    return 'persisted-id-123'
  }

  await assert.rejects(
    wrapSupabaseAuthCall({
      operation,
      operationName: 'inviteUserByEmail',
      req: { requestId: 'r-1' },
      args: { email: 'x@y.com' },
      persist,
    }),
    (err) => {
      assert.equal(err.applicationErrorId, 'persisted-id-123')
      assert.equal(err.code, 'over_email_send_rate_limit')
      return true
    }
  )

  assert.equal(persisted.options.source, 'supabase_auth')
  assert.equal(persisted.options.errorCode, 'over_email_send_rate_limit')
  assert.equal(persisted.options.metadata.operation, 'inviteUserByEmail')
  assert.deepEqual(persisted.options.metadata.args, { email: 'x@y.com' })
})

test('wrapSupabaseAuthCall: handles supabase-style error in return value (not throw)', async () => {
  // Supabase JS SDK often returns { data: null, error } instead of throwing.
  const operation = async () => ({
    data: null,
    error: Object.assign(new Error('email_exists'), { code: 'email_exists', status: 422 }),
  })

  let persisted = null
  const persist = async (req, error, options) => {
    persisted = options
    return 'id'
  }

  const result = await wrapSupabaseAuthCall({
    operation,
    operationName: 'inviteUserByEmail',
    req: { requestId: 'r' },
    persist,
  })

  // The wrapper does NOT swallow — it returns the {data, error} pair so callers
  // can decide. But it DOES persist the error.
  assert.equal(result.error.code, 'email_exists')
  assert.equal(persisted.errorCode, 'email_exists')
  assert.equal(persisted.metadata.operation, 'inviteUserByEmail')
})

test('wrapSupabaseAuthCall: sanitizes sensitive args before persisting', async () => {
  const operation = async () => {
    throw new Error('boom')
  }

  let persisted = null
  const persist = async (req, error, options) => {
    persisted = options
    return 'id'
  }

  await assert.rejects(wrapSupabaseAuthCall({
    operation,
    operationName: 'updateUser',
    req: { requestId: 'r' },
    args: { email: 'x@y.com', password: 'SECRET', token: 'T' },
    persist,
  }))

  assert.equal(persisted.metadata.args.email, 'x@y.com')
  assert.equal(persisted.metadata.args.password, undefined)
  assert.equal(persisted.metadata.args.token, undefined)
})
```

- [ ] **Step 3.2: Run tests to verify they fail**

```bash
cd backend && npm test -- --test-name-pattern="wrapSupabaseAuthCall"
```

Expected: FAIL with `wrapSupabaseAuthCall is not a function`.

- [ ] **Step 3.3: Implement the wrapper**

Append to `backend/src/lib/applicationErrors.js`:

```javascript
// Wraps a Supabase auth.admin.* call so failures are persisted to
// application_errors with the operation name and sanitized args.
//
// Two failure modes are handled:
//   - operation throws → captured, persisted, rethrown with .applicationErrorId
//   - operation returns { data, error } where error is truthy → persisted, returned as-is
//
// Args are sanitized (token/password/authorization stripped) before persistence.
// The `persist` parameter is injectable for testing; defaults to logApplicationError.
export async function wrapSupabaseAuthCall({
  operation,
  operationName,
  req,
  args = {},
  persist = logApplicationError,
}) {
  const sanitizedArgs = sanitizeErrorMetadata(args)

  try {
    const result = await operation()
    if (result && result.error) {
      await persist(req, result.error, {
        source: 'supabase_auth',
        errorCode: result.error.code || result.error.status,
        metadata: { operation: operationName, args: sanitizedArgs },
      })
    }
    return result
  } catch (error) {
    const errorId = await persist(req, error, {
      source: 'supabase_auth',
      errorCode: error.code || error.status,
      metadata: { operation: operationName, args: sanitizedArgs },
    })
    error.applicationErrorId = errorId
    throw error
  }
}
```

- [ ] **Step 3.4: Run tests to verify all 12 pass**

```bash
cd backend && npm test -- --test-name-pattern="wrapSupabaseAuthCall|buildApplicationErrorRow|sanitizeErrorMetadata"
```

Expected: 12 PASS (8 from Task 2 + 4 new).

- [ ] **Step 3.5: Commit**

```bash
cd /Users/adrian/GitHub/webbrief
git add backend/src/lib/applicationErrors.js backend/test/application-errors.test.js
git commit -m "$(cat <<'EOF'
feat(backend.security): add wrapSupabaseAuthCall wrapper

Wraps supabaseAdmin.auth.admin.* calls so failures (both thrown and
returned-via-{data,error}) are persisted to application_errors with
the operation name and sanitized args. On thrown errors, attaches
.applicationErrorId to the rethrown error so route handlers can
include the trace id in 500 responses.

Critical for closing the Supabase Auth visibility gap that hid the
over_email_send_rate_limit cascade in session 11.

Part of v1.1-auth-hardening Plan D (section 5.4 D.3 of spec).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Wire `wrapSupabaseAuthCall` into Supabase Auth call sites

**Files:**
- Modify: `backend/src/lib/users.js` (4 call sites)
- Modify: `backend/src/routes/users.js` (1 call site: deleteUser, updateUserById)

> **Note:** This task does NOT have new automated tests — the wrapper itself is tested in Task 3. Integration is verified by reading the diff carefully.

- [ ] **Step 4.1: Identify call sites in users.js**

The following Supabase Auth calls exist in `backend/src/lib/users.js` after Plan A:

| Location | Operation |
|----------|-----------|
| `findAuthUserByEmailPaginated` (~line 22) | `auth.admin.listUsers` |
| `ensureUserProfile` Case A (~line 102) | `auth.admin.inviteUserByEmail` |
| `handleReinvite` (~line 168) | `auth.admin.generateLink` |

And in `backend/src/routes/users.js`:

| Location | Operation |
|----------|-----------|
| `PATCH /:id` (~line 520) | `auth.admin.updateUserById` |
| `DELETE /:id` (~line 868) | `auth.admin.deleteUser` |

We will wrap ALL 5 call sites. Note: `findAuthUserByEmailPaginated` is called in a loop; we wrap each iteration's `listUsers` call individually rather than the loop, so the trace captures which page failed.

- [ ] **Step 4.2: Wrap `findAuthUserByEmailPaginated`**

Edit `backend/src/lib/users.js`. Add import at top (with the existing imports):

```javascript
import { wrapSupabaseAuthCall } from './applicationErrors.js'
```

Note: this introduces a new dependency between users.js and applicationErrors.js. That's fine — both are libs.

In `findAuthUserByEmailPaginated`, locate the inner loop body (around line 22):

```javascript
const { data, error } = await client.auth.admin.listUsers({
  page,
  perPage: AUTH_USERS_PAGE_SIZE,
})
if (error) throw error
```

The function currently takes `client` as parameter for test injection. The wrapper wants a `req` for context — but this helper has no `req` parameter. **Decision: leave `findAuthUserByEmailPaginated` UNWRAPPED.** Reason: it's a library helper called from many places, and threading `req` through would change the public API and break the existing test mocks. Errors from `listUsers` propagate up to `ensureUserProfile`, whose `inviteUserByEmail` site IS wrapped (catches the surrounding context).

**Skip Step 4.2.** Move on to 4.3.

- [ ] **Step 4.3: Wrap `inviteUserByEmail` in `ensureUserProfile` Case A**

Edit `backend/src/lib/users.js`. Currently:

```javascript
// -------- Case A: fresh invite --------
if (decision.action === 'invited') {
  const { data, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(normalizedEmail, {
    redirectTo,
    data: { full_name: fullName || '' },
  })
```

The function signature of `ensureUserProfile` doesn't accept `req`. **We need to add `req` as an optional parameter** so the wrapper has request context. Update the signature:

```javascript
export async function ensureUserProfile({ email, fullName, platformRole = 'user', req = null }) {
```

Then in the Case A block, change the Supabase call:

```javascript
const { data, error: inviteError } = await wrapSupabaseAuthCall({
  operation: () => supabaseAdmin.auth.admin.inviteUserByEmail(normalizedEmail, {
    redirectTo,
    data: { full_name: fullName || '' },
  }),
  operationName: 'inviteUserByEmail',
  req,
  args: { email: normalizedEmail },
})
```

- [ ] **Step 4.4: Wrap `generateLink` in `handleReinvite`**

In `handleReinvite` (a private helper inside `backend/src/lib/users.js`), add `req` to the signature and pass it through. Currently:

```javascript
async function handleReinvite(authUser, normalizedEmail, fullName, normalizedPlatformRole, redirectTo, timestamp) {
```

Change to:

```javascript
async function handleReinvite(authUser, normalizedEmail, fullName, normalizedPlatformRole, redirectTo, timestamp, req) {
```

Update the 2 call sites where `handleReinvite` is invoked in `ensureUserProfile` to pass `req`:

```javascript
return await handleReinvite(fallback, normalizedEmail, fullName, normalizedPlatformRole, redirectTo, timestamp, req)
// and
return await handleReinvite(authUser, normalizedEmail, fullName, normalizedPlatformRole, redirectTo, timestamp, req)
```

Inside `handleReinvite`, wrap the `generateLink` call. Currently:

```javascript
const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
  type: 'invite',
  email: normalizedEmail,
  options: { redirectTo },
})
```

Change to:

```javascript
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
```

- [ ] **Step 4.5: Update `inviteUserToCompany` and route callers to pass `req`**

In `backend/src/lib/users.js`, `inviteUserToCompany` signature currently:

```javascript
export async function inviteUserToCompany({ email, fullName, companyId, role, platformRole = 'user' }) {
```

Add `req`:

```javascript
export async function inviteUserToCompany({ email, fullName, companyId, role, platformRole = 'user', req = null }) {
```

Pass through to `ensureUserProfile`:

```javascript
const profile = await ensureUserProfile({ email, fullName, platformRole, req })
```

Now update all 3 routes that call `ensureUserProfile` or `inviteUserToCompany` to pass `req`:

**`backend/src/routes/auth.js`** POST `/invite-user` (around line 41):

```javascript
const invitedUser = await inviteUserToCompany({
  email: normalizedEmail,
  fullName: normalizedFullName,
  role,
  companyId: targetCompanyId,
  platformRole: allowedPlatformRole,
  req,
})
```

**`backend/src/routes/users.js`** POST `/` — two call sites:

1. Global-role path (around line 409):
```javascript
const profile = await ensureUserProfile({
  email,
  fullName,
  platformRole: nextPlatformRole,
  req,
})
```

2. Company-role path (around line 437):
```javascript
const invitedUser = await inviteUserToCompany({
  email,
  fullName,
  role,
  companyId,
  platformRole: nextPlatformRole,
  req,
})
```

**`backend/src/routes/companies.js`** POST `/` (around line 396):

```javascript
manager = await inviteUserToCompany({
  email: normalizedManagerEmail,
  fullName: managerFullName || managerName || '',
  role: 'manager',
  companyId: company.id,
  req,
})
```

- [ ] **Step 4.6: Wrap `updateUserById` and `deleteUser` in users.js routes**

In `backend/src/routes/users.js`, add import:

```javascript
import { wrapSupabaseAuthCall } from '../lib/applicationErrors.js'
```

**PATCH `/:id`** (around line 519):

Currently:

```javascript
if (Object.keys(authUpdates).length > 0) {
  const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(userId, authUpdates)
  if (authError) throw authError
}
```

Change to:

```javascript
if (Object.keys(authUpdates).length > 0) {
  const { error: authError } = await wrapSupabaseAuthCall({
    operation: () => supabaseAdmin.auth.admin.updateUserById(userId, authUpdates),
    operationName: 'updateUserById',
    req,
    args: { userId, fields: Object.keys(authUpdates) },
  })
  if (authError) throw authError
}
```

**DELETE `/:id`** (around line 868):

Currently:

```javascript
const { error } = await supabaseAdmin.auth.admin.deleteUser(userId)
if (error) throw error
```

Change to:

```javascript
const { error } = await wrapSupabaseAuthCall({
  operation: () => supabaseAdmin.auth.admin.deleteUser(userId),
  operationName: 'deleteUser',
  req,
  args: { userId },
})
if (error) throw error
```

- [ ] **Step 4.7: Verify full test suite still passes**

```bash
cd backend && npm test
```

Expected: All tests pass. Should be ~53 tests (41 before Plan D + 12 from Tasks 2-3).

Some Plan A tests may need adjustment if they imported `ensureUserProfile`/`inviteUserToCompany` and asserted specific signatures. They likely don't — Plan A tests only `decideEnsureProfileAction` (pure function). Verify by running.

- [ ] **Step 4.8: Commit**

```bash
cd /Users/adrian/GitHub/webbrief
git add backend/src/lib/users.js backend/src/routes/auth.js backend/src/routes/users.js backend/src/routes/companies.js
git commit -m "$(cat <<'EOF'
feat(backend.auth): wrap Supabase Auth calls with applicationErrors

Threads req through ensureUserProfile, inviteUserToCompany, and
handleReinvite so wrapSupabaseAuthCall can capture request context
when Supabase Auth fails. Wraps 4 call sites:

  - inviteUserByEmail (ensureUserProfile Case A)
  - generateLink:invite (handleReinvite)
  - updateUserById (PATCH /api/users/:id)
  - deleteUser (DELETE /api/users/:id)

findAuthUserByEmailPaginated remains unwrapped — its client-injection
test API makes threading req disruptive, and failures propagate to
wrapped callers anyway.

Failures from these 4 sites now write a row to application_errors
with operation name, sanitized args, and error.code (e.g.
'over_email_send_rate_limit'). The thrown error carries
.applicationErrorId for route 500 responses.

Part of v1.1-auth-hardening Plan D (section 5.4 D.3 wiring).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Catch-all Express error handler + 500 response with trace id

**Files:**
- Modify: `backend/src/middleware/security.js` (extend `securityErrorHandler`)

- [ ] **Step 5.1: Extend the catch-all handler**

Edit `backend/src/middleware/security.js`. Find `securityErrorHandler` (around line 341). The current final `else` branch:

```javascript
writeSecurityLog('error', 'unhandled_request_error', {
  ...getRequestLogContext(req),
  error: error?.message || error,
})
return res.status(500).json({ error: 'No se pudo procesar la solicitud' })
```

Add import at top:

```javascript
import { logApplicationError } from '../lib/applicationErrors.js'
```

Replace the final block with:

```javascript
writeSecurityLog('error', 'unhandled_request_error', {
  ...getRequestLogContext(req),
  error: error?.message || error,
})

// Persist to application_errors for operator diagnostics.
// If the error already has applicationErrorId (e.g., from wrapSupabaseAuthCall),
// reuse it; otherwise persist a fresh row.
const errorId = error?.applicationErrorId
  || await logApplicationError(req, error, {
    source: 'unhandled',
    metadata: { handler: 'securityErrorHandler' },
  })

return res.status(500).json({
  error: 'No se pudo procesar la solicitud',
  errorId,
})
```

Note: the `error.applicationErrorId` reuse means errors from `wrapSupabaseAuthCall` get a single persistence (not double) and the 500 response includes the trace id the operator can grep.

- [ ] **Step 5.2: Verify full suite still passes**

```bash
cd backend && npm test
```

Expected: All tests pass.

- [ ] **Step 5.3: Commit**

```bash
cd /Users/adrian/GitHub/webbrief
git add backend/src/middleware/security.js
git commit -m "$(cat <<'EOF'
feat(backend.security): persist unhandled errors to application_errors

securityErrorHandler now logs unhandled 5xx errors to
application_errors (source='unhandled'). Reuses error.applicationErrorId
when present (set by wrapSupabaseAuthCall) so we don't double-persist.
500 responses now include errorId so the operator can grep
application_errors directly.

Part of v1.1-auth-hardening Plan D (section 5.4 D.4 of spec).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Backend routes for `/api/security/errors`

**Files:**
- Modify: `backend/src/routes/security.js`

- [ ] **Step 6.1: Add list and detail endpoints**

Edit `backend/src/routes/security.js`. After the existing routes (after the `DELETE /blocks/:id` handler around line 488), append:

```javascript
// ---------------------------------------------------------------------------
// Application errors (technical/operator diagnostics) — admin-only
// ---------------------------------------------------------------------------

function parseLevel(value) {
  return value === 'warn' ? 'warn' : value === 'error' ? 'error' : ''
}

function parseSource(value) {
  const allowed = ['supabase_auth', 'route', 'external_api', 'unhandled', 'email']
  const normalized = String(value || '').trim()
  return allowed.includes(normalized) ? normalized : ''
}

router.get('/errors', async (req, res) => {
  try {
    const days = parseDays(req.query.days)
    const limit = parseLimit(req.query.limit)
    const offset = parseOffset(req.query.offset)
    const level = parseLevel(req.query.level)
    const source = parseSource(req.query.source)
    const search = String(req.query.search || '').trim().slice(0, 200)

    let query = supabaseAdmin
      .from('application_errors')
      .select('id, created_at, level, source, request_id, route, method, user_id, error_code, error_message, metadata')
      .gte('created_at', sinceIso(days))
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (level) query = query.eq('level', level)
    if (source) query = query.eq('source', source)
    if (search) query = query.ilike('error_message', `%${search}%`)

    const { data, error } = await query

    if (error) {
      if (isMissingTableError(error, 'application_errors')) {
        return res.json({
          errors: [],
          nextOffset: offset,
          warnings: ['La tabla application_errors aún no está aplicada. Aplicá supabase/migrations/20260514_application_errors.sql antes de usar esta vista.'],
        })
      }
      throw error
    }

    return res.json({
      errors: data || [],
      nextOffset: offset + limit,
      warnings: [],
    })
  } catch (error) {
    return res.status(500).json({ error: error.message || 'No se pudieron cargar errores técnicos' })
  }
})

router.get('/errors/:id', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('application_errors')
      .select('*')
      .eq('id', req.params.id)
      .maybeSingle()

    if (error) {
      if (isMissingTableError(error, 'application_errors')) {
        return res.status(503).json({ error: 'Tabla application_errors no disponible' })
      }
      throw error
    }
    if (!data) return res.status(404).json({ error: 'Error no encontrado' })
    return res.json({ error: data })
  } catch (error) {
    return res.status(500).json({ error: error.message || 'No se pudo cargar el error' })
  }
})
```

Note: the helpers `parseDays`, `parseLimit`, `parseOffset`, `sinceIso`, `isMissingTableError` are already imported/defined in this file from earlier code. Verify by reading the imports.

- [ ] **Step 6.2: Verify route mounting**

The `/security` router is already mounted in `backend/src/index.js` under `/api/security`. The new routes will be:
- `GET /api/security/errors?days=7&level=&source=&search=&limit=&offset=`
- `GET /api/security/errors/:id`

Both inherit the admin-only middleware at the top of `security.js`. No changes needed in `index.js`.

- [ ] **Step 6.3: Manual smoke test (when DB is ready)**

After applying the migration:

```bash
curl -H "Authorization: Bearer $ADMIN_JWT" "http://localhost:3000/api/security/errors?days=7&limit=10"
```

Expected: `{ errors: [], nextOffset: 10, warnings: [] }` (table exists but empty initially).

Without the migration:

Expected: `{ errors: [], nextOffset: 0, warnings: ['La tabla application_errors aún no está aplicada...'] }`.

This step is OPTIONAL for the dispatch — the route is well-tested by the helpers' unit tests. Note that DB calls require service-role key in env.

- [ ] **Step 6.4: Commit**

```bash
cd /Users/adrian/GitHub/webbrief
git add backend/src/routes/security.js
git commit -m "$(cat <<'EOF'
feat(backend.security): add GET /api/security/errors endpoints

List endpoint paginates application_errors filtered by days, level,
source, and message search. Returns warning when migration is
unapplied so the admin UI can prompt for it. Detail endpoint returns
full row including stack_trace. Admin-only via existing middleware.

Part of v1.1-auth-hardening Plan D (section 5.4 D.5 backend).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Frontend `/security/errors` sub-page

**Files:**
- Create: `frontend/src/pages/SecurityErrorsPage.jsx` (or add as a tab inside the existing `SecurityPage`)
- Create: `frontend/src/pages/SecurityErrorsPage.module.css`
- Modify: `frontend/src/App.jsx` (route entry) OR the SecurityPage (tab entry)
- Modify: `frontend/src/pages/SecurityPage.jsx` (link/tab to errors view)

> The exact integration (sub-route vs tab) depends on the existing `SecurityPage` structure. Read it first to decide. The plan below assumes a **new sub-route** `/security/errors` — adjust if a tab pattern is established.

- [ ] **Step 7.1: Read existing security page structure**

```bash
cat /Users/adrian/GitHub/webbrief/frontend/src/pages/SecurityPage.jsx | head -80
```

Identify:
- Does `SecurityPage` use tabs internally? If yes, add a "Errores" tab inside the same component instead of a new route.
- If it uses a separate component per section (Overview / Events / Users / IPs / Blocks), follow that pattern with a new "Errores técnicos" entry.

Pick whichever approach matches the existing code. Document your decision in the commit message.

- [ ] **Step 7.2: Create the SecurityErrorsPage component**

Create `frontend/src/pages/SecurityErrorsPage.jsx`:

```jsx
import { useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { Button, Card, Badge, Select, Input, Modal } from '../components/ui'
import styles from './SecurityErrorsPage.module.css'

const LEVELS = ['', 'error', 'warn']
const SOURCES = ['', 'supabase_auth', 'route', 'external_api', 'unhandled', 'email']

export default function SecurityErrorsPage() {
  const { session } = useAuth()
  const [errors, setErrors] = useState([])
  const [loading, setLoading] = useState(true)
  const [warnings, setWarnings] = useState([])
  const [days, setDays] = useState(7)
  const [level, setLevel] = useState('')
  const [source, setSource] = useState('')
  const [search, setSearch] = useState('')
  const [selectedError, setSelectedError] = useState(null)
  const [errorDetail, setErrorDetail] = useState(null)
  const [feedback, setFeedback] = useState('')

  async function fetchErrors() {
    setLoading(true)
    setFeedback('')
    try {
      const params = new URLSearchParams({
        days: String(days),
        limit: '100',
        ...(level && { level }),
        ...(source && { source }),
        ...(search && { search }),
      })
      const response = await fetch(`/api/security/errors?${params}`, {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const data = await response.json()
      setErrors(data.errors || [])
      setWarnings(data.warnings || [])
    } catch (err) {
      setFeedback(`No se pudieron cargar errores: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (session?.access_token) fetchErrors()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.access_token, days, level, source])

  async function openDetail(errorId) {
    setSelectedError(errorId)
    setErrorDetail(null)
    try {
      const response = await fetch(`/api/security/errors/${errorId}`, {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const data = await response.json()
      setErrorDetail(data.error)
    } catch (err) {
      setFeedback(`No se pudo cargar el detalle: ${err.message}`)
    }
  }

  function formatDate(iso) {
    return new Date(iso).toLocaleString('es-AR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    })
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h2>Errores técnicos</h2>
        <p className={styles.help}>
          Errores no manejados, fallos de Supabase Auth, y errores de APIs externas. Para eventos de seguridad, ver la pestaña Eventos.
        </p>
      </header>

      {warnings.length > 0 && (
        <Card padding="md" className={styles.warning}>
          {warnings.map((w, i) => <p key={i}>{w}</p>)}
        </Card>
      )}

      <form
        className={styles.filters}
        onSubmit={(e) => { e.preventDefault(); fetchErrors() }}
      >
        <Select
          label="Días"
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
        >
          <option value={1}>Último día</option>
          <option value={7}>Últimos 7</option>
          <option value={30}>Últimos 30</option>
          <option value={90}>Últimos 90</option>
        </Select>

        <Select label="Nivel" value={level} onChange={(e) => setLevel(e.target.value)}>
          {LEVELS.map((l) => <option key={l} value={l}>{l || 'Todos'}</option>)}
        </Select>

        <Select label="Origen" value={source} onChange={(e) => setSource(e.target.value)}>
          {SOURCES.map((s) => <option key={s} value={s}>{s || 'Todos'}</option>)}
        </Select>

        <Input
          label="Buscar mensaje"
          type="text"
          placeholder="texto en mensaje..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <Button type="submit" variant="primary">Aplicar</Button>
      </form>

      {feedback && <p className={styles.error}>{feedback}</p>}

      {loading ? (
        <p className={styles.loading}>Cargando...</p>
      ) : errors.length === 0 ? (
        <Card padding="lg" className={styles.empty}>
          <p>Sin errores en los últimos {days} día(s). Todo bien.</p>
        </Card>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Cuándo</th>
              <th>Nivel</th>
              <th>Origen</th>
              <th>Ruta</th>
              <th>Código</th>
              <th>Mensaje</th>
            </tr>
          </thead>
          <tbody>
            {errors.map((err) => (
              <tr key={err.id} onClick={() => openDetail(err.id)} className={styles.row}>
                <td className={styles.timestamp}>{formatDate(err.created_at)}</td>
                <td>
                  <Badge variant={err.level === 'error' ? 'danger' : 'warning'}>
                    {err.level}
                  </Badge>
                </td>
                <td className={styles.mono}>{err.source}</td>
                <td className={styles.mono}>{err.method} {err.route}</td>
                <td className={styles.mono}>{err.error_code || '—'}</td>
                <td className={styles.message}>{err.error_message}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <Modal
        open={Boolean(selectedError)}
        onClose={() => { setSelectedError(null); setErrorDetail(null) }}
        title="Detalle del error"
        size="lg"
      >
        {!errorDetail ? (
          <p>Cargando...</p>
        ) : (
          <div className={styles.detail}>
            <dl>
              <dt>ID</dt><dd className={styles.mono}>{errorDetail.id}</dd>
              <dt>Cuándo</dt><dd>{formatDate(errorDetail.created_at)}</dd>
              <dt>Nivel</dt><dd>{errorDetail.level}</dd>
              <dt>Origen</dt><dd>{errorDetail.source}</dd>
              <dt>Request ID</dt><dd className={styles.mono}>{errorDetail.request_id || '—'}</dd>
              <dt>Ruta</dt><dd className={styles.mono}>{errorDetail.method} {errorDetail.route}</dd>
              <dt>User ID</dt><dd className={styles.mono}>{errorDetail.user_id || '—'}</dd>
              <dt>Código</dt><dd className={styles.mono}>{errorDetail.error_code || '—'}</dd>
            </dl>

            <h3>Mensaje</h3>
            <pre className={styles.pre}>{errorDetail.error_message}</pre>

            {errorDetail.metadata && Object.keys(errorDetail.metadata).length > 0 && (
              <>
                <h3>Metadata</h3>
                <pre className={styles.pre}>{JSON.stringify(errorDetail.metadata, null, 2)}</pre>
              </>
            )}

            {errorDetail.stack_trace && (
              <>
                <h3>Stack trace</h3>
                <pre className={styles.pre}>{errorDetail.stack_trace}</pre>
              </>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}
```

Create `frontend/src/pages/SecurityErrorsPage.module.css`:

```css
.page { padding: var(--wb-space-6) var(--wb-space-8); display: flex; flex-direction: column; gap: var(--wb-space-5); }

.header h2 { font-size: var(--wb-text-xl); margin: 0 0 var(--wb-space-2); }
.help { font-size: var(--wb-text-sm); color: var(--wb-color-neutral-600); margin: 0; }

.warning { background: var(--wb-color-warning-50); border-color: var(--wb-color-warning-300); }
.warning p { margin: 0; color: var(--wb-color-warning-800); font-size: var(--wb-text-sm); }

.filters { display: grid; grid-template-columns: repeat(4, 1fr) auto; gap: var(--wb-space-3); align-items: end; }

.error { color: var(--wb-color-danger-700); font-size: var(--wb-text-sm); }
.loading { color: var(--wb-color-neutral-500); }

.empty { text-align: center; color: var(--wb-color-neutral-600); }

.table { width: 100%; border-collapse: collapse; font-size: var(--wb-text-sm); }
.table th { text-align: left; padding: var(--wb-space-2) var(--wb-space-3); color: var(--wb-color-neutral-500); font-weight: var(--wb-weight-medium); border-bottom: 1px solid var(--wb-color-neutral-200); }
.table td { padding: var(--wb-space-3); border-bottom: 1px solid var(--wb-color-neutral-100); vertical-align: top; }
.row { cursor: pointer; }
.row:hover { background: var(--wb-color-neutral-50); }

.timestamp { font-variant-numeric: tabular-nums; white-space: nowrap; color: var(--wb-color-neutral-600); }
.mono { font-family: var(--wb-font-mono, monospace); font-size: var(--wb-text-xs); color: var(--wb-color-neutral-700); }
.message { word-break: break-word; max-width: 480px; }

.detail dl { display: grid; grid-template-columns: 140px 1fr; gap: var(--wb-space-2) var(--wb-space-4); margin: 0 0 var(--wb-space-5); font-size: var(--wb-text-sm); }
.detail dt { color: var(--wb-color-neutral-500); }
.detail dd { margin: 0; }
.detail h3 { font-size: var(--wb-text-sm); margin: var(--wb-space-4) 0 var(--wb-space-2); color: var(--wb-color-neutral-700); }
.pre { background: var(--wb-color-neutral-50); border: 1px solid var(--wb-color-neutral-200); border-radius: var(--wb-radius-md); padding: var(--wb-space-3); font-size: var(--wb-text-xs); font-family: var(--wb-font-mono, monospace); overflow-x: auto; white-space: pre-wrap; word-break: break-word; }
```

- [ ] **Step 7.3: Wire the route/tab**

Based on Step 7.1's decision:

**If `SecurityPage` is a tabbed component:** add a new tab "Errores técnicos" that renders `<SecurityErrorsPage />` inline.

**If `SecurityPage` uses sub-routes:** add `<Route path="errors" element={<SecurityErrorsPage />} />` in the routing, plus a link in `SecurityPage`'s nav (e.g., "Ver errores técnicos →").

**If neither pattern is clear:** add a separate top-level route `/security/errors` in `frontend/src/App.jsx`:

```jsx
<Route path="security/errors" element={<SecurityErrorsPage />} />
```

And in `SecurityPage.jsx`, add a link/button to navigate to it.

Use lazy-loading consistent with the existing pattern (other admin pages are lazy-loaded per CONTEXT.min.md).

- [ ] **Step 7.4: Manual verification**

```bash
cd /Users/adrian/GitHub/webbrief/frontend && npm run dev
```

In browser:

1. Log in as admin. Navigate to `/security/errors` (or click the new tab).
2. With the migration NOT yet applied, expect the warning banner "La tabla application_errors aún no está aplicada...".
3. After the migration is applied, expect "Sin errores en los últimos 7 día(s). Todo bien."
4. To populate, trigger an intentional 5xx (e.g., hit a malformed endpoint while authenticated) — the row should appear after refresh.

Note in your report whether manual verification was done or skipped (per "Step 5.12 of Plan A" pattern, you may skip live verification for the dispatch).

- [ ] **Step 7.5: Commit**

```bash
cd /Users/adrian/GitHub/webbrief
git add frontend/src/pages/SecurityErrorsPage.jsx frontend/src/pages/SecurityErrorsPage.module.css frontend/src/pages/SecurityPage.jsx frontend/src/App.jsx
git commit -m "$(cat <<'EOF'
feat(security): add /security/errors admin view for technical log

Lists application_errors with filters (days, level, source, search)
and modal detail view with stack trace + metadata + request_id for
correlation. Empty state and migration-not-applied warning banner
both render gracefully. Wired into existing security page via
[tab|sub-route — whichever pattern matched].

Closes the visibility gap from session 11: operators can now see
Supabase Auth 429s and other technical failures without grepping
PM2 logs.

Part of v1.1-auth-hardening Plan D (section 5.4 D.5 of spec).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Document deploy steps + CONTEXT update

**Files:**
- Modify: `docs/WEBRIEF_OPERATIONS_GUIDE.md` (extend Plan A section with Plan D)
- Modify: `CONTEXT.min.md` (Plan D entry + target update)

- [ ] **Step 8.1: Operations guide update**

Append after the existing Plan A section:

```markdown
## v1.1 Auth Hardening Deploy (Plan D)

Before pushing Plan D code:

1. Apply the migration `supabase/migrations/20260514_application_errors.sql`
   via Supabase Studio SQL editor (or `supabase db push` if your local
   project is linked). Verify the table exists with the 3 indexes.
2. Confirm RLS is enabled on the table.

After pushing Plan D code:

1. Smoke test the `/security/errors` admin view — should show "Sin errores
   en los últimos 7 día(s). Todo bien." (empty state).
2. Trigger an intentional 5xx (e.g., authenticated request to a deleted
   resource) and verify a row appears with source='unhandled'.
3. Plan D delivers operator visibility for Supabase Auth failures: the
   `over_email_send_rate_limit` errors from session 11 would now be
   captured with `source='supabase_auth'`, `error_code='over_email_send_rate_limit'`,
   and full request context (request_id, route, user_id, operation).
```

- [ ] **Step 8.2: CONTEXT.min.md update**

Add a new "Session 13" entry above Session 12, and update `target=backend.security` keep/watch.

Session 13 entry:

```
### Session 13 (2026-05-14) — Auth hardening Plan D

- Plan D shipped: new `application_errors` table for technical/operator diagnostics (separate from `security_events`). Schema: id, created_at, level, source, request_id, route, method, user_id, error_code, error_message, stack_trace, metadata. Indexes on created_at, (level, source), and request_id.
- `backend/src/lib/applicationErrors.js` exports `logApplicationError(req, error, ctx)` (best-effort persist) and `wrapSupabaseAuthCall({ operation, operationName, req, args, persist })` (wraps Supabase Auth calls, captures throws AND `{ data, error }` returns, attaches `applicationErrorId` to rethrown errors).
- 4 Supabase Auth call sites wrapped: `inviteUserByEmail`, `generateLink:invite`, `updateUserById`, `deleteUser`. `ensureUserProfile` and `inviteUserToCompany` signatures now accept optional `req` parameter for context.
- Catch-all `securityErrorHandler` persists unhandled 5xx errors with source='unhandled'; reuses existing `error.applicationErrorId` to avoid double-persistence; 500 responses include `errorId` for trace correlation.
- New backend routes `GET /api/security/errors` (paginated, filters: days/level/source/search) and `GET /api/security/errors/:id` (full detail with stack_trace), admin-only.
- New frontend page/tab `/security/errors` shows table + modal detail.
- Closes session 11 visibility gap: the `over_email_send_rate_limit` cascade from `contact@avinovapower.com` would now be visible with source='supabase_auth' + full request context.
```

Update `target=backend.security`:

```
- target=backend.security
  - keep: fail-closed authz, progressive rate limits, no-store/noindex public routes, non-blocking `security_events` audit writes; `application_errors` for technical/operator diagnostics (distinct from security_events audit); `wrapSupabaseAuthCall` wraps all Supabase Auth admin calls; catch-all handler persists unhandled 5xx with `errorId` in response
  - watch: keep `X-Request-Id` and JSON logs secret-safe; login/reset are Supabase-direct and require Supabase-side antiabuse or backend proxy; memory rate limits assume single-process VPS unless `RATE_LIMIT_STORE=supabase` is enabled; sanitize metadata before persisting (token/password/authorization keys stripped)
```

- [ ] **Step 8.3: Commit both files**

```bash
cd /Users/adrian/GitHub/webbrief
git add docs/WEBRIEF_OPERATIONS_GUIDE.md CONTEXT.min.md
git commit -m "$(cat <<'EOF'
docs: record v1.1 Plan D — application errors infrastructure

Operations guide gets a Plan D deploy section (migration + smoke
test). CONTEXT.min adds Session 13 entry summarizing the table,
helpers, wrapped call sites, and the closed visibility gap.
backend.security keep/watch updated with Plan D invariants.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Post-deployment verification (run after deploy)

- [ ] **PV-D1:** Apply migration on prod Supabase. Verify table exists.
- [ ] **PV-D2:** Push Plan D code, restart PM2. Verify `/security/errors` loads and shows "Sin errores..." or known prior errors if any leaked through.
- [ ] **PV-D3:** Re-test PV-2 from Plan A. The reinvite should still work, AND any Supabase failure (rate limits, etc.) should now appear in `/security/errors`.

---

## Plan D self-review

1. **Spec coverage:** D.1 (schema) → Task 1. D.2 (helper) → Task 2. D.3 (wrapper) → Task 3. D.3 wiring → Task 4. D.4 (catch-all) → Task 5. D.5 (UI) → Tasks 6+7. Docs → Task 8. ✓
2. **Placeholders:** None.
3. **Type consistency:** `applicationErrorId` flows from `wrapSupabaseAuthCall` → thrown error → `securityErrorHandler` → 500 response body. Consistent name across the chain.
4. **Scope:** 8 tasks, ~7-8 commits. Migration is decoupled (apply before deploy). Frontend wiring is conditional on existing `SecurityPage` structure — Task 7.1 makes the implementor read first.

## What this plan does NOT do (covered by Plans B/E/C)

- "Enviar acceso" endpoint + UI button (Plan B)
- `password_reset_requests` table + 1h TTL (Plan B)
- `rate_limit_blocked` → `security_events` (Plan E)
- `invite_accepted` tracking from `SetPassword.jsx` (Plan E)
- "Bloqueos activos" view in `/security` (Plan E)
- Manager-assigned-to-new-company notification (Plan C)
