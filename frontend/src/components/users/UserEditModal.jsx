import { useEffect, useState } from 'react'
import { Camera, Download } from 'lucide-react'
import { Button, Input, Select, Modal, Badge } from '../ui'
import { apiDownloadToFile, apiFetch } from '../../lib/api'
import { isAdmin } from '../../lib/roleCapabilities'
import {
  COMPANY_ROLE_ORDER,
  MANAGER_ASSIGNABLE_COMPANY_ROLE_ORDER,
  PLATFORM_ROLE_ORDER,
  getCompanyRoleLabel,
  getPlatformRoleLabel,
  isGlobalPlatformRole,
} from '../../../../shared/userRoles.js'
import styles from './UserEditModal.module.css'

const PLATFORM_ROLE_LABEL = (role) => getPlatformRoleLabel(role)
const COMPANY_ROLE_LABEL = (role) => getCompanyRoleLabel(role)

// Returns 2 initials from a full name or email local-part.
function userInitials(user) {
  const name = (user?.fullName || '').trim()
  if (name) {
    const parts = name.split(/\s+/).filter(Boolean)
    return (parts[0]?.[0] || '').toUpperCase() + (parts[1]?.[0] || '').toUpperCase()
  }
  const email = user?.email || ''
  return (email[0] || '?').toUpperCase()
}

// Avatar download helper — uses apiDownloadToFile so the bearer token rides
// the request (the backend `/api/users/:id/avatar/export` endpoint is auth-gated).
// `preset` maps to the backend query param; values: 'original' | 'web' | 'jpg' | 'png'.
async function downloadAvatarExport(userId, preset) {
  const path = `/api/users/${userId}/avatar/export?preset=${encodeURIComponent(preset)}`
  await apiDownloadToFile(path, { suggestedFileName: 'avatar' })
}

/**
 * Shared edit-user modal for both UsersPage (scope='global') and CompanyPage (scope='company').
 *
 * @param {object} props
 * @param {boolean} props.open
 * @param {object} props.user                Target user being edited. Shape:
 *                                           { id, fullName, email, platformRole, avatarUrl,
 *                                             companies?: [{ companyId, companyName, companySlug?, role }] }
 * @param {object} props.currentUser         The actor performing the edit (auth context).
 * @param {'global' | 'company'} props.scope Determines which sections render.
 * @param {string} [props.companyId]         Required when scope='company'.
 * @param {string} [props.companyName]       Label for the role select.
 * @param {string[]} [props.managedCompanyIds]  Company IDs where currentUser is manager.
 *                                              Used to gate per-row role editing in scope='global'.
 * @param {function} props.onClose           Called to close the modal.
 * @param {function} props.onSaved           Called after successful save with { fullName, role?, refreshed }.
 *                                           Parent decides whether to full-reload or optimistically update.
 */
export default function UserEditModal({
  open,
  user,
  currentUser,
  scope,
  companyId,
  companyName,
  managedCompanyIds = [],
  onClose,
  onSaved,
}) {
  const isAdminUser = isAdmin(currentUser)
  const [editForm, setEditForm] = useState({
    fullName: '',
    email: '',
    platformRole: 'user',
    companyRoles: {},
    singleRole: 'editor', // used in scope='company' for the one-company select
  })
  const [avatarFile, setAvatarFile] = useState(null)
  const [avatarPreview, setAvatarPreview] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // Reset form whenever the target user changes (modal opened with a new user).
  useEffect(() => {
    if (!user) return
    const companyRolesMap = (user.companies || []).reduce((acc, c) => {
      acc[c.companyId] = c.role
      return acc
    }, {})
    const currentCompanyRole = scope === 'company' && companyId
      ? (user.companies || []).find((c) => c.companyId === companyId)?.role || 'editor'
      : 'editor'
    setEditForm({
      fullName: user.fullName || '',
      email: user.email || '',
      platformRole: user.platformRole || 'user',
      companyRoles: companyRolesMap,
      singleRole: currentCompanyRole,
    })
    setAvatarFile(null)
    setAvatarPreview(user.avatarUrl || '')
    setError('')
  }, [user, scope, companyId])

  if (!user) return null

  // -------- Gating helpers --------
  function canManageMembership(company) {
    if (isAdminUser) return true
    return managedCompanyIds.includes(company.companyId) && company.role !== 'manager'
  }
  function membershipRoleOptions(company) {
    if (isAdminUser) return COMPANY_ROLE_ORDER
    // Company-admin in THIS company can assign anything in this company (incl. peer admin).
    const actorMembership = (currentUser?.memberships || []).find((m) => m.companyId === company.companyId)
    if (actorMembership?.role === 'admin') return COMPANY_ROLE_ORDER
    return MANAGER_ASSIGNABLE_COMPANY_ROLE_ORDER.filter((role) => role === company.role || role !== 'manager')
  }
  function singleCompanyRoleOptions() {
    if (isAdminUser) return COMPANY_ROLE_ORDER
    // Company-admin in the active company can assign anything including 'admin'.
    const actorMembership = (currentUser?.memberships || []).find((m) => m.companyId === companyId)
    if (actorMembership?.role === 'admin') return COMPANY_ROLE_ORDER
    const base = MANAGER_ASSIGNABLE_COMPANY_ROLE_ORDER
    return base.includes(editForm.singleRole)
      ? base
      : [editForm.singleRole, ...base.filter((r) => r !== editForm.singleRole)]
  }

  // -------- Section flags --------
  const showEmailField = scope === 'global' && isAdminUser
  const showPlatformRoleField = scope === 'global' && isAdminUser
  const showMembershipsList = scope === 'global'
    && (user.companies || []).length > 0
    && !isGlobalPlatformRole(isAdminUser ? editForm.platformRole : user.platformRole || 'user')
  const showSingleCompanyRole = scope === 'company'
  const showFormNote = showPlatformRoleField && editForm.platformRole !== 'user'

  const subtitle = scope === 'global'
    ? (isAdminUser
        ? 'Actualiza identidad, email, rol de plataforma y roles por empresa.'
        : 'Actualiza el nombre y los roles por empresa.')
    : (isAdminUser
        ? 'Actualiza el nombre y el rol dentro de la empresa.'
        : 'Actualiza el nombre y el rol dentro de tu empresa.')

  // -------- Handlers --------
  function handleAvatarFileChange(event) {
    const file = event.target.files?.[0] || null
    setAvatarFile(file)
    if (!file) {
      setAvatarPreview(user?.avatarUrl || '')
      return
    }
    const reader = new FileReader()
    reader.onload = () => setAvatarPreview(String(reader.result || ''))
    reader.readAsDataURL(file)
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (busy) return

    setBusy(true)
    setError('')

    try {
      // 1. PATCH profile
      const profileBody = (scope === 'global' && isAdminUser)
        ? { fullName: editForm.fullName, email: editForm.email, platformRole: editForm.platformRole }
        : { fullName: editForm.fullName }

      const nameChanged = editForm.fullName.trim() !== (user.fullName || '').trim()
      const emailChanged = scope === 'global' && isAdminUser && editForm.email !== (user.email || '')
      const platformRoleChanged = scope === 'global' && isAdminUser && editForm.platformRole !== (user.platformRole || 'user')

      if (nameChanged || emailChanged || platformRoleChanged) {
        await apiFetch(`/api/users/${user.id}`, {
          method: 'PATCH',
          body: JSON.stringify(profileBody),
        })
      }

      // 2. PATCH membership(s)
      if (scope === 'company') {
        // Single-company update
        if (editForm.singleRole !== ((user.companies || []).find((c) => c.companyId === companyId)?.role)) {
          await apiFetch(`/api/users/${user.id}/memberships/${companyId}`, {
            method: 'PATCH',
            body: JSON.stringify({ role: editForm.singleRole }),
          })
        }
      } else if (showMembershipsList) {
        const targetPlatformRole = isAdminUser ? editForm.platformRole : user.platformRole
        if (targetPlatformRole === 'user') {
          const changes = (user.companies || []).filter((c) => {
            const next = editForm.companyRoles?.[c.companyId]
            if (!next || next === c.role) return false
            return canManageMembership(c)
          })
          for (const c of changes) {
            await apiFetch(`/api/users/${user.id}/memberships/${c.companyId}`, {
              method: 'PATCH',
              body: JSON.stringify({ role: editForm.companyRoles[c.companyId] }),
            })
          }
        }
      }

      // 3. POST avatar (if changed)
      if (avatarFile) {
        const formData = new FormData()
        formData.append('avatar', avatarFile)
        await apiFetch(`/api/users/${user.id}/avatar`, {
          method: 'POST',
          body: formData,
        })
      }

      // Done — let parent decide what to refresh.
      onSaved?.({
        fullName: editForm.fullName,
        role: scope === 'company' ? editForm.singleRole : null,
      })
      onClose?.()
    } catch (err) {
      setError(err?.message || 'No se pudo actualizar el usuario')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={scope === 'global' ? 'Editar usuario' : 'Editar miembro'}
      size={scope === 'global' ? 'lg' : 'md'}
      ariaDescribedBy="user-edit-modal-description"
    >
      <p id="user-edit-modal-description" className={styles.subtitle}>{subtitle}</p>

      <form onSubmit={handleSubmit}>
        {/* Avatar editor — both scopes */}
        <div className="user-edit-avatar-editor" style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 56, height: 56, borderRadius: '50%', background: 'var(--wb-color-neutral-200)', overflow: 'hidden' }}>
            {avatarPreview ? (
              <img src={avatarPreview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <span style={{ fontWeight: 600 }}>{userInitials(user)}</span>
            )}
          </span>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--wb-color-neutral-300)', cursor: 'pointer' }}>
              <Camera size={16} aria-hidden="true" />
              <span>Cambiar imagen</span>
              <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleAvatarFileChange} style={{ display: 'none' }} />
            </label>
            {user.avatarUrl && (
              <>
                <Button type="button" variant="secondary" size="md" icon={<Download size={16} />} onClick={() => downloadAvatarExport(user.id, 'original')}>Original</Button>
                <Button type="button" variant="secondary" size="md" icon={<Download size={16} />} onClick={() => downloadAvatarExport(user.id, 'web')}>WebP</Button>
              </>
            )}
          </div>
        </div>

        <Input
          label="Nombre"
          type="text"
          value={editForm.fullName}
          onChange={(e) => setEditForm((c) => ({ ...c, fullName: e.target.value }))}
          placeholder="Nombre completo"
        />

        {showEmailField && (
          <Input
            label="Email"
            type="email"
            value={editForm.email}
            onChange={(e) => setEditForm((c) => ({ ...c, email: e.target.value }))}
            required
          />
        )}

        {showPlatformRoleField && (
          <Select
            label="Rol plataforma"
            value={editForm.platformRole}
            onChange={(e) => setEditForm((c) => ({ ...c, platformRole: e.target.value }))}
          >
            {PLATFORM_ROLE_ORDER.map((role) => (
              <option key={role} value={role}>{PLATFORM_ROLE_LABEL(role)}</option>
            ))}
          </Select>
        )}

        {showFormNote && (
          <p className={styles.formNote}>Admin y QA usan acceso global, sin rol por empresa.</p>
        )}

        {showMembershipsList && (
          <div style={{ marginTop: '12px' }}>
            <p style={{ fontWeight: 600, marginBottom: '8px' }}>Roles por empresa</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {(user.companies || []).map((company) => {
                const manageable = canManageMembership(company)
                const currentRole = editForm.companyRoles?.[company.companyId] ?? company.role
                return (
                  <div key={company.companyId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', padding: '8px 12px', border: '1px solid var(--wb-color-neutral-200)', borderRadius: '8px' }}>
                    <div>
                      <p style={{ margin: 0, fontWeight: 600 }}>{company.companyName}</p>
                      {company.companySlug && <p style={{ margin: 0, fontSize: '0.85em', color: 'var(--wb-color-neutral-600)' }}>/{company.companySlug}</p>}
                    </div>
                    {manageable ? (
                      <Select
                        value={currentRole}
                        onChange={(e) => setEditForm((c) => ({ ...c, companyRoles: { ...c.companyRoles, [company.companyId]: e.target.value } }))}
                        fullWidth={false}
                      >
                        {membershipRoleOptions(company).map((role) => (
                          <option key={role} value={role}>{COMPANY_ROLE_LABEL(role)}</option>
                        ))}
                      </Select>
                    ) : (
                      <Badge variant="neutral" size="sm">{COMPANY_ROLE_LABEL(company.role)}</Badge>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {showSingleCompanyRole && (
          <>
            <Select
              label={`Rol en ${companyName || 'empresa'}`}
              value={editForm.singleRole}
              onChange={(e) => setEditForm((c) => ({ ...c, singleRole: e.target.value }))}
            >
              {singleCompanyRoleOptions().map((role) => (
                <option key={role} value={role}>{COMPANY_ROLE_LABEL(role)}</option>
              ))}
            </Select>
            <p className={styles.fieldHint}>Email: {user.email || 'Sin email'}</p>
          </>
        )}

        {error && <p className={styles.error}>{error}</p>}

        <div className={styles.actions}>
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>Cancelar</Button>
          <Button type="submit" variant="primary" disabled={busy} loading={busy}>
            {busy ? 'Guardando...' : 'Guardar cambios'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
