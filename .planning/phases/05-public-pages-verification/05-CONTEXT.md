# Phase 5: Public Pages & Verification - Context

**Gathered:** 2026-05-08
**Status:** Ready for planning (después de Phase 4 complete)
**Mode:** Auto-generated (skip_discuss=true; decisiones en `.planning/intel/decisions.md`)

<domain>
## Phase Boundary

**Dos partes:**

1. **Migración de páginas públicas** al sistema unificado:
   - `pages/SharePage.jsx` + `.module.css` — vista pública del documento con email gate, comments, approvals/change requests, print/PDF
   - `pages/BriefPage.jsx` + `.module.css` — vista pública del brief

2. **Verificación final del milestone v1.0**:
   - Audit retroactivo `gsd-ui-review` sobre TODAS las áreas migradas
   - Score Refactoring UI promedio ≥ 8.5/10 sobre los 7 principios
   - Golden paths verificados con `preview_*` tools
   - SUMMARY de Phase 5 documenta antes/después con screenshots
   - Cero regresiones funcionales (UI-10)

</domain>

<decisions>
## Implementation Decisions

Pre-locked en `.planning/intel/decisions.md`. Específicos para esta phase:

- **Public pages**: SharePage y BriefPage son vistas que ven personas externas (clientes), no autenticados. Mantener el look limpio actual; cero overengineering. Solo migrar a tokens y shared components.
- **Empty states sistemáticos**: las public pages a veces muestran "No hay comentarios", "No hay deliverables", etc. Tratarlos con un componente `<EmptyState>` opcional (icon + title + subtitle + CTA) si la duplicación lo justifica, sino con tokens.
- **Print/PDF**: SharePage soporta print-to-PDF. Verificar que el CSS migrado preserva `@media print` styles. Hardcoded valores ahí pueden quedar (print no consume tokens runtime).
- **Audit final**: dispatch `gsd-ui-review` como subagente que produce `UI-REVIEW.md` con score por principio. Es **advisory**, no blocking — pero si score < 8.5/10 promedio, el SUMMARY de Phase 5 debe declarar gaps y proponer remediación (sin ejecutarla — sería out-of-scope del milestone).

</decisions>

<code_context>
## Existing Code Insights

**SharePage** (CONTEXT.min.md):
- Public token route con email gate antes de renderizar
- Comments públicos (sin Supabase Auth — viewer name/email)
- Approvals + change requests
- Print/PDF support
- Bounded a 50 pages (rate limit del backend)

**BriefPage** (CONTEXT.min.md):
- Vista pública del brief (vs share que es del documento)
- Bounded a 80 questions
- `Cache-Control: no-store`, `X-Robots-Tag: noindex` (headers backend)

**Header/security visible**:
- `X-Request-Id` correlación
- Rate limit progresivo
- Validación de token antes de cualquier render

**Stack pista**:
- Las public pages NO usan AppShell (que es admin layout). Tienen su propio layout limpio.
- Carga lazy igual que el resto.

**Out of scope explícito** para Phase 5:
- Rediseño UX/flows
- Refactor del backend
- Cambios al rate limiting o anti-scraping headers
- Embeds custom (iframe support, etc.)

</code_context>

<specifics>
## Specific Ideas

1. **Audit retroactivo `gsd-ui-review`**:
   - Dispatch como subagente (background) con todos los archivos migrados
   - Espera `UI-REVIEW.md` con score por principio (1-7) y findings
   - Si score < 8.5: documentar gaps en SUMMARY de Phase 5 + crear todos en `.planning/todos/pending/` para remediación futura

2. **Golden paths a verificar con `preview_*` tools** (UI-10):
   - **Path A**: Login → Companies → Open project → Editor (Brief) → Switch a Handoff → Switch a Preview → exit
   - **Path B**: Companies → Crear empresa (modal) → Confirmar → ver en lista
   - **Path C**: Editor → Crear comentario → Replicar → Resolver
   - **Path D**: Editor → Crear share link → Abrir en incógnito (simulado) → Email gate → Ver brief público
   - **Path E**: Users → Invitar usuario → Editar perfil → Cambiar rol
   - **Path F**: Archive → Restaurar → Trash → Restaurar / Eliminar permanente

3. **Documentar antes/después** (UI-09 evidencia):
   - `preview_screenshot` de cada área principal (admin home, editor, share) en estado inicial (Phase 0) — IMPOSIBLE retroactivamente, así que solo después
   - Screenshots después en `.planning/phases/05-public-pages-verification/screenshots/`
   - Tabla de score Refactoring UI con before / after

4. **Plan tasks sugeridos** (orientativo):
   - Task 1: Migrar SharePage a tokens + shared components
   - Task 2: Migrar BriefPage a tokens + shared components
   - Task 3: Crear `<EmptyState>` shared si se justifica + aplicar en lugares relevantes
   - Task 4: Dispatch `gsd-ui-review` (audit retroactivo); leer score
   - Task 5: Ejecutar golden paths con preview tools; documentar en SUMMARY
   - Task 6: Si gaps, crear todos para remediación futura; documentar antes/después con screenshots

</specifics>

<deferred>
## Deferred Ideas

- **Optimización de bundle** del frontend (tree-shake, lazy-load aún más): defer a milestone aparte.
- **Mejorar flujo del email gate** en SharePage: defer.
- **PWA / installable**: out of scope total.
- **Tests E2E con Playwright**: defer a milestone de testing.
</deferred>
