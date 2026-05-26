/**
 * editOps.js — typed edit operation schema + pure-function applier.
 *
 * Implements the 8 v1 edit operations from WEBRIEF_MCP_PLAN.md "Edicion De
 * Contenido Existente":
 *
 *   1. Cambiar un titulo                → set_heading_text
 *   2. Cambiar varios titulos           → multiple set_heading_text ops
 *   3. Reemplazar un parrafo            → replace_paragraph
 *   4. Insertar una seccion             → insert_section
 *   5. Eliminar una seccion             → delete_section
 *   6. Renombrar una pagina             → set_page_name
 *   7. Reemplazos masivos controlados   → find_replace
 *   8. Editar pregunta/respuesta en FAQ → set_faq_question / set_faq_answer
 *
 * Plus: set_section_name (rename a section in page/faq projects).
 *
 * The applier is a pure function. It does NOT call ensureInvariants — the
 * caller does that after every op runs (so invariants kick in once, on the
 * final shape, instead of after each op).
 *
 * Operations that fail to match a target do NOT throw; they record a warning.
 * The caller decides whether warnings are blocking (typically: yes for apply,
 * no for preview — preview surfaces them so the client can replan).
 */

import { z } from 'zod';

// ──────────────────────────────────────────────────────────────────────────────
// Schema
// ──────────────────────────────────────────────────────────────────────────────

const headingLevel = z.number().int().min(1).max(6);
const nonEmptyText = z.string().min(1).max(5000);

// Each variant carries a discriminator `op`. We use z.discriminatedUnion so
// Zod gives concise error messages keyed on the discriminator.
export const editOpSchema = z.discriminatedUnion('op', [
  // 1. Rename the page itself (project_pages.name)
  z.object({
    op: z.literal('set_page_name'),
    value: z
      .string()
      .min(1)
      .max(200)
      .describe('New page display name.'),
  }),

  // 2. Rename a section (sectionDivider.attrs.sectionName)
  z.object({
    op: z.literal('set_section_name'),
    sectionId: z
      .string()
      .min(1)
      .describe('Existing sectionDivider id (from contentJson). Op records a warning if not found.'),
    value: z
      .string()
      .min(1)
      .max(200)
      .describe('New section display name. Auto-named sections like "Sección 1" will get renumbered by invariants when this op changes the order.'),
  }),

  // 3. Replace a heading's text. Match by sectionId + optional level + optional matchText.
  z.object({
    op: z.literal('set_heading_text'),
    sectionId: z
      .string()
      .min(1)
      .optional()
      .describe('If set, only headings inside this section are considered.'),
    level: headingLevel
      .optional()
      .describe('If set, only headings of this level (1-6) match.'),
    matchText: z
      .string()
      .min(1)
      .optional()
      .describe('If set, the heading must contain this exact text. First match wins.'),
    value: nonEmptyText.describe('Replacement heading text (plain — inline marks like bold are lost).'),
  }),

  // 4. Replace a paragraph's text. Match by sectionId + (paragraphIndex OR matchText).
  z.object({
    op: z.literal('replace_paragraph'),
    sectionId: z
      .string()
      .min(1)
      .optional()
      .describe('If set, search only inside this section.'),
    paragraphIndex: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe('0-based index of the paragraph within the section body. Counts only paragraph nodes, skipping headings/dividers.'),
    matchText: z
      .string()
      .min(1)
      .optional()
      .describe('If set, the paragraph text must equal this exactly.'),
    value: nonEmptyText.describe('Replacement paragraph text (plain — inline marks lost).'),
  }),

  // 5. Insert a new section at the given position (default: end).
  z.object({
    op: z.literal('insert_section'),
    position: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe('0-based index counting only sectionDividers. Omit to append at the end.'),
    name: z
      .string()
      .min(1)
      .max(200)
      .optional()
      .describe('Section display name. Omit to let invariants auto-name (e.g. "Sección 3").'),
    headingText: z
      .string()
      .min(1)
      .max(500)
      .optional()
      .describe('Optional H2 heading inserted at the start of the new section.'),
    bodyText: z
      .string()
      .max(20_000)
      .optional()
      .describe('Optional first-paragraph body text. If omitted, an empty paragraph is inserted so the section is editable.'),
  }),

  // 6. Delete a section by id (removes the sectionDivider and every node up to
  //    the next sectionDivider).
  z.object({
    op: z.literal('delete_section'),
    sectionId: z
      .string()
      .min(1)
      .describe('Section to delete. Removes the divider AND every node up to (but not including) the next divider.'),
  }),

  // 7. Find-and-replace plain text inside text nodes. Optionally scoped to a
  //    single section.
  z.object({
    op: z.literal('find_replace'),
    find: z
      .string()
      .min(1)
      .describe('Literal string to search for. Regex metacharacters are escaped — NOT a regex.'),
    replace: z
      .string()
      .describe('Replacement string. Empty string deletes every match.'),
    caseSensitive: z
      .boolean()
      .optional()
      .describe('Default false (case-insensitive). Set true to require exact case.'),
    sectionId: z
      .string()
      .min(1)
      .optional()
      .describe('If set, only replace within this section. Otherwise the whole document is scanned.'),
  }),

  // 8a. Replace a FAQ question (the heading inside a FAQ section).
  z.object({
    op: z.literal('set_faq_question'),
    sectionId: z
      .string()
      .min(1)
      .describe('FAQ section whose question heading should be replaced. projectType must be "faq" — op warns otherwise.'),
    value: nonEmptyText.describe('New question heading text.'),
  }),

  // 8b. Replace a FAQ answer (all paragraphs in the section get collapsed
  //     into one paragraph with the new text).
  z.object({
    op: z.literal('set_faq_answer'),
    sectionId: z
      .string()
      .min(1)
      .describe('FAQ section whose answer body should be replaced. All paragraphs in the section are collapsed into one paragraph with this text.'),
    value: nonEmptyText.describe('New answer body (plain text). Inline marks are lost.'),
  }),

  // 9. Insert a CTA button (ctaButton node) into a section body. `position`
  //    is a 0-based index within the section BODY (not counting the divider);
  //    if omitted, append at the end of the body.
  z.object({
    op: z.literal('insert_cta'),
    sectionId: z
      .string()
      .min(1)
      .describe('Section into whose body the CTA button is inserted.'),
    position: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe('0-based index within the section BODY (NOT counting the divider). Omit to append at the end of the body.'),
    ctaText: z
      .string()
      .min(1)
      .max(200)
      .describe('Visible button label.'),
    ctaUrl: z
      .string()
      .min(1)
      .max(2000)
      .describe('Target URL the button links to. Can be absolute or relative.'),
  }),

  // 10. Insert an image (image node) by referencing an already-public URL
  //     (e.g. ImageKit). MCP does NOT upload assets — uploads stay in the UI.
  //     `position` is 0-based within the section body.
  z.object({
    op: z.literal('insert_image_by_url'),
    sectionId: z
      .string()
      .min(1)
      .describe('Section into whose body the image is inserted.'),
    position: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe('0-based index within the section BODY. Omit to append at the end.'),
    src: z
      .string()
      .min(1)
      .max(2000)
      .describe('Public image URL (typically ImageKit). MCP does NOT upload — the asset must already exist at this URL.'),
    alt: z
      .string()
      .max(500)
      .optional()
      .describe('Optional alt text for accessibility.'),
  }),

  // 11. Replace the page's SEO metadata (project_pages.seo_metadata JSONB).
  //     Lives outside contentJson — the op mutates state.seoMetadata, which
  //     the calling handler must persist via PUT /:id/pages.
  //
  //     Keys are ALIGNED with the frontend editor's SEO panel
  //     (frontend/src/pages/ProjectEditor.jsx → getPageSeoMetadata):
  //       - titleTag         (max 200, what becomes <title>)
  //       - metaDescription  (max 500, what becomes <meta name=description>)
  //       - urlSlug          (max 200, the path segment)
  //
  //     If the frontend ever adds richer SEO fields (ogImage, keywords,
  //     canonicalUrl, noindex), reintroduce them here with the SAME names
  //     the UI uses so the JSONB stays single-sourced.
  //
  //     `merge=true` (default) merges keys into existing metadata; merge=false
  //     replaces it entirely. Use merge=false to clear stale fields.
  z.object({
    op: z.literal('set_seo_metadata'),
    value: z
      .object({
        titleTag: z
          .string()
          .max(200)
          .optional()
          .describe('Becomes the <title> tag when the page is rendered/exported.'),
        metaDescription: z
          .string()
          .max(500)
          .optional()
          .describe('Becomes <meta name="description"> when rendered/exported.'),
        urlSlug: z
          .string()
          .max(200)
          .optional()
          .describe('URL path segment for the page (e.g. "home", "contact-us").'),
      })
      .strict()
      .describe(
        'SEO fields. ONLY the 3 keys the WeBrief editor UI reads are accepted ' +
          '(titleTag, metaDescription, urlSlug). Unknown keys are rejected to keep ' +
          'the JSONB single-sourced with the UI.',
      ),
    merge: z
      .boolean()
      .optional()
      .describe(
        'Default true. true = merge into existing seoMetadata (preserves unspecified keys). ' +
          'false = replace entirely (drops keys not in `value`).',
      ),
  }),
]);

export const editOpsArraySchema = z
  .array(editOpSchema)
  .min(1)
  .max(50)
  .describe('List of edit operations to apply to the page in order');

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

function deepClone(value) {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function textOfNode(node) {
  if (!node) return '';
  if (node.type === 'text') return node.text ?? '';
  if (Array.isArray(node.content)) {
    return node.content.map(textOfNode).join('');
  }
  return '';
}

function makeTextNode(text) {
  return { type: 'text', text };
}

function makeParagraph(text) {
  if (!text) return { type: 'paragraph' };
  return { type: 'paragraph', content: [makeTextNode(text)] };
}

function makeHeading(level, text) {
  return { type: 'heading', attrs: { level }, content: [makeTextNode(text)] };
}

function makeCtaButton(ctaText, ctaUrl) {
  return { type: 'ctaButton', attrs: { ctaText, ctaUrl } };
}

function makeImage(src, alt) {
  const attrs = { src };
  if (alt !== undefined) attrs.alt = alt;
  return { type: 'image', attrs };
}

function makeSectionDivider(name, sectionId) {
  return {
    type: 'sectionDivider',
    attrs: { sectionId, sectionName: name },
  };
}

/**
 * Yields [{ divider, dividerIndex, bodyStart, bodyEnd }] for each section in the
 * doc. The first segment may have a null divider when the doc has no leading
 * divider (which the invariants module will repair later).
 *
 * `bodyStart` and `bodyEnd` are indices into `doc.content` such that
 * `doc.content.slice(bodyStart, bodyEnd)` is the section's body (excluding the
 * divider itself). `bodyEnd` is exclusive.
 */
function listSections(doc) {
  const content = doc.content ?? [];
  const sections = [];
  let current = null;

  content.forEach((node, idx) => {
    if (node.type === 'sectionDivider') {
      if (current) {
        current.bodyEnd = idx;
        sections.push(current);
      }
      current = {
        divider: node,
        dividerIndex: idx,
        bodyStart: idx + 1,
        bodyEnd: content.length,
      };
    }
  });
  if (current) sections.push(current);

  // If the doc has body before the first divider, expose it as an unnamed
  // leading segment so ops scoped to sectionId don't accidentally match it.
  if (content.length > 0 && (sections.length === 0 || sections[0].dividerIndex > 0)) {
    sections.unshift({
      divider: null,
      dividerIndex: -1,
      bodyStart: 0,
      bodyEnd: sections[0]?.dividerIndex ?? content.length,
    });
  }

  return sections;
}

function findSection(doc, sectionId) {
  return listSections(doc).find((s) => s.divider?.attrs?.sectionId === sectionId);
}

function replaceNodeText(node, newText) {
  // Replaces the visible text of a heading/paragraph while preserving the
  // outer node type + attrs. We lose inline marks (bold/italic/etc.) on the
  // replaced run — acceptable for v1 since the client supplies plain text.
  if (!node) return;
  node.content = [makeTextNode(newText)];
}

// ──────────────────────────────────────────────────────────────────────────────
// Operation implementations — each mutates the doc and returns a `summary`
// object that the caller collects.
// ──────────────────────────────────────────────────────────────────────────────

function opSetPageName(state, op) {
  const before = state.pageName;
  state.pageName = op.value;
  return {
    op: op.op,
    matched: true,
    before,
    after: op.value,
  };
}

function opSetSectionName(state, op) {
  const section = findSection(state.doc, op.sectionId);
  if (!section || !section.divider) {
    return { op: op.op, matched: false, warning: `sectionId ${op.sectionId} not found` };
  }
  const before = section.divider.attrs.sectionName;
  section.divider.attrs.sectionName = op.value;
  return { op: op.op, matched: true, sectionId: op.sectionId, before, after: op.value };
}

function opSetHeadingText(state, op) {
  const sections = op.sectionId
    ? [findSection(state.doc, op.sectionId)].filter(Boolean)
    : listSections(state.doc);

  if (op.sectionId && sections.length === 0) {
    return { op: op.op, matched: false, warning: `sectionId ${op.sectionId} not found` };
  }

  for (const section of sections) {
    for (let i = section.bodyStart; i < section.bodyEnd; i++) {
      const node = state.doc.content[i];
      if (!node || node.type !== 'heading') continue;
      if (op.level && node.attrs?.level !== op.level) continue;
      const currentText = textOfNode(node);
      if (op.matchText && currentText !== op.matchText) continue;
      replaceNodeText(node, op.value);
      return {
        op: op.op,
        matched: true,
        sectionId: section.divider?.attrs?.sectionId ?? null,
        before: currentText,
        after: op.value,
      };
    }
  }
  return { op: op.op, matched: false, warning: 'no heading matched the selector' };
}

function opReplaceParagraph(state, op) {
  const sections = op.sectionId
    ? [findSection(state.doc, op.sectionId)].filter(Boolean)
    : listSections(state.doc);

  if (op.sectionId && sections.length === 0) {
    return { op: op.op, matched: false, warning: `sectionId ${op.sectionId} not found` };
  }

  for (const section of sections) {
    let paragraphCounter = 0;
    for (let i = section.bodyStart; i < section.bodyEnd; i++) {
      const node = state.doc.content[i];
      if (!node || node.type !== 'paragraph') continue;
      const currentText = textOfNode(node);
      const indexMatches =
        op.paragraphIndex === undefined || paragraphCounter === op.paragraphIndex;
      const textMatches = !op.matchText || currentText === op.matchText;
      if (indexMatches && textMatches) {
        replaceNodeText(node, op.value);
        return {
          op: op.op,
          matched: true,
          sectionId: section.divider?.attrs?.sectionId ?? null,
          paragraphIndex: paragraphCounter,
          before: currentText,
          after: op.value,
        };
      }
      paragraphCounter += 1;
    }
  }
  return { op: op.op, matched: false, warning: 'no paragraph matched the selector' };
}

function opInsertSection(state, op) {
  // Compute insertion index: maps `position` (count of sectionDividers before
  // which to insert) into an absolute doc.content index. If position omitted,
  // insert at the end.
  const sections = listSections(state.doc).filter((s) => s.divider);
  const dividerCount = sections.length;
  const targetSectionIndex = op.position ?? dividerCount;
  const clampedIndex = Math.max(0, Math.min(targetSectionIndex, dividerCount));

  const insertAt =
    clampedIndex < dividerCount
      ? sections[clampedIndex].dividerIndex
      : state.doc.content.length;

  const newSectionId = `s_${Date.now()}_${state.idCounter++}`;
  const newName = op.name ?? null; // null → invariants module will auto-name

  const nodesToInsert = [
    makeSectionDivider(newName ?? 'Section', newSectionId),
  ];
  if (op.headingText) nodesToInsert.push(makeHeading(2, op.headingText));
  if (op.bodyText) nodesToInsert.push(makeParagraph(op.bodyText));
  // Always leave a trailing empty paragraph so the section is editable.
  if (!op.bodyText) nodesToInsert.push(makeParagraph(''));

  state.doc.content = [
    ...state.doc.content.slice(0, insertAt),
    ...nodesToInsert,
    ...state.doc.content.slice(insertAt),
  ];

  return {
    op: op.op,
    matched: true,
    sectionId: newSectionId,
    insertedAtSectionIndex: clampedIndex,
  };
}

function opDeleteSection(state, op) {
  const section = findSection(state.doc, op.sectionId);
  if (!section || !section.divider) {
    return { op: op.op, matched: false, warning: `sectionId ${op.sectionId} not found` };
  }
  const removeFrom = section.dividerIndex;
  const removeTo = section.bodyEnd;
  state.doc.content = [
    ...state.doc.content.slice(0, removeFrom),
    ...state.doc.content.slice(removeTo),
  ];
  return {
    op: op.op,
    matched: true,
    sectionId: op.sectionId,
    nodesRemoved: removeTo - removeFrom,
  };
}

function walkTextNodes(node, fn) {
  if (!node) return;
  if (node.type === 'text') {
    fn(node);
    return;
  }
  if (Array.isArray(node.content)) {
    for (const child of node.content) walkTextNodes(child, fn);
  }
}

function opFindReplace(state, op) {
  const flags = op.caseSensitive ? 'g' : 'gi';
  // Escape regex metacharacters in `find` — we treat it as a plain string.
  const escaped = op.find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(escaped, flags);

  const sections = op.sectionId
    ? [findSection(state.doc, op.sectionId)].filter(Boolean)
    : listSections(state.doc);

  if (op.sectionId && sections.length === 0) {
    return { op: op.op, matched: false, warning: `sectionId ${op.sectionId} not found` };
  }

  let replacements = 0;
  for (const section of sections) {
    for (let i = section.bodyStart; i < section.bodyEnd; i++) {
      const node = state.doc.content[i];
      if (!node) continue;
      walkTextNodes(node, (textNode) => {
        if (!textNode.text) return;
        const before = textNode.text;
        const after = before.replace(re, op.replace);
        if (after !== before) {
          const matches = before.match(re) ?? [];
          replacements += matches.length;
          textNode.text = after;
        }
      });
    }
  }

  if (replacements === 0) {
    return {
      op: op.op,
      matched: false,
      warning: `find_replace matched 0 occurrences of "${op.find}"`,
    };
  }
  return { op: op.op, matched: true, replacements };
}

function opSetFaqQuestion(state, op) {
  if (state.projectType !== 'faq') {
    return {
      op: op.op,
      matched: false,
      warning: `set_faq_question requires projectType=faq (got ${state.projectType})`,
    };
  }
  const section = findSection(state.doc, op.sectionId);
  if (!section || !section.divider) {
    return { op: op.op, matched: false, warning: `sectionId ${op.sectionId} not found` };
  }

  // The "question" is the first heading inside the FAQ section.
  for (let i = section.bodyStart; i < section.bodyEnd; i++) {
    const node = state.doc.content[i];
    if (node?.type !== 'heading') continue;
    const before = textOfNode(node);
    replaceNodeText(node, op.value);
    return {
      op: op.op,
      matched: true,
      sectionId: op.sectionId,
      before,
      after: op.value,
    };
  }
  // No existing heading — insert one at the start of the section body.
  state.doc.content.splice(section.bodyStart, 0, makeHeading(2, op.value));
  return { op: op.op, matched: true, sectionId: op.sectionId, inserted: true, after: op.value };
}

function opSetFaqAnswer(state, op) {
  if (state.projectType !== 'faq') {
    return {
      op: op.op,
      matched: false,
      warning: `set_faq_answer requires projectType=faq (got ${state.projectType})`,
    };
  }
  const section = findSection(state.doc, op.sectionId);
  if (!section || !section.divider) {
    return { op: op.op, matched: false, warning: `sectionId ${op.sectionId} not found` };
  }

  // The "answer" is every paragraph in the section body. Collapse them into
  // a single new paragraph with the user's text.
  const beforeContent = state.doc.content.slice(section.bodyStart, section.bodyEnd);
  const heading = beforeContent.find((n) => n.type === 'heading') ?? null;
  const rest = heading ? [heading, makeParagraph(op.value)] : [makeParagraph(op.value)];

  state.doc.content = [
    ...state.doc.content.slice(0, section.bodyStart),
    ...rest,
    ...state.doc.content.slice(section.bodyEnd),
  ];

  return {
    op: op.op,
    matched: true,
    sectionId: op.sectionId,
    after: op.value,
    paragraphsCollapsed: beforeContent.filter((n) => n.type === 'paragraph').length,
  };
}

function insertNodeIntoSection(state, op, node) {
  const section = findSection(state.doc, op.sectionId);
  if (!section || !section.divider) {
    return { error: { op: op.op, matched: false, warning: `sectionId ${op.sectionId} not found` } };
  }
  const bodyLength = section.bodyEnd - section.bodyStart;
  const requestedPosition = op.position ?? bodyLength;
  const clamped = Math.max(0, Math.min(requestedPosition, bodyLength));
  const insertAt = section.bodyStart + clamped;
  state.doc.content = [
    ...state.doc.content.slice(0, insertAt),
    node,
    ...state.doc.content.slice(insertAt),
  ];
  return { ok: { sectionId: op.sectionId, insertedAtBodyIndex: clamped } };
}

function opInsertCta(state, op) {
  const result = insertNodeIntoSection(state, op, makeCtaButton(op.ctaText, op.ctaUrl));
  if (result.error) return result.error;
  return {
    op: op.op,
    matched: true,
    sectionId: result.ok.sectionId,
    insertedAtBodyIndex: result.ok.insertedAtBodyIndex,
    ctaText: op.ctaText,
    ctaUrl: op.ctaUrl,
  };
}

function opInsertImageByUrl(state, op) {
  const result = insertNodeIntoSection(state, op, makeImage(op.src, op.alt));
  if (result.error) return result.error;
  return {
    op: op.op,
    matched: true,
    sectionId: result.ok.sectionId,
    insertedAtBodyIndex: result.ok.insertedAtBodyIndex,
    src: op.src,
    alt: op.alt ?? null,
  };
}

function opSetSeoMetadata(state, op) {
  const before = { ...state.seoMetadata };
  const merge = op.merge !== false; // default true
  const next = merge ? { ...state.seoMetadata, ...op.value } : { ...op.value };
  // Strip explicit `undefined` so the resulting JSONB stays compact.
  for (const k of Object.keys(next)) {
    if (next[k] === undefined) delete next[k];
  }
  state.seoMetadata = next;
  // Compute a small diff for the audit summary.
  const changedKeys = Object.keys(next).filter(
    (k) => JSON.stringify(next[k]) !== JSON.stringify(before[k]),
  );
  const removedKeys = !merge
    ? Object.keys(before).filter((k) => !(k in next))
    : [];
  return {
    op: op.op,
    matched: true,
    merge,
    changedKeys,
    removedKeys,
  };
}

const OPS = {
  set_page_name: opSetPageName,
  set_section_name: opSetSectionName,
  set_heading_text: opSetHeadingText,
  replace_paragraph: opReplaceParagraph,
  insert_section: opInsertSection,
  delete_section: opDeleteSection,
  find_replace: opFindReplace,
  set_faq_question: opSetFaqQuestion,
  set_faq_answer: opSetFaqAnswer,
  insert_cta: opInsertCta,
  insert_image_by_url: opInsertImageByUrl,
  set_seo_metadata: opSetSeoMetadata,
};

// ──────────────────────────────────────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Apply a list of edit operations to a `contentJson` document. Pure function.
 *
 * @param {object} params
 * @param {object} params.contentJson  Initial ProseMirror doc
 * @param {Array<object>} params.ops    List of typed edit operations
 * @param {string} params.pageName     Current page name (used by set_page_name)
 * @param {object} [params.seoMetadata] Current seoMetadata (used by set_seo_metadata)
 * @param {string} params.projectType  page | document | faq
 * @returns {{
 *   contentJson: object,
 *   pageName: string,
 *   seoMetadata: object,
 *   opsApplied: object[],
 *   warnings: string[],
 * }}
 */
export function applyEditsToContentJson({
  contentJson,
  ops,
  pageName,
  seoMetadata,
  projectType,
}) {
  if (!contentJson || contentJson.type !== 'doc') {
    throw new Error('applyEditsToContentJson: contentJson must be a ProseMirror doc');
  }
  if (!Array.isArray(ops)) {
    throw new Error('applyEditsToContentJson: ops must be an array');
  }

  const state = {
    doc: deepClone(contentJson),
    pageName: pageName ?? '',
    seoMetadata:
      seoMetadata && typeof seoMetadata === 'object' ? deepClone(seoMetadata) : {},
    projectType,
    idCounter: 0,
  };
  if (!Array.isArray(state.doc.content)) state.doc.content = [];

  const opsApplied = [];
  const warnings = [];

  for (const op of ops) {
    const fn = OPS[op.op];
    if (!fn) {
      warnings.push(`unknown op '${op.op}' — skipped`);
      opsApplied.push({ op: op.op, matched: false, warning: 'unknown op' });
      continue;
    }
    const summary = fn(state, op);
    opsApplied.push(summary);
    if (!summary.matched && summary.warning) {
      warnings.push(`${op.op}: ${summary.warning}`);
    }
  }

  return {
    contentJson: state.doc,
    pageName: state.pageName,
    seoMetadata: state.seoMetadata,
    opsApplied,
    warnings,
  };
}

export const EDIT_OP_NAMES = Object.freeze(Object.keys(OPS));
