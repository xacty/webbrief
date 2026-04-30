import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Settings } from 'lucide-react'
import { useAuth } from '../../auth/AuthContext'
import { canManageUsersNav, canUseTrashNav } from '../../lib/roleCapabilities'
import styles from './AppShell.module.css'

function roleLabel(currentUser, canManageUsers) {
  const role = currentUser?.rolePreview || currentUser?.memberships?.[0]?.role
  if (currentUser?.platformRole === 'admin') return 'Admin de plataforma'
  if (role === 'content_writer') return 'Content Writer'
  if (role === 'designer') return 'Diseño'
  if (role === 'developer') return 'Dev'
  if (role === 'editor') return 'Editor'
  return canManageUsers ? 'Manager' : 'Usuario'
}

export default function AppShell() {
  const location = useLocation()
  const navigate = useNavigate()
  const { currentUser, signOut } = useAuth()
  const canManageUsers = canManageUsersNav(currentUser)
  const canUseTrash = canUseTrashNav(currentUser)

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
              {roleLabel(currentUser, canManageUsers)}
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
        <div key={location.pathname} className={styles.content}>
          <Outlet />
        </div>
      </main>
    </div>
  )
}
