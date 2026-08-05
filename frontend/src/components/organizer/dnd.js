// Helpers de drag & drop nativo (HTML5, sin librerías) compartidos entre
// AssetGrid (biblioteca de imágenes) y, a futuro, ProjectsPage (Ola 2) —
// extraídos en O2.a desde `library/AssetGrid.jsx`. Ver DESIGN-SYSTEM.md
// §"Biblioteca de imágenes" para el resto del contrato de DnD (folder
// chips/filas como drop targets, mutación real vive en el caller).
import styles from './dnd.module.css'

// Mime types namespaced bajo `application/x-webrief-*` — permiten que un
// mismo drop target distinga arrastres internos (cards/filas de la propia
// app) de arrastres de archivos del sistema operativo (ver el filtro
// isInternalDrag en UploadDropzone.jsx), y que distintos dominios (assets,
// carpetas, y a futuro proyectos) no choquen entre sí en el mismo
// dataTransfer.
export const ASSET_DRAG_TYPE = 'application/x-webrief-assets'
export const FOLDER_DRAG_TYPE = 'application/x-webrief-folder'

// Pill flotante fuera de pantalla usada como imagen de arrastre custom
// cuando se arrastra una multi-selección junta (ver handleAssetDragStart
// en AssetGrid.jsx). `className` es opcional — por default usa el estilo
// co-locado en dnd.module.css; un caller con su propio look puede pasar su
// propia clase de CSS module (tokens, nunca estilos inline).
export function createDragGhost(text, className) {
  const el = document.createElement('div')
  el.className = className || styles.dragGhost
  el.textContent = text
  document.body.appendChild(el)
  return el
}

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
