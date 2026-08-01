import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  decideUploadConversion,
  buildIngestPreTransform,
  adjustFileNameForAction,
  mimeTypeForAction,
  uploadWithIngest,
  MAX_INGEST_WIDTH,
  PHOTO_WEBP_QUALITY,
} from '../src/lib/imageIngest.js'

const MB = 1024 * 1024

test('decideUploadConversion: fotos van a webp, png a resize, gif/svg passthrough', () => {
  assert.deepEqual(decideUploadConversion({ mimeType: 'image/jpeg', size: 10 * MB }), { ok: true, action: 'photo-webp' })
  assert.deepEqual(decideUploadConversion({ mimeType: 'image/webp', size: 5 * MB }), { ok: true, action: 'photo-webp' })
  assert.deepEqual(decideUploadConversion({ mimeType: 'image/png', size: 2 * MB }), { ok: true, action: 'png-resize' })
  assert.deepEqual(decideUploadConversion({ mimeType: 'image/gif', size: 1 * MB }), { ok: true, action: 'passthrough' })
  assert.deepEqual(decideUploadConversion({ mimeType: 'image/svg+xml', size: 100 }), { ok: true, action: 'passthrough' })
})

test('decideUploadConversion: rechaza mime no soportado y tamaño excedido', () => {
  assert.deepEqual(decideUploadConversion({ mimeType: 'image/heic', size: 1 * MB }), { ok: false, reason: 'unsupported_mime' })
  assert.deepEqual(decideUploadConversion({ mimeType: 'application/pdf', size: 1 * MB }), { ok: false, reason: 'unsupported_mime' })
  assert.deepEqual(decideUploadConversion({ mimeType: 'image/jpeg', size: 31 * MB }), { ok: false, reason: 'size_exceeded' })
})

test('buildIngestPreTransform: cadenas con caja at_max (sin upscale)', () => {
  assert.equal(
    buildIngestPreTransform('photo-webp'),
    `w-${MAX_INGEST_WIDTH},h-${MAX_INGEST_WIDTH},c-at_max,f-webp,q-${PHOTO_WEBP_QUALITY}`
  )
  assert.equal(buildIngestPreTransform('png-resize'), `w-${MAX_INGEST_WIDTH},h-${MAX_INGEST_WIDTH},c-at_max`)
  assert.equal(buildIngestPreTransform('passthrough'), null)
})

test('adjustFileNameForAction: solo las fotos cambian a .webp', () => {
  assert.equal(adjustFileNameForAction('foto vacaciones.JPG', 'photo-webp'), 'foto vacaciones.webp')
  assert.equal(adjustFileNameForAction('logo.png', 'png-resize'), 'logo.png')
  assert.equal(adjustFileNameForAction('anim.gif', 'passthrough'), 'anim.gif')
  assert.equal(adjustFileNameForAction('', 'photo-webp'), 'imagen.webp')
})

test('mimeTypeForAction: solo fotos reportan image/webp', () => {
  assert.equal(mimeTypeForAction('image/jpeg', 'photo-webp'), 'image/webp')
  assert.equal(mimeTypeForAction('image/png', 'png-resize'), 'image/png')
  assert.equal(mimeTypeForAction('image/gif', 'passthrough'), 'image/gif')
})

test('uploadWithIngest: pasa pre-transformación y nombre ajustado al uploader', async () => {
  const calls = []
  const fakeUpload = async (args) => {
    calls.push(args)
    return { fileId: 'f1', url: 'https://ik/x.webp', filePath: '/x.webp', size: 300000, width: 2560, height: 1700, fileType: 'image' }
  }
  const result = await uploadWithIngest({
    buffer: Buffer.from('img'),
    fileName: 'abc-foto.jpg',
    folder: '/companies/c1/projects/p1',
    tags: ['project-asset'],
    mimeType: 'image/jpeg',
    size: 4 * MB,
    uploadFn: fakeUpload,
  })
  assert.equal(calls.length, 1)
  assert.equal(calls[0].preTransformation, `w-2560,h-2560,c-at_max,f-webp,q-80`)
  assert.equal(calls[0].fileName, 'abc-foto.webp')
  assert.equal(result.ok, true)
  assert.equal(result.converted, true)
  assert.equal(result.mimeType, 'image/webp')
  assert.equal(result.upload.fileId, 'f1')
})

test('uploadWithIngest: passthrough no manda pre-transformación', async () => {
  const calls = []
  const fakeUpload = async (args) => { calls.push(args); return { fileId: 'f2' } }
  const result = await uploadWithIngest({
    buffer: Buffer.from('<svg/>'),
    fileName: 'logo.svg',
    folder: '/f',
    tags: [],
    mimeType: 'image/svg+xml',
    size: 1000,
    uploadFn: fakeUpload,
  })
  assert.equal(calls[0].preTransformation, null)
  assert.equal(calls[0].fileName, 'logo.svg')
  assert.equal(result.converted, false)
})

test('uploadWithIngest: rechazo no llama al uploader', async () => {
  let called = false
  const result = await uploadWithIngest({
    buffer: Buffer.alloc(10),
    fileName: 'x.tiff',
    folder: '/f',
    tags: [],
    mimeType: 'image/tiff',
    size: 1000,
    uploadFn: async () => { called = true },
  })
  assert.equal(result.ok, false)
  assert.equal(result.reason, 'unsupported_mime')
  assert.equal(called, false)
})
