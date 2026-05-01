import { useEffect, useMemo, useState } from 'react'
import { Bell, Camera, KeyRound, Save } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { apiFetch } from '../lib/api'
import { supabase } from '../lib/supabase'
import {
  getCompanyRoleLabel,
  getPlatformRoleTitle,
} from '../../../shared/userRoles.js'
import styles from './AccountSettingsPage.module.css'

function roleLabel(role) {
  return getCompanyRoleLabel(role)
}

function platformRoleLabel(role) {
  return getPlatformRoleTitle(role)
}

function userInitials(user) {
  const label = user?.fullName || user?.email || '?'
  return label
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
}

export default function AccountSettingsPage() {
  const { currentUser, refreshUser } = useAuth()
  const [profileForm, setProfileForm] = useState({
    fullName: currentUser?.fullName || '',
  })
  const [avatarFile, setAvatarFile] = useState(null)
  const [avatarPreview, setAvatarPreview] = useState(currentUser?.avatarUrl || '')
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  })
  const [busyKey, setBusyKey] = useState('')
  const [profileMessage, setProfileMessage] = useState('')
  const [profileError, setProfileError] = useState('')
  const [passwordMessage, setPasswordMessage] = useState('')
  const [passwordError, setPasswordError] = useState('')

  const memberships = currentUser?.memberships || []
  const profileDirty = useMemo(() => (
    profileForm.fullName !== (currentUser?.fullName || '') || Boolean(avatarFile)
  ), [avatarFile, currentUser?.fullName, profileForm.fullName])

  useEffect(() => {
    if (!currentUser) return

    setProfileForm({ fullName: currentUser.fullName || '' })
    setAvatarPreview(currentUser.avatarUrl || '')
    setAvatarFile(null)
  }, [currentUser?.id, currentUser?.fullName, currentUser?.avatarUrl])

  function handleAvatarFileChange(event) {
    const file = event.target.files?.[0] || null
    setAvatarFile(file)
    setProfileMessage('')
    setProfileError('')

    if (!file) {
      setAvatarPreview(currentUser?.avatarUrl || '')
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      setAvatarPreview(String(reader.result || ''))
    }
    reader.readAsDataURL(file)
  }

  async function handleProfileSubmit(event) {
    event.preventDefault()
    if (!currentUser || !profileDirty) return

    setBusyKey('profile')
    setProfileMessage('')
    setProfileError('')

    try {
      await apiFetch(`/api/users/${currentUser.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ fullName: profileForm.fullName }),
      })

      if (avatarFile) {
        setProfileMessage('Subiendo avatar...')
        const formData = new FormData()
        formData.append('avatar', avatarFile)

        await apiFetch(`/api/users/${currentUser.id}/avatar`, {
          method: 'POST',
          body: formData,
        })
      }

      await refreshUser(undefined, { force: true })
      setAvatarFile(null)
      setProfileMessage('Perfil actualizado')
    } catch (error) {
      setProfileError(error.message || 'No se pudo actualizar el perfil')
    } finally {
      setBusyKey('')
    }
  }

  async function handlePasswordSubmit(event) {
    event.preventDefault()
    setPasswordMessage('')
    setPasswordError('')

    if (!currentUser?.email) {
      setPasswordError('No se encontro el email de tu cuenta')
      return
    }

    if (passwordForm.newPassword.length < 8) {
      setPasswordError('La nueva contraseña debe tener al menos 8 caracteres')
      return
    }

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordError('Las contraseñas no coinciden')
      return
    }

    setBusyKey('password')

    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: currentUser.email,
        password: passwordForm.currentPassword,
      })
      if (signInError) throw signInError

      const { error: updateError } = await supabase.auth.updateUser({
        password: passwordForm.newPassword,
      })
      if (updateError) throw updateError

      await refreshUser(undefined, { force: true })
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
      setPasswordMessage('Contraseña actualizada')
    } catch (error) {
      setPasswordError(error.message || 'No se pudo actualizar la contraseña')
    } finally {
      setBusyKey('')
    }
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Cuenta</p>
          <h1 className={styles.title}>Ajustes de cuenta</h1>
          <p className={styles.subtitle}>
            Gestiona tu perfil, seguridad y preferencias personales. Los permisos por empresa se administran desde Usuarios.
          </p>
        </div>
      </header>

      <div className={styles.layout}>
        <nav className={styles.settingsNav} aria-label="Secciones de ajustes">
          <a href="#profile">Perfil</a>
          <a href="#security">Seguridad</a>
          <a href="#notifications">Notificaciones</a>
        </nav>

        <div className={styles.sections}>
          <section id="profile" className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <h2 className={styles.panelTitle}>Perfil</h2>
                <p className={styles.panelText}>Datos visibles para tu equipo dentro de WeBrief.</p>
              </div>
            </div>

            <form className={styles.form} onSubmit={handleProfileSubmit}>
              <div className={styles.avatarEditor}>
                <span className={styles.avatarPreview}>
                  {avatarPreview ? (
                    <img className={styles.avatarImage} src={avatarPreview} alt="" />
                  ) : (
                    <span className={styles.avatarInitials}>{userInitials(currentUser)}</span>
                  )}
                </span>
                <label className={styles.secondaryButton}>
                  <Camera className={styles.buttonIcon} aria-hidden="true" />
                  Cambiar foto
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={handleAvatarFileChange}
                  />
                </label>
              </div>

              <div className={styles.fieldGrid}>
                <div className={styles.field}>
                  <label className={styles.fieldLabel} htmlFor="account-full-name">Nombre</label>
                  <input
                    id="account-full-name"
                    className={styles.input}
                    type="text"
                    value={profileForm.fullName}
                    onChange={(event) => {
                      setProfileForm({ fullName: event.target.value })
                      setProfileMessage('')
                      setProfileError('')
                    }}
                  />
                </div>

                <div className={styles.field}>
                  <label className={styles.fieldLabel} htmlFor="account-email">Email</label>
                  <input
                    id="account-email"
                    className={styles.input}
                    type="email"
                    value={currentUser?.email || ''}
                    readOnly
                  />
                  <p className={styles.fieldHint}>El cambio de email queda reservado para administradores.</p>
                </div>
              </div>

              <div className={styles.metaGrid}>
                <div>
                  <span className={styles.metaLabel}>Rol general</span>
                  <strong>{platformRoleLabel(currentUser?.platformRole)}</strong>
                </div>
                <div>
                  <span className={styles.metaLabel}>Empresas</span>
                  <strong>{memberships.length || 'Sin empresas'}</strong>
                </div>
              </div>

              {memberships.length > 0 && (
                <div className={styles.accessList}>
                  {memberships.map((membership) => (
                    <div className={styles.accessItem} key={`${membership.companyId}:${membership.role}`}>
                      <span>{membership.companyName || 'Empresa asignada'}</span>
                      <strong>{roleLabel(membership.role)}</strong>
                    </div>
                  ))}
                </div>
              )}

              {profileError && <p className={styles.error} role="alert">{profileError}</p>}
              {profileMessage && <p className={styles.success} role="status" aria-live="polite">{profileMessage}</p>}

              <div className={styles.actions}>
                <button className={styles.primaryButton} type="submit" disabled={!profileDirty || busyKey === 'profile'}>
                  <Save className={styles.buttonIcon} aria-hidden="true" />
                  {busyKey === 'profile' ? 'Guardando...' : 'Guardar perfil'}
                </button>
              </div>
            </form>
          </section>

          <section id="security" className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <h2 className={styles.panelTitle}>Seguridad</h2>
                <p className={styles.panelText}>Cambia tu contraseña confirmando primero tu contraseña actual.</p>
              </div>
              <KeyRound className={styles.panelIcon} aria-hidden="true" />
            </div>

            <form className={styles.form} onSubmit={handlePasswordSubmit}>
              <div className={styles.fieldGrid}>
                <div className={styles.field}>
                  <label className={styles.fieldLabel} htmlFor="current-password">Contraseña actual</label>
                  <input
                    id="current-password"
                    className={styles.input}
                    type="password"
                    autoComplete="current-password"
                    value={passwordForm.currentPassword}
                    onChange={(event) => setPasswordForm((current) => ({
                      ...current,
                      currentPassword: event.target.value,
                    }))}
                    required
                  />
                </div>
                <div className={styles.field}>
                  <label className={styles.fieldLabel} htmlFor="new-account-password">Nueva contraseña</label>
                  <input
                    id="new-account-password"
                    className={styles.input}
                    type="password"
                    autoComplete="new-password"
                    value={passwordForm.newPassword}
                    onChange={(event) => setPasswordForm((current) => ({
                      ...current,
                      newPassword: event.target.value,
                    }))}
                    required
                  />
                </div>
                <div className={styles.field}>
                  <label className={styles.fieldLabel} htmlFor="confirm-account-password">Confirmar nueva contraseña</label>
                  <input
                    id="confirm-account-password"
                    className={styles.input}
                    type="password"
                    autoComplete="new-password"
                    value={passwordForm.confirmPassword}
                    onChange={(event) => setPasswordForm((current) => ({
                      ...current,
                      confirmPassword: event.target.value,
                    }))}
                    required
                  />
                </div>
              </div>

              {passwordError && <p className={styles.error} role="alert">{passwordError}</p>}
              {passwordMessage && <p className={styles.success} role="status" aria-live="polite">{passwordMessage}</p>}

              <div className={styles.actions}>
                <button className={styles.primaryButton} type="submit" disabled={busyKey === 'password'}>
                  <KeyRound className={styles.buttonIcon} aria-hidden="true" />
                  {busyKey === 'password' ? 'Actualizando...' : 'Cambiar contraseña'}
                </button>
              </div>
            </form>
          </section>

          <section id="notifications" className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <h2 className={styles.panelTitle}>Notificaciones</h2>
                <p className={styles.panelText}>Espacio preparado para preferencias de avisos por email y actividad.</p>
              </div>
              <Bell className={styles.panelIcon} aria-hidden="true" />
            </div>
            <div className={styles.emptyState}>
              Las preferencias de notificaciones se pueden sumar acá cuando definamos los tipos de aviso.
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
