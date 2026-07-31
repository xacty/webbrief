import assert from 'node:assert/strict'
import { test } from 'node:test'

// `chunkReload.js` guarda estado a nivel de módulo (bandera de recarga en curso
// y de listener instalado) que en producción vive lo que dura la carga de la
// página. Cada import con query distinta simula una carga nueva.
let pageLoad = 0
async function freshModule() {
  pageLoad += 1
  return import(`../../frontend/src/lib/chunkReload.js?load=${pageLoad}`)
}

// Stub mínimo de window: cuenta recargas y permite inyectar un sessionStorage
// que falla, para cubrir el modo privado.
function stubWindow({ storage = new Map(), throwOnStorage = false } = {}) {
  const listeners = []
  const win = {
    reloadCount: 0,
    listeners,
    location: { reload() { win.reloadCount += 1 } },
    sessionStorage: {
      getItem(key) {
        if (throwOnStorage) throw new Error('SecurityError')
        return storage.has(key) ? storage.get(key) : null
      },
      setItem(key, value) {
        if (throwOnStorage) throw new Error('QuotaExceededError')
        storage.set(key, value)
      },
    },
    addEventListener(type, fn) { listeners.push({ type, fn }) },
  }
  globalThis.window = win
  return win
}

const RELOAD_KEY = 'webrief:chunk-reload-at'

// -------- 1. isChunkLoadError --------

test('isChunkLoadError: reconoce el mensaje real de cada navegador', async () => {
  const { isChunkLoadError } = await freshModule()
  const messages = [
    'Failed to fetch dynamically imported module: https://webrief.app/assets/ProjectEditor-CQEigdPz.js',
    'error loading dynamically imported module',
    'Importing a module script failed.',
    'Unable to preload CSS for /assets/index-9SpUsgQ7.css',
    "Failed to load module script: Expected a JavaScript module script but the server responded with a MIME type of \"text/html\".",
  ]
  for (const message of messages) {
    assert.equal(isChunkLoadError(new Error(message)), true, message)
    assert.equal(isChunkLoadError(message), true, `${message} (como string)`)
  }
})

test('isChunkLoadError: no confunde un crash normal ni valores basura', async () => {
  const { isChunkLoadError } = await freshModule()
  assert.equal(isChunkLoadError(new TypeError("Cannot read properties of undefined (reading 'map')")), false)
  for (const value of [null, undefined, 0, 42, {}, []]) {
    assert.equal(isChunkLoadError(value), false, String(value))
  }
})

// -------- 2. reloadForNewVersion --------

test('reloadForNewVersion: recarga una vez y sella el timestamp', async () => {
  const storage = new Map()
  const win = stubWindow({ storage })
  const { reloadForNewVersion } = await freshModule()

  assert.equal(reloadForNewVersion(), true)
  assert.equal(win.reloadCount, 1)
  assert.ok(Number(storage.get(RELOAD_KEY)) > 0)
})

test('reloadForNewVersion: llamados repetidos en la misma carga no apilan recargas', async () => {
  // El fallo llega dos veces (evento vite:preloadError + rechazo del lazy que
  // sube al ErrorBoundary). El segundo llamado debe seguir devolviendo `true`
  // — hay una recarga en curso — para que el boundary muestre "Actualizando…"
  // y no la pantalla de recarga manual.
  const win = stubWindow()
  const { reloadForNewVersion } = await freshModule()

  assert.equal(reloadForNewVersion(), true)
  assert.equal(reloadForNewVersion(), true)
  assert.equal(reloadForNewVersion(), true)
  assert.equal(win.reloadCount, 1)
})

test('reloadForNewVersion: tras recargar, un fallo inmediato NO vuelve a recargar', async () => {
  // Carga nueva de página: el módulo arranca limpio pero el sello sigue en
  // sessionStorage. Es la protección anti-loop.
  const storage = new Map([[RELOAD_KEY, String(Date.now() - 1000)]])
  const win = stubWindow({ storage })
  const { reloadForNewVersion } = await freshModule()

  assert.equal(reloadForNewVersion(), false)
  assert.equal(win.reloadCount, 0)
})

test('reloadForNewVersion: pasado el cooldown vuelve a recargar', async () => {
  const storage = new Map([[RELOAD_KEY, String(Date.now() - 11000)]])
  const win = stubWindow({ storage })
  const { reloadForNewVersion } = await freshModule()

  assert.equal(reloadForNewVersion(), true)
  assert.equal(win.reloadCount, 1)
})

test('reloadForNewVersion: si sessionStorage falla, recarga igual (fail-open)', async () => {
  const win = stubWindow({ throwOnStorage: true })
  const { reloadForNewVersion } = await freshModule()

  assert.equal(reloadForNewVersion(), true)
  assert.equal(win.reloadCount, 1)
})

test('reloadForNewVersion: sin window no hace nada', async () => {
  delete globalThis.window
  const { reloadForNewVersion } = await freshModule()
  assert.equal(reloadForNewVersion(), false)
})

// -------- 3. installChunkReloadHandler --------

test('installChunkReloadHandler: es idempotente y el handler no cancela el error de Vite', async () => {
  const win = stubWindow()
  const { installChunkReloadHandler } = await freshModule()

  installChunkReloadHandler()
  installChunkReloadHandler()
  assert.equal(win.listeners.length, 1)
  assert.equal(win.listeners[0].type, 'vite:preloadError')

  let prevented = false
  win.listeners[0].fn({ preventDefault() { prevented = true } })
  assert.equal(prevented, false, 'no debe cancelar el error real de Vite')
  assert.equal(win.reloadCount, 1)
})
