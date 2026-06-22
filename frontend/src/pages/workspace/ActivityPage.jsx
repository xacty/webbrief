import { useEffect, useState } from 'react'
import { Activity } from 'lucide-react'
import { useAuth } from '../../auth/AuthContext'
import { useWorkspace } from '../../contexts/WorkspaceContext'
import { apiFetch } from '../../lib/api'
import { formatDate } from '../../lib/companyFormatters'
import {
  getCompanyRoleLabel as getCompanyRoleLabelShared,
  getPlatformRoleTitle,
} from '../../../../shared/userRoles.js'
import { Badge } from '../../components/ui'
import EmptyState from '../../components/onboarding/EmptyState'
import styles from './workspace.module.css'

function getCompanyRoleLabel(currentUser, membershipRole) {
  if (currentUser?.platformRole === 'admin') return getPlatformRoleTitle(currentUser.platformRole)
  return getCompanyRoleLabelShared(membershipRole)
}

export default function ActivityPage() {
  const { currentUser } = useAuth()
  const { currentCompany } = useWorkspace()
  const companyId = currentCompany?.id

  const [activity, setActivity] = useState([])
  const [activityLoading, setActivityLoading] = useState(true)

  useEffect(() => {
    if (!companyId) {
      setActivity([])
      setActivityLoading(false)
      return undefined
    }
    let cancelled = false
    setActivityLoading(true)

    apiFetch(`/api/companies/${companyId}/activity`)
      .then((data) => {
        if (cancelled) return
        setActivity(Array.isArray(data?.activity) ? data.activity : [])
      })
      .catch(() => {
        if (!cancelled) setActivity([])
      })
      .finally(() => {
        if (!cancelled) setActivityLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [companyId])

  // Workspace not resolved yet — nothing meaningful to render.
  if (!currentCompany) return null

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div className={styles.pageHeaderInner}>
          <div className={styles.titleRow}>
            <div className={styles.headerMain}>
              <div className={styles.titleLine}>
                <h1 className={styles.title}>{currentCompany.name}</h1>
                {currentCompany.isInternal && <Badge variant="neutral" size="sm">Interna</Badge>}
              </div>
              <div className={styles.headerMeta}>
                <span>{getCompanyRoleLabel(currentUser, currentCompany.membershipRole)}</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className={styles.pageBody}>
        <div className={styles.tabPanel}>
          {activityLoading ? (
            <p className={styles.info}>Cargando actividad...</p>
          ) : activity.length === 0 ? (
            <EmptyState
              icon={Activity}
              title="Sin actividad registrada"
              body="La actividad de los proyectos de esta empresa aparecerá aquí."
            />
          ) : (
            <ol className={styles.activityList}>
              {activity.map((event) => (
                <li key={event.id} className={styles.activityItem}>
                  <span className={styles.activityType}>{event.event_type}</span>
                  <time
                    className={styles.activityDate}
                    dateTime={event.created_at}
                  >
                    {formatDate(event.created_at)}
                  </time>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </div>
  )
}
