import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useEditor, EditorContent } from '@tiptap/react'
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
// Componente principal — ProjectEditor
// ---------------------------------------------------------------------------
export default function ProjectEditor() {
  const navigate = useNavigate()

  const [pages, setPages]               = useState(MOCK_PAGES)
  const [activePageId, setActivePageId] = useState(MOCK_PAGES[0].id)
  const [activeSectionId, setActiveSectionId] = useState(MOCK_PAGES[0].sections[0].id)

  // Ref al editor activo (el último en recibir focus) — usado por Navbar undo/redo
  const activeEditorRef = useRef(null)

  const activePage = pages.find((p) => p.id === activePageId)

  // ── Guarda el HTML de una sección cuando el usuario edita ──
  const handleContentUpdate = useCallback((sectionId, html) => {
    setPages((prev) =>
      prev.map((page) =>
        page.id === activePageId
          ? {
              ...page,
              sections: page.sections.map((s) =>
                s.id === sectionId ? { ...s, content: html } : s
              ),
            }
          : page
      )
    )
  }, [activePageId])

  // ── Navega a otra página: activa su primera sección ──
  function handlePageClick(pageId) {
    const page = pages.find((p) => p.id === pageId)
    if (!page) return
    setActivePageId(pageId)
    setActiveSectionId(page.sections[0]?.id ?? null)
  }

  // ── Selecciona una sección del sidebar (el EditorPanel hace el scroll) ──
  function handleSectionClick(sectionId) {
    setActiveSectionId(sectionId)
  }

  // ── Agrega una sección nueva a la página activa ──
  function addSection() {
    const id = `s_${Date.now()}`
    setPages((prev) =>
      prev.map((page) =>
        page.id === activePageId
          ? { ...page, sections: [...page.sections, { id, name: 'Nueva sección', content: '<p></p>' }] }
          : page
      )
    )
    setActiveSectionId(id)
  }

  // ── Renombra una sección ──
  function renameSection(sectionId, newName) {
    setPages((prev) =>
      prev.map((page) =>
        page.id === activePageId
          ? { ...page, sections: page.sections.map((s) => s.id === sectionId ? { ...s, name: newName } : s) }
          : page
      )
    )
  }

  // ── Elimina una sección ──
  function deleteSection(sectionId) {
    setPages((prev) =>
      prev.map((page) => {
        if (page.id !== activePageId) return page
        const filtered = page.sections.filter((s) => s.id !== sectionId)
        return { ...page, sections: filtered }
      })
    )
    if (sectionId === activeSectionId) {
      const remaining = activePage.sections.filter((s) => s.id !== sectionId)
      setActiveSectionId(remaining[0]?.id ?? null)
    }
  }

  // ── Agrega una nueva página ──
  function addPage() {
    const id = `page_${Date.now()}`
    const newPage = {
      id,
      name: 'Nueva página',
      sections: [{ id: `s_${Date.now()}`, name: 'Sección 1', content: '<p></p>' }],
    }
    setPages((prev) => [...prev, newPage])
    setActivePageId(id)
    setActiveSectionId(newPage.sections[0].id)
  }

  return (
    <div style={styles.root}>
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
        onUndo={() => activeEditorRef.current?.chain().focus().undo().run()}
        onRedo={() => activeEditorRef.current?.chain().focus().redo().run()}
        onLogoClick={() => navigate('/dashboard')}
      />

      {/* ── BODY: 3 columnas ── */}
      <div style={styles.body}>
        {/* Sidebar izquierdo: secciones */}
        <SectionsPanel
          sections={activePage?.sections ?? []}
          activeSectionId={activeSectionId}
          onSectionClick={handleSectionClick}
          onAddSection={addSection}
          onRename={renameSection}
          onDelete={deleteSection}
        />

        {/* Área central: editor */}
        <EditorPanel
          sections={activePage?.sections ?? []}
          activeSectionId={activeSectionId}
          onContentUpdate={handleContentUpdate}
          onEditorFocus={(editor) => { activeEditorRef.current = editor }}
        />

        {/* Sidebar derecho: actualizaciones del documento */}
        <UpdatesPanel changes={[]} />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Navbar — 3 columnas: [logo + undo/redo] | [pills] | [iconos + save]
// Recibe onUndo/onRedo en lugar de un editor concreto,
// porque el editor activo puede cambiar entre secciones.
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
// SectionsPanel — sidebar izquierdo con la lista de secciones
// ---------------------------------------------------------------------------
function SectionsPanel({ sections, activeSectionId, onSectionClick, onAddSection, onRename, onDelete }) {
  return (
    <div style={styles.leftPanel}>
      <div style={styles.panelHeader}>
        <span style={styles.panelTitle}>Page sections</span>
        <button style={styles.panelAddBtn} onClick={onAddSection} title="Agregar sección">
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
          />
        ))}
        {sections.length === 0 && (
          <p style={styles.emptyMsg}>Sin secciones. Agregá una con +</p>
        )}
      </div>
    </div>
  )
}

// Ítem de sección: nav-button (Tag + nombre + menú) + content preview
function SectionItem({ section, isActive, onClick, onRename, onDelete }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft]     = useState(section.name)
  const [menuOpen, setMenuOpen] = useState(false)

  function commitRename() {
    setEditing(false)
    if (draft.trim()) onRename(draft.trim())
    else setDraft(section.name)
  }

  return (
    <div style={styles.sectionItem}>
      {/* Nav-button: activo con borde #212222, inactivo con borde transparente */}
      <div
        style={isActive ? styles.sectionNavBtnActive : styles.sectionNavBtn}
        onClick={onClick}
      >
        {/* Izquierda: ícono Tag + nombre editable */}
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

        {/* Derecha: MoreVertical → menú contextual */}
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

      {/* Content preview: línea vertical coloreada + "Title" + "Subtitle" */}
      <div style={styles.sectionContent}>
        <div style={isActive ? styles.sectionPreviewItemActive : styles.sectionPreviewItem}>
          <span style={styles.sectionPreviewTitle}>Title</span>
          <span style={styles.sectionPreviewSubtitle}>Subtitle</span>
        </div>
      </div>
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
// SectionDivider — separador visual entre secciones
// HR fina + label con el nombre de la sección (11px, gris, uppercase)
// ---------------------------------------------------------------------------
function SectionDivider({ name }) {
  return (
    <div style={styles.sectionDivider}>
      <span style={styles.sectionDividerLabel}>{name}</span>
      <hr style={styles.sectionDividerHr} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// TypeLabelsColumn — columna de etiquetas de tipo alineadas con cada bloque
//
// Usa MutationObserver para detectar cambios en el DOM del editor y
// recalcular las posiciones. Las etiquetas se posicionan absolutamente
// dentro de una columna de ancho fijo a la izquierda del editor.
//
// Al hacer click en una etiqueta: dropdown para cambiar el tipo del bloque.
// ---------------------------------------------------------------------------
function TypeLabelsColumn({ wrapperRef, editor }) {
  const [labels, setLabels]   = useState([])
  const [openIdx, setOpenIdx] = useState(-1)

  // ── Recalcula las etiquetas leyendo los bloques del .ProseMirror ──
  function rebuild() {
    const wrapper = wrapperRef.current
    if (!wrapper) return
    const pm = wrapper.querySelector('.ProseMirror')
    if (!pm) return

    setLabels(
      Array.from(pm.children).map((block) => ({
        // Centra la etiqueta verticalmente en el bloque (botón de 30px)
        top: block.offsetTop + Math.max(0, block.offsetHeight / 2 - 15),
        label: getBlockLabel(block),
        blockEl: block,
      }))
    )
  }

  useEffect(() => {
    // Recalcula inmediatamente y luego con un pequeño delay (por si el layout no terminó)
    rebuild()
    const t = setTimeout(rebuild, 50)

    const wrapper = wrapperRef.current
    if (!wrapper) return () => clearTimeout(t)
    const pm = wrapper.querySelector('.ProseMirror')
    if (!pm) return () => clearTimeout(t)

    // MutationObserver: detecta cambios en el contenido
    const mutObs = new MutationObserver(rebuild)
    mutObs.observe(pm, { childList: true, subtree: true, characterData: true })

    // ResizeObserver: detecta cambios de tamaño (tipeo, imágenes, etc.)
    const resObs = new ResizeObserver(rebuild)
    resObs.observe(pm)

    return () => {
      clearTimeout(t)
      mutObs.disconnect()
      resObs.disconnect()
    }
  }, [editor]) // re-corre cuando cambia el editor (nueva instancia al navegar)

  // ── Cambia el tipo del bloque usando comandos de TipTap ──
  function applyType(opt, blockEl) {
    if (!editor) return
    try {
      // posAtDOM da la posición ProseMirror del nodo DOM
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
    // position: relative → los labels usan position: absolute dentro
    <div style={styles.typeLabelsCol}>
      {labels.map((item, idx) => (
        <div key={idx} style={{ position: 'absolute', top: item.top, left: 4, zIndex: 20 }}>
          {/* Botón de etiqueta: 30×30px, fondo #d0d0d0, border-radius 6px */}
          <button
            style={styles.typeLabelBtn}
            onClick={(e) => { e.stopPropagation(); setOpenIdx(idx === openIdx ? -1 : idx) }}
            title={`Tipo actual: ${item.label}`}
          >
            {item.label}
          </button>

          {/* Dropdown de opciones de tipo */}
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
// SectionEditor — editor TipTap individual por sección
//
// Cada sección tiene su propia instancia de TipTap.
// Todos los editores están en el mismo contenedor scroll → "documento único".
// ---------------------------------------------------------------------------
function SectionEditor({ section, isLast, onReady, onFocus, onContentUpdate }) {
  // ref al div wrapper que contiene el .ProseMirror — usado por TypeLabelsColumn
  const wrapperRef = useRef(null)

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: false }),         // heading se maneja por separado
      Heading.configure({ levels: [1, 2, 3, 4, 5, 6] }),
      Image.configure({
        inline: false,
        HTMLAttributes: {
          // Limita el tamaño de las imágenes insertadas
          style: 'max-height:300px; max-width:100%; height:auto; display:block;',
        },
      }),
      Link.configure({ openOnClick: false }),
      Underline,
      TextStyle,
      Color,
    ],
    content: section.content,
    onUpdate({ editor }) {
      onContentUpdate?.(section.id, editor.getHTML())
    },
    onFocus({ editor }) {
      onFocus?.(editor) // notifica al EditorPanel cuál editor está activo
    },
  })

  // Reporta la instancia del editor al padre cuando esté lista
  useEffect(() => {
    if (editor) onReady?.(section.id, editor)
  }, [editor])

  if (!editor) return null

  return (
    // Fila horizontal: [etiquetas tipo] [contenido editor] [ícono ⓘ si aplica]
    <div style={styles.sectionEditorRow}>

      {/* Columna izquierda: etiquetas de tipo (MutationObserver) */}
      <TypeLabelsColumn wrapperRef={wrapperRef} editor={editor} />

      {/* Contenido TipTap */}
      <div ref={wrapperRef} style={styles.sectionEditorContent}>
        <EditorContent editor={editor} />
      </div>

      {/* Columna derecha: ícono ⓘ para bloques modificados (hardcoded en última sección) */}
      <div style={styles.infoCol}>
        {isLast && (
          <span title="Bloque modificado">
            <Info size={20} color="#bbb" strokeWidth={1.5} />
          </span>
        )}
      </div>

    </div>
  )
}

// ---------------------------------------------------------------------------
// Toolbar — barra de herramientas compartida
//
// Opera sobre `activeEditor` (el último editor enfocado por el usuario).
// Se re-renderiza en cada transacción del editor activo para reflejar
// el estado actual de la selección (bold, italic, tipo de bloque, etc.).
// ---------------------------------------------------------------------------
function Toolbar({ editor }) {
  // Fuerza re-render en cada transacción del editor para actualizar los estados
  const [, forceUpdate] = useState(0)

  useEffect(() => {
    if (!editor) return
    const handler = () => forceUpdate((n) => n + 1)
    editor.on('transaction', handler)
    return () => editor.off('transaction', handler)
  }, [editor])

  // ── Inserta imagen desde archivo local ──
  function handleImageUpload(e) {
    const file = e.target.files?.[0]
    if (!file || !editor) return
    const url = URL.createObjectURL(file)
    editor.chain().focus().setImage({ src: url }).run()
    e.target.value = ''
  }

  // ── Inserta o edita un link ──
  function handleLink() {
    if (!editor) return
    const url = window.prompt('URL del enlace:')
    if (!url) return
    editor.chain().focus().setLink({ href: url }).run()
  }

  // ── Detecta el tipo de bloque activo para el <select> ──
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

      {/* Selector de tipo de bloque: Párrafo, H1–H6 */}
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

      {/* Bold */}
      <ToolBtn
        active={editor?.isActive('bold')}
        disabled={disabled}
        onClick={() => editor?.chain().focus().toggleBold().run()}
        title="Negrita (Ctrl+B)"
      ><b>B</b></ToolBtn>

      {/* Italic */}
      <ToolBtn
        active={editor?.isActive('italic')}
        disabled={disabled}
        onClick={() => editor?.chain().focus().toggleItalic().run()}
        title="Cursiva (Ctrl+I)"
      ><i>I</i></ToolBtn>

      {/* Underline */}
      <ToolBtn
        active={editor?.isActive('underline')}
        disabled={disabled}
        onClick={() => editor?.chain().focus().toggleUnderline().run()}
        title="Subrayado (Ctrl+U)"
      ><u>U</u></ToolBtn>

      <div style={styles.toolbarSep} />

      {/* Color de texto — input type="color" oculto detrás de un label */}
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

      {/* Enlace */}
      <ToolBtn
        active={editor?.isActive('link')}
        disabled={disabled}
        onClick={handleLink}
        title="Insertar enlace"
      >🔗</ToolBtn>

      {/* Imagen — abre file picker */}
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

// Botón de toolbar reutilizable
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
// EditorPanel — panel central
//
// Contiene la Toolbar y el área de scroll con TODAS las secciones de la página.
// Las secciones se muestran como un documento único con scroll continuo.
// Al cambiar `activeSectionId` (click en sidebar), hace scroll suave a esa sección.
// ---------------------------------------------------------------------------
function EditorPanel({ sections, activeSectionId, onContentUpdate, onEditorFocus }) {
  // Editor activo = el que tiene el foco en este momento
  const [activeEditor, setActiveEditor] = useState(null)

  // ── Scroll a la sección activa cuando cambia desde el sidebar ──
  useEffect(() => {
    if (!activeSectionId) return
    const el = document.getElementById(`section-${activeSectionId}`)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [activeSectionId])

  function handleEditorFocus(editor) {
    setActiveEditor(editor)
    onEditorFocus?.(editor) // reporta al padre para undo/redo del Navbar
  }

  return (
    <div style={styles.centerPanel}>

      {/* Toolbar: opera sobre el editor activo */}
      <Toolbar editor={activeEditor} />

      {/* Área de scroll: todas las secciones juntas en un "documento" */}
      <div style={styles.editorScrollArea}>
        {/* La "página": max-width 800px, centrada, fondo #f8f8f8, borde, padding */}
        <div style={styles.editorPage}>
          {sections.map((section, idx) => (
            // Cada sección tiene un id para que scrollIntoView funcione
            <div key={section.id} id={`section-${section.id}`}>

              {/* Separador visual entre secciones (excepto la primera) */}
              {idx > 0 && <SectionDivider name={section.name} />}

              {/* Editor TipTap de la sección */}
              <SectionEditor
                section={section}
                isLast={idx === sections.length - 1}
                onReady={() => {}}
                onFocus={handleEditorFocus}
                onContentUpdate={onContentUpdate}
              />

            </div>
          ))}
        </div>
      </div>

    </div>
  )
}

// ---------------------------------------------------------------------------
// UpdatesPanel — sidebar derecho
//
// Props:
//   changes  Array de objetos con forma { id, field, datetime }
//            - field:    nombre del campo modificado (ej. "Hero / Banner")
//            - datetime: string con la fecha/hora del cambio
//
// Comportamiento:
//   - changes vacío  → muestra "Sin cambios aún."
//   - changes con ítems → lista con campo, fecha/hora y link "Ver" (sin acción)
// ---------------------------------------------------------------------------
function UpdatesPanel({ changes = [] }) {
  return (
    <div style={styles.rightPanel}>

      {/* Header del panel */}
      <span style={styles.panelTitle}>Document updates</span>

      {changes.length === 0 ? (
        // Estado vacío
        <p style={styles.updatesEmpty}>Sin cambios aún.</p>
      ) : (
        // Lista de cambios
        <ul style={styles.updatesList}>
          {changes.map((change) => (
            <li key={change.id} style={styles.updatesItem}>
              {/* Nombre del campo modificado */}
              <span style={styles.updatesField}>{change.field}</span>
              {/* Fecha/hora del cambio */}
              <span style={styles.updatesDatetime}>{change.datetime}</span>
              {/* Link "Ver" — sin acción por ahora */}
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

  // ── Navbar (70px, fondo #f0f0f0, borde inferior #212222) ──
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

  // Toolbar: fondo blanco, borde inferior
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

  // Área de scroll del editor (fondo #f2f2f2, padding 10px)
  editorScrollArea: {
    flex: 1,
    overflowY: 'auto',
    padding: 10,
  },

  // La "página": max-width 800px, centrada, fondo #f8f8f8, borde, padding 20px
  editorPage: {
    maxWidth: 800,
    margin: '0 auto',
    backgroundColor: '#f8f8f8',
    border: '1px solid #d9d9d9',
    borderRadius: 4,
    padding: 20,
  },

  // ── Separador de sección ──
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

  // ── Fila de sección: [etiquetas tipo] [editor] [info] ──
  sectionEditorRow: {
    display: 'flex',
    alignItems: 'flex-start',
  },

  // Columna de etiquetas de tipo — position: relative para los labels absolutos
  typeLabelsCol: {
    position: 'relative',
    width: 48,
    flexShrink: 0,
    alignSelf: 'stretch',  // misma altura que el editor
  },

  // Botón de etiqueta de tipo: 30×30px, fondo #d0d0d0, border-radius 6px
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

  // Dropdown del tipo de bloque (aparece a la derecha del botón)
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

  // Contenido del editor TipTap (flex 1)
  sectionEditorContent: {
    flex: 1,
    overflow: 'hidden',
  },

  // Columna del ícono ⓘ (derecha del editor)
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

  // Mensaje cuando no hay cambios
  updatesEmpty: {
    fontSize: 14,
    color: '#999',
    margin: 0,
    marginTop: 16,
  },

  // Lista de cambios: sin estilos de lista nativa
  updatesList: {
    listStyle: 'none',
    margin: 0,
    marginTop: 16,
    padding: 0,
  },

  // Ítem de cambio: borde inferior + padding vertical
  updatesItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    borderBottom: '1px solid #d9d9d9',
    padding: '10px 0',
  },

  // Nombre del campo modificado
  updatesField: {
    fontSize: 13,
    fontWeight: 600,
    color: '#2a2a2a',
  },

  // Fecha/hora del cambio
  updatesDatetime: {
    fontSize: 12,
    color: '#999',
  },

  // Link "Ver" — apagado visualmente hasta que tenga acción
  updatesLink: {
    fontSize: 12,
    color: '#0088ff',
    textDecoration: 'none',
    marginTop: 2,
    alignSelf: 'flex-start',
  },
}
