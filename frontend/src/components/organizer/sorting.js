// Comparadores genéricos (nombre/fecha/tamaño, asc/desc) — extraídos en
// O2.a hacia `organizer/` para reuso entre la biblioteca de imágenes
// (`frontend/src/lib/libraryAssetUtils.js`, sort de assets por
// nombre/tamaño/dimensiones/formato/fecha) y, a futuro, la vista lista de
// ProjectsPage (Ola 2).
//
// Desviación respecto al plan original: el plan asumía que estos
// comparadores vivían dentro de `library/AssetGrid.jsx`; en el código real
// AssetGrid.jsx NUNCA ordena — sólo recibe `assets` ya ordenados por props
// y muestra el ícono/aria-sort de la columna activa (`sortIndicator`/
// `ariaSortValue`, helpers puramente presentacionales atados a sus propios
// íconos/CSS, no comparadores — se dejan donde están). El comparador real
// vivía en `libraryAssetUtils.compareAssets`, así que ES ESE archivo el
// que ahora importa de acá; el efecto para AssetGrid (recibir assets ya
// ordenados con el mismo criterio) es idéntico.
//
// Funciones puras sobre VALORES (no sobre objetos de dominio) para que
// cada caller decida qué campo de su propio modelo alimenta cada
// comparador, en vez de acoplar el comparador a nombres de campo como
// `file_name`/`file_size`.

// Compara strings con criterio "es" (mismo locale usado hoy por
// `file_name`/`mimeLabel(...)`.localeCompare).
export function compareStrings(a, b) {
  return (a || '').localeCompare(b || '', 'es')
}

// Compara números (tamaño, dimensiones, o cualquier métrica). `null`/
// `undefined` cuentan como 0, mismo criterio que el `(a.x || 0)` previo.
export function compareNumbers(a, b) {
  return (a || 0) - (b || 0)
}

// Compara fechas (ISO string, epoch o Date) — mismo criterio que
// `new Date(a.created_at || 0) - new Date(b.created_at || 0)`.
export function compareDates(a, b) {
  return new Date(a || 0) - new Date(b || 0)
}

// Aplica dirección asc/desc sobre un array ya comparado con `compareFn`.
// No muta `items` — misma garantía que el `sortAssets` previo (spread
// antes de sort).
export function sortWithDirection(items, compareFn, dir) {
  const sorted = [...(items || [])].sort(compareFn)
  return dir === 'desc' ? sorted.reverse() : sorted
}
