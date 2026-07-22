# AGENTS

## Language Rule

- **All Spanish content in this repo (UI copy, emails, comments, docs) must be written in neutral Spanish (español neutro).**
- Do NOT use Argentinian Spanish. Forbidden forms: "hacé", "copiá", "ignorá", "abrí", "podés", "tenés", "creés", "contactá", "pedile", "guardá", "vos".
- Use: "haz", "copia", "ignora", "abre", "puedes", "tienes", "crees", "contacta", "pide", "guarda", "tú".

## Startup Rule

- At the start of each new conversation in this repo, read `/Users/adrian/GitHub/webbrief/AI_GLOBAL.md` first.
- Then read `/Users/adrian/GitHub/webbrief/CONTEXT.min.md`.
- Read `/Users/adrian/GitHub/webbrief/CONTEXT.md` only if more detail is needed for the task.
- Do this before answering the user's first substantive request.

## Context Loading

- Read `/Users/adrian/GitHub/webbrief/AI_GLOBAL.md` first.
- Read `/Users/adrian/GitHub/webbrief/CONTEXT.min.md` second.
- Read `/Users/adrian/GitHub/webbrief/CONTEXT.md` only if more detail is needed.
- If the user explicitly asks to read or review `CONTEXT.md`, treat it as authoritative expanded context.

## Conversation Hygiene

- Monitor conversation length heuristically.
- Do not claim to know an exact token limit or exact moment when summarization will begin.
- If the thread has become long, context-heavy, or accumulated multiple rounds of debugging/implementation, warn the user before response quality is likely to degrade.
- Use this warning proactively once the conversation is clearly getting heavy, even if the user did not ask.
- Keep the warning short and practical.

### Recommended Warning

- `La conversación ya está quedando larga y pronto podría empezar a resumirse. Conviene abrir un chat nuevo y actualizar CONTEXT.md y CONTEXT.min.md.`

## Compact Mode

- Default to compact mode in this repo.
- Unless the user explicitly asks for explanation, reasoning, alternatives, or a walkthrough, answer with only the direct requested information or action.
- Keep explanations short unless the user asks for deeper reasoning, alternatives, or a walkthrough.
- Prefer implementation plus concise outcome over long plans or detailed narration.
- Keep intermediary updates brief and only send them when they add useful progress, risk, or blocker context.
- Final answers should usually mention only what changed, validation status, and any real blocker or follow-up.

## Token Economy

- Prefer targeted inspection over broad file reads. Use `rg` first, then read only the smallest relevant ranges with `sed`.
- Do not paste full files or large unchanged code blocks in responses. Summarize changes and reference file paths instead.
- When explaining code changes, describe only the modified behavior and key files. Avoid file-by-file changelogs unless requested.
- Use incremental patches for edits. Do not rewrite functions or components unless the change requires it.
- Before large implementation work, state the intended files or areas briefly. Do not wait for confirmation unless the request is ambiguous or risky.
- For validation output, summarize pass/fail and only include relevant errors.

## Context Maintenance

- When a task materially changes behavior, architecture, invariants, or workflow, suggest updating `CONTEXT.md` and `CONTEXT.min.md`.
- Prefer concise context updates optimized for AI consumption over human-oriented prose.

## Definition Of Done

- A task is not done until the requested change is implemented, nearby invariants are preserved, and the most relevant local validation has been run when feasible.
- If validation cannot be run, state that clearly.
- If behavior, workflow, or invariants changed, suggest updating `CONTEXT.md` and `CONTEXT.min.md`.

## Validation Commands

- Frontend primary validation: `cd /Users/adrian/GitHub/webbrief/frontend && npm run build`
- Backend validation: run the most relevant local check available for the changed backend code.
- Prefer the smallest meaningful validation for the area touched before expanding scope.

## Change Scope

- Make the smallest change that solves the requested problem.
- Do not refactor adjacent systems or alter stable behavior unless the user explicitly asks.
- If a broader refactor seems beneficial, mention it separately instead of bundling it into the requested change.

## Design / UX Research

- Before redesigning an existing section or designing a new user-facing surface, first research relevant UX/UI rules, patterns, and accessibility guidance.
- Briefly state the pattern decision before implementation and cite sources when internet research was used.

## Versioning Rule

- **Single source of truth for the user-facing version: `frontend/package.json` → `version`.** Displayed in the UI as `v{__APP_VERSION__}` (see `frontend/src/components/layout/AppShell.jsx` and `frontend/vite.config.js`). The `backend`, `mcp/webrief-server` and `shared` packages carry independent internal versions and must not be confused with the public one.
- **Strict SemVer: `MAJOR.MINOR.PATCH`.** Bump is mandatory in the same commit (or immediately preceding commit) as any change that will be deployed:
  - **MAJOR** — breaking changes for end users or external integrations (MCP surface, public API, non-backward-compat data schema), or a full visual redesign equivalent to the v1→v2 jump.
  - **MINOR** — new user-visible feature, new MCP tool, new page/section, new endpoint, non-trivial UX change. Backward-compatible.
  - **PATCH** — bugfixes, copy tweaks, style adjustments, internal refactors, perf improvements, hotfixes without observable behavior change.
- **Bump rules:**
  - Never produce a deployable commit (that lands on `main` or ships to the VPS) without the appropriate version bump. When in doubt between MINOR and PATCH, pick the higher tier.
  - One bump per PR/feature; do not stack multiple changes under an already-deployed version.
  - The bump lives in `frontend/package.json` (and its `package-lock.json`, via `npm version` or manual edit + reinstall).
  - Bump commit message: `chore(release): vX.Y.Z`, or fold it into the feature commit with an appropriate prefix.
- **Before proposing a commit/PR/deploy**, evaluate the change type and tell the user the proposed bump (`patch`/`minor`/`major`) with a one-line rationale. If the user approves the change, apply the bump as part of the same work — do not defer it.
- **Do not bump** for changes that never leave the local repo: internal docs, `.planning/`, memory, worktrees, unmerged experiments.

## Dev Testing Account

- Cuando necesites autenticarte en WeBrief para probar un flujo (login, editor, comments, share, admin, etc.), usa la cuenta bot `claude-bot@test.local` en el entorno **Dev** (proyecto Supabase `iimqxacagxuemwgaunis`). Nunca uses esa cuenta ni ninguna otra en Prod.
- La contraseña vive en `.claude/secrets/dev-credentials.env` como `CLAUDE_BOT_EMAIL` y `CLAUDE_BOT_PASSWORD`. El directorio `.claude/secrets/` está en `.gitignore` — no lo commitees ni pegues su contenido en respuestas, PRs, o memoria persistente.
- Al leer el archivo, respeta el formato con comillas simples (`KEY='value'`) para evitar shell-expansion de caracteres como `$`.
- Ver `docs/WEBRIEF_DEV_CREDENTIALS.md` para detalle de la cuenta, reglas de manejo y procedimiento de reset.
- Si Supabase Dev está pausado (free-tier se pausa tras ~1 semana sin uso), pide restaurarlo antes de intentar el login.
- No uses la cuenta personal del owner para pruebas.

## Clarification Rule

- If the user request is materially ambiguous, under-specified, or open to multiple reasonable implementations, ask a short clarifying question before making changes.
- Prefer safe assumptions only when ambiguity is minor and unlikely to affect the outcome.
- If the wrong interpretation could waste work, change behavior, or touch the wrong area, ask first.
- Keep clarification questions brief and practical.
