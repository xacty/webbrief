# Plan E — Security Observability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the security observability gaps left by Plans A/B/D — persist rate-limit blocks to `security_events`, track `invite_accepted` / `password_reset_completed` from the password-set flow, and surface a unified "Bloqueos activos" admin view that lists both manual blocks and rate-limit blocks with a revoke action.

**Architecture:** Three independent changes that share a transport layer:
1. **E.1** — `rateLimitResponse` already writes to console (`writeSecurityLog`). Add a parallel `logSecurityEvent` insert so rate-limit blocks land in `security_events` for cross-event analytics.
2. **E.3** — New `POST /api/auth/track-invite-accepted` endpoint receives `{ via: 'invite' | 'recovery' }` from `SetPassword.jsx` after `updateUser({password})` succeeds, and logs the appropriate event (`invite_accepted` for invite path, `password_reset_completed` for recovery path).
3. **E.5** — New `GET /api/security/blocks` endpoint unifies two sources: manual rows from `security_blocks` (already used in `/overview` via `fetchActiveBlocks()`) + aggregated rate-limit blocks derived from recent `security_events` where `action='rate_limit_blocked'` (group by `metadata.key`, surface most-recent and violation count). New `POST /api/security/rate-limits/clear` revokes a specific bucket — clears the in-memory `Map` via a newly exported `clearRateLimitBucket(key)` in `middleware/security.js`, and best-effort deletes the persistent `rate_limit_buckets` row (no-op when `RATE_LIMIT_STORE=memory`, the default). Frontend adds a new sub-route `/security/blocks` rendering a unified table with a Revocar button.

**Tech Stack:** Node 20, Express 4, Supabase (Postgres + RLS), React 18, Vite, existing `security_events` + `security_blocks` tables (no schema changes).

---

## Locked design decisions

| Decision | Resolution |
|---|---|
| **DEC-1** Where to store the rate-limit bucket key | In `metadata.key` on the `rate_limit_blocked` security_event row. Lets the revoke endpoint round-trip the key without parsing/reconstructing it. |
| **DEC-2** Rate limit on `track-invite-accepted` | `5/min` per actor via a new `rateLimiters.trackEvent`. The endpoint is idempotent (multiple rows OK), but unbounded posts would let an authenticated user flood `security_events`. |
| **DEC-3** `currentlyBlocked` boolean for rate-limit blocks | Surface raw `lastBlockedAt` + the limiter's `blockMs` config; compute `currentlyBlocked = (now - lastBlockedAt) < blockMs`. We need `blockMs` per limiter — read from the `rateLimiters` config registry rather than guessing. |
| **DEC-4** Revoke side-effects when `RATE_LIMIT_STORE=memory` | Only in-memory bucket cleared. `rate_limit_buckets` row delete is wrapped in try/catch and logged best-effort. |
| **DEC-5** `password_reset_completed` rate limit | Same `trackEvent` limiter. Replay attacks (same valid session calling twice) just produce duplicate audit rows — harmless. |
| **DEC-6** Frontend route | `/security/blocks` sub-route (sibling of existing `/security/errors`), not a tab inside `/security`. Mirrors the pattern Plan D introduced. |

---

## File Structure

**Modify:**
- `backend/src/middleware/security.js` — `rateLimitResponse` adds `logSecurityEvent`; export new `clearRateLimitBucket(key)`; expose `rateLimiterConfigs` map (name → { blockMs, maxBlockMs }) for the blocks endpoint
- `backend/src/routes/auth.js` — append `POST /track-invite-accepted` route
- `backend/src/routes/security.js` — append `GET /blocks` (unified) and `POST /rate-limits/clear` routes
- `backend/test/security-rate-limit-blocks.test.js` — new tests for the aggregation + currentlyBlocked logic
- `frontend/src/pages/SetPassword.jsx` — call `/api/auth/track-invite-accepted` after `updateUser` success (alongside the Plan B `/mark-reset-used` call)
- `frontend/src/App.jsx` (or wherever `/security/errors` is registered) — add `/security/blocks` route registration
- `frontend/src/pages/SecurityPage.jsx` — add link/button to "Bloqueos activos" alongside existing `/security/errors` button

**Create:**
- `frontend/src/pages/SecurityBlocksPage.jsx` — admin-only unified blocks table with Revocar action
- `frontend/src/pages/SecurityBlocksPage.module.css` — page styles (mirror `SecurityErrorsPage.module.css` shape)

**No new tables, no migrations.** All audit data piggybacks on existing `security_events`.

---

## Locked design decisions (open questions resolved)

| ID | Question (from spec §10) | Resolution |
|---|---|---|
| O-3 | Drop `auth.audit_log_entries` fallback in /security UI? | Keep — already graceful when empty. Out of scope here. |
| O-4 | Revocar clears in-memory only or also persistent row? | Both, with persistent path best-effort (no-op when memory-only). |

---

## Task 1: E.1 — `rate_limit_blocked` to `security_events`

**Files:**
- Modify: `backend/src/middleware/security.js`

**Goal:** Every 429 response (rate-limit hit) writes a row to `security_events` so cross-event analytics in `/security` can surface it. Currently only `writeSecurityLog` (console) happens.

- [ ] **Step 1.1: Add `logSecurityEvent` import**

At the top of `/Users/adrian/GitHub/webbrief/backend/src/middleware/security.js`, find the existing imports (the `writeSecurityLog` import is around L1-10). Add:

```javascript
import { logSecurityEvent } from '../lib/securityAudit.js'
```

If `securityAudit.js` is already imported for another reason, just add `logSecurityEvent` to the existing named import.

- [ ] **Step 1.2: Extend `rateLimitResponse` to also persist a `security_events` row**

Find `rateLimitResponse` (L118) in `backend/src/middleware/security.js`. Replace the function body so it ALSO calls `logSecurityEvent`. Keep the existing `writeSecurityLog` call — both transports are intentional.

Current:
```javascript
function rateLimitResponse(req, res, retryAfterSeconds, message, fields = {}) {
  res.setHeader('Retry-After', String(retryAfterSeconds))
  writeSecurityLog('warn', 'rate_limit_blocked', {
    ...getRequestLogContext(req),
    retryAfterSeconds,
    ...fields,
  })
  return res.status(429).json({ error: message })
}
```

Replace with:
```javascript
function rateLimitResponse(req, res, retryAfterSeconds, message, fields = {}) {
  res.setHeader('Retry-After', String(retryAfterSeconds))
  writeSecurityLog('warn', 'rate_limit_blocked', {
    ...getRequestLogContext(req),
    retryAfterSeconds,
    ...fields,
  })

  // Persist to security_events for cross-event analytics (Plan E.1).
  // Best-effort: if the DB write fails (e.g. table missing), the warn-level
  // securityAudit fallback already logged a warning; do not block the 429.
  logSecurityEvent(req, {
    action: 'rate_limit_blocked',
    resourceType: 'rate_limit',
    outcome: 'denied',
    metadata: {
      limiter: fields.limiter || null,
      key: fields.key || null,
      retryAfterSeconds,
      violations: fields.violations || 0,
    },
  }).catch(() => {}) // swallow promise rejection silently — logSecurityEvent already swallows in-band

  return res.status(429).json({ error: message })
}
```

- [ ] **Step 1.3: Verify the call site passes `limiter`, `key`, and `violations`**

In the same file, search for the consumer of `rateLimitResponse`. The consumer should already pass the `fields` object. Find it at L249 area:

```javascript
return rateLimitResponse(req, res, Number(result.retryAfterSeconds || 1), message, {
```

Read the surrounding 30 lines to confirm what's already in that object. Required: `limiter` (the rate-limit name, e.g. `'invite-user'`), `key` (the composed bucket key), `violations`. If any of those three are missing from the existing `fields`, extend the call site to include them.

```bash
cd /Users/adrian/GitHub/webbrief && sed -n '230,265p' backend/src/middleware/security.js
```

If you see e.g. `{ retryAfterSeconds: ..., violations: ... }` but no `limiter` or `key`, edit the call site so the spread includes those. Look one frame up — `result` likely has `key` and `name` accessible.

- [ ] **Step 1.4: Run full backend suite**

Run: `cd /Users/adrian/GitHub/webbrief/backend && npm test 2>&1 | tail -8`

Expected: 72/72 passing. No new tests yet; the change is observed via integration in Task 4.

- [ ] **Step 1.5: Commit**

```bash
cd /Users/adrian/GitHub/webbrief
git add backend/src/middleware/security.js
git commit -m "feat(security): persist rate_limit_blocked to security_events (Plan E.1)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 2: E.3 backend — `POST /api/auth/track-invite-accepted`

**Files:**
- Modify: `backend/src/middleware/security.js` — add `rateLimiters.trackEvent`
- Modify: `backend/src/routes/auth.js` — append new route

- [ ] **Step 2.1: Add `trackEvent` rate limiter**

In `backend/src/middleware/security.js`, find the `rateLimiters` export (around L277). Append a new entry BEFORE the closing `}`:

```javascript
  trackEvent: createRateLimit({
    name: 'track-event',
    windowMs: 60_000,        // 1 minute window
    max: 5,                  // 5 events/min per user
    blockMs: 5 * 60_000,
    maxBlockMs: 60 * 60_000,
    keyParts: (req) => [req.currentUser?.id],
  }),
```

- [ ] **Step 2.2: Append the route in `backend/src/routes/auth.js`**

Find `export default router` at the end of `backend/src/routes/auth.js`. Append BEFORE it:

```javascript
router.post('/track-invite-accepted', requireAuth, rateLimiters.trackEvent, async (req, res) => {
  try {
    const userId = req.currentUser?.id
    if (!userId) {
      return res.status(401).json({ error: 'No autenticado' })
    }

    const rawVia = String(req.body?.via || '').toLowerCase()
    const via = rawVia === 'recovery' ? 'recovery' : rawVia === 'invite' ? 'invite' : null
    if (!via) {
      return res.status(400).json({ error: "Body 'via' debe ser 'invite' o 'recovery'" })
    }

    const action = via === 'invite' ? 'invite_accepted' : 'password_reset_completed'
    await logSecurityEvent(req, {
      action,
      resourceType: 'user',
      resourceId: userId,
      targetUserId: userId,
      metadata: { via },
    })

    return res.status(200).json({ tracked: true, action })
  } catch (error) {
    return res.status(500).json({ error: error.message || 'No se pudo registrar el evento' })
  }
})
```

- [ ] **Step 2.3: Verify syntax + full suite**

Run:
```bash
cd /Users/adrian/GitHub/webbrief && node --check backend/src/routes/auth.js && cd backend && npm test 2>&1 | tail -8
```

Expected: syntax OK + 72/72 passing.

- [ ] **Step 2.4: Commit**

```bash
cd /Users/adrian/GitHub/webbrief
git add backend/src/middleware/security.js backend/src/routes/auth.js
git commit -m "feat(auth): add POST /track-invite-accepted (Plan E.3 backend)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 3: E.3 frontend — `SetPassword.jsx` calls `track-invite-accepted`

**Files:**
- Modify: `frontend/src/pages/SetPassword.jsx`

- [ ] **Step 3.1: Add the track call after successful `updateUser`**

In `/Users/adrian/GitHub/webbrief/frontend/src/pages/SetPassword.jsx`, find the `handleSubmit` function. Plan B already added a `mark-reset-used` call inside the `if (authType === 'recovery')` block. Add a sibling call to `track-invite-accepted` AFTER the `updateUser` succeeds and BEFORE the navigate, regardless of authType (both `invite` and `recovery` are tracked).

Locate the existing block:
```javascript
      if (authType === 'recovery') {
        // Mark the password_reset_requests row used so subsequent visits via the
        // same link get 'used' instead of an open form. Best-effort: a failure
        // here doesn't block the user from continuing.
        try {
          const { data: { session } } = await supabase.auth.getSession()
          const headers = new Headers({ 'Content-Type': 'application/json' })
          if (session?.access_token) {
            headers.set('Authorization', `Bearer ${session.access_token}`)
          }
          await fetch('/api/auth/mark-reset-used', { method: 'POST', headers })
        } catch {
          // swallow — best-effort
        }
      }
```

REPLACE the block above with:

```javascript
      // Track acceptance regardless of authType — needed for /security observability.
      // Best-effort: failure here doesn't block user navigation. Only fires when we
      // know whether the visit was via invite or recovery (skipped for the very rare
      // case where the URL hash type was missing).
      if (authType === 'invite' || authType === 'recovery') {
        try {
          const { data: { session } } = await supabase.auth.getSession()
          const headers = new Headers({ 'Content-Type': 'application/json' })
          if (session?.access_token) {
            headers.set('Authorization', `Bearer ${session.access_token}`)
          }

          // For recovery: mark the password_reset_requests row used (Plan B).
          if (authType === 'recovery') {
            await fetch('/api/auth/mark-reset-used', { method: 'POST', headers }).catch(() => {})
          }

          // For both: track the acceptance event (Plan E.3).
          await fetch('/api/auth/track-invite-accepted', {
            method: 'POST',
            headers,
            body: JSON.stringify({ via: authType }),
          }).catch(() => {})
        } catch {
          // swallow — best-effort
        }
      }
```

- [ ] **Step 3.2: Frontend build check**

Run: `cd /Users/adrian/GitHub/webbrief/frontend && npm run build 2>&1 | tail -3`

Expected: `✓ built`.

- [ ] **Step 3.3: Commit**

```bash
cd /Users/adrian/GitHub/webbrief
git add frontend/src/pages/SetPassword.jsx
git commit -m "feat(set-password): call track-invite-accepted after password set (Plan E.3 frontend)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 4: E.5 backend — unified `GET /api/security/blocks` + `POST /rate-limits/clear`

**Files:**
- Modify: `backend/src/middleware/security.js` — export `clearRateLimitBucket(key)` and `getRateLimiterConfig(name)` helpers
- Modify: `backend/src/routes/security.js` — append two routes
- Create: `backend/test/security-rate-limit-blocks.test.js` — unit tests for the aggregation logic

- [ ] **Step 4.1: Export helpers from `middleware/security.js`**

In `backend/src/middleware/security.js`:

**4.1a) Export `clearRateLimitBucket`** — find the module-private `rateBuckets = new Map()` (around L8). After all the consume functions, add a new exported function near the bottom of the limiter section (before `export const rateLimiters`):

```javascript
// Public clear: lets admin /security/rate-limits/clear endpoint remove a specific
// in-memory bucket. Returns true if a bucket existed, false otherwise. Persistent
// store cleanup is the caller's responsibility (best-effort delete from
// rate_limit_buckets table when RATE_LIMIT_STORE=supabase).
export function clearRateLimitBucket(key) {
  if (!key) return false
  return rateBuckets.delete(key)
}
```

**4.1b) Export `getRateLimiterConfig`** — after the `rateLimiters` export, add:

```javascript
// Lookup the public config of a rate limiter by name (used by /security/blocks
// to compute currentlyBlocked from blockMs).
export function getRateLimiterConfig(name) {
  for (const limiter of Object.values(rateLimiters)) {
    if (limiter.config?.name === name) return limiter.config
  }
  return null
}
```

**Caveat:** `createRateLimit` may not currently attach a `.config` property to the returned middleware. Check `createRateLimit`'s return shape. If `.config` isn't attached, modify `createRateLimit` to attach the original config object as `middleware.config = config` before returning. Read the function (likely around L60-100 in `security.js`) and add the assignment in the natural place.

- [ ] **Step 4.2: Write the failing test first**

Create `/Users/adrian/GitHub/webbrief/backend/test/security-rate-limit-blocks.test.js`:

```javascript
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  aggregateRateLimitBlocks,
  isRateLimitBlockActive,
} from '../src/routes/securityBlocksHelpers.js'

// -------- aggregateRateLimitBlocks --------

test('aggregateRateLimitBlocks: groups by metadata.key and surfaces latest', () => {
  const events = [
    { id: 'e1', created_at: '2026-05-14T10:00:00Z', metadata: { key: 'invite-user:u1:c1', limiter: 'invite-user', retryAfterSeconds: 900, violations: 1 } },
    { id: 'e2', created_at: '2026-05-14T10:05:00Z', metadata: { key: 'invite-user:u1:c1', limiter: 'invite-user', retryAfterSeconds: 1800, violations: 2 } },
    { id: 'e3', created_at: '2026-05-14T10:02:00Z', metadata: { key: 'password-reset:u2:t1', limiter: 'password-reset', retryAfterSeconds: 900, violations: 1 } },
  ]

  const result = aggregateRateLimitBlocks(events)

  assert.equal(result.length, 2)

  const inviteRow = result.find((r) => r.key === 'invite-user:u1:c1')
  assert.equal(inviteRow.limiter, 'invite-user')
  assert.equal(inviteRow.violations, 2) // latest event wins
  assert.equal(inviteRow.lastBlockedAt, '2026-05-14T10:05:00Z')
  assert.equal(inviteRow.eventCount, 2)
})

test('aggregateRateLimitBlocks: skips events missing metadata.key', () => {
  const events = [
    { id: 'e1', created_at: '2026-05-14T10:00:00Z', metadata: { limiter: 'x' } }, // no key
    { id: 'e2', created_at: '2026-05-14T10:05:00Z', metadata: { key: 'k1', limiter: 'x', violations: 1 } },
  ]

  const result = aggregateRateLimitBlocks(events)
  assert.equal(result.length, 1)
  assert.equal(result[0].key, 'k1')
})

test('aggregateRateLimitBlocks: empty input', () => {
  assert.deepEqual(aggregateRateLimitBlocks([]), [])
  assert.deepEqual(aggregateRateLimitBlocks(null), [])
  assert.deepEqual(aggregateRateLimitBlocks(undefined), [])
})

// -------- isRateLimitBlockActive --------

test('isRateLimitBlockActive: true when now - lastBlockedAt < blockMs', () => {
  const lastBlockedAt = '2026-05-14T10:00:00Z'
  const now = new Date('2026-05-14T10:10:00Z') // +10min
  const blockMs = 15 * 60_000 // 15min
  assert.equal(isRateLimitBlockActive({ lastBlockedAt, now, blockMs }), true)
})

test('isRateLimitBlockActive: false when now - lastBlockedAt >= blockMs', () => {
  const lastBlockedAt = '2026-05-14T10:00:00Z'
  const now = new Date('2026-05-14T10:20:00Z') // +20min
  const blockMs = 15 * 60_000 // 15min
  assert.equal(isRateLimitBlockActive({ lastBlockedAt, now, blockMs }), false)
})

test('isRateLimitBlockActive: false when blockMs missing', () => {
  const lastBlockedAt = '2026-05-14T10:00:00Z'
  const now = new Date('2026-05-14T10:05:00Z')
  assert.equal(isRateLimitBlockActive({ lastBlockedAt, now, blockMs: null }), false)
  assert.equal(isRateLimitBlockActive({ lastBlockedAt, now, blockMs: 0 }), false)
})

test('isRateLimitBlockActive: false when lastBlockedAt missing', () => {
  const now = new Date()
  assert.equal(isRateLimitBlockActive({ lastBlockedAt: null, now, blockMs: 60000 }), false)
})
```

- [ ] **Step 4.3: Run test — expect failures (module missing)**

Run: `cd /Users/adrian/GitHub/webbrief/backend && npm test -- --test-name-pattern 'aggregateRateLimitBlocks|isRateLimitBlockActive' 2>&1 | tail -6`

Expected: failures (helper file doesn't exist).

- [ ] **Step 4.4: Create the helpers**

Create `/Users/adrian/GitHub/webbrief/backend/src/routes/securityBlocksHelpers.js`:

```javascript
// Pure helpers for the /api/security/blocks endpoint.
//
// aggregateRateLimitBlocks groups raw rate_limit_blocked security_events
// by metadata.key, surfacing the latest violations count + lastBlockedAt
// + total event count per key.
//
// isRateLimitBlockActive computes whether a key is still within its block
// window. blockMs comes from the rateLimiters config registry.

export function aggregateRateLimitBlocks(events) {
  if (!Array.isArray(events)) return []

  const buckets = new Map()
  for (const event of events) {
    const meta = event?.metadata || {}
    const key = meta.key
    if (!key) continue

    const existing = buckets.get(key)
    const created = event.created_at
    if (!existing) {
      buckets.set(key, {
        key,
        limiter: meta.limiter || null,
        lastBlockedAt: created,
        violations: meta.violations || 0,
        retryAfterSeconds: meta.retryAfterSeconds || 0,
        eventCount: 1,
      })
      continue
    }

    existing.eventCount += 1
    if (new Date(created) > new Date(existing.lastBlockedAt)) {
      existing.lastBlockedAt = created
      existing.violations = meta.violations || existing.violations
      existing.retryAfterSeconds = meta.retryAfterSeconds || existing.retryAfterSeconds
      existing.limiter = meta.limiter || existing.limiter
    }
  }

  return Array.from(buckets.values()).sort((a, b) => (
    new Date(b.lastBlockedAt) - new Date(a.lastBlockedAt)
  ))
}

export function isRateLimitBlockActive({ lastBlockedAt, now, blockMs }) {
  if (!lastBlockedAt || !blockMs || blockMs <= 0) return false
  const diff = now.getTime() - new Date(lastBlockedAt).getTime()
  return diff < blockMs
}
```

- [ ] **Step 4.5: Re-run test — expect 9 passing**

Run: `cd /Users/adrian/GitHub/webbrief/backend && npm test 2>&1 | tail -6`

Expected: 81/81 (72 prior + 9 new).

- [ ] **Step 4.6: Wire `GET /api/security/blocks` and `POST /rate-limits/clear`**

In `/Users/adrian/GitHub/webbrief/backend/src/routes/security.js`:

**4.6a) Update imports** at top of file (add to existing import list):

```javascript
import { rateLimiters, clearRateLimitBucket, getRateLimiterConfig } from '../middleware/security.js'
import { aggregateRateLimitBlocks, isRateLimitBlockActive } from './securityBlocksHelpers.js'
```

Note: `rateLimiters` and `clearRateLimitBucket` are different exports. Take both.

**4.6b) Find where manual blocks are loaded.** Search for `fetchActiveBlocks` in `security.js`:

```bash
cd /Users/adrian/GitHub/webbrief && grep -n "fetchActiveBlocks\|serializeBlock" backend/src/routes/security.js | head
```

Inspect the function and its return shape. The block-list endpoint will reuse it.

**4.6c) Append the unified GET route** before `export default router`:

```javascript
router.get('/blocks', async (req, res) => {
  try {
    const days = parseDays(req.query.days, 1, 30) // last 24h default
    const sinceIsoStr = sinceIso(days)

    const [manualBlockResult, rateEventsResult] = await Promise.all([
      fetchActiveBlocks(),
      supabaseAdmin
        .from('security_events')
        .select('id, created_at, metadata')
        .eq('action', 'rate_limit_blocked')
        .gte('created_at', sinceIsoStr)
        .order('created_at', { ascending: false })
        .limit(500),
    ])

    if (rateEventsResult.error) throw rateEventsResult.error

    const rateBlocks = aggregateRateLimitBlocks(rateEventsResult.data || [])
    const now = new Date()
    const rateBlocksEnriched = rateBlocks.map((block) => {
      const config = getRateLimiterConfig(block.limiter)
      const blockMs = config?.blockMs || 0
      return {
        type: 'rate_limit',
        subject: block.key,
        limiter: block.limiter,
        lastBlockedAt: block.lastBlockedAt,
        violations: block.violations,
        eventCount: block.eventCount,
        currentlyBlocked: isRateLimitBlockActive({ lastBlockedAt: block.lastBlockedAt, now, blockMs }),
        blockMs,
      }
    })

    const manualBlocks = (manualBlockResult.blocks || []).map((row) => ({
      type: 'manual',
      id: row.id,
      blockType: row.blockType,
      subject: row.userId || row.ipAddress || row.emailLower || '(unknown)',
      reason: row.reason,
      since: row.createdAt,
      expiresAt: row.expiresAt,
      createdBy: row.createdBy,
      currentlyBlocked: true,
    }))

    return res.json({
      manualBlocks,
      rateLimitBlocks: rateBlocksEnriched,
      warnings: [manualBlockResult.warning].filter(Boolean),
    })
  } catch (error) {
    writeSecurityLog('error', 'security_blocks_list_failed', {
      ...getRequestLogContext(req),
      error: error.message,
    })
    return res.status(500).json({ error: error.message || 'No se pudo cargar bloqueos' })
  }
})

router.post('/rate-limits/clear', async (req, res) => {
  try {
    const key = String(req.body?.key || '').trim()
    if (!key) {
      return res.status(400).json({ error: 'Body requiere field key' })
    }

    const memoryCleared = clearRateLimitBucket(key)

    // Best-effort: also delete persistent row (no-op when RATE_LIMIT_STORE=memory).
    let persistentCleared = false
    try {
      const { count, error } = await supabaseAdmin
        .from('rate_limit_buckets')
        .delete({ count: 'exact' })
        .eq('key', key)
      if (!error && count && count > 0) persistentCleared = true
    } catch {
      // swallow — persistent path is optional
    }

    await logSecurityEvent(req, {
      action: 'rate_limit_cleared',
      resourceType: 'rate_limit',
      metadata: { key, memoryCleared, persistentCleared },
    })

    return res.json({ cleared: true, memoryCleared, persistentCleared })
  } catch (error) {
    writeSecurityLog('error', 'rate_limit_clear_failed', {
      ...getRequestLogContext(req),
      error: error.message,
    })
    return res.status(500).json({ error: error.message || 'No se pudo limpiar el bloqueo' })
  }
})
```

**Caveat about `serializeBlock`:** The shape mapping in `manualBlocks.map(...)` above assumes `fetchActiveBlocks()` returns rows with `userId`, `ipAddress`, `emailLower`, etc. Verify with `grep -n "serializeBlock" backend/src/routes/security.js` and adjust property names to match the actual shape. The route file already has `serializeBlock` — the unified mapping reuses its output, not raw DB columns.

- [ ] **Step 4.7: Run full suite again**

Run: `cd /Users/adrian/GitHub/webbrief && node --check backend/src/routes/security.js && cd backend && npm test 2>&1 | tail -6`

Expected: syntax OK + 81/81.

- [ ] **Step 4.8: Commit**

```bash
cd /Users/adrian/GitHub/webbrief
git add backend/src/middleware/security.js backend/src/routes/security.js backend/src/routes/securityBlocksHelpers.js backend/test/security-rate-limit-blocks.test.js
git commit -m "feat(security): unified /blocks endpoint + revoke rate-limit (Plan E.5 backend)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 5: E.5 frontend — `/security/blocks` sub-route

**Files:**
- Create: `frontend/src/pages/SecurityBlocksPage.jsx`
- Create: `frontend/src/pages/SecurityBlocksPage.module.css`
- Modify: `frontend/src/App.jsx` (or wherever routes live) — register `/security/blocks`
- Modify: `frontend/src/pages/SecurityPage.jsx` — add a button linking to `/security/blocks`

- [ ] **Step 5.1: Inspect existing route registration**

Find where `/security/errors` is registered:

```bash
cd /Users/adrian/GitHub/webbrief && grep -rn "security/errors\|SecurityErrorsPage" frontend/src/App.jsx frontend/src/main.jsx 2>/dev/null
```

Note the file and the pattern (lazy import vs static, route attributes, etc).

- [ ] **Step 5.2: Create `SecurityBlocksPage.jsx`**

Create `/Users/adrian/GitHub/webbrief/frontend/src/pages/SecurityBlocksPage.jsx`:

```javascript
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, ShieldOff, AlertTriangle } from 'lucide-react'
import { apiFetch } from '../lib/api'
import { supabase } from '../lib/supabase'
import { Button, Card, Badge } from '../components/ui'
import styles from './SecurityBlocksPage.module.css'

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })
}

function blockTypeLabel(type) {
  return type === 'rate_limit' ? 'Rate-limit' : 'Manual'
}

function blockTypeVariant(type) {
  return type === 'rate_limit' ? 'warning' : 'danger'
}

export default function SecurityBlocksPage() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [data, setData] = useState({ manualBlocks: [], rateLimitBlocks: [], warnings: [] })
  const [busyKey, setBusyKey] = useState('')
  const [actionMessage, setActionMessage] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const result = await apiFetch('/api/security/blocks')
      setData({
        manualBlocks: result.manualBlocks || [],
        rateLimitBlocks: result.rateLimitBlocks || [],
        warnings: result.warnings || [],
      })
    } catch (err) {
      setError(err.message || 'No se pudo cargar bloqueos')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function handleRevokeRateLimit(key) {
    if (!window.confirm(`¿Limpiar bloqueo rate-limit\n${key}?`)) return

    setBusyKey(`revoke:${key}`)
    setActionMessage('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const headers = new Headers({ 'Content-Type': 'application/json' })
      if (session?.access_token) {
        headers.set('Authorization', `Bearer ${session.access_token}`)
      }
      const response = await fetch('/api/security/rate-limits/clear', {
        method: 'POST',
        headers,
        body: JSON.stringify({ key }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) {
        setError(body.error || 'No se pudo limpiar el bloqueo')
        return
      }
      const memTag = body.memoryCleared ? 'memoria' : ''
      const persistTag = body.persistentCleared ? 'persistente' : ''
      const tags = [memTag, persistTag].filter(Boolean).join(' + ') || 'sin cambios'
      setActionMessage(`Bloqueo limpiado (${tags})`)
      await load()
    } catch (err) {
      setError(err.message || 'Error de red al limpiar bloqueo')
    } finally {
      setBusyKey('')
    }
  }

  async function handleRevokeManual(id) {
    if (!window.confirm('¿Revocar este bloqueo manual?')) return

    setBusyKey(`revoke-manual:${id}`)
    setActionMessage('')
    try {
      await apiFetch(`/api/security/blocks/${id}`, { method: 'DELETE' })
      setActionMessage('Bloqueo manual revocado')
      await load()
    } catch (err) {
      setError(err.message || 'No se pudo revocar el bloqueo manual')
    } finally {
      setBusyKey('')
    }
  }

  const totalActive = data.manualBlocks.length + data.rateLimitBlocks.filter((b) => b.currentlyBlocked).length

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          icon={<ArrowLeft size={16} />}
          onClick={() => navigate('/security')}
        >
          Volver a Seguridad
        </Button>
        <h1 className={styles.title}>Bloqueos activos</h1>
        <p className={styles.subtitle}>
          {totalActive} actualmente bloqueado{totalActive === 1 ? '' : 's'}
          {' · '}
          {data.manualBlocks.length} manual{data.manualBlocks.length === 1 ? '' : 'es'}, {data.rateLimitBlocks.length} rate-limit (últimas 24h)
        </p>
      </div>

      {actionMessage && <p className={styles.success}>{actionMessage}</p>}
      {error && <p className={styles.error}>{error}</p>}
      {data.warnings.length > 0 && (
        <div className={styles.warningBanner}>
          <AlertTriangle size={16} />
          <span>{data.warnings.join(' · ')}</span>
        </div>
      )}

      {loading && <p className={styles.info}>Cargando bloqueos…</p>}

      {!loading && data.manualBlocks.length === 0 && data.rateLimitBlocks.length === 0 && (
        <Card padding="lg" shadow="sm" radius="lg">
          <p className={styles.empty}>Sin bloqueos activos en las últimas 24 horas. Todo bien.</p>
        </Card>
      )}

      {!loading && (data.manualBlocks.length > 0 || data.rateLimitBlocks.length > 0) && (
        <Card padding="lg" shadow="sm" radius="lg">
          <table className={styles.blocksTable}>
            <thead>
              <tr>
                <th>Tipo</th>
                <th>Sujeto</th>
                <th>Motivo</th>
                <th>Desde / Último</th>
                <th>Expira</th>
                <th>Estado</th>
                <th aria-label="Acciones" />
              </tr>
            </thead>
            <tbody>
              {data.manualBlocks.map((block) => (
                <tr key={`m-${block.id}`}>
                  <td><Badge variant={blockTypeVariant(block.type)} size="sm">{blockTypeLabel(block.type)}</Badge></td>
                  <td><code className={styles.subject}>{block.subject}</code></td>
                  <td>{block.reason || '—'}</td>
                  <td>{formatDate(block.since)}</td>
                  <td>{formatDate(block.expiresAt)}</td>
                  <td><Badge variant="danger" size="sm">Activo</Badge></td>
                  <td>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      icon={<ShieldOff size={14} />}
                      onClick={() => handleRevokeManual(block.id)}
                      disabled={busyKey === `revoke-manual:${block.id}`}
                      loading={busyKey === `revoke-manual:${block.id}`}
                      title="Revocar bloqueo manual"
                    >
                      Revocar
                    </Button>
                  </td>
                </tr>
              ))}

              {data.rateLimitBlocks.map((block) => (
                <tr key={`rl-${block.subject}`}>
                  <td><Badge variant={blockTypeVariant(block.type)} size="sm">{blockTypeLabel(block.type)}</Badge></td>
                  <td><code className={styles.subject}>{block.subject}</code></td>
                  <td>{block.limiter}{block.violations > 1 ? ` · ${block.violations} violaciones` : ''}</td>
                  <td>{formatDate(block.lastBlockedAt)}</td>
                  <td>{block.blockMs ? `${Math.round(block.blockMs / 60000)} min ventana` : '—'}</td>
                  <td>
                    {block.currentlyBlocked
                      ? <Badge variant="danger" size="sm">Activo</Badge>
                      : <Badge variant="neutral" size="sm">Histórico</Badge>}
                  </td>
                  <td>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      icon={<ShieldOff size={14} />}
                      onClick={() => handleRevokeRateLimit(block.subject)}
                      disabled={busyKey === `revoke:${block.subject}`}
                      loading={busyKey === `revoke:${block.subject}`}
                      title="Limpiar el bucket de este rate limit"
                    >
                      Revocar
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  )
}
```

- [ ] **Step 5.3: Create `SecurityBlocksPage.module.css`**

Create `/Users/adrian/GitHub/webbrief/frontend/src/pages/SecurityBlocksPage.module.css`:

```css
.page {
  padding: var(--wb-space-6);
  max-width: 1200px;
  margin: 0 auto;
}

.header {
  margin-bottom: var(--wb-space-6);
}

.title {
  font-size: var(--wb-text-2xl);
  font-weight: 600;
  color: var(--wb-color-neutral-900);
  margin: var(--wb-space-3) 0 var(--wb-space-1);
}

.subtitle {
  font-size: var(--wb-text-sm);
  color: var(--wb-color-neutral-500);
  margin: 0;
}

.info {
  color: var(--wb-color-neutral-500);
  font-size: var(--wb-text-sm);
}

.error {
  color: var(--wb-color-danger-700);
  background: var(--wb-color-danger-50);
  padding: var(--wb-space-3) var(--wb-space-4);
  border-radius: var(--wb-radius-md);
  font-size: var(--wb-text-sm);
}

.success {
  color: var(--wb-color-success-700);
  background: var(--wb-color-success-50);
  padding: var(--wb-space-3) var(--wb-space-4);
  border-radius: var(--wb-radius-md);
  font-size: var(--wb-text-sm);
}

.warningBanner {
  display: inline-flex;
  align-items: center;
  gap: var(--wb-space-2);
  padding: var(--wb-space-2) var(--wb-space-3);
  border-radius: var(--wb-radius-md);
  background: var(--wb-color-warning-50);
  color: var(--wb-color-warning-700);
  font-size: var(--wb-text-sm);
  margin-bottom: var(--wb-space-4);
}

.empty {
  color: var(--wb-color-neutral-500);
  font-size: var(--wb-text-sm);
  margin: 0;
}

.blocksTable {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--wb-text-sm);
}

.blocksTable thead th {
  text-align: left;
  padding: var(--wb-space-2) var(--wb-space-3);
  border-bottom: 1px solid var(--wb-color-neutral-200);
  color: var(--wb-color-neutral-600);
  font-weight: 500;
}

.blocksTable tbody td {
  padding: var(--wb-space-3);
  border-bottom: 1px solid var(--wb-color-neutral-100);
  vertical-align: middle;
}

.subject {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: var(--wb-text-xs);
  background: var(--wb-color-neutral-50);
  padding: 2px 6px;
  border-radius: var(--wb-radius-xs);
  color: var(--wb-color-neutral-700);
  word-break: break-all;
}
```

- [ ] **Step 5.4: Register the route**

Read the file where `/security/errors` is registered (likely `frontend/src/App.jsx`). Add a sibling route registration for `/security/blocks` that lazy-imports `SecurityBlocksPage`. Follow the exact pattern already used for `SecurityErrorsPage`.

Example pattern (adjust to match the file's actual style):

```javascript
const SecurityBlocksPage = lazy(() => import('./pages/SecurityBlocksPage'))

// ... inside <Routes>:
<Route path="/security/blocks" element={<RequireAdmin><SecurityBlocksPage /></RequireAdmin>} />
```

If the file uses a different admin guard component, use that. If `lazy` isn't already used for security pages, mirror what `SecurityErrorsPage` does exactly.

- [ ] **Step 5.5: Add a link to `/security/blocks` in `SecurityPage.jsx`**

In `/Users/adrian/GitHub/webbrief/frontend/src/pages/SecurityPage.jsx`, find the existing button that navigates to `/security/errors` (around L177 per earlier grep). Add a sibling button right next to it:

```javascript
<Button
  type="button"
  variant="secondary"
  size="sm"
  icon={<ShieldOff size={14} />}
  onClick={() => navigate('/security/blocks')}
>
  Bloqueos activos
</Button>
```

Add the `ShieldOff` import to the lucide-react import line at the top of `SecurityPage.jsx`.

- [ ] **Step 5.6: Frontend build check**

Run: `cd /Users/adrian/GitHub/webbrief/frontend && npm run build 2>&1 | tail -3`

Expected: `✓ built`.

- [ ] **Step 5.7: Commit**

```bash
cd /Users/adrian/GitHub/webbrief
git add frontend/src/pages/SecurityBlocksPage.jsx frontend/src/pages/SecurityBlocksPage.module.css frontend/src/App.jsx frontend/src/pages/SecurityPage.jsx
git commit -m "feat(security): add /security/blocks unified view + revoke action (Plan E.5 frontend)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 6: CONTEXT.min.md note + final smoke

- [ ] **Step 6.1: Run final full suite + build**

```bash
cd /Users/adrian/GitHub/webbrief/backend && npm test 2>&1 | tail -6
cd /Users/adrian/GitHub/webbrief/frontend && npm run build 2>&1 | tail -3
```

Expected: 81/81 tests, frontend build green.

- [ ] **Step 6.2: Placeholder scan**

```bash
cd /Users/adrian/GitHub/webbrief && grep -rEn 'TODO|FIXME|XXX|TBD' \
  backend/src/routes/securityBlocksHelpers.js \
  backend/src/middleware/security.js \
  backend/src/routes/security.js \
  backend/src/routes/auth.js \
  frontend/src/pages/SecurityBlocksPage.jsx \
  frontend/src/pages/SetPassword.jsx
```

Expected: no matches.

- [ ] **Step 6.3: Append Session 15 to CONTEXT.min.md**

In `/Users/adrian/GitHub/webbrief/CONTEXT.min.md`, find the `## Recent Fixes` heading. Insert above Session 14:

```
### Session 15 (2026-05-14) — Auth hardening Plan E (security observability)

- Plan E shipped on branch `feat/auth-hardening-plan-e`: three independent observability changes — rate_limit_blocked → security_events, invite_accepted / password_reset_completed tracking from SetPassword.jsx, and unified /security/blocks admin view with revoke action.
- `rateLimitResponse` middleware now writes a `rate_limit_blocked` row to `security_events` (alongside the existing console writeSecurityLog) with metadata `{ limiter, key, retryAfterSeconds, violations }`. Best-effort persist (rejection swallowed) so 429 path is never blocked.
- New `POST /api/auth/track-invite-accepted` (requireAuth + rateLimiters.trackEvent 5/min): receives `{ via: 'invite' | 'recovery' }`, logs `invite_accepted` or `password_reset_completed` to security_events. `SetPassword.jsx` now calls this after `updateUser({password})` succeeds, reusing the `INITIAL_AUTH_TYPE` captured at supabase.js init from Plan B. mark-reset-used (Plan B) still fires for recovery; track-invite-accepted is new for both flows.
- New `GET /api/security/blocks` unified endpoint: returns `{ manualBlocks, rateLimitBlocks, warnings }`. Manual blocks come from `fetchActiveBlocks()` (existing). Rate-limit blocks aggregate the last 24h of `security_events.action='rate_limit_blocked'` grouped by `metadata.key`, surfacing `lastBlockedAt`, `violations`, `eventCount`, and `currentlyBlocked` (derived from each limiter's `blockMs` config via newly exported `getRateLimiterConfig(name)`).
- New `POST /api/security/rate-limits/clear` (admin-only): body `{ key }`; clears in-memory bucket via newly exported `clearRateLimitBucket(key)` from middleware AND best-effort deletes the persistent `rate_limit_buckets` row (no-op when RATE_LIMIT_STORE=memory, the default). Logs `rate_limit_cleared` security_event with `{ key, memoryCleared, persistentCleared }`.
- New admin-only frontend sub-route `/security/blocks` (lazy-loaded; component `SecurityBlocksPage.jsx`). Unified table with type chip (manual/rate-limit), subject, reason, timestamps, currentlyBlocked badge, and Revocar button per row. Empty state + warning banner for table-missing cases. Cross-link from `/security` shell button.
- 9 new tests in `backend/test/security-rate-limit-blocks.test.js` (3 `aggregateRateLimitBlocks` + 4 `isRateLimitBlockActive`). Helper module `backend/src/routes/securityBlocksHelpers.js`. Full backend suite: 81/81 pass.
- No new migrations. All audit data piggybacks on existing `security_events` table.
```

- [ ] **Step 6.4: Commit**

```bash
cd /Users/adrian/GitHub/webbrief
git add CONTEXT.min.md
git commit -m "docs: record session 15 (Plan E observability) in CONTEXT.min.md

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Self-review checklist (for the implementer, before declaring done)

1. **Spec coverage:**
   - §E.1 `rate_limit_blocked` to security_events → Task 1 ✓
   - §E.2 granular invite events → already done in Plans A & B (verify, no work needed)
   - §E.3 `invite_accepted` + `password_reset_completed` → Tasks 2 + 3 ✓
   - §E.4 `user_deleted` audit → already exists (verify only; no work)
   - §E.5 "Bloqueos activos" view + revoke → Tasks 4 + 5 ✓

2. **No regression on Plan B mark-reset-used:** confirm the merge of `track-invite-accepted` into `SetPassword.jsx` did NOT remove the `mark-reset-used` call. Both must fire for recovery (mark-reset-used first, then track-invite-accepted).

3. **Limiter key passed end-to-end:** the rate-limit consumer at L249 of `security.js` should already pass `key` in the `fields` spread; if not, Task 1.3 catches it. Without `key`, the revoke endpoint can't target a specific bucket.

4. **`getRateLimiterConfig` reachable:** `currentlyBlocked` depends on `blockMs` lookup. If `createRateLimit` doesn't attach `.config` to the returned middleware, Task 4.1b instructs to patch the helper. Verify the patch lives in `security.js`, not somewhere awkward.

5. **Admin gate on `/security/blocks`:** the page must be admin-only. The backend already gates `/api/security/*` to admin (L13-15 of security.js). Frontend route must use the same admin guard as `/security/errors` — copy the pattern.

6. **Persistent rate-limit store path:** the `rate_limit_buckets` delete in Task 4.6 is best-effort and silent. If table is missing, no harm. If `RATE_LIMIT_STORE=supabase` is set later, the delete just works.

7. **Tracking endpoint idempotency:** `track-invite-accepted` writes a new row each call. Replay attacks just inflate audit data — not a security risk. Rate limit (5/min) caps damage.

---

## Out of scope (deferred)

- `/api/security/overview` count adjustment: `activeBlocks` currently counts only manual blocks. Adding rate-limit blocks to the KPI count is a small follow-up — defer to a separate ticket since it crosses concerns (KPI is summary, not detail).
- Manual block creation UI: only the revoke side is in Plan E. Creating manual blocks is already covered by POST `/api/security/blocks`.
- Pagination for the blocks page: 24-hour window with limit 500 events is enough for now; pagination is a follow-up if volume grows.
- Custom email-template editor (still out of milestone scope).
