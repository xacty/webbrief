# CLAUDE

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
