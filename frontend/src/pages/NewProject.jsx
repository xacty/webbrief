import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { apiFetch } from '../lib/api'
import styles from './NewProject.module.css'

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

function getDefaultCompanyId(companies) {
  return companies.find((company) => !company.isInternal)?.id || companies[0]?.id || ''
}

export default function NewProject() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const requestedCompanyId = searchParams.get('companyId')

  const [companies, setCompanies] = useState([])
  const [companiesLoading, setCompaniesLoading] = useState(true)
  const [name, setName] = useState('')
  const [clientName, setClientName] = useState('')
  const [clientEmail, setClientEmail] = useState('')
  const [businessType, setBusinessType] = useState('')
  const [companyId, setCompanyId] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let active = true

    async function loadCompanies() {
      try {
        setCompaniesLoading(true)
        const data = await apiFetch('/api/companies')
        if (!active) return

        setCompanies(data.companies)
        const hasRequestedCompany = data.companies.some((company) => company.id === requestedCompanyId)
        setCompanyId(hasRequestedCompany ? requestedCompanyId : getDefaultCompanyId(data.companies))
      } catch (err) {
        if (!active) return
        setError(err.message || 'No se pudieron cargar las empresas')
      } finally {
        if (active) setCompaniesLoading(false)
      }
    }

    loadCompanies()

    return () => {
      active = false
    }
  }, [requestedCompanyId])

  const estructura = useMemo(
    () => (businessType ? ESTRUCTURAS[businessType] : null),
    [businessType]
  )

  const selectedCompany = companies.find((company) => company.id === companyId) || null

  async function handleCreateProject(e) {
    e.preventDefault()
    setError('')
    setSubmitting(true)

    try {
      const data = await apiFetch('/api/projects', {
        method: 'POST',
        body: JSON.stringify({
          name,
          clientName,
          clientEmail,
          businessType,
          companyId: companyId || undefined,
        }),
      })

      navigate(`/project/${data.project.id}/editor`)
    } catch (err) {
      setError(err.message || 'No se pudo crear el proyecto')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.breadcrumbs}>
        <button className={styles.backButton} onClick={() => navigate(companyId ? `/companies/${companyId}` : '/companies')}>
          ← Volver
        </button>
      </div>

      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Proyecto</p>
          <h1 className={styles.title}>Nuevo proyecto</h1>
          <p className={styles.subtitle}>
            Crea el proyecto dentro de una empresa concreta y siembra su estructura inicial según el tipo de negocio.
          </p>
        </div>
      </header>

      <div className={styles.layout}>
        <form className={styles.formColumn} onSubmit={handleCreateProject}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="project-name">Nombre del proyecto</label>
            <input
              id="project-name"
              className={styles.input}
              type="text"
              placeholder="Ej: Rediseño web corporativo"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="client-name">Nombre del cliente</label>
            <input
              id="client-name"
              className={styles.input}
              type="text"
              placeholder="Ej: Estudio Nómade"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              required
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="client-email">Email del cliente</label>
            <input
              id="client-email"
              className={styles.input}
              type="email"
              placeholder="cliente@email.com"
              value={clientEmail}
              onChange={(e) => setClientEmail(e.target.value)}
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="project-company">Empresa</label>
            <select
              id="project-company"
              className={styles.select}
              value={companyId}
              onChange={(e) => setCompanyId(e.target.value)}
              disabled={companiesLoading || companies.length === 0}
            >
              {companies.length === 0 && <option value="">Sin empresas disponibles</option>}
              {companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name}{company.isInternal ? ' · Interna' : ''}
                </option>
              ))}
            </select>
            {selectedCompany && requestedCompanyId && (
              <span className={styles.fieldHint}>
                Empresa preseleccionada desde {selectedCompany.name}.
              </span>
            )}
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="business-type">Tipo de negocio</label>
            <select
              id="business-type"
              className={styles.select}
              value={businessType}
              onChange={(e) => setBusinessType(e.target.value)}
              required
            >
              <option value="">— Seleccionar —</option>
              {Object.entries(ESTRUCTURAS).map(([key, value]) => (
                <option key={key} value={key}>{value.label}</option>
              ))}
            </select>
          </div>

          <div className={styles.actions}>
            <button
              className={styles.primaryButton}
              type="submit"
              disabled={submitting || companiesLoading || companies.length === 0}
            >
              {submitting ? 'Creando...' : 'Crear proyecto'}
            </button>
            <button
              className={styles.secondaryButton}
              type="button"
              onClick={() => navigate(companyId ? `/companies/${companyId}` : '/companies')}
            >
              Cancelar
            </button>
          </div>

          {error && <p className={styles.error}>{error}</p>}
        </form>

        <aside className={styles.previewColumn}>
          {estructura ? (
            <div className={styles.preview}>
              <p className={styles.previewTitle}>
                Estructura sugerida para <strong>{estructura.label}</strong>
              </p>
              <div className={styles.pagesList}>
                {estructura.pages.map((page) => (
                  <div key={page.name} className={styles.pageBlock}>
                    <p className={styles.pageName}>{page.name}</p>
                    <ul className={styles.sectionList}>
                      {page.sections.map((section) => (
                        <li key={section} className={styles.sectionItem}>{section}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
              <p className={styles.previewNote}>
                Podrás editar esta estructura después de crear el proyecto.
              </p>
            </div>
          ) : (
            <div className={styles.previewEmpty}>
              <p className={styles.previewEmptyText}>
                Selecciona un tipo de negocio para ver la estructura sugerida.
              </p>
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}
