import sanitizeHtml from 'sanitize-html'

// Saneo de HTML de contenido (content_html de project_pages).
//
// Contexto S1 (auditoría 2026-06): content_html se renderiza con
// dangerouslySetInnerHTML en la página pública de compartir y en el editor.
// Antes no se saneaba nada (stripCommentMarks sólo desenvuelve spans por regex),
// así que un editor podía persistir <script>/onerror y ejecutarlo en el navegador
// de cualquier visitante. Esta función elimina todo lo ejecutable y PRESERVA el
// marcado load-bearing del editor TipTap (sectionDivider, CTA, comment marks,
// imágenes con sus data-*, tablas, estilos de alineación/color).
//
// La allow-list se deriva de las extensiones del editor (frontend):
// StarterKit + Underline + Link + Image (custom) + Table + TextAlign + Color +
// Highlight + nodos custom sectionDivider/CTA + CommentMark.

const SAFE_URL_SCHEMES = ['http', 'https', 'mailto']

// Props de estilo inline permitidas y validación estricta de sus valores.
// TipTap emite: text-align (TextAlign), color (Color), background-color
// (Highlight) y width (columnas/celdas de tabla). Todo lo demás se descarta,
// lo que mata vectores como url(javascript:) o expression().
const ALLOWED_STYLES = {
  '*': {
    'text-align': [/^(left|right|center|justify)$/i],
    color: [/^#[0-9a-f]{3,8}$/i, /^rgba?\(\s*[\d.,\s%]+\)$/i, /^[a-z]+$/i],
    'background-color': [/^#[0-9a-f]{3,8}$/i, /^rgba?\(\s*[\d.,\s%]+\)$/i, /^[a-z]+$/i],
    width: [/^\d+(\.\d+)?(px|%|em|rem)?$/i],
  },
}

// Un valor de URL es seguro si es relativo/ancla o usa un scheme de la allow-list.
function isSafeUrl(value) {
  const v = String(value || '').trim()
  if (!v) return false
  if (/^[#/?]/.test(v)) return true // relativo o ancla
  const m = /^([a-z][a-z0-9+.-]*):/i.exec(v)
  if (!m) return true // sin scheme => relativo
  return SAFE_URL_SCHEMES.includes(m[1].toLowerCase())
}

const SANITIZE_OPTIONS = {
  allowedTags: [
    'p', 'br', 'hr', 'blockquote', 'pre', 'code',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'ul', 'ol', 'li',
    'strong', 'b', 'em', 'i', 'u', 's', 'strike', 'mark', 'sub', 'sup', 'span',
    'a', 'img',
    'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'colgroup', 'col', 'caption',
    'div',
  ],
  allowedAttributes: {
    '*': ['class', 'style', 'data-*'],
    a: ['href', 'target', 'rel', 'name'],
    img: ['src', 'alt', 'title', 'width', 'height'],
    td: ['colspan', 'rowspan'],
    th: ['colspan', 'rowspan'],
    col: ['span'],
    colgroup: ['span'],
    ol: ['start', 'type'],
  },
  allowedStyles: ALLOWED_STYLES,
  allowedSchemes: SAFE_URL_SCHEMES,
  allowedSchemesByTag: {
    a: SAFE_URL_SCHEMES,
    img: ['http', 'https'], // sin data: para imágenes (evita data:text/html y SVG con script)
  },
  allowProtocolRelative: false,
  // El CTA guarda la URL en data-cta-url y el editor la re-renderiza como href al
  // cargar; hay que validar su scheme aquí o reaparece el javascript: en el editor.
  transformTags: {
    div: (tagName, attribs) => {
      if ('data-cta-url' in attribs && !isSafeUrl(attribs['data-cta-url'])) {
        delete attribs['data-cta-url']
      }
      return { tagName, attribs }
    },
  },
}

/**
 * Sanea HTML de contenido preservando el marcado del editor.
 * @param {string} html
 * @returns {string} HTML saneado ('' para entradas vacías/no-string)
 */
export function sanitizeContentHtml(html) {
  if (!html || typeof html !== 'string') return ''
  return sanitizeHtml(html, SANITIZE_OPTIONS)
}
