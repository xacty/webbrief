// shared/documentInvariants.test.js
//
// Plain Node test script. Run with:
//   node shared/documentInvariants.test.js
//
// Uses node:assert + a tiny test runner because the repo has no test
// framework. Exits non-zero on any failure.

import assert from 'node:assert/strict'
import { ensureInvariants, serializeContentJsonToHtml } from './documentInvariants.js'

let passed = 0
let failed = 0
const failures = []

function test(name, fn) {
  try {
    fn()
    passed += 1
    console.log(`  PASS  ${name}`)
  } catch (err) {
    failed += 1
    failures.push({ name, err })
    console.log(`  FAIL  ${name}`)
    console.log(`        ${err && err.message ? err.message : err}`)
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function divider(id, name) {
  return { type: 'sectionDivider', attrs: { sectionId: id, sectionName: name } }
}

function p(text) {
  return text
    ? { type: 'paragraph', content: [{ type: 'text', text }] }
    : { type: 'paragraph' }
}

function h(level, text) {
  return {
    type: 'heading',
    attrs: { level },
    content: text ? [{ type: 'text', text }] : [],
  }
}

function cta(ctaText, ctaUrl) {
  return { type: 'ctaButton', attrs: { ctaText, ctaUrl } }
}

function doc(...nodes) {
  return { type: 'doc', content: nodes }
}

function sectionNames(contentJson) {
  return (contentJson.content || [])
    .filter((n) => n.type === 'sectionDivider')
    .map((n) => n.attrs.sectionName)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

console.log('\nensureInvariants — repair tests')
console.log('--------------------------------')

test('input shape: rejects non-doc input', () => {
  assert.throws(() => ensureInvariants({ type: 'paragraph' }, 'page'), /must be "doc"/)
  assert.throws(() => ensureInvariants(null, 'page'), /must be a ProseMirror/)
  assert.throws(() => ensureInvariants({ type: 'doc', content: 'oops' }, 'page'), /must be an array/)
})

test('projectType: unknown projectType throws', () => {
  assert.throws(
    () => ensureInvariants(doc(p('hola')), 'unknown'),
    /unknown projectType/i,
  )
})

test('projectType=brief is rejected (not supported in MCP v1)', () => {
  assert.throws(
    () => ensureInvariants(doc(p('hola')), 'brief'),
    /brief.*not editable via MCP v1/i,
  )
})

test('missing first sectionDivider: repaired with "Sección 1"', () => {
  const input = doc(p('hola'), p('mundo'))
  const result = ensureInvariants(input, 'page')
  const names = sectionNames(result.contentJson)
  assert.deepEqual(names, ['Sección 1'])
  // First node now is the divider
  assert.equal(result.contentJson.content[0].type, 'sectionDivider')
  assert.ok(result.contentJson.content[0].attrs.sectionId.startsWith('s_'))
  assert.ok(result.repairs.some((r) => /Sección 1/.test(r)))
})

test('empty doc: no leading divider inserted (no content yet)', () => {
  const input = doc()
  const result = ensureInvariants(input, 'page')
  assert.equal(result.contentJson.content.length, 0)
  assert.deepEqual(result.repairs, [])
})

test('content before first divider: leading "Sección 1" inserted', () => {
  const input = doc(
    p('stray'),
    divider('s1', 'Mi sección'),
    p('inside'),
  )
  const result = ensureInvariants(input, 'page')
  const names = sectionNames(result.contentJson)
  assert.deepEqual(names, ['Sección 1', 'Mi sección'])
  assert.equal(result.contentJson.content[0].type, 'sectionDivider')
  assert.equal(result.contentJson.content[0].attrs.sectionName, 'Sección 1')
})

test('two custom-named + auto-named: ordinal advances through customs', () => {
  // 3 sections: custom, custom, auto. The auto one is the 3rd in order, so
  // its name should be "Sección 3".
  const input = doc(
    divider('a', 'Intro'),
    p('one'),
    divider('b', 'Detalles'),
    p('two'),
    divider('c', 'Sección 1'), // auto-name pretending to be first; should be 3
    p('three'),
  )
  const result = ensureInvariants(input, 'page')
  assert.deepEqual(sectionNames(result.contentJson), ['Intro', 'Detalles', 'Sección 3'])
  assert.ok(result.repairs.some((r) => /Renumbered/.test(r)))
})

test('renumber after delete: 3 sections → middle removed → contiguous', () => {
  // Simulate the state after a delete: original was Sección 1, Sección 2,
  // Sección 3. User removed Sección 2; the remaining auto-named one was
  // still called "Sección 3" and should become "Sección 2".
  const input = doc(
    divider('a', 'Sección 1'),
    p('one'),
    divider('c', 'Sección 3'),
    p('three'),
  )
  const result = ensureInvariants(input, 'page')
  assert.deepEqual(sectionNames(result.contentJson), ['Sección 1', 'Sección 2'])
})

test('custom-named section keeps name even though its ordinal changes', () => {
  const input = doc(
    divider('a', 'Sección 1'),
    p('one'),
    divider('c', 'Conclusiones'), // custom, sits at ordinal 2
  )
  const result = ensureInvariants(input, 'page')
  assert.deepEqual(sectionNames(result.contentJson), ['Sección 1', 'Conclusiones'])
})

test('sectionDivider missing sectionId/sectionName: synthesized', () => {
  const input = doc(
    { type: 'sectionDivider', attrs: {} },
    p('hello'),
  )
  const result = ensureInvariants(input, 'page')
  const div0 = result.contentJson.content[0]
  assert.equal(div0.type, 'sectionDivider')
  assert.ok(div0.attrs.sectionId && div0.attrs.sectionId.length > 0)
  assert.equal(div0.attrs.sectionName, 'Sección 1')
  assert.ok(result.repairs.some((r) => /missing sectionId/.test(r)))
})

test('CTA: ctaText + ctaUrl survive a roundtrip; missing ctaText repaired', () => {
  const input = doc(
    divider('s1', 'Sección 1'),
    cta('Comprar ahora', 'https://example.com/buy'),
    { type: 'ctaButton', attrs: { ctaUrl: 'https://example.com/x' } }, // missing ctaText
  )
  const result = ensureInvariants(input, 'page')
  const ctas = result.contentJson.content.filter((n) => n.type === 'ctaButton')
  assert.equal(ctas.length, 2)
  assert.equal(ctas[0].attrs.ctaText, 'Comprar ahora')
  assert.equal(ctas[0].attrs.ctaUrl, 'https://example.com/buy')
  assert.equal(ctas[1].attrs.ctaText, 'Ver más') // repaired default
  // HTML must include the CTA markup
  assert.match(result.contentHtml, /data-cta-button/)
  assert.match(result.contentHtml, /Comprar ahora/)
  assert.match(result.contentHtml, /https:\/\/example\.com\/buy/)
})

test('FAQ: well-formed Q/A pair validates without repairs', () => {
  const input = doc(
    divider('q1', 'Pregunta Frecuente 1'),
    h(3, '¿Cómo me registro?'),
    p('Vas a la página de login...'),
  )
  const result = ensureInvariants(input, 'faq')
  assert.deepEqual(sectionNames(result.contentJson), ['Pregunta Frecuente 1'])
  // No repairs needed
  assert.deepEqual(result.repairs, [])
})

test('FAQ: stray H3 without preceding divider → divider inserted', () => {
  const input = doc(
    divider('q1', 'Pregunta Frecuente 1'),
    h(3, '¿Pregunta 1?'),
    p('Respuesta 1'),
    h(3, '¿Pregunta 2?'), // stray — no divider before
    p('Respuesta 2'),
  )
  const result = ensureInvariants(input, 'faq')
  assert.deepEqual(sectionNames(result.contentJson), [
    'Pregunta Frecuente 1',
    'Pregunta Frecuente 2',
  ])
  assert.ok(result.repairs.some((r) => /stray H3/.test(r)))
})

test('FAQ: section with no question text gets empty H3 placeholder', () => {
  const input = doc(
    divider('q1', 'Pregunta Frecuente 1'),
    h(3, '¿Pregunta 1?'),
    p('Respuesta 1'),
    divider('q2', 'Pregunta Frecuente 2'),
    // no question heading at all
  )
  const result = ensureInvariants(input, 'faq')
  // 2nd section is entirely empty, so a placeholder H3 is inserted
  const lastNodes = result.contentJson.content.slice(-2)
  assert.equal(lastNodes[0].type, 'sectionDivider')
  assert.equal(lastNodes[1].type, 'heading')
  assert.equal(lastNodes[1].attrs.level, 3)
  assert.ok(result.repairs.some((r) => /empty H3 placeholder/.test(r)))
})

test('document projectType: sectionDividers stripped', () => {
  const input = doc(
    divider('s1', 'Sección 1'),
    h(1, 'Título'),
    p('párrafo'),
  )
  const result = ensureInvariants(input, 'document')
  assert.equal(
    result.contentJson.content.filter((n) => n.type === 'sectionDivider').length,
    0,
  )
  assert.ok(result.repairs.some((r) => /Removed.*sectionDivider/.test(r)))
  // Linear content survives
  assert.equal(result.contentJson.content[0].type, 'heading')
  assert.equal(result.contentJson.content[1].type, 'paragraph')
})

test('HTML serialization roundtrip: contains expected markup', () => {
  const input = doc(
    divider('s1', 'Intro'),
    h(2, 'Hola mundo'),
    p('Este es el contenido.'),
    cta('Suscribirse', 'https://example.com/newsletter'),
  )
  const result = ensureInvariants(input, 'page')
  assert.ok(result.contentHtml.length > 0, 'HTML should be non-empty')
  assert.match(result.contentHtml, /data-section-divider/)
  assert.match(result.contentHtml, /data-section-id="s1"/)
  assert.match(result.contentHtml, /data-section-name="Intro"/)
  assert.match(result.contentHtml, /<h2>Hola mundo<\/h2>/)
  assert.match(result.contentHtml, /Este es el contenido\./)
  assert.match(result.contentHtml, /data-cta-button/)
  assert.match(result.contentHtml, /Suscribirse/)
})

test('serializeContentJsonToHtml is exported and usable standalone', () => {
  const html = serializeContentJsonToHtml(
    doc(divider('s1', 'Sección 1'), p('hola')),
  )
  assert.match(html, /data-section-divider/)
  assert.match(html, /<p>hola<\/p>/)
})

test('comment mark survives HTML roundtrip', () => {
  const input = doc(
    divider('s1', 'Sección 1'),
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'antes ' },
        {
          type: 'text',
          text: 'comentado',
          marks: [{ type: 'comment', attrs: { commentId: 'c-uuid-1' } }],
        },
        { type: 'text', text: ' después' },
      ],
    },
  )
  const result = ensureInvariants(input, 'page')
  assert.match(result.contentHtml, /data-comment-id="c-uuid-1"/)
  assert.match(result.contentHtml, /comentado/)
})

test('ensureInvariants does not mutate caller input', () => {
  const input = doc(p('hello')) // no divider; should be repaired
  const snapshot = JSON.stringify(input)
  ensureInvariants(input, 'page')
  assert.equal(JSON.stringify(input), snapshot, 'input must not be mutated')
})

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

console.log('\n--------------------------------')
console.log(`Result: ${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log('\nFailures:')
  failures.forEach((f) => {
    console.log(`  - ${f.name}`)
    if (f.err && f.err.stack) console.log(f.err.stack.split('\n').slice(0, 3).join('\n'))
  })
  process.exit(1)
}
process.exit(0)
