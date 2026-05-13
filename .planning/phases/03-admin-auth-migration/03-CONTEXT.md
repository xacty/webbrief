# Phase 3: Admin & Auth Migration - Context

**Gathered:** 2026-05-08
**Status:** Ready for planning (después de Phase 2 complete)
**Mode:** Auto-generated (skip_discuss=true; decisiones en `.planning/intel/decisions.md`)

<domain>
## Phase Boundary

Migrar páginas admin y auth para que consuman:
1. Tokens del Phase 1 (cero hardcoded colors / spacing / radius / z-index)
2. Componentes compartidos del Phase 2 (Button, Input, Select, Modal, Card, Badge)

Eliminar duplicación: estilos locales `.modalOverlay`, `.modalCard`, `.input`, `.primaryButton`, `.secondaryButton`, `.dangerButton` definidos en archivos .module.css de cada página → reemplazar por imports y consumo de los componentes UI.

**Páginas en alcance:**

Admin:
- `pages/CompaniesPage.jsx` + `.module.css` (495 líneas CSS)
- `pages/CompanyPage.jsx` + `.module.css`
- `pages/UsersPage.jsx` + `.module.css`
- `pages/TrashPage.jsx` + `.module.css` (cubre archive y trash modes)
- `pages/SecurityPage.jsx` + `.module.css`
- `pages/NewProject.jsx` + `.module.css`
- `pages/AccountSettingsPage.jsx` + `.module.css`

Auth:
- `pages/Login.jsx` + `pages/AuthPage.module.css` (compartido)
- `pages/SetPassword.jsx` (usa AuthPage.module.css)

Shell:
- `components/layout/AppShell.jsx` + `.module.css` — actualizar tokens (sidebar, layout)

</domain>

<decisions>
## Implementation Decisions

Pre-locked en `.planning/intel/decisions.md`. Específicos para esta phase:

- **Migración por archivo, no big bang**: cada página migra independientemente, commit atómico por página. Si una rompe, las otras siguen funcionando.
- **Preservar comportamiento exacto**: cero cambios funcionales (no se mueven elementos, no se renombran labels, no se cambian flujos). Solo CSS y consumo de componentes.
- **Modales**: TODOS los `.modalOverlay` + `.modalCard` locales se reemplazan por `<Modal>` shared. Z-index unificado a `var(--wb-z-modal)`.
- **Inputs**: `<input className={styles.input}>` se reemplaza por `<Input>`. Si la página tiene casos edge (autocomplete, masks), preservarlos como props.
- **Botones**: `<button className={styles.primary}>` → `<Button variant="primary">`. Misma para secondary, danger, ghost.
- **Tokens**: cualquier valor hardcoded encontrado (`color: #...`, `padding: 16px`, `border-radius: 8px`) reemplazar por `var(--wb-...)` correspondiente del sistema Phase 1.
- **AppShell**: sidebar 248px se mantiene; reescribir con tokens. Spacing interno usa `--wb-space-*`.

**Out of scope explícito** para Phase 3 (defer a Phase 4):
- Editor (`pages/ProjectEditor.jsx` y los 4 .module.css del editor)
- Páginas públicas (`SharePage`, `BriefPage`)

</decisions>

<code_context>
## Existing Code Insights

**Hot spots de duplicación** (audit baseline):
- `CompaniesPage.module.css` y `ProjectEditor.module.css` ambos definen `.modalOverlay` y `.modalCard` con z-index distintos (1000 vs 200) y rgba distintos para el overlay. Unificar.
- `AuthPage.module.css` y `CompaniesPage.module.css` definen `.input` con paddings y borders distintos. Unificar via `<Input>`.
- Botones primary están en 5+ archivos con colors levemente distintos (algunos `#091223`, otros `#0f172a`). Token-izados en Phase 1, consumidos via `<Button>`.

**Invariantes a preservar (de CONTEXT.min.md `## Keep Stable`):**
- `target=companies`: searchable/paginable home, sidebar shell, company counts, primary `Abrir` CTA per card, compact lifecycle icon actions, explicit test-company mode for admin
- `target=company-detail`: company page sin tabs, project cards left, team sidecard right
- `target=users`: admin global visibility de profiles + platform roles; manager scope a active companies; archived/trashed hidden
- `target=trash`: solo `trashed_at` rows; `target=archive`: solo `archived_at not null AND trashed_at is null`
- `target=security`: admin-only; block modal requires reason; no expone tokens/payloads
- `target=login`: Supabase session flow

**Routes** (de CONTEXT.min.md):
- `login`, `companies`, `companies/:companyId`, `users`, `archive`, `trash`, `new-project`, `share/:token`, `/security`, `auth/set-password`

**Stack pista:**
- Lazy loading: páginas son lazy-loaded vía React.lazy (no romper)
- sessionStorage cache para companies / company detail (preservar)
- Memoization en UsersPage para `inviteRoleOptions` (evitar re-render loops — no romper)

</code_context>

<specifics>
## Specific Ideas

1. **Orden de migración** (sugerido por simplicidad → complejidad):
   1. `Login` + `SetPassword` (más simples, formularios autocontenidos)
   2. `AccountSettingsPage` (autocontenida)
   3. `NewProject` (formulario con preview)
   4. `CompaniesPage` (grid + modales)
   5. `CompanyPage` (detail + sidecards)
   6. `UsersPage` (tabla compleja con expandable rows)
   7. `TrashPage` (archive + trash)
   8. `SecurityPage` (block modal complejo)
   9. `AppShell` (sidebar + layout — al final porque envuelve todo)

2. **QA por migración**:
   - Después de cada página migrada: levantar dev server, navegar a esa ruta, comparar visualmente con baseline (preview_screenshot)
   - Verificar interacciones críticas: crear, editar, archivar, restaurar, eliminar
   - Console limpia (preview_console_logs)

3. **Decisión específica de UsersPage**: tabla actual tiene expandable rows con custom CSS — preservar esa estructura, solo migrar tokens. Si la tabla se beneficia de un componente `<Table>` shared, considerarlo en Phase 5 (out of scope acá).

4. **Decisión específica de AppShell**: el sidebar tiene `nav-items` activos con dark theme. Si se migra a tokens, mantener el look exacto. Si tras migrar parece menos contrastado, ajustar shade del primary.

5. **Plan tasks sugeridos** (orientativo):
   - Task 1: Migrar Login + SetPassword (auth pages) + QA
   - Task 2: Migrar AccountSettingsPage + NewProject + QA
   - Task 3: Migrar CompaniesPage + CompanyPage + QA
   - Task 4: Migrar UsersPage + TrashPage + SecurityPage + QA
   - Task 5: Migrar AppShell + QA del flow completo

</specifics>

<deferred>
## Deferred Ideas

- **Refactor del backend para auth flows**: fuera de alcance, milestone es solo frontend visual.
- **Mejora de UX de invite flow** (notificaciones inline en lugar de toast): defer a milestone aparte.
- **Tests E2E** (Cypress/Playwright): no setup actual; defer.
- **Migración de iconos a un set unificado** (si lucide-react no cubre todo): no detectado problema, defer.
</deferred>
