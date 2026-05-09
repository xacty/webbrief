# Decisions — UI System Refactor

Decisiones de diseño tomadas al inicio del milestone v1.0 (autorizadas por el usuario en modo autónomo). Los agentes deben consumir estos defaults al planificar y ejecutar phases. Si una decisión específica de phase contradice algo aquí, registrar la divergencia en el SUMMARY de esa phase.

## Color

- **Primary base color**: mantener `#091223` (cool dark blue actual). Derivar shades 50-900 con ajustes HSL estándar.
- **Grises**: con tinte cool (azulado), no neutros puros. Aproximación: `slate` de Tailwind.
- **Success**: green-700 (`#15803d` aprox) para texto/iconos, green-500 (`#22c55e`) para fondos.
- **Danger**: red-600 (`#dc2626`, ya en tokens), shades a derivar con HSL.
- **Warning**: amber-500 (`#f59e0b`).
- **Body text mínimo 4.5:1** contrast en fondo blanco — usar `gray-700` (`#374151`) o más oscuro.
- **No black puro**: el shade más oscuro es `gray-900` (`#111827` o el actual `#091223`), nunca `#000000`.

## Spacing scale

10 niveles, lineales 4 → 96 px:

```
--wb-space-1: 4px
--wb-space-2: 8px
--wb-space-3: 12px
--wb-space-4: 16px
--wb-space-5: 20px
--wb-space-6: 24px
--wb-space-8: 32px
--wb-space-12: 48px
--wb-space-16: 64px
--wb-space-24: 96px
```

## Typography scale

Modular ratio 1.25, 8 niveles:

```
--wb-text-xs:   12px / line-height 1.5
--wb-text-sm:   14px / line-height 1.5
--wb-text-base: 16px / line-height 1.5
--wb-text-lg:   18px / line-height 1.5
--wb-text-xl:   20px / line-height 1.4
--wb-text-2xl:  24px / line-height 1.3
--wb-text-3xl:  30px / line-height 1.2
--wb-text-4xl:  36px / line-height 1.1
```

Mantener `system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif` (lo actual). No introducir webfonts.

Pesos: `400 (normal) / 500 (medium) / 600 (semibold) / 700 (bold)`. Sin pesos < 400 para body.

## Shadows

5 niveles (vs 2 actuales):

```
--wb-shadow-xs: 0 1px 2px rgba(15, 23, 42, 0.05)
--wb-shadow-sm: 0 1px 3px rgba(15, 23, 42, 0.08)   (preservar el actual)
--wb-shadow-md: 0 4px 6px rgba(15, 23, 42, 0.10)
--wb-shadow-lg: 0 10px 20px rgba(15, 23, 42, 0.12)
--wb-shadow-xl: 0 24px 48px rgba(15, 23, 42, 0.18) (preservar el actual)
```

## Radius

6 niveles (actual: 3):

```
--wb-radius-xs:   4px
--wb-radius-sm:   8px   (era 10)
--wb-radius-md:   12px  (era 14)
--wb-radius-lg:   16px  (era 18)
--wb-radius-xl:   24px
--wb-radius-full: 9999px (pills)
```

**Compatibility**: mantener aliases `--wb-radius-sm: 10px` etc. existentes como fallbacks si rompen layouts. Las nuevas variables coexisten con las viejas.

## Z-index scale

Tokens semánticos (vs valores arbitrarios actuales 20→9999):

```
--wb-z-base:     1
--wb-z-dropdown: 100
--wb-z-sticky:   200
--wb-z-overlay:  900
--wb-z-modal:    1000
--wb-z-popover:  1100
--wb-z-tooltip:  1200
--wb-z-toast:    1300
```

## Component patterns

- **Button**: 4 variants (primary / secondary / ghost / danger) × 3 sizes (sm 32px / md 40px / lg 48px)
- **Modal**: overlay con `rgba(15, 23, 42, 0.36)`, card con `--wb-shadow-xl` y `--wb-radius-lg`, max-width 500px por default
- **Input/Select**: altura 40px (md), border `--wb-border-strong` en focus, `--wb-shadow-sm` opcional
- **Card**: padding `--wb-space-6`, radius `--wb-radius-lg`, shadow `--wb-shadow-sm`
- **Badge**: padding `--wb-space-1` x `--wb-space-2`, radius `--wb-radius-full`, text-xs

## Editor (Phase 4)

- **Preservar el look oscuro del editor** — no convertir a tema claro. Sólo reemplazar hardcoded `#212222 / #2a2a2a / #d9d9d9` por tokens equivalentes (e.g., `--wb-editor-bg: var(--wb-gray-900)` o tokens dedicados al editor si la migración requiere divergencia).
- Si el editor necesita su propia escala (porque visualmente no encaja con la del shell), crear sub-tokens `--wb-editor-*` que aliasen a los globales, no romper el sistema.

## Out of scope (recordatorio)

- Dark mode global (sólo el editor mantiene su look oscuro existente)
- Animaciones / motion system
- Migración a Tailwind / CSS-in-JS
- Internacionalización
- Mobile responsive rediseño

## Process

- Commits atómicos por tarea (auto-managed por gsd-execute-phase)
- No push a GitHub, no deploy a VPS sin pedido explícito del usuario
- Bugs ajenos al refactor → anotar en `.planning/todos/pending/`, no fix oportunista
- Si decisión visual ambigua y no obvia → opción más conservadora (preservar look existente) + nota en SUMMARY

---
*Locked: 2026-05-08 al inicio del milestone v1.0 (modo autónomo).*
