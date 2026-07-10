# CLAUDE

## Language Rule

- **All Spanish content in this repo (UI copy, emails, comments, docs) must be written in neutral Spanish (español neutro).**
- Do NOT use Argentinian Spanish. Forbidden forms: "hacé", "copiá", "ignorá", "abrí", "podés", "tenés", "creés", "contactá", "pedile", "guardá", "vos".
- Use: "haz", "copia", "ignora", "abre", "puedes", "tienes", "crees", "contacta", "pide", "guarda", "tú".

## Startup Rule

- At the start of each new conversation in this repo, read `/Users/adrian/GitHub/webbrief/AI_GLOBAL.md` first.
- Then read `/Users/adrian/GitHub/webbrief/CONTEXT.min.md`.
- Read `/Users/adrian/GitHub/webbrief/CONTEXT.md` only if more detail is needed for the task.
- **Before touching any `frontend/src/` file that produces a visible surface**, also read `/Users/adrian/GitHub/webbrief/DESIGN-SYSTEM.md` — single source of truth for tokens, UI patterns, anti-patterns, and component inventory.
- Do this before answering the user's first substantive request.

## Read Order

- Read `/Users/adrian/GitHub/webbrief/AI_GLOBAL.md` first.
- Read `/Users/adrian/GitHub/webbrief/CONTEXT.min.md` second.
- Read `/Users/adrian/GitHub/webbrief/CONTEXT.md` only if more detail is needed.
- Read `/Users/adrian/GitHub/webbrief/DESIGN-SYSTEM.md` before any UI work.
- If the user explicitly asks to review/read `CONTEXT.md`, treat it as authoritative expanded context.

## Shared Repo Rule

- Use `AI_GLOBAL.md` as the cross-model workflow contract for this repo.
- Do not diverge from the terminology or workflow in the context files unless the user explicitly asks.

## Dev Testing Account

- Cuando necesites autenticarte en WeBrief para probar un flujo (login, editor, comments, share, admin, etc.), usa la cuenta bot `claude-bot@test.local` en el entorno **Dev** (proyecto Supabase `iimqxacagxuemwgaunis`). Nunca uses esa cuenta ni ninguna otra en Prod.
- La contraseña vive en `.claude/secrets/dev-credentials.env` como `CLAUDE_BOT_EMAIL` y `CLAUDE_BOT_PASSWORD`. El directorio `.claude/secrets/` está en `.gitignore` — no lo commitees ni pegues su contenido en respuestas, PRs, o memoria persistente.
- Al leer el archivo, respeta el formato con comillas simples (`KEY='value'`) para evitar shell-expansion de caracteres como `$`.
- Ver `docs/WEBRIEF_DEV_CREDENTIALS.md` para detalle de la cuenta, reglas de manejo y procedimiento de reset.
- Si Supabase Dev está pausado (free-tier se pausa tras ~1 semana sin uso), pide restaurarlo antes de intentar el login.
- No uses la cuenta personal del owner para pruebas.

## Time Estimates Rule

**Distinction: agent-execution time ≠ human-engineer time.**

A junior human engineer writing 400 lines of React + CSS may take 3 hours. An LLM agent executing the same task with tool access types at machine speed and finishes in ~5 minutes. These are NOT the same unit. Treat them as different scales.

**Mandatory rules when estimating for the user:**

- **Always estimate in agent-execution time.** Default unit: **minutes**. Use "~5 min", "~15 min", "~30 min".
- **Never use hours** unless the work genuinely waits on external systems (CI runs, prod deploys, real-world QA, third-party API throttles). In that case, name the wait explicitly: "~3 min agent work + wait ~10 min for CI".
- **Never quote a human-engineer estimate.** If your gut estimate is "3 hours of dev work", divide by ~30× and quote in minutes — that is the actual agent execution time for the same scope.
- **Per-phase + total format:** when work has phases, give per-phase estimate AND a total. Example:
  > F1 (~5 min), F2 (~3 min), F3 (~10 min). Total: ~18 min.
- **Human wait time is separate.** If the user has to review, decide, test in the browser, or do anything themselves, call it out: "wait on user — not part of agent estimate".
- This rule applies to ALL future estimates in this repo — plans, proposals, "how long would X take", everything. Never revert to human-engineer hours.
