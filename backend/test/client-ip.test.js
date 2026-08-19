import assert from 'node:assert/strict'
import { test } from 'node:test'
import { getClientIp } from '../src/lib/clientIp.js'

// Contexto del fix (auditoria 2026-08, hallazgo A3):
//   Nginx manda `X-Forwarded-For: $proxy_add_x_forwarded_for`, que AGREGA la IP
//   real al final de lo que mando el cliente. La implementacion vieja leia
//   `split(',')[0]`, o sea la entrada mas a la IZQUIERDA, que es exactamente la
//   que controla el atacante. Eso permitia rotar de bucket de rate limit en cada
//   request y evadir los bloqueos de IP.
//
//   Express ya resuelve esto bien via `trust proxy` (index.js lo setea en 1),
//   asi que estos tests fijan que la resolucion se apoye en `req.ip` y NUNCA en
//   la primera entrada de X-Forwarded-For.

const xffSpoofed = { 'x-forwarded-for': '1.2.3.4, 203.0.113.7' }

test('getClientIp: ignora X-Forwarded-For falsificado y usa req.ip', () => {
  const req = { ip: '203.0.113.7', headers: xffSpoofed, socket: { remoteAddress: '127.0.0.1' } }
  assert.equal(getClientIp(req), '203.0.113.7')
})

test('getClientIp: no devuelve la primera entrada de X-Forwarded-For (regresion A3)', () => {
  const req = { ip: '203.0.113.7', headers: xffSpoofed, socket: { remoteAddress: '127.0.0.1' } }
  assert.notEqual(getClientIp(req), '1.2.3.4')
})

test('getClientIp: un atacante que rota XFF no cambia la IP resuelta', () => {
  const base = { ip: '203.0.113.7', socket: { remoteAddress: '127.0.0.1' } }
  const a = getClientIp({ ...base, headers: { 'x-forwarded-for': 'evil-1, 203.0.113.7' } })
  const b = getClientIp({ ...base, headers: { 'x-forwarded-for': 'evil-2, 203.0.113.7' } })
  // Misma IP resuelta => misma clave de rate limit => el bucket no se puede rotar.
  assert.equal(a, b)
  assert.equal(a, '203.0.113.7')
})

test('getClientIp: cae a X-Real-IP cuando no hay req.ip', () => {
  // Nginx setea X-Real-IP con proxy_set_header, que REEMPLAZA lo que mande el
  // cliente (a diferencia de XFF, que se acumula).
  const req = { headers: { 'x-real-ip': '203.0.113.9', ...xffSpoofed } }
  assert.equal(getClientIp(req), '203.0.113.9')
})

test('getClientIp: ultimo recurso es el socket, nunca el header del cliente', () => {
  const req = { headers: xffSpoofed, socket: { remoteAddress: '198.51.100.4' } }
  assert.equal(getClientIp(req), '198.51.100.4')
})

test('getClientIp: devuelve null cuando no hay nada que resolver', () => {
  assert.equal(getClientIp({ headers: {} }), null)
  assert.equal(getClientIp(null), null)
})

test('getClientIp: ignora valores vacios o solo-espacios en req.ip', () => {
  const req = { ip: '   ', headers: { 'x-real-ip': '203.0.113.9' } }
  assert.equal(getClientIp(req), '203.0.113.9')
})
