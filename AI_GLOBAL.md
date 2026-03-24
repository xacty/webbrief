# AI Global Contract

- Purpose: shared repo-level rules for any AI working here.
- Priority:
  1. read this file first
  2. read `CONTEXT.min.md`
  3. read `CONTEXT.md` only if more detail is needed
  4. read tool-specific bridge files such as `AGENTS.md` or `CLAUDE.md` if present

## Shared Workflow

- Prefer the repo context files over guessing from partial chat history.
- Treat `CONTEXT.min.md` as the fast path and `CONTEXT.md` as expanded context.
- If user explicitly asks to review/read `CONTEXT.md`, treat it as authoritative expanded context.
- When behavior, invariants, architecture, or workflow changes materially, suggest updating the context files.
- Keep context files optimized for AI consumption: compact, explicit, low prose.

## Conversation Hygiene

- Monitor thread length heuristically.
- Do not claim exact token counts or exact summarization thresholds.
- If the thread becomes long, context-heavy, or accumulates multiple implementation/debugging loops, warn before quality is likely to degrade.
- Keep the warning short, practical, and proactive.
- Recommended warning:
  - `La conversación ya está quedando larga y pronto podría empezar a resumirse. Conviene abrir un chat nuevo y actualizar CONTEXT.md y CONTEXT.min.md.`

## Stability Bias

- Do not change stable behavior unless user explicitly requests it.
- Before editing, identify nearby invariants from context files and preserve them.
- Prefer minimal, targeted changes over broad rewrites.

## Cross-Model Consistency

- If a tool-specific instruction conflicts with this file, follow the more specific repo instruction only if it does not contradict the user request.
- Keep terminology aligned with existing tags in `CONTEXT.min.md` / `CONTEXT.md`.
