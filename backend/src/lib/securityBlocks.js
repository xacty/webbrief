import { getRequestLogContext, writeSecurityLog } from './securityLogger.js'

let securityBlocksAvailable = true
let securityBlocksRetryAt = 0
const blockCache = new Map()
const BLOCK_CACHE_MS = 15_000

function isMissingTableError(error, tableName) {
  const message = `${error?.message || ''} ${error?.details || ''}`
  const mentionsTable = message.includes(`public.${tableName}`)
    || message.includes(`'${tableName}'`)
    || message.includes(`"${tableName}"`)

  return (
    error?.code === '42P01'
    || error?.code === 'PGRST205'
    || (mentionsTable && (
      message.includes('schema cache')
      || message.includes('does not exist')
      || message.includes('Could not find')
    ))
  )
}

function normalizeIp(value) {
  return String(value || '').trim()
}

function isExpired(block) {
  return Boolean(block?.expires_at && new Date(block.expires_at) <= new Date())
}

function serializeBlock(block) {
  if (!block || isExpired(block) || block.revoked_at) return null
  return {
    id: block.id,
    blockType: block.block_type,
    userId: block.user_id,
    ipAddress: block.ip_address,
    reason: block.reason,
    blockedBy: block.blocked_by,
    blockedAt: block.blocked_at,
    expiresAt: block.expires_at,
    revokedAt: block.revoked_at,
  }
}

function cacheKey({ userId = null, ipAddress = null }) {
  return `${userId || ''}:${normalizeIp(ipAddress)}`
}

function getCachedBlock(key) {
  const cached = blockCache.get(key)
  if (!cached || cached.expiresAtMs < Date.now()) {
    blockCache.delete(key)
    return undefined
  }
  return cached.value
}

function setCachedBlock(key, value) {
  blockCache.set(key, {
    value,
    expiresAtMs: Date.now() + BLOCK_CACHE_MS,
  })
}

function markMissingTable(req, error) {
  securityBlocksAvailable = false
  securityBlocksRetryAt = Date.now() + 30_000
  writeSecurityLog('warn', 'security_blocks_table_missing', {
    ...getRequestLogContext(req),
    error: error.message,
  })
}

export function clearSecurityBlockCache() {
  blockCache.clear()
}

export async function getActiveSecurityBlock(req, { userId = null, ipAddress = null }) {
  if (!securityBlocksAvailable) {
    if (Date.now() < securityBlocksRetryAt) return null
    securityBlocksAvailable = true
  }

  const key = cacheKey({ userId, ipAddress })
  const cached = getCachedBlock(key)
  if (cached !== undefined) return cached

  const { supabaseAdmin } = await import('./supabase.js')
  let query = supabaseAdmin
    .from('security_blocks')
    .select('id, block_type, user_id, ip_address, reason, blocked_by, blocked_at, expires_at, revoked_at')
    .is('revoked_at', null)
    .order('blocked_at', { ascending: false })
    .limit(1)

  if (userId && ipAddress) {
    query = query.or(`user_id.eq.${userId},ip_address.eq.${normalizeIp(ipAddress)}`)
  } else if (userId) {
    query = query.eq('user_id', userId)
  } else if (ipAddress) {
    query = query.eq('ip_address', normalizeIp(ipAddress))
  } else {
    return null
  }

  const { data, error } = await query

  if (error) {
    if (isMissingTableError(error, 'security_blocks')) {
      markMissingTable(req, error)
      setCachedBlock(key, null)
      return null
    }

    writeSecurityLog('warn', 'security_blocks_lookup_failed', {
      ...getRequestLogContext(req),
      error: error.message,
    })
    setCachedBlock(key, null)
    return null
  }

  const block = (data || []).map(serializeBlock).find(Boolean) || null
  setCachedBlock(key, block)
  return block
}
