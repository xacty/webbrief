// frontend/src/lib/sectionMerge.js
// Merge 3 vías por sección para colaboración ligera. Sin DOM ni React:
// corre igual en browser y en node:test. El divider es un atom serializado
// como <div data-section-divider ...></div> — split por regex es seguro.

// Quote-aware: un atributo entre comillas puede contener ">" literal (p.ej. un
// nombre de sección "Servicios > Precios") sin cortar el tag del divider.
const DIVIDER_RE = /<div(?:[^>"]|"[^"]*")*\bdata-section-divider\b(?:[^>"]|"[^"]*")*>\s*<\/div>/gi

// Los valores de atributo pueden llegar/serializarse con entities; escapa/decodifica
// en orden inverso simétrico para que id/name sobrevivan un ciclo split -> build -> split.
function escapeAttr(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

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

export function splitSections(html) {
  const source = html || ''
  const re = new RegExp(DIVIDER_RE.source, 'gi')
  const dividers = []
  let match
  while ((match = re.exec(source))) dividers.push({ start: match.index, end: re.lastIndex, tag: match[0] })
  if (dividers.length === 0) {
    const body = source.trim()
    if (!body) return []
    return [{ sectionId: '__document__', sectionName: 'Documento', innerHtml: source, position: 0 }]
  }
  const sections = []
  // Contenido antes del primer divider (p.ej. una intro pegada antes de que existan
  // secciones): se preserva como pseudo-sección en vez de perderse en silencio.
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

export function normalizeHtml(html) {
  return (html || '')
    // TipTap serializa el atom sin valor de atributo (`data-section-divider=""`);
    // normaliza a la forma bare para que la comparación con HTML construido a mano no falle.
    .replace(/data-section-divider=""/g, 'data-section-divider')
    .replace(/>\s+</g, '><')
    .replace(/\s+/g, ' ')
    .trim()
}

export function buildHtmlFromSections(sections) {
  return sections.map((section) => {
    if (section.sectionId === '__document__' || section.sectionId === '__preamble__') return section.innerHtml
    return `<div data-section-divider data-section-id="${escapeAttr(section.sectionId)}" data-section-name="${escapeAttr(section.sectionName)}"></div>${section.innerHtml}`
  }).join('')
}

// sectionId duplicado (copia-pega accidental) no debe corromper el merge: primer-wins
// tanto para el lookup por id como para la posición en el orden resultante.
function toFirstWinsMap(list) {
  const map = new Map()
  list.forEach((section) => {
    if (!map.has(section.sectionId)) map.set(section.sectionId, section)
  })
  return map
}

export function mergeSections({ baseHtml, remoteHtml, localHtml }) {
  const base = splitSections(baseHtml)
  const remote = splitSections(remoteHtml)
  const local = splitSections(localHtml)
  const baseMap = toFirstWinsMap(base)
  const remoteMap = toFirstWinsMap(remote)
  const localMap = toFirstWinsMap(local)

  const changed = (a, b) => normalizeHtml(a?.innerHtml) !== normalizeHtml(b?.innerHtml)
  const ids = (list) => list.map((s) => s.sectionId).join('|')
  const localStructural = ids(local) !== ids(base)
  const conflicts = []
  const structuralNotes = []

  // Orden resultante: remoto si local no tocó estructura; si no, local + solo-remotas nuevas al final.
  let order
  if (!localStructural) {
    order = remote.map((s) => s.sectionId)
    // secciones que local editó pero remoto eliminó se conservan (regla deleted-remote): reinsertar en posición base
    local.forEach((section) => {
      if (!remoteMap.has(section.sectionId) && baseMap.has(section.sectionId) && changed(section, baseMap.get(section.sectionId))) {
        const baseIndex = base.findIndex((s) => s.sectionId === section.sectionId)
        order.splice(Math.min(baseIndex, order.length), 0, section.sectionId)
      }
    })
  } else {
    order = local.map((s) => s.sectionId)
    remote.forEach((section) => {
      if (localMap.has(section.sectionId)) return
      if (!baseMap.has(section.sectionId)) {
        // sección nueva de remoto, ausente en base y en local: se agrega al final.
        order.push(section.sectionId)
        structuralNotes.push({ type: 'remote-add-appended', sectionId: section.sectionId })
      } else if (changed(section, baseMap.get(section.sectionId))) {
        // local la borró (cambio estructural) pero remoto la había editado: se respeta
        // la eliminación local (no se reinserta) pero queda señalizada como conflicto.
        conflicts.push({
          sectionId: section.sectionId,
          sectionName: section.sectionName,
          localHtml: null,
          remoteHtml: section.innerHtml,
          type: 'deleted-local',
        })
      } else {
        // local la borró y remoto no la tocó: eliminación local silenciosa, sin conflicto.
        structuralNotes.push({ type: 'local-removed', sectionId: section.sectionId })
      }
    })
  }
  // Deduplica el orden (primer-wins) por si algún lado tiene sectionIds repetidos.
  order = [...new Set(order)]

  const mergedSections = []
  order.forEach((sectionId) => {
    const inBase = baseMap.get(sectionId)
    const inRemote = remoteMap.get(sectionId)
    const inLocal = localMap.get(sectionId)

    if (inRemote && !inLocal) {
      if (!inBase) {
        mergedSections.push({ ...inRemote, origin: 'remote' })
        structuralNotes.push({ type: 'remote-added', sectionId })
      } else if (!changed(inRemote, inBase)) {
        // local la eliminó y remoto no la cambió → respetar eliminación local
        structuralNotes.push({ type: 'local-removed', sectionId })
      } else {
        mergedSections.push({ ...inRemote, origin: 'remote' })
      }
      return
    }
    if (inLocal && !inRemote) {
      if (inBase && !changed(inLocal, inBase)) {
        structuralNotes.push({ type: 'remote-removed', sectionId })
        return
      }
      if (inBase) {
        conflicts.push({ sectionId, sectionName: inLocal.sectionName, localHtml: inLocal.innerHtml, remoteHtml: null, type: 'deleted-remote' })
      }
      mergedSections.push({ ...inLocal, origin: 'local' })
      return
    }
    if (!inLocal && !inRemote) return

    const localChanged = changed(inLocal, inBase)
    const remoteChanged = changed(inRemote, inBase)
    const sectionName = (inRemote.sectionName !== inBase?.sectionName && inLocal.sectionName === inBase?.sectionName)
      ? inRemote.sectionName
      : inLocal.sectionName

    if (remoteChanged && !localChanged) {
      mergedSections.push({ ...inRemote, sectionName, origin: 'remote' })
    } else if (remoteChanged && localChanged && changed(inLocal, inRemote)) {
      conflicts.push({ sectionId, sectionName, localHtml: inLocal.innerHtml, remoteHtml: inRemote.innerHtml, type: 'edit' })
      mergedSections.push({ ...inLocal, sectionName, origin: 'local' })
    } else {
      mergedSections.push({ ...inLocal, sectionName, origin: 'local' })
    }
  })

  const mergedHtml = buildHtmlFromSections(mergedSections)
  return {
    mergedSections,
    mergedHtml,
    conflicts,
    structuralNotes,
    identicalToRemote: normalizeHtml(mergedHtml) === normalizeHtml(remoteHtml),
  }
}
