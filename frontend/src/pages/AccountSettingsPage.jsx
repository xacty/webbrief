import { useEffect, useMemo, useState } from 'react'
import { Bell, Camera, Copy, Download, KeyRound, Save, Terminal, Trash2, ChevronDown, Plug, Sparkles } from 'lucide-react'
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
  const [mcpClient, setMcpClient] = useState('claude-code') // claude-code | codex | claude-desktop
  const [mcpCommandCopied, setMcpCommandCopied] = useState(false)
  const [mcpShowAdvanced, setMcpShowAdvanced] = useState(false)
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
    }).catch(() => {})
  }

  // Canonical MCP endpoint URL.
  // In dev the frontend runs on :5173 (Vite) while the backend lives on :3000.
  // External MCP clients (Claude Code, Codex, Claude Desktop) are not behind
  // the Vite proxy, so we point them straight at the backend.
  // In production both share the same origin, so we use window.location.
  const mcpEndpoint = useMemo(() => {
    if (typeof window === 'undefined') return ''
    if (import.meta.env?.DEV) return 'http://localhost:3000/api/mcp'
    return `${window.location.origin}/api/mcp`
  }, [])

  // The mcpt_* token to embed in the generated command:
  //   - If the user just created one this session → use the raw value.
  //   - Otherwise the raw was never stored (we only kept the prefix) so we
  //     emit a placeholder + a hint above the box telling them to generate.
  const mcpEffectiveToken = mcpNewToken?.raw ?? 'mcpt_GENERA_UN_TOKEN_ARRIBA'

  const mcpClientOptions = [
    {
      value: 'claude-code',
      label: 'Claude Code',
      hint: 'CLI oficial de Anthropic. Ejecutá el comando en una terminal.',
    },
    {
      value: 'codex',
      label: 'Codex CLI',
      hint: 'CLI de OpenAI. Agregá la entrada al archivo ~/.codex/config.toml.',
    },
    {
      value: 'claude-desktop',
      label: 'Claude Desktop',
      hint: 'App de escritorio. Agregá la entrada al claude_desktop_config.json.',
    },
  ]

  // Builds the snippet for the chosen client. Always references mcpEndpoint
  // and mcpEffectiveToken so it stays in sync when the user generates a fresh
  // token or moves between environments.
  const mcpCommand = useMemo(() => {
    if (mcpClient === 'claude-code') {
      return [
        'claude mcp add webbrief \\',
        '  --transport http \\',
        `  --header "Authorization: Bearer ${mcpEffectiveToken}" \\`,
        `  ${mcpEndpoint}`,
      ].join('\n')
    }
    if (mcpClient === 'codex') {
      return [
        '# Agregá al final de ~/.codex/config.toml',
        '',
        '[mcp_servers.webbrief]',
        `url = "${mcpEndpoint}"`,
        'transport = "http"',
        '',
        '[mcp_servers.webbrief.headers]',
        `Authorization = "Bearer ${mcpEffectiveToken}"`,
      ].join('\n')
    }
    // Claude Desktop
    return [
      '// Agregá esto al objeto raíz de claude_desktop_config.json',
      '"mcpServers": {',
      '  "webbrief": {',
      `    "url": "${mcpEndpoint}",`,
      '    "transport": "http",',
      '    "headers": {',
      `      "Authorization": "Bearer ${mcpEffectiveToken}"`,
      '    }',
      '  }',
      '}',
    ].join('\n')
  }, [mcpClient, mcpEndpoint, mcpEffectiveToken])

  function handleMcpCommandCopy() {
    navigator.clipboard.writeText(mcpCommand).then(() => {
      setMcpCommandCopied(true)
      setTimeout(() => setMcpCommandCopied(false), 2000)
    }).catch(() => {})
  }

  async function handleMcpQuickGenerate() {
    // Generate a token with an auto-label tied to the currently selected client
    // and return immediately. The caller renders the command snippet from
    // `mcpNewToken.raw` so the value materialises in the UI without an extra step.
    const clientLabel = mcpClientOptions.find((c) => c.value === mcpClient)?.label ?? 'MCP'
    const autoLabel = `${clientLabel} · ${new Date().toLocaleDateString('es')}`
    setMcpBusy('create')
    setMcpError('')
    setMcpNewToken(null)
    try {
      const data = await apiFetch('/api/auth/mcp-tokens', {
        method: 'POST',
        body: JSON.stringify({ label: autoLabel }),
      })
      setMcpNewToken(data.token)
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
          <a href="#api-tokens">MCP</a>
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
                <h2 className={styles.panelTitle}>Conectá tu agente</h2>
                <p className={styles.panelText}>
                  Conectá Claude Code, Codex o Claude Desktop a WeBrief vía MCP.
                  El agente podrá crear y editar proyectos, páginas y briefs en tu nombre.
                </p>
              </div>
              <Plug className={styles.panelIcon} aria-hidden="true" />
            </div>

            {/* Step 1 — Generate token */}
            <div className={styles.mcpStep}>
              <div className={styles.mcpStepHead}>
                <span className={styles.mcpStepNum}>1</span>
                <div className={styles.mcpStepBody}>
                  <h3 className={styles.mcpStepTitle}>Generá tu token de acceso</h3>
                  <p className={styles.mcpStepText}>
                    Los tokens son de larga duración y se muestran <strong>una sola vez</strong>.
                    Si ya tenés uno guardado, podés saltarte este paso.
                  </p>
                </div>
              </div>

              <div className={styles.mcpStepAction}>
                <Button
                  type="button"
                  variant="primary"
                  size="md"
                  icon={<Sparkles size={14} />}
                  loading={mcpBusy === 'create'}
                  disabled={mcpBusy === 'create'}
                  onClick={handleMcpQuickGenerate}
                >
                  {mcpNewToken ? 'Generar otro' : 'Generar token'}
                </Button>
              </div>

              {mcpNewToken && (
                <div className={styles.mcpReveal}>
                  <p className={styles.mcpRevealLabel}>
                    Token nuevo · este valor no se podrá ver de nuevo:
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
                      {mcpCopied ? 'Copiado' : 'Copiar token'}
                    </Button>
                  </div>
                </div>
              )}
              {mcpError && <p className={styles.error} role="alert">{mcpError}</p>}
            </div>

            {/* Step 2 — Pick client */}
            <div className={styles.mcpStep}>
              <div className={styles.mcpStepHead}>
                <span className={styles.mcpStepNum}>2</span>
                <div className={styles.mcpStepBody}>
                  <h3 className={styles.mcpStepTitle}>Elegí tu cliente MCP</h3>
                  <p className={styles.mcpStepText}>
                    {mcpClientOptions.find((c) => c.value === mcpClient)?.hint}
                  </p>
                </div>
              </div>

              <div className={styles.mcpClientGrid} role="radiogroup" aria-label="Cliente MCP">
                {mcpClientOptions.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    role="radio"
                    aria-checked={mcpClient === opt.value}
                    onClick={() => setMcpClient(opt.value)}
                    className={`${styles.mcpClientOption} ${mcpClient === opt.value ? styles.mcpClientOptionActive : ''}`}
                  >
                    <Terminal size={14} aria-hidden="true" />
                    <span>{opt.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Step 3 — Copy command */}
            <div className={styles.mcpStep}>
              <div className={styles.mcpStepHead}>
                <span className={styles.mcpStepNum}>3</span>
                <div className={styles.mcpStepBody}>
                  <h3 className={styles.mcpStepTitle}>Pegá esto en tu cliente</h3>
                  <p className={styles.mcpStepText}>
                    {!mcpNewToken && (
                      <span className={styles.mcpHint}>
                        ⚠ El comando muestra un placeholder porque tu token raw no está disponible.
                        Generá uno arriba para autocompletarlo.
                      </span>
                    )}
                    {mcpNewToken && 'El comando ya incluye tu token recién generado.'}
                  </p>
                </div>
              </div>

              <div className={styles.mcpCommandWrap}>
                <pre className={styles.mcpCommand}><code>{mcpCommand}</code></pre>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  icon={<Copy size={14} />}
                  onClick={handleMcpCommandCopy}
                  className={styles.mcpCommandCopy}
                >
                  {mcpCommandCopied ? 'Copiado' : 'Copiar'}
                </Button>
              </div>

              <p className={styles.mcpAfter}>
                Después de pegarlo, reiniciá tu cliente y probá pedirle:
                <em> "Listá mis empresas de WeBrief"</em>.
              </p>
            </div>

            {/* Token management — collapsed by default */}
            <div className={styles.mcpAdvanced}>
              <button
                type="button"
                className={styles.mcpAdvancedToggle}
                onClick={() => setMcpShowAdvanced((v) => !v)}
                aria-expanded={mcpShowAdvanced}
              >
                <ChevronDown
                  size={14}
                  className={`${styles.mcpAdvancedChevron} ${mcpShowAdvanced ? styles.mcpAdvancedChevronOpen : ''}`}
                  aria-hidden="true"
                />
                Tokens activos {mcpTokens.length > 0 && `(${mcpTokens.length})`}
              </button>

              {mcpShowAdvanced && (
                <div className={styles.mcpAdvancedPanel}>
                  <form className={styles.form} onSubmit={handleMcpCreate}>
                    <div className={styles.mcpCreateRow}>
                      <Input
                        id="mcp-token-label"
                        label="Crear token con nombre personalizado"
                        type="text"
                        placeholder="p.ej. Claude Code en mi laptop"
                        value={mcpLabelInput}
                        onChange={(e) => setMcpLabelInput(e.target.value)}
                        maxLength={120}
                      />
                      <Button
                        type="submit"
                        variant="secondary"
                        size="md"
                        disabled={!mcpLabelInput.trim() || mcpBusy === 'create'}
                        loading={mcpBusy === 'create'}
                      >
                        Crear
                      </Button>
                    </div>
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
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
