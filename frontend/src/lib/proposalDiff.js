// Diff por sección entre lo publicado y una propuesta de diseño pendiente.
//
// Contexto: un usuario con rol `designer` no escribe en `project_pages` — cada
// guardado suyo va a `project_page_change_proposals` como propuesta pendiente.
// El revisor (admin/manager/editor) solo veía "Aprobar / Pedir cambios" sin
// ninguna forma de ver QUÉ se aprueba (bug real: 9 imágenes subidas a Tlalpan
// que el revisor no podía ver en ningún lado). Este módulo alimenta el
// comparador Publicado/Propuesta y los chips por sección.
//
// Reusa `splitSections` + `normalizeHtml` de sectionMerge.js: mismo parser de
// `data-section-divider` que el merge de colaboración, así que "cambió" acá
// significa exactamente lo mismo que allá — y las diferencias cosméticas de
// serialización (orden de atributos, espacios) no cuentan como cambio.
//
// Puro y sin DOM: corre igual en el navegador y en node (tests).

// Import con extensión explícita: este módulo se testea desde node
// (backend/test/proposal-diff.test.js) y ESM no resuelve extensionless.
import { splitSections, normalizeHtml } from './sectionMerge.js'

// sectionId duplicado (copia-pega accidental) no debe romper el diff:
// primer-wins, igual criterio que mergeSections.
function toFirstWinsMap(sections) {
  const map = new Map()
  for (const section of sections) {
    if (!map.has(section.sectionId)) map.set(section.sectionId, section)
  }
  return map
}

function baseFields(section) {
  return {
    sectionId: section.sectionId,
    sectionName: section.sectionName,
    innerHtml: section.innerHtml,
  }
}

/**
 * @param {string} publishedHtml content_html vigente de la página
 * @param {string} proposalHtml  content_html de la propuesta pendiente
 * @returns {{
 *   sections: Array<{sectionId, sectionName, innerHtml, status: 'added'|'changed'|'unchanged', renamedFrom: string|null, publishedInnerHtml: string|null}>,
 *   removedSections: Array<{sectionId, sectionName, innerHtml, status: 'removed'}>,
 *   counts: {added: number, changed: number, removed: number, unchanged: number},
 *   totalChanges: number,
 *   hasChanges: boolean,
 * }}
 *
 * `sections` va en el orden de la PROPUESTA (es lo que se va a publicar).
 * Las eliminadas no tienen lugar en ese orden, así que salen aparte para
 * pintarse al final, atenuadas.
 */
export function diffProposalSections(publishedHtml, proposalHtml) {
  const published = splitSections(publishedHtml || '')
  const proposal = splitSections(proposalHtml || '')
  const publishedById = toFirstWinsMap(published)
  const proposalById = toFirstWinsMap(proposal)

  const sections = proposal.map((section) => {
    const previous = publishedById.get(section.sectionId)
    if (!previous) {
      return { ...baseFields(section), status: 'added', renamedFrom: null, publishedInnerHtml: null }
    }
    const contentChanged = normalizeHtml(previous.innerHtml) !== normalizeHtml(section.innerHtml)
    // El nombre de sección vive en el divider (fuera del innerHtml), así que un
    // rename no se ve en la comparación de contenido — pero para el revisor sí
    // es un cambio que aprueba.
    const renamed = (previous.sectionName || '') !== (section.sectionName || '')
    return {
      ...baseFields(section),
      status: contentChanged || renamed ? 'changed' : 'unchanged',
      renamedFrom: renamed ? previous.sectionName : null,
      // Contenido publicado de la misma sección: lo necesita el comparador de
      // bloques (proposalBlockDiff.js) para secciones 'changed' — así puede
      // pintar QUÉ cambió adentro, no solo que algo cambió.
      publishedInnerHtml: previous.innerHtml,
    }
  })

  const removedSections = published
    .filter((section) => !proposalById.has(section.sectionId))
    .map((section) => ({ ...baseFields(section), status: 'removed' }))

  const counts = {
    added: sections.filter((section) => section.status === 'added').length,
    changed: sections.filter((section) => section.status === 'changed').length,
    removed: removedSections.length,
    unchanged: sections.filter((section) => section.status === 'unchanged').length,
  }
  const totalChanges = counts.added + counts.changed + counts.removed

  return { sections, removedSections, counts, totalChanges, hasChanges: totalChanges > 0 }
}

// Resumen en una línea para el panel de revisión ("2 nuevas · 1 modificada").
// Devuelve '' cuando no hay cambios: el caller decide el copy de ese caso.
export function summarizeProposalDiff(counts) {
  if (!counts) return ''
  const parts = []
  if (counts.added) parts.push(`${counts.added} ${counts.added === 1 ? 'nueva' : 'nuevas'}`)
  if (counts.changed) parts.push(`${counts.changed} ${counts.changed === 1 ? 'modificada' : 'modificadas'}`)
  if (counts.removed) parts.push(`${counts.removed} ${counts.removed === 1 ? 'eliminada' : 'eliminadas'}`)
  return parts.join(' · ')
}
