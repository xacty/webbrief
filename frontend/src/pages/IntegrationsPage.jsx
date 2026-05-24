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
      <header className={styles.header}>
        <h1 className={styles.title}>Integraciones</h1>
        <p className={styles.subtitle}>
          Conectá WeBrief con tus herramientas para que tu agente de IA
          pueda crear y editar contenido en tu nombre.
        </p>
      </header>

      <div className={styles.content}>
        <Card as="section" padding="md" shadow="sm" radius="lg" className={styles.panel}>
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
  )
}
