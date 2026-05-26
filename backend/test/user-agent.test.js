import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  parseUserAgent,
  formatDeviceLabel,
  maskIp,
} from '../src/lib/userAgent.js'

// -------------------- parseUserAgent --------------------

test('parseUserAgent: Chrome on macOS', () => {
  const ua =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
  const { browser, os } = parseUserAgent(ua)
  assert.equal(browser, 'Chrome 121')
  assert.equal(os, 'macOS')
})

test('parseUserAgent: Safari iOS', () => {
  const ua =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
  const { browser, os } = parseUserAgent(ua)
  assert.equal(browser, 'Safari 17')
  assert.equal(os, 'iOS')
})

test('parseUserAgent: Firefox on Linux', () => {
  const ua = 'Mozilla/5.0 (X11; Linux x86_64; rv:123.0) Gecko/20100101 Firefox/123.0'
  const { browser, os } = parseUserAgent(ua)
  assert.equal(browser, 'Firefox 123')
  assert.equal(os, 'Linux')
})

test('parseUserAgent: Edge on Windows is NOT misidentified as Chrome', () => {
  const ua =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36 Edg/121.0.0.0'
  const { browser, os } = parseUserAgent(ua)
  assert.equal(browser, 'Edge 121')
  assert.equal(os, 'Windows')
})

test('parseUserAgent: empty/garbage UA → Desconocido / Otro', () => {
  assert.deepEqual(parseUserAgent(''), { browser: 'Desconocido', os: 'Desconocido' })
  assert.deepEqual(parseUserAgent(null), { browser: 'Desconocido', os: 'Desconocido' })
  const garbage = parseUserAgent('curl/8.0.0')
  assert.equal(garbage.browser, 'Otro')
  assert.equal(garbage.os, 'Otro')
})

test('formatDeviceLabel: combines browser and os', () => {
  const label = formatDeviceLabel(
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/121.0.0.0',
  )
  assert.equal(label, 'Chrome 121 · macOS')
})

// -------------------- maskIp --------------------

test('maskIp: v4 masks last two octets', () => {
  assert.equal(maskIp('192.168.1.100'), '192.168.*.*')
  assert.equal(maskIp('10.0.5.42'), '10.0.*.*')
})

test('maskIp: v6 masks tail', () => {
  assert.equal(maskIp('2001:db8::1234'), '2001:db8:***')
})

test('maskIp: empty / non-string returns empty', () => {
  assert.equal(maskIp(''), '')
  assert.equal(maskIp(null), '')
  assert.equal(maskIp(undefined), '')
})

test('maskIp: malformed v4 returns input unchanged', () => {
  assert.equal(maskIp('not.an.ip'), 'not.an.ip')
})
