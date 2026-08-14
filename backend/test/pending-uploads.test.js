import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  isPendingUploadSrc,
  stripPendingUploadImagesFromHtml,
  stripPendingUploadImagesFromJson,
  countPendingUploadImages,
} from '../../frontend/src/lib/pendingUploads.js'

// Caso real que motivó el módulo: una propuesta en Prod quedó con
// src="blob:https://webrief.app/8159f4e3-…" — object URL muerto, imagen perdida.
const BLOB = 'blob:https://webrief.app/8159f4e3-37f5-4ca7-8246-427ec5860a98'
const REAL = 'https://ik.imagekit.io/webrief/companies/c1/projects/p1/asset-IMG_2542.webp'

// -------- 1. isPendingUploadSrc --------

test('isPendingUploadSrc: solo blob:, tolerante a espacios y mayúsculas', () => {
  assert.equal(isPendingUploadSrc(BLOB), true)
  assert.equal(isPendingUploadSrc('  blob:x  '), true)
  assert.equal(isPendingUploadSrc('BLOB:x'), true)
  assert.equal(isPendingUploadSrc(REAL), false)
  // data: es contenido real (auto-contenido, sobrevive al reload) — no se filtra.
  assert.equal(isPendingUploadSrc('data:image/png;base64,iVBOR'), false)
  assert.equal(isPendingUploadSrc(''), false)
  assert.equal(isPendingUploadSrc(null), false)
  assert.equal(isPendingUploadSrc(undefined), false)
})

// -------- 2. strip sobre HTML --------

test('stripPendingUploadImagesFromHtml: elimina el img con blob y conserva el resto intacto', () => {
  const html = `<p>hola</p><img src="${BLOB}" alt="IMG_2542.webp"><p>chau</p><img src="${REAL}" alt="ok">`
  const result = stripPendingUploadImagesFromHtml(html)
  assert.equal(result, `<p>hola</p><p>chau</p><img src="${REAL}" alt="ok">`)
})

test('stripPendingUploadImagesFromHtml: no toca html sin placeholders (identidad)', () => {
  const html = `<p>hola</p><img src="${REAL}">`
  assert.equal(stripPendingUploadImagesFromHtml(html), html)
  assert.equal(stripPendingUploadImagesFromHtml(''), '')
  assert.equal(stripPendingUploadImagesFromHtml(null), '')
})

test('stripPendingUploadImagesFromHtml: quote-aware — un ">" dentro de un atributo no corta el tag', () => {
  const html = `<img alt="a > b" src="${BLOB}"><p>queda</p>`
  assert.equal(stripPendingUploadImagesFromHtml(html), '<p>queda</p>')
})

test('stripPendingUploadImagesFromHtml: conserva imágenes reales cuyo alt menciona blob:', () => {
  const html = `<img src="${REAL}" alt="captura de blob:https://foo"><p>x</p>`
  assert.equal(stripPendingUploadImagesFromHtml(html), html)
})

test('stripPendingUploadImagesFromHtml: elimina varios placeholders y respeta el divider de sección', () => {
  const divider = '<div data-section-divider data-section-id="s1" data-section-name="Galería"></div>'
  const html = `${divider}<img src="${BLOB}"><img src="${REAL}"><img src="${BLOB}2">`
  assert.equal(stripPendingUploadImagesFromHtml(html), `${divider}<img src="${REAL}">`)
})

// -------- 3. strip sobre JSON de TipTap --------

test('stripPendingUploadImagesFromJson: descarta el nodo image con blob en profundidad', () => {
  const json = {
    type: 'doc',
    content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'hola' }] },
      { type: 'image', attrs: { src: BLOB, alt: 'pendiente' } },
      { type: 'image', attrs: { src: REAL, alt: 'ok' } },
    ],
  }
  const result = stripPendingUploadImagesFromJson(json)
  assert.equal(result.content.length, 2)
  assert.equal(result.content[1].attrs.src, REAL)
  // No muta el original.
  assert.equal(json.content.length, 3)
})

test('stripPendingUploadImagesFromJson: identidad referencial cuando no hay nada que limpiar', () => {
  const json = { type: 'doc', content: [{ type: 'image', attrs: { src: REAL } }] }
  assert.equal(stripPendingUploadImagesFromJson(json), json)
})

test('stripPendingUploadImagesFromJson: nodo que queda vacío pierde la clave content', () => {
  const json = { type: 'doc', content: [{ type: 'image', attrs: { src: BLOB } }] }
  const result = stripPendingUploadImagesFromJson(json)
  assert.equal('content' in result, false)
  assert.equal(result.type, 'doc')
})

test('stripPendingUploadImagesFromJson: entradas no-objeto pasan de largo', () => {
  assert.equal(stripPendingUploadImagesFromJson(null), null)
  assert.equal(stripPendingUploadImagesFromJson(undefined), undefined)
  const leaf = { type: 'text', text: 'x' }
  assert.equal(stripPendingUploadImagesFromJson(leaf), leaf)
})

// -------- 4. count --------

test('countPendingUploadImages: cuenta solo placeholders', () => {
  assert.equal(countPendingUploadImages(`<img src="${BLOB}"><img src="${REAL}"><img src="${BLOB}b">`), 2)
  assert.equal(countPendingUploadImages(`<img src="${REAL}">`), 0)
  assert.equal(countPendingUploadImages(''), 0)
  assert.equal(countPendingUploadImages(null), 0)
})
