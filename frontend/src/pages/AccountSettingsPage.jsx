import { useEffect, useMemo, useState } from 'react'
import { Bell, Camera, Copy, Download, KeyRound, Save, Terminal, Trash2 } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { apiDownloadToFile, apiFetch } from '../lib/api'
import { supabase } from '../lib/supabase'
import {
  getCompanyRoleLabel,
  getPlatformRoleTitle,
} from '../../../shared/userRoles.js'
import { Button, Input, Card } from '../components/ui'
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

async function downloadAvatarExport(userId, preset) {
  const path = `/api/users/${userId}/avatar/export?preset=${encodeURIComponent(preset)}`
  await apiDownloadToFile(path, { suggestedFileName: 'avatar' })
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
  const [mcpTokens, setMcpTokens] = useState([])
  const [mcpLabelInput, setMcpLabelInput] = useState('')
  const [mcpBusy, setMcpBusy] = useState('')
  const [mcpNewToken, setMcpNewToken] = useState(null) // { raw, id, label, prefix }
  const [mcpError, setMcpError] = useState('')
  const [mcpCopied, setMcpCopied] = useState(false)
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

  useEffect(() => {
    apiFetch('/api/auth/mcp-tokens')
      .then((data) => setMcpTokens(data.tokens || []))
      .catch(() => {})
  }, [])

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

  async function handleMcpCreate(event) {
    event.preventDefault()
    const label = mcpLabelInput.trim()
    if (!label) return
    setMcpBusy('create')
    setMcpError('')
    setMcpNewToken(null)
    try {
      const data = await apiFetch('/api/auth/mcp-tokens', {
        method: 'POST',
        body: JSON.stringify({ label }),
      })
      setMcpNewToken(data.token)
      setMcpLabelInput('')
      setMcpTokens((prev) => [
        { id: data.token.id, label: data.token.label, prefix: data.token.prefix, created_at: data.token.created_at, last_used_at: null },
        ...prev,
      ])
    } catch (error) {
      setMcpError(error.message || 'No se pudo crear el token')
    } finally {
      setMcpBusy('')
    }
  }

  async function handleMcpRevoke(tokenId) {
    setMcpBusy(tokenId)
    setMcpError('')
    try {
      await apiFetch(`/api/auth/mcp-tokens/${tokenId}`, { method: 'DELETE' })
      setMcpTokens((prev) => prev.filter((t) => t.id !== tokenId))
      if (mcpNewToken?.id === tokenId) setMcpNewToken(null)
    } catch (error) {
      setMcpError(error.message || 'No se pudo revocar el token')
    } finally {
      setMcpBusy('')
    }
  }

  function handleMcpCopy() {
    if (!mcpNewToken?.raw) return
    navigator.clipboard.writeText(mcpNewToken.raw).then(() => {
      setMcpCopied(true)
      setTimeout(() => setMcpCopied(false), 2000)
    })
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
          <a href="#api-tokens">Tokens MCP</a>
        </nav>

        <div className={styles.sections}>
          <Card as="section" id="profile" padding="md" shadow="sm" radius="lg" className={styles.panel}>
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
                <div className={styles.avatarActionGroup}>
                  <label className={styles.fileInputLabel}>
                    <Camera size={16} aria-hidden="true" />
                    <span>Cambiar foto</span>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={handleAvatarFileChange}
                    />
                  </label>
                  {currentUser?.avatarUrl && (
                    <>
                      <Button
                        type="button"
                        variant="secondary"
                        size="md"
                        icon={<Download size={16} />}
                        onClick={() => downloadAvatarExport(currentUser.id, 'original')}
                      >
                        Original
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        size="md"
                        icon={<Download size={16} />}
                        onClick={() => downloadAvatarExport(currentUser.id, 'web')}
                      >
                        WebP
                      </Button>
                    </>
                  )}
                </div>
              </div>

              <div className={styles.fieldGrid}>
                <Input
                  id="account-full-name"
                  label="Nombre"
                  type="text"
                  value={profileForm.fullName}
                  onChange={(event) => {
                    setProfileForm({ fullName: event.target.value })
                    setProfileMessage('')
                    setProfileError('')
                  }}
                />

                <Input
                  id="account-email"
                  label="Email"
                  type="email"
                  value={currentUser?.email || ''}
                  readOnly
                  helperText="El cambio de email queda reservado para administradores."
                />
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
                <Button
                  type="submit"
                  variant="primary"
                  icon={<Save size={16} />}
                  disabled={!profileDirty || busyKey === 'profile'}
                  loading={busyKey === 'profile'}
                >
                  {busyKey === 'profile' ? 'Guardando...' : 'Guardar perfil'}
                </Button>
              </div>
            </form>
          </Card>

          <Card as="section" id="security" padding="md" shadow="sm" radius="lg" className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <h2 className={styles.panelTitle}>Seguridad</h2>
                <p className={styles.panelText}>Cambia tu contraseña confirmando primero tu contraseña actual.</p>
              </div>
              <KeyRound className={styles.panelIcon} aria-hidden="true" />
            </div>

            <form className={styles.form} onSubmit={handlePasswordSubmit}>
              <div className={styles.fieldGrid}>
                <Input
                  id="current-password"
                  label="Contraseña actual"
                  type="password"
                  autoComplete="current-password"
                  value={passwordForm.currentPassword}
                  onChange={(event) => setPasswordForm((current) => ({
                    ...current,
                    currentPassword: event.target.value,
                  }))}
                  required
                />
                <Input
                  id="new-account-password"
                  label="Nueva contraseña"
                  type="password"
                  autoComplete="new-password"
                  value={passwordForm.newPassword}
                  onChange={(event) => setPasswordForm((current) => ({
                    ...current,
                    newPassword: event.target.value,
                  }))}
                  required
                />
                <Input
                  id="confirm-account-password"
                  label="Confirmar nueva contraseña"
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

              {passwordError && <p className={styles.error} role="alert">{passwordError}</p>}
              {passwordMessage && <p className={styles.success} role="status" aria-live="polite">{passwordMessage}</p>}

              <div className={styles.actions}>
                <Button
                  type="submit"
                  variant="primary"
                  icon={<KeyRound size={16} />}
                  disabled={busyKey === 'password'}
                  loading={busyKey === 'password'}
                >
                  {busyKey === 'password' ? 'Actualizando...' : 'Cambiar contraseña'}
                </Button>
              </div>
            </form>
          </Card>

          <Card as="section" id="notifications" padding="md" shadow="sm" radius="lg" className={styles.panel}>
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
          </Card>

          <Card as="section" id="api-tokens" padding="md" shadow="sm" radius="lg" className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <h2 className={styles.panelTitle}>Tokens MCP</h2>
                <p className={styles.panelText}>
                  Tokens de larga duración para clientes MCP locales (Codex, Claude Code).
                  El valor raw solo se muestra una vez al crear.
                </p>
              </div>
              <Terminal className={styles.panelIcon} aria-hidden="true" />
            </div>

            {mcpNewToken && (
              <div className={styles.mcpReveal}>
                <p className={styles.mcpRevealLabel}>
                  Copia este token ahora — no se puede ver de nuevo.
                </p>
                <div className={styles.mcpRevealRow}>
                  <code className={styles.mcpCode}>{mcpNewToken.raw}</code>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    icon={<Copy size={14} />}
                    onClick={handleMcpCopy}
                  >
                    {mcpCopied ? 'Copiado' : 'Copiar'}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setMcpNewToken(null)}
                  >
                    Cerrar
                  </Button>
                </div>
              </div>
            )}

            <form className={styles.form} onSubmit={handleMcpCreate}>
              <div className={styles.mcpCreateRow}>
                <Input
                  id="mcp-token-label"
                  label="Nombre del token"
                  type="text"
                  placeholder="p.ej. Claude Code local"
                  value={mcpLabelInput}
                  onChange={(e) => setMcpLabelInput(e.target.value)}
                  maxLength={120}
                />
                <Button
                  type="submit"
                  variant="primary"
                  size="md"
                  disabled={!mcpLabelInput.trim() || mcpBusy === 'create'}
                  loading={mcpBusy === 'create'}
                >
                  Crear token
                </Button>
              </div>
              {mcpError && <p className={styles.error} role="alert">{mcpError}</p>}
            </form>

            {mcpTokens.length > 0 ? (
              <ul className={styles.mcpList}>
                {mcpTokens.map((token) => (
                  <li key={token.id} className={styles.mcpItem}>
                    <div className={styles.mcpItemInfo}>
                      <span className={styles.mcpItemLabel}>{token.label}</span>
                      <code className={styles.mcpItemPrefix}>{token.prefix}…</code>
                      <span className={styles.mcpItemMeta}>
                        Creado {new Date(token.created_at).toLocaleDateString('es')}
                        {token.last_used_at && ` · Último uso ${new Date(token.last_used_at).toLocaleDateString('es')}`}
                      </span>
                    </div>
                    <Button
                      type="button"
                      variant="danger"
                      size="sm"
                      icon={<Trash2 size={14} />}
                      disabled={mcpBusy === token.id}
                      loading={mcpBusy === token.id}
                      onClick={() => handleMcpRevoke(token.id)}
                    >
                      Revocar
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={styles.emptyState}>Sin tokens activos.</p>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}
