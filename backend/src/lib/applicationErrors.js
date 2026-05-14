// Application errors — technical/operator diagnostics persisted to the
// application_errors table. Distinct from security_events (audit trail).
//
// Use logApplicationError(req, error, ctx) for any uncaught exception or
// external-API failure that should be visible to operators in /security/errors.
//
// Writes are best-effort: failures here ONLY emit to console (we cannot
// recursively persist a write failure). Callers should NOT rely on the
// returned id being non-null when planning their own retry logic.

import { supabaseAdmin } from './supabase.js'

const STACK_TRACE_MAX = 4000

const SECRET_KEYS = new Set([
  'token',
  'access_token',
  'accessToken',
  'password',
  'authorization',
  'Authorization',
  'cookie',
  'Cookie',
])

export function sanitizeErrorMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return {}
  }
  const clone = { ...metadata }
  for (const key of SECRET_KEYS) {
    delete clone[key]
  }
  return clone
}

function extractErrorCode(error, explicit) {
  if (explicit) return String(explicit)
  if (error?.code) return String(error.code)
  if (error?.status) return String(error.status)
  return null
}

function truncateStack(stack) {
  if (!stack) return null
  const str = String(stack)
  if (str.length <= STACK_TRACE_MAX) return str
  return str.slice(0, STACK_TRACE_MAX)
}

export function buildApplicationErrorRow(req, error, options = {}) {
  const {
    level = 'error',
    source,
    errorCode,
    metadata = {},
  } = options

  if (!source) {
    throw new Error('logApplicationError: source is required')
  }

  return {
    level,
    source,
    request_id: req?.requestId || null,
    route: req?.originalUrl || req?.url || null,
    method: req?.method || null,
    user_id: req?.currentUser?.id || null,
    error_code: extractErrorCode(error, errorCode),
    error_message: error?.message ? String(error.message) : 'Unknown error',
    stack_trace: truncateStack(error?.stack),
    metadata: sanitizeErrorMetadata(metadata),
  }
}

// Best-effort persistence. Returns the inserted row id (string) or null
// if persistence failed. Never throws.
export async function logApplicationError(req, error, options = {}) {
  try {
    const row = buildApplicationErrorRow(req, error, options)
    const { data, error: insertError } = await supabaseAdmin
      .from('application_errors')
      .insert(row)
      .select('id')
      .single()

    if (insertError) {
      console.error('[applicationErrors] persist failed', insertError.message, 'original:', error?.message)
      return null
    }
    return data?.id || null
  } catch (loggingError) {
    console.error('[applicationErrors] logging threw', loggingError?.message, 'original:', error?.message)
    return null
  }
}

// Wraps a Supabase auth.admin.* call so failures are persisted to
// application_errors with the operation name and sanitized args.
//
// Two failure modes are handled:
//   - operation throws → captured, persisted, rethrown with .applicationErrorId
//   - operation returns { data, error } where error is truthy → persisted, returned as-is
//
// Args are sanitized (token/password/authorization stripped) before persistence.
// The `persist` parameter is injectable for testing; defaults to logApplicationError.
export async function wrapSupabaseAuthCall({
  operation,
  operationName,
  req,
  args = {},
  persist = logApplicationError,
}) {
  const sanitizedArgs = sanitizeErrorMetadata(args)

  try {
    const result = await operation()
    if (result && result.error) {
      await persist(req, result.error, {
        source: 'supabase_auth',
        errorCode: result.error.code || result.error.status,
        metadata: { operation: operationName, args: sanitizedArgs },
      })
    }
    return result
  } catch (error) {
    const errorId = await persist(req, error, {
      source: 'supabase_auth',
      errorCode: error.code || error.status,
      metadata: { operation: operationName, args: sanitizedArgs },
    })
    error.applicationErrorId = errorId
    throw error
  }
}
