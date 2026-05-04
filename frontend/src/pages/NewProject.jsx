import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { apiFetch } from '../lib/api'
import { isAdmin } from '../lib/roleCapabilities'
import styles from './NewProject.module.css'

const ESTRUCTURAS = {
  tabula_rasa: {
    label: 'Tabula rasa',
    pages: [
      { name: 'Inicio', sections: ['Lienzo en blanco'] },
    ],
  },
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

const PROJECT_TYPES = {
  page: {
    label: 'Página Web',
    description: 'Brief seccionado para páginas web, landing pages y sitios.',
    previewTitle: 'Estructura sugerida',
  },
  document: {
    label: 'Artículo',
    description: 'Editor lineal para blog posts, artículos y contenido largo.',
    previewTitle: 'Artículo inicial',
    pages: [
      { name: 'Documento', sections: ['Índice por H1/H2/H3', 'SEO metadata por página', 'Contenido lineal sin divisores'] },
    ],
  },
  faq: {
    label: 'FAQ',
    description: 'Preguntas y respuestas con exportación CSV universal.',
    previewTitle: 'Estructura FAQ',
    pages: [
      { name: 'FAQs', sections: ['Título general opcional en H1', 'Pregunta Frecuente en H2', 'Respuesta debajo de cada pregunta', 'Export CSV: question, answer'] },
    ],
  },
}

function getDefaultCompanyId(companies) {
  return companies.find((company) => !company.isInternal)?.id || companies[0]?.id || ''
}

function normalizeRuleValue(value) {
  if (value === '' || value === null || value === undefined) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null
}

export default function NewProject() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { currentUser } = useAuth()
  const requestedCompanyId = searchParams.get('companyId')

  const [companies, setCompanies] = useState([])
  const [companiesLoading, setCompaniesLoading] = useState(true)
  const [name, setName] = useState('')
  const [projectType, setProjectType] = useState('page')
  const [businessType, setBusinessType] = useState('tabula_rasa')
  const [companyId, setCompanyId] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [contentRules, setContentRules] = useState({})

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
    () => {
      if (projectType === 'page') return businessType ? ESTRUCTURAS[businessType] : null
      return PROJECT_TYPES[projectType]
    },
    [businessType, projectType]
  )

  const selectedCompany = companies.find((company) => company.id === companyId) || null
  const selectedCompanyRole = currentUser?.memberships?.find((membership) => membership.companyId === companyId)?.role || null
  const canCreateProject = isAdmin(currentUser) || ['manager', 'editor'].includes(selectedCompanyRole)

  function updateContentRule(field, value) {
    setContentRules((current) => ({
      ...current,
      [field]: normalizeRuleValue(value),
    }))
  }

  async function handleCreateProject(e) {
    e.preventDefault()
    if (!canCreateProject) return
    setError('')
    setSubmitting(true)

    try {
      const data = await apiFetch('/api/projects', {
        method: 'POST',
        body: JSON.stringify({
          name,
          projectType,
          businessType: businessType || undefined,
          companyId: companyId || undefined,
          contentRules: projectType === 'document' ? contentRules : undefined,
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
            Crea el proyecto dentro de una empresa concreta y siembra su estructura inicial según el tipo de contenido.
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
            <label className={styles.label} htmlFor="project-type">Tipo de proyecto</label>
            <select
              id="project-type"
              className={styles.select}
              value={projectType}
              onChange={(e) => {
                setProjectType(e.target.value)
                setBusinessType('tabula_rasa')
              }}
              required
            >
              {Object.entries(PROJECT_TYPES).map(([key, value]) => (
                <option key={key} value={key}>{value.label}</option>
              ))}
            </select>
            <span className={styles.fieldHint}>{PROJECT_TYPES[projectType].description}</span>
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="business-type">
              {projectType === 'page' ? 'Tipo de negocio' : 'Contexto del negocio'}
            </label>
            <select
              id="business-type"
              className={styles.select}
              value={businessType}
              onChange={(e) => setBusinessType(e.target.value)}
              required
            >
              {Object.entries(ESTRUCTURAS).map(([key, value]) => (
                <option key={key} value={key}>{value.label}</option>
              ))}
            </select>
            {selectedCompany && (
              <span className={styles.fieldHint}>
                Se creará en {selectedCompany.name}.
              </span>
            )}
          </div>

          {projectType === 'document' && (
            <div className={styles.field}>
              <label className={styles.label}>Reglas de contenido</label>
              <div className={styles.preview}>
                <div className={styles.pagesList}>
                  <div className={styles.pageBlock}>
                    <p className={styles.pageName}>Opcional</p>
                    <div className={styles.sectionList} style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
                      <input className={styles.input} type="number" min="1" placeholder="Title min" value={contentRules.titleTagMinChars || ''} onChange={(e) => updateContentRule('titleTagMinChars', e.target.value)} />
                      <input className={styles.input} type="number" min="1" placeholder="Title max" value={contentRules.titleTagMaxChars || ''} onChange={(e) => updateContentRule('titleTagMaxChars', e.target.value)} />
                      <input className={styles.input} type="number" min="1" placeholder="Meta min" value={contentRules.metaDescriptionMinChars || ''} onChange={(e) => updateContentRule('metaDescriptionMinChars', e.target.value)} />
                      <input className={styles.input} type="number" min="1" placeholder="Meta max" value={contentRules.metaDescriptionMaxChars || ''} onChange={(e) => updateContentRule('metaDescriptionMaxChars', e.target.value)} />
                      <input className={styles.input} type="number" min="1" placeholder="Slug max palabras" value={contentRules.urlSlugMaxWords || ''} onChange={(e) => updateContentRule('urlSlugMaxWords', e.target.value)} />
                      <input className={styles.input} type="number" min="1" placeholder="Documento max palabras" value={contentRules.documentMaxWords || ''} onChange={(e) => updateContentRule('documentMaxWords', e.target.value)} />
                    </div>
                  </div>
                </div>
                <p className={styles.previewNote}>Si lo dejas vacío, el documento se crea sin límites.</p>
              </div>
            </div>
          )}

          {!canCreateProject && selectedCompany && (
            <p className={styles.error}>Tu rol actual en {selectedCompany.name} no puede crear proyectos.</p>
          )}

          <div className={styles.actions}>
            <button
              className={styles.primaryButton}
              type="submit"
              disabled={submitting || companiesLoading || companies.length === 0 || !canCreateProject}
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
                {PROJECT_TYPES[projectType].previewTitle} {projectType === 'page' && estructura.label && <>para <strong>{estructura.label}</strong></>}
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
