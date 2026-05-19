// shared/documentInvariants.js
//
// Server-side validation/repair of WeBrief TipTap `contentJson` documents.
//
// Today, document invariants (sectionDivider presence, section numbering,
// CTA shape, FAQ Q/A pattern, etc.) live ONLY in the frontend TipTap setup.
// When an MCP client (Codex/Claude) sends a programmatic edit, we need the
// same invariants enforced server-side — otherwise an LLM could produce a
// contentJson that breaks the editor.
//
// This module is **pure JS**: no React, no DOM, no `document.*` calls.
// HTML serialization uses `@tiptap/html`'s `generateHTML` with a curated set
// of TipTap node/mark extensions that mirror the editor schema for the
// structural pieces we care about. Rendering logic (NodeViews, React) is
// intentionally NOT mirrored — we only need a stable serialized HTML shape.
//
// Entry point: `ensureInvariants(contentJson, projectType)`.
//
// Supported `projectType` values:
//   - 'page'     — uses sectionDivider model; auto-name "Sección N"
//   - 'faq'      — uses sectionDivider model; auto-name "Pregunta Frecuente N"
//   - 'document' — linear (no sectionDividers); validates structure only
//   - 'brief'    — NOT supported in MCP v1 edits (brief content is not edited
//                  via MCP; only brief RESPONSES are). Returns an error.

import { generateHTML } from '@tiptap/html'
import { Node, Mark, mergeAttributes } from '@tiptap/core'
import { StarterKit } from '@tiptap/starter-kit'
import { Heading } from '@tiptap/extension-heading'
import { Link } from '@tiptap/extension-link'
import { Image } from '@tiptap/extension-image'
import { Underline } from '@tiptap/extension-underline'
import { TextStyle } from '@tiptap/extension-text-style'
import { Color } from '@tiptap/extension-color'
import { Highlight } from '@tiptap/extension-highlight'
import { TextAlign } from '@tiptap/extension-text-align'
import { Table } from '@tiptap/extension-table'
import { TableRow } from '@tiptap/extension-table-row'
import { TableHeader } from '@tiptap/extension-table-header'
import { TableCell } from '@tiptap/extension-table-cell'

// ---------------------------------------------------------------------------
// Constants — kept in sync with frontend/src/pages/ProjectEditor.jsx
// ---------------------------------------------------------------------------

export const SUPPORTED_PROJECT_TYPES = ['page', 'faq', 'document']
export const ALL_PROJECT_TYPES = ['page', 'faq', 'document', 'brief']

const AUTO_SECTION_NAME_RE = /^Sección (\d+)$/
const AUTO_FAQ_SECTION_NAME_RE = /^Pregunta Frecuente (\d+)$/

const DEFAULT_AUTO_NAME = {
  page: 'Sección',
  faq: 'Pregunta Frecuente',
}

function autoNameFor(projectType, ordinal) {
  const prefix = DEFAULT_AUTO_NAME[projectType] || 'Sección'
  return `${prefix} ${ordinal}`
}

function isAutoSectionName(name, projectType) {
  const trimmed = (name || '').trim()
  if (projectType === 'faq') return AUTO_FAQ_SECTION_NAME_RE.test(trimmed)
  return AUTO_SECTION_NAME_RE.test(trimmed)
}

// ---------------------------------------------------------------------------
// Schema mirror — minimal TipTap node definitions for serialization only.
// These mirror the structural attrs/HTML the frontend produces. No NodeViews,
// no React, no DOM event handlers.
// ---------------------------------------------------------------------------

const SectionDividerNode = Node.create({
  name: 'sectionDivider',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      sectionId: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-section-id') || '',
        renderHTML: (attrs) => ({ 'data-section-id': attrs.sectionId }),
      },
      sectionName: {
        default: 'Section',
        parseHTML: (el) => el.getAttribute('data-section-name') || 'Section',
        renderHTML: (attrs) => ({ 'data-section-name': attrs.sectionName }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-section-divider]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes({ 'data-section-divider': '' }, HTMLAttributes)]
  },
})

const CtaButtonNode = Node.create({
  name: 'ctaButton',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      ctaText: {
        default: 'Ver más',
        parseHTML: (el) =>
          el.getAttribute('data-cta-text') || el.textContent?.trim() || 'Ver más',
        renderHTML: (attrs) => ({ 'data-cta-text': attrs.ctaText }),
      },
      ctaUrl: {
        default: '',
        parseHTML: (el) =>
          el.getAttribute('data-cta-url') ||
          el.querySelector?.('a')?.getAttribute('href') ||
          '',
        renderHTML: (attrs) => ({ 'data-cta-url': attrs.ctaUrl }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-cta-button]' }]
  },

  renderHTML({ HTMLAttributes }) {
    const text = HTMLAttributes['data-cta-text'] || 'Ver más'
    const url = HTMLAttributes['data-cta-url'] || '#'
    return [
      'div',
      mergeAttributes({ 'data-cta-button': '' }, HTMLAttributes),
      ['a', { href: url }, text],
    ]
  },
})

// CommentMark — preserves <span data-comment-id="...">…</span>. The frontend
// uses comments anchored via TipTap marks; we mirror just enough for HTML
// roundtripping. Rendering and click handlers are NOT mirrored.
const CommentMark = Mark.create({
  name: 'comment',
  inclusive: false,
  excludes: '',
  spanning: true,

  addAttributes() {
    return {
      commentId: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-comment-id') || '',
        renderHTML: (attrs) =>
          attrs.commentId ? { 'data-comment-id': attrs.commentId } : {},
      },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-comment-id]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes), 0]
  },
})

// Build the extension list used by generateHTML. Memoized at module scope
// since extensions are immutable definitions.
// StarterKit v3 bundles many extensions including link/underline. Disable the
// ones we configure separately to avoid "Duplicate extension names" warnings.
const HTML_EXTENSIONS = [
  StarterKit.configure({
    heading: false,
    link: false,
    underline: false,
  }),
  Heading.configure({ levels: [1, 2, 3, 4, 5, 6] }),
  Image.configure({
    inline: false,
    HTMLAttributes: { style: 'max-width:100%; height:auto; display:block;' },
  }),
  Link.configure({ openOnClick: false }),
  Underline,
  TextStyle,
  Color,
  Highlight.configure({ multicolor: true }),
  TextAlign.configure({ types: ['heading', 'paragraph'] }),
  Table.configure({ resizable: true }),
  TableRow,
  TableHeader,
  TableCell,
  SectionDividerNode,
  CtaButtonNode,
  CommentMark,
]

// ---------------------------------------------------------------------------
// Validation/repair primitives
// ---------------------------------------------------------------------------

function isPlainObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v)
}

function cloneDoc(doc) {
  // structuredClone is available in Node 18+; fall back to JSON if not.
  if (typeof structuredClone === 'function') return structuredClone(doc)
  return JSON.parse(JSON.stringify(doc))
}

function generateSectionId(seed = 0) {
  // Match the frontend pattern `s_${Date.now()}` for readability, with a
  // monotonically-increasing suffix so multiple inserts in the same ms stay
  // unique.
  return `s_${Date.now()}_${seed}`
}

function nodeHasMeaningfulContent(node) {
  if (!node) return false
  if (['image', 'ctaButton', 'table', 'horizontalRule'].includes(node.type)) return true
  if (Array.isArray(node.content)) {
    return node.content.some((child) => {
      if (child.type === 'text' && (child.text || '').trim().length > 0) return true
      if (child.type === 'image' || child.type === 'ctaButton') return true
      if (Array.isArray(child.content)) return nodeHasMeaningfulContent(child)
      return false
    })
  }
  return false
}

function validateDocShape(contentJson) {
  if (!isPlainObject(contentJson)) {
    return 'contentJson must be a ProseMirror document object'
  }
  if (contentJson.type !== 'doc') {
    return `contentJson.type must be "doc" (got ${JSON.stringify(contentJson.type)})`
  }
  if (contentJson.content != null && !Array.isArray(contentJson.content)) {
    return 'contentJson.content must be an array when present'
  }
  return null
}

// ---------------------------------------------------------------------------
// Section invariants (project_type = 'page' | 'faq')
// ---------------------------------------------------------------------------

// Walks top-level nodes, repairs section invariants in-place on a cloned doc.
// Returns the (possibly mutated) doc plus a list of repair descriptions.
function repairSections(doc, projectType, repairs) {
  const content = doc.content || []
  if (content.length === 0) {
    // Empty docs are valid; no sections required. (TipTap also accepts an
    // empty doc with a single empty paragraph; we don't force one here.)
    return doc
  }

  // INVARIANT: All sections, including first, use sectionDivider.
  // If the document has content but no leading sectionDivider, insert one.
  const firstSectionDividerIdx = content.findIndex((n) => n.type === 'sectionDivider')
  const hasAnyDivider = firstSectionDividerIdx !== -1

  if (!hasAnyDivider) {
    const hasContent = content.some(nodeHasMeaningfulContent) || content.some(
      (n) => n.type === 'heading'
    )
    if (hasContent) {
      const id = generateSectionId(0)
      const name = autoNameFor(projectType, 1)
      content.unshift({
        type: 'sectionDivider',
        attrs: { sectionId: id, sectionName: name },
      })
      doc.content = content
      repairs.push(
        `Inserted missing leading sectionDivider "${name}" (id=${id}) — content existed without any section.`
      )
    }
  } else if (firstSectionDividerIdx > 0) {
    // INVARIANT: First section must come first. There are nodes before any
    // sectionDivider; wrap them in a leading "Sección 1".
    const id = generateSectionId(0)
    const name = autoNameFor(projectType, 1)
    content.unshift({
      type: 'sectionDivider',
      attrs: { sectionId: id, sectionName: name },
    })
    doc.content = content
    repairs.push(
      `Inserted leading sectionDivider "${name}" (id=${id}) — ${firstSectionDividerIdx} block(s) appeared before the first section.`
    )
  }

  // INVARIANT: Every sectionDivider has non-empty sectionId + sectionName.
  // Repair: synthesize an id if missing; fall back to auto-name if name missing.
  let sectionOrdinal = 0
  let seedCounter = 1
  doc.content.forEach((node) => {
    if (node.type !== 'sectionDivider') return
    sectionOrdinal += 1
    node.attrs = node.attrs || {}
    if (!node.attrs.sectionId || typeof node.attrs.sectionId !== 'string') {
      const id = generateSectionId(seedCounter++)
      node.attrs.sectionId = id
      repairs.push(`Section at position ${sectionOrdinal} was missing sectionId; assigned "${id}".`)
    }
    if (!node.attrs.sectionName || typeof node.attrs.sectionName !== 'string') {
      const name = autoNameFor(projectType, sectionOrdinal)
      node.attrs.sectionName = name
      repairs.push(`Section at position ${sectionOrdinal} was missing sectionName; assigned "${name}".`)
    }
  })

  // INVARIANT: Auto-named sections follow total section order, renumbered
  // contiguously. Custom-named sections keep their name but still consume
  // their ordinal slot.
  sectionOrdinal = 0
  doc.content.forEach((node) => {
    if (node.type !== 'sectionDivider') return
    sectionOrdinal += 1
    if (isAutoSectionName(node.attrs.sectionName, projectType)) {
      const expected = autoNameFor(projectType, sectionOrdinal)
      if (node.attrs.sectionName !== expected) {
        const before = node.attrs.sectionName
        node.attrs.sectionName = expected
        repairs.push(`Renumbered auto-named section "${before}" → "${expected}".`)
      }
    }
  })

  // INVARIANT (FAQ): A heading H2/H3 must be preceded by a sectionDivider.
  // If a stray top-level H2/H3 appears without a divider immediately before
  // it, insert a "Pregunta Frecuente N" divider.
  if (projectType === 'faq') {
    let i = 0
    let prevWasDivider = false
    while (i < doc.content.length) {
      const node = doc.content[i]
      if (node.type === 'sectionDivider') {
        prevWasDivider = true
        i++
        continue
      }
      if (
        node.type === 'heading' &&
        (node.attrs?.level === 2 || node.attrs?.level === 3) &&
        !prevWasDivider
      ) {
        const id = generateSectionId(seedCounter++)
        // Count how many sectionDividers come before this position.
        let countSoFar = 0
        for (let j = 0; j < i; j++) {
          if (doc.content[j].type === 'sectionDivider') countSoFar++
        }
        const name = autoNameFor('faq', countSoFar + 1)
        doc.content.splice(i, 0, {
          type: 'sectionDivider',
          attrs: { sectionId: id, sectionName: name },
        })
        repairs.push(
          `Inserted FAQ sectionDivider "${name}" (id=${id}) before stray H${node.attrs.level}.`
        )
        i++ // skip the newly-inserted divider
        prevWasDivider = true
        continue
      }
      prevWasDivider = false
      i++
    }

    // Re-renumber after potential FAQ inserts.
    let ord = 0
    doc.content.forEach((node) => {
      if (node.type !== 'sectionDivider') return
      ord += 1
      if (isAutoSectionName(node.attrs.sectionName, 'faq')) {
        const expected = autoNameFor('faq', ord)
        if (node.attrs.sectionName !== expected) {
          const before = node.attrs.sectionName
          node.attrs.sectionName = expected
          repairs.push(`Renumbered FAQ section "${before}" → "${expected}".`)
        }
      }
    })

    // INVARIANT (FAQ): Each section should contain at least one H2/H3
    // (the question). Flag (but do not auto-repair) malformed FAQ pairs —
    // we can't synthesize a question text. Repair = ensure the section
    // has a placeholder empty H3 only if the section is entirely empty.
    let cursorSectionStart = -1
    let cursorSectionName = ''
    let cursorSectionHasQuestion = false
    const flagged = []
    const placeholderInserts = []
    doc.content.forEach((node, idx) => {
      if (node.type === 'sectionDivider') {
        if (cursorSectionStart !== -1 && !cursorSectionHasQuestion) {
          flagged.push({ start: cursorSectionStart, name: cursorSectionName, nextIdx: idx })
        }
        cursorSectionStart = idx
        cursorSectionName = node.attrs.sectionName
        cursorSectionHasQuestion = false
        return
      }
      if (cursorSectionStart === -1) return
      if (
        node.type === 'heading' &&
        (node.attrs?.level === 2 || node.attrs?.level === 3)
      ) {
        const txt = (node.content || []).map((c) => c.text || '').join('').trim()
        if (txt) cursorSectionHasQuestion = true
      }
    })
    if (cursorSectionStart !== -1 && !cursorSectionHasQuestion) {
      flagged.push({
        start: cursorSectionStart,
        name: cursorSectionName,
        nextIdx: doc.content.length,
      })
    }
    // For each flagged FAQ section that is entirely empty (only a divider),
    // insert an empty H3 placeholder so the editor doesn't render a bare
    // divider. For sections with non-question content, just warn.
    // Iterate from end to keep indices stable.
    for (let k = flagged.length - 1; k >= 0; k--) {
      const { start, name, nextIdx } = flagged[k]
      const body = doc.content.slice(start + 1, nextIdx)
      const isEntirelyEmpty = body.length === 0 || body.every((n) => !nodeHasMeaningfulContent(n))
      if (isEntirelyEmpty) {
        doc.content.splice(start + 1, 0, {
          type: 'heading',
          attrs: { level: 3 },
          content: [],
        })
        repairs.push(`Inserted empty H3 placeholder in FAQ section "${name}" (no question text).`)
      } else {
        repairs.push(
          `FAQ section "${name}" has content but no H2/H3 question heading. (Not auto-repaired.)`
        )
      }
    }
  }

  return doc
}

// ---------------------------------------------------------------------------
// Document type (linear) invariants
// ---------------------------------------------------------------------------

function repairDocumentLinear(doc, repairs) {
  // INVARIANT: 'document' projects are LINEAR — they must NOT contain any
  // sectionDivider nodes. Strip any that are present.
  if (!Array.isArray(doc.content)) return doc
  const before = doc.content.length
  doc.content = doc.content.filter((node) => {
    if (node.type === 'sectionDivider') return false
    return true
  })
  const removed = before - doc.content.length
  if (removed > 0) {
    repairs.push(`Removed ${removed} sectionDivider node(s) — 'document' projects are linear.`)
  }
  return doc
}

// ---------------------------------------------------------------------------
// CTA invariants
// ---------------------------------------------------------------------------

function repairCtaNodes(doc, repairs) {
  if (!Array.isArray(doc.content)) return doc
  const walk = (nodes) => {
    if (!Array.isArray(nodes)) return
    nodes.forEach((node) => {
      if (node?.type === 'ctaButton') {
        node.attrs = node.attrs || {}
        if (typeof node.attrs.ctaText !== 'string' || !node.attrs.ctaText.trim()) {
          node.attrs.ctaText = 'Ver más'
          repairs.push('CTA node missing ctaText; defaulted to "Ver más".')
        }
        if (typeof node.attrs.ctaUrl !== 'string') {
          node.attrs.ctaUrl = ''
          repairs.push('CTA node had non-string ctaUrl; defaulted to "".')
        }
      }
      if (Array.isArray(node?.content)) walk(node.content)
    })
  }
  walk(doc.content)
  return doc
}

// ---------------------------------------------------------------------------
// HTML serialization
// ---------------------------------------------------------------------------

export function serializeContentJsonToHtml(contentJson) {
  // generateHTML mutates nothing; safe to call on the repaired doc.
  return generateHTML(contentJson, HTML_EXTENSIONS)
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Validate + repair `contentJson` for a WeBrief project, then serialize.
 *
 * @param {object} contentJson — ProseMirror doc JSON (TipTap shape)
 * @param {'page'|'faq'|'document'|'brief'} projectType
 * @returns {{ contentJson: object, contentHtml: string, repairs: string[] }}
 * @throws {Error} when input is unusable or projectType is unsupported.
 */
export function ensureInvariants(contentJson, projectType) {
  if (!ALL_PROJECT_TYPES.includes(projectType)) {
    throw new Error(
      `ensureInvariants: unknown projectType "${projectType}". Expected one of ${ALL_PROJECT_TYPES.join(', ')}.`
    )
  }
  if (projectType === 'brief') {
    throw new Error(
      "ensureInvariants: project_type='brief' content is not editable via MCP v1. " +
        'Only brief responses are mutable; the brief structure itself is owned by the editor UI.'
    )
  }

  const shapeError = validateDocShape(contentJson)
  if (shapeError) {
    throw new Error(`ensureInvariants: ${shapeError}`)
  }

  const repairs = []
  const doc = cloneDoc(contentJson)
  if (!Array.isArray(doc.content)) doc.content = []

  if (projectType === 'document') {
    repairDocumentLinear(doc, repairs)
  } else {
    // 'page' or 'faq'
    repairSections(doc, projectType, repairs)
  }

  repairCtaNodes(doc, repairs)

  let contentHtml
  try {
    contentHtml = serializeContentJsonToHtml(doc)
  } catch (err) {
    throw new Error(`ensureInvariants: HTML serialization failed — ${err.message}`)
  }

  return { contentJson: doc, contentHtml, repairs }
}
