import { useEffect, useMemo, useState } from 'react'
import { Archive, ArrowRight, Building2, Plus, Trash2 } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { useWorkspace } from '../contexts/WorkspaceContext'
import { apiFetch } from '../lib/api'
import { companyToSlug } from '../lib/companySlug'
import { isAdmin, canCreateTestCompany } from '../lib/roleCapabilities'
import { Button, Input, Select, Modal, Card, Badge, KebabMenu } from '../components/ui'
import EmptyState from '../components/onboarding/EmptyState'
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
  const { refresh: refreshWorkspace } = useWorkspace()
  const [companies, setCompanies] = useState(() => readCompaniesCache())
  const [loading, setLoading] = useState(() => readCompaniesCache().length === 0)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [modalOpen, setModalOpen] = useState(false)
  const [searchParams, setSearchParams] = useSearchParams()
  useEffect(() => {
    if (searchParams.get('new') === '1') {
      setModalOpen(true)
      const next = new URLSearchParams(searchParams)
      next.delete('new')
      setSearchParams(next, { replace: true })
    }
  }, [searchParams, setSearchParams])
  const [companyName, setCompanyName] = useState('')
  const [managerName, setManagerName] = useState('')
  const [managerEmail, setManagerEmail] = useState('')
  const [testMode, setTestMode] = useState(false)
  const [companyFeedback, setCompanyFeedback] = useState('')
  const [creatingCompany, setCreatingCompany] = useState(false)
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [bulkBusy, setBulkBusy] = useState(false)
  const [feedbackNotice, setFeedbackNotice] = useState('')
  const canCreateCompanies = isAdmin(currentUser) || canCreateTestCompany(currentUser)
  const canManageAnyCompany = useMemo(
    () => isAdmin(currentUser) || companies.some((company) => company.membershipRole === 'manager'),
    [currentUser, companies]
  )

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

  // ESC clears multiselect; do not consume ESC when no selection is active so
  // other components (modals, kebab menus) keep their own ESC handling.
  useEffect(() => {
    if (selectedIds.size === 0) return undefined
    function onKeyDown(event) {
      if (event.key !== 'Escape') return
      // Avoid stealing ESC from open modals (Modal primitive listens too)
      if (modalOpen) return
      event.stopPropagation()
      clearSelection()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [selectedIds, modalOpen])

  function showFeedback(message) {
    setFeedbackNotice(message)
    if (typeof window !== 'undefined') {
      window.setTimeout(() => setFeedbackNotice(''), 4000)
    }
  }

  function isCompanySelectable(company) {
    if (!company || company.isInternal) return false
    return isAdmin(currentUser) || company.membershipRole === 'manager'
  }

  function toggleSelected(companyId) {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(companyId)) next.delete(companyId)
      else next.add(companyId)
      return next
    })
  }

  function selectAllCompanies() {
    setSelectedIds(new Set(filteredCompanies.filter(isCompanySelectable).map((company) => company.id)))
  }

  function clearSelection() {
    setSelectedIds(new Set())
  }

  async function handleBulkArchive() {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) return
    if (!window.confirm(`¿Archivar ${ids.length} empresa(s)? Podrás restaurarlas desde Archivados.`)) return
    setBulkBusy(true)
    try {
      const result = await apiFetch('/api/companies/bulk/archive', {
        method: 'POST',
        body: JSON.stringify({ ids }),
      })
      const archived = Number(result?.archived || 0)
      const failed = Array.isArray(result?.failed) ? result.failed.length : 0
      const nextCompanies = companies.filter((company) => !selectedIds.has(company.id))
      setCompanies(nextCompanies)
      writeCompaniesCache(nextCompanies)
      clearCompanyDetailCaches()
      clearSelection()
      setError('')
      showFeedback(failed > 0
        ? `${archived} empresa(s) archivada(s); ${failed} no procesada(s)`
        : `${archived} empresa(s) archivada(s)`)
      refreshWorkspace()
    } catch (err) {
      setError(err.message || 'No se pudieron archivar las empresas')
    } finally {
      setBulkBusy(false)
    }
  }

  async function handleBulkTrash() {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) return
    if (!window.confirm(`¿Enviar ${ids.length} empresa(s) a papelera por 30 días?`)) return
    setBulkBusy(true)
    try {
      const result = await apiFetch('/api/companies/bulk/trash', {
        method: 'POST',
        body: JSON.stringify({ ids }),
      })
      const trashed = Number(result?.trashed || 0)
      const failed = Array.isArray(result?.failed) ? result.failed.length : 0
      const nextCompanies = companies.filter((company) => !selectedIds.has(company.id))
      setCompanies(nextCompanies)
      writeCompaniesCache(nextCompanies)
      clearCompanyDetailCaches()
      clearSelection()
      setError('')
      showFeedback(failed > 0
        ? `${trashed} empresa(s) en papelera; ${failed} no procesada(s)`
        : `${trashed} empresa(s) en papelera`)
      refreshWorkspace()
    } catch (err) {
      setError(err.message || 'No se pudieron enviar a papelera')
    } finally {
      setBulkBusy(false)
    }
  }

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
      await refreshWorkspace()
      navigate(`/c/${companyToSlug(data.company)}/projects`)
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

  // In select-mode (≥1 selected), clicking/Enter on the card toggles its
  // selection instead of opening the company. Explicit buttons (Abrir,
  // kebab) still perform their action via stopPropagation.
  function handleCompanyActivate(companyId, selectable) {
    if (selectedIds.size > 0) {
      if (selectable) toggleSelected(companyId)
    } else {
      openCompany(companyId)
    }
  }

  function handleCompanyKeyDown(event, companyId, selectable) {
    if (event.target.closest?.('button')) return
    if (event.target.closest?.('input, label, [role="menu"]')) return
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      handleCompanyActivate(companyId, selectable)
    }
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
      refreshWorkspace()
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
      refreshWorkspace()
    } catch (err) {
      setError(err.message || 'No se pudo enviar la empresa a papelera')
    }
  }

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div className={styles.pageHeaderInner}>
          <div className={styles.titleRow}>
            <div className={styles.headerMain}>
              <h1 className={styles.title}>Empresas</h1>
              <p className={styles.headerMeta}>
                {filteredCompanies.length} empresa{filteredCompanies.length === 1 ? '' : 's'} · Home principal del admin
              </p>
            </div>
            {canCreateCompanies && (
              <Button variant="primary" icon={<Plus size={16} />} onClick={openModal}>
                Nueva empresa
              </Button>
            )}
          </div>

          <div className={styles.toolbar}>
            <Input
              id="company-search"
              type="search"
              placeholder="Buscar por nombre"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />

            <Select
              id="company-filter"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
            >
              <option value="all">Todas</option>
              <option value="clients">Clientes</option>
              <option value="test">Pruebas</option>
              <option value="internal">Internas</option>
            </Select>
          </div>
        </div>
      </header>

      <div className={styles.pageBody}>

      {canManageAnyCompany && selectedIds.size > 0 && (
        <div className={styles.bulkToolbar} role="toolbar" aria-label="Acciones masivas">
          <div className={styles.bulkInfo}>
            <strong>{selectedIds.size} empresa{selectedIds.size === 1 ? '' : 's'} seleccionada{selectedIds.size === 1 ? '' : 's'}</strong>
            {(() => {
              const selectableTotal = filteredCompanies.filter(isCompanySelectable).length
              return selectedIds.size < selectableTotal ? (
                <button
                  type="button"
                  className={styles.bulkLink}
                  onClick={selectAllCompanies}
                >
                  Seleccionar todas ({selectableTotal})
                </button>
              ) : (
                <button
                  type="button"
                  className={styles.bulkLink}
                  onClick={clearSelection}
                >
                  Deseleccionar todas
                </button>
              )
            })()}
          </div>
          <div className={styles.bulkActions}>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              icon={<Archive size={14} />}
              onClick={handleBulkArchive}
              disabled={bulkBusy}
            >
              Archivar
            </Button>
            <Button
              type="button"
              variant="danger"
              size="sm"
              icon={<Trash2 size={14} />}
              onClick={handleBulkTrash}
              disabled={bulkBusy}
            >
              Enviar a papelera
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={clearSelection}
              disabled={bulkBusy}
            >
              Cancelar ({selectedIds.size})
            </Button>
          </div>
        </div>
      )}

      {feedbackNotice && (
        <div className={styles.feedbackNotice} role="status">
          {feedbackNotice}
        </div>
      )}

      {loading && <p className={styles.info}>Cargando empresas...</p>}
      {!loading && error && <p className={styles.error}>{error}</p>}
      {!loading && !error && paginatedCompanies.length === 0 && companies.length === 0 && (
        <EmptyState
          icon={Building2}
          title="Crea tu primera empresa"
          body="Una empresa agrupa proyectos y equipo. Empieza con tu agencia o un cliente."
          cta={canCreateCompanies ? {
            label: 'Nueva empresa',
            onClick: () => setModalOpen(true),
          } : null}
        />
      )}
      {!loading && !error && paginatedCompanies.length === 0 && companies.length > 0 && (
        <EmptyState
          icon={Building2}
          title="No hay empresas para esta búsqueda"
          body="Ajusta los filtros o limpia la búsqueda para ver todas las empresas."
        />
      )}

      {!loading && !error && paginatedCompanies.length > 0 && (
        <div className={styles.cardsGrid}>
          {paginatedCompanies.map((company) => {            const badge = companyTypeBadge(company)
            const selectable = isCompanySelectable(company)
            const showKebab = (isAdmin(currentUser) || company.membershipRole === 'manager') && !company.isInternal
            const isSelected = selectedIds.has(company.id)
            const inSelectMode = selectedIds.size > 0
            const cardClassNames = [styles.companyCard]
            if (isSelected) cardClassNames.push(styles.companyCardSelected)
            if (inSelectMode) cardClassNames.push(styles.companyCardInSelectMode)
            return (
              <Card
                key={company.id}
                padding="md"
                shadow="sm"
                radius="md"
                className={cardClassNames.join(' ')}
                aria-selected={isSelected ? 'true' : undefined}
                role="button"
                tabIndex={0}
                onClick={() => handleCompanyActivate(company.id, selectable)}
                onKeyDown={(event) => handleCompanyKeyDown(event, company.id, selectable)}
              >
                {selectable && (
                  <label
                    className={styles.companySelectLabel}
                    onClick={(event) => event.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      className={styles.companySelectCheckbox}
                      checked={isSelected}
                      onChange={() => toggleSelected(company.id)}
                      aria-label={isSelected ? `Deseleccionar ${company.name}` : `Seleccionar ${company.name}`}
                    />
                  </label>
                )}

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
                  <div className={styles.companyActionsButtons}>
                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      icon={<ArrowRight size={14} />}
                      iconPosition="right"
                      aria-label={`Abrir workspace de ${company.name}`}
                      title={`Abrir workspace de ${company.name}`}
                      onClick={(event) => {
                        event.stopPropagation()
                        openCompany(company.id)
                      }}
                    >
                      Abrir
                    </Button>
                  </div>
                  {showKebab && (
                    <div
                      className={styles.companyActionsKebab}
                      onClick={(event) => event.stopPropagation()}
                    >
                      <KebabMenu
                        label={`Más acciones de ${company.name}`}
                        placement="top-end"
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
                    </div>
                  )}
                </div>
              </Card>
            )
          })}
          {canCreateCompanies && (
            <button type="button" className={styles.addCard} onClick={openModal}>
              <Plus size={20} />
              <span>Nueva empresa</span>
            </button>
          )}
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

      </div>

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

          {canCreateTestCompany(currentUser) && (
            <label className={styles.checkboxRow}>
              <input
                type="checkbox"
                checked={testMode}
                onChange={(event) => setTestMode(event.target.checked)}
              />
              <span>Empresa de prueba</span>
            </label>
          )}

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
