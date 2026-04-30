import { useEffect, useMemo, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { apiFetch } from '../lib/api'
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

  const filteredCompanies = useMemo(() => (
    companies.filter((item) => matchesDateFilter(item, mode, dateFilter))
  ), [companies, dateFilter, mode])

  const filteredProjects = useMemo(() => (
    projects.filter((item) => matchesDateFilter(item, mode, dateFilter))
  ), [projects, dateFilter, mode])

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
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>{pageCopy.eyebrow}</p>
          <h1 className={styles.title}>{pageCopy.title}</h1>
          <p className={styles.subtitle}>{pageCopy.subtitle}</p>
        </div>
      </header>

      <section className={styles.sectionHeader}>
        <div>
          <h2 className={styles.sectionTitle}>{pageCopy.sectionTitle}</h2>
          <p className={styles.sectionMeta}>
            {totalItems} elemento{totalItems === 1 ? '' : 's'} en este filtro
          </p>
        </div>
      </section>

      <section className={styles.controls}>
        <div
          className={styles.tabs}
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
                className={selected ? `${styles.tabButton} ${styles.tabButtonActive}` : styles.tabButton}
                onClick={() => setActiveTab(tab.value)}
              >
                {tab.label}
              </button>
            )
          })}
        </div>

        <div className={styles.toolbarActions}>
          <label className={styles.dateFilter}>
            <span>Fecha</span>
            <select value={dateFilter} onChange={(event) => setDateFilter(event.target.value)}>
              {DATE_FILTERS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>

          <button
            className={styles.tertiaryButton}
            onClick={loadItems}
            disabled={loading}
            aria-label="Actualizar elementos"
            title="Actualizar"
          >
            <RefreshCw
              className={loading ? `${styles.refreshIcon} ${styles.refreshIconLoading}` : styles.refreshIcon}
              aria-hidden="true"
            />
            <span>Actualizar</span>
          </button>
        </div>
      </section>

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
              <div className={styles.emptyState}>
                <p className={styles.emptyTitle}>{pageCopy.empty}</p>
                <p className={styles.emptyText}>Cambia de pestaña o ajusta el filtro de fecha para revisar otros elementos.</p>
              </div>
            )}

            {selected && !loading && !error && panelItems.length > 0 && (
              <TrashGrid
                items={panelItems}
                type={tab.type}
                mode={mode}
                busyKey={busyKey}
                onRestore={restoreItem}
                onDelete={deleteItem}
                canDeletePermanently={currentUser?.platformRole === 'admin'}
              />
            )}
          </section>
        )
      })}
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
          <article key={`${type}-${item.id}`} className={styles.itemCard}>
            <div className={styles.cardTop}>
              <div>
                <h3 className={styles.itemTitle}>{item.name}</h3>
                <p className={styles.itemMeta}>
                  {type === 'project' ? `${item.companyName || 'Sin empresa'} · ${item.client || 'Sin cliente'}` : `/${item.slug}`}
                </p>
              </div>
              <span className={mode === 'trashed' ? styles.trashedBadge : styles.archivedBadge}>
                {mode === 'trashed' ? 'Papelera' : 'Archivado'}
              </span>
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
              <button
                className={styles.primaryButton}
                onClick={() => onRestore(type, item.id)}
                disabled={restoreBusy || deleteBusy}
              >
                {restoreBusy ? 'Restaurando...' : 'Restaurar'}
              </button>
              {mode === 'trashed' && canDeletePermanently && (
                <button
                  className={styles.dangerButton}
                  onClick={() => onDelete(type, item.id)}
                  disabled={restoreBusy || deleteBusy}
                >
                  {deleteBusy ? 'Borrando...' : 'Borrar'}
                </button>
              )}
            </div>
          </article>
        )
      })}
    </div>
  )
}
