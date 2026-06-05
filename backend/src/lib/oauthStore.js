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
