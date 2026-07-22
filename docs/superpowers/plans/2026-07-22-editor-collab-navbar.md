# Colaboración ligera + navbar del editor — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Presencia en vivo + merge automático por sección al guardar (con resolución humana de conflictos), y navbar del editor sin overflow roto.

**Architecture:** Canal Supabase Realtime (Presence + Broadcast, sin contenido en mensajes) por proyecto. Al recibir el "timbre" de un save remoto, el cliente hace fetch del proyecto y ejecuta un merge 3 vías por `sectionId` (módulo puro `sectionMerge.js`); secciones no conflictivas se inyectan vía transacción TipTap, conflictos se resuelven en un comparador. Backend intacto.

**Tech Stack:** React (JSX, sin TS), TipTap, Supabase Realtime, CSS Modules con tokens `--wb-*`, tests con `node:test` en la suite backend.

**Spec:** `docs/superpowers/specs/2026-07-22-editor-collab-navbar-design.md` — leerlo completo antes de cualquier task.

**Reglas globales para TODOS los tasks:**
- Leer `DESIGN-SYSTEM.md` antes de tocar superficies visibles. Español neutro en todo copy.
- Working dir: `/Users/adrian/GitHub/webbrief` (NUNCA solo en worktree).
- `ProjectEditor.jsx` shadowea `Node` global (`import { Node } from '@tiptap/core'`) — usar `globalThis.Node` si se necesita el DOM Node.
- Commit atómico al final de cada task. Frontend se verifica con `cd frontend && npx vite build` (no hay test runner frontend); backend con `cd backend && npm test`.
- Los números de línea citados son orientativos (base: commit `5363e45`) — verificar con grep antes de editar.

**Hechos del código existente (verificados):**
- Divider serializado: `<div data-section-divider data-section-id="..." data-section-name="..."></div>` (atom, sin hijos). Builder en `ProjectEditor.jsx:891`.
- `parseSectionsFromHtml(html)` (ProjectEditor.jsx:896) parte HTML en `[{id, name, content}]` con DOMParser (solo browser).
- `buildSectionActivityEvents` (ProjectEditor.jsx:1964) ya diffea páginas por sección; `normalizeHtmlForCompare` existe.
- Save: `saveProjectPages` (ProjectEditor.jsx:3008) → PUT `/api/projects/:id/pages`; 409 con mensaje "otra sesión" bloquea autosave en `ProjectEditor.jsx:3081` (`autosaveBlockedRef`).
- Navbar: componente en ProjectEditor.jsx:~4795 (`navStyles` = `ProjectEditorNav.module.css`); `.navCenter` (línea 126 css) tiene `overflow-x: auto`; pills sin nowrap.
- Patrón realtime: `frontend/src/lib/commentsRealtime.js`. Patrón dropdown-portal: `frontend/src/components/ui/KebabMenu.jsx`. Modal: `frontend/src/components/ui/Modal.jsx` (props `open`, `onClose`, `title`).

---

### Task 1 (F0a): Pills con ellipsis + strip deslizable con fades

**Files:**
- Modify: `frontend/src/pages/ProjectEditorNav.module.css` (`.navCenter` línea ~126, clases de pill ~136-180)
- Modify: `frontend/src/pages/ProjectEditor.jsx` (navbar ~4813-4838, componente `PagePill`)

- [ ] **Step 1: CSS — nowrap, max-width, strip sin scrollbar, fades**

En `ProjectEditorNav.module.css`, reemplazar `.navCenter` y agregar:

```css
.navCenter {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  flex: 1;
  padding: 0 8px;
}

.navPillsStrip {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  overflow-x: auto;
  scroll-behavior: smooth;
  scrollbar-width: none;
}
.navPillsStrip::-webkit-scrollbar { display: none; }

.navPillsStripFadeLeft {
  mask-image: linear-gradient(to right, transparent, black 24px);
  -webkit-mask-image: linear-gradient(to right, transparent, black 24px);
}
.navPillsStripFadeRight {
  mask-image: linear-gradient(to left, transparent, black 24px);
  -webkit-mask-image: linear-gradient(to left, transparent, black 24px);
}
.navPillsStripFadeBoth {
  mask-image: linear-gradient(to right, transparent, black 24px, black calc(100% - 24px), transparent);
  -webkit-mask-image: linear-gradient(to right, transparent, black 24px, black calc(100% - 24px), transparent);
}

.navPillLabel {
  max-width: 150px;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.navStripArrow {
  flex: 0 0 auto;
  border: none;
  background: transparent;
  cursor: pointer;
  color: var(--wb-color-neutral-500);
  padding: 2px;
  display: none;
}
.navStripArrowVisible { display: inline-flex; }
```

Cada pill (`.navPillWrapper`) recibe `flex: 0 1 auto; min-width: 90px;` para encogerse antes de deslizar. El texto de la pill se envuelve en `<span className={navStyles.navPillLabel}>`.

- [ ] **Step 2: JSX — estructura strip + flechas + lógica de fades**

En el componente navbar de `ProjectEditor.jsx`: envolver las pills en un div `.navPillsStrip` con `ref`, con botones flecha ‹ › antes/después (ChevronLeft/ChevronRight de lucide, ya importada la librería). Hook local:

```jsx
const stripRef = useRef(null)
const [stripState, setStripState] = useState({ left: false, right: false })

const updateStripState = useCallback(() => {
  const el = stripRef.current
  if (!el) return
  const left = el.scrollLeft > 4
  const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 4
  setStripState((prev) => (prev.left === left && prev.right === right ? prev : { left, right }))
}, [])

useEffect(() => {
  const el = stripRef.current
  if (!el) return undefined
  updateStripState()
  el.addEventListener('scroll', updateStripState, { passive: true })
  const observer = new ResizeObserver(updateStripState)
  observer.observe(el)
  return () => { el.removeEventListener('scroll', updateStripState); observer.disconnect() }
}, [updateStripState, pages.length])
```

Clase del strip: `cn(navStyles.navPillsStrip, stripState.left && stripState.right ? navStyles.navPillsStripFadeBoth : stripState.left ? navStyles.navPillsStripFadeLeft : stripState.right ? navStyles.navPillsStripFadeRight : '')`. Flechas: visibles solo si `stripState.left`/`.right`; onClick `stripRef.current.scrollLeft ±= 160`.

Auto-scroll a la activa (efecto sobre `activePageId`): `stripRef.current?.querySelector('[data-page-pill-id="' + activePageId + '"]')?.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' })`. Agregar `data-page-pill-id={page.id}` al wrapper de cada `PagePill` y `title={page.name}` para tooltip.

El "+" de agregar página y `TemplatesDropdown` quedan FUERA del strip (fijos a la derecha de él).

- [ ] **Step 3: Verificar build + visual**

Run: `cd frontend && npx vite build` → sin errores. Verificación visual la hace el orquestador (dev server del usuario).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/ProjectEditorNav.module.css frontend/src/pages/ProjectEditor.jsx
git commit -m "feat(editor): pills con ellipsis y strip deslizable con fades en navbar"
```

---

### Task 2 (F0b): Índice de páginas (dropdown sin reordenamiento)

**Files:**
- Create: `frontend/src/components/editor/PageIndexMenu.jsx`
- Create: `frontend/src/components/editor/PageIndexMenu.module.css`
- Modify: `frontend/src/pages/ProjectEditor.jsx` (navbar, junto al strip)

- [ ] **Step 1: Componente PageIndexMenu**

Seguir el patrón portal de `KebabMenu.jsx` (createPortal a body, getBoundingClientRect, recompute en scroll/resize, click-outside + ESC, z-index `var(--wb-z-popover)`). Props: `{ pages, activePageId, onSelectPage }`. Trigger: botón con icono `List` (lucide) + contador `{pages.length}`. Item:

```jsx
<button
  type="button"
  className={cn(styles.item, page.id === activePageId && styles.itemActive)}
  onClick={() => { onSelectPage(page.id); close() }}
>
  <span className={styles.itemIndex}>{index + 1}</span>
  <span className={styles.itemName} title={page.name}>{page.name}</span>
  {page.id === activePageId && <Check size={14} className={styles.itemCheck} />}
  <span className={styles.itemSlot} data-presence-slot={page.id} />
</button>
```

`.itemName`: ellipsis + nowrap, max-width 220px. `.itemSlot`: span vacío reservado (presencia futura, F1 lo llena). Todos los colores/espaciados con tokens `--wb-*`.

- [ ] **Step 2: Integración en navbar**

Colocar `<PageIndexMenu pages={pages} activePageId={activePageId} onSelectPage={onPageClick} />` inmediatamente después del strip (antes del "+"). Elegir página reusa `onPageClick` existente — cero lógica nueva de orden. El auto-scroll del Task 1 hace el resto.

- [ ] **Step 3: Verificar build y commit**

Run: `cd frontend && npx vite build` → OK.

```bash
git add frontend/src/components/editor/PageIndexMenu.jsx frontend/src/components/editor/PageIndexMenu.module.css frontend/src/pages/ProjectEditor.jsx
git commit -m "feat(editor): índice de páginas en navbar (orden real, check en activa)"
```

---

### Task 3 (F0c): Toasts flotantes + estado de guardado compacto

**Files:**
- Create: `frontend/src/components/editor/EditorToast.jsx`
- Create: `frontend/src/components/editor/EditorToast.module.css`
- Modify: `frontend/src/pages/ProjectEditor.jsx` (estado `saveMessage`, navbar `.navRight` ~4842-4849, catch de `saveProjectPages` ~3084)

- [ ] **Step 1: Componente EditorToast**

```jsx
import { AlertTriangle, Info, X } from 'lucide-react'
import styles from './EditorToast.module.css'
import { cn } from '../ui'

export default function EditorToast({ toast, onDismiss }) {
  if (!toast) return null
  const isWarning = toast.kind === 'warning'
  return (
    <div className={cn(styles.toast, isWarning ? styles.warning : styles.info)} role="status" aria-live="polite">
      {isWarning ? <AlertTriangle size={15} /> : <Info size={15} />}
      <span className={styles.text}>{toast.text}</span>
      {toast.actionLabel && (
        <button type="button" className={styles.action} onClick={toast.onAction}>{toast.actionLabel}</button>
      )}
      <button type="button" className={styles.close} onClick={onDismiss} aria-label="Cerrar aviso">
        <X size={13} />
      </button>
    </div>
  )
}
```

CSS: `position: fixed; top: 72px; left: 50%; transform: translateX(-50%); z-index: var(--wb-z-toast);` pill con `--wb-shadow-md`, fondo `--wb-color-neutral-0`, borde `--wb-color-warning-300`/`--wb-color-neutral-200` según kind, texto `--wb-text-sm`.

- [ ] **Step 2: Estado y reemplazo del chip inline**

En ProjectEditor: `const [editorToast, setEditorToast] = useState(null)`. Helper `showToast({ kind, text, actionLabel, onAction, autoHideMs })` con timeout ref para info (~4s); warning persiste.

Reglas de ruteo de mensajes:
- Estados cortos de save ("Autoguardado", "Guardando…", "Sin guardar", "Guardado") → SIGUEN en `.navRight` pero compactos: reemplazar chip/texto actual por `<span className={navStyles.navSaveCompact} title={saveLabel}>` con icono (`Check`/`RefreshCw`/punto) + palabra corta.
- Errores de save y mensajes largos (catch de `saveProjectPages`) → `showToast({ kind: 'warning', text: error.message })` y NO setear `saveMessage` largo.
- Render `<EditorToast toast={editorToast} onDismiss={...} />` una sola vez junto al navbar.

- [ ] **Step 3: Build + commit**

Run: `cd frontend && npx vite build` → OK.

```bash
git add frontend/src/components/editor/EditorToast.jsx frontend/src/components/editor/EditorToast.module.css frontend/src/pages/ProjectEditor.jsx frontend/src/pages/ProjectEditorNav.module.css
git commit -m "feat(editor): avisos flotantes fuera de la navbar y estado de guardado compacto"
```

---

### Task 4 (F2): sectionMerge.js — módulo puro con tests (TDD)

**Files:**
- Create: `frontend/src/lib/sectionMerge.js`
- Test: `backend/test/section-merge.test.js`

NOTA: sin DOMParser (debe correr en Node). Split por regex — válido porque el divider es un atom serializado SIEMPRE como div vacío con esos data-attrs (ProjectEditor.jsx:891). Antes de escribir el test, mirar un test backend existente (`backend/test/manager-notifications.test.js`) y copiar su estilo de import; si el backend es CJS, importar el módulo ESM con `const { mergeSections, splitSections } = await import('../../frontend/src/lib/sectionMerge.js')` dentro del test.

- [ ] **Step 1: Escribir tests que fallan**

`backend/test/section-merge.test.js` con `node:test` + `assert`. Helper local `d(id, name)` = divider HTML. Casos mínimos (uno por regla del spec):

```js
const d = (id, name) => `<div data-section-divider data-section-id="${id}" data-section-name="${name}"></div>`
const base = d('a', 'Uno') + '<p>alfa</p>' + d('b', 'Dos') + '<p>beta</p>'

// 1. splitSections parsea ids, nombres, innerHtml y posición
// 2. remoto cambia sección b, local intacto → merged usa remoto, 0 conflictos, identicalToRemote=true
// 3. local cambia a, remoto intacto → merged conserva local, identicalToRemote=false
// 4. ambos cambian a (distinto) → conflicts=[{sectionId:'a', type:'edit'}], merged conserva local
// 5. ambos cambian a al MISMO html → sin conflicto (no difieren entre sí)
// 6. remoto agrega sección c al final → aparece en merged en su posición
// 7. remoto elimina b, local no la tocó → merged sin b
// 8. remoto elimina b, local la editó → conflicts type='deleted-remote', merged conserva b local
// 9. remoto renombra sección (name del divider), local no → merged usa nombre remoto
// 10. whitespace: base vs remoto que solo difiere en espacios entre tags → sin cambios detectados
// 11. html sin dividers (document type) → se trata como sección única '__document__', reglas 2-4 aplican
// 12. local reordenó (estructural) + remoto agregó c → orden local se respeta, c se agrega al final
```

- [ ] **Step 2: Correr tests → fallan**

Run: `cd backend && npm test -- --test-name-pattern=section` (o `node --test test/section-merge.test.js`). Expected: FAIL (módulo no existe).

- [ ] **Step 3: Implementar sectionMerge.js**

```js
// frontend/src/lib/sectionMerge.js
// Merge 3 vías por sección para colaboración ligera. Sin DOM ni React:
// corre igual en browser y en node:test. El divider es un atom serializado
// como <div data-section-divider ...></div> — split por regex es seguro.

const DIVIDER_RE = /<div[^>]*\bdata-section-divider\b[^>]*>\s*<\/div>/gi

function attr(tag, name) {
  const match = new RegExp(`${name}="([^"]*)"`).exec(tag)
  return match ? match[1] : ''
}

export function splitSections(html) {
  const source = html || ''
  const re = new RegExp(DIVIDER_RE.source, 'gi')
  const dividers = []
  let match
  while ((match = re.exec(source))) dividers.push({ start: match.index, end: re.lastIndex, tag: match[0] })
  if (dividers.length === 0) {
    const body = source.trim()
    if (!body) return []
    return [{ sectionId: '__document__', sectionName: 'Documento', innerHtml: source, position: 0 }]
  }
  return dividers.map((div, i) => ({
    sectionId: attr(div.tag, 'data-section-id'),
    sectionName: attr(div.tag, 'data-section-name') || 'Sección',
    innerHtml: source.slice(div.end, dividers[i + 1] ? dividers[i + 1].start : source.length),
    position: i,
  }))
}

export function normalizeHtml(html) {
  return (html || '').replace(/>\s+</g, '><').replace(/\s+/g, ' ').trim()
}

export function buildHtmlFromSections(sections) {
  return sections.map((section) => {
    if (section.sectionId === '__document__') return section.innerHtml
    return `<div data-section-divider data-section-id="${section.sectionId}" data-section-name="${section.sectionName}"></div>${section.innerHtml}`
  }).join('')
}

export function mergeSections({ baseHtml, remoteHtml, localHtml }) {
  const base = splitSections(baseHtml)
  const remote = splitSections(remoteHtml)
  const local = splitSections(localHtml)
  const baseMap = new Map(base.map((s) => [s.sectionId, s]))
  const remoteMap = new Map(remote.map((s) => [s.sectionId, s]))
  const localMap = new Map(local.map((s) => [s.sectionId, s]))

  const changed = (a, b) => normalizeHtml(a?.innerHtml) !== normalizeHtml(b?.innerHtml)
  const ids = (list) => list.map((s) => s.sectionId).join('|')
  const localStructural = ids(local) !== ids(base)
  const conflicts = []
  const structuralNotes = []

  // Orden resultante: remoto si local no tocó estructura; si no, local + solo-remotas al final.
  let order
  if (!localStructural) {
    order = remote.map((s) => s.sectionId)
    // secciones que local editó pero remoto eliminó se conservan (regla 8): reinsertar en posición base
    local.forEach((section) => {
      if (!remoteMap.has(section.sectionId) && baseMap.has(section.sectionId) && changed(section, baseMap.get(section.sectionId))) {
        const baseIndex = base.findIndex((s) => s.sectionId === section.sectionId)
        order.splice(Math.min(baseIndex, order.length), 0, section.sectionId)
      }
    })
  } else {
    order = local.map((s) => s.sectionId)
    remote.forEach((section) => {
      if (!localMap.has(section.sectionId) && !baseMap.has(section.sectionId)) {
        order.push(section.sectionId)
        structuralNotes.push({ type: 'remote-add-appended', sectionId: section.sectionId })
      }
    })
  }

  const mergedSections = []
  order.forEach((sectionId) => {
    const inBase = baseMap.get(sectionId)
    const inRemote = remoteMap.get(sectionId)
    const inLocal = localMap.get(sectionId)

    if (inRemote && !inLocal) {
      if (!inBase) {
        mergedSections.push({ ...inRemote, origin: 'remote' })
        structuralNotes.push({ type: 'remote-added', sectionId })
      } else if (!changed(inRemote, inBase)) {
        // local la eliminó y remoto no la cambió → respetar eliminación local
        structuralNotes.push({ type: 'local-removed', sectionId })
      } else {
        mergedSections.push({ ...inRemote, origin: 'remote' })
      }
      return
    }
    if (inLocal && !inRemote) {
      if (inBase && !changed(inLocal, inBase)) {
        structuralNotes.push({ type: 'remote-removed', sectionId })
        return
      }
      if (inBase) {
        conflicts.push({ sectionId, sectionName: inLocal.sectionName, localHtml: inLocal.innerHtml, remoteHtml: null, type: 'deleted-remote' })
      }
      mergedSections.push({ ...inLocal, origin: 'local' })
      return
    }
    if (!inLocal && !inRemote) return

    const localChanged = changed(inLocal, inBase)
    const remoteChanged = changed(inRemote, inBase)
    const sectionName = (inRemote.sectionName !== inBase?.sectionName && inLocal.sectionName === inBase?.sectionName)
      ? inRemote.sectionName
      : inLocal.sectionName

    if (remoteChanged && !localChanged) {
      mergedSections.push({ ...inRemote, sectionName, origin: 'remote' })
    } else if (remoteChanged && localChanged && changed(inLocal, inRemote)) {
      conflicts.push({ sectionId, sectionName, localHtml: inLocal.innerHtml, remoteHtml: inRemote.innerHtml, type: 'edit' })
      mergedSections.push({ ...inLocal, sectionName, origin: 'local' })
    } else {
      mergedSections.push({ ...inLocal, sectionName, origin: 'local' })
    }
  })

  const mergedHtml = buildHtmlFromSections(mergedSections)
  return {
    mergedSections,
    mergedHtml,
    conflicts,
    structuralNotes,
    identicalToRemote: normalizeHtml(mergedHtml) === normalizeHtml(remoteHtml),
  }
}
```

- [ ] **Step 4: Correr tests → pasan; suite completa backend → verde**

Run: `cd backend && npm test`. Expected: PASS todos (incluidos los 94+ preexistentes).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/sectionMerge.js backend/test/section-merge.test.js
git commit -m "feat(editor): sectionMerge módulo puro de merge 3 vías por sección con tests"
```

---

### Task 5 (F1): Canal de presencia + avatares + indicador por sección

**Files:**
- Create: `frontend/src/lib/editorPresence.js`
- Create: `frontend/src/components/editor/PresenceAvatars.jsx` (+ `.module.css`)
- Modify: `frontend/src/pages/ProjectEditor.jsx` (suscripción + presencia en panel de secciones + navRight + PageIndexMenu slot)

- [ ] **Step 1: editorPresence.js**

```js
// frontend/src/lib/editorPresence.js
// Canal por proyecto para colaboración ligera: Presence (quién está dónde)
// + Broadcast "timbre" de saves. NUNCA transporta contenido del documento.
import { supabase } from './supabase'

export function createEditorChannel({ projectId, sessionId, initialState, onPresenceChange, onRemoteSave }) {
  if (!projectId || !sessionId) {
    return { updatePresence: () => {}, broadcastSaved: () => {}, cleanup: () => {} }
  }

  let joined = false
  let lastState = { ...initialState }

  const channel = supabase.channel(`project:${projectId}:editor`, {
    config: { presence: { key: sessionId }, broadcast: { self: false } },
  })

  channel.on('presence', { event: 'sync' }, () => {
    try {
      const state = channel.presenceState()
      const others = []
      Object.entries(state).forEach(([key, metas]) => {
        if (key === sessionId) return
        const meta = metas[metas.length - 1]
        if (meta) others.push({ ...meta, sessionId: key })
      })
      onPresenceChange(others)
    } catch (error) {
      console.warn('[editorPresence] presence handler:', error.message)
    }
  })

  channel.on('broadcast', { event: 'pages_saved' }, ({ payload }) => {
    if (!payload || payload.sessionId === sessionId) return
    try { onRemoteSave(payload) } catch (error) {
      console.warn('[editorPresence] remote save handler:', error.message)
    }
  })

  channel.subscribe((status) => {
    if (status === 'SUBSCRIBED') {
      joined = true
      channel.track({ ...lastState, at: new Date().toISOString() })
    }
    if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') joined = false
  })

  return {
    updatePresence(patch) {
      lastState = { ...lastState, ...patch }
      if (joined) channel.track({ ...lastState, at: new Date().toISOString() })
    },
    broadcastSaved(payload) {
      if (joined) channel.send({ type: 'broadcast', event: 'pages_saved', payload: { ...payload, sessionId } })
    },
    cleanup() {
      try { supabase.removeChannel(channel) } catch { /* best-effort */ }
    },
  }
}
```

- [ ] **Step 2: Suscripción en ProjectEditor**

- `const editorSessionIdRef = useRef(crypto.randomUUID())` (por pestaña).
- Estado `const [remotePeers, setRemotePeers] = useState([])`.
- Effect (cerca de la suscripción de comments realtime): crear canal con `initialState: { userId: currentUser?.id, name: currentUser?.fullName || currentUser?.email || 'Alguien', avatarUrl: currentUser?.avatarUrl || null, pageId: activePageId, sectionId: activeSectionId }`, `onPresenceChange: setRemotePeers`, `onRemoteSave` = ref que Task 6 llenará (por ahora `() => {}` via ref). Guardar el objeto canal en `editorChannelRef`. Cleanup al desmontar/cambiar projectId.
- Effect con throttle (~2s, timeout ref) sobre `[activePageId, activeSectionId]` → `editorChannelRef.current?.updatePresence({ pageId: activePageId, sectionId: activeSectionId })`.
- Gate: solo si `canWriteContent` y proyecto cargado.

- [ ] **Step 3: PresenceAvatars + indicadores**

`PresenceAvatars.jsx`: recibe `peers`; dedupe visual por `userId+sessionId`; muestra hasta 3 círculos (iniciales de `name` o `avatarUrl`) con borde, overlap -8px, tooltip "{name} — {nombre de página}"; extra → "+N". Colores de fondo por hash del sessionId sobre paleta `--wb-color-{primary,success,warning}-100`. Colocar en `.navRight` antes del estado de guardado.

Panel de secciones: en la fila de cada sección, si algún peer tiene ese `sectionId` → punto 6px `--wb-color-success-500` (title = nombres). Si el peer está en MI `activeSectionId` → punto y chip ámbar (`--wb-color-warning-500`), chip "● {name} está editando esta sección" en el gutter del divider correspondiente: overlay absolutamente posicionado en el canvas, calculado con `querySelector('[data-section-divider][data-section-id="…"]')` + getBoundingClientRect relativo al scroll container, recomputado en scroll/resize/peers-change (mismo patrón del add-button ~ProjectEditor.jsx:7679). NUNCA dentro de texto seleccionable.

`PageIndexMenu`: pasar `peers` y en `[data-presence-slot]` de cada página con peers → punto verde.

- [ ] **Step 4: Build + commit**

Run: `cd frontend && npx vite build` → OK.

```bash
git add frontend/src/lib/editorPresence.js frontend/src/components/editor/PresenceAvatars.jsx frontend/src/components/editor/PresenceAvatars.module.css frontend/src/components/editor/PageIndexMenu.jsx frontend/src/pages/ProjectEditor.jsx
git commit -m "feat(editor): presencia en vivo — canal por proyecto, avatares e indicador por sección"
```

---

### Task 6 (F3): Timbre → sync → merge → fix 409

**Files:**
- Modify: `frontend/src/pages/ProjectEditor.jsx` (refs ~2472, `saveProjectPages` ~3008-3090, nuevo `syncRemoteChanges`)

- [ ] **Step 1: Refs base**

Junto a `autosaveBlockedRef` (~2472):

```jsx
const serverPagesRef = useRef(new Map()) // pageId -> { contentHtml, version }
const conflictsByPageRef = useRef(new Map()) // pageId -> [{ sectionId, ... }]
const [conflictsVersion, setConflictsVersion] = useState(0) // fuerza re-render al cambiar conflictos
const syncInFlightRef = useRef(false)
const pendingSyncRef = useRef(false)
```

`serverPagesRef` se llena: (a) al cargar el proyecto (donde se hace `setPages` inicial con data del GET), (b) en `saveProjectPages` tras éxito con `data.pages` (contenido persistido), (c) al final de cada sync. Formato: `map.set(page.id, { contentHtml: page.content_html || page.contentHtml, version: page.version || 1 })`.

- [ ] **Step 2: syncRemoteChanges**

```jsx
const syncRemoteChanges = useCallback(async ({ actorName = 'Otra sesión' } = {}) => {
  if (!projectId) return { conflicts: 0 }
  if (saveInFlightRef.current || syncInFlightRef.current) { pendingSyncRef.current = true; return { deferred: true } }
  syncInFlightRef.current = true
  try {
    const data = await apiFetch(`/api/projects/${projectId}`)
    const remotePages = data.pages || []
    let totalConflicts = 0

    setPages((currentPages) => {
      const nextPages = currentPages.map((page) => {
        const remote = remotePages.find((r) => r.id === page.id)
        if (!remote) return page
        const baseEntry = serverPagesRef.current.get(page.id)
        const remoteHtml = remote.contentHtml || remote.content_html || '<p></p>'
        const isActive = page.id === activePageId
        const localHtml = isActive
          ? (snapshotActivePage()?.html || page.fullContent)
          : (page.fullContent || buildDocumentHTML(page.sections))

        const result = mergeSections({
          baseHtml: baseEntry?.contentHtml || remoteHtml,
          remoteHtml,
          localHtml: localHtml || '<p></p>',
        })

        if (result.conflicts.length > 0) {
          conflictsByPageRef.current.set(page.id, mergeConflictLists(conflictsByPageRef.current.get(page.id), result.conflicts, actorName))
          totalConflicts += result.conflicts.length
        }
        serverPagesRef.current.set(page.id, { contentHtml: remoteHtml, version: remote.version || 1 })

        if (isActive) {
          applyMergedToEditor(result) // Step 3
          return { ...page, version: remote.version || 1 }
        }
        return {
          ...page,
          version: remote.version || 1,
          fullContent: result.mergedHtml,
          contentJson: null, // se regenera al snapshotear/activar
        }
      })
      // páginas nuevas remotas que no existen localmente → agregarlas
      remotePages.forEach((remote) => {
        if (!nextPages.some((p) => p.id === remote.id)) nextPages.push(mapPersistedPage(remote, projectType))
      })
      // páginas eliminadas remotamente sin cambios locales → quitarlas
      return nextPages.filter((page) => remotePages.some((r) => r.id === page.id) || pageHasLocalChanges(page))
    })

    setConflictsVersion((v) => v + 1)
    return { conflicts: totalConflicts }
  } catch (error) {
    console.warn('[collab] sync failed:', error.message)
    return { error: true }
  } finally {
    syncInFlightRef.current = false
    if (pendingSyncRef.current) { pendingSyncRef.current = false; setTimeout(() => syncRemoteChanges({ actorName }), 250) }
  }
}, [projectId, activePageId, snapshotActivePage, projectType])
```

Notas de implementación reales (el ejecutor ajusta al código vivo): `apiFetch` y `mapPersistedPage` ya existen; verificar la forma exacta del GET (`data.pages[].contentHtml` vs `content_html`) leyendo cómo el load inicial mapea páginas, y reusar ese mapeo. `pageHasLocalChanges(page)` = comparar `normalizeHtml(page.fullContent)` vs entrada de `serverPagesRef` previa. `mergeConflictLists` = por sectionId, el remoto nuevo actualiza `remoteHtml` del conflicto existente y setea `actorName`.

- [ ] **Step 3: applyMergedToEditor (splice TipTap)**

Para la página activa: si `result.conflicts.length === 0 && result.identicalToRemote && !isDirty` → `editorRef.current.commands.setContent(result.mergedHtml)` y `setIsDirty(false)` es aceptable SOLO si no hay foco activo de escritura; si el usuario tiene cambios (isDirty), reemplazar sección por sección únicamente las de `origin: 'remote'`:

```jsx
function replaceRemoteSections(editor, mergedSections) {
  const remoteIds = new Set(mergedSections.filter((s) => s.origin === 'remote').map((s) => s.sectionId))
  if (remoteIds.size === 0) return
  // Recolectar rangos [from, to) por sección: divider → siguiente divider o fin de doc
  const ranges = []
  const doc = editor.state.doc
  const dividers = []
  doc.descendants((node, pos) => {
    if (node.type.name === 'sectionDivider') dividers.push({ pos, node })
    return true
  })
  dividers.forEach((div, i) => {
    const id = div.node.attrs.sectionId
    if (!remoteIds.has(id)) return
    const from = div.pos
    const to = i + 1 < dividers.length ? dividers[i + 1].pos : doc.content.size
    const section = mergedSections.find((s) => s.sectionId === id)
    ranges.push({ from, to, section })
  })
  // De atrás hacia adelante para no invalidar posiciones
  let chain = editor.chain()
  ranges.sort((a, b) => b.from - a.from).forEach(({ from, to, section }) => {
    const html = `<div data-section-divider data-section-id="${section.sectionId}" data-section-name="${section.sectionName}"></div>${section.innerHtml}`
    chain = chain.insertContentAt({ from, to }, html)
  })
  chain.run()
}
```

Tras el splice: correr `renumberAutoSections(editorRef.current)` + rederivar secciones (mismo flujo post-hidratación, ver `applyPageToEditor` ~2980). Secciones nuevas remotas (`origin: 'remote'` sin divider presente) se insertan al final del rango de la sección anterior según el orden de `mergedSections` (usar `insertContentAt(pos, html)` con la pos del divider siguiente en orden). Si el cursor estaba dentro de un rango reemplazado, TipTap lo remapea; verificar que no caiga en gap cursor (si pasa: `setTextSelection` al inicio del primer textblock de esa sección).

Dirty al final: si `result.identicalToRemote` y no había cambios locales → `setIsDirty(false)` (anti-eco). Si hubo cambios locales → dejar dirty (autosave guardará el doc mergeado, versiones ya al día).

- [ ] **Step 4: Conectar timbre y broadcast**

- En el effect del canal (Task 5): `onRemoteSave: (payload) => syncRemoteChangesRef.current?.({ actorName: payload.actorName })` (ref-pattern como `autosaveRunnerRef`).
- En `saveProjectPages` tras éxito (después de `setPages(persistedPages)`): actualizar `serverPagesRef` con `data.pages` y `editorChannelRef.current?.broadcastSaved({ actorName: currentUser?.fullName || currentUser?.email, pageIds: payload.map((p) => p.id), savedAt: new Date().toISOString() })`.
- Aviso discreto opcional al aplicar cambios remotos sin conflicto: `showToast({ kind: 'info', text: `${actorName} actualizó ${n} sección(es)`, autoHideMs: 3500 })`.

- [ ] **Step 5: Fix del 409**

Reemplazar el bloque del catch (~3081):

```jsx
} catch (error) {
  const isStale = String(error.message || '').includes('otra sesión')
  if (isStale && !options.retried) {
    const sync = await syncRemoteChanges({ actorName: 'Otra sesión' })
    if (!sync.error) return saveProjectPages(source, { retried: true })
    showToast({ kind: 'warning', text: 'El brief cambió en otra sesión y no se pudo sincronizar.', actionLabel: 'Actualizar', onAction: () => window.location.reload() })
    return false
  }
  ...
```

`saveProjectPages` gana segundo parámetro `options = {}`. Eliminar `autosaveBlockedRef = true` del flujo normal (solo queda para el doble-fallo). El guard del backend NO se toca.

- [ ] **Step 6: Build + commit**

Run: `cd frontend && npx vite build` → OK. `cd backend && npm test` → verde (sin cambios backend, sanity).

```bash
git add frontend/src/pages/ProjectEditor.jsx
git commit -m "feat(editor): merge automático por sección al recibir saves remotos y retry del 409"
```

---

### Task 7 (F4): Marca de conflicto + comparador

**Files:**
- Create: `frontend/src/components/editor/ConflictCompareModal.jsx` (+ `.module.css`)
- Modify: `frontend/src/pages/ProjectEditor.jsx` (marcas en panel de secciones y gutter, resolución)

- [ ] **Step 1: Marcas de conflicto**

Fuente: `conflictsByPageRef.current.get(activePageId)` (re-lee con `conflictsVersion`). Panel de secciones: punto ámbar + title "Conflicto de edición" en filas cuyo sectionId esté en conflicto. Gutter del divider (overlay del Task 5, mismo posicionamiento): chip warning "⚠ {actorName} también editó — Comparar" clickeable → abre comparador. Tokens warning (`--wb-color-warning-*`).

- [ ] **Step 2: ConflictCompareModal**

Sobre el primitive `Modal` (`open`, `onClose`, `title={'Conflicto en «' + conflict.sectionName + '»'}`). Layout dos columnas scrollables (`display: grid; grid-template-columns: 1fr 1fr`), headers "Tu versión" / "Versión de {actorName}". Contenido: `<div className={styles.preview} dangerouslySetInnerHTML={{ __html: sanitized }} />` — sanitizar ambos HTML antes de render (revisar qué usa el share/preview público para render de contenido; si existe DOMPurify u otro helper, reusarlo; si no, render con la misma técnica que la vista Preview del editor). Para `type: 'deleted-remote'`: columna remota muestra estado vacío "{actorName} eliminó esta sección".

Footer 3 botones (`Button` primitive): `Mantener la mía` (secondary), `Usar la suya` (secondary), `Insertar la suya debajo` (primary); para deleted-remote: `Mantener la mía` / `Aceptar eliminación`.

- [ ] **Step 3: Acciones de resolución**

En ProjectEditor:

```jsx
function resolveConflict(conflict, action) {
  const editor = editorRef.current
  if (action === 'keep-mine') { /* solo limpiar */ }
  if (action === 'use-theirs') {
    replaceSectionContent(editor, conflict.sectionId, conflict.remoteHtml) // mismo helper de rangos del Task 6
    setIsDirty(true)
  }
  if (action === 'insert-below') {
    const newId = generateSectionId() // usar el generador existente de ids de sección
    const html = `<div data-section-divider data-section-id="${newId}" data-section-name="${conflict.sectionName} — versión de ${conflict.actorName}"></div>${conflict.remoteHtml}`
    insertAfterSection(editor, conflict.sectionId, html)
    setIsDirty(true)
  }
  if (action === 'accept-delete') {
    removeSectionRange(editor, conflict.sectionId)
    setIsDirty(true)
  }
  const list = (conflictsByPageRef.current.get(activePageId) || []).filter((c) => c.sectionId !== conflict.sectionId)
  if (list.length) conflictsByPageRef.current.set(activePageId, list)
  else conflictsByPageRef.current.delete(activePageId)
  setConflictsVersion((v) => v + 1)
}
```

Los helpers de rango reusan la recolección de dividers del Task 6 (extraerla a función compartida en el mismo archivo). Buscar el generador de sectionId existente (grep `s_${Date.now()}` / donde se crean secciones nuevas ~3460) y reusarlo.

- [ ] **Step 4: Build + commit**

Run: `cd frontend && npx vite build` → OK.

```bash
git add frontend/src/components/editor/ConflictCompareModal.jsx frontend/src/components/editor/ConflictCompareModal.module.css frontend/src/pages/ProjectEditor.jsx
git commit -m "feat(editor): comparador de conflictos por sección con resolución humana"
```

---

### Task 8 (F5): QA de dos sesiones — lo ejecuta el ORQUESTADOR (no subagente)

Checklist (spec §F5): presencia entra/sale, merge limpio cruzado, conflicto + 3 resoluciones, anti-eco (sin PUT fantasma en Network), deleted-remote, navbar con 10+ páginas y nombre kilométrico. Dev server del usuario + `claude-bot` en Dev (usuario tipea login). Bugs encontrados → fix inline o task nuevo. Al cierre: actualizar `CONTEXT.min.md` (targets `editor.navbar`, nuevo target `editor.collab`) y proponer commit final.

---

## Orden de ejecución

- Wave 1 (paralelo): Task 1 y Task 4 (independientes).
- Wave 2 (paralelo): Task 2, Task 3 (ambos tocan navbar → secuencial entre sí: 2 luego 3) y Task 5.
- Wave 3: Task 6 (depende de 4 y 5; usa showToast de 3).
- Wave 4: Task 7 (depende de 6).
- Wave 5: Task 8 (orquestador + usuario).

Los tasks 1, 2, 3, 5, 6 y 7 tocan `ProjectEditor.jsx` → nunca dos de ellos en paralelo.
