import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useEditor, EditorContent, NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react'
import { Node, mergeAttributes } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import Heading from '@tiptap/extension-heading'
import Image from '@tiptap/extension-image'
import Link from '@tiptap/extension-link'
import { Underline } from '@tiptap/extension-underline'
import { TextStyle, Color } from '@tiptap/extension-text-style'
import { Table } from '@tiptap/extension-table'
import { TableRow } from '@tiptap/extension-table-row'
import { TableHeader } from '@tiptap/extension-table-header'
import { TableCell } from '@tiptap/extension-table-cell'
import { Fragment } from '@tiptap/pm/model'
import { Undo2, Redo2, Plus, Bell, User, MoreVertical, Tag, Info, GripVertical, X, Strikethrough, List, ListOrdered, Quote, TableIcon, Rows3, Columns3, Trash2, Copy, Link2, Code2, Palette, Eye, FileText, MousePointerClick } from 'lucide-react'
import { apiFetch } from '../lib/api'

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
      <div style={styles.sectionDivider}>
        <span style={styles.sectionDividerLabel}>{node.attrs.sectionName}</span>
        <hr style={styles.sectionDividerHr} />
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
      <div style={styles.ctaNode}>
        <a
          style={styles.ctaNodeButton}
          href={url || '#'}
          onClick={(event) => event.preventDefault()}
        >
          {text}
        </a>
        <button type="button" style={styles.ctaNodeEdit} onClick={editCta}>
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

function mapPersistedPage(page) {
  const sections = parseSectionsFromHtml(page.contentHtml)

  return {
    id: page.id,
    name: page.name,
    sections,
    fullContent: page.contentHtml || buildDocumentHTML(sections),
    contentJson: page.contentJson || null,
    version: page.version || 1,
    reviewStatus: page.reviewStatus || 'draft',
    reviewBaselineVersionId: page.reviewBaselineVersionId || null,
    reviewBaselineAt: page.reviewBaselineAt || null,
    reviewRequestedBy: page.reviewRequestedBy || null,
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

function getSectionStats(html) {
  if (!html || typeof DOMParser === 'undefined') {
    return {
      text: '',
      ctaCount: 0,
      ctaSignature: '',
      imageCount: 0,
      imageSignature: '',
      tableSignature: '',
    }
  }

  const parser = new DOMParser()
  const doc = parser.parseFromString(`<div id="root">${html}</div>`, 'text/html')
  const root = doc.getElementById('root')
  if (!root) {
    return {
      text: String(html).replace(/\s+/g, ' ').trim(),
      ctaCount: 0,
      ctaSignature: '',
      imageCount: 0,
      imageSignature: '',
      tableSignature: '',
    }
  }

  const ctas = Array.from(root.querySelectorAll('[data-cta-button]')).map((node) => (
    `${node.getAttribute('data-cta-text') || ''}|${node.getAttribute('data-cta-url') || ''}`
  ))
  const images = Array.from(root.querySelectorAll('img')).map((node) => node.getAttribute('src') || '')
  const tables = Array.from(root.querySelectorAll('table')).map((node) => node.textContent?.replace(/\s+/g, ' ').trim() || '')

  return {
    text: root.textContent?.replace(/\s+/g, ' ').trim() || '',
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

  if (previousStats.text !== nextStats.text) changes.add('text_changed')

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
    changes.add('image_added')
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

function isUnreadSectionActivity(item) {
  return item?.eventType === 'section_edited'
    && item.metadata?.sectionId
    && !item.metadata?.readAt
}

function formatActivityChangeTypes(changeTypes = []) {
  const labels = {
    text_changed: 'Cambió texto',
    cta_added: 'Agregó CTA',
    cta_removed: 'Eliminó CTA',
    cta_changed: 'Cambió CTA',
    image_added: 'Agregó imagen',
    image_removed: 'Eliminó imagen',
    table_changed: 'Cambió tabla',
    section_moved: 'Se movió de posición',
    section_added: 'Agregó sección',
    section_removed: 'Eliminó sección',
    section_renamed: 'Renombró sección',
    content_changed: 'Editó contenido',
  }

  return changeTypes.map((type) => labels[type] || 'Editó contenido').join(' · ')
}

// ---------------------------------------------------------------------------
// Helper: getNextSectionNumber — devuelve el siguiente número para auto-nombrar
// ---------------------------------------------------------------------------
const AUTO_SECTION_NAME_RE = /^Sección (\d+)$/

function isAutoSectionName(name) {
  return AUTO_SECTION_NAME_RE.test(name?.trim() || '')
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

  for (const node of json.content) {
    if (node.type === 'sectionDivider') {
      if (currentSection) sections.push(currentSection)
      currentSection = {
        id: node.attrs.sectionId,
        name: node.attrs.sectionName,
        headings: [],
        isEmpty: true,
      }
      continue
    }

    if (!currentSection) continue

    // Check if node has real content
    const hasContent = ['ctaButton', 'image', 'table'].includes(node.type)
      || (node.content && node.content.some(
        (child) => child.text && child.text.trim().length > 0
      ))
    if (hasContent) currentSection.isEmpty = false

    // Collect headings (h1-h3)
    if (node.type === 'heading' && node.attrs?.level <= 3) {
      const text = (node.content || []).map((c) => c.text || '').join('')
      if (text.trim()) {
        currentSection.headings.push({
          tag: `h${node.attrs.level}`,
          text: text.trim(),
        })
      }
    }
  }
  if (currentSection) sections.push(currentSection)
  return sections
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

  const [projectMeta, setProjectMeta] = useState(null)
  const [pages, setPages] = useState([])
  const [activePageId, setActivePageId] = useState(null)
  const [activeSectionId, setActiveSectionId] = useState(null)
  // Heading activo en el editor — { sectionId, headingIndex } | null
  const [activeHeading, setActiveHeading] = useState(null)
  // Sections derivadas del contenido del editor (source of truth = editor)
  const [derivedSections, setDerivedSections] = useState([])
  const [loadingProject, setLoadingProject] = useState(true)
  const [projectError, setProjectError] = useState('')
  const [isDirty, setIsDirty] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState('')
  const [editorMode, setEditorMode] = useState('brief')
  const [handoffAudience, setHandoffAudience] = useState('designer')
  const [activity, setActivity] = useState([])
  const [notifications, setNotifications] = useState([])
  const [deliverables, setDeliverables] = useState([])
  const [selectedActivityId, setSelectedActivityId] = useState(null)
  const [panelError, setPanelError] = useState('')
  const [panelNotice, setPanelNotice] = useState('')
  const [shareUrl, setShareUrl] = useState('')
  const [sectionModalState, setSectionModalState] = useState({
    isOpen: false,
    insertAfterSectionId: null,
  })

  // Estado de confirmación para borrar página
  const [deletePageConfirm, setDeletePageConfirm] = useState(null) // pageId or null

  // ID del menú contextual abierto (page-{id} o section-{id}); null = ninguno
  const [openMenuId, setOpenMenuId] = useState(null)

  // scrollRequest: navegación programática desde el sidebar.
  const [scrollRequest, setScrollRequest] = useState(null)

  // Ref al editor único
  const editorRef = useRef(null)
  const saveInFlightRef = useRef(false)

  const activePage = pages.find((p) => p.id === activePageId)
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

        const nextPages = data.pages.map(mapPersistedPage)
        const firstPage = nextPages[0]
        const initialSections = firstPage?.sections || []

        setProjectMeta(data.project)
        setPages(nextPages)
        setActivePageId(firstPage?.id || null)
        setActiveSectionId(initialSections[0]?.id || null)
        setDerivedSections(initialSections.map((section) => ({
          id: section.id,
          name: section.name,
          headings: [],
          isEmpty: false,
        })))
        initialContentRef.current = firstPage?.fullContent || '<p></p>'
        setIsDirty(false)
        setSaveMessage('')
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

    const { state } = editor
    let tr = state.tr
    let sectionIndex = 0
    let changed = false

    state.doc.descendants((node, pos) => {
      if (node.type.name !== 'sectionDivider') return true

      sectionIndex += 1

      if (isAutoSectionName(node.attrs.sectionName)) {
        const expectedName = `Sección ${sectionIndex}`
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
  }, [])

  const handleDocUpdate = useCallback((editor) => {
    if (isAutoRemoving.current || isRenumberingSections.current) return

    let sections = deriveSectionsFromDoc(editor)
    setIsDirty(true)
    setSaveMessage('')

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
          .insertContentAt(0, { type: 'sectionDivider', attrs: { sectionId: id, sectionName: 'Sección 1' } })
          .run()
        editor.commands.setTextSelection({ from: from + 1, to: to + 1 })
        isAutoRemoving.current = false
        const newSections = deriveSectionsFromDoc(editor)
        setDerivedSections(newSections)
        setActiveSectionId(newSections[0]?.id ?? null)
        return
      }
    }

    syncProtectedEmptySections(sections)

    if (renumberAutoSections(editor)) {
      sections = deriveSectionsFromDoc(editor)
      syncProtectedEmptySections(sections)
    }

    setDerivedSections(sections)

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
        }
      }
    }
  }, [renumberAutoSections, syncProtectedEmptySections])

  // ── Editor listo: guardar ref y derivar secciones iniciales ──
  const handleEditorReady = useCallback((editor) => {
    editorRef.current = editor
    protectedEmptySectionIds.current = new Set()
    if (renumberAutoSections(editor)) {
      const sections = deriveSectionsFromDoc(editor)
      setDerivedSections(sections)
      return
    }
    const sections = deriveSectionsFromDoc(editor)
    setDerivedSections(sections)
  }, [renumberAutoSections])

  const snapshotActivePage = useCallback(() => {
    if (!editorRef.current || !activePageId) return null

    const html = editorRef.current.getHTML()
    const json = editorRef.current.getJSON()
    const sections = parseSectionsFromHtml(html)

    setPages((prev) => prev.map((page) => (
      page.id === activePageId
        ? { ...page, fullContent: html, contentJson: json, sections }
        : page
    )))

    return { html, json, sections }
  }, [activePageId])

  const loadPageIntoEditor = useCallback((page, shouldScroll = true) => {
    if (!editorRef.current || !page) return

    const content = page.fullContent || buildDocumentHTML(page.sections)
    protectedEmptySectionIds.current = new Set()
    editorRef.current.commands.setContent(content)
    renumberAutoSections(editorRef.current)

    const sections = deriveSectionsFromDoc(editorRef.current)
    sections.forEach((section) => protectedEmptySectionIds.current.add(section.id))
    setDerivedSections(sections)

    const firstId = sections[0]?.id ?? null
    setActiveSectionId(firstId)

    if (shouldScroll && firstId) {
      setScrollRequest({ type: 'section', sectionId: firstId, requestId: Date.now() })
    }
  }, [renumberAutoSections])

  const saveProjectPages = useCallback(async (source = 'manual') => {
    if (!projectId || !activePage || saveInFlightRef.current) return false

    const snapshot = snapshotActivePage()
    const payload = pages.map((page) => {
      if (page.id === activePageId && snapshot) {
        return {
          id: page.id,
          name: page.name,
          contentHtml: snapshot.html,
          contentJson: snapshot.json,
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
        version: page.version,
        reviewStatus: page.reviewStatus || 'draft',
        reviewBaselineVersionId: page.reviewBaselineVersionId || null,
        reviewBaselineAt: page.reviewBaselineAt || null,
        reviewRequestedBy: page.reviewRequestedBy || null,
      }
    })
    const sectionEvents = buildSectionActivityEvents(pages, payload)

    saveInFlightRef.current = true
    setIsSaving(true)
    setSaveMessage(source === 'autosave' ? 'Autoguardando...' : '')

    try {
      const data = await apiFetch(`/api/projects/${projectId}/pages`, {
        method: 'PUT',
        body: JSON.stringify({ pages: payload, source, sectionEvents }),
      })

      const persistedPages = data.pages.map(mapPersistedPage)
      setPages(persistedPages)
      setIsDirty(false)
      setSaveMessage(source === 'autosave' ? 'Autoguardado' : 'Guardado')
      if (source !== 'autosave' || sectionEvents.length > 0) {
        loadSidePanelData()
      }
      return true
    } catch (error) {
      setSaveMessage(error.message || 'No se pudo guardar')
      return false
    } finally {
      saveInFlightRef.current = false
      setIsSaving(false)
    }
  }, [activePage, activePageId, loadSidePanelData, pages, projectId, snapshotActivePage])

  async function handleSave() {
    await saveProjectPages('manual')
  }

  async function sendPageToReview() {
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
      const nextPage = mapPersistedPage(data.page)
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

  useEffect(() => {
    if (!isDirty || loadingProject || !projectId) return undefined

    const timeoutId = window.setTimeout(() => {
      saveProjectPages('autosave')
    }, 2500)

    return () => window.clearTimeout(timeoutId)
  }, [isDirty, loadingProject, projectId, saveProjectPages])

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
    setActiveSectionId(sectionId)
    setActiveHeading({ sectionId, headingIndex })
  }

  // ── Click en un heading del sidebar → activa sección + heading ──
  function handleHeadingClick(sectionId, headingIndex) {
    setActiveSectionId(sectionId)
    setActiveHeading({ sectionId, headingIndex })
    setScrollRequest({ type: 'heading', sectionId, headingIndex, requestId: Date.now() })
  }

  function navigateToActivity(item) {
    const metadata = item?.metadata || {}
    if (!metadata.sectionId) return

    if (metadata.pageId && metadata.pageId !== activePageId) {
      const targetPage = pages.find((page) => page.id === metadata.pageId)
      if (!targetPage) return

      snapshotActivePage()
      setActivePageId(targetPage.id)
      loadPageIntoEditor(targetPage, false)
    }

    setSelectedActivityId(item.id)
    if (metadata.changeTypes?.includes('section_removed')) return

    setActiveSectionId(metadata.sectionId)
    setActiveHeading({ sectionId: metadata.sectionId, headingIndex: 0 })
    setScrollRequest({ type: 'section', sectionId: metadata.sectionId, requestId: Date.now() })
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

  // ── Scroll manual detectó un nuevo heading en el trigger point ──
  const handleScrollHeadingChange = useCallback(({ sectionId, headingIndex }) => {
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

  // ── Agrega una sección nueva via TipTap ──
  function addSection(name, insertAfterSectionId = null) {
    if (!editorRef.current) return

    const id = `s_${Date.now()}`
    const currentSections = deriveSectionsFromDoc(editorRef.current)
    const sectionCount = currentSections.length
    const finalName = name?.trim() || `Sección ${getNextSectionNumber(currentSections)}`

    protectedEmptySectionIds.current.add(id)

    if (sectionCount === 0) {
      // Documento vacío — insertar el identificador al inicio con un párrafo para escribir
      const html = `<div data-section-divider data-section-id="${id}" data-section-name="${finalName}"></div><p></p>`
      editorRef.current.commands.setContent(html)
      const firstEditablePos = getFirstEditableTextPos(editorRef.current)
      if (firstEditablePos !== null) {
        editorRef.current.chain().focus().setTextSelection(firstEditablePos).run()
      } else {
        editorRef.current.commands.focus('end')
      }
      setDerivedSections([{ id, name: finalName, headings: [], isEmpty: true }])
    } else {
      const insertPos = getSectionInsertPos(editorRef.current, insertAfterSectionId)
      const sectionContent = [
        { type: 'sectionDivider', attrs: { sectionId: id, sectionName: finalName } },
        { type: 'paragraph' },
      ]

      if (insertPos !== null) {
        editorRef.current.chain().insertContentAt(insertPos, sectionContent).run()
      } else {
        // Sidebar: si no hay sección objetivo, agregar al final
        editorRef.current.chain().focus('end').insertContent(sectionContent).run()
      }
    }

    renumberAutoSections(editorRef.current)
    setActiveSectionId(id)
    setScrollRequest({ type: 'section', sectionId: id, requestId: Date.now() })
  }

  // ── Renombra una sección ──
  function renameSection(sectionId, newName) {
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
    if (sectionId === activeSectionId || updated.length === 0) {
      setActiveSectionId(updated[0]?.id ?? null)
    }
  }

  // ── Mover sección (drag & drop reorder) ──
  function moveSection(fromIndex, toIndex) {
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

    const movedSectionId = derivedSections[fromIndex]?.id
    if (movedSectionId) {
      setActiveSectionId(movedSectionId)
    }
  }

  // ── Agrega una nueva página ──
  function addPage() {
    const id = crypto.randomUUID()
    const sectionId = `s_${Date.now()}`
    const newPage = {
      id,
      name: 'Nueva página',
      sections: [{ id: sectionId, name: 'Sección 1', content: '<p></p>' }],
      fullContent: buildDocumentHTML([{ id: sectionId, name: 'Sección 1', content: '<p></p>' }]),
      contentJson: null,
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
      const html = buildDocumentHTML(newPage.sections)
      editorRef.current.commands.setContent(html)
      renumberAutoSections(editorRef.current)
      const sections = deriveSectionsFromDoc(editorRef.current)
      setDerivedSections(sections)
    }
    setActiveSectionId(sectionId)
  }

  // ── Elimina una página (con confirmación) ──
  function deletePage(pageId) {
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
    if (!newName.trim()) return
    setPages((prev) =>
      prev.map((p) => (p.id === pageId ? { ...p, name: newName.trim() } : p))
    )
    setIsDirty(true)
    setSaveMessage('')
  }

  if (loadingProject) {
    return <div style={styles.loadingState}>Cargando proyecto...</div>
  }

  if (projectError) {
    return (
      <div style={styles.loadingState}>
        <p style={{ margin: '0 0 12px' }}>{projectError}</p>
        <button style={styles.confirmCancelBtn} onClick={() => navigate('/dashboard')}>
          Volver al dashboard
        </button>
      </div>
    )
  }

  return (
    <div style={styles.root}>
      {sectionModalState.isOpen && (
        <AddSectionModal
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

      {/* ── CSS global para el editor TipTap ── */}
      <style>{`
        .ProseMirror { outline: none; position: relative; min-height: 40px; }
        .ProseMirror > * + * { margin-top: 0.5em; }
        .ProseMirror img { max-height: 300px; max-width: 100%; height: auto; display: block; border-radius: 4px; }
        .ProseMirror p { margin: 0; line-height: 1.6; }
        .ProseMirror h1 { font-size: 2em; font-weight: 700; margin: 0 0 0.3em; }
        .ProseMirror h2 { font-size: 1.5em; font-weight: 700; margin: 0 0 0.3em; }
        .ProseMirror h3 { font-size: 1.25em; font-weight: 600; margin: 0 0 0.3em; }
        .ProseMirror h4 { font-size: 1.1em; font-weight: 600; margin: 0 0 0.3em; }
        .ProseMirror h5, .ProseMirror h6 { font-size: 1em; font-weight: 600; margin: 0 0 0.3em; }
        .ProseMirror ul, .ProseMirror ol { padding-left: 1.4em; margin: 0.3em 0; }
        .ProseMirror li { margin: 0.1em 0; }
        .ProseMirror a { color: #0088ff; text-decoration: underline; }
        .ProseMirror [data-cta-button] a { color: #fff; text-decoration: none; }
        .ProseMirror blockquote { border-left: 3px solid #d9d9d9; margin: 0.5em 0; padding-left: 1em; color: #555; }
        .ProseMirror table { border-collapse: collapse; width: 100%; margin: 0.5em 0; table-layout: fixed; }
        .ProseMirror th, .ProseMirror td { border: 1px solid #d9d9d9; padding: 6px 10px; min-width: 60px; vertical-align: top; }
        .ProseMirror th { background-color: #f5f5f5; font-weight: 600; }
        .ProseMirror .selectedCell { background-color: #e8f0fe; }
        [data-preview-page] [data-section-divider] { display: none; }
        [data-preview-page] [data-cta-button] { margin: 16px 0; }
        [data-preview-page] [data-cta-button] a { display: inline-flex; align-items: center; min-height: 38px; padding: 0 16px; border-radius: 8px; background: #212222; color: #fff; text-decoration: none; font-weight: 500; }
      `}</style>

      {/* ── NAVBAR ── */}
      <Navbar
        pages={pages}
        activePageId={activePageId}
        onPageClick={handlePageClick}
        onAddPage={addPage}
        onRenamePage={renamePage}
        onRequestDeletePage={(pageId) => setDeletePageConfirm(pageId)}
        onUndo={() => editorRef.current?.chain().focus().undo().run()}
        onRedo={() => editorRef.current?.chain().focus().redo().run()}
        onLogoClick={() => navigate('/dashboard')}
        openMenuId={openMenuId}
        onSetOpenMenuId={setOpenMenuId}
      />

      {/* Modal de confirmación para borrar página */}
      {deletePageConfirm && (
        <div style={styles.confirmOverlay} onClick={() => setDeletePageConfirm(null)}>
          <div style={styles.confirmBox} onClick={(e) => e.stopPropagation()}>
            <p style={styles.confirmText}>
              ¿Eliminar la página <strong>{pages.find((p) => p.id === deletePageConfirm)?.name}</strong>?
            </p>
            <p style={styles.confirmSubtext}>Esta acción no se puede deshacer.</p>
            <div style={styles.confirmActions}>
              <button style={styles.confirmCancelBtn} onClick={() => setDeletePageConfirm(null)}>Cancelar</button>
              <button style={styles.confirmDeleteBtn} onClick={() => deletePage(deletePageConfirm)}>Eliminar</button>
            </div>
          </div>
        </div>
      )}

      {/* ── BODY: 3 columnas ── */}
      <div style={styles.body}>
        {/* Sidebar izquierdo: secciones */}
        <SectionsPanel
          sections={derivedSections}
          activeSectionId={activeSectionId}
          onSectionClick={handleSectionClick}
          onOpenAddSectionModal={() => openSectionModal(null)}
          onRename={renameSection}
          onDelete={deleteSection}
          onMoveSection={moveSection}
          activeHeading={activeHeading}
          onHeadingClick={handleHeadingClick}
          openMenuId={openMenuId}
          onSetOpenMenuId={setOpenMenuId}
        />

        {/* Área central: editor / handoff / preview */}
        {editorMode === 'brief' && (
          <EditorPanel
            projectId={projectId}
            initialContent={activePage?.fullContent || initialContentRef.current}
            scrollRequest={scrollRequest}
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
            page={activePageForRead}
            audience={handoffAudience}
          />
        )}

        {editorMode === 'preview' && (
          <PreviewPanel page={activePageForRead} />
        )}

        {/* Sidebar derecho: actualizaciones del documento */}
        <UpdatesPanel
          activity={activity}
          notifications={notifications}
          deliverables={deliverables}
          sections={derivedSections}
          activePageId={activePageId}
          selectedActivityId={selectedActivityId}
          error={panelError}
          notice={panelNotice}
          onRefresh={loadSidePanelData}
          shareUrl={shareUrl}
          onCreateShareLink={createShareLink}
          onCreateDeliverable={createDeliverable}
          onUpdateDeliverableStatus={updateDeliverableStatus}
          onActivityClick={navigateToActivity}
          onMarkActivityRead={markActivityRead}
        />
      </div>

      <FloatingEditorBar
        reviewStatus={activePage?.reviewStatus || 'draft'}
        onSendToReview={sendPageToReview}
        editorMode={editorMode}
        onEditorModeChange={(mode) => {
          if (mode !== 'brief') {
            const snapshot = snapshotActivePage()
            if (snapshot) initialContentRef.current = snapshot.html
          }
          setEditorMode(mode)
        }}
        handoffAudience={handoffAudience}
        onHandoffAudienceChange={setHandoffAudience}
        onSave={handleSave}
        isSaving={isSaving}
        isDirty={isDirty}
        saveMessage={saveMessage}
        disabled={!pages.length}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Navbar — 3 columnas: [logo + undo/redo] | [pills] | [iconos + save]
// ---------------------------------------------------------------------------
function Navbar({ pages, activePageId, onPageClick, onAddPage, onRenamePage, onRequestDeletePage, onUndo, onRedo, onLogoClick, openMenuId, onSetOpenMenuId }) {
  return (
    <div style={styles.navbar}>

      {/* Columna izquierda: Logo + Undo/Redo */}
      <div style={styles.navLeft}>
        <span style={styles.navLogo} onClick={onLogoClick}>
          <span style={{ fontWeight: 200 }}>We</span>
          <span style={{ fontWeight: 700 }}>Brief</span>
        </span>
        <div style={styles.navUndoRedo}>
          <button style={styles.navIconBtn} onClick={onUndo} title="Deshacer (Ctrl+Z)">
            <Undo2 size={20} color="#2a2a2a" />
          </button>
          <button style={styles.navIconBtn} onClick={onRedo} title="Rehacer (Ctrl+Y)">
            <Redo2 size={20} color="#2a2a2a" />
          </button>
        </div>
      </div>

      {/* Columna central: Pills de páginas */}
      <div style={styles.navCenter}>
        {pages.map((page) => (
          <PagePill
            key={page.id}
            page={page}
            isActive={page.id === activePageId}
            canDelete={pages.length > 1}
            onClick={() => onPageClick(page.id)}
            onRename={(name) => onRenamePage(page.id, name)}
            onRequestDelete={() => onRequestDeletePage(page.id)}
            menuOpen={openMenuId === `page-${page.id}`}
            onOpenMenu={() => onSetOpenMenuId(`page-${page.id}`)}
            onCloseMenu={() => onSetOpenMenuId(null)}
          />
        ))}
        <button style={styles.navPillAdd} onClick={onAddPage} title="Agregar página">
          <Plus size={16} color="#2a2a2a" />
        </button>
      </div>

      {/* Columna derecha: Iconos + Save */}
      <div style={styles.navRight}>
        <div style={styles.navIcons}>
          <button style={styles.navIconBtn} title="Perfil">
            <User size={20} color="#2a2a2a" />
          </button>
          <button style={styles.navIconBtn} title="Notificaciones">
            <Bell size={20} color="#2a2a2a" />
          </button>
        </div>
      </div>

    </div>
  )
}

function FloatingEditorBar({
  reviewStatus = 'draft',
  onSendToReview,
  editorMode,
  onEditorModeChange,
  handoffAudience,
  onHandoffAudienceChange,
  onSave,
  isSaving,
  isDirty,
  saveMessage,
  disabled,
}) {
  const reviewReady = reviewStatus !== 'draft'
  const statusLabel = reviewReady ? 'En revisión' : 'Draft'
  const saveLabel = saveMessage || (isDirty ? 'Sin guardar' : 'Guardado')

  return (
    <div style={styles.floatingBar} aria-label="Controles de editor">
      <div style={styles.floatingGroup}>
        <span style={reviewReady ? styles.floatingStatusReady : styles.floatingStatusDraft}>
          {statusLabel}
        </span>
        <button
          type="button"
          style={{
            ...styles.floatingReviewBtn,
            ...((isSaving || reviewReady || disabled) ? styles.floatingBtnDisabled : {}),
          }}
          onClick={onSendToReview}
          disabled={isSaving || reviewReady || disabled}
          title={reviewReady ? 'La página ya está en revisión' : 'Crear baseline y activar alertas de revisión'}
        >
          Enviar a revisión
        </button>
      </div>

      <div style={styles.floatingDivider} />

      <div style={styles.floatingSegment} aria-label="Modo del editor">
        {[
          { id: 'brief', label: 'Brief', icon: FileText },
          { id: 'handoff', label: 'Handoff', icon: MousePointerClick },
          { id: 'preview', label: 'Preview', icon: Eye },
        ].map((mode) => {
          const Icon = mode.icon
          const active = editorMode === mode.id
          return (
            <button
              key={mode.id}
              type="button"
              style={{ ...styles.floatingModeBtn, ...(active ? styles.floatingModeBtnActive : {}) }}
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
          <div style={styles.floatingDivider} />
          <div style={styles.floatingSegment} aria-label="Audiencia de handoff">
            <button
              type="button"
              style={{ ...styles.floatingModeBtn, ...(handoffAudience === 'designer' ? styles.floatingModeBtnActive : {}) }}
              onClick={() => onHandoffAudienceChange('designer')}
            >
              <Palette size={14} />
              Designer
            </button>
            <button
              type="button"
              style={{ ...styles.floatingModeBtn, ...(handoffAudience === 'dev' ? styles.floatingModeBtnActive : {}) }}
              onClick={() => onHandoffAudienceChange('dev')}
            >
              <Code2 size={14} />
              Dev
            </button>
          </div>
        </>
      )}

      <div style={styles.floatingDivider} />

      <div style={styles.floatingGroup}>
        <span style={styles.floatingSaveStatus}>{saveLabel}</span>
        <button
          type="button"
          style={{
            ...styles.floatingSaveBtn,
            ...((isSaving || disabled) ? styles.floatingBtnDisabled : {}),
          }}
          onClick={onSave}
          disabled={isSaving || disabled}
        >
          {isSaving ? 'Guardando...' : 'Guardar'}
        </button>
      </div>
    </div>
  )
}

// Pill individual de página con menú contextual (renombrar / eliminar)
function PagePill({ page, isActive, canDelete, onClick, onRename, onRequestDelete, menuOpen, onOpenMenu, onCloseMenu }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(page.name)

  useEffect(() => { setDraft(page.name) }, [page.name])

  function commitRename() {
    setEditing(false)
    if (draft.trim() && draft.trim() !== page.name) onRename(draft.trim())
    else setDraft(page.name)
  }

  return (
    <div style={{ ...styles.navPillWrapper, ...(isActive ? styles.navPillWrapperActive : {}), position: 'relative' }}>
      {editing ? (
        <input
          style={{
            ...styles.navPillInput,
            color: isActive ? '#f2f2f2' : '#2a2a2a',
            backgroundColor: 'transparent',
          }}
          value={draft}
          autoFocus
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') { setDraft(page.name); setEditing(false) } }}
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <button
          style={isActive ? styles.navPillActive : styles.navPill}
          onClick={onClick}
        >
          {page.name}
        </button>
      )}
      <button
        style={{ ...styles.navPillMenuBtn, color: isActive ? '#f2f2f2' : '#999' }}
        onClick={(e) => { e.stopPropagation(); menuOpen ? onCloseMenu() : onOpenMenu() }}
        title="Opciones"
      >
        <MoreVertical size={14} />
      </button>
      {menuOpen && (
        <div style={styles.navPillMenu} onMouseLeave={onCloseMenu}>
          <div
            style={styles.navPillMenuItem}
            onClick={(e) => { e.stopPropagation(); onCloseMenu(); setEditing(true) }}
          >
            Renombrar
          </div>
          {canDelete && (
            <div
              style={{ ...styles.navPillMenuItem, color: '#ef4444' }}
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
// AddSectionModal — modal centrado para nombrar una nueva sección
// ---------------------------------------------------------------------------
function AddSectionModal({ onConfirm, onSkip, onClose }) {
  const [value, setValue] = useState('')

  useEffect(() => {
    function handleKey(e) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <p style={styles.modalTitle}>Nombre de la sección</p>
        <input
          style={styles.modalInput}
          type="text"
          placeholder="Ej: Hero, Servicios, Contacto…"
          value={value}
          autoFocus
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') onConfirm(value.trim()) }}
        />
        <div style={styles.modalActions}>
          <button
            style={styles.modalBtnPrimary}
            onClick={() => onConfirm(value.trim())}
          >
            Agregar
          </button>
          <button style={styles.modalBtnSecondary} onClick={onSkip}>
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
function SectionsPanel({ sections, activeSectionId, onSectionClick, onOpenAddSectionModal, onRename, onDelete, onMoveSection, activeHeading, onHeadingClick, openMenuId, onSetOpenMenuId }) {
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
    <div style={styles.leftPanel}>
      <div style={styles.panelHeader}>
        <span style={styles.panelTitle}>Page sections</span>
        <button style={styles.panelAddBtn} onClick={onOpenAddSectionModal} title="Agregar sección">
          <Plus size={24} color="#2a2a2a" />
        </button>
      </div>
      <div style={styles.sectionList} onDragOver={(e) => e.preventDefault()} onDrop={handleDrop}>
        {sections.map((section, i) => (
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
            canDrag={sections.length > 1}
            onDragStart={() => setDragIndex(i)}
            onDragEnd={handleDragEnd}
            onDragOver={(e) => handleDragOver(e, i)}
            menuOpen={openMenuId === `section-${section.id}`}
            onOpenMenu={() => onSetOpenMenuId(`section-${section.id}`)}
            onCloseMenu={() => onSetOpenMenuId(null)}
          />
        ))}
        {sections.length === 0 && (
          <p style={styles.emptyMsg}>Sin secciones. Agregá una con +</p>
        )}
      </div>
    </div>
  )
}

// Ítem de sección: nav-button (Tag + nombre + menú) + lista de headings
function SectionItem({ section, isActive, onClick, onRename, onDelete, headings = [], sectionId, activeHeading, onHeadingClick: onHeadingClickProp, index, isDragging, showDropBefore, showDropAfter, canDrag, onDragStart, onDragEnd, onDragOver, menuOpen, onOpenMenu, onCloseMenu }) {

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
      style={{ ...styles.sectionItem, opacity: isDragging ? 0.4 : 1 }}
      onDragOver={onDragOver}
    >
      {showDropBefore && <div style={styles.dropIndicator} />}
      <div
        style={isActive ? styles.sectionNavBtnActive : styles.sectionNavBtn}
        onClick={onClick}
      >
        <div style={styles.sectionNavLeft}>
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
              style={styles.dragHandle}
            >
              <GripVertical size={16} color="#999" />
            </div>
          )}
          <Tag size={18} color="#2a2a2a" strokeWidth={1.8} />
          {editing ? (
            <input
              style={styles.sectionNameInput}
              value={draft}
              autoFocus
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => { if (e.key === 'Enter') commitRename() }}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span
              style={styles.sectionName}
              onDoubleClick={(e) => { e.stopPropagation(); setEditing(true) }}
            >
              {section.name}
            </span>
          )}
        </div>

        <div style={{ position: 'relative', flexShrink: 0 }}>
          <button
            style={styles.menuBtn}
            onClick={(e) => { e.stopPropagation(); menuOpen ? onCloseMenu() : onOpenMenu() }}
            title="Opciones"
          >
            <MoreVertical size={24} color="#2a2a2a" />
          </button>
          {menuOpen && (
            <div style={styles.menu} onMouseLeave={onCloseMenu}>
              <div style={styles.menuItem} onClick={(e) => { e.stopPropagation(); onCloseMenu(); setEditing(true) }}>
                Renombrar
              </div>
              <div style={{ ...styles.menuItem, color: '#ef4444' }} onClick={(e) => { e.stopPropagation(); onCloseMenu(); onDelete() }}>
                Eliminar
              </div>
            </div>
          )}
        </div>
      </div>

      {headings.length > 0 && (
        <div style={styles.sectionContent}>
          {headings.map((h, i) => {
            const isHeadingActive =
              activeHeading?.sectionId === sectionId &&
              activeHeading?.headingIndex === i
            return (
              <div
                key={i}
                style={{
                  borderLeft: `2px solid ${isHeadingActive ? '#0088ff' : '#e0e0e0'}`,
                  paddingLeft: 10,
                  marginBottom: 1,
                  cursor: 'pointer',
                }}
                onClick={(e) => handleHeadingClick(e, i)}
              >
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: h.tag === 'h1' ? 600 : 400,
                    paddingLeft: h.tag === 'h1' ? 0 : 8,
                    color: '#2a2a2a',
                    lineHeight: 1.6,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    display: 'block',
                    userSelect: 'none',
                  }}
                >
                  {h.text}
                </span>
              </div>
            )
          })}
        </div>
      )}
      {showDropAfter && <div style={styles.dropIndicator} />}
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

    // Only show labels for blocks that have actual content
    const visibleBlocks = blocks.filter((block) => block.textContent?.trim())

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
    <div ref={columnRef} style={styles.typeLabelsCol}>
      {labels.map((item, idx) => (
        <div key={idx} style={{ position: 'absolute', top: item.top, left: 4, zIndex: 20 }}>
          <button
            style={{ ...styles.typeLabelBtn, ...(['t', 'img', 'CTA'].includes(item.label) ? { cursor: 'default', opacity: 0.5 } : {}) }}
            onClick={(e) => { e.stopPropagation(); if (['t', 'img', 'CTA'].includes(item.label)) return; setOpenIdx(idx === openIdx ? -1 : idx) }}
            title={`Tipo actual: ${item.label}`}
          >
            {item.label}
          </button>

          {openIdx === idx && !['t', 'img', 'CTA'].includes(item.label) && (
            <div style={styles.typeLabelDropdown} onMouseLeave={() => setOpenIdx(-1)}>
              {getOptionsForLabel(item.label).filter((opt) => {
                if (item.label === '¶') return opt !== 'Párrafo'
                return opt !== item.label
              }).map((opt) => (
                <div
                  key={opt}
                  style={styles.typeLabelOption}
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
    <div ref={columnRef} style={styles.activityMarkersCol} aria-label="Alertas de revisión por sección">
      {markers.map((marker) => (
        <button
          key={marker.id}
          type="button"
          style={{
            ...styles.activityMarkerBtn,
            ...(marker.id === selectedActivityId ? styles.activityMarkerBtnActive : {}),
            top: marker.top,
          }}
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
function Toolbar({ editor, projectId }) {
  const [, forceUpdate] = useState(0)

  useEffect(() => {
    if (!editor) return
    const handler = () => forceUpdate((n) => n + 1)
    editor.on('transaction', handler)
    return () => editor.off('transaction', handler)
  }, [editor])

  async function handleImageUpload(e) {
    const file = e.target.files?.[0]
    if (!file || !editor) return
    try {
      if (!projectId) throw new Error('Proyecto no disponible')
      const formData = new FormData()
      formData.append('file', file)
      const data = await apiFetch(`/api/projects/${projectId}/assets`, {
        method: 'POST',
        body: formData,
      })

      if (!data.asset?.renderInline || !data.asset?.publicUrl) {
        window.alert('El archivo quedó guardado como adjunto. Los SVG no se insertan inline por seguridad.')
        return
      }

      editor.chain().focus().setImage({ src: data.asset.publicUrl, alt: data.asset.fileName }).run()
    } catch (error) {
      window.alert(error.message || 'No se pudo subir la imagen')
    } finally {
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

  const disabled = !editor

  return (
    <div style={styles.toolbar}>

      <select
        style={{ ...styles.blockSelect, opacity: disabled ? 0.5 : 1 }}
        disabled={disabled}
        value={getActiveBlockType()}
        onChange={(e) => {
          if (!editor) return
          const val = e.target.value
          if (val === 'paragraph') editor.chain().focus().setParagraph().run()
          else editor.chain().focus().setHeading({ level: parseInt(val) }).run()
        }}
      >
        <option value="paragraph">Párrafo</option>
        {[1, 2, 3, 4, 5, 6].map((l) => (
          <option key={l} value={String(l)}>H{l}</option>
        ))}
      </select>

      <div style={styles.toolbarSep} />

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

      <div style={styles.toolbarSep} />

      <label
        style={{ ...styles.toolBtn, cursor: disabled ? 'default' : 'pointer', position: 'relative' }}
        title="Color de texto"
      >
        <span style={{ borderBottom: '3px solid #2a2a2a', lineHeight: 1, paddingBottom: 1 }}>A</span>
        <input
          type="color"
          style={{ position: 'absolute', opacity: 0, width: 0, height: 0, pointerEvents: disabled ? 'none' : 'auto' }}
          onChange={(e) => editor?.chain().focus().setColor(e.target.value).run()}
        />
      </label>

      <div style={styles.toolbarSep} />

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

      <div style={styles.toolbarSep} />

      <TableGridPicker
        disabled={disabled}
        onInsert={(rows, cols) => editor?.chain().focus().insertTable({ rows, cols, withHeaderRow: true }).run()}
      />

      <div style={styles.toolbarSep} />

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
        style={{ ...styles.toolBtn, cursor: disabled ? 'default' : 'pointer' }}
        title="Insertar imagen"
      >
        🖼
        <input
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
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
      style={{
        ...styles.toolBtn,
        ...(active ? styles.toolBtnActive : {}),
        opacity: disabled ? 0.4 : 1,
        cursor: disabled ? 'default' : 'pointer',
      }}
      onClick={disabled ? undefined : onClick}
      title={title}
    >
      {children}
    </button>
  )
}

// Grid picker para insertar tablas con dimensiones personalizadas
function TableGridPicker({ disabled, onInsert }) {
  const [open, setOpen] = useState(false)
  const [hover, setHover] = useState({ r: 0, c: 0 })
  const maxRows = 8
  const maxCols = 8

  return (
    <div style={{ position: 'relative' }}>
      <ToolBtn disabled={disabled} onClick={() => setOpen((v) => !v)} title="Insertar tabla">
        <TableIcon size={16} />
      </ToolBtn>
      {open && (
        <div
          style={styles.tablePickerDropdown}
          onMouseLeave={() => setHover({ r: 0, c: 0 })}
        >
          <div style={styles.tablePickerLabel}>
            {hover.r > 0 ? `${hover.r} × ${hover.c}` : 'Elegir tamaño'}
          </div>
          <div style={styles.tablePickerGrid}>
            {Array.from({ length: maxRows }, (_, r) => (
              <div key={r} style={{ display: 'flex', gap: 2 }}>
                {Array.from({ length: maxCols }, (_, c) => (
                  <div
                    key={c}
                    onMouseEnter={() => setHover({ r: r + 1, c: c + 1 })}
                    onClick={() => { onInsert(r + 1, c + 1); setOpen(false); setHover({ r: 0, c: 0 }) }}
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: 2,
                      border: '1px solid',
                      borderColor: (r < hover.r && c < hover.c) ? '#0088ff' : '#d9d9d9',
                      backgroundColor: (r < hover.r && c < hover.c) ? '#e0f0ff' : '#fff',
                      cursor: 'pointer',
                      transition: 'all 0.05s',
                    }}
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
    <div style={styles.tableContextBar}>
      <ToolBtn onClick={() => editor.chain().focus().addColumnBefore().run()} title="Columna antes">
        <Columns3 size={14} /><span style={styles.tableCtxLabel}>+ Izq</span>
      </ToolBtn>
      <ToolBtn onClick={() => editor.chain().focus().addColumnAfter().run()} title="Columna después">
        <Columns3 size={14} /><span style={styles.tableCtxLabel}>+ Der</span>
      </ToolBtn>
      <ToolBtn onClick={() => editor.chain().focus().deleteColumn().run()} title="Eliminar columna">
        <Columns3 size={14} /><span style={{ ...styles.tableCtxLabel, color: '#ef4444' }}>−</span>
      </ToolBtn>

      <div style={styles.toolbarSep} />

      <ToolBtn onClick={() => editor.chain().focus().addRowBefore().run()} title="Fila antes">
        <Rows3 size={14} /><span style={styles.tableCtxLabel}>+ Arriba</span>
      </ToolBtn>
      <ToolBtn onClick={() => editor.chain().focus().addRowAfter().run()} title="Fila después">
        <Rows3 size={14} /><span style={styles.tableCtxLabel}>+ Abajo</span>
      </ToolBtn>
      <ToolBtn onClick={() => editor.chain().focus().deleteRow().run()} title="Eliminar fila">
        <Rows3 size={14} /><span style={{ ...styles.tableCtxLabel, color: '#ef4444' }}>−</span>
      </ToolBtn>

      <div style={styles.toolbarSep} />

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
    <div style={{ ...styles.tableCtxMenu, left: menu.x, top: menu.y }} onClick={(e) => e.stopPropagation()}>
      {items.map((item, i) =>
        item.divider
          ? <div key={i} style={styles.tableCtxMenuDivider} />
          : <div
              key={i}
              style={{ ...styles.tableCtxMenuItem, ...(item.danger ? { color: '#ef4444' } : {}) }}
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
        style={{
          ...styles.tableInlineBtn,
          top: pos.top,
          left: pos.right + 4,
          height: pos.height,
          width: 22,
        }}
        onClick={() => editor.chain().focus().addColumnAfter().run()}
        title="Agregar columna"
      >+</button>
      {/* + button at bottom edge (add row) */}
      <button
        style={{
          ...styles.tableInlineBtn,
          top: pos.bottom + 4,
          left: pos.left,
          width: pos.width,
          height: 22,
        }}
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
  initialContent,
  scrollRequest,
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
  const [activeSectionAddTop, setActiveSectionAddTop] = useState(null)

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: false }),
      Heading.configure({ levels: [1, 2, 3, 4, 5, 6] }),
      Image.configure({
        inline: false,
        HTMLAttributes: {
          style: 'max-height:300px; max-width:100%; height:auto; display:block;',
        },
      }),
      Link.configure({ openOnClick: false }),
      Underline,
      TextStyle,
      Color,
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      SectionDividerNode,
      CtaButtonNode,
    ],
    content: initialContent,
    onUpdate({ editor }) {
      onDocUpdate?.(editor)
    },
    onSelectionUpdate({ editor }) {
      const sectionInfo = getSectionInfoFromSelection(editor)
      if (sectionInfo) onSelectionSectionChange?.(sectionInfo)
    },
    onFocus({ editor }) {
      const sectionInfo = getSectionInfoFromSelection(editor)
      if (sectionInfo) onSelectionSectionChange?.(sectionInfo)
    },
  })

  // Report editor to parent when ready
  useEffect(() => {
    if (editor) onEditorReady?.(editor)
  }, [editor])

  useEffect(() => {
    return () => {
      if (programmaticScrollRafRef.current) {
        cancelAnimationFrame(programmaticScrollRafRef.current)
      }
    }
  }, [])

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

    if (scrollRequest.type === 'heading') {
      const headings = mapHeadingsInDOM(pm, firstSectionId)
      targetEl = headings.find(
        (heading) =>
          heading.sectionId === scrollRequest.sectionId &&
          heading.headingIndex === scrollRequest.headingIndex
      )?.el || null
      targetHeadingIndex = scrollRequest.headingIndex
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
      sectionId: scrollRequest.sectionId,
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
        onScrollHeadingChange?.({
          sectionId: scrollRequest.sectionId,
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
  }, [firstSectionId, onScrollHeadingChange, scrollRequest])

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
  }, [firstSectionId, onScrollHeadingChange])

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

  if (!editor) return <div style={styles.centerPanel} />

  return (
    <div style={styles.centerPanel}>
      <Toolbar editor={editor} projectId={projectId} />
      <TableContextBar editor={editor} />
      <div ref={scrollAreaRef} style={styles.editorScrollArea}>
        <div style={styles.editorPageRow}>
          <TypeLabelsColumn wrapperRef={wrapperRef} editor={editor} />
          <div style={styles.editorPage}>
            <div ref={wrapperRef} style={{ ...styles.sectionEditorContent, position: 'relative' }}>
              <EditorContent editor={editor} />
              <TableInlineButtons editor={editor} wrapperRef={wrapperRef} />
              <TableRightClickMenu editor={editor} />
              {activeSectionId && activeSectionAddTop !== null && (
                <div style={{ ...styles.canvasAddSectionWrap, top: activeSectionAddTop }}>
                  <button
                    style={styles.canvasAddSectionBtn}
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

function parseHandoffPage(page) {
  if (!page) return []
  const doc = htmlToDocument(page.fullContent || buildDocumentHTML(page.sections))
  const root = doc?.getElementById('root')
  if (!root) return []

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

    const label = blockLabel(element)
    const text = blockText(element)
    if (!text && !['img', 'table'].includes(label)) return

    currentSection.blocks.push({
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
    })
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

function HandoffPanel({ page, audience }) {
  const [copied, setCopied] = useState('')
  const sections = useMemo(() => parseHandoffPage(page), [page])

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

  return (
    <div style={styles.handoffPanel}>
      <div style={styles.handoffHeader}>
        <div>
          <p style={styles.handoffEyebrow}>{audience === 'designer' ? 'Designer handoff' : 'Developer handoff'}</p>
          <h2 style={styles.handoffTitle}>{page?.name || 'Página'}</h2>
        </div>
        <div style={styles.handoffHeaderActions}>
          <button style={styles.handoffActionBtn} onClick={() => handleCopy('Página copiada', { text: pageText, html: pageHtml })}>
            <Copy size={14} />
            Copiar página
          </button>
          {audience === 'dev' && (
            <button style={styles.handoffActionBtn} onClick={() => handleCopy('Markdown copiado', { text: pageMarkdown })}>
              <Code2 size={14} />
              Markdown
            </button>
          )}
        </div>
      </div>

      {copied && <p style={styles.copyFeedback}>{copied}</p>}

      <div style={styles.handoffScroll}>
        {sections.map((section) => {
          const sectionText = section.blocks.map((block) => block.text).join('\n')
          const sectionHtml = section.blocks.map((block) => block.html).join('\n')
          return (
            <section key={section.id} style={styles.handoffSection}>
              <div style={styles.handoffSectionHeader}>
                <h3 style={styles.handoffSectionTitle}>{section.name}</h3>
                <button style={styles.handoffGhostBtn} onClick={() => handleCopy('Sección copiada', { text: sectionText, html: sectionHtml })}>
                  <Copy size={13} />
                  Copiar sección
                </button>
              </div>

              <div style={styles.handoffBlockList}>
                {section.blocks.map((block) => (
                  <div key={block.id} style={styles.handoffBlockRow}>
                    <span style={styles.handoffGutter} aria-hidden="true">{block.label}</span>
                    <div style={styles.handoffCopySafe}>
                      {block.label === 'CTA' ? (
                        <span style={styles.handoffCtaText}>{block.text}</span>
                      ) : (
                        <div
                          style={styles.handoffBlockContent}
                          dangerouslySetInnerHTML={{ __html: block.html }}
                        />
                      )}
                    </div>
                    <div style={styles.handoffActions} aria-label="Acciones del bloque">
                      <button style={styles.handoffIconBtn} title="Copiar texto" onClick={() => handleCopy('Texto copiado', { text: block.text, html: block.html })}>
                        <Copy size={13} />
                      </button>
                      {block.links.map((link, index) => (
                        <button key={`${link.url}-${index}`} style={styles.handoffIconBtn} title={`Copiar URL: ${link.label}`} onClick={() => handleCopy('URL copiada', { text: link.url })}>
                          <Link2 size={13} />
                        </button>
                      ))}
                      {audience === 'dev' && (
                        <>
                          <button style={styles.handoffIconBtn} title="Copiar HTML" onClick={() => handleCopy('HTML copiado', { text: block.text, html: block.html })}>
                            <FileText size={13} />
                          </button>
                          <button style={styles.handoffIconBtn} title="Copiar JSON" onClick={() => handleCopy('JSON copiado', { text: JSON.stringify(block.json, null, 2) })}>
                            <Code2 size={13} />
                          </button>
                        </>
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
  )
}

function PreviewPanel({ page }) {
  return (
    <div style={styles.previewPanel}>
      <div style={styles.previewToolbar}>
        <div>
          <p style={styles.handoffEyebrow}>Preview</p>
          <h2 style={styles.handoffTitle}>{page?.name || 'Página'}</h2>
        </div>
        <button style={styles.handoffActionBtn} onClick={() => window.print()}>
          <FileText size={14} />
          Exportar PDF
        </button>
      </div>
      <article
        data-preview-page=""
        style={styles.previewPage}
        dangerouslySetInnerHTML={{ __html: page?.fullContent || buildDocumentHTML(page?.sections || []) }}
      />
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
  notifications = [],
  deliverables = [],
  sections = [],
  activePageId = '',
  selectedActivityId = null,
  error = '',
  notice = '',
  onRefresh,
  shareUrl = '',
  onCreateShareLink,
  onCreateDeliverable,
  onUpdateDeliverableStatus,
  onActivityClick,
  onMarkActivityRead,
}) {
  const [deliverableTitle, setDeliverableTitle] = useState('')
  const [deliverableServiceType, setDeliverableServiceType] = useState('otro')
  const [deliverableSubmitting, setDeliverableSubmitting] = useState(false)
  const pending = notifications.filter((item) => !item.readAt)
  const sectionOrder = useMemo(() => (
    new Map(sections.map((section, index) => [section.id, index]))
  ), [sections])
  const sectionActivity = useMemo(() => (
    activity
      .filter((item) => (
        isUnreadSectionActivity(item)
        && item.metadata?.pageId === activePageId
        && sectionOrder.has(item.metadata?.sectionId)
      ))
      .sort((a, b) => {
        const aIndex = sectionOrder.get(a.metadata.sectionId) ?? 9999
        const bIndex = sectionOrder.get(b.metadata.sectionId) ?? 9999
        if (aIndex !== bIndex) return aIndex - bIndex
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      })
  ), [activity, activePageId, sectionOrder])
  const generalActivity = useMemo(() => (
    activity.filter((item) => item.eventType !== 'section_edited')
  ), [activity])
  const hasActivity = sectionActivity.length > 0 || generalActivity.length > 0

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
    <div style={styles.rightPanel}>
      <div style={styles.updatesHeader}>
        <span style={styles.panelTitle}>Actividad</span>
        <button style={styles.updatesRefreshBtn} onClick={onRefresh}>Actualizar</button>
      </div>
      {error && <p style={styles.updatesError}>{error}</p>}
      {!error && notice && <p style={styles.updatesNotice}>{notice}</p>}
      {pending.length > 0 && (
        <div style={styles.pendingBox}>
          <span style={styles.pendingTitle}>Pendientes</span>
          {pending.slice(0, 4).map((item) => (
            <p key={item.id} style={styles.pendingItem}>{item.title}</p>
          ))}
        </div>
      )}
      <div style={styles.deliverablesBox}>
        <span style={styles.pendingTitle}>Entregables</span>
        <form style={styles.deliverableForm} onSubmit={submitDeliverable}>
          <input
            style={styles.deliverableInput}
            value={deliverableTitle}
            onChange={(event) => setDeliverableTitle(event.target.value)}
            placeholder="Nuevo entregable"
          />
          <select
            style={styles.deliverableSelect}
            value={deliverableServiceType}
            onChange={(event) => setDeliverableServiceType(event.target.value)}
          >
            {DELIVERABLE_SERVICE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          <button style={styles.deliverableButton} type="submit" disabled={deliverableSubmitting || !deliverableTitle.trim()}>
            {deliverableSubmitting ? 'Creando...' : 'Crear'}
          </button>
        </form>

        {deliverables.length === 0 ? (
          <p style={styles.deliverablesEmpty}>Sin entregables.</p>
        ) : (
          <div style={styles.deliverablesList}>
            {deliverables.slice(0, 6).map((item) => (
              <div key={item.id} style={styles.deliverableRow}>
                <div style={styles.deliverableText}>
                  <span style={styles.deliverableTitle}>{item.title}</span>
                  <span style={styles.deliverableMeta}>{item.serviceType} · {deliverableStatusLabel(item.status)}</span>
                </div>
                <select
                  style={styles.deliverableStatusSelect}
                  value={item.status}
                  onChange={(event) => onUpdateDeliverableStatus?.(item.id, event.target.value)}
                >
                  {DELIVERABLE_STATUS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        )}
      </div>
      <div style={styles.shareBox}>
        <span style={styles.pendingTitle}>Cliente</span>
        <button style={styles.shareButton} onClick={onCreateShareLink}>
          Crear link privado
        </button>
        {shareUrl && (
          <p style={styles.shareUrl}>Link copiado: {shareUrl}</p>
        )}
      </div>
      {!hasActivity ? (
        <p style={styles.updatesEmpty}>Sin actividad registrada aún.</p>
      ) : (
        <>
          {sectionActivity.length > 0 && (
            <ul style={styles.updatesList}>
              {sectionActivity.map((item) => (
                <ActivityListItem
                  key={item.id}
                  item={item}
                  selectedActivityId={selectedActivityId}
                  onActivityClick={onActivityClick}
                  onMarkActivityRead={onMarkActivityRead}
                />
              ))}
            </ul>
          )}
          {generalActivity.length > 0 && (
            <>
              <span style={styles.activityGroupTitle}>Actividad general</span>
              <ul style={styles.updatesListCompact}>
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
  )
}

function ActivityListItem({ item, selectedActivityId = null, onActivityClick, onMarkActivityRead }) {
  return (
    <li
      id={`activity-${item.id}`}
      style={{
        ...styles.updatesItem,
        ...(item.id === selectedActivityId ? styles.updatesItemActive : {}),
      }}
    >
      <button
        type="button"
        style={styles.updatesItemButton}
        onClick={() => onActivityClick?.(item)}
      >
        <span style={styles.updatesField}>{item.title}</span>
      </button>
      {item.description && <span style={styles.updatesDescription}>{item.description}</span>}
      <span style={styles.updatesDatetime}>
        {item.actorLabel} · {formatPanelDate(item.createdAt)}
      </span>
      {isUnreadSectionActivity(item) && (
        <button
          type="button"
          style={styles.markReadBtn}
          onClick={() => onMarkActivityRead?.(item.id)}
        >
          Marcar leída
        </button>
      )}
    </li>
  )
}

// ---------------------------------------------------------------------------
// Estilos
// ---------------------------------------------------------------------------
const selectChevronBackground = "url(\"data:image/svg+xml,%3csvg width='16' height='16' viewBox='0 0 24 24' fill='none' xmlns='http://www.w3.org/2000/svg'%3e%3cpath d='m6 9 6 6 6-6' stroke='%2364758b' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3e%3c/svg%3e\")"

const compactSelectChevron = {
  appearance: 'none',
  backgroundImage: selectChevronBackground,
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 10px center',
  backgroundSize: '16px 16px',
}

const styles = {

  // ── Root ──
  root: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    fontFamily: "'Inter', system-ui, sans-serif",
    backgroundColor: '#f8f8f8',
    overflow: 'hidden',
    color: '#2a2a2a',
  },
  loadingState: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    fontFamily: "'Inter', system-ui, sans-serif",
    backgroundColor: '#f8f8f8',
    color: '#2a2a2a',
  },

  // ── Navbar ──
  navbar: {
    display: 'grid',
    gridTemplateColumns: '260px minmax(0, 1fr) 96px',
    alignItems: 'center',
    height: 70,
    backgroundColor: '#f0f0f0',
    borderBottom: '1px solid #212222',
    flexShrink: 0,
    padding: '0 24px',
  },
  navLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 38,
  },
  navLogo: {
    fontSize: 35,
    color: '#2a2a2a',
    cursor: 'pointer',
    lineHeight: 1,
    userSelect: 'none',
  },
  navUndoRedo: {
    display: 'flex',
    alignItems: 'center',
    gap: 33,
  },
  navCenter: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
    minWidth: 0,
    overflowX: 'auto',
    padding: '0 8px',
  },
  navPillWrapper: {
    display: 'flex',
    alignItems: 'center',
    height: 30,
    borderRadius: 100,
    backgroundColor: '#f8f8f8',
    position: 'relative',
  },
  navPillWrapperActive: {
    backgroundColor: '#212222',
  },
  navPill: {
    height: 30,
    padding: '0 4px 0 14px',
    borderRadius: 0,
    border: 'none',
    backgroundColor: 'transparent',
    color: '#2a2a2a',
    fontSize: 13,
    fontWeight: 400,
    cursor: 'pointer',
    fontFamily: 'inherit',
    display: 'flex',
    alignItems: 'center',
  },
  navPillActive: {
    height: 30,
    padding: '0 4px 0 14px',
    borderRadius: 0,
    border: 'none',
    backgroundColor: 'transparent',
    color: '#f2f2f2',
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
    fontFamily: 'inherit',
    display: 'flex',
    alignItems: 'center',
  },
  navPillMenuBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: '0 8px 0 2px',
    height: 30,
    opacity: 0.5,
    transition: 'opacity 0.15s',
  },
  navPillMenu: {
    position: 'absolute',
    top: '100%',
    right: 0,
    marginTop: 4,
    backgroundColor: '#fff',
    borderRadius: 8,
    boxShadow: '0 4px 16px rgba(0,0,0,0.14)',
    padding: '4px 0',
    zIndex: 100,
    minWidth: 130,
  },
  navPillMenuItem: {
    padding: '8px 14px',
    fontSize: 13,
    color: '#2a2a2a',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  navPillInput: {
    height: 30,
    padding: '0 8px 0 14px',
    border: 'none',
    outline: 'none',
    fontSize: 13,
    fontWeight: 500,
    fontFamily: 'inherit',
    width: 90,
  },
  navPillAdd: {
    width: 30,
    height: 30,
    borderRadius: 100,
    border: 'none',
    backgroundColor: '#f8f8f8',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  navRight: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 14,
  },
  navIcons: {
    display: 'flex',
    alignItems: 'center',
    gap: 20,
  },
  navIconBtn: {
    padding: 0,
    border: 'none',
    backgroundColor: 'transparent',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  navSaveBtn: {
    padding: '10px 20px',
    backgroundColor: '#0088ff',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    fontSize: 16,
    fontWeight: 500,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  navReviewBtn: {
    height: 32,
    padding: '0 12px',
    backgroundColor: '#212222',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  reviewStatusDraft: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: 600,
  },
  reviewStatusReady: {
    color: '#0f766e',
    fontSize: 12,
    fontWeight: 600,
  },
  saveStatus: {
    minWidth: 84,
    textAlign: 'right',
    fontSize: 12,
    color: '#64748b',
  },

  floatingBar: {
    position: 'fixed',
    left: '50%',
    bottom: 22,
    transform: 'translateX(-50%)',
    zIndex: 120,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    maxWidth: 'calc(100vw - 48px)',
    minHeight: 48,
    flexWrap: 'wrap',
    padding: '7px 8px',
    border: '1px solid rgba(33, 34, 34, 0.12)',
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.94)',
    boxShadow: '0 14px 36px rgba(15, 23, 42, 0.16)',
    backdropFilter: 'blur(12px)',
  },
  floatingGroup: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    whiteSpace: 'nowrap',
  },
  floatingDivider: {
    width: 1,
    height: 28,
    backgroundColor: '#e5e7eb',
  },
  floatingSegment: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 2,
    padding: 3,
    borderRadius: 10,
    backgroundColor: '#f4f4f5',
  },
  floatingModeBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    height: 30,
    padding: '0 10px',
    border: 'none',
    borderRadius: 8,
    backgroundColor: 'transparent',
    color: '#64748b',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  floatingModeBtnActive: {
    backgroundColor: '#212222',
    color: '#fff',
  },
  floatingStatusDraft: {
    minWidth: 44,
    color: '#64748b',
    fontSize: 12,
    fontWeight: 700,
    textAlign: 'center',
  },
  floatingStatusReady: {
    minWidth: 70,
    color: '#0f766e',
    fontSize: 12,
    fontWeight: 700,
    textAlign: 'center',
  },
  floatingReviewBtn: {
    height: 32,
    padding: '0 12px',
    border: 'none',
    borderRadius: 9,
    backgroundColor: '#212222',
    color: '#fff',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  floatingSaveStatus: {
    minWidth: 72,
    color: '#64748b',
    fontSize: 12,
    fontWeight: 600,
    textAlign: 'right',
  },
  floatingSaveBtn: {
    height: 32,
    padding: '0 14px',
    border: 'none',
    borderRadius: 9,
    backgroundColor: '#0088ff',
    color: '#fff',
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  floatingBtnDisabled: {
    opacity: 0.48,
    cursor: 'not-allowed',
  },

  // ── Layout de 3 columnas ──
  body: {
    display: 'flex',
    flex: 1,
    overflow: 'hidden',
  },

  // ── Sidebar izquierdo ──
  leftPanel: {
    width: 290,
    flexShrink: 0,
    backgroundColor: '#fff',
    borderRight: '1px solid #212222',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  panelHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '24px 30px 16px',
    flexShrink: 0,
  },
  panelTitle: {
    fontSize: 12,
    fontWeight: 700,
    color: '#2a2a2a',
    letterSpacing: '0.01em',
  },
  panelAddBtn: {
    padding: 0,
    border: 'none',
    backgroundColor: 'transparent',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionList: {
    flex: 1,
    overflowY: 'auto',
    padding: '0 30px 30px',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  sectionItem: {
    display: 'flex',
    flexDirection: 'column',
    userSelect: 'none',
    transition: 'opacity 0.15s',
  },
  dragHandle: {
    cursor: 'grab',
    display: 'flex',
    alignItems: 'center',
    padding: '2px 0',
    opacity: 0.4,
    marginRight: -2,
  },
  dropIndicator: {
    height: 2,
    backgroundColor: '#0088ff',
    borderRadius: 1,
    margin: '0 10px',
  },
  sectionNavBtn: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '5px 10px',
    borderRadius: 6,
    border: '1px solid transparent',
    cursor: 'pointer',
    backgroundColor: 'transparent',
  },
  sectionNavBtnActive: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '5px 10px',
    borderRadius: 6,
    border: '1px solid #212222',
    cursor: 'pointer',
    backgroundColor: 'transparent',
  },
  sectionNavLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    overflow: 'hidden',
    flex: 1,
  },
  sectionName: {
    fontSize: 15,
    fontWeight: 500,
    color: '#2a2a2a',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    flex: 1,
  },
  sectionNameInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: 500,
    padding: '0 4px',
    border: '1px solid #0088ff',
    borderRadius: 3,
    outline: 'none',
    fontFamily: 'inherit',
    color: '#2a2a2a',
  },
  menuBtn: {
    padding: 0,
    border: 'none',
    backgroundColor: 'transparent',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  menu: {
    position: 'absolute',
    right: 0,
    top: '100%',
    marginTop: 4,
    backgroundColor: '#fff',
    border: '1px solid #d9d9d9',
    borderRadius: 6,
    boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
    zIndex: 100,
    minWidth: 140,
    overflow: 'hidden',
  },
  menuItem: {
    padding: '10px 16px',
    fontSize: 13,
    cursor: 'pointer',
    color: '#2a2a2a',
  },
  sectionContent: {
    paddingLeft: 25,
    paddingTop: 6,
  },
  sectionPreviewItem: {
    borderLeft: '2px solid #d9d9d9',
    paddingLeft: 10,
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  sectionPreviewItemActive: {
    borderLeft: '2px solid #0088ff',
    paddingLeft: 10,
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  sectionPreviewTitle: {
    fontSize: 14,
    fontWeight: 700,
    color: '#2a2a2a',
  },
  sectionPreviewSubtitle: {
    fontSize: 14,
    fontWeight: 400,
    color: '#888',
  },
  emptyMsg: {
    fontSize: 13,
    color: '#aaa',
    margin: 0,
    paddingTop: 8,
  },

  // ── Panel central ──
  centerPanel: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    backgroundColor: '#f2f2f2',
  },

  toolbar: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    padding: '8px 16px',
    backgroundColor: '#fff',
    borderBottom: '1px solid #d9d9d9',
    flexShrink: 0,
  },
  blockSelect: {
    ...compactSelectChevron,
    padding: '4px 34px 4px 10px',
    border: '1px solid #d9d9d9',
    borderRadius: 5,
    fontSize: 13,
    color: '#2a2a2a',
    backgroundColor: '#fff',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  toolbarSep: {
    width: 1,
    height: 20,
    backgroundColor: '#d9d9d9',
    margin: '0 4px',
    flexShrink: 0,
  },
  toolBtn: {
    padding: '4px 10px',
    border: '1px solid transparent',
    borderRadius: 5,
    backgroundColor: 'transparent',
    cursor: 'pointer',
    fontSize: 14,
    color: '#2a2a2a',
    fontFamily: 'inherit',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 2,
  },
  toolBtnActive: {
    backgroundColor: '#f0f0f0',
    border: '1px solid #d9d9d9',
  },

  // ── Table grid picker ──
  tablePickerDropdown: {
    position: 'absolute',
    top: '100%',
    left: 0,
    marginTop: 4,
    backgroundColor: '#fff',
    borderRadius: 8,
    boxShadow: '0 4px 16px rgba(0,0,0,0.14)',
    padding: '10px 12px',
    zIndex: 200,
  },
  tablePickerLabel: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
    marginBottom: 6,
    fontWeight: 500,
  },
  tablePickerGrid: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },

  // ── Table context bar ──
  tableContextBar: {
    display: 'flex',
    alignItems: 'center',
    gap: 2,
    padding: '4px 16px',
    backgroundColor: '#fafafa',
    borderBottom: '1px solid #e8e8e8',
    flexShrink: 0,
  },
  tableCtxLabel: {
    fontSize: 11,
    fontWeight: 500,
    marginLeft: 2,
  },

  // ── Table right-click context menu ──
  tableCtxMenu: {
    position: 'absolute',
    backgroundColor: '#fff',
    borderRadius: 8,
    boxShadow: '0 4px 16px rgba(0,0,0,0.16)',
    padding: '4px 0',
    zIndex: 300,
    minWidth: 180,
  },
  tableCtxMenuItem: {
    padding: '7px 14px',
    fontSize: 13,
    color: '#2a2a2a',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  tableCtxMenuDivider: {
    height: 1,
    backgroundColor: '#e8e8e8',
    margin: '4px 0',
  },

  // ── Table inline "+" buttons ──
  tableInlineBtn: {
    position: 'absolute',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f0f0f0',
    border: '1px solid #d9d9d9',
    borderRadius: 4,
    color: '#888',
    fontSize: 16,
    fontWeight: 600,
    cursor: 'pointer',
    opacity: 0.6,
    transition: 'opacity 0.15s, background-color 0.15s',
    zIndex: 10,
  },

  editorScrollArea: {
    flex: 1,
    overflowY: 'scroll',
    padding: 10,
    position: 'relative',
  },

  editorPageRow: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'flex-start',
    maxWidth: 890,
    margin: '0 auto',
  },

  editorPage: {
    flex: 1,
    maxWidth: 800,
    minHeight: 'calc(100vh - 120px)',
    backgroundColor: '#f8f8f8',
    border: '1px solid #d9d9d9',
    borderRadius: 4,
    padding: '60px 50px 1000px',
  },

  // ── Separador de sección (usado por el NodeView) ──
  sectionDivider: {
    margin: '20px 0 12px',
  },
  sectionDividerLabel: {
    display: 'block',
    fontSize: 12,
    fontWeight: 600,
    color: '#999',
    marginBottom: 6,
    userSelect: 'none',
  },
  sectionDividerHr: {
    border: 'none',
    borderTop: '1px solid #d9d9d9',
    margin: 0,
  },
  ctaNode: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 10,
    margin: '10px 0',
  },
  ctaNodeButton: {
    display: 'inline-flex',
    alignItems: 'center',
    minHeight: 38,
    padding: '0 16px',
    borderRadius: 8,
    backgroundColor: '#212222',
    color: '#fff',
    fontSize: 14,
    fontWeight: 500,
    textDecoration: 'none',
  },
  ctaNodeEdit: {
    border: '1px solid #d9d9d9',
    borderRadius: 999,
    backgroundColor: '#fff',
    color: '#64748b',
    fontSize: 12,
    fontWeight: 500,
    padding: '6px 10px',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },

  typeLabelsCol: {
    position: 'relative',
    width: 48,
    flexShrink: 0,
  },

  activityMarkersCol: {
    position: 'relative',
    width: 42,
    flexShrink: 0,
  },

  activityMarkerBtn: {
    position: 'absolute',
    left: 10,
    width: 26,
    height: 26,
    border: '1px solid #d9d9d9',
    borderRadius: 999,
    backgroundColor: '#fff7ed',
    color: '#c2410c',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
    cursor: 'pointer',
    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
    zIndex: 20,
  },

  activityMarkerBtnActive: {
    backgroundColor: '#212222',
    borderColor: '#212222',
    color: '#fff',
  },

  typeLabelBtn: {
    width: 30,
    height: 30,
    backgroundColor: '#d0d0d0',
    border: 'none',
    borderRadius: 6,
    fontSize: 11,
    fontWeight: 600,
    color: '#2a2a2a',
    cursor: 'pointer',
    fontFamily: 'inherit',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
  },

  typeLabelDropdown: {
    position: 'absolute',
    left: 34,
    top: 0,
    backgroundColor: '#fff',
    border: '1px solid #d9d9d9',
    borderRadius: 6,
    boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
    zIndex: 50,
    minWidth: 110,
    overflow: 'hidden',
  },
  typeLabelOption: {
    padding: '8px 14px',
    fontSize: 13,
    cursor: 'pointer',
    color: '#2a2a2a',
    fontFamily: 'inherit',
  },

  sectionEditorContent: {
    position: 'relative',
  },

  canvasAddSectionWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    display: 'flex',
    justifyContent: 'center',
    pointerEvents: 'none',
    zIndex: 20,
  },
  canvasAddSectionBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '8px 12px',
    border: '1px dashed #b8b8b8',
    borderRadius: 999,
    backgroundColor: '#fff',
    color: '#2a2a2a',
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
    fontFamily: 'inherit',
    boxShadow: '0 2px 10px rgba(0,0,0,0.06)',
    pointerEvents: 'auto',
  },

  infoCol: {
    width: 36,
    flexShrink: 0,
    display: 'flex',
    justifyContent: 'center',
    paddingTop: 4,
  },

  // ── Handoff / Preview ──
  handoffPanel: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    backgroundColor: '#f2f2f2',
  },
  handoffHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 16,
    padding: '18px 24px',
    backgroundColor: '#fff',
    borderBottom: '1px solid #d9d9d9',
  },
  handoffEyebrow: {
    margin: '0 0 4px',
    color: '#64748b',
    fontSize: 12,
    fontWeight: 600,
  },
  handoffTitle: {
    margin: 0,
    color: '#2a2a2a',
    fontSize: 22,
    lineHeight: 1.2,
    fontWeight: 600,
  },
  handoffHeaderActions: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
  },
  handoffActionBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    border: '1px solid #d9d9d9',
    borderRadius: 999,
    backgroundColor: '#fff',
    color: '#2a2a2a',
    fontSize: 13,
    fontWeight: 500,
    padding: '8px 12px',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  handoffGhostBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    border: 'none',
    backgroundColor: 'transparent',
    color: '#64748b',
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  copyFeedback: {
    margin: '10px 24px 0',
    color: '#0f766e',
    fontSize: 13,
    fontWeight: 500,
  },
  handoffScroll: {
    flex: 1,
    overflowY: 'auto',
    padding: '20px 24px 80px',
  },
  handoffSection: {
    maxWidth: 920,
    margin: '0 auto 18px',
    border: '1px solid #d9d9d9',
    borderRadius: 8,
    backgroundColor: '#fff',
    boxShadow: '0 1px 3px rgba(15, 23, 42, 0.06)',
  },
  handoffSectionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    padding: '14px 16px',
    borderBottom: '1px solid #e8e8e8',
  },
  handoffSectionTitle: {
    margin: 0,
    fontSize: 17,
    lineHeight: 1.25,
    fontWeight: 600,
    color: '#2a2a2a',
  },
  handoffBlockList: {
    display: 'flex',
    flexDirection: 'column',
  },
  handoffBlockRow: {
    display: 'grid',
    gridTemplateColumns: '54px minmax(0, 1fr) auto',
    gap: 12,
    alignItems: 'start',
    padding: '12px 16px',
    borderBottom: '1px solid #f0f0f0',
  },
  handoffGutter: {
    userSelect: 'none',
    alignSelf: 'start',
    justifySelf: 'start',
    minWidth: 34,
    padding: '4px 7px',
    borderRadius: 6,
    backgroundColor: '#f1f5f9',
    color: '#64748b',
    fontSize: 11,
    fontWeight: 600,
    textAlign: 'center',
  },
  handoffCopySafe: {
    minWidth: 0,
    color: '#2a2a2a',
    fontSize: 14,
    lineHeight: 1.65,
  },
  handoffBlockContent: {
    minWidth: 0,
  },
  handoffCtaText: {
    display: 'inline-flex',
    alignItems: 'center',
    minHeight: 34,
    padding: '0 14px',
    borderRadius: 8,
    backgroundColor: '#212222',
    color: '#fff',
    fontSize: 14,
    fontWeight: 500,
  },
  handoffActions: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    userSelect: 'none',
  },
  handoffIconBtn: {
    width: 28,
    height: 28,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: '1px solid #d9d9d9',
    borderRadius: 6,
    backgroundColor: '#fff',
    color: '#64748b',
    cursor: 'pointer',
  },
  previewPanel: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    backgroundColor: '#f2f2f2',
  },
  previewToolbar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 16,
    padding: '18px 24px',
    backgroundColor: '#fff',
    borderBottom: '1px solid #d9d9d9',
  },
  previewPage: {
    width: 820,
    maxWidth: 'calc(100% - 48px)',
    margin: '24px auto 80px',
    padding: '56px 64px',
    backgroundColor: '#fff',
    border: '1px solid #d9d9d9',
    borderRadius: 6,
    color: '#2a2a2a',
    lineHeight: 1.65,
    overflowY: 'auto',
  },

  // ── Sidebar derecho ──
  rightPanel: {
    width: 280,
    flexShrink: 0,
    backgroundColor: '#fff',
    borderLeft: '1px solid #212222',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    padding: 30,
  },
  updatesHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },
  updatesRefreshBtn: {
    border: '1px solid #d9d9d9',
    borderRadius: 999,
    backgroundColor: '#fff',
    color: '#64748b',
    fontSize: 12,
    fontWeight: 500,
    padding: '5px 9px',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  updatesError: {
    margin: '12px 0 0',
    color: '#dc2626',
    fontSize: 13,
    lineHeight: 1.4,
  },
  updatesNotice: {
    margin: '12px 0 0',
    color: '#64748b',
    fontSize: 13,
    lineHeight: 1.4,
  },
  pendingBox: {
    marginTop: 16,
    padding: 12,
    border: '1px solid #d9d9d9',
    borderRadius: 8,
    backgroundColor: '#f8fafc',
  },
  pendingTitle: {
    display: 'block',
    marginBottom: 8,
    color: '#2a2a2a',
    fontSize: 12,
    fontWeight: 600,
  },
  pendingItem: {
    margin: '6px 0 0',
    color: '#64748b',
    fontSize: 13,
    lineHeight: 1.4,
  },
  deliverablesBox: {
    marginTop: 16,
    padding: 12,
    border: '1px solid #d9d9d9',
    borderRadius: 8,
    backgroundColor: '#fff',
  },
  deliverableForm: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) 82px',
    gap: 8,
  },
  deliverableInput: {
    minWidth: 0,
    height: 34,
    border: '1px solid #d9d9d9',
    borderRadius: 8,
    padding: '0 10px',
    color: '#2a2a2a',
    fontSize: 13,
    fontFamily: 'inherit',
  },
  deliverableSelect: {
    ...compactSelectChevron,
    height: 34,
    border: '1px solid #d9d9d9',
    borderRadius: 8,
    padding: '0 30px 0 10px',
    backgroundColor: '#fff',
    color: '#2a2a2a',
    fontSize: 12,
    fontFamily: 'inherit',
    backgroundPosition: 'right 8px center',
    backgroundSize: '14px 14px',
  },
  deliverableButton: {
    gridColumn: '1 / -1',
    minHeight: 32,
    border: 'none',
    borderRadius: 8,
    backgroundColor: '#212222',
    color: '#fff',
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  deliverablesEmpty: {
    margin: '10px 0 0',
    color: '#64748b',
    fontSize: 13,
    lineHeight: 1.4,
  },
  deliverablesList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    marginTop: 10,
  },
  deliverableRow: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) 92px',
    alignItems: 'center',
    gap: 8,
    padding: 8,
    border: '1px solid #eef2f7',
    borderRadius: 8,
    backgroundColor: '#f8fafc',
  },
  deliverableText: {
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 3,
  },
  deliverableTitle: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    color: '#2a2a2a',
    fontSize: 13,
    fontWeight: 600,
  },
  deliverableMeta: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    color: '#64748b',
    fontSize: 11,
  },
  deliverableStatusSelect: {
    ...compactSelectChevron,
    width: '100%',
    height: 30,
    border: '1px solid #d9d9d9',
    borderRadius: 8,
    padding: '0 30px 0 8px',
    backgroundColor: '#fff',
    color: '#2a2a2a',
    fontSize: 11,
    fontFamily: 'inherit',
    backgroundPosition: 'right 8px center',
    backgroundSize: '14px 14px',
  },
  shareBox: {
    marginTop: 16,
    padding: 12,
    border: '1px solid #d9d9d9',
    borderRadius: 8,
    backgroundColor: '#fff',
  },
  shareButton: {
    width: '100%',
    minHeight: 34,
    border: 'none',
    borderRadius: 8,
    backgroundColor: '#212222',
    color: '#fff',
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  shareUrl: {
    margin: '8px 0 0',
    color: '#64748b',
    fontSize: 12,
    lineHeight: 1.45,
    wordBreak: 'break-all',
  },

  updatesEmpty: {
    fontSize: 14,
    color: '#999',
    margin: 0,
    marginTop: 16,
  },

  updatesList: {
    listStyle: 'none',
    margin: 0,
    marginTop: 16,
    padding: 0,
  },

  updatesListCompact: {
    listStyle: 'none',
    margin: 0,
    marginTop: 8,
    padding: 0,
  },

  activityGroupTitle: {
    display: 'block',
    marginTop: 18,
    color: '#64748b',
    fontSize: 12,
    fontWeight: 600,
  },

  updatesItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    borderBottom: '1px solid #d9d9d9',
    padding: '10px 0',
  },

  updatesItemActive: {
    backgroundColor: '#fff7ed',
    marginLeft: -10,
    marginRight: -10,
    paddingLeft: 10,
    paddingRight: 10,
    borderRadius: 8,
  },

  updatesItemButton: {
    padding: 0,
    border: 'none',
    backgroundColor: 'transparent',
    color: 'inherit',
    textAlign: 'left',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },

  updatesField: {
    fontSize: 13,
    fontWeight: 600,
    color: '#2a2a2a',
  },
  updatesDescription: {
    fontSize: 12,
    color: '#64748b',
    lineHeight: 1.4,
  },

  updatesDatetime: {
    fontSize: 12,
    color: '#999',
  },

  updatesLink: {
    fontSize: 12,
    color: '#0088ff',
    textDecoration: 'none',
    marginTop: 2,
    alignSelf: 'flex-start',
  },
  markReadBtn: {
    alignSelf: 'flex-start',
    marginTop: 6,
    border: '1px solid #d9d9d9',
    borderRadius: 999,
    backgroundColor: '#fff',
    color: '#64748b',
    fontSize: 12,
    fontWeight: 500,
    padding: '5px 9px',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },

  // ── Modal ──
  modalOverlay: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 200,
  },

  modal: {
    backgroundColor: '#fff',
    borderRadius: 8,
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.18)',
    padding: '24px 28px',
    width: 320,
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
  },

  modalTitle: {
    fontSize: 14,
    fontWeight: 600,
    color: '#2a2a2a',
    margin: 0,
  },

  modalInput: {
    padding: '9px 12px',
    border: '1px solid #d9d9d9',
    borderRadius: 6,
    fontSize: 14,
    color: '#2a2a2a',
    outline: 'none',
    fontFamily: 'inherit',
  },

  modalActions: {
    display: 'flex',
    gap: 10,
  },

  modalBtnPrimary: {
    flex: 1,
    padding: '8px 0',
    backgroundColor: '#2a2a2a',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    fontSize: 14,
    fontWeight: 500,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },

  modalBtnSecondary: {
    flex: 1,
    padding: '8px 0',
    backgroundColor: 'transparent',
    color: '#64748b',
    border: '1px solid #d9d9d9',
    borderRadius: 6,
    fontSize: 14,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },

  // ── Confirm delete modal ──
  confirmOverlay: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0,0,0,0.35)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
  },
  confirmBox: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: '28px 32px 24px',
    minWidth: 340,
    maxWidth: 400,
    boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
  },
  confirmText: {
    fontSize: 15,
    fontWeight: 500,
    color: '#2a2a2a',
    margin: '0 0 6px',
  },
  confirmSubtext: {
    fontSize: 13,
    color: '#888',
    margin: '0 0 20px',
  },
  confirmActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 10,
  },
  confirmCancelBtn: {
    padding: '8px 18px',
    borderRadius: 8,
    border: '1px solid #d9d9d9',
    backgroundColor: '#fff',
    color: '#2a2a2a',
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  confirmDeleteBtn: {
    padding: '8px 18px',
    borderRadius: 8,
    border: 'none',
    backgroundColor: '#ef4444',
    color: '#fff',
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
}
