import { useLocation, useNavigate } from 'react-router-dom'
import { RefreshCw } from 'lucide-react'
import { Button } from './ui'
import styles from './SecurityShell.module.css'

const SECURITY_TABS = [
  { id: 'eventos',  label: 'Eventos',         path: '/security' },
  { id: 'bloqueos', label: 'Bloqueos activos', path: '/security/blocks' },
  { id: 'errores',  label: 'Errores técnicos', path: '/security/errors' },
]

function activeTabFromPath(pathname) {
  if (pathname.startsWith('/security/blocks')) return 'bloqueos'
  if (pathname.startsWith('/security/errors')) return 'errores'
  return 'eventos'
}

/**
 * Shared divided header for the Security area. Renders title, meta, an
 * "Actualizar" button (and optional extra actions), plus a tab bar at the
 * bottom that switches between the three security sub-views. Visual is
 * identical to the CompanyPage header so /security, /security/blocks and
 * /security/errors feel like tabs of one page even though they're routed
 * separately (each owns its own data loading).
 */
export default function SecurityShell({ title, meta, onRefresh, refreshing, extraActions }) {
  const navigate = useNavigate()
  const location = useLocation()
  const activeTab = activeTabFromPath(location.pathname)

  return (
    <header className={styles.pageHeader}>
      <div className={styles.pageHeaderInner}>
        <div className={styles.titleRow}>
          <div className={styles.headerMain}>
            <h1 className={styles.title}>{title}</h1>
            {meta && <p className={styles.headerMeta}>{meta}</p>}
          </div>
          <div className={styles.headerActions}>
            {extraActions}
            {onRefresh && (
              <Button
                type="button"
                variant="secondary"
                size="md"
                icon={<RefreshCw size={16} className={refreshing ? styles.refreshIconLoading : undefined} />}
                onClick={onRefresh}
                disabled={refreshing}
                aria-label="Actualizar"
                title="Actualizar"
              >
                Actualizar
              </Button>
            )}
          </div>
        </div>

        <div className={styles.tabBar} role="tablist" aria-label="Vistas de seguridad">
          {SECURITY_TABS.map((tab) => {
            const selected = tab.id === activeTab
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={selected}
                className={selected ? `${styles.tab} ${styles.tabActive}` : styles.tab}
                onClick={() => { if (!selected) navigate(tab.path) }}
              >
                {tab.label}
              </button>
            )
          })}
        </div>
      </div>
    </header>
  )
}
