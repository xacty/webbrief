/**
 * Resolucion de la IP real del cliente — fuente unica de verdad.
 *
 * Por que existe este modulo:
 *   Nginx envia `X-Forwarded-For: $proxy_add_x_forwarded_for`, que AGREGA la IP
 *   real al final de lo que haya mandado el cliente. Leer la primera entrada
 *   (`split(',')[0]`) devuelve por lo tanto un valor 100% controlado por quien
 *   hace el request: alcanza con mandar `X-Forwarded-For: <lo que sea>` distinto
 *   en cada llamada para caer siempre en un bucket de rate limit nuevo y para
 *   evadir cualquier bloqueo de IP.
 *
 *   `req.ip` no tiene ese problema: Express usa `trust proxy` (ver index.js,
 *   seteado en 1 porque Nginx es el unico hop) para descartar las entradas que
 *   el cliente puede falsificar y quedarse con la que agrego el proxy confiable.
 *
 * Devuelve `null` cuando no se puede resolver; cada caller aplica su propio
 * fallback (la tabla `security_events` acepta null; las claves de rate limit no).
 */
export function getClientIp(req) {
  if (!req) return null

  if (typeof req.ip === 'string' && req.ip.trim()) {
    return req.ip.trim()
  }

  // Respaldo: Nginx setea X-Real-IP con $remote_addr via proxy_set_header, que
  // REEMPLAZA cualquier valor que haya mandado el cliente (a diferencia de XFF).
  const realIp = req.headers?.['x-real-ip']
  if (typeof realIp === 'string' && realIp.trim()) {
    return realIp.trim()
  }

  return req.socket?.remoteAddress || null
}
