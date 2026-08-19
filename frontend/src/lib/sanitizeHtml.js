import DOMPurify from 'dompurify'

// Saneo de HTML de contenido en el lado del render (defensa en profundidad — S1).
//
// content_html se inyecta con dangerouslySetInnerHTML en la página pública de
// compartir y en los paneles Preview/Handoff del editor. El backend ya sanea al
// guardar y en la salida pública (backend/src/lib/htmlSanitizer.js), pero saneamos
// también aquí, en el punto exacto de inyección, para cubrir cualquier contenido
// que llegue por otra ruta (p. ej. contenido legacy ya almacenado renderizado en
// el editor) sin depender de que todas las rutas de lectura del backend saneen.
//
// DOMPurify por defecto: conserva las etiquetas HTML estándar que produce TipTap,
// los atributos data-* (data-section-*, data-cta-*, data-comment-*), class y style
// (saneando su valor), y elimina <script>, handlers on* y schemes javascript:.
const CONFIG = {
  USE_PROFILES: { html: true }, // sin SVG/MathML en contenido => menos superficie
  ADD_ATTR: ['target'], // links del editor pueden abrir en nueva pestaña
  FORBID_TAGS: ['style'], // no necesitamos la etiqueta <style> dentro del contenido
}

/**
 * Sanea HTML de contenido para inyección segura, preservando el marcado del editor.
 * @param {string} html
 * @returns {string} HTML saneado ('' para entradas vacías/no-string)
 */
export function sanitizeContentHtml(html) {
  if (!html || typeof html !== 'string') return ''
  return DOMPurify.sanitize(html, CONFIG)
}
