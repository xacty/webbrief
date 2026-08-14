import assert from 'node:assert/strict'
import { test } from 'node:test'
import { diffProposalBlocks, splitTopLevelBlocks } from '../../frontend/src/lib/proposalBlockDiff.js'

// -------- 1. Sin cambios --------

test('sección idéntica: todo unchanged, hasChanges false', () => {
  const html = '<p>alfa</p><p>beta</p>'
  const result = diffProposalBlocks(html, html)
  assert.equal(result.hasChanges, false)
  assert.deepEqual(result.blocks.map((b) => b.type), ['unchanged', 'unchanged'])
  assert.equal(result.blocks[0].html, '<p>alfa</p>')
  assert.equal(result.blocks[1].html, '<p>beta</p>')
})

test('diferencias cosméticas de serialización (orden de atributos/espacios) NO cuentan como cambio', () => {
  const published = '<img src="a" alt="b">'
  const proposal = '<img   alt="b"    src="a"  >'
  const result = diffProposalBlocks(published, proposal)
  assert.equal(result.hasChanges, false)
  assert.deepEqual(result.blocks.map((b) => b.type), ['unchanged'])
})

// -------- 2. Párrafo agregado / eliminado --------

test('párrafo agregado al final: unchanged + added, en ese orden', () => {
  const result = diffProposalBlocks('<p>uno</p>', '<p>uno</p><p>dos</p>')
  assert.deepEqual(result.blocks.map((b) => b.type), ['unchanged', 'added'])
  assert.equal(result.blocks[1].html, '<p>dos</p>')
  assert.equal(result.blocks[1].tagName, 'p')
  assert.equal(result.hasChanges, true)
})

test('párrafo eliminado: unchanged + removed, con el html original intacto', () => {
  const result = diffProposalBlocks('<p>uno</p><p>dos</p>', '<p>uno</p>')
  assert.deepEqual(result.blocks.map((b) => b.type), ['unchanged', 'removed'])
  assert.equal(result.blocks[1].html, '<p>dos</p>')
})

// -------- 3. Palabra cambiada dentro de un párrafo (word-diff) --------

test('párrafo con una palabra cambiada: modified con <ins>/<del> correctos', () => {
  const result = diffProposalBlocks('<p>Hola mundo</p>', '<p>Hola planeta</p>')
  assert.equal(result.blocks.length, 1)
  const block = result.blocks[0]
  assert.equal(block.type, 'modified')
  assert.equal(block.tagName, 'p')
  assert.ok(block.html.startsWith('<p>') && block.html.endsWith('</p>'))
  assert.match(block.html, /<del class="__wb-diff-del">mundo<\/del>/)
  assert.match(block.html, /<ins class="__wb-diff-ins">planeta<\/ins>/)
})

test('word-diff escapa texto plano: &, <, >, " no rompen la reconstrucción', () => {
  const result = diffProposalBlocks('<p>Antes &amp; despues</p>', '<p>Antes &amp; ahora</p>')
  const block = result.blocks[0]
  assert.equal(block.type, 'modified')
  // El "&" literal (decodificado del &amp; original) vuelve a escaparse al
  // reconstruir — si no, el HTML resultante quedaría corrupto.
  assert.match(block.html, /^<p>Antes &amp; /)
  assert.match(block.html, /<del class="__wb-diff-del">despues<\/del>/)
  assert.match(block.html, /<ins class="__wb-diff-ins">ahora<\/ins><\/p>$/)
  // No debe quedar ningún "&" ni "<"/">" sin escapar dentro del texto reconstruido.
  const textOnly = block.html.replace(/<\/?(p|ins|del)[^>]*>/g, '')
  assert.doesNotMatch(textOnly, /&(?!amp;|lt;|gt;|quot;)/)
})

// -------- 4. Imagen agregada (bloque atómico) --------

test('imagen agregada sin width: added atómico, no entra a word-diff', () => {
  const result = diffProposalBlocks(
    '<p>x</p>',
    '<p>x</p><img src="https://ik.imagekit.io/webrief/y.png" alt="y">',
  )
  assert.deepEqual(result.blocks.map((b) => b.type), ['unchanged', 'added'])
  const imgBlock = result.blocks[1]
  assert.equal(imgBlock.tagName, 'img')
  assert.equal(imgBlock.html, '<img src="https://ik.imagekit.io/webrief/y.png" alt="y">')
})

// -------- 5. Tabla modificada: atómica, sin word-diff --------

test('tabla modificada: removed + added completos, nunca modified (no es tag de texto)', () => {
  const oldTable = '<table><tr><td>a</td></tr></table>'
  const newTable = '<table><tr><td>b</td></tr></table>'
  const result = diffProposalBlocks(oldTable, newTable)
  assert.deepEqual(result.blocks.map((b) => b.type), ['removed', 'added'])
  assert.equal(result.blocks[0].html, oldTable)
  assert.equal(result.blocks[1].html, newTable)
})

// -------- 6. Atributo con ">" no rompe el split --------

test('atributo con ">" literal entre comillas no corta el bloque antes de tiempo', () => {
  const html = '<p><a title="A > B" href="https://x">link</a> texto</p>'
  const blocks = splitTopLevelBlocks(html)
  assert.equal(blocks.length, 1)
  assert.equal(blocks[0].tagName, 'p')
  assert.equal(blocks[0].html, html)
})

// -------- 7. HTML vacío en cualquiera de los dos lados --------

test('ambos lados vacíos: sin bloques, hasChanges false', () => {
  const result = diffProposalBlocks('', '')
  assert.deepEqual(result.blocks, [])
  assert.equal(result.hasChanges, false)
})

test('publicado vacío, propuesta con contenido: todo added', () => {
  const result = diffProposalBlocks('', '<p>nuevo</p><p>otro</p>')
  assert.deepEqual(result.blocks.map((b) => b.type), ['added', 'added'])
  assert.equal(result.hasChanges, true)
})

test('propuesta vacía, publicado con contenido: todo removed', () => {
  const result = diffProposalBlocks('<p>viejo</p>', '')
  assert.deepEqual(result.blocks.map((b) => b.type), ['removed'])
  assert.equal(result.hasChanges, true)
})

// -------- 8. Orden de bloques preservado --------

test('orden de bloques preservado: unchanged/modified/removed/added en orden de lectura', () => {
  // Dos anclas iguales a ambos lados ("intro", "ancla") delimitan dos huecos
  // separados: uno 1-viejo/1-nuevo (modified) y otro tabla→párrafo (no es
  // 1 <p> contra 1 <p>, así que queda removed+added).
  const published = '<p>intro</p><p>texto original</p><p>ancla</p><table><tr><td>t</td></tr></table>'
  const proposal = '<p>intro</p><p>texto nuevo</p><p>ancla</p><p>agregado al final</p>'
  const result = diffProposalBlocks(published, proposal)
  assert.deepEqual(result.blocks.map((b) => b.type), [
    'unchanged', 'modified', 'unchanged', 'removed', 'added',
  ])
  assert.equal(result.blocks[0].html, '<p>intro</p>')
  assert.match(result.blocks[1].html, /<del class="__wb-diff-del">original<\/del>/)
  assert.match(result.blocks[1].html, /<ins class="__wb-diff-ins">nuevo<\/ins>/)
  assert.equal(result.blocks[2].html, '<p>ancla</p>')
  assert.equal(result.blocks[3].type, 'removed')
  assert.equal(result.blocks[4].html, '<p>agregado al final</p>')
})

// -------- 9. Reemplazo múltiple en el mismo hueco: no aplica word-diff --------

test('hueco con más de un bloque viejo o nuevo: removed+added, no modified', () => {
  const result = diffProposalBlocks('<p>uno</p>', '<p>dos</p><p>tres</p>')
  assert.deepEqual(result.blocks.map((b) => b.type), ['removed', 'added', 'added'])
})

// -------- 10. splitTopLevelBlocks: contenido anidado no se parte --------

test('splitTopLevelBlocks: lista con varios <li> es un único bloque atómico', () => {
  const html = '<ul><li>a</li><li>b</li></ul><p>después</p>'
  const blocks = splitTopLevelBlocks(html)
  assert.equal(blocks.length, 2)
  assert.equal(blocks[0].tagName, 'ul')
  assert.equal(blocks[0].html, '<ul><li>a</li><li>b</li></ul>')
  assert.equal(blocks[1].html, '<p>después</p>')
})

test('splitTopLevelBlocks: html vacío o solo espacios devuelve []', () => {
  assert.deepEqual(splitTopLevelBlocks(''), [])
  assert.deepEqual(splitTopLevelBlocks('   \n  '), [])
  assert.deepEqual(splitTopLevelBlocks(null), [])
})

test('h1-h6 y blockquote son elegibles para word-diff igual que p', () => {
  const result = diffProposalBlocks('<h2>Título viejo</h2>', '<h2>Título nuevo</h2>')
  assert.equal(result.blocks[0].type, 'modified')
  assert.equal(result.blocks[0].tagName, 'h2')
})
