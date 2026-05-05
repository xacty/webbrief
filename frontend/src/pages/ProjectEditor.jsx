import { useState, useRef, useEffect, useCallback, useMemo, lazy, Suspense } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

const BriefProjectEditor = lazy(() => import('./BriefProjectEditor'))
import { useEditor, EditorContent, NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react'
import { Extension, Node, mergeAttributes } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import Heading from '@tiptap/extension-heading'
import Image from '@tiptap/extension-image'
import Link from '@tiptap/extension-link'
import { Underline } from '@tiptap/extension-underline'
import { TextStyle, Color } from '@tiptap/extension-text-style'
import TextAlign from '@tiptap/extension-text-align'
import Highlight from '@tiptap/extension-highlight'
import { Table } from '@tiptap/extension-table'
import { TableRow } from '@tiptap/extension-table-row'
import { TableHeader } from '@tiptap/extension-table-header'
import { TableCell } from '@tiptap/extension-table-cell'
import { Fragment } from '@tiptap/pm/model'
import { Undo2, Redo2, Plus, Bell, User, MoreVertical, Tag, Info, GripVertical, X, Strikethrough, List, ListOrdered, Quote, TableIcon, Rows3, Columns3, Trash2, Copy, Link2, Code2, Palette, Eye, FileText, MousePointerClick, Search, Download, ArrowLeft, AlignLeft, AlignCenter, AlignRight, AlignJustify, IndentIncrease, IndentDecrease, ChevronDown, ListCollapse, Pencil } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { apiDownloadToFile, apiFetch, apiSubmitDownload } from '../lib/api'
import { getProjectEditorCapabilities } from '../lib/roleCapabilities'
import navStyles from './ProjectEditorNav.module.css'
import toolbarStyles from './ProjectEditorToolbar.module.css'
import seoRulesStyles from './ProjectEditorSeoRules.module.css'
import panelStyles from './ProjectEditorPanels.module.css'
import styles from './ProjectEditor.module.css'

// ---------------------------------------------------------------------------
// Mock data — E-commerce con contenido rico por sección
// ---------------------------------------------------------------------------
const MOCK_PAGES = [
  {
    id: 'home',
    name: 'Home',
    sections: [
      {
        id: 's1',
        name: 'Hero / Banner principal',
        content: '<h1>Bienvenidos a nuestra tienda</h1><p>Encontrá los mejores productos al mejor precio. Envíos a todo el país en 24 horas.</p><ul><li>Más de 10.000 productos</li><li>Devolución gratis en 30 días</li><li>Pago en cuotas sin interés</li></ul>',
      },
      {
        id: 's2',
        name: 'Categorías destacadas',
        content: '<h2>Explorá nuestras categorías</h2><p>Tenemos todo lo que necesitás, organizado para que lo encuentres rápido.</p>',
      },
      {
        id: 's3',
        name: 'Productos más vendidos',
        content: '<h2>Los más vendidos esta temporada</h2><p>Descubrí los productos que más eligen nuestros clientes.</p><ol><li>Auriculares inalámbricos</li><li>Zapatillas deportivas</li><li>Mochila urbana</li></ol>',
      },
      {
        id: 's4',
        name: 'Newsletter',
        content: '<h2>Suscribite y recibí ofertas exclusivas</h2><p>Dejanos tu email y te avisamos de las mejores promos antes que nadie. Sin spam.</p>',
      },
    ],
  },
  {
    id: 'catalogo',
    name: 'Catálogo',
    sections: [
      {
        id: 's5',
        name: 'Filtros y búsqueda',
        content: '<h2>Encontrá lo que buscás</h2><p>Usá los filtros de categoría, precio y disponibilidad para afinar tu búsqueda.</p>',
      },
      {
        id: 's6',
        name: 'Grilla de productos',
        content: '<h2>Todos los productos</h2><p>Más de 500 productos disponibles para entrega inmediata.</p>',
      },
      {
        id: 's7',
        name: 'Paginación',
        content: '<p>Navegá entre páginas para ver más resultados.</p>',
      },
    ],
  },
  {
    id: 'contacto',
    name: 'Contacto',
    sections: [
      {
        id: 's8',
        name: 'Formulario de consulta',
        content: '<h2>¿Tenés alguna consulta?</h2><p>Completá el formulario y te respondemos en menos de 24 horas hábiles.</p>',
      },
      {
        id: 's9',
        name: 'Datos de contacto',
        content: '<h3>También podés escribirnos directamente</h3><ul><li>Email: hola@tienda.com</li><li>WhatsApp: +54 11 1234-5678</li><li>Horario: Lunes a viernes, 9 a 18 hs</li></ul>',
      },
    ],
  },
]

// ---------------------------------------------------------------------------
// SectionDivider — TipTap Node Extension
//
// Nodo block/atom que delimita secciones dentro del documento.
// Selectable (se puede borrar con una selección), no editable internamente.
// ---------------------------------------------------------------------------
function SectionDividerView({ node }) {
  return (
    <NodeViewWrapper
      contentEditable={false}
      data-section-divider=""
      data-section-id={node.attrs.sectionId}
      data-section-name={node.attrs.sectionName}
    >
      <div className={styles.sectionDivider}>
        <span className={styles.sectionDividerLabel}>{node.attrs.sectionName}</span>
        <hr className={styles.sectionDividerHr} />
      </div>
    </NodeViewWrapper>
  )
}

const SectionDividerNode = Node.create({
  name: 'sectionDivider',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      sectionId: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-section-id') || '',
        renderHTML: (attributes) => ({ 'data-section-id': attributes.sectionId }),
      },
      sectionName: {
        default: 'Section',
        parseHTML: (element) => element.getAttribute('data-section-name') || 'Section',
        renderHTML: (attributes) => ({ 'data-section-name': attributes.sectionName }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-section-divider]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes({ 'data-section-divider': '' }, HTMLAttributes)]
  },

  addNodeView() {
    return ReactNodeViewRenderer(SectionDividerView)
  },
})

function CtaButtonView({ node, updateAttributes }) {
  const text = node.attrs.ctaText || 'Ver más'
  const url = node.attrs.ctaUrl || ''

  function editCta() {
    const nextText = window.prompt('Texto del CTA:', text)
    if (nextText === null) return
    const nextUrl = window.prompt('URL del CTA:', url)
    if (nextUrl === null) return
    updateAttributes({
      ctaText: nextText.trim() || text,
      ctaUrl: nextUrl.trim(),
    })
  }

  return (
    <NodeViewWrapper
      contentEditable={false}
      data-cta-button=""
      data-cta-text={text}
      data-cta-url={url}
    >
      <div className={styles.ctaNode}>
        <a
          className={styles.ctaNodeButton}
          href={url || '#'}
          onClick={(event) => event.preventDefault()}
        >
          {text}
        </a>
        <button type="button" className={styles.ctaNodeEdit} onClick={editCta}>
          Editar CTA
        </button>
      </div>
    </NodeViewWrapper>
  )
}

const CtaButtonNode = Node.create({
  name: 'ctaButton',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      ctaText: {
        default: 'Ver más',
        parseHTML: (element) => element.getAttribute('data-cta-text') || element.textContent?.trim() || 'Ver más',
        renderHTML: (attributes) => ({ 'data-cta-text': attributes.ctaText }),
      },
      ctaUrl: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-cta-url') || element.querySelector('a')?.getAttribute('href') || '',
        renderHTML: (attributes) => ({ 'data-cta-url': attributes.ctaUrl }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-cta-button]' }]
  },

  renderHTML({ HTMLAttributes }) {
    const text = HTMLAttributes['data-cta-text'] || 'Ver más'
    const url = HTMLAttributes['data-cta-url'] || '#'
    return [
      'div',
      mergeAttributes({ 'data-cta-button': '' }, HTMLAttributes),
      ['a', { href: url }, text],
    ]
  },

  addNodeView() {
    return ReactNodeViewRenderer(CtaButtonView)
  },
})

function EditableImageView({ node, editor, extension, getPos, updateAttributes, deleteNode, selected }) {
  const wrapperRef = useRef(null)
  const imageRef = useRef(null)
  const menuRef = useRef(null)
  const noticeTimeoutRef = useRef(null)
  const [menu, setMenu] = useState(null)
  const [sizeNotice, setSizeNotice] = useState('')
  const [measuredWidth, setMeasuredWidth] = useState(0)

  const currentWidth = Number(node.attrs.width) || null

  function showSizeNotice(message) {
    setSizeNotice(message)
    window.clearTimeout(noticeTimeoutRef.current)
    noticeTimeoutRef.current = window.setTimeout(() => {
      setSizeNotice('')
      noticeTimeoutRef.current = null
    }, 1800)
  }

  function getNodePos() {
    return typeof getPos === 'function' ? getPos() : getPos
  }

  function selectImage() {
    const pos = getNodePos()
    if (typeof pos !== 'number') return
    editor.chain().focus().setNodeSelection(pos).run()
  }

  function isControlTarget(target) {
    if (!(target instanceof Element)) return false
    return Boolean(target.closest('button, [role="menu"], [data-image-control]'))
  }

  useEffect(() => {
    if (!menu) return undefined

    function closeMenu(event) {
      if (menuRef.current?.contains(event.target)) return
      setMenu(null)
    }

    document.addEventListener('pointerdown', closeMenu)
    return () => document.removeEventListener('pointerdown', closeMenu)
  }, [menu])

  useEffect(() => () => {
    if (noticeTimeoutRef.current) window.clearTimeout(noticeTimeoutRef.current)
  }, [])

  useEffect(() => {
    const wrapper = wrapperRef.current
    if (!wrapper) return undefined

    function updateMeasuredWidth() {
      setMeasuredWidth(wrapper.getBoundingClientRect().width || 0)
    }

    updateMeasuredWidth()
    const resizeObserver = new ResizeObserver(updateMeasuredWidth)
    resizeObserver.observe(wrapper)
    return () => resizeObserver.disconnect()
  }, [])

  function getWidthBounds() {
    if (!wrapperRef.current) return { minWidth: 160, maxWidth: 1600 }
    const parentWidth = wrapperRef.current.parentElement?.getBoundingClientRect().width || 0
    const insideTableCell = Boolean(wrapperRef.current.closest('td, th'))
    const parentMaxWidth = insideTableCell
      ? (parentWidth > 0 ? parentWidth : 1600)
      : (parentWidth > 0 ? Math.max(160, parentWidth) : 1600)
    const maxWidth = parentMaxWidth
    const minWidth = insideTableCell ? 0 : Math.min(160, maxWidth)
    return { minWidth, maxWidth }
  }

  function applyWidth(nextWidth) {
    if (!wrapperRef.current) return
    const { minWidth, maxWidth } = getWidthBounds()
    const clampedWidth = Math.max(Math.round(minWidth), Math.min(Math.round(nextWidth), Math.round(maxWidth)))
    if (Math.round(nextWidth) > Math.round(maxWidth)) {
      showSizeNotice('La imagen llegó al ancho máximo disponible.')
    } else if (Math.round(nextWidth) < Math.round(minWidth)) {
      showSizeNotice('La imagen llegó al tamaño mínimo.')
    }
    updateAttributes({ width: clampedWidth })
  }

  function handleResizeStart(event) {
    event.preventDefault()
    event.stopPropagation()
    selectImage()

    const startX = event.clientX
    const startWidth = wrapperRef.current?.getBoundingClientRect().width || currentWidth || 320

    function handlePointerMove(moveEvent) {
      applyWidth(startWidth + (moveEvent.clientX - startX))
    }

    function handlePointerUp() {
      document.removeEventListener('pointermove', handlePointerMove)
      document.removeEventListener('pointerup', handlePointerUp)
    }

    document.addEventListener('pointermove', handlePointerMove)
    document.addEventListener('pointerup', handlePointerUp)
  }

  function adjustWidth(delta) {
    const measuredWidth = wrapperRef.current?.getBoundingClientRect().width || currentWidth || 320
    applyWidth(measuredWidth + delta)
    setMenu(null)
  }

  function resetWidth() {
    updateAttributes({ width: null })
    setMenu(null)
  }

  function removeImage() {
    deleteNode()
    setMenu(null)
  }

  async function handleExport(preset) {
    const projectId = extension?.options?.projectId
    if (!projectId) return

    try {
      await apiDownloadToFile(buildProjectImageExportPath({
        projectId,
        assetId: node.attrs.assetId || '',
        src: node.attrs.src || '',
        preset,
      }), {
        suggestedFileName: node.attrs.fileName || 'image',
      })
    } catch (error) {
      window.alert(error.message || 'No se pudo exportar la imagen')
    } finally {
      setMenu(null)
    }
  }

  const { minWidth, maxWidth } = getWidthBounds()
  const resolvedWidth = currentWidth || measuredWidth || maxWidth
  const atMinWidth = resolvedWidth <= minWidth + 1
  const atMaxWidth = resolvedWidth >= maxWidth - 1
  const insideTableCell = Boolean(wrapperRef.current?.closest('td, th'))
  const frameWidth = insideTableCell
    ? (currentWidth ? Math.min(currentWidth, maxWidth) : maxWidth)
    : currentWidth

  return (
    <NodeViewWrapper
      className={cx(styles.imageNode, selected && styles.imageNodeSelected)}
      contentEditable={false}
      data-editor-overlay=""
      draggable
      onPointerDown={(event) => {
        if (isControlTarget(event.target)) return
        selectImage()
      }}
      onClick={(event) => {
        event.stopPropagation()
        if (isControlTarget(event.target)) return
        selectImage()
      }}
      onContextMenu={(event) => {
        event.preventDefault()
        event.stopPropagation()
        selectImage()
        setMenu({ x: event.clientX, y: event.clientY })
      }}
    >
      <div
        ref={wrapperRef}
        data-drag-handle=""
        className={cx(styles.imageNodeFrame, insideTableCell && styles.imageNodeFrameInTable)}
        style={typeof frameWidth === 'number' ? { width: `${frameWidth}px` } : undefined}
      >
        <img
          ref={imageRef}
          className={styles.imageNodeImage}
          src={node.attrs.src}
          alt={node.attrs.alt || ''}
          draggable={false}
        />
        {sizeNotice && <div className={styles.imageSizeNotice}>{sizeNotice}</div>}
        {selected && (
          <>
            <button
              type="button"
              data-image-control=""
              className={cx(styles.imageResizeHandle, styles.imageResizeHandleLeft)}
              onPointerDown={handleResizeStart}
              aria-label="Redimensionar imagen"
            />
            <button
              type="button"
              data-image-control=""
              className={cx(styles.imageResizeHandle, styles.imageResizeHandleRight)}
              onPointerDown={handleResizeStart}
              aria-label="Redimensionar imagen"
            />
          </>
        )}
      </div>

      {menu && (
        <div
          ref={menuRef}
          role="menu"
          className={styles.imageContextMenu}
          style={{ left: `${menu.x}px`, top: `${menu.y}px` }}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        >
          <button type="button" data-image-control="" className={styles.imageContextMenuItem} onClick={() => adjustWidth(-80)} disabled={atMinWidth}>
            Hacer más pequeña
          </button>
          <button type="button" data-image-control="" className={styles.imageContextMenuItem} onClick={() => adjustWidth(80)} disabled={atMaxWidth}>
            Hacer más grande
          </button>
          <button type="button" data-image-control="" className={styles.imageContextMenuItem} onClick={resetWidth}>
            Restablecer tamaño
          </button>
          <div className={styles.imageContextMenuDivider} />
          <button type="button" data-image-control="" className={styles.imageContextMenuItem} onClick={() => handleExport('original')}>
            Descargar original
          </button>
          <button type="button" data-image-control="" className={styles.imageContextMenuItem} onClick={() => handleExport('web')}>
            Exportar WebP web
          </button>
          <button type="button" data-image-control="" className={styles.imageContextMenuItem} onClick={() => handleExport('jpg')}>
            Exportar JPG
          </button>
          <button type="button" data-image-control="" className={styles.imageContextMenuItem} onClick={() => handleExport('png')}>
            Exportar PNG
          </button>
          <div className={styles.imageContextMenuDivider} />
          <button type="button" data-image-control="" className={cx(styles.imageContextMenuItem, styles.imageContextMenuItemDanger)} onClick={removeImage}>
            Eliminar imagen
          </button>
        </div>
      )}
    </NodeViewWrapper>
  )
}

const EditableImageNode = Image.extend({
  draggable: true,

  addOptions() {
    return {
      ...this.parent?.(),
      projectId: null,
    }
  },

  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        parseHTML: (element) => {
          const dataWidth = element.getAttribute('data-width')
          if (dataWidth) return Number(dataWidth) || null
          const inlineWidth = element.style?.width?.replace('px', '') || ''
          return Number(inlineWidth) || null
        },
        renderHTML: (attributes) => {
          if (!attributes.width) return {}
          return {
            'data-width': attributes.width,
            style: `width:${attributes.width}px;max-width:100%;height:auto;display:block;`,
          }
        },
      },
      originalWidth: {
        default: null,
        parseHTML: (element) => Number(element.getAttribute('data-original-width')) || null,
        renderHTML: (attributes) => (attributes.originalWidth ? { 'data-original-width': attributes.originalWidth } : {}),
      },
      originalHeight: {
        default: null,
        parseHTML: (element) => Number(element.getAttribute('data-original-height')) || null,
        renderHTML: (attributes) => (attributes.originalHeight ? { 'data-original-height': attributes.originalHeight } : {}),
      },
      assetId: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-asset-id') || null,
        renderHTML: (attributes) => (attributes.assetId ? { 'data-asset-id': attributes.assetId } : {}),
      },
      fileName: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-file-name') || null,
        renderHTML: (attributes) => (attributes.fileName ? { 'data-file-name': attributes.fileName } : {}),
      },
      storagePath: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-storage-path') || null,
        renderHTML: (attributes) => (attributes.storagePath ? { 'data-storage-path': attributes.storagePath } : {}),
      },
    }
  },

  addNodeView() {
    return ReactNodeViewRenderer(EditableImageView)
  },
})

const GoogleDocsHeadingShortcuts = Extension.create({
  name: 'googleDocsHeadingShortcuts',

  addKeyboardShortcuts() {
    const shortcuts = {
      'Mod-Alt-0': () => this.editor.chain().focus().setParagraph().run(),
    }

    for (let level = 1; level <= 6; level += 1) {
      shortcuts[`Mod-Alt-${level}`] = () => this.editor.chain().focus().setHeading({ level }).run()
    }

    return shortcuts
  },
})

// Desactiva Mod-Shift-r (hard refresh) y Mod-Shift-j (DevTools) que el browser
// intercepta a nivel de chrome — preventDefault() no los puede bloquear.
// priority < 100 (TextAlign default) para que este binding sobrescriba al de TextAlign.
// Retorna true para marcar el evento como manejado y evitar que TipTap alinee el texto.
// Nota: no puede prevenir el hard-refresh/DevTools del navegador (son atajos del chrome
// del browser que operan sobre el DOM event), pero sí evita la acción de alineación.
const DisableConflictingAlignShortcuts = Extension.create({
  name: 'disableConflictingAlignShortcuts',
  priority: 50,
  addKeyboardShortcuts() {
    return {
      'Mod-Shift-r': () => true,
      'Mod-Shift-j': () => true,
    }
  },
})

const BLOCK_SPACING_PRESETS = {
  single: { label: 'Simple', lineHeight: '1.2', marginBottom: '0.45em' },
  normal: { label: 'Normal', lineHeight: '1.65', marginBottom: '0.9em' },
  relaxed: { label: '1.5', lineHeight: '1.85', marginBottom: '1.15em' },
  double: { label: 'Doble', lineHeight: '2', marginBottom: '1.35em' },
}

const TEXT_BLOCK_LAYOUT_TYPES = ['paragraph', 'heading', 'listItem']

function cx(...classes) {
  return classes.filter(Boolean).join(' ')
}

function insertTemporaryImage(editor, src, alt = '', position = null, attrs = {}) {
  if (!editor || !src) return false
  const chain = editor.chain().focus()
  if (typeof position === 'number') chain.setTextSelection(position)
  return chain.setImage({ src, alt, ...attrs }).run()
}

async function replaceImageSrc(editor, previousSrc, nextSrc, nextAttrs = {}) {
  if (!editor || !previousSrc || !nextSrc) return false

  await new Promise((resolve) => {
    const image = new window.Image()
    image.onload = () => resolve()
    image.onerror = () => resolve()
    image.src = nextSrc
  })

  const tr = editor.state.tr
  let replaced = false

  editor.state.doc.descendants((node, pos) => {
    if (replaced) return false
    if (node.type.name !== 'image' || node.attrs.src !== previousSrc) return undefined
    const mergedAttrs = { ...node.attrs, ...nextAttrs, src: nextSrc }
    if (mergedAttrs.originalWidth && mergedAttrs.width) {
      mergedAttrs.width = Math.min(Number(mergedAttrs.width) || 0, Number(mergedAttrs.originalWidth) || 0) || null
    }
    tr.setNodeMarkup(pos, undefined, mergedAttrs)
    replaced = true
    return false
  })

  if (!replaced) return false
  editor.view.dispatch(tr)
  return true
}

function buildProjectImageExportPath({ projectId, assetId = '', src = '', preset = 'original' }) {
  const params = new URLSearchParams()
  if (assetId) params.set('assetId', assetId)
  else if (src) params.set('src', src)
  params.set('preset', preset)
  return `/api/projects/${projectId}/assets/export?${params.toString()}`
}

function buildAdvancedProjectImageExportPath({
  projectId,
  assetId = '',
  src = '',
  width = null,
  height = null,
  format = '',
  quality = null,
  fit = '',
  fileName = '',
}) {
  const params = new URLSearchParams()
  if (assetId) params.set('assetId', assetId)
  else if (src) params.set('src', src)
  if (width) params.set('width', String(width))
  if (height) params.set('height', String(height))
  if (format) params.set('format', format)
  if (quality !== null && quality !== undefined) params.set('quality', String(quality))
  if (fit) params.set('fit', fit)
  if (fileName) params.set('fileName', fileName)
  return `/api/projects/${projectId}/assets/export?${params.toString()}`
}

function slugifyExportFileName(value = 'image') {
  return String(value || 'image')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'image'
}

function parseImageBlockMetadata(element) {
  const image = element?.tagName?.toLowerCase() === 'img' ? element : element?.querySelector?.('img')
  if (!image) return null

  const src = image.getAttribute('src') || ''
  const originalWidth = Number(image.getAttribute('data-original-width')) || Number(image.getAttribute('width')) || null
  const originalHeight = Number(image.getAttribute('data-original-height')) || Number(image.getAttribute('height')) || null
  const fileName = image.getAttribute('data-file-name') || ''
  const assetId = image.getAttribute('data-asset-id') || ''
  const storagePath = image.getAttribute('data-storage-path') || ''
  const rawFormat = (fileName.split('.').pop() || storagePath.split('.').pop() || 'jpg')
  const format = rawFormat.replace(/[^a-z0-9]/gi, '').toLowerCase()

  return {
    src,
    assetId,
    storagePath,
    fileName,
    baseName: slugifyExportFileName(fileName || 'image'),
    format: format || 'jpg',
    originalWidth,
    originalHeight,
  }
}

function removeImageBySrc(editor, src) {
  if (!editor || !src) return false

  let targetPos = null
  let targetSize = null

  editor.state.doc.descendants((node, pos) => {
    if (targetPos !== null) return false
    if (node.type.name !== 'image' || node.attrs.src !== src) return undefined
    targetPos = pos
    targetSize = node.nodeSize
    return false
  })

  if (targetPos === null || targetSize === null) return false

  editor.view.dispatch(editor.state.tr.delete(targetPos, targetPos + targetSize))
  return true
}

function setCssVars(node, vars) {
  if (!node) return
  Object.entries(vars).forEach(([name, value]) => {
    if (value === null || value === undefined || value === '') {
      node.style.removeProperty(name)
      return
    }
    node.style.setProperty(name, typeof value === 'number' ? `${value}px` : String(value))
  })
}

function normalizeTextBlockLayout(layout) {
  const next = {
    blockSpacing: layout?.blockSpacing || null,
    indentLevel: Math.max(0, Math.min(8, Number(layout?.indentLevel) || 0)),
  }

  return next.blockSpacing || next.indentLevel > 0 ? next : null
}

const TextBlockLayoutExtension = Extension.create({
  name: 'textBlockLayout',

  addGlobalAttributes() {
    return [
      {
        types: TEXT_BLOCK_LAYOUT_TYPES,
        attributes: {
          textBlockLayout: {
            default: null,
            parseHTML: (element) => normalizeTextBlockLayout({
              blockSpacing: element.getAttribute('data-block-spacing') || null,
              indentLevel: element.getAttribute('data-indent-level') || 0,
            }),
            renderHTML: (attributes) => {
              const layout = normalizeTextBlockLayout(attributes.textBlockLayout)
              if (!layout) return {}

              const declarations = []
              if (layout.blockSpacing) {
                const preset = BLOCK_SPACING_PRESETS[layout.blockSpacing]
                if (preset) {
                  declarations.push(`line-height: ${preset.lineHeight}`)
                  declarations.push(`margin-bottom: ${preset.marginBottom}`)
                }
              }

              if (layout.indentLevel > 0) {
                declarations.push(`margin-left: ${layout.indentLevel * 1.5}em`)
              }

              return {
                ...(layout.blockSpacing ? { 'data-block-spacing': layout.blockSpacing } : {}),
                ...(layout.indentLevel > 0 ? { 'data-indent-level': String(layout.indentLevel) } : {}),
                ...(declarations.length > 0 ? { style: `${declarations.join('; ')};` } : {}),
              }
            },
          },
        },
      },
    ]
  },
})

// ---------------------------------------------------------------------------
// Flash overlay: crea un div animado sobre el área de una sección
// ---------------------------------------------------------------------------
function createFlashOverlay(scrollEl, top, height) {
  if (!scrollEl || height <= 0) return
  const overlay = document.createElement('div')
  Object.assign(overlay.style, {
    position: 'absolute',
    top: `${top}px`,
    left: '6px',
    right: '6px',
    height: `${Math.max(height, 60)}px`,
    borderRadius: '10px',
    pointerEvents: 'none',
    zIndex: '6',
    animation: 'sectionFlash 1200ms ease-out forwards',
  })
  const prev = getComputedStyle(scrollEl).position
  if (prev === 'static') scrollEl.style.position = 'relative'
  scrollEl.appendChild(overlay)
  overlay.addEventListener('animationend', () => {
    overlay.remove()
    if (prev === 'static') scrollEl.style.position = ''
  }, { once: true })
}

function flashSectionInScrollEl(scrollEl, anchorEl, nextAnchorEl) {
  if (!scrollEl || !anchorEl) return
  const scrollRect = scrollEl.getBoundingClientRect()
  const top = anchorEl.getBoundingClientRect().top - scrollRect.top + scrollEl.scrollTop
  const bottom = nextAnchorEl
    ? nextAnchorEl.getBoundingClientRect().top - scrollRect.top + scrollEl.scrollTop
    : top + Math.max(anchorEl.getBoundingClientRect().height, 200)
  createFlashOverlay(scrollEl, top, bottom - top)
}

// ---------------------------------------------------------------------------
// Helper: buildDocumentHTML — convierte sections[] en HTML para el editor
// ---------------------------------------------------------------------------
function buildDocumentHTML(sections) {
  if (!sections || sections.length === 0) return '<p></p>'
  return sections.map((section) => {
    const divider = `<div data-section-divider data-section-id="${section.id}" data-section-name="${section.name}"></div>`
    return divider + (section.content || '<p></p>')
  }).join('')
}

function parseSectionsFromHtml(html) {
  if (!html || typeof DOMParser === 'undefined') return []

  const parser = new DOMParser()
  const doc = parser.parseFromString(`<div id="root">${html}</div>`, 'text/html')
  const root = doc.getElementById('root')
  if (!root) return []

  const sections = []
  let currentSection = null

  Array.from(root.childNodes).forEach((node) => {
    const isDivider = node.nodeType === 1
      && node.matches?.('div[data-section-divider]')

    if (isDivider) {
      if (currentSection) {
        const container = doc.createElement('div')
        currentSection.nodes.forEach((child) => container.appendChild(child))
        sections.push({
          id: currentSection.id,
          name: currentSection.name,
          content: container.innerHTML || '<p></p>',
        })
      }

      currentSection = {
        id: node.getAttribute('data-section-id') || `s_${Date.now()}`,
        name: node.getAttribute('data-section-name') || 'Sección',
        nodes: [],
      }
      return
    }

    if (currentSection) {
      currentSection.nodes.push(node.cloneNode(true))
    }
  })

  if (currentSection) {
    const container = doc.createElement('div')
    currentSection.nodes.forEach((child) => container.appendChild(child))
    sections.push({
      id: currentSection.id,
      name: currentSection.name,
      content: container.innerHTML || '<p></p>',
    })
  }

  return sections
}

function stripSectionDividersFromHtml(html) {
  if (!html || typeof DOMParser === 'undefined') return html || '<p></p>'
  const parser = new DOMParser()
  const doc = parser.parseFromString(`<div id="root">${html}</div>`, 'text/html')
  const root = doc.getElementById('root')
  if (!root) return html || '<p></p>'
  root.querySelectorAll('div[data-section-divider]').forEach((node) => node.remove())
  return root.innerHTML || '<p></p>'
}

// Convierte HTML de FAQ antiguo (H2/H3 lineales sin sectionDividers) al nuevo
// formato con sectionDividers. Si el HTML ya tiene sectionDividers, no hace nada.
function migrateFaqHtmlToSections(html) {
  if (!html || typeof DOMParser === 'undefined') return html || '<p></p>'
  if (html.includes('data-section-divider')) return html // ya migrado

  const parser = new DOMParser()
  const doc = parser.parseFromString(`<div id="root">${html}</div>`, 'text/html')
  const root = doc.getElementById('root')
  if (!root) return html

  let sectionCount = 0
  const parts = []

  Array.from(root.childNodes).forEach((node) => {
    if (node.nodeType === 1) {
      const tag = node.tagName.toLowerCase()
      if (tag === 'h2' || tag === 'h3') {
        sectionCount += 1
        const sid = `s_${Date.now()}_${sectionCount}`
        parts.push(`<div data-section-divider data-section-id="${sid}" data-section-name="Pregunta Frecuente ${sectionCount}"></div>`)
      }
    }
    if (node.outerHTML) parts.push(node.outerHTML)
    else if (node.nodeType === 3 && node.textContent?.trim()) parts.push(node.textContent)
  })

  return sectionCount > 0 ? parts.join('') : html
}

function createLocalId(prefix = 's') {
  return `${prefix}_${crypto.randomUUID?.() || Date.now()}`
}

function getProjectEditorViewStorageKey(projectId) {
  return `webrief:project-editor-view:${projectId || 'unknown'}`
}

function readPersistedProjectEditorView(projectId) {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.sessionStorage.getItem(getProjectEditorViewStorageKey(projectId))
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    return {
      editorMode: typeof parsed.editorMode === 'string' ? parsed.editorMode : null,
      handoffAudience: typeof parsed.handoffAudience === 'string' ? parsed.handoffAudience : null,
    }
  } catch {
    return null
  }
}

function serializeNodes(nodes, doc) {
  const container = doc.createElement('div')
  nodes.forEach((node) => container.appendChild(node.cloneNode(true)))
  return container.innerHTML || '<p></p>'
}

function escapeEditorHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function htmlToPlainLines(html) {
  if (!html || typeof DOMParser === 'undefined') return []
  const doc = new DOMParser().parseFromString(`<div id="root">${html}</div>`, 'text/html')
  const root = doc.getElementById('root')
  if (!root) return []

  const blocks = Array.from(root.querySelectorAll('h1, h2, h3, h4, h5, h6, p, li, div'))
    .filter((node) => !node.matches?.('div[data-section-divider]'))
    .map((node) => node.textContent?.replace(/\s+/g, ' ').trim() || '')
    .filter(Boolean)

  return blocks.length > 0 ? blocks : (root.textContent || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
}

function parseSeoLine(line) {
  const normalized = line.trim()
  if (!normalized) return null

  const titleMatch = normalized.match(/^title\s*tag\s*:\s*(.+)$/i)
  if (titleMatch) return { field: 'titleTag', value: titleMatch[1].trim() }

  const metaMatch = normalized.match(/^meta\s*(description|descripci[oó]n|descripcion|descirption)?\s*:\s*(.+)$/i)
  if (metaMatch) return { field: 'metaDescription', value: metaMatch[2].trim() }

  const compactMetaMatch = normalized.match(/^metadesc(?:ription|ripci[oó]n|ripcion|irption)\s*:\s*(.+)$/i)
  if (compactMetaMatch) return { field: 'metaDescription', value: compactMetaMatch[1].trim() }

  const urlMatch = normalized.match(/^url\s*:\s*(.+)$/i)
  if (urlMatch) return { field: 'urlSlug', value: urlMatch[1].trim() }

  return null
}

function parsePastedSeo(lines) {
  const seo = {}
  const contentLines = []

  lines.forEach((line) => {
    const parsedSeo = parseSeoLine(line)
    if (parsedSeo) {
      seo[parsedSeo.field] = parsedSeo.value
      return
    }

    contentLines.push(line)
  })

  return { seo, contentLines }
}

function htmlBlockFromPlainLine(line) {
  const trimmed = line.trim()
  if (!trimmed) return ''

  const h1 = trimmed.match(/^h1\s*:\s*(.+)$/i)
  if (h1) return `<h1>${escapeEditorHtml(h1[1].trim())}</h1>`

  const h2 = trimmed.match(/^h2\s*:\s*(.+)$/i)
  if (h2) return `<h2>${escapeEditorHtml(h2[1].trim())}</h2>`

  const h3 = trimmed.match(/^h3\s*:\s*(.+)$/i)
  if (h3) return `<h3>${escapeEditorHtml(h3[1].trim())}</h3>`

  const cta = trimmed.match(/^cta\/bot[oó]n\s*:\s*(.+)$/i)
  if (cta) {
    return `<div data-cta-button data-cta-text="${escapeEditorHtml(cta[1].trim())}" data-cta-url=""></div>`
  }

  return `<p>${escapeEditorHtml(trimmed)}</p>`
}

function buildSectionedHtmlFromPlainLines(lines) {
  const { contentLines } = parsePastedSeo(lines)
  const sections = []
  let current = null

  contentLines.forEach((line) => {
    const trimmed = line.trim()
    if (!trimmed) return

    const headingMatch = trimmed.match(/^(h1|h2)\s*:\s*(.+)$/i)
    if (headingMatch) {
      if (current) sections.push(current)
      current = {
        headingLevel: headingMatch[1].toLowerCase(),
        title: headingMatch[2].trim(),
        lines: [trimmed],
      }
      return
    }

    if (!current) return
    current.lines.push(trimmed)
  })

  if (current) sections.push(current)
  if (sections.length === 0) return null

  return sections.map((section, index) => {
    const sectionName = index === 0 ? 'Hero - ATF' : `Sección ${index + 1}`
    const sectionId = createLocalId('s')
    const content = section.lines.map(htmlBlockFromPlainLine).join('')
    return `<div data-section-divider data-section-id="${sectionId}" data-section-name="${escapeEditorHtml(sectionName)}"></div>${content || '<p></p>'}`
  }).join('')
}

function buildFaqHtmlFromPlainLines(lines) {
  const { contentLines } = parsePastedSeo(lines)
  const blocks = []

  contentLines.forEach((line) => {
    const trimmed = line.trim()
    if (!trimmed) return

    const h1 = trimmed.match(/^h1\s*:\s*(.+)$/i)
    if (h1) {
      blocks.push(`<h1>${escapeEditorHtml(h1[1].trim())}</h1>`)
      return
    }

    const h2 = trimmed.match(/^h2\s*:\s*(.+)$/i)
    if (h2) {
      blocks.push(`<h2>${escapeEditorHtml(h2[1].trim())}</h2>`)
      return
    }

    blocks.push(htmlBlockFromPlainLine(trimmed))
  })

  return blocks.some((block) => block.startsWith('<h2>')) ? blocks.join('') : null
}

function buildDocumentHtmlFromPlainLines(lines) {
  const { seo, contentLines } = parsePastedSeo(lines)
  let changed = Object.keys(seo).length > 0
  const blocks = []

  contentLines.forEach((line) => {
    const trimmed = line.trim()
    if (!trimmed) return

    if (/^(h1|h2|h3)\s*:/i.test(trimmed) || /^cta\/bot[oó]n\s*:/i.test(trimmed)) {
      changed = true
    }
    blocks.push(htmlBlockFromPlainLine(trimmed))
  })

  return changed ? blocks.join('') || '<p></p>' : null
}

function parsePastePayload({ html = '', text = '' }) {
  const lines = (text || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  const fallbackLines = lines.length > 0 ? lines : htmlToPlainLines(html)
  return parsePastedSeo(fallbackLines)
}

function getBlockPrefixInfo(node) {
  const text = node.textContent?.replace(/\s+/g, ' ').trim() || ''
  if (!text) return null

  const seo = parseSeoLine(text)
  if (seo) return { type: 'seo', field: seo.field, text: seo.value }

  const heading = text.match(/^(h1|h2|h3)\s*:\s*(.+)$/i)
  if (heading) return { type: heading[1].toLowerCase(), text: heading[2].trim() }

  const cta = text.match(/^cta\/bot[oó]n\s*:\s*(.+)$/i)
  if (cta) return { type: 'cta', text: cta[1].trim() }

  return null
}

function isBlankPasteElement(node) {
  if (!node || node.nodeType !== 1) return false
  if (node.matches?.('br, hr')) return true
  if (node.querySelector?.('img, table, [data-cta-button]')) return false
  return (node.textContent || '').replace(/\u00a0/g, ' ').trim().length === 0
}

function cleanDocumentPasteHtml(html) {
  if (!html || typeof DOMParser === 'undefined') return html || ''
  const doc = new DOMParser().parseFromString(`<div id="root">${html}</div>`, 'text/html')
  const root = doc.getElementById('root')
  if (!root) return html || ''

  Array.from(root.querySelectorAll('p, div, li, h1, h2, h3, h4, h5, h6')).forEach((node) => {
    const text = node.textContent?.replace(/\s+/g, ' ').trim() || ''
    if (parseSeoLine(text) || isBlankPasteElement(node)) {
      node.remove()
    }
  })

  root.querySelectorAll('br, hr').forEach((node) => node.remove())
  return root.innerHTML || '<p></p>'
}

function normalizeRichInlineMarks(root) {
  root.querySelectorAll('span[style], p[style], div[style]').forEach((node) => {
    const style = node.getAttribute('style') || ''
    if (/font-weight\s*:\s*(bold|[6-9]00)/i.test(style)) {
      const strong = root.ownerDocument.createElement('strong')
      strong.innerHTML = node.innerHTML
      node.replaceChildren(strong)
    }
    if (/font-style\s*:\s*italic/i.test(style)) {
      const em = root.ownerDocument.createElement('em')
      em.innerHTML = node.innerHTML
      node.replaceChildren(em)
    }
    if (/text-decoration[^;]*underline/i.test(style)) {
      const underline = root.ownerDocument.createElement('u')
      underline.innerHTML = node.innerHTML
      node.replaceChildren(underline)
    }
    if (/text-decoration[^;]*line-through/i.test(style)) {
      const strike = root.ownerDocument.createElement('s')
      strike.innerHTML = node.innerHTML
      node.replaceChildren(strike)
    }
  })
}

function hasBlockChildren(element) {
  return Array.from(element.children || []).some((child) => (
    ['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'UL', 'OL', 'TABLE', 'BLOCKQUOTE'].includes(child.tagName)
  ))
}

function collectPasteBlocks(root) {
  const blocks = []

  function walk(parent) {
    Array.from(parent.childNodes).forEach((node) => {
      if (node.nodeType === 3) {
        if (node.textContent?.trim()) {
          const p = root.ownerDocument.createElement('p')
          p.textContent = node.textContent.trim()
          blocks.push(p)
        }
        return
      }

      if (node.nodeType !== 1) return

      const tag = node.tagName
      const prefix = getBlockPrefixInfo(node)
      const hasChildren = hasBlockChildren(node)
      const isAtomicBlock = ['UL', 'OL', 'TABLE', 'IMG'].includes(tag)
      const isTextBlock = ['P', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE'].includes(tag)

      if (isAtomicBlock || isTextBlock || (prefix && !hasChildren)) {
        blocks.push(node)
        return
      }

      if (hasChildren) {
        walk(node)
        return
      }

      if (node.textContent?.trim()) {
        blocks.push(node)
      }
    })
  }

  walk(root)
  return blocks
}

function buildRichDocumentHtmlFromPaste(html) {
  if (!html || typeof DOMParser === 'undefined') return null
  const doc = new DOMParser().parseFromString(`<div id="root">${html}</div>`, 'text/html')
  const root = doc.getElementById('root')
  if (!root) return null

  root.querySelectorAll('meta, style, script, div[data-section-divider]').forEach((node) => node.remove())
  normalizeRichInlineMarks(root)
  const blocks = collectPasteBlocks(root)
  let changed = false
  const nextBlocks = []

  blocks.forEach((node) => {
    if (node.nodeType !== 1) {
      const text = (node.textContent || '').trim()
      if (text) nextBlocks.push(escapeEditorHtml(text))
      return
    }

    if (isBlankPasteElement(node)) return

    const prefix = getBlockPrefixInfo(node)
    if (prefix?.type === 'seo') {
      changed = true
      return
    }

    if (['h1', 'h2', 'h3'].includes(prefix?.type)) {
      changed = true
      nextBlocks.push(`<${prefix.type}>${escapeEditorHtml(prefix.text)}</${prefix.type}>`)
      return
    }

    if (prefix?.type === 'cta') {
      changed = true
      nextBlocks.push(`<div data-cta-button data-cta-text="${escapeEditorHtml(prefix.text)}" data-cta-url=""></div>`)
      return
    }

    nextBlocks.push(node.outerHTML)
  })

  return changed ? cleanDocumentPasteHtml(nextBlocks.join('')) || '<p></p>' : null
}

function buildRichSectionsFromPaste(html, { mode = 'page' } = {}) {
  if (!html || typeof DOMParser === 'undefined') return null
  const doc = new DOMParser().parseFromString(`<div id="root">${html}</div>`, 'text/html')
  const root = doc.getElementById('root')
  if (!root) return null

  root.querySelectorAll('meta, style, script, div[data-section-divider]').forEach((node) => node.remove())
  normalizeRichInlineMarks(root)
  const blocks = collectPasteBlocks(root)

  if (mode === 'faq') {
    const faqBlocks = []
    let hasQuestion = false
    blocks.forEach((node) => {
      if (node.nodeType !== 1) return
      const prefix = getBlockPrefixInfo(node)
      if (prefix?.type === 'seo') return
      if (prefix?.type === 'h1') {
        faqBlocks.push(`<h1>${escapeEditorHtml(prefix.text)}</h1>`)
        return
      }
      if (prefix?.type === 'h2') {
        hasQuestion = true
        faqBlocks.push(`<h2>${escapeEditorHtml(prefix.text)}</h2>`)
        return
      }
      if (prefix?.type === 'h3') {
        faqBlocks.push(`<h3>${escapeEditorHtml(prefix.text)}</h3>`)
        return
      }
      if (prefix?.type === 'cta') {
        faqBlocks.push(`<div data-cta-button data-cta-text="${escapeEditorHtml(prefix.text)}" data-cta-url=""></div>`)
        return
      }
      faqBlocks.push(node.outerHTML)
    })
    return hasQuestion ? faqBlocks.join('') : null
  }

  const sections = []
  let current = null
  blocks.forEach((node) => {
    if (node.nodeType !== 1) {
      if (current) current.nodes.push(node)
      return
    }

    const tag = node.tagName?.toLowerCase()
    const prefix = getBlockPrefixInfo(node)
    const isHeading = tag === 'h1' || tag === 'h2' || prefix?.type === 'h1' || prefix?.type === 'h2'

    if (prefix?.type === 'seo') return

    if (isHeading) {
      if (current) sections.push(current)
      const level = tag === 'h1' || prefix?.type === 'h1' ? 'h1' : 'h2'
      const text = prefix?.text || node.textContent?.replace(/\s+/g, ' ').trim() || ''
      current = {
        nodes: [`<${level}>${escapeEditorHtml(text)}</${level}>`],
      }
      return
    }

    if (!current) return

    if (prefix?.type === 'h3') {
      current.nodes.push(`<h3>${escapeEditorHtml(prefix.text)}</h3>`)
      return
    }

    if (prefix?.type === 'cta') {
      current.nodes.push(`<div data-cta-button data-cta-text="${escapeEditorHtml(prefix.text)}" data-cta-url=""></div>`)
      return
    }

    current.nodes.push(node.outerHTML)
  })

  if (current) sections.push(current)
  if (sections.length === 0) return null

  return sections.map((section, index) => {
    const sectionName = index === 0 ? 'Hero - ATF' : `Sección ${index + 1}`
    const sectionId = createLocalId('s')
    return `<div data-section-divider data-section-id="${sectionId}" data-section-name="${escapeEditorHtml(sectionName)}"></div>${section.nodes.join('') || '<p></p>'}`
  }).join('')
}

function buildSectionedHtmlFromPaste(html) {
  if (!html || typeof DOMParser === 'undefined') return null
  const doc = new DOMParser().parseFromString(`<div id="root">${html}</div>`, 'text/html')
  const root = doc.getElementById('root')
  if (!root) return null

  const hasSectionHeading = Array.from(root.children).some((node) => {
    const tag = node.tagName?.toLowerCase()
    return tag === 'h1' || tag === 'h2'
  })
  if (!hasSectionHeading) return null

  const sections = []
  let currentNodes = []
  let started = false

  Array.from(root.childNodes).forEach((node) => {
    const tag = node.nodeType === 1 ? node.tagName?.toLowerCase() : ''
    const isSectionHeading = tag === 'h1' || tag === 'h2'

    if (isSectionHeading) {
      if (started) sections.push(currentNodes)
      currentNodes = [node]
      started = true
      return
    }

    if (!started) {
      started = true
      currentNodes = []
    }
    currentNodes.push(node)
  })

  if (started) sections.push(currentNodes)
  if (sections.length === 0) return null

  return sections.map((nodes, index) => {
    const sectionName = index === 0 ? 'Hero - ATF' : `Sección ${index + 1}`
    const sectionId = createLocalId('s')
    return `<div data-section-divider data-section-id="${sectionId}" data-section-name="${sectionName}"></div>${serializeNodes(nodes, doc)}`
  }).join('')
}

function deriveDocumentOutline(editor) {
  if (!editor) return []
  const json = editor.getJSON()
  const items = []
  ;(json.content || []).forEach((node) => {
    if (node.type !== 'heading' || node.attrs?.level > 3) return
    const text = (node.content || []).map((child) => child.text || '').join('').trim()
    if (!text) return
    items.push({
      id: `heading-${items.length}`,
      headingIndex: items.length,
      level: node.attrs.level,
      text,
    })
  })
  return items
}

function deriveFaqItems(editor) {
  if (!editor) return []
  const json = editor.getJSON()
  const items = []
  let current = null

  ;(json.content || []).forEach((node) => {
    if (node.type === 'heading' && (node.attrs?.level === 2 || node.attrs?.level === 3)) {
      if (current) items.push(current)
      const question = (node.content || []).map((child) => child.text || '').join('').trim()
      current = {
        id: `faq-${items.length}`,
        headingIndex: items.length,
        question: question || `Pregunta Frecuente ${items.length + 1}`,
        answer: '',
      }
      return
    }

    if (!current) return
    const text = (node.content || []).map((child) => child.text || '').join('').trim()
    if (text) current.answer = current.answer ? `${current.answer} ${text}` : text
  })

  if (current) items.push(current)
  return items
}

function parseFaqItemsFromHtml(html) {
  if (!html || typeof DOMParser === 'undefined') return []
  const doc = new DOMParser().parseFromString(`<div id="root">${html}</div>`, 'text/html')
  const root = doc.getElementById('root')
  if (!root) return []

  const items = []
  let current = null
  Array.from(root.children).forEach((element) => {
    const tag = element.tagName?.toLowerCase()
    if (tag === 'h2' || tag === 'h3') {
      if (current) items.push(current)
      current = { question: element.textContent?.replace(/\s+/g, ' ').trim() || '', answerNodes: [] }
      return
    }
    if (tag === 'h1' && !current) return
    if (current) current.answerNodes.push(element)
  })
  if (current) items.push(current)

  return items
    .map((item) => ({
      question: item.question,
      answer: item.answerNodes.map((node) => node.textContent?.replace(/\s+/g, ' ').trim() || '').filter(Boolean).join('\n'),
    }))
    .filter((item) => item.question)
}

function deriveDocumentOutlineFromHtml(html) {
  if (!html || typeof DOMParser === 'undefined') return []
  const doc = new DOMParser().parseFromString(`<div id="root">${html}</div>`, 'text/html')
  const root = doc.getElementById('root')
  if (!root) return []

  const items = []
  Array.from(root.children).forEach((node) => {
    if (node.matches?.('div[data-section-divider]')) return
    const tag = node.tagName?.toLowerCase()
    if (!['h1', 'h2', 'h3'].includes(tag)) return
    const text = node.textContent?.replace(/\s+/g, ' ').trim() || ''
    if (!text) return
    items.push({
      id: `heading-${items.length}`,
      headingIndex: items.length,
      level: Number(tag.slice(1)),
      text,
    })
  })
  return items
}

function deriveFaqPanelItemsFromHtml(html) {
  return parseFaqItemsFromHtml(html).map((item, index) => ({
    id: `faq-${index}`,
    headingIndex: index,
    question: item.question || `Pregunta Frecuente ${index + 1}`,
    answer: item.answer || '',
  }))
}

function deriveSectionsFromHtmlForSidebar(html) {
  return parseSectionsFromHtml(html).map((section, index) => {
    let headings = []
    let isEmpty = true

    if (typeof DOMParser !== 'undefined') {
      const doc = new DOMParser().parseFromString(`<div id="root">${section.content || ''}</div>`, 'text/html')
      const root = doc.getElementById('root')
      if (root) {
        // Solo H2/H3 — los H1 son divisores top-level del panel
        headings = Array.from(root.querySelectorAll('h2, h3'))
          .map((node) => {
            const text = node.textContent?.replace(/\s+/g, ' ').trim() || ''
            if (!text) return null
            return {
              tag: node.tagName.toLowerCase(),
              text,
            }
          })
          .filter(Boolean)
        isEmpty = !Array.from(root.childNodes).some((node) => {
          if (node.nodeType === 3) return Boolean(node.textContent?.trim())
          if (node.nodeType !== 1) return false
          const tag = node.tagName?.toLowerCase()
          if (['img', 'table'].includes(tag)) return true
          if (node.matches?.('[data-cta-button]')) return true
          return Boolean(node.textContent?.trim())
        })
      }
    }

    return {
      id: section.id,
      name: section.name,
      headings,
      isEmpty,
      docIndex: index,
    }
  })
}

// H1s top-level extraídos del HTML completo de la página.
// Cada H1 incluye su posición relativa entre childNodes para ordenarlos
// junto a las secciones. Para esto contamos solo dividers + H1s top-level.
function deriveTopLevelH1sFromHtml(html) {
  if (!html || typeof DOMParser === 'undefined') return []
  const doc = new DOMParser().parseFromString(`<div id="root">${html}</div>`, 'text/html')
  const root = doc.getElementById('root')
  if (!root) return []

  const items = []
  let dividerCount = 0
  Array.from(root.childNodes).forEach((node) => {
    if (node.nodeType !== 1) return
    if (node.matches?.('div[data-section-divider]')) {
      dividerCount += 1
      return
    }
    const tag = node.tagName?.toLowerCase()
    if (tag !== 'h1') return
    const text = node.textContent?.replace(/\s+/g, ' ').trim() || ''
    items.push({
      id: `h1-html-${items.length}`,
      text: text || `Título ${items.length + 1}`,
      // Aparece "después" de la sección con docIndex = dividerCount - 1
      // (o sea, dentro del contenido de esa sección). Si dividerCount === 0,
      // aparece antes de cualquier sección.
      docIndex: dividerCount > 0 ? dividerCount - 1 + 0.5 : -0.5,
      h1Index: items.length,
    })
  })
  return items
}

function csvCell(value) {
  return `"${String(value || '').replaceAll('"', '""')}"`
}

function exportFaqCsv(page) {
  const items = parseFaqItemsFromHtml(page?.fullContent || buildDocumentHTML(page?.sections || []))
  const csv = [
    'question,answer',
    ...items.map((item) => `${csvCell(item.question)},${csvCell(item.answer)}`),
  ].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${(page?.name || 'faqs').toLowerCase().replace(/[^a-z0-9]+/gi, '-') || 'faqs'}.csv`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

function getPageSeoMetadata(page) {
  return {
    titleTag: page?.seoMetadata?.titleTag || '',
    metaDescription: page?.seoMetadata?.metaDescription || '',
    urlSlug: page?.seoMetadata?.urlSlug || '',
  }
}

const DEFAULT_CONTENT_RULES = Object.freeze({
  titleTagMinChars: null,
  titleTagMaxChars: null,
  metaDescriptionMinChars: null,
  metaDescriptionMaxChars: null,
  urlSlugMaxWords: null,
  documentMaxWords: null,
})

function normalizeRuleNumber(value) {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return null
  return Math.round(parsed)
}

function normalizeContentRules(rules) {
  const normalized = {
    titleTagMinChars: normalizeRuleNumber(rules?.titleTagMinChars),
    titleTagMaxChars: normalizeRuleNumber(rules?.titleTagMaxChars),
    metaDescriptionMinChars: normalizeRuleNumber(rules?.metaDescriptionMinChars),
    metaDescriptionMaxChars: normalizeRuleNumber(rules?.metaDescriptionMaxChars),
    urlSlugMaxWords: normalizeRuleNumber(rules?.urlSlugMaxWords),
    documentMaxWords: normalizeRuleNumber(rules?.documentMaxWords),
  }

  if (normalized.titleTagMinChars && normalized.titleTagMaxChars && normalized.titleTagMinChars > normalized.titleTagMaxChars) {
    normalized.titleTagMaxChars = normalized.titleTagMinChars
  }

  if (
    normalized.metaDescriptionMinChars
    && normalized.metaDescriptionMaxChars
    && normalized.metaDescriptionMinChars > normalized.metaDescriptionMaxChars
  ) {
    normalized.metaDescriptionMaxChars = normalized.metaDescriptionMinChars
  }

  return normalized
}

function hasContentRules(rules) {
  return Object.values(normalizeContentRules(rules)).some((value) => value !== null)
}

function getPageContentRules(page) {
  return normalizeContentRules(page?.contentRules || page?.content_rules || null)
}

function normalizeSlugValue(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' y ')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
}

function getSlugWordCount(value) {
  return normalizeSlugValue(value).split('-').filter(Boolean).length
}

function getFieldRuleState(value, min, max) {
  const current = Array.from(String(value || '')).length
  return {
    current,
    min: min || null,
    max: max || null,
    underMin: Boolean(min) && current < min,
    overMax: Boolean(max) && current > max,
  }
}

function getDocumentRuleWarnings({ contentRules, seoMetadata, documentWords }) {
  const rules = getPageContentRules({ contentRules })
  const warnings = []
  const titleState = getFieldRuleState(seoMetadata?.titleTag || '', rules.titleTagMinChars, rules.titleTagMaxChars)
  const metaState = getFieldRuleState(seoMetadata?.metaDescription || '', rules.metaDescriptionMinChars, rules.metaDescriptionMaxChars)
  const slugWords = getSlugWordCount(seoMetadata?.urlSlug || '')

  if (titleState.underMin) warnings.push(`Title tag: mínimo ${rules.titleTagMinChars} caracteres`)
  if (titleState.overMax) warnings.push(`Title tag: máximo ${rules.titleTagMaxChars} caracteres`)
  if (metaState.underMin) warnings.push(`Meta description: mínimo ${rules.metaDescriptionMinChars} caracteres`)
  if (metaState.overMax) warnings.push(`Meta description: máximo ${rules.metaDescriptionMaxChars} caracteres`)
  if (rules.urlSlugMaxWords && slugWords > rules.urlSlugMaxWords) warnings.push(`URL slug: máximo ${rules.urlSlugMaxWords} palabras`)
  if (rules.documentMaxWords && Number(documentWords || 0) > rules.documentMaxWords) warnings.push(`Documento: máximo ${rules.documentMaxWords} palabras`)

  return warnings
}

function buildDocumentLimitNotice(label, limit) {
  if (!limit) return ''
  return `${label} llegó al límite de ${limit}.`
}

function inferProjectType(project, pages = []) {
  const explicitType = project?.projectType
  if (explicitType === 'document' || explicitType === 'faq' || explicitType === 'brief') return explicitType

  const firstPage = pages[0]
  const firstName = (firstPage?.name || '').trim().toLowerCase()
  if (firstName === 'documento') return 'document'
  if (firstName === 'faqs' || firstName === 'faq' || firstName === 'preguntas frecuentes') return 'faq'

  return 'page'
}

function mapPersistedPage(page, projectType = 'page') {
  const contentHtml = projectType === 'page'
    ? page.contentHtml
    : projectType === 'faq'
      ? migrateFaqHtmlToSections(page.contentHtml || '')
      : stripSectionDividersFromHtml(page.contentHtml)
  const sections = (projectType === 'page' || projectType === 'faq') ? parseSectionsFromHtml(contentHtml) : []

  return {
    id: page.id,
    name: page.name,
    sections,
    fullContent: contentHtml || buildDocumentHTML(sections),
    contentJson: page.contentJson || null,
    seoMetadata: getPageSeoMetadata(page),
    contentRules: getPageContentRules(page),
    version: page.version || 1,
    reviewStatus: page.reviewStatus || 'draft',
    reviewBaselineVersionId: page.reviewBaselineVersionId || null,
    reviewBaselineAt: page.reviewBaselineAt || null,
    reviewRequestedBy: page.reviewRequestedBy || null,
    pendingProposal: page.pendingProposal ? {
      id: page.pendingProposal.id,
      proposerUserId: page.pendingProposal.proposerUserId,
      contentHtml: page.pendingProposal.contentHtml || '',
      contentJson: page.pendingProposal.contentJson || null,
      seoMetadata: page.pendingProposal.seoMetadata || {},
      status: page.pendingProposal.status || 'pending',
      reviewerUserId: page.pendingProposal.reviewerUserId || null,
      reviewerNote: page.pendingProposal.reviewerNote || '',
      reviewedAt: page.pendingProposal.reviewedAt || null,
      createdAt: page.pendingProposal.createdAt || null,
      updatedAt: page.pendingProposal.updatedAt || null,
    } : null,
  }
}

function normalizeHtmlForCompare(html) {
  if (!html || typeof DOMParser === 'undefined') return ''

  const parser = new DOMParser()
  const doc = parser.parseFromString(`<div id="root">${html}</div>`, 'text/html')
  const root = doc.getElementById('root')
  if (!root) return String(html).trim()

  root.querySelectorAll('[contenteditable]').forEach((node) => node.removeAttribute('contenteditable'))
  return root.innerHTML.replace(/\s+/g, ' ').trim()
}

const EMPTY_SECTION_STATS = {
  text: '',
  textBody: '',
  headingSignature: '',
  ctaCount: 0,
  ctaSignature: '',
  imageCount: 0,
  imageSignature: '',
  tableSignature: '',
}

function getSectionStats(html) {
  if (!html || typeof DOMParser === 'undefined') {
    return { ...EMPTY_SECTION_STATS }
  }

  const parser = new DOMParser()
  const doc = parser.parseFromString(`<div id="root">${html}</div>`, 'text/html')
  const root = doc.getElementById('root')
  if (!root) {
    return {
      ...EMPTY_SECTION_STATS,
      text: String(html).replace(/\s+/g, ' ').trim(),
    }
  }

  const fullText = root.textContent?.replace(/\s+/g, ' ').trim() || ''
  const headings = Array.from(root.querySelectorAll('h1, h2, h3, h4, h5, h6'))
    .map((node) => `${node.tagName.toLowerCase()}|${node.textContent?.replace(/\s+/g, ' ').trim() || ''}`)
  const ctas = Array.from(root.querySelectorAll('[data-cta-button]')).map((node) => (
    `${node.getAttribute('data-cta-text') || ''}|${node.getAttribute('data-cta-url') || ''}`
  ))
  const images = Array.from(root.querySelectorAll('img')).map((node) => node.getAttribute('src') || '')
  const tables = Array.from(root.querySelectorAll('table')).map((node) => node.textContent?.replace(/\s+/g, ' ').trim() || '')

  // Body text excludes heading text so heading edits and body edits are distinguished.
  root.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach((node) => node.remove())
  const bodyText = root.textContent?.replace(/\s+/g, ' ').trim() || ''

  return {
    text: fullText,
    textBody: bodyText,
    headingSignature: headings.join('||'),
    ctaCount: ctas.length,
    ctaSignature: ctas.join('||'),
    imageCount: images.length,
    imageSignature: images.join('||'),
    tableSignature: tables.join('||'),
  }
}

function summarizeSectionChanges(previousSection, nextSection, previousIndex, nextIndex) {
  const changes = new Set()

  if (!previousSection && nextSection) {
    changes.add('section_added')
    return [...changes]
  }

  if (previousSection && !nextSection) {
    changes.add('section_removed')
    return [...changes]
  }

  if (!previousSection || !nextSection) return []

  if (previousSection.name !== nextSection.name) {
    changes.add('section_renamed')
  }

  if (previousIndex !== nextIndex) {
    changes.add('section_moved')
  }

  const previousHtml = normalizeHtmlForCompare(previousSection.content)
  const nextHtml = normalizeHtmlForCompare(nextSection.content)
  if (previousHtml === nextHtml) return [...changes]

  const previousStats = getSectionStats(previousSection.content)
  const nextStats = getSectionStats(nextSection.content)

  // Heading edits emit their own event so the activity feed can distinguish them from body text.
  if (previousStats.headingSignature !== nextStats.headingSignature) {
    changes.add('title_changed')
  }
  if (previousStats.textBody !== nextStats.textBody) {
    changes.add('text_changed')
  }

  if (nextStats.ctaCount > previousStats.ctaCount) changes.add('cta_added')
  if (nextStats.ctaCount < previousStats.ctaCount) changes.add('cta_removed')
  if (
    nextStats.ctaCount === previousStats.ctaCount &&
    nextStats.ctaSignature !== previousStats.ctaSignature
  ) {
    changes.add('cta_changed')
  }

  if (nextStats.imageCount > previousStats.imageCount) changes.add('image_added')
  if (nextStats.imageCount < previousStats.imageCount) changes.add('image_removed')
  if (
    nextStats.imageCount === previousStats.imageCount &&
    nextStats.imageSignature !== previousStats.imageSignature
  ) {
    changes.add('image_changed')
  }

  if (nextStats.tableSignature !== previousStats.tableSignature) changes.add('table_changed')
  if (changes.size === 0) changes.add('content_changed')

  return [...changes]
}

function buildSectionActivityEvents(previousPages, nextPayload) {
  const events = []

  nextPayload.forEach((nextPage) => {
    const previousPage = previousPages.find((page) => page.id === nextPage.id)
    const previousSections = parseSectionsFromHtml(
      previousPage?.fullContent || buildDocumentHTML(previousPage?.sections || [])
    )
    const nextSections = parseSectionsFromHtml(nextPage.contentHtml)
    const previousMap = new Map(previousSections.map((section, index) => [section.id, { section, index }]))
    const nextMap = new Map(nextSections.map((section, index) => [section.id, { section, index }]))

    nextSections.forEach((section, nextIndex) => {
      const previous = previousMap.get(section.id)
      const changeTypes = summarizeSectionChanges(previous?.section, section, previous?.index ?? null, nextIndex)
      if (changeTypes.length === 0) return

      events.push({
        pageId: nextPage.id,
        pageName: nextPage.name,
        sectionId: section.id,
        sectionName: section.name,
        changeTypes,
        previousIndex: previous?.index ?? null,
        nextIndex,
      })
    })

    previousSections.forEach((section, previousIndex) => {
      if (nextMap.has(section.id)) return

      events.push({
        pageId: nextPage.id,
        pageName: nextPage.name,
        sectionId: section.id,
        sectionName: section.name,
        changeTypes: ['section_removed'],
        previousIndex,
        nextIndex: null,
      })
    })
  })

  return events
}

// For document/faq project types that have no section dividers,
// compare the whole page HTML and emit a single activity event with
// sectionId='__document__'. This gives the activity panel something to
// group and allows click-to-scroll to work.
function buildDocumentActivityEvents(previousPages, nextPayload) {
  const events = []

  nextPayload.forEach((nextPage) => {
    const previousPage = previousPages.find((page) => page.id === nextPage.id)
    const previousHtml = previousPage?.fullContent || buildDocumentHTML(previousPage?.sections || []) || ''
    const nextHtml = nextPage.contentHtml || ''

    if (normalizeHtmlForCompare(previousHtml) === normalizeHtmlForCompare(nextHtml)) return

    const previousStats = getSectionStats(previousHtml)
    const nextStats = getSectionStats(nextHtml)
    const changes = new Set()

    if (previousStats.headingSignature !== nextStats.headingSignature) changes.add('title_changed')
    if (previousStats.textBody !== nextStats.textBody) changes.add('text_changed')
    if (nextStats.imageCount > previousStats.imageCount) changes.add('image_added')
    if (nextStats.imageCount < previousStats.imageCount) changes.add('image_removed')
    if (
      nextStats.imageCount === previousStats.imageCount &&
      nextStats.imageSignature !== previousStats.imageSignature
    ) changes.add('image_changed')
    if (nextStats.ctaCount > previousStats.ctaCount) changes.add('cta_added')
    if (nextStats.ctaCount < previousStats.ctaCount) changes.add('cta_removed')
    if (
      nextStats.ctaCount === previousStats.ctaCount &&
      nextStats.ctaSignature !== previousStats.ctaSignature
    ) changes.add('cta_changed')
    if (nextStats.tableSignature !== previousStats.tableSignature) changes.add('table_changed')
    if (changes.size === 0) changes.add('content_changed')

    events.push({
      pageId: nextPage.id,
      pageName: nextPage.name,
      sectionId: '__document__',
      sectionName: nextPage.name || 'Documento',
      changeTypes: [...changes],
      previousIndex: null,
      nextIndex: 0,
    })
  })

  return events
}

function isUnreadSectionActivity(item) {
  return item?.eventType === 'section_edited'
    && item.metadata?.sectionId
    && !item.metadata?.readAt
}

function formatActivityChangeTypes(changeTypes = []) {
  const labels = {
    text_changed: 'Cambió texto',
    title_changed: 'Cambió título',
    cta_added: 'Agregó CTA',
    cta_removed: 'Eliminó CTA',
    cta_changed: 'Cambió CTA',
    image_added: 'Agregó imagen',
    image_changed: 'Cambió imagen',
    image_removed: 'Eliminó imagen',
    table_changed: 'Cambió tabla',
    section_moved: 'Movió la sección',
    section_added: 'Agregó sección',
    section_removed: 'Eliminó sección',
    section_renamed: 'Renombró sección',
    content_changed: 'Editó contenido',
  }

  return changeTypes.map((type) => labels[type] || 'Editó contenido').join(' · ')
}

const EMPTY_WORD_STATS = {
  words: 0,
  characters: 0,
  charactersNoSpaces: 0,
  selectedWords: 0,
  selectedCharacters: 0,
  selectedCharactersNoSpaces: 0,
  hasSelection: false,
}

function getTextStats(text = '') {
  const normalized = String(text || '').replace(/\u00a0/g, ' ')
  const words = normalized.match(/[\p{L}\p{N}]+(?:[’'-][\p{L}\p{N}]+)*/gu) || []

  return {
    words: words.length,
    characters: Array.from(normalized).length,
    charactersNoSpaces: Array.from(normalized.replace(/\s/g, '')).length,
  }
}

function getEditorWordStats(editor) {
  if (!editor) return EMPTY_WORD_STATS

  const fullText = editor.state.doc.textBetween(0, editor.state.doc.content.size, ' ', ' ')
  const total = getTextStats(fullText)
  const { from, to, empty } = editor.state.selection
  const selected = empty ? getTextStats('') : getTextStats(editor.state.doc.textBetween(from, to, ' ', ' '))

  return {
    ...total,
    selectedWords: selected.words,
    selectedCharacters: selected.characters,
    selectedCharactersNoSpaces: selected.charactersNoSpaces,
    hasSelection: !empty,
  }
}

function getEditorTextAfterReplace(editor, from, to, insertedText = '') {
  if (!editor) return ''
  const before = editor.state.doc.textBetween(0, from, ' ', ' ')
  const after = editor.state.doc.textBetween(to, editor.state.doc.content.size, ' ', ' ')
  return `${before}${insertedText}${after}`
}

function htmlToTextContent(html = '') {
  if (!html || typeof DOMParser === 'undefined') return ''
  const doc = new DOMParser().parseFromString(`<div id="clipboard-root">${html}</div>`, 'text/html')
  return doc.getElementById('clipboard-root')?.textContent?.replace(/\s+/g, ' ').trim() || ''
}

// ---------------------------------------------------------------------------
// Helper: getNextSectionNumber — devuelve el siguiente número para auto-nombrar
// ---------------------------------------------------------------------------
const AUTO_SECTION_NAME_RE = /^Sección (\d+)$/
const AUTO_FAQ_SECTION_NAME_RE = /^Pregunta Frecuente (\d+)$/

function isAutoSectionName(name) {
  return AUTO_SECTION_NAME_RE.test(name?.trim() || '')
}

function isAutoFaqSectionName(name) {
  return AUTO_FAQ_SECTION_NAME_RE.test(name?.trim() || '')
}

function getNextSectionNumber(sections) {
  return sections.length + 1
}

// ---------------------------------------------------------------------------
// Helper: deriveSectionsFromDoc — extrae secciones del documento del editor
// Todas las secciones están delimitadas por nodos sectionDivider.
// ---------------------------------------------------------------------------
function deriveSectionsFromDoc(editor) {
  if (!editor) return []
  const json = editor.getJSON()
  if (!json.content) return []

  const sections = []
  let currentSection = null

  json.content.forEach((node, idx) => {
    if (node.type === 'sectionDivider') {
      if (currentSection) sections.push(currentSection)
      currentSection = {
        id: node.attrs.sectionId,
        name: node.attrs.sectionName,
        headings: [],
        isEmpty: true,
        docIndex: idx,
      }
      return
    }

    if (!currentSection) return

    // Check if node has real content
    const hasContent = ['ctaButton', 'image', 'table'].includes(node.type)
      || (node.content && node.content.some(
        (child) => child.text && child.text.trim().length > 0
      ))
    if (hasContent) currentSection.isEmpty = false

    // Collect H2/H3 only — H1s are top-level divider items, not section headings
    if (node.type === 'heading' && (node.attrs?.level === 2 || node.attrs?.level === 3)) {
      const text = (node.content || []).map((c) => c.text || '').join('')
      if (text.trim()) {
        currentSection.headings.push({
          tag: `h${node.attrs.level}`,
          text: text.trim(),
        })
      }
    }
  })
  if (currentSection) sections.push(currentSection)
  return sections
}

// Top-level H1s: extraídos del editor como elementos divisores del panel.
// Cada H1 incluye su docIndex (posición en json.content) para ordenarlos
// junto a las secciones por orden de aparición en el documento.
function deriveTopLevelH1sFromDoc(editor) {
  if (!editor) return []
  const json = editor.getJSON()
  if (!json.content) return []

  const items = []
  json.content.forEach((node, idx) => {
    if (node.type === 'heading' && node.attrs?.level === 1) {
      const text = (node.content || []).map((c) => c.text || '').join('').trim()
      items.push({
        id: `h1-${idx}`,
        text: text || `Título ${items.length + 1}`,
        docIndex: idx,
        h1Index: items.length, // 0-based index entre todos los H1 del doc
      })
    }
  })
  return items
}

function getFirstEditableTextPos(editor) {
  if (!editor) return null

  let targetPos = null

  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === 'sectionDivider') return false
    if (node.isTextblock) {
      targetPos = pos + 1
      return false
    }
    return true
  })

  return targetPos
}

function getSectionInsertPos(editor, afterSectionId) {
  if (!editor || !afterSectionId) return null

  let insertPos = null
  let foundTarget = false

  editor.state.doc.forEach((node, offset) => {
    if (node.type.name !== 'sectionDivider') return

    if (foundTarget && insertPos === null) {
      insertPos = offset
      return
    }

    if (node.attrs.sectionId === afterSectionId) {
      foundTarget = true
    }
  })

  if (!foundTarget) return null
  return insertPos ?? editor.state.doc.content.size
}

function getSectionInfoFromSelection(editor) {
  if (!editor) return null

  const selectionPos = editor.state.selection.from
  let sectionId = null
  let headingCursor = 0
  let lastHeadingIndex = 0

  editor.state.doc.forEach((node, offset) => {
    if (offset > selectionPos) return

    if (node.type.name === 'sectionDivider') {
      sectionId = node.attrs.sectionId || null
      headingCursor = 0
      lastHeadingIndex = 0
      return
    }

    if (!sectionId) return

    if (node.type.name === 'heading' && node.attrs?.level <= 3) {
      lastHeadingIndex = headingCursor
      headingCursor += 1
    }
  })

  if (!sectionId) return null

  return {
    sectionId,
    headingIndex: lastHeadingIndex,
  }
}

// ---------------------------------------------------------------------------
// Helper: mapHeadingsToSections — maps DOM headings to their section IDs
// Used by scroll listener and heading click
// ---------------------------------------------------------------------------
function mapHeadingsInDOM(pmEl, firstSectionId) {
  if (!pmEl) return []
  const result = []
  let currentSectionId = firstSectionId
  let headingIndex = 0

  for (const child of pmEl.children) {
    // Check if this is a section divider NodeView
    const dividerWrapper = child.querySelector?.('[data-section-divider]') || (child.hasAttribute?.('data-section-divider') ? child : null)
    if (dividerWrapper) {
      currentSectionId = dividerWrapper.getAttribute('data-section-id') || currentSectionId
      headingIndex = 0
      continue
    }

    // Check if it's a heading
    const tag = child.tagName?.toLowerCase()
    if (tag === 'h1' || tag === 'h2' || tag === 'h3') {
      result.push({ el: child, sectionId: currentSectionId, headingIndex })
      headingIndex++
    }
  }
  return result
}

function mapSectionsInDOM(pmEl) {
  if (!pmEl) return []

  const result = []

  for (const child of pmEl.children) {
    const dividerWrapper = child.querySelector?.('[data-section-divider]') || (child.hasAttribute?.('data-section-divider') ? child : null)
    if (!dividerWrapper) continue

    result.push({
      el: dividerWrapper,
      sectionId: dividerWrapper.getAttribute('data-section-id') || '',
    })
  }

  return result
}

// ---------------------------------------------------------------------------
// Componente principal — ProjectEditor
// ---------------------------------------------------------------------------
export default function ProjectEditor() {
  const navigate = useNavigate()
  const { id: projectId } = useParams()
  const { currentUser } = useAuth()
  const initialPersistedEditorViewRef = useRef(readPersistedProjectEditorView(projectId))
  const rootRef = useRef(null)
  const tooltipTimerRef = useRef(null)
  const tooltipTargetRef = useRef(null)
  const tooltipVisibleRef = useRef(false)

  const [projectMeta, setProjectMeta] = useState(null)
  const [pages, setPages] = useState([])
  const [activePageId, setActivePageId] = useState(null)
  const [activeSectionId, setActiveSectionId] = useState(null)
  // Captura el sectionId justo en mousedown (antes de que blur quite el foco del editor)
  const capturedSectionForFaqRef = useRef(null)
  // Heading activo en el editor — { sectionId, headingIndex } | null
  const [activeHeading, setActiveHeading] = useState(null)
  // Sections derivadas del contenido del editor (source of truth = editor)
  const [derivedSections, setDerivedSections] = useState([])
  const [topLevelH1s, setTopLevelH1s] = useState([])
  const [documentOutline, setDocumentOutline] = useState([])
  const [faqItems, setFaqItems] = useState([])
  const [seoExpanded, setSeoExpanded] = useState(false)
  const [loadingProject, setLoadingProject] = useState(true)
  const [projectError, setProjectError] = useState('')
  const [isDirty, setIsDirty] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState('')
  const [editorMode, setEditorMode] = useState(() => initialPersistedEditorViewRef.current?.editorMode || 'brief')
  const [handoffAudience, setHandoffAudience] = useState(() => initialPersistedEditorViewRef.current?.handoffAudience || 'designer')
  const [activity, setActivity] = useState([])
  const [notifications, setNotifications] = useState([])
  const [deliverables, setDeliverables] = useState([])
  const [selectedActivityId, setSelectedActivityId] = useState(null)
  const [panelError, setPanelError] = useState('')
  const [panelNotice, setPanelNotice] = useState('')
  const [shareUrl, setShareUrl] = useState('')
  const [tooltipState, setTooltipState] = useState(null)
  const [sectionModalState, setSectionModalState] = useState({
    isOpen: false,
    insertAfterSectionId: null,
  })
  const [faqModalState, setFaqModalState] = useState({
    isOpen: false,
    insertAfterSectionId: null,
  })

  // Estado de confirmación para borrar página
  const [deletePageConfirm, setDeletePageConfirm] = useState(null) // pageId or null

  // ID del menú contextual abierto (page-{id} o section-{id}); null = ninguno
  const [openMenuId, setOpenMenuId] = useState(null)

  // scrollRequest: navegación programática desde el sidebar.
  const [scrollRequest, setScrollRequest] = useState(null)
  // flashRequest: activa el highlight amarillo sobre una sección tras navegar.
  const [flashRequest, setFlashRequest] = useState(null)

  // Ref al editor único
  const editorRef = useRef(null)
  const saveInFlightRef = useRef(false)
  const autosaveBlockedRef = useRef(false)
  const autosaveRunnerRef = useRef(null)
  const hasResolvedPersistedViewRef = useRef(false)
  const activeSeoMetadataRef = useRef(getPageSeoMetadata(null))
  const activeContentRulesRef = useRef(getPageContentRules(null))

  const activePage = pages.find((p) => p.id === activePageId)
  const projectType = inferProjectType(projectMeta, pages)
  const {
    canManageProjectMeta,
    canManageProjectStructure: canEditProjectStructure,
    canWriteContent,
    canUseHandoff,
    canSendToReview,
    canReviewDesignerProposals,
    isDesigner,
    canEditContentRules,
  } = useMemo(() => (
    getProjectEditorCapabilities(currentUser, projectMeta?.companyId)
  ), [currentUser, projectMeta?.companyId])
  const availableEditorModes = useMemo(() => (
    canUseHandoff ? ['brief', 'handoff', 'preview'] : ['brief', 'preview']
  ), [canUseHandoff])
  const [contentRuleNotice, setContentRuleNotice] = useState('')
  const activePageForRead = useMemo(() => {
    if (!activePage) return null
    if (editorMode === 'brief' && editorRef.current && activePage.id === activePageId) {
      const html = editorRef.current.getHTML()
      return {
        ...activePage,
        fullContent: html,
        sections: parseSectionsFromHtml(html),
        contentJson: editorRef.current.getJSON(),
      }
    }
    return activePage
  }, [activePage, activePageId, isDirty, editorMode])
  const sectionReviewActivities = useMemo(() => (
    activity.filter((item) => isUnreadSectionActivity(item))
  ), [activity])

  useEffect(() => {
    activeSeoMetadataRef.current = getPageSeoMetadata(activePage)
  }, [activePageId, activePage?.seoMetadata])

  useEffect(() => {
    activeContentRulesRef.current = getPageContentRules(activePage)
  }, [activePageId, activePage?.contentRules])

  useEffect(() => {
    setContentRuleNotice('')
  }, [activePageId])

  useEffect(() => {
    initialPersistedEditorViewRef.current = readPersistedProjectEditorView(projectId)
    hasResolvedPersistedViewRef.current = false
  }, [projectId])

  useEffect(() => {
    if (!loadingProject && !availableEditorModes.includes(editorMode)) {
      setEditorMode('brief')
    }
  }, [availableEditorModes, editorMode, loadingProject])

  useEffect(() => {
    if (loadingProject || hasResolvedPersistedViewRef.current) return
    const persistedEditorView = initialPersistedEditorViewRef.current
    const preferredMode = persistedEditorView?.editorMode
    const nextMode = preferredMode && availableEditorModes.includes(preferredMode)
      ? preferredMode
      : 'brief'
    const nextAudience = persistedEditorView?.handoffAudience === 'dev' ? 'dev' : 'designer'
    setEditorMode(nextMode)
    setHandoffAudience(nextAudience)
    hasResolvedPersistedViewRef.current = true
  }, [availableEditorModes, loadingProject])

  useEffect(() => {
    if (typeof window === 'undefined' || loadingProject || !hasResolvedPersistedViewRef.current) return
    window.sessionStorage.setItem(
      getProjectEditorViewStorageKey(projectId),
      JSON.stringify({
        editorMode,
        handoffAudience,
      }),
    )
  }, [editorMode, handoffAudience, loadingProject, projectId])

  useEffect(() => {
    const root = rootRef.current
    if (!root) return undefined

    function clearTooltipTarget() {
      if (tooltipTimerRef.current) {
        window.clearTimeout(tooltipTimerRef.current)
        tooltipTimerRef.current = null
      }
      const target = tooltipTargetRef.current
      if (target?.dataset?.wbTooltipTitle) {
        target.setAttribute('title', target.dataset.wbTooltipTitle)
      }
      tooltipTargetRef.current = null
      tooltipVisibleRef.current = false
      setTooltipState(null)
    }

    function handlePointerOver(event) {
      const target = event.target instanceof Element ? event.target.closest('[title]') : null
      if (!target || !root.contains(target)) return
      if (tooltipTargetRef.current === target) return

      clearTooltipTarget()
      const title = target.getAttribute('title')
      if (!title) return

      target.dataset.wbTooltipTitle = title
      target.removeAttribute('title')
      tooltipTargetRef.current = target

      tooltipTimerRef.current = window.setTimeout(() => {
        const rect = target.getBoundingClientRect()
        tooltipVisibleRef.current = true
        setTooltipState({
          text: title,
          x: rect.left + (rect.width / 2),
          y: rect.top - 10,
        })
        tooltipTimerRef.current = null
      }, 1400)
    }

    function handlePointerMove(event) {
      if (!tooltipTargetRef.current || !tooltipVisibleRef.current) return
      setTooltipState((current) => current ? { ...current, x: event.clientX, y: event.clientY - 14 } : current)
    }

    function handlePointerOut(event) {
      const currentTarget = tooltipTargetRef.current
      if (!currentTarget) return
      if (event.relatedTarget instanceof Node && currentTarget.contains(event.relatedTarget)) return
      if (event.target !== currentTarget && !(event.target instanceof Node && currentTarget.contains(event.target))) return
      clearTooltipTarget()
    }

    root.addEventListener('pointerover', handlePointerOver)
    root.addEventListener('pointermove', handlePointerMove)
    root.addEventListener('pointerout', handlePointerOut)

    return () => {
      root.removeEventListener('pointerover', handlePointerOver)
      root.removeEventListener('pointermove', handlePointerMove)
      root.removeEventListener('pointerout', handlePointerOut)
      clearTooltipTarget()
    }
  }, [])

  // ── Contenido inicial para el editor ──
  const initialContentRef = useRef('<p></p>')

  // ── Callback cuando el editor se actualiza ──
  // Flag to prevent re-entrant auto-remove
  const isAutoRemoving = useRef(false)
  const isRenumberingSections = useRef(false)
  // Secciones creadas manualmente y todavía vacías: no se auto-eliminan
  const protectedEmptySectionIds = useRef(new Set())

  useEffect(() => {
    let active = true

    async function loadProject() {
      try {
        setLoadingProject(true)
        setProjectError('')

        const data = await apiFetch(`/api/projects/${projectId}`)
        if (!active) return

        const loadedProjectType = inferProjectType(data.project, data.pages)
        const nextPages = data.pages.map((page) => mapPersistedPage(page, loadedProjectType))
        const firstPage = nextPages[0]
        const initialSections = firstPage?.sections || []

        setProjectMeta({ ...data.project, projectType: loadedProjectType })
        setPages(nextPages)
        setActivePageId(firstPage?.id || null)
        const loadedUsesSections = loadedProjectType === 'page' || loadedProjectType === 'faq'
        setActiveSectionId(loadedUsesSections ? initialSections[0]?.id || null : null)
        setDerivedSections(loadedUsesSections ? initialSections.map((section, idx) => ({
          id: section.id,
          name: section.name,
          headings: [],
          isEmpty: false,
          docIndex: idx,
        })) : [])
        setTopLevelH1s(loadedUsesSections ? deriveTopLevelH1sFromHtml(firstPage?.fullContent || '') : [])
        setDocumentOutline([])
        setFaqItems([])
        initialContentRef.current = firstPage?.fullContent || '<p></p>'
        setIsDirty(false)
        setSaveMessage('')
        setContentRuleNotice('')
      } catch (error) {
        if (!active) return
        setProjectError(error.message || 'No se pudo cargar el proyecto')
      } finally {
        if (active) setLoadingProject(false)
      }
    }

    loadProject()

    return () => {
      active = false
    }
  }, [projectId])

  useEffect(() => {
    if (!activePage) return
    if (editorMode === 'brief' && editorRef.current) return

    const html = activePage.fullContent || buildDocumentHTML(activePage.sections || [])

    if (projectType === 'document') {
      setDocumentOutline(deriveDocumentOutlineFromHtml(html))
      setFaqItems([])
      setDerivedSections([])
      setTopLevelH1s([])
      setActiveSectionId(null)
      return
    }

    const nextSections = deriveSectionsFromHtmlForSidebar(html)
    setDerivedSections(nextSections)
    setTopLevelH1s(deriveTopLevelH1sFromHtml(html))
    setDocumentOutline([])
    setFaqItems([])
    setActiveSectionId((current) => current || nextSections[0]?.id || null)
  }, [activePage, editorMode, projectType])

  const loadSidePanelData = useCallback(async () => {
    if (!projectId) return

    try {
      const [activityData, notificationData, deliverablesData] = await Promise.all([
        apiFetch(`/api/projects/${projectId}/activity`),
        apiFetch('/api/notifications'),
        apiFetch(`/api/projects/${projectId}/deliverables`),
      ])
      setActivity(activityData.activity || [])
      setNotifications((notificationData.notifications || []).filter((item) => (
        !item.projectId || item.projectId === projectId
      )))
      setDeliverables(deliverablesData.deliverables || [])
      if (activityData.activityAvailable === false) {
        setPanelNotice('Actividad pendiente de migración en Supabase.')
      } else {
        setPanelNotice('')
      }
      setPanelError('')
    } catch (error) {
      setPanelError(error.message || 'No se pudieron cargar las actualizaciones')
    }
  }, [projectId])

  useEffect(() => {
    if (!loadingProject && projectId) {
      loadSidePanelData()
    }
  }, [loadSidePanelData, loadingProject, projectId])

  const syncProtectedEmptySections = useCallback((sections) => {
    const nextIds = new Set(sections.map((section) => section.id))
    for (const sectionId of Array.from(protectedEmptySectionIds.current)) {
      const section = sections.find((item) => item.id === sectionId)
      if (!nextIds.has(sectionId) || !section?.isEmpty) {
        protectedEmptySectionIds.current.delete(sectionId)
      }
    }
  }, [])

  const renumberAutoSections = useCallback((editor) => {
    if (!editor) return false

    const isFaq = projectType === 'faq'
    const { state } = editor
    let tr = state.tr
    let sectionIndex = 0
    let changed = false

    state.doc.descendants((node, pos) => {
      if (node.type.name !== 'sectionDivider') return true

      sectionIndex += 1

      const isAuto = isFaq
        ? isAutoFaqSectionName(node.attrs.sectionName)
        : isAutoSectionName(node.attrs.sectionName)

      if (isAuto) {
        const expectedName = isFaq
          ? `Pregunta Frecuente ${sectionIndex}`
          : `Sección ${sectionIndex}`
        if (node.attrs.sectionName !== expectedName) {
          tr = tr.setNodeMarkup(pos, undefined, { ...node.attrs, sectionName: expectedName })
          changed = true
        }
      }

      return false
    })

    if (!changed) return false

    isRenumberingSections.current = true
    editor.view.dispatch(tr)
    isRenumberingSections.current = false
    return true
  }, [projectType])

  const handleDocUpdate = useCallback((editor) => {
    if (isAutoRemoving.current || isRenumberingSections.current) return

    autosaveBlockedRef.current = false
    setIsDirty(true)
    setSaveMessage('')

    if (projectType === 'document') {
      setDocumentOutline(deriveDocumentOutline(editor))
      setDerivedSections([])
      setTopLevelH1s([])
      setFaqItems([])
      return
    }

    let sections = deriveSectionsFromDoc(editor)

    // Si el doc tiene contenido pero no hay secciones (usuario escribió sin crear sección),
    // auto-insertar un identificador "Sección 1" al principio del documento.
    if (sections.length === 0) {
      const json = editor.getJSON()
      const hasContent = json.content?.some((n) => {
        if (n.content && n.content.some((c) => c.text && c.text.trim().length > 0)) return true
        if (n.type === 'heading') return true
        return false
      })
      if (hasContent) {
        const id = `s_${Date.now()}`
        const { from, to } = editor.state.selection
        isAutoRemoving.current = true
        editor.chain()
          .insertContentAt(0, { type: 'sectionDivider', attrs: { sectionId: id, sectionName: projectType === 'faq' ? 'Pregunta Frecuente 1' : 'Sección 1' } })
          .run()
        editor.commands.setTextSelection({ from: from + 1, to: to + 1 })
        isAutoRemoving.current = false
        const newSections = deriveSectionsFromDoc(editor)
        setDerivedSections(newSections)
        setTopLevelH1s(deriveTopLevelH1sFromDoc(editor))
        setActiveSectionId(newSections[0]?.id ?? null)
        return
      }
    }

    // FAQ: si hay un H2/H3 que no está inmediatamente después de un sectionDivider,
    // insertar un sectionDivider antes de él para convertirlo en nueva pregunta.
    if (projectType === 'faq' && sections.length > 0) {
      let prevWasDivider = false
      let strayPos = null
      editor.state.doc.forEach((node, offset) => {
        if (strayPos !== null) return
        if (node.type.name === 'sectionDivider') { prevWasDivider = true; return }
        if (node.type.name === 'heading' && (node.attrs.level === 2 || node.attrs.level === 3) && !prevWasDivider) {
          strayPos = offset
          return
        }
        prevWasDivider = false
      })
      if (strayPos !== null) {
        const newId = `s_${Date.now()}`
        const newName = `Pregunta Frecuente ${getNextSectionNumber(sections)}`
        protectedEmptySectionIds.current.add(newId)
        isAutoRemoving.current = true
        editor.chain().insertContentAt(strayPos, { type: 'sectionDivider', attrs: { sectionId: newId, sectionName: newName } }).run()
        isAutoRemoving.current = false
        renumberAutoSections(editor)
        const newSections = deriveSectionsFromDoc(editor)
        setDerivedSections(newSections)
        setTopLevelH1s(deriveTopLevelH1sFromDoc(editor))
        return
      }
    }

    syncProtectedEmptySections(sections)

    if (renumberAutoSections(editor)) {
      sections = deriveSectionsFromDoc(editor)
      syncProtectedEmptySections(sections)
    }

    setDerivedSections(sections)
    setTopLevelH1s(deriveTopLevelH1sFromDoc(editor))

    // Auto-remove empty sections (aplica a todas, incluida la primera).
    // Solo cuando hay más de una sección para no borrar la única existente.
    if (sections.length > 1) {
      const emptySection = sections.find((s) => (
        s.isEmpty && !protectedEmptySectionIds.current.has(s.id)
      ))
      if (emptySection) {
        const { state } = editor
        let dividerPos = null
        let nextDividerPos = null
        let foundTarget = false

        state.doc.forEach((node, offset) => {
          if (node.type.name === 'sectionDivider') {
            if (node.attrs.sectionId === emptySection.id) {
              dividerPos = offset
              foundTarget = true
            } else if (foundTarget && nextDividerPos === null) {
              nextDividerPos = offset
            }
          }
        })

        if (dividerPos !== null) {
          const from = dividerPos
          const to = nextDividerPos !== null ? nextDividerPos : state.doc.content.size
          isAutoRemoving.current = true
          editor.chain().deleteRange({ from, to }).run()
          isAutoRemoving.current = false
          // Actualizar secciones después de la eliminación
          let updated = deriveSectionsFromDoc(editor)
          syncProtectedEmptySections(updated)
          if (renumberAutoSections(editor)) {
            updated = deriveSectionsFromDoc(editor)
            syncProtectedEmptySections(updated)
          }
          setDerivedSections(updated)
          setTopLevelH1s(deriveTopLevelH1sFromDoc(editor))
        }
      }
    }
  }, [projectType, renumberAutoSections, syncProtectedEmptySections])

  // ── Editor listo: guardar ref y derivar secciones iniciales ──
  const handleEditorReady = useCallback((editor) => {
    editorRef.current = editor
    protectedEmptySectionIds.current = new Set()
    if (projectType === 'document') {
      setDocumentOutline(deriveDocumentOutline(editor))
      setDerivedSections([])
      setTopLevelH1s([])
      setFaqItems([])
      return
    }
    if (renumberAutoSections(editor)) {
      const sections = deriveSectionsFromDoc(editor)
      setDerivedSections(sections)
      setTopLevelH1s(deriveTopLevelH1sFromDoc(editor))
      return
    }
    const sections = deriveSectionsFromDoc(editor)
    setDerivedSections(sections)
    setTopLevelH1s(deriveTopLevelH1sFromDoc(editor))
  }, [projectType, renumberAutoSections])

  const snapshotActivePage = useCallback(() => {
    if (!editorRef.current || !activePageId) return null

    const html = editorRef.current.getHTML()
    const json = editorRef.current.getJSON()
    const sections = parseSectionsFromHtml(html)
    const seoMetadata = getPageSeoMetadata({ seoMetadata: activeSeoMetadataRef.current })
    const contentRules = getPageContentRules({ contentRules: activeContentRulesRef.current })

    setPages((prev) => prev.map((page) => (
      page.id === activePageId
        ? { ...page, fullContent: html, contentJson: json, sections, seoMetadata, contentRules }
        : page
    )))

    return { html, json, sections, seoMetadata, contentRules }
  }, [activePageId])

  const loadPageIntoEditor = useCallback((page, shouldScroll = true) => {
    if (!editorRef.current || !page) return

    const content = page.fullContent || buildDocumentHTML(page.sections)
    protectedEmptySectionIds.current = new Set()
    editorRef.current.commands.setContent(content)

    if (projectType === 'document') {
      setDocumentOutline(deriveDocumentOutline(editorRef.current))
      setDerivedSections([])
      setTopLevelH1s([])
      setFaqItems([])
      setActiveSectionId(null)
      return
    }

    renumberAutoSections(editorRef.current)

    const sections = deriveSectionsFromDoc(editorRef.current)
    sections.forEach((section) => protectedEmptySectionIds.current.add(section.id))
    setDerivedSections(sections)
    setTopLevelH1s(deriveTopLevelH1sFromDoc(editorRef.current))

    const firstId = sections[0]?.id ?? null
    setActiveSectionId(firstId)

    if (shouldScroll && firstId) {
      setScrollRequest({ type: 'section', sectionId: firstId, requestId: Date.now() })
    }
  }, [projectType, renumberAutoSections])

  const saveProjectPages = useCallback(async (source = 'manual') => {
    if (!projectId || !activePage || saveInFlightRef.current || !canWriteContent) return false

    const snapshot = snapshotActivePage()
    const payload = pages.map((page) => {
      if (page.id === activePageId && snapshot) {
        return {
          id: page.id,
          name: page.name,
          contentHtml: snapshot.html,
          contentJson: snapshot.json,
          seoMetadata: snapshot.seoMetadata,
          contentRules: snapshot.contentRules,
          version: page.version,
          reviewStatus: page.reviewStatus || 'draft',
          reviewBaselineVersionId: page.reviewBaselineVersionId || null,
          reviewBaselineAt: page.reviewBaselineAt || null,
          reviewRequestedBy: page.reviewRequestedBy || null,
        }
      }

      return {
        id: page.id,
        name: page.name,
        contentHtml: page.fullContent || buildDocumentHTML(page.sections),
        contentJson: page.contentJson || null,
        seoMetadata: getPageSeoMetadata(page),
        contentRules: getPageContentRules(page),
        version: page.version,
        reviewStatus: page.reviewStatus || 'draft',
        reviewBaselineVersionId: page.reviewBaselineVersionId || null,
        reviewBaselineAt: page.reviewBaselineAt || null,
        reviewRequestedBy: page.reviewRequestedBy || null,
      }
    })
    const sectionEvents = projectType === 'page'
      ? buildSectionActivityEvents(pages, payload)
      : buildDocumentActivityEvents(pages, payload)

    saveInFlightRef.current = true
    setIsSaving(true)
    setSaveMessage(source === 'autosave' ? 'Autoguardando...' : '')

    try {
      const data = await apiFetch(`/api/projects/${projectId}/pages`, {
        method: 'PUT',
        body: JSON.stringify({ pages: payload, source, sectionEvents }),
      })

      const persistedPages = data.pages.map((page) => {
        const mappedPage = mapPersistedPage(page, projectType)
        if (mappedPage.id !== activePageId) return mappedPage
        return {
          ...mappedPage,
          seoMetadata: getPageSeoMetadata({ seoMetadata: activeSeoMetadataRef.current }),
          contentRules: getPageContentRules({ contentRules: activeContentRulesRef.current }),
        }
      })
      setPages(persistedPages)
      setIsDirty(false)
      setSaveMessage(
        data.proposalSaved
          ? (source === 'autosave' ? 'Propuesta autoguardada' : 'Propuesta guardada')
          : (source === 'autosave' ? 'Autoguardado' : 'Guardado')
      )
      if (source !== 'autosave' || sectionEvents.length > 0) {
        loadSidePanelData()
      }
      return true
    } catch (error) {
      if (source === 'autosave' && String(error.message || '').includes('otra sesión')) {
        autosaveBlockedRef.current = true
      }
      setSaveMessage(error.message || 'No se pudo guardar')
      return false
    } finally {
      saveInFlightRef.current = false
      setIsSaving(false)
    }
  }, [activePage, activePageId, canWriteContent, loadSidePanelData, pages, projectId, snapshotActivePage])

  useEffect(() => {
    autosaveRunnerRef.current = saveProjectPages
  }, [saveProjectPages])

  async function handleSave() {
    await saveProjectPages('manual')
  }

  async function sendPageToReview() {
    if (!canEditProjectStructure) return
    if (!activePageId || isSaving) return

    const saved = await saveProjectPages('manual')
    if (!saved) return

    setIsSaving(true)
    setSaveMessage('Enviando a revisión...')

    try {
      const data = await apiFetch(`/api/projects/${projectId}/pages/${activePageId}/review`, {
        method: 'POST',
        body: JSON.stringify({ versionName: `Revisión: ${activePage?.name || 'Página'}` }),
      })
      const nextPage = mapPersistedPage(data.page, projectType)
      setPages((current) => current.map((page) => (
        page.id === nextPage.id ? nextPage : page
      )))
      if (nextPage.id === activePageId) {
        initialContentRef.current = nextPage.fullContent
      }
      setSaveMessage('Página en revisión')
      setPanelError('')
      loadSidePanelData()
    } catch (error) {
      setSaveMessage(error.message || 'No se pudo enviar a revisión')
    } finally {
      setIsSaving(false)
    }
  }

  async function createShareLink() {
    if (!canEditProjectStructure) return
    try {
      const data = await apiFetch(`/api/projects/${projectId}/share-links`, {
        method: 'POST',
        body: JSON.stringify({ label: 'Link para cliente' }),
      })
      setShareUrl(data.shareLink.url)
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(data.shareLink.url)
      }
      setPanelError('')
      loadSidePanelData()
    } catch (error) {
      setPanelError(error.message || 'No se pudo crear el link privado')
    }
  }

  async function createDeliverable({ title, serviceType }) {
    if (!canEditProjectStructure) return false
    try {
      const data = await apiFetch(`/api/projects/${projectId}/deliverables`, {
        method: 'POST',
        body: JSON.stringify({ title, serviceType }),
      })
      setDeliverables((current) => [data.deliverable, ...current])
      setPanelError('')
      loadSidePanelData()
      return true
    } catch (error) {
      setPanelError(error.message || 'No se pudo crear el entregable')
      return false
    }
  }

  async function updateDeliverableStatus(deliverableId, status) {
    if (!canEditProjectStructure) return
    try {
      const data = await apiFetch(`/api/projects/${projectId}/deliverables/${deliverableId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      })
      setDeliverables((current) => current.map((item) => (
        item.id === deliverableId ? data.deliverable : item
      )))
      setPanelError('')
      loadSidePanelData()
    } catch (error) {
      setPanelError(error.message || 'No se pudo actualizar el entregable')
    }
  }

  async function handleDesignerProposalDecision(status) {
    if (!canReviewDesignerProposals || !activePage?.pendingProposal?.id) return

    setPanelError('')
    setSaveMessage(status === 'accepted' ? 'Aprobando propuesta...' : 'Rechazando propuesta...')

    try {
      await apiFetch(`/api/projects/${projectId}/pages/${activePage.id}/proposals/${activePage.pendingProposal.id}/decision`, {
        method: 'POST',
        body: JSON.stringify({ status }),
      })

      await loadSidePanelData()

      const data = await apiFetch(`/api/projects/${projectId}`)
      const loadedProjectType = inferProjectType(data.project, data.pages)
      const nextPages = data.pages.map((page) => mapPersistedPage(page, loadedProjectType))
      setProjectMeta({ ...data.project, projectType: loadedProjectType })
      setPages(nextPages)
      setSaveMessage(status === 'accepted' ? 'Propuesta aprobada' : 'Propuesta rechazada')
      setIsDirty(false)
    } catch (error) {
      setSaveMessage(error.message || 'No se pudo revisar la propuesta')
      setPanelError(error.message || 'No se pudo revisar la propuesta')
    }
  }

  useEffect(() => {
    if (!isDirty || loadingProject || !projectId || autosaveBlockedRef.current) return undefined

    const timeoutId = window.setTimeout(() => {
      autosaveRunnerRef.current?.('autosave')
    }, 8000)

    return () => window.clearTimeout(timeoutId)
  }, [isDirty, loadingProject, projectId, activePageId, editorMode])

  useEffect(() => {
    function handleBeforeUnload(event) {
      if (!isDirty) return
      event.preventDefault()
      event.returnValue = ''
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [isDirty])

  // ── Navega a otra página: guarda contenido actual y carga la nueva ──
  function handlePageClick(pageId) {
    const newPage = pages.find((p) => p.id === pageId)
    if (!newPage) return

    // Guardar contenido actual de la página que estamos dejando
    snapshotActivePage()

    setActivePageId(pageId)
    loadPageIntoEditor(newPage)
  }

  // ── Selecciona una sección del sidebar (el EditorPanel hace el scroll) ──
  function handleSectionClick(sectionId) {
    setActiveSectionId(sectionId)
    setActiveHeading({ sectionId, headingIndex: 0 })
    setScrollRequest({ type: 'section', sectionId, requestId: Date.now() })
  }

  // ── Recibe el foco del caret desde el editor ──
  function handleSectionFocus(sectionId) {
    setActiveSectionId(sectionId)
    setActiveHeading({ sectionId, headingIndex: 0 })
  }

  function handleSelectionFocus({ sectionId, headingIndex }) {
    if (sectionId) capturedSectionForFaqRef.current = sectionId
    setActiveSectionId(sectionId)
    setActiveHeading({ sectionId, headingIndex })
  }

  // ── Click en un heading del sidebar → activa sección + heading ──
  function handleHeadingClick(sectionId, headingIndex) {
    setActiveSectionId(sectionId)
    setActiveHeading({ sectionId, headingIndex })
    setScrollRequest({ type: 'heading', sectionId, headingIndex, requestId: Date.now() })
  }

  function handleDocumentHeadingClick(headingIndex) {
    setActiveSectionId(null)
    setActiveHeading({ sectionId: '__document__', headingIndex })
    setScrollRequest({ type: 'documentHeading', headingIndex, requestId: Date.now() })
  }

  // Click en un H1 divisor del panel: scroll al H1 correspondiente en el editor.
  function handleH1Click(h1Index) {
    setActiveSectionId(null)
    setScrollRequest({ type: 'h1', h1Index, requestId: Date.now() })
  }

  function handleSeoPanelClick() {
    setSeoExpanded((value) => !value)
    setScrollRequest({ type: 'seo', requestId: Date.now() })
  }

  function navigateToSection(sectionId, { itemId = null, pageId = null, removed = false } = {}) {
    if (!sectionId) return

    const isPageSwitch = pageId && pageId !== activePageId
    if (isPageSwitch) {
      const targetPage = pages.find((page) => page.id === pageId)
      if (!targetPage) return
      snapshotActivePage()
      setActivePageId(targetPage.id)
      loadPageIntoEditor(targetPage, false)
    }

    if (itemId) setSelectedActivityId(itemId)
    if (removed) return

    setActiveSectionId(sectionId)
    setActiveHeading({ sectionId, headingIndex: 0 })

    const fireScroll = () => {
      setScrollRequest({ type: 'section', sectionId, requestId: Date.now() })
      window.setTimeout(() => setFlashRequest({ sectionId, requestId: Date.now() }), 380)
    }
    if (isPageSwitch) window.setTimeout(fireScroll, 480)
    else fireScroll()
  }

  function navigateToActivity(item) {
    const metadata = item?.metadata || {}
    navigateToSection(metadata.sectionId, {
      itemId: item.id,
      pageId: metadata.pageId,
      removed: metadata.changeTypes?.includes('section_removed'),
    })
  }

  function handleActivityMarkerClick(activityId) {
    const item = activity.find((activityItem) => activityItem.id === activityId)
    if (!item) return
    navigateToActivity(item)
  }

  async function markActivityRead(activityId) {
    try {
      const data = await apiFetch(`/api/projects/${projectId}/activity/${activityId}/read`, {
        method: 'PATCH',
      })
      setActivity((current) => current.map((item) => (
        item.id === activityId ? data.activity : item
      )))
      if (selectedActivityId === activityId) setSelectedActivityId(null)
      setPanelError('')
    } catch (error) {
      setPanelError(error.message || 'No se pudo marcar la actividad')
    }
  }

  // Notifications dropdown reads from project_activity (same table) but filtered to non-content events.
  const notificationActivity = useMemo(() => (
    activity.filter((item) => (
      item.eventType !== 'section_edited' && item.eventType !== 'asset_uploaded'
    ))
  ), [activity])

  const markAllNotificationsRead = useCallback(async () => {
    const unread = notificationActivity.filter((item) => !item.metadata?.readAt)
    if (unread.length === 0) return
    await Promise.allSettled(
      unread.map(async (item) => {
        try {
          const data = await apiFetch(`/api/projects/${projectId}/activity/${item.id}/read`, {
            method: 'PATCH',
          })
          setActivity((current) => current.map((row) => (
            row.id === item.id ? data.activity : row
          )))
        } catch (error) {
          console.error('No se pudo marcar la notificación', error)
        }
      })
    )
  }, [notificationActivity, projectId])

  // ── Scroll manual detectó un nuevo heading en el trigger point ──
  const handleScrollHeadingChange = useCallback(({ sectionId, headingIndex }) => {
    if (sectionId) capturedSectionForFaqRef.current = sectionId
    setActiveSectionId(sectionId)
    setActiveHeading({ sectionId, headingIndex })
  }, [])

  function openSectionModal(insertAfterSectionId = null) {
    setSectionModalState({
      isOpen: true,
      insertAfterSectionId,
    })
  }

  function closeSectionModal() {
    setSectionModalState({
      isOpen: false,
      insertAfterSectionId: null,
    })
  }

  function openFaqModal() {
    setFaqModalState({ isOpen: true, insertAfterSectionId: capturedSectionForFaqRef.current })
  }

  function closeFaqModal() {
    setFaqModalState({ isOpen: false, insertAfterSectionId: null })
  }

  function addFaqSection(questionText, insertAfterSectionId = null) {
    if (!canEditProjectStructure) return
    if (!editorRef.current) return

    const id = `s_${Date.now()}`
    const currentSections = deriveSectionsFromDoc(editorRef.current)
    const sectionCount = currentSections.length
    const finalName = `Pregunta Frecuente ${getNextSectionNumber(currentSections)}`

    protectedEmptySectionIds.current.add(id)

    const h3Node = questionText?.trim()
      ? { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: questionText.trim() }] }
      : { type: 'heading', attrs: { level: 3 } }

    function focusNewH3() {
      const { state } = editorRef.current
      let h3Pos = null
      let foundDivider = false
      state.doc.descendants((node, pos) => {
        if (h3Pos !== null) return false
        if (node.type.name === 'sectionDivider' && node.attrs.sectionId === id) {
          foundDivider = true
          return true
        }
        if (foundDivider && node.isTextblock) {
          h3Pos = pos + node.nodeSize - 1
          return false
        }
        return true
      })
      if (h3Pos !== null) {
        editorRef.current.chain().focus().setTextSelection(h3Pos).run()
      } else {
        editorRef.current.commands.focus('end')
      }
    }

    if (sectionCount === 0) {
      editorRef.current.commands.setContent({
        type: 'doc',
        content: [
          { type: 'sectionDivider', attrs: { sectionId: id, sectionName: finalName } },
          h3Node,
        ],
      })
      focusNewH3()
      setDerivedSections([{ id, name: finalName, headings: [], isEmpty: true, docIndex: 0 }])
      setTopLevelH1s([])
    } else {
      const insertPos = getSectionInsertPos(editorRef.current, insertAfterSectionId)
      const sectionContent = [
        { type: 'sectionDivider', attrs: { sectionId: id, sectionName: finalName } },
        h3Node,
      ]
      if (insertPos !== null) {
        editorRef.current.chain().insertContentAt(insertPos, sectionContent).run()
      } else {
        editorRef.current.chain().focus('end').insertContent(sectionContent).run()
      }
      focusNewH3()
    }

    renumberAutoSections(editorRef.current)
    setActiveSectionId(id)
    setScrollRequest({ type: 'section', sectionId: id, requestId: Date.now() })
  }

  // ── Agrega una sección nueva via TipTap ──
  function addSection(name, insertAfterSectionId = null) {
    if (!canEditProjectStructure) return
    if (!editorRef.current) return

    const id = `s_${Date.now()}`
    const currentSections = deriveSectionsFromDoc(editorRef.current)
    const sectionCount = currentSections.length
    const autoPrefix = projectType === 'faq' ? 'Pregunta Frecuente' : 'Sección'
    const finalName = name?.trim() || `${autoPrefix} ${getNextSectionNumber(currentSections)}`

    protectedEmptySectionIds.current.add(id)

    if (sectionCount === 0) {
      // Documento vacío — insertar el identificador al inicio
      const isFaqType = projectType === 'faq'
      const afterDividerHtml = isFaqType
        ? (name?.trim() ? `<h3>${name.trim()}</h3>` : '<h3></h3>')
        : '<p></p>'
      const html = `<div data-section-divider data-section-id="${id}" data-section-name="${finalName}"></div>${afterDividerHtml}`
      editorRef.current.commands.setContent(html)
      const firstEditablePos = getFirstEditableTextPos(editorRef.current)
      if (firstEditablePos !== null) {
        editorRef.current.chain().focus().setTextSelection(firstEditablePos).run()
      } else {
        editorRef.current.commands.focus('end')
      }
      setDerivedSections([{ id, name: finalName, headings: [], isEmpty: true, docIndex: 0 }])
      setTopLevelH1s([])
    } else {
      const insertPos = getSectionInsertPos(editorRef.current, insertAfterSectionId)
      const isFaqType = projectType === 'faq'
      const afterDividerNode = isFaqType
        ? { type: 'heading', attrs: { level: 3 }, content: name?.trim() ? [{ type: 'text', text: name.trim() }] : undefined }
        : { type: 'paragraph' }
      const sectionContent = [
        { type: 'sectionDivider', attrs: { sectionId: id, sectionName: finalName } },
        afterDividerNode,
      ]

      if (insertPos !== null) {
        editorRef.current.chain().insertContentAt(insertPos, sectionContent).run()
      } else {
        // Sidebar: si no hay sección objetivo, agregar al final
        editorRef.current.chain().focus('end').insertContent(sectionContent).run()
      }

      // Para FAQ, posicionar el cursor en el H3 recién creado
      if (isFaqType) {
        setTimeout(() => {
          if (!editorRef.current) return
          const { doc } = editorRef.current.state
          let targetPos = null
          doc.descendants((node, pos) => {
            if (targetPos !== null) return false
            if (node.type.name === 'sectionDivider' && node.attrs.sectionId === id) {
              targetPos = pos + node.nodeSize
            }
          })
          if (targetPos !== null) {
            editorRef.current.chain().focus().setTextSelection(targetPos + 1).run()
          }
        }, 0)
      }
    }

    renumberAutoSections(editorRef.current)
    setActiveSectionId(id)
    setScrollRequest({ type: 'section', sectionId: id, requestId: Date.now() })
  }

  // ── Renombra una sección ──
  function renameSection(sectionId, newName) {
    if (!canEditProjectStructure) return
    if (!editorRef.current) return
    const { state } = editorRef.current
    state.doc.descendants((node, pos) => {
      if (node.type.name === 'sectionDivider' && node.attrs.sectionId === sectionId) {
        editorRef.current.view.dispatch(
          state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, sectionName: newName })
        )
        return false
      }
    })
  }

  // ── Elimina una sección (desde el sidebar) ──
  // Todas las secciones tienen identificador, la lógica es uniforme para todas.
  function deleteSection(sectionId) {
    if (!canEditProjectStructure) return
    if (!editorRef.current) return
    const { state } = editorRef.current
    protectedEmptySectionIds.current.delete(sectionId)

    let dividerPos = null
    let nextDividerPos = null
    let foundTarget = false

    state.doc.forEach((node, offset) => {
      if (node.type.name === 'sectionDivider') {
        if (node.attrs.sectionId === sectionId) {
          dividerPos = offset
          foundTarget = true
        } else if (foundTarget && nextDividerPos === null) {
          nextDividerPos = offset
        }
      }
    })

    if (dividerPos !== null) {
      const from = dividerPos
      const to = nextDividerPos !== null ? nextDividerPos : state.doc.content.size
      editorRef.current.chain().deleteRange({ from, to }).run()
    }

    renumberAutoSections(editorRef.current)
    const updated = deriveSectionsFromDoc(editorRef.current)
    setDerivedSections(updated)
    setTopLevelH1s(deriveTopLevelH1sFromDoc(editorRef.current))
    if (sectionId === activeSectionId || updated.length === 0) {
      setActiveSectionId(updated[0]?.id ?? null)
    }
  }

  // ── Mover sección (drag & drop reorder) ──
  function moveSection(fromIndex, toIndex) {
    if (!canEditProjectStructure) return
    if (!editorRef.current || fromIndex === toIndex) return
    const editor = editorRef.current
    const { state } = editor
    const { doc } = state

    // 1. Collect section ranges
    const sectionRanges = []
    let currentFrom = null
    doc.forEach((node, offset) => {
      if (node.type.name === 'sectionDivider') {
        if (currentFrom !== null) {
          sectionRanges.push({ from: currentFrom, to: offset })
        }
        currentFrom = offset
      }
    })
    if (currentFrom !== null) {
      sectionRanges.push({ from: currentFrom, to: doc.content.size })
    }

    if (fromIndex < 0 || fromIndex >= sectionRanges.length) return
    if (toIndex < 0 || toIndex >= sectionRanges.length) return

    // 2. Extract each section's content as Fragment
    const sectionContents = sectionRanges.map(({ from, to }) =>
      doc.slice(from, to).content
    )

    // 3. Reorder
    const reordered = [...sectionContents]
    const [moved] = reordered.splice(fromIndex, 1)
    reordered.splice(toIndex, 0, moved)

    // 4. Concatenate and replace entire doc
    let combined = Fragment.empty
    for (const frag of reordered) {
      combined = combined.append(frag)
    }

    editor.view.dispatch(
      state.tr.replaceWith(0, doc.content.size, combined)
    )

    // 5. Post-move housekeeping
    renumberAutoSections(editor)
    const updated = deriveSectionsFromDoc(editor)
    setDerivedSections(updated)
    setTopLevelH1s(deriveTopLevelH1sFromDoc(editor))

    const movedSectionId = derivedSections[fromIndex]?.id
    if (movedSectionId) {
      setActiveSectionId(movedSectionId)
    }
  }

  // ── Agrega una nueva página ──
  function addPage() {
    if (!canEditProjectStructure) return
    const id = crypto.randomUUID()
    const sectionId = `s_${Date.now()}`
    const newSectionName = projectType === 'faq' ? 'Pregunta Frecuente 1' : 'Sección 1'
    const baseContent = (projectType === 'page' || projectType === 'faq')
      ? buildDocumentHTML([{ id: sectionId, name: newSectionName, content: '<p></p>' }])
      : '<p></p>'
    const newPage = {
      id,
      name: 'Nueva página',
      sections: (projectType === 'page' || projectType === 'faq') ? [{ id: sectionId, name: newSectionName, content: '<p></p>' }] : [],
      fullContent: baseContent,
      contentJson: null,
      seoMetadata: {},
      contentRules: {},
      version: 0,
      reviewStatus: 'draft',
      reviewBaselineVersionId: null,
      reviewBaselineAt: null,
      reviewRequestedBy: null,
    }
    setPages((prev) => [...prev, newPage])
    setActivePageId(id)
    setIsDirty(true)
    setSaveMessage('')

    if (editorRef.current) {
      protectedEmptySectionIds.current = new Set([sectionId])
      editorRef.current.commands.setContent(baseContent)
      if (projectType === 'page' || projectType === 'faq') {
        renumberAutoSections(editorRef.current)
        const sections = deriveSectionsFromDoc(editorRef.current)
        setDerivedSections(sections)
        setTopLevelH1s([])
      } else {
        setDerivedSections([])
        setTopLevelH1s([])
        setFaqItems([])
        setDocumentOutline(projectType === 'document' ? deriveDocumentOutline(editorRef.current) : [])
      }
    }
    setActiveSectionId((projectType === 'page' || projectType === 'faq') ? sectionId : null)
  }

  // ── Elimina una página (con confirmación) ──
  function deletePage(pageId) {
    if (!canEditProjectStructure) return
    if (pages.length <= 1) return // no borrar la última página
    const remaining = pages.filter((p) => p.id !== pageId)
    setPages(remaining)
    setIsDirty(true)
    setSaveMessage('')

    // Si se borra la página activa, navegar a la primera disponible
    if (pageId === activePageId) {
      const nextPage = remaining[0]
      setActivePageId(nextPage.id)
      loadPageIntoEditor(nextPage, false)
    }
    setDeletePageConfirm(null)
  }

  // ── Renombrar una página ──
  function renamePage(pageId, newName) {
    if (!canEditProjectStructure) return
    if (!newName.trim()) return
    setPages((prev) =>
      prev.map((p) => (p.id === pageId ? { ...p, name: newName.trim() } : p))
    )
    setIsDirty(true)
    setSaveMessage('')
  }

  function updateActivePageSeo(field, value) {
    if (!activePageId) return
    const activeRules = getPageContentRules({ contentRules: activeContentRulesRef.current })
    let nextValue = value

    if (field === 'urlSlug') {
      const normalizedSlug = normalizeSlugValue(value)
      const currentSlugWords = getSlugWordCount(activeSeoMetadataRef.current.urlSlug)
      const nextSlugWords = getSlugWordCount(normalizedSlug)
      if (
        activeRules.urlSlugMaxWords
        && nextSlugWords > activeRules.urlSlugMaxWords
        && nextSlugWords > currentSlugWords
      ) {
        setContentRuleNotice(buildDocumentLimitNotice('El URL slug', `${activeRules.urlSlugMaxWords} palabras`))
        return
      }
      nextValue = normalizedSlug
    }

    if (field === 'titleTag' && activeRules.titleTagMaxChars) {
      const currentLength = Array.from(activeSeoMetadataRef.current.titleTag || '').length
      const nextLength = Array.from(String(nextValue || '')).length
      if (nextLength > activeRules.titleTagMaxChars && nextLength > currentLength) {
        setContentRuleNotice(buildDocumentLimitNotice('El Title tag', `${activeRules.titleTagMaxChars} caracteres`))
        return
      }
    }

    if (field === 'metaDescription' && activeRules.metaDescriptionMaxChars) {
      const currentLength = Array.from(activeSeoMetadataRef.current.metaDescription || '').length
      const nextLength = Array.from(String(nextValue || '')).length
      if (nextLength > activeRules.metaDescriptionMaxChars && nextLength > currentLength) {
        setContentRuleNotice(buildDocumentLimitNotice('La Meta description', `${activeRules.metaDescriptionMaxChars} caracteres`))
        return
      }
    }

    const nextSeoMetadata = {
      ...activeSeoMetadataRef.current,
      [field]: nextValue,
    }
    activeSeoMetadataRef.current = getPageSeoMetadata({ seoMetadata: nextSeoMetadata })
    setContentRuleNotice('')

    setPages((prev) => prev.map((page) => (
      page.id === activePageId
        ? {
            ...page,
            seoMetadata: activeSeoMetadataRef.current,
          }
        : page
    )))
    setIsDirty(true)
    setSaveMessage('')
  }

  function updateActivePageContentRules(field, value) {
    if (!activePageId || !canEditContentRules) return

    const nextRules = normalizeContentRules({
      ...activeContentRulesRef.current,
      [field]: value,
    })

    activeContentRulesRef.current = nextRules

    setPages((prev) => prev.map((page) => (
      page.id === activePageId
        ? { ...page, contentRules: nextRules }
        : page
    )))
    setIsDirty(true)
    setSaveMessage('')
  }

  async function renameProject(name) {
    if (!canEditProjectStructure) return
    const nextName = name.trim()
    if (!nextName || nextName === projectMeta?.name) return
    const previousMeta = projectMeta

    setProjectMeta((current) => ({ ...current, name: nextName }))

    try {
      const data = await apiFetch(`/api/projects/${projectId}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: nextName }),
      })
      setProjectMeta((current) => ({ ...current, ...data.project, name: data.project?.name || nextName }))
      setPanelError('')
    } catch (error) {
      setProjectMeta(previousMeta)
      setPanelError(error.message || 'No se pudo renombrar el proyecto')
    }
  }

  if (loadingProject) {
    return <div className={styles.loadingState}>Cargando proyecto...</div>
  }

  if (projectError) {
    return (
      <div className={styles.loadingState}>
        <p className={styles.loadingErrorText}>{projectError}</p>
        <button className={styles.confirmCancelBtn} onClick={() => navigate('/dashboard')}>
          Volver al dashboard
        </button>
      </div>
    )
  }

  // ── Brief type — delegate to its own editor ──────────────────────────────
  if (projectType === 'brief') {
    return (
      <Suspense fallback={<div className={styles.loadingState}>Cargando...</div>}>
        <BriefProjectEditor
          projectId={projectId}
          projectMeta={projectMeta}
          pages={pages}
        />
      </Suspense>
    )
  }

  return (
    <div ref={rootRef} className={styles.root}>
      {sectionModalState.isOpen && (
        <AddSectionModal
          projectType={projectType}
          onConfirm={(name) => {
            const insertAfterSectionId = sectionModalState.insertAfterSectionId
            closeSectionModal()
            addSection(name, insertAfterSectionId)
          }}
          onSkip={() => {
            const insertAfterSectionId = sectionModalState.insertAfterSectionId
            closeSectionModal()
            addSection('', insertAfterSectionId)
          }}
          onClose={closeSectionModal}
        />
      )}
      {faqModalState.isOpen && (
        <AddFaqModal
          onConfirm={(questionText) => {
            const insertAfterSectionId = faqModalState.insertAfterSectionId
            closeFaqModal()
            addFaqSection(questionText, insertAfterSectionId)
          }}
          onSkip={() => {
            const insertAfterSectionId = faqModalState.insertAfterSectionId
            closeFaqModal()
            addFaqSection('', insertAfterSectionId)
          }}
          onClose={closeFaqModal}
        />
      )}
      {/* ── NAVBAR ── */}
        <Navbar
        pages={pages}
        activePageId={activePageId}
        projectName={projectMeta?.name || 'Proyecto'}
        companyId={projectMeta?.companyId || ''}
        saveMessage={saveMessage}
        isDirty={isDirty}
        isSaving={isSaving}
        notifications={notificationActivity}
        canManagePages={canEditProjectStructure}
        canRenameProject={canManageProjectMeta}
        canSave={canWriteContent}
        onPageClick={handlePageClick}
        onAddPage={addPage}
        onRenamePage={renamePage}
        onRenameProject={renameProject}
        onRequestDeletePage={(pageId) => setDeletePageConfirm(pageId)}
        onLogoClick={() => navigate('/dashboard')}
        onBack={() => navigate(projectMeta?.companyId ? `/companies/${projectMeta.companyId}` : '/companies')}
        onSave={handleSave}
        onRefreshNotifications={loadSidePanelData}
        onMarkNotificationRead={markActivityRead}
        onMarkAllNotificationsRead={markAllNotificationsRead}
        onSettings={() => navigate('/settings')}
        openMenuId={openMenuId}
        onSetOpenMenuId={setOpenMenuId}
      />

      {/* Modal de confirmación para borrar página */}
      {deletePageConfirm && (
        <div className={styles.confirmOverlay} onClick={() => setDeletePageConfirm(null)}>
          <div className={styles.confirmBox} onClick={(e) => e.stopPropagation()}>
            <p className={styles.confirmText}>
              ¿Eliminar la página <strong>{pages.find((p) => p.id === deletePageConfirm)?.name}</strong>?
            </p>
            <p className={styles.confirmSubtext}>Esta acción no se puede deshacer.</p>
            <div className={styles.confirmActions}>
              <button className={styles.confirmCancelBtn} onClick={() => setDeletePageConfirm(null)}>Cancelar</button>
              <button className={styles.confirmDeleteBtn} onClick={() => deletePage(deletePageConfirm)}>Eliminar</button>
            </div>
          </div>
        </div>
      )}

      {tooltipState?.text && (
        <div
          className={styles.floatingTooltip}
          ref={(node) => setCssVars(node, { '--tooltip-x': tooltipState.x, '--tooltip-y': tooltipState.y })}
        >
          {tooltipState.text}
        </div>
      )}

      {/* ── BODY: 3 columnas ── */}
      <div className={styles.body}>
        {/* Sidebar izquierdo: secciones */}
        {projectType === 'page' ? (
          <SectionsPanel
            sections={derivedSections}
            topLevelH1s={topLevelH1s}
            onH1Click={handleH1Click}
            activeSectionId={activeSectionId}
            onSectionClick={handleSectionClick}
            onOpenAddSectionModal={() => openSectionModal(null)}
            onRename={renameSection}
            onDelete={deleteSection}
            onMoveSection={moveSection}
            canManageSections={canEditProjectStructure}
            activeHeading={activeHeading}
            onHeadingClick={handleHeadingClick}
            openMenuId={openMenuId}
            onSetOpenMenuId={setOpenMenuId}
            seoExpanded={seoExpanded}
            onSeoClick={handleSeoPanelClick}
          />
        ) : projectType === 'faq' ? (
          <FaqPanel
            sections={derivedSections}
            topLevelH1s={topLevelH1s}
            onH1Click={handleH1Click}
            activeSectionId={activeSectionId}
            onSectionClick={handleSectionClick}
            onOpenAddSectionModal={openFaqModal}
            onRename={renameSection}
            onDelete={deleteSection}
            onMoveSection={moveSection}
            canManageSections={canEditProjectStructure}
            activeHeading={activeHeading}
            onHeadingClick={handleHeadingClick}
            openMenuId={openMenuId}
            onSetOpenMenuId={setOpenMenuId}
            onExportCsv={() => exportFaqCsv(activePageForRead)}
          />
        ) : (
          <DocumentOutlinePanel
            items={documentOutline}
            activeHeading={activeHeading}
            onHeadingClick={handleDocumentHeadingClick}
            seoExpanded={seoExpanded}
            onSeoClick={handleSeoPanelClick}
          />
        )}

        {/* Área central: editor / handoff / preview */}
        {editorMode === 'brief' && (
          <EditorPanel
            projectId={projectId}
            projectType={projectType}
            activePageId={activePageId}
            initialContent={activePage?.fullContent || initialContentRef.current}
            seoMetadata={getPageSeoMetadata(activePage)}
            contentRules={getPageContentRules(activePage)}
            seoExpanded={seoExpanded}
            onSeoExpandedChange={setSeoExpanded}
            onSeoChange={updateActivePageSeo}
            onContentRulesChange={updateActivePageContentRules}
            ruleNotice={contentRuleNotice}
            onRuleNoticeChange={setContentRuleNotice}
            canEditContentRules={canEditContentRules}
            canManageSections={canEditProjectStructure}
            canWriteContent={canWriteContent}
            onUndo={() => editorRef.current?.chain().focus().undo().run()}
            onRedo={() => editorRef.current?.chain().focus().redo().run()}
            scrollRequest={scrollRequest}
            flashRequest={flashRequest}
            onDocUpdate={handleDocUpdate}
            onEditorReady={handleEditorReady}
            onScrollHeadingChange={handleScrollHeadingChange}
            onSelectionSectionChange={handleSelectionFocus}
            firstSectionId={derivedSections[0]?.id ?? ''}
            activeSectionId={activeSectionId}
            onOpenAddSectionAfter={(sectionId) => openSectionModal(sectionId)}
            sectionActivities={sectionReviewActivities.filter((item) => item.metadata?.pageId === activePageId)}
            selectedActivityId={selectedActivityId}
            onActivityMarkerClick={handleActivityMarkerClick}
          />
        )}

        {editorMode === 'handoff' && (
          <HandoffPanel
            projectId={projectId}
            page={activePageForRead}
            projectType={projectType}
            audience={handoffAudience}
            scrollRequest={scrollRequest}
            flashRequest={flashRequest}
            onScrollHeadingChange={handleScrollHeadingChange}
            selectedActivityId={selectedActivityId}
          />
        )}

        {editorMode === 'preview' && (
          <PreviewPanel
            page={activePageForRead}
            projectType={projectType}
            scrollRequest={scrollRequest}
            flashRequest={flashRequest}
            onScrollHeadingChange={handleScrollHeadingChange}
          />
        )}

        {/* Sidebar derecho: actualizaciones del documento */}
        <UpdatesPanel
          activity={activity}
          deliverables={deliverables}
          sections={derivedSections}
          activePage={activePage}
          activePageId={activePageId}
          projectType={projectType}
          contentRules={getPageContentRules(activePage)}
          canEditContentRules={canEditContentRules}
          onContentRulesChange={updateActivePageContentRules}
          selectedActivityId={selectedActivityId}
          error={panelError}
          notice={panelNotice}
          canManageProjectMeta={canManageProjectMeta}
          canReviewDesignerProposals={canReviewDesignerProposals}
          isDesigner={isDesigner}
          onRefresh={loadSidePanelData}
          shareUrl={shareUrl}
          onCreateShareLink={createShareLink}
          onCreateDeliverable={createDeliverable}
          onUpdateDeliverableStatus={updateDeliverableStatus}
          onApproveDesignerProposal={() => handleDesignerProposalDecision('accepted')}
          onRejectDesignerProposal={() => handleDesignerProposalDecision('rejected')}
          onActivityClick={navigateToActivity}
          onMarkActivityRead={markActivityRead}
          onNavigateToSection={navigateToSection}
          companyId={projectMeta?.companyId || ''}
          projectPages={pages}
        />
      </div>

      <FloatingEditorBar
        reviewStatus={activePage?.reviewStatus || 'draft'}
        onSendToReview={sendPageToReview}
        editorMode={editorMode}
        onEditorModeChange={(mode) => {
          if (!availableEditorModes.includes(mode)) return
          if (mode !== 'brief') {
            const snapshot = snapshotActivePage()
            if (snapshot) initialContentRef.current = snapshot.html
          }
          setEditorMode(mode)
        }}
        handoffAudience={handoffAudience}
        onHandoffAudienceChange={setHandoffAudience}
        canSendToReview={canSendToReview}
        availableModes={availableEditorModes}
        disabled={!pages.length}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Navbar — 3 columnas: [logo + undo/redo] | [pills] | [iconos + save]
// ---------------------------------------------------------------------------
function NotificationsBell({ notifications = [], onMarkRead, onMarkAllRead, onRefresh }) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    function handleDocClick(event) {
      if (!wrapRef.current?.contains(event.target)) setOpen(false)
    }
    function handleEsc(event) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handleDocClick)
    document.addEventListener('keydown', handleEsc)
    return () => {
      document.removeEventListener('mousedown', handleDocClick)
      document.removeEventListener('keydown', handleEsc)
    }
  }, [open])

  const isUnread = (item) => !item.metadata?.readAt && !item.readAt
  const unread = notifications.filter(isUnread)
  const unreadCount = unread.length

  function handleToggle() {
    setOpen((current) => {
      const next = !current
      if (next) onRefresh?.()
      return next
    })
  }

  function handleItemClick(item) {
    if (isUnread(item) && onMarkRead) onMarkRead(item.id)
  }

  return (
    <div ref={wrapRef} className={navStyles.notifWrap}>
      <button
        type="button"
        className={navStyles.navIconBtn}
        onClick={handleToggle}
        title={unreadCount > 0 ? `${unreadCount} notificaciones sin leer` : 'Notificaciones'}
      >
        <Bell size={20} color="#2a2a2a" />
        {unreadCount > 0 && <span className={navStyles.navBadge}>{unreadCount}</span>}
      </button>

      {open && (
        <div className={navStyles.notifDropdown} role="menu">
          <div className={navStyles.notifHeader}>
            <span className={navStyles.notifHeaderTitle}>Notificaciones</span>
            {unreadCount > 0 && (
              <button type="button" className={navStyles.notifMarkAll} onClick={onMarkAllRead}>
                Marcar todas
              </button>
            )}
          </div>
          {notifications.length === 0 ? (
            <p className={navStyles.notifEmpty}>Sin notificaciones por ahora.</p>
          ) : (
            <ul className={navStyles.notifList}>
              {notifications.slice(0, 20).map((item) => (
                <li
                  key={item.id}
                  className={cx(navStyles.notifItem, isUnread(item) && navStyles.notifItemUnread)}
                >
                  <button
                    type="button"
                    className={navStyles.notifItemBtn}
                    onClick={() => handleItemClick(item)}
                  >
                    <span className={navStyles.notifTitle}>{item.title}</span>
                    {(item.body || item.description) && (
                      <span className={navStyles.notifBody}>{item.body || item.description}</span>
                    )}
                    <span className={navStyles.notifMeta}>
                      {item.actorLabel ? `${item.actorLabel} · ` : ''}{formatPanelDate(item.createdAt)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

function Navbar({
  pages,
  activePageId,
  projectName,
  companyId,
  saveMessage,
  isDirty,
  isSaving,
  notifications = [],
  canManagePages = true,
  canRenameProject = true,
  canSave = true,
  onPageClick,
  onAddPage,
  onRenamePage,
  onRenameProject,
  onRequestDeletePage,
  onLogoClick,
  onBack,
  onSave,
  onRefreshNotifications,
  onMarkNotificationRead,
  onMarkAllNotificationsRead,
  onSettings,
  openMenuId,
  onSetOpenMenuId,
}) {
  const saveLabel = saveMessage || (isDirty ? 'Sin guardar' : 'Guardado')
  return (
    <div className={navStyles.navbar}>

      <div className={navStyles.navLeft}>
        <span className={navStyles.navLogo} onClick={onLogoClick}>
          <span className={navStyles.navLogoLight}>We</span>
          <span className={navStyles.navLogoBold}>Brief</span>
        </span>
        <button className={navStyles.navBackBtn} onClick={onBack} title={companyId ? 'Volver a la empresa' : 'Volver a empresas'}>
          <ArrowLeft size={18} />
        </button>
        <ProjectNameInput name={projectName} onRename={canRenameProject ? onRenameProject : null} />
      </div>

      {/* Columna central: Pills de páginas */}
      <div className={navStyles.navCenter}>
        {pages.map((page) => (
          <PagePill
            key={page.id}
            page={page}
            isActive={page.id === activePageId}
            canDelete={pages.length > 1}
            canManagePages={canManagePages}
            onClick={() => onPageClick(page.id)}
            onRename={(name) => onRenamePage(page.id, name)}
            onRequestDelete={() => onRequestDeletePage(page.id)}
            menuOpen={openMenuId === `page-${page.id}`}
            onOpenMenu={() => onSetOpenMenuId(`page-${page.id}`)}
            onCloseMenu={() => onSetOpenMenuId(null)}
          />
        ))}
        {canManagePages && (
          <button className={navStyles.navPillAdd} onClick={onAddPage} title="Agregar página">
            <Plus size={16} color="#2a2a2a" />
          </button>
        )}
      </div>

      {/* Columna derecha: Iconos + Save */}
      <div className={navStyles.navRight}>
        <span className={navStyles.navSaveStatus}>{saveLabel}</span>
        <button
          type="button"
          className={`${navStyles.navSaveBtn} ${isSaving ? navStyles.navSaveBtnDisabled : ''}`}
          onClick={onSave}
          disabled={isSaving || !canSave}
        >
          {isSaving ? 'Guardando...' : 'Guardar'}
        </button>
        <div className={navStyles.navIcons}>
          <button className={navStyles.navIconBtn} title="Ajustes de cuenta" onClick={onSettings}>
            <User size={20} color="#2a2a2a" />
          </button>
          <NotificationsBell
            notifications={notifications}
            onMarkRead={onMarkNotificationRead}
            onMarkAllRead={onMarkAllNotificationsRead}
            onRefresh={onRefreshNotifications}
          />
        </div>
      </div>

    </div>
  )
}

function ProjectNameInput({ name, onRename }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(name)

  useEffect(() => setDraft(name), [name])

  function commit() {
    setEditing(false)
    const next = draft.trim()
    if (next && next !== name) onRename?.(next)
    else setDraft(name)
  }

  if (editing) {
    return (
      <input
        className={navStyles.projectNameInput}
        value={draft}
        autoFocus
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') commit()
          if (event.key === 'Escape') {
            setDraft(name)
            setEditing(false)
          }
        }}
      />
    )
  }

  return (
    onRename ? (
      <button type="button" className={navStyles.projectNameBtn} onClick={() => setEditing(true)} title="Editar nombre del proyecto">
        {name}
      </button>
    ) : (
      <span className={navStyles.projectNameReadOnly}>{name}</span>
    )
  )
}

function FloatingEditorBar({
  reviewStatus = 'draft',
  onSendToReview,
  editorMode,
  onEditorModeChange,
  handoffAudience,
  onHandoffAudienceChange,
  availableModes = ['brief', 'handoff', 'preview'],
  canSendToReview = true,
  disabled,
}) {
  const modeOptions = [
    { id: 'brief', label: 'Brief', icon: FileText },
    { id: 'handoff', label: 'Handoff', icon: MousePointerClick },
    { id: 'preview', label: 'Preview', icon: Eye },
  ].filter((mode) => availableModes.includes(mode.id))

  return (
    <div className={styles.floatingBar} aria-label="Controles de editor">
      <div className={styles.floatingSegment} aria-label="Modo del editor">
        {modeOptions.map((mode) => {
          const Icon = mode.icon
          const active = editorMode === mode.id
          return (
            <button
              key={mode.id}
              type="button"
              className={cx(styles.floatingModeBtn, active && styles.floatingModeBtnActive)}
              onClick={() => onEditorModeChange(mode.id)}
            >
              <Icon size={14} />
              {mode.label}
            </button>
          )
        })}
      </div>

      {editorMode === 'handoff' && (
        <>
          <div className={styles.floatingDivider} />
          <div className={styles.floatingSegment} aria-label="Audiencia de handoff">
            <button
              type="button"
              className={cx(styles.floatingModeBtn, handoffAudience === 'designer' && styles.floatingModeBtnActive)}
              onClick={() => onHandoffAudienceChange('designer')}
            >
              <Palette size={14} />
              Designer
            </button>
            <button
              type="button"
              className={cx(styles.floatingModeBtn, handoffAudience === 'dev' && styles.floatingModeBtnActive)}
              onClick={() => onHandoffAudienceChange('dev')}
            >
              <Code2 size={14} />
              Dev
            </button>
          </div>
        </>
      )}
    </div>
  )
}

// Pill individual de página con menú contextual (renombrar / eliminar)
function PagePill({ page, isActive, canDelete, canManagePages = true, onClick, onRename, onRequestDelete, menuOpen, onOpenMenu, onCloseMenu }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(page.name)

  useEffect(() => { setDraft(page.name) }, [page.name])

  function commitRename() {
    setEditing(false)
    if (draft.trim() && draft.trim() !== page.name) onRename(draft.trim())
    else setDraft(page.name)
  }

  const wrapperClassName = `${navStyles.navPillWrapper} ${isActive ? navStyles.navPillWrapperActive : ''}`
  const pillClassName = `${isActive ? navStyles.navPillActive : navStyles.navPill} ${!canManagePages ? navStyles.navPillNoMenu : ''}`
  const inputClassName = `${navStyles.navPillInput} ${!canManagePages ? navStyles.navPillInputNoMenu : ''} ${isActive ? navStyles.navPillInputActive : navStyles.navPillInputInactive}`
  const menuButtonClassName = `${navStyles.navPillMenuBtn} ${isActive ? navStyles.navPillMenuBtnActive : navStyles.navPillMenuBtnInactive}`

  return (
    <div className={wrapperClassName}>
      {editing ? (
        <input
          className={cx(inputClassName, navStyles.navPillInputTransparent)}
          value={draft}
          autoFocus
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') { setDraft(page.name); setEditing(false) } }}
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <button
          className={pillClassName}
          onClick={onClick}
        >
          {page.name}
        </button>
      )}
      {canManagePages && (
        <button
          className={menuButtonClassName}
          onClick={(e) => { e.stopPropagation(); menuOpen ? onCloseMenu() : onOpenMenu() }}
          title="Opciones"
        >
          <MoreVertical size={14} />
        </button>
      )}
      {canManagePages && menuOpen && (
        <div className={navStyles.navPillMenu} onMouseLeave={onCloseMenu}>
          <div
            className={navStyles.navPillMenuItem}
            onClick={(e) => { e.stopPropagation(); onCloseMenu(); setEditing(true) }}
          >
            Renombrar
          </div>
          {canDelete && (
            <div
              className={navStyles.navPillMenuItemDanger}
              onClick={(e) => { e.stopPropagation(); onCloseMenu(); onRequestDelete() }}
            >
              Eliminar
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// AddFaqModal — modal centrado para crear una nueva pregunta frecuente
// ---------------------------------------------------------------------------
function AddFaqModal({ onConfirm, onSkip, onClose }) {
  const [value, setValue] = useState('')

  useEffect(() => {
    function handleKey(e) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <p className={styles.modalTitle}>Agregar pregunta frecuente</p>
        <textarea
          className={styles.modalTextarea}
          placeholder="Ej: ¿Cuánto tiempo tarda la entrega?"
          value={value}
          autoFocus
          rows={3}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              onConfirm(value.trim())
            }
          }}
        />
        <div className={styles.modalActions}>
          <button
            className={styles.modalBtnPrimary}
            onClick={() => onConfirm(value.trim())}
          >
            Agregar
          </button>
          <button className={styles.modalBtnSecondary} onClick={onSkip}>
            Saltar
          </button>
        </div>
      </div>
    </div>
  )
}

// AddSectionModal — modal centrado para nombrar una nueva sección
// ---------------------------------------------------------------------------
function AddSectionModal({ onConfirm, onSkip, onClose, projectType = 'page' }) {
  const [value, setValue] = useState('')
  const isFaq = projectType === 'faq'

  useEffect(() => {
    function handleKey(e) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <p className={styles.modalTitle}>{isFaq ? 'Pregunta frecuente' : 'Nombre de la sección'}</p>
        {isFaq ? (
          <textarea
            className={styles.modalTextarea}
            placeholder="Ej: ¿Qué incluye el servicio? (opcional)"
            value={value}
            autoFocus
            rows={3}
            onChange={(e) => setValue(e.target.value)}
          />
        ) : (
          <input
            className={styles.modalInput}
            type="text"
            placeholder="Ej: Hero, Servicios, Contacto…"
            value={value}
            autoFocus
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') onConfirm(value.trim()) }}
          />
        )}
        <div className={styles.modalActions}>
          <button
            className={styles.modalBtnPrimary}
            onClick={() => onConfirm(value.trim())}
          >
            Agregar
          </button>
          <button className={styles.modalBtnSecondary} onClick={onSkip}>
            Saltar
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// SectionsPanel — sidebar izquierdo con la lista de secciones
// ---------------------------------------------------------------------------
function SeoPanelButton({ active = false, onClick }) {
  return (
    <button
      type="button"
      className={cx(panelStyles.seoPanelButton, active && panelStyles.seoPanelButtonActive)}
      onClick={onClick}
    >
      <Search size={16} />
      <span>SEO metadata</span>
    </button>
  )
}

function DocumentOutlinePanel({ items = [], activeHeading, onHeadingClick, seoExpanded = false, onSeoClick }) {
  return (
    <div className={panelStyles.leftPanel}>
      <div className={panelStyles.panelHeader}>
        <span className={panelStyles.panelTitle}>Índice</span>
      </div>
      <SeoPanelButton active={seoExpanded} onClick={onSeoClick} />
      <div className={panelStyles.sectionList}>
        {items.map((item) => {
          const isActive = activeHeading?.sectionId === '__document__' && activeHeading?.headingIndex === item.headingIndex
          return (
            <button
              key={item.id}
              type="button"
              className={cx(isActive ? panelStyles.outlineItemActive : panelStyles.outlineItem, styles.outlineItemIndent)}
              ref={(node) => setCssVars(node, { '--outline-padding-left': 10 + ((item.level - 1) * 12) })}
              onClick={() => onHeadingClick?.(item.headingIndex)}
            >
              <span className={panelStyles.outlineTag}>H{item.level}</span>
              <span className={panelStyles.outlineText}>{item.text}</span>
            </button>
          )
        })}
        {items.length === 0 && (
          <p className={panelStyles.emptyMsg}>Usa H1, H2 o H3 para formar el índice.</p>
        )}
      </div>
    </div>
  )
}

function FaqPanel({ sections = [], topLevelH1s = [], onH1Click, activeSectionId, onSectionClick, onOpenAddSectionModal, onRename, onDelete, onMoveSection, canManageSections = true, activeHeading, onHeadingClick, openMenuId, onSetOpenMenuId, onExportCsv }) {
  const [dragIndex, setDragIndex] = useState(null)
  const [dropTargetIndex, setDropTargetIndex] = useState(null)

  function handleDragOver(e, index) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    const rect = e.currentTarget.getBoundingClientRect()
    const midY = rect.top + rect.height / 2
    setDropTargetIndex(e.clientY < midY ? index : index + 1)
  }

  function handleDrop(e) {
    e.preventDefault()
    if (dragIndex !== null && dropTargetIndex !== null) {
      const toIndex = dropTargetIndex > dragIndex ? dropTargetIndex - 1 : dropTargetIndex
      if (toIndex !== dragIndex) onMoveSection(dragIndex, toIndex)
    }
    setDragIndex(null)
    setDropTargetIndex(null)
  }

  function handleDragEnd() {
    setDragIndex(null)
    setDropTargetIndex(null)
  }

  return (
    <div className={panelStyles.leftPanel}>
      <div className={panelStyles.panelHeader}>
        <span className={panelStyles.panelTitle}>Preguntas frecuentes</span>
        <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          {canManageSections && (
            <button className={panelStyles.panelAddBtn} onClick={onOpenAddSectionModal} title="Agregar pregunta">
              <Plus size={24} color="#2a2a2a" />
            </button>
          )}
          <button className={panelStyles.panelAddBtn} onClick={onExportCsv} title="Exportar CSV">
            <Download size={20} color="#2a2a2a" />
          </button>
        </div>
      </div>
      <div className={panelStyles.sectionList} onDragOver={(e) => e.preventDefault()} onDrop={handleDrop}>
        {mergePanelItems(sections, topLevelH1s).map((item) => {
          if (item.kind === 'h1') {
            return (
              <H1Divider key={item.h1.id} text={item.h1.text} onClick={() => onH1Click?.(item.h1.h1Index)} />
            )
          }
          const section = item.section
          const i = item.sectionIndex
          return (
            <SectionItem
              key={section.id}
              index={i}
              section={{ ...section, name: section.headings?.[0]?.text || section.name }}
              subtitle={section.name}
              isActive={section.id === activeSectionId}
              onClick={() => onSectionClick(section.id)}
              onRename={(name) => onRename(section.id, name)}
              onDelete={() => onDelete(section.id)}
              headings={section.headings || []}
              sectionId={section.id}
              activeHeading={activeHeading}
              onHeadingClick={onHeadingClick}
              isDragging={dragIndex === i}
              showDropBefore={dropTargetIndex === i}
              showDropAfter={dropTargetIndex === i + 1 && i === sections.length - 1}
              canDrag={canManageSections && sections.length > 1}
              canManageSection={canManageSections}
              onDragStart={() => setDragIndex(i)}
              onDragEnd={handleDragEnd}
              onDragOver={(e) => handleDragOver(e, i)}
              menuOpen={openMenuId === `section-${section.id}`}
              onOpenMenu={() => onSetOpenMenuId(`section-${section.id}`)}
              onCloseMenu={() => onSetOpenMenuId(null)}
            />
          )
        })}
        {sections.length === 0 && topLevelH1s.length === 0 && (
          <p className={panelStyles.emptyMsg}>Sin preguntas. Agregá una con +</p>
        )}
      </div>
    </div>
  )
}

// Mezcla secciones y H1s top-level ordenados por docIndex (orden de aparición
// en el documento). Las secciones mantienen su índice original (sectionIndex)
// para que el drag-and-drop siga operando solo sobre secciones.
function mergePanelItems(sections, topLevelH1s) {
  const items = [
    ...sections.map((section, sectionIndex) => ({
      kind: 'section',
      section,
      sectionIndex,
      sortKey: section.docIndex ?? sectionIndex,
    })),
    ...topLevelH1s.map((h1) => ({
      kind: 'h1',
      h1,
      sortKey: h1.docIndex,
    })),
  ]
  items.sort((a, b) => a.sortKey - b.sortKey)
  return items
}

function H1Divider({ text, onClick }) {
  return (
    <button type="button" className={panelStyles.h1Divider} onClick={onClick} title={text}>
      <span className={panelStyles.h1DividerLine} aria-hidden="true" />
      <span className={panelStyles.h1DividerText}>{text}</span>
      <span className={panelStyles.h1DividerLine} aria-hidden="true" />
    </button>
  )
}

function SectionsPanel({ sections, topLevelH1s = [], onH1Click, activeSectionId, onSectionClick, onOpenAddSectionModal, onRename, onDelete, onMoveSection, canManageSections = true, activeHeading, onHeadingClick, openMenuId, onSetOpenMenuId, seoExpanded = false, onSeoClick }) {
  const [dragIndex, setDragIndex] = useState(null)
  const [dropTargetIndex, setDropTargetIndex] = useState(null)

  function handleDragOver(e, index) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    // Determine if cursor is in top or bottom half of the item
    const rect = e.currentTarget.getBoundingClientRect()
    const midY = rect.top + rect.height / 2
    const target = e.clientY < midY ? index : index + 1
    setDropTargetIndex(target)
  }

  function handleDrop(e) {
    e.preventDefault()
    if (dragIndex !== null && dropTargetIndex !== null) {
      const toIndex = dropTargetIndex > dragIndex ? dropTargetIndex - 1 : dropTargetIndex
      if (toIndex !== dragIndex) onMoveSection(dragIndex, toIndex)
    }
    setDragIndex(null)
    setDropTargetIndex(null)
  }

  function handleDragEnd() {
    setDragIndex(null)
    setDropTargetIndex(null)
  }

  return (
    <div className={panelStyles.leftPanel}>
      <div className={panelStyles.panelHeader}>
        <span className={panelStyles.panelTitle}>Page sections</span>
        {canManageSections && (
          <button className={panelStyles.panelAddBtn} onClick={onOpenAddSectionModal} title="Agregar sección">
            <Plus size={24} color="#2a2a2a" />
          </button>
        )}
      </div>
      <SeoPanelButton active={seoExpanded} onClick={onSeoClick} />
      <div className={panelStyles.sectionList} onDragOver={(e) => e.preventDefault()} onDrop={handleDrop}>
        {mergePanelItems(sections, topLevelH1s).map((item) => {
          if (item.kind === 'h1') {
            return (
              <H1Divider key={item.h1.id} text={item.h1.text} onClick={() => onH1Click?.(item.h1.h1Index)} />
            )
          }
          const section = item.section
          const i = item.sectionIndex
          return (
            <SectionItem
              key={section.id}
              index={i}
              section={section}
              isActive={section.id === activeSectionId}
              onClick={() => onSectionClick(section.id)}
              onRename={(name) => onRename(section.id, name)}
              onDelete={() => onDelete(section.id)}
              headings={section.headings || []}
              sectionId={section.id}
              activeHeading={activeHeading}
              onHeadingClick={onHeadingClick}
              isDragging={dragIndex === i}
              showDropBefore={dropTargetIndex === i}
              showDropAfter={dropTargetIndex === i + 1 && i === sections.length - 1}
              canDrag={canManageSections && sections.length > 1}
              canManageSection={canManageSections}
              onDragStart={() => setDragIndex(i)}
              onDragEnd={handleDragEnd}
              onDragOver={(e) => handleDragOver(e, i)}
              menuOpen={openMenuId === `section-${section.id}`}
              onOpenMenu={() => onSetOpenMenuId(`section-${section.id}`)}
              onCloseMenu={() => onSetOpenMenuId(null)}
            />
          )
        })}
        {sections.length === 0 && topLevelH1s.length === 0 && (
          <p className={panelStyles.emptyMsg}>Sin secciones. Agregá una con +</p>
        )}
      </div>
    </div>
  )
}

// Ítem de sección: nav-button (Tag + nombre + menú) + lista de headings
function SectionItem({ section, isActive, onClick, onRename, onDelete, headings = [], sectionId, activeHeading, onHeadingClick: onHeadingClickProp, index, isDragging, showDropBefore, showDropAfter, canDrag, canManageSection = true, onDragStart, onDragEnd, onDragOver, menuOpen, onOpenMenu, onCloseMenu, subtitle }) {

  // ── Scroll al heading correspondiente en el editor al hacer click ──
  function handleHeadingClick(e, index) {
    e.stopPropagation()
    onHeadingClickProp?.(sectionId, index)
  }

  const [editing, setEditing] = useState(false)
  const [draft, setDraft]     = useState(section.name)

  // Sync draft when section.name changes externally
  useEffect(() => { setDraft(section.name) }, [section.name])

  function commitRename() {
    setEditing(false)
    if (draft.trim()) onRename(draft.trim())
    else setDraft(section.name)
  }

  return (
    <div
      className={cx(panelStyles.sectionItem, styles.sectionDragState)}
      ref={(node) => setCssVars(node, { '--section-opacity': isDragging ? 0.4 : 1 })}
      onDragOver={onDragOver}
    >
      {showDropBefore && <div className={panelStyles.dropIndicator} />}
      <div
        className={isActive ? panelStyles.sectionNavBtnActive : panelStyles.sectionNavBtn}
        onClick={onClick}
      >
        <div className={panelStyles.sectionNavLeft}>
          {canDrag && (
            <div
              draggable
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = 'move'
                e.dataTransfer.setData('text/plain', String(index))
                // Custom drag ghost: grip + section name in bordered box
                const ghost = document.createElement('div')
                ghost.style.cssText = 'display:flex;align-items:center;gap:6px;padding:5px 12px;border:1px solid #e0e0e0;border-radius:6px;background:#fff;font-size:13px;color:#2a2a2a;font-family:sans-serif;position:absolute;top:-1000px;left:-1000px;white-space:nowrap;'
                ghost.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#999" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="19" r="1"/></svg><span>${section.name}</span>`
                document.body.appendChild(ghost)
                e.dataTransfer.setDragImage(ghost, 16, 16)
                requestAnimationFrame(() => document.body.removeChild(ghost))
                onDragStart()
              }}
              onDragEnd={onDragEnd}
              className={panelStyles.dragHandle}
            >
              <GripVertical size={16} color="#999" />
            </div>
          )}
          <Tag size={18} color="#2a2a2a" strokeWidth={1.8} />
          {editing ? (
            <input
              className={panelStyles.sectionNameInput}
              value={draft}
              autoFocus
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => { if (e.key === 'Enter') commitRename() }}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <div className={panelStyles.sectionNameWrap}>
              <span
                className={panelStyles.sectionName}
                onDoubleClick={(e) => {
                  if (!canManageSection) return
                  e.stopPropagation()
                  setEditing(true)
                }}
              >
                {section.name}
              </span>
              {subtitle && (
                <span className={panelStyles.sectionSubtitle}>{subtitle}</span>
              )}
            </div>
          )}
        </div>

        <div className={panelStyles.menuWrap}>
          {canManageSection && (
            <button
              className={panelStyles.menuBtn}
              onClick={(e) => { e.stopPropagation(); menuOpen ? onCloseMenu() : onOpenMenu() }}
              title="Opciones"
            >
              <MoreVertical size={24} color="#2a2a2a" />
            </button>
          )}
          {canManageSection && menuOpen && (
            <div className={panelStyles.menu} onMouseLeave={onCloseMenu}>
              <div className={panelStyles.menuItem} onClick={(e) => { e.stopPropagation(); onCloseMenu(); setEditing(true) }}>
                Renombrar
              </div>
              <div className={cx(panelStyles.menuItem, panelStyles.menuItemDanger)} onClick={(e) => { e.stopPropagation(); onCloseMenu(); onDelete() }}>
                Eliminar
              </div>
            </div>
          )}
        </div>
      </div>

      {headings.length > 0 && (
        <div className={panelStyles.sectionContent}>
          {headings.map((h, i) => {
            const isHeadingActive =
              activeHeading?.sectionId === sectionId &&
              activeHeading?.headingIndex === i
            return (
              <div
                key={i}
                className={cx(panelStyles.sectionHeadingItem, isHeadingActive && panelStyles.sectionHeadingItemActive)}
                onClick={(e) => handleHeadingClick(e, i)}
              >
                <span
                  className={cx(
                    panelStyles.sectionHeadingText,
                    h.tag === 'h1' ? panelStyles.sectionHeadingTextLevel1 : panelStyles.sectionHeadingTextNested,
                  )}
                >
                  {h.text}
                </span>
              </div>
            )
          })}
        </div>
      )}
      {showDropAfter && <div className={panelStyles.dropIndicator} />}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Helper — determina la etiqueta de tipo para un elemento DOM de bloque
// ---------------------------------------------------------------------------
function getBlockLabel(el) {
  const tag = el.tagName?.toLowerCase()
  if (tag === 'h1') return 'H1'
  if (tag === 'h2') return 'H2'
  if (tag === 'h3') return 'H3'
  if (tag === 'h4') return 'H4'
  if (tag === 'h5') return 'H5'
  if (tag === 'h6') return 'H6'
  if (tag === 'ul') return 'ul'
  if (tag === 'ol') return 'ol'
  if (tag === 'div' && el.hasAttribute?.('data-cta-button') || el.querySelector?.('[data-cta-button]')) return 'CTA'
  if (tag === 'table' || tag === 'div' && el.querySelector?.('table')) return 't'
  if (tag === 'figure' || tag === 'img' || el.querySelector?.('img')) return 'img'
  return '¶'
}

// ---------------------------------------------------------------------------
// TypeLabelsColumn — columna de etiquetas de tipo alineadas con cada bloque
// ---------------------------------------------------------------------------
function TypeLabelsColumn({ wrapperRef, editor }) {
  const columnRef = useRef(null)
  const dropdownRef = useRef(null)
  const [labels, setLabels]   = useState([])
  const [openIdx, setOpenIdx] = useState(-1)

  function rebuild() {
    const wrapper = wrapperRef.current
    const column = columnRef.current
    if (!wrapper || !column) return
    const pm = wrapper.querySelector('.ProseMirror')
    if (!pm) return

    const blocks = Array.from(pm.children)
      .filter((block) => {
        // Skip section divider NodeViews
        if (block.hasAttribute?.('data-section-divider')) return false
        if (block.querySelector?.('[data-section-divider]')) return false
        return true
      })

    const visibleBlocks = blocks.filter((block) => {
      const label = getBlockLabel(block)
      return Boolean(block.textContent?.trim()) || ['img', 't', 'CTA'].includes(label)
    })

    setLabels(
      visibleBlocks.map((block) => ({
        top: block.getBoundingClientRect().top - column.getBoundingClientRect().top,
        label: getBlockLabel(block),
        blockEl: block,
      }))
    )
  }

  useEffect(() => {
    rebuild()
    const t = setTimeout(rebuild, 50)

    const wrapper = wrapperRef.current
    if (!wrapper) return () => clearTimeout(t)
    const pm = wrapper.querySelector('.ProseMirror')
    if (!pm) return () => clearTimeout(t)

    const mutObs = new MutationObserver(rebuild)
    mutObs.observe(pm, { childList: true, subtree: true, characterData: true })

    const resObs = new ResizeObserver(rebuild)
    resObs.observe(pm)

    return () => {
      clearTimeout(t)
      mutObs.disconnect()
      resObs.disconnect()
    }
  }, [editor])

  useEffect(() => {
    if (openIdx === -1) return undefined

    function handlePointerDown(event) {
      if (dropdownRef.current?.contains(event.target)) return
      if (columnRef.current?.contains(event.target)) {
        const trigger = event.target.closest?.(`.${styles.typeLabelBtn}`)
        if (trigger) return
      }
      setOpenIdx(-1)
    }

    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [openIdx])

  function applyType(opt, blockEl, currentLabel) {
    if (!editor) return
    try {
      const isList = currentLabel === 'ul' || currentLabel === 'ol'

      if (isList && (opt === 'ul' || opt === 'ol')) {
        // Change list type by swapping the node type directly via ProseMirror
        const resolvedPos = editor.view.posAtDOM(blockEl, 0)
        const $pos = editor.state.doc.resolve(resolvedPos)
        let listDepth = $pos.depth
        while (listDepth > 0) {
          const node = $pos.node(listDepth)
          if (node.type.name === 'bulletList' || node.type.name === 'orderedList') break
          listDepth--
        }
        if (listDepth > 0) {
          const listPos = $pos.before(listDepth)
          const targetType = opt === 'ol' ? 'orderedList' : 'bulletList'
          const newType = editor.state.schema.nodes[targetType]
          if (newType) {
            const { tr } = editor.state
            tr.setNodeMarkup(listPos, newType)
            editor.view.dispatch(tr)
          }
        }
      } else {
        const pos = editor.view.posAtDOM(blockEl, 0)
        editor.chain().focus().setTextSelection(pos).run()

        if (opt === 'paragraph') {
          editor.chain().setParagraph().run()
        } else {
          const level = parseInt(opt.replace('H', ''))
          editor.chain().setHeading({ level }).run()
        }
      }
    } catch (err) {
      console.warn('TypeLabel: no se pudo cambiar el tipo:', err)
    }
    setOpenIdx(-1)
  }

  const TEXT_OPTIONS = ['H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'Párrafo']
  const LIST_OPTIONS = ['ul', 'ol']

  function getOptionsForLabel(label) {
    if (label === 'ul' || label === 'ol') return LIST_OPTIONS
    return TEXT_OPTIONS
  }

  return (
    <div ref={columnRef} className={styles.typeLabelsCol}>
      {labels.map((item, idx) => (
        <div
          key={idx}
          className={styles.typeLabelItem}
          ref={(node) => setCssVars(node, { '--type-label-top': item.top })}
        >
          <button
            className={cx(styles.typeLabelBtn, ['t', 'img', 'CTA'].includes(item.label) && styles.typeLabelBtnDisabled)}
            onClick={(e) => { e.stopPropagation(); if (['t', 'img', 'CTA'].includes(item.label)) return; setOpenIdx(idx === openIdx ? -1 : idx) }}
            title={`Tipo actual: ${item.label}`}
          >
            {item.label}
          </button>

          {openIdx === idx && !['t', 'img', 'CTA'].includes(item.label) && (
            <div ref={dropdownRef} className={styles.typeLabelDropdown}>
              {getOptionsForLabel(item.label).filter((opt) => {
                if (item.label === '¶') return opt !== 'Párrafo'
                return opt !== item.label
              }).map((opt) => (
                <div
                  key={opt}
                  className={styles.typeLabelOption}
                  onClick={() => applyType(opt === 'Párrafo' ? 'paragraph' : opt, item.blockEl, item.label)}
                >
                  {opt}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function SectionActivityMarkers({ wrapperRef, editor, activities = [], selectedActivityId = null, onMarkerClick }) {
  const columnRef = useRef(null)
  const [markers, setMarkers] = useState([])

  function rebuild() {
    const wrapper = wrapperRef.current
    const column = columnRef.current
    if (!wrapper || !column) return

    const pm = wrapper.querySelector('.ProseMirror')
    if (!pm) return

    setMarkers(
      activities.map((activityItem) => {
        const sectionId = activityItem.metadata?.sectionId
        if (!sectionId) return null

        const divider = pm.querySelector(`[data-section-id="${sectionId}"]`)
        if (!divider) return null

        return {
          id: activityItem.id,
          title: activityItem.title,
          description: activityItem.description || formatActivityChangeTypes(activityItem.metadata?.changeTypes || []),
          top: divider.getBoundingClientRect().top - column.getBoundingClientRect().top + 2,
        }
      }).filter(Boolean)
    )
  }

  useEffect(() => {
    rebuild()
    const timeoutId = setTimeout(rebuild, 50)

    const wrapper = wrapperRef.current
    if (!wrapper) return () => clearTimeout(timeoutId)
    const pm = wrapper.querySelector('.ProseMirror')
    if (!pm) return () => clearTimeout(timeoutId)

    const mutationObserver = new MutationObserver(rebuild)
    mutationObserver.observe(pm, { childList: true, subtree: true, characterData: true })

    const resizeObserver = new ResizeObserver(rebuild)
    resizeObserver.observe(pm)

    return () => {
      clearTimeout(timeoutId)
      mutationObserver.disconnect()
      resizeObserver.disconnect()
    }
  }, [editor, activities])

  return (
    <div ref={columnRef} className={styles.activityMarkersCol} aria-label="Alertas de revisión por sección">
      {markers.map((marker) => (
        <button
          key={marker.id}
          type="button"
          className={cx(styles.activityMarkerBtn, marker.id === selectedActivityId && styles.activityMarkerBtnActive)}
          ref={(node) => setCssVars(node, { '--activity-marker-top': marker.top })}
          title={`${marker.title}${marker.description ? `: ${marker.description}` : ''}`}
          onClick={() => onMarkerClick?.(marker.id)}
        >
          <Bell size={13} />
        </button>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Toolbar — barra de herramientas compartida
// ---------------------------------------------------------------------------
function Toolbar({ editor, projectId, onUndo, onRedo }) {
  const toolbarRef = useRef(null)
  const [, forceUpdate] = useState(0)
  const [openToolbarMenu, setOpenToolbarMenu] = useState(null)

  useEffect(() => {
    if (!editor) return
    const handler = () => forceUpdate((n) => n + 1)
    editor.on('transaction', handler)
    return () => editor.off('transaction', handler)
  }, [editor])

  useEffect(() => {
    if (!openToolbarMenu) return undefined

    function handlePointerDown(event) {
      if (toolbarRef.current?.contains(event.target)) return
      setOpenToolbarMenu(null)
    }

    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [openToolbarMenu])

  async function handleImageUpload(e) {
    const file = e.target.files?.[0]
    if (!file || !editor) return
    const tempUrl = URL.createObjectURL(file)
    try {
      if (!projectId) throw new Error('Proyecto no disponible')
      insertTemporaryImage(editor, tempUrl, file.name)
      const formData = new FormData()
      formData.append('file', file)
      const data = await apiFetch(`/api/projects/${projectId}/assets`, {
        method: 'POST',
        body: formData,
      })

      if (!data.asset?.renderInline || !data.asset?.publicUrl) {
        throw new Error('El archivo quedó guardado como adjunto. Los SVG no se insertan inline por seguridad.')
      }

      await replaceImageSrc(editor, tempUrl, data.asset.publicUrl, {
        assetId: data.asset.id || null,
        fileName: data.asset.fileName || file.name,
        storagePath: data.asset.path || null,
        originalWidth: data.asset.width || null,
        originalHeight: data.asset.height || null,
      })
    } catch (error) {
      removeImageBySrc(editor, tempUrl)
      window.alert(error.message || 'No se pudo subir la imagen')
    } finally {
      URL.revokeObjectURL(tempUrl)
      e.target.value = ''
    }
  }

  function handleLink() {
    if (!editor) return
    const url = window.prompt('URL del enlace:')
    if (!url) return
    editor.chain().focus().setLink({ href: url }).run()
  }

  function handleCtaInsert() {
    if (!editor) return
    const text = window.prompt('Texto del CTA:', 'Ver catálogo')
    if (text === null) return
    const url = window.prompt('URL del CTA:', 'https://')
    if (url === null) return
    editor.chain().focus().insertContent({
      type: 'ctaButton',
      attrs: {
        ctaText: text.trim() || 'Ver más',
        ctaUrl: url.trim(),
      },
    }).run()
  }

  function getActiveBlockType() {
    if (!editor) return 'paragraph'
    for (let i = 1; i <= 6; i++) {
      if (editor.isActive('heading', { level: i })) return String(i)
    }
    return 'paragraph'
  }

  function applyBlockType(value) {
    if (!editor) return
    if (value === 'paragraph') {
      editor.chain().focus().setParagraph().run()
    } else {
      editor.chain().focus().setHeading({ level: parseInt(value) }).run()
    }
    setOpenToolbarMenu(null)
  }

  function getActiveBlockSpacing() {
    if (!editor) return ''
    return editor.getAttributes('paragraph')?.textBlockLayout?.blockSpacing
      || editor.getAttributes('heading')?.textBlockLayout?.blockSpacing
      || editor.getAttributes('listItem')?.textBlockLayout?.blockSpacing
      || ''
  }

  function getActiveAlignment() {
    if (!editor) return 'left'
    if (editor.isActive({ textAlign: 'center' })) return 'center'
    if (editor.isActive({ textAlign: 'right' })) return 'right'
    if (editor.isActive({ textAlign: 'justify' })) return 'justify'
    return 'left'
  }

  function getAlignmentIcon(alignment = getActiveAlignment()) {
    if (alignment === 'center') return <AlignCenter size={16} />
    if (alignment === 'right') return <AlignRight size={16} />
    if (alignment === 'justify') return <AlignJustify size={16} />
    return <AlignLeft size={16} />
  }

  function updateSelectedTextBlockLayout(updater) {
    if (!editor) return
    editor.commands.focus()

    const { state, view } = editor
    const { selection } = state
    const targets = new Map()

    if (selection.empty) {
      let fallbackTarget = null
      for (let depth = selection.$from.depth; depth > 0; depth -= 1) {
        const node = selection.$from.node(depth)
        if (node.type.name === 'listItem') {
          targets.set(selection.$from.before(depth), node)
          break
        }
        if (!fallbackTarget && TEXT_BLOCK_LAYOUT_TYPES.includes(node.type.name)) {
          fallbackTarget = { pos: selection.$from.before(depth), node }
        }
      }
      if (targets.size === 0 && fallbackTarget) {
        targets.set(fallbackTarget.pos, fallbackTarget.node)
      }
    } else {
      state.doc.nodesBetween(selection.from, selection.to, (node, pos) => {
        if (!TEXT_BLOCK_LAYOUT_TYPES.includes(node.type.name)) return true
        targets.set(pos, node)
        return node.type.name !== 'listItem'
      })
    }

    if (targets.size === 0) return

    let tr = state.tr
    let changed = false
    targets.forEach((node, pos) => {
      const currentLayout = normalizeTextBlockLayout(node.attrs.textBlockLayout) || {}
      const nextLayout = normalizeTextBlockLayout(updater(currentLayout))
      const currentSignature = JSON.stringify(normalizeTextBlockLayout(node.attrs.textBlockLayout) || {})
      const nextSignature = JSON.stringify(nextLayout || {})
      if (currentSignature === nextSignature) return
      tr = tr.setNodeMarkup(pos, undefined, { ...node.attrs, textBlockLayout: nextLayout })
      changed = true
    })

    if (changed) view.dispatch(tr.scrollIntoView())
  }

  function applyBlockSpacing(value) {
    updateSelectedTextBlockLayout((layout) => ({
      ...layout,
      blockSpacing: value || null,
    }))
    setOpenToolbarMenu(null)
  }

  function applyIndent(delta) {
    if (!editor) return

    updateSelectedTextBlockLayout((layout) => ({
      ...layout,
      indentLevel: Math.max(0, Math.min(8, (Number(layout.indentLevel) || 0) + delta)),
    }))
  }

  const disabled = !editor
  const activeBlockType = getActiveBlockType()
  const activeAlignment = getActiveAlignment()
  const blockOptions = [
    { value: 'paragraph', label: 'Párrafo' },
    ...[1, 2, 3, 4, 5, 6].map((level) => ({ value: String(level), label: `H${level}` })),
  ]
  const alignmentOptions = [
    { value: 'left', label: 'Izquierda', icon: <AlignLeft size={16} /> },
    { value: 'center', label: 'Centro', icon: <AlignCenter size={16} /> },
    { value: 'right', label: 'Derecha', icon: <AlignRight size={16} /> },
    { value: 'justify', label: 'Justificado', icon: <AlignJustify size={16} /> },
  ]

  return (
    <div
      ref={toolbarRef}
      className={toolbarStyles.toolbar}
      onPointerDownCapture={(event) => {
        if (!openToolbarMenu) return
        if (event.target.closest?.('[data-toolbar-menu]')) return
        setOpenToolbarMenu(null)
      }}
    >
      <ToolBtn
        disabled={disabled}
        onClick={onUndo}
        title="Deshacer (Ctrl+Z)"
      ><Undo2 size={16} /></ToolBtn>

      <ToolBtn
        disabled={disabled}
        onClick={onRedo}
        title="Rehacer (Ctrl+Y)"
      ><Redo2 size={16} /></ToolBtn>

      <div className={toolbarStyles.separator} />

      <div className={toolbarStyles.menu} data-toolbar-menu="">
        <button
          type="button"
          className={cx(
            toolbarStyles.blockSelectButton,
            disabled && toolbarStyles.blockSelectButtonDisabled,
          )}
          disabled={disabled}
          onClick={() => setOpenToolbarMenu((value) => value === 'block' ? null : 'block')}
          title="Estilo de texto"
        >
          <span>{blockOptions.find((option) => option.value === activeBlockType)?.label || 'Párrafo'}</span>
          <ChevronDown size={12} />
        </button>
        {openToolbarMenu === 'block' && (
          <div className={cx(toolbarStyles.dropdown, toolbarStyles.dropdownBlock)}>
            {blockOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                className={cx(
                  toolbarStyles.dropdownItem,
                  activeBlockType === option.value && toolbarStyles.dropdownItemActive,
                )}
                onClick={() => applyBlockType(option.value)}
              >
                <span>{option.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className={toolbarStyles.separator} />

      <ToolBtn
        active={editor?.isActive('bold')}
        disabled={disabled}
        onClick={() => editor?.chain().focus().toggleBold().run()}
        title="Negrita (Ctrl+B)"
      ><b>B</b></ToolBtn>

      <ToolBtn
        active={editor?.isActive('italic')}
        disabled={disabled}
        onClick={() => editor?.chain().focus().toggleItalic().run()}
        title="Cursiva (Ctrl+I)"
      ><i>I</i></ToolBtn>

      <ToolBtn
        active={editor?.isActive('underline')}
        disabled={disabled}
        onClick={() => editor?.chain().focus().toggleUnderline().run()}
        title="Subrayado (Ctrl+U)"
      ><u>U</u></ToolBtn>

      <ToolBtn
        active={editor?.isActive('strike')}
        disabled={disabled}
        onClick={() => editor?.chain().focus().toggleStrike().run()}
        title="Tachado (Ctrl+Shift+X)"
      ><Strikethrough size={16} /></ToolBtn>

      <div className={toolbarStyles.separator} />

      <label
        className={cx(
          toolbarStyles.toolLabel,
          toolbarStyles.toolLabelRelative,
          disabled && toolbarStyles.toolLabelDisabled,
        )}
        title="Color de texto"
      >
        <span className={toolbarStyles.colorTrigger}>
          <Palette size={14} />
          <span className={toolbarStyles.textColorSample}>A</span>
        </span>
        <input
          type="color"
          className={cx(toolbarStyles.colorInput, disabled && toolbarStyles.colorInputDisabled)}
          onChange={(e) => editor?.chain().focus().setColor(e.target.value).run()}
        />
      </label>

      <label
        className={cx(
          toolbarStyles.toolLabel,
          toolbarStyles.toolLabelRelative,
          disabled && toolbarStyles.toolLabelDisabled,
        )}
        title="Color de resaltado"
      >
        <span className={toolbarStyles.highlightSample}>H</span>
        <input
          type="color"
          className={cx(toolbarStyles.colorInput, disabled && toolbarStyles.colorInputDisabled)}
          defaultValue="#fef08a"
          onChange={(e) => editor?.chain().focus().setHighlight({ color: e.target.value }).run()}
        />
      </label>

      <div className={toolbarStyles.separator} />

      <div className={toolbarStyles.menu} data-toolbar-menu="">
        <ToolBtn
          active={openToolbarMenu === 'align'}
          disabled={disabled}
          onClick={() => setOpenToolbarMenu((value) => value === 'align' ? null : 'align')}
          title="Alineación"
        >
          {getAlignmentIcon(activeAlignment)}
          <ChevronDown size={12} />
        </ToolBtn>
        {openToolbarMenu === 'align' && (
          <div className={toolbarStyles.dropdown}>
            {alignmentOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                className={cx(
                  toolbarStyles.dropdownItem,
                  activeAlignment === option.value && toolbarStyles.dropdownItemActive,
                )}
                onClick={() => {
                  editor?.chain().focus().setTextAlign(option.value).run()
                  setOpenToolbarMenu(null)
                }}
              >
                {option.icon}
                <span>{option.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className={toolbarStyles.menu} data-toolbar-menu="">
        <ToolBtn
          active={openToolbarMenu === 'spacing'}
          disabled={disabled}
          onClick={() => setOpenToolbarMenu((value) => value === 'spacing' ? null : 'spacing')}
          title="Interlineado y espacio de párrafo"
        >
          <ListCollapse size={16} />
          <ChevronDown size={12} />
        </ToolBtn>
        {openToolbarMenu === 'spacing' && (
          <div className={toolbarStyles.dropdown}>
            <button
              type="button"
              className={cx(
                toolbarStyles.dropdownItem,
                getActiveBlockSpacing() === '' && toolbarStyles.dropdownItemActive,
              )}
              onClick={() => applyBlockSpacing('')}
            >
              <ListCollapse size={16} />
              <span>Predeterminado</span>
            </button>
            {Object.entries(BLOCK_SPACING_PRESETS).map(([key, preset]) => (
              <button
                key={key}
                type="button"
                className={cx(
                  toolbarStyles.dropdownItem,
                  getActiveBlockSpacing() === key && toolbarStyles.dropdownItemActive,
                )}
                onClick={() => applyBlockSpacing(key)}
              >
                <ListCollapse size={16} />
                <span>{preset.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <ToolBtn
        disabled={disabled}
        onClick={() => applyIndent(-1)}
        title="Disminuir sangría"
      ><IndentDecrease size={16} /></ToolBtn>

      <ToolBtn
        disabled={disabled}
        onClick={() => applyIndent(1)}
        title="Aumentar sangría"
      ><IndentIncrease size={16} /></ToolBtn>

      <div className={toolbarStyles.separator} />

      <ToolBtn
        active={editor?.isActive('bulletList')}
        disabled={disabled}
        onClick={() => editor?.chain().focus().toggleBulletList().run()}
        title="Lista sin orden"
      ><List size={16} /></ToolBtn>

      <ToolBtn
        active={editor?.isActive('orderedList')}
        disabled={disabled}
        onClick={() => editor?.chain().focus().toggleOrderedList().run()}
        title="Lista ordenada"
      ><ListOrdered size={16} /></ToolBtn>

      <ToolBtn
        active={editor?.isActive('blockquote')}
        disabled={disabled}
        onClick={() => editor?.chain().focus().toggleBlockquote().run()}
        title="Cita"
      ><Quote size={16} /></ToolBtn>

      <div className={toolbarStyles.separator} />

      <TableGridPicker
        disabled={disabled}
        open={openToolbarMenu === 'table'}
        onToggle={() => setOpenToolbarMenu((value) => value === 'table' ? null : 'table')}
        onClose={() => setOpenToolbarMenu(null)}
        onInsert={(rows, cols) => editor?.chain().focus().insertTable({ rows, cols, withHeaderRow: true }).run()}
      />

      <div className={toolbarStyles.separator} />

      <ToolBtn
        active={editor?.isActive('link')}
        disabled={disabled}
        onClick={handleLink}
        title="Insertar enlace"
      >🔗</ToolBtn>

      <ToolBtn
        active={editor?.isActive('ctaButton')}
        disabled={disabled}
        onClick={handleCtaInsert}
        title="Insertar CTA/button"
      ><MousePointerClick size={16} /></ToolBtn>

      <label
        className={cx(toolbarStyles.toolLabel, disabled && toolbarStyles.toolLabelDisabled)}
        title="Insertar imagen"
      >
        🖼
        <input
          type="file"
          accept="image/*"
          className={toolbarStyles.hiddenFileInput}
          onChange={handleImageUpload}
          disabled={disabled}
        />
      </label>

    </div>
  )
}

function ToolBtn({ children, active, disabled, onClick, title }) {
  return (
    <button
      type="button"
      className={cx(
        toolbarStyles.toolBtn,
        active && toolbarStyles.toolBtnActive,
        disabled && toolbarStyles.toolBtnDisabled,
      )}
      onClick={disabled ? undefined : onClick}
      title={title}
    >
      {children}
    </button>
  )
}

// Grid picker para insertar tablas con dimensiones personalizadas
function TableGridPicker({ disabled, open, onToggle, onClose, onInsert }) {
  const [hover, setHover] = useState({ r: 0, c: 0 })
  const maxRows = 8
  const maxCols = 8

  return (
    <div className={toolbarStyles.tablePickerWrapper} data-toolbar-menu="">
      <ToolBtn active={open} disabled={disabled} onClick={onToggle} title="Insertar tabla">
        <TableIcon size={16} />
      </ToolBtn>
      {open && (
        <div
          className={toolbarStyles.tablePickerDropdown}
          onMouseLeave={() => setHover({ r: 0, c: 0 })}
        >
          <div className={toolbarStyles.tablePickerLabel}>
            {hover.r > 0 ? `${hover.r} × ${hover.c}` : 'Elegir tamaño'}
          </div>
          <div className={toolbarStyles.tablePickerGrid}>
            {Array.from({ length: maxRows }, (_, r) => (
              <div key={r} className={toolbarStyles.tablePickerGridRow}>
                {Array.from({ length: maxCols }, (_, c) => (
                  <div
                    key={c}
                    onMouseEnter={() => setHover({ r: r + 1, c: c + 1 })}
                    onClick={() => { onInsert(r + 1, c + 1); onClose?.(); setHover({ r: 0, c: 0 }) }}
                    className={cx(
                      toolbarStyles.tablePickerCell,
                      r < hover.r && c < hover.c && toolbarStyles.tablePickerCellActive,
                    )}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// Barra contextual para operaciones de tabla (solo visible cuando cursor está en tabla)
function TableContextBar({ editor }) {
  const [, forceUpdate] = useState(0)

  useEffect(() => {
    if (!editor) return
    const handler = () => forceUpdate((n) => n + 1)
    editor.on('transaction', handler)
    return () => editor.off('transaction', handler)
  }, [editor])

  if (!editor || !editor.isActive('table')) return null

  return (
    <div className={styles.tableContextBar}>
      <ToolBtn onClick={() => editor.chain().focus().addColumnBefore().run()} title="Columna antes">
        <Columns3 size={14} /><span className={styles.tableCtxLabel}>+ Izq</span>
      </ToolBtn>
      <ToolBtn onClick={() => editor.chain().focus().addColumnAfter().run()} title="Columna después">
        <Columns3 size={14} /><span className={styles.tableCtxLabel}>+ Der</span>
      </ToolBtn>
      <ToolBtn onClick={() => editor.chain().focus().deleteColumn().run()} title="Eliminar columna">
        <Columns3 size={14} /><span className={cx(styles.tableCtxLabel, styles.tableCtxLabelDanger)}>−</span>
      </ToolBtn>

      <div className={styles.toolbarSep} />

      <ToolBtn onClick={() => editor.chain().focus().addRowBefore().run()} title="Fila antes">
        <Rows3 size={14} /><span className={styles.tableCtxLabel}>+ Arriba</span>
      </ToolBtn>
      <ToolBtn onClick={() => editor.chain().focus().addRowAfter().run()} title="Fila después">
        <Rows3 size={14} /><span className={styles.tableCtxLabel}>+ Abajo</span>
      </ToolBtn>
      <ToolBtn onClick={() => editor.chain().focus().deleteRow().run()} title="Eliminar fila">
        <Rows3 size={14} /><span className={cx(styles.tableCtxLabel, styles.tableCtxLabelDanger)}>−</span>
      </ToolBtn>

      <div className={styles.toolbarSep} />

      <ToolBtn onClick={() => editor.chain().focus().deleteTable().run()} title="Eliminar tabla">
        <Trash2 size={14} color="#ef4444" />
      </ToolBtn>
    </div>
  )
}

// Menú contextual (click derecho) para tablas
function TableRightClickMenu({ editor }) {
  const [menu, setMenu] = useState(null) // { x, y }

  useEffect(() => {
    if (!editor) return
    const dom = editor.view.dom

    function handleContextMenu(e) {
      // Only show if cursor is inside a table
      if (!editor.isActive('table')) return
      e.preventDefault()
      // Find the position:relative wrapper that contains us
      let wrapper = dom.parentElement
      while (wrapper && wrapper.style.position !== 'relative') {
        wrapper = wrapper.parentElement
      }
      if (!wrapper) wrapper = dom.parentElement
      const rect = wrapper.getBoundingClientRect()
      setMenu({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      })
    }

    function handleClick() { setMenu(null) }

    dom.addEventListener('contextmenu', handleContextMenu)
    document.addEventListener('click', handleClick)
    return () => {
      dom.removeEventListener('contextmenu', handleContextMenu)
      document.removeEventListener('click', handleClick)
    }
  }, [editor])

  if (!menu) return null

  const items = [
    { label: 'Columna a la izquierda', action: () => editor.chain().focus().addColumnBefore().run() },
    { label: 'Columna a la derecha', action: () => editor.chain().focus().addColumnAfter().run() },
    { label: 'Eliminar columna', action: () => editor.chain().focus().deleteColumn().run(), danger: true },
    { divider: true },
    { label: 'Fila arriba', action: () => editor.chain().focus().addRowBefore().run() },
    { label: 'Fila abajo', action: () => editor.chain().focus().addRowAfter().run() },
    { label: 'Eliminar fila', action: () => editor.chain().focus().deleteRow().run(), danger: true },
    { divider: true },
    { label: 'Eliminar tabla', action: () => editor.chain().focus().deleteTable().run(), danger: true },
  ]

  return (
    <div
      className={styles.tableCtxMenu}
      ref={(node) => setCssVars(node, { '--table-menu-left': menu.x, '--table-menu-top': menu.y })}
      onClick={(e) => e.stopPropagation()}
    >
      {items.map((item, i) =>
        item.divider
          ? <div key={i} className={styles.tableCtxMenuDivider} />
          : <div
              key={i}
              className={cx(styles.tableCtxMenuItem, item.danger && styles.tableCtxMenuItemDanger)}
              onClick={() => { item.action(); setMenu(null) }}
            >{item.label}</div>
      )}
    </div>
  )
}

// Botones inline "+" para agregar filas/columnas al borde de la tabla
function TableInlineButtons({ editor, wrapperRef }) {
  const [pos, setPos] = useState(null) // { right, bottom, top, left }
  const [, forceUpdate] = useState(0)

  useEffect(() => {
    if (!editor) return
    const handler = () => forceUpdate((n) => n + 1)
    editor.on('transaction', handler)
    return () => editor.off('transaction', handler)
  }, [editor])

  useEffect(() => {
    if (!editor || !editor.isActive('table') || !wrapperRef?.current) {
      setPos(null)
      return
    }
    // Find the table DOM element from the editor's current selection
    const { $from } = editor.state.selection
    let depth = $from.depth
    while (depth > 0) {
      const node = $from.node(depth)
      if (node.type.name === 'table') break
      depth--
    }
    if (depth === 0) { setPos(null); return }

    const tableStart = $from.start(depth) - 1
    let domNode = editor.view.nodeDOM(tableStart)
    // nodeDOM may return a wrapper div; find the actual <table>
    if (domNode && domNode.tagName !== 'TABLE') {
      domNode = domNode.querySelector?.('table') || domNode
    }
    if (!domNode || domNode.tagName !== 'TABLE') { setPos(null); return }

    const wrapper = wrapperRef.current
    const wrapperRect = wrapper.getBoundingClientRect()
    const tableRect = domNode.getBoundingClientRect()

    setPos({
      top: tableRect.top - wrapperRect.top,
      left: tableRect.left - wrapperRect.left,
      right: tableRect.right - wrapperRect.left,
      bottom: tableRect.bottom - wrapperRect.top,
      width: tableRect.width,
      height: tableRect.height,
    })
  })

  if (!pos) return null

  return (
    <>
      {/* + button at right edge (add column) */}
      <button
        className={cx(styles.tableInlineBtn, styles.tableInlineBtnColumn)}
        ref={(node) => setCssVars(node, {
          '--table-inline-top': pos.top,
          '--table-inline-left': pos.right + 4,
          '--table-inline-height': pos.height,
        })}
        onClick={() => editor.chain().focus().addColumnAfter().run()}
        title="Agregar columna"
      >+</button>
      {/* + button at bottom edge (add row) */}
      <button
        className={cx(styles.tableInlineBtn, styles.tableInlineBtnRow)}
        ref={(node) => setCssVars(node, {
          '--table-inline-top': pos.bottom + 4,
          '--table-inline-left': pos.left,
          '--table-inline-width': pos.width,
        })}
        onClick={() => editor.chain().focus().addRowAfter().run()}
        title="Agregar fila"
      >+</button>
    </>
  )
}

// ---------------------------------------------------------------------------
// EditorPanel — panel central con editor TipTap único
// ---------------------------------------------------------------------------
function EditorPanel({
  projectId,
  projectType = 'page',
  activePageId = null,
  initialContent,
  seoMetadata = {},
  contentRules = {},
  seoExpanded = false,
  onSeoExpandedChange,
  onSeoChange,
  onContentRulesChange,
  ruleNotice = '',
  onRuleNoticeChange,
  canEditContentRules = false,
  canManageSections = false,
  canWriteContent = true,
  onUndo,
  onRedo,
  scrollRequest,
  flashRequest,
  onDocUpdate,
  onEditorReady,
  onScrollHeadingChange,
  onSelectionSectionChange,
  firstSectionId,
  activeSectionId,
  onOpenAddSectionAfter,
  sectionActivities = [],
  selectedActivityId = null,
  onActivityMarkerClick,
}) {
  const wrapperRef = useRef(null)
  const scrollAreaRef = useRef(null)
  const programmaticScrollRef = useRef(null)
  const programmaticScrollRafRef = useRef(null)
  const normalizedRules = useMemo(() => getPageContentRules({ contentRules }), [contentRules])
  const rulesRef = useRef(normalizedRules)
  const onRuleNoticeChangeRef = useRef(onRuleNoticeChange)
  const [activeSectionAddTop, setActiveSectionAddTop] = useState(null)
  const [wordStats, setWordStats] = useState(EMPTY_WORD_STATS)
  const ruleWarnings = useMemo(() => (
    getDocumentRuleWarnings({
      contentRules: normalizedRules,
      seoMetadata,
      documentWords: wordStats.words,
    })
  ), [normalizedRules, seoMetadata, wordStats.words])

  const refreshWordStats = useCallback((nextEditor) => {
    if (projectType !== 'document') return
    setWordStats(getEditorWordStats(nextEditor))
  }, [projectType])

  useEffect(() => {
    rulesRef.current = normalizedRules
  }, [normalizedRules])

  useEffect(() => {
    onRuleNoticeChangeRef.current = onRuleNoticeChange
  }, [onRuleNoticeChange])

  const uploadProjectImage = useCallback(async (file) => {
    if (!file) return null
    if (!projectId) throw new Error('Proyecto no disponible')
    const formData = new FormData()
    formData.append('file', file)
    // activeSectionId is null for document/faq types; fall back to '__document__'
    // so asset_uploaded activity knows which "section" to scroll to on click.
    if (activeSectionId) formData.append('sectionId', activeSectionId)
    else formData.append('sectionId', '__document__')
    // pageId lets the activity panel filter uploads to the active page.
    if (activePageId) formData.append('pageId', activePageId)
    const data = await apiFetch(`/api/projects/${projectId}/assets`, {
      method: 'POST',
      body: formData,
    })

    if (!data.asset?.renderInline || !data.asset?.publicUrl) {
      throw new Error('El archivo quedó guardado como adjunto. Los SVG no se insertan inline por seguridad.')
    }

    return data.asset
  }, [projectId, activeSectionId, activePageId])

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: false }),
      Heading.configure({ levels: [1, 2, 3, 4, 5, 6] }),
      EditableImageNode.configure({
        projectId,
        inline: false,
        HTMLAttributes: {
          style: 'max-width:100%; height:auto; display:block;',
        },
      }),
      Link.configure({ openOnClick: false }),
      Underline,
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      TextBlockLayoutExtension,
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      SectionDividerNode,
      CtaButtonNode,
      GoogleDocsHeadingShortcuts,
      DisableConflictingAlignShortcuts,
    ],
    content: initialContent,
    editable: canWriteContent,
    editorProps: {
      handleDOMEvents: {
        dragover(view, event) {
          const files = Array.from(event.dataTransfer?.files || [])
          if (!files.some((file) => file.type.startsWith('image/'))) return false
          event.preventDefault()
          return true
        },
      },
      handleDrop(view, event) {
        const files = Array.from(event.dataTransfer?.files || [])
        const imageFile = files.find((file) => file.type.startsWith('image/'))
        if (!imageFile || !canWriteContent) return false

        event.preventDefault()
        const coords = view.posAtCoords({ left: event.clientX, top: event.clientY })
        const tempUrl = URL.createObjectURL(imageFile)
        insertTemporaryImage(editor, tempUrl, imageFile.name, coords?.pos || null)

        ;(async () => {
          try {
            const asset = await uploadProjectImage(imageFile)
            if (!asset?.publicUrl) return
            await replaceImageSrc(editor, tempUrl, asset.publicUrl, {
              assetId: asset.id || null,
              fileName: asset.fileName || imageFile.name,
              storagePath: asset.path || null,
              originalWidth: asset.width || null,
              originalHeight: asset.height || null,
            })
          } catch (error) {
            removeImageBySrc(editor, tempUrl)
            window.alert(error.message || 'No se pudo subir la imagen')
          } finally {
            URL.revokeObjectURL(tempUrl)
          }
        })()

        return true
      },
      handleTextInput(view, from, to, text) {
        const liveRules = rulesRef.current
        if (projectType !== 'document' || !liveRules.documentMaxWords) return false
        const currentWords = getTextStats(view.state.doc.textBetween(0, view.state.doc.content.size, ' ', ' ')).words
        const nextText = getEditorTextAfterReplace({ state: view.state }, from, to, text)
        const nextWords = getTextStats(nextText).words
        if (nextWords > liveRules.documentMaxWords && nextWords > currentWords) {
          onRuleNoticeChangeRef.current?.(buildDocumentLimitNotice('El documento', `${liveRules.documentMaxWords} palabras`))
          return true
        }
        onRuleNoticeChangeRef.current?.('')
        return false
      },
      handlePaste(view, event) {
        const html = event.clipboardData?.getData('text/html') || ''
        const text = event.clipboardData?.getData('text/plain') || ''
        const plainLines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
        const fallbackLines = plainLines.length > 0 ? plainLines : htmlToPlainLines(html)
        const { seo } = parsePastePayload({ html, text })

        if (seo.titleTag) onSeoChange?.('titleTag', seo.titleTag)
        if (seo.metaDescription) onSeoChange?.('metaDescription', seo.metaDescription)
        if (seo.urlSlug) onSeoChange?.('urlSlug', seo.urlSlug)
        if (seo.titleTag || seo.metaDescription || seo.urlSlug) onSeoExpandedChange?.(true)

        let nextHtml = null
        if (projectType === 'page') {
          nextHtml = buildRichSectionsFromPaste(html, { mode: 'page' }) || buildSectionedHtmlFromPlainLines(fallbackLines) || buildSectionedHtmlFromPaste(html)
        } else if (projectType === 'faq') {
          nextHtml = buildRichSectionsFromPaste(html, { mode: 'faq' }) || buildFaqHtmlFromPlainLines(fallbackLines)
        } else if (projectType === 'document') {
          nextHtml = buildRichDocumentHtmlFromPaste(html) || buildDocumentHtmlFromPlainLines(fallbackLines)
        }

        if (!nextHtml) return false
        const liveRules = rulesRef.current
        if (projectType === 'document' && liveRules.documentMaxWords) {
          const insertedText = htmlToTextContent(nextHtml)
          const currentText = view.state.doc.textBetween(0, view.state.doc.content.size, ' ', ' ')
          const selectedText = view.state.doc.textBetween(view.state.selection.from, view.state.selection.to, ' ', ' ')
          const currentWords = getTextStats(currentText).words
          const selectedWords = getTextStats(selectedText).words
          const insertedWords = getTextStats(insertedText).words
          const nextWords = currentWords - selectedWords + insertedWords
          if (nextWords > liveRules.documentMaxWords && nextWords > currentWords) {
            onRuleNoticeChangeRef.current?.(buildDocumentLimitNotice('El documento', `${liveRules.documentMaxWords} palabras`))
            event.preventDefault()
            return true
          }
        }
        event.preventDefault()
        editor?.chain().focus().insertContent(nextHtml).run()
        onRuleNoticeChangeRef.current?.('')
        return true
      },
      transformPastedHTML(html) {
        if (projectType === 'document') return stripSectionDividersFromHtml(html)
        return html
      },
    },
    onUpdate({ editor }) {
      onDocUpdate?.(editor)
      refreshWordStats(editor)
    },
    onSelectionUpdate({ editor }) {
      refreshWordStats(editor)
      const sectionInfo = getSectionInfoFromSelection(editor)
      if (sectionInfo) onSelectionSectionChange?.(sectionInfo)
    },
    onFocus({ editor }) {
      refreshWordStats(editor)
      const sectionInfo = getSectionInfoFromSelection(editor)
      if (sectionInfo) onSelectionSectionChange?.(sectionInfo)
    },
  })

  // Report editor to parent when ready
  useEffect(() => {
    if (editor) {
      onEditorReady?.(editor)
      refreshWordStats(editor)
    }
  }, [editor, refreshWordStats])

  useEffect(() => {
    if (editor) editor.setEditable(canWriteContent)
  }, [canWriteContent, editor])

  useEffect(() => {
    return () => {
      if (programmaticScrollRafRef.current) {
        cancelAnimationFrame(programmaticScrollRafRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (projectType !== 'document') {
      setWordStats(EMPTY_WORD_STATS)
      return
    }
    if (editor) refreshWordStats(editor)
  }, [editor, projectType, refreshWordStats])

  // ── Scroll to section when sidebar clicks ──
  useEffect(() => {
    if (!scrollRequest || !scrollAreaRef.current) return

    const scrollEl = scrollAreaRef.current
    const pm = scrollEl.querySelector('.ProseMirror')
    if (!pm) return

    if (programmaticScrollRafRef.current) {
      cancelAnimationFrame(programmaticScrollRafRef.current)
      programmaticScrollRafRef.current = null
    }

    const OFFSET = 70
    let targetEl = null
    let targetHeadingIndex = 0

    if (scrollRequest.type === 'seo') {
      targetEl = scrollEl.querySelector('[data-seo-tray]')
    }

    if (scrollRequest.type === 'heading') {
      const headings = mapHeadingsInDOM(pm, firstSectionId)
      targetEl = headings.find(
        (heading) =>
          heading.sectionId === scrollRequest.sectionId &&
          heading.headingIndex === scrollRequest.headingIndex
      )?.el || null
      targetHeadingIndex = scrollRequest.headingIndex
    }

    if (scrollRequest.type === 'documentHeading') {
      // FAQ: headingIndex counts only H2/H3 (questions); H1 is a title and not counted
      const headingSelector = projectType === 'faq' ? 'h2, h3' : 'h1, h2, h3'
      targetEl = Array.from(pm.querySelectorAll(headingSelector))[scrollRequest.headingIndex] || null
      targetHeadingIndex = scrollRequest.headingIndex
    }

    if (scrollRequest.type === 'h1') {
      targetEl = Array.from(pm.querySelectorAll('h1'))[scrollRequest.h1Index] || null
    }

    if (!targetEl) {
      targetEl = pm.querySelector(`[data-section-id="${scrollRequest.sectionId}"]`)
    }

    const rawOffset = targetEl
      ? targetEl.getBoundingClientRect().top - scrollEl.getBoundingClientRect().top + scrollEl.scrollTop - OFFSET
      : 0
    const maxScrollTop = Math.max(0, scrollEl.scrollHeight - scrollEl.clientHeight)
    const targetTop = Math.max(0, Math.min(maxScrollTop, rawOffset))

    programmaticScrollRef.current = {
      sectionId: scrollRequest.sectionId || '__document__',
      headingIndex: targetHeadingIndex,
      targetTop,
    }

    scrollEl.scrollTo({ top: targetTop, behavior: 'smooth' })

    let started = false
    let stableFrames = 0
    let frames = 0
    let lastTop = scrollEl.scrollTop

    const monitorScroll = () => {
      frames += 1
      const currentTop = scrollEl.scrollTop
      const delta = Math.abs(currentTop - lastTop)
      const nearTarget = Math.abs(currentTop - targetTop) <= 2

      if (!started && (delta > 1 || nearTarget)) {
        started = true
      }

      if (started && (nearTarget || delta <= 1)) {
        stableFrames += 1
      } else {
        stableFrames = 0
      }

      lastTop = currentTop

      if ((started && stableFrames >= 4) || frames >= 120) {
        programmaticScrollRef.current = null
        programmaticScrollRafRef.current = null
        if (scrollRequest.type !== 'seo') {
          onScrollHeadingChange?.({
            sectionId: scrollRequest.sectionId || '__document__',
            headingIndex: targetHeadingIndex,
          })
        }
        return
      }

      programmaticScrollRafRef.current = requestAnimationFrame(monitorScroll)
    }

    programmaticScrollRafRef.current = requestAnimationFrame(monitorScroll)

    return () => {
      if (programmaticScrollRafRef.current) {
        cancelAnimationFrame(programmaticScrollRafRef.current)
        programmaticScrollRafRef.current = null
      }
      programmaticScrollRef.current = null
    }
  }, [firstSectionId, onScrollHeadingChange, scrollRequest])

  // ── Flash highlight amarillo sobre sección tras navegar ──
  useEffect(() => {
    if (!flashRequest?.sectionId) return
    const scrollEl = scrollAreaRef.current
    const pm = scrollEl?.querySelector('.ProseMirror')
    if (!pm) return
    const divider = pm.querySelector(`[data-section-id="${flashRequest.sectionId}"]`)
    if (!divider) return
    let nextDivider = null
    let node = divider.nextElementSibling
    while (node) {
      if (node.matches('[data-section-id]')) { nextDivider = node; break }
      node = node.nextElementSibling
    }
    flashSectionInScrollEl(scrollEl, divider, nextDivider)
  }, [flashRequest])

  // ── Scroll listener: detects heading at trigger point ──
  useEffect(() => {
    const scrollEl = scrollAreaRef.current
    if (!scrollEl) return

    const OFFSET = 70

    function onScroll() {
      if (programmaticScrollRef.current) return

      const pm = scrollEl.querySelector('.ProseMirror')
      if (!pm) return

      const containerRect = scrollEl.getBoundingClientRect()
      const triggerY = containerRect.top + OFFSET

      if (projectType === 'document') {
        const headings = Array.from(pm.querySelectorAll('h1, h2, h3'))
        let headingIndex = 0
        headings.forEach((heading, index) => {
          if (heading.getBoundingClientRect().top <= triggerY) headingIndex = index
        })
        if (headings.length > 0) {
          onScrollHeadingChange?.({ sectionId: '__document__', headingIndex })
        }
        return
      }

      const sections = mapSectionsInDOM(pm)
      const headings = mapHeadingsInDOM(pm, firstSectionId)
      let activeSectionId = firstSectionId
      const maxScrollTop = Math.max(0, scrollEl.scrollHeight - scrollEl.clientHeight)
      const isAtBottom = scrollEl.scrollTop >= maxScrollTop - 2

      if (isAtBottom && sections.length > 0) {
        activeSectionId = sections[sections.length - 1].sectionId
      } else {
        for (const section of sections) {
          const rect = section.el.getBoundingClientRect()
          if (rect.top <= triggerY) {
            activeSectionId = section.sectionId
          }
        }
      }

      if (!activeSectionId && sections.length > 0) {
        activeSectionId = sections[0].sectionId
      }

      const sectionHeadings = headings.filter((h) => h.sectionId === activeSectionId)

      let headingIndex = 0
      for (const h of sectionHeadings) {
        const rect = h.el.getBoundingClientRect()
        if (rect.top <= triggerY) {
          headingIndex = h.headingIndex
        }
      }

      if (activeSectionId) {
        onScrollHeadingChange?.({ sectionId: activeSectionId, headingIndex })
      }
    }

    scrollEl.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => scrollEl.removeEventListener('scroll', onScroll)
  }, [firstSectionId, onScrollHeadingChange, projectType])

  useEffect(() => {
    if (!editor || !wrapperRef.current || !activeSectionId) {
      setActiveSectionAddTop(null)
      return
    }

    function rebuildAddButtonPosition() {
      const wrapper = wrapperRef.current
      const pm = wrapper?.querySelector('.ProseMirror')
      if (!pm) {
        setActiveSectionAddTop(null)
        return
      }

      const children = Array.from(pm.children)
      let activeDividerIndex = -1
      let nextDividerIndex = -1

      children.forEach((child, index) => {
        const dividerWrapper =
          child.querySelector?.('[data-section-divider]') ||
          (child.hasAttribute?.('data-section-divider') ? child : null)
        if (!dividerWrapper) return

        const sectionId = dividerWrapper.getAttribute('data-section-id') || ''
        if (sectionId === activeSectionId) {
          activeDividerIndex = index
          return
        }

        if (activeDividerIndex !== -1 && nextDividerIndex === -1) {
          nextDividerIndex = index
        }
      })

      if (activeDividerIndex === -1) {
        setActiveSectionAddTop(null)
        return
      }

      const lastSectionChildIndex =
        nextDividerIndex === -1 ? children.length - 1 : Math.max(activeDividerIndex, nextDividerIndex - 1)
      const anchorEl = children[lastSectionChildIndex] || children[activeDividerIndex]
      if (!anchorEl) {
        setActiveSectionAddTop(null)
        return
      }

      setActiveSectionAddTop(anchorEl.offsetTop + anchorEl.offsetHeight + 12)
    }

    rebuildAddButtonPosition()
    const timeoutId = setTimeout(rebuildAddButtonPosition, 50)

    const wrapper = wrapperRef.current
    const pm = wrapper?.querySelector('.ProseMirror')
    if (!pm) {
      return () => clearTimeout(timeoutId)
    }

    const mutationObserver = new MutationObserver(rebuildAddButtonPosition)
    mutationObserver.observe(pm, { childList: true, subtree: true, characterData: true })

    const resizeObserver = new ResizeObserver(rebuildAddButtonPosition)
    resizeObserver.observe(pm)

    return () => {
      clearTimeout(timeoutId)
      mutationObserver.disconnect()
      resizeObserver.disconnect()
    }
  }, [activeSectionId, editor])

  if (!editor) return <div className={styles.centerPanel} />

  function focusEditorFromPage(event) {
    if (!editor) return
    if (event.target.closest?.('.ProseMirror')) return
    if (event.target.closest?.('button, input, select, textarea, a, [data-editor-overlay]')) return

    event.preventDefault()
    const wrapper = wrapperRef.current?.querySelector('.ProseMirror')
    if (!wrapper) {
      editor.commands.focus('start')
      return
    }

    const rect = wrapper.getBoundingClientRect()
    const coords = editor.view.posAtCoords({
      left: Math.min(Math.max(event.clientX, rect.left + 12), rect.right - 12),
      top: Math.min(Math.max(event.clientY, rect.top + 12), rect.bottom - 12),
    })

    if (coords?.pos) {
      editor.chain().focus().setTextSelection(coords.pos).run()
      return
    }

    editor.commands.focus(event.clientY < rect.top ? 'start' : 'end')
  }

  return (
    <div className={styles.centerPanel}>
      <Toolbar editor={editor} projectId={projectId} onUndo={onUndo} onRedo={onRedo} />
      <TableContextBar editor={editor} />
      {projectType === 'document' && (
        null
      )}
      <div ref={scrollAreaRef} className={styles.editorScrollArea}>
        {projectType !== 'faq' && (
          <div className={seoRulesStyles.topTrayRow} data-seo-tray="">
            <div className={seoRulesStyles.topTraySpacer} />
            <div className={seoRulesStyles.topTraySurface}>
              <SeoMetadataPanel
                metadata={seoMetadata}
                contentRules={normalizedRules}
                expanded={seoExpanded}
                onExpandedChange={onSeoExpandedChange}
                onChange={onSeoChange}
              />
            </div>
          </div>
        )}
        <div className={seoRulesStyles.editorPageRow}>
          <TypeLabelsColumn wrapperRef={wrapperRef} editor={editor} />
          <div
            className={[
              seoRulesStyles.editorCanvas,
              seoExpanded ? seoRulesStyles.editorPageExpanded : '',
            ].filter(Boolean).join(' ')}
            onMouseDown={focusEditorFromPage}
          >
            <div ref={wrapperRef} className={seoRulesStyles.editorCanvasContent}>
              <EditorContent editor={editor} />
              <TableInlineButtons editor={editor} wrapperRef={wrapperRef} />
              <TableRightClickMenu editor={editor} />
              {projectType === 'page' && canManageSections && activeSectionId && activeSectionAddTop !== null && (
                <div
                  className={styles.canvasAddSectionWrap}
                  ref={(node) => setCssVars(node, { '--canvas-add-top': activeSectionAddTop })}
                  data-editor-overlay=""
                >
                  <button
                    className={styles.canvasAddSectionBtn}
                    onClick={() => onOpenAddSectionAfter?.(activeSectionId)}
                  >
                    <Plus size={14} color="#2a2a2a" />
                    Agregar sección debajo
                  </button>
                </div>
              )}
            </div>
          </div>
          <SectionActivityMarkers
            wrapperRef={wrapperRef}
            editor={editor}
            activities={sectionActivities}
            selectedActivityId={selectedActivityId}
            onMarkerClick={onActivityMarkerClick}
          />
        </div>
      </div>
    </div>
  )
}

function SeoMetadataPanel({ metadata, contentRules, expanded, onExpandedChange, onChange }) {
  const titleState = getFieldRuleState(metadata?.titleTag || '', contentRules?.titleTagMinChars, contentRules?.titleTagMaxChars)
  const metaState = getFieldRuleState(metadata?.metaDescription || '', contentRules?.metaDescriptionMinChars, contentRules?.metaDescriptionMaxChars)
  const slugWords = getSlugWordCount(metadata?.urlSlug || '')
  const slugOverLimit = Boolean(contentRules?.urlSlugMaxWords && slugWords > contentRules.urlSlugMaxWords)
  const panelId = 'seo-metadata-panel'

  return (
    <div className={seoRulesStyles.seoPanel}>
      <button
        type="button"
        className={seoRulesStyles.seoToggle}
        onClick={() => onExpandedChange?.(!expanded)}
        aria-expanded={expanded}
        aria-controls={panelId}
      >
        <Search size={15} />
        <span>SEO metadata</span>
        <span className={seoRulesStyles.seoToggleMeta}>
          {metadata?.titleTag || metadata?.metaDescription || metadata?.urlSlug ? 'Completo' : 'Sin completar'}
        </span>
      </button>
      {expanded && (
        <div id={panelId} className={seoRulesStyles.seoFields}>
          <label className={seoRulesStyles.seoField}>
            <span className={seoRulesStyles.seoFieldMeta}>
              <span className={seoRulesStyles.seoLabel}>Title tag</span>
              <span className={cx(seoRulesStyles.seoCounter, (titleState.underMin || titleState.overMax) && seoRulesStyles.seoCounterAlert)}>
                {titleState.current}
                {titleState.max ? ` / ${titleState.max}` : ' caracteres'}
              </span>
            </span>
            <input
              className={cx(seoRulesStyles.seoInput, (titleState.underMin || titleState.overMax) && seoRulesStyles.seoInputAlert)}
              value={metadata?.titleTag || ''}
              onChange={(event) => onChange?.('titleTag', event.target.value)}
              placeholder="Título descriptivo para buscadores"
            />
          </label>
          <label className={seoRulesStyles.seoField}>
            <span className={seoRulesStyles.seoFieldMeta}>
              <span className={seoRulesStyles.seoLabel}>Meta description</span>
              <span className={cx(seoRulesStyles.seoCounter, (metaState.underMin || metaState.overMax) && seoRulesStyles.seoCounterAlert)}>
                {metaState.current}
                {metaState.max ? ` / ${metaState.max}` : ' caracteres'}
              </span>
            </span>
            <textarea
              className={cx(seoRulesStyles.seoTextarea, (metaState.underMin || metaState.overMax) && seoRulesStyles.seoInputAlert)}
              value={metadata?.metaDescription || ''}
              onChange={(event) => onChange?.('metaDescription', event.target.value)}
              placeholder="Resumen breve y específico de la página"
              rows={2}
            />
          </label>
          <label className={seoRulesStyles.seoField}>
            <span className={seoRulesStyles.seoFieldMeta}>
              <span className={seoRulesStyles.seoLabel}>URL slug</span>
              <span className={cx(seoRulesStyles.seoCounter, slugOverLimit && seoRulesStyles.seoCounterAlert)}>
                {slugWords}
                {contentRules?.urlSlugMaxWords ? ` / ${contentRules.urlSlugMaxWords} palabras` : ' palabras'}
              </span>
            </span>
            <input
              className={cx(seoRulesStyles.seoInput, slugOverLimit && seoRulesStyles.seoInputAlert)}
              value={metadata?.urlSlug || ''}
              onChange={(event) => onChange?.('urlSlug', event.target.value)}
              placeholder="mi-url-de-pagina"
            />
          </label>
        </div>
      )}
    </div>
  )
}

function DocumentRulesCard({
  rules,
  canEdit = false,
  onChange,
}) {
  const [editingRules, setEditingRules] = useState(false)
  const isEditing = canEdit && editingRules

  return (
    <div className={seoRulesStyles.rulesDock}>
      <aside className={seoRulesStyles.rulesCard} aria-labelledby="document-rules-title">
        <div className={seoRulesStyles.rulesHeader}>
          <span id="document-rules-title" className={seoRulesStyles.rulesTitle}>Reglas de contenido</span>
          {canEdit && (
            <button
              type="button"
              className={cx(seoRulesStyles.rulesEditButton, isEditing && seoRulesStyles.rulesEditButtonActive)}
              onClick={() => setEditingRules((value) => !value)}
              title={isEditing ? 'Dejar de editar reglas' : 'Editar reglas'}
              aria-pressed={isEditing}
            >
              <Pencil size={13} />
            </button>
          )}
        </div>

        <div className={seoRulesStyles.rulesList}>
          <DocumentRuleRow
            label="Title tag"
            unit="Caracteres"
            minValue={rules.titleTagMinChars}
            maxValue={rules.titleTagMaxChars}
            canEdit={isEditing}
            onMinChange={(value) => onChange?.('titleTagMinChars', value)}
            onMaxChange={(value) => onChange?.('titleTagMaxChars', value)}
          />
          <DocumentRuleRow
            label="Meta description"
            unit="Caracteres"
            minValue={rules.metaDescriptionMinChars}
            maxValue={rules.metaDescriptionMaxChars}
            canEdit={isEditing}
            onMinChange={(value) => onChange?.('metaDescriptionMinChars', value)}
            onMaxChange={(value) => onChange?.('metaDescriptionMaxChars', value)}
          />
          <DocumentRuleRow
            label="URL slug"
            unit="Palabras"
            maxValue={rules.urlSlugMaxWords}
            canEdit={isEditing}
            onMaxChange={(value) => onChange?.('urlSlugMaxWords', value)}
          />
          <DocumentRuleRow
            label="Contenido"
            unit="Palabras"
            maxValue={rules.documentMaxWords}
            canEdit={isEditing}
            onMaxChange={(value) => onChange?.('documentMaxWords', value)}
          />
        </div>
      </aside>
    </div>
  )
}

function DocumentRuleRow({
  label,
  unit,
  minValue = '',
  maxValue = '',
  canEdit = false,
  onMinChange,
  onMaxChange,
}) {
  return (
    <div className={seoRulesStyles.ruleRow}>
      <div className={seoRulesStyles.ruleLabelBlock}>
        <span className={seoRulesStyles.ruleLabel}>{label}</span>
        <span className={seoRulesStyles.ruleUnit}>{unit}</span>
      </div>
      <div className={cx(seoRulesStyles.ruleControls, !onMinChange && seoRulesStyles.ruleControlsSingle)} data-layer="inputs-wrapper">
        {onMinChange ? (
          <RuleInlineValue
            prefix="min"
            value={minValue}
            canEdit={canEdit}
            onChange={onMinChange}
          />
        ) : null}
        <RuleInlineValue
          prefix="max"
          value={maxValue}
          canEdit={canEdit}
          onChange={onMaxChange}
        />
      </div>
    </div>
  )
}

function RuleInlineValue({ prefix, value, canEdit, onChange }) {
  if (!canEdit) {
    return (
      <span className={seoRulesStyles.ruleInputShell} data-layer="input">
        <span className={seoRulesStyles.ruleProperty}>{prefix}</span>
        <span className={cx(seoRulesStyles.ruleStaticNumber, seoRulesStyles.ruleStaticNumberReadOnly)}>{value || '---'}</span>
      </span>
    )
  }

  return (
    <label className={seoRulesStyles.ruleInputShell} data-layer="input">
      <span className={seoRulesStyles.ruleProperty}>{prefix}</span>
      <input
        type="number"
        min="1"
        inputMode="numeric"
        value={value || ''}
        onChange={(event) => onChange?.(event.target.value)}
        placeholder="---"
        className={seoRulesStyles.ruleInput}
      />
    </label>
  )
}

function ContentRulesPanel({
  rules,
  canEdit = false,
  onChange,
  metadata,
  wordStats,
  warnings = [],
  notice = '',
}) {
  const titleState = getFieldRuleState(metadata?.titleTag || '', rules?.titleTagMinChars, rules?.titleTagMaxChars)
  const metaState = getFieldRuleState(metadata?.metaDescription || '', rules?.metaDescriptionMinChars, rules?.metaDescriptionMaxChars)
  const slugWords = getSlugWordCount(metadata?.urlSlug || '')
  const documentWords = Number(wordStats?.words || 0)
  const hasRules = hasContentRules(rules)

  return (
    <div className={styles.rulesPanel}>
      <div className={styles.rulesHeader}>
        <div>
          <span className={styles.rulesTitle}>Reglas de contenido</span>
          <p className={styles.rulesSubtitle}>
            {hasRules ? 'Se aplican en vivo sobre SEO y el documento.' : 'Sin límites configurados.'}
          </p>
        </div>
        <span className={cx(styles.rulesStatusBadge, warnings.length > 0 ? styles.rulesStatusAlert : styles.rulesStatusOk)}>
          {warnings.length > 0 ? `${warnings.length} alerta${warnings.length === 1 ? '' : 's'}` : 'En rango'}
        </span>
      </div>

      <div className={styles.rulesGrid}>
        <RuleInput
          label="Title tag mínimo"
          value={rules.titleTagMinChars}
          suffix="car."
          disabled={!canEdit}
          onChange={(value) => onChange?.('titleTagMinChars', value)}
        />
        <RuleInput
          label="Title tag máximo"
          value={rules.titleTagMaxChars}
          suffix="car."
          disabled={!canEdit}
          onChange={(value) => onChange?.('titleTagMaxChars', value)}
        />
        <RuleInput
          label="Meta mínimo"
          value={rules.metaDescriptionMinChars}
          suffix="car."
          disabled={!canEdit}
          onChange={(value) => onChange?.('metaDescriptionMinChars', value)}
        />
        <RuleInput
          label="Meta máximo"
          value={rules.metaDescriptionMaxChars}
          suffix="car."
          disabled={!canEdit}
          onChange={(value) => onChange?.('metaDescriptionMaxChars', value)}
        />
        <RuleInput
          label="Slug máximo"
          value={rules.urlSlugMaxWords}
          suffix="pal."
          disabled={!canEdit}
          onChange={(value) => onChange?.('urlSlugMaxWords', value)}
        />
        <RuleInput
          label="Documento máximo"
          value={rules.documentMaxWords}
          suffix="pal."
          disabled={!canEdit}
          onChange={(value) => onChange?.('documentMaxWords', value)}
        />
      </div>

      <div className={styles.rulesMetrics}>
        <RuleMetric label="Title tag" value={`${titleState.current}${titleState.max ? ` / ${titleState.max}` : ''}`} alert={titleState.underMin || titleState.overMax} />
        <RuleMetric label="Meta description" value={`${metaState.current}${metaState.max ? ` / ${metaState.max}` : ''}`} alert={metaState.underMin || metaState.overMax} />
        <RuleMetric label="URL slug" value={`${slugWords}${rules.urlSlugMaxWords ? ` / ${rules.urlSlugMaxWords}` : ''}`} alert={Boolean(rules.urlSlugMaxWords && slugWords > rules.urlSlugMaxWords)} />
        <RuleMetric label="Documento" value={`${documentWords}${rules.documentMaxWords ? ` / ${rules.documentMaxWords}` : ''}`} alert={Boolean(rules.documentMaxWords && documentWords > rules.documentMaxWords)} />
      </div>

      {!canEdit && (
        <p className={styles.rulesReadOnly}>
          Visible en tiempo real para Content Writer. La edición de reglas queda para manager/editor.
        </p>
      )}
      {notice && <p className={styles.rulesNotice}>{notice}</p>}
      {warnings.length > 0 && (
        <div className={styles.rulesWarnings}>
          {warnings.map((warning) => (
            <p key={warning} className={styles.rulesWarningItem}>{warning}</p>
          ))}
        </div>
      )}
    </div>
  )
}

function RuleInput({ label, value, suffix, disabled, onChange }) {
  return (
    <label className={styles.rulesField}>
      <span className={styles.rulesFieldLabel}>{label}</span>
      <div className={styles.rulesInputWrap}>
        <input
          type="number"
          min="1"
          inputMode="numeric"
          className={cx(styles.rulesInput, disabled && styles.rulesInputDisabled)}
          value={value || ''}
          onChange={(event) => onChange?.(event.target.value)}
          placeholder="Libre"
          disabled={disabled}
        />
        <span className={styles.rulesInputSuffix}>{suffix}</span>
      </div>
    </label>
  )
}

function RuleMetric({ label, value, alert = false }) {
  return (
    <div className={cx(styles.ruleMetric, alert && styles.ruleMetricAlert)}>
      <span className={styles.ruleMetricLabel}>{label}</span>
      <strong className={styles.ruleMetricValue}>{value}</strong>
    </div>
  )
}

// ---------------------------------------------------------------------------
// UpdatesPanel — sidebar derecho
// ---------------------------------------------------------------------------
function formatPanelDate(isoDate) {
  if (!isoDate) return ''
  return new Date(isoDate).toLocaleString('es-ES', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function htmlToDocument(html) {
  if (!html || typeof DOMParser === 'undefined') return null
  return new DOMParser().parseFromString(`<div id="root">${html}</div>`, 'text/html')
}

function blockText(element) {
  if (!element) return ''
  if (element.matches?.('[data-cta-button]')) {
    return element.getAttribute('data-cta-text') || element.textContent?.trim() || ''
  }
  if (element.tagName?.toLowerCase() === 'table') {
    return Array.from(element.querySelectorAll('tr'))
      .map((row) => Array.from(row.children).map((cell) => cell.textContent.trim()).join('\t'))
      .join('\n')
  }
  return element.textContent?.replace(/\s+\n/g, '\n').trim() || ''
}

function blockLabel(element) {
  const tag = element.tagName?.toLowerCase()
  if (element.matches?.('[data-cta-button]')) return 'CTA'
  if (tag === 'h1') return 'H1'
  if (tag === 'h2') return 'H2'
  if (tag === 'h3') return 'H3'
  if (tag === 'h4') return 'H4'
  if (tag === 'h5') return 'H5'
  if (tag === 'h6') return 'H6'
  if (tag === 'ul') return 'ul'
  if (tag === 'ol') return 'ol'
  if (tag === 'blockquote') return 'quote'
  if (tag === 'table') return 'table'
  if (tag === 'img' || element.querySelector?.('img')) return 'img'
  return 'P'
}

function blockMarkdown(element) {
  const label = blockLabel(element)
  const text = blockText(element)
  if (!text) return ''
  if (label.startsWith('H')) return `${'#'.repeat(Number(label.slice(1)) || 2)} ${text}`
  if (label === 'CTA') return `[${text}](${element.getAttribute('data-cta-url') || '#'})`
  if (label === 'ul') {
    return Array.from(element.querySelectorAll('li')).map((li) => `- ${li.textContent.trim()}`).join('\n')
  }
  if (label === 'ol') {
    return Array.from(element.querySelectorAll('li')).map((li, index) => `${index + 1}. ${li.textContent.trim()}`).join('\n')
  }
  if (label === 'quote') return `> ${text}`
  return text
}

function extractLinks(element) {
  const links = []
  if (element.matches?.('[data-cta-button]')) {
    const url = element.getAttribute('data-cta-url') || ''
    if (url) links.push({ label: element.getAttribute('data-cta-text') || 'CTA', url })
  }

  element.querySelectorAll?.('a[href]').forEach((anchor) => {
    const url = anchor.getAttribute('href')
    if (url) links.push({ label: anchor.textContent?.trim() || url, url })
  })

  return links
}

function createHandoffBlock(element, currentSection) {
  const label = blockLabel(element)
  const text = blockText(element)
  if (!text && !['img', 'table'].includes(label)) return null
  const image = label === 'img' ? parseImageBlockMetadata(element) : null

  return {
    id: `${currentSection.id}-${currentSection.blocks.length}`,
    label,
    text,
    html: element.outerHTML,
    markdown: blockMarkdown(element),
    links: extractLinks(element),
    json: {
      type: label,
      text,
      links: extractLinks(element),
    },
    image,
  }
}

function parseHandoffPage(page, projectType = 'page') {
  if (!page) return []
  const doc = htmlToDocument(page.fullContent || buildDocumentHTML(page.sections))
  const root = doc?.getElementById('root')
  if (!root) return []

  if (projectType === 'document') {
    const currentSection = {
      id: 'document',
      name: page.name || 'Documento',
      blocks: [],
    }
    Array.from(root.children).forEach((element) => {
      if (element.matches?.('div[data-section-divider]')) return
      const block = createHandoffBlock(element, currentSection)
      if (block) currentSection.blocks.push(block)
    })
    return [currentSection]
  }

  if (projectType === 'faq') {
    const sections = []
    let currentSection = null
    let titleBlock = null

    Array.from(root.children).forEach((element) => {
      if (element.matches?.('div[data-section-divider]')) return
      const tag = element.tagName?.toLowerCase()
      if (tag === 'h1' && !currentSection) {
        titleBlock = element
        return
      }
      if (tag === 'h2') {
        if (currentSection) sections.push(currentSection)
        currentSection = {
          id: `faq-${sections.length + 1}`,
          name: element.textContent?.replace(/\s+/g, ' ').trim() || `Pregunta Frecuente ${sections.length + 1}`,
          blocks: [],
        }
        return
      }
      if (!currentSection) {
        currentSection = {
          id: 'faq-intro',
          name: titleBlock?.textContent?.replace(/\s+/g, ' ').trim() || 'Preguntas frecuentes',
          blocks: [],
        }
      }
      const block = createHandoffBlock(element, currentSection)
      if (block) currentSection.blocks.push(block)
    })

    if (currentSection) sections.push(currentSection)
    return sections
  }

  const sections = []
  let currentSection = null

  Array.from(root.children).forEach((element) => {
    if (element.matches?.('div[data-section-divider]')) {
      if (currentSection) sections.push(currentSection)
      currentSection = {
        id: element.getAttribute('data-section-id') || `section-${sections.length + 1}`,
        name: element.getAttribute('data-section-name') || `Sección ${sections.length + 1}`,
        blocks: [],
      }
      return
    }

    if (!currentSection) {
      currentSection = {
        id: `section-${sections.length + 1}`,
        name: `Sección ${sections.length + 1}`,
        blocks: [],
      }
    }

    const block = createHandoffBlock(element, currentSection)
    if (block) currentSection.blocks.push(block)
  })

  if (currentSection) sections.push(currentSection)
  return sections
}

async function copyRich({ text, html }) {
  if (html && navigator.clipboard?.write && window.ClipboardItem) {
    await navigator.clipboard.write([
      new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([text], { type: 'text/plain' }),
      }),
    ])
    return
  }

  await navigator.clipboard.writeText(text)
}

function HandoffSeoSection({ seoMetadata = {} }) {
  const [copied, setCopied] = useState('')
  const { titleTag = '', metaDescription = '', urlSlug = '' } = seoMetadata

  async function copyField(label, value) {
    if (!value) return
    await navigator.clipboard.writeText(value)
    setCopied(label)
    window.setTimeout(() => setCopied(''), 1500)
  }

  const hasAny = titleTag || metaDescription || urlSlug
  if (!hasAny) return null

  return (
    <div className={styles.handoffSeoSection} data-seo-tray>
      <div className={styles.handoffSeoHeader}>
        <span className={styles.handoffSeoTitle}>SEO metadata</span>
        {copied && <span className={styles.handoffSeoCopied}>{copied} copiado</span>}
      </div>
      {titleTag && (
        <div className={styles.handoffSeoRow}>
          <span className={styles.handoffSeoLabel}>Title tag</span>
          <span className={styles.handoffSeoValue}>{titleTag}</span>
          <button type="button" className={styles.handoffSeoBtn} onClick={() => copyField('Title tag', titleTag)}>
            <Copy size={12} />
          </button>
        </div>
      )}
      {metaDescription && (
        <div className={styles.handoffSeoRow}>
          <span className={styles.handoffSeoLabel}>Meta description</span>
          <span className={styles.handoffSeoValue}>{metaDescription}</span>
          <button type="button" className={styles.handoffSeoBtn} onClick={() => copyField('Meta description', metaDescription)}>
            <Copy size={12} />
          </button>
        </div>
      )}
      {urlSlug && (
        <div className={styles.handoffSeoRow}>
          <span className={styles.handoffSeoLabel}>URL slug</span>
          <span className={styles.handoffSeoValue}>{urlSlug}</span>
          <button type="button" className={styles.handoffSeoBtn} onClick={() => copyField('URL slug', urlSlug)}>
            <Copy size={12} />
          </button>
        </div>
      )}
    </div>
  )
}

function HandoffPanel({ page, projectId, projectType = 'page', audience, scrollRequest, flashRequest, onScrollHeadingChange, selectedActivityId = null }) {
  const [copied, setCopied] = useState('')
  const [exportModal, setExportModal] = useState(null)
  const [selectedImageKeys, setSelectedImageKeys] = useState([])
  const [selectionAnchorKey, setSelectionAnchorKey] = useState(null)
  const [imageContextMenu, setImageContextMenu] = useState(null)
  const scrollRef = useRef(null)
  const contentRef = useRef(null)
  const selectionAnchorRef = useRef(null)
  const programmaticScrollRef = useRef(null)
  const programmaticScrollRafRef = useRef(null)
  const sections = useMemo(() => parseHandoffPage(page, projectType), [page, projectType])
  const handoffData = useMemo(() => {
    let imageIndex = 0
    const images = []
    const decoratedSections = sections.map((section) => ({
      ...section,
      blocks: section.blocks.map((block) => {
        if (!block.html?.includes('<img')) return { ...block, renderedHtml: block.html }
        const doc = htmlToDocument(block.html)
        const root = doc?.getElementById('root')
        const element = root?.firstElementChild
        if (!element) return { ...block, renderedHtml: block.html }

        const imageElements = [
          ...(element.tagName?.toLowerCase() === 'img' ? [element] : []),
          ...Array.from(element.querySelectorAll('img')),
        ]
        imageElements.forEach((imageElement) => {
          const image = parseImageBlockMetadata(imageElement)
          if (!image) return
          const key = `img-${imageIndex}`
          imageElement.setAttribute('data-handoff-image-key', key)
          images.push({
            key,
            order: imageIndex,
            blockId: block.id,
            image,
          })
          imageIndex += 1
        })

        return {
          ...block,
          renderedHtml: element.outerHTML,
        }
      }),
    }))

    return { sections: decoratedSections, images }
  }, [sections])
  const groupCopyLabel = projectType === 'faq' ? 'Pregunta frecuente copiada' : projectType === 'document' ? 'Documento copiado' : 'Sección copiada'
  const groupButtonLabel = projectType === 'faq' ? 'Copiar FAQ' : projectType === 'document' ? 'Copiar documento' : 'Copiar sección'
  const selectedImages = useMemo(() => {
    const selectedSet = new Set(selectedImageKeys)
    return handoffData.images.filter((item) => selectedSet.has(item.key))
  }, [handoffData.images, selectedImageKeys])
  const selectedImageCount = selectedImages.length

  function getContentHeadingNodes(root = contentRef.current, { sectionId = null } = {}) {
    if (!root) return []
    const selector = sectionId
      ? `[data-handoff-section-id="${sectionId}"] [data-handoff-block-content] h1, [data-handoff-section-id="${sectionId}"] [data-handoff-block-content] h2, [data-handoff-section-id="${sectionId}"] [data-handoff-block-content] h3`
      : '[data-handoff-block-content] h1, [data-handoff-block-content] h2, [data-handoff-block-content] h3'
    return Array.from(root.querySelectorAll(selector))
  }

  useEffect(() => {
    selectionAnchorRef.current = selectionAnchorKey
  }, [selectionAnchorKey])

  async function handleCopy(label, payload) {
    await copyRich(payload)
    setCopied(label)
    window.setTimeout(() => setCopied(''), 1500)
  }

  const pageText = sections.map((section) => (
    [section.name, ...section.blocks.map((block) => block.text)].join('\n')
  )).join('\n\n')
  const pageHtml = sections.flatMap((section) => section.blocks.map((block) => block.html)).join('\n')
  const pageMarkdown = sections.map((section) => (
    [`## ${section.name}`, ...section.blocks.map((block) => block.markdown)].join('\n\n')
  )).join('\n\n')

  function openSingleImageExport(imageEntry) {
    if (!imageEntry?.image) return

    setExportModal({
      mode: 'single',
      imageEntry,
      image: imageEntry.image,
      fileName: imageEntry.image.baseName || 'image',
      format: imageEntry.image.format === 'jpeg' ? 'jpg' : (imageEntry.image.format || 'webp'),
      width: imageEntry.image.originalWidth || '',
      height: imageEntry.image.originalHeight || '',
      quality: 90,
    })
  }

  function openBulkImageExport(images) {
    if (!images?.length) return

    setExportModal({
      mode: 'bulk',
      images,
      fileName: 'image',
      format: 'webp',
      maxWidth: 1600,
      quality: 90,
    })
  }

  function closeImageExport() {
    setExportModal(null)
    setImageContextMenu(null)
  }

  useEffect(() => {
    if (!exportModal?.image?.src) return undefined
    if (exportModal.image.originalWidth && exportModal.image.originalHeight) return undefined

    let cancelled = false
    const image = new window.Image()
    image.onload = () => {
      if (cancelled) return
      const naturalWidth = image.naturalWidth || null
      const naturalHeight = image.naturalHeight || null
      setExportModal((current) => {
        if (!current) return current
        return {
          ...current,
          image: {
            ...current.image,
            originalWidth: current.image.originalWidth || naturalWidth,
            originalHeight: current.image.originalHeight || naturalHeight,
          },
          width: current.width || naturalWidth || '',
          height: current.height || naturalHeight || '',
        }
      })
    }
    image.src = exportModal.image.src

    return () => {
      cancelled = true
    }
  }, [exportModal?.image?.src, exportModal?.image?.originalWidth, exportModal?.image?.originalHeight])

  function updateExportField(key, value) {
    setExportModal((current) => {
      if (!current) return current
      if (current.mode === 'bulk') {
        return { ...current, [key]: value }
      }
      const next = { ...current, [key]: value }
      const baseWidth = Number(current.image?.originalWidth) || 0
      const baseHeight = Number(current.image?.originalHeight) || 0
      const ratio = baseWidth > 0 && baseHeight > 0 ? baseWidth / baseHeight : 0

      if (ratio > 0 && key === 'width') {
        const width = Number(value)
        next.height = Number.isFinite(width) && width > 0 ? Math.round(width / ratio) : ''
      }

      if (ratio > 0 && key === 'height') {
        const height = Number(value)
        next.width = Number.isFinite(height) && height > 0 ? Math.round(height * ratio) : ''
      }

      return next
    })
  }

  useEffect(() => {
    function closeContextMenu() {
      setImageContextMenu(null)
    }

    if (!imageContextMenu) return undefined
    document.addEventListener('pointerdown', closeContextMenu)
    return () => document.removeEventListener('pointerdown', closeContextMenu)
  }, [imageContextMenu])

  useEffect(() => {
    function clearSelectionOnOutsideClick(event) {
      if (event.button !== 0) return
      const target = event.target
      if (!(target instanceof Element)) return
      if (target.closest('img[data-handoff-image-key]')) return
      if (target.closest(`.${styles.imageContextMenu}`)) return
      if (target.closest(`.${styles.exportModal}`)) return
      setSelectedImageKeys([])
      setSelectionAnchorKey(null)
    }

    document.addEventListener('pointerdown', clearSelectionOnOutsideClick)
    return () => document.removeEventListener('pointerdown', clearSelectionOnOutsideClick)
  }, [])

  useEffect(() => {
    const selectedSet = new Set(selectedImageKeys)
    const imageNodes = Array.from(contentRef.current?.querySelectorAll('img[data-handoff-image-key]') || [])
    imageNodes.forEach((node) => {
      const key = node.getAttribute('data-handoff-image-key') || ''
      node.classList.toggle(styles.handoffSelectableImage, true)
      node.classList.toggle(styles.handoffSelectableImageSelected, selectedSet.has(key))
    })
  }, [selectedImageKeys])

  useEffect(() => {
    if (!scrollRequest || !scrollRef.current || !contentRef.current) return

    const scroller = scrollRef.current
    const content = contentRef.current
    const OFFSET = 70
    let targetEl = null
    let targetHeadingIndex = 0

    if (programmaticScrollRafRef.current) {
      cancelAnimationFrame(programmaticScrollRafRef.current)
      programmaticScrollRafRef.current = null
    }

    if (scrollRequest.type === 'seo') {
      targetEl = content.querySelector('[data-seo-tray]')
    } else if (scrollRequest.type === 'section') {
      targetEl = content.querySelector(`[data-handoff-section-id="${scrollRequest.sectionId}"]`)
    } else if (scrollRequest.type === 'heading') {
      const inSection = getContentHeadingNodes(content, { sectionId: scrollRequest.sectionId })
      targetEl = inSection[scrollRequest.headingIndex] || null
      targetHeadingIndex = scrollRequest.headingIndex
    } else if (scrollRequest.type === 'documentHeading') {
      targetEl = getContentHeadingNodes(content)[scrollRequest.headingIndex] || null
      targetHeadingIndex = scrollRequest.headingIndex
    }

    if (!targetEl) return

    const rawOffset = targetEl.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop - OFFSET
    const maxScrollTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight)
    const targetTop = Math.max(0, Math.min(maxScrollTop, rawOffset))

    programmaticScrollRef.current = {
      sectionId: scrollRequest.sectionId || '__document__',
      headingIndex: targetHeadingIndex,
      targetTop,
    }

    scroller.scrollTo({ top: targetTop, behavior: 'smooth' })

    let started = false
    let stableFrames = 0
    let frames = 0
    let lastTop = scroller.scrollTop

    const monitorScroll = () => {
      frames += 1
      const currentTop = scroller.scrollTop
      const delta = Math.abs(currentTop - lastTop)
      const nearTarget = Math.abs(currentTop - targetTop) <= 2

      if (!started && (delta > 1 || nearTarget)) started = true

      if (started && (nearTarget || delta <= 1)) {
        stableFrames += 1
      } else {
        stableFrames = 0
      }

      lastTop = currentTop

      if ((started && stableFrames >= 4) || frames >= 120) {
        programmaticScrollRef.current = null
        programmaticScrollRafRef.current = null
        onScrollHeadingChange?.({
          sectionId: scrollRequest.sectionId || '__document__',
          headingIndex: targetHeadingIndex,
        })
        return
      }

      programmaticScrollRafRef.current = requestAnimationFrame(monitorScroll)
    }

    programmaticScrollRafRef.current = requestAnimationFrame(monitorScroll)

    return () => {
      if (programmaticScrollRafRef.current) {
        cancelAnimationFrame(programmaticScrollRafRef.current)
        programmaticScrollRafRef.current = null
      }
      programmaticScrollRef.current = null
    }
  }, [scrollRequest])

  useEffect(() => {
    if (!scrollRef.current || !contentRef.current) return undefined

    const scroller = scrollRef.current
    const content = contentRef.current
    const OFFSET = 70

    function handleScroll() {
      if (programmaticScrollRef.current) return
      const sectionNodes = Array.from(content.querySelectorAll('[data-handoff-section-id]'))
      const triggerY = scroller.getBoundingClientRect().top + OFFSET

      if (projectType === 'document') {
        const headings = getContentHeadingNodes(content)
        let headingIndex = 0
        headings.forEach((heading, index) => {
          if (heading.getBoundingClientRect().top <= triggerY) headingIndex = index
        })
        if (headings.length > 0) {
          onScrollHeadingChange?.({ sectionId: '__document__', headingIndex })
        }
        return
      }

      if (sectionNodes.length === 0) return
      const maxScrollTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight)
      const isAtBottom = scroller.scrollTop >= maxScrollTop - 2
      let activeSectionId = sectionNodes[0].getAttribute('data-handoff-section-id') || '__document__'

      if (isAtBottom) {
        activeSectionId = sectionNodes[sectionNodes.length - 1].getAttribute('data-handoff-section-id') || activeSectionId
      } else {
        for (const sectionNode of sectionNodes) {
          const rect = sectionNode.getBoundingClientRect()
          if (rect.top <= triggerY) {
            activeSectionId = sectionNode.getAttribute('data-handoff-section-id') || activeSectionId
          }
        }
      }

      if (!activeSectionId && sectionNodes.length > 0) {
        activeSectionId = sectionNodes[0].getAttribute('data-handoff-section-id') || '__document__'
      }

      const headings = getContentHeadingNodes(content, { sectionId: activeSectionId })

      let headingIndex = 0
      headings.forEach((heading, index) => {
        if (heading.getBoundingClientRect().top <= triggerY) headingIndex = index
      })

      onScrollHeadingChange?.({ sectionId: activeSectionId, headingIndex })
    }

    scroller.addEventListener('scroll', handleScroll, { passive: true })
    handleScroll()
    return () => scroller.removeEventListener('scroll', handleScroll)
  }, [onScrollHeadingChange, handoffData.sections])

  useEffect(() => {
    return () => {
      if (programmaticScrollRafRef.current) {
        cancelAnimationFrame(programmaticScrollRafRef.current)
      }
    }
  }, [])

  // ── Flash highlight amarillo sobre sección en Handoff ──
  useEffect(() => {
    if (!flashRequest?.sectionId) return
    const scrollEl = scrollRef.current
    const sectionEl = contentRef.current?.querySelector(`[data-handoff-section-id="${flashRequest.sectionId}"]`)
    if (!scrollEl || !sectionEl) return
    const scrollRect = scrollEl.getBoundingClientRect()
    const top = sectionEl.getBoundingClientRect().top - scrollRect.top + scrollEl.scrollTop
    createFlashOverlay(scrollEl, top, sectionEl.getBoundingClientRect().height)
  }, [flashRequest])

  function getImageRangeKeys(startKey, endKey) {
    const keysInOrder = handoffData.images.map((item) => item.key)
    const startIndex = keysInOrder.indexOf(startKey)
    const endIndex = keysInOrder.indexOf(endKey)
    if (startIndex === -1 || endIndex === -1) return [endKey]
    const [from, to] = startIndex <= endIndex ? [startIndex, endIndex] : [endIndex, startIndex]
    return keysInOrder.slice(from, to + 1)
  }

  function selectImageKey(key, { additive = false, range = false } = {}) {
    if (!range) setSelectionAnchorKey(key)
    setSelectedImageKeys((current) => {
      if (range) {
        const anchorKey = selectionAnchorRef.current && handoffData.images.some((item) => item.key === selectionAnchorRef.current)
          ? selectionAnchorRef.current
          : (current[0] || key)
        const rangeKeys = getImageRangeKeys(anchorKey, key)
        if (!additive) return rangeKeys
        return Array.from(new Set([...current, ...rangeKeys]))
      }

      if (!additive) return [key]
      return current.includes(key)
        ? current.filter((item) => item !== key)
        : [...current, key]
    })
  }

  function handleImageSelectionEvent(event) {
    const imageElement = event.target.closest?.('img[data-handoff-image-key]')
    if (!imageElement) return null
    const key = imageElement.getAttribute('data-handoff-image-key') || ''
    if (!key) return null
    const additive = Boolean(event.metaKey || event.ctrlKey)
    const range = Boolean(event.shiftKey)
    return { key, additive, range }
  }

  async function handleImageExportSubmit(event) {
    event.preventDefault()
    if (!exportModal || !projectId) return

    try {
      if (exportModal.mode === 'bulk') {
        await apiSubmitDownload(`/api/projects/${projectId}/assets/export-bulk`, {
          items: exportModal.images.map((item) => ({
            assetId: item.image.assetId || '',
            src: item.image.src || '',
          })),
          fileName: slugifyExportFileName(exportModal.fileName || 'image'),
          format: exportModal.format || 'webp',
          maxWidth: Number(exportModal.maxWidth) || null,
          quality: Number(exportModal.quality) || null,
        })
        closeImageExport()
        return
      }

      await apiDownloadToFile(buildAdvancedProjectImageExportPath({
        projectId,
        assetId: exportModal.imageEntry?.image?.assetId || exportModal.image.assetId || '',
        src: exportModal.imageEntry?.image?.src || exportModal.image.src || '',
        width: Number(exportModal.width) || null,
        height: Number(exportModal.height) || null,
        format: exportModal.format || '',
        quality: Number(exportModal.quality) || null,
        fit: 'at_max',
        fileName: slugifyExportFileName(exportModal.fileName || exportModal.image.baseName || 'image'),
      }), {
        suggestedFileName: `${slugifyExportFileName(exportModal.fileName || exportModal.image.baseName || 'image')}.${exportModal.format || exportModal.image.format || 'webp'}`,
      })
      closeImageExport()
    } catch (error) {
      window.alert(error.message || 'No se pudo exportar la imagen')
    }
  }

  return (
    <div className={styles.handoffPanel}>
      <div className={styles.handoffHeader}>
        <div>
          <p className={styles.handoffEyebrow}>{audience === 'designer' ? 'Designer handoff' : 'Developer handoff'}</p>
          <h2 className={styles.handoffTitle}>{page?.name || 'Página'}</h2>
        </div>
        <div className={styles.handoffHeaderActions}>
          <button className={styles.handoffActionBtn} onClick={() => handleCopy('Página copiada', { text: pageText, html: pageHtml })}>
            <Copy size={14} />
            Copiar página
          </button>
          {selectedImageCount > 0 && (
            <button className={styles.handoffActionBtn} onClick={() => openBulkImageExport(selectedImages)}>
              <Download size={14} />
              Exportar {selectedImageCount} imagen{selectedImageCount === 1 ? '' : 'es'}
            </button>
          )}
          {audience === 'dev' && (
            <button className={styles.handoffActionBtn} onClick={() => handleCopy('Markdown copiado', { text: pageMarkdown })}>
              <Code2 size={14} />
              Markdown
            </button>
          )}
        </div>
      </div>

      {copied && <p className={styles.copyFeedback}>{copied}</p>}

      <div
        ref={scrollRef}
        className={styles.handoffScroll}
        onContextMenu={(event) => {
          if (selectedImageCount === 0) return
          if (event.target.closest?.('img[data-handoff-image-key]')) return
          event.preventDefault()
          setImageContextMenu({ x: event.clientX, y: event.clientY, keys: selectedImageKeys })
        }}
      >
        <div ref={contentRef} className={styles.handoffContent}>
        {audience === 'dev' && (
          <HandoffSeoSection seoMetadata={page?.seoMetadata} />
        )}
        {handoffData.sections.map((section) => {
          const sectionText = section.blocks.map((block) => block.text).join('\n')
          const sectionHtml = section.blocks.map((block) => block.renderedHtml || block.html).join('\n')
          return (
            <section key={section.id} className={styles.handoffSection} data-handoff-section-id={section.id}>
              <div className={styles.handoffSectionHeader}>
                <h3 className={styles.handoffSectionTitle}>{section.name}</h3>
                <button className={styles.handoffGhostBtn} onClick={() => handleCopy(groupCopyLabel, { text: sectionText, html: sectionHtml })}>
                  <Copy size={13} />
                  {groupButtonLabel}
                </button>
              </div>

              <div className={styles.handoffBlockList}>
                {section.blocks.map((block) => (
                  <div key={block.id} className={styles.handoffBlockRow}>
                    <div className={styles.handoffBlockMeta}>
                      <span className={styles.handoffGutter} aria-hidden="true">{block.label}</span>
                      <div className={styles.handoffActions} aria-label="Acciones del bloque">
                        <button className={styles.handoffIconBtn} title="Copiar texto" onClick={() => handleCopy('Texto copiado', { text: block.text, html: block.html })}>
                          <Copy size={13} />
                        </button>
                        {block.links.map((link, index) => (
                          <button key={`${link.url}-${index}`} className={styles.handoffIconBtn} title={`Copiar URL: ${link.label}`} onClick={() => handleCopy('URL copiada', { text: link.url })}>
                            <Link2 size={13} />
                          </button>
                        ))}
                        {audience === 'dev' && (
                          <>
                            <button className={styles.handoffIconBtn} title="Copiar HTML" onClick={() => handleCopy('HTML copiado', { text: block.text, html: block.html })}>
                              <FileText size={13} />
                            </button>
                            <button className={styles.handoffIconBtn} title="Copiar JSON" onClick={() => handleCopy('JSON copiado', { text: JSON.stringify(block.json, null, 2) })}>
                              <Code2 size={13} />
                            </button>
                          </>
                        )}
                        {block.label === 'img' && block.image && (
                          <button className={styles.handoffIconBtn} title="Exportar imagen" onClick={() => openSingleImageExport(handoffData.images.find((item) => item.blockId === block.id) || null)}>
                            <Download size={13} />
                          </button>
                        )}
                        {block.label === 'table' && handoffData.images.some((item) => item.blockId === block.id) && (
                          <button
                            className={styles.handoffIconBtn}
                            title="Exportar imágenes de la tabla"
                            onClick={() => openBulkImageExport(handoffData.images.filter((item) => item.blockId === block.id))}
                          >
                            <Download size={13} />
                          </button>
                        )}
                      </div>
                    </div>
                    <div className={styles.handoffCopySafe}>
                      {block.label === 'CTA' ? (
                        <span className={styles.handoffCtaText}>{block.text}</span>
                      ) : (
                        <div
                          className={cx(
                            styles.handoffBlockContent,
                            block.label === 'img' && selectedImages.some((item) => item.blockId === block.id) && styles.handoffBlockContentSelected,
                          )}
                          data-handoff-block-content=""
                          onClick={(event) => {
                            const selectionEvent = handleImageSelectionEvent(event)
                            if (!selectionEvent) return
                            event.preventDefault()
                            event.stopPropagation()
                            selectImageKey(selectionEvent.key, { additive: selectionEvent.additive, range: selectionEvent.range })
                          }}
                          onContextMenu={(event) => {
                            const selectionEvent = handleImageSelectionEvent(event)
                            if (!selectionEvent) return
                            event.preventDefault()
                            event.stopPropagation()
                            const nextKeys = (() => {
                              if (selectionEvent.range) {
                                const anchorKey = selectionAnchorRef.current && handoffData.images.some((item) => item.key === selectionAnchorRef.current)
                                  ? selectionAnchorRef.current
                                  : (selectedImageKeys[0] || selectionEvent.key)
                                const rangeKeys = getImageRangeKeys(anchorKey, selectionEvent.key)
                                return selectionEvent.additive
                                  ? Array.from(new Set([...selectedImageKeys, ...rangeKeys]))
                                  : rangeKeys
                              }
                              return selectionEvent.additive
                                ? (selectedImageKeys.includes(selectionEvent.key)
                                  ? selectedImageKeys
                                  : [...selectedImageKeys, selectionEvent.key])
                                : (selectedImageKeys.includes(selectionEvent.key) ? selectedImageKeys : [selectionEvent.key])
                            })()
                            setSelectionAnchorKey(selectionEvent.key)
                            setSelectedImageKeys(nextKeys)
                            setImageContextMenu({ x: event.clientX, y: event.clientY, keys: nextKeys })
                          }}
                          dangerouslySetInnerHTML={{ __html: block.renderedHtml || block.html }}
                        />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )
        })}
        </div>

      </div>

      {imageContextMenu && (
        <div
          className={styles.imageContextMenu}
          style={{ left: `${imageContextMenu.x}px`, top: `${imageContextMenu.y}px` }}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            className={styles.imageContextMenuItem}
            onClick={() => {
              const items = handoffData.images.filter((item) => imageContextMenu.keys.includes(item.key))
              if (items.length <= 1) {
                openSingleImageExport(items[0] || null)
              } else {
                openBulkImageExport(items)
              }
              setImageContextMenu(null)
            }}
          >
            {imageContextMenu.keys.length > 1 ? `Exportar ${imageContextMenu.keys.length} imágenes` : 'Exportar imagen'}
          </button>
          <button
            type="button"
            className={styles.imageContextMenuItem}
            onClick={() => {
              setSelectedImageKeys([])
              setSelectionAnchorKey(null)
              setImageContextMenu(null)
            }}
          >
            Limpiar selección
          </button>
        </div>
      )}

      {exportModal && (
        <div className={styles.exportModalOverlay} onClick={closeImageExport}>
          <div className={styles.exportModal} onClick={(event) => event.stopPropagation()}>
            <div className={styles.exportModalHeader}>
              <div>
                <p className={styles.exportModalEyebrow}>Exportación de imagen</p>
                <h3 className={styles.exportModalTitle}>Configurar export</h3>
              </div>
              <button type="button" className={styles.exportModalClose} onClick={closeImageExport} aria-label="Cerrar">
                <X size={16} />
              </button>
            </div>

            <form className={styles.exportModalForm} onSubmit={handleImageExportSubmit}>
              {exportModal.mode === 'bulk' ? (
                <>
                  <div className={styles.exportPreviewGrid}>
                    {exportModal.images.slice(0, 6).map((item) => (
                      <img key={item.key} className={styles.exportPreviewThumb} src={item.image.src} alt="" />
                    ))}
                  </div>
                  <div className={styles.exportMetaRow}>
                    <span>{exportModal.images.length} imágenes seleccionadas</span>
                    <span>Formato: {(exportModal.format || 'webp').toUpperCase()}</span>
                  </div>
                </>
              ) : (
                <>
                  <div className={styles.exportPreviewWrap}>
                    <img className={styles.exportPreviewImage} src={exportModal.image.src} alt="" />
                  </div>
                  <div className={styles.exportMetaRow}>
                    <span>Original: {exportModal.image.originalWidth || '—'}px × {exportModal.image.originalHeight || '—'}px</span>
                    <span>Formato: {(exportModal.image.format || 'desconocido').toUpperCase()}</span>
                  </div>
                </>
              )}

              <label className={styles.exportField}>
                <span>{exportModal.mode === 'bulk' ? 'Base del nombre' : 'Nombre de archivo'}</span>
                <input
                  className={styles.exportInput}
                  type="text"
                  value={exportModal.fileName}
                  onChange={(event) => updateExportField('fileName', event.target.value)}
                  placeholder="nombre-de-foto"
                />
              </label>

              <div className={styles.exportFieldGrid}>
                <label className={styles.exportField}>
                  <span>{exportModal.mode === 'bulk' ? 'Máx. ancho' : 'Ancho'}</span>
                  <input
                    className={styles.exportInput}
                    type="number"
                    min="1"
                    value={exportModal.mode === 'bulk' ? exportModal.maxWidth : exportModal.width}
                    onChange={(event) => updateExportField(exportModal.mode === 'bulk' ? 'maxWidth' : 'width', event.target.value)}
                  />
                </label>
                {exportModal.mode === 'bulk' ? (
                  <div className={styles.exportField}>
                    <span>Salida</span>
                    <div className={styles.exportStaticValue}>{slugifyExportFileName(exportModal.fileName || 'image')}.zip</div>
                  </div>
                ) : (
                  <label className={styles.exportField}>
                    <span>Alto</span>
                    <input
                      className={styles.exportInput}
                      type="number"
                      min="1"
                      value={exportModal.height}
                      onChange={(event) => updateExportField('height', event.target.value)}
                    />
                  </label>
                )}
              </div>

              <div className={styles.exportFieldGrid}>
                <label className={styles.exportField}>
                  <span>Formato</span>
                  <select className={styles.exportInput} value={exportModal.format} onChange={(event) => updateExportField('format', event.target.value)}>
                    <option value="webp">WebP</option>
                    <option value="jpg">JPG</option>
                    <option value="png">PNG</option>
                  </select>
                </label>
                {exportModal.mode === 'bulk' ? (
                  <div className={styles.exportField}>
                    <span>Numeración</span>
                    <div className={styles.exportStaticValue}>{slugifyExportFileName(exportModal.fileName || 'image')}-1</div>
                  </div>
                ) : (
                  <div className={styles.exportField}>
                    <span>Tamaño exportado</span>
                    <div className={styles.exportStaticValue}>{Number(exportModal.width) || '—'}px × {Number(exportModal.height) || '—'}px</div>
                  </div>
                )}
              </div>

              <label className={styles.exportField}>
                <span>Compresión: {exportModal.quality}%</span>
                <input
                  className={styles.exportRange}
                  type="range"
                  min="0"
                  max="100"
                  value={exportModal.quality}
                  onChange={(event) => updateExportField('quality', event.target.value)}
                />
              </label>

              <div className={styles.exportActions}>
                <button type="button" className={styles.exportSecondaryBtn} onClick={closeImageExport}>Cancelar</button>
                <button type="submit" className={styles.exportPrimaryBtn}>Exportar imagen</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

function PreviewPanel({ page, projectType = 'page', scrollRequest, flashRequest, onScrollHeadingChange }) {
  const scrollRef = useRef(null)
  const contentRef = useRef(null)
  const programmaticScrollRef = useRef(null)
  const programmaticScrollRafRef = useRef(null)

  function getPreviewHeadingNodes({ sectionId = null } = {}) {
    const content = contentRef.current
    if (!content) return []
    if (!sectionId) return Array.from(content.querySelectorAll('h1, h2, h3'))
    const divider = content.querySelector(`[data-section-divider][data-section-id="${sectionId}"]`)
    if (!divider) return []
    const headings = []
    let node = divider.nextElementSibling
    while (node && !node.matches('[data-section-divider]')) {
      if (node.matches('h1, h2, h3')) headings.push(node)
      node = node.nextElementSibling
    }
    return headings
  }

  useEffect(() => {
    if (!scrollRequest || !scrollRef.current || !contentRef.current) return undefined
    const scroller = scrollRef.current
    const content = contentRef.current
    const OFFSET = 70

    if (programmaticScrollRafRef.current) {
      cancelAnimationFrame(programmaticScrollRafRef.current)
      programmaticScrollRafRef.current = null
    }

    let targetEl = null
    let targetHeadingIndex = 0

    if (scrollRequest.type === 'section') {
      targetEl = content.querySelector(`[data-section-divider][data-section-id="${scrollRequest.sectionId}"]`)
    } else if (scrollRequest.type === 'heading') {
      const headings = getPreviewHeadingNodes({ sectionId: scrollRequest.sectionId })
      targetEl = headings[scrollRequest.headingIndex] || null
      targetHeadingIndex = scrollRequest.headingIndex
    } else if (scrollRequest.type === 'documentHeading') {
      targetEl = getPreviewHeadingNodes()[scrollRequest.headingIndex] || null
      targetHeadingIndex = scrollRequest.headingIndex
    }

    if (!targetEl) return undefined

    const rawOffset = targetEl.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop - OFFSET
    const maxScrollTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight)
    const targetTop = Math.max(0, Math.min(maxScrollTop, rawOffset))

    programmaticScrollRef.current = { sectionId: scrollRequest.sectionId || '__document__', headingIndex: targetHeadingIndex, targetTop }
    scroller.scrollTo({ top: targetTop, behavior: 'smooth' })

    let started = false
    let stableFrames = 0
    let frames = 0
    let lastTop = scroller.scrollTop

    const monitorScroll = () => {
      frames += 1
      const currentTop = scroller.scrollTop
      const delta = Math.abs(currentTop - lastTop)
      const nearTarget = Math.abs(currentTop - targetTop) <= 2
      if (!started && (delta > 1 || nearTarget)) started = true
      if (started && (nearTarget || delta <= 1)) stableFrames += 1
      else stableFrames = 0
      lastTop = currentTop
      if ((started && stableFrames >= 4) || frames >= 120) {
        programmaticScrollRef.current = null
        programmaticScrollRafRef.current = null
        onScrollHeadingChange?.({ sectionId: scrollRequest.sectionId || '__document__', headingIndex: targetHeadingIndex })
        return
      }
      programmaticScrollRafRef.current = requestAnimationFrame(monitorScroll)
    }
    programmaticScrollRafRef.current = requestAnimationFrame(monitorScroll)

    return () => {
      if (programmaticScrollRafRef.current) {
        cancelAnimationFrame(programmaticScrollRafRef.current)
        programmaticScrollRafRef.current = null
      }
      programmaticScrollRef.current = null
    }
  }, [scrollRequest])

  useEffect(() => {
    if (!scrollRef.current || !contentRef.current) return undefined
    const scroller = scrollRef.current
    const content = contentRef.current
    const OFFSET = 70

    function handleScroll() {
      if (programmaticScrollRef.current) return
      const triggerY = scroller.getBoundingClientRect().top + OFFSET

      if (projectType === 'document') {
        const headings = getPreviewHeadingNodes()
        let headingIndex = 0
        headings.forEach((heading, index) => {
          if (heading.getBoundingClientRect().top <= triggerY) headingIndex = index
        })
        if (headings.length > 0) onScrollHeadingChange?.({ sectionId: '__document__', headingIndex })
        return
      }

      const dividers = Array.from(content.querySelectorAll('[data-section-divider]'))
      if (dividers.length === 0) return

      const maxScrollTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight)
      const isAtBottom = scroller.scrollTop >= maxScrollTop - 2
      let activeSectionId = dividers[0].getAttribute('data-section-id') || '__document__'

      if (isAtBottom) {
        activeSectionId = dividers[dividers.length - 1].getAttribute('data-section-id') || activeSectionId
      } else {
        for (const divider of dividers) {
          if (divider.getBoundingClientRect().top <= triggerY) {
            activeSectionId = divider.getAttribute('data-section-id') || activeSectionId
          }
        }
      }

      const headings = getPreviewHeadingNodes({ sectionId: activeSectionId })
      let headingIndex = 0
      headings.forEach((heading, index) => {
        if (heading.getBoundingClientRect().top <= triggerY) headingIndex = index
      })
      onScrollHeadingChange?.({ sectionId: activeSectionId, headingIndex })
    }

    scroller.addEventListener('scroll', handleScroll, { passive: true })
    handleScroll()
    return () => scroller.removeEventListener('scroll', handleScroll)
  }, [onScrollHeadingChange, projectType, page])

  useEffect(() => {
    return () => {
      if (programmaticScrollRafRef.current) cancelAnimationFrame(programmaticScrollRafRef.current)
    }
  }, [])

  // ── Flash highlight amarillo sobre sección en Preview ──
  useEffect(() => {
    if (!flashRequest?.sectionId) return
    const scrollEl = scrollRef.current
    const content = contentRef.current
    if (!scrollEl || !content) return
    const divider = content.querySelector(`[data-section-divider][data-section-id="${flashRequest.sectionId}"]`)
    if (!divider) return
    let nextDivider = null
    let node = divider.nextElementSibling
    while (node) {
      if (node.matches('[data-section-divider]')) { nextDivider = node; break }
      node = node.nextElementSibling
    }
    flashSectionInScrollEl(scrollEl, divider, nextDivider)
  }, [flashRequest])


  return (
    <div className={styles.previewPanel}>
      <div className={styles.previewToolbar}>
        <div>
          <p className={styles.handoffEyebrow}>Preview</p>
          <h2 className={styles.handoffTitle}>{page?.name || 'Página'}</h2>
        </div>
        <button className={styles.handoffActionBtn} onClick={() => window.print()}>
          <FileText size={14} />
          Exportar PDF
        </button>
      </div>
      <div ref={scrollRef} className={styles.previewScroll}>
        <article
          ref={contentRef}
          data-preview-page=""
          className={styles.previewPage}
          dangerouslySetInnerHTML={{ __html: page?.fullContent || buildDocumentHTML(page?.sections || []) }}
        />
      </div>
    </div>
  )
}

const DELIVERABLE_SERVICE_OPTIONS = [
  { value: 'copy', label: 'Copy' },
  { value: 'design', label: 'Diseño' },
  { value: 'dev', label: 'Dev' },
  { value: 'seo', label: 'SEO' },
  { value: 'otro', label: 'Otro' },
]

const DELIVERABLE_STATUS_OPTIONS = [
  { value: 'todo', label: 'Pendiente' },
  { value: 'in_progress', label: 'En curso' },
  { value: 'review', label: 'Revisión' },
  { value: 'approved', label: 'Aprobado' },
  { value: 'blocked', label: 'Bloqueado' },
]

function deliverableStatusLabel(status) {
  return DELIVERABLE_STATUS_OPTIONS.find((option) => option.value === status)?.label || status
}

function UpdatesPanel({
  activity = [],
  deliverables = [],
  sections = [],
  activePage = null,
  activePageId = '',
  projectType = 'page',
  contentRules = {},
  canEditContentRules = false,
  onContentRulesChange,
  selectedActivityId = null,
  error = '',
  notice = '',
  canManageProjectMeta = true,
  canReviewDesignerProposals = false,
  isDesigner = false,
  onRefresh,
  shareUrl = '',
  onCreateShareLink,
  onCreateDeliverable,
  onUpdateDeliverableStatus,
  onApproveDesignerProposal,
  onRejectDesignerProposal,
  onActivityClick,
  onMarkActivityRead,
  onNavigateToSection,
  companyId = '',
  projectPages = [],
}) {
  const [deliverableTitle, setDeliverableTitle] = useState('')
  const [deliverableServiceType, setDeliverableServiceType] = useState('otro')
  const [deliverableSubmitting, setDeliverableSubmitting] = useState(false)
  const [templateName, setTemplateName] = useState('')
  const [templateSaving, setTemplateSaving] = useState(false)
  const [templateFeedback, setTemplateFeedback] = useState('')

  async function handleSaveTemplate(e) {
    e.preventDefault()
    const trimmed = templateName.trim()
    if (!trimmed || !companyId) return
    setTemplateSaving(true)
    setTemplateFeedback('')
    try {
      const structureJson = projectPages.map((page) => ({
        name: page.name,
        sections: (page.sections || []).map((section) => section.name),
      }))
      await apiFetch(`/api/companies/${companyId}/templates`, {
        method: 'POST',
        body: JSON.stringify({ name: trimmed, projectType: 'page', structureJson }),
      })
      setTemplateName('')
      setTemplateFeedback('Plantilla guardada.')
      window.setTimeout(() => setTemplateFeedback(''), 3000)
    } catch (err) {
      setTemplateFeedback(err.message || 'No se pudo guardar')
    } finally {
      setTemplateSaving(false)
    }
  }
  const sectionOrder = useMemo(() => (
    new Map(sections.map((section, index) => [section.id, index]))
  ), [sections])
  const sectionActivity = useMemo(() => (
    activity
      .filter((item) => (
        (item.eventType === 'section_edited' || item.eventType === 'asset_uploaded')
        && item.metadata?.sectionId
        && item.metadata?.pageId === activePageId
        && (item.metadata.sectionId === '__document__' || sectionOrder.has(item.metadata.sectionId))
      ))
      .sort((a, b) => {
        // '__document__' always sorts first (index 0)
        const aIndex = a.metadata.sectionId === '__document__' ? 0 : (sectionOrder.get(a.metadata.sectionId) ?? 9999)
        const bIndex = b.metadata.sectionId === '__document__' ? 0 : (sectionOrder.get(b.metadata.sectionId) ?? 9999)
        if (aIndex !== bIndex) return aIndex - bIndex
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      })
  ), [activity, activePageId, sectionOrder])
  const groupedSectionActivity = useMemo(() => {
    const groups = new Map()
    sectionActivity.forEach((item) => {
      const sectionId = item.metadata.sectionId
      if (!groups.has(sectionId)) {
        const section = sections.find((s) => s.id === sectionId)
        // For '__document__', use the stored sectionName (page name) from metadata
        const sectionName = sectionId === '__document__'
          ? (item.metadata.sectionName || 'Documento')
          : (section?.name || item.metadata.sectionName || 'Sección')
        groups.set(sectionId, { sectionId, sectionName, items: [] })
      }
      groups.get(sectionId).items.push(item)
    })
    return Array.from(groups.values())
  }, [sectionActivity, sections])
  // Only document-content events stay in the activity panel.
  // Everything else lives in the notifications dropdown (navbar bell).
  // asset_uploaded items with a known sectionId are folded into sectionActivity;
  // only orphaned uploads (no sectionId or no pageId match) fall here.
  const generalActivity = useMemo(() => (
    activity.filter((item) => (
      item.eventType === 'asset_uploaded'
      && !(item.metadata?.sectionId && item.metadata?.pageId === activePageId
        && (item.metadata.sectionId === '__document__' || sectionOrder.has(item.metadata.sectionId)))
    ))
  ), [activity, activePageId, sectionOrder])
  const hasActivity = groupedSectionActivity.length > 0 || generalActivity.length > 0
  const pendingProposal = activePage?.pendingProposal || null

  useEffect(() => {
    if (!selectedActivityId) return
    const node = document.getElementById(`activity-${selectedActivityId}`)
    node?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [selectedActivityId])

  async function submitDeliverable(event) {
    event.preventDefault()
    const title = deliverableTitle.trim()
    if (!title || !onCreateDeliverable) return

    setDeliverableSubmitting(true)
    const created = await onCreateDeliverable({ title, serviceType: deliverableServiceType })
    if (created) {
      setDeliverableTitle('')
      setDeliverableServiceType('otro')
    }
    setDeliverableSubmitting(false)
  }

  return (
    <div className={panelStyles.rightPanel}>
      <div className={panelStyles.updatesHeader}>
        <span className={panelStyles.panelTitle}>Actividad</span>
        <button className={panelStyles.updatesRefreshBtn} onClick={onRefresh}>Actualizar</button>
      </div>
      <div className={cx(panelStyles.rightPanelScroll, projectType === 'document' && panelStyles.rightPanelScrollWithDock)}>
        {error && <p className={panelStyles.updatesError}>{error}</p>}
        {!error && notice && <p className={panelStyles.updatesNotice}>{notice}</p>}
        {pendingProposal && (
          <div className={panelStyles.proposalBox}>
            <div className={panelStyles.proposalHeader}>
              <span className={panelStyles.pendingTitle}>
                {canReviewDesignerProposals ? 'Propuesta de diseño' : 'Tu propuesta'}
              </span>
              <span className={panelStyles.proposalBadge}>Pendiente</span>
            </div>
            <p className={panelStyles.proposalText}>
              {canReviewDesignerProposals
                ? 'Hay cambios de diseño listos para aprobar o pedir ajustes.'
                : 'Tus cambios no afectan el contenido publicado hasta que editor o manager los aprueben.'}
            </p>
            {pendingProposal.reviewerNote && (
              <p className={panelStyles.proposalText}>Nota: {pendingProposal.reviewerNote}</p>
            )}
            {canReviewDesignerProposals ? (
              <div className={panelStyles.proposalActions}>
                <button className={panelStyles.deliverableButton} onClick={onApproveDesignerProposal}>
                  Aprobar
                </button>
                <button className={panelStyles.proposalSecondaryButton} onClick={onRejectDesignerProposal}>
                  Pedir cambios
                </button>
              </div>
            ) : isDesigner ? (
              <p className={panelStyles.deliverablesEmpty}>Puedes seguir editando y guardando sobre esta propuesta.</p>
            ) : null}
          </div>
        )}
        <div className={panelStyles.deliverablesBox}>
          <span className={panelStyles.pendingTitle}>Entregables</span>
          {canManageProjectMeta ? (
            <form className={panelStyles.deliverableForm} onSubmit={submitDeliverable}>
              <input
                className={panelStyles.deliverableInput}
                value={deliverableTitle}
                onChange={(event) => setDeliverableTitle(event.target.value)}
                placeholder="Nuevo entregable"
              />
              <select
                className={styles.deliverableSelect}
                value={deliverableServiceType}
                onChange={(event) => setDeliverableServiceType(event.target.value)}
              >
                {DELIVERABLE_SERVICE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
              <button className={panelStyles.deliverableButton} type="submit" disabled={deliverableSubmitting || !deliverableTitle.trim()}>
                {deliverableSubmitting ? 'Creando...' : 'Crear'}
              </button>
            </form>
          ) : (
            <p className={panelStyles.deliverablesEmpty}>Solo lectura para este rol.</p>
          )}

          {deliverables.length === 0 ? (
            <p className={panelStyles.deliverablesEmpty}>Sin entregables.</p>
          ) : (
            <div className={panelStyles.deliverablesList}>
              {deliverables.slice(0, 6).map((item) => (
                <div key={item.id} className={panelStyles.deliverableRow}>
                  <div className={panelStyles.deliverableText}>
                    <span className={panelStyles.deliverableTitle}>{item.title}</span>
                    <span className={panelStyles.deliverableMeta}>{item.serviceType} · {deliverableStatusLabel(item.status)}</span>
                  </div>
                  {canManageProjectMeta ? (
                    <select
                      className={styles.deliverableStatusSelect}
                      value={item.status}
                      onChange={(event) => onUpdateDeliverableStatus?.(item.id, event.target.value)}
                    >
                      {DELIVERABLE_STATUS_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  ) : (
                    <span className={panelStyles.deliverableMeta}>{deliverableStatusLabel(item.status)}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        <div className={panelStyles.shareBox}>
          <span className={panelStyles.pendingTitle}>Cliente</span>
          {canManageProjectMeta ? (
            <button className={panelStyles.shareButton} onClick={onCreateShareLink}>
              Crear link privado
            </button>
          ) : (
            <p className={panelStyles.deliverablesEmpty}>El link privado lo gestiona manager/editor.</p>
          )}
          {shareUrl && (
            <p className={panelStyles.shareUrl}>Link copiado: {shareUrl}</p>
          )}
        </div>

        {projectType === 'page' && canManageProjectMeta && companyId && (
          <div className={panelStyles.shareBox}>
            <span className={panelStyles.pendingTitle}>Plantillas</span>
            <form className={panelStyles.templateForm} onSubmit={handleSaveTemplate}>
              <input
                className={panelStyles.templateInput}
                type="text"
                placeholder="Nombre de la plantilla"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
              />
              <button
                className={panelStyles.shareButton}
                type="submit"
                disabled={templateSaving || !templateName.trim()}
              >
                {templateSaving ? 'Guardando...' : 'Guardar estructura actual'}
              </button>
            </form>
            {templateFeedback && (
              <p className={panelStyles.shareUrl}>{templateFeedback}</p>
            )}
          </div>
        )}
        {!hasActivity ? (
          <p className={panelStyles.updatesEmpty}>Sin actividad registrada aún.</p>
        ) : (
          <>
            {groupedSectionActivity.length > 0 && (
              <ul className={panelStyles.activityGroupsList}>
                {groupedSectionActivity.map((group) => (
                  <SectionActivityGroup
                    key={group.sectionId}
                    group={group}
                    selectedActivityId={selectedActivityId}
                    onNavigate={onNavigateToSection}
                    onMarkRead={onMarkActivityRead}
                  />
                ))}
              </ul>
            )}
            {generalActivity.length > 0 && (
              <>
                <span className={panelStyles.activityGroupTitle}>Actividad general</span>
                <ul className={panelStyles.updatesListCompact}>
                  {generalActivity.map((item) => (
                    <ActivityListItem
                      key={item.id}
                      item={item}
                      selectedActivityId={selectedActivityId}
                      onActivityClick={onActivityClick}
                      onMarkActivityRead={onMarkActivityRead}
                    />
                  ))}
                </ul>
              </>
            )}
          </>
        )}
      </div>
      {projectType === 'document' && (
        <div className={panelStyles.rightPanelDock}>
          <div className={panelStyles.rightPanelDockCard}>
            <DocumentRulesCard
              rules={contentRules}
              canEdit={canEditContentRules}
              onChange={onContentRulesChange}
            />
          </div>
        </div>
      )}
    </div>
  )
}

function ActivityListItem({ item, selectedActivityId = null, onActivityClick, onMarkActivityRead }) {
  return (
    <li
      id={`activity-${item.id}`}
      className={cx(panelStyles.updatesItem, item.id === selectedActivityId && panelStyles.updatesItemActive)}
    >
      <button
        type="button"
        className={panelStyles.updatesItemButton}
        onClick={() => onActivityClick?.(item)}
      >
        <span className={panelStyles.updatesField}>{item.title}</span>
      </button>
      {item.description && <span className={panelStyles.updatesDescription}>{item.description}</span>}
      <span className={panelStyles.updatesDatetime}>
        {item.actorLabel} · {formatPanelDate(item.createdAt)}
      </span>
      {isUnreadSectionActivity(item) && (
        <button
          type="button"
          className={panelStyles.markReadBtn}
          onClick={() => onMarkActivityRead?.(item.id)}
        >
          Marcar leída
        </button>
      )}
    </li>
  )
}

function SectionActivityGroup({ group, selectedActivityId, onNavigate, onMarkRead }) {
  const [expanded, setExpanded] = useState(false)
  const latestItem = group.items[0]
  const hasUnread = group.items.some(isUnreadSectionActivity)
  const isSelected = group.items.some((item) => item.id === selectedActivityId)
  const pageId = latestItem?.metadata?.pageId

  // Flatten metadata.history (collected per row) plus a top-level entry for rows without history
  // so "Ver detalle" lists every change with its own timestamp + actor.
  // asset_uploaded items don't have changeTypes/history — use their title as the label.
  const detailEntries = useMemo(() => {
    const flat = []
    group.items.forEach((item) => {
      if (item.eventType === 'asset_uploaded') {
        flat.push({
          key: item.id,
          itemId: item.id,
          label: item.title || 'Imagen subida',
          actorLabel: item.actorLabel,
          at: item.createdAt,
        })
        return
      }
      const history = Array.isArray(item.metadata?.history) ? item.metadata.history : null
      if (history && history.length > 0) {
        history.forEach((entry, index) => {
          flat.push({
            key: `${item.id}-${index}`,
            itemId: item.id,
            changeTypes: entry.changeTypes || [],
            actorLabel: entry.actorLabel || item.actorLabel,
            at: entry.at || item.createdAt,
          })
        })
      } else {
        flat.push({
          key: item.id,
          itemId: item.id,
          changeTypes: item.metadata?.changeTypes || [],
          actorLabel: item.actorLabel,
          at: item.createdAt,
        })
      }
    })
    return flat.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
  }, [group.items])

  const latestChangesLabel = latestItem?.eventType === 'asset_uploaded'
    ? (latestItem.title || 'Imagen subida')
    : formatActivityChangeTypes(latestItem?.metadata?.changeTypes || [])

  function handleRowClick() {
    onNavigate?.(group.sectionId, { itemId: latestItem?.id, pageId })
  }

  function handleDetailItemClick(entry) {
    onNavigate?.(group.sectionId, { itemId: entry.itemId, pageId })
  }

  return (
    <li className={panelStyles.activityGroup}>
      <div
        className={cx(panelStyles.activityGroupRow, isSelected && panelStyles.activityHistoryItemActive)}
        onClick={handleRowClick}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && handleRowClick()}
      >
        <div className={panelStyles.activityGroupMain}>
          <div className={panelStyles.activityGroupTop}>
            <span className={cx(panelStyles.activityGroupName, hasUnread && panelStyles.activityGroupNameUnread)}>
              {group.sectionName}
            </span>
            {hasUnread && <span className={panelStyles.unreadDot} />}
          </div>
          {latestChangesLabel && (
            <span className={panelStyles.activityGroupChanges}>{latestChangesLabel}</span>
          )}
          {latestItem && (
            <span className={panelStyles.activityGroupSub}>
              {latestItem.actorLabel} · {formatPanelDate(latestItem.createdAt)}
            </span>
          )}
          {detailEntries.length > 1 && (
            <button
              type="button"
              className={panelStyles.activityGroupDetailBtn}
              onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v) }}
            >
              {expanded ? 'Ocultar detalle' : `Ver detalle (${detailEntries.length})`}
            </button>
          )}
          {hasUnread && (
            <button
              type="button"
              className={panelStyles.markReadBtn}
              onClick={(e) => {
                e.stopPropagation()
                group.items.filter(isUnreadSectionActivity).forEach((item) => onMarkRead?.(item.id))
              }}
            >
              Marcar leída
            </button>
          )}
        </div>
        {detailEntries.length > 1 && (
          <button
            type="button"
            className={cx(panelStyles.activityGroupChevron, expanded && panelStyles.activityGroupChevronOpen)}
            onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v) }}
            aria-label={expanded ? 'Colapsar historial' : 'Ver historial'}
          >
            <ChevronDown size={12} />
          </button>
        )}
      </div>
      {expanded && detailEntries.length > 0 && (
        <ul className={panelStyles.activityGroupHistory}>
          {detailEntries.map((entry) => (
            <li
              key={entry.key}
              className={panelStyles.activityHistoryItem}
              onClick={() => handleDetailItemClick(entry)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && handleDetailItemClick(entry)}
            >
              <span className={panelStyles.activityHistoryDesc}>
                {entry.label || formatActivityChangeTypes(entry.changeTypes) || 'Editó contenido'}
              </span>
              <span className={panelStyles.activityHistoryMeta}>
                {entry.actorLabel} · {formatPanelDate(entry.at)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}

// ---------------------------------------------------------------------------
// Estilos
// ---------------------------------------------------------------------------
