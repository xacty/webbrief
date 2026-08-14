// Diff a nivel bloque dentro de UNA sección "Modificada" del comparador de
// propuestas (ver frontend/src/lib/proposalDiff.js para el diff a nivel
// sección). El problema real: una sección `changed` solo mostraba el HTML
// propuesto entero — el revisor no podía ver QUÉ cambió adentro sin comparar
// a ojo contra lo publicado. Este módulo parte ambas versiones en bloques
// top-level y anota cada uno como agregado/eliminado/modificado/intacto para
// que el panel pinte colores por bloque.
//
// Puro y sin DOM: corre igual en el navegador y en node (tests, node:test).
// Import con extensión explícita por el mismo motivo que proposalDiff.js.
import { diffWords } from 'diff'
import { normalizeHtml } from './sectionMerge.js'

// Elementos que nunca llevan tag de cierre — un bloque que empieza en uno de
// estos es atómico (una sola "pieza"), no hay que buscar su </tag>.
const VOID_ELEMENTS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img',
  'input', 'link', 'meta', 'param', 'source', 'track', 'wbr',
])

// Bloques "de texto": los únicos elegibles para diff palabra por palabra.
// Listas/tablas/imágenes se tratan como unidad atómica (ver TAREA punto 1) —
// diffear texto plano de una tabla perdería la estructura de filas/celdas.
const TEXT_TAGS = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote'])

// Tokenizer quote-aware: separa tags de apertura/cierre/self-closing del
// texto entre ellos. Mismo criterio que TAG_RE/DIVIDER_RE de sectionMerge.js
// — un atributo entre comillas puede contener ">" literal sin cortar el tag
// antes de tiempo (p.ej. un link con title="A > B").
const TAG_TOKEN_RE = /<!--[\s\S]*?-->|<\/([a-zA-Z][a-zA-Z0-9-]*)\s*>|<([a-zA-Z][a-zA-Z0-9-]*)((?:[^<>"]|"[^"]*")*)>/g

// Matchea cualquier tag (apertura, cierre o self-closing) quote-aware, para
// pelar tags de un fragmento y quedarse solo con el texto.
const ANY_TAG_RE = /<\/?[a-zA-Z][a-zA-Z0-9-]*(?:[^<>"]|"[^"]*")*\/?>|<!--[\s\S]*?-->/g

function tokenize(html) {
  const tokens = []
  const re = new RegExp(TAG_TOKEN_RE.source, 'g')
  let last = 0
  let match
  while ((match = re.exec(html))) {
    if (match.index > last) tokens.push({ type: 'text', start: last, end: match.index })
    if (match[0].startsWith('<!--')) {
      // Los comentarios no cuentan como contenido ni abren/cierran nada.
      tokens.push({ type: 'comment', start: match.index, end: re.lastIndex })
    } else if (match[1]) {
      tokens.push({ type: 'close', name: match[1].toLowerCase(), start: match.index, end: re.lastIndex })
    } else {
      const name = match[2].toLowerCase()
      const rawAttrs = match[3] || ''
      const selfClosing = /\/\s*$/.test(rawAttrs) || VOID_ELEMENTS.has(name)
      tokens.push({ type: selfClosing ? 'void' : 'open', name, start: match.index, end: re.lastIndex })
    }
    last = re.lastIndex
  }
  if (last < html.length) tokens.push({ type: 'text', start: last, end: html.length })
  return tokens
}

// Divide el HTML de una sección en bloques de primer nivel. El contenido
// anidado (filas de una tabla, items de una lista) nunca se parte: se cuenta
// la profundidad de apertura/cierre de forma genérica (sin matchear nombres
// de tag) porque el HTML que llega acá siempre es bien formado (serializado
// por TipTap o guardado tal cual desde el servidor) — cualquier tag de
// cierre baja la profundidad en 1 sin importar cuál sea, y eso alcanza para
// saber cuándo un bloque top-level terminó.
export function splitTopLevelBlocks(html) {
  const source = html || ''
  if (!source.trim()) return []
  const tokens = tokenize(source)
  const blocks = []
  let depth = 0
  let blockStart = null
  let blockTagName = null
  for (const token of tokens) {
    if (blockStart === null) {
      if (token.type === 'text') {
        const text = source.slice(token.start, token.end)
        if (!text.trim()) continue
        // Texto suelto sin tag envolvente en el top level (caso raro con
        // HTML legacy): se trata como su propio bloque atómico, tagName
        // null lo excluye de la elegibilidad para diff palabra por palabra.
        blocks.push({ tagName: null, html: text })
        continue
      }
      if (token.type === 'comment') continue
      if (token.type === 'void') {
        blocks.push({ tagName: token.name, html: source.slice(token.start, token.end) })
        continue
      }
      // token.type === 'open': arranca un bloque top-level.
      blockStart = token.start
      blockTagName = token.name
      depth = 1
      continue
    }
    // Dentro de un bloque abierto: solo open/close mueven la profundidad.
    if (token.type === 'open') depth += 1
    else if (token.type === 'close') {
      depth -= 1
      if (depth === 0) {
        blocks.push({ tagName: blockTagName, html: source.slice(blockStart, token.end) })
        blockStart = null
        blockTagName = null
      }
    }
  }
  // HTML malformado con un tag sin cerrar: se conserva el resto como bloque
  // en vez de perderlo en silencio.
  if (blockStart !== null) {
    blocks.push({ tagName: blockTagName, html: source.slice(blockStart) })
  }
  return blocks
}

// LCS clásico por igualdad de normalizeHtml(bloque) — mismo criterio de
// "cambió" que el resto del comparador (diferencias cosméticas de
// serialización no cuentan). Devuelve pares [oldIndex, newIndex] en orden
// creciente en ambos arrays.
function computeLcsMatches(oldBlocks, newBlocks) {
  const oldKeys = oldBlocks.map((b) => normalizeHtml(b.html))
  const newKeys = newBlocks.map((b) => normalizeHtml(b.html))
  const n = oldKeys.length
  const m = newKeys.length
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      dp[i][j] = oldKeys[i] === newKeys[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }
  const matches = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (oldKeys[i] === newKeys[j]) {
      matches.push([i, j])
      i += 1
      j += 1
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      i += 1
    } else {
      j += 1
    }
  }
  return matches
}

function decodeEntities(text) {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

// Texto plano de un bloque para el diff palabra por palabra: pela tags
// (quote-aware, mismo criterio que el resto del módulo) y decodifica
// entities para comparar el texto real, no su serialización.
function blockPlainText(block) {
  const withoutTags = block.html.replace(ANY_TAG_RE, ' ')
  return decodeEntities(withoutTags).replace(/\s+/g, ' ').trim()
}

// Escapa el texto plano al reconstruir HTML de un bloque `modified`. Nunca
// se reinyecta el HTML original de ninguno de los dos lados: el resultado es
// SIEMPRE texto plano escapado envuelto en <ins>/<del>, así que perder el
// formato inline (bold, links, etc.) dentro de un bloque modificado es una
// decisión consciente, no un bug — reconstruir HTML enriquecido a partir de
// un diff de texto plano requeriría alinear nodos inline con el texto, que
// es un problema bastante más grande y no vale la pena para este panel de
// solo lectura.
function escapeText(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function buildModifiedBlock(oldBlock, newBlock) {
  const oldText = blockPlainText(oldBlock)
  const newText = blockPlainText(newBlock)
  const parts = diffWords(oldText, newText)
  const inner = parts.map((part) => {
    const escaped = escapeText(part.value)
    if (part.added) return `<ins class="__wb-diff-ins">${escaped}</ins>`
    if (part.removed) return `<del class="__wb-diff-del">${escaped}</del>`
    return escaped
  }).join('')
  const tag = newBlock.tagName
  return { type: 'modified', tagName: tag, html: `<${tag}>${inner}</${tag}>` }
}

/**
 * @param {string} publishedInnerHtml innerHtml de la sección en lo publicado
 * @param {string} proposalInnerHtml  innerHtml de la misma sección en la propuesta
 * @returns {{
 *   blocks: Array<{type: 'unchanged'|'added'|'removed'|'modified', tagName: string|null, html: string}>,
 *   hasChanges: boolean,
 * }}
 *
 * `blocks` va en orden de lectura: los bloques `unchanged` conservan su
 * posición relativa; en cada hueco entre matches, los `removed` (viejos)
 * salen antes que los `added` (nuevos) — mismo criterio que un diff unificado.
 */
export function diffProposalBlocks(publishedInnerHtml, proposalInnerHtml) {
  const oldBlocks = splitTopLevelBlocks(publishedInnerHtml)
  const newBlocks = splitTopLevelBlocks(proposalInnerHtml)
  const matches = computeLcsMatches(oldBlocks, newBlocks)

  const blocks = []
  let hasChanges = false
  let oldCursor = 0
  let newCursor = 0

  function flushGap(oldEnd, newEnd) {
    const oldGap = oldBlocks.slice(oldCursor, oldEnd)
    const newGap = newBlocks.slice(newCursor, newEnd)
    if (!oldGap.length && !newGap.length) return
    hasChanges = true
    if (
      oldGap.length === 1 && newGap.length === 1
      && TEXT_TAGS.has(oldGap[0].tagName) && TEXT_TAGS.has(newGap[0].tagName)
    ) {
      blocks.push(buildModifiedBlock(oldGap[0], newGap[0]))
      return
    }
    oldGap.forEach((block) => blocks.push({ type: 'removed', tagName: block.tagName, html: block.html }))
    newGap.forEach((block) => blocks.push({ type: 'added', tagName: block.tagName, html: block.html }))
  }

  matches.forEach(([oi, ni]) => {
    flushGap(oi, ni)
    // Bloque intacto: se pinta el HTML de la propuesta (lo que se publicaría
    // al aprobar) — normalizeHtml ya garantiza que el contenido es
    // equivalente, solo puede diferir en serialización cosmética.
    blocks.push({ type: 'unchanged', tagName: newBlocks[ni].tagName, html: newBlocks[ni].html })
    oldCursor = oi + 1
    newCursor = ni + 1
  })
  flushGap(oldBlocks.length, newBlocks.length)

  return { blocks, hasChanges }
}
