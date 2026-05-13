# Phase 1: Design Tokens Foundation - Context

**Gathered:** 2026-05-08
**Status:** Ready for planning
**Mode:** Auto-generated (discuss skipped via workflow.skip_discuss; decisions pre-locked en `.planning/intel/decisions.md`)

<domain>
## Phase Boundary

Extender `frontend/src/styles/tokens.css` (actualmente 20 líneas) con scales completas que cubran los 7 principios de Refactoring UI:
- Spacing scale (10 niveles, 4-96 px)
- Typography scale (8 niveles, 12-36 px) con line-heights pareados
- Shadow scale (5 niveles, xs-xl)
- Radius scale (6 niveles, xs-full)
- Z-index semántica (8 tokens: base/dropdown/sticky/overlay/modal/popover/tooltip/toast)
- Paleta de color con shades 50-900 para neutrales/primary/success/danger/warning

**Sin breaking changes**: tokens existentes (`--wb-bg`, `--wb-text`, `--wb-text-muted`, `--wb-primary`, `--wb-radius-sm/md/lg`, `--wb-shadow-sm/lg`, etc.) deben preservarse — preferentemente como aliases que apuntan a los nuevos tokens canónicos para que el resto de la app no rompa.

**Verificación**: una página piloto (a elegir, sugerido `Login` o `AccountSettingsPage` por ser autocontenidas) debe consumir al menos un token nuevo y renderizar sin errores ni regresión visual.

</domain>

<decisions>
## Implementation Decisions

Pre-locked en `.planning/intel/decisions.md` (lectura obligatoria para el plan/execute). Resumen:

- **Color**: primary base `#091223` (mantener), grises tinte cool (slate), success/danger/warning conservadores, contrast WCAG AA mínimo 4.5:1.
- **Spacing**: 4/8/12/16/20/24/32/48/64/96 px, tokens `--wb-space-{1..24}`.
- **Typography**: ratio 1.25 → 12/14/16/18/20/24/30/36 px, tokens `--wb-text-{xs..4xl}` con line-height pareada. Stack `system-ui` (no webfonts).
- **Shadows**: 5 niveles `--wb-shadow-{xs,sm,md,lg,xl}`. Preservar `sm` y `lg` actuales como están.
- **Radius**: 6 niveles `--wb-radius-{xs,sm,md,lg,xl,full}`. Mantener aliases viejos como fallbacks.
- **Z-index**: 8 tokens semánticos `--wb-z-{base,dropdown,sticky,overlay,modal,popover,tooltip,toast}`.

Las decisiones ambiguas se resuelven con la opción más conservadora (preservar look actual) + nota en SUMMARY.

</decisions>

<code_context>
## Existing Code Insights

**Archivos críticos a tocar:**
- `frontend/src/styles/tokens.css` — extender (NO sobrescribir)
- `frontend/src/styles/base.css` — leer para entender scrollbar styles, tiptap heading defaults, select chevron pattern (no se modifica en Phase 1, solo se referencia)

**Sistema actual** (audit baseline):
- 11 tokens existentes (color base + 2 shadows + 3 radius + 1 width)
- Sin tokens de spacing, typography, z-index
- Hardcoded values en 7,500 líneas de CSS distribuidas en 20 `.module.css`
- Editor tiene paleta paralela (`#212222 / #2a2a2a / #d9d9d9`) — no se toca en Phase 1, ese es Phase 4

**Página piloto sugerida** para verificación:
- `frontend/src/pages/AccountSettingsPage.jsx` + `.module.css` — autocontenida, formulario simple, fácil de validar visualmente
- Alternativa: `frontend/src/pages/Login.jsx` con `AuthPage.module.css` compartido

**Stack**:
- Vite 6.x con HMR — cambios en `tokens.css` se propagan instantáneo a páginas que consumen
- CSS Modules + variables CSS globales (importadas desde `main.jsx`)

</code_context>

<specifics>
## Specific Ideas

1. **Convención de naming de tokens**: usar prefijo `--wb-` (consistente con tokens existentes). Sub-namespacing por categoría: `--wb-space-N`, `--wb-text-N`, `--wb-shadow-N`, `--wb-radius-N`, `--wb-z-N`, `--wb-color-{neutral,primary,success,danger,warning}-{50..900}`.

2. **Aliases para compat**: `--wb-radius-sm: var(--wb-radius-md)` — mantener nombre viejo, valor nuevo si difieren. O preservar valores viejos: `--wb-radius-sm: 10px` (era 10) y agregar `--wb-radius-sm-new: 8px` si quieres ambos. Decisión: preservar valores viejos exactos en alias names viejos para CERO regresión, y agregar nuevos tokens con nombres nuevos (e.g., `--wb-radius-2: 8px`). Esto evita que páginas existentes rompan.

3. **Paleta 50-900**: documentar HSL base + las 9 variantes en comentario inline en `tokens.css` para que sea legible. Ejemplo:
   ```css
   /* Primary (cool blue) — base #091223, hue ~218, saturation ~52%, lightness ~9% */
   --wb-color-primary-50:  #f1f5f9;
   --wb-color-primary-100: #e2e8f0;
   ...
   --wb-color-primary-900: #091223;
   ```

4. **Validación de contrast**: incluir comentario al lado de los grises indicando qué shades son safe para body text en blanco (ratio ≥ 4.5:1):
   ```css
   --wb-color-neutral-700: #334155; /* AA on white: 9.4:1 */
   --wb-color-neutral-600: #475569; /* AA on white: 6.9:1 */
   --wb-color-neutral-500: #64748b; /* AA large only: 4.6:1 */
   ```

5. **Test de no-regresión**: después de actualizar `tokens.css`, levantar dev server y navegar por al menos:
   - Login page (`/login`)
   - Companies home (`/companies`)
   - Editor (`/project/X/editor`)
   Y verificar visualmente que nada se rompió. Confirmado con `preview_screenshot` por área.

6. **Plan tasks sugeridos** (orientativo; el planner agent decide):
   - Task 1: Definir paleta neutral/primary/success/danger/warning con shades 50-900 (validar contrast)
   - Task 2: Definir spacing/typography/shadows/radius/z-index scales
   - Task 3: Aplicar a página piloto (AccountSettingsPage) + verificar no-regresión

</specifics>

<deferred>
## Deferred Ideas

- **Migración masiva**: la migración real de páginas a los nuevos tokens es trabajo de Phase 3-5, no de Phase 1. Phase 1 solo entrega el sistema y la prueba de concepto.
- **Dark mode**: tokens actuales asumen tema claro. Dark mode tokens (`--wb-color-*-dark-*` o variant via `[data-theme="dark"]`) son v2 (out of scope explícito en PROJECT.md).
- **Token naming consistente con CSS Custom Properties Level 5**: si en algún momento se quiere aprovechar `@property` o tipos explícitos, eso es mejora futura.
</deferred>
