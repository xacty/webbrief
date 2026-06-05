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

export default router
