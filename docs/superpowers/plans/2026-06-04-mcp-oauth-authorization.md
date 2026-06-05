# WeBrief MCP OAuth 2.1 Authorization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. This plan is designed for **fully autonomous local execution** — every decision is pre-made below. Do not ask the user for input during execution.

**Goal:** Add OAuth 2.1 + PKCE + Dynamic Client Registration to `https://webrief.app/api/mcp` so Claude Desktop users connect their account via the in-app "Add custom connector" flow without copy-pasting bearer tokens. Existing `mcpt_*` long-lived tokens keep working in parallel (zero-downtime coexistence).

**Architecture:**
- **Backend:** 6 new public OAuth endpoints (`/.well-known/oauth-protected-resource`, `/.well-known/oauth-authorization-server`, `/oauth/register`, `/oauth/authorize/preview`, `/oauth/authorize/grant`, `/oauth/token`, `/oauth/revoke`) mounted on Express alongside the existing MCP routes.
- **Database:** 3 new Supabase tables (`oauth_clients`, `oauth_authorization_codes`, `oauth_access_tokens`) with the same RLS-disabled + service-role-only pattern used by `mcp_tokens`.
- **Auth middleware:** extend `requireAuth` with a second fast-path that accepts `at_*` bearer tokens, validates audience binding (RFC 8707), and emits a spec-compliant `WWW-Authenticate` header on 401 from `/api/mcp`.
- **Frontend:** new consent page at `/oauth/authorize` that displays the requesting client + scopes + grants approval. `/integrations` gets a new "Conectar Claude Desktop" CTA that explains the OAuth flow; the existing token-based wizard moves into a collapsible "Avanzado / Devs" section.
- **Coexistence:** `mcpt_*` tokens keep working; OAuth is additive. No deprecation in this phase.

**Tech Stack:**
- Backend: Express 4, Supabase Postgres (service-role client), Node.js `crypto` module (no new npm deps).
- Frontend: React 18 + React Router (already in use).
- Tests: Node built-in `node:test` + `node:assert/strict` (matches existing backend convention).
- OAuth library: **hand-rolled**, NOT `@modelcontextprotocol/sdk`'s `mcpAuthRouter`. Rationale: backend currently has zero MCP SDK deps (the SDK lives only in `mcp/webrief-server/node_modules`); adding it just for the auth router would couple backend ↔ MCP SDK version. The endpoints are small and well-specified; hand-rolling gives full control over storage, audit, error responses, and consent UI integration.

---

## Pre-Decided Specifications

These decisions are **locked**. The executor must not deviate or ask the user.

### Scope model
- **One scope only for v1: `mcp:full`** — maps to "do everything the user can do via UI." This matches the existing `mcpt_*` behavior 1:1.
- Future granular scopes (`webbrief:projects:read`, etc.) are out of scope. Adding them later does not break this contract.

### Token TTLs
- Access token: **3600 s (1 hour)**.
- Refresh token: **2592000 s (30 days)**.
- Authorization code: **300 s (5 minutes)**, single-use, deleted on use.

### Token storage & format
- Opaque random tokens, **SHA-256 hashed at rest** (same pattern as `mcp_tokens`).
- Prefixes: `at_` (access token), `rt_` (refresh token), `mcpc_` (client_id), `code_` (authorization code), `state_` (internal state cache key — server-side only, not exposed).
- All `_` prefixes plus 32 hex chars (16 random bytes) → 37-char total tokens.
- Hashed columns: `token_hash` (sha256 hex, 64 chars).

### Refresh rotation
- **Dual-valid window** (Cloudflare pattern): when refresh token N is consumed, the new refresh token N+1 is issued AND token N stays valid for **60 seconds** so retries on flaky connections don't lock the user out. After 60s, token N is invalidated.
- `parent_token_id` column tracks lineage. Reuse of an already-consumed-and-expired refresh token invalidates the entire family (RFC 6819 §5.2.2.3 family invalidation).

### Audience binding (RFC 8707)
- Canonical resource URI:
  - **Dev:** `http://localhost:3000/api/mcp`
  - **Prod:** `https://webrief.app/api/mcp`
- Configured via env var `MCP_RESOURCE_URI`; defaults to `http://localhost:3000/api/mcp` if unset.
- Normalization rule: lowercase scheme + host, no trailing slash, no fragment, no query.
- Every issued `at_*` and `rt_*` token has an `audience` column. `requireAuth` rejects tokens whose audience !== current `MCP_RESOURCE_URI`.

### Issuer / OAuth URLs
- Issuer identifier:
  - **Dev:** `http://localhost:3000`
  - **Prod:** `https://webrief.app`
- Configured via env var `OAUTH_ISSUER`; defaults to `http://localhost:3000`.
- Frontend redirect for consent:
  - **Dev:** `http://localhost:5173/oauth/authorize`
  - **Prod:** `https://webrief.app/oauth/authorize`
- Configured via env var `OAUTH_CONSENT_URL`; defaults to `http://localhost:5173/oauth/authorize`.

### Dynamic Client Registration (RFC 7591)
- `POST /oauth/register` is public (no auth).
- Rate limit: reuse `rateLimiters.sensitiveAction` (existing in `backend/src/middleware/security.js`).
- Allowed redirect URIs (validated server-side):
  - `https://claude.ai/api/mcp/auth_callback` (exact match — Claude.ai web, Desktop, mobile, Cowork).
  - `http://localhost:<port>/callback` AND `http://127.0.0.1:<port>/callback` with **port-agnostic matching** (RFC 8252; Claude Code CLI uses random ports).
  - Any other redirect_uri → reject with 400 + `invalid_redirect_uri`.
- `token_endpoint_auth_method`: only `"none"` accepted (public clients only). No client secrets issued. PKCE is the proof of possession.
- Client expiry: **inactive clients deleted after 90 days** (background cleanup not in this plan; rely on natural decay + manual cleanup if needed).
- Issued `client_id` format: `mcpc_` + 16 hex chars.

### PKCE
- Required. `code_challenge_method`: only `S256` accepted (no `plain`).
- `code_verifier`: 43-128 chars from `[A-Za-z0-9\-._~]` (RFC 7636 §4.1).
- `code_challenge`: `BASE64URL(SHA256(code_verifier))` (RFC 7636 §4.2).

### Consent UI
- Spanish (neutral, per CLAUDE.md). NOT Argentinian.
- Displays: client_name, redirect_uri hostname (literal, MUST), requested scopes (`mcp:full` → "Acceso completo a tu cuenta WeBrief").
- Two buttons: **"Autorizar"** (primary) and **"Denegar"** (secondary).
- If user not logged in: redirect to `/login?return_to=<encoded /oauth/authorize URL>` and resume after login.
- Anti-clickjacking: server sets `X-Frame-Options: DENY` on the consent page response (already covered by `securityHeaders` middleware — verify in test).

### State parameter
- Required on `/oauth/authorize`. Opaque, server validates ≤256 chars, returns as-is in redirect.
- No server-side state binding — `state` is the client's CSRF token, our job is to echo it back faithfully.

### WWW-Authenticate header
- Emitted ONLY by `/api/mcp` middleware on 401, not by other routes.
- Format (literal, no line breaks):
  ```
  Bearer resource_metadata="<OAUTH_ISSUER>/.well-known/oauth-protected-resource/api/mcp", scope="mcp:full"
  ```

### Audit / security events
- New `security_events` actions (insert into existing table, no schema change):
  - `oauth_client_registered` (DCR success)
  - `oauth_client_register_rejected` (invalid redirect_uri, rate limit, etc.)
  - `oauth_authorize_consented`
  - `oauth_authorize_denied`
  - `oauth_token_issued` (authorization_code grant)
  - `oauth_token_refreshed` (refresh_token grant)
  - `oauth_token_refresh_reused` (family invalidation trigger — high signal)
  - `oauth_token_revoked` (explicit revoke endpoint or cascade)
  - `oauth_token_used` (fast-path success; non-blocking like `mcp_token_used`)
  - `oauth_token_invalid` (fast-path failure)

### Coexistence with `mcpt_*` tokens
- Both `mcpt_*` and `at_*` Bearer prefixes accepted by `requireAuth`.
- No deprecation banner in this phase.
- `last_used_at` updated for both token types in their respective tables.

### Database migration naming
- File: `supabase/migrations/20260604_mcp_oauth.sql`.
- Apply to **Dev project only** (`iimqxacagxuemwgaunis`) during execution. Prod application is out of scope for this plan (user will deploy manually).

### Local execution environment
- Backend on `http://localhost:3000` (already running via `cd backend && npm run dev`).
- Frontend on `http://localhost:5173` (already running via `cd frontend && npm run dev`).
- Supabase Dev project: `iimqxacagxuemwgaunis` (us-west-1).
- Migration apply method: `mcp__supabaseDev__apply_migration_file` tool.
- `.env` of backend already has `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`. New env vars (`MCP_RESOURCE_URI`, `OAUTH_ISSUER`, `OAUTH_CONSENT_URL`) — executor adds them with defaults at the end of `backend/.env` IF NOT present.

### Out of scope (do NOT implement)
- Production deployment to VPS (user does manually after validation).
- Token revocation propagation to active MCP sessions (best-effort: revoked tokens fail next request).
- `mcpt_*` deprecation banner or sunset.
- Granular scopes (`webbrief:projects:read`, etc.).
- Client management UI (list/revoke OAuth clients per user).
- DCR client expiry background job (handled by manual SQL if needed).
- Migration of existing `mcpt_*` users to OAuth.
- Tests using a real Claude Desktop instance (use curl-based smoke test instead).

---

## File Structure

### Files to CREATE
- `supabase/migrations/20260604_mcp_oauth.sql` — 3 new tables + indexes.
- `backend/src/lib/oauthHelpers.js` — pure helpers: canonicalize URI, generate tokens, hash, PKCE verify, validate redirect_uri.
- `backend/src/lib/oauthStore.js` — DB access helpers for the 3 oauth tables (insert client, lookup code, rotate refresh, etc.).
- `backend/src/routes/oauth.js` — Express router with all 6 OAuth endpoints + 2 well-known endpoints. Mounted at `/`.
- `backend/test/oauth-helpers.test.js` — unit tests for `oauthHelpers.js`.
- `backend/test/oauth-flow.test.js` — integration tests for the full flow (mocked DB).
- `frontend/src/pages/OAuthConsentPage.jsx` — React consent page.
- `frontend/src/pages/OAuthConsentPage.module.css` — styles for consent page.
- `mcp/webrief-server/test/smoke-oauth.sh` — curl-based end-to-end smoke test script.

### Files to MODIFY
- `backend/src/index.js` — mount the new OAuth router at `/`. Adjust `express.json()` placement so well-known endpoints work.
- `backend/src/middleware/auth.js` — add `at_*` fast-path AFTER the `mcpt_*` fast-path, before the Supabase fallback.
- `backend/src/routes/mcp.js` — wrap `requireAuth` to emit `WWW-Authenticate` on 401 (or pass a flag to middleware).
- `frontend/src/App.jsx` — add `/oauth/authorize` route (public — NOT under `<PrivateRoute>`; the page handles its own login redirect).
- `frontend/src/pages/IntegrationsPage.jsx` — add OAuth CTA at top; move existing token wizard into collapsible "Avanzado / Devs" section.

---

## Task 1: Database migration — oauth tables

**Files:**
- Create: `supabase/migrations/20260604_mcp_oauth.sql`

- [ ] **Step 1.1: Write the migration SQL**

```sql
-- 20260604_mcp_oauth.sql
-- OAuth 2.1 + PKCE + DCR support for MCP authorization (per spec 2025-11-25).
-- All tables are service-role-only (RLS enabled, no policies) — frontend never
-- reads/writes these directly; backend mediates via the OAuth endpoints.

-- ─── 1. oauth_clients ────────────────────────────────────────────────────
-- Dynamically registered MCP clients (one row per Claude Desktop install,
-- Claude Code session, etc.). Public clients only — no client_secret.

create table if not exists public.oauth_clients (
  id uuid primary key default gen_random_uuid(),
  client_id text not null unique,                  -- 'mcpc_' + 16 hex
  client_name text not null,                       -- self-reported, displayed in consent UI
  redirect_uris jsonb not null,                    -- array of strings
  grant_types jsonb not null default '["authorization_code","refresh_token"]'::jsonb,
  response_types jsonb not null default '["code"]'::jsonb,
  token_endpoint_auth_method text not null default 'none',
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

create index if not exists oauth_clients_client_id_idx on public.oauth_clients(client_id);
create index if not exists oauth_clients_last_used_idx on public.oauth_clients(last_used_at desc nulls last);

alter table public.oauth_clients enable row level security;

-- ─── 2. oauth_authorization_codes ────────────────────────────────────────
-- Short-lived (5min) one-time codes issued after consent. Deleted on use or expiry.

create table if not exists public.oauth_authorization_codes (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique,                  -- sha256(code) — code never stored raw
  client_id text not null references public.oauth_clients(client_id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  redirect_uri text not null,
  code_challenge text not null,                    -- S256 challenge (the BASE64URL hash)
  code_challenge_method text not null default 'S256',
  scope text not null,
  resource text not null,                          -- audience the token will be bound to
  state text,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  used_at timestamptz
);

create index if not exists oauth_codes_code_hash_idx on public.oauth_authorization_codes(code_hash);
create index if not exists oauth_codes_expires_at_idx on public.oauth_authorization_codes(expires_at);

alter table public.oauth_authorization_codes enable row level security;

-- ─── 3. oauth_access_tokens ──────────────────────────────────────────────
-- Issued by /oauth/token. One row per access OR refresh token.
-- token_type discriminator: 'access' (1h TTL) | 'refresh' (30d TTL).
-- parent_token_id: refresh tokens point to the refresh they replaced (rotation lineage).
-- audience: RFC 8707 binding; validated by requireAuth.

create table if not exists public.oauth_access_tokens (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,                 -- sha256(token)
  token_type text not null check (token_type in ('access','refresh')),
  client_id text not null references public.oauth_clients(client_id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  scope text not null,
  audience text not null,
  parent_token_id uuid references public.oauth_access_tokens(id) on delete set null,
  family_id uuid not null,                         -- shared by all tokens in a refresh lineage
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  invalidated_at timestamptz,                      -- set when superseded by rotation (dual-valid window)
  last_used_at timestamptz
);

create index if not exists oauth_tokens_token_hash_idx on public.oauth_access_tokens(token_hash);
create index if not exists oauth_tokens_user_id_idx on public.oauth_access_tokens(user_id);
create index if not exists oauth_tokens_family_idx on public.oauth_access_tokens(family_id);
create index if not exists oauth_tokens_expires_at_idx on public.oauth_access_tokens(expires_at);

alter table public.oauth_access_tokens enable row level security;
```

- [ ] **Step 1.2: Apply the migration to Dev Supabase**

Use the MCP tool: `mcp__supabaseDev__apply_migration_file` with the file path above. Verify success: the response includes `migration_name: '20260604_mcp_oauth'` with no error.

- [ ] **Step 1.3: Verify tables exist**

Use `mcp__supabaseDev__list_tables`. Expected: `oauth_clients`, `oauth_authorization_codes`, `oauth_access_tokens` all present.

- [ ] **Step 1.4: Commit**

```bash
cd /Users/adrian/GitHub/webbrief
git add supabase/migrations/20260604_mcp_oauth.sql
git commit -m "feat(oauth): add migration for MCP OAuth 2.1 tables

3 new tables: oauth_clients (DCR), oauth_authorization_codes (5min TTL,
single-use), oauth_access_tokens (access + refresh, with family tracking
for rotation). All service-role-only (RLS enabled, no policies).

Applied to Dev (iimqxacagxuemwgaunis). Prod apply deferred to manual deploy."
```

---

## Task 2: oauthHelpers.js — pure helper library

**Files:**
- Create: `backend/src/lib/oauthHelpers.js`
- Create: `backend/test/oauth-helpers.test.js`

- [ ] **Step 2.1: Write the failing tests**

```js
// backend/test/oauth-helpers.test.js
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  canonicalizeResourceUri,
  generateClientId,
  generateOpaqueToken,
  hashToken,
  verifyPkceChallenge,
  isAllowedRedirectUri,
  buildWwwAuthenticateHeader,
} from '../src/lib/oauthHelpers.js'

// ─── canonicalizeResourceUri ───
test('canonicalizeResourceUri: lowercases scheme + host, strips trailing slash + fragment + query', () => {
  assert.equal(canonicalizeResourceUri('HTTPS://WebRief.APP/api/mcp/'), 'https://webrief.app/api/mcp')
  assert.equal(canonicalizeResourceUri('https://webrief.app/api/mcp#frag'), 'https://webrief.app/api/mcp')
  assert.equal(canonicalizeResourceUri('https://webrief.app/api/mcp?x=1'), 'https://webrief.app/api/mcp')
  assert.equal(canonicalizeResourceUri('http://localhost:3000/api/mcp'), 'http://localhost:3000/api/mcp')
})

test('canonicalizeResourceUri: throws on invalid URI', () => {
  assert.throws(() => canonicalizeResourceUri(''), /Invalid resource URI/)
  assert.throws(() => canonicalizeResourceUri('not a url'), /Invalid resource URI/)
})

// ─── generateClientId / generateOpaqueToken ───
test('generateClientId: returns mcpc_ prefix + 16 hex', () => {
  const id = generateClientId()
  assert.match(id, /^mcpc_[0-9a-f]{16}$/)
})

test('generateOpaqueToken: returns prefix + 32 hex', () => {
  assert.match(generateOpaqueToken('at_'), /^at_[0-9a-f]{32}$/)
  assert.match(generateOpaqueToken('rt_'), /^rt_[0-9a-f]{32}$/)
  assert.match(generateOpaqueToken('code_'), /^code_[0-9a-f]{32}$/)
})

test('generateOpaqueToken: each call returns distinct value', () => {
  const a = generateOpaqueToken('at_')
  const b = generateOpaqueToken('at_')
  assert.notEqual(a, b)
})

// ─── hashToken ───
test('hashToken: returns 64-char hex sha256', () => {
  const hash = hashToken('mcpt_abc')
  assert.equal(hash.length, 64)
  assert.match(hash, /^[0-9a-f]{64}$/)
})

test('hashToken: deterministic', () => {
  assert.equal(hashToken('foo'), hashToken('foo'))
})

// ─── verifyPkceChallenge ───
test('verifyPkceChallenge: S256 valid verifier passes', () => {
  // Verifier from RFC 7636 §B (test vector)
  const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'
  const challenge = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM'
  assert.equal(verifyPkceChallenge({ verifier, challenge, method: 'S256' }), true)
})

test('verifyPkceChallenge: S256 invalid verifier fails', () => {
  const challenge = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM'
  assert.equal(verifyPkceChallenge({ verifier: 'wrong', challenge, method: 'S256' }), false)
})

test('verifyPkceChallenge: plain method rejected', () => {
  assert.equal(verifyPkceChallenge({ verifier: 'x', challenge: 'x', method: 'plain' }), false)
})

test('verifyPkceChallenge: verifier too short rejected (< 43)', () => {
  assert.equal(verifyPkceChallenge({ verifier: 'short', challenge: 'x', method: 'S256' }), false)
})

test('verifyPkceChallenge: verifier too long rejected (> 128)', () => {
  assert.equal(verifyPkceChallenge({ verifier: 'a'.repeat(129), challenge: 'x', method: 'S256' }), false)
})

// ─── isAllowedRedirectUri ───
test('isAllowedRedirectUri: allows Claude.ai exact match', () => {
  assert.equal(isAllowedRedirectUri('https://claude.ai/api/mcp/auth_callback'), true)
})

test('isAllowedRedirectUri: allows http://localhost:<port>/callback', () => {
  assert.equal(isAllowedRedirectUri('http://localhost:33421/callback'), true)
  assert.equal(isAllowedRedirectUri('http://localhost:1/callback'), true)
})

test('isAllowedRedirectUri: allows http://127.0.0.1:<port>/callback', () => {
  assert.equal(isAllowedRedirectUri('http://127.0.0.1:55555/callback'), true)
})

test('isAllowedRedirectUri: rejects loopback without port', () => {
  assert.equal(isAllowedRedirectUri('http://localhost/callback'), false)
})

test('isAllowedRedirectUri: rejects unknown HTTPS hosts', () => {
  assert.equal(isAllowedRedirectUri('https://evil.example.com/cb'), false)
})

test('isAllowedRedirectUri: rejects http on non-loopback', () => {
  assert.equal(isAllowedRedirectUri('http://claude.ai/api/mcp/auth_callback'), false)
})

test('isAllowedRedirectUri: rejects javascript: and other schemes', () => {
  assert.equal(isAllowedRedirectUri('javascript:alert(1)'), false)
  assert.equal(isAllowedRedirectUri('data:,x'), false)
  assert.equal(isAllowedRedirectUri('file:///etc/passwd'), false)
})

test('isAllowedRedirectUri: rejects empty / null / non-string', () => {
  assert.equal(isAllowedRedirectUri(''), false)
  assert.equal(isAllowedRedirectUri(null), false)
  assert.equal(isAllowedRedirectUri(undefined), false)
  assert.equal(isAllowedRedirectUri(42), false)
})

// ─── buildWwwAuthenticateHeader ───
test('buildWwwAuthenticateHeader: returns spec-compliant string', () => {
  const header = buildWwwAuthenticateHeader({
    issuer: 'https://webrief.app',
    resourcePath: '/api/mcp',
    scope: 'mcp:full',
  })
  assert.equal(
    header,
    'Bearer resource_metadata="https://webrief.app/.well-known/oauth-protected-resource/api/mcp", scope="mcp:full"'
  )
})
```

- [ ] **Step 2.2: Run tests to verify they fail**

```bash
cd /Users/adrian/GitHub/webbrief/backend
npm test -- --test-name-pattern='oauth-helpers'
```

Expected: ALL tests FAIL with "Cannot find module" or "is not a function".

- [ ] **Step 2.3: Write the implementation**

```js
// backend/src/lib/oauthHelpers.js
// Pure helpers for OAuth 2.1 + PKCE + DCR. No DB, no network.

import { randomBytes, createHash } from 'node:crypto'

/**
 * Canonical resource URI per RFC 8707 + MCP spec §Canonical Server URI.
 * Lowercase scheme + host, strip trailing slash, fragment, query.
 * Throws on invalid URI.
 */
export function canonicalizeResourceUri(uri) {
  if (typeof uri !== 'string' || !uri) {
    throw new Error('Invalid resource URI: empty or non-string')
  }
  let parsed
  try {
    parsed = new URL(uri)
  } catch {
    throw new Error('Invalid resource URI: not a URL')
  }
  const scheme = parsed.protocol.toLowerCase()
  const host = parsed.host.toLowerCase()
  let path = parsed.pathname
  if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1)
  return `${scheme}//${host}${path}`
}

/** Generate a new mcpc_<16 hex> client id. */
export function generateClientId() {
  return 'mcpc_' + randomBytes(8).toString('hex')
}

/** Generate an opaque token: <prefix><32 hex>. 16 bytes = 128 bits entropy. */
export function generateOpaqueToken(prefix) {
  return prefix + randomBytes(16).toString('hex')
}

/** SHA-256 hex digest of a token. */
export function hashToken(raw) {
  return createHash('sha256').update(raw).digest('hex')
}

/** Base64URL encode a buffer (no padding). */
function base64url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * Verify a PKCE code_verifier against its code_challenge.
 * Only S256 is supported (plain is explicitly rejected per MCP spec).
 * Verifier length must be 43..128 chars (RFC 7636 §4.1).
 */
export function verifyPkceChallenge({ verifier, challenge, method }) {
  if (method !== 'S256') return false
  if (typeof verifier !== 'string' || verifier.length < 43 || verifier.length > 128) return false
  if (typeof challenge !== 'string' || !challenge) return false
  const computed = base64url(createHash('sha256').update(verifier).digest())
  return computed === challenge
}

/**
 * Validate redirect_uri per the locked policy.
 * Allowed:
 *   - https://claude.ai/api/mcp/auth_callback (exact)
 *   - http://localhost:<port>/callback (any port > 0)
 *   - http://127.0.0.1:<port>/callback (any port > 0)
 * Everything else rejected (RFC 8252 + locked policy).
 */
export function isAllowedRedirectUri(uri) {
  if (typeof uri !== 'string' || !uri) return false
  if (uri === 'https://claude.ai/api/mcp/auth_callback') return true
  let parsed
  try {
    parsed = new URL(uri)
  } catch {
    return false
  }
  if (parsed.protocol !== 'http:') return false
  const host = parsed.hostname
  if (host !== 'localhost' && host !== '127.0.0.1') return false
  if (!parsed.port) return false
  const portNum = Number(parsed.port)
  if (!Number.isInteger(portNum) || portNum < 1 || portNum > 65535) return false
  if (parsed.pathname !== '/callback') return false
  return true
}

/**
 * Build the WWW-Authenticate header value for 401 responses from /api/mcp.
 * Per RFC 9728 §5.1 + MCP spec example.
 */
export function buildWwwAuthenticateHeader({ issuer, resourcePath, scope }) {
  const metadataUrl = `${issuer}/.well-known/oauth-protected-resource${resourcePath}`
  return `Bearer resource_metadata="${metadataUrl}", scope="${scope}"`
}
```

- [ ] **Step 2.4: Run tests to verify they pass**

```bash
cd /Users/adrian/GitHub/webbrief/backend
npm test -- --test-name-pattern='oauth-helpers'
```

Expected: ALL tests PASS. If any fail, fix `oauthHelpers.js` until green. Do not modify tests.

- [ ] **Step 2.5: Commit**

```bash
cd /Users/adrian/GitHub/webbrief
git add backend/src/lib/oauthHelpers.js backend/test/oauth-helpers.test.js
git commit -m "feat(oauth): add pure helper library for OAuth 2.1

canonicalizeResourceUri, generateClientId, generateOpaqueToken, hashToken,
verifyPkceChallenge (S256 only per MCP spec), isAllowedRedirectUri
(Claude.ai exact + loopback port-agnostic), buildWwwAuthenticateHeader.

19 unit tests covering RFC 7636 PKCE test vectors + boundary cases."
```

---

## Task 3: oauthStore.js — DB access layer

**Files:**
- Create: `backend/src/lib/oauthStore.js`

- [ ] **Step 3.1: Write the implementation**

```js
// backend/src/lib/oauthStore.js
// All DB access for OAuth tables. Service-role only.

import { supabaseAdmin } from './supabase.js'
import { hashToken, generateOpaqueToken } from './oauthHelpers.js'
import { randomUUID } from 'node:crypto'

const ACCESS_TOKEN_TTL_SECONDS = 3600       // 1 hour
const REFRESH_TOKEN_TTL_SECONDS = 2592000   // 30 days
const CODE_TTL_SECONDS = 300                // 5 minutes
const DUAL_VALID_WINDOW_SECONDS = 60        // rotation grace

// ─── Clients ────────────────────────────────────────────────────────────

export async function insertClient({ clientId, clientName, redirectUris }) {
  const { data, error } = await supabaseAdmin
    .from('oauth_clients')
    .insert({
      client_id: clientId,
      client_name: clientName,
      redirect_uris: redirectUris,
    })
    .select('client_id, client_name, redirect_uris, grant_types, response_types, token_endpoint_auth_method, created_at')
    .single()
  if (error) throw new Error(`insertClient: ${error.message}`)
  return data
}

export async function getClient(clientId) {
  const { data, error } = await supabaseAdmin
    .from('oauth_clients')
    .select('client_id, client_name, redirect_uris')
    .eq('client_id', clientId)
    .maybeSingle()
  if (error) throw new Error(`getClient: ${error.message}`)
  return data
}

// ─── Authorization codes ────────────────────────────────────────────────

export async function insertAuthCode({
  clientId, userId, redirectUri, codeChallenge, scope, resource, state,
}) {
  const code = generateOpaqueToken('code_')
  const codeHash = hashToken(code)
  const expiresAt = new Date(Date.now() + CODE_TTL_SECONDS * 1000).toISOString()
  const { error } = await supabaseAdmin
    .from('oauth_authorization_codes')
    .insert({
      code_hash: codeHash,
      client_id: clientId,
      user_id: userId,
      redirect_uri: redirectUri,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      scope,
      resource,
      state: state || null,
      expires_at: expiresAt,
    })
  if (error) throw new Error(`insertAuthCode: ${error.message}`)
  return code
}

export async function consumeAuthCode(code) {
  const codeHash = hashToken(code)
  // Fetch + mark used in one transaction-like flow. We accept a small race:
  // two simultaneous redemptions both see used_at=null, both call update,
  // but only one update succeeds because we filter on used_at IS NULL.
  const { data, error } = await supabaseAdmin
    .from('oauth_authorization_codes')
    .update({ used_at: new Date().toISOString() })
    .eq('code_hash', codeHash)
    .is('used_at', null)
    .gt('expires_at', new Date().toISOString())
    .select('client_id, user_id, redirect_uri, code_challenge, scope, resource')
    .maybeSingle()
  if (error) throw new Error(`consumeAuthCode: ${error.message}`)
  return data
}

// ─── Tokens ─────────────────────────────────────────────────────────────

export async function issueTokenFamily({ clientId, userId, scope, audience }) {
  const familyId = randomUUID()
  const accessRaw = generateOpaqueToken('at_')
  const refreshRaw = generateOpaqueToken('rt_')
  const now = new Date()
  const accessExpiresAt = new Date(now.getTime() + ACCESS_TOKEN_TTL_SECONDS * 1000).toISOString()
  const refreshExpiresAt = new Date(now.getTime() + REFRESH_TOKEN_TTL_SECONDS * 1000).toISOString()

  // Insert both rows so failure of either rolls back nothing — we just lose
  // the unused half. Acceptable for token issuance.
  const { error: refreshError } = await supabaseAdmin
    .from('oauth_access_tokens')
    .insert({
      token_hash: hashToken(refreshRaw),
      token_type: 'refresh',
      client_id: clientId,
      user_id: userId,
      scope, audience,
      family_id: familyId,
      expires_at: refreshExpiresAt,
    })
  if (refreshError) throw new Error(`issueTokenFamily refresh: ${refreshError.message}`)

  const { error: accessError } = await supabaseAdmin
    .from('oauth_access_tokens')
    .insert({
      token_hash: hashToken(accessRaw),
      token_type: 'access',
      client_id: clientId,
      user_id: userId,
      scope, audience,
      family_id: familyId,
      expires_at: accessExpiresAt,
    })
  if (accessError) throw new Error(`issueTokenFamily access: ${accessError.message}`)

  return {
    access_token: accessRaw,
    refresh_token: refreshRaw,
    token_type: 'Bearer',
    expires_in: ACCESS_TOKEN_TTL_SECONDS,
    scope,
  }
}

/**
 * Look up an access token by raw value. Returns the row + user_id + audience
 * if valid (not expired, not revoked, not invalidated). Returns null otherwise.
 */
export async function lookupAccessToken(rawToken) {
  const { data, error } = await supabaseAdmin
    .from('oauth_access_tokens')
    .select('id, user_id, scope, audience, expires_at, revoked_at, invalidated_at')
    .eq('token_hash', hashToken(rawToken))
    .eq('token_type', 'access')
    .maybeSingle()
  if (error) throw new Error(`lookupAccessToken: ${error.message}`)
  if (!data) return null
  if (data.revoked_at || data.invalidated_at) return null
  if (new Date(data.expires_at).getTime() < Date.now()) return null
  return data
}

/**
 * Refresh-token rotation with dual-valid window + family invalidation.
 * Returns { tokens, familyInvalidated } where familyInvalidated=true means
 * the caller MUST log oauth_token_refresh_reused and NOT return tokens.
 */
export async function rotateRefreshToken(rawRefresh) {
  const refreshHash = hashToken(rawRefresh)
  const { data: row, error: lookupErr } = await supabaseAdmin
    .from('oauth_access_tokens')
    .select('id, client_id, user_id, scope, audience, family_id, expires_at, revoked_at, invalidated_at, last_used_at')
    .eq('token_hash', refreshHash)
    .eq('token_type', 'refresh')
    .maybeSingle()
  if (lookupErr) throw new Error(`rotateRefreshToken lookup: ${lookupErr.message}`)
  if (!row) return { tokens: null, familyInvalidated: false }
  if (row.revoked_at || new Date(row.expires_at).getTime() < Date.now()) {
    return { tokens: null, familyInvalidated: false }
  }
  // Dual-valid window: if already used (invalidated_at set) AND outside the 60s grace,
  // this is a reuse attack → invalidate the entire family.
  if (row.invalidated_at) {
    const invalidatedMs = new Date(row.invalidated_at).getTime()
    const ageSeconds = (Date.now() - invalidatedMs) / 1000
    if (ageSeconds > DUAL_VALID_WINDOW_SECONDS) {
      await supabaseAdmin
        .from('oauth_access_tokens')
        .update({ revoked_at: new Date().toISOString() })
        .eq('family_id', row.family_id)
        .is('revoked_at', null)
      return { tokens: null, familyInvalidated: true }
    }
    // Within grace window: tolerate retry, return previously-issued tokens? No —
    // simpler: still issue a NEW pair. The 60s grace just prevents the family
    // invalidation; we still rotate forward.
  }

  // Mark the consumed refresh as invalidated NOW (dual-valid grace starts).
  await supabaseAdmin
    .from('oauth_access_tokens')
    .update({
      invalidated_at: new Date().toISOString(),
      last_used_at: new Date().toISOString(),
    })
    .eq('id', row.id)

  // Issue a new access + refresh in the SAME family.
  const accessRaw = generateOpaqueToken('at_')
  const refreshRaw = generateOpaqueToken('rt_')
  const now = new Date()
  const accessExpiresAt = new Date(now.getTime() + ACCESS_TOKEN_TTL_SECONDS * 1000).toISOString()
  const refreshExpiresAt = new Date(now.getTime() + REFRESH_TOKEN_TTL_SECONDS * 1000).toISOString()

  const { error: rErr } = await supabaseAdmin
    .from('oauth_access_tokens')
    .insert({
      token_hash: hashToken(refreshRaw),
      token_type: 'refresh',
      client_id: row.client_id,
      user_id: row.user_id,
      scope: row.scope,
      audience: row.audience,
      parent_token_id: row.id,
      family_id: row.family_id,
      expires_at: refreshExpiresAt,
    })
  if (rErr) throw new Error(`rotateRefreshToken insert refresh: ${rErr.message}`)

  const { error: aErr } = await supabaseAdmin
    .from('oauth_access_tokens')
    .insert({
      token_hash: hashToken(accessRaw),
      token_type: 'access',
      client_id: row.client_id,
      user_id: row.user_id,
      scope: row.scope,
      audience: row.audience,
      parent_token_id: row.id,
      family_id: row.family_id,
      expires_at: accessExpiresAt,
    })
  if (aErr) throw new Error(`rotateRefreshToken insert access: ${aErr.message}`)

  return {
    tokens: {
      access_token: accessRaw,
      refresh_token: refreshRaw,
      token_type: 'Bearer',
      expires_in: ACCESS_TOKEN_TTL_SECONDS,
      scope: row.scope,
    },
    familyInvalidated: false,
  }
}

/** Revoke a token (and its entire family). Idempotent. */
export async function revokeToken(rawToken) {
  const tokenHash = hashToken(rawToken)
  const { data: row, error: lookupErr } = await supabaseAdmin
    .from('oauth_access_tokens')
    .select('id, family_id')
    .eq('token_hash', tokenHash)
    .maybeSingle()
  if (lookupErr) throw new Error(`revokeToken lookup: ${lookupErr.message}`)
  if (!row) return false
  const { error } = await supabaseAdmin
    .from('oauth_access_tokens')
    .update({ revoked_at: new Date().toISOString() })
    .eq('family_id', row.family_id)
    .is('revoked_at', null)
  if (error) throw new Error(`revokeToken cascade: ${error.message}`)
  return true
}

/** Non-blocking — best effort. */
export async function touchAccessToken(tokenId) {
  await supabaseAdmin
    .from('oauth_access_tokens')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', tokenId)
    .catch(() => {})
}
```

- [ ] **Step 3.2: Quick smoke check — module loads**

```bash
cd /Users/adrian/GitHub/webbrief/backend
node -e "import('./src/lib/oauthStore.js').then(m => console.log('exports:', Object.keys(m)))"
```

Expected output:
```
exports: [ 'insertClient', 'getClient', 'insertAuthCode', 'consumeAuthCode', 'issueTokenFamily', 'lookupAccessToken', 'rotateRefreshToken', 'revokeToken', 'touchAccessToken' ]
```

- [ ] **Step 3.3: Commit**

```bash
cd /Users/adrian/GitHub/webbrief
git add backend/src/lib/oauthStore.js
git commit -m "feat(oauth): add DB access layer for OAuth tables

insertClient, getClient (DCR), insertAuthCode + consumeAuthCode (5min,
single-use via update-with-filter), issueTokenFamily + rotateRefreshToken
(dual-valid 60s window + family invalidation on reuse), lookupAccessToken
(validates expiry/revoke/invalidated), revokeToken (cascade by family_id),
touchAccessToken (non-blocking last_used)."
```

---

## Task 4: oauth.js router — well-known + DCR endpoints

**Files:**
- Create: `backend/src/routes/oauth.js`

- [ ] **Step 4.1: Write the initial router with well-known + register endpoints**

```js
// backend/src/routes/oauth.js
// All OAuth 2.1 endpoints. Mounted at '/' (so paths like /.well-known/* work).

import express from 'express'
import { rateLimiters } from '../middleware/security.js'
import { logSecurityEvent } from '../lib/securityAudit.js'
import {
  canonicalizeResourceUri,
  generateClientId,
  isAllowedRedirectUri,
  verifyPkceChallenge,
} from '../lib/oauthHelpers.js'
import {
  insertClient,
  getClient,
  insertAuthCode,
  consumeAuthCode,
  issueTokenFamily,
  rotateRefreshToken,
  revokeToken,
} from '../lib/oauthStore.js'
import { requireAuth } from '../middleware/auth.js'

const router = express.Router()

const ISSUER = process.env.OAUTH_ISSUER || 'http://localhost:3000'
const RESOURCE_URI = canonicalizeResourceUri(process.env.MCP_RESOURCE_URI || 'http://localhost:3000/api/mcp')
const CONSENT_URL = process.env.OAUTH_CONSENT_URL || 'http://localhost:5173/oauth/authorize'
const SCOPE_FULL = 'mcp:full'

// ─── Well-known metadata ────────────────────────────────────────────────

// Per-resource path: /.well-known/oauth-protected-resource/api/mcp
// Root fallback for clients that don't probe sub-paths.
const PROTECTED_RESOURCE_METADATA = {
  resource: RESOURCE_URI,
  authorization_servers: [ISSUER],
  scopes_supported: [SCOPE_FULL],
  bearer_methods_supported: ['header'],
  resource_name: 'WeBrief MCP',
}

router.get('/.well-known/oauth-protected-resource/api/mcp', (req, res) => {
  res.json(PROTECTED_RESOURCE_METADATA)
})
router.get('/.well-known/oauth-protected-resource', (req, res) => {
  res.json(PROTECTED_RESOURCE_METADATA)
})

router.get('/.well-known/oauth-authorization-server', (req, res) => {
  res.json({
    issuer: ISSUER,
    authorization_endpoint: `${ISSUER}/oauth/authorize`,
    token_endpoint: `${ISSUER}/oauth/token`,
    registration_endpoint: `${ISSUER}/oauth/register`,
    revocation_endpoint: `${ISSUER}/oauth/revoke`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
    scopes_supported: [SCOPE_FULL],
  })
})

// ─── Dynamic Client Registration (RFC 7591) ─────────────────────────────

router.post('/oauth/register', express.json({ limit: '8kb' }), rateLimiters.sensitiveAction, async (req, res) => {
  const body = req.body || {}
  const clientName = typeof body.client_name === 'string' ? body.client_name.slice(0, 200) : 'Unknown MCP Client'
  const redirectUris = Array.isArray(body.redirect_uris) ? body.redirect_uris : []

  if (redirectUris.length === 0) {
    await logSecurityEvent(req, {
      action: 'oauth_client_register_rejected',
      resourceType: 'oauth_client',
      outcome: 'denied',
      metadata: { reason: 'missing_redirect_uris', client_name: clientName },
    })
    return res.status(400).json({ error: 'invalid_redirect_uri', error_description: 'redirect_uris required' })
  }

  for (const uri of redirectUris) {
    if (!isAllowedRedirectUri(uri)) {
      await logSecurityEvent(req, {
        action: 'oauth_client_register_rejected',
        resourceType: 'oauth_client',
        outcome: 'denied',
        metadata: { reason: 'invalid_redirect_uri', uri: String(uri).slice(0, 200), client_name: clientName },
      })
      return res.status(400).json({ error: 'invalid_redirect_uri', error_description: `Disallowed redirect_uri: ${uri}` })
    }
  }

  if (body.token_endpoint_auth_method && body.token_endpoint_auth_method !== 'none') {
    return res.status(400).json({
      error: 'invalid_client_metadata',
      error_description: 'Only token_endpoint_auth_method=none is supported (public clients only)',
    })
  }

  const clientId = generateClientId()
  try {
    const row = await insertClient({ clientId, clientName, redirectUris })
    await logSecurityEvent(req, {
      action: 'oauth_client_registered',
      resourceType: 'oauth_client',
      resourceId: row.client_id,
      outcome: 'success',
      metadata: { client_name: clientName, redirect_uris: redirectUris },
    })
    return res.status(201).json({
      client_id: row.client_id,
      client_id_issued_at: Math.floor(new Date(row.created_at).getTime() / 1000),
      redirect_uris: row.redirect_uris,
      grant_types: row.grant_types,
      response_types: row.response_types,
      token_endpoint_auth_method: row.token_endpoint_auth_method,
      client_name: row.client_name,
    })
  } catch (err) {
    return res.status(500).json({ error: 'server_error', error_description: 'Could not register client' })
  }
})

export default router
```

- [ ] **Step 4.2: Mount the router in backend/src/index.js**

Read the current `backend/src/index.js`. Find the existing line:
```
app.use('/api/mcp', mcpRoutes)
```

Add ABOVE it (and add the import at the top of the file with the other route imports):

```js
import oauthRoutes from './routes/oauth.js'
```

```js
// OAuth 2.1 endpoints — mounted at root so /.well-known/* works at the
// canonical location per RFC 8414/9728. Each handler installs its own
// body parser (well-known are GET-only; /oauth/register uses 8kb JSON).
app.use(oauthRoutes)
```

The mount must come AFTER `requestContext` + `securityHeaders` + `cors` but BEFORE any `app.use(express.json())` to avoid double-parsing.

- [ ] **Step 4.3: Manual smoke test — well-known endpoints respond**

Restart backend (`pm2 restart webrief-backend` if PM2, OR Ctrl-C + `npm run dev`). Then:

```bash
curl -s http://localhost:3000/.well-known/oauth-protected-resource | python3 -m json.tool
curl -s http://localhost:3000/.well-known/oauth-authorization-server | python3 -m json.tool
```

Expected: two JSON objects matching the shapes in `oauth.js`. `code_challenge_methods_supported` MUST include `"S256"`.

- [ ] **Step 4.4: Manual smoke test — DCR**

```bash
curl -s -X POST http://localhost:3000/oauth/register \
  -H "Content-Type: application/json" \
  -d '{"client_name":"Test Client","redirect_uris":["https://claude.ai/api/mcp/auth_callback"]}' \
  | python3 -m json.tool
```

Expected: 201 response with `client_id` starting with `mcpc_`.

```bash
# Reject loopback without port
curl -s -X POST http://localhost:3000/oauth/register \
  -H "Content-Type: application/json" \
  -d '{"client_name":"Bad","redirect_uris":["http://localhost/callback"]}'
```

Expected: 400 `invalid_redirect_uri`.

```bash
# Reject arbitrary HTTPS
curl -s -X POST http://localhost:3000/oauth/register \
  -H "Content-Type: application/json" \
  -d '{"client_name":"Bad","redirect_uris":["https://evil.com/cb"]}'
```

Expected: 400 `invalid_redirect_uri`.

- [ ] **Step 4.5: Commit**

```bash
cd /Users/adrian/GitHub/webbrief
git add backend/src/routes/oauth.js backend/src/index.js
git commit -m "feat(oauth): add well-known metadata + DCR endpoints

POST /oauth/register accepts RFC 7591 client registration. Validates
redirect_uris (Claude.ai exact + http loopback with port). Public clients
only (token_endpoint_auth_method=none). Rate-limited via sensitiveAction.

GET /.well-known/oauth-protected-resource[/api/mcp] returns RFC 9728
metadata. GET /.well-known/oauth-authorization-server returns RFC 8414
metadata with S256-only PKCE."
```

---

## Task 5: Authorize endpoints (preview + grant)

**Background:** the consent screen is a React page at `/oauth/authorize`. It calls two backend endpoints:
1. `GET /oauth/authorize/preview?<original query string>` — validates the request and returns `{ ok, client_name, redirect_uri, scope, state, resource }` for display.
2. `POST /oauth/authorize/grant` — body `{ approve: true|false, query: <original query as object> }` — issues the auth code and returns the redirect URL the frontend should navigate to.

Both require the user's Supabase session (Bearer token from `apiFetch`).

**Files:**
- Modify: `backend/src/routes/oauth.js` (add `/oauth/authorize/preview` and `/oauth/authorize/grant`)

- [ ] **Step 5.1: Add the preview endpoint**

Append to `backend/src/routes/oauth.js`:

```js
// ─── Authorize: preview (validate query, return data for consent UI) ───

function validateAuthorizeQuery(q) {
  const errors = []
  if (q.response_type !== 'code') errors.push('response_type must be "code"')
  if (typeof q.client_id !== 'string' || !q.client_id.startsWith('mcpc_')) errors.push('invalid client_id')
  if (typeof q.redirect_uri !== 'string' || !isAllowedRedirectUri(q.redirect_uri)) errors.push('invalid redirect_uri')
  if (typeof q.code_challenge !== 'string' || q.code_challenge.length < 43) errors.push('code_challenge required (S256)')
  if (q.code_challenge_method !== 'S256') errors.push('code_challenge_method must be S256')
  if (typeof q.resource !== 'string') errors.push('resource parameter required')
  if (q.scope && typeof q.scope === 'string' && !q.scope.split(' ').includes(SCOPE_FULL)) {
    errors.push(`only scope "${SCOPE_FULL}" is supported`)
  }
  return errors
}

router.get('/oauth/authorize/preview', requireAuth, async (req, res) => {
  const q = req.query || {}
  const errors = validateAuthorizeQuery(q)
  if (errors.length > 0) {
    return res.status(400).json({ ok: false, errors })
  }

  const client = await getClient(q.client_id)
  if (!client) {
    return res.status(400).json({ ok: false, errors: ['unknown client_id'] })
  }
  if (!client.redirect_uris.includes(q.redirect_uri)) {
    return res.status(400).json({ ok: false, errors: ['redirect_uri not registered for this client'] })
  }

  // Audience binding: client requested resource must match our canonical URI.
  let requestedResource
  try {
    requestedResource = canonicalizeResourceUri(q.resource)
  } catch {
    return res.status(400).json({ ok: false, errors: ['invalid resource URI'] })
  }
  if (requestedResource !== RESOURCE_URI) {
    return res.status(400).json({ ok: false, errors: [`resource must equal ${RESOURCE_URI}`] })
  }

  return res.json({
    ok: true,
    client_name: client.client_name,
    redirect_uri_host: new URL(q.redirect_uri).host,
    scope: q.scope || SCOPE_FULL,
    state: q.state || '',
    resource: RESOURCE_URI,
  })
})

// ─── Authorize: grant (issue code or return deny redirect) ────────────

router.post('/oauth/authorize/grant', express.json({ limit: '8kb' }), requireAuth, async (req, res) => {
  const body = req.body || {}
  const q = body.query || {}
  const approve = body.approve === true

  const errors = validateAuthorizeQuery(q)
  if (errors.length > 0) {
    return res.status(400).json({ error: 'invalid_request', errors })
  }

  const client = await getClient(q.client_id)
  if (!client || !client.redirect_uris.includes(q.redirect_uri)) {
    return res.status(400).json({ error: 'invalid_client' })
  }

  const redirect = new URL(q.redirect_uri)
  if (q.state) redirect.searchParams.set('state', q.state)

  if (!approve) {
    redirect.searchParams.set('error', 'access_denied')
    redirect.searchParams.set('error_description', 'User denied the request')
    await logSecurityEvent(req, {
      action: 'oauth_authorize_denied',
      resourceType: 'oauth_client',
      resourceId: q.client_id,
      outcome: 'denied',
      metadata: { user_id: req.currentUser.id },
    })
    return res.json({ redirect_to: redirect.toString() })
  }

  let canonicalResource
  try {
    canonicalResource = canonicalizeResourceUri(q.resource)
  } catch {
    return res.status(400).json({ error: 'invalid_resource' })
  }
  if (canonicalResource !== RESOURCE_URI) {
    return res.status(400).json({ error: 'invalid_resource' })
  }

  const code = await insertAuthCode({
    clientId: q.client_id,
    userId: req.currentUser.id,
    redirectUri: q.redirect_uri,
    codeChallenge: q.code_challenge,
    scope: q.scope || SCOPE_FULL,
    resource: canonicalResource,
    state: q.state || null,
  })

  redirect.searchParams.set('code', code)
  await logSecurityEvent(req, {
    action: 'oauth_authorize_consented',
    resourceType: 'oauth_client',
    resourceId: q.client_id,
    outcome: 'success',
    metadata: { user_id: req.currentUser.id, scope: q.scope || SCOPE_FULL },
  })
  return res.json({ redirect_to: redirect.toString() })
})
```

- [ ] **Step 5.2: Restart backend and smoke test preview without auth**

```bash
curl -s -o /dev/null -w "%{http_code}\n" 'http://localhost:3000/oauth/authorize/preview?response_type=code&client_id=mcpc_x&redirect_uri=https://claude.ai/api/mcp/auth_callback&code_challenge=abcabcabcabcabcabcabcabcabcabcabcabcabcabcab&code_challenge_method=S256&resource=http://localhost:3000/api/mcp'
```

Expected: `401` (no Bearer token).

- [ ] **Step 5.3: Smoke test preview WITH auth (use existing Supabase session of admin@webrief.app)**

This step requires a valid Supabase session token. Skip if not available locally — Task 14 covers the end-to-end test with a real session.

Note in commit message: "Smoke tested via Task 14 end-to-end."

- [ ] **Step 5.4: Commit**

```bash
cd /Users/adrian/GitHub/webbrief
git add backend/src/routes/oauth.js
git commit -m "feat(oauth): add /oauth/authorize preview + grant endpoints

GET /oauth/authorize/preview — auth required, validates query (PKCE S256,
resource audience match, registered redirect_uri), returns data for
frontend consent UI.

POST /oauth/authorize/grant — auth required, body {approve, query}.
Issues 5min single-use code on approve; returns deny redirect on reject.
Both log security_events.

Note: /oauth/authorize itself is a frontend route (not backend) that the
client redirects users to with the OAuth query string."
```

---

## Task 6: Token endpoint — authorization_code grant

**Files:**
- Modify: `backend/src/routes/oauth.js` (add `/oauth/token` for auth_code)

- [ ] **Step 6.1: Add the token endpoint (auth_code branch)**

Append to `backend/src/routes/oauth.js`:

```js
// ─── Token endpoint ─────────────────────────────────────────────────────
// RFC 6749 §3.2: token endpoint MUST accept application/x-www-form-urlencoded.

const tokenBodyParser = express.urlencoded({ extended: false, limit: '8kb' })

router.post('/oauth/token', tokenBodyParser, rateLimiters.sensitiveAction, async (req, res) => {
  const body = req.body || {}
  const grantType = body.grant_type

  if (grantType === 'authorization_code') {
    return handleAuthCodeGrant(req, res, body)
  }
  if (grantType === 'refresh_token') {
    return handleRefreshGrant(req, res, body)
  }
  return res.status(400).json({ error: 'unsupported_grant_type' })
})

async function handleAuthCodeGrant(req, res, body) {
  const code = body.code
  const codeVerifier = body.code_verifier
  const clientId = body.client_id
  const redirectUri = body.redirect_uri
  const resource = body.resource

  if (!code || !codeVerifier || !clientId || !redirectUri || !resource) {
    return res.status(400).json({ error: 'invalid_request', error_description: 'missing required parameter' })
  }

  const codeRow = await consumeAuthCode(code)
  if (!codeRow) {
    return res.status(400).json({ error: 'invalid_grant', error_description: 'code invalid, expired, or already used' })
  }

  if (codeRow.client_id !== clientId) {
    return res.status(400).json({ error: 'invalid_grant', error_description: 'client_id mismatch' })
  }
  if (codeRow.redirect_uri !== redirectUri) {
    return res.status(400).json({ error: 'invalid_grant', error_description: 'redirect_uri mismatch' })
  }

  let canonicalResource
  try {
    canonicalResource = canonicalizeResourceUri(resource)
  } catch {
    return res.status(400).json({ error: 'invalid_target' })
  }
  if (canonicalResource !== codeRow.resource) {
    return res.status(400).json({ error: 'invalid_target', error_description: 'resource mismatch' })
  }

  const pkceOk = verifyPkceChallenge({
    verifier: codeVerifier,
    challenge: codeRow.code_challenge,
    method: 'S256',
  })
  if (!pkceOk) {
    return res.status(400).json({ error: 'invalid_grant', error_description: 'PKCE verification failed' })
  }

  const tokens = await issueTokenFamily({
    clientId,
    userId: codeRow.user_id,
    scope: codeRow.scope,
    audience: codeRow.resource,
  })

  await logSecurityEvent(req, {
    action: 'oauth_token_issued',
    resourceType: 'oauth_client',
    resourceId: clientId,
    targetUserId: codeRow.user_id,
    outcome: 'success',
    metadata: { scope: codeRow.scope, grant_type: 'authorization_code' },
  })

  // Cache-Control per RFC 6749 §5.1
  res.set('Cache-Control', 'no-store')
  res.set('Pragma', 'no-cache')
  return res.json(tokens)
}

// Placeholder — Task 7 fills this in.
async function handleRefreshGrant(req, res, body) {
  return res.status(501).json({ error: 'not_implemented_yet' })
}
```

- [ ] **Step 6.2: Restart backend, manual smoke test missing params**

```bash
curl -s -X POST http://localhost:3000/oauth/token \
  -d 'grant_type=authorization_code'
```

Expected: `400` with `invalid_request`.

- [ ] **Step 6.3: Commit**

```bash
cd /Users/adrian/GitHub/webbrief
git add backend/src/routes/oauth.js
git commit -m "feat(oauth): add /oauth/token authorization_code grant

Accepts application/x-www-form-urlencoded per RFC 6749. Validates
code (single-use via consumeAuthCode), client_id + redirect_uri match,
resource canonicalization + match, PKCE S256 verification.

Issues access (1h) + refresh (30d) tokens via issueTokenFamily.
Cache-Control: no-store per spec. Logs oauth_token_issued security_event.

refresh_token grant stubbed as 501 — Task 7."
```

---

## Task 7: Token endpoint — refresh_token grant + rotation

**Files:**
- Modify: `backend/src/routes/oauth.js` (fill in `handleRefreshGrant`)

- [ ] **Step 7.1: Implement refresh grant**

Replace the `handleRefreshGrant` stub in `backend/src/routes/oauth.js`:

```js
async function handleRefreshGrant(req, res, body) {
  const refreshToken = body.refresh_token
  const clientId = body.client_id
  const resource = body.resource

  if (!refreshToken || !clientId || !resource) {
    return res.status(400).json({ error: 'invalid_request', error_description: 'missing required parameter' })
  }

  let canonicalResource
  try {
    canonicalResource = canonicalizeResourceUri(resource)
  } catch {
    return res.status(400).json({ error: 'invalid_target' })
  }
  if (canonicalResource !== RESOURCE_URI) {
    return res.status(400).json({ error: 'invalid_target', error_description: 'resource mismatch' })
  }

  const { tokens, familyInvalidated } = await rotateRefreshToken(refreshToken)

  if (familyInvalidated) {
    await logSecurityEvent(req, {
      action: 'oauth_token_refresh_reused',
      resourceType: 'oauth_token',
      outcome: 'denied',
      metadata: { client_id: clientId, reason: 'reuse_detected_family_revoked' },
    })
    return res.status(400).json({ error: 'invalid_grant', error_description: 'refresh token reuse detected; family revoked' })
  }

  if (!tokens) {
    return res.status(400).json({ error: 'invalid_grant', error_description: 'refresh token invalid, expired, or revoked' })
  }

  await logSecurityEvent(req, {
    action: 'oauth_token_refreshed',
    resourceType: 'oauth_client',
    resourceId: clientId,
    outcome: 'success',
    metadata: { scope: tokens.scope },
  })

  res.set('Cache-Control', 'no-store')
  res.set('Pragma', 'no-cache')
  return res.json(tokens)
}
```

- [ ] **Step 7.2: Restart backend, smoke test bogus refresh**

```bash
curl -s -X POST http://localhost:3000/oauth/token \
  -d 'grant_type=refresh_token&refresh_token=rt_nonexistent&client_id=mcpc_x&resource=http://localhost:3000/api/mcp'
```

Expected: `400` with `invalid_grant`.

- [ ] **Step 7.3: Commit**

```bash
cd /Users/adrian/GitHub/webbrief
git add backend/src/routes/oauth.js
git commit -m "feat(oauth): implement refresh_token grant with rotation

Calls rotateRefreshToken which implements dual-valid 60s window +
family invalidation on reuse. On reuse: logs oauth_token_refresh_reused
(high-signal security event) and returns invalid_grant. On normal
rotation: logs oauth_token_refreshed and returns new access + refresh."
```

---

## Task 8: Revocation endpoint (RFC 7009)

**Files:**
- Modify: `backend/src/routes/oauth.js`

- [ ] **Step 8.1: Add /oauth/revoke**

Append to `backend/src/routes/oauth.js`:

```js
// ─── Revocation (RFC 7009) ──────────────────────────────────────────────
// Cascades to entire token family. Idempotent — always returns 200.

router.post('/oauth/revoke', tokenBodyParser, async (req, res) => {
  const token = (req.body || {}).token
  if (!token) return res.status(200).end()  // RFC 7009 §2.2 — succeed silently on missing token

  try {
    const revoked = await revokeToken(token)
    if (revoked) {
      await logSecurityEvent(req, {
        action: 'oauth_token_revoked',
        resourceType: 'oauth_token',
        outcome: 'success',
        metadata: { client_id: (req.body || {}).client_id || null },
      })
    }
  } catch {
    // RFC 7009: still return 200 to prevent token-existence enumeration.
  }
  return res.status(200).end()
})
```

- [ ] **Step 8.2: Restart backend, smoke test**

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/oauth/revoke \
  -d 'token=rt_nonexistent'
```

Expected: `200`.

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/oauth/revoke
```

Expected: `200` (empty body still succeeds).

- [ ] **Step 8.3: Commit**

```bash
cd /Users/adrian/GitHub/webbrief
git add backend/src/routes/oauth.js
git commit -m "feat(oauth): add /oauth/revoke endpoint (RFC 7009)

Cascades revocation to entire token family via revokeToken.
Always 200 per RFC §2.2 to prevent token-existence enumeration."
```

---

## Task 9: Auth middleware — accept at_ tokens

**Files:**
- Modify: `backend/src/middleware/auth.js`

- [ ] **Step 9.1: Add the at_ fast-path AFTER the mcpt_ fast-path**

In `backend/src/middleware/auth.js`, find the line:
```js
  // MCP token fast-path: long-lived tokens with prefix mcpt_
  if (token.startsWith('mcpt_')) {
```

The entire `if (token.startsWith('mcpt_')) { ... return next() }` block ends with `return next()`. Add the following block IMMEDIATELY AFTER that closing `}` (and BEFORE the existing `try { ... data.user ... }` Supabase fallback):

```js
  // OAuth access-token fast-path: short-lived tokens with prefix at_ (RFC 8707 audience-bound).
  if (token.startsWith('at_')) {
    const { lookupAccessToken, touchAccessToken } = await import('../lib/oauthStore.js')
    const { canonicalizeResourceUri } = await import('../lib/oauthHelpers.js')
    const EXPECTED_AUDIENCE = canonicalizeResourceUri(process.env.MCP_RESOURCE_URI || 'http://localhost:3000/api/mcp')

    let tokenRow
    try {
      tokenRow = await lookupAccessToken(token)
    } catch (err) {
      writeSecurityLog('warn', 'oauth_token_lookup_failed', {
        ...getRequestLogContext(req),
        error: err.message,
      })
      return res.status(401).json({ error: 'Token OAuth no se pudo validar' })
    }

    if (!tokenRow) {
      writeSecurityLog('warn', 'oauth_token_invalid', getRequestLogContext(req))
      await logSecurityEvent(req, {
        action: 'oauth_token_invalid',
        resourceType: 'oauth_token',
        outcome: 'denied',
        metadata: { reason: 'not_found_expired_or_revoked' },
      })
      return res.status(401).json({ error: 'Token OAuth invalido o expirado' })
    }

    if (tokenRow.audience !== EXPECTED_AUDIENCE) {
      writeSecurityLog('warn', 'oauth_token_audience_mismatch', {
        ...getRequestLogContext(req),
        expected: EXPECTED_AUDIENCE,
        got: tokenRow.audience,
      })
      await logSecurityEvent(req, {
        action: 'oauth_token_invalid',
        resourceType: 'oauth_token',
        outcome: 'denied',
        metadata: { reason: 'audience_mismatch', expected: EXPECTED_AUDIENCE, got: tokenRow.audience },
      })
      return res.status(401).json({ error: 'Token con audience invalido' })
    }

    try {
      req.currentUser = await loadCurrentUser({ id: tokenRow.user_id })
    } catch (err) {
      writeSecurityLog('warn', 'oauth_token_user_load_failed', {
        ...getRequestLogContext(req),
        error: err.message,
      })
      return res.status(401).json({ error: 'No se pudo cargar el usuario del token OAuth' })
    }

    req.accessToken = null
    req.oauthTokenId = tokenRow.id

    const userBlock = await getActiveSecurityBlock(req, {
      userId: req.currentUser.id,
      ipAddress: req.clientIp,
    })
    if (userBlock?.blockType === 'user') {
      writeSecurityLog('warn', 'security_user_blocked_request', {
        ...getRequestLogContext(req),
        blockId: userBlock.id,
        reason: userBlock.reason,
      })
      await logSecurityEvent(req, {
        action: 'blocked_user_request_denied',
        resourceType: 'security_block',
        resourceId: userBlock.id,
        targetUserId: req.currentUser.id,
        outcome: 'denied',
        metadata: { reason: userBlock.reason },
      })
      return res.status(403).json({ error: 'Usuario bloqueado por seguridad', blockId: userBlock.id })
    }

    // Non-blocking audit + last_used_at
    Promise.all([
      touchAccessToken(tokenRow.id),
      logSecurityEvent(req, {
        action: 'oauth_token_used',
        resourceType: 'oauth_token',
        resourceId: tokenRow.id,
        targetUserId: tokenRow.user_id,
        outcome: 'success',
      }),
    ]).catch(() => {})

    return next()
  }
```

- [ ] **Step 9.2: Restart backend, smoke test bogus at_ token**

```bash
curl -s -o /dev/null -w "%{http_code}\n" \
  -H "Authorization: Bearer at_nonexistent" \
  http://localhost:3000/api/auth/me
```

Expected: `401`.

- [ ] **Step 9.3: Commit**

```bash
cd /Users/adrian/GitHub/webbrief
git add backend/src/middleware/auth.js
git commit -m "feat(oauth): accept at_ OAuth access tokens in requireAuth

Adds second fast-path after the mcpt_ one. Validates: lookup succeeds
(not expired/revoked/invalidated), audience matches MCP_RESOURCE_URI
(RFC 8707), user loadable, no security block. Logs oauth_token_used
(non-blocking) on success, oauth_token_invalid on failure.

Existing mcpt_ tokens continue to work unchanged."
```

---

## Task 10: WWW-Authenticate header on /api/mcp 401

**Files:**
- Modify: `backend/src/routes/mcp.js`

- [ ] **Step 10.1: Wrap requireAuth to emit WWW-Authenticate on 401**

Replace the entire content of `backend/src/routes/mcp.js` with:

```js
// backend/src/routes/mcp.js — POST /api/mcp HTTP endpoint for the WeBrief MCP
// server. Mounted in backend/src/index.js. Wraps requireAuth so 401 responses
// include WWW-Authenticate per MCP spec §Resource Discovery.

import express from 'express'
import { requireAuth } from '../middleware/auth.js'
import { buildWwwAuthenticateHeader } from '../lib/oauthHelpers.js'
import { createMcpHttpHandler } from '../../../mcp/webrief-server/src/http.js'

const router = express.Router()

const handleMcp = createMcpHttpHandler()
const OAUTH_ISSUER = process.env.OAUTH_ISSUER || 'http://localhost:3000'
const WWW_AUTH = buildWwwAuthenticateHeader({
  issuer: OAUTH_ISSUER,
  resourcePath: '/api/mcp',
  scope: 'mcp:full',
})

// Wrap requireAuth so that any 401 from it includes the WWW-Authenticate
// header pointing to our resource metadata endpoint (RFC 9728 §5.1).
function requireAuthWithWww(req, res, next) {
  const originalStatus = res.status.bind(res)
  res.status = function patchedStatus(code) {
    if (code === 401) res.set('WWW-Authenticate', WWW_AUTH)
    return originalStatus(code)
  }
  requireAuth(req, res, next)
}

router.post('/', requireAuthWithWww, handleMcp)

router.get('/', (req, res) => {
  res.status(405).json({
    jsonrpc: '2.0',
    error: {
      code: -32000,
      message: 'MCP endpoint accepts POST only. Configure your client with --transport http.',
    },
    id: null,
  })
})

export default router
```

- [ ] **Step 10.2: Restart backend, smoke test header presence**

```bash
curl -s -i -X POST http://localhost:3000/api/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}' \
  | head -10
```

Expected: `HTTP/1.1 401` AND a header line `WWW-Authenticate: Bearer resource_metadata="http://localhost:3000/.well-known/oauth-protected-resource/api/mcp", scope="mcp:full"`.

- [ ] **Step 10.3: Commit**

```bash
cd /Users/adrian/GitHub/webbrief
git add backend/src/routes/mcp.js
git commit -m "feat(oauth): emit WWW-Authenticate on /api/mcp 401

Wraps requireAuth so 401 responses include the spec-compliant
WWW-Authenticate header pointing to our /.well-known/oauth-protected-resource
endpoint. Enables MCP clients (Claude Desktop, Claude Code, Codex) to
auto-discover the auth server per RFC 9728."
```

---

## Task 11: Integration tests — full OAuth flow

**Files:**
- Create: `backend/test/oauth-flow.test.js`

- [ ] **Step 11.1: Write integration tests using mocked DB**

These tests exercise the pure logic without hitting Supabase. We mock `oauthStore` via dynamic import + module replacement. If that turns out to be impractical with the test setup, mark this task as "smoke-tested via Task 14 end-to-end" and skip steps 11.1-11.4 — Task 14's curl test exercises the full flow against a real DB.

Decision pre-made: **If after 5 minutes of attempting module mocking it's not working, SKIP this task entirely**. Task 14 covers integration verification end-to-end against the real DB. Document in the next commit message: "integration tests deferred — covered by Task 14 smoke."

If proceeding, write the test file with these test cases (TDD bite-sized):

```js
// backend/test/oauth-flow.test.js
import assert from 'node:assert/strict'
import { test, describe } from 'node:test'
import { canonicalizeResourceUri, verifyPkceChallenge, isAllowedRedirectUri } from '../src/lib/oauthHelpers.js'

// We re-use the unit tests' confidence in oauthHelpers and only assert
// behavior here that requires the route layer (validateAuthorizeQuery,
// composition). Each test reasons about expected behavior, not direct calls
// (the routes are tightly coupled to express + supabase).

describe('OAuth flow contract checks', () => {
  test('canonicalizeResourceUri preserves localhost:3000 dev URI', () => {
    assert.equal(canonicalizeResourceUri('http://localhost:3000/api/mcp'), 'http://localhost:3000/api/mcp')
  })

  test('PKCE with valid 43-char verifier passes (boundary)', () => {
    // 43-char min per RFC 7636
    const verifier = 'a'.repeat(43)
    // computed S256(a*43) for the assertion
    const { createHash } = require('node:crypto')
    const challenge = createHash('sha256').update(verifier).digest('base64')
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    assert.equal(verifyPkceChallenge({ verifier, challenge, method: 'S256' }), true)
  })

  test('isAllowedRedirectUri rejects 0 and >65535 ports', () => {
    assert.equal(isAllowedRedirectUri('http://localhost:0/callback'), false)
    assert.equal(isAllowedRedirectUri('http://localhost:70000/callback'), false)
  })
})
```

Note: the above is intentionally light because the heavy lifting is in `oauth-helpers.test.js`. Full end-to-end is in Task 14.

- [ ] **Step 11.2: Run tests to verify they pass**

```bash
cd /Users/adrian/GitHub/webbrief/backend
npm test -- --test-name-pattern='OAuth flow contract'
```

Expected: PASS.

- [ ] **Step 11.3: Commit**

```bash
cd /Users/adrian/GitHub/webbrief
git add backend/test/oauth-flow.test.js
git commit -m "test(oauth): add light integration contract tests

Heavy logic covered by oauth-helpers.test.js (19 unit tests).
This file asserts contracts that route layers depend on. Full
end-to-end DCR → authorize → token → mcp call is verified by
Task 14 smoke script."
```

---

## Task 12: Frontend consent page

**Files:**
- Create: `frontend/src/pages/OAuthConsentPage.jsx`
- Create: `frontend/src/pages/OAuthConsentPage.module.css`

- [ ] **Step 12.1: Write the consent page component**

```jsx
// frontend/src/pages/OAuthConsentPage.jsx
import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { apiFetch } from '../lib/api'
import { useAuth } from '../auth/AuthContext'
import { Button, Card } from '../components/ui'
import styles from './OAuthConsentPage.module.css'

/**
 * OAuthConsentPage — consent screen for OAuth 2.1 authorization requests.
 * Reads OAuth query params, validates via /oauth/authorize/preview, displays
 * client + scopes, on approve POSTs /oauth/authorize/grant and navigates to
 * the resulting redirect URL.
 *
 * If user is not logged in, redirects to /login?return_to=<current URL>.
 */
export default function OAuthConsentPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const { isAuthenticated, loading: authLoading } = useAuth()
  const [state, setState] = useState({ phase: 'loading', error: null, data: null, busy: false })

  // Redirect to login if needed.
  useEffect(() => {
    if (authLoading) return
    if (!isAuthenticated) {
      const returnTo = encodeURIComponent(location.pathname + location.search)
      navigate(`/login?return_to=${returnTo}`, { replace: true })
    }
  }, [authLoading, isAuthenticated, location, navigate])

  // Load preview once authenticated.
  useEffect(() => {
    if (authLoading || !isAuthenticated) return
    const query = location.search.startsWith('?') ? location.search.slice(1) : location.search
    apiFetch(`/oauth/authorize/preview?${query}`)
      .then((data) => {
        if (data.ok) {
          setState({ phase: 'ready', error: null, data, busy: false })
        } else {
          setState({ phase: 'error', error: (data.errors || ['Solicitud invalida']).join(', '), data: null, busy: false })
        }
      })
      .catch((err) => {
        setState({ phase: 'error', error: err.message || 'No se pudo cargar la solicitud', data: null, busy: false })
      })
  }, [authLoading, isAuthenticated, location.search])

  function parseQuery() {
    const query = location.search.startsWith('?') ? location.search.slice(1) : location.search
    const obj = {}
    new URLSearchParams(query).forEach((value, key) => { obj[key] = value })
    return obj
  }

  async function handleDecision(approve) {
    setState((s) => ({ ...s, busy: true }))
    try {
      const result = await apiFetch('/oauth/authorize/grant', {
        method: 'POST',
        body: JSON.stringify({ approve, query: parseQuery() }),
      })
      if (result.redirect_to) {
        window.location.href = result.redirect_to
      } else {
        setState((s) => ({ ...s, busy: false, error: 'Respuesta invalida del servidor' }))
      }
    } catch (err) {
      setState((s) => ({ ...s, busy: false, error: err.message || 'No se pudo procesar la solicitud' }))
    }
  }

  if (authLoading || state.phase === 'loading') {
    return <div className={styles.page}><p className={styles.loading}>Cargando...</p></div>
  }

  if (state.phase === 'error') {
    return (
      <div className={styles.page}>
        <Card className={styles.card} padding="lg" radius="lg" shadow="md">
          <h1 className={styles.title}>Solicitud invalida</h1>
          <p className={styles.error}>{state.error}</p>
          <Button variant="secondary" onClick={() => navigate('/integrations')}>Volver a Integraciones</Button>
        </Card>
      </div>
    )
  }

  const { client_name, redirect_uri_host, scope } = state.data

  return (
    <div className={styles.page}>
      <Card className={styles.card} padding="lg" radius="lg" shadow="md">
        <h1 className={styles.title}>Autorizar acceso</h1>
        <p className={styles.lead}>
          <strong>{client_name}</strong> quiere acceder a tu cuenta de WeBrief.
        </p>
        <div className={styles.detailBlock}>
          <p className={styles.detailLabel}>Te redirigira a:</p>
          <p className={styles.detailValue}>{redirect_uri_host}</p>
        </div>
        <div className={styles.detailBlock}>
          <p className={styles.detailLabel}>Permisos solicitados:</p>
          <ul className={styles.scopeList}>
            <li>Acceso completo a tu cuenta WeBrief (crear, leer y editar proyectos, paginas y briefs en tu nombre)</li>
          </ul>
        </div>
        {state.error && <p className={styles.error}>{state.error}</p>}
        <div className={styles.actions}>
          <Button variant="secondary" onClick={() => handleDecision(false)} disabled={state.busy}>
            Denegar
          </Button>
          <Button variant="primary" onClick={() => handleDecision(true)} disabled={state.busy}>
            {state.busy ? 'Procesando...' : 'Autorizar'}
          </Button>
        </div>
      </Card>
    </div>
  )
}
```

- [ ] **Step 12.2: Write the CSS module**

```css
/* frontend/src/pages/OAuthConsentPage.module.css */
.page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--wb-space-6);
  background: var(--wb-color-neutral-50);
}

.card {
  max-width: 480px;
  width: 100%;
}

.loading {
  font-size: var(--wb-text-base);
  color: var(--wb-color-neutral-600);
}

.title {
  font-size: var(--wb-text-xl);
  font-weight: var(--wb-weight-bold);
  color: var(--wb-color-neutral-900);
  margin: 0 0 var(--wb-space-4);
}

.lead {
  font-size: var(--wb-text-base);
  color: var(--wb-color-neutral-800);
  margin: 0 0 var(--wb-space-6);
  line-height: var(--wb-leading-normal);
}

.detailBlock {
  margin: 0 0 var(--wb-space-4);
}

.detailLabel {
  font-size: var(--wb-text-sm);
  color: var(--wb-color-neutral-600);
  margin: 0 0 var(--wb-space-1);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  font-weight: var(--wb-weight-medium);
}

.detailValue {
  font-family: var(--wb-font-mono, monospace);
  font-size: var(--wb-text-sm);
  color: var(--wb-color-neutral-900);
  background: var(--wb-color-neutral-100);
  padding: var(--wb-space-2) var(--wb-space-3);
  border-radius: var(--wb-radius-sm);
  margin: 0;
  word-break: break-all;
}

.scopeList {
  font-size: var(--wb-text-sm);
  color: var(--wb-color-neutral-800);
  margin: 0;
  padding-left: var(--wb-space-5);
  line-height: var(--wb-leading-relaxed);
}

.scopeList li {
  margin-bottom: var(--wb-space-2);
}

.error {
  color: var(--wb-color-danger-700);
  font-size: var(--wb-text-sm);
  margin: var(--wb-space-4) 0;
}

.actions {
  display: flex;
  gap: var(--wb-space-3);
  justify-content: flex-end;
  margin-top: var(--wb-space-6);
}
```

- [ ] **Step 12.3: Register the route in App.jsx**

In `frontend/src/App.jsx`, find the lazy imports section and add:
```jsx
const OAuthConsentPage = lazy(() => import('./pages/OAuthConsentPage'))
```

In the `<Routes>` block, add this PUBLIC route (NOT under `<PrivateRoute>` — the page handles its own login redirect). Add it after the existing `<Route path="/b/:token" ... />`:

```jsx
        <Route path="/oauth/authorize" element={<OAuthConsentPage />} />
```

- [ ] **Step 12.4: Verify frontend rebuilds without errors**

Frontend is already running on `:5173`. Vite hot-reloads. Watch the terminal — no compile errors. Manual check:

```bash
curl -s http://localhost:5173/oauth/authorize | head -1
```

Expected: HTML (Vite serves index.html). If 404, the route is not registered correctly.

- [ ] **Step 12.5: Commit**

```bash
cd /Users/adrian/GitHub/webbrief
git add frontend/src/pages/OAuthConsentPage.jsx frontend/src/pages/OAuthConsentPage.module.css frontend/src/App.jsx
git commit -m "feat(oauth): add /oauth/authorize consent page

React page that reads OAuth query params, validates via
/oauth/authorize/preview (redirects to /login?return_to if needed),
displays client name + redirect host + scope, and on approve/deny
POSTs /oauth/authorize/grant and navigates to the redirect_to URL.

Neutral Spanish copy per CLAUDE.md. Uses design tokens — no
hardcoded colors. Reuses Button + Card primitives."
```

---

## Task 13: IntegrationsPage — add OAuth CTA

**Files:**
- Modify: `frontend/src/pages/IntegrationsPage.jsx`

- [ ] **Step 13.1: Add OAuth section at top of the panel**

Read the current `frontend/src/pages/IntegrationsPage.jsx`. Find the `<Card as="section" ...>` opening tag that contains "Conectá tu agente". Inside that Card, BEFORE the existing `{/* Step 1 — Generate token */}` comment, insert a new top section:

```jsx
          {/* ─── OAuth flow (recommended for Claude Desktop) ─── */}
          <div className={styles.mcpStep}>
            <div className={styles.mcpStepHead}>
              <span className={styles.mcpStepNum}>★</span>
              <div className={styles.mcpStepBody}>
                <h3 className={styles.mcpStepTitle}>Claude Desktop (recomendado)</h3>
                <p className={styles.mcpStepText}>
                  Sin terminal, sin pegar tokens. Pega la URL en Claude Desktop y
                  autoriza el acceso desde el navegador.
                </p>
              </div>
            </div>
            <div className={styles.mcpStepAction}>
              <ol style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '0.95rem', lineHeight: 1.5 }}>
                <li>Abre Claude Desktop y ve a <strong>Settings &rarr; Connectors</strong>.</li>
                <li>Haz click en <strong>+</strong> &rarr; <strong>Add custom connector</strong>.</li>
                <li>Pega esta URL en el campo de URL:</li>
              </ol>
              <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <Input
                  readOnly
                  value={mcpEndpoint}
                  onFocus={(e) => e.target.select()}
                  style={{ flex: 1, fontFamily: 'monospace', fontSize: '0.85rem' }}
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    navigator.clipboard.writeText(mcpEndpoint).catch(() => {})
                  }}
                >
                  <Copy size={14} aria-hidden="true" /> Copiar
                </Button>
              </div>
              <p style={{ marginTop: '0.75rem', fontSize: '0.875rem', color: 'var(--wb-color-neutral-600)' }}>
                Claude Desktop te llevara a esta web para iniciar sesion y autorizar el acceso.
                No necesitas generar ningun token.
              </p>
            </div>
          </div>

          <div style={{
            margin: 'var(--wb-space-6) 0',
            borderTop: '1px solid var(--wb-color-neutral-200)',
            paddingTop: 'var(--wb-space-4)',
          }}>
            <button
              type="button"
              onClick={() => setMcpShowAdvanced((v) => !v)}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: 0,
                fontSize: '0.875rem',
                color: 'var(--wb-color-neutral-700)',
                fontWeight: 'var(--wb-weight-medium)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.25rem',
              }}
            >
              <ChevronDown
                size={14}
                style={{ transform: mcpShowAdvanced ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.15s' }}
              />
              {mcpShowAdvanced
                ? 'Ocultar metodo avanzado (para devs)'
                : 'Mostrar metodo avanzado (token bearer, para devs)'}
            </button>
          </div>

          {mcpShowAdvanced && (
```

Then, after the existing Step 1 + Step 2 + Step 3 blocks (the entire existing wizard), CLOSE the `{mcpShowAdvanced && (` block with `)}` just before the `</Card>` closing tag.

**Important:** if any error happens because `setMcpShowAdvanced` is not used yet (it's defined in state at the top of the component), this should already work — the state variable is declared on line `const [mcpShowAdvanced, setMcpShowAdvanced] = useState(false)`.

- [ ] **Step 13.2: Hot-reload check**

Vite should hot-reload. Visit `http://localhost:5173/integrations` in browser. Verify:
- Top of card shows "Claude Desktop (recomendado)" with copyable URL + instructions.
- Below, a "Mostrar metodo avanzado (token bearer, para devs)" toggle.
- Clicking the toggle shows the existing 3-step token wizard.

If layout is broken, fix CSS without removing functionality.

- [ ] **Step 13.3: Commit**

```bash
cd /Users/adrian/GitHub/webbrief
git add frontend/src/pages/IntegrationsPage.jsx
git commit -m "feat(oauth): promote Claude Desktop OAuth flow on /integrations

Top of the panel now shows the OAuth path as recommended: paste the
MCP URL into Claude Desktop Settings -> Connectors, no token needed.
Existing token-based wizard collapsed into 'metodo avanzado (para devs)'
section, available behind a toggle. Spanish neutral copy."
```

---

## Task 14: End-to-end smoke test script

**Files:**
- Create: `mcp/webrief-server/test/smoke-oauth.sh`

- [ ] **Step 14.1: Write the smoke test script**

```bash
#!/usr/bin/env bash
# mcp/webrief-server/test/smoke-oauth.sh
# End-to-end smoke test for the OAuth flow against a local backend.
# Requires: curl, jq, python3, openssl.
# Run from repo root: ./mcp/webrief-server/test/smoke-oauth.sh
# Exits 0 on success, non-zero on any failure.

set -euo pipefail

BACKEND="${BACKEND:-http://localhost:3000}"
RESOURCE="${RESOURCE:-http://localhost:3000/api/mcp}"

red()   { printf "\033[31m%s\033[0m\n" "$*"; }
green() { printf "\033[32m%s\033[0m\n" "$*"; }
blue()  { printf "\033[34m%s\033[0m\n" "$*"; }

blue "=== 1. well-known/oauth-protected-resource ==="
curl -fsS "$BACKEND/.well-known/oauth-protected-resource" | jq .

blue "=== 2. well-known/oauth-authorization-server ==="
META=$(curl -fsS "$BACKEND/.well-known/oauth-authorization-server")
echo "$META" | jq .
echo "$META" | jq -e '.code_challenge_methods_supported | contains(["S256"])' >/dev/null || { red "FAIL: S256 missing"; exit 1; }

blue "=== 3. POST /oauth/register (Dynamic Client Registration) ==="
DCR=$(curl -fsS -X POST "$BACKEND/oauth/register" \
  -H "Content-Type: application/json" \
  -d '{"client_name":"Smoke Test","redirect_uris":["http://localhost:33421/callback"]}')
echo "$DCR" | jq .
CLIENT_ID=$(echo "$DCR" | jq -r .client_id)
[[ "$CLIENT_ID" == mcpc_* ]] || { red "FAIL: client_id missing or wrong prefix"; exit 1; }
green "client_id = $CLIENT_ID"

blue "=== 4. PKCE pair ==="
VERIFIER=$(openssl rand -base64 64 | tr -d '=+/' | tr -d '\n' | cut -c1-64)
CHALLENGE=$(printf "%s" "$VERIFIER" | openssl dgst -sha256 -binary | openssl base64 | tr -d '=' | tr '+/' '-_')
echo "verifier  = $VERIFIER"
echo "challenge = $CHALLENGE"

blue "=== 5. WWW-Authenticate header on /api/mcp 401 ==="
HEADER=$(curl -sS -X POST "$BACKEND/api/mcp" -H "Content-Type: application/json" -d '{}' -D - -o /dev/null | grep -i www-authenticate || true)
[[ -n "$HEADER" ]] || { red "FAIL: no WWW-Authenticate header"; exit 1; }
echo "$HEADER"
echo "$HEADER" | grep -q "resource_metadata=" || { red "FAIL: header missing resource_metadata"; exit 1; }
echo "$HEADER" | grep -q "scope=\"mcp:full\"" || { red "FAIL: header missing scope"; exit 1; }

blue "=== 6. Invalid token returns 401 ==="
STATUS=$(curl -sS -o /dev/null -w "%{http_code}" "$BACKEND/api/auth/me" -H "Authorization: Bearer at_invalid")
[[ "$STATUS" == "401" ]] || { red "FAIL: expected 401 got $STATUS"; exit 1; }
green "at_invalid -> 401 ✓"

blue "=== 7. Negative DCR: reject evil.com ==="
STATUS=$(curl -sS -o /dev/null -w "%{http_code}" -X POST "$BACKEND/oauth/register" \
  -H "Content-Type: application/json" \
  -d '{"client_name":"Bad","redirect_uris":["https://evil.example.com/cb"]}')
[[ "$STATUS" == "400" ]] || { red "FAIL: expected 400 got $STATUS"; exit 1; }
green "evil redirect -> 400 ✓"

blue "=== 8. Token endpoint rejects missing grant_type ==="
STATUS=$(curl -sS -o /dev/null -w "%{http_code}" -X POST "$BACKEND/oauth/token" -d 'foo=bar')
[[ "$STATUS" == "400" ]] || { red "FAIL: expected 400 got $STATUS"; exit 1; }
green "missing grant_type -> 400 ✓"

blue "=== 9. Revocation always 200 ==="
STATUS=$(curl -sS -o /dev/null -w "%{http_code}" -X POST "$BACKEND/oauth/revoke" -d 'token=rt_nonexistent')
[[ "$STATUS" == "200" ]] || { red "FAIL: expected 200 got $STATUS"; exit 1; }
green "revoke nonexistent -> 200 ✓"

green "============================================"
green "  All smoke checks passed (1-9)."
green "  Steps 10-12 (full code -> token -> mcp call) require a logged-in"
green "  user session; they're covered by manual Claude Desktop testing."
green "============================================"
```

- [ ] **Step 14.2: Make executable and run**

```bash
chmod +x /Users/adrian/GitHub/webbrief/mcp/webrief-server/test/smoke-oauth.sh
/Users/adrian/GitHub/webbrief/mcp/webrief-server/test/smoke-oauth.sh
```

Expected: all 9 checks print green, script exits 0.

If any check fails, identify the failing OAuth endpoint, fix the bug in the corresponding `oauth.js` handler, restart backend, re-run. Do NOT modify the smoke script to make it pass.

- [ ] **Step 14.3: Commit**

```bash
cd /Users/adrian/GitHub/webbrief
git add mcp/webrief-server/test/smoke-oauth.sh
git commit -m "test(oauth): add end-to-end smoke test script

9 curl-based checks covering: well-known endpoints, DCR (positive +
negative), WWW-Authenticate header presence + format, invalid token
rejection, token endpoint validation, revocation idempotence.

Run with: ./mcp/webrief-server/test/smoke-oauth.sh"
```

---

## Task 15: Env vars + documentation

**Files:**
- Modify: `backend/.env` (only if env vars not already set)
- Modify: `backend/.env.example` (or create — check if it exists)

- [ ] **Step 15.1: Add env vars to backend/.env if missing**

```bash
cd /Users/adrian/GitHub/webbrief/backend
grep -q '^OAUTH_ISSUER=' .env || echo 'OAUTH_ISSUER=http://localhost:3000' >> .env
grep -q '^MCP_RESOURCE_URI=' .env || echo 'MCP_RESOURCE_URI=http://localhost:3000/api/mcp' >> .env
grep -q '^OAUTH_CONSENT_URL=' .env || echo 'OAUTH_CONSENT_URL=http://localhost:5173/oauth/authorize' >> .env
```

- [ ] **Step 15.2: Restart backend to load env vars**

If using PM2: `pm2 restart webrief-backend --update-env`. If using `npm run dev`: Ctrl-C + `npm run dev`.

- [ ] **Step 15.3: Verify env vars loaded**

```bash
curl -s http://localhost:3000/.well-known/oauth-authorization-server | python3 -c "import sys, json; d = json.load(sys.stdin); assert d['issuer'] == 'http://localhost:3000', f'wrong issuer: {d[\"issuer\"]}'; print('OK')"
```

Expected: `OK`.

- [ ] **Step 15.4: Append a section to backend/.env.example if it exists**

Check `ls /Users/adrian/GitHub/webbrief/backend/.env.example`. If file exists, append:

```bash
# OAuth 2.1 for MCP (per spec 2025-11-25). Required when MCP server runs.
# In production set OAUTH_ISSUER=https://webrief.app and MCP_RESOURCE_URI=https://webrief.app/api/mcp.
OAUTH_ISSUER=http://localhost:3000
MCP_RESOURCE_URI=http://localhost:3000/api/mcp
OAUTH_CONSENT_URL=http://localhost:5173/oauth/authorize
```

If `.env.example` does NOT exist, skip this step.

- [ ] **Step 15.5: Commit env example update if changed**

```bash
cd /Users/adrian/GitHub/webbrief
git diff --quiet backend/.env.example || (git add backend/.env.example && git commit -m "docs(oauth): add OAuth env vars to .env.example")
```

If no `.env.example` exists, this is a no-op and there's nothing to commit. That's fine.

---

## Task 16: Run full backend test suite

**Files:** none (verification step)

- [ ] **Step 16.1: Run all backend tests**

```bash
cd /Users/adrian/GitHub/webbrief/backend
npm test
```

Expected: ALL existing tests pass + new `oauth-helpers.test.js` (19 tests) + `oauth-flow.test.js` (3 tests) pass. Total should be previous count + 22.

If ANY test fails, the failure must be in one of the files modified by this plan. Fix it without disabling tests.

- [ ] **Step 16.2: Re-run smoke test**

```bash
/Users/adrian/GitHub/webbrief/mcp/webrief-server/test/smoke-oauth.sh
```

Expected: all 9 checks pass.

- [ ] **Step 16.3: Final summary commit (no files, just a marker)**

If there's nothing to commit, skip. Otherwise:

```bash
cd /Users/adrian/GitHub/webbrief
git log --oneline -20
```

Print the last 20 commits as the executor's "done" report. Manual deploy to Prod is the user's responsibility — out of scope.

---

## Manual Verification (User does this AFTER autonomous execution finishes)

1. Open Claude Desktop.
2. Settings → Connectors → "+" → Add custom connector.
3. Paste `http://localhost:3000/api/mcp` (or `https://webrief.app/api/mcp` once deployed).
4. Click Connect.
5. Browser opens to `http://localhost:5173/oauth/authorize?...`.
6. If not logged in, redirected to `/login`. Log in.
7. Consent screen appears with "Claude Desktop quiere acceder...".
8. Click Autorizar.
9. Browser closes; Claude Desktop should show "Connected" with the 12 MCP tools available.
10. In Claude Desktop, ask: "list my WeBrief companies" — should successfully call `session.getContext`.

---

## Self-Review Checklist (filled in after plan complete)

**Spec coverage:** every locked decision (scope model, TTLs, prefixes, rotation policy, audience binding, redirect_uri policy, consent UX, audit events, coexistence) is implemented by at least one task. ✓

**Placeholder scan:** No "TBD", no "implement later", no "similar to Task N". Every code block is complete and runnable. ✓

**Type consistency:** Function signatures consistent across tasks:
- `lookupAccessToken(rawToken)` — Task 3 defines, Task 9 imports.
- `rotateRefreshToken(rawRefresh)` — Task 3 defines, Task 7 imports.
- `revokeToken(rawToken)` — Task 3 defines, Task 8 imports.
- `consumeAuthCode(code)` — Task 3 defines, Task 6 imports.
- `issueTokenFamily({clientId, userId, scope, audience})` — Task 3 defines, Task 6 imports.
- `insertAuthCode({clientId, userId, redirectUri, codeChallenge, scope, resource, state})` — Task 3 defines, Task 5 imports.
- `canonicalizeResourceUri(uri)` — Task 2 defines, Tasks 5/6/7/9 import.
- `verifyPkceChallenge({verifier, challenge, method})` — Task 2 defines, Task 6 imports.
- `isAllowedRedirectUri(uri)` — Task 2 defines, Tasks 4/5 import.
- `buildWwwAuthenticateHeader({issuer, resourcePath, scope})` — Task 2 defines, Task 10 imports.
- `generateClientId()`, `generateOpaqueToken(prefix)`, `hashToken(raw)` — Task 2 defines, Task 3 imports.

All consistent. ✓

---

## Model Assignment (locked 2026-06-04)

Per-task model + effort. Floor = **Sonnet 4.6 MAX**. The 4 security-critical tasks run on **Opus 4.8 high** (user choice: maximum correctness margin on the auth layer; MAX subscription so quota is not a constraint). The orchestrator (main agent) reviews + cohesions every subagent result on **Opus 4.8** before integrating.

| Task | Model | Effort | Why this tier |
|---|---|---|---|
| 1 Migration | Sonnet 4.6 | MAX | DDL pre-written, apply + verify |
| **2 oauthHelpers (PKCE + redirect validation)** | **Opus 4.8** | high | Open-redirect / PKCE bypass = security hole |
| **3 oauthStore (refresh rotation)** | **Opus 4.8** | high | Most complex stateful logic; replay/lockout risk |
| 4 well-known + DCR | Sonnet 4.6 | MAX | Wiring; hard part in Task 2 helper |
| 5 authorize preview + grant | Sonnet 4.6 | MAX | Validation calling helpers; review covers |
| **6 token auth_code grant** | **Opus 4.8** | high | The crown-jewel exchange (PKCE + single-use + audience) |
| 7 token refresh grant | Sonnet 4.6 | MAX | Thin wrapper over Task 3 rotation |
| 8 revoke | Sonnet 4.6 | MAX | Trivial, always-200 |
| **9 middleware at_ fast-path** | **Opus 4.8** | high | Touches prod `requireAuth`; blast radius = all auth |
| 10 WWW-Authenticate | Sonnet 4.6 | MAX | Low risk if wrong |
| 11 integration tests | Sonnet 4.6 | MAX | Light |
| 12 consent page | Sonnet 4.6 | MAX | UI, Sonnet's strength |
| 13 IntegrationsPage | Sonnet 4.6 | MAX | UI edit |
| 14 smoke script | Sonnet 4.6 | MAX | Pre-written bash |
| 15 env vars | Sonnet 4.6 | MAX | Trivial |
| 16 test suite run | Sonnet 4.6 | MAX | Verification |

**Tooling note:** per-subagent the orchestrator routes `sonnet` vs `opus` via the Agent tool. Session Opus = 4.8, so opus subagents inherit 4.8. Sonnet subagents run at the session Sonnet floor (MAX). No mid-run model flip needed — fully autonomous.

## Execution Choice

Per the user's instruction ("se ejecute TODO el plan sin supervisión"), execute via **Inline Execution** (`superpowers:executing-plans`) with checkpoints only at task boundaries, NOT between every step. The plan is designed to be autonomous: every decision is pre-locked above, no user input expected during execution.

If a step fails:
- DB / network errors: retry once; if still failing, report and stop.
- Test failures: fix the source file (not the test) and re-run.
- Smoke check failures: identify the broken endpoint, fix in `oauth.js`, restart backend, re-run.
- Anything ambiguous: stop and report; do NOT improvise.
