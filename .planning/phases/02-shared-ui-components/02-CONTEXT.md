# Phase 2: Shared UI Components - Context

**Gathered:** 2026-05-08
**Status:** Ready for planning (después de Phase 1 complete)
**Mode:** Auto-generated (skip_discuss=true; decisiones en `.planning/intel/decisions.md`)

<domain>
## Phase Boundary

Crear `frontend/src/components/ui/` con una librería de componentes reutilizables que reemplace la duplicación actual de modales, botones, inputs, selects entre páginas:

- `Button` — variants: primary / secondary / ghost / danger × sizes: sm / md / lg
- `Input` — text/email/password con label, error, icon optional
- `Select` — preserva el chevron del `base.css` existente
- `Modal` — overlay + card unificados, `z-index: var(--wb-z-modal)`, close-on-escape y close-on-backdrop
- `Card` — container con padding/radius/shadow del sistema
- `Badge` — status pills neutral / success / warning / danger

Cada componente tiene su propio `.module.css` que consume **exclusivamente tokens** del Phase 1 (cero hardcoded colors, espaciado o radius arbitrarios).

Exportados centralizadamente desde `frontend/src/components/ui/index.js` para imports limpios:
```js
import { Button, Modal, Input } from '@/components/ui';
```

</domain>

<decisions>
## Implementation Decisions

Pre-locked en `.planning/intel/decisions.md`. Component patterns específicos (resumen):
- **Button**: 3 sizes (sm 32px / md 40px / lg 48px). Primary usa `--wb-color-primary-900`, secondary `--wb-color-neutral-100`, ghost transparent, danger `--wb-color-danger-600`.
- **Modal**: overlay `rgba(15, 23, 42, 0.36)`, max-width 500px default (override por prop), `--wb-shadow-xl`, `--wb-radius-lg`.
- **Input/Select**: altura 40px (md), border `--wb-border-strong` en focus, transition de 150ms.
- **Card**: padding `--wb-space-6`, `--wb-radius-lg`, `--wb-shadow-sm`.
- **Badge**: `--wb-radius-full`, padding `--wb-space-1` × `--wb-space-2`, `--wb-text-xs`.

Naming convention: `Button.jsx` + `Button.module.css` co-localizados. Index file `components/ui/index.js` re-exporta todo.

</decisions>

<code_context>
## Existing Code Insights

**Duplicación actual a eliminar** (audit baseline):
- `.modalOverlay` + `.modalCard` definidos en `pages/CompaniesPage.module.css:397-415` y `pages/ProjectEditor.module.css:394-402` con z-index distintos (1000 vs 200) — esto se unifica.
- `.input`, `.select` definidos en `AuthPage.module.css:84-92` y `CompaniesPage.module.css:53-73` — extraer a `Input` / `Select`.
- Botones primary/secondary/danger definidos ad-hoc en cada `.module.css` (al menos 5 archivos) — centralizar en `Button`.

**Stack pista:**
- React funcional (hooks), no class components
- TypeScript NO (la app es JS — todos los archivos `.jsx`)
- Iconografía: `lucide-react`
- Sin librería de componentes externa (no Radix, no shadcn, no MUI)

**Convenciones existentes en el repo:**
- CSS Modules con className `styles.foo`
- `cn()` helper o template literal para concatenar classes (verificar si existe; si no, agregar trivial)
- Forward ref no usado generalmente — usarlo en Input/Button para integración con react-hook-form (si se usa) o focus management

**Carpeta destino**: `frontend/src/components/ui/` (nueva).

**Path aliases**: verificar si `vite.config.js` tiene `@/` configurado. Si no, usar imports relativos `../../components/ui/Button`.

</code_context>

<specifics>
## Specific Ideas

1. **Estructura de carpetas**:
   ```
   frontend/src/components/ui/
     Button.jsx
     Button.module.css
     Input.jsx
     Input.module.css
     Select.jsx
     Select.module.css
     Modal.jsx
     Modal.module.css
     Card.jsx
     Card.module.css
     Badge.jsx
     Badge.module.css
     index.js
   ```

2. **Testing manual**: crear una página `/dev/ui-preview` (sólo accesible en local) o un Storybook lite con todos los variants visibles. **Decisión**: omitir Storybook (overhead). En su lugar, crear un componente `<UiSandbox />` opcional que renderiza todas las variants para QA visual rápida. Solo si se considera valioso; sino, validar variants en uso real.

3. **Modal — detalles críticos**:
   - Soporte `onClose` via Escape, click fuera, botón X explícito
   - `aria-modal="true"`, `role="dialog"`, focus trap básico
   - Portal a `document.body` para evitar z-index issues
   - Variants: `size="sm" / "md" / "lg" / "full"`

4. **Button — interface**:
   ```jsx
   <Button variant="primary" size="md" disabled={false} loading={false} icon={<Plus />} iconPosition="left" onClick={...}>
     Crear empresa
   </Button>
   ```
   Loading state muestra spinner inline + disabled.

5. **Compatibilidad con código viejo**: Phase 2 SOLO crea los componentes; la migración real de páginas (`CompaniesPage`, `Login`, etc.) que actualmente tienen estilos locales es Phase 3-4. Phase 2 entrega la librería + (opcionalmente) migra UNA página piloto para validar el contrato.

6. **Plan tasks sugeridos**:
   - Task 1: Crear `Button` + tests visuales en una página piloto
   - Task 2: Crear `Input`, `Select` + integrar en página piloto (formulario)
   - Task 3: Crear `Modal` + reemplazar UN modal existente como prueba
   - Task 4: Crear `Card`, `Badge` + index.js

</specifics>

<deferred>
## Deferred Ideas

- **Storybook**: descartado por overhead. Si en el futuro hay 20+ componentes, reconsiderar.
- **Tests unitarios** (Jest, Vitest): el repo actualmente sólo tiene tests de backend (`backend && npm test`). Frontend no tiene framework de testing configurado. Defer testing a milestone aparte.
- **Componentes avanzados** (DataTable, ComboBox, DatePicker): no necesarios para WeBrief actual. Defer.
- **Compound components pattern** (e.g., `Modal.Header`, `Modal.Body`, `Modal.Footer`): considerarlo si la API simple resulta limitante. Por ahora, props directas.
</deferred>
