import { useEffect, useMemo, useState } from 'react'
import { Archive, RefreshCw, Trash2 } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { apiFetch } from '../lib/api'
import { isAdmin } from '../lib/roleCapabilities'
import { Button, Select, Card, Badge, HelpPopover } from '../components/ui'
import EmptyState from '../components/onboarding/EmptyState'
import styles from './TrashPage.module.css'

const DATE_FILTERS = [
  { value: 'all', label: 'Todas las fechas', days: null },
  { value: 'today', label: 'Hoy', days: 1 },
  { value: '7d', label: 'Últimos 7 días', days: 7 },
  { value: '30d', label: 'Últimos 30 días', days: 30 },
  { value: '90d', label: 'Últimos 90 días', days: 90 },
]

const PAGE_COPY = {
  archived: {
    eyebrow: 'Operación',
    title: 'Archivados',
    subtitle: 'Consulta empresas y proyectos archivados, separados de la papelera operativa.',
    loading: 'Cargando archivados...',
    empty: 'No hay elementos archivados para este filtro.',
    sectionTitle: 'Elementos archivados',
  },
  trashed: {
    eyebrow: 'Operación',
    title: 'Papelera',
    subtitle: 'Restaura elementos en papelera o borra definitivamente lo que ya no debe conservarse.',
    loading: 'Cargando papelera...',
    empty: 'No hay elementos en papelera para este filtro.',
    sectionTitle: 'Elementos en papelera',
  },
}

const TAB_OPTIONS = [
  { value: 'companies', label: 'Empresas', type: 'company' },
  { value: 'projects', label: 'Proyectos', type: 'project' },
]

// TEMP demo items for visual preview. They render normally but Restaurar/
// Borrar are intercepted to show a toast (the fake IDs would 404 on the
// real API). Disappear automatically as soon as real archived/trashed
// items exist for the current mode.
const DEMO_TRASH = {
  archived: {
    companies: [
      { id: 'demo-c-arch-1', name: 'Studio Manifiesto', slug: 'studio-manifiesto', archivedAt: '2026-05-06T10:00:00Z', _demo: true },
      { id: 'demo-c-arch-2', name: 'Naranja Digital',   slug: 'naranja-digital',   archivedAt: '2026-04-12T09:00:00Z', _demo: true },
    ],
    projects: [
      { id: 'demo-p-arch-1', name: 'Landing Q1 2026', companyName: 'Agencia Creativa Norte', client: 'Plenna', businessType: 'Página Web', archivedAt: '2026-05-09T15:00:00Z', _demo: true },
      { id: 'demo-p-arch-2', name: 'Brief Pricing',    companyName: 'Studio Manifiesto',     client: 'Capilea', businessType: 'Brief',      archivedAt: '2026-05-02T11:00:00Z', _demo: true },
      { id: 'demo-p-arch-3', name: 'FAQ Soporte',      companyName: 'Naranja Digital',       client: 'NexxFinance', businessType: 'FAQs',   archivedAt: '2026-04-25T14:00:00Z', _demo: true },
    ],
  },
  trashed: {
    companies: [
      { id: 'demo-c-trash-1', name: 'Pixel & Form', slug: 'pixel-form', trashedAt: '2026-05-19T12:00:00Z', deleteAfter: '2026-06-18T12:00:00Z', _demo: true },
    ],
    projects: [
      { id: 'demo-p-trash-1', name: 'Página corporativa', companyName: 'Krea Studio', client: 'Avinova',      businessType: 'Página Web', trashedAt: '2026-05-18T10:00:00Z', deleteAfter: '2026-06-17T10:00:00Z', _demo: true },
      { id: 'demo-p-trash-2', name: 'Artículo lanzamiento', companyName: 'Studio Manifiesto', client: 'Plenna', businessType: 'Artículo',  trashedAt: '2026-05-13T16:30:00Z', deleteAfter: '2026-06-12T16:30:00Z', _demo: true },
    ],
  },
}

function formatDate(isoDate) {
  if (!isoDate) return 'Sin fecha'

  return new Date(isoDate).toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function clearWorkspaceCaches() {
  try {
    window.sessionStorage.removeItem('webrief:companies')
    for (const key of Object.keys(window.sessionStorage)) {
      if (key.startsWith('webrief:company:')) {
        window.sessionStorage.removeItem(key)
      }
    }
  } catch {
    // Ignore storage failures; network data still renders.
  }
}

function lifecycleDate(item, mode) {
  return mode === 'archived' ? item.archivedAt : item.trashedAt
}

function tabId(mode, tabValue) {
  return `${mode}-${tabValue}-tab`
}

function panelId(mode, tabValue) {
  return `${mode}-${tabValue}-panel`
}

function matchesDateFilter(item, mode, dateFilter) {
  const filter = DATE_FILTERS.find((option) => option.value === dateFilter)
  if (!filter?.days) return true

  const value = lifecycleDate(item, mode)
  if (!value) return false

  const date = new Date(value)
  const since = new Date()
  since.setHours(0, 0, 0, 0)
  since.setDate(since.getDate() - (filter.days - 1))

  return date >= since
}

export default function TrashPage({ mode = 'trashed' }) {
  const { currentUser } = useAuth()
  const pageCopy = PAGE_COPY[mode] || PAGE_COPY.trashed
  const [companies, setCompanies] = useState([])
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyKey, setBusyKey] = useState('')
  const [activeTab, setActiveTab] = useState('companies')
  const [dateFilter, setDateFilter] = useState('all')

  async function loadItems() {
    try {
      setLoading(true)
      const data = await apiFetch(`/api/trash?state=${mode}`)
      setCompanies(data.companies || [])
      setProjects(data.projects || [])
      setError('')
    } catch (err) {
      setError(err.message || `No se pudieron cargar ${pageCopy.title.toLowerCase()}`)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    setActiveTab('companies')
    setDateFilter('all')
    loadItems()
  }, [mode])

  const displayCompanies = companies.length > 0 ? companies : (DEMO_TRASH[mode]?.companies || [])
  const displayProjects = projects.length > 0 ? projects : (DEMO_TRASH[mode]?.projects || [])

  const filteredCompanies = useMemo(() => (
    displayCompanies.filter((item) => matchesDateFilter(item, mode, dateFilter))
  ), [displayCompanies, dateFilter, mode])

  const filteredProjects = useMemo(() => (
    displayProjects.filter((item) => matchesDateFilter(item, mode, dateFilter))
  ), [displayProjects, dateFilter, mode])

  const totalItems = filteredCompanies.length + filteredProjects.length

  function handleTabKeyDown(event) {
    const currentIndex = TAB_OPTIONS.findIndex((option) => option.value === activeTab)
    let nextIndex = currentIndex

    if (event.key === 'ArrowLeft') {
      nextIndex = currentIndex <= 0 ? TAB_OPTIONS.length - 1 : currentIndex - 1
    } else if (event.key === 'ArrowRight') {
      nextIndex = currentIndex >= TAB_OPTIONS.length - 1 ? 0 : currentIndex + 1
    } else if (event.key === 'Home') {
      nextIndex = 0
    } else if (event.key === 'End') {
      nextIndex = TAB_OPTIONS.length - 1
    } else {
      return
    }

    event.preventDefault()
    const nextTab = TAB_OPTIONS[nextIndex]
    setActiveTab(nextTab.value)
    window.requestAnimationFrame(() => {
      document.getElementById(tabId(mode, nextTab.value))?.focus()
    })
  }

  async function restoreItem(type, id) {
    if (typeof id === 'string' && id.startsWith('demo-')) {
      window.alert('Demo: este es un elemento de muestra. Restaurar funciona cuando hay elementos reales.')
      return
    }
    const key = `${type}:${id}:restore`
    setBusyKey(key)
    try {
      await apiFetch(`/api/${type === 'company' ? 'companies' : 'projects'}/${id}/restore`, { method: 'POST' })
      if (type === 'company') {
        setCompanies((current) => current.filter((item) => item.id !== id))
      } else {
        setProjects((current) => current.filter((item) => item.id !== id))
      }
      clearWorkspaceCaches()
      setError('')
    } catch (err) {
      setError(err.message || 'No se pudo restaurar el elemento')
    } finally {
      setBusyKey('')
    }
  }

  async function deleteItem(type, id) {
    if (typeof id === 'string' && id.startsWith('demo-')) {
      window.alert('Demo: este es un elemento de muestra. Borrar funciona cuando hay elementos reales.')
      return
    }
    if (!window.confirm('¿Borrar este elemento permanentemente? Esta acción no se puede deshacer.')) return

    const key = `${type}:${id}:delete`
    setBusyKey(key)
    try {
      await apiFetch(`/api/${type === 'company' ? 'companies' : 'projects'}/${id}/permanent`, { method: 'DELETE' })
      if (type === 'company') {
        setCompanies((current) => current.filter((item) => item.id !== id))
      } else {
        setProjects((current) => current.filter((item) => item.id !== id))
      }
      clearWorkspaceCaches()
      setError('')
    } catch (err) {
      setError(err.message || 'No se pudo borrar el elemento')
    } finally {
      setBusyKey('')
    }
  }

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div className={styles.pageHeaderInner}>
          <div className={styles.titleRow}>
            <div className={styles.headerMain}>
              <h1 className={styles.title}>
                {pageCopy.title}
                {mode === 'trashed' && (
                  <>
                    {' '}
                    <HelpPopover
                      title="Retención automática"
                      body="Los proyectos en papelera se borran solos: brief en 15 días, otros tipos en 30. Restáuralos antes del vencimiento o se purgan junto con sus assets."
                    />
                  </>
                )}
              </h1>
              <p className={styles.headerMeta}>
                {totalItems} elemento{totalItems === 1 ? '' : 's'}
                {' · '}
                {pageCopy.subtitle}
              </p>
            </div>
            <div className={styles.headerActions}>
              <Select
                value={dateFilter}
                onChange={(event) => setDateFilter(event.target.value)}
                fullWidth={false}
                className={styles.dateFilterField}
                aria-label="Filtrar por fecha"
              >
                {DATE_FILTERS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </Select>
              <Button
                type="button"
                variant="secondary"
                size="md"
                icon={<RefreshCw size={16} className={loading ? styles.refreshIconLoading : undefined} />}
                onClick={loadItems}
                disabled={loading}
                aria-label="Actualizar elementos"
                title="Actualizar"
              >
                Actualizar
              </Button>
            </div>
          </div>

          <div
            className={styles.tabBar}
            role="tablist"
            aria-label={`Tipo de ${pageCopy.title.toLowerCase()}`}
            onKeyDown={handleTabKeyDown}
          >
            {TAB_OPTIONS.map((tab) => {
              const selected = activeTab === tab.value

              return (
                <button
                  key={tab.value}
                  id={tabId(mode, tab.value)}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  aria-controls={panelId(mode, tab.value)}
                  tabIndex={selected ? 0 : -1}
                  className={selected ? `${styles.tab} ${styles.tabActive}` : styles.tab}
                  onClick={() => setActiveTab(tab.value)}
                >
                  {tab.label}
                </button>
              )
            })}
          </div>
        </div>
      </header>

      <div className={styles.pageBody}>

      {TAB_OPTIONS.map((tab) => {
        const selected = activeTab === tab.value
        const panelItems = tab.value === 'companies' ? filteredCompanies : filteredProjects

        return (
          <section
            key={tab.value}
            id={panelId(mode, tab.value)}
            className={styles.listSection}
            role="tabpanel"
            aria-labelledby={tabId(mode, tab.value)}
            tabIndex={0}
            hidden={!selected}
          >
            {selected && loading && <p className={styles.info}>{pageCopy.loading}</p>}
            {selected && !loading && error && <p className={styles.error}>{error}</p>}
            {selected && !loading && !error && panelItems.length === 0 && (
              <EmptyState
                icon={mode === 'archived' ? Archive : Trash2}
                title={
                  tab.value === 'companies'
                    ? (mode === 'archived'
                        ? 'No hay empresas archivadas'
                        : 'La papelera de empresas está limpia')
                    : (mode === 'archived'
                        ? 'No hay proyectos archivados'
                        : 'La papelera de proyectos está limpia')
                }
                body={
                  tab.value === 'companies'
                    ? (mode === 'archived'
                        ? 'Cuando archives una empresa la verás aquí.'
                        : 'Las empresas eliminadas se borran automáticamente en 30 días (15 para briefs).')
                    : (mode === 'archived'
                        ? 'Cuando archives un proyecto lo verás aquí.'
                        : 'Los proyectos eliminados se borran automáticamente en 30 días (15 para briefs). Puedes restaurarlos antes de que expiren.')
                }
              />
            )}

            {selected && !loading && !error && panelItems.length > 0 && (
              <TrashGrid
                items={panelItems}
                type={tab.type}
                mode={mode}
                busyKey={busyKey}
                onRestore={restoreItem}
                onDelete={deleteItem}
                canDeletePermanently={isAdmin(currentUser)}
              />
            )}
          </section>
        )
      })}
      </div>
    </div>
  )
}

function TrashGrid({ items, type, mode, busyKey, onRestore, onDelete, canDeletePermanently = false }) {
  return (
    <div className={styles.cardsGrid}>
      {items.map((item) => {
        const restoreBusy = busyKey === `${type}:${item.id}:restore`
        const deleteBusy = busyKey === `${type}:${item.id}:delete`
        const dateLabel = mode === 'archived' ? 'Archivado' : 'En papelera'

        return (
          <Card key={`${type}-${item.id}`} padding="md" shadow="sm" radius="md" className={styles.itemCard}>
            <div className={styles.cardTop}>
              <div>
                <h3 className={styles.itemTitle}>{item.name}</h3>
                <p className={styles.itemMeta}>
                  {type === 'project' ? `${item.companyName || 'Sin empresa'} · ${item.client || 'Sin cliente'}` : `/${item.slug}`}
                </p>
              </div>
              <Badge variant={mode === 'trashed' ? 'danger' : 'neutral'} size="sm">
                {mode === 'trashed' ? 'Papelera' : 'Archivado'}
              </Badge>
            </div>

            <div className={styles.metaList}>
              <div className={styles.metaRow}>
                <span className={styles.metaLabel}>{dateLabel}</span>
                <span className={styles.metaValue}>{formatDate(lifecycleDate(item, mode))}</span>
              </div>
              {mode === 'trashed' && item.deleteAfter && (
                <div className={styles.metaRow}>
                  <span className={styles.metaLabel}>Borrado sugerido</span>
                  <span className={styles.metaValue}>{formatDate(item.deleteAfter)}</span>
                </div>
              )}
              {type === 'project' && (
                <div className={styles.metaRow}>
                  <span className={styles.metaLabel}>Tipo</span>
                  <span className={styles.metaValue}>{item.businessType}</span>
                </div>
              )}
            </div>

            <div className={styles.actions}>
              <Button
                variant="primary"
                onClick={() => onRestore(type, item.id)}
                disabled={restoreBusy || deleteBusy}
                loading={restoreBusy}
              >
                {restoreBusy ? 'Restaurando...' : 'Restaurar'}
              </Button>
              {mode === 'trashed' && canDeletePermanently && (
                <Button
                  variant="danger"
                  onClick={() => onDelete(type, item.id)}
                  disabled={restoreBusy || deleteBusy}
                  loading={deleteBusy}
                >
                  {deleteBusy ? 'Borrando...' : 'Borrar'}
                </Button>
              )}
            </div>
          </Card>
        )
      })}
    </div>
  )
}
