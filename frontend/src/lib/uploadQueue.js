// Cola de subida para la biblioteca de imágenes: clasifica archivos
// aceptados/excluidos, arma el árbol de una carpeta arrastrada
// (webkitGetAsEntry recursivo) y orquesta la subida real con concurrencia
// limitada, reintento por ítem y limpieza de filas ya resueltas.
//
// Contrato real de uploadLibraryAsset (lib/libraryApi.js, Task 10): rechaza
// con ApiError {message, status, payload} — el código del backend (p. ej.
// `quota_exceeded`, `size_exceeded`, `unsupported_mime`) vive en
// `error.payload?.code`, NUNCA en `error.code` (esa clase no lo define).
// Se lee con fallback a `error.code` sólo por si algún reject futuro no
// pasara por ApiError (p. ej. un AbortError nativo).
import { uploadLibraryAsset } from './libraryApi'

export const ACCEPTED_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  // Passthrough en el backend (imageIngest.js PASSTHROUGH_MIMES), igual
  // que SVG: no se reconvierte, así que su fila de resultado siempre trae
  // savings=null. El plan original no la incluía en esta lista pero el
  // backend sí la acepta (decideUploadConversion) y el input de archivo ya
  // construido en LibraryPage debía sumarla — ver reporte de Task 12.
  'image/gif',
  'image/svg+xml',
])
export const MAX_FILE_BYTES = 30 * 1024 * 1024

export const EXCLUDE_REASON_LABELS = {
  unsupported: 'Formato no compatible — por ahora solo imágenes (JPG, PNG, WebP, GIF o SVG)',
  too_big: 'Supera 30 MB',
}

function classify(file) {
  if (!ACCEPTED_MIMES.has(file.type)) return 'unsupported'
  if (file.size > MAX_FILE_BYTES) return 'too_big'
  return null
}

export function partitionFiles(files) {
  const accepted = []
  const excluded = []
  for (const file of files) {
    const reason = classify(file)
    if (reason) excluded.push({ file, reason })
    else accepted.push(file)
  }
  return { accepted, excluded }
}

// Misma clasificación que partitionFiles pero para entradas {file,
// relativePath} — se usa en el drop de una carpeta completa
// (readDroppedItems), donde cada archivo necesita conservar en qué
// subcarpeta relativa vivía para el árbol de FolderUploadConfirmModal.
export function partitionEntries(entries) {
  const accepted = []
  const excluded = []
  for (const entry of entries) {
    const reason = classify(entry.file)
    if (reason) excluded.push({ ...entry, reason })
    else accepted.push(entry)
  }
  return { accepted, excluded }
}

export async function readDroppedItems(dataTransferItems) {
  // Devuelve { files: [{file, relativePath}], folderName|null }.
  // relativePath es la ruta de carpetas (incluyendo el nombre de la
  // carpeta raíz arrastrada) que contiene al archivo — p. ej. un archivo
  // suelto directo en la carpeta arrastrada "Fotos" llega con
  // relativePath "Fotos"; uno en "Fotos/2024" con "Fotos/2024". Archivos
  // sueltos (sin carpeta) llegan con relativePath "" y folderName null.
  const entries = [...dataTransferItems].map((i) => i.webkitGetAsEntry?.()).filter(Boolean)
  const files = []
  let folderName = null
  async function walk(entry, prefix) {
    if (entry.isFile) {
      const file = await new Promise((res, rej) => entry.file(res, rej))
      files.push({ file, relativePath: prefix })
    } else if (entry.isDirectory) {
      if (!prefix && !folderName) folderName = entry.name
      const reader = entry.createReader()
      let batch
      do {
        batch = await new Promise((res, rej) => reader.readEntries(res, rej))
        for (const child of batch) await walk(child, prefix ? `${prefix}/${entry.name}` : entry.name)
      } while (batch.length)
    }
  }
  for (const entry of entries) await walk(entry, '')
  return { files, folderName }
}

// Convierte el FileList de un <input type="file" webkitdirectory> — la
// carpeta se elige vía diálogo nativo en vez de arrastrarse (F1.2-B, punto
// 3: "Subir carpeta" desde el menú de biblioteca) — al mismo shape
// { files: [{file, relativePath}], folderName } que readDroppedItems, para
// que AMBOS caminos alimenten el mismo FolderUploadConfirmModal sin que le
// importe el origen. `file.webkitRelativePath` llega como
// "CarpetaRaiz/sub/archivo.jpg"; le sacamos el nombre de archivo para
// quedarnos con la ruta de carpeta (mismo formato que folderName/prefix en
// readDroppedItems: un archivo suelto directo en la carpeta raíz
// seleccionada llega con relativePath === folderName, sin el nombre de
// archivo).
export function readPickedDirectoryFiles(fileList) {
  const files = []
  let folderName = null
  for (const file of Array.from(fileList || [])) {
    const full = file.webkitRelativePath || ''
    const segments = full.split('/')
    segments.pop() // descarta el nombre de archivo, nos quedamos con la carpeta
    const relativePath = segments.join('/')
    if (!folderName && segments.length) folderName = segments[0]
    files.push({ file, relativePath })
  }
  return { files, folderName }
}

export function createUploadQueue({ companyId, onUpdate, concurrency = 3 }) {
  const items = []
  let active = 0
  let seq = 0
  const notify = () => onUpdate([...items])

  function pump() {
    while (active < concurrency) {
      const next = items.find((i) => i.status === 'queued')
      if (!next) break
      active += 1
      next.status = 'uploading'
      notify()
      uploadLibraryAsset({
        companyId,
        folderId: next.folderId,
        file: next.file,
        onProgress: (pct) => {
          next.progress = pct
          if (pct === 100) next.status = 'converting'
          notify()
        },
      })
        .then((payload) => {
          next.status = 'done'
          next.result = payload
          notify()
        })
        .catch((error) => {
          const code = error?.payload?.code || error?.code || null
          next.status = 'error'
          next.error = code === 'quota_exceeded' ? 'Espacio lleno' : (error?.message || 'Error al subir')
          next.errorCode = code
          notify()
        })
        .finally(() => {
          active -= 1
          pump()
        })
    }
  }

  return {
    add(files) {
      for (const { file, folderId } of files) {
        items.push({ id: `u${seq++}-${file.name}`, file, folderId: folderId || null, status: 'queued', progress: 0 })
      }
      notify()
      pump()
    },
    // Filas informativas para archivos descartados ANTES de intentar
    // subirlos (formato no soportado / supera el límite): nunca pasan por
    // pump()/red. Se muestran igual como filas en UploadQueuePanel para
    // que el resultado del drop quede visible en un único lugar, sin
    // inventar un sistema de toasts aparte que no existe hoy fuera del
    // editor (ver reporte de Task 12).
    addExcluded(excluded) {
      for (const { file, reason } of excluded) {
        items.push({ id: `u${seq++}-${file.name}`, file, folderId: null, status: 'excluded', reason, progress: 0 })
      }
      notify()
    },
    retry(id) {
      const item = items.find((i) => i.id === id)
      if (item && item.status === 'error') {
        item.status = 'queued'
        item.error = null
        item.errorCode = null
        notify()
        pump()
      }
    },
    // Limpia filas que ya no requieren acción del usuario (subidas y
    // descartadas). Las que quedaron en error se mantienen hasta que se
    // reintenten con éxito — necesitan el botón "Reintentar" visible.
    clearDone() {
      for (let i = items.length - 1; i >= 0; i--) {
        if (items[i].status === 'done' || items[i].status === 'excluded') items.splice(i, 1)
      }
      notify()
    },
    items,
  }
}

// Punto de entrada único para "tengo una lista plana de File — repartilos
// entre la cola (aceptados) y las filas informativas (excluidos)". Lo usan
// tanto el <input type="file"> de LibraryPage como el drop de archivos
// sueltos en UploadDropzone, para no duplicar partición + encolado.
export function enqueueFiles(queue, files, folderId) {
  const { accepted, excluded } = partitionFiles(files)
  if (accepted.length) queue.add(accepted.map((file) => ({ file, folderId: folderId || null })))
  if (excluded.length) queue.addExcluded(excluded)
  return { acceptedCount: accepted.length, excludedCount: excluded.length }
}

// ── Formato de tamaños ──────────────────────────────────────────────────
// Compartido entre UploadQueuePanel y FolderUploadConfirmModal. KB por
// debajo de 1 MB, MB en adelante; hasta un decimal sin ceros de más
// (8,2 MB / 290 KB), coma decimal vía toLocaleString('es-ES') — mismo
// locale que companyFormatters.js.
const KB = 1024
const MB = 1024 * 1024

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return ''
  if (bytes < KB) return `${bytes} B`
  const [value, unit] = bytes < MB ? [bytes / KB, 'KB'] : [bytes / MB, 'MB']
  return `${value.toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 1 })} ${unit}`
}

export function formatSavings(originalBytes, finalBytes) {
  if (!Number.isFinite(originalBytes) || !Number.isFinite(finalBytes)) return null
  return `${formatBytes(originalBytes)} → ${formatBytes(finalBytes)}`
}
