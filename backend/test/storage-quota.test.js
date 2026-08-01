import assert from 'node:assert/strict'
import { test } from 'node:test'
import { evaluateQuota, summarizeUsage } from '../src/lib/storageQuota.js'

test('summarizeUsage: separa activos y papelera, ignora tamaños inválidos', () => {
  const rows = [
    { file_size: 1000, trashed_at: null },
    { file_size: 2000, trashed_at: '2026-07-01T00:00:00Z' },
    { file_size: null, trashed_at: null },
  ]
  assert.deepEqual(summarizeUsage(rows), { usedBytes: 3000, activeBytes: 1000, trashedBytes: 2000 })
})

test('evaluateQuota: permite bajo cuota, bloquea al llegar', () => {
  const mb = 1024 * 1024
  assert.equal(evaluateQuota({ usedBytes: 50 * mb, quotaMb: 100 }).allowed, true)
  const full = evaluateQuota({ usedBytes: 100 * mb, quotaMb: 100 })
  assert.equal(full.allowed, false)
  assert.equal(full.code, 'quota_exceeded')
})

test('evaluateQuota: overshoot de un solo archivo permitido si aún hay espacio', () => {
  const mb = 1024 * 1024
  // 99 MB usados + entrante 5 MB → permitido (el check es "uso actual < cuota")
  assert.equal(evaluateQuota({ usedBytes: 99 * mb, quotaMb: 100, incomingBytes: 5 * mb }).allowed, true)
})

test('evaluateQuota: cuota inválida o faltante usa default 100', () => {
  const mb = 1024 * 1024
  assert.equal(evaluateQuota({ usedBytes: 150 * mb, quotaMb: null }).allowed, false)
  assert.equal(evaluateQuota({ usedBytes: 50 * mb, quotaMb: 0 }).allowed, true)
})
