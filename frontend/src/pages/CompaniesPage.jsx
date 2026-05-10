import { useEffect, useMemo, useState } from 'react'
import { Archive, ArrowRight, Trash2, Plus } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { apiFetch } from '../lib/api'
import { isAdmin } from '../lib/roleCapabilities'
import { Button, Input, Select, Modal, Card, Badge, KebabMenu } from '../components/ui'
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

function companyTypeBadge(company) {
  if (company.isInternal) return { variant: 'neutral', label: 'Interna' }
  if (company.isTest) return { variant: 'success', label: 'Prueba' }
  return { variant: 'primary', label: 'Cliente' }
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
  const canCreateCompanies = isAdmin(currentUser)

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

  async function handleCompanyArchive(companyId) {
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

  async function handleCompanyTrash(companyId) {
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
        <Input
          id="company-search"
          label="Buscar"
          type="search"
          placeholder="Buscar por nombre"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        <Select
          id="company-filter"
          label="Tipo"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
        >
          <option value="all">Todas</option>
          <option value="clients">Clientes</option>
          <option value="test">Pruebas</option>
          <option value="internal">Internas</option>
        </Select>
      </section>

      <section className={styles.sectionHeader}>
        <div>
          <h2 className={styles.sectionTitle}>Empresas</h2>
          <p className={styles.sectionMeta}>
            {filteredCompanies.length} empresa{filteredCompanies.length === 1 ? '' : 's'}
          </p>
        </div>

        {canCreateCompanies && (
          <Button variant="primary" icon={<Plus size={16} />} onClick={openModal}>
            Nueva empresa
          </Button>
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
          {paginatedCompanies.map((company) => {
            const badge = companyTypeBadge(company)
            return (
              <Card key={company.id} padding="md" shadow="sm" radius="md" className={styles.companyCard}>
                <div className={styles.cardHeader}>
                  <h3 className={styles.companyName}>{company.name}</h3>
                  <Badge variant={badge.variant} size="sm">{badge.label}</Badge>
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
                  {(isAdmin(currentUser) || company.membershipRole === 'manager') && !company.isInternal && (
                    <KebabMenu
                      label={`Más acciones de ${company.name}`}
                      items={[
                        {
                          label: 'Archivar',
                          icon: <Archive size={14} />,
                          onClick: () => handleCompanyArchive(company.id),
                        },
                        {
                          label: 'Enviar a papelera',
                          icon: <Trash2 size={14} />,
                          destructive: true,
                          onClick: () => handleCompanyTrash(company.id),
                        },
                      ]}
                    />
                  )}
                  <Button
                    type="button"
                    variant="primary"
                    size="md"
                    icon={<ArrowRight size={16} />}
                    iconPosition="right"
                    aria-label={`Abrir workspace de ${company.name}`}
                    title={`Abrir workspace de ${company.name}`}
                    onClick={() => openCompany(company.id)}
                    className={styles.cardOpenButton}
                  >
                    Abrir
                  </Button>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      <footer className={styles.pagination}>
        <p className={styles.paginationText}>
          Página {currentPage} de {pageCount}
        </p>

        <div className={styles.paginationActions}>
          <Button
            type="button"
            variant="secondary"
            size="md"
            disabled={currentPage === 1}
            onClick={() => setPage((currentValue) => Math.max(1, currentValue - 1))}
          >
            Anterior
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="md"
            disabled={currentPage === pageCount}
            onClick={() => setPage((currentValue) => Math.min(pageCount, currentValue + 1))}
          >
            Siguiente
          </Button>
        </div>
      </footer>

      <Modal
        open={modalOpen}
        onClose={closeModal}
        title="Nueva empresa"
        size="md"
        ariaDescribedBy="new-company-description"
      >
        <p id="new-company-description" className={styles.modalText}>
          {testMode
            ? 'Crea una empresa de prueba sin invitación inicial.'
            : 'Crea la empresa cliente junto a su manager inicial. La empresa no quedará creada si no se puede asignar ese usuario.'}
        </p>

        <form className={styles.modalForm} onSubmit={handleCreateCompany}>
          <Input
            id="new-company-name"
            label="Empresa"
            type="text"
            placeholder="Ej: Nettronik"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            required={!testMode}
            autoFocus
          />

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
              <Input
                id="new-manager-name"
                label="Manager"
                type="text"
                placeholder="Nombre completo"
                value={managerName}
                onChange={(e) => setManagerName(e.target.value)}
              />

              <Input
                id="new-manager-email"
                label="Email del manager"
                type="email"
                placeholder="manager@empresa.com"
                value={managerEmail}
                onChange={(e) => setManagerEmail(e.target.value)}
                required
              />
            </>
          )}

          <Button type="submit" variant="primary" disabled={creatingCompany} loading={creatingCompany} fullWidth>
            {creatingCompany ? 'Creando...' : 'Crear empresa'}
          </Button>
        </form>

        {companyFeedback && <p className={styles.error}>{companyFeedback}</p>}
      </Modal>
    </div>
  )
}
