import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useEditor, EditorContent, NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react'
import { Node, mergeAttributes } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import Heading from '@tiptap/extension-heading'
import Image from '@tiptap/extension-image'
import Link from '@tiptap/extension-link'
import { Underline } from '@tiptap/extension-underline'
import { TextStyle, Color } from '@tiptap/extension-text-style'
import { Undo2, Redo2, Plus, Bell, User, MoreVertical, Tag, Info } from 'lucide-react'

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
    const hasContent = node.content && node.content.some(
      (child) => child.text && child.text.trim().length > 0
    )
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

  const [pages, setPages]               = useState(MOCK_PAGES)
  const [activePageId, setActivePageId] = useState(MOCK_PAGES[0].id)
  const [activeSectionId, setActiveSectionId] = useState(MOCK_PAGES[0].sections[0].id)
  // Heading activo en el editor — { sectionId, headingIndex } | null
  const [activeHeading, setActiveHeading] = useState(null)
  // Sections derivadas del contenido del editor (source of truth = editor)
  const [derivedSections, setDerivedSections] = useState([])
  const [sectionModalState, setSectionModalState] = useState({
    isOpen: false,
    insertAfterSectionId: null,
  })

  // scrollRequest: navegación programática desde el sidebar.
  const [scrollRequest, setScrollRequest] = useState(null)

  // Ref al editor único
  const editorRef = useRef(null)

  const activePage = pages.find((p) => p.id === activePageId)

  // ── Contenido inicial para el editor ──
  const initialContentRef = useRef(buildDocumentHTML(MOCK_PAGES[0].sections))

  // ── Callback cuando el editor se actualiza ──
  // Flag to prevent re-entrant auto-remove
  const isAutoRemoving = useRef(false)
  const isRenumberingSections = useRef(false)
  // Secciones creadas manualmente y todavía vacías: no se auto-eliminan
  const protectedEmptySectionIds = useRef(new Set())

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

  // ── Navega a otra página: guarda contenido actual y carga la nueva ──
  function handlePageClick(pageId) {
    const newPage = pages.find((p) => p.id === pageId)
    if (!newPage) return

    // Guardar contenido actual de la página que estamos dejando
    if (editorRef.current && activePage) {
      const html = editorRef.current.getHTML()
      setPages((prev) =>
        prev.map((page) =>
          page.id === activePageId ? { ...page, fullContent: html } : page
        )
      )
    }

    setActivePageId(pageId)

    // Cargar contenido de la nueva página
    const content = newPage.fullContent || buildDocumentHTML(newPage.sections)

    if (editorRef.current) {
      protectedEmptySectionIds.current = new Set()
      editorRef.current.commands.setContent(content)
      renumberAutoSections(editorRef.current)
      const sections = deriveSectionsFromDoc(editorRef.current)
      setDerivedSections(sections)
      const firstId = sections[0]?.id ?? null
      setActiveSectionId(firstId)
      if (firstId) {
        setScrollRequest({ type: 'section', sectionId: firstId, requestId: Date.now() })
      }
    }
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

  // ── Agrega una nueva página ──
  function addPage() {
    const id = `page_${Date.now()}`
    const sectionId = `s_${Date.now()}`
    const newPage = {
      id,
      name: 'Nueva página',
      sections: [{ id: sectionId, name: 'Sección 1', content: '<p></p>' }],
    }
    setPages((prev) => [...prev, newPage])
    setActivePageId(id)

    if (editorRef.current) {
      protectedEmptySectionIds.current = new Set()
      const html = buildDocumentHTML(newPage.sections)
      editorRef.current.commands.setContent(html)
      renumberAutoSections(editorRef.current)
      const sections = deriveSectionsFromDoc(editorRef.current)
      setDerivedSections(sections)
    }
    setActiveSectionId(sectionId)
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
      `}</style>

      {/* ── NAVBAR ── */}
      <Navbar
        pages={pages}
        activePageId={activePageId}
        onPageClick={handlePageClick}
        onAddPage={addPage}
        onUndo={() => editorRef.current?.chain().focus().undo().run()}
        onRedo={() => editorRef.current?.chain().focus().redo().run()}
        onLogoClick={() => navigate('/dashboard')}
      />

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
          activeHeading={activeHeading}
          onHeadingClick={handleHeadingClick}
        />

        {/* Área central: editor */}
        <EditorPanel
          initialContent={initialContentRef.current}
          scrollRequest={scrollRequest}
          onDocUpdate={handleDocUpdate}
          onEditorReady={handleEditorReady}
          onScrollHeadingChange={handleScrollHeadingChange}
          onSelectionSectionChange={handleSelectionFocus}
          firstSectionId={derivedSections[0]?.id ?? ''}
          activeSectionId={activeSectionId}
          onOpenAddSectionAfter={(sectionId) => openSectionModal(sectionId)}
        />

        {/* Sidebar derecho: actualizaciones del documento */}
        <UpdatesPanel changes={[]} />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Navbar — 3 columnas: [logo + undo/redo] | [pills] | [iconos + save]
// ---------------------------------------------------------------------------
function Navbar({ pages, activePageId, onPageClick, onAddPage, onUndo, onRedo, onLogoClick }) {
  return (
    <div style={styles.navbar}>

      {/* Columna izquierda: Logo + Undo/Redo */}
      <div style={styles.navLeft}>
        <span style={styles.navLogo} onClick={onLogoClick}>
          <span style={{ fontWeight: 200 }}>Web</span>
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
          <button
            key={page.id}
            style={page.id === activePageId ? styles.navPillActive : styles.navPill}
            onClick={() => onPageClick(page.id)}
          >
            {page.name}
          </button>
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
        <button style={styles.navSaveBtn}>Save</button>
      </div>

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
function SectionsPanel({ sections, activeSectionId, onSectionClick, onOpenAddSectionModal, onRename, onDelete, activeHeading, onHeadingClick }) {
  return (
    <div style={styles.leftPanel}>
      <div style={styles.panelHeader}>
        <span style={styles.panelTitle}>Page sections</span>
        <button style={styles.panelAddBtn} onClick={onOpenAddSectionModal} title="Agregar sección">
          <Plus size={24} color="#2a2a2a" />
        </button>
      </div>
      <div style={styles.sectionList}>
        {sections.map((section) => (
          <SectionItem
            key={section.id}
            section={section}
            isActive={section.id === activeSectionId}
            onClick={() => onSectionClick(section.id)}
            onRename={(name) => onRename(section.id, name)}
            onDelete={() => onDelete(section.id)}
            headings={section.headings || []}
            sectionId={section.id}
            activeHeading={activeHeading}
            onHeadingClick={onHeadingClick}
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
function SectionItem({ section, isActive, onClick, onRename, onDelete, headings = [], sectionId, activeHeading, onHeadingClick: onHeadingClickProp }) {

  // ── Scroll al heading correspondiente en el editor al hacer click ──
  function handleHeadingClick(e, index) {
    e.stopPropagation()
    onHeadingClickProp?.(sectionId, index)
  }

  const [editing, setEditing] = useState(false)
  const [draft, setDraft]     = useState(section.name)
  const [menuOpen, setMenuOpen] = useState(false)

  // Sync draft when section.name changes externally
  useEffect(() => { setDraft(section.name) }, [section.name])

  function commitRename() {
    setEditing(false)
    if (draft.trim()) onRename(draft.trim())
    else setDraft(section.name)
  }

  return (
    <div style={styles.sectionItem}>
      <div
        style={isActive ? styles.sectionNavBtnActive : styles.sectionNavBtn}
        onClick={onClick}
      >
        <div style={styles.sectionNavLeft}>
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
            onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v) }}
            title="Opciones"
          >
            <MoreVertical size={24} color="#2a2a2a" />
          </button>
          {menuOpen && (
            <div style={styles.menu} onMouseLeave={() => setMenuOpen(false)}>
              <div style={styles.menuItem} onClick={(e) => { e.stopPropagation(); setMenuOpen(false); setEditing(true) }}>
                Renombrar
              </div>
              <div style={{ ...styles.menuItem, color: '#ef4444' }} onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onDelete() }}>
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

  function applyType(opt, blockEl) {
    if (!editor) return
    try {
      const pos = editor.view.posAtDOM(blockEl, 0)
      editor.chain().focus().setTextSelection(pos).run()
      if (opt === 'paragraph') {
        editor.chain().setParagraph().run()
      } else {
        const level = parseInt(opt.replace('H', ''))
        editor.chain().setHeading({ level }).run()
      }
    } catch (err) {
      console.warn('TypeLabel: no se pudo cambiar el tipo:', err)
    }
    setOpenIdx(-1)
  }

  const TYPE_OPTIONS = ['H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'Párrafo']

  return (
    <div ref={columnRef} style={styles.typeLabelsCol}>
      {labels.map((item, idx) => (
        <div key={idx} style={{ position: 'absolute', top: item.top, left: 4, zIndex: 20 }}>
          <button
            style={styles.typeLabelBtn}
            onClick={(e) => { e.stopPropagation(); setOpenIdx(idx === openIdx ? -1 : idx) }}
            title={`Tipo actual: ${item.label}`}
          >
            {item.label}
          </button>

          {openIdx === idx && (
            <div style={styles.typeLabelDropdown} onMouseLeave={() => setOpenIdx(-1)}>
              {TYPE_OPTIONS.map((opt) => (
                <div
                  key={opt}
                  style={styles.typeLabelOption}
                  onClick={() => applyType(opt === 'Párrafo' ? 'paragraph' : opt, item.blockEl)}
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

// ---------------------------------------------------------------------------
// Toolbar — barra de herramientas compartida
// ---------------------------------------------------------------------------
function Toolbar({ editor }) {
  const [, forceUpdate] = useState(0)

  useEffect(() => {
    if (!editor) return
    const handler = () => forceUpdate((n) => n + 1)
    editor.on('transaction', handler)
    return () => editor.off('transaction', handler)
  }, [editor])

  function handleImageUpload(e) {
    const file = e.target.files?.[0]
    if (!file || !editor) return
    const url = URL.createObjectURL(file)
    editor.chain().focus().setImage({ src: url }).run()
    e.target.value = ''
  }

  function handleLink() {
    if (!editor) return
    const url = window.prompt('URL del enlace:')
    if (!url) return
    editor.chain().focus().setLink({ href: url }).run()
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
        active={editor?.isActive('link')}
        disabled={disabled}
        onClick={handleLink}
        title="Insertar enlace"
      >🔗</ToolBtn>

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

// ---------------------------------------------------------------------------
// EditorPanel — panel central con editor TipTap único
// ---------------------------------------------------------------------------
function EditorPanel({
  initialContent,
  scrollRequest,
  onDocUpdate,
  onEditorReady,
  onScrollHeadingChange,
  onSelectionSectionChange,
  firstSectionId,
  activeSectionId,
  onOpenAddSectionAfter,
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
      SectionDividerNode,
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
      <Toolbar editor={editor} />
      <div ref={scrollAreaRef} style={styles.editorScrollArea}>
        <div style={styles.editorPage}>
          <div style={styles.sectionEditorRow}>
            <TypeLabelsColumn wrapperRef={wrapperRef} editor={editor} />
            <div ref={wrapperRef} style={styles.sectionEditorContent}>
              <EditorContent editor={editor} />
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
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// UpdatesPanel — sidebar derecho
// ---------------------------------------------------------------------------
function UpdatesPanel({ changes = [] }) {
  return (
    <div style={styles.rightPanel}>
      <span style={styles.panelTitle}>Document updates</span>
      {changes.length === 0 ? (
        <p style={styles.updatesEmpty}>Sin cambios aún.</p>
      ) : (
        <ul style={styles.updatesList}>
          {changes.map((change) => (
            <li key={change.id} style={styles.updatesItem}>
              <span style={styles.updatesField}>{change.field}</span>
              <span style={styles.updatesDatetime}>{change.datetime}</span>
              {/* eslint-disable-next-line jsx-a11y/anchor-is-valid */}
              <a href="#" style={styles.updatesLink} onClick={(e) => e.preventDefault()}>
                Ver
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Estilos
// ---------------------------------------------------------------------------
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

  // ── Navbar ──
  navbar: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr 1fr',
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
    gap: 48,
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
  },
  navPill: {
    height: 30,
    padding: '0 14px',
    borderRadius: 100,
    border: 'none',
    backgroundColor: '#f8f8f8',
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
    padding: '0 14px',
    borderRadius: 100,
    border: 'none',
    backgroundColor: '#212222',
    color: '#f2f2f2',
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
    fontFamily: 'inherit',
    display: 'flex',
    alignItems: 'center',
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
    gap: 33,
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
    padding: '4px 8px',
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

  editorScrollArea: {
    flex: 1,
    overflowY: 'scroll',
    padding: 10,
    position: 'relative',
  },

  editorPage: {
    maxWidth: 800,
    margin: '0 auto',
    minHeight: 'calc(100vh - 120px)',
    backgroundColor: '#f8f8f8',
    border: '1px solid #d9d9d9',
    borderRadius: 4,
    padding: 20,
    paddingTop: 60,
    paddingBottom: 1000,
  },

  // ── Separador de sección (usado por el NodeView) ──
  sectionDivider: {
    margin: '20px 0 12px',
  },
  sectionDividerLabel: {
    display: 'block',
    fontSize: 11,
    color: '#999',
    textTransform: 'uppercase',
    letterSpacing: '1px',
    marginBottom: 6,
    userSelect: 'none',
  },
  sectionDividerHr: {
    border: 'none',
    borderTop: '1px solid #d9d9d9',
    margin: 0,
  },

  sectionEditorRow: {
    display: 'flex',
    alignItems: 'flex-start',
  },

  typeLabelsCol: {
    position: 'relative',
    width: 48,
    flexShrink: 0,
    alignSelf: 'stretch',
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
    flex: 1,
    overflow: 'visible',
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

  updatesItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    borderBottom: '1px solid #d9d9d9',
    padding: '10px 0',
  },

  updatesField: {
    fontSize: 13,
    fontWeight: 600,
    color: '#2a2a2a',
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
}
