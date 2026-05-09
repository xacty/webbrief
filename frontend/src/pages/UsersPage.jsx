import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { Camera, ChevronDown, ChevronRight, Download, Pencil, Plus, Trash2 } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { apiDownloadToFile, apiFetch } from '../lib/api'
import { getCompanyRole, getInviteRoleOptions, isAdmin } from '../lib/roleCapabilities'
import {
  COMPANY_ROLE_ORDER,
  MANAGER_ASSIGNABLE_COMPANY_ROLE_ORDER,
  PLATFORM_ROLE_ORDER,
  getCompanyRoleLabel,
  getPlatformRoleLabel,
  isGlobalPlatformRole,
} from '../../../shared/userRoles.js'
import { Button, Input, Select, Modal, Card, Badge } from '../components/ui'
import styles from './UsersPage.module.css'

const PAGE_SIZE = 10

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

async function downloadAvatarExport(userId, preset) {
  const path = `/api/users/${userId}/avatar/export?preset=${encodeURIComponent(preset)}`
  await apiDownloadToFile(path, { suggestedFileName: 'avatar' })
}

function roleLabel(role) {
  return getCompanyRoleLabel(role)
}

function platformRoleLabel(role) {
  return getPlatformRoleLabel(role)
}

function platformRoleBadgeVariant(role) {
  if (role === 'admin') return 'primary'
  if (role === 'qa') return 'success'
  return 'neutral'
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
  const [editForm, setEditForm] = useState({ fullName: '', email: '', platformRole: 'user', companyRoles: {} })
  const [avatarFile, setAvatarFile] = useState(null)
  const [avatarPreview, setAvatarPreview] = useState('')
  const [expandedUserId, setExpandedUserId] = useState('')

  const isAdminUser = isAdmin(currentUser)
  const primaryCompanyRole = getCompanyRole(currentUser)
  const managedCompanyIds = useMemo(() => (
    currentUser?.memberships
      ?.filter((membership) => membership.role === 'manager')
      .map((membership) => membership.companyId) || []
  ), [currentUser])
  const canManageUsers = isAdminUser || currentUser?.memberships?.length > 0
  const canManageRoles = isAdminUser || managedCompanyIds.length > 0
  const inviteCompanyRole = getCompanyRole(currentUser, inviteForm.companyId) || primaryCompanyRole
  const inviteRoleOptions = useMemo(
    () => getInviteRoleOptions(currentUser, inviteCompanyRole),
    [currentUser, inviteCompanyRole]
  )
  const canInviteUsers = inviteRoleOptions.length > 0 || isAdminUser
  const inviteNeedsCompany = !isAdminUser || inviteForm.platformRole === 'user'

  // Unmount-lifecycle guard for loadUsers (called by mount effect + post-mutation
  // handlers like handleInvite/handleEditUser/etc). Without this, fast unmount
  // during a pending request would call setState on an unmounted component.
  const aliveRef = useRef(true)

  useEffect(() => () => {
    aliveRef.current = false
  }, [])

  async function loadUsers() {
    try {
      setLoading(true)
      const data = await apiFetch('/api/users')
      if (!aliveRef.current) return
      setUsers(data.users || [])
      setCompanies(data.companies || [])
      setError('')
    } catch (err) {
      if (!aliveRef.current) return
      setError(err.message || 'No se pudieron cargar los usuarios')
    } finally {
      if (aliveRef.current) setLoading(false)
    }
  }

  useEffect(() => {
    loadUsers()
    // aliveRef is set to false by the unmount-cleanup effect above; loadUsers
    // already short-circuits all setState calls when aliveRef.current is false.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    if (isAdminUser) return true
    return managedCompanyIds.includes(company.companyId) && company.role !== 'manager'
  }

  function canEditUser(user) {
    if (isAdminUser) return true
    if (user.id === currentUser?.id) return true
    return (user.companies || []).some((company) => managedCompanyIds.includes(company.companyId))
  }

  function getRequestableCompany(user) {
    if (isAdminUser) return null

    const sharedMembership = (user.companies || []).find((company) => {
      const myRole = getCompanyRole(currentUser, company.companyId)
      return ['editor', 'designer', 'developer'].includes(myRole)
    })

    return sharedMembership || null
  }

  function membershipRoleOptions(company) {
    return isAdminUser ? COMPANY_ROLE_ORDER : MANAGER_ASSIGNABLE_COMPANY_ROLE_ORDER.filter((role) => (
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
    const initialCompanyRoles = (user.companies || []).reduce((accumulator, company) => {
      accumulator[company.companyId] = company.role
      return accumulator
    }, {})

    setEditingUser(user)
    setEditForm({
      fullName: user.fullName || '',
      email: user.email || '',
      platformRole: user.platformRole || 'user',
      companyRoles: initialCompanyRoles,
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

    const profileBody = isAdminUser
      ? {
          fullName: editForm.fullName,
          email: editForm.email,
          platformRole: editForm.platformRole,
        }
      : { fullName: editForm.fullName }

    const targetPlatformRole = isAdminUser ? editForm.platformRole : editingUser.platformRole
    const companyRoleChanges = targetPlatformRole === 'user'
      ? (editingUser.companies || []).filter((company) => {
          const nextRole = editForm.companyRoles?.[company.companyId]
          if (!nextRole || nextRole === company.role) return false
          return canManageMembership(company)
        })
      : []

    setBusyKey(`edit:${editingUser.id}`)
    setError('')
    setActionMessage('')

    try {
      await apiFetch(`/api/users/${editingUser.id}`, {
        method: 'PATCH',
        body: JSON.stringify(profileBody),
      })

      for (const company of companyRoleChanges) {
        const nextRole = editForm.companyRoles[company.companyId]
        await apiFetch(`/api/users/${editingUser.id}/memberships/${company.companyId}`, {
          method: 'PATCH',
          body: JSON.stringify({ role: nextRole }),
        })
      }

      if (avatarFile) {
        setActionMessage('Subiendo avatar...')
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
          <p className={styles.eyebrow}>{isAdminUser ? 'Admin' : 'Manager'}</p>
          <h1 className={styles.title}>Usuarios</h1>
          <p className={styles.subtitle}>
            {isAdminUser
              ? 'Gestiona cuentas, roles de plataforma y accesos por empresa.'
              : canManageRoles
                ? 'Gestiona invitaciones y accesos de las empresas donde tienes rol manager.'
                : 'Consulta los usuarios de tus empresas y administra tu propio perfil.'}
          </p>
        </div>

        {canInviteUsers && canManageUsers && (companies.length > 0 || isAdminUser) && (
          <Button variant="primary" icon={<Plus size={16} />} onClick={() => setInviteOpen(true)}>
            Agregar usuario
          </Button>
        )}
      </header>

      {inviteOpen && (
        <Card padding="md" shadow="sm" radius="lg" className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <h2 className={styles.panelTitle}>Agregar usuario</h2>
              <p className={styles.panelText}>Invita una cuenta nueva o asigna un usuario existente a una empresa.</p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setInviteOpen(false)} aria-label="Cerrar">
              ×
            </Button>
          </div>

          <form className={styles.inviteGrid} onSubmit={handleInvite}>
            <Input
              label="Nombre"
              type="text"
              value={inviteForm.fullName}
              onChange={(event) => setInviteForm((current) => ({ ...current, fullName: event.target.value }))}
              placeholder="Nombre completo"
            />

            <Input
              label="Email"
              type="email"
              value={inviteForm.email}
              onChange={(event) => setInviteForm((current) => ({ ...current, email: event.target.value }))}
              placeholder="email@empresa.com"
              required
            />

            {isAdminUser && (
              <Select
                label="Rol plataforma"
                value={inviteForm.platformRole}
                onChange={(event) => setInviteForm((current) => ({ ...current, platformRole: event.target.value }))}
              >
                {PLATFORM_ROLE_ORDER.map((role) => (
                  <option key={role} value={role}>{platformRoleLabel(role)}</option>
                ))}
              </Select>
            )}

            {inviteNeedsCompany ? (
              <>
                <Select
                  label="Empresa"
                  value={inviteForm.companyId}
                  onChange={(event) => setInviteForm((current) => ({ ...current, companyId: event.target.value }))}
                  required={inviteNeedsCompany}
                >
                  {companies.map((company) => (
                    <option key={company.id} value={company.id}>
                      {company.name}{company.isInternal ? ' · Interna' : ''}
                    </option>
                  ))}
                </Select>

                <Select
                  label="Rol en empresa"
                  value={inviteForm.role}
                  onChange={(event) => setInviteForm((current) => ({ ...current, role: event.target.value }))}
                >
                  {inviteRoleOptions.map((role) => (
                    <option key={role} value={role}>{roleLabel(role)}</option>
                  ))}
                </Select>
              </>
            ) : (
              <p className={`${styles.formNote} ${styles.inviteFormNote}`}>Admin y QA usan acceso global, sin rol por empresa.</p>
            )}

            <div className={`${styles.formActions} ${styles.inviteFormActions}`}>
              <Button type="button" variant="ghost" onClick={() => setInviteOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" variant="primary" disabled={busyKey === 'invite'} loading={busyKey === 'invite'}>
                {busyKey === 'invite' ? 'Agregando...' : 'Agregar usuario'}
              </Button>
            </div>
          </form>
        </Card>
      )}

      <section className={styles.toolbar}>
        <Input
          id="users-search"
          label="Buscar"
          type="search"
          placeholder="Nombre, email, empresa o rol"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />

        <Select
          id="users-company-filter"
          label="Empresa"
          value={companyFilter}
          onChange={(event) => setCompanyFilter(event.target.value)}
        >
          <option value="all">Todas</option>
          {companies.map((company) => (
            <option key={company.id} value={company.id}>
              {company.name}{company.isInternal ? ' · Interna' : ''}
            </option>
          ))}
        </Select>

        <Select
          id="users-sort"
          label="Ordenar"
          value={sortBy}
          onChange={(event) => setSortBy(event.target.value)}
        >
          <option value="name">Por nombre</option>
          <option value="recent">Recientes</option>
          <option value="company">Por empresa</option>
        </Select>
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
                {isAdminUser && <th>Plataforma</th>}
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
                const hasGlobalAccess = isAdminUser && isGlobalPlatformRole(user.platformRole)

                return (
                  <Fragment key={user.id}>
                    <tr className={expanded ? styles.userRowExpanded : undefined}>
                      <td>
                        <div className={styles.userCell}>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            icon={expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                            onClick={() => setExpandedUserId(expanded ? '' : user.id)}
                            aria-expanded={expanded}
                            aria-controls={`user-access-${user.id}`}
                            aria-label={expanded ? 'Ocultar accesos' : 'Ver accesos'}
                          />
                          <UserAvatar user={user} />
                          <span className={styles.identity}>
                            <strong>{user.fullName || 'Sin nombre'}</strong>
                            <span>{user.email || 'Sin email'}</span>
                          </span>
                        </div>
                      </td>

                      {isAdminUser && (
                        <td>
                          <Badge variant={platformRoleBadgeVariant(user.platformRole)} size="sm">
                            {platformRoleLabel(user.platformRole)}
                          </Badge>
                        </td>
                      )}

                      <td>
                        {hasGlobalAccess ? (
                          <Badge variant="success" size="sm">{platformRoleLabel(user.platformRole)} global</Badge>
                        ) : userCompanies.length === 0 ? (
                          <span className={styles.mutedText}>Sin empresas</span>
                        ) : (
                          <div className={styles.companyPills}>
                            {visibleCompanies.map((company) => (
                              <Badge
                                key={`${user.id}-${company.companyId}-pill`}
                                variant="neutral"
                                size="sm"
                              >
                                {company.companyName} · {roleLabel(company.role)}
                              </Badge>
                            ))}
                            {hiddenCompanyCount > 0 && (
                              <Badge variant="neutral" size="sm">+{hiddenCompanyCount}</Badge>
                            )}
                          </div>
                        )}
                      </td>

                      <td className={styles.dateCell}>{formatDate(user.updatedAt || user.createdAt)}</td>

                      <td>
                        <div className={styles.rowActions}>
                          {canEditUser(user) && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              icon={<Pencil size={16} />}
                              onClick={() => openEditUser(user)}
                              title="Editar usuario"
                              aria-label="Editar usuario"
                            />
                          )}
                          {isAdminUser && user.id !== currentUser?.id && (
                            <Button
                              type="button"
                              variant="danger"
                              size="sm"
                              icon={<Trash2 size={16} />}
                              onClick={() => handleDeleteUser(user)}
                              disabled={busyKey === `delete:${user.id}`}
                              title="Borrar usuario"
                              aria-label="Borrar usuario"
                            />
                          )}
                        </div>
                      </td>
                    </tr>

                    {expanded && (
                      <tr className={styles.assignmentDetailRow}>
                        <td colSpan={isAdminUser ? 5 : 4}>
                          <div id={`user-access-${user.id}`} className={styles.assignmentPanel}>
                            {hasGlobalAccess ? (
                              <div className={styles.globalAccessNotice}>
                                <Badge variant={platformRoleBadgeVariant(user.platformRole)} size="sm">
                                  {platformRoleLabel(user.platformRole)}
                                </Badge>
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
                                              <Select
                                                value={company.role}
                                                onChange={(event) => handleMembershipRoleChange(user.id, company.companyId, event.target.value)}
                                                disabled={membershipBusy || removeBusy}
                                                fullWidth={false}
                                                className={styles.roleSelectWrap}
                                              >
                                                {membershipRoleOptions(company).map((role) => (
                                                  <option key={role} value={role}>{roleLabel(role)}</option>
                                                ))}
                                              </Select>
                                              <Button
                                                type="button"
                                                variant="danger"
                                                size="sm"
                                                icon={<Trash2 size={16} />}
                                                onClick={() => handleRemoveMembership(user.id, company.companyId)}
                                                disabled={membershipBusy || removeBusy}
                                                title="Quitar acceso"
                                                aria-label="Quitar acceso"
                                              />
                                            </div>
                                          ) : requestable ? (
                                            <Button
                                              type="button"
                                              variant="secondary"
                                              size="sm"
                                              onClick={() => handleRequestRemoval(user.id, company.companyId)}
                                              disabled={requestBusy}
                                              loading={requestBusy}
                                            >
                                              {requestBusy ? 'Enviando...' : 'Solicitar baja'}
                                            </Button>
                                          ) : (
                                            <Badge variant="neutral" size="sm">{roleLabel(company.role)}</Badge>
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
        open={Boolean(editingUser)}
        onClose={closeEditUser}
        title="Editar usuario"
        size="lg"
        ariaDescribedBy="edit-user-description"
      >
        {editingUser && (() => {
          const editTargetCompanies = editingUser.companies || []
          const effectivePlatformRole = isAdminUser ? editForm.platformRole : (editingUser.platformRole || 'user')
          const editTargetIsGlobal = isGlobalPlatformRole(effectivePlatformRole)
          const hasManageableMembership = editTargetCompanies.some((company) => canManageMembership(company))
          const showCompanyRolesSection = !editTargetIsGlobal && editTargetCompanies.length > 0 && (isAdminUser || hasManageableMembership)
          const modalSubtitle = isAdminUser
            ? 'Actualiza identidad, email, rol de plataforma y roles por empresa.'
            : hasManageableMembership
              ? 'Actualiza el nombre y los roles por empresa.'
              : 'Actualiza el nombre visible del usuario.'

          return (
            <>
              <p id="edit-user-description" className={styles.panelText}>{modalSubtitle}</p>

              <form className={styles.modalForm} onSubmit={handleEditUser}>
                <div className={styles.avatarEditor}>
                  <span className={styles.avatarPreview}>
                    {avatarPreview ? (
                      <img className={styles.avatarImage} src={avatarPreview} alt="" />
                    ) : (
                      <span className={styles.avatarInitials}>{userInitials(editingUser)}</span>
                    )}
                  </span>
                  <div className={styles.avatarActionGroup}>
                    <label className={styles.fileInputLabel}>
                      <Camera size={16} aria-hidden="true" />
                      <span>Cambiar imagen</span>
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        onChange={handleAvatarFileChange}
                      />
                    </label>
                    {editingUser?.avatarUrl && (
                      <>
                        <Button type="button" variant="secondary" size="md" icon={<Download size={16} />} onClick={() => downloadAvatarExport(editingUser.id, 'original')}>
                          Original
                        </Button>
                        <Button type="button" variant="secondary" size="md" icon={<Download size={16} />} onClick={() => downloadAvatarExport(editingUser.id, 'web')}>
                          WebP
                        </Button>
                      </>
                    )}
                  </div>
                </div>

                <Input
                  label="Nombre"
                  type="text"
                  value={editForm.fullName}
                  onChange={(event) => setEditForm((current) => ({ ...current, fullName: event.target.value }))}
                  placeholder="Nombre completo"
                />

                {isAdminUser && (
                  <>
                    <Input
                      label="Email"
                      type="email"
                      value={editForm.email}
                      onChange={(event) => setEditForm((current) => ({ ...current, email: event.target.value }))}
                      required
                    />

                    <Select
                      label="Rol plataforma"
                      value={editForm.platformRole}
                      onChange={(event) => setEditForm((current) => ({ ...current, platformRole: event.target.value }))}
                    >
                      {PLATFORM_ROLE_ORDER.map((role) => (
                        <option key={role} value={role}>{platformRoleLabel(role)}</option>
                      ))}
                    </Select>

                    {editForm.platformRole !== 'user' && (
                      <p className={styles.formNote}>Admin y QA usan acceso global, sin rol por empresa.</p>
                    )}
                  </>
                )}

                {showCompanyRolesSection && (
                  <div className={styles.membershipSection}>
                    <p className={styles.membershipTitle}>Roles por empresa</p>
                    <div className={styles.membershipList}>
                      {editTargetCompanies.map((company) => {
                        const manageable = canManageMembership(company)
                        const currentRole = editForm.companyRoles?.[company.companyId] ?? company.role
                        return (
                          <div key={`${editingUser.id}-edit-${company.companyId}`} className={styles.membershipRow}>
                            <div>
                              <p className={styles.membershipCompany}>{company.companyName}</p>
                              <p className={styles.membershipMeta}>/{company.companySlug}</p>
                            </div>
                            {manageable ? (
                              <Select
                                value={currentRole}
                                onChange={(event) => {
                                  const nextRole = event.target.value
                                  setEditForm((current) => ({
                                    ...current,
                                    companyRoles: { ...current.companyRoles, [company.companyId]: nextRole },
                                  }))
                                }}
                                fullWidth={false}
                                className={styles.roleSelectWrap}
                              >
                                {membershipRoleOptions(company).map((role) => (
                                  <option key={role} value={role}>{roleLabel(role)}</option>
                                ))}
                              </Select>
                            ) : (
                              <Badge variant="neutral" size="sm">{roleLabel(company.role)}</Badge>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                <div className={styles.formActions}>
                  <Button type="button" variant="ghost" onClick={closeEditUser}>
                    Cancelar
                  </Button>
                  <Button type="submit" variant="primary" disabled={busyKey === `edit:${editingUser.id}`} loading={busyKey === `edit:${editingUser.id}`}>
                    {busyKey === `edit:${editingUser.id}` ? 'Guardando...' : 'Guardar cambios'}
                  </Button>
                </div>
              </form>
            </>
          )
        })()}
      </Modal>
    </div>
  )
}
