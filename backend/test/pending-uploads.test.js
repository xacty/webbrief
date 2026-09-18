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
  reconcilePersistedPages,
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

test('imageAttrsFromAsset: width/height en 0 son legítimos y no colapsan a null', () => {
  // asset?.width || null trataría 0 como falsy y lo pisaría con null. Una
  // imagen con ancho/alto real 0 es un caso raro pero válido — el helper
  // debe usar ?? para distinguir "0" de "ausente".
  const asset = {
    id: 'asset-1',
    publicUrl: REAL,
    fileName: 'x.png',
    path: 'p/x.png',
    width: 0,
    height: 0,
  }
  assert.deepEqual(imageAttrsFromAsset(asset), {
    src: REAL,
    assetId: 'asset-1',
    fileName: 'x.png',
    storagePath: 'p/x.png',
    originalWidth: 0,
    originalHeight: 0,
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

test('replacePendingUploadInJson: attrs sin src (o sin tercer argumento) degrada a "" en vez de dejar src undefined', () => {
  // Contrato: attrs debe traer el src final (normalmente el de imageAttrsFromAsset).
  // Si no lo trae, el nodo no debe quedar con src=undefined (imagen rota) — debe
  // degradar igual que replacePendingUploadInHtml, que serializa `escapeImgAttr(attrs.src)`
  // y con attrs.src undefined imprime src="".
  const json = {
    type: 'doc',
    content: [{ type: 'image', attrs: { src: BLOB, alt: 'IMG_2542.webp' } }],
  }

  const withoutSrcKey = replacePendingUploadInJson(json, BLOB, { assetId: 'asset-1' })
  assert.equal(withoutSrcKey.content[0].attrs.src, '')
  assert.equal(withoutSrcKey.content[0].attrs.assetId, 'asset-1')

  const withoutThirdArg = replacePendingUploadInJson(json, BLOB)
  assert.equal(withoutThirdArg.content[0].attrs.src, '')
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

// -------- 11. reconcilePersistedPages --------
//
// Reemplaza a keepLocalPlaceholderContent: esa función comparaba el estado
// local contra un placeholder blob: que TODAVÍA estuviera ahí, así que una
// subida que resolvía a su URL final justo durante el PUT (o el GET del
// sync) dejaba de estar protegida — el contenido local ya no tenía blob:,
// pero tampoco era el que se había enviado/persistido. reconcilePersistedPages
// compara contra lo que realmente viajó (sentPages), no contra la forma del
// placeholder, así que cubre ese caso también.

test('reconcilePersistedPages: subida todavía pendiente cuando termina el guardado -> se conserva', () => {
  // Lo que se envió ya no tenía la imagen (stripPendingUploadsFromPages la
  // sacó del payload antes del PUT); el estado actual (pagesRef.current)
  // sigue con el placeholder porque la subida no resolvió a tiempo.
  const sentPages = [{ id: 'p1', contentHtml: '<p>a</p>', contentJson: { sent: true } }]
  const currentPages = [
    { id: 'p1', fullContent: `<p>a</p><img src="${BLOB}">`, contentJson: { local: true }, sections: ['local-section'] },
  ]
  const persistedPages = [
    { id: 'p1', fullContent: '<p>a</p>', contentJson: { server: true }, sections: [], version: 5, name: 'Uno' },
  ]

  const { pages, keptIds } = reconcilePersistedPages(currentPages, persistedPages, sentPages)

  assert.deepEqual(keptIds, ['p1'])
  assert.equal(pages[0].fullContent, `<p>a</p><img src="${BLOB}">`)
  assert.deepEqual(pages[0].contentJson, { local: true })
  assert.deepEqual(pages[0].sections, ['local-section'])
  // El resto de los campos (incluida la version) los gana el servidor.
  assert.equal(pages[0].version, 5)
  assert.equal(pages[0].name, 'Uno')
})

test('reconcilePersistedPages: la subida resolvió a su URL final MIENTRAS el guardado estaba en vuelo -> se conserva', () => {
  // Caso-2 de onImageUploadDone (ProjectEditor.jsx): entre armar el payload
  // (ya sin el placeholder, porque stripPendingUploadsFromPages lo sacó) y
  // la respuesta del PUT, la subida terminó y reemplazó el placeholder por
  // la URL final directo en el estado de la página. Lo persisted nunca tuvo
  // esa imagen (no viajó en el payload) — si ganara, la imagen recién
  // subida desaparecería en silencio pese a haber terminado bien.
  const sentPages = [{ id: 'p1', contentHtml: '<p>a</p>', contentJson: { sent: true } }]
  const currentPages = [
    { id: 'p1', fullContent: `<p>a</p><img src="${REAL}">`, contentJson: { local: true }, sections: ['local-section'] },
  ]
  const persistedPages = [
    { id: 'p1', fullContent: '<p>a</p>', contentJson: { server: true }, sections: [], version: 5 },
  ]

  const { pages, keptIds } = reconcilePersistedPages(currentPages, persistedPages, sentPages)

  assert.deepEqual(keptIds, ['p1'])
  assert.equal(pages[0].fullContent, `<p>a</p><img src="${REAL}">`)
  assert.deepEqual(pages[0].contentJson, { local: true })
  assert.equal(pages[0].version, 5)
})

test('reconcilePersistedPages: página sin cambios durante el guardado -> gana la persisted, incluida la version nueva', () => {
  const sentPages = [{ id: 'p1', contentHtml: '<p>a</p>', contentJson: { sent: true } }]
  const currentPages = [
    { id: 'p1', fullContent: '<p>a</p>', contentJson: { local: true }, sections: ['local-section'] },
  ]
  const persistedPages = [
    { id: 'p1', fullContent: '<p>a</p>', contentJson: { server: true }, sections: [], version: 7 },
  ]

  const { pages, keptIds } = reconcilePersistedPages(currentPages, persistedPages, sentPages)

  assert.deepEqual(keptIds, [])
  // Misma referencia: la persisted pasa intacta, no una copia.
  assert.equal(pages[0], persistedPages[0])
  assert.equal(pages[0].version, 7)
})

test('reconcilePersistedPages: página persisted sin equivalente en currentPages pasa igual', () => {
  const persistedPages = [{ id: 'p1', fullContent: '<p>a</p>', version: 2 }]
  const { pages, keptIds } = reconcilePersistedPages([], persistedPages, [])

  assert.deepEqual(keptIds, [])
  assert.equal(pages[0], persistedPages[0])
})

// -------- 12. Propiedad anti-falso-positivo (la usan buildSectionActivityEvents/buildDocumentActivityEvents en ProjectEditor.jsx) --------

test('propiedad: dos HTML que solo difieren en un placeholder blob: quedan idénticos tras filtrar', () => {
  // Sin esto, comparar un `previousPages` con el marcador contra un `payload`
  // ya filtrado vería un image_removed falso en saveProjectPages.
  const withPlaceholder = `<p>hola</p><img src="${BLOB}">`
  const withoutPlaceholder = `<p>hola</p>`
  assert.equal(stripPendingUploadImagesFromHtml(withPlaceholder), stripPendingUploadImagesFromHtml(withoutPlaceholder))
})
