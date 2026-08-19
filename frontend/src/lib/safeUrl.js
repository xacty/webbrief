// Validación de esquema de URL para el nodo CTA (auditoría 2026-08, hallazgo A2).
//
// Por qué existe: el mark `Link` estándar de TipTap ya trae su propio allowlist
// (`isAllowedUri`) y rechaza `javascript:` tanto al setear como al serializar. El
// nodo CTA de WeBrief es custom y reimplementó el concepto desde cero SIN esa
// validación, así que aceptaba `javascript:alert(...)` como URL, lo serializaba
// dentro de content_html y lo re-hidrataba como href en cada carga.
//
// IMPORTANTE — mantener esta lista sincronizada con SAFE_URL_SCHEMES de
// backend/src/lib/htmlSanitizer.js. Si divergen, el editor aceptaría una URL que
// el backend después descarta al guardar (o al revés), y el usuario perdería el
// CTA en silencio.
const SAFE_URL_SCHEMES = ['http', 'https', 'mailto']

/**
 * ¿Es seguro usar este valor como href?
 * Acepta relativos y anclas; para URLs con esquema exige la allow-list.
 * @param {string} value
 * @returns {boolean}
 */
export function isSafeUrl(value) {
  const v = String(value || '').trim()
  if (!v) return false
  if (/^[#/?]/.test(v)) return true // relativo o ancla
  const match = /^([a-z][a-z0-9+.-]*):/i.exec(v)
  if (!match) return true // sin esquema => relativo
  return SAFE_URL_SCHEMES.includes(match[1].toLowerCase())
}

/**
 * Devuelve la URL si es segura, o '' si no lo es.
 * Pensado para los puntos de serialización/render, donde no hay a quién avisarle.
 * @param {string} value
 * @returns {string}
 */
export function safeUrlOrEmpty(value) {
  const v = String(value || '').trim()
  return isSafeUrl(v) ? v : ''
}

export { SAFE_URL_SCHEMES }
