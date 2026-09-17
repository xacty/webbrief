// ---------------------------------------------------------------------------
// return_to — preservación del destino a través del login
//
// Cuando `PrivateRoute` expulsa a `/login`, la ruta original (path + query +
// hash) viaja en `?return_to=`. El deep-link de un comentario
// (`/project/:id/editor?commentId=<uuid>`) depende de esto: sin el param, el
// usuario aterriza en el dashboard y el enlace del email se pierde.
//
// Regla de seguridad: solo rutas relativas del mismo origen. Nunca aceptamos
// URLs absolutas, protocol-relative (`//host`) ni variantes con backslash,
// porque abrirían un open-redirect desde un link de email.
// ---------------------------------------------------------------------------

// Rutas que nunca son un destino válido: volver al login (o a la pantalla de
// alta de contraseña) después de autenticarse deja al usuario en un bucle.
const BLOCKED_PREFIXES = ['/login', '/auth/']

export function buildReturnTo(location) {
  if (!location) return null
  const path = `${location.pathname || ''}${location.search || ''}${location.hash || ''}`
  if (!path || path === '/') return null
  if (BLOCKED_PREFIXES.some((prefix) => path.startsWith(prefix))) return null
  return path
}

// `value` llega ya decodificado por `URLSearchParams.get()`; no volver a
// decodificar acá o un `%2F` legítimo se convertiría en separador de ruta.
export function sanitizeReturnTo(value) {
  if (!value || typeof value !== 'string') return null
  if (!value.startsWith('/')) return null
  if (value.startsWith('//') || value.startsWith('/\\')) return null
  if (BLOCKED_PREFIXES.some((prefix) => value.startsWith(prefix))) return null
  return value
}
