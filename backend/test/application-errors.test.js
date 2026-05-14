import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  buildApplicationErrorRow,
  sanitizeErrorMetadata,
  wrapSupabaseAuthCall,
} from '../src/lib/applicationErrors.js'

// -------- buildApplicationErrorRow tests --------

test('buildApplicationErrorRow: minimal shape', () => {
  const req = {
    requestId: 'req-123',
    originalUrl: '/api/users',
    method: 'POST',
    currentUser: { id: 'u1' },
  }
  const error = new Error('boom')

  const row = buildApplicationErrorRow(req, error, {
    level: 'error',
    source: 'route',
  })

  assert.equal(row.level, 'error')
  assert.equal(row.source, 'route')
  assert.equal(row.request_id, 'req-123')
  assert.equal(row.route, '/api/users')
  assert.equal(row.method, 'POST')
  assert.equal(row.user_id, 'u1')
  assert.equal(row.error_message, 'boom')
  assert.match(row.stack_trace, /at /)
  assert.deepEqual(row.metadata, {})
})

test('buildApplicationErrorRow: extracts error code from various shapes', () => {
  const req = { requestId: 'req-2' }

  const e1 = Object.assign(new Error('m1'), { code: 'X_CODE' })
  assert.equal(buildApplicationErrorRow(req, e1, { source: 'route' }).error_code, 'X_CODE')

  const e2 = Object.assign(new Error('m2'), { status: 429 })
  assert.equal(buildApplicationErrorRow(req, e2, { source: 'route' }).error_code, '429')

  // explicit override wins
  assert.equal(
    buildApplicationErrorRow(req, e1, { source: 'route', errorCode: 'OVERRIDE' }).error_code,
    'OVERRIDE'
  )
})

test('buildApplicationErrorRow: truncates stack trace to 4000 chars', () => {
  const req = { requestId: 'req-3' }
  const longStack = 'x'.repeat(5000)
  const error = Object.assign(new Error('boom'), { stack: longStack })

  const row = buildApplicationErrorRow(req, error, { source: 'unhandled' })
  assert.equal(row.stack_trace.length, 4000)
})

test('buildApplicationErrorRow: defaults level to error', () => {
  const req = { requestId: 'r' }
  const row = buildApplicationErrorRow(req, new Error('x'), { source: 'route' })
  assert.equal(row.level, 'error')
})

test('sanitizeErrorMetadata: drops secrets', () => {
  const input = {
    operation: 'inviteUserByEmail',
    args: { email: 'a@b.com' },
    token: 'SECRET',
    access_token: 'X',
    password: 'P',
    authorization: 'Bearer Y',
    safe: 'ok',
  }
  const sanitized = sanitizeErrorMetadata(input)
  assert.equal(sanitized.operation, 'inviteUserByEmail')
  assert.equal(sanitized.safe, 'ok')
  assert.equal(sanitized.token, undefined)
  assert.equal(sanitized.access_token, undefined)
  assert.equal(sanitized.password, undefined)
  assert.equal(sanitized.authorization, undefined)
})

test('sanitizeErrorMetadata: handles non-object input', () => {
  assert.deepEqual(sanitizeErrorMetadata(null), {})
  assert.deepEqual(sanitizeErrorMetadata(undefined), {})
  assert.deepEqual(sanitizeErrorMetadata('string'), {})
})

test('buildApplicationErrorRow: missing currentUser leaves user_id null', () => {
  const req = { requestId: 'r' }
  const row = buildApplicationErrorRow(req, new Error('x'), { source: 'route' })
  assert.equal(row.user_id, null)
})

test('buildApplicationErrorRow: missing route/method tolerated', () => {
  const req = { requestId: 'r' }
  const row = buildApplicationErrorRow(req, new Error('x'), { source: 'route' })
  assert.equal(row.route, null)
  assert.equal(row.method, null)
})

// -------- wrapSupabaseAuthCall tests --------

test('wrapSupabaseAuthCall: success path returns operation result', async () => {
  const operation = async () => ({ data: { id: 'u1' }, error: null })

  const result = await wrapSupabaseAuthCall({
    operation,
    operationName: 'inviteUserByEmail',
    req: { requestId: 'r' },
    persist: async () => null,
  })

  assert.deepEqual(result, { data: { id: 'u1' }, error: null })
})

test('wrapSupabaseAuthCall: throws wrapped error and persists', async () => {
  const operation = async () => {
    throw Object.assign(new Error('rate limit'), { code: 'over_email_send_rate_limit' })
  }

  let persisted = null
  const persist = async (req, error, options) => {
    persisted = { req, error, options }
    return 'persisted-id-123'
  }

  await assert.rejects(
    wrapSupabaseAuthCall({
      operation,
      operationName: 'inviteUserByEmail',
      req: { requestId: 'r-1' },
      args: { email: 'x@y.com' },
      persist,
    }),
    (err) => {
      assert.equal(err.applicationErrorId, 'persisted-id-123')
      assert.equal(err.code, 'over_email_send_rate_limit')
      return true
    }
  )

  assert.equal(persisted.options.source, 'supabase_auth')
  assert.equal(persisted.options.errorCode, 'over_email_send_rate_limit')
  assert.equal(persisted.options.metadata.operation, 'inviteUserByEmail')
  assert.deepEqual(persisted.options.metadata.args, { email: 'x@y.com' })
})

test('wrapSupabaseAuthCall: handles supabase-style error in return value (not throw)', async () => {
  const operation = async () => ({
    data: null,
    error: Object.assign(new Error('email_exists'), { code: 'email_exists', status: 422 }),
  })

  let persisted = null
  const persist = async (req, error, options) => {
    persisted = options
    return 'id'
  }

  const result = await wrapSupabaseAuthCall({
    operation,
    operationName: 'inviteUserByEmail',
    req: { requestId: 'r' },
    persist,
  })

  assert.equal(result.error.code, 'email_exists')
  assert.equal(persisted.errorCode, 'email_exists')
  assert.equal(persisted.metadata.operation, 'inviteUserByEmail')
})

test('wrapSupabaseAuthCall: sanitizes sensitive args before persisting', async () => {
  const operation = async () => {
    throw new Error('boom')
  }

  let persisted = null
  const persist = async (req, error, options) => {
    persisted = options
    return 'id'
  }

  await assert.rejects(wrapSupabaseAuthCall({
    operation,
    operationName: 'updateUser',
    req: { requestId: 'r' },
    args: { email: 'x@y.com', password: 'SECRET', token: 'T' },
    persist,
  }))

  assert.equal(persisted.metadata.args.email, 'x@y.com')
  assert.equal(persisted.metadata.args.password, undefined)
  assert.equal(persisted.metadata.args.token, undefined)
})
