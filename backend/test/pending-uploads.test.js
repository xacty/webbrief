import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  isPendingUploadSrc,
  stripPendingUploadImagesFromHtml,
  stripPendingUploadImagesFromJson,
  countPendingUploadImages,
  hasPendingUpload,
  replacePendingUploadInHtml,
  replacePendingUploadInJson,
  removePendingUploadFromHtml,
  removePendingUploadFromJson,
  stripPendingUploadsFromPages,
  imageAttrsFromAsset,
  keepLocalPlaceholderContent,
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

// -------- 5. hasPendingUpload --------

test('hasPendingUpload: encuentra el placeholder exacto en HTML', () => {
  const html = `<p>hola</p><img src="${BLOB}" alt="a.png">`
  assert.equal(hasPendingUpload(html, BLOB), true)
})

test('hasPendingUpload: no confunde un tempUrl distinto ni uno que solo aparece en el alt', () => {
  const html = `<img src="${REAL}" alt="captura de ${BLOB}">`
  assert.equal(hasPendingUpload(html, BLOB), false)
  assert.equal(hasPendingUpload(html, REAL), true)
})

test('hasPendingUpload: recorre JSON de TipTap en profundidad', () => {
  const json = {
    type: 'doc',
    content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'hola' }] },
      { type: 'image', attrs: { src: BLOB } },
    ],
  }
  assert.equal(hasPendingUpload(json, BLOB), true)
  assert.equal(hasPendingUpload(json, REAL), false)
})

test('hasPendingUpload: entradas vacías/nulas no rompen', () => {
  assert.equal(hasPendingUpload('', BLOB), false)
  assert.equal(hasPendingUpload(null, BLOB), false)
  assert.equal(hasPendingUpload(undefined, BLOB), false)
  assert.equal(hasPendingUpload('<img src="x">', ''), false)
  assert.equal(hasPendingUpload('<img src="x">', null), false)
})

// -------- 6. imageAttrsFromAsset --------

test('imageAttrsFromAsset: mapea el shape del asset recién subido', () => {
  const asset = {
    id: 'asset-1',
    publicUrl: REAL,
    fileName: 'IMG_2542.webp',
    path: 'companies/c1/projects/p1/asset-IMG_2542.webp',
    width: 1200,
    height: 800,
  }
  assert.deepEqual(imageAttrsFromAsset(asset, 'fallback.png'), {
    src: REAL,
    assetId: 'asset-1',
    fileName: 'IMG_2542.webp',
    storagePath: 'companies/c1/projects/p1/asset-IMG_2542.webp',
    originalWidth: 1200,
    originalHeight: 800,
  })
})

test('imageAttrsFromAsset: null-safe — asset incompleto no tira, usa el fallback de nombre', () => {
  assert.deepEqual(imageAttrsFromAsset(null, 'archivo.png'), {
    src: '',
    assetId: null,
    fileName: 'archivo.png',
    storagePath: null,
    originalWidth: null,
    originalHeight: null,
  })
  assert.deepEqual(imageAttrsFromAsset({}, ''), {
    src: '',
    assetId: null,
    fileName: '',
    storagePath: null,
    originalWidth: null,
    originalHeight: null,
  })
})

// -------- 7. replacePendingUploadInHtml --------

test('replacePendingUploadInHtml: reemplaza src y agrega los data-* del asset', () => {
  const html = `<p>hola</p><img src="${BLOB}" alt="IMG_2542.webp"><p>chau</p>`
  const attrs = imageAttrsFromAsset({
    id: 'asset-1',
    publicUrl: REAL,
    fileName: 'IMG_2542.webp',
    path: 'p/asset.webp',
    width: 100,
    height: 50,
  })
  const result = replacePendingUploadInHtml(html, BLOB, attrs)
  assert.equal(
    result,
    `<p>hola</p><img src="${REAL}" alt="IMG_2542.webp" data-asset-id="asset-1" data-file-name="IMG_2542.webp" data-storage-path="p/asset.webp" data-original-width="100" data-original-height="50"><p>chau</p>`
  )
})

test('replacePendingUploadInHtml: no toca otras imágenes ni placeholders con otro tempUrl', () => {
  const otherBlob = `${BLOB}-other`
  const html = `<img src="${otherBlob}"><img src="${REAL}">`
  assert.equal(replacePendingUploadInHtml(html, BLOB, { src: REAL }), html)
})

test('replacePendingUploadInHtml: identidad cuando el tempUrl no está o falta', () => {
  const html = `<p>hola</p>`
  assert.equal(replacePendingUploadInHtml(html, BLOB, { src: REAL }), html)
  assert.equal(replacePendingUploadInHtml('', BLOB, { src: REAL }), '')
  assert.equal(replacePendingUploadInHtml(html, '', { src: REAL }), html)
})

// -------- 8. replacePendingUploadInJson --------

test('replacePendingUploadInJson: mergea attrs + src en el nodo image, sin mutar el original', () => {
  const json = {
    type: 'doc',
    content: [{ type: 'image', attrs: { src: BLOB, alt: 'IMG_2542.webp' } }],
  }
  const attrs = imageAttrsFromAsset({ id: 'asset-1', publicUrl: REAL, path: 'p/a.webp' })
  const result = replacePendingUploadInJson(json, BLOB, attrs)
  assert.equal(result.content[0].attrs.src, REAL)
  assert.equal(result.content[0].attrs.assetId, 'asset-1')
  assert.equal(result.content[0].attrs.alt, 'IMG_2542.webp')
  assert.equal(json.content[0].attrs.src, BLOB) // no mutó el original
})

test('replacePendingUploadInJson: identidad referencial cuando el tempUrl no está', () => {
  const json = { type: 'doc', content: [{ type: 'image', attrs: { src: REAL } }] }
  assert.equal(replacePendingUploadInJson(json, BLOB, { src: REAL }), json)
})

// -------- 9. removePendingUploadFromHtml / removePendingUploadFromJson --------

test('removePendingUploadFromHtml: quita solo el placeholder del tempUrl indicado', () => {
  const html = `<img src="${BLOB}"><img src="${BLOB}2"><img src="${REAL}">`
  assert.equal(removePendingUploadFromHtml(html, BLOB), `<img src="${BLOB}2"><img src="${REAL}">`)
})

test('removePendingUploadFromHtml: identidad cuando no está', () => {
  const html = `<img src="${REAL}">`
  assert.equal(removePendingUploadFromHtml(html, BLOB), html)
  assert.equal(removePendingUploadFromHtml('', BLOB), '')
})

test('removePendingUploadFromJson: descarta solo el nodo con ese tempUrl, sin mutar el original', () => {
  const json = {
    type: 'doc',
    content: [
      { type: 'image', attrs: { src: BLOB } },
      { type: 'image', attrs: { src: REAL } },
    ],
  }
  const result = removePendingUploadFromJson(json, BLOB)
  assert.equal(result.content.length, 1)
  assert.equal(result.content[0].attrs.src, REAL)
  assert.equal(json.content.length, 2)
})

test('removePendingUploadFromJson: nodo que queda vacío pierde la clave content', () => {
  const json = { type: 'doc', content: [{ type: 'image', attrs: { src: BLOB } }] }
  const result = removePendingUploadFromJson(json, BLOB)
  assert.equal('content' in result, false)
})

// -------- 10. stripPendingUploadsFromPages --------

test('stripPendingUploadsFromPages: filtra TODAS las páginas del payload, no solo una', () => {
  const payload = [
    {
      id: 'p1',
      contentHtml: `<p>a</p><img src="${BLOB}">`,
      contentJson: { type: 'doc', content: [{ type: 'image', attrs: { src: BLOB } }] },
    },
    { id: 'p2', contentHtml: '<p>b</p>', contentJson: { type: 'doc', content: [] } },
    { id: 'p3', contentHtml: `<p>c</p><img src="${BLOB}2"><img src="${BLOB}3">`, contentJson: null },
  ]
  const { pages, dropped } = stripPendingUploadsFromPages(payload)
  assert.equal(dropped, 3)
  assert.equal(pages[0].contentHtml, '<p>a</p>')
  assert.equal(pages[0].contentJson.content, undefined)
  assert.equal(pages[1].contentHtml, '<p>b</p>')
  assert.equal(pages[2].contentHtml, '<p>c</p>')
})

test('stripPendingUploadsFromPages: sin placeholders en ninguna página, dropped=0 y no toca las páginas', () => {
  const payload = [{ id: 'p1', contentHtml: '<p>a</p>', contentJson: null }]
  const { pages, dropped } = stripPendingUploadsFromPages(payload)
  assert.equal(dropped, 0)
  assert.equal(pages[0], payload[0])
})

// -------- 11. keepLocalPlaceholderContent --------

test('keepLocalPlaceholderContent: conserva el local con placeholder, toma el resto del persisted', () => {
  const localPages = [
    { id: 'p1', fullContent: `<p>a</p><img src="${BLOB}">`, contentJson: { local: true }, sections: ['local-section'] },
    { id: 'p2', fullContent: '<p>b</p>', contentJson: { local: true }, sections: [] },
  ]
  const persistedPages = [
    { id: 'p1', fullContent: '<p>a</p>', contentJson: { server: true }, sections: [], version: 5, name: 'Uno' },
    { id: 'p2', fullContent: '<p>b editado en otra sesión</p>', contentJson: { server: true }, sections: [], version: 3, name: 'Dos' },
  ]
  const result = keepLocalPlaceholderContent(localPages, persistedPages)

  assert.equal(result[0].fullContent, `<p>a</p><img src="${BLOB}">`)
  assert.deepEqual(result[0].contentJson, { local: true })
  assert.deepEqual(result[0].sections, ['local-section'])
  assert.equal(result[0].version, 5)

  assert.equal(result[1].fullContent, '<p>b editado en otra sesión</p>')
})

test('keepLocalPlaceholderContent: página persisted sin equivalente local pasa igual', () => {
  const result = keepLocalPlaceholderContent([], [{ id: 'p1', fullContent: '<p>a</p>' }])
  assert.equal(result[0].fullContent, '<p>a</p>')
})

// -------- 12. Propiedad anti-falso-positivo (la usan buildSectionActivityEvents/buildDocumentActivityEvents en ProjectEditor.jsx) --------

test('propiedad: dos HTML que solo difieren en un placeholder blob: quedan idénticos tras filtrar', () => {
  // Sin esto, comparar un `previousPages` con el marcador contra un `payload`
  // ya filtrado vería un image_removed falso en saveProjectPages.
  const withPlaceholder = `<p>hola</p><img src="${BLOB}">`
  const withoutPlaceholder = `<p>hola</p>`
  assert.equal(stripPendingUploadImagesFromHtml(withPlaceholder), stripPendingUploadImagesFromHtml(withoutPlaceholder))
})
