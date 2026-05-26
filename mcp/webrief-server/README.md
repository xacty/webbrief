# WeBrief MCP Server

Local stdio MCP server for [WeBrief](https://github.com/your-org/webbrief). Lets Codex, Claude Code, and other MCP-capable clients manage WeBrief projects on behalf of a user.

**Status:** Fase 0 scaffold — all 10 tools are registered with correct schemas, but handlers return `{ status: "not_implemented_yet" }`. Real logic lands in sessions N+3 and N+4.

## Architecture

The MCP server is a thin orchestration layer. It does NOT call LLMs. It:
1. Accepts tool calls from the AI client (Codex / Claude Code)
2. Validates inputs with zod
3. Forwards authenticated requests to the WeBrief backend (`Authorization: Bearer mcpt_...`)
4. Returns results to the client

Authentication uses long-lived `mcpt_*` tokens issued by the WeBrief backend.

## Install

```bash
cd mcp/webrief-server
npm install
```

Node >= 20 required.

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `WEBRIEF_MCP_TOKEN` | Yes | — | Your `mcpt_*` token from WeBrief settings |
| `WEBRIEF_BACKEND_URL` | No | `http://localhost:3000` | WeBrief backend base URL |

## Run Locally

```bash
export WEBRIEF_MCP_TOKEN=mcpt_your_token_here
export WEBRIEF_BACKEND_URL=http://localhost:3000   # or your prod URL
npm start
```

The server communicates over stdio. You won't see output in the terminal — connect it via an MCP client.

For development with auto-restart:

```bash
npm run dev
```

## Add to Claude Code

```bash
claude mcp add webbrief -- node /absolute/path/to/mcp/webrief-server/src/index.js
```

Then set the env var in the MCP config or export it before running Claude Code:

```bash
export WEBRIEF_MCP_TOKEN=mcpt_your_token_here
claude
```

Alternatively, add it to your project's `.claude/mcp.json`:

```json
{
  "mcpServers": {
    "webbrief": {
      "command": "node",
      "args": ["/absolute/path/to/mcp/webrief-server/src/index.js"],
      "env": {
        "WEBRIEF_MCP_TOKEN": "mcpt_your_token_here",
        "WEBRIEF_BACKEND_URL": "http://localhost:3000"
      }
    }
  }
}
```

## Add to Codex

In `~/.codex/config.toml` (or your project-level `codex.toml`), add an MCP server entry:

```toml
[mcp_servers.webbrief]
command = "node"
args = ["/absolute/path/to/mcp/webrief-server/src/index.js"]

[mcp_servers.webbrief.env]
WEBRIEF_MCP_TOKEN = "mcpt_your_token_here"
WEBRIEF_BACKEND_URL = "http://localhost:3000"
```

## Available Tools (v1)

| Tool | Description |
|---|---|
| `session.getContext` | Returns authenticated user, default company, all companies |
| `companies.selectActive` | Sets the active company for this session |
| `projects.previewCreateFromContent` | Analyzes content and previews the project that would be created |
| `projects.createFromPreview` | Commits a previously previewed project |
| `brief.previewPrefill` | Previews auto-filling a project brief from raw content |
| `pages.previewDraft` | Generates a page draft from raw content (not persisted) |
| `projects.get` | Fetches project metadata + page list |
| `pages.get` | Fetches full page content + version |
| `pages.previewEdits` | Applies edits in-memory and returns a diff preview |
| `pages.applyEdits` | Applies and persists edits with optimistic concurrency |

## Roadmap

- **Fase 1 (N+3):** Implement `session.getContext`, `companies.selectActive`, `projects.get`, `pages.get`
- **Fase 2 (N+4):** Implement create, edit, and preview tools; define the `edits[]` operation schema
- **v2 (future):** HTTP/SSE transport for multi-client and remote use cases
