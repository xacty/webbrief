import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { Settings } from 'lucide-react'
import { useAuth } from '../../auth/AuthContext'
import styles from './AppShell.module.css'

export default function AppShell() {
  const navigate = useNavigate()
  const { currentUser, signOut } = useAuth()
  const canManageUsers = currentUser?.platformRole === 'admin'
    || currentUser?.memberships?.some((membership) => membership.role === 'manager')
  const canUseTrash = currentUser?.platformRole === 'admin'
    || currentUser?.memberships?.some((membership) => membership.role === 'manager')

  async function handleLogout() {
    await signOut()
    navigate('/login')
  }

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div>
          <div className={styles.brand}>
            <span className={styles.logo}>WB</span>
            <div>
              <p className={styles.brandTitle}>WeBrief</p>
              <p className={styles.brandMeta}>Admin workspace</p>
            </div>
          </div>

          <nav className={styles.nav}>
            <p className={styles.navSection}>Operación</p>
            <NavLink
              to="/companies"
              className={({ isActive }) => (
                isActive ? `${styles.navItem} ${styles.navItemActive}` : styles.navItem
              )}
            >
              Empresas
            </NavLink>
            {canManageUsers && (
              <NavLink
                to="/users"
                className={({ isActive }) => (
                  isActive ? `${styles.navItem} ${styles.navItemActive}` : styles.navItem
                )}
              >
                Usuarios
              </NavLink>
            )}
            {canUseTrash && (
              <>
                <NavLink
                  to="/archive"
                  className={({ isActive }) => (
                    isActive ? `${styles.navItem} ${styles.navItemActive}` : styles.navItem
                  )}
                >
                  Archivados
                </NavLink>
                <NavLink
                  to="/trash"
                  className={({ isActive }) => (
                    isActive ? `${styles.navItem} ${styles.navItemActive}` : styles.navItem
                  )}
                >
                  Papelera
                </NavLink>
              </>
            )}
          </nav>
        </div>

        <div className={styles.sidebarFooter}>
          <div className={styles.profileCard}>
            <p className={styles.profileName}>
              {currentUser?.fullName || currentUser?.email || 'Cargando usuario'}
            </p>
            <p className={styles.profileRole}>
              {currentUser?.platformRole === 'admin' ? 'Admin de plataforma' : canManageUsers ? 'Manager' : 'Usuario'}
            </p>
          </div>

          <NavLink
            to="/settings"
            className={({ isActive }) => (
              isActive ? `${styles.navItem} ${styles.navItemActive}` : styles.navItem
            )}
          >
            <Settings className={styles.navIcon} aria-hidden="true" />
            Ajustes de cuenta
          </NavLink>

          <button className={styles.logoutButton} onClick={handleLogout}>
            Cerrar sesión
          </button>
        </div>
      </aside>

      <main className={styles.main}>
        <div className={styles.content}>
          <Outlet />
        </div>
      </main>
    </div>
  )
}
