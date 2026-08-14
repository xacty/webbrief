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
