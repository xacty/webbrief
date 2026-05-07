import assert from 'node:assert/strict'
import { test } from 'node:test'
import { diffSeoMetadata } from '../src/lib/projectAccess.js'

test('diffSeoMetadata returns empty when nothing changed', () => {
  const prev = { titleTag: 'Hello', metaDescription: 'World', urlSlug: 'home' }
  const next = { titleTag: 'Hello', metaDescription: 'World', urlSlug: 'home' }
  const { changes, previousValues, nextValues } = diffSeoMetadata(prev, next)
  assert.deepEqual(changes, [])
  assert.deepEqual(previousValues, {})
  assert.deepEqual(nextValues, {})
})

test('diffSeoMetadata detects single field change', () => {
  const prev = { titleTag: 'Hello', metaDescription: 'World', urlSlug: 'home' }
  const next = { titleTag: 'Hello v2', metaDescription: 'World', urlSlug: 'home' }
  const { changes, previousValues, nextValues } = diffSeoMetadata(prev, next)
  assert.deepEqual(changes, ['seo_title_changed'])
  assert.deepEqual(previousValues, { titleTag: 'Hello' })
  assert.deepEqual(nextValues, { titleTag: 'Hello v2' })
})

test('diffSeoMetadata detects multiple field changes', () => {
  const prev = { titleTag: 'A', metaDescription: 'B', urlSlug: 'c' }
  const next = { titleTag: 'A', metaDescription: 'B-updated', urlSlug: 'd' }
  const { changes } = diffSeoMetadata(prev, next)
  assert.deepEqual(changes.sort(), ['seo_description_changed', 'seo_slug_changed'].sort())
})

test('diffSeoMetadata treats missing/empty as equivalent', () => {
  const { changes } = diffSeoMetadata({}, { titleTag: '' })
  assert.deepEqual(changes, [])
})

test('diffSeoMetadata detects empty-to-non-empty as change', () => {
  const { changes, previousValues, nextValues } = diffSeoMetadata({}, { titleTag: 'New' })
  assert.deepEqual(changes, ['seo_title_changed'])
  assert.equal(previousValues.titleTag, '')
  assert.equal(nextValues.titleTag, 'New')
})

test('diffSeoMetadata ignores unknown fields', () => {
  const { changes } = diffSeoMetadata({ extra: 'x' }, { extra: 'y', titleTag: 'A' })
  // Only known fields trigger change events
  assert.deepEqual(changes, ['seo_title_changed'])
})
