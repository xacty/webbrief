import assert from 'node:assert/strict'
import { test } from 'node:test'
import { sanitizeContentHtml } from '../src/lib/htmlSanitizer.js'

// Auditoria 2026-08, hallazgos A1 (XSS almacenado) y A2 (CTA javascript:).
//
// Estos tests cubren DOS riesgos opuestos, y los dos importan igual:
//   1. Que se elimine todo lo ejecutable (si falla => XSS en el share publico).
//   2. Que NO se toque el marcado que sostiene el editor (si falla => se rompen
//      las secciones, los comentarios anclados o los CTAs de documentos reales).
// El segundo grupo es el que evita que "endurecer" termine siendo destructivo.

// ---------------------------------------------------------------------------
// 1. Lo ejecutable se elimina
// ---------------------------------------------------------------------------

test('elimina <script>', () => {
  const out = sanitizeContentHtml('<p>hola</p><script>alert(1)</script>')
  assert.ok(!out.includes('<script'))
  assert.ok(!out.includes('alert(1)'))
  assert.ok(out.includes('hola'))
})

test('elimina manejadores on* (onerror, onload, onclick)', () => {
  const out = sanitizeContentHtml('<img src="https://x.test/a.png" onerror="alert(1)"><p onclick="alert(2)">t</p>')
  assert.ok(!out.includes('onerror'))
  assert.ok(!out.includes('onclick'))
  assert.ok(!out.includes('alert'))
})

test('elimina href javascript: en links', () => {
  const out = sanitizeContentHtml('<a href="javascript:alert(1)">click</a>')
  assert.ok(!out.includes('javascript:'))
})

test('elimina data-cta-url con javascript: (regresion A2)', () => {
  // El nodo CTA re-renderiza data-cta-url como href al cargar el documento, asi
  // que si el atributo sobrevive el javascript: revive en el editor.
  const out = sanitizeContentHtml('<div data-cta-url="javascript:alert(1)" data-cta-text="Ver">Ver</div>')
  assert.ok(!out.includes('javascript:'))
})

test('preserva data-cta-url cuando la URL es legitima', () => {
  const out = sanitizeContentHtml('<div data-cta-url="https://cliente.test/catalogo" data-cta-text="Ver catalogo">Ver catalogo</div>')
  assert.ok(out.includes('data-cta-url="https://cliente.test/catalogo"'))
  assert.ok(out.includes('data-cta-text="Ver catalogo"'))
})

test('elimina iframe / object / embed / form', () => {
  const out = sanitizeContentHtml('<iframe src="https://evil.test"></iframe><object data="x"></object><embed src="x"><form action="/x"></form>')
  for (const tag of ['<iframe', '<object', '<embed', '<form']) {
    assert.ok(!out.includes(tag), `no deberia quedar ${tag}`)
  }
})

test('img no acepta data: (evita data:text/html y SVG con script)', () => {
  const out = sanitizeContentHtml('<img src="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">')
  assert.ok(!out.includes('data:text/html'))
})

test('elimina estilos peligrosos pero conserva los validos', () => {
  const out = sanitizeContentHtml('<p style="text-align:center;background:url(javascript:alert(1))">t</p>')
  assert.ok(!out.includes('javascript:'))
  assert.ok(out.includes('text-align:center'))
})

test('entradas vacias o no-string devuelven cadena vacia', () => {
  assert.equal(sanitizeContentHtml(''), '')
  assert.equal(sanitizeContentHtml(null), '')
  assert.equal(sanitizeContentHtml(undefined), '')
  assert.equal(sanitizeContentHtml(12345), '')
})

// ---------------------------------------------------------------------------
// 2. El marcado del editor sobrevive intacto
//    (formatos tomados de shared/documentInvariants.js — fuente de verdad)
// ---------------------------------------------------------------------------

test('INVARIANTE: sectionDivider conserva sectionId y sectionName', () => {
  // Invariante explicito del repo: "sectionDivider HTML must preserve
  // sectionId + sectionName". Perderlos destruye la estructura del documento.
  const html = '<div data-section-divider="true" data-section-id="s1" data-section-name="Intro"></div><p>cuerpo</p>'
  const out = sanitizeContentHtml(html)
  assert.ok(out.includes('data-section-id="s1"'))
  assert.ok(out.includes('data-section-name="Intro"'))
  assert.ok(out.includes('data-section-divider="true"'))
})

test('INVARIANTE: comment mark conserva data-comment-id y resolved', () => {
  const html = '<p>texto <span data-comment-id="c-123" data-comment-resolved="true">anclado</span> fin</p>'
  const out = sanitizeContentHtml(html)
  assert.ok(out.includes('data-comment-id="c-123"'))
  assert.ok(out.includes('data-comment-resolved="true"'))
  assert.ok(out.includes('anclado'))
})

test('INVARIANTE: imagen conserva sus data-* (assetId, fileName, storagePath, medidas)', () => {
  const html = '<img src="https://ik.imagekit.io/x/a.webp" alt="foto" width="800" height="600"'
    + ' data-asset-id="a-1" data-file-name="a.webp" data-storage-path="companies/c1/projects/p1/a.webp"'
    + ' data-original-width="2560" data-original-height="1440">'
  const out = sanitizeContentHtml(html)
  for (const attr of ['data-asset-id="a-1"', 'data-file-name="a.webp"', 'data-storage-path=', 'data-original-width="2560"', 'width="800"']) {
    assert.ok(out.includes(attr), `deberia conservar ${attr}`)
  }
})

test('INVARIANTE: textBlockLayout conserva blockSpacing/indentLevel como data-* + style', () => {
  const html = '<p data-block-spacing="lg" data-indent-level="2" style="text-align:justify">t</p>'
  const out = sanitizeContentHtml(html)
  assert.ok(out.includes('data-block-spacing="lg"'))
  assert.ok(out.includes('data-indent-level="2"'))
  assert.ok(out.includes('text-align:justify'))
})

test('INVARIANTE: tablas conservan estructura y colspan/rowspan', () => {
  const html = '<table><colgroup><col span="2"></colgroup><tbody><tr><th colspan="2">h</th></tr>'
    + '<tr><td rowspan="2">a</td><td>b</td></tr></tbody></table>'
  const out = sanitizeContentHtml(html)
  for (const frag of ['<table', '<colgroup', '<col', '<tbody', '<tr', '<th', '<td', 'colspan="2"', 'rowspan="2"']) {
    assert.ok(out.includes(frag), `deberia conservar ${frag}`)
  }
})

test('conserva formato de texto y encabezados', () => {
  const html = '<h1>t1</h1><h2>t2</h2><p><strong>b</strong><em>i</em><u>u</u><s>s</s><mark>m</mark>'
    + '<sub>sb</sub><sup>sp</sup></p><ul><li>x</li></ul><ol start="3"><li>y</li></ol><blockquote>q</blockquote>'
  const out = sanitizeContentHtml(html)
  for (const frag of ['<h1>', '<h2>', '<strong>', '<em>', '<u>', '<s>', '<mark>', '<sub>', '<sup>', '<ul>', '<ol start="3">', '<blockquote>']) {
    assert.ok(out.includes(frag), `deberia conservar ${frag}`)
  }
})

test('conserva links y mailto de menciones', () => {
  const out = sanitizeContentHtml('<a href="https://x.test/a" target="_blank" rel="noopener">l</a><a href="mailto:a@b.test">m</a>')
  assert.ok(out.includes('href="https://x.test/a"'))
  assert.ok(out.includes('mailto:a@b.test'))
})

test('conserva color y background-color de Color/Highlight', () => {
  const out = sanitizeContentHtml('<span style="color:#ff0000;background-color:rgb(255,255,0)">t</span>')
  assert.ok(out.includes('color:#ff0000'))
  assert.ok(out.includes('background-color:rgb(255,255,0)'))
})

// ---------------------------------------------------------------------------
// 3. Idempotencia — sanear dos veces no degrada el contenido
// ---------------------------------------------------------------------------

test('sanear es idempotente sobre marcado legitimo', () => {
  const html = '<div data-section-divider="true" data-section-id="s1" data-section-name="Intro"></div>'
    + '<p style="text-align:center">texto <span data-comment-id="c1">anclado</span></p>'
    + '<div data-cta-url="https://x.test" data-cta-text="Ver">Ver</div>'
  const once = sanitizeContentHtml(html)
  const twice = sanitizeContentHtml(once)
  assert.equal(once, twice)
})
