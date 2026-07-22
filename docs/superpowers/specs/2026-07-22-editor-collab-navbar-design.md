# Colaboración ligera en el editor + rediseño de navbar (Enfoque 1)

- Fecha: 2026-07-22
- Estado: aprobado por el usuario (diseño validado en conversación)
- Alcance: frontend only — cero migraciones, cero endpoints nuevos, backend intacto
- Futuro: Enfoque 2 (merge arbitrado por backend, saves por sección) queda diferido; reutilizará la lógica de `sectionMerge.js` de este spec

## Problema

1. Dos sesiones editando el mismo proyecto no se ven entre sí. Cuando la sesión B guarda primero, la sesión A recibe 409 ("El brief cambió en otra sesión") y su autosave **se bloquea silenciosamente** (`autosaveBlockedRef`, `ProjectEditor.jsx:3081`) hasta recargar. Se pierde trabajo y nadie entiende por qué.
2. La navbar del editor se degrada con muchas páginas: `overflow-x: auto` muestra scrollbar nativa sobre las pills, los labels sin `nowrap` se parten en dos líneas ("Más servicios"), y el aviso de guardado es un chip incrustado que se solapa con las tabs cuando el mensaje es largo.

## Decisiones cerradas (con el usuario)

- Merge automático **silencioso** de secciones no conflictivas al recibir cambios remotos.
- Conflicto (misma sección editada por ambos): aviso no bloqueante en la sección + comparador lado a lado con 3 acciones. Nunca modal forzado.
- Presencia: avatares en navbar + indicador por sección ("● María"), ámbar si está en tu misma sección.
- Tabs: patrón "strip deslizable + índice" (estilo Google Sheets). **El orden de páginas jamás se altera visualmente** — se descartó explícitamente el patrón de promoción (Figma/Office) porque desvirtúa el orden.
- Pills con `max-width` y ellipsis; el kebab "⋮" siempre visible (como tabs de navegador).
- Bordes de la strip difuminados con gradiente de opacidad (`mask-image`), no corte seco.
- La strip usa todo el ancho libre de la columna central; pills se encogen hasta un mínimo (~90px) antes de empezar a deslizar.
- Avisos largos salen de la navbar → toasts flotantes; estado de guardado compacto.

---

## F0 — Rediseño de navbar del editor

Archivos: `ProjectEditor.jsx` (componente navbar, ~línea 4770+), `ProjectEditorNav.module.css`.

### Pills
- `white-space: nowrap; max-width: 150px; overflow: hidden; text-overflow: ellipsis` en el label; `title` con nombre completo (tooltip).
- El botón "⋮" (menú renombrar/eliminar) queda fuera del área truncada, siempre visible, pegado al borde derecho de la pill.

### Strip deslizable
- Contenedor `.navCenter`: eliminar scrollbar visible (`overflow-x: auto` → scroll programático u `auto` con `scrollbar-width: none` + `::-webkit-scrollbar { display: none }`).
- Pills a ancho natural mientras quepan; `flex-shrink` permitido hasta `min-width: 90px`; solo entonces desliza.
- Difuminado de bordes con `mask-image: linear-gradient(...)` de ~24px por lado, **solo del lado con contenido oculto** (recalcular en scroll/resize con un listener que setea data-attrs o clases `fadeLeft`/`fadeRight`).
- Flechas ‹ › discretas, visibles solo cuando hay overflow en esa dirección.
- Auto-scroll: al cambiar de página activa (click, índice, o programático), `scrollIntoView({ inline: 'nearest' })` de la pill activa.

### Índice de páginas
- Botón al final de la strip (icono lista + contador). Dropdown con TODAS las páginas en orden real: número de posición, nombre (ellipsis), check en la activa.
- Elegir una: la activa en su posición original + auto-scroll de la strip. Cero reordenamiento.
- Reusar el patrón dropdown existente (portal a body como KebabMenu, cierre con click-outside/ESC, z-index `--wb-z-popover`).
- Futuro: este índice mostrará presencia por página ("● María" junto a la página donde está otra sesión) — dejar el layout listo para un slot a la derecha.

### Avisos flotantes (toasts)
- Los mensajes de estado largos (`saveMessage` de error, "cambió en otra sesión", etc.) dejan de renderizarse inline en `.navRight`.
- Nuevo componente `EditorToast` (o reuso si existe patrón): flotante centrado bajo la navbar, `position: fixed`, z-index `--wb-z-toast`.
  - Informativos ("Autoguardado"): NO generan toast — quedan en el estado compacto.
  - Advertencias/errores: toast persistente con botón de acción cuando aplique ("Actualizar") y cierre ✕.
- Estado de guardado compacto en `.navRight`: icono + texto corto ("✓ Guardado" / "● Sin guardar" / "⟳ Guardando…"), con tooltip para el detalle. El botón Guardar no cambia.
- Tokens del design system (`DESIGN-SYSTEM.md` es lectura obligatoria antes de tocar estos archivos).

### Invariante actualizado
`editor.navbar` en CONTEXT: sigue reservado para logo/back/nombre/pills/save/perfil/bell, y ahora también avatares de presencia (F1). Los mensajes largos ya no viven en la navbar.

---

## F1 — Canal de proyecto: presencia

Archivo nuevo: `frontend/src/lib/editorPresence.js` (espejo del patrón `commentsRealtime.js`).

- Canal Supabase `project:{projectId}:editor` con **Presence + Broadcast** (NO postgres_changes — `project_pages` no está en la publicación y no hace falta).
- Cada sesión publica presence state: `{ sessionId (uuid random por pestaña), userId, name, avatarUrl, pageId, sectionId, at }`.
  - `sessionId` distinto por pestaña permite QA con la misma cuenta en dos pestañas y evita que una misma persona con dos ventanas se "auto-oculte".
  - Actualizar (throttled ~2s) al cambiar `activePageId` / `activeSectionId`.
- Filtrado del propio `sessionId` en la UI.
- Degradación: si el canal falla (`CHANNEL_ERROR`/`TIMED_OUT`), la feature entera se desactiva sin romper el editor (comportamiento actual).
- Seguridad: el broadcast NUNCA transporta contenido del documento — solo metadatos (ids, nombres de actor, timestamps). El contenido siempre viaja por el backend autenticado. Mismo modelo de amenaza que el canal de comments existente.

### UI de presencia
- `PresenceAvatars.jsx`: stack de avatares (iniciales o `avatar_url`) en `.navRight`, entre estado de guardado y perfil. Colapsa a "+N" con más de 3. Tooltip: nombre + página donde está.
- Indicador por sección: en el `sectionDivider` de la sección donde otra sesión está activa, chip "● {nombre}" (usa el gutter del divider, NO texto seleccionable — respeta invariante Handoff copy-safe). En el panel de secciones, punto de color en la fila correspondiente.
- Si la otra sesión está en TU misma sección activa: el chip pasa a ámbar con texto "está editando esta sección".

---

## F2 — `sectionMerge.js` (módulo puro, testeable)

Archivo nuevo: `frontend/src/lib/sectionMerge.js`. Sin dependencias de React/TipTap — entra HTML, sale plan de merge.

### API
```js
splitSections(html) // → [{ sectionId, sectionName, innerHtml, position }]
                    // parsea por los <sectionDivider> (mismo formato que buildSectionActivityEvents)
mergeSections({ baseHtml, remoteHtml, localHtml })
// → {
//   mergedSections: [...],           // resultado por sección con origen 'local'|'remote'
//   conflicts: [{ sectionId, sectionName, localHtml, remoteHtml, type: 'edit'|'deleted-remote' }],
//   structuralNotes: [...],          // adds/removes/moves aplicados
//   identicalToRemote: bool          // true si el resultado == remoto (para anti-eco)
// }
```

### Reglas de merge 3 vías (por sectionId)
- Solo cambió remoto → tomar remoto.
- Solo cambió local → mantener local.
- Cambiaron ambos (innerHtml distinto de base en ambos y entre sí) → conflicto tipo `edit`; el resultado conserva LOCAL.
- Sección nueva remota → insertar en su posición relativa.
- Sección eliminada en remoto + local sin cambios → eliminar.
- Sección eliminada en remoto + local con cambios → conflicto tipo `deleted-remote` (conserva local).
- Estructura (orden/renombres): si local no hizo cambios estructurales, adoptar estructura remota; si ambos hicieron cambios estructurales → conservar estructura local y agregar al final las secciones solo-remotas (caso raro, documentado).
- Normalización antes de comparar: trim + colapso de whitespace entre tags, para no detectar falsos cambios por serialización.

### Tests
- El frontend no tiene runner configurado hoy → los tests de `sectionMerge` se escriben con `node:test` en `backend/test/section-merge.test.js` importando el módulo (es JS puro sin imports de frontend), igual que el resto de la suite backend. Casos: cada regla de arriba + documento sin secciones + HTML de FAQ.

---

## F3 — Cableado: timbre → sync → merge

En `ProjectEditor.jsx`:

### Estado nuevo
- `serverPagesRef`: Map pageId → `{ contentHtml, version }` — la copia "base" (último estado del servidor conocido por esta sesión). Se actualiza en: carga inicial, respuesta de save exitoso (`data.pages`), y tras cada sync remoto. NOTA: el state `pages` NO sirve como base porque tras un page-switch con cambios sin guardar contiene snapshots locales.
- `conflictsByPage`: Map pageId → array de conflictos pendientes (en memoria; no persisten al recargar — aceptado en v1, el historial `metadata.history` del backend conserva ambas versiones).

### Flujo de timbre (broadcast)
1. Al guardar con éxito, la sesión emite broadcast `{ sessionId, actorName, pageIds, savedAt }` por el canal de F1.
2. La sesión receptora (ignorando su propio `sessionId`) hace `GET /api/projects/:id` (endpoint existente) → páginas frescas + versiones.
3. Por cada página: `mergeSections({ base: serverPagesRef, remote: fetched, local })` donde local = editor actual (página activa, via snapshot) o `pages` state (páginas no activas).
4. Aplicar resultado:
   - Página activa: reemplazar SOLO las secciones con origen 'remote' mediante transacción TipTap (reemplazo del rango entre su divider y el siguiente), preservando selección; si el cursor estaba dentro de una sección reemplazada, reubicarlo al inicio de esa sección. Después del splice correr `renumberAutoSections` y derivar secciones (mismo flujo post-hidratación existente).
   - Páginas no activas: actualizar `pages[].fullContent`/`contentJson`.
   - Actualizar `page.version` a la remota y `serverPagesRef`.
   - Registrar conflictos en `conflictsByPage` + marcar UI (F4).
5. Aviso discreto (toast informativo breve o flash): "«{actor}» actualizó {sección(s)}" — opcional, tono bajo.

### Anti-eco (crítico)
- Tras merge: si `identicalToRemote` y no había cambios locales → `setIsDirty(false)` y NO autosave (evita loop de saves entre sesiones).
- Si quedaron cambios locales → sigue dirty; el próximo autosave guarda el doc mergeado y pasa el guard (versiones ya actualizadas).

### Fix del 409
- El manejo actual (`autosaveBlockedRef = true`) se reemplaza: al recibir 409, disparar el mismo flujo de sync (pasos 2-4) y reintentar el save UNA vez. Si vuelve a fallar, mostrar toast de advertencia persistente con acción "Actualizar" (recarga contenido). `autosaveBlockedRef` desaparece o queda solo como fallback del doble fallo.
- El guard de versión del backend NO se toca: sigue siendo la red de seguridad (p. ej. contra pestañas con código viejo tras un deploy).

### Guardas
- Sync no corre si hay un save en vuelo (`saveInFlightRef`) — se encola y corre al terminar.
- Sync no corre en modo Preview/Handoff sin editor activo — se aplica directo a `pages` state.
- Solo aplica a `projectType` page/faq/document con contenido de secciones; brief queda fuera (v1).

---

## F4 — UI de conflictos

Archivos nuevos: `frontend/src/components/editor/ConflictCompareModal.jsx` (+ module.css), integración en canvas y panel de secciones.

- Marca en sección conflictiva: banda/chip discreto en el gutter del divider ("⚠ {nombre} también editó esta sección — Comparar"), y punto ámbar en el panel de secciones. No selectable-safe (gutter), no bloquea escritura.
- Comparador (modal con portal, patrón Modal existente): dos columnas de solo lectura — "Tu versión" | "Versión de {nombre}" (render HTML con estilos del editor, sin edición). Para `deleted-remote`: columna remota muestra "{nombre} eliminó esta sección".
- Acciones:
  1. **Mantener la mía** → descarta remoto, cierra conflicto (el historial del backend conserva la versión remota).
  2. **Usar la suya** → reemplaza la sección local por la remota (transacción TipTap), marca dirty.
  3. **Insertar la suya debajo** → nueva sección `"{nombre sección} — versión de {actor}"` con `sectionId` nuevo, insertada inmediatamente después; marca dirty. (Para `deleted-remote` esta acción no aplica; en su lugar: "Aceptar eliminación".)
- Resolver un conflicto lo remueve de `conflictsByPage`; sin conflictos → desaparecen las marcas.
- Si llega un NUEVO cambio remoto sobre una sección ya en conflicto: se actualiza el `remoteHtml` del conflicto existente (último remoto gana como candidato).

---

## F5 — QA (dos sesiones)

- Dev server del usuario (`preview_start {url: localhost:5173}`), entorno Dev de Supabase, cuenta `claude-bot` (el usuario tipea el login; ver reglas en CLAUDE.md).
- Dos pestañas, mismo proyecto:
  1. Presencia: avatares y "● bot" por sección aparecen/desaparecen al navegar/cerrar pestaña.
  2. Merge limpio: A edita sección 1, B edita sección 2, A guarda → B ve la sección 1 nueva sin perder lo suyo; B guarda → sin 409, versiones correctas en DB.
  3. Conflicto: ambos editan sección 1, A guarda → B ve marca de conflicto; probar las 3 resoluciones.
  4. Anti-eco: tras merge sin cambios locales, B no dispara autosave (verificar en Network que no hay PUT).
  5. Borrado remoto de sección editada localmente → conflicto `deleted-remote`.
  6. Navbar: proyecto con 10+ páginas y un nombre kilométrico → ellipsis, fades, índice, auto-scroll, cero scrollbars nativas ni labels partidos.
- Nota QA misma cuenta: los avatares mostrarán el mismo nombre dos veces (sessionId distinto) — esperado.

## Ejecución

- Orquestación: sesión principal coordina; implementación por subagentes **Sonnet** por fase (F0 → F1 → F2 → F3 → F4), cada uno recibe este spec + archivos exactos; F2 puede correr en paralelo con F0/F1. Cada fase termina con commit atómico.
- Los subagentes que toquen superficies visibles leen `DESIGN-SYSTEM.md` antes.
- Estimación agente: F0 ~20 min, F1 ~15, F2 ~15, F3 ~20, F4 ~20, F5 ~10 (+ login del usuario). Total ~100 min.

## Riesgos y mitigaciones

- Splice TipTap desplaza posiciones → hacer reemplazos de atrás hacia adelante (posiciones mayores primero) dentro de una sola transacción o cadena.
- `import { Node } from '@tiptap/core'` shadowea `Node` global en ProjectEditor.jsx (gotcha documentado en CONTEXT) — usar `globalThis.Node` si hace falta.
- Presence en Supabase free tier: límite de mensajes/conexiones amplio para 2-5 usuarios — sin riesgo real.
- Rollback: quitar la suscripción al canal restaura exactamente el comportamiento actual (los cambios de F3 al 409 degradan a toast persistente).
