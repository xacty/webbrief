# Deep-links del editor y share — Plan de implementación

> **Para el agente ejecutor (sesión limpia):** este documento es auto-contenido. Antes de empezar: lee `AI_GLOBAL.md` → `CONTEXT.min.md` → `DESIGN-SYSTEM.md` (regla de arranque del repo). Ejecuta task por task, EN SERIE si usas subagents (nunca dos commiteando a la vez).

**Problema:** el editor y el share público no tienen URLs por página ni por sección — compartir un proyecto SIEMPRE cae en la primera página, sin importar desde dónde se compartió. Además otras features (galería "ir al documento", ver plan hermano `2026-08-06-galeria-documentos-briefs.md`) dependen de poder enlazar a página+sección.

**Goal:** URLs con estado: `?p=<pageId>&s=<sectionId>` en `/project/:id/editor` y `/share/:token`, acciones de "Copiar enlace" en editor y share, y navegación que refleja la página activa en la URL.

**Rama:** crear `feat/editor-deeplinks` DESDE `feat/project-folders` (o su sucesora si ya se mergeó — verifica con `git log --oneline -3` de cada rama y usa la más avanzada que contenga el commit `5549868`).

**Decisiones cerradas (no reabrir):**
- Query params, NO path segments: cero reestructura del router, params opcionales, compatible con tokens/rutas actuales. Nombres cortos: `p` (pageId UUID), `s` (sectionId).
- Al cargar: activar página `p` (si inválida/ausente → primera página, en silencio); tras el primer render del contenido, scroll+flash a `s` reutilizando el flujo programático EXISTENTE (no inventar otro scroll).
- Sincronización: cambiar de página actualiza `p` con `replace` (sin ensuciar history). `s` NO se sincroniza en vivo — solo se consume al cargar y se genera con acciones explícitas "Copiar enlace" (decisión deliberada: no pelear con el scroll-listener del editor, ver invariantes).
- El share link creado (token) no cambia de formato — los params se APPENDEAN a la URL copiada.

**Hechos verificados del código (base `5549868`, líneas orientativas — grep antes de editar):**
- Rutas: `frontend/src/App.jsx:122` (`/share/:token` → SharePage) y `:159` (`/project/:id/editor` → ProjectEditor).
- `ProjectEditor.jsx` (~11k líneas, ZONA DELICADA): `const [activePageId, setActivePageId] = useState(null)` en :2619; `activePage` derivado en :2716. Pills de página en navbar con kebab existente (`openMenuId`, rename/delete — grep `openMenuId`).
- Scroll+flash de sección: `flashSectionInScrollEl(scrollEl, divider, nextDivider)` definida en :882, usada en :8813 (sidebar de secciones) y :10774 (panel de actividad). Reusar el MISMO mecanismo.
- Share: estado `shareUrl` en :2647; `ShareLinkPanel` en :10834 (copia con `navigator.clipboard`).
- `SharePage.jsx`: `pages` en estado (:42). Cómo selecciona/renderiza la página activa NO está verificado — primer paso del T3 es leerlo y adaptar (si muestra una página a la vez → estado que se sincroniza con `p`; si renderiza todo apilado → scroll a la página).
- Secciones en HTML serializado: `<div data-section-divider data-section-id="..." data-section-name="...">` (invariante del repo) — en share, el scroll a sección puede anclar por `[data-section-id]`.

**ADVERTENCIAS de la zona editor (de CONTEXT.min, respetar):** `import { Node } from '@tiptap/core'` shadowea el DOM Node (usar `globalThis.Node`); NO tocar toolbar overflow ni la lógica de pills/undo; invariantes de sections-panel (lista derivada del doc, active sync, sin flicker); cambios quirúrgicos y mínimos; el editor tiene autosave — no introducir renders extra en el hot path.

**Reglas estándar del repo:** `git branch --show-current` antes de CADA commit; staging selectivo; suite backend (`cd backend && npm test`) + build (`cd frontend && npx vite build`) verdes antes de cada commit; español neutro; JAMÁS main/push/deploy/Prod; bump de versión NO se aplica aquí (se decide al merge; esto es MINOR).

---

### T1 — Editor consume `p` y `s` al cargar (~10 min)

- En `ProjectEditor.jsx`: leer `useSearchParams` al montar. Cuando `pages` esté cargado: si `p` matchea un id → `setActivePageId(p)`; si no, comportamiento actual (primera).
- Para `s`: tras el render del contenido de la página activa (hay efectos que dependen de `activePageId` — :2747/:2767 orientan dónde enganchar), localizar el divider `[data-section-id="<s>"]` en el canvas y disparar el MISMO flujo programático de scroll+flash del sidebar (:8813). Un solo intento con reintento corto (p. ej. 2 ticks/requestAnimationFrame) si el DOM aún no está; si la sección no existe, silencio.
- Helper puro testeable si extraes lógica (p. ej. `resolveDeepLinkPage(pages, p)` → pageId válido o null) + test en la suite backend NO aplica (es frontend) — test = verificación manual browser del T4 + `node --check` implícito del build.
- Commit: `feat(frontend): el editor abre página y sección desde la URL`

### T2 — Sincronizar `p` + acciones "Copiar enlace" en el editor (~12 min)

- Al cambiar de página (donde se llame `setActivePageId` por interacción de pills — grep call sites), actualizar `p` en la URL con `setSearchParams(..., { replace: true })` preservando otros params. NO tocar `s` ahí (se limpia: una URL con `s` viejo de otra página es peor que sin `s` — al cambiar de página, borra `s`).
- Kebab de la pill de página: item nuevo "Copiar enlace" → copia `${location.origin}/project/${projectId}/editor?p=${pageId}` (clipboard + feedback breve reutilizando el patrón de copiado existente del ShareLinkPanel).
- Sidebar de secciones: en el menú/acciones de cada sección (grep cómo expone acciones el panel — si no hay menú por sección, agregar la acción al context menu/right-click del editor SI existe ahí, o un botón de copiar al hover del item del sidebar — elegir lo MÁS quirúrgico y documentar), acción "Copiar enlace a la sección" → `...?p=${activePageId}&s=${sectionId}`.
- `ShareLinkPanel` (:10834): al lado de "copiar", opción "Copiar apuntando a la página actual" que appendea `?p=${activePageId}` a `shareUrl`.
- Commit: `feat(frontend): copiar enlaces a página y sección + URL sincronizada en el editor`

### T3 — SharePage consume y produce deep-links (~10 min)

- Leer primero cómo navega páginas SharePage (`pages` :42). Wire: consumir `p`/`s` al cargar (misma semántica de fallback); reflejar la página activa en `p` al navegar (replace); scroll+flash simple a `[data-section-id]` para `s` (no hay flashSectionInScrollEl aquí — implementar mini-helper local con el mismo look: scroll suave + highlight temporal, tokens `--wb-*`).
- Acción "Copiar enlace" en el share (donde quede natural en su UI) con la posición actual.
- OJO: SharePage es pública — no romper el email-gate ni los caps (50 páginas).
- Commit: `feat(frontend): deep-links en el share público`

### T4 — Verificación integral + docs (~8 min)

- Build + suite verdes. Verificación browser (dev server + login del dueño si hay sesión; si no, checklist manual documentado en el reporte): abrir editor con `?p` de página 2 → cae ahí; con `&s` → scroll+flash; cambiar página → URL se actualiza; copiar enlace de pill/sección/share panel → URLs correctas; share público con `?p&s` → posición correcta; params inválidos → fallback silencioso.
- `CONTEXT.min.md`: agregar a targets `editor.deeplinks` con keep/watch (formato `?p&s`, replace-no-push, `s` solo se consume al cargar, fallback silencioso).
- Commit docs. Reporte final con lo verificado y cualquier desviación.
