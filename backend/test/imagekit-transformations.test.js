import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildImageKitTransformations } from '../src/lib/imagekit.js'

test('keeps legacy behavior: width/height/fit/format/quality', () => {
  const t = buildImageKitTransformations({
    width: 1600,
    height: 900,
    fit: 'at_max',
    format: 'webp',
    quality: 85,
  })
  assert.deepEqual(t, ['w-1600', 'h-900', 'c-at_max', 'f-webp', 'q-85'])
})

test('empty options produce no transformations', () => {
  assert.deepEqual(buildImageKitTransformations({}), [])
  assert.deepEqual(buildImageKitTransformations(), [])
})

test('emits crop region params: cropMode + x/y', () => {
  const t = buildImageKitTransformations({
    width: 400,
    height: 300,
    cropMode: 'extract',
    x: 120,
    y: 0,
  })
  assert.deepEqual(t, ['w-400', 'h-300', 'cm-extract', 'x-120', 'y-0'])
})

test('x/y accept 0 but reject negatives and non-numbers', () => {
  const withZero = buildImageKitTransformations({ x: 0, y: 0 })
  assert.deepEqual(withZero, ['x-0', 'y-0'])

  const invalid = buildImageKitTransformations({ x: -5, y: 'nope' })
  assert.deepEqual(invalid, [])
})

test('emits focus param', () => {
  const t = buildImageKitTransformations({ width: 800, height: 800, focus: 'face' })
  assert.deepEqual(t, ['w-800', 'h-800', 'fo-face'])
})

test('rounds fractional dimensions and offsets', () => {
  const t = buildImageKitTransformations({ width: 100.6, x: 10.4 })
  assert.deepEqual(t, ['w-101', 'x-10'])
})
