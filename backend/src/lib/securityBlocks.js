import net from 'node:net'
import { getRequestLogContext, writeSecurityLog } from './securityLogger.js'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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

// Solo se interpola en el filtro `.or(...)` lo que pasa estas validaciones.
// Sin esto, un valor arbitrario puede romper la sintaxis del filtro de PostgREST,
// hacer fallar la query y — combinado con el manejo de error de mas abajo —
// convertir "no se pudo comprobar" en "no esta bloqueado" (auditoria 2026-08, M6).
function isSafeUuid(value) {
  return typeof value === 'string' && UUID_RE.test(value)
}

function isSafeIp(value) {
  return net.isIP(normalizeIp(value)) !== 0
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

  // Solo los valores validados llegan al filtro; los invalidos se descartan en
  // vez de interpolarse (un `unknown-ip` o un id malformado romperia el `.or`).
  const safeUserId = isSafeUuid(userId) ? userId : null
  const safeIp = isSafeIp(ipAddress) ? normalizeIp(ipAddress) : null

  if (safeUserId && safeIp) {
    query = query.or(`user_id.eq.${safeUserId},ip_address.eq.${safeIp}`)
  } else if (safeUserId) {
    query = query.eq('user_id', safeUserId)
  } else if (safeIp) {
    query = query.eq('ip_address', safeIp)
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
    // NO se cachea el resultado en caso de error inesperado: cachear null aqui
    // convertia un fallo transitorio en "no esta bloqueado" durante toda la
    // ventana de cache (15s), y el proximo request repetia el veredicto sin
    // volver a consultar. Sin cachear, se reintenta en el request siguiente.
    //
    // Se sigue devolviendo null (fail-open) a proposito: fallar cerrado aqui
    // bloquearia TODA la app ante un hipo de la base. Eso es aceptable ahora
    // porque el vector real —inducir el error a proposito mediante un filtro
    // malformado— quedo cerrado con la validacion de arriba; lo que queda son
    // fallos genuinos de infraestructura, donde tumbar el servicio es peor.
    return null
  }

  const block = (data || []).map(serializeBlock).find(Boolean) || null
  setCachedBlock(key, block)
  return block
}
