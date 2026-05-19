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
  try {
    const { data, error } = await supabaseAdmin
      .from('mcp_tokens')
      .select('id, label, prefix, created_at, last_used_at')
      .eq('user_id', req.currentUser.id)
      .is('revoked_at', null)
      .order('created_at', { ascending: false })

    if (error) return res.status(500).json({ error: 'No se pudieron obtener los tokens' })
    return res.json({ tokens: data })
  } catch (err) {
    return res.status(500).json({ error: 'No se pudieron obtener los tokens' })
  }
})

// POST /api/auth/mcp-tokens — issue a new token, returns raw once
router.post('/mcp-tokens', requireAuth, rateLimiters.sensitiveAction, async (req, res) => {
  const label = normalizeText(req.body?.label, 120)
  if (!label) return res.status(400).json({ error: 'El campo label es obligatorio' })

  try {
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
  } catch (err) {
    return res.status(500).json({ error: 'No se pudo crear el token' })
  }
})

// DELETE /api/auth/mcp-tokens/:id — revoke a token
router.delete('/mcp-tokens/:id', requireAuth, rateLimiters.sensitiveAction, async (req, res) => {
  const { id } = req.params

  try {
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
      .is('revoked_at', null)

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
  } catch (err) {
    return res.status(500).json({ error: 'No se pudo revocar el token' })
  }
})

export default router
