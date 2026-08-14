// frontend/src/lib/activityOrdering.js
// Orden del panel "Actividad" del editor (UpdatesPanel en ProjectEditor.jsx).
//
// Contrato: una fila por sección, SIEMPRE ordenada por posición de la sección
// en el documento — nunca por fecha de creación ni por "última actualización".
// Si una sección se mueve en el doc, su fila se mueve con ella; si no, se
// queda quieta. Marcar una actividad como leída solo toca metadata.readAt del
// item — nunca su sectionId ni su createdAt — así que no puede alterar el
// orden acá computado.
//
// Caso real que motivó esto: un `designer` nunca escribe en `project_pages`
// (cada guardado suyo va a `project_page_change_proposals`, status pending —
// ver sectionMerge.js/proposalDiff.js). Si sube una imagen a una sección que
// solo existe en SU propuesta, el evento `asset_uploaded` trae un `sectionId`
// que no aparece en el doc publicado/montado. Antes caía a un bucket aparte
// ("Actividad general") ordenado por `created_at DESC` del backend — se veía
// como si el panel reordenara solo. Ahora esa sección se agrupa igual que las
// demás, después de las del doc, en el orden en que aparece en la propuesta.
//
// Puro y sin DOM: corre igual en el navegador y en node (tests en
// backend/test/activity-ordering.test.js, import con extensión .js porque
// ESM no resuelve extensionless en node).
import { splitSections } from './sectionMerge.js'

// IDs de pseudo-sección que siempre van primero, en este orden fijo.
const PINNED_SECTION_IDS = ['__seo__', '__document__']

/**
 * Mapa sectionId -> ordinal, combinando:
 *   1. IDs de pseudo-sección fijos (__seo__, __document__)
 *   2. Secciones del documento montado/publicado, en su orden real
 *   3. Secciones que SOLO existen en una propuesta de diseño pendiente
 *      (parseadas del contentHtml de la propuesta), en el orden de la
 *      propuesta — agregadas después de todo lo anterior
 *
 * sectionIds ausentes de las tres fuentes no entran en el mapa: el caller
 * (orderSectionActivityGroups) los manda al final, en orden estable.
 *
 * @param {Array<{id: string}>} docSections secciones derivadas del doc activo (orden = posición real)
 * @param {string} proposalHtml content_html de activePage.pendingProposal (puede ser '' o null)
 * @returns {Map<string, number>}
 */
export function buildSectionOrderIndex(docSections = [], proposalHtml = '') {
  const order = new Map()
  PINNED_SECTION_IDS.forEach((id, index) => order.set(id, index))

  let next = PINNED_SECTION_IDS.length
  docSections.forEach((section) => {
    const id = section?.id
    if (!id || order.has(id)) return
    order.set(id, next++)
  })

  if (proposalHtml) {
    splitSections(proposalHtml).forEach((section) => {
      const id = section?.sectionId
      if (!id || order.has(id)) return
      order.set(id, next++)
    })
  }

  return order
}

/**
 * Agrupa items de actividad por metadata.sectionId y ordena los grupos
 * resultantes: primero por `orderIndex` (posición real de la sección),
 * y para sectionIds ausentes de `orderIndex` (datos legacy/huérfanos sin
 * relación con el doc ni con la propuesta), al final, por el createdAt MÁS
 * VIEJO del grupo, ascendente — nunca por el más reciente ni por lectura.
 *
 * Dentro de cada grupo, los items se ordenan por createdAt DESC (el más
 * reciente primero) para que `items[0]` sea "la última novedad" que se
 * muestra como resumen de la fila — igual criterio que antes.
 *
 * @param {Array} items activity items ya filtrados a los que tienen sectionId
 * @param {Map<string, number>} orderIndex de buildSectionOrderIndex()
 * @returns {Array<{sectionId: string, items: Array}>}
 */
export function orderSectionActivityGroups(items = [], orderIndex = new Map()) {
  const groups = new Map()
  items.forEach((item) => {
    const sectionId = item?.metadata?.sectionId
    if (!sectionId) return
    if (!groups.has(sectionId)) groups.set(sectionId, [])
    groups.get(sectionId).push(item)
  })

  const entries = Array.from(groups.entries()).map(([sectionId, groupItems], insertionIndex) => {
    const sortedItems = [...groupItems].sort((a, b) => (
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    ))
    const oldestAt = groupItems.reduce((min, entryItem) => {
      const t = new Date(entryItem.createdAt).getTime()
      return Number.isFinite(t) && t < min ? t : min
    }, Infinity)
    return { sectionId, items: sortedItems, oldestAt, insertionIndex }
  })

  entries.sort((a, b) => {
    const aKnown = orderIndex.has(a.sectionId)
    const bKnown = orderIndex.has(b.sectionId)
    if (aKnown && bKnown) return orderIndex.get(a.sectionId) - orderIndex.get(b.sectionId)
    if (aKnown !== bKnown) return aKnown ? -1 : 1
    // Ambos desconocidos: estable por el evento más viejo del grupo, nunca por el más nuevo.
    if (a.oldestAt !== b.oldestAt) return a.oldestAt - b.oldestAt
    return a.insertionIndex - b.insertionIndex
  })

  return entries.map(({ sectionId, items: groupItems }) => ({ sectionId, items: groupItems }))
}
