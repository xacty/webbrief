import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildSectionEventsFromHtml } from '../../shared/sectionEvents.js'

// Helpers locales: serializan un divider de sección y un CTA igual que TipTap
// (ver frontend/src/pages/ProjectEditor.jsx líneas ~204/250-257 para el CTA,
// y ~898 para el divider).
const d = (id, name) => `<div data-section-divider data-section-id="${id}" data-section-name="${name}"></div>`
const cta = (text, url) => `<div data-cta-button="" data-cta-text="${text}" data-cta-url="${url}"><a href="${url}">${text}</a></div>`

// -------- 1. Sin cambios --------

test('sin cambios: html idéntico no produce eventos', () => {
  const html = d('a', 'Uno') + '<p>Alfa</p>' + d('b', 'Dos') + '<p>Beta</p>'
  const events = buildSectionEventsFromHtml({ pageId: 'p1', pageName: 'Página', previousHtml: html, nextHtml: html })
  assert.deepEqual(events, [])
})

// -------- 2. Edición de texto --------

test('edición de texto en el cuerpo: emite text_changed con el html de la sección', () => {
  const previousHtml = d('a', 'Uno') + '<p>Hola mundo</p>'
  const nextHtml = d('a', 'Uno') + '<p>Hola planeta</p>'
  const events = buildSectionEventsFromHtml({ pageId: 'p1', pageName: 'Página', previousHtml, nextHtml })
  assert.equal(events.length, 1)
  assert.equal(events[0].sectionId, 'a')
  assert.deepEqual(events[0].changeTypes, ['text_changed'])
  assert.equal(events[0].previousIndex, 0)
  assert.equal(events[0].nextIndex, 0)
  assert.equal(events[0].sectionHtml, '<p>Hola planeta</p>')
})

// -------- 3. Cambio de título --------

test('cambio de título (heading): emite title_changed sin text_changed si el cuerpo no cambió', () => {
  const previousHtml = d('a', 'Uno') + '<h2>Título viejo</h2><p>Cuerpo</p>'
  const nextHtml = d('a', 'Uno') + '<h2>Título nuevo</h2><p>Cuerpo</p>'
  const events = buildSectionEventsFromHtml({ pageId: 'p1', pageName: 'Página', previousHtml, nextHtml })
  assert.equal(events.length, 1)
  assert.deepEqual(events[0].changeTypes, ['title_changed'])
})

// -------- 4. Título + texto combinados: orden alfabético determinista --------

test('título y cuerpo cambian juntos: changeTypes se devuelve en orden alfabético (no orden de inserción)', () => {
  const previousHtml = d('a', 'Uno') + '<h2>Antes</h2><p>Cuerpo antes</p>'
  const nextHtml = d('a', 'Uno') + '<h2>Después</h2><p>Cuerpo después</p>'
  const events = buildSectionEventsFromHtml({ pageId: 'p1', pageName: 'Página', previousHtml, nextHtml })
  assert.equal(events.length, 1)
  // 'text_changed' < 'title_changed' alfabéticamente.
  assert.deepEqual(events[0].changeTypes, ['text_changed', 'title_changed'])
})

// -------- 5. Sección agregada --------

test('sección agregada: emite solo section_added (corta antes de calcular otros tipos)', () => {
  const previousHtml = d('a', 'Uno') + '<p>Alfa</p>'
  const nextHtml = d('a', 'Uno') + '<p>Alfa</p>' + d('b', 'Dos') + '<p>Beta</p>'
  const events = buildSectionEventsFromHtml({ pageId: 'p1', pageName: 'Página', previousHtml, nextHtml })
  assert.equal(events.length, 1)
  assert.equal(events[0].sectionId, 'b')
  assert.deepEqual(events[0].changeTypes, ['section_added'])
  assert.equal(events[0].previousIndex, null)
  assert.equal(events[0].nextIndex, 1)
  assert.equal(events[0].sectionHtml, '<p>Beta</p>')
})

// -------- 6. Sección eliminada (con una tabla adentro) --------

test('sección eliminada completa (contiene una tabla): emite solo section_removed, sin sectionHtml', () => {
  const previousHtml = d('a', 'Uno') + '<p>Alfa</p>' + d('b', 'Dos') + '<table><tr><td>Fila 1</td></tr></table>'
  const nextHtml = d('a', 'Uno') + '<p>Alfa</p>'
  const events = buildSectionEventsFromHtml({ pageId: 'p1', pageName: 'Página', previousHtml, nextHtml })
  assert.equal(events.length, 1)
  assert.equal(events[0].sectionId, 'b')
  assert.deepEqual(events[0].changeTypes, ['section_removed'])
  assert.equal(events[0].previousIndex, 1)
  assert.equal(events[0].nextIndex, null)
  assert.equal('sectionHtml' in events[0], false)
})

// -------- 7. Sección renombrada --------

test('sección renombrada (mismo contenido): emite solo section_renamed', () => {
  const previousHtml = d('a', 'Uno') + '<p>Alfa</p>'
  const nextHtml = d('a', 'Uno renombrada') + '<p>Alfa</p>'
  const events = buildSectionEventsFromHtml({ pageId: 'p1', pageName: 'Página', previousHtml, nextHtml })
  assert.equal(events.length, 1)
  assert.equal(events[0].sectionName, 'Uno renombrada')
  assert.deepEqual(events[0].changeTypes, ['section_renamed'])
})

// -------- 8. Sección movida --------

test('dos secciones intercambian posición: ambas emiten section_moved con los índices correctos', () => {
  const previousHtml = d('a', 'Uno') + '<p>Alfa</p>' + d('b', 'Dos') + '<p>Beta</p>'
  const nextHtml = d('b', 'Dos') + '<p>Beta</p>' + d('a', 'Uno') + '<p>Alfa</p>'
  const events = buildSectionEventsFromHtml({ pageId: 'p1', pageName: 'Página', previousHtml, nextHtml })
  assert.equal(events.length, 2)
  const eventB = events.find((e) => e.sectionId === 'b')
  const eventA = events.find((e) => e.sectionId === 'a')
  assert.deepEqual(eventB.changeTypes, ['section_moved'])
  assert.equal(eventB.previousIndex, 1)
  assert.equal(eventB.nextIndex, 0)
  assert.deepEqual(eventA.changeTypes, ['section_moved'])
  assert.equal(eventA.previousIndex, 0)
  assert.equal(eventA.nextIndex, 1)
})

// -------- 9. Tabla eliminada dentro de una sección que persiste --------
// Caso real que motivó este módulo: un LLM edita vía MCP y borra una tabla
// sin que quede rastro. text_changed co-ocurre a propósito: el texto de una
// tabla SÍ cuenta como "cuerpo" en el builder del navegador (getSectionStats
// solo excluye el texto de los headings del cuerpo, no el de las tablas), así
// que este módulo replica esa misma no-exclusión.

test('tabla eliminada (la sección sigue existiendo): emite table_changed (y text_changed, ver comentario)', () => {
  const previousHtml = d('a', 'Uno') + '<p>Intro</p><table><tr><td>Dato</td></tr></table>'
  const nextHtml = d('a', 'Uno') + '<p>Intro</p>'
  const events = buildSectionEventsFromHtml({ pageId: 'p1', pageName: 'Página', previousHtml, nextHtml })
  assert.equal(events.length, 1)
  assert.deepEqual(events[0].changeTypes, ['table_changed', 'text_changed'])
})

test('tabla con contenido distinto (misma sección, mismo texto fuera de la tabla): emite table_changed', () => {
  const previousHtml = d('a', 'Uno') + '<table><tr><td>Fila vieja</td></tr></table>'
  const nextHtml = d('a', 'Uno') + '<table><tr><td>Fila nueva</td></tr></table>'
  const events = buildSectionEventsFromHtml({ pageId: 'p1', pageName: 'Página', previousHtml, nextHtml })
  assert.equal(events.length, 1)
  // El texto de la celda también es "cuerpo", así que text_changed co-ocurre.
  assert.deepEqual(events[0].changeTypes, ['table_changed', 'text_changed'])
})

// -------- 10. Imagen agregada / quitada / cambiada --------

test('imagen agregada: emite solo image_added (img no aporta texto)', () => {
  const previousHtml = d('a', 'Uno') + '<p>Texto</p>'
  const nextHtml = d('a', 'Uno') + '<p>Texto</p><img src="https://example.com/a.png" alt="A">'
  const events = buildSectionEventsFromHtml({ pageId: 'p1', pageName: 'Página', previousHtml, nextHtml })
  assert.equal(events.length, 1)
  assert.deepEqual(events[0].changeTypes, ['image_added'])
})

test('imagen quitada: emite solo image_removed', () => {
  const previousHtml = d('a', 'Uno') + '<p>Texto</p><img src="https://example.com/a.png" alt="A">'
  const nextHtml = d('a', 'Uno') + '<p>Texto</p>'
  const events = buildSectionEventsFromHtml({ pageId: 'p1', pageName: 'Página', previousHtml, nextHtml })
  assert.equal(events.length, 1)
  assert.deepEqual(events[0].changeTypes, ['image_removed'])
})

test('imagen cambiada (mismo count, distinto src): emite solo image_changed', () => {
  const previousHtml = d('a', 'Uno') + '<img src="https://example.com/old.png" alt="A">'
  const nextHtml = d('a', 'Uno') + '<img src="https://example.com/new.png" alt="A">'
  const events = buildSectionEventsFromHtml({ pageId: 'p1', pageName: 'Página', previousHtml, nextHtml })
  assert.equal(events.length, 1)
  assert.deepEqual(events[0].changeTypes, ['image_changed'])
})

// -------- 11. CTA agregado / quitado / cambiado --------
// El CTA real (ver ProjectEditor.jsx renderHTML del nodo ctaButton) serializa
// su label visible como texto dentro de un <a>, así que agregar/quitar un CTA
// también cambia el "cuerpo" — text_changed co-ocurre a propósito, igual que
// en el builder del navegador (ninguno de los dos excluye el texto de un CTA
// del cálculo de bodyText, solo excluyen el texto de los headings).

test('CTA agregado: emite cta_added (y text_changed, ver comentario)', () => {
  const previousHtml = d('a', 'Uno') + '<p>Texto</p>'
  const nextHtml = d('a', 'Uno') + '<p>Texto</p>' + cta('Comprar', 'https://x.com/comprar')
  const events = buildSectionEventsFromHtml({ pageId: 'p1', pageName: 'Página', previousHtml, nextHtml })
  assert.equal(events.length, 1)
  assert.deepEqual(events[0].changeTypes, ['cta_added', 'text_changed'])
})

test('CTA quitado: emite cta_removed (y text_changed, ver comentario)', () => {
  const previousHtml = d('a', 'Uno') + '<p>Texto</p>' + cta('Comprar', 'https://x.com/comprar')
  const nextHtml = d('a', 'Uno') + '<p>Texto</p>'
  const events = buildSectionEventsFromHtml({ pageId: 'p1', pageName: 'Página', previousHtml, nextHtml })
  assert.equal(events.length, 1)
  assert.deepEqual(events[0].changeTypes, ['cta_removed', 'text_changed'])
})

test('CTA cambiado (misma cantidad, mismo label, distinta url): emite solo cta_changed', () => {
  const previousHtml = d('a', 'Uno') + cta('Comprar', 'https://old.com')
  const nextHtml = d('a', 'Uno') + cta('Comprar', 'https://new.com')
  const events = buildSectionEventsFromHtml({ pageId: 'p1', pageName: 'Página', previousHtml, nextHtml })
  assert.equal(events.length, 1)
  // El label ("Comprar") no cambió, así que el texto visible del <a> es
  // idéntico en ambos lados: solo cambia la firma cta (url), no el cuerpo.
  assert.deepEqual(events[0].changeTypes, ['cta_changed'])
})

// -------- 12. HTML sin dividers → pseudo-sección __document__ --------

test('html sin dividers (document/faq): idéntico no produce eventos', () => {
  const html = '<p>Documento sin cambios</p>'
  const events = buildSectionEventsFromHtml({ pageId: 'p1', pageName: 'Doc', previousHtml: html, nextHtml: html })
  assert.deepEqual(events, [])
})

test('html sin dividers (document/faq): cambia y se agrupa bajo sectionId __document__', () => {
  const previousHtml = '<p>Documento base</p>'
  const nextHtml = '<p>Documento actualizado</p>'
  const events = buildSectionEventsFromHtml({ pageId: 'p1', pageName: 'Doc', previousHtml, nextHtml })
  assert.equal(events.length, 1)
  assert.equal(events[0].sectionId, '__document__')
  assert.equal(events[0].sectionName, 'Documento')
  assert.deepEqual(events[0].changeTypes, ['text_changed'])
  assert.equal(events[0].previousIndex, 0)
  assert.equal(events[0].nextIndex, 0)
})

// -------- 13. Entradas nulas/vacías: nunca lanza --------

test('entradas nulas/vacías/incompletas: nunca lanza, siempre devuelve []', () => {
  assert.deepEqual(buildSectionEventsFromHtml(), [])
  assert.deepEqual(buildSectionEventsFromHtml(null), [])
  assert.deepEqual(buildSectionEventsFromHtml(undefined), [])
  assert.deepEqual(buildSectionEventsFromHtml({}), [])
  assert.deepEqual(buildSectionEventsFromHtml({ pageId: 'p1' }), [])
  assert.deepEqual(buildSectionEventsFromHtml({ pageId: 'p1', previousHtml: null, nextHtml: undefined }), [])
  assert.deepEqual(buildSectionEventsFromHtml({ pageId: 'p1', previousHtml: '', nextHtml: '' }), [])
  // pageId falsy (incluida cadena vacía y 0): se descarta antes de diffear,
  // igual que haría normalizeSectionActivityEvent() río abajo.
  assert.deepEqual(
    buildSectionEventsFromHtml({ pageId: '', pageName: 'X', previousHtml: '<p>a</p>', nextHtml: '<p>b</p>' }),
    []
  )
  assert.deepEqual(
    buildSectionEventsFromHtml({ pageId: null, pageName: 'X', previousHtml: '<p>a</p>', nextHtml: '<p>b</p>' }),
    []
  )
})

test('tipos inesperados en previousHtml/nextHtml (no-string): nunca lanza, devuelve []', () => {
  assert.doesNotThrow(() => buildSectionEventsFromHtml({ pageId: 'p1', previousHtml: 12345, nextHtml: true }))
  assert.deepEqual(buildSectionEventsFromHtml({ pageId: 'p1', previousHtml: 12345, nextHtml: true }), [])
  assert.doesNotThrow(() => buildSectionEventsFromHtml({ pageId: 'p1', previousHtml: {}, nextHtml: [] }))
  assert.deepEqual(buildSectionEventsFromHtml({ pageId: 'p1', previousHtml: {}, nextHtml: [] }), [])
})

// -------- 14. Integración: agregar + editar + eliminar en una sola llamada --------

test('integración: sección editada + sección nueva + sección eliminada en un solo diff, orden y forma de evento correctos', () => {
  const previousHtml = d('a', 'Uno') + '<p>Alfa</p>' + d('b', 'Dos') + '<p>Beta</p>'
  const nextHtml = d('a', 'Uno') + '<p>Alfa editada</p>' + d('c', 'Tres') + '<p>Gamma</p>'
  const events = buildSectionEventsFromHtml({ pageId: 'page-x', pageName: 'Mi Página', previousHtml, nextHtml })

  assert.equal(events.length, 3)
  // Orden: primero las secciones de nextHtml (a, c), después las eliminadas de previousHtml (b).
  assert.deepEqual(events.map((e) => e.sectionId), ['a', 'c', 'b'])

  const eventA = events.find((e) => e.sectionId === 'a')
  assert.deepEqual(eventA.changeTypes, ['text_changed'])
  assert.equal(eventA.pageId, 'page-x')
  assert.equal(eventA.pageName, 'Mi Página')
  assert.equal(eventA.previousIndex, 0)
  assert.equal(eventA.nextIndex, 0)
  assert.equal(eventA.sectionHtml, '<p>Alfa editada</p>')

  const eventC = events.find((e) => e.sectionId === 'c')
  assert.deepEqual(eventC.changeTypes, ['section_added'])
  assert.equal(eventC.previousIndex, null)
  assert.equal(eventC.nextIndex, 1)
  assert.equal(eventC.sectionHtml, '<p>Gamma</p>')

  const eventB = events.find((e) => e.sectionId === 'b')
  assert.deepEqual(eventB.changeTypes, ['section_removed'])
  assert.equal(eventB.previousIndex, 1)
  assert.equal(eventB.nextIndex, null)
  assert.equal('sectionHtml' in eventB, false)
})
