# WeBrief MCP — Next Session Handoff

Updated: 2026-05-19. Last edit: sesion N+1 extendida — Prep A + N+2 (Prep B + Fase 0) completados, Prod migration aplicada.

## Status snapshot

- Plan MCP revisado y mejorado: `docs/WEBRIEF_MCP_PLAN.md` (12 mejoras aplicadas, Strategy A locked).
- Dev Supabase project listo: `iimqxacagxuemwgaunis` (us-west-1). Local `backend/.env` y `frontend/.env` apuntan aca.
- Prod Supabase intacto: `gmrlhhszrdahcxyoywvt` (us-west-2). VPS pulled latest y reiniciado.
- Backend tiene env vars nuevas en codigo y prod (`IMAGEKIT_FOLDER_PREFIX`, `EMAIL_ENABLED`), backward compatible.
- MCP server scaffold: ✅ existe en `mcp/webrief-server/` con 10 tools no-op (Fase 0).

### Prep A — COMPLETADO (sesion N+1, 2026-05-19)

- Migration `supabase/migrations/20260519_mcp_tokens.sql` en `main`. **Aplicada a Dev. Pendiente aplicar a Prod antes de deploy.**
- `backend/src/routes/mcpTokens.js`: GET/POST/DELETE `/api/auth/mcp-tokens`, cap 10 tokens activos, rate-limited.
- `backend/src/middleware/auth.js`: fast-path `mcpt_*` via SHA-256 hash, audit `mcp_token_used` non-blocking.
- `backend/src/index.js`: mcpTokensRoutes montado en `/api/auth`.
- `frontend/src/pages/AccountSettingsPage.jsx`: seccion "Tokens MCP" con create/list/revoke y reveal-once banner.
- Commits `6e15e67..9f4b13b` en `main`. Todos los tests de subagentes pasaron.
- Smoke test 7/7 pasos + audit 4/4 events verificados (curl + SQL).
- ✅ Migration aplicada a Prod (`mcp_tokens` table existe en `gmrlhhszrdahcxyoywvt`).
- **Accion antes de deploy a VPS**: `git pull` + `pm2 restart webrief-backend`.

### N+2 — COMPLETADO (sesion N+1 extendida, 2026-05-19)

**Fase 0** (Sonnet 4.6 high, commit `2c6f905`):
- `mcp/webrief-server/` scaffold completo: 24 archivos.
- `@modelcontextprotocol/sdk ^1.29.0` + `zod ^3.23.0`. SDK usa `McpServer.registerTool()`.
- 10 tools registradas como no-ops: `session.getContext`, `companies.selectActive`, `projects.previewCreateFromContent`, `projects.createFromPreview`, `brief.previewPrefill`, `pages.previewDraft`, `projects.get`, `pages.get`, `pages.previewEdits`, `pages.applyEdits`.
- Stubs: `src/auth/mcpToken.js` (lee `WEBRIEF_MCP_TOKEN` env), `src/lib/webbriefClient.js` (`get/post/patch`, sin `delete`).
- `node src/index.js < /dev/null` arranca clean.
- **Notas para N+3** (cuando se implementen los handlers):
  - `getMcpToken()` actualmente throws hard; wrap en try/catch en handlers para devolver MCP error estructurado.
  - `webbriefClient.js` no tiene `delete` — agregar si algún tool lo necesita.
  - `pages.applyEdits.edits[]` es `z.array(z.unknown())` con TODO; el shape granular se define en Fase 3 (N+4).

**Prep B** (Opus 4.7 high, commits `0617e16` + `3bb5e4c`):
- `shared/documentInvariants.js`: pure ESM, API `ensureInvariants(contentJson, projectType) → { contentJson, contentHtml, repairs[] }`.
- `shared/package.json` declara deps Tiptap (`@tiptap/html`, `@tiptap/core`, `@tiptap/starter-kit`, `@tiptap/extension-*`). MCP server también las lista para resolver shared/.
- 23/23 tests passing (`cd shared && npm test`). Cubre: section repairs, FAQ Q/A, CTA, image attrs roundtrip, textBlockLayout, comment resolved, idempotency, no-mutation.
- Code review Opus pass 1: encontró 4 silent-corruption bugs (FAQ non-idempotency, image attrs drift, textBlockLayout missing, comment.resolved drift).
- Pass 2 (`3bb5e4c`) los corrigió mirroring extensiones frontend completas. Review pass 3 confirmó Yes-to-merge.
- **Constraint clave**: `projectType='brief'` rechazado (las respuestas de brief van por otro endpoint, no por MCP edits).

## Read order al arrancar la proxima sesion

1. `AI_GLOBAL.md` (rule de inicio, siempre primero).
2. `CONTEXT.min.md` — especialmente "Session 12" que documenta Dev/Prod separation.
3. Este archivo (handoff).
4. `docs/WEBRIEF_MCP_PLAN.md` — plan completo, leer las secciones nuevas (`Politica De Fetch De URLs`, `Autenticacion MCP Local`, notas de Tools V1, Estrategia A locked).

## Decisiones locked (no re-debatir)

- **Strategy A** para v1: el MCP computa `content_json` completo localmente y reenvia la pagina entera por `PUT /api/projects/:id/pages`. Strategy B (PATCH granular) diferida a post-v1.
- **v1 transport**: stdio para Codex y Claude. **v2**: HTTP/SSE diferida.
- **Auth**: `mcp_token` de larga duracion emitido desde UI de Settings. NO se usa bearer Supabase directo (TTL de 1h no sirve).
- **MCP server NO llama LLMs**. La generacion la hace el cliente (Codex/Claude). Servidor solo expone tools y aplica mutaciones validadas.
- **Tools naming**: `pages.*` (no `documents.*`). Colisiona con `project_type='document'` (Articulo).
- **Mutaciones requieren `companyId` explicito**. `companies.selectActive` solo provee default por sesion.
- **Conflicto de version**: backend devuelve `409 { code: 'version_conflict', currentVersion, currentSnapshot }` para que el cliente pueda replanear.
- **Invariantes del documento** se enforzan via `shared/documentInvariants.js` (a crear), portados desde frontend TipTap.

## Sequencing recomendado

**Modelo por defecto**: Sonnet 4.6 reasoning `high` (minimo). Cambiar a Opus 4.7 reasoning `high` SOLO en Prep B (invariants) y Fase 3 (edit). Ver `WEBRIEF_MCP_PLAN.md` seccion "Modelo Recomendado" para tabla completa.

### ~~Session N+1 — Prep A~~ — COMPLETADO (2026-05-19) ✓

### ~~Session N+2 — Prep B + Fase 0~~ — COMPLETADO (2026-05-19) ✓

### Session N+3 — Fases 1 + 2 (read + create) — ~120-180k — **Sonnet 4.6 high**
- **Fase 1**: implementar `session.getContext`, `companies.selectActive`, `projects.get`, `pages.get`. Solo reads. Forward bearer MCP token al backend en cada request.
- **Fase 2**: implementar `projects.previewCreateFromContent`, `projects.createFromPreview`, `brief.previewPrefill`, `pages.previewDraft`. Incluye URL fetching server-side respetando la `Politica De Fetch De URLs` del plan.

### Session N+4 — Fase 3 (edit, mas denso) — ~100-150k — **Opus 4.7 high**
- `pages.previewEdits` y `pages.applyEdits`. Usar Prep B lib para validar invariantes antes de mandar al backend. Manejar `expectedVersion` + conflict response con snapshot.
- Operaciones cubiertas: cambiar titulo, cambiar varios titulos, reemplazar parrafo, insertar seccion, eliminar seccion, renombrar pagina, reemplazos masivos, FAQ Q/A.
- Opus por: combinatoria invariantes × operaciones × estados de conflict version. Es el espacio de estados mas grande de v1.

### Fase 4 (Remote V2) — diferida fuera de v1
HTTP/SSE detras de Nginx en VPS. Mismo modelo de identidad y permisos.

## Scaffolding sugerido para Fase 0

```
mcp/webrief-server/
├── AGENTS.md             # bridge a AI_GLOBAL.md
├── CLAUDE.md             # bridge a AI_GLOBAL.md
├── README.md             # como correrlo local, como agregar a Codex/Claude
├── package.json          # type: module, deps: @modelcontextprotocol/sdk, zod
└── src/
    ├── index.js          # stdio transport setup + tool registry
    ├── tools/            # un archivo por tool, exporta { name, schema, handler }
    ├── schemas/          # zod schemas compartidos (project, page, company)
    ├── auth/             # validar mcp_token contra backend
    └── lib/
        └── webbriefClient.js  # http client a webbrief backend, forward auth header
```

## Verificacion antes de cada sesion

```bash
# MCP de Supabase
mcp__supabaseDev__check_connection   # db.ok=true, api.ok=true
mcp__supabaseProd__check_connection  # db.ok=true, api.ok=true

# Backend + frontend local
cd ~/GitHub/webbrief/backend && npm run dev   # apunta a Dev
cd ~/GitHub/webbrief/frontend && npm run dev  # apunta a Dev, login admin@webrief.app
```

## TODOs derivados (de baja prioridad, anotados en CONTEXT.min.md Session 12)

- Fix `schema.sql`: la FK inline `companies.created_for_testing_by -> public.profiles(id)` rompe en DB fresh porque `profiles` se crea despues de `companies`. Workaround usado en Dev; arreglar reordenando o quitando la FK inline.
- Verificar drift: Prod `project_page_change_proposals` — `schema.sql` la declara pero `list_tables` no la muestra. Confirmar con SQL directo si Prod la perdio o nunca existio.
- Future migration Strategy A → B (post-v1).

## Tokens estimados v1 completo

~380-580k tokens en total (Prep A + Prep B + Fase 0 + Fase 1 + Fase 2 + Fase 3). En contexto 1M Claude cabe holgado con compaction probable. En sesiones nativas de 200k, son ~2-3 sesiones nuevas (4 si se separa Fase 3 que es la mas densa).

## Hand-off contract

La proxima sesion empieza fresh sin tener que releer el chat anterior. Todo lo que importa esta en este archivo + `WEBRIEF_MCP_PLAN.md` + `CONTEXT.min.md` Session 12. Si alguna decision aca contradice lo que dice el plan, el plan gana (es la fuente de verdad). Si el plan es ambiguo, este handoff aclara intencion.
