// shared/sectionEvents.js
//
// Node-side (no DOM) twin of the section-diffing logic that lives in
// frontend/src/pages/ProjectEditor.jsx (buildSectionActivityEvents /
// summarizeSectionChanges / getSectionStats, ~L1869-2016).
//
// Why this exists: when the browser saves a page it diffs previous vs next
// HTML client-side (via DOMParser) and ships the resulting `sectionEvents[]`
// array alongside the save; `backend/src/lib/projectAccess.js`'s
// `recordSectionEditActivities` turns that into `project_activity` rows —
// the per-section edit history that powers the activity panel and lets a
// deleted section's last HTML be recovered. When an MCP client (an LLM)
// edits page HTML directly against the backend, there is no browser and no
// `sectionEvents[]` is ever computed — so MCP-driven edits (including
// content deletions) left no trace and nothing to restore. This module
// recomputes the same `sectionEvents[]` shape from two raw HTML strings, in
// pure JS, so any server-side write path can call it.
//
// Contract: pure ESM, zero npm dependencies, no DOM / `document.*` globals —
// must run under plain Node (backend is `"type": "module"`, the MCP server
// is its own Node process, tests run under `node --test`). Do NOT import
// anything from `frontend/src` here — that would pull browser-only code
// into the backend/MCP server runtime.
//
// Single public export:
//   buildSectionEventsFromHtml({ pageId, pageName, previousHtml, nextHtml })
//     -> Array<{ pageId, pageName, sectionId, sectionName, changeTypes: string[],
//                previousIndex: number|null, nextIndex: number|null, sectionHtml?: string }>
//
// The returned events match the shape `recordSectionEditActivities` expects
// (see backend/src/lib/projectAccess.js:277 and its `normalizeSectionActivityEvent`
// helper just above it).

// ---------------------------------------------------------------------------
// Section splitting — deliberate duplicate of the divider regex and
// `splitSections()` from frontend/src/lib/sectionMerge.js:37. That file
// lives under frontend/src and is only ever meant to be reachable from the
// browser bundle; this module must stay backend/MCP-reachable and DOM-free,
// so importing it directly is not an option. Keep the two in sync if the
// `data-section-divider` markup ever changes shape.
// ---------------------------------------------------------------------------

// Quote-aware: an attribute value can contain a literal ">" (e.g. a section
// named "Servicios > Precios") without cutting the divider tag short.
const DIVIDER_RE = /<div(?:[^>"]|"[^"]*")*\bdata-section-divider\b(?:[^>"]|"[^"]*")*>\s*<\/div>/gi

function unescapeAttr(value) {
  return String(value ?? '')
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
}

function attr(tag, name) {
  const match = new RegExp(`${name}="([^"]*)"`).exec(tag)
  return match ? unescapeAttr(match[1]) : ''
}

// Splits page HTML into sections at each `data-section-divider`. Two
// pseudo-sections mirror the sectionMerge.js twin: `__document__` for HTML
// with no dividers at all (document/faq project types have none), and
// `__preamble__` for any content sitting before the first divider. This is
// intentionally MORE than what the browser's `buildSectionActivityEvents`
// itself does (it calls `parseSectionsFromHtml`, which silently drops
// preamble content and returns `[]` for divider-less HTML) — see the
// divergence note in the module's consumer-facing docs.
function splitSections(html) {
  const source = html || ''
  const re = new RegExp(DIVIDER_RE.source, DIVIDER_RE.flags)
  const dividers = []
  let match
  while ((match = re.exec(source))) dividers.push({ start: match.index, end: re.lastIndex, tag: match[0] })

  if (dividers.length === 0) {
    const body = source.trim()
    if (!body) return []
    return [{ sectionId: '__document__', sectionName: 'Documento', innerHtml: source, position: 0 }]
  }

  const sections = []
  const preamble = source.slice(0, dividers[0].start)
  if (preamble.trim()) {
    sections.push({ sectionId: '__preamble__', sectionName: 'Contenido inicial', innerHtml: preamble, position: 0 })
  }
  dividers.forEach((div, i) => {
    sections.push({
      sectionId: attr(div.tag, 'data-section-id'),
      sectionName: attr(div.tag, 'data-section-name') || 'Sección',
      innerHtml: source.slice(div.end, dividers[i + 1] ? dividers[i + 1].start : source.length),
      position: sections.length,
    })
  })
  return sections
}

// ---------------------------------------------------------------------------
// Plain-text / signature extraction without DOM — the Node equivalent of
// `getSectionStats()`. These regexes only need to change their output when
// the underlying content actually changes; they are intentionally NOT a
// full HTML parser (no handling of same-tag nesting, comments, CDATA,
// malformed markup, etc. — acceptable per spec: signatures just need to be
// stable and content-sensitive, not byte-perfect).
// ---------------------------------------------------------------------------

// Quote-aware opening tag: attribute values may contain a literal ">".
const OPEN_TAG_RE = /<([a-zA-Z][a-zA-Z0-9-]*)((?:[^<>"]|"[^"]*")*)>/g
const ANY_TAG_RE = /<(?:[^<>"]|"[^"]*")*>/g
// Non-greedy: a heading nested inside another heading (invalid HTML, never
// produced by this editor) would confuse this — an accepted gap.
const HEADING_RE = /<h([1-6])\b(?:[^<>"]|"[^"]*")*>([\s\S]*?)<\/h\1>/gi
// Non-greedy: a <table> nested inside another <table> would close on the
// inner </table>. Not produced by this editor's table extension, so this is
// an accepted gap rather than a full parser.
const TABLE_RE = /<table\b(?:[^<>"]|"[^"]*")*>([\s\S]*?)<\/table>/gi

// Decodes the entities the spec calls for. `&amp;` MUST decode last, or a
// source string that spells out a literal ampersand-entity (e.g. "&amp;lt;",
// meaning the two characters "&lt;") would double-decode into "<" instead.
function decodeEntities(value) {
  return String(value ?? '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
}

function normalizeWhitespace(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

// Mirrors DOM `.textContent` closely enough for change detection: tags
// contribute zero characters at their boundary (same as textContent — two
// adjacent block tags with no source whitespace between them collapse
// together with no inserted space), then entities decode, then whitespace
// collapses/trims.
function toPlainText(html) {
  const re = new RegExp(ANY_TAG_RE.source, ANY_TAG_RE.flags)
  return normalizeWhitespace(decodeEntities(String(html || '').replace(re, '')))
}

function extractAttr(tagSource, name) {
  // Requires the character right before the attribute name to be whitespace
  // or a quote (end of a previous attribute's value) — a plain `\b` would
  // also "match" mid-token right after a hyphen (e.g. extracting "src" out
  // of a hypothetical "data-original-src"), silently returning the wrong
  // attribute's value instead of the intended one.
  const match = new RegExp(`[\\s"]${name}\\s*=\\s*"([^"]*)"`, 'i').exec(tagSource)
  return match ? decodeEntities(match[1]) : ''
}

const EMPTY_SECTION_STATS = {
  text: '',
  textBody: '',
  headingSignature: '',
  ctaCount: 0,
  ctaSignature: '',
  imageCount: 0,
  imageSignature: '',
  tableSignature: '',
}

function getSectionStatsFromHtml(html) {
  const source = String(html || '')
  if (!source.trim()) return { ...EMPTY_SECTION_STATS }

  const headingRe = new RegExp(HEADING_RE.source, HEADING_RE.flags)
  const headings = []
  let headingMatch
  while ((headingMatch = headingRe.exec(source))) {
    headings.push(`h${headingMatch[1]}|${toPlainText(headingMatch[2])}`)
  }

  const openTagRe = new RegExp(OPEN_TAG_RE.source, OPEN_TAG_RE.flags)
  const ctas = []
  const images = []
  let tagMatch
  while ((tagMatch = openTagRe.exec(source))) {
    const [fullTag, tagName, attrsSource] = tagMatch
    if (/\bdata-cta-button\b/.test(attrsSource)) {
      ctas.push(`${extractAttr(fullTag, 'data-cta-text')}|${extractAttr(fullTag, 'data-cta-url')}`)
    }
    if (tagName.toLowerCase() === 'img') {
      images.push(extractAttr(fullTag, 'src'))
    }
  }

  const tableRe = new RegExp(TABLE_RE.source, TABLE_RE.flags)
  const tables = []
  let tableMatch
  while ((tableMatch = tableRe.exec(source))) {
    tables.push(toPlainText(tableMatch[1]))
  }

  // Body text excludes heading text (tag AND content) so a title edit and a
  // body edit are never confused with each other — same rationale as the
  // DOM twin, which physically removes heading nodes before reading
  // `textContent`.
  const headingStripRe = new RegExp(HEADING_RE.source, HEADING_RE.flags)
  const bodySource = source.replace(headingStripRe, '')

  return {
    text: toPlainText(source),
    textBody: toPlainText(bodySource),
    headingSignature: headings.join('||'),
    ctaCount: ctas.length,
    ctaSignature: ctas.join('||'),
    imageCount: images.length,
    imageSignature: images.join('||'),
    tableSignature: tables.join('||'),
  }
}

// ---------------------------------------------------------------------------
// Change detection — Node twin of `summarizeSectionChanges()`.
// ---------------------------------------------------------------------------

// Cheap "did this section actually change" short-circuit, mirroring the DOM
// twin's `normalizeHtmlForCompare` (which parses+reserializes via DOMParser
// and strips `contenteditable`). This version is deliberately lighter — it
// strips `contenteditable` and collapses whitespace, but does NOT
// canonicalize attribute order/quoting/case the way a real DOM round-trip
// would. Worst case, a purely cosmetic difference that isn't reflected in
// any of the heading/body/cta/image/table signatures either (e.g. attribute
// order on some unrelated tag) falls through to the generic
// `content_changed` catch-all below instead of being fully suppressed here
// — an accepted, documented gap for a regex-only implementation.
function normalizeHtmlForCompare(html) {
  return String(html || '')
    .replace(/\s*\bcontenteditable(?:\s*=\s*"[^"]*")?/gi, '')
    .replace(/>\s+</g, '><')
    .replace(/\s+/g, ' ')
    .trim()
}

// The DOM twin accumulates changeTypes in a Set and returns insertion
// order. There is no DOM-driven traversal order to anchor to here, so this
// sorts alphabetically instead — deterministic and test-stable. Downstream
// (`recordSectionEditActivities` in backend/src/lib/projectAccess.js) only
// ever does `.includes()` / `.length` on changeTypes, never positional
// access, so this reordering is safe.
function sortChangeTypes(changes) {
  return [...changes].sort()
}

function summarizeSectionChanges(previousSection, nextSection, previousIndex, nextIndex) {
  const changes = new Set()

  if (!previousSection && nextSection) {
    changes.add('section_added')
    return sortChangeTypes(changes)
  }

  if (previousSection && !nextSection) {
    changes.add('section_removed')
    return sortChangeTypes(changes)
  }

  if (!previousSection || !nextSection) return []

  if (previousSection.sectionName !== nextSection.sectionName) {
    changes.add('section_renamed')
  }

  if (previousIndex !== nextIndex) {
    changes.add('section_moved')
  }

  const previousComparable = normalizeHtmlForCompare(previousSection.innerHtml)
  const nextComparable = normalizeHtmlForCompare(nextSection.innerHtml)
  if (previousComparable === nextComparable) return sortChangeTypes(changes)

  const previousStats = getSectionStatsFromHtml(previousSection.innerHtml)
  const nextStats = getSectionStatsFromHtml(nextSection.innerHtml)

  // Heading edits emit their own event so the activity feed can distinguish
  // them from body text edits.
  if (previousStats.headingSignature !== nextStats.headingSignature) {
    changes.add('title_changed')
  }
  if (previousStats.textBody !== nextStats.textBody) {
    changes.add('text_changed')
  }

  if (nextStats.ctaCount > previousStats.ctaCount) changes.add('cta_added')
  if (nextStats.ctaCount < previousStats.ctaCount) changes.add('cta_removed')
  if (
    nextStats.ctaCount === previousStats.ctaCount &&
    nextStats.ctaSignature !== previousStats.ctaSignature
  ) {
    changes.add('cta_changed')
  }

  if (nextStats.imageCount > previousStats.imageCount) changes.add('image_added')
  if (nextStats.imageCount < previousStats.imageCount) changes.add('image_removed')
  if (
    nextStats.imageCount === previousStats.imageCount &&
    nextStats.imageSignature !== previousStats.imageSignature
  ) {
    changes.add('image_changed')
  }

  if (nextStats.tableSignature !== previousStats.tableSignature) changes.add('table_changed')
  if (changes.size === 0) changes.add('content_changed')

  return sortChangeTypes(changes)
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Node twin of `buildSectionActivityEvents()`. Diffs `previousHtml` against
 * `nextHtml` for a single page and returns the `sectionEvents[]` array that
 * `recordSectionEditActivities` (backend/src/lib/projectAccess.js:277)
 * expects — the same contract the browser sends on every save.
 *
 * Never throws: any unexpected input shape (null/undefined args, non-string
 * HTML, etc.) resolves to `[]` rather than propagating an exception, since a
 * caller in a save path must never fail the save just because activity
 * recording couldn't be computed.
 *
 * @param {{pageId: string, pageName: string, previousHtml: string, nextHtml: string}} input
 * @returns {Array<{pageId: string, pageName: string, sectionId: string, sectionName: string,
 *   changeTypes: string[], previousIndex: number|null, nextIndex: number|null, sectionHtml?: string}>}
 */
export function buildSectionEventsFromHtml(input) {
  try {
    const { pageId, pageName, previousHtml, nextHtml } = input || {}
    // Events without a pageId would be dropped by normalizeSectionActivityEvent()
    // downstream anyway (backend/src/lib/projectAccess.js) — bail early rather
    // than doing diff work for events that could never be recorded.
    if (!pageId) return []

    const previousSections = splitSections(previousHtml)
    const nextSections = splitSections(nextHtml)
    const previousBySectionId = new Map(
      previousSections.map((section, index) => [section.sectionId, { section, index }])
    )
    const nextSectionIds = new Set(nextSections.map((section) => section.sectionId))

    const events = []

    nextSections.forEach((section, nextIndex) => {
      const previous = previousBySectionId.get(section.sectionId)
      const changeTypes = summarizeSectionChanges(previous?.section, section, previous?.index ?? null, nextIndex)
      if (changeTypes.length === 0) return

      events.push({
        pageId,
        pageName,
        sectionId: section.sectionId,
        sectionName: section.sectionName,
        changeTypes,
        previousIndex: previous?.index ?? null,
        nextIndex,
        sectionHtml: section.innerHtml || '',
      })
    })

    previousSections.forEach((section, previousIndex) => {
      if (nextSectionIds.has(section.sectionId)) return

      // No `sectionHtml` key here — exact parity with the browser twin.
      // normalizeSectionActivityEvent() reads a missing/non-string
      // sectionHtml as "snapshot unavailable", which is the correct meaning
      // for a section that no longer exists in nextHtml.
      events.push({
        pageId,
        pageName,
        sectionId: section.sectionId,
        sectionName: section.sectionName,
        changeTypes: ['section_removed'],
        previousIndex,
        nextIndex: null,
      })
    })

    return events
  } catch {
    return []
  }
}
