import assert from 'node:assert/strict'
import { test } from 'node:test'
import { sanitizeSvg, sanitizeSvgBuffer, sanitizeIfSvg } from '../src/lib/svgSanitizer.js'

const SVG_MIME = 'image/svg+xml'

const wrap = (inner, attrs = '') =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"${attrs ? ` ${attrs}` : ''}>${inner}</svg>`

test('sanitizeSvg: elimina <script> y conserva las figuras', () => {
  const result = sanitizeSvg(wrap('<script>alert(1)</script><rect x="1" y="1" width="10" height="10"/>'))
  assert.equal(result.ok, true)
  assert.equal(result.changed, true)
  assert.ok(!result.svg.includes('<script'))
  assert.ok(!result.svg.includes('alert(1)'))
  assert.ok(result.svg.includes('<rect'))
  assert.ok(result.svg.includes('<svg'))
  assert.ok(result.svg.includes('http://www.w3.org/2000/svg'))
  assert.ok(result.svg.includes('viewBox="0 0 100 100"'))
})

test('sanitizeSvg: elimina manejadores on* (onload/onclick)', () => {
  const result = sanitizeSvg(wrap('<path d="M0 0h10" onclick="alert(2)"/>', 'onload="alert(1)"'))
  assert.equal(result.ok, true)
  assert.ok(!/onload/i.test(result.svg))
  assert.ok(!/onclick/i.test(result.svg))
  assert.ok(result.svg.includes('<path'))
  assert.ok(result.svg.includes('d="M0 0h10"'))
})

test('sanitizeSvg: elimina href javascript: pero conserva https:', () => {
  const result = sanitizeSvg(wrap(
    '<a href="javascript:alert(1)"><text x="5" y="5">mal</text></a>' +
    '<a href="https://webrief.app"><text x="5" y="20">bien</text></a>'
  ))
  assert.equal(result.ok, true)
  assert.ok(!/javascript:/i.test(result.svg))
  assert.ok(result.svg.includes('https://webrief.app'))
  assert.ok(result.svg.includes('mal')) // el texto queda, el enlace se neutraliza
})

test('sanitizeSvg: elimina xlink:href javascript: y conserva referencias internas', () => {
  const result = sanitizeSvg(wrap(
    '<defs><circle id="icon" r="4"/></defs>' +
    '<use xmlns:xlink="http://www.w3.org/1999/xlink" xlink:href="#icon"/>' +
    '<a xmlns:xlink="http://www.w3.org/1999/xlink" xlink:href="javascript:alert(1)"><text x="1" y="1">x</text></a>'
  ))
  assert.equal(result.ok, true)
  assert.ok(!/javascript:/i.test(result.svg))
  assert.ok(result.svg.includes('#icon'))
})

test('sanitizeSvg: elimina foreignObject con todo su contenido', () => {
  const result = sanitizeSvg(wrap(
    '<foreignObject width="100" height="100"><body xmlns="http://www.w3.org/1999/xhtml"><img src="x" onerror="alert(1)"/></body></foreignObject><circle r="5"/>'
  ))
  assert.equal(result.ok, true)
  assert.ok(!/foreignObject/i.test(result.svg))
  assert.ok(!/onerror/i.test(result.svg))
  assert.ok(!/<img/i.test(result.svg))
  assert.ok(result.svg.includes('<circle'))
})

test('sanitizeSvg: conserva un SVG benigno típico de herramientas de diseño', () => {
  const benign = wrap(
    '<defs>' +
    '<linearGradient id="g1" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#ff0000"/><stop offset="1" stop-color="#0000ff"/></linearGradient>' +
    '<filter id="f1"><feGaussianBlur stdDeviation="2"/></filter>' +
    '</defs>' +
    '<style>.cls-1{fill:url(#g1);stroke:#000;}</style>' +
    '<path class="cls-1" d="M10 10L90 90" filter="url(#f1)"/>' +
    '<text x="10" y="50" font-family="Arial">Logo</text>',
    'preserveAspectRatio="xMidYMid meet"'
  )
  const result = sanitizeSvg(benign)
  assert.equal(result.ok, true)
  assert.ok(result.svg.includes('linearGradient'))
  assert.ok(result.svg.includes('gradientUnits="userSpaceOnUse"'))
  assert.ok(result.svg.includes('feGaussianBlur'))
  assert.ok(result.svg.includes('stdDeviation="2"'))
  assert.ok(result.svg.includes('.cls-1'))
  assert.ok(result.svg.includes('preserveAspectRatio="xMidYMid meet"'))
  assert.ok(result.svg.includes('Logo'))
})

test('sanitizeSvg: conserva <image> con data:image raster y elimina data:text/html', () => {
  const result = sanitizeSvg(wrap(
    '<image href="data:image/png;base64,iVBORw0KGgo=" width="10" height="10"/>' +
    '<image href="data:text/html,&lt;script&gt;alert(1)&lt;/script&gt;" width="10" height="10"/>'
  ))
  assert.equal(result.ok, true)
  assert.ok(result.svg.includes('data:image/png;base64,iVBORw0KGgo='))
  assert.ok(!result.svg.includes('data:text/html'))
})

test('sanitizeSvg: <use> solo admite referencias internas (#id)', () => {
  const result = sanitizeSvg(wrap(
    '<defs><circle id="icon" r="4"/></defs>' +
    '<use href="#icon"/>' +
    '<use href="https://evil.example/sprite.svg#p"/>'
  ))
  assert.equal(result.ok, true)
  assert.ok(result.svg.includes('href="#icon"'))
  assert.ok(!result.svg.includes('evil.example'))
})

test('sanitizeSvg: escapa caracteres especiales en atributos para mantener XML válido', () => {
  const result = sanitizeSvg(wrap('<rect aria-label="a &lt; b" width="10" height="10"/>'))
  assert.equal(result.ok, true)
  assert.ok(result.svg.includes('a &lt; b'))
  const reparsed = sanitizeSvg(result.svg)
  assert.equal(reparsed.ok, true)
})

test('sanitizeSvg: rechaza documentos con más de una raíz', () => {
  const twoRoots = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1"/></svg>' +
    '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>'
  assert.deepEqual(sanitizeSvg(twoRoots), { ok: false, reason: 'invalid_svg' })
})

test('sanitizeSvg: neutraliza animaciones SMIL que inyectan javascript: en href', () => {
  const result = sanitizeSvg(wrap(
    '<a href="https://webrief.app"><circle r="5"/>' +
    '<animate attributeName="href" values="javascript:alert(1)" dur="1s"/></a>'
  ))
  assert.equal(result.ok, true)
  assert.ok(!/javascript:/i.test(result.svg))
})

test('sanitizeSvg: elimina processing instructions (xml-stylesheet)', () => {
  const input = '<?xml version="1.0"?><?xml-stylesheet type="text/xsl" href="https://evil.example/x.xsl"?>' +
    wrap('<rect width="10" height="10"/>')
  const result = sanitizeSvg(input)
  assert.equal(result.ok, true)
  assert.ok(!result.svg.includes('<?'))
  assert.ok(!result.svg.includes('xml-stylesheet'))
  assert.ok(result.svg.includes('<rect'))
})

test('sanitizeSvg: tolera prólogo XML, DOCTYPE y comentarios de generador', () => {
  const input = '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">\n' +
    '<!-- Generator: Adobe Illustrator -->\n' +
    wrap('<rect width="10" height="10"/>')
  const result = sanitizeSvg(input)
  assert.equal(result.ok, true)
  assert.ok(!result.svg.includes('DOCTYPE'))
  assert.ok(result.svg.includes('<rect'))
})

test('sanitizeSvg: rechaza XML mal formado', () => {
  const result = sanitizeSvg('<svg xmlns="http://www.w3.org/2000/svg"><rect width="10"')
  assert.deepEqual(result, { ok: false, reason: 'invalid_svg' })
})

test('sanitizeSvg: rechaza documentos sin raíz <svg>', () => {
  const result = sanitizeSvg('<html xmlns="http://www.w3.org/1999/xhtml"><body>hola</body></html>')
  assert.deepEqual(result, { ok: false, reason: 'invalid_svg' })
})

test('sanitizeSvg: rechaza entrada vacía o solo espacios', () => {
  assert.deepEqual(sanitizeSvg(''), { ok: false, reason: 'invalid_svg' })
  assert.deepEqual(sanitizeSvg('   \n '), { ok: false, reason: 'invalid_svg' })
  assert.deepEqual(sanitizeSvg(null), { ok: false, reason: 'invalid_svg' })
  assert.deepEqual(sanitizeSvg(undefined), { ok: false, reason: 'invalid_svg' })
})

test('sanitizeSvg: acepta BOM UTF-8 y lo descarta en la salida', () => {
  const result = sanitizeSvg('﻿' + wrap('<rect width="10" height="10"/>'))
  assert.equal(result.ok, true)
  assert.ok(!result.svg.includes('﻿'))
  assert.ok(result.svg.startsWith('<svg'))
})

test('sanitizeSvg: entradas patológicas se rechazan en tiempo lineal (anti-ReDoS)', () => {
  const cases = [
    '<!DOCTYPE ' + 'a'.repeat(2_000_000),
    '<?xml ' + 'a'.repeat(2_000_000),
    '<!DOCTYPE svg [' + 'b'.repeat(2_000_000),
  ]
  for (const evil of cases) {
    const t0 = performance.now()
    assert.deepEqual(sanitizeSvg(evil), { ok: false, reason: 'invalid_svg' })
    assert.ok(performance.now() - t0 < 5000, 'el rechazo debe ser rápido, sin backtracking cuadrático')
  }
})

test('sanitizeSvgBuffer: sanea el buffer y devuelve otro buffer', () => {
  const dirty = Buffer.from(wrap('<script>alert(1)</script><rect width="10" height="10"/>'), 'utf8')
  const result = sanitizeSvgBuffer(dirty)
  assert.equal(result.ok, true)
  assert.ok(Buffer.isBuffer(result.buffer))
  const out = result.buffer.toString('utf8')
  assert.ok(!out.includes('<script'))
  assert.ok(out.includes('<rect'))
})

test('sanitizeSvgBuffer: rechaza bytes binarios (svgz/gzip)', () => {
  const gzipish = Buffer.from([0x1f, 0x8b, 0x08, 0x00, 0x99, 0x12, 0x34, 0x56])
  assert.deepEqual(sanitizeSvgBuffer(gzipish), { ok: false, reason: 'invalid_svg' })
})

test('sanitizeIfSvg: mime raster pasa intacto sin tocar el buffer', () => {
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x01, 0x02])
  const result = sanitizeIfSvg({ mimeType: 'image/jpeg', buffer: jpeg })
  assert.equal(result.ok, true)
  assert.equal(result.changed, false)
  assert.equal(result.buffer, jpeg)
})

test('sanitizeIfSvg: mime svg sanea; svg inválido se rechaza', () => {
  const dirty = Buffer.from(wrap('<script>alert(1)</script><circle r="4"/>'), 'utf8')
  const clean = sanitizeIfSvg({ mimeType: SVG_MIME, buffer: dirty })
  assert.equal(clean.ok, true)
  assert.ok(!clean.buffer.toString('utf8').includes('<script'))
  assert.ok(clean.buffer.toString('utf8').includes('<circle'))

  const broken = sanitizeIfSvg({ mimeType: SVG_MIME, buffer: Buffer.from('no es svg', 'utf8') })
  assert.deepEqual(broken, { ok: false, reason: 'invalid_svg' })
})
