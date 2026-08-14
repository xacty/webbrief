import assert from 'node:assert/strict'
import { test } from 'node:test'
import { evaluateQuota, summarizeUsage } from '../src/lib/storageQuota.js'

test('summarizeUsage: separa activos y papelera, ignora tamaños inválidos', () => {
  const rows = [
    { file_size: 1000, trashed_at: null },
    { file_size: 2000, trashed_at: '2026-07-01T00:00:00Z' },
    { file_size: null, trashed_at: null },
  ]
  const usage = summarizeUsage(rows)
  assert.equal(usage.usedBytes, 3000)
  assert.equal(usage.activeBytes, 1000)
  assert.equal(usage.trashedBytes, 2000)
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

test('summarizeUsage: desglose por categoría con precedencia papelera > brief > biblioteca > documentos', () => {
  const rows = [
    // biblioteca (sin proyecto, subida por usuario)
    { file_size: 1000, trashed_at: null, project_id: null, uploaded_by: 'u1' },
    // en documentos (proyecto + usuario)
    { file_size: 2000, trashed_at: null, project_id: 'p1', uploaded_by: 'u1' },
    // adjunto de brief (público, sin usuario)
    { file_size: 4000, trashed_at: null, project_id: 'p1', uploaded_by: null },
    // papelera gana aunque sea de biblioteca
    { file_size: 8000, trashed_at: '2026-08-01T00:00:00Z', project_id: null, uploaded_by: 'u1' },
  ]
  const usage = summarizeUsage(rows)
  assert.equal(usage.libraryBytes, 1000)
  assert.equal(usage.documentBytes, 2000)
  assert.equal(usage.briefBytes, 4000)
  assert.equal(usage.trashedBytes, 8000)
  assert.equal(usage.usedBytes, 15000)
  assert.deepEqual(usage.counts, { library: 1, document: 1, brief: 1, trashed: 1 })
})

test('summarizeUsage: brief en papelera cuenta como papelera, no como brief', () => {
  const usage = summarizeUsage([
    { file_size: 500, trashed_at: '2026-08-01T00:00:00Z', project_id: 'p1', uploaded_by: null },
  ])
  assert.equal(usage.trashedBytes, 500)
  assert.equal(usage.briefBytes, 0)
})

test('summarizeUsage: campos legacy activeBytes/usedBytes se mantienen', () => {
  const usage = summarizeUsage([
    { file_size: 300, trashed_at: null, project_id: null, uploaded_by: 'u1' },
    { file_size: 700, trashed_at: '2026-08-01T00:00:00Z', project_id: 'p1', uploaded_by: 'u1' },
  ])
  assert.equal(usage.activeBytes, 300)
  assert.equal(usage.usedBytes, 1000)
})
