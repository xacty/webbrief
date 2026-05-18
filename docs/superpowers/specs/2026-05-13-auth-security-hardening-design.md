# Auth & Security Hardening — Design Spec

- **Status:** approved (pending implementation plan)
- **Date:** 2026-05-13
- **Target milestone:** `v1.1-auth-hardening`
- **Author:** Adrián + Claude
- **Scope:** Fix invite flow bugs, add resend/reset functionality, introduce technical error log, fill security observability gaps.

## 1. Background

During session 11 (post-deploy of UI System Refactor v1.0), real-world testing on production surfaced multiple problems in the invite/auth/security flow. Investigation in Supabase Auth logs (read-only via MCP) reconstructed the failure path and uncovered systemic gaps:

- The invite email did not always arrive when creating a new company; admin had to delete and recreate the user to retry, which compounded the problem by triggering Supabase's `over_email_send_rate_limit`.
- No platform-side action exists for admins/managers to resend an invite or trigger a password reset for another user.
- Supabase Auth's email sender has a low default rate limit (~3–4 emails/hour) when using its native SMTP. This is invisible to operators because the 429 response is swallowed by our backend and surfaces as a generic 500.
- The `email_otp_exp` setting in Supabase is short (likely 1h default), which compounds with invalidation-on-delete to make invite links appear to expire instantly.
- No technical error log exists. When Supabase Auth (or any external API) fails, the failure leaves no trace in our application UI or persistent storage.
- The `auth.audit_log_entries` table is empty on this Supabase plan; logs live in Logflare/Supabase Logs only and are not surfaced in WeBrief's `/security` view.

### 1.1 Concrete production case (reference)

User `contact@avinovapower.com` was invited 5 times across ~4.5 hours by `admin@webrief.app` due to email-not-arriving and link-already-invalid loops:

| Time UTC | Event |
|----------|-------|
| 13/05 20:51:43 | Invite #1 OK — auth user `cb4bd597...` created on company creation |
| 13/05 20:55:48 | Admin deletes that auth user (email apparently never arrived) |
| 13/05 20:56:10 | Invite #2 OK — auth user `1e76a33b...` |
| 13/05 21:01:55 | Manager clicks link from invite #1 → `email link has expired` (link was invalidated when user was deleted) |
| 13/05 21:04:28 | Admin deletes auth user again |
| 13/05 21:04:46 | Invite #3 → **429 `over_email_send_rate_limit`** (Supabase blocks email send) |
| 13/05 21:06:23 | Invite #4 → **429** (still rate-limited) |
| 14/05 01:17:22 | Invite #5 OK (after ~4h cooldown) — auth user `a0c419d2...` |

None of the 429s nor the deletes were recorded in WeBrief's `security_events` table. The failures were only visible via Supabase MCP `get_logs`.

## 2. Goals

1. Make invite delivery reliable for the common case (company creation, user invite).
2. Give admins/managers a self-service way to resend invites and reset passwords without deleting users.
3. Stop triggering Supabase email rate limits by routing email through Resend (custom SMTP).
4. Persist and surface technical errors (Supabase Auth failures, uncaught exceptions, external API errors) in an admin-only "Errores técnicos" view, separate from the security audit trail.
5. Close granular gaps in security event logging (invite accepted, invite skipped, rate-limit blocks, user deletions).

## 3. Non-goals

- Replacing Supabase Auth as the identity provider. We continue using `supabase.auth.admin.*` server-side.
- Building a generic notifications system. We reuse the existing `notifications` table and Resend infrastructure.
- Migrating off the existing `security_events` table. It stays as-is for audit; the new `application_errors` table is purely for technical/operator diagnostics.
- Surfacing Supabase's own Logflare logs in WeBrief UI. Out of scope; admins keep using Supabase Studio for those.

## 4. Decisions

| ID | Decision | Rationale |
|----|----------|-----------|
| D-1 | Test-company checkbox visible to admin + QA (not just admin) | QAs need to seed test data without inviting real managers |
| D-2 | "Enviar acceso" feature available to admin (global) + manager (per-company); **not QA** | QAs should not modify real users' credentials |
| D-3 | Re-invite automatic on company create when manager has never activated | Matches the user's intuition: if invite never arrived, recreate-equivalent must work without deleting |
| D-4 | When manager email belongs to an already-active user (any company): assign membership, no invite | Avoids spamming users; their password is intact |
| D-5 | Invite link TTL: 24h global (Supabase `email_otp_exp = 86400`) | Aligned with operator expectations |
| D-6 | Recovery link TTL: 1h enforced server-side (custom check) | Tighter recovery window for security |
| D-7 | Email delivery: configure Supabase Custom SMTP using Resend | Single change that removes Supabase's email rate limit; reuses existing `RESEND_API_KEY` |
| D-8 | Single adaptive UI button "Enviar acceso" (one button, backend decides invite vs recovery) | Less UX surface; backend reads `last_sign_in_at` |
| D-9 | New table `application_errors` (separate from `security_events`) | Different audience (operator diagnostics) and different schema (stack traces, error codes) |
| D-10 | New table `password_reset_requests` for server-side 1h recovery TTL | Lets us enforce shorter recovery TTL on top of Supabase's global setting |
| D-11 | Notification when adding existing manager to a new company: email + in-app | User wanted both; reuses existing infra |

## 5. Design

### 5.1 Section A — Bug fixes

#### A.1 Test-company checkbox gated to admin + QA

**Frontend** ([frontend/src/pages/CompaniesPage.jsx](frontend/src/pages/CompaniesPage.jsx)):
- Read `currentUser.platformRole` from `useAuth()`.
- Wrap the checkbox block (lines ~631–638) in `{(role === 'admin' || role === 'qa') && (...)}`.
- For non-admin/QA users, the modal still works but has no test-mode option and always requires manager fields.

**Backend** ([backend/src/routes/companies.js:333](backend/src/routes/companies.js)):
- Current guard: `platformRole !== 'admin'` → forbidden.
- Change: allow `platformRole === 'qa'` **only when `testMode === true`**. Non-test company creation remains admin-only.
- Rationale: QA can seed test fixtures but cannot create real client companies that affect production data.

#### A.2 `ensureUserProfile` refactor

**File:** [backend/src/lib/users.js](backend/src/lib/users.js).

**Current behavior (buggy):** if a profile row exists for the email, skip `inviteUserByEmail` and return `inviteSent: false`. This silently fails to re-deliver the email even when the user never activated.

**New behavior:** decide by `auth.users.last_sign_in_at`, not by profile existence.

```
Input: { email, fullName, platformRole }

1. Look up auth.users by email (admin.listUsers is current; will be replaced — see open question O-1).
2. Branch by state:

   Case A — no auth user, no profile:
     → call supabaseAuth.inviteUserByEmail(email, { redirectTo, data: { full_name } })
     → upsert profile
     → return { action: 'invited', userId, inviteSent: true }

   Case B — auth user exists, last_sign_in_at IS NULL (never activated):
     → call supabaseAuth.generateLink({ type: 'invite', email })
     → send email via authEmails.sendInviteEmail (Resend)
     → upsert profile (update full_name if provided)
     → return { action: 'reinvited', userId, inviteSent: true }

   Case C — auth user exists, last_sign_in_at NOT NULL (active):
     → no invite, no email change to credentials
     → upsert profile (update full_name; never downgrade platform_role)
     → return { action: 'assigned_existing', userId, inviteSent: false }
```

**Callers update:**
- `inviteUserToCompany` propagates `action` and `userId` to caller.
- `POST /api/companies` (company creation): on `action: 'assigned_existing'`, trigger the manager-assigned notification (section C).
- `POST /api/users` and `POST /api/auth/invite-user`: include `action` in response and log distinct `security_events` (section E.2).

**Error handling:** any failure from Supabase Auth calls goes through `callSupabaseAuth` wrapper (section D.3), which logs to `application_errors` and rethrows.

#### A.3 Email delivery via Supabase Custom SMTP (Resend)

**This is the most impactful change. No code involved — configuration only.**

Steps:
1. In Supabase Dashboard → Authentication → Email Settings → SMTP Settings, enable "Custom SMTP" with Resend (host `smtp.resend.com`, port `465` SSL or `587` STARTTLS, username `resend`). For the SMTP secret field, paste the existing `RESEND_API_KEY` value. Sender: `WeBrief <no-reply@webrief.app>` (or current value in `COMMENTS_EMAIL_FROM`).
2. In Authentication → Email Templates, raise `email_otp_exp` (OTP expiry) to `86400` (24h).
3. Verify `webrief.app` domain in Resend dashboard if not already verified (SPF/DKIM).
4. Send a test invite to confirm delivery and inspect headers.

**Impact:**
- Removes Supabase's ~3–4/h email cap; replaced by Resend's plan limit (100/day free, much higher on paid).
- All existing flows (invite, recovery, magic link) automatically use Resend without code changes.
- Invite links now last 24h instead of (likely) 1h.

**Out of scope:** Custom email templates. Supabase's default Spanish-friendly templates remain. We can override per-template via `auth.email_templates` later if desired.

### 5.2 Section B — Feature "Enviar acceso"

#### B.1 Endpoint `POST /api/users/:id/send-access`

**Permissions:**
- Admin: any target user.
- Manager: only target users with at least one shared active company where the actor is `manager`.
- QA: forbidden.

**Rate limit:** new `rateLimiters.passwordReset`:
- 5 per hour per (actor + targetUserId)
- 10 per hour total per actor
- Block 15 min on violation, progressive up to 6h

**Logic:**

```
1. authorize(currentUser, targetUserId) → 403 if denied
2. Load auth.users for targetUserId
3. If last_sign_in_at IS NULL (never activated):
     - Call generateLink({ type: 'invite', email })
     - Send invite email via authEmails.sendInviteEmail
     - Log security_events: 'invite_resent'
     - Return { action: 'invite_resent', expiresAt: now + 24h }
   Else (active):
     - Call generateLink({ type: 'recovery', email })
     - Insert row into password_reset_requests(user_id, requested_by, requested_at, expires_at = now + 1h)
     - Send recovery email via authEmails.sendResetPasswordEmail
     - Log security_events: 'password_reset_requested'
     - Return { action: 'reset_sent', expiresAt: now + 1h }
```

**Error responses:**
- 403 forbidden, 404 user not found, 429 rate-limited (with `Retry-After`), 500 with `applicationError.id` for tracing.

#### B.2 UI button "Enviar acceso" in Users page

**File:** [frontend/src/pages/UsersPage.jsx](frontend/src/pages/UsersPage.jsx).

- Show button in each user row (and in the user's expanded detail) when `canSendAccess(currentUser, targetUser)` returns true.
- `canSendAccess` helper in `frontend/src/lib/roleCapabilities.js`:
  - admin: always true (except self)
  - manager: true if `targetUser.companies.some(c => c.role === 'manager' shared with currentUser)`
  - qa, user: false
- Visual: secondary button with `Mail` icon, label "Enviar acceso".
- On click:
  - POST to `/api/users/:id/send-access`
  - Toast on success: "Email enviado, caduca {humanReadableExpiresAt}" + the returned `action` (invite vs reset).
  - Toast on 429: "Demasiados intentos, espera X minutos" using `Retry-After` header.
  - Toast on 500: "Error enviando acceso. ID: {applicationError.id}" so admin can grep logs.

#### B.3 Email templates in Resend

**New file:** `backend/src/lib/authEmails.js`. Pattern follows existing `backend/src/lib/commentEmails.js`.

Three functions:
- `sendInviteEmail({ to, link, fullName, companyName? })` — initial invite or resend
- `sendResetPasswordEmail({ to, link, fullName, expiresAt })` — recovery flow
- `sendManagerAssignedEmail({ to, fullName, companyName, addedBy, companyUrl })` — section C

All templates:
- Subject + plain-text fallback + HTML version
- Spanish copy aligned with brand
- Single CTA button
- Footer with link to support and unsubscribe (where applicable)
- Gated behind `RESEND_API_KEY` env; no-op if missing (logs warning to `application_errors`)

#### B.4 Server-side recovery TTL (1h)

**New migration:** `supabase/migrations/<date>_password_reset_requests.sql`

```sql
CREATE TABLE password_reset_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  requested_by uuid REFERENCES auth.users(id),
  requested_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  ip_address text,
  metadata jsonb DEFAULT '{}'::jsonb
);
CREATE INDEX idx_password_reset_requests_user ON password_reset_requests(user_id, requested_at DESC);
```

**Enforcement:**

Option chosen: server-side check in a new endpoint `POST /api/auth/validate-reset-token` that the frontend `SetPassword.jsx` calls before showing the form when arriving via a recovery flow. The endpoint:

1. Reads the most recent active `password_reset_requests` row for the authenticated user (Supabase session is already established by the time we hit set-password page).
2. If `now > expires_at` OR `used_at IS NOT NULL` → return `{ valid: false, reason: 'expired' }`.
3. Frontend shows "Link de recuperación caducado, pídelo de nuevo".
4. On successful password update, frontend calls `POST /api/auth/mark-reset-used` which sets `used_at = now()`.

**Note:** invite flows have no row in this table (they're tracked only by Supabase's own token), so this check only fires for recovery. Detection: frontend reads `type` from URL hash (`#type=recovery` vs `#type=invite`).

### 5.3 Section C — Notification for manager assigned to new company

Fires when `ensureUserProfile` returns `action: 'assigned_existing'` from inside the company creation or manager re-assignment flows.

#### C.1 Email via Resend

`authEmails.sendManagerAssignedEmail({ to, fullName, companyName, addedBy, companyUrl })`
- Subject: `Te agregaron como manager en {companyName}`
- Body: paragraph describing who added them, link to `${FRONTEND_URL}/companies/{companyId}`
- Sent best-effort; failure logs to `application_errors`, does NOT fail the membership creation.

#### C.2 In-app notification

Insert into existing `notifications` table:
- `user_id`: target user
- `event_type`: `'company_membership_added'`
- `title`: `Te agregaron como manager`
- `body`: `{addedBy.fullName} te agregó a {companyName} como manager`
- `metadata`: `{ companyId, role: 'manager', addedBy: addedBy.id }`

Bell icon in navbar already polls this table; no UI changes required.

### 5.4 Section D — Application errors log

#### D.1 Schema

**Migration:** `supabase/migrations/<date>_application_errors.sql`

```sql
CREATE TABLE application_errors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  level text NOT NULL CHECK (level IN ('error', 'warn')),
  source text NOT NULL, -- 'supabase_auth' | 'route' | 'external_api' | 'unhandled' | 'email'
  request_id text,
  route text,
  method text,
  user_id uuid REFERENCES auth.users(id),
  error_code text,      -- e.g. 'over_email_send_rate_limit', 'EUNHANDLED'
  error_message text NOT NULL,
  stack_trace text,
  metadata jsonb DEFAULT '{}'::jsonb
);
CREATE INDEX idx_application_errors_created ON application_errors(created_at DESC);
CREATE INDEX idx_application_errors_level_source ON application_errors(level, source);
CREATE INDEX idx_application_errors_request ON application_errors(request_id);
```

Retention policy: keep 90 days; a separate maintenance job (out of scope here) truncates older rows.

#### D.2 Helper `logApplicationError`

**New file:** `backend/src/lib/applicationErrors.js`

```
logApplicationError(req, error, { level = 'error', source, errorCode, metadata = {} })
  - extract requestId, route, method, currentUser from req
  - truncate stack_trace to 4000 chars
  - sanitize metadata (no tokens, no full bodies)
  - insert into application_errors (best-effort; failures go to console.error only)
  - return the inserted row id (so callers can include it in 500 responses for traceability)
```

#### D.3 Wrapper `callSupabaseAuth`

**Same file as D.2.**

```
callSupabaseAuth(operation, args, { req, source = 'supabase_auth', operationName })
  - try { return await operation(args) }
  - catch (error) {
      const errorCode = error.code || error.status || 'unknown'
      const isRateLimit = errorCode === 429 || /rate_limit/i.test(error.message || '')
      const id = await logApplicationError(req, error, {
        source: 'supabase_auth',
        errorCode,
        metadata: { operation: operationName, args: sanitizeArgs(args), isRateLimit }
      })
      error.applicationErrorId = id
      throw error
    }
```

Call sites to update:
- `backend/src/lib/users.js`: `inviteUserByEmail`, `listUsers`, `updateUserById`, `generateLink`
- `backend/src/routes/users.js`: `deleteUser`, `updateUserById`
- New `send-access` endpoint (section B.1)

#### D.4 Catch-all Express error handler

Extend [backend/src/middleware/security.js:341](backend/src/middleware/security.js) `securityErrorHandler`:
- For uncaught errors (the final `else` branch), call `logApplicationError(req, error, { source: 'unhandled' })` before responding 500.
- Include `applicationErrorId` in the 500 response body so the client can show it in toasts.

#### D.5 UI: `/security/errors` admin view

**Backend:** new routes in `backend/src/routes/security.js`:
- `GET /api/security/errors?days=7&level=error&source=&limit=100&offset=0` — paginated query
- `GET /api/security/errors/:id` — full detail with stack trace

**Frontend:** new tab/sub-route in `/security`:
- File: `frontend/src/pages/SecurityErrorsTab.jsx` (or similar)
- Columns: timestamp, level, source, route, error_code, error_message (truncated), user_email, request_id
- Click row → modal with full details + stack trace + metadata
- Filters: level (error/warn), source dropdown, days range, search box on error_message
- Empty state: "Sin errores en los últimos N días — todo bien"

### 5.5 Section E — Security observability (events)

#### E.1 Rate-limit blocks logged to `security_events`

[backend/src/middleware/security.js:117](backend/src/middleware/security.js) `rateLimitResponse`:
- In addition to `writeSecurityLog('warn', 'rate_limit_blocked', ...)`, call `logSecurityEvent(req, { action: 'rate_limit_blocked', outcome: 'denied', metadata: { limiter, retryAfterSeconds, violations } })`.
- Action name kept singular per limiter (e.g. `rate_limit_blocked` with `metadata.limiter: 'invite-user'`) for easy filtering.

#### E.2 Granular invite events

Replace the single `company_user_invited` with the following actions (emitted from `ensureUserProfile` callers):

| Action | When |
|--------|------|
| `invite_sent` | Case A in `ensureUserProfile` (new user, fresh invite) |
| `invite_resent` | Case B (existing user, never activated) — both manual and on-create paths |
| `invite_skipped_existing_user` | Case C (existing active user, membership added without invite) |
| `password_reset_requested` | `send-access` endpoint for active user |
| `invite_accepted` | Frontend `SetPassword.jsx` after `updateUser({ password })` succeeds (initial set) |

All include `target_user_id`, `company_id` when applicable, and metadata `{ via: 'company_create' | 'manual_invite' | 'send_access' }`.

#### E.3 `invite_accepted` tracking

**New endpoint:** `POST /api/auth/track-invite-accepted`. Authenticated (Supabase session valid). Body: `{ via: 'invite' | 'recovery' }`.

- Logs `security_events`:
  - For `via === 'invite'`: action `invite_accepted`
  - For `via === 'recovery'`: action `password_reset_completed`
- `SetPassword.jsx` calls this immediately after successful `supabase.auth.updateUser({ password })`, reading `type` from URL hash.

#### E.4 Log `user_deleted` in our security_events

[backend/src/routes/users.js:835](backend/src/routes/users.js) already logs `user_deleted`. **Verify** this still fires for all delete paths (no cascade-only deletions that bypass our code). No code change expected — just verification during implementation.

#### E.5 "Bloqueos activos" view in `/security`

Backend: extend `GET /api/security/overview` and add `GET /api/security/blocks`:
- Combine `security_blocks` (manual blocks, already tabular) with rate-limit blocks derived from `security_events` (action `rate_limit_blocked`, last violation per actor/IP).
- For rate-limit blocks: aggregate by `(actor_user_id|ip_address, limiter)` and surface `lastBlockedAt`, `violations`, `currentlyBlocked: boolean` (computed: latest event within block window).

Frontend: new tab/section in `/security`:
- Lists active blocks, sorted by expiry/last activity.
- Each row: type (manual/rate-limit), subject (email or IP), reason, since, expires, "Revocar" button.
- Revoke action on rate-limit blocks: hits a new `POST /api/security/rate-limits/clear` endpoint that clears the in-memory bucket and (if persistent) the `rate_limit_buckets` row. Admin-only.

## 6. Data model

### 6.1 New tables

- `password_reset_requests` (section B.4)
- `application_errors` (section D.1)

### 6.2 Modified tables

- None. `security_events` continues to receive new action values (E.2/E.3) without schema change.

### 6.3 Indexes

Both new tables include indexes on `created_at DESC` and on the most-common filter columns.

## 7. Permissions matrix

| Action | Admin | QA | Manager | Editor | User |
|--------|-------|----|---------|--------|------|
| Create real company | ✓ | ✗ | ✗ | ✗ | ✗ |
| Create test company | ✓ | ✓ | ✗ | ✗ | ✗ |
| Invite user to company | ✓ | inherited from current code (no change in this milestone) | ✓ (own company) | ✗ | ✗ |
| Send-access (resend invite / reset) | ✓ (any user) | ✗ | ✓ (own company users) | ✗ | ✗ |
| View `/security` events | ✓ | ✗ | ✗ | ✗ | ✗ |
| View `/security/errors` | ✓ | ✗ | ✗ | ✗ | ✗ |
| Revoke security blocks | ✓ | ✗ | ✗ | ✗ | ✗ |

QA's invite permission is per current code: keeping unchanged in this milestone.

## 8. Rollout plan

Recommended execution order:

1. **Step 1 (no code, 5 min):** Configure Supabase Custom SMTP (Resend) and raise `email_otp_exp` to 86400 in Supabase Dashboard. Run a test invite to verify.
2. **Step 2 (migrations):** Apply `password_reset_requests` and `application_errors` migrations.
3. **Step 3 (Plan A — Bug fixes):** Implement A.1 (test-mode gate) and A.2 (`ensureUserProfile` refactor). Deploy. Verify the create-company case with already-known manager email.
4. **Step 4 (Plan D — Application errors infrastructure):** Implement D.1–D.4 (helper + wrapper + catch-all). Deploy. Verify a forced error appears in the new table.
5. **Step 5 (Plan B — Send-access feature):** Implement B.1–B.4 and UI. Deploy. Verify both invite-resend and reset paths.
6. **Step 6 (Plan C — Notifications):** Implement C.1–C.2. Deploy.
7. **Step 7 (Plan E — Security observability + errors UI):** Implement E.1–E.5 and D.5 (errors view). Deploy.

Each step is independently deployable. Step 1 alone resolves the immediate user pain (email rate limit).

## 9. Testing approach

Per-plan tests will be defined during plan writing. High-level testing points:

- A.2 refactor: unit tests for each of the 3 cases (new, pending, active) using a mocked Supabase admin client; the test must cover `last_sign_in_at` NULL vs NOT NULL discrimination and the `action` enum returned to callers.
- B.1 endpoint: integration test with a real Supabase test user that gets invited, deleted, re-invited.
- D.3 wrapper: simulate Supabase auth errors with mock client; assert row appears in `application_errors`.
- E.1 rate-limit logging: hit `inviteUser` 21 times; assert 1 `rate_limit_blocked` event in `security_events`.
- E.3 acceptance tracking: complete an invite end-to-end on staging; assert `invite_accepted` event.

Smoke test on prod after each step (described in section 8).

## 10. Open questions

| ID | Question | Resolution path |
|----|----------|-----------------|
| O-1 | `ensureUserProfile` currently uses `admin.listUsers({ perPage: 1000 })` to find by email — does not scale beyond 1000 users. Replace with `admin.getUserByEmail` if available, or a direct query against `auth.users` via service role. | Verify Supabase SDK version supports `getUserByEmail`; if not, use SQL via `supabaseAdmin.from('auth.users')...`. Resolve during Plan A writing. |
| O-2 | Custom SMTP via Resend: test that Supabase honors the SMTP for *all* email types (invite, recovery, magic link, email change). | Verify with one of each on staging before relying on it in prod. Document in operations runbook. |
| O-3 | `auth.audit_log_entries` is empty on current plan. Should we drop the fallback in our `/security` UI that tries to read it via `get_auth_audit_events` RPC, or keep it for plan upgrades? | Keep the fallback (it's graceful when empty). Add a UI hint "Supabase Auth audit log: deshabilitado en este plan". Resolve during Plan E writing. |
| O-4 | Rate-limit block clearing: should "Revocar" wipe the in-memory bucket only, or also any persistent row in `rate_limit_buckets`? | Both, for completeness. Verify the persistent store path is exercised by the current `RATE_LIMIT_STORE=memory` default. |

## 11. Risks

- **R-1:** Custom SMTP misconfiguration silently breaks all email-based auth flows. **Mitigation:** test plan-by-plan; keep ability to roll back to Supabase default SMTP from Dashboard without code change.
- **R-2:** `ensureUserProfile` refactor changes behavior for *all* invite paths (company create, users page invite, future flows). **Mitigation:** Plan A includes integration tests covering all 4 entry points before deploy.
- **R-3:** `application_errors` table grows fast under attack (one row per failed request). **Mitigation:** 90-day retention + index strategy + the table is admin-only so size is not user-facing. Add monitoring (out of scope) if volume exceeds 10k/day.
- **R-4:** New `track-invite-accepted` endpoint is hit by anyone with a valid session, including replay. **Mitigation:** the endpoint is idempotent (multiple rows OK) and the data is only used for read-only observability; not a privilege-escalation vector. Rate limit at 5/min per user just in case.

## 12. Out of scope (deferred)

- Custom email templates beyond Supabase defaults.
- SMS / phone auth.
- 2FA / MFA.
- SSO integrations.
- Self-service "I forgot my password" UX improvements beyond the existing Supabase flow on `/login`.
- Bulk operations for users (bulk-invite, bulk-deactivate).
- Application-error retention/truncation job (will be a separate ticket).
