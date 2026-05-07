import assert from 'node:assert/strict'
import { beforeEach, test } from 'node:test'
import {
  createRateLimit,
  publicAntiScrapingHeaders,
  requestContext,
  resetRateLimitBucketsForTests,
} from '../src/middleware/security.js'
import {
  isValidPublicToken,
  normalizeEmail,
  normalizeOptionalSafeId,
  normalizeText,
  validateAnswersPayload,
} from '../src/lib/validation.js'

function createReq(overrides = {}) {
  return {
    method: 'GET',
    url: '/test',
    originalUrl: '/test',
    ip: '127.0.0.1',
    socket: { remoteAddress: '127.0.0.1' },
    headers: {},
    params: {},
    body: {},
    ...overrides,
  }
}

function createRes() {
  const headers = new Map()
  return {
    statusCode: 200,
    body: null,
    setHeader(name, value) {
      headers.set(name.toLowerCase(), String(value))
    },
    getHeader(name) {
      return headers.get(name.toLowerCase())
    },
    status(code) {
      this.statusCode = code
      return this
    },
    json(payload) {
      this.body = payload
      return this
    },
  }
}

function runMiddleware(middleware, req, res) {
  return new Promise((resolve, reject) => {
    Promise.resolve(middleware(req, res, (error) => {
      if (error) reject(error)
      else resolve('next')
    })).then((result) => {
      if (result !== undefined) resolve(result)
    }, reject)
  })
}

beforeEach(() => {
  process.env.RATE_LIMIT_STORE = 'memory'
  resetRateLimitBucketsForTests()
})

test('requestContext preserves incoming request id and exposes it', async () => {
  const req = createReq({ headers: { 'x-request-id': 'client-request-1' } })
  const res = createRes()

  await runMiddleware(requestContext, req, res)

  assert.equal(req.requestId, 'client-request-1')
  assert.equal(res.getHeader('X-Request-Id'), 'client-request-1')
})

test('publicAntiScrapingHeaders marks public responses no-store and noindex', async () => {
  const req = createReq()
  const res = createRes()

  await runMiddleware(publicAntiScrapingHeaders, req, res)

  assert.equal(res.getHeader('Cache-Control'), 'no-store, max-age=0')
  assert.equal(res.getHeader('Pragma'), 'no-cache')
  assert.equal(res.getHeader('X-Robots-Tag'), 'noindex, nofollow, noarchive')
})

test('rate limiter blocks progressively after repeated violations', async () => {
  const limiter = createRateLimit({
    name: 'test-progressive',
    windowMs: 60_000,
    max: 1,
    blockMs: 1_000,
    maxBlockMs: 10_000,
    keyParts: () => ['same-user'],
  })

  const firstReq = createReq()
  const firstRes = createRes()
  await runMiddleware(limiter, firstReq, firstRes)
  assert.equal(firstRes.statusCode, 200)
  assert.equal(firstRes.getHeader('X-RateLimit-Remaining'), '0')

  const secondReq = createReq()
  const secondRes = createRes()
  await runMiddleware(limiter, secondReq, secondRes)
  assert.equal(secondRes.statusCode, 429)
  assert.equal(secondRes.getHeader('Retry-After'), '1')
})

test('public validation rejects malformed tokens and oversized answers', () => {
  assert.equal(isValidPublicToken('short'), false)
  assert.equal(isValidPublicToken('abcdefghijklmnopqrstuvwxyz_1234567890'), true)
  assert.equal(normalizeEmail(' USER@Example.COM '), 'user@example.com')
  assert.equal(normalizeEmail('not-an-email'), '')
  assert.equal(normalizeText('  hello  ', 4), 'hell')
  assert.equal(normalizeOptionalSafeId('../bad'), null)
  assert.equal(normalizeOptionalSafeId('section-1'), 'section-1')

  const tooManyAnswers = Object.fromEntries(
    Array.from({ length: 101 }, (_, index) => [`q${index}`, 'a'])
  )
  assert.deepEqual(validateAnswersPayload(tooManyAnswers), {
    ok: false,
    error: 'answers tiene demasiados campos',
  })
})
