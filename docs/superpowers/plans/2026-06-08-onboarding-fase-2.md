# Onboarding Fase 2 — Project-Type Explainers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` to implement task-by-task.

**Goal:** Show a context-specific slide-out panel the first time a user opens a project of each type (page / document / faq / brief), explaining the 3-4 things that matter about that editor.

**Architecture:** A new `ProjectTypeExplainer` component reads `tutorialState.typeExplainers[type]` and renders a fixed slide-out from the right edge if the type hasn't been seen yet. Clicking "Entendido" calls `markTypeSeen(type)`. The component is mounted in two places: `ProjectEditor.jsx` (covers page/document/faq) and `BriefProjectEditor.jsx` (covers brief). The state module already has `markTypeSeen` and `typeExplainers` shape from Fase 1.

**Tech Stack:** Same as Fase 1 — React 18, Vite, lucide-react, custom CSS modules, no new dependencies.

**Working directory:** `/Users/adrian/GitHub/webbrief/.claude/worktrees/onboarding-tutorial`

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `frontend/src/components/onboarding/ProjectTypeExplainer.jsx` | **Create** | Slide-out panel component; props `{ projectType }` |
| `frontend/src/components/onboarding/ProjectTypeExplainer.module.css` | **Create** | Layout + slide-in animation + reduced-motion |
| `frontend/src/pages/ProjectEditor.jsx` | **Modify** | Mount `<ProjectTypeExplainer projectType={projectType} />` once project loaded |
| `frontend/src/components/BriefProjectEditor.jsx` (or wherever it lives) | **Modify** | Mount `<ProjectTypeExplainer projectType="brief" />` |

---

## Task T2.1: Create ProjectTypeExplainer component

**Files:**
- Create: `frontend/src/components/onboarding/ProjectTypeExplainer.jsx`
- Create: `frontend/src/components/onboarding/ProjectTypeExplainer.module.css`

### Step 1: Write the CSS module

```css
.wrap {
  position: fixed;
  top: 64px; /* keep literal — matches editor navbar height; no token */
  right: 0;
  bottom: 0;
  width: 360px;
  z-index: var(--wb-z-overlay);
  background: var(--wb-surface);
  border-left: 1px solid var(--wb-border);
  box-shadow: var(--wb-shadow-xl);
  display: flex;
  flex-direction: column;
  animation: slideIn 240ms cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes slideIn {
  from { transform: translateX(100%); }
  to { transform: translateX(0); }
}

@media (prefers-reduced-motion: reduce) {
  .wrap {
    animation: none;
  }
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--wb-space-3);
  padding: var(--wb-space-4) var(--wb-space-5);
  border-bottom: 1px solid var(--wb-border);
}

.headerMain {
  display: flex;
  align-items: center;
  gap: var(--wb-space-3);
  min-width: 0;
}

.headerIcon {
  display: inline-flex;
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  align-items: center;
  justify-content: center;
  background: var(--wb-color-primary-100);
  color: var(--wb-color-primary-700);
  border-radius: var(--wb-radius-full);
}

.headerTitle {
  margin: 0;
  font-size: var(--wb-text-base);
  font-weight: var(--wb-weight-semibold);
  color: var(--wb-text);
}

.close {
  appearance: none;
  background: transparent;
  border: none;
  color: var(--wb-color-neutral-500);
  cursor: pointer;
  padding: 6px;
  border-radius: var(--wb-radius-2);
  display: inline-flex;
}

.close:hover {
  background: var(--wb-color-neutral-100);
  color: var(--wb-text);
}

.body {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: var(--wb-space-4);
  padding: var(--wb-space-5);
  overflow-y: auto;
}

.bullet {
  display: flex;
  gap: var(--wb-space-3);
  align-items: flex-start;
}

.bulletIcon {
  display: inline-flex;
  flex-shrink: 0;
  color: var(--wb-color-primary-600);
  margin-top: 2px; /* keep literal — visual alignment with first line of text */
}

.bulletText {
  margin: 0;
  font-size: var(--wb-text-sm);
  line-height: var(--wb-leading-relaxed);
  color: var(--wb-text);
}

.footer {
  display: flex;
  justify-content: flex-end;
  padding: var(--wb-space-4) var(--wb-space-5);
  border-top: 1px solid var(--wb-border);
}
```

### Step 2: Write the JSX component

```jsx
import React, { useEffect, useState } from 'react';
import {
  Globe,
  FileText,
  HelpCircle,
  ClipboardList,
  X,
  Layers,
  Type,
  Eye,
  MessageSquare,
  Ruler,
  Search,
  FileQuestion,
  FileDown,
  Plus,
  UserCheck,
  Upload,
  Link2,
} from 'lucide-react';
import { Button } from '../ui';
import { getTutorialState, markTypeSeen, isOnboardingActive } from '../../lib/tutorialState';
import styles from './ProjectTypeExplainer.module.css';

const TYPE_CONTENT = {
  page: {
    title: 'Cómo funciona Página Web',
    Icon: Globe,
    bullets: [
      { Icon: Layers, text: 'Multi-página: cambia con las pills del navbar superior. Cada página se divide en secciones que ves en el panel izquierdo.' },
      { Icon: Type, text: 'Doble click en el título de una sección para renombrarla.' },
      { Icon: Eye, text: '3 modos: Brief (edición), Handoff (entregable para Dev/Designer) y Preview (cómo lo ve el cliente).' },
      { Icon: MessageSquare, text: 'Comentarios anclados a texto: selecciona y haz click derecho para crear uno.' },
    ],
  },
  document: {
    title: 'Cómo funciona Artículo',
    Icon: FileText,
    bullets: [
      { Icon: Layers, text: 'Editor lineal: sin secciones, la jerarquía se forma con H1/H2/H3.' },
      { Icon: Ruler, text: 'Reglas de contenido (panel inferior derecho): título, meta, slug y máx. palabras.' },
      { Icon: Search, text: 'SEO metadata en el navbar (icono lápiz) — aparece al final del handoff Dev.' },
      { Icon: MessageSquare, text: 'Comentarios anclados igual que en Página Web.' },
    ],
  },
  faq: {
    title: 'Cómo funciona FAQs',
    Icon: HelpCircle,
    bullets: [
      { Icon: FileQuestion, text: 'Cada pregunta es una sección. El primer H2 o H3 del bloque es la pregunta.' },
      { Icon: Plus, text: 'Botón "+" del navbar abre un modal con textarea para crear preguntas largas.' },
      { Icon: FileDown, text: 'Exporta a CSV desde el menú de la página.' },
      { Icon: Layers, text: 'El panel de secciones lista preguntas con el rótulo "Pregunta Frecuente N".' },
    ],
  },
  brief: {
    title: 'Cómo funciona Brief',
    Icon: ClipboardList,
    bullets: [
      { Icon: Link2, text: 'Este editor es para el cliente — link público /b/:token sin login.' },
      { Icon: FileQuestion, text: 'Define preguntas tipo: encabezado, texto corto/largo, opción única/múltiple, archivo.' },
      { Icon: Upload, text: 'Presupuesto de 500 MB por proyecto para los uploads del cliente (PDF, imágenes, Office).' },
      { Icon: UserCheck, text: 'El cliente ve un formulario simple, no este editor.' },
    ],
  },
};

export default function ProjectTypeExplainer({ projectType }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!projectType || !TYPE_CONTENT[projectType]) return undefined;
    const state = getTutorialState();
    // Show only if user is onboarding-active and hasn't seen this type yet
    if (!isOnboardingActive(state)) return undefined;
    if (state.typeExplainers[projectType]) return undefined;
    // Defer one paint so the editor settles first
    const id = window.requestAnimationFrame(() => setOpen(true));
    return () => window.cancelAnimationFrame(id);
  }, [projectType]);

  // ESC closes
  useEffect(() => {
    if (!open) return undefined;
    function onKey(e) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        handleClose();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  function handleClose() {
    markTypeSeen(projectType);
    setOpen(false);
  }

  if (!open) return null;
  const content = TYPE_CONTENT[projectType];
  if (!content) return null;
  const HeaderIcon = content.Icon;

  return (
    <aside className={styles.wrap} role="complementary" aria-label={content.title}>
      <header className={styles.header}>
        <div className={styles.headerMain}>
          <span className={styles.headerIcon} aria-hidden="true">
            <HeaderIcon size={18} />
          </span>
          <h2 className={styles.headerTitle}>{content.title}</h2>
        </div>
        <button
          type="button"
          className={styles.close}
          onClick={handleClose}
          aria-label="Cerrar explicación"
        >
          <X size={16} aria-hidden="true" />
        </button>
      </header>

      <div className={styles.body}>
        {content.bullets.map((b, i) => {
          const BulletIcon = b.Icon;
          return (
            <div key={i} className={styles.bullet}>
              <span className={styles.bulletIcon} aria-hidden="true">
                <BulletIcon size={16} />
              </span>
              <p className={styles.bulletText}>{b.text}</p>
            </div>
          );
        })}
      </div>

      <div className={styles.footer}>
        <Button variant="primary" onClick={handleClose}>
          Entendido
        </Button>
      </div>
    </aside>
  );
}
```

### Step 3: Verify build

```bash
cd /Users/adrian/GitHub/webbrief/.claude/worktrees/onboarding-tutorial/frontend
npx vite build --mode development 2>&1 | tail -5
```

### Step 4: Commit

```bash
git add frontend/src/components/onboarding/ProjectTypeExplainer.jsx frontend/src/components/onboarding/ProjectTypeExplainer.module.css
git commit -m "feat(onboarding): add ProjectTypeExplainer component"
```

---

## Task T2.2: Mount in ProjectEditor.jsx

**Files:**
- Modify: `frontend/src/pages/ProjectEditor.jsx`

### Step 1: Read ProjectEditor.jsx to find where projectType is available

```bash
cd /Users/adrian/GitHub/webbrief/.claude/worktrees/onboarding-tutorial
grep -n "projectType\|project_type" frontend/src/pages/ProjectEditor.jsx | head -15
```

The variable `projectType` (or similar — likely derived from `project.project_type`) should already be available in scope, used by existing rendering branches.

### Step 2: Add the import

Add near the other component imports:

```jsx
import ProjectTypeExplainer from '../components/onboarding/ProjectTypeExplainer'
```

### Step 3: Mount the component

In the JSX return tree of `ProjectEditor`, AFTER the existing render of the 3-column editor (but inside the same root container, so the slide-out's `position: fixed` works correctly), add:

```jsx
{!loadingProject && projectType && projectType !== 'brief' && (
  <ProjectTypeExplainer projectType={projectType} />
)}
```

Note: `projectType !== 'brief'` because brief mounts its own explainer in `BriefProjectEditor`. Use `loadingProject` (or whatever loading flag this file uses) to wait for the project to load — DO NOT mount on a null projectType.

If the loading flag is named differently (e.g., `isLoading`, `loadingState === 'loaded'`), use the actual name.

### Step 4: Verify build + commit

```bash
cd /Users/adrian/GitHub/webbrief/.claude/worktrees/onboarding-tutorial/frontend
npx vite build --mode development 2>&1 | tail -5
cd ..
git add frontend/src/pages/ProjectEditor.jsx
git commit -m "feat(onboarding): mount ProjectTypeExplainer in ProjectEditor"
```

---

## Task T2.3: Mount in BriefProjectEditor

**Files:**
- Modify: `frontend/src/components/BriefProjectEditor.jsx` (verify path — could be `frontend/src/pages/BriefProjectEditor.jsx` or `frontend/src/components/editor/BriefProjectEditor.jsx`)

### Step 1: Find the file

```bash
cd /Users/adrian/GitHub/webbrief/.claude/worktrees/onboarding-tutorial
find frontend/src -name "BriefProjectEditor*" -type f
```

### Step 2: Add the import + mount

```jsx
import ProjectTypeExplainer from '../components/onboarding/ProjectTypeExplainer'
// adapt relative path to the actual file location
```

Mount inside the BriefProjectEditor's return tree:

```jsx
<ProjectTypeExplainer projectType="brief" />
```

It's safe to mount unconditionally because the component checks `isOnboardingActive` and `typeExplainers.brief` internally. No loading guard needed (the brief editor is the same component for both new and existing projects).

### Step 3: Verify build + commit

```bash
cd /Users/adrian/GitHub/webbrief/.claude/worktrees/onboarding-tutorial/frontend
npx vite build --mode development 2>&1 | tail -5
cd ..
git add  # the BriefProjectEditor file
git commit -m "feat(onboarding): mount ProjectTypeExplainer in BriefProjectEditor"
```

---

## Task T2.4: E2E verification

The orchestrator (controller) runs these checks:

1. Build succeeds across all 3 commits
2. Component module loads cleanly via preview MCP
3. `markTypeSeen('page')` updates typeExplainers.page correctly
4. The component returns null when `typeExplainers[type]` is already set
5. No regression in ProjectEditor / BriefProjectEditor existing flows
6. Reduced-motion media query disables the slide animation

---

## Self-Review

- [x] Spec coverage: T2.1 creates the component; T2.2 mounts for page/doc/faq; T2.3 mounts for brief; T2.4 verifies.
- [x] No placeholders.
- [x] API consistency: uses `markTypeSeen`, `isOnboardingActive`, `getTutorialState` — all exist from Fase 1.
- [x] No new dependencies.
