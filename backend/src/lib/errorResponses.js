import { logApplicationError } from './applicationErrors.js'

/**
 * Responde un 5xx sin filtrar el mensaje interno, y deja rastro para poder
 * diagnosticarlo (auditoria 2026-08, hallazgo M4).
 *
 * El problema que resuelve: las rutas capturaban el error de Supabase/PostgREST
 * y respondian `{ error: error.message }` directamente. Eso mandaba al cliente
 * texto de PostgREST — nombres de constraints, de columnas, a veces pistas de la
 * forma de la query — y en `public.js` ocurria en endpoints SIN autenticacion.
 * Ademas esos caminos nunca llamaban a logApplicationError, asi que se perdia el
 * `errorId` y el rastro de auditoria que el equipo ya habia construido.
 *
 * Contrato: el cliente recibe un mensaje generico y un `errorId`; el detalle
 * completo queda solo del lado del servidor, correlacionable por ese id.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {unknown} error            El error real (no se expone al cliente)
 * @param {string} clientMessage     Mensaje seguro, orientado al usuario
 * @param {{ status?: number, context?: Record<string, unknown> }} [options]
 */
export async function sendServerError(req, res, error, clientMessage, options = {}) {
  const status = options.status || 500
  const errorId = await logApplicationError(req, error, options.context || {})

  const payload = { error: clientMessage }
  if (errorId) payload.errorId = errorId
  if (req?.requestId) payload.requestId = req.requestId

  return res.status(status).json(payload)
}

/**
 * Variante para rutas que lanzan errores deliberados con `status` (ver el helper
 * `httpError(status, message)` de routes/users.js). En esos casos el mensaje SI
 * esta pensado para el usuario y se devuelve tal cual.
 *
 * La distincion importa: si un error de Supabase caia en el mismo catch, no traia
 * `status`, terminaba como 500 y filtraba el texto crudo de PostgREST. Aca solo
 * se confia en el mensaje cuando el error fue construido a proposito.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {any} error
 * @param {string} fallbackMessage  Se usa cuando el error NO es deliberado
 */
export async function sendHttpError(req, res, error, fallbackMessage) {
  const status = Number(error?.status)
  const isDeliberate = Number.isInteger(status) && status >= 400 && status < 600

  if (isDeliberate) {
    return res.status(status).json({ error: error.message || fallbackMessage })
  }

  return sendServerError(req, res, error, fallbackMessage)
}
