/**
 * Recuperación ante chunks huérfanos tras un deploy.
 *
 * Las páginas se cargan con React.lazy() en chunks con hash de contenido. Al
 * deployar, los chunks viejos desaparecen del servidor: una pestaña abierta
 * desde antes pide un archivo que ya no existe y el import() dinámico falla.
 * Como react-router v7 envuelve el cambio de ruta en startTransition, esa
 * transición nunca commitea y la app queda congelada aunque la URL sí cambió.
 * Además, el fallback SPA de Nginx responde index.html con MIME text/html,
 * que el navegador rechaza como módulo. En todos esos casos la única salida
 * es recargar para tomar el manifest nuevo.
 */

// Mensajes reales de cada navegador. Se comparan en minúsculas porque el
// texto exacto varía entre versiones y no es parte de ningún contrato.
const CHUNK_ERROR_PATTERNS = [
  'failed to fetch dynamically imported module', // Chrome / Edge
  'error loading dynamically imported module', // Firefox
  'importing a module script failed', // Safari
  'unable to preload css', // helper de preload de Vite
  'failed to load module script', // prefijo del error de MIME en Chrome
  'expected a javascript module script', // fallback SPA: llegó HTML en vez de JS
  "'text/html' is not a valid javascript mime type", // misma causa, texto de Firefox
  'dynamically imported module', // red de seguridad ante nuevas variantes de texto
  'chunkloaderror', // error.name que usan otros bundlers
]

const RELOAD_KEY = 'webrief:chunk-reload-at'

// Si el chunk sigue sin aparecer justo después de recargar, el problema no es
// el deploy y recargar de nuevo solo generaría un loop infinito.
const RELOAD_COOLDOWN_MS = 10000

export function isChunkLoadError(error) {
  if (!error) return false

  const haystack = typeof error === 'string'
    ? error
    : `${error.name || ''} ${error.message || ''}`

  const normalized = haystack.toLowerCase()
  return CHUNK_ERROR_PATTERNS.some((pattern) => normalized.includes(pattern))
}

// Un mismo fallo llega por dos caminos: el evento `vite:preloadError` y, poco
// después, el rechazo del React.lazy que sube al ErrorBoundary. Sin esta
// bandera el segundo llamado chocaría contra el cooldown y devolvería `false`,
// haciendo que el boundary muestre "recarga manual" mientras la recarga ya
// está en curso. Vive por carga de página: al recargar se resetea y el
// cooldown en sessionStorage vuelve a ser la única protección anti-loop.
let reloadInFlight = false

export function reloadForNewVersion() {
  if (typeof window === 'undefined') return false
  if (reloadInFlight) return true

  const now = Date.now()

  try {
    const lastReloadAt = Number(window.sessionStorage.getItem(RELOAD_KEY))
    if (Number.isFinite(lastReloadAt) && lastReloadAt > 0 && now - lastReloadAt < RELOAD_COOLDOWN_MS) {
      return false
    }
    window.sessionStorage.setItem(RELOAD_KEY, String(now))
  } catch {
    // sessionStorage puede fallar en modo privado o con la cuota llena.
    // Recargamos igual: dejar al usuario atascado es peor que arriesgar
    // una segunda recarga.
  }

  reloadInFlight = true
  window.location.reload()
  return true
}

// El listener es global y vive todo el ciclo de la app, así que se registra
// una sola vez.
let handlerInstalled = false

export function installChunkReloadHandler() {
  if (typeof window === 'undefined' || handlerInstalled) return
  handlerInstalled = true

  window.addEventListener('vite:preloadError', (event) => {
    // A propósito NO se llama a event.preventDefault() acá, aunque sea lo
    // primero que uno intentaría "arreglar": si se cancela el evento, Vite
    // no relanza el error y el import() dinámico resuelve con `undefined`,
    // lo que hace que React.lazy explote con un TypeError genérico que
    // isChunkLoadError() no reconoce como error de chunk.
    reloadForNewVersion()
  })
}
