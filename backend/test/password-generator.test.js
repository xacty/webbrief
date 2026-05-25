import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  generateSecurePassword,
  __charset,
} from '../src/lib/passwordGenerator.js'

test('generateSecurePassword: default length 16', () => {
  const pw = generateSecurePassword()
  assert.equal(pw.length, 16)
})

test('generateSecurePassword: respects custom length', () => {
  const pw = generateSecurePassword(24)
  assert.equal(pw.length, 24)
})

test('generateSecurePassword: minimum length 8 enforced', () => {
  const pw = generateSecurePassword(3)
  assert.equal(pw.length, 8)
})

test('generateSecurePassword: every char from charset', () => {
  const pw = generateSecurePassword(50)
  for (const ch of pw) {
    assert.ok(__charset.includes(ch), `unexpected char: ${ch}`)
  }
})

test('generateSecurePassword: charset excludes confusing chars 0/O/o/1/l/I', () => {
  for (const ch of '0Oo1lI') {
    assert.equal(
      __charset.includes(ch),
      false,
      `charset should NOT include ${ch}`,
    )
  }
})

test('generateSecurePassword: two consecutive calls differ', () => {
  const a = generateSecurePassword(32)
  const b = generateSecurePassword(32)
  assert.notEqual(a, b)
})
