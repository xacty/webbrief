import assert from 'node:assert/strict'
import { test } from 'node:test'
import { EDIT_WINDOW_MS, isUuid, sanitizeMentions, serializeComment } from '../src/routes/comments.js'

test('isUuid accepts valid v4-style UUID', () => {
  assert.equal(isUuid('11111111-2222-3333-4444-555555555555'), true)
  assert.equal(isUuid('AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE'), true)
})

test('isUuid rejects non-UUID strings', () => {
  assert.equal(isUuid(''), false)
  assert.equal(isUuid('not-a-uuid'), false)
  assert.equal(isUuid('11111111-2222-3333-4444-55555555555'), false)
  assert.equal(isUuid(null), false)
  assert.equal(isUuid(undefined), false)
  assert.equal(isUuid(42), false)
})

test('sanitizeMentions filters invalid uuids and unknown members', () => {
  const allowed = new Set([
    '11111111-1111-1111-1111-111111111111',
    '22222222-2222-2222-2222-222222222222',
  ])
  const input = [
    '11111111-1111-1111-1111-111111111111',
    'bad-id',
    '99999999-9999-9999-9999-999999999999', // not in allowed
    '22222222-2222-2222-2222-222222222222',
    '11111111-1111-1111-1111-111111111111', // duplicate
  ]
  assert.deepEqual(sanitizeMentions(input, allowed), [
    '11111111-1111-1111-1111-111111111111',
    '22222222-2222-2222-2222-222222222222',
  ])
})

test('sanitizeMentions returns empty for non-array input', () => {
  assert.deepEqual(sanitizeMentions(undefined, new Set()), [])
  assert.deepEqual(sanitizeMentions(null, new Set()), [])
  assert.deepEqual(sanitizeMentions('not-array', new Set()), [])
})

test('sanitizeMentions caps at 20 mentions', () => {
  const allowed = new Set()
  const input = []
  for (let i = 0; i < 25; i++) {
    const hex = i.toString(16).padStart(2, '0')
    const id = `${hex}${hex}${hex}${hex}-1111-1111-1111-111111111111`
    allowed.add(id)
    input.push(id)
  }
  assert.equal(sanitizeMentions(input, allowed).length, 20)
})

test('serializeComment hides body when soft-deleted', () => {
  const row = {
    id: 'c1',
    project_id: 'p1',
    page_id: 'pg1',
    section_id: null,
    parent_comment_id: null,
    anchor_snippet: 'hola',
    mentions: ['u1'],
    actor_user_id: 'u0',
    author_name: 'Alice',
    author_email: 'alice@example.com',
    body: 'Original body',
    source: 'app',
    status: 'open',
    resolved_at: null,
    resolved_by_user_id: null,
    edited_at: null,
    deleted_at: '2026-05-07T10:00:00Z',
    deleted_by_user_id: 'u0',
    created_at: '2026-05-07T09:00:00Z',
    updated_at: '2026-05-07T10:00:00Z',
  }
  const out = serializeComment(row)
  assert.equal(out.body, '')
  assert.equal(out.deletedAt, '2026-05-07T10:00:00Z')
  assert.equal(out.authorName, 'Alice')
})

test('serializeComment maps snake_case to camelCase', () => {
  const row = {
    id: 'c1',
    project_id: 'p1',
    page_id: 'pg1',
    section_id: 's1',
    parent_comment_id: 'root1',
    anchor_snippet: 'snippet',
    mentions: ['u1', 'u2'],
    actor_user_id: 'u0',
    author_name: 'Bob',
    author_email: 'bob@example.com',
    body: 'Hello',
    source: 'app',
    status: 'open',
    resolved_at: null,
    resolved_by_user_id: null,
    edited_at: '2026-05-07T11:00:00Z',
    deleted_at: null,
    deleted_by_user_id: null,
    created_at: '2026-05-07T09:00:00Z',
    updated_at: '2026-05-07T11:00:00Z',
  }
  const out = serializeComment(row)
  assert.equal(out.id, 'c1')
  assert.equal(out.projectId, 'p1')
  assert.equal(out.pageId, 'pg1')
  assert.equal(out.sectionId, 's1')
  assert.equal(out.parentCommentId, 'root1')
  assert.equal(out.anchorSnippet, 'snippet')
  assert.deepEqual(out.mentions, ['u1', 'u2'])
  assert.equal(out.body, 'Hello')
  assert.equal(out.editedAt, '2026-05-07T11:00:00Z')
})

test('serializeComment returns null for null input', () => {
  assert.equal(serializeComment(null), null)
})

test('EDIT_WINDOW_MS is 15 minutes', () => {
  assert.equal(EDIT_WINDOW_MS, 15 * 60 * 1000)
})
