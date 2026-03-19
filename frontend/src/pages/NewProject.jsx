import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

// Estructura sugerida de páginas y secciones por tipo de negocio
const ESTRUCTURAS = {
  clinica: {
    label: 'Clínica / Salud',
    pages: [
      { name: 'Inicio', sections: ['Hero con llamada a la acción', 'Servicios principales', 'Equipo médico', 'Testimonios de pacientes', 'Ubicación y contacto'] },
      { name: 'Servicios', sections: ['Lista de especialidades', 'Detalle por servicio', 'Preguntas frecuentes'] },
      { name: 'Equipo', sections: ['Presentación del equipo', 'Perfil de cada profesional'] },
      { name: 'Contacto', sections: ['Formulario de consulta', 'Mapa y dirección', 'Horarios de atención'] },
    ],
  },
  ecommerce: {
    label: 'E-commerce',
    pages: [
      { name: 'Inicio', sections: ['Banner principal / Ofertas', 'Categorías destacadas', 'Productos más vendidos', 'Propuesta de valor', 'Newsletter'] },
      { name: 'Catálogo', sections: ['Filtros y búsqueda', 'Grilla de productos', 'Paginación'] },
      { name: 'Producto', sections: ['Galería de imágenes', 'Descripción y precio', 'Variantes', 'Productos relacionados'] },
      { name: 'Carrito / Checkout', sections: ['Resumen de compra', 'Datos de envío', 'Pago'] },
    ],
  },
  restaurante: {
    label: 'Restaurante',
    pages: [
      { name: 'Inicio', sections: ['Hero con ambiente', 'Propuesta gastronómica', 'Platos destacados', 'Reservas', 'Reseñas'] },
      { name: 'Menú', sections: ['Categorías del menú', 'Platos con descripción y precio'] },
      { name: 'Nosotros', sections: ['Historia del restaurante', 'Chef y equipo'] },
      { name: 'Contacto', sections: ['Formulario de reserva', 'Ubicación y horarios', 'Redes sociales'] },
    ],
  },
  agencia: {
    label: 'Estudio / Agencia',
    pages: [
      { name: 'Inicio', sections: ['Hero con propuesta de valor', 'Servicios', 'Proyectos destacados', 'Clientes', 'Llamada a la acción'] },
      { name: 'Servicios', sections: ['Detalle de cada servicio', 'Proceso de trabajo'] },
      { name: 'Portafolio', sections: ['Grilla de proyectos', 'Filtro por categoría', 'Caso de estudio'] },
      { name: 'Nosotros', sections: ['Equipo', 'Cultura y valores'] },
      { name: 'Contacto', sections: ['Formulario', 'Datos de contacto'] },
    ],
  },
  inmobiliaria: {
    label: 'Inmobiliaria',
    pages: [
      { name: 'Inicio', sections: ['Hero con buscador', 'Propiedades destacadas', 'Por qué elegirnos', 'Testimonios'] },
      { name: 'Propiedades', sections: ['Filtros de búsqueda', 'Listado de propiedades', 'Mapa interactivo'] },
      { name: 'Propiedad', sections: ['Galería', 'Descripción y características', 'Ubicación', 'Formulario de contacto'] },
      { name: 'Nosotros', sections: ['Trayectoria', 'Equipo de asesores'] },
      { name: 'Contacto', sections: ['Formulario', 'Oficinas y sucursales'] },
    ],
  },
  educacion: {
    label: 'Educación',
    pages: [
      { name: 'Inicio', sections: ['Hero con propuesta educativa', 'Cursos o programas', 'Metodología', 'Testimonios de alumnos', 'Llamada a inscripción'] },
      { name: 'Cursos', sections: ['Catálogo de cursos', 'Detalle del curso', 'Temario y docentes'] },
      { name: 'Nosotros', sections: ['Historia de la institución', 'Equipo docente', 'Certificaciones'] },
      { name: 'Contacto', sections: ['Formulario de consulta', 'Preguntas frecuentes'] },
    ],
  },
  otro: {
    label: 'Otro',
    pages: [
      { name: 'Inicio', sections: ['Hero principal', 'Propuesta de valor', 'Servicios o productos', 'Llamada a la acción'] },
      { name: 'Nosotros', sections: ['Historia y misión', 'Equipo'] },
      { name: 'Servicios', sections: ['Descripción de servicios', 'Preguntas frecuentes'] },
      { name: 'Contacto', sections: ['Formulario', 'Datos de contacto'] },
    ],
  },
}

export default function NewProject() {
  const navigate = useNavigate()

  const [nombre, setNombre] = useState('')
  const [cliente, setCliente] = useState('')
  const [email, setEmail] = useState('')
  const [tipo, setTipo] = useState('')

  // La estructura sugerida se muestra cuando hay un tipo seleccionado
  const estructura = tipo ? ESTRUCTURAS[tipo] : null

  return (
    <div style={styles.page}>
      {/* Encabezado */}
      <div style={styles.header}>
        <h1 style={styles.title}>WebBrief</h1>
      </div>

      <h2 style={styles.pageTitle}>Nuevo proyecto</h2>

      <div style={styles.layout}>
        {/* Columna izquierda: formulario */}
        <div style={styles.formColumn}>
          <div style={styles.field}>
            <label style={styles.label}>Nombre del proyecto</label>
            <input
              style={styles.input}
              type="text"
              placeholder="Ej: Rediseño web corporativo"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
            />
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Nombre del cliente</label>
            <input
              style={styles.input}
              type="text"
              placeholder="Ej: Estudio Nómade"
              value={cliente}
              onChange={(e) => setCliente(e.target.value)}
            />
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Email del cliente</label>
            <input
              style={styles.input}
              type="email"
              placeholder="cliente@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Tipo de negocio</label>
            <select
              style={styles.select}
              value={tipo}
              onChange={(e) => setTipo(e.target.value)}
            >
              <option value="">— Seleccionar —</option>
              {Object.entries(ESTRUCTURAS).map(([key, val]) => (
                <option key={key} value={key}>{val.label}</option>
              ))}
            </select>
          </div>

          {/* Acciones */}
          <div style={styles.actions}>
            <button style={styles.btnPrimary}>Crear proyecto</button>
            <button style={styles.btnGhost} onClick={() => navigate('/dashboard')}>
              Cancelar
            </button>
          </div>
        </div>

        {/* Columna derecha: preview de estructura (visible solo cuando hay tipo) */}
        <div style={styles.previewColumn}>
          {estructura ? (
            <div style={styles.preview}>
              <p style={styles.previewTitle}>
                Estructura sugerida para <strong>{estructura.label}</strong>
              </p>
              <div style={styles.pagesList}>
                {estructura.pages.map((page) => (
                  <div key={page.name} style={styles.pageBlock}>
                    <p style={styles.pageName}>{page.name}</p>
                    <ul style={styles.sectionList}>
                      {page.sections.map((section) => (
                        <li key={section} style={styles.sectionItem}>{section}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
              <p style={styles.previewNote}>
                Podrás editar esta estructura después de crear el proyecto.
              </p>
            </div>
          ) : (
            // Placeholder cuando no hay tipo seleccionado
            <div style={styles.previewEmpty}>
              <p style={styles.previewEmptyText}>
                Seleccioná un tipo de negocio para ver la estructura de páginas sugerida.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const styles = {
  page: {
    maxWidth: 900,
    margin: '0 auto',
    padding: '32px 24px',
    fontFamily: 'system-ui, sans-serif',
  },
  header: {
    marginBottom: 28,
  },
  title: {
    margin: 0,
    fontSize: 24,
    fontWeight: 700,
  },
  pageTitle: {
    margin: '0 0 28px 0',
    fontSize: 20,
    fontWeight: 600,
    color: '#0f172a',
  },
  layout: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 32,
    alignItems: 'start',
  },
  formColumn: {
    display: 'flex',
    flexDirection: 'column',
    gap: 20,
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  label: {
    fontSize: 14,
    fontWeight: 500,
    color: '#374151',
  },
  input: {
    padding: '9px 12px',
    border: '1px solid #d1d5db',
    borderRadius: 6,
    fontSize: 14,
    color: '#0f172a',
    outline: 'none',
  },
  select: {
    padding: '9px 12px',
    border: '1px solid #d1d5db',
    borderRadius: 6,
    fontSize: 14,
    color: '#0f172a',
    backgroundColor: '#fff',
    outline: 'none',
    cursor: 'pointer',
  },
  actions: {
    display: 'flex',
    gap: 12,
    marginTop: 4,
  },
  btnPrimary: {
    padding: '9px 20px',
    backgroundColor: '#0f172a',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    fontSize: 14,
    fontWeight: 500,
    cursor: 'pointer',
  },
  btnGhost: {
    padding: '9px 20px',
    backgroundColor: 'transparent',
    color: '#64748b',
    border: '1px solid #e2e8f0',
    borderRadius: 6,
    fontSize: 14,
    cursor: 'pointer',
  },
  // Preview de estructura
  previewColumn: {
    position: 'sticky',
    top: 24,
  },
  preview: {
    border: '1px solid #e2e8f0',
    borderRadius: 10,
    padding: 20,
    backgroundColor: '#f8fafc',
  },
  previewTitle: {
    margin: '0 0 16px 0',
    fontSize: 13,
    color: '#64748b',
  },
  pagesList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
  },
  pageBlock: {
    borderLeft: '3px solid #0f172a',
    paddingLeft: 12,
  },
  pageName: {
    margin: '0 0 6px 0',
    fontSize: 13,
    fontWeight: 600,
    color: '#0f172a',
  },
  sectionList: {
    margin: 0,
    padding: 0,
    listStyle: 'none',
    display: 'flex',
    flexDirection: 'column',
    gap: 3,
  },
  sectionItem: {
    fontSize: 12,
    color: '#64748b',
    paddingLeft: 8,
    position: 'relative',
  },
  previewNote: {
    margin: '16px 0 0 0',
    fontSize: 12,
    color: '#94a3b8',
    fontStyle: 'italic',
  },
  previewEmpty: {
    border: '1px dashed #cbd5e1',
    borderRadius: 10,
    padding: 32,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewEmptyText: {
    margin: 0,
    fontSize: 13,
    color: '#94a3b8',
    textAlign: 'center',
    lineHeight: 1.6,
  },
}
