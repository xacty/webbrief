import { Fragment, useEffect, useMemo, useState } from 'react'
import { Camera, ChevronDown, ChevronRight, Pencil, Plus, Trash2, X } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { apiFetch } from '../lib/api'
import { getCompanyRole, getInviteRoleOptions } from '../lib/roleCapabilities'
import styles from './UsersPage.module.css'

const PAGE_SIZE = 10
const COMPANY_ROLE_OPTIONS = ['manager', 'editor', 'content_writer', 'designer', 'developer']
const MANAGER_ROLE_OPTIONS = ['editor', 'content_writer', 'designer', 'developer']
const PLATFORM_ROLE_OPTIONS = ['user', 'qa', 'admin']

const EMPTY_INVITE_FORM = {
  fullName: '',
  email: '',
  companyId: '',
  role: 'editor',
  platformRole: 'user',
}

function formatDate(isoDate) {
  if (!isoDate) return 'Sin fecha'

  return new Date(isoDate).toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function roleLabel(role) {
  if (role === 'manager') return 'Manager'
  if (role === 'content_writer') return 'Content Writer'
  if (role === 'designer') return 'Diseño'
  if (role === 'developer') return 'Dev'
  return 'Editor'
}

function platformRoleLabel(role) {
  if (role === 'admin') return 'Admin'
  if (role === 'qa') return 'QA'
  return 'Usuario'
}

function platformRoleClass(role) {
  if (role === 'admin') return styles.adminBadge
  if (role === 'qa') return styles.qaBadge
  return styles.userBadge
}

function userInitials(user) {
  const label = user.fullName || user.email || '?'
  return label
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
}

function UserAvatar({ user, className }) {
  return (
    <span className={`${styles.avatar} ${className || ''}`}>
      {user.avatarUrl ? (
        <img className={styles.avatarImage} src={user.avatarUrl} alt="" />
      ) : (
        <span className={styles.avatarInitials}>{userInitials(user)}</span>
      )}
    </span>
  )
}

export default function UsersPage() {
  const { currentUser } = useAuth()
  const [users, setUsers] = useState([])
  const [companies, setCompanies] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionMessage, setActionMessage] = useState('')
  const [busyKey, setBusyKey] = useState('')
  const [query, setQuery] = useState('')
  const [companyFilter, setCompanyFilter] = useState('all')
  const [sortBy, setSortBy] = useState('name')
  const [page, setPage] = useState(1)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteForm, setInviteForm] = useState(EMPTY_INVITE_FORM)
  const [editingUser, setEditingUser] = useState(null)
  const [editForm, setEditForm] = useState({ fullName: '', email: '', platformRole: 'user' })
  const [avatarFile, setAvatarFile] = useState(null)
  const [avatarPreview, setAvatarPreview] = useState('')
  const [expandedUserId, setExpandedUserId] = useState('')

  const isAdmin = currentUser?.platformRole === 'admin'
  const primaryCompanyRole = getCompanyRole(currentUser)
  const managedCompanyIds = useMemo(() => (
    currentUser?.memberships
      ?.filter((membership) => membership.role === 'manager')
      .map((membership) => membership.companyId) || []
  ), [currentUser])
  const canManageUsers = isAdmin || currentUser?.memberships?.length > 0
  const canManageRoles = isAdmin || managedCompanyIds.length > 0
  const inviteCompanyRole = getCompanyRole(currentUser, inviteForm.companyId) || primaryCompanyRole
  const inviteRoleOptions = useMemo(
    () => getInviteRoleOptions(currentUser, inviteCompanyRole),
    [currentUser, inviteCompanyRole]
  )
  const canInviteUsers = inviteRoleOptions.length > 0 || isAdmin
  const inviteNeedsCompany = !isAdmin || inviteForm.platformRole === 'user'

  async function loadUsers() {
    try {
      setLoading(true)
      const data = await apiFetch('/api/users')
      setUsers(data.users || [])
      setCompanies(data.companies || [])
      setError('')
    } catch (err) {
      setError(err.message || 'No se pudieron cargar los usuarios')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let active = true

    async function loadInitialUsers() {
      try {
        setLoading(true)
        const data = await apiFetch('/api/users')
        if (!active) return

        setUsers(data.users || [])
        setCompanies(data.companies || [])
        setError('')
      } catch (err) {
        if (!active) return
        setError(err.message || 'No se pudieron cargar los usuarios')
      } finally {
        if (active) setLoading(false)
      }
    }

    loadInitialUsers()

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    setInviteForm((current) => {
      const companyStillAvailable = companies.some((company) => company.id === current.companyId)
      const nextCompanyId = companyStillAvailable ? current.companyId : companies[0]?.id || ''
      const roleStillAvailable = inviteRoleOptions.includes(current.role)
      const nextRole = roleStillAvailable ? current.role : inviteRoleOptions[0] || current.role

      if (current.companyId === nextCompanyId && current.role === nextRole) return current
      return {
        ...current,
        companyId: nextCompanyId,
        role: nextRole,
      }
    })
  }, [companies, inviteRoleOptions])

  const filteredUsers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()

    const nextUsers = users.filter((user) => {
      const userCompanies = user.companies || []
      const searchable = [
        user.fullName,
        user.email,
        user.platformRole,
        ...userCompanies.flatMap((company) => [company.companyName, company.companySlug, company.role]),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()

      const matchesQuery = normalizedQuery.length === 0 || searchable.includes(normalizedQuery)
      const matchesCompany = companyFilter === 'all'
        || userCompanies.some((company) => company.companyId === companyFilter)

      return matchesQuery && matchesCompany
    })

    nextUsers.sort((left, right) => {
      if (sortBy === 'recent') {
        return new Date(right.updatedAt || right.createdAt) - new Date(left.updatedAt || left.createdAt)
      }

      if (sortBy === 'company') {
        const leftCompany = (left.companies?.[0]?.companyName || '').toLowerCase()
        const rightCompany = (right.companies?.[0]?.companyName || '').toLowerCase()

        if (leftCompany !== rightCompany) {
          return leftCompany.localeCompare(rightCompany)
        }
      }

      const leftLabel = (left.fullName || left.email || '').toLowerCase()
      const rightLabel = (right.fullName || right.email || '').toLowerCase()
      return leftLabel.localeCompare(rightLabel)
    })

    return nextUsers
  }, [companyFilter, query, sortBy, users])

  useEffect(() => {
    setPage(1)
  }, [query, companyFilter, sortBy])

  const pageCount = Math.max(1, Math.ceil(filteredUsers.length / PAGE_SIZE))
  const currentPage = Math.min(page, pageCount)
  const paginatedUsers = filteredUsers.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  )

  function resetInviteForm() {
    setInviteForm({
      ...EMPTY_INVITE_FORM,
      companyId: companies[0]?.id || '',
      role: inviteRoleOptions[0] || 'editor',
    })
  }

  function canManageMembership(company) {
    if (isAdmin) return true
    return managedCompanyIds.includes(company.companyId) && company.role !== 'manager'
  }

  function canEditUser(user) {
    if (isAdmin) return true
    if (user.id === currentUser?.id) return true
    return (user.companies || []).some((company) => managedCompanyIds.includes(company.companyId))
  }

  function getRequestableCompany(user) {
    if (isAdmin) return null

    const sharedMembership = (user.companies || []).find((company) => {
      const myRole = getCompanyRole(currentUser, company.companyId)
      return ['editor', 'designer', 'developer'].includes(myRole)
    })

    return sharedMembership || null
  }

  function membershipRoleOptions(company) {
    return isAdmin ? COMPANY_ROLE_OPTIONS : MANAGER_ROLE_OPTIONS.filter((role) => (
      role === company.role || role !== 'manager'
    ))
  }

  async function handleInvite(event) {
    event.preventDefault()
    setActionMessage('')
    setError('')
    setBusyKey('invite')

    try {
      const payload = inviteNeedsCompany
        ? inviteForm
        : {
            fullName: inviteForm.fullName,
            email: inviteForm.email,
            platformRole: inviteForm.platformRole,
          }

      const data = await apiFetch('/api/users', {
        method: 'POST',
        body: JSON.stringify(payload),
      })

      await loadUsers()
      resetInviteForm()
      setInviteOpen(false)
      setActionMessage(data.message || 'Usuario agregado')
    } catch (err) {
      setError(err.message || 'No se pudo agregar el usuario')
    } finally {
      setBusyKey('')
    }
  }

  function openEditUser(user) {
    setEditingUser(user)
    setEditForm({
      fullName: user.fullName || '',
      email: user.email || '',
      platformRole: user.platformRole || 'user',
    })
    setAvatarFile(null)
    setAvatarPreview(user.avatarUrl || '')
    setActionMessage('')
    setError('')
  }

  function closeEditUser() {
    setEditingUser(null)
    setAvatarFile(null)
    setAvatarPreview('')
  }

  function handleAvatarFileChange(event) {
    const file = event.target.files?.[0] || null
    setAvatarFile(file)

    if (!file) {
      setAvatarPreview(editingUser?.avatarUrl || '')
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      setAvatarPreview(String(reader.result || ''))
    }
    reader.readAsDataURL(file)
  }

  async function handleEditUser(event) {
    event.preventDefault()
    if (!editingUser) return

    const body = isAdmin
      ? editForm
      : { fullName: editForm.fullName }

    setBusyKey(`edit:${editingUser.id}`)
    setError('')
    setActionMessage('')

    try {
      await apiFetch(`/api/users/${editingUser.id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      })

      if (avatarFile) {
        const formData = new FormData()
        formData.append('avatar', avatarFile)

        await apiFetch(`/api/users/${editingUser.id}/avatar`, {
          method: 'POST',
          body: formData,
        })
      }

      await loadUsers()
      closeEditUser()
      setActionMessage('Usuario actualizado')
    } catch (err) {
      setError(err.message || 'No se pudo actualizar el usuario')
    } finally {
      setBusyKey('')
    }
  }

  async function handleMembershipRoleChange(userId, companyId, role) {
    const key = `membership:${userId}:${companyId}`
    setBusyKey(key)
    setError('')
    setActionMessage('')

    try {
      await apiFetch(`/api/users/${userId}/memberships/${companyId}`, {
        method: 'PATCH',
        body: JSON.stringify({ role }),
      })

      await loadUsers()
      setActionMessage('Acceso actualizado')
    } catch (err) {
      setError(err.message || 'No se pudo actualizar el acceso')
    } finally {
      setBusyKey('')
    }
  }

  async function handleDeleteUser(user) {
    if (!window.confirm(`¿Borrar la cuenta ${user.email}? Esta acción elimina su acceso.`)) return

    setBusyKey(`delete:${user.id}`)
    setError('')
    setActionMessage('')

    try {
      await apiFetch(`/api/users/${user.id}`, { method: 'DELETE' })
      await loadUsers()
      setActionMessage('Usuario borrado')
    } catch (err) {
      setError(err.message || 'No se pudo borrar el usuario')
    } finally {
      setBusyKey('')
    }
  }

  async function handleRemoveMembership(userId, companyId) {
    if (!window.confirm('¿Quitar este acceso de empresa?')) return

    const key = `membership-remove:${userId}:${companyId}`
    setBusyKey(key)
    setError('')
    setActionMessage('')

    try {
      await apiFetch(`/api/users/${userId}/memberships/${companyId}`, { method: 'DELETE' })
      await loadUsers()
      setActionMessage('Acceso eliminado')
    } catch (err) {
      setError(err.message || 'No se pudo quitar el acceso')
    } finally {
      setBusyKey('')
    }
  }

  async function handleRequestRemoval(userId, companyId) {
    const key = `request-removal:${userId}:${companyId}`
    setBusyKey(key)
    setError('')
    setActionMessage('')

    try {
      await apiFetch(`/api/users/${userId}/removal-requests`, {
        method: 'POST',
        body: JSON.stringify({ companyId }),
      })
      setActionMessage('Solicitud enviada al manager')
    } catch (err) {
      setError(err.message || 'No se pudo enviar la solicitud')
    } finally {
      setBusyKey('')
    }
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>{isAdmin ? 'Admin' : 'Manager'}</p>
          <h1 className={styles.title}>Usuarios</h1>
          <p className={styles.subtitle}>
            {isAdmin
              ? 'Gestiona cuentas, roles de plataforma y accesos por empresa.'
              : canManageRoles
                ? 'Gestiona invitaciones y accesos de las empresas donde tienes rol manager.'
                : 'Consulta los usuarios de tus empresas y administra tu propio perfil.'}
          </p>
        </div>

        {canInviteUsers && canManageUsers && (companies.length > 0 || isAdmin) && (
          <button className={styles.primaryButton} onClick={() => setInviteOpen(true)}>
            <Plus className={styles.buttonIcon} aria-hidden="true" />
            Agregar usuario
          </button>
        )}
      </header>

      {inviteOpen && (
        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <h2 className={styles.panelTitle}>Agregar usuario</h2>
              <p className={styles.panelText}>Invita una cuenta nueva o asigna un usuario existente a una empresa.</p>
            </div>
            <button className={styles.iconButton} onClick={() => setInviteOpen(false)} aria-label="Cerrar">
              <X aria-hidden="true" />
            </button>
          </div>

          <form className={styles.inviteGrid} onSubmit={handleInvite}>
            <label className={styles.fieldWrap}>
              <span className={styles.fieldLabel}>Nombre</span>
              <input
                className={styles.input}
                type="text"
                value={inviteForm.fullName}
                onChange={(event) => setInviteForm((current) => ({ ...current, fullName: event.target.value }))}
                placeholder="Nombre completo"
              />
            </label>

            <label className={styles.fieldWrap}>
              <span className={styles.fieldLabel}>Email</span>
              <input
                className={styles.input}
                type="email"
                value={inviteForm.email}
                onChange={(event) => setInviteForm((current) => ({ ...current, email: event.target.value }))}
                placeholder="email@empresa.com"
                required
              />
            </label>

            {isAdmin && (
              <label className={styles.fieldWrap}>
                <span className={styles.fieldLabel}>Rol plataforma</span>
                <select
                  className={styles.select}
                  value={inviteForm.platformRole}
                  onChange={(event) => setInviteForm((current) => ({ ...current, platformRole: event.target.value }))}
                >
                  {PLATFORM_ROLE_OPTIONS.map((role) => (
                    <option key={role} value={role}>{platformRoleLabel(role)}</option>
                  ))}
                </select>
              </label>
            )}

            {inviteNeedsCompany ? (
              <>
                <label className={styles.fieldWrap}>
                  <span className={styles.fieldLabel}>Empresa</span>
                  <select
                    className={styles.select}
                    value={inviteForm.companyId}
                    onChange={(event) => setInviteForm((current) => ({ ...current, companyId: event.target.value }))}
                    required={inviteNeedsCompany}
                  >
                    {companies.map((company) => (
                      <option key={company.id} value={company.id}>
                        {company.name}{company.isInternal ? ' · Interna' : ''}
                      </option>
                    ))}
                  </select>
                </label>

                <label className={styles.fieldWrap}>
                  <span className={styles.fieldLabel}>Rol en empresa</span>
                  <select
                    className={styles.select}
                    value={inviteForm.role}
                    onChange={(event) => setInviteForm((current) => ({ ...current, role: event.target.value }))}
                  >
                    {inviteRoleOptions.map((role) => (
                      <option key={role} value={role}>{roleLabel(role)}</option>
                    ))}
                  </select>
                </label>
              </>
            ) : (
              <p className={styles.formNote}>Admin y QA usan acceso global, sin rol por empresa.</p>
            )}

            <div className={styles.formActions}>
              <button className={styles.secondaryButton} type="button" onClick={() => setInviteOpen(false)}>
                Cancelar
              </button>
              <button className={styles.primaryButton} type="submit" disabled={busyKey === 'invite'}>
                {busyKey === 'invite' ? 'Agregando...' : 'Agregar usuario'}
              </button>
            </div>
          </form>
        </section>
      )}

      <section className={styles.toolbar}>
        <div className={styles.searchWrap}>
          <label className={styles.fieldLabel} htmlFor="users-search">Buscar</label>
          <input
            id="users-search"
            className={styles.input}
            type="search"
            placeholder="Nombre, email, empresa o rol"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>

        <div className={styles.filterWrap}>
          <label className={styles.fieldLabel} htmlFor="users-company-filter">Empresa</label>
          <select
            id="users-company-filter"
            className={styles.select}
            value={companyFilter}
            onChange={(event) => setCompanyFilter(event.target.value)}
          >
            <option value="all">Todas</option>
            {companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.name}{company.isInternal ? ' · Interna' : ''}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.filterWrap}>
          <label className={styles.fieldLabel} htmlFor="users-sort">Ordenar</label>
          <select
            id="users-sort"
            className={styles.select}
            value={sortBy}
            onChange={(event) => setSortBy(event.target.value)}
          >
            <option value="name">Por nombre</option>
            <option value="recent">Recientes</option>
            <option value="company">Por empresa</option>
          </select>
        </div>
      </section>

      <section className={styles.sectionHeader}>
        <div>
          <h2 className={styles.sectionTitle}>Usuarios</h2>
          <p className={styles.sectionMeta}>
            {filteredUsers.length} usuario{filteredUsers.length === 1 ? '' : 's'}
          </p>
        </div>
      </section>

      {actionMessage && <p className={styles.success}>{actionMessage}</p>}
      {loading && <p className={styles.info}>Cargando usuarios...</p>}
      {!loading && error && <p className={styles.error}>{error}</p>}
      {!loading && !error && paginatedUsers.length === 0 && (
        <div className={styles.emptyState}>
          <p className={styles.emptyTitle}>No hay usuarios para esta búsqueda.</p>
          <p className={styles.emptyText}>
            Ajusta filtros o agrega usuarios desde este panel.
          </p>
        </div>
      )}

      {!loading && !error && paginatedUsers.length > 0 && (
        <section className={styles.tableSurface} aria-label="Lista de usuarios">
          <table className={styles.usersTable}>
            <thead>
              <tr>
                <th>Usuario</th>
                {isAdmin && <th>Plataforma</th>}
                <th>Accesos</th>
                <th>Actualizado</th>
                <th aria-label="Acciones" />
              </tr>
            </thead>
            <tbody>
              {paginatedUsers.map((user) => {
                const expanded = expandedUserId === user.id
                const userCompanies = user.companies || []
                const visibleCompanies = userCompanies.slice(0, 2)
                const hiddenCompanyCount = Math.max(0, userCompanies.length - visibleCompanies.length)
                const hasGlobalAccess = isAdmin && user.platformRole !== 'user'

                return (
                  <Fragment key={user.id}>
                    <tr className={expanded ? styles.userRowExpanded : undefined}>
                      <td>
                        <div className={styles.userCell}>
                          <button
                            className={styles.expandButton}
                            onClick={() => setExpandedUserId(expanded ? '' : user.id)}
                            aria-expanded={expanded}
                            aria-controls={`user-access-${user.id}`}
                            aria-label={expanded ? 'Ocultar accesos' : 'Ver accesos'}
                          >
                            {expanded ? <ChevronDown aria-hidden="true" /> : <ChevronRight aria-hidden="true" />}
                          </button>
                          <UserAvatar user={user} />
                          <span className={styles.identity}>
                            <strong>{user.fullName || 'Sin nombre'}</strong>
                            <span>{user.email || 'Sin email'}</span>
                          </span>
                        </div>
                      </td>

                      {isAdmin && (
                        <td>
                          <span className={platformRoleClass(user.platformRole)}>
                            {platformRoleLabel(user.platformRole)}
                          </span>
                        </td>
                      )}

                      <td>
                        {hasGlobalAccess ? (
                          <span className={styles.globalPill}>{platformRoleLabel(user.platformRole)} global</span>
                        ) : userCompanies.length === 0 ? (
                          <span className={styles.mutedText}>Sin empresas</span>
                        ) : (
                          <div className={styles.companyPills}>
                            {visibleCompanies.map((company) => (
                              <span key={`${user.id}-${company.companyId}-pill`} className={styles.companyPill}>
                                <span>{company.companyName}</span>
                                <small>{roleLabel(company.role)}</small>
                              </span>
                            ))}
                            {hiddenCompanyCount > 0 && (
                              <span className={styles.countPill}>+{hiddenCompanyCount}</span>
                            )}
                          </div>
                        )}
                      </td>

                      <td className={styles.dateCell}>{formatDate(user.updatedAt || user.createdAt)}</td>

                      <td>
                        <div className={styles.rowActions}>
                          {canEditUser(user) && (
                            <button className={styles.rowActionButton} onClick={() => openEditUser(user)} title="Editar usuario" aria-label="Editar usuario">
                              <Pencil aria-hidden="true" />
                            </button>
                          )}
                          {isAdmin && user.id !== currentUser?.id && (
                            <button
                              className={styles.rowDangerButton}
                              onClick={() => handleDeleteUser(user)}
                              disabled={busyKey === `delete:${user.id}`}
                              title="Borrar usuario"
                              aria-label="Borrar usuario"
                            >
                              <Trash2 aria-hidden="true" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>

                    {expanded && (
                      <tr className={styles.assignmentDetailRow}>
                        <td colSpan={isAdmin ? 5 : 4}>
                          <div id={`user-access-${user.id}`} className={styles.assignmentPanel}>
                            {hasGlobalAccess ? (
                              <div className={styles.globalAccessNotice}>
                                <span className={platformRoleClass(user.platformRole)}>
                                  {platformRoleLabel(user.platformRole)}
                                </span>
                                <p>Este rol usa acceso global y no requiere rol por empresa.</p>
                              </div>
                            ) : (
                              <>
                                <div className={styles.assignmentHeader}>
                                  <p>Accesos por empresa</p>
                                  <span>{userCompanies.length} empresa{userCompanies.length === 1 ? '' : 's'}</span>
                                </div>

                                {userCompanies.length === 0 ? (
                                  <p className={styles.emptyMembership}>Sin accesos activos por empresa</p>
                                ) : (
                                  <div className={styles.assignmentList}>
                                    {userCompanies.map((company) => {
                                      const membershipBusy = busyKey.startsWith(`membership:${user.id}:${company.companyId}`)
                                      const manageable = canManageMembership(company)
                                      const requestable = getRequestableCompany(user)?.companyId === company.companyId
                                      const removeBusy = busyKey === `membership-remove:${user.id}:${company.companyId}`
                                      const requestBusy = busyKey === `request-removal:${user.id}:${company.companyId}`

                                      return (
                                        <div key={`${user.id}-${company.companyId}`} className={styles.assignmentItem}>
                                          <div>
                                            <p className={styles.membershipCompany}>{company.companyName}</p>
                                            <p className={styles.membershipMeta}>/{company.companySlug}</p>
                                          </div>

                                          {manageable ? (
                                            <div className={styles.membershipActions}>
                                              <select
                                                className={styles.roleSelect}
                                                value={company.role}
                                                onChange={(event) => handleMembershipRoleChange(user.id, company.companyId, event.target.value)}
                                                disabled={membershipBusy || removeBusy}
                                              >
                                                {membershipRoleOptions(company).map((role) => (
                                                  <option key={role} value={role}>{roleLabel(role)}</option>
                                                ))}
                                              </select>
                                              <button
                                                type="button"
                                                className={styles.rowDangerButton}
                                                onClick={() => handleRemoveMembership(user.id, company.companyId)}
                                                disabled={membershipBusy || removeBusy}
                                                title="Quitar acceso"
                                                aria-label="Quitar acceso"
                                              >
                                                <Trash2 aria-hidden="true" />
                                              </button>
                                            </div>
                                          ) : requestable ? (
                                            <button
                                              type="button"
                                              className={styles.secondaryButton}
                                              onClick={() => handleRequestRemoval(user.id, company.companyId)}
                                              disabled={requestBusy}
                                            >
                                              {requestBusy ? 'Enviando...' : 'Solicitar baja'}
                                            </button>
                                          ) : (
                                            <span className={styles.membershipBadge}>{roleLabel(company.role)}</span>
                                          )}
                                        </div>
                                      )
                                    })}
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </section>
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

      {editingUser && (
        <div className={styles.modalBackdrop}>
          <section className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="edit-user-title">
            <div className={styles.panelHeader}>
              <div>
                <h2 id="edit-user-title" className={styles.panelTitle}>Editar usuario</h2>
                <p className={styles.panelText}>
                  {isAdmin ? 'Actualiza identidad, email y rol de plataforma.' : 'Actualiza el nombre visible del usuario.'}
                </p>
              </div>
              <button className={styles.iconButton} onClick={closeEditUser} aria-label="Cerrar">
                <X aria-hidden="true" />
              </button>
            </div>

            <form className={styles.modalForm} onSubmit={handleEditUser}>
              <div className={styles.avatarEditor}>
                <span className={styles.avatarPreview}>
                  {avatarPreview ? (
                    <img className={styles.avatarImage} src={avatarPreview} alt="" />
                  ) : (
                    <span className={styles.avatarInitials}>{userInitials(editingUser)}</span>
                  )}
                </span>
                <label className={styles.avatarUploadButton}>
                  <Camera className={styles.buttonIcon} aria-hidden="true" />
                  Cambiar imagen
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={handleAvatarFileChange}
                  />
                </label>
              </div>

              <label className={styles.fieldWrap}>
                <span className={styles.fieldLabel}>Nombre</span>
                <input
                  className={styles.input}
                  type="text"
                  value={editForm.fullName}
                  onChange={(event) => setEditForm((current) => ({ ...current, fullName: event.target.value }))}
                  placeholder="Nombre completo"
                />
              </label>

              {isAdmin && (
                <>
                  <label className={styles.fieldWrap}>
                    <span className={styles.fieldLabel}>Email</span>
                    <input
                      className={styles.input}
                      type="email"
                      value={editForm.email}
                      onChange={(event) => setEditForm((current) => ({ ...current, email: event.target.value }))}
                      required
                    />
                  </label>

                  <label className={styles.fieldWrap}>
                    <span className={styles.fieldLabel}>Rol plataforma</span>
                    <select
                      className={styles.select}
                      value={editForm.platformRole}
                      onChange={(event) => setEditForm((current) => ({ ...current, platformRole: event.target.value }))}
                    >
                      {PLATFORM_ROLE_OPTIONS.map((role) => (
                        <option key={role} value={role}>{platformRoleLabel(role)}</option>
                      ))}
                    </select>
                  </label>

                  {editForm.platformRole !== 'user' && (
                    <p className={styles.formNote}>Admin y QA usan acceso global, sin rol por empresa.</p>
                  )}
                </>
              )}

              <div className={styles.formActions}>
                <button className={styles.secondaryButton} type="button" onClick={closeEditUser}>
                  Cancelar
                </button>
                <button className={styles.primaryButton} type="submit" disabled={busyKey === `edit:${editingUser.id}`}>
                  {busyKey === `edit:${editingUser.id}` ? 'Guardando...' : 'Guardar cambios'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  )
}
