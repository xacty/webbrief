# WeBrief MCP — Handoff post-v1

Updated: 2026-05-27. **MCP v1 está vivo en producción** (`https://webrief.app/api/mcp`). Este documento reemplaza el handoff anterior (que documentaba el sequencing N+1 → N+4 ahora completado).

## Status snapshot

- ✅ Fases 1+2+3 + Fase 4 (HTTP remoto) implementadas y deployadas a Prod.
- ✅ 12 tools, 12 edit operations, transport HTTP via `StreamableHTTPServerTransport`.
- ✅ Comando de instalación final para usuarios:
  ```bash
  claude mcp add webbrief --transport http \
    --header "Authorization: Bearer mcpt_..." https://webrief.app/api/mcp
  ```
- ✅ UI: `/integrations` con wizard 3-steps (token + cliente + comando).
- ✅ Tests: 180 passing (31 fase1 + 60 fase2 + 52 fase3 + 14 fase4 + 23 invariants).
- ✅ Stdio sigue funcionando para dev local.

## Lo que YA está hecho (no rehacer)

Ver `CONTEXT.min.md` Session 21 y `CONTEXT.md` "Completed (2026-05-27)" para el detalle completo. Resumen:

- **Auth bearer token** `mcpt_*` (32 bytes random hex, prefix, hash SHA-256 en DB).
- **HTTP transport** stateless en `/api/mcp` detrás de `requireAuth`. Fresh server + transport por request.
- **Multi-tenant safety**: `Map<token, companyId>` para active company + `AsyncLocalStorage` para context per-request.
- **12 tools** con descripciones en patron `What / When / Side effects / Errors`.
- **Edit ops** discriminated union con 12 variantes + `ensureInvariants` del shared lib + Strategy A (full-page replace contra `PUT /:id/pages`).
- **URL fetcher** SSRF-safe (http/https only, 10s, 2MB, no privates, no redirects).
- **Preview store** in-memory con TTL 10min + GC + cap 256.
- **Frontend** wizard en `/integrations`, sidebar item "Integraciones".
- **Backend `PATCH /projects/:id`** extendido para 5 fields (no solo `name`).
- **Deploy** automatizado en `scripts/deploy.sh` con npm ci en `backend/ + shared/ + mcp/webrief-server/`.

## Decisiones permanentes (no re-debatir sin evidencia nueva)

- **Server NO llama LLMs.** Cliente (Codex/Claude) genera; server orquesta + valida + persiste. Opción B diferida a post-monetización por costo (~$1.5k/mes a escala) + doble inteligencia (cliente LLM ya está pagando por razonar el mismo contenido).
- **Bearer token suficiente** para v1. OAuth (multi-scope, refresh tokens, device flow) diferido hasta que aparezcan necesidades concretas.
- **Strategy A** (full-page replace) locked para v1. Strategy B (PATCH granular server-side) post-v1 incremental, un endpoint por vez.
- **Image upload OUT**, embed by URL OK. El MCP nunca sube assets; el user sube via UI WeBrief y el MCP referencia la URL ImageKit resultante via `insert_image_by_url`.
- **Brief responses apply OUT en v1**. `brief.previewPrefill` es preview-only; el user completa en UI.
- **Stdio se mantiene** como fallback dev. HTTP es el modo de producción.
- **Naming "Integraciones"** sobre "Conexiones" (estándar SaaS, lee mejor en español).
- **SEO metadata keys** = `titleTag/metaDescription/urlSlug` (alineadas al frontend). Si en el futuro el editor agrega `ogImage/keywords/etc`, reincorporar con MISMOS nombres del frontend, NO los "estándar web" — para mantener el JSONB single-sourced.

## Roadmap residual (en orden de ROI estimado)

### 1. `projects.list` — alto ROI
Hoy el LLM no puede responder "¿qué proyectos tengo en empresa X?" sin recibir UUIDs por adelantado. `projects.get` requiere conocer el ID. Una tool `projects.list({ companyId, filters? })` cierra el gap más obvio. ~2 horas con tests.

### 2. Apply de brief responses
`brief.previewPrefill` devuelve preguntas + content para que el cliente proponga respuestas. Falta el step de apply que persista esas respuestas en `project_brief_responses`. Requiere backend endpoint nuevo (no existe hoy) o reusar el editor de brief. ~1 día con auditoría.

### 3. Image upload via MCP
Hoy `insert_image_by_url` solo embebe URLs ya públicas. Para "subí esta imagen al hero", el MCP necesitaría proxy a ImageKit con credenciales del backend. Caso de uso real durante QA con clínica León. ~1-2 días (auth a ImageKit + endpoint backend + tool MCP nueva).

### 4. `comments.*` tools
`comment_threads` (sesión 18) existe en DB con read/write. Útil para "comentale a María que revise esto". ~1 día.

### 5. `pages.reorder` / `pages.duplicate` / `pages.delete`
Hoy no se pueden reordenar/duplicar/eliminar páginas vía MCP, solo editarlas en sitio. Backend ya soporta esas operaciones (`POST /:id/duplicate`, full-replace PUT puede reordenar). ~1 día.

### 6. `deploy.sh` self-update fix (deuda técnica)
Bash carga deploy.sh en memoria al inicio; si `git pull` actualiza el propio script, los pasos nuevos NO corren en ese deploy. Solución: comparar sha256 antes/después del pull y `exec "$0" "$@"` si cambió. Spawn task ya registrada en backlog. ~30 min.

### 7. HTTP transport con OAuth (cuando justifique)
Bearer token alcanza para v1. Si en algún momento aparecen scopes complejos (read-only tokens, tokens limitados a una empresa, expiration corta, revocation propagation), migrar a OAuth con device flow. Diseño existe en spec de Supabase MCP/Anthropic. ~2-3 semanas si se hace bien.

### 8. Search / activity / brief-share (low priority)
Búsqueda full-text de proyectos, activity log via tools, manage brief share links — todos featuras de uso específico. Implementar cuando un user real los pida.

## Cómo verificar que el MCP está vivo

```bash
# Health backend
curl https://webrief.app/api/health
# → {"status":"ok","version":"1.0.0"}

# MCP endpoint discovery (espera POST)
curl https://webrief.app/api/mcp
# → HTTP 405 + JSON-RPC error "MCP endpoint accepts POST only..."

# Tool call con token (reemplazar mcpt_xxx por uno real)
curl -X POST https://webrief.app/api/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer mcpt_xxx" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
# → JSON con 12 tools
```

## Read order al arrancar próxima sesión MCP

1. `AI_GLOBAL.md` (regla de inicio, siempre primero).
2. `CONTEXT.min.md` — especialmente "Session 21" (estado MCP actual).
3. Este archivo (handoff) — confirma decisiones permanentes y roadmap.
4. `docs/WEBRIEF_MCP_PLAN.md` — solo si vas a tocar arquitectura del MCP o agregar tools nuevas.

## Hand-off contract

- Si una decisión en este archivo contradice `WEBRIEF_MCP_PLAN.md`, **gana este archivo** (refleja el estado final post-implementación). Cuando se actualice el plan para reflejar v1 completo, este contrato se invierte: el plan vuelve a ser autoridad.
- El plan original (`WEBRIEF_MCP_PLAN.md`) tenía sequencing N+1 → N+4 con Sonnet/Opus. Ese sequencing está COMPLETADO. Para futuras adiciones (roadmap residual arriba), elegir modelo según complejidad — la mayoría son Sonnet 4.6 high; usar Opus 4.7 high solo si toca invariantes o conflict resolution.
