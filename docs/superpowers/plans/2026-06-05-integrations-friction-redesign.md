# WeBrief `/integrations` Friction-Based Redesign Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans`. Fully autonomous — every decision pre-made below.

**Goal:** Reorganize `/integrations` by **friction**, not audience. Top section "Conexión rápida" unifies the 3 one-click-or-paste clients (Claude Desktop, Cursor, VS Code) in a single card grid. Middle section "Otros clientes" shows the terminal/config clients (Claude Code, Codex CLI). Bottom section keeps the token wizard collapsed as automation/CI fallback (drop Claude Desktop tab from it — its snippet doesn't work).

**Architecture:** Pure frontend refactor of `frontend/src/pages/IntegrationsPage.jsx` + its CSS module. No backend changes. Restructures the existing Claude Desktop "recomendado" block into a card matching the new unified template, adds 4 new cards (Cursor, VS Code, Claude Code, Codex), refactors the existing 3-step token wizard's wording and drops one tab.

**Tech Stack:** React 18, CSS Modules, existing `Button`/`Card`/`Input` from `frontend/src/components/ui`, `lucide-react` icons. `btoa` for Cursor deep-link base64; `encodeURIComponent` for VS Code deep-link.

---

## Pre-Decided Specifications

### Page structure (after this plan)

```
┌─ Card: "Conecta tu agente" ────────────────────────────────────────┐
│  Panel header (subtitle updated)                                   │
│                                                                    │
│  ─── Conexión rápida (un clic o pegar URL — sin terminal) ───      │
│   ┌───────────────┐ ┌───────────────┐ ┌───────────────┐            │
│   │ Claude Desktop│ │   Cursor      │ │   VS Code     │            │
│   │ pegar URL     │ │ botón 1-click │ │ botón 1-click │            │
│   └───────────────┘ └───────────────┘ └───────────────┘            │
│                                                                    │
│  ─── Otros clientes (terminal / config manual) ─────────────────   │
│   ┌───────────────────────┐ ┌─────────────────────────────────┐    │
│   │ Claude Code           │ │ Codex CLI                       │    │
│   │ un comando terminal   │ │ snippet TOML + login command    │    │
│   └───────────────────────┘ └─────────────────────────────────┘    │
│                                                                    │
│  ▸ Mostrar método con token (para automatización o CI)             │
│    └─ (existing wizard, collapsed, with Claude Desktop tab dropped │
│       and Step-3 header per-tab)                                   │
└────────────────────────────────────────────────────────────────────┘
```

### Section 1 "Conexión rápida"
- Header: `"Conexión rápida"` + subtitle `"Un clic o pegar una URL. Sin terminal."`
- Visual marker: a `<Sparkles>` icon next to the section header (replaces the per-card star from the current Claude Desktop block).
- 3 cards in a responsive grid (`auto-fit, minmax(280px, 1fr)`).
- Card content per client:

**Claude Desktop card**
- Title: "Claude Desktop"
- Subtitle: "App de escritorio — pega una URL"
- Helper: "Abre Claude Desktop → **Settings → Connectors → +  → Add custom connector**. Pega esta URL y autoriza el acceso desde el navegador."
- Primary action: read-only `<Input>` with `mcpEndpoint` + copy button (existing pattern).
- No deep-link button (Claude Desktop doesn't have one — verified).

**Cursor card**
- Title: "Cursor"
- Subtitle: "IDE de IA — un clic"
- Helper: "Haz clic en el botón. Cursor confirmará la instalación y abrirá el navegador para autorizar."
- Primary action: official Cursor badge SVG (`https://cursor.com/deeplink/mcp-install-dark.svg`) wrapped in an `<a>` linking to the web wrapper `https://cursor.com/en/install-mcp?name=webbrief&config=<base64>`.
- Secondary: `<details>` "Ver snippet manual" → JSON for `~/.cursor/mcp.json`.

**VS Code card**
- Title: "VS Code"
- Subtitle: "Con MCP integrado (1.95+) — un clic"
- Helper: "Haz clic en el botón. VS Code confirmará la instalación y abrirá el navegador para autorizar."
- Primary action: `<a href="vscode:mcp/install?...">` wrapping a primary `<Button>` "Agregar a VS Code".
- Secondary: `<details>` "Ver snippet manual" → JSON for `mcp.json` + paths per OS (macOS / Windows / Linux / workspace).

### Section 2 "Otros clientes"
- Header: `"Otros clientes"` + subtitle `"Para clientes de terminal o que requieren configuración manual."`
- 2 cards in a responsive grid (same `auto-fit, minmax(280px, 1fr)` as section 1).
- Card content per client:

**Claude Code card**
- Title: "Claude Code"
- Subtitle: "CLI oficial de Anthropic"
- Helper: "Ejecuta este comando en tu terminal. Claude Code abrirá el navegador para autorizar la primera vez. No necesitas generar ningún token."
- Primary action: `<pre><code>` with the command `claude mcp add --transport http webbrief <mcpEndpoint>` + copy button.

**Codex CLI card**
- Title: "Codex CLI"
- Subtitle: "CLI de OpenAI"
- Helper: "Agrega este bloque al archivo, luego ejecuta el comando de login en tu terminal para iniciar OAuth. No necesitas generar ningún token."
- File path note: `Archivo: ~/.codex/config.toml` (with copy-icon next to the path).
- Primary action: `<pre><code>` with the TOML snippet `[mcp_servers.webbrief]\nurl = "<mcpEndpoint>"` + copy button.
- Secondary helper: `Después, en tu terminal:` + `<pre><code>codex mcp login webbrief</code></pre>`.

### Section 3 "Mostrar método con token (para automatización o CI)" — collapsed
- Toggle text:
  - Collapsed: `"Mostrar método con token (para automatización o CI)"`
  - Expanded: `"Ocultar método con token"`
- Top of expanded: context note in a warning-style card: *"Solo necesitas un token si tu cliente no soporta OAuth o si quieres conectar desde un script / CI / automatización. Para uso interactivo, usa los botones de arriba."*
- Inside: the existing 3-step wizard with these changes:
  - **Step 2 (pick client)**: drop the Claude Desktop tab. Only `Claude Code` and `Codex CLI` remain. Default tab = `claude-code`.
  - **Step 3 header**: per-tab — `"Ejecuta este comando en tu terminal"` (Claude Code) / `"Agrega este bloque a ~/.codex/config.toml"` (Codex).
  - All other wizard logic (generate token, copy command, etc.) stays untouched.

### Panel header copy
Current:
> Conecta Claude Code, Codex o Claude Desktop a WeBrief vía MCP. El agente podrá crear y editar proyectos, páginas y briefs en tu nombre.

New:
> Conecta tu cliente de IA (Claude Desktop, Cursor, VS Code, Claude Code o Codex) a WeBrief vía MCP. El agente podrá crear y editar proyectos, páginas y briefs en tu nombre.

### ChatGPT
- NOT included as a card (OpenAI hasn't shipped public custom MCP HTTP connectors as of 2026-06-05; adding a "coming soon" placeholder feels like vaporware).
- ADD a one-line note at the very bottom of the panel (below all sections): *"ChatGPT se agregará a 'Conexión rápida' cuando OpenAI habilite connectors MCP públicos."*
- When OpenAI ships it, adding the card is a 5-line change.

### Deep-link URL specs (verified in earlier research)

**Cursor:**
- URI: `cursor://anysphere.cursor-deeplink/mcp/install?name=webbrief&config=<base64>`
- **USE THE WEB WRAPPER** (works without protocol handler): `https://cursor.com/en/install-mcp?name=webbrief&config=<base64>`
- JSON inside base64: `{"url":"<mcpEndpoint>"}` (URL only — OAuth handles auth on 401).
- Encoding: standard base64 via `btoa()`, then `encodeURIComponent` the result.
- Badge SVG: `https://cursor.com/deeplink/mcp-install-dark.svg`

**VS Code:**
- URI: `vscode:mcp/install?<URL-encoded JSON>` (URL-encoded, NOT base64).
- JSON: `{"name":"webbrief","type":"http","url":"<mcpEndpoint>"}`
- Build: `'vscode:mcp/install?' + encodeURIComponent(JSON.stringify(obj))`
- No first-party badge SVG — use a styled primary `<Button>`.

### Spanish / design rules
- Neutral Spanish (CLAUDE.md). No "tenés/podés/hacé/copiá/vos". Use "tienes/puedes/haz/copia/tú".
- Design tokens (`var(--wb-*)`) only — zero hardcoded colors.
- Reuse `Button`, `Card`, `Input` primitives.

### Environment
- Branch: create `feat/integrations-friction-redesign` from `main` (which already has the OAuth feature merged).
- Frontend on :5173 (Vite, hot-reload, running). Backend on :3000 (running). Vite proxy already includes `/oauth/authorize/preview` + `/grant`.
- Commits: one per task; sign with `Co-Authored-By: Claude Opus 4.8`.

### Out of scope
- ChatGPT card (waiting for OpenAI).
- New clients beyond the 5 (Continue, Cline, Windsurf).
- `curl | sh` installer.
- Backend changes.
- Unit tests for UI.
- Production deployment.

---

## File Structure

### Files to MODIFY
- `frontend/src/pages/IntegrationsPage.jsx` — full restructure of the MCP `<Card>` content.
- `frontend/src/pages/IntegrationsPage.module.css` — replace per-client legacy styles with unified card grid + section headers.

### Files NOT to create
No new component files; all cards live inline in IntegrationsPage.jsx.

---

## Task 1: New "Conexión rápida" top section (unified 3-card grid)

**Files:**
- Modify: `frontend/src/pages/IntegrationsPage.jsx`
- Modify: `frontend/src/pages/IntegrationsPage.module.css`

- [ ] **Step 1.1: Branch + read current file**

```bash
cd /Users/adrian/GitHub/webbrief
git checkout main
git checkout -b feat/integrations-friction-redesign
```

Read the FULL current `frontend/src/pages/IntegrationsPage.jsx` to map: the panel header `<p className={styles.panelText}>`, the existing Claude Desktop "recomendado" block (the `styles.mcpStep` block with the Sparkles icon marker that ends with the read-only Input + Copy button + helper line), the divider/toggle for `mcpShowAdvanced`, and the existing 3-step wizard inside `{mcpShowAdvanced && (`. Find the EXACT line ranges of each so you can surgically replace just the recommended block in this task.

- [ ] **Step 1.2: Update the panel-header copy**

Find the panel header text and replace it with:

```jsx
            <p className={styles.panelText}>
              Conecta tu cliente de IA (Claude Desktop, Cursor, VS Code, Claude Code o Codex) a WeBrief vía MCP.
              El agente podrá crear y editar proyectos, páginas y briefs en tu nombre.
            </p>
```

- [ ] **Step 1.3: Add deep-link URL helper memos**

In the `IntegrationsPage` function body, near the existing `mcpEndpoint` `useMemo`, add:

```jsx
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
```

- [ ] **Step 1.4: Replace the existing Claude Desktop "recomendado" block with a 3-card "Conexión rápida" grid**

Find the existing block — it currently sits at the TOP of the `<Card>` content, before the `mcpShowAdvanced` divider. It has a header with a Sparkles marker, the "Claude Desktop (recomendado)" title, ordered-list instructions, the URL `<Input>`, the helper note. **Replace that entire block** with this new section:

```jsx
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
```

- [ ] **Step 1.5: Replace the existing Claude-Desktop-block CSS with the new unified card-grid CSS**

In `frontend/src/pages/IntegrationsPage.module.css`, find the old per-client classes that styled the legacy "recomendado" block (e.g. `mcpRecommendedNum`, `mcpOAuthSteps`, `mcpOAuthInputRow`, `mcpOAuthHelper`). Leave them in place for now (Task 2 may still reference them; the wizard block uses the original `mcpStep*` classes which are also still used). At the end of the file, APPEND the new unified styles:

```css
/* ─── Friction-redesign: section headers + card grid ─── */

.mcpSection {
  margin-bottom: var(--wb-space-8, var(--wb-space-6));
}

.mcpSectionHead {
  display: flex;
  align-items: flex-start;
  gap: var(--wb-space-3);
  margin-bottom: var(--wb-space-4);
  padding-bottom: var(--wb-space-3);
  border-bottom: 1px solid var(--wb-color-neutral-200);
}

.mcpSectionIcon {
  color: var(--wb-color-primary-600);
  margin-top: 2px;
  flex-shrink: 0;
}

.mcpSectionTitle {
  font-size: var(--wb-text-lg);
  font-weight: var(--wb-weight-bold);
  color: var(--wb-color-neutral-900);
  margin: 0;
}

.mcpSectionSubtitle {
  font-size: var(--wb-text-sm);
  color: var(--wb-color-neutral-600);
  margin: 2px 0 0;
}

.mcpCardGrid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: var(--wb-space-4);
}

.mcpCard {
  border: 1px solid var(--wb-color-neutral-200);
  border-radius: var(--wb-radius-md);
  padding: var(--wb-space-4);
  background: var(--wb-color-neutral-50);
  display: flex;
  flex-direction: column;
  gap: var(--wb-space-3);
}

.mcpCardTitle {
  font-size: var(--wb-text-base);
  font-weight: var(--wb-weight-bold);
  color: var(--wb-color-neutral-900);
  margin: 0;
}

.mcpCardSubtitle {
  font-size: var(--wb-text-xs);
  color: var(--wb-color-neutral-600);
  margin: -8px 0 0;
}

.mcpCardHelper {
  font-size: var(--wb-text-sm);
  color: var(--wb-color-neutral-700);
  line-height: var(--wb-leading-snug);
  margin: 0;
}

.mcpCardInputRow {
  display: flex;
  gap: var(--wb-space-2);
  align-items: center;
}

.mcpCardInput {
  flex: 1;
  font-family: var(--wb-font-mono, monospace);
  font-size: var(--wb-text-xs);
}

.mcpCardDeepLink {
  display: inline-flex;
  align-items: center;
  text-decoration: none;
  align-self: flex-start;
}

.mcpCardManual {
  font-size: var(--wb-text-sm);
}

.mcpCardManual summary {
  cursor: pointer;
  color: var(--wb-color-primary-700);
  font-weight: var(--wb-weight-medium);
  padding: var(--wb-space-1) 0;
  user-select: none;
}

.mcpCardManual summary:hover {
  color: var(--wb-color-primary-800);
}

.mcpCardManual > p,
.mcpCardManual > pre {
  margin-top: var(--wb-space-2);
}

.mcpCardCode {
  background: var(--wb-color-neutral-900);
  color: var(--wb-color-neutral-50);
  padding: var(--wb-space-3);
  border-radius: var(--wb-radius-sm);
  font-family: var(--wb-font-mono, monospace);
  font-size: var(--wb-text-xs);
  overflow-x: auto;
  margin: 0;
  white-space: pre-wrap;
  word-break: break-all;
}

.mcpCardPathNote {
  font-size: var(--wb-text-xs);
  color: var(--wb-color-neutral-600);
  margin: 0;
  line-height: var(--wb-leading-relaxed);
}

.mcpCardPathNote code {
  background: var(--wb-color-neutral-100);
  padding: 1px 4px;
  border-radius: 4px;
  font-family: var(--wb-font-mono, monospace);
}
```

Token check: verify `--wb-space-8` exists; if not, the fallback `var(--wb-space-6)` is already in the CSS. Verify `--wb-text-lg`, `--wb-color-primary-{600,700,800}`, `--wb-radius-md` exist in `frontend/src/styles/tokens.css` — substitute the closest existing token if missing and note the substitution.

- [ ] **Step 1.6: Verify**

Vite hot-reloads. Wait 2s, then:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5173/integrations
cd /Users/adrian/GitHub/webbrief/frontend && npm run build 2>&1 | tail -6
```

Expected: 200 + clean build (ignore the pre-existing chunk-size warning).

Manual check (if browser available): the page now shows a "Conexión rápida" header with 3 cards (Claude Desktop / Cursor / VS Code). The old "recomendado" star/Sparkles per-card marker is gone (it lives on the section header now). The Vite proxy still works (the existing OAuth/`apiFetch` paths are untouched).

- [ ] **Step 1.7: Commit**

```bash
cd /Users/adrian/GitHub/webbrief
git add frontend/src/pages/IntegrationsPage.jsx frontend/src/pages/IntegrationsPage.module.css
git commit -m "feat(integrations): unified 'Conexión rápida' top section

Replaces the standalone Claude Desktop 'recomendado' block with a
3-card grid organized by friction (one-click or paste-URL):
  - Claude Desktop: paste URL into Settings -> Connectors
  - Cursor: one-click deep-link button (web wrapper, no protocol
    handler needed)
  - VS Code: one-click deep-link button (vscode:mcp/install)

Each card includes a 'Ver snippet manual' details disclosure for
Cursor/VS Code with per-OS config file paths.

Panel header copy updated to reflect the 5 supported clients.

Task 2 adds the 'Otros clientes' section (Claude Code + Codex CLI).
Token wizard untouched in this commit.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: "Otros clientes" middle section + token-wizard refactor

**Files:**
- Modify: `frontend/src/pages/IntegrationsPage.jsx`

- [ ] **Step 2.1: Add the "Otros clientes" section BELOW the "Conexión rápida" section**

Right after the closing `</div>` of the `.mcpSection` "Conexión rápida" block, and BEFORE the existing `mcpShowAdvanced` toggle divider, insert:

```jsx
            {/* ─── Section 2: Otros clientes ─── */}
            <div className={styles.mcpSection}>
              <div className={styles.mcpSectionHead}>
                <Terminal size={18} aria-hidden="true" className={styles.mcpSectionIcon} />
                <div>
                  <h2 className={styles.mcpSectionTitle}>Otros clientes</h2>
                  <p className={styles.mcpSectionSubtitle}>Para clientes de terminal o que requieren configuración manual.</p>
                </div>
              </div>

              <div className={styles.mcpCardGrid}>

                {/* Claude Code */}
                <div className={styles.mcpCard}>
                  <h3 className={styles.mcpCardTitle}>Claude Code</h3>
                  <p className={styles.mcpCardSubtitle}>CLI oficial de Anthropic</p>
                  <p className={styles.mcpCardHelper}>
                    Ejecuta este comando en tu terminal. Claude Code abrirá el navegador para autorizar la primera vez.
                    No necesitas generar ningún token.
                  </p>
                  <pre className={styles.mcpCardCode}><code>{`claude mcp add --transport http webbrief ${mcpEndpoint}`}</code></pre>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      navigator.clipboard.writeText(`claude mcp add --transport http webbrief ${mcpEndpoint}`).catch(() => {})
                    }}
                    style={{ alignSelf: 'flex-start' }}
                  >
                    <Copy size={14} aria-hidden="true" /> Copiar comando
                  </Button>
                </div>

                {/* Codex CLI */}
                <div className={styles.mcpCard}>
                  <h3 className={styles.mcpCardTitle}>Codex CLI</h3>
                  <p className={styles.mcpCardSubtitle}>CLI de OpenAI</p>
                  <p className={styles.mcpCardHelper}>
                    Agrega este bloque al archivo, luego ejecuta el comando de login en tu terminal.
                    No necesitas generar ningún token.
                  </p>
                  <p className={styles.mcpCardPathNote}>
                    Archivo: <code>~/.codex/config.toml</code>
                  </p>
                  <pre className={styles.mcpCardCode}><code>{`[mcp_servers.webbrief]\nurl = "${mcpEndpoint}"`}</code></pre>
                  <p className={styles.mcpCardPathNote} style={{ marginTop: 'var(--wb-space-2)' }}>
                    Después, en tu terminal:
                  </p>
                  <pre className={styles.mcpCardCode}><code>codex mcp login webbrief</code></pre>
                </div>

              </div>
            </div>

            {/* ─── ChatGPT future note ─── */}
            <p className={styles.mcpChatgptNote}>
              ChatGPT se agregará a "Conexión rápida" cuando OpenAI habilite connectors MCP públicos.
            </p>
```

Add the CSS for the note at the end of `IntegrationsPage.module.css`:

```css
.mcpChatgptNote {
  font-size: var(--wb-text-xs);
  color: var(--wb-color-neutral-500);
  font-style: italic;
  text-align: center;
  margin: var(--wb-space-6) 0 var(--wb-space-4);
}
```

- [ ] **Step 2.2: Refactor the token-wizard toggle label**

Find the existing toggle button that flips `mcpShowAdvanced`. Replace its label text:
- Collapsed: `"Mostrar método con token (para automatización o CI)"`
- Expanded: `"Ocultar método con token"`

- [ ] **Step 2.3: Add the context note inside the expanded wizard**

Inside `{mcpShowAdvanced && ( ... )}`, at the very top (before the existing Step 1 block), insert:

```jsx
              <p className={styles.mcpTokenContext}>
                Solo necesitas un token si tu cliente no soporta OAuth o si quieres conectar desde un script,
                CI o automatización. Para uso interactivo, usa los botones de arriba.
              </p>
```

Add CSS to `IntegrationsPage.module.css`:

```css
.mcpTokenContext {
  font-size: var(--wb-text-sm);
  color: var(--wb-color-neutral-700);
  background: var(--wb-color-warning-50, var(--wb-color-neutral-100));
  border-left: 3px solid var(--wb-color-warning-500, var(--wb-color-primary-500));
  padding: var(--wb-space-3) var(--wb-space-4);
  margin: 0 0 var(--wb-space-5);
  border-radius: 0 var(--wb-radius-sm) var(--wb-radius-sm) 0;
  line-height: var(--wb-leading-relaxed);
}
```

- [ ] **Step 2.4: Drop the Claude Desktop tab from Step 2 of the wizard**

Find `mcpClientOptions` (the array of 3 client option entries: claude-code / codex / claude-desktop). REMOVE the `claude-desktop` entry. Resulting array has 2 entries.

Find the `mcpClient` `useState` initial value — if it's `'claude-desktop'`, change to `'claude-code'`.

Find the `mcpCommand` `useMemo` (it switches on `mcpClient`). It currently has 3 branches. Remove the Claude Desktop branch; if the original code used an unconditional `return [...claude-desktop snippet...]` as the fallback, replace that fallback with the Codex branch's content (so the function always returns valid output). Cleanest pattern:

```js
  const mcpCommand = useMemo(() => {
    if (mcpClient === 'claude-code') {
      return [
        'claude mcp add webbrief \\',
        '  --transport http \\',
        `  --header "Authorization: Bearer ${mcpEffectiveToken}" \\`,
        `  ${mcpEndpoint}`,
      ].join('\n')
    }
    // codex (default)
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
  }, [mcpClient, mcpEndpoint, mcpEffectiveToken])
```

If the existing code already uses neutral Spanish in the Codex comment (e.g. "Agrega" not "Agregá"), preserve that. If not, fix it.

- [ ] **Step 2.5: Update Step 3 header to per-tab text**

Find the Step 3 title (currently `"Pega esto en tu cliente"`). Replace with a per-client conditional:

```jsx
                <h3 className={styles.mcpStepTitle}>
                  {mcpClient === 'claude-code'
                    ? 'Ejecuta este comando en tu terminal'
                    : 'Agrega este bloque a ~/.codex/config.toml'}
                </h3>
```

- [ ] **Step 2.6: Verify**

Vite hot-reloads. Wait 2s:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5173/integrations
cd /Users/adrian/GitHub/webbrief/frontend && npm run build 2>&1 | tail -6
```

Expected: 200 + clean build.

Manual check (if browser available):
- Page top to bottom: "Conexión rápida" (3 cards) → "Otros clientes" (2 cards) → ChatGPT note → toggle "Mostrar método con token (para automatización o CI)" → (when expanded) context warning + 3-step wizard with only 2 client tabs and per-tab Step 3 headers.

- [ ] **Step 2.7: Commit**

```bash
cd /Users/adrian/GitHub/webbrief
git add frontend/src/pages/IntegrationsPage.jsx frontend/src/pages/IntegrationsPage.module.css
git commit -m "feat(integrations): 'Otros clientes' section + token wizard refactor

Adds 'Otros clientes' middle section with Claude Code (one-line CLI
command, OAuth) and Codex CLI (TOML snippet + config path + login
command, OAuth). Both token-less.

Token wizard becomes 'Mostrar método con token (para automatización o CI)':
  - Toggle label updated
  - Warning note at top explaining when a token is needed
  - Claude Desktop tab dropped (its snippet doesn't work — Claude
    Desktop strips HTTP servers from claude_desktop_config.json)
  - Step 3 header now specifies WHERE the snippet goes per client

Adds footnote about ChatGPT future support.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Final verify

- [ ] **Step 3.1: Regression — backend tests still green**

```bash
cd /Users/adrian/GitHub/webbrief/backend && npm test 2>&1 | tail -6
```
Expected: 186 pass, 0 fail.

- [ ] **Step 3.2: OAuth smoke still passes**

```bash
/Users/adrian/GitHub/webbrief/mcp/webrief-server/test/smoke-oauth.sh 2>&1 | tail -4
```
Expected: 9/9 green.

- [ ] **Step 3.3: Frontend builds clean**

```bash
cd /Users/adrian/GitHub/webbrief/frontend && npm run build 2>&1 | tail -6
```
Expected: clean build.

- [ ] **Step 3.4: Commit log**

```bash
cd /Users/adrian/GitHub/webbrief && git log --oneline main..HEAD
```
Expected: 2 commits on `feat/integrations-friction-redesign`.

---

## Manual verification (user after autonomous execution)

1. Open `http://localhost:5173/integrations`.
2. **Top:** "Conexión rápida" section with 3 cards.
   - Claude Desktop card: paste-URL flow.
   - Cursor card: official badge button → opens `cursor.com/en/install-mcp` (or Cursor app if installed).
   - VS Code card: primary button → opens VS Code install dialog (if installed).
3. **Middle:** "Otros clientes" with 2 cards (Claude Code, Codex) — copy commands.
4. **Bottom note:** ChatGPT future note.
5. **Collapsible:** "Mostrar método con token (para automatización o CI)" → warning context → 2-tab wizard (Claude Code, Codex) → Step 3 header per tab.

---

## Self-Review Checklist

- **Spec coverage:** Section 1 (3 cards), Section 2 (2 cards), Section 3 (collapsed wizard with CD tab dropped + relabeled), header copy fix, ChatGPT footnote. ✓
- **No placeholders:** all code blocks complete. ✓
- **Token names:** new memos (`cursorInstallUrl`, `vscodeInstallUrl`) self-contained; new CSS classes uniformly prefixed `mcpCard*` / `mcpSection*` / `mcpChatgpt*` / `mcpToken*`. ✓
- **No backend changes:** ✓ (verified by running backend suite in Task 3).
- **No new clients beyond the 5:** ✓.

---

## Execution

Sonnet 4.6 MAX on both tasks (UI/CSS + 2 trivial URL builders — no security-critical logic). Inline or subagent-driven, fully autonomous. If a step fails: fix source (not spec), re-verify, continue.
