import { useEffect, useMemo, useState } from 'react'
import { Archive, ArrowRight, Trash2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { apiFetch } from '../lib/api'
import styles from './CompaniesPage.module.css'

const PAGE_SIZE = 8
const COMPANIES_CACHE_KEY = 'webrief:companies'

function readCompaniesCache() {
  try {
    const cached = JSON.parse(window.sessionStorage.getItem(COMPANIES_CACHE_KEY))
    return Array.isArray(cached?.companies) ? cached.companies : []
  } catch {
    return []
  }
}

function writeCompaniesCache(companies) {
  try {
    window.sessionStorage.setItem(COMPANIES_CACHE_KEY, JSON.stringify({
      companies,
      cachedAt: new Date().toISOString(),
    }))
  } catch {
    // Ignore storage failures; network data still renders.
  }
}

function clearCompanyDetailCaches() {
  try {
    for (const key of Object.keys(window.sessionStorage)) {
      if (key.startsWith('webrief:company:')) {
        window.sessionStorage.removeItem(key)
      }
    }
  } catch {
    // Ignore storage failures; network data still renders.
  }
}

function formatDate(isoDate) {
  if (!isoDate) return 'Sin actividad'

  return new Date(isoDate).toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export default function CompaniesPage() {
  const navigate = useNavigate()
  const { currentUser } = useAuth()
  const [companies, setCompanies] = useState(() => readCompaniesCache())
  const [loading, setLoading] = useState(() => readCompaniesCache().length === 0)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [modalOpen, setModalOpen] = useState(false)
  const [companyName, setCompanyName] = useState('')
  const [managerName, setManagerName] = useState('')
  const [managerEmail, setManagerEmail] = useState('')
  const [testMode, setTestMode] = useState(false)
  const [companyFeedback, setCompanyFeedback] = useState('')
  const [creatingCompany, setCreatingCompany] = useState(false)

  useEffect(() => {
    let active = true

    async function loadCompanies() {
      try {
        setLoading((current) => companies.length === 0 ? true : current)
        const data = await apiFetch('/api/companies')
        if (!active) return
        setCompanies(data.companies)
        writeCompaniesCache(data.companies)
        setError('')
      } catch (err) {
        if (!active) return
        setError(err.message || 'No se pudieron cargar las empresas')
      } finally {
        if (active) setLoading(false)
      }
    }

    loadCompanies()

    return () => {
      active = false
    }
  }, [])

  const filteredCompanies = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()

    return companies.filter((company) => {
      const matchesQuery = normalizedQuery.length === 0
        || company.name.toLowerCase().includes(normalizedQuery)
        || company.slug.toLowerCase().includes(normalizedQuery)

      const matchesType = typeFilter === 'all'
        || (typeFilter === 'internal' && company.isInternal)
        || (typeFilter === 'test' && company.isTest)
        || (typeFilter === 'clients' && !company.isInternal && !company.isTest)

      return matchesQuery && matchesType
    })
  }, [companies, query, typeFilter])

  useEffect(() => {
    setPage(1)
  }, [query, typeFilter])

  const pageCount = Math.max(1, Math.ceil(filteredCompanies.length / PAGE_SIZE))
  const currentPage = Math.min(page, pageCount)
  const paginatedCompanies = filteredCompanies.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  )

  async function handleCreateCompany(e) {
    e.preventDefault()
    setCompanyFeedback('')
    setCreatingCompany(true)

    try {
      const data = await apiFetch('/api/companies', {
        method: 'POST',
        body: JSON.stringify({
          name: companyName,
          managerName: testMode ? '' : managerName,
          managerEmail: testMode ? '' : managerEmail,
          testMode,
        }),
      })

      const nextCompanies = [...companies, data.company].sort((a, b) => a.name.localeCompare(b.name))
      setCompanies(nextCompanies)
      writeCompaniesCache(nextCompanies)
      setCompanyName('')
      setManagerName('')
      setManagerEmail('')
      setTestMode(false)
      setCompanyFeedback('')
      setModalOpen(false)
      navigate(`/companies/${data.company.id}`)
    } catch (err) {
      setCompanyFeedback(err.message || 'No se pudo crear la empresa')
    } finally {
      setCreatingCompany(false)
    }
  }

  function openModal() {
    setCompanyFeedback('')
    setModalOpen(true)
  }

  function closeModal() {
    if (creatingCompany) return
    setModalOpen(false)
    setCompanyName('')
    setManagerName('')
    setManagerEmail('')
    setTestMode(false)
    setCompanyFeedback('')
  }

  function openCompany(companyId) {
    navigate(`/companies/${companyId}`)
  }

  async function handleCompanyArchive(event, companyId) {
    event.stopPropagation()
    if (!window.confirm('¿Archivar esta empresa? Podrás restaurarla desde Archivados.')) return

    try {
      await apiFetch(`/api/companies/${companyId}/archive`, { method: 'POST' })
      const nextCompanies = companies.filter((company) => company.id !== companyId)
      setCompanies(nextCompanies)
      writeCompaniesCache(nextCompanies)
      clearCompanyDetailCaches()
      setError('')
    } catch (err) {
      setError(err.message || 'No se pudo archivar la empresa')
    }
  }

  async function handleCompanyTrash(event, companyId) {
    event.stopPropagation()
    if (!window.confirm('¿Enviar esta empresa a papelera por 30 días?')) return

    try {
      await apiFetch(`/api/companies/${companyId}/trash`, { method: 'POST' })
      const nextCompanies = companies.filter((company) => company.id !== companyId)
      setCompanies(nextCompanies)
      writeCompaniesCache(nextCompanies)
      clearCompanyDetailCaches()
      setError('')
    } catch (err) {
      setError(err.message || 'No se pudo enviar la empresa a papelera')
    }
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Admin</p>
          <h1 className={styles.title}>Empresas</h1>
          <p className={styles.subtitle}>
            Home principal del admin. Busca, filtra y entra al workspace de cada empresa.
          </p>
        </div>
      </header>

      <section className={styles.toolbar}>
        <div className={styles.searchWrap}>
          <label className={styles.fieldLabel} htmlFor="company-search">Buscar</label>
          <input
            id="company-search"
            className={styles.input}
            type="search"
            placeholder="Buscar por nombre"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <div className={styles.filterWrap}>
          <label className={styles.fieldLabel} htmlFor="company-filter">Tipo</label>
          <select
            id="company-filter"
            className={styles.select}
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
          >
            <option value="all">Todas</option>
            <option value="clients">Clientes</option>
            <option value="test">Pruebas</option>
            <option value="internal">Internas</option>
          </select>
        </div>
      </section>

      <section className={styles.sectionHeader}>
        <div>
          <h2 className={styles.sectionTitle}>Empresas</h2>
          <p className={styles.sectionMeta}>
            {filteredCompanies.length} empresa{filteredCompanies.length === 1 ? '' : 's'}
          </p>
        </div>

        {currentUser?.platformRole === 'admin' && (
          <button className={styles.primaryButton} onClick={openModal}>
            + Nueva empresa
          </button>
        )}
      </section>

      {loading && <p className={styles.info}>Cargando empresas...</p>}
      {!loading && error && <p className={styles.error}>{error}</p>}
      {!loading && !error && paginatedCompanies.length === 0 && (
        <div className={styles.emptyState}>
          <p className={styles.emptyTitle}>No hay empresas para esta búsqueda.</p>
          <p className={styles.emptyText}>
            Ajusta filtros o crea una empresa nueva para empezar a organizar proyectos y equipo.
          </p>
        </div>
      )}

      {!loading && !error && paginatedCompanies.length > 0 && (
        <div className={styles.cardsGrid}>
          {paginatedCompanies.map((company) => (
            <article
              key={company.id}
              className={styles.companyCard}
            >
              <div className={styles.cardHeader}>
                <h3 className={styles.companyName}>{company.name}</h3>
                <span className={company.isInternal ? styles.internalBadge : company.isTest ? styles.testBadge : styles.clientBadge}>
                  {company.isInternal ? 'Interna' : company.isTest ? 'Prueba' : 'Cliente'}
                </span>
              </div>

              <div className={styles.cardStats}>
                <div className={styles.statItem}>
                  <span className={styles.statValue}>{company.projectCount}</span>
                  <span className={styles.statLabel}>Proyectos</span>
                </div>
                <div className={styles.statItem}>
                  <span className={styles.statValue}>{company.memberCount}</span>
                  <span className={styles.statLabel}>Equipo</span>
                </div>
              </div>

              <p className={styles.activityLine}>
                <span>Última actividad</span>
                <time>{formatDate(company.lastActivity)}</time>
              </p>

              <div className={styles.cardActions}>
                <button
                  className={styles.cardOpenButton}
                  onClick={() => openCompany(company.id)}
                  aria-label={`Abrir workspace de ${company.name}`}
                  title={`Abrir workspace de ${company.name}`}
                >
                  <span>Abrir</span>
                  <ArrowRight aria-hidden="true" />
                </button>
                {currentUser?.platformRole === 'admin' && !company.isInternal && (
                  <>
                    <button
                      className={styles.cardIconButton}
                      onClick={(event) => handleCompanyArchive(event, company.id)}
                      aria-label={`Archivar ${company.name}`}
                      title="Archivar"
                    >
                      <Archive aria-hidden="true" />
                    </button>
                    <button
                      className={styles.cardDangerButton}
                      onClick={(event) => handleCompanyTrash(event, company.id)}
                      aria-label={`Enviar ${company.name} a papelera`}
                      title="Papelera"
                    >
                      <Trash2 aria-hidden="true" />
                    </button>
                  </>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      <footer className={styles.pagination}>
        <p className={styles.paginationText}>
          Página {currentPage} de {pageCount}
        </p>

        <div className={styles.paginationActions}>
          <button
            className={styles.paginationButton}
            onClick={() => setPage((currentValue) => Math.max(1, currentValue - 1))}
            disabled={currentPage === 1}
          >
            Anterior
          </button>
          <button
            className={styles.paginationButton}
            onClick={() => setPage((currentValue) => Math.min(pageCount, currentValue + 1))}
            disabled={currentPage === pageCount}
          >
            Siguiente
          </button>
        </div>
      </footer>

      {modalOpen && (
        <div className={styles.modalOverlay} onClick={closeModal}>
          <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div>
                <h3 className={styles.modalTitle}>Nueva empresa</h3>
                <p className={styles.modalText}>
                  {testMode
                    ? 'Crea una empresa de prueba sin invitación inicial.'
                    : 'Crea la empresa cliente junto a su manager inicial. La empresa no quedará creada si no se puede asignar ese usuario.'}
                </p>
              </div>
              <button className={styles.modalClose} onClick={closeModal}>×</button>
            </div>

            <form className={styles.modalForm} onSubmit={handleCreateCompany}>
              <div className={styles.modalField}>
                <label className={styles.fieldLabel} htmlFor="new-company-name">Empresa</label>
                <input
                  id="new-company-name"
                  className={styles.input}
                  type="text"
                  placeholder="Ej: Nettronik"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  required={!testMode}
                  autoFocus
                />
              </div>

              <label className={styles.checkboxRow}>
                <input
                  type="checkbox"
                  checked={testMode}
                  onChange={(event) => setTestMode(event.target.checked)}
                />
                <span>Empresa de prueba</span>
              </label>

              {!testMode && (
                <>
                  <div className={styles.modalField}>
                    <label className={styles.fieldLabel} htmlFor="new-manager-name">Manager</label>
                    <input
                      id="new-manager-name"
                      className={styles.input}
                      type="text"
                      placeholder="Nombre completo"
                      value={managerName}
                      onChange={(e) => setManagerName(e.target.value)}
                    />
                  </div>

                  <div className={styles.modalField}>
                    <label className={styles.fieldLabel} htmlFor="new-manager-email">Email del manager</label>
                    <input
                      id="new-manager-email"
                      className={styles.input}
                      type="email"
                      placeholder="manager@empresa.com"
                      value={managerEmail}
                      onChange={(e) => setManagerEmail(e.target.value)}
                      required
                    />
                  </div>
                </>
              )}

              <button className={styles.primaryButton} type="submit" disabled={creatingCompany}>
                {creatingCompany ? 'Creando...' : 'Crear empresa'}
              </button>
            </form>

            {companyFeedback && <p className={styles.error}>{companyFeedback}</p>}
          </div>
        </div>
      )}
    </div>
  )
}
