// Saneo server-side de SVG en la ingesta de imágenes.
//
// Contexto: los SVG subidos (biblioteca, editor, brief interno y brief
// público) se almacenaban tal cual ("passthrough") y se sirven luego desde
// ImageKit (ik.imagekit.io) o desde el bucket privado `brief-documents`.
// Embebidos vía <img> los scripts no ejecutan, pero al abrir la URL directa
// el navegador trata el documento como SVG activo y ejecuta <script>,
// manejadores on*, javascript: en href y HTML dentro de <foreignObject>.
// Este módulo elimina todo lo ejecutable ANTES de persistir, así ningún SVG
// sin sanear entra al almacenamiento.
//
// Criterio unificado con la auditoría 2026-06 (rama fix/security-s1-xss-
// sanitization): misma familia DOMPurify que usa el frontend para HTML,
// aquí con jsdom porque corre en Node.
//
// Arquitectura del saneo (el orden importa):
// 1. Se quitan prólogo XML y DOCTYPE (riesgo de entidades DTD; no aportan
//    al render). Cualquier otra processing instruction (p. ej.
//    xml-stylesheet) la descarta DOMPurify por no ser un elemento permitido.
// 2. La entrada debe parsear como XML bien formado con raíz <svg> — es
//    exactamente lo que hará el navegador al recibir image/svg+xml, así que
//    un archivo que no pasa este check tampoco renderizaría; se rechaza en
//    la subida en lugar de almacenar un archivo roto.
// 3. DOMPurify sanea con su perfil SVG en modo HTML (su configuración más
//    probada): el parser normaliza el case de elementos/atributos SVG
//    (linearGradient, viewBox…) para que matcheen la allow-list sin
//    perderlos.
// 4. El árbol limpio se serializa con XMLSerializer, que escapa caracteres
//    especiales y declara los namespaces necesarios (p. ej. xmlns:xlink),
//    y el resultado se re-valida como XML: garantía de que TODO SVG
//    almacenado es XML bien formado y sin contenido activo.
import createDOMPurify from 'dompurify'
import { JSDOM } from 'jsdom'

const { window } = new JSDOM('')
const purifier = createDOMPurify(window)

export const SVG_MIME_TYPE = 'image/svg+xml'

const XLINK_NS = 'http://www.w3.org/1999/xlink'

const SANITIZE_OPTIONS = {
  USE_PROFILES: { svg: true, svgFilters: true },
  // foreignObject permite incrustar HTML arbitrario dentro del SVG y script
  // es ejecución directa: fuera ambos, incluyendo su contenido.
  FORBID_TAGS: ['script', 'foreignObject'],
  FORBID_CONTENTS: ['script', 'foreignObject'],
  // <use> no está en el perfil SVG de DOMPurify porque puede referenciar
  // documentos externos; se readmite y el hook de abajo lo restringe a
  // referencias internas (#id), que es lo que emiten las herramientas de
  // diseño para reutilizar símbolos.
  ADD_TAGS: ['use'],
  RETURN_DOM: true,
}

// Restringe href/xlink:href de <use> a fragmentos internos (#id).
purifier.addHook('afterSanitizeAttributes', (node) => {
  if (node.localName !== 'use') return
  for (const name of ['href', 'xlink:href']) {
    const value = node.getAttribute(name)
    if (value !== null && !/^#/u.test(value.trim())) node.removeAttribute(name)
  }
  const nsValue = node.getAttributeNS(XLINK_NS, 'href')
  if (nsValue !== null && nsValue !== '' && !/^#/u.test(nsValue.trim())) {
    node.removeAttributeNS(XLINK_NS, 'href')
  }
})

// El prólogo XML, el DOCTYPE (con eventual subset interno [ … ]) y los
// comentarios/PIs iniciales se quitan antes de parsear: sin DOCTYPE no hay
// entidades custom, y una entidad no definida hace fallar el parseo XML
// (fail-closed frente a XXE/billion laughs). Implementado como scanner
// lineal con indexOf — nada de regex con backtracking sobre entrada de
// hasta 8 MB controlada por el atacante (ReDoS). Devuelve null si un nodo
// de cabecera quedó sin cerrar.
function stripLeadingPrologNodes(text) {
  let rest = text
  for (;;) {
    rest = rest.replace(/^\s+/u, '')
    if (rest.startsWith('<?')) {
      const end = rest.indexOf('?>')
      if (end === -1) return null
      rest = rest.slice(end + 2)
      continue
    }
    if (rest.startsWith('<!--')) {
      const end = rest.indexOf('-->')
      if (end === -1) return null
      rest = rest.slice(end + 3)
      continue
    }
    if (/^<!DOCTYPE/iu.test(rest)) {
      const gt = rest.indexOf('>')
      if (gt === -1) return null
      const bracket = rest.indexOf('[')
      if (bracket !== -1 && bracket < gt) {
        const closeBracket = rest.indexOf(']', bracket)
        if (closeBracket === -1) return null
        const gtAfterSubset = rest.indexOf('>', closeBracket)
        if (gtAfterSubset === -1) return null
        rest = rest.slice(gtAfterSubset + 1)
      } else {
        rest = rest.slice(gt + 1)
      }
      continue
    }
    return rest
  }
}

// Parsea como XML (mismo modo que el navegador para image/svg+xml) y
// devuelve el documento solo si está bien formado y su raíz es <svg>.
function parseAsSvgXml(text) {
  let doc
  try {
    doc = new window.DOMParser().parseFromString(text, SVG_MIME_TYPE)
  } catch {
    return null
  }
  if (!doc || doc.getElementsByTagName('parsererror').length > 0) return null
  if (!doc.documentElement || doc.documentElement.localName !== 'svg') return null
  return doc
}

export function sanitizeSvg(input) {
  const raw = String(input ?? '').replace(/^﻿/u, '').trim()
  if (!raw) return { ok: false, reason: 'invalid_svg' }

  const prepared = stripLeadingPrologNodes(raw)
  if (!prepared || !parseAsSvgXml(prepared)) return { ok: false, reason: 'invalid_svg' }

  let cleanRoot = null
  try {
    const cleanBody = purifier.sanitize(prepared, SANITIZE_OPTIONS)
    cleanRoot = cleanBody?.firstElementChild ?? null
  } catch {
    return { ok: false, reason: 'invalid_svg' }
  }
  if (!cleanRoot || cleanRoot.localName !== 'svg') return { ok: false, reason: 'invalid_svg' }

  let clean = ''
  try {
    clean = new window.XMLSerializer().serializeToString(cleanRoot)
  } catch {
    return { ok: false, reason: 'invalid_svg' }
  }

  // Garantía final: lo que se almacena parsea como SVG/XML válido.
  if (!parseAsSvgXml(clean)) return { ok: false, reason: 'invalid_svg' }

  return { ok: true, svg: clean, changed: clean !== raw }
}

export function sanitizeSvgBuffer(buffer) {
  if (!buffer || typeof buffer.toString !== 'function') {
    return { ok: false, reason: 'invalid_svg' }
  }
  const result = sanitizeSvg(buffer.toString('utf8'))
  if (!result.ok) return result
  return { ok: true, buffer: Buffer.from(result.svg, 'utf8'), changed: result.changed }
}

// Chokepoint para las rutas de subida: los mime que no son SVG pasan intactos
// (mismo buffer, sin costo); los SVG se sanean o se rechazan.
export function sanitizeIfSvg({ mimeType = '', buffer } = {}) {
  if (mimeType !== SVG_MIME_TYPE) return { ok: true, buffer, changed: false }
  return sanitizeSvgBuffer(buffer)
}
