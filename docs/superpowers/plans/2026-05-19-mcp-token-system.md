# MCP Token System — Implementation Plan (Prep A)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add long-lived MCP tokens (`mcpt_*`) that let a local MCP server authenticate against the WeBrief backend on behalf of a user, without depending on the ~1h Supabase JWT TTL.

**Architecture:** A new `mcp_tokens` table stores SHA-256 hashes of raw tokens (raw never persisted). `requireAuth` gets a fast-path: if the token starts with `mcpt_`, skip Supabase Auth and look up by hash instead. A CRUD route lets users issue/list/revoke their own tokens. A minimal UI section in AccountSettingsPage closes the loop.

**Tech Stack:** Node.js ESM, Express, Supabase Postgres (service-role), `node:crypto` (SHA-256, randomBytes), React + CSS Modules (existing patterns).

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `supabase/migrations/20260519_mcp_tokens.sql` | Create | `mcp_tokens` table + indexes + RLS |
| `backend/src/routes/mcpTokens.js` | Create | CRUD: issue / list / revoke |
| `backend/src/middleware/auth.js` | Modify | Add `mcpt_*` fast-path before Supabase Auth call |
| `backend/src/index.js` | Modify | Mount `mcpTokensRoutes` at `/api/auth` |
| `frontend/src/pages/AccountSettingsPage.jsx` | Modify | Add `#api-tokens` section: list, create, revoke |
| `frontend/src/pages/AccountSettingsPage.module.css` | Modify | Styles for token list, new-token reveal, monospace prefix |

---

## Task 1 — Migration: `mcp_tokens` table

**Files:**
- Create: `supabase/migrations/20260519_mcp_tokens.sql`

- [ ] **Step 1.1: Write the migration**

```sql
-- mcp_tokens: long-lived tokens for MCP server authentication.
-- Raw tokens are never stored. Only SHA-256 hashes are persisted.
-- Prefix (first 13 chars of raw token) is stored for display only.

CREATE TABLE IF NOT EXISTS public.mcp_tokens (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  label        text        NOT NULL CHECK (char_length(label) BETWEEN 1 AND 120),
  token_hash   text        NOT NULL UNIQUE,
  prefix       text        NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  revoked_at   timestamptz,
  last_used_at timestamptz
);

CREATE INDEX IF NOT EXISTS mcp_tokens_user_id_idx
  ON public.mcp_tokens (user_id)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS mcp_tokens_hash_idx
  ON public.mcp_tokens (token_hash)
  WHERE revoked_at IS NULL;

-- RLS: deny all end-user access. Backend uses service_role.
ALTER TABLE public.mcp_tokens ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.mcp_tokens IS
  'Long-lived MCP authentication tokens. Raw token never stored — only SHA-256 hash.';
```

- [ ] **Step 1.2: Apply to Dev Supabase**

Use the `mcp__supabaseDev__apply_migration_file` tool with path `supabase/migrations/20260519_mcp_tokens.sql`.

Expected: no error, table appears in `list_tables`.

- [ ] **Step 1.3: Verify table exists on Dev**

Run SQL via `mcp__supabaseDev__run_sql`:
```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'mcp_tokens'
ORDER BY ordinal_position;
```

Expected: 8 rows — `id`, `user_id`, `label`, `token_hash`, `prefix`, `created_at`, `revoked_at`, `last_used_at`.

- [ ] **Step 1.4: Commit**

```bash
git -C /Users/adrian/GitHub/webbrief add supabase/migrations/20260519_mcp_tokens.sql
git -C /Users/adrian/GitHub/webbrief commit -m "feat(mcp): add mcp_tokens migration"
```

---

## Task 2 — Backend route: CRUD for MCP tokens

**Files:**
- Create: `backend/src/routes/mcpTokens.js`

- [ ] **Step 2.1: Create the route file**

```js
import { Router } from 'express'
import { randomBytes, createHash } from 'node:crypto'
import { supabaseAdmin } from '../lib/supabase.js'
import { requireAuth } from '../middleware/auth.js'
import { rateLimiters } from '../middleware/security.js'
import { logSecurityEvent } from '../lib/securityAudit.js'
import { normalizeText } from '../lib/validation.js'

const router = Router()

function generateMcpToken() {
  const raw = 'mcpt_' + randomBytes(32).toString('hex')
  const hash = createHash('sha256').update(raw).digest('hex')
  const prefix = raw.slice(0, 13) // 'mcpt_' + 8 hex chars
  return { raw, hash, prefix }
}

// GET /api/auth/mcp-tokens — list active tokens for current user (no raw)
router.get('/mcp-tokens', requireAuth, async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('mcp_tokens')
    .select('id, label, prefix, created_at, last_used_at')
    .eq('user_id', req.currentUser.id)
    .is('revoked_at', null)
    .order('created_at', { ascending: false })

  if (error) return res.status(500).json({ error: 'No se pudieron obtener los tokens' })
  return res.json({ tokens: data })
})

// POST /api/auth/mcp-tokens — issue a new token, returns raw once
router.post('/mcp-tokens', requireAuth, rateLimiters.sensitiveAction, async (req, res) => {
  const label = normalizeText(req.body?.label, 120)
  if (!label) return res.status(400).json({ error: 'El campo label es obligatorio' })

  const { raw, hash, prefix } = generateMcpToken()

  const { data, error } = await supabaseAdmin
    .from('mcp_tokens')
    .insert({ user_id: req.currentUser.id, label, token_hash: hash, prefix })
    .select('id, label, prefix, created_at')
    .single()

  if (error) return res.status(500).json({ error: 'No se pudo crear el token' })

  await logSecurityEvent(req, {
    action: 'mcp_token_issued',
    resourceType: 'mcp_token',
    resourceId: data.id,
    targetUserId: req.currentUser.id,
    outcome: 'success',
    metadata: { label },
  })

  return res.status(201).json({ token: { ...data, raw } })
})

// DELETE /api/auth/mcp-tokens/:id — revoke a token
router.delete('/mcp-tokens/:id', requireAuth, rateLimiters.sensitiveAction, async (req, res) => {
  const { id } = req.params

  // Verify ownership before revoking
  const { data: existing } = await supabaseAdmin
    .from('mcp_tokens')
    .select('id, label, user_id')
    .eq('id', id)
    .is('revoked_at', null)
    .maybeSingle()

  if (!existing) return res.status(404).json({ error: 'Token no encontrado' })
  if (existing.user_id !== req.currentUser.id && req.currentUser.platformRole !== 'admin') {
    return res.status(403).json({ error: 'Sin permiso para revocar este token' })
  }

  const { error } = await supabaseAdmin
    .from('mcp_tokens')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', id)

  if (error) return res.status(500).json({ error: 'No se pudo revocar el token' })

  await logSecurityEvent(req, {
    action: 'mcp_token_revoked',
    resourceType: 'mcp_token',
    resourceId: id,
    targetUserId: existing.user_id,
    outcome: 'success',
    metadata: { label: existing.label },
  })

  return res.json({ revoked: true })
})

export default router
```

- [ ] **Step 2.2: Commit**

```bash
git -C /Users/adrian/GitHub/webbrief add backend/src/routes/mcpTokens.js
git -C /Users/adrian/GitHub/webbrief commit -m "feat(mcp): add mcp-tokens CRUD route"
```

---

## Task 3 — Mount route in index.js

**Files:**
- Modify: `backend/src/index.js`

- [ ] **Step 3.1: Add import and mount**

At the top of `backend/src/index.js`, after the existing route imports (around line 18), add:

```js
import mcpTokensRoutes from './routes/mcpTokens.js'
```

After the line `app.use('/api/auth', authRoutes)` (around line 51), add:

```js
app.use('/api/auth', mcpTokensRoutes)
```

- [ ] **Step 3.2: Smoke-test the route**

Start the backend locally (`npm run dev` in `backend/`) and run:

```bash
curl -s http://localhost:3000/api/auth/mcp-tokens \
  -H "Authorization: Bearer <your-supabase-jwt>" | jq .
```

Expected: `{ "tokens": [] }` (empty list for a fresh user).

```bash
curl -s -X POST http://localhost:3000/api/auth/mcp-tokens \
  -H "Authorization: Bearer <your-supabase-jwt>" \
  -H "Content-Type: application/json" \
  -d '{"label":"Test token"}' | jq .
```

Expected: `{ "token": { "id": "...", "label": "Test token", "prefix": "mcpt_XXXXXXXX", "created_at": "...", "raw": "mcpt_..." } }`

Copy the `raw` value for the next task's smoke test.

- [ ] **Step 3.3: Commit**

```bash
git -C /Users/adrian/GitHub/webbrief add backend/src/index.js
git -C /Users/adrian/GitHub/webbrief commit -m "feat(mcp): mount mcp-tokens route"
```

---

## Task 4 — Extend `requireAuth` with MCP token fast-path

**Files:**
- Modify: `backend/src/middleware/auth.js`

- [ ] **Step 4.1: Add crypto import and MCP fast-path**

At the top of `backend/src/middleware/auth.js`, add the import:

```js
import { createHash } from 'node:crypto'
```

Inside `requireAuth`, after the block that extracts `token` (after line 59 — `const token = bearerToken || ...`), and **before** the `if (!token)` check, add nothing — keep `if (!token)` where it is.

**After** the `if (!token) { ... return }` block (around line 69), insert the MCP fast-path **before** the `try { const { data, error } = await supabaseAdmin.auth.getUser(token) }` block:

```js
  // MCP token fast-path: long-lived tokens with prefix mcpt_
  if (token.startsWith('mcpt_')) {
    const hash = createHash('sha256').update(token).digest('hex')

    const { data: mcpToken, error: mcpError } = await supabaseAdmin
      .from('mcp_tokens')
      .select('id, user_id')
      .eq('token_hash', hash)
      .is('revoked_at', null)
      .maybeSingle()

    if (mcpError || !mcpToken) {
      writeSecurityLog('warn', 'mcp_token_invalid', getRequestLogContext(req))
      await logSecurityEvent(req, {
        action: 'mcp_token_invalid',
        resourceType: 'mcp_token',
        outcome: 'denied',
        metadata: { reason: mcpError?.message || 'not_found_or_revoked' },
      })
      return res.status(401).json({ error: 'Token MCP invalido o revocado' })
    }

    try {
      req.currentUser = await loadCurrentUser({ id: mcpToken.user_id })
    } catch (err) {
      writeSecurityLog('warn', 'mcp_token_user_load_failed', {
        ...getRequestLogContext(req),
        error: err.message,
      })
      return res.status(401).json({ error: 'No se pudo cargar el usuario del token MCP' })
    }

    req.accessToken = null
    req.mcpTokenId = mcpToken.id

    // Non-blocking: audit + last_used_at
    Promise.all([
      supabaseAdmin
        .from('mcp_tokens')
        .update({ last_used_at: new Date().toISOString() })
        .eq('id', mcpToken.id),
      logSecurityEvent(req, {
        action: 'mcp_token_used',
        resourceType: 'mcp_token',
        resourceId: mcpToken.id,
        targetUserId: mcpToken.user_id,
        outcome: 'success',
      }),
    ]).catch(() => {})

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

    return next()
  }
```

The existing `try { supabaseAdmin.auth.getUser(token) }` block stays intact below this insertion — it handles regular Supabase JWTs unchanged.

- [ ] **Step 4.2: Smoke-test MCP token auth**

Using the `raw` value from Task 3 Step 3.2:

```bash
# Should authenticate and return current user
curl -s http://localhost:3000/api/auth/me \
  -H "Authorization: Bearer mcpt_<your-raw-token>" | jq .
```

Expected: `{ "user": { "id": "...", "email": "...", ... } }`

```bash
# Revoke the token via Supabase JWT (get ID from GET list first)
TOKEN_ID="<id-from-get-list>"
curl -s -X DELETE "http://localhost:3000/api/auth/mcp-tokens/$TOKEN_ID" \
  -H "Authorization: Bearer <supabase-jwt>" | jq .

# Now try the revoked MCP token — should get 401
curl -s http://localhost:3000/api/auth/me \
  -H "Authorization: Bearer mcpt_<same-raw-token>" | jq .
```

Expected for revoked: `{ "error": "Token MCP invalido o revocado" }`

- [ ] **Step 4.3: Verify `security_events` audit entries**

```sql
SELECT action, outcome, resource_type, resource_id, created_at
FROM security_events
WHERE action IN ('mcp_token_issued', 'mcp_token_used', 'mcp_token_revoked', 'mcp_token_invalid')
ORDER BY created_at DESC
LIMIT 10;
```

Run via `mcp__supabaseDev__run_sql`. Expected: rows for `mcp_token_issued`, `mcp_token_used`, `mcp_token_revoked`, `mcp_token_invalid`.

- [ ] **Step 4.4: Commit**

```bash
git -C /Users/adrian/GitHub/webbrief add backend/src/middleware/auth.js
git -C /Users/adrian/GitHub/webbrief commit -m "feat(mcp): extend requireAuth with mcpt_ token fast-path"
```

---

## Task 5 — Frontend: MCP Tokens section in AccountSettingsPage

**Files:**
- Modify: `frontend/src/pages/AccountSettingsPage.jsx`
- Modify: `frontend/src/pages/AccountSettingsPage.module.css`

- [ ] **Step 5.1: Add state and data-fetching to AccountSettingsPage**

In `AccountSettingsPage.jsx`, add these state declarations inside the component (after the existing `useState` calls):

```js
const [mcpTokens, setMcpTokens] = useState([])
const [mcpLabelInput, setMcpLabelInput] = useState('')
const [mcpBusy, setMcpBusy] = useState('')
const [mcpNewToken, setMcpNewToken] = useState(null) // { raw, id, label, prefix }
const [mcpError, setMcpError] = useState('')
const [mcpCopied, setMcpCopied] = useState(false)
```

Add a `useEffect` to load tokens on mount (after the existing profile `useEffect`):

```js
useEffect(() => {
  apiFetch('/api/auth/mcp-tokens')
    .then((data) => setMcpTokens(data.tokens || []))
    .catch(() => {})
}, [])
```

Add these handlers inside the component (before the `return`):

```js
async function handleMcpCreate(event) {
  event.preventDefault()
  const label = mcpLabelInput.trim()
  if (!label) return
  setMcpBusy('create')
  setMcpError('')
  setMcpNewToken(null)
  try {
    const data = await apiFetch('/api/auth/mcp-tokens', {
      method: 'POST',
      body: JSON.stringify({ label }),
    })
    setMcpNewToken(data.token)
    setMcpLabelInput('')
    setMcpTokens((prev) => [
      { id: data.token.id, label: data.token.label, prefix: data.token.prefix, created_at: data.token.created_at, last_used_at: null },
      ...prev,
    ])
  } catch (error) {
    setMcpError(error.message || 'No se pudo crear el token')
  } finally {
    setMcpBusy('')
  }
}

async function handleMcpRevoke(tokenId) {
  setMcpBusy(tokenId)
  setMcpError('')
  try {
    await apiFetch(`/api/auth/mcp-tokens/${tokenId}`, { method: 'DELETE' })
    setMcpTokens((prev) => prev.filter((t) => t.id !== tokenId))
    if (mcpNewToken?.id === tokenId) setMcpNewToken(null)
  } catch (error) {
    setMcpError(error.message || 'No se pudo revocar el token')
  } finally {
    setMcpBusy('')
  }
}

function handleMcpCopy() {
  if (!mcpNewToken?.raw) return
  navigator.clipboard.writeText(mcpNewToken.raw).then(() => {
    setMcpCopied(true)
    setTimeout(() => setMcpCopied(false), 2000)
  })
}
```

- [ ] **Step 5.2: Add the Lucide imports needed**

In the existing import line that already has `Bell, Camera, Download, KeyRound, Save`, add `Copy, Terminal, Trash2`:

```js
import { Bell, Camera, Copy, Download, KeyRound, Save, Terminal, Trash2 } from 'lucide-react'
```

- [ ] **Step 5.3: Add nav link for `#api-tokens`**

In the JSX, the `<nav className={styles.settingsNav}>` block currently has three links. Add a fourth:

```jsx
<a href="#api-tokens">Tokens MCP</a>
```

- [ ] **Step 5.4: Add the `#api-tokens` Card section**

After the closing `</Card>` of the `#notifications` section (around line 377), add:

```jsx
<Card as="section" id="api-tokens" padding="md" shadow="sm" radius="lg" className={styles.panel}>
  <div className={styles.panelHeader}>
    <div>
      <h2 className={styles.panelTitle}>Tokens MCP</h2>
      <p className={styles.panelText}>
        Tokens de larga duración para clientes MCP locales (Codex, Claude Code).
        El valor raw solo se muestra una vez al crear.
      </p>
    </div>
    <Terminal className={styles.panelIcon} aria-hidden="true" />
  </div>

  {mcpNewToken && (
    <div className={styles.mcpReveal}>
      <p className={styles.mcpRevealLabel}>
        Copia este token ahora — no se puede ver de nuevo.
      </p>
      <div className={styles.mcpRevealRow}>
        <code className={styles.mcpCode}>{mcpNewToken.raw}</code>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          icon={<Copy size={14} />}
          onClick={handleMcpCopy}
        >
          {mcpCopied ? 'Copiado' : 'Copiar'}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setMcpNewToken(null)}
        >
          Cerrar
        </Button>
      </div>
    </div>
  )}

  <form className={styles.form} onSubmit={handleMcpCreate}>
    <div className={styles.mcpCreateRow}>
      <Input
        id="mcp-token-label"
        label="Nombre del token"
        type="text"
        placeholder="p.ej. Claude Code local"
        value={mcpLabelInput}
        onChange={(e) => setMcpLabelInput(e.target.value)}
        maxLength={120}
      />
      <Button
        type="submit"
        variant="primary"
        size="md"
        disabled={!mcpLabelInput.trim() || mcpBusy === 'create'}
        loading={mcpBusy === 'create'}
      >
        Crear token
      </Button>
    </div>
    {mcpError && <p className={styles.error} role="alert">{mcpError}</p>}
  </form>

  {mcpTokens.length > 0 ? (
    <ul className={styles.mcpList}>
      {mcpTokens.map((token) => (
        <li key={token.id} className={styles.mcpItem}>
          <div className={styles.mcpItemInfo}>
            <span className={styles.mcpItemLabel}>{token.label}</span>
            <code className={styles.mcpItemPrefix}>{token.prefix}…</code>
            <span className={styles.mcpItemMeta}>
              Creado {new Date(token.created_at).toLocaleDateString('es')}
              {token.last_used_at && ` · Último uso ${new Date(token.last_used_at).toLocaleDateString('es')}`}
            </span>
          </div>
          <Button
            type="button"
            variant="danger"
            size="sm"
            icon={<Trash2 size={14} />}
            disabled={mcpBusy === token.id}
            loading={mcpBusy === token.id}
            onClick={() => handleMcpRevoke(token.id)}
          >
            Revocar
          </Button>
        </li>
      ))}
    </ul>
  ) : (
    <p className={styles.emptyState}>Sin tokens activos.</p>
  )}
</Card>
```

- [ ] **Step 5.5: Add CSS for the new MCP section**

Append to `frontend/src/pages/AccountSettingsPage.module.css`:

```css
/* MCP Tokens section */
.mcpReveal {
  background: var(--wb-color-warning-50);
  border: 1px solid var(--wb-color-warning-200);
  border-radius: var(--wb-radius-md);
  padding: var(--wb-space-3) var(--wb-space-4);
  margin-bottom: var(--wb-space-4);
  display: flex;
  flex-direction: column;
  gap: var(--wb-space-2);
}

.mcpRevealLabel {
  margin: 0;
  font-size: var(--wb-text-sm);
  font-weight: var(--wb-weight-semibold);
  color: var(--wb-color-warning-800);
}

.mcpRevealRow {
  display: flex;
  align-items: center;
  gap: var(--wb-space-2);
  flex-wrap: wrap;
}

.mcpCode {
  font-family: ui-monospace, monospace;
  font-size: var(--wb-text-sm);
  background: var(--wb-color-neutral-100);
  border-radius: var(--wb-radius-sm);
  padding: var(--wb-space-1) var(--wb-space-2);
  word-break: break-all;
  flex: 1;
  min-width: 0;
}

.mcpCreateRow {
  display: flex;
  align-items: flex-end;
  gap: var(--wb-space-3);
}

.mcpCreateRow > :first-child {
  flex: 1;
  min-width: 0;
}

.mcpList {
  list-style: none;
  margin: var(--wb-space-4) 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--wb-space-2);
}

.mcpItem {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--wb-space-3);
  padding: var(--wb-space-3) var(--wb-space-4);
  background: var(--wb-color-neutral-50);
  border: 1px solid var(--wb-color-neutral-200);
  border-radius: var(--wb-radius-md);
}

.mcpItemInfo {
  display: flex;
  flex-direction: column;
  gap: var(--wb-space-1);
  min-width: 0;
}

.mcpItemLabel {
  font-weight: var(--wb-weight-semibold);
  font-size: var(--wb-text-sm);
  color: var(--wb-text);
}

.mcpItemPrefix {
  font-family: ui-monospace, monospace;
  font-size: var(--wb-text-xs);
  color: var(--wb-text-muted);
}

.mcpItemMeta {
  font-size: var(--wb-text-xs);
  color: var(--wb-text-muted);
}
```

- [ ] **Step 5.6: Start dev server and verify in browser**

```bash
cd /Users/adrian/GitHub/webbrief/frontend && npm run dev
```

Navigate to `http://localhost:5173` → log in → go to Ajustes de cuenta → scroll to "Tokens MCP". Verify:

1. Section renders with empty state "Sin tokens activos."
2. Fill in a label → click "Crear token" → yellow reveal banner appears with raw token + "Copiar" button.
3. Token appears in list with label, prefix, and "Revocar" button.
4. "Copiar" copies raw token to clipboard (check with paste).
5. "Cerrar" hides the reveal banner.
6. "Revocar" removes the token from the list.
7. After revoke, use the copied raw token with `curl /api/auth/me` — confirm 401.

- [ ] **Step 5.7: Commit**

```bash
git -C /Users/adrian/GitHub/webbrief add frontend/src/pages/AccountSettingsPage.jsx frontend/src/pages/AccountSettingsPage.module.css
git -C /Users/adrian/GitHub/webbrief commit -m "feat(mcp): add MCP Tokens UI section to AccountSettingsPage"
```

---

## Self-Review

**Spec coverage check:**

| Requirement (handoff) | Task |
|---|---|
| Migration `mcp_tokens (id, user_id, label, token_hash, prefix, created_at, revoked_at, last_used_at)` | Task 1 ✓ |
| `POST /api/auth/mcp-tokens` — issue, devuelve raw solo una vez | Task 2 ✓ |
| `GET /api/auth/mcp-tokens` — list sin raw | Task 2 ✓ |
| `DELETE /api/auth/mcp-tokens/:id` — revoke | Task 2 ✓ |
| Middleware: extender `requireAuth` para `mcpt_*` (hash-based) | Task 4 ✓ |
| Audit: cada uso → `security_events` con `mcp_token_used` | Tasks 2 + 4 ✓ |
| UI mínima: listar tokens activos, crear con label, revocar | Task 5 ✓ |
| Audit `mcp_token_issued` y `mcp_token_revoked` | Task 2 ✓ |

**No placeholders detected** — all steps contain explicit code.

**Type consistency** — `token.id`, `token.label`, `token.prefix`, `token.created_at`, `token.last_used_at`, `token.raw` used consistently across Tasks 2, 4, and 5.
