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
