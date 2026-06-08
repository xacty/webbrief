import { useEffect, useMemo, useState } from 'react'
import {
  ChevronDown,
  Copy,
  Plug,
  Sparkles,
  Terminal,
  Trash2,
} from 'lucide-react'
import { apiFetch } from '../lib/api'
import { Button, Card, Input } from '../components/ui'
import styles from './IntegrationsPage.module.css'

/**
 * IntegrationsPage — settings for connecting external agents and services
 * to WeBrief. v1 ships with MCP only (Claude Code, Codex, Claude Desktop).
 *
 * Lifted out of AccountSettingsPage so it has its own route and sidebar
 * entry. Future integrations (Slack notifications, ImageKit uploads,
 * Zapier triggers, etc.) live next to MCP here as sibling cards.
 */
export default function IntegrationsPage() {
  // ─── MCP state ─────────────────────────────────────────────────────────
  const [mcpTokens, setMcpTokens] = useState([])
  const [mcpLabelInput, setMcpLabelInput] = useState('')
  const [mcpBusy, setMcpBusy] = useState('')
  const [mcpNewToken, setMcpNewToken] = useState(null) // { raw, id, label, prefix }
  const [mcpError, setMcpError] = useState('')
  const [mcpCopied, setMcpCopied] = useState(false)
  const [mcpClient, setMcpClient] = useState('claude-code') // claude-code | codex | claude-desktop
  const [mcpCommandCopied, setMcpCommandCopied] = useState(false)
  const [mcpEndpointCopied, setMcpEndpointCopied] = useState(false)
  const [mcpShowAdvanced, setMcpShowAdvanced] = useState(false)

  useEffect(() => {
    apiFetch('/api/auth/mcp-tokens')
      .then((data) => setMcpTokens(data.tokens || []))
      .catch(() => {})
  }, [])

  // ─── Handlers ─────────────────────────────────────────────────────────

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
        {
          id: data.token.id,
          label: data.token.label,
          prefix: data.token.prefix,
          created_at: data.token.created_at,
          last_used_at: null,
        },
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

  function handleMcpEndpointCopy() {
    navigator.clipboard.writeText(mcpEndpoint).then(() => {
      setMcpEndpointCopied(true)
      setTimeout(() => setMcpEndpointCopied(false), 2000)
    }).catch(() => {})
  }

  // ─── Derived ───────────────────────────────────────────────────────────

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

  // Cursor deep-link via web wrapper (works without protocol handler installed).
  // Format: cursor.com/en/install-mcp?name=X&config=<base64({"url":...})>
  const cursorInstallUrl = useMemo(() => {
    if (!mcpEndpoint || typeof window === 'undefined') return ''
    const config = JSON.stringify({ url: mcpEndpoint })
    const b64 = window.btoa(config)
    return `https://cursor.com/en/install-mcp?name=webbrief&config=${encodeURIComponent(b64)}`
  }, [mcpEndpoint])

  // VS Code deep-link. Format: vscode:mcp/install?<urlencoded JSON>
  const vscodeInstallUrl = useMemo(() => {
    if (!mcpEndpoint) return ''
    const config = JSON.stringify({ name: 'webbrief', type: 'http', url: mcpEndpoint })
    return `vscode:mcp/install?${encodeURIComponent(config)}`
  }, [mcpEndpoint])

  // The mcpt_* token to embed in the generated command:
  //   - If the user just created one this session → use the raw value.
  //   - Otherwise the raw was never stored (we only kept the prefix) so we
  //     emit a placeholder + a hint above the box telling them to generate.
  const mcpEffectiveToken = mcpNewToken?.raw ?? 'mcpt_GENERA_UN_TOKEN_ARRIBA'

  const mcpClientOptions = [
    {
      value: 'claude-code',
      label: 'Claude Code',
      hint: 'CLI oficial de Anthropic. Ejecuta el comando en una terminal.',
    },
    {
      value: 'codex',
      label: 'Codex CLI',
      hint: 'CLI de OpenAI. Agrega la entrada al archivo ~/.codex/config.toml.',
    },
    {
      value: 'claude-desktop',
      label: 'Claude Desktop',
      hint: 'App de escritorio. Agrega la entrada al claude_desktop_config.json.',
    },
  ]

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
        '# Agrega al final de ~/.codex/config.toml',
        '',
        '[mcp_servers.webbrief]',
        `url = "${mcpEndpoint}"`,
        'transport = "http"',
        '',
        '[mcp_servers.webbrief.headers]',
        `Authorization = "Bearer ${mcpEffectiveToken}"`,
      ].join('\n')
    }
    return [
      '// Agrega esto al objeto raíz de claude_desktop_config.json',
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
        {
          id: data.token.id,
          label: data.token.label,
          prefix: data.token.prefix,
          created_at: data.token.created_at,
          last_used_at: null,
        },
        ...prev,
      ])
    } catch (error) {
      setMcpError(error.message || 'No se pudo crear el token')
    } finally {
      setMcpBusy('')
    }
  }

  // ─── Render ────────────────────────────────────────────────────────────

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div className={styles.pageHeaderInner}>
          <div className={styles.titleRow}>
            <div className={styles.headerMain}>
              <h1 className={styles.title}>Integraciones</h1>
              <p className={styles.headerMeta}>
                Conecta WeBrief con tus herramientas para que tu agente de IA
                pueda crear y editar contenido en tu nombre.
              </p>
            </div>
          </div>
        </div>
      </header>

      <div className={styles.pageBody}>
        <Card as="section" padding="md" shadow="sm" radius="lg" className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <h2 className={styles.panelTitle}>Conecta tu agente</h2>
              <p className={styles.panelText}>
                Conecta tu cliente de IA (Claude Desktop, Cursor, VS Code, Claude Code o Codex) a WeBrief vía MCP.
                El agente podrá crear y editar proyectos, páginas y briefs en tu nombre.
              </p>
            </div>
            <Plug className={styles.panelIcon} aria-hidden="true" />
          </div>

          {/* ─── Section 1: Conexión rápida ─── */}
          <div className={styles.mcpSection}>
            <div className={styles.mcpSectionHead}>
              <Sparkles size={18} aria-hidden="true" className={styles.mcpSectionIcon} />
              <div>
                <h2 className={styles.mcpSectionTitle}>Conexión rápida</h2>
                <p className={styles.mcpSectionSubtitle}>Un clic o pegar una URL. Sin terminal.</p>
              </div>
            </div>

            <div className={styles.mcpCardGrid}>

              {/* Claude Desktop */}
              <div className={styles.mcpCard}>
                <h3 className={styles.mcpCardTitle}>Claude Desktop</h3>
                <p className={styles.mcpCardSubtitle}>App de escritorio — pega una URL</p>
                <p className={styles.mcpCardHelper}>
                  Abre Claude Desktop → <strong>Settings → Connectors → + → Add custom connector</strong>.
                  Pega esta URL y autoriza el acceso desde el navegador.
                </p>
                <div className={styles.mcpCardInputRow}>
                  <Input
                    readOnly
                    value={mcpEndpoint}
                    onFocus={(e) => e.target.select()}
                    className={styles.mcpCardInput}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      navigator.clipboard.writeText(mcpEndpoint).catch(() => {})
                    }}
                  >
                    <Copy size={14} aria-hidden="true" /> Copiar
                  </Button>
                </div>
              </div>

              {/* Cursor */}
              <div className={styles.mcpCard}>
                <h3 className={styles.mcpCardTitle}>Cursor</h3>
                <p className={styles.mcpCardSubtitle}>IDE de IA — un clic</p>
                <p className={styles.mcpCardHelper}>
                  Haz clic en el botón. Cursor confirmará la instalación y abrirá el navegador para autorizar.
                </p>
                <a
                  href={cursorInstallUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.mcpCardDeepLink}
                  aria-label="Agregar webbrief a Cursor"
                >
                  <img
                    src="https://cursor.com/deeplink/mcp-install-dark.svg"
                    alt="Add webbrief MCP server to Cursor"
                    height="32"
                  />
                </a>
                <details className={styles.mcpCardManual}>
                  <summary>Ver snippet manual</summary>
                  <p className={styles.mcpCardPathNote}>
                    Archivo: <code>~/.cursor/mcp.json</code> (global) o <code>.cursor/mcp.json</code> (por proyecto)
                  </p>
                  <pre className={styles.mcpCardCode}><code>{JSON.stringify({ mcpServers: { webbrief: { url: mcpEndpoint } } }, null, 2)}</code></pre>
                </details>
              </div>

              {/* VS Code */}
              <div className={styles.mcpCard}>
                <h3 className={styles.mcpCardTitle}>VS Code</h3>
                <p className={styles.mcpCardSubtitle}>Con MCP integrado (1.95+) — un clic</p>
                <p className={styles.mcpCardHelper}>
                  Haz clic en el botón. VS Code confirmará la instalación y abrirá el navegador para autorizar.
                </p>
                <a href={vscodeInstallUrl} className={styles.mcpCardDeepLink}>
                  <Button variant="primary" size="sm" type="button">
                    Agregar a VS Code
                  </Button>
                </a>
                <details className={styles.mcpCardManual}>
                  <summary>Ver snippet manual</summary>
                  <p className={styles.mcpCardPathNote}>
                    macOS: <code>~/Library/Application Support/Code/User/mcp.json</code><br />
                    Windows: <code>%APPDATA%\Code\User\mcp.json</code><br />
                    Linux: <code>~/.config/Code/User/mcp.json</code><br />
                    O por workspace: <code>.vscode/mcp.json</code>
                  </p>
                  <pre className={styles.mcpCardCode}><code>{JSON.stringify({ servers: { webrief: { type: 'http', url: mcpEndpoint } } }, null, 2)}</code></pre>
                </details>
              </div>

            </div>
          </div>

          {/* Divider + toggle for advanced (bearer-token) wizard */}
          <div className={styles.mcpAdvancedDivider}>
            <button
              type="button"
              className={styles.mcpAdvancedDividerToggle}
              onClick={() => setMcpShowAdvanced((v) => !v)}
              aria-expanded={mcpShowAdvanced}
            >
              <ChevronDown
                size={14}
                className={`${styles.mcpAdvancedChevron} ${mcpShowAdvanced ? styles.mcpAdvancedChevronOpen : ''}`}
                aria-hidden="true"
              />
              {mcpShowAdvanced
                ? 'Ocultar método avanzado (para devs)'
                : 'Mostrar método avanzado (token bearer, para devs)'}
            </button>
          </div>

          {mcpShowAdvanced && (
            <>
              {/* Step 1 — Generate token */}
              <div className={styles.mcpStep}>
                <div className={styles.mcpStepHead}>
                  <span className={styles.mcpStepNum}>1</span>
                  <div className={styles.mcpStepBody}>
                    <h3 className={styles.mcpStepTitle}>Genera tu token de acceso</h3>
                    <p className={styles.mcpStepText}>
                      Los tokens son de larga duración y se muestran <strong>una sola vez</strong>.
                      Si ya tienes uno guardado, puedes saltarte este paso.
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
                    <h3 className={styles.mcpStepTitle}>Elige tu cliente MCP</h3>
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
                    <h3 className={styles.mcpStepTitle}>Pega esto en tu cliente</h3>
                    <p className={styles.mcpStepText}>
                      {!mcpNewToken && (
                        <span className={styles.mcpHint}>
                          ⚠ El comando muestra un placeholder porque tu token no está disponible.
                          Genera uno arriba para autocompletarlo.
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
                  Después de pegarlo, reinicia tu cliente y prueba pedirle:
                  <em> "Lista mis empresas de WeBrief"</em>.
                </p>
              </div>

              {/* Token management list */}
              <div className={styles.mcpAdvanced}>
                <button
                  type="button"
                  className={styles.mcpAdvancedToggle}
                  onClick={() => setMcpShowAdvanced((v) => !v)}
                  aria-expanded={mcpShowAdvanced}
                  aria-label="Ocultar método avanzado"
                >
                  <ChevronDown
                    size={14}
                    className={`${styles.mcpAdvancedChevron} ${styles.mcpAdvancedChevronOpen}`}
                    aria-hidden="true"
                  />
                  Tokens activos {mcpTokens.length > 0 && `(${mcpTokens.length})`}
                </button>

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
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  )
}
