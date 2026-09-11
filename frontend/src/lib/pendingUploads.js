// Placeholders de subida en vuelo (`blob:`) — último filtro antes de persistir.
//
// Al subir una imagen el editor inserta primero un nodo con
// `src="blob:https://webrief.app/<uuid>"` (object URL local del File) y recién
// cuando el backend responde lo reemplaza por la URL pública (ver
// `handleImageUpload` → `insertTemporaryImage` + `replaceImageSrc` en
// ProjectEditor.jsx). Ese placeholder NO puede llegar a la base: el object URL
// muere con la pestaña, así que lo guardado apunta a la nada para siempre.
//
// Ventana real de pérdida (caso confirmado en Prod, propuesta de la página
// "Coapa" del proyecto Locaciones): el autosave dispara mientras la subida está
// en vuelo, o el usuario cambia de página / la subida falla y el swap nunca
// ocurre sobre ese doc. El nodo queda huérfano y se serializa con el blob.
//
// La defensa vive en el chokepoint de serialización (`snapshotActivePage`), no
// en cada call site de subida: cualquier camino nuevo que agregue placeholders
// queda cubierto sin tener que acordarse de limpiarlos.
//
// Nota de alcance: solo `blob:`. Un `data:` URI sí es contenido real
// (auto-contenido, sobrevive al reload) — filtrarlo perdería imágenes válidas.

const PENDING_UPLOAD_PROTOCOL_RE = /^blob:/i

// Tag de <img>, quote-aware: el valor de un atributo puede contener ">" literal
// entre comillas sin cortar el tag antes de tiempo (mismo criterio que
// TAG_RE/DIVIDER_RE en sectionMerge.js).
const IMG_TAG_RE = /<img\b(?:[^<>"]|"[^"]*")*>/gi
const SRC_ATTR_RE = /\bsrc\s*=\s*"([^"]*)"/i

export function isPendingUploadSrc(src) {
  return typeof src === 'string' && PENDING_UPLOAD_PROTOCOL_RE.test(src.trim())
}

// Elimina del HTML los <img> cuyo src sigue siendo un placeholder local.
// Devuelve el mismo string cuando no hay nada que limpiar (identidad barata:
// el 99.9% de los guardados no tienen placeholders en vuelo).
export function stripPendingUploadImagesFromHtml(html) {
  const source = html || ''
  if (!source.includes('blob:')) return source
  return source.replace(IMG_TAG_RE, (tag) => {
    const match = tag.match(SRC_ATTR_RE)
    return match && isPendingUploadSrc(match[1]) ? '' : tag
  })
}

// Espejo del anterior sobre el JSON de TipTap. No muta el nodo recibido:
// devuelve una copia con los nodos `image` de src blob: descartados.
// `content: []` se colapsa a "sin content" — es la forma canónica de un nodo
// vacío en TipTap y evita reinsertar arrays vacíos que ProseMirror rechaza.
export function stripPendingUploadImagesFromJson(node) {
  if (!node || typeof node !== 'object') return node
  if (!Array.isArray(node.content)) return node

  const content = []
  let changed = false

  for (const child of node.content) {
    if (child?.type === 'image' && isPendingUploadSrc(child?.attrs?.src)) {
      changed = true
      continue
    }
    const next = stripPendingUploadImagesFromJson(child)
    if (next !== child) changed = true
    content.push(next)
  }

  if (!changed) return node
  const cleaned = { ...node }
  if (content.length) cleaned.content = content
  else delete cleaned.content
  return cleaned
}

// Cuántos placeholders quedan en el HTML — para avisar al usuario en vez de
// tragarnos la pérdida en silencio.
export function countPendingUploadImages(html) {
  const source = html || ''
  if (!source.includes('blob:')) return 0
  let count = 0
  const re = new RegExp(IMG_TAG_RE.source, 'gi')
  let match
  while ((match = re.exec(source))) {
    const src = match[0].match(SRC_ATTR_RE)
    if (src && isPendingUploadSrc(src[1])) count += 1
  }
  return count
}

// ---------------------------------------------------------------------------
// F2 (robustez de subidas, 2026-09-11) — ver docs/superpowers/specs/
// 2026-09-11-remove-approval-robust-uploads-design.md Parte B. A diferencia
// de las funciones de arriba (que borran TODOS los blob: del documento antes
// de persistir), estas operan sobre UN placeholder puntual por tempUrl: son
// la contrapartida de una subida que ya terminó (bien o mal) y necesita
// resolverse exactamente donde quedó, sea el editor montado o el estado de
// otra página.

const ALT_ATTR_RE = /\balt\s*=\s*"([^"]*)"/i

function escapeImgAttr(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

// Serializa exactamente como EditableImageNode.addAttributes()/renderHTML
// (frontend/src/pages/ProjectEditor.jsx, la extensión Image.extend(...) justo
// antes de GoogleDocsHeadingShortcuts): src + alt (de la extensión Image
// base) y los data-* custom, cada uno solo si tiene valor. Nunca toca
// width/data-width — es tamaño elegido por el usuario, ajeno a la subida.
function serializePendingUploadImageTag(attrs) {
  const parts = [`src="${escapeImgAttr(attrs.src)}"`, `alt="${escapeImgAttr(attrs.alt || '')}"`]
  if (attrs.assetId) parts.push(`data-asset-id="${escapeImgAttr(attrs.assetId)}"`)
  if (attrs.fileName) parts.push(`data-file-name="${escapeImgAttr(attrs.fileName)}"`)
  if (attrs.storagePath) parts.push(`data-storage-path="${escapeImgAttr(attrs.storagePath)}"`)
  if (attrs.originalWidth) parts.push(`data-original-width="${escapeImgAttr(attrs.originalWidth)}"`)
  if (attrs.originalHeight) parts.push(`data-original-height="${escapeImgAttr(attrs.originalHeight)}"`)
  return `<img ${parts.join(' ')}>`
}

function jsonNodeHasPendingUpload(node, tempUrl) {
  if (!node || typeof node !== 'object') return false
  if (node.type === 'image' && node.attrs?.src === tempUrl) return true
  if (!Array.isArray(node.content)) return false
  return node.content.some((child) => jsonNodeHasPendingUpload(child, tempUrl))
}

// source: HTML (string) o JSON de TipTap (objeto/nodo). true si ese tempUrl
// todavía está insertado como <img>/nodo image.
export function hasPendingUpload(source, tempUrl) {
  if (!tempUrl) return false

  if (typeof source === 'string') {
    if (!source.includes(tempUrl)) return false
    const re = new RegExp(IMG_TAG_RE.source, 'gi')
    let match
    while ((match = re.exec(source))) {
      const src = match[0].match(SRC_ATTR_RE)
      if (src && src[1] === tempUrl) return true
    }
    return false
  }

  return jsonNodeHasPendingUpload(source, tempUrl)
}

// Reemplaza el <img src="tempUrl"> por uno con los attrs finales (post-
// upload). Conserva el `alt` original salvo que attrs traiga uno propio.
export function replacePendingUploadInHtml(html, tempUrl, attrs = {}) {
  const source = html || ''
  if (!tempUrl || !source.includes(tempUrl)) return source

  return source.replace(IMG_TAG_RE, (tag) => {
    const srcMatch = tag.match(SRC_ATTR_RE)
    if (!srcMatch || srcMatch[1] !== tempUrl) return tag
    const altMatch = tag.match(ALT_ATTR_RE)
    const inheritedAlt = altMatch ? altMatch[1] : ''
    return serializePendingUploadImageTag({ ...attrs, alt: attrs.alt ?? inheritedAlt })
  })
}

// Espejo de replacePendingUploadInHtml sobre JSON de TipTap. No muta el nodo
// recibido — copia solo a lo largo del camino que cambia (mismo criterio que
// stripPendingUploadImagesFromJson, arriba).
//
// Contrato: `attrs` debe traer el src final de la imagen ya subida —
// normalmente el objeto que devuelve `imageAttrsFromAsset`. Si se llama sin
// `src` (o sin `attrs` del todo) degrada a `''` en vez de dejar `src:
// undefined`, igual que `replacePendingUploadInHtml` (que serializa
// `escapeImgAttr(attrs.src)` → `""` cuando `attrs.src` es undefined) — un
// `src` undefined en el nodo sería una imagen rota indistinguible de un bug.
export function replacePendingUploadInJson(json, tempUrl, attrs = {}) {
  if (!json || typeof json !== 'object' || !tempUrl) return json

  if (json.type === 'image' && json.attrs?.src === tempUrl) {
    return { ...json, attrs: { ...json.attrs, ...attrs, src: attrs.src ?? '' } }
  }
  if (!Array.isArray(json.content)) return json

  let changed = false
  const content = json.content.map((child) => {
    const next = replacePendingUploadInJson(child, tempUrl, attrs)
    if (next !== child) changed = true
    return next
  })

  return changed ? { ...json, content } : json
}

// Quita el <img src="tempUrl"> puntual (subida fallida) — a diferencia de
// stripPendingUploadImagesFromHtml, que quita TODOS los blob:, esto apunta a
// uno solo por tempUrl.
export function removePendingUploadFromHtml(html, tempUrl) {
  const source = html || ''
  if (!tempUrl || !source.includes(tempUrl)) return source

  return source.replace(IMG_TAG_RE, (tag) => {
    const match = tag.match(SRC_ATTR_RE)
    return match && match[1] === tempUrl ? '' : tag
  })
}

// Espejo de removePendingUploadFromHtml sobre JSON de TipTap.
export function removePendingUploadFromJson(json, tempUrl) {
  if (!json || typeof json !== 'object' || !tempUrl) return json
  if (!Array.isArray(json.content)) return json

  const content = []
  let changed = false

  for (const child of json.content) {
    if (child?.type === 'image' && child?.attrs?.src === tempUrl) {
      changed = true
      continue
    }
    const next = removePendingUploadFromJson(child, tempUrl)
    if (next !== child) changed = true
    content.push(next)
  }

  if (!changed) return json
  const cleaned = { ...json, content }
  if (!content.length) delete cleaned.content
  return cleaned
}

// Filtra TODAS las páginas de un payload de PUT /api/projects/:id/pages
// (items { contentHtml, contentJson, ... }), no solo la activa — una página
// no-activa puede tener un placeholder de una subida que arrancó antes de
// navegar a otra. `dropped` es el total de placeholders descartados, para el
// aviso de guardado manual.
export function stripPendingUploadsFromPages(payloadPages) {
  const pages = []
  let dropped = 0

  for (const page of payloadPages || []) {
    const count = countPendingUploadImages(page?.contentHtml)
    if (!count) {
      pages.push(page)
      continue
    }
    dropped += count
    pages.push({
      ...page,
      contentHtml: stripPendingUploadImagesFromHtml(page.contentHtml),
      contentJson: stripPendingUploadImagesFromJson(page.contentJson),
    })
  }

  return { pages, dropped }
}

// Shape que deja un asset recién subido (POST /api/projects/:id/assets),
// listo para pasarle a replaceImageSrc / replacePendingUploadInHtml/Json.
// Null-safe: un asset incompleto no debe tirar, solo producir attrs vacíos.
export function imageAttrsFromAsset(asset, fallbackFileName = '') {
  return {
    src: asset?.publicUrl || '',
    assetId: asset?.id || null,
    fileName: asset?.fileName || fallbackFileName || '',
    storagePath: asset?.path || null,
    // ?? (no ||): un ancho/alto real de 0 es legítimo y no debe colapsar a null.
    originalWidth: asset?.width ?? null,
    originalHeight: asset?.height ?? null,
  }
}

// Tras un guardado exitoso, persistedPages ya NO tiene los placeholders
// blob: (saveProjectPages los filtró antes del PUT). Si localPages todavía
// tiene alguno para esa página (subida que seguía en vuelo cuando arrancó
// este guardado), conservamos el contenido local — perder el nodo del
// editor sería el mismo bug de siempre, solo que ahora vía setPages en vez
// de vía el PUT.
export function keepLocalPlaceholderContent(localPages, persistedPages) {
  const localById = new Map((localPages || []).map((page) => [page.id, page]))

  return (persistedPages || []).map((persistedPage) => {
    const localPage = localById.get(persistedPage.id)
    if (!localPage || !countPendingUploadImages(localPage.fullContent)) return persistedPage

    return {
      ...persistedPage,
      fullContent: localPage.fullContent,
      contentJson: localPage.contentJson,
      sections: localPage.sections,
    }
  })
}
