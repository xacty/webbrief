// frontend/src/lib/sectionMerge.js
// Merge 3 vías por sección para colaboración ligera. Sin DOM ni React:
// corre igual en browser y en node:test. El divider es un atom serializado
// como <div data-section-divider ...></div> — split por regex es seguro.

const DIVIDER_RE = /<div[^>]*\bdata-section-divider\b[^>]*>\s*<\/div>/gi

function attr(tag, name) {
  const match = new RegExp(`${name}="([^"]*)"`).exec(tag)
  return match ? match[1] : ''
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
  return dividers.map((div, i) => ({
    sectionId: attr(div.tag, 'data-section-id'),
    sectionName: attr(div.tag, 'data-section-name') || 'Sección',
    innerHtml: source.slice(div.end, dividers[i + 1] ? dividers[i + 1].start : source.length),
    position: i,
  }))
}

export function normalizeHtml(html) {
  return (html || '').replace(/>\s+</g, '><').replace(/\s+/g, ' ').trim()
}

export function buildHtmlFromSections(sections) {
  return sections.map((section) => {
    if (section.sectionId === '__document__') return section.innerHtml
    return `<div data-section-divider data-section-id="${section.sectionId}" data-section-name="${section.sectionName}"></div>${section.innerHtml}`
  }).join('')
}

export function mergeSections({ baseHtml, remoteHtml, localHtml }) {
  const base = splitSections(baseHtml)
  const remote = splitSections(remoteHtml)
  const local = splitSections(localHtml)
  const baseMap = new Map(base.map((s) => [s.sectionId, s]))
  const remoteMap = new Map(remote.map((s) => [s.sectionId, s]))
  const localMap = new Map(local.map((s) => [s.sectionId, s]))

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
      if (!localMap.has(section.sectionId) && !baseMap.has(section.sectionId)) {
        order.push(section.sectionId)
        structuralNotes.push({ type: 'remote-add-appended', sectionId: section.sectionId })
      }
    })
  }

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
