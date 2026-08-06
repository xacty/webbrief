// Helpers de drag & drop nativo (HTML5, sin librerías) compartidos entre
// AssetGrid (biblioteca de imágenes) y ProjectGrid (organización de
// proyectos). Ver DESIGN-SYSTEM.md §"Biblioteca de imágenes" / §"Organización
// compartida" para el resto del contrato de DnD (folder chips/filas como
// drop targets, mutación real vive en el caller).
import styles from './dnd.module.css'

// Mime types namespaced bajo `application/x-webrief-*` — permiten que un
// mismo drop target distinga arrastres internos (cards/filas de la propia
// app) de arrastres de archivos del sistema operativo (ver el filtro
// isInternalDrag en UploadDropzone.jsx), y que distintos dominios (assets,
// carpetas, y proyectos) no choquen entre sí en el mismo dataTransfer.
export const ASSET_DRAG_TYPE = 'application/x-webrief-assets'
// FOLDER_DRAG_TYPE es genérico a nivel de FORMA de dato (un solo id de
// carpeta), no de dominio — tanto asset_folders (biblioteca) como
// project_folders (Ola 2, ProjectsPage) lo reusan tal cual. Nunca hay
// ambigüedad en runtime: biblioteca y proyectos son páginas distintas, así
// que un drag nunca cruza de una a otra.
export const FOLDER_DRAG_TYPE = 'application/x-webrief-folder'
// PROJECT_DRAG_TYPE, en cambio, SÍ necesita ser su propio tipo namespaced
// (Ola 2, O2.c) — a diferencia de FOLDER_DRAG_TYPE, este lleva una LISTA de
// ids (JSON, mismo contrato que ASSET_DRAG_TYPE) y esos ids son de
// `projects`, un dominio distinto de `project_assets` — no deben
// confundirse aunque ambos sean "una lista de ids seleccionados".
export const PROJECT_DRAG_TYPE = 'application/x-webrief-projects'

// ── Ghost de arrastre estilo Google Drive (F1.2-B, punto 1a) ───────────────
// Reemplaza el pill de texto que antes SÓLO aparecía en selecciones
// múltiples (single-drag usaba el screenshot default del browser sobre el
// elemento arrastrado) — ahora TODO drag (single o multi; asset, carpeta o
// proyecto) usa esta mini-card custom. Construida con DOM plano (no React)
// porque dataTransfer.setDragImage necesita un elemento YA en el árbol al
// momento del dragstart, de forma sincrónica — mismo patrón que el pill
// anterior: se agrega off-screen (fixed, fuera del viewport), se captura el
// snapshot en el mismo tick, y se remueve en el tick siguiente
// (window.setTimeout(…, 0)) para darle tiempo al browser a rasterizarlo
// antes de desmontarlo.
//
// `thumbEl`: el <img> YA CARGADO de la card/fila origen (clonado vía
// cloneNode — nunca un <img src> nuevo, que puede no pintar a tiempo para
// el snapshot). `iconMarkup`: SVG de fallback (string, ver *_ICON_MARKUP
// abajo) cuando no hay thumb (carpeta o proyecto, que nunca tienen miniatura)
// — a diferencia del <img>, un SVG inline no depende de red, así que sí
// puede crearse fresco sin riesgo de timing.
// `count > 1` agrega el efecto apilado (2 capas detrás, offset diagonal) +
// badge circular primary con el contador — mismo criterio en las 3
// superficies (assets, carpetas nunca son multi, proyectos).
export function createItemDragGhost({ label = '', thumbEl = null, iconMarkup = null, count = 1 } = {}) {
  const wrap = document.createElement('div')
  wrap.className = styles.dragCardWrap

  if (count > 1) {
    const back = document.createElement('div')
    back.className = `${styles.dragCardLayer} ${styles.dragCardLayerBack}`
    wrap.appendChild(back)
    const mid = document.createElement('div')
    mid.className = `${styles.dragCardLayer} ${styles.dragCardLayerMid}`
    wrap.appendChild(mid)
  }

  const card = document.createElement('div')
  card.className = styles.dragCard

  const thumb = document.createElement('div')
  thumb.className = styles.dragCardThumb
  if (thumbEl) {
    const clone = thumbEl.cloneNode(true)
    clone.removeAttribute('loading')
    clone.className = styles.dragCardThumbImg
    thumb.appendChild(clone)
  } else if (iconMarkup) {
    thumb.innerHTML = iconMarkup
    if (thumb.firstElementChild) thumb.firstElementChild.setAttribute('class', styles.dragCardIcon)
  }
  card.appendChild(thumb)

  const name = document.createElement('span')
  name.className = styles.dragCardName
  name.textContent = label
  card.appendChild(name)

  wrap.appendChild(card)

  if (count > 1) {
    const badge = document.createElement('div')
    badge.className = styles.dragCardBadge
    badge.textContent = String(count)
    wrap.appendChild(badge)
  }

  document.body.appendChild(wrap)
  return wrap
}

// SVG inline — mismo glyph que los íconos lucide-react ya usados en el
// resto de la UI (Folder para carpetas, FolderOpen para proyectos, Images
// como fallback de asset sin miniatura) — reproducidos acá porque el ghost
// se construye con DOM plano, no JSX, así que no podemos renderizar el
// componente React directamente. Atributos idénticos al wrapper default de
// lucide-react (createLucideIcon/defaultAttributes) para calzar visualmente.
const ICON_SVG_ATTRS = 'xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"'

export const FOLDER_ICON_MARKUP =
  `<svg ${ICON_SVG_ATTRS}><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/></svg>`

export const PROJECT_ICON_MARKUP =
  `<svg ${ICON_SVG_ATTRS}><path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2"/></svg>`

export const IMAGE_ICON_MARKUP =
  `<svg ${ICON_SVG_ATTRS}><path d="m22 11-1.296-1.296a2.4 2.4 0 0 0-3.408 0L11 16"/><path d="M4 8a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2"/><circle cx="13" cy="7" r="1" fill="currentColor"/><rect x="8" y="2" width="14" height="14" rx="2"/></svg>`

// True si el dataTransfer de un dragover/dragenter trae alguno de los mime
// types indicados — guard compartido por los drop targets (folder chips/
// filas, crumb raíz) para ignorar arrastres que no les interesan.
export function dragHasAnyType(event, types) {
  const dtTypes = event.dataTransfer?.types || []
  return (types || []).some((type) => dtTypes.includes(type))
}

// True si un dragleave debe IGNORARSE porque el puntero sigue dentro del
// mismo elemento (p. ej. cruzando el límite de un ícono/texto hijo) — sin
// este guard, dragleave dispara en cada cruce de borde interno y hace
// parpadear el highlight de "drag over". Mismo criterio en cada drop target
// (folder chips/filas de AssetGrid, crumb raíz de LibraryPage).
export function isInternalDragLeave(event) {
  const related = event.relatedTarget
  return Boolean(related && event.currentTarget.contains(related))
}
