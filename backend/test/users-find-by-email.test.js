import assert from 'node:assert/strict'
import { test } from 'node:test'
import { findAuthUserByEmailPaginated } from '../src/lib/users.js'

function makeMockClient({ pages }) {
  let calls = 0
  return {
    auth: {
      admin: {
        async listUsers({ page, perPage }) {
          calls += 1
          const idx = (page - 1)
          if (idx >= pages.length) return { data: { users: [] }, error: null }
          return { data: { users: pages[idx] }, error: null }
        },
      },
    },
    _getCalls: () => calls,
  }
}

test('findAuthUserByEmailPaginated: finds in first page', async () => {
  const client = makeMockClient({
    pages: [[
      { id: 'u1', email: 'foo@example.com' },
      { id: 'u2', email: 'bar@example.com' },
    ]],
  })
  const result = await findAuthUserByEmailPaginated(client, 'bar@example.com')
  assert.equal(result.id, 'u2')
  assert.equal(client._getCalls(), 1)
})

test('findAuthUserByEmailPaginated: paginates and finds on page 3', async () => {
  const page1 = Array.from({ length: 200 }, (_, i) => ({ id: `p1u${i}`, email: `p1u${i}@x.com` }))
  const page2 = Array.from({ length: 200 }, (_, i) => ({ id: `p2u${i}`, email: `p2u${i}@x.com` }))
  const page3 = [{ id: 'target', email: 'WANTED@example.com' }]
  const client = makeMockClient({ pages: [page1, page2, page3] })

  const result = await findAuthUserByEmailPaginated(client, 'wanted@example.com')
  assert.equal(result.id, 'target')
  assert.equal(client._getCalls(), 3)
})

test('findAuthUserByEmailPaginated: returns null when not found', async () => {
  const client = makeMockClient({
    pages: [[{ id: 'u1', email: 'other@example.com' }]],
  })
  const result = await findAuthUserByEmailPaginated(client, 'missing@example.com')
  assert.equal(result, null)
})

test('findAuthUserByEmailPaginated: handles empty pages', async () => {
  const client = makeMockClient({ pages: [] })
  const result = await findAuthUserByEmailPaginated(client, 'any@example.com')
  assert.equal(result, null)
})

test('findAuthUserByEmailPaginated: matches case-insensitively', async () => {
  const client = makeMockClient({
    pages: [[{ id: 'u1', email: 'MixedCase@Example.COM' }]],
  })
  const result = await findAuthUserByEmailPaginated(client, 'mixedcase@example.com')
  assert.equal(result.id, 'u1')
})
