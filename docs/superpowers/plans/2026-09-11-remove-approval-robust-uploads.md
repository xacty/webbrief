# Quitar la aprobación de cambios + subidas de imágenes robustas — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Todos los roles con permiso de escritura publican directo (se elimina el sistema de propuestas de diseño) y ninguna imagen subida se pierde en silencio.

**Architecture:** La Parte A borra el flujo de propuestas en el backend (`backend/src/routes/projects.js`, `backend/src/lib/assetReferences.js`) y en el frontend (`ProjectEditor.jsx`, las libs de diff y ordenamiento, las capacidades de rol). La Parte B mueve el filtro de marcadores `blob:` al borde de persistencia (payload del PUT, para todas las páginas), agrega en `ProjectEditor` un registro de subidas en curso con inserción de respaldo y avisos, y muestra "Subiendo…" sobre el marcador.

**Tech Stack:** Node/Express + Supabase (backend), React + TipTap v3 + Vite (frontend), tests `node:test` en `backend/test/` (los tests de libs del frontend importan `../../frontend/src/lib/...`).

**Spec:** `docs/superpowers/specs/2026-09-11-remove-approval-robust-uploads-design.md`

---

## Convenciones para todas las tareas

- **Rama:** `fix/remove-approval-robust-uploads` (ya creada desde `main`, con el spec commiteado).
- **Orden obligatorio de ejecución:** A1 → A2 → A3 → A5 → A6 → A4 → B1 → B2 → B3 → B4 → B5 → Q1 → R1. A4 va después de A6 porque borra libs que `ProjectEditor.jsx` importa hasta que A6 quita esos imports; así el build nunca queda roto. Las partes A y B tocan `frontend/src/pages/ProjectEditor.jsx`, así que nunca se ejecutan en paralelo.
- **Anclas dependientes:** algunos pasos buscan código tal como queda después de un paso anterior (por ejemplo, el import de `pendingUploads` que B2 cambia y B3 amplía). Si un ancla no aparece, primero revisa que el paso previo esté aplicado.
- **Tests del backend:** `cd /Users/adrian/GitHub/webbrief/backend && npm test` (equivale a `NODE_ENV=test node --test`).
- **Build del frontend:** `cd /Users/adrian/GitHub/webbrief/frontend && npm run build` (el frontend no tiene script de lint).
- **Nunca stagear cambios ajenos.** El working tree tiene cambios sin commitear de otro trabajo (CSP): `.claude/settings.local.json`, `deploy/nginx/*`, `frontend/index.html`, `frontend/package.json` y `frontend/package-lock.json`. Usar siempre `git add <rutas explícitas>` o `git rm <ruta>`, nunca `-A` ni `.`.
- **Commits:** en español neutro, formato conventional; el cuerpo termina con la línea `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- **Referencias al código:** por strings ancla únicos, no por número de línea (las tareas anteriores los desplazan).
- **Idioma:** español neutro en UI, comentarios y docs (sin voseo: "haz", "puedes", "tienes").

## Parte A — Backend: eliminar el sistema de propuestas de diseño

Sección del plan correspondiente a "Parte A — Eliminar el sistema de propuestas" del diseño aprobado
(`docs/superpowers/specs/2026-09-11-remove-approval-robust-uploads-design.md`), limitada al backend:
`backend/src/routes/projects.js` y `backend/src/lib/assetReferences.js` (+ su test).

## Notas de contexto (verificadas antes de planear)

- **Ningún import queda sin uso en `projects.js`.** Se revisó cada import que aparece dentro del código a
  borrar (`isMissingTableError`, `createProjectNotifications`, `sanitizeContentHtml`, `getCompanyRole`) y
  los cuatro se siguen usando en rutas que no tienen nada que ver con propuestas (ejemplos:
  `isMissingTableError` en `createPageVersion` y en `/:id/activity`; `createProjectNotifications` en el
  guardado manual y en `/:id/pages/:pageId/review`; `sanitizeContentHtml` en el guardado manual de
  `PUT /:id/pages`; `getCompanyRole` en `canExportProjectAsset`). Ningún import se toca en la Task A1.
- **En `assetReferences.js` sí queda un import sin uso**: `isMissingTableError` (de `./projectAccess.js`)
  solo se usaba para la consulta a `project_page_change_proposals` que la Task A2 elimina. Se retira en A2.
- **Sin consumidores fuera de este backend.** `rg -ni "proposal"` en `mcp/webrief-server/` y en `shared/`
  no da ningún resultado — confirma lo que dice el diseño ("El MCP no tiene referencias a propuestas").
  `backend/src/routes/library.js` (el único otro caller de `findReferencedAssetIds`) tampoco menciona
  propuestas en sus comentarios, no necesita cambios.
- **Cobertura de test existente:** ninguna suite ejercita `isDesignerProposalMode`, el overlay de
  `GET /:id` ni la ruta de decisión directamente (mockear `supabaseAdmin` es costoso — mismo criterio ya
  documentado en el propio repo, ver comentario de `test/companies-create.test.js`). Por eso la Task A1
  se verifica con `node --check` + barrido `rg` + no-regresión de la suite completa (mismo pass/fail antes
  y después), no con un ciclo rojo→verde. La Task A2 sí tiene cobertura directa de la función pura
  `extractReferencedAssetIds` y ahí se sigue TDD real (se edita el test primero, se corre, y solo
  entonces se toca el código fuente).
- **Barrido de verificación de identificadores:** se confirmó con `rg -ni "proposal|propuesta"` que
  *todas* las menciones (inglés y español) en los tres archivos tocados caen dentro de los bloques que
  estas dos tareas borran o reescriben — no queda ninguna mención suelta fuera de los pasos descritos
  abajo. Los comandos de verificación de cada task usan ese mismo patrón combinado.
- **Fuera de alcance de A1/A2 (para que el orquestador lo asigne a otra sección):** `mcp/webrief-server/`
  y `shared/` no requieren cambios (confirmado arriba). `frontend/` (proposalSaved, ProposalReviewPanel,
  etc.) está fuera de esta sección. `CONTEXT.min.md` y `CONTEXT.md` documentan el flujo de propuestas en
  varios lugares (`target=editor.proposals`, el drift de la tabla en Prod, la sección de notificaciones)
  y van a quedar desactualizados hasta que la tarea de documentación del plan los toque — no se editan acá
  porque el diseño los trata en su propia sección ("Despliegue y versión"). El bump de versión
  (`frontend/package.json` → 2.16.0, MINOR) tampoco es parte de esta sección backend: según
  `CLAUDE.md` un solo bump cubre todo el cambio deployable, así que debe aplicarse una sola vez para el
  conjunto de Parte A + Parte B, no repetirse en cada task.

---

### Task A1: Quitar el flujo de propuestas de diseño de `backend/src/routes/projects.js`

**Files:**
- Modificar: `backend/src/routes/projects.js`

- [ ] **Step 1: Confirmar la línea base de tests antes de tocar el archivo**

  Ejecuta la suite completa del backend y anota el resultado — sirve de referencia para comparar después
  de cada task de este plan (si otra sección corrió antes y ya sumó o quitó tests, el número total puede
  no ser 392; lo que importa es que `fail` sea 0 antes y después):

  ```bash
  cd /Users/adrian/GitHub/webbrief/backend && NODE_ENV=test node --test 2>&1 | tail -10
  ```

  Salida esperada (capturada al escribir este plan, puede variar el total de `tests`/`pass` si otra
  sección del plan ya corrió antes, pero `fail` debe ser 0):
  ```
  ℹ tests 392
  ℹ suites 1
  ℹ pass 392
  ℹ fail 0
  ℹ cancelled 0
  ℹ skipped 0
  ℹ todo 0
  ```

- [ ] **Step 2: Borrar los helpers `normalizeProposalStatus`, `loadPendingPageProposals` y `upsertDesignerProposals`**

  Ubica este bloque completo (empieza en `function normalizeProposalStatus` y termina en el `}` que
  cierra `upsertDesignerProposals`, con la línea en blanco final incluida — la línea previa,
  `summarizeSavedPages`, y la siguiente, `extractSectionsSnapshot`, no se tocan):

  ```js
  function normalizeProposalStatus(value) {
    return ['pending', 'accepted', 'rejected'].includes(value) ? value : 'pending'
  }

  async function loadPendingPageProposals(projectId, companyId, currentUser) {
    if (!projectPageChangeProposalsTableAvailable) return []

    const companyRole = getCompanyRole(currentUser, companyId)
    const isAdmin = currentUser?.platformRole === 'admin'
    const isReviewer = isAdmin || ['admin', 'manager', 'editor'].includes(companyRole)
    const isDesigner = companyRole === 'designer'

    if (!isReviewer && !isDesigner) return []

    let query = supabaseAdmin
      .from('project_page_change_proposals')
      .select('id, project_id, page_id, proposer_user_id, content_html, content_json, seo_metadata, status, reviewer_user_id, reviewer_note, reviewed_at, created_at, updated_at')
      .eq('project_id', projectId)
      .eq('status', 'pending')
      .order('updated_at', { ascending: false })

    if (isDesigner && !isReviewer) {
      query = query.eq('proposer_user_id', currentUser.id)
    }

    const { data, error } = await query
    if (error) {
      if (isMissingTableError(error, 'project_page_change_proposals')) {
        projectPageChangeProposalsTableAvailable = false
        return []
      }
      throw error
    }

    const latestByPage = new Map()
    for (const proposal of data || []) {
      if (!latestByPage.has(proposal.page_id)) {
        latestByPage.set(proposal.page_id, proposal)
      }
    }

    return [...latestByPage.values()]
  }

  async function upsertDesignerProposals({ project, pages, currentUser, canEditProjectMeta }) {
    if (!projectPageChangeProposalsTableAvailable) {
      return { missingTable: true, proposals: [] }
    }

    const timestamp = new Date().toISOString()
    const inserted = []

    for (const page of pages) {
      const { data: existingProposal, error: existingProposalError } = await supabaseAdmin
        .from('project_page_change_proposals')
        .select('id')
        .eq('project_id', project.id)
        .eq('page_id', page.id)
        .eq('proposer_user_id', currentUser.id)
        .eq('status', 'pending')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (existingProposalError) {
        if (isMissingTableError(existingProposalError, 'project_page_change_proposals')) {
          projectPageChangeProposalsTableAvailable = false
          return { missingTable: true, proposals: [] }
        }
        throw existingProposalError
      }

      const proposalPayload = {
        project_id: project.id,
        page_id: page.id,
        proposer_user_id: currentUser.id,
        // Saneo en el punto de escritura: la propuesta la escribe un designer y se
        // renderiza en la sesion del admin/manager que la revisa (ProposalReviewPanel).
        content_html: sanitizeContentHtml(page.contentHtml) || '<p></p>',
        content_json: page.contentJson || null,
        seo_metadata: page.seoMetadata && typeof page.seoMetadata === 'object' ? page.seoMetadata : {},
        updated_at: timestamp,
      }

      let data
      let error

      if (existingProposal?.id) {
        ({ data, error } = await supabaseAdmin
          .from('project_page_change_proposals')
          .update(proposalPayload)
          .eq('id', existingProposal.id)
          .select('id, project_id, page_id, proposer_user_id, content_html, content_json, seo_metadata, status, reviewer_user_id, reviewer_note, reviewed_at, created_at, updated_at')
          .single())
      } else {
        ({ data, error } = await supabaseAdmin
          .from('project_page_change_proposals')
          .insert({
            ...proposalPayload,
            created_at: timestamp,
            status: 'pending',
          })
          .select('id, project_id, page_id, proposer_user_id, content_html, content_json, seo_metadata, status, reviewer_user_id, reviewer_note, reviewed_at, created_at, updated_at')
          .single())
      }

      if (error) {
        if (isMissingTableError(error, 'project_page_change_proposals')) {
          projectPageChangeProposalsTableAvailable = false
          return { missingTable: true, proposals: [] }
        }
        throw error
      }

      inserted.push(data)
    }

    await supabaseAdmin
      .from('projects')
      .update({ updated_at: timestamp })
      .eq('id', project.id)

    await logProjectActivity({
      projectId: project.id,
      currentUser,
      eventType: 'designer_proposal_saved',
      subjectType: 'proposal',
      title: 'Propuesta de diseño guardada',
      description: summarizeSavedPages(pages),
      metadata: {
        pageIds: pages.map((page) => page.id),
        pageNames: pages.map((page) => page.name),
        canEditProjectMeta,
      },
    })

    await createProjectNotifications({
      projectId: project.id,
      currentUser,
      eventType: 'designer_proposal_saved',
      title: 'Nueva propuesta de diseño',
      body: `${currentUser.fullName || currentUser.email || 'Usuario'} dejó cambios pendientes de aprobación.`,
      metadata: {
        pageIds: pages.map((page) => page.id),
        pageNames: pages.map((page) => page.name),
      },
    })

    return { missingTable: false, proposals: inserted }
  }

  ```

  Reemplázalo por nada (borra el bloque completo, incluida la línea en blanco final que se muestra
  arriba después del último `}`) — la línea en blanco que ya existe antes de `function
  normalizeProposalStatus` queda como único separador con `function extractSectionsSnapshot(html = '') {`.

  Verificación:
  ```bash
  node --check backend/src/routes/projects.js
  ```
  Esperado: sin salida (exit code 0).

- [ ] **Step 3: Quitar el overlay de propuesta pendiente en `GET /:id` — declaraciones**

  Ubica (dentro de `router.get('/:id', ...)`):

  ```js
      const persistedPages = pages || []
      const pendingProposals = await loadPendingPageProposals(project.id, project.company_id, req.currentUser)
      const pendingProposalMap = new Map(pendingProposals.map((proposal) => [proposal.page_id, proposal]))
      const inferredProjectType = inferProjectType(project, persistedPages)
      const currentRole = getCompanyRole(req.currentUser, project.company_id)
      const shouldOverlayDesignerProposal = currentRole === 'designer' && req.currentUser.platformRole !== 'admin'

      const companyName = project.company?.name || ''
  ```

  Reemplázalo por:

  ```js
      const persistedPages = pages || []
      const inferredProjectType = inferProjectType(project, persistedPages)

      const companyName = project.company?.name || ''
  ```

  Verificación:
  ```bash
  node --check backend/src/routes/projects.js
  ```
  Esperado: sin salida (exit code 0).

- [ ] **Step 4: Quitar el overlay de propuesta pendiente en `GET /:id` — objeto de cada página**

  Ubica (misma ruta, dentro de `pages: persistedPages.map((page) => ({ ... }))`):

  ```js
        pages: persistedPages.map((page) => ({
          id: page.id,
          name: page.name,
          position: page.position,
          contentHtml: shouldOverlayDesignerProposal && pendingProposalMap.get(page.id)?.content_html
            ? pendingProposalMap.get(page.id).content_html
            : page.content_html,
          contentJson: shouldOverlayDesignerProposal && pendingProposalMap.get(page.id)?.content_json
            ? pendingProposalMap.get(page.id).content_json
            : page.content_json || null,
          seoMetadata: shouldOverlayDesignerProposal && pendingProposalMap.get(page.id)?.seo_metadata
            ? pendingProposalMap.get(page.id).seo_metadata
            : page.seo_metadata || {},
          contentRules: page.content_rules || {},
          version: page.version || 1,
          reviewStatus: page.review_status || 'draft',
          reviewBaselineVersionId: page.review_baseline_version_id || null,
          reviewBaselineAt: page.review_baseline_at || null,
          reviewRequestedBy: page.review_requested_by || null,
          pendingProposal: pendingProposalMap.get(page.id)
            ? {
                id: pendingProposalMap.get(page.id).id,
                proposerUserId: pendingProposalMap.get(page.id).proposer_user_id,
                contentHtml: pendingProposalMap.get(page.id).content_html,
                contentJson: pendingProposalMap.get(page.id).content_json || null,
                seoMetadata: pendingProposalMap.get(page.id).seo_metadata || {},
                status: normalizeProposalStatus(pendingProposalMap.get(page.id).status),
                reviewerUserId: pendingProposalMap.get(page.id).reviewer_user_id,
                reviewerNote: pendingProposalMap.get(page.id).reviewer_note || '',
                reviewedAt: pendingProposalMap.get(page.id).reviewed_at || null,
                createdAt: pendingProposalMap.get(page.id).created_at,
                updatedAt: pendingProposalMap.get(page.id).updated_at,
              }
            : null,
          updatedAt: page.updated_at,
        })),
  ```

  Reemplázalo por:

  ```js
        pages: persistedPages.map((page) => ({
          id: page.id,
          name: page.name,
          position: page.position,
          contentHtml: page.content_html,
          contentJson: page.content_json || null,
          seoMetadata: page.seo_metadata || {},
          contentRules: page.content_rules || {},
          version: page.version || 1,
          reviewStatus: page.review_status || 'draft',
          reviewBaselineVersionId: page.review_baseline_version_id || null,
          reviewBaselineAt: page.review_baseline_at || null,
          reviewRequestedBy: page.review_requested_by || null,
          updatedAt: page.updated_at,
        })),
  ```

  Verificación:
  ```bash
  node --check backend/src/routes/projects.js
  ```
  Esperado: sin salida (exit code 0).

- [ ] **Step 5: Quitar `isDesignerProposalMode` en `PUT /:id/pages` — declaraciones**

  Ubica (dentro de `router.put('/:id/pages', ...)`, justo después de `getProjectById`):

  ```js
      const companyRole = getCompanyRole(req.currentUser, project.company_id)
      const isDesignerProposalMode = req.currentUser.platformRole !== 'admin' && companyRole === 'designer'
      const canEditProjectStructure = canManageProjectStructure(req.currentUser, project.company_id)
      const canEditProjectMeta = canManageProjectMeta(req.currentUser, project.company_id)
  ```

  Reemplázalo por:

  ```js
      const canEditProjectStructure = canManageProjectStructure(req.currentUser, project.company_id)
      const canEditProjectMeta = canManageProjectMeta(req.currentUser, project.company_id)
  ```

  (`canEditProjectStructure` y `canEditProjectMeta` se siguen usando más abajo en la misma ruta — no se
  tocan.)

  Verificación:
  ```bash
  node --check backend/src/routes/projects.js
  ```
  Esperado: sin salida (exit code 0).

- [ ] **Step 6: Borrar la rama `if (isDesignerProposalMode)` completa de `PUT /:id/pages`**

  Ubica este bloque (empieza en `if (isDesignerProposalMode) {`, termina en la línea `const
  existingVersionMap = projectPageVersionColumnAvailable` que sigue — esa línea es el comienzo del
  camino normal, compartido por todos los roles, y se conserva):

  ```js
      if (isDesignerProposalMode) {
        const proposalResult = await upsertDesignerProposals({
          project,
          pages,
          currentUser: req.currentUser,
          canEditProjectMeta,
        })

        if (proposalResult.missingTable) {
          return res.status(500).json({
            error: 'Falta la tabla project_page_change_proposals en Supabase. Ejecuta la migración antes de guardar propuestas de diseño.',
            missingTable: 'project_page_change_proposals',
          })
        }

        const proposalMap = new Map(proposalResult.proposals.map((proposal) => [proposal.page_id, proposal]))
        return res.json({
          proposalSaved: true,
          pages: pages.map((page, index) => ({
            id: page.id,
            name: page.name?.trim() || `Pagina ${index + 1}`,
            position: index,
            contentHtml: page.contentHtml || '<p></p>',
            contentJson: page.contentJson || null,
            seoMetadata: page.seoMetadata || {},
            contentRules: page.contentRules && typeof page.contentRules === 'object' ? page.contentRules : {},
            version: page.version || 1,
            reviewStatus: page.reviewStatus || 'draft',
            reviewBaselineVersionId: page.reviewBaselineVersionId || null,
            reviewBaselineAt: page.reviewBaselineAt || null,
            reviewRequestedBy: page.reviewRequestedBy || null,
            pendingProposal: proposalMap.get(page.id)
              ? {
                  id: proposalMap.get(page.id).id,
                  proposerUserId: proposalMap.get(page.id).proposer_user_id,
                  contentHtml: proposalMap.get(page.id).content_html,
                  contentJson: proposalMap.get(page.id).content_json || null,
                  seoMetadata: proposalMap.get(page.id).seo_metadata || {},
                  status: proposalMap.get(page.id).status,
                  reviewerUserId: proposalMap.get(page.id).reviewer_user_id,
                  reviewerNote: proposalMap.get(page.id).reviewer_note || '',
                  reviewedAt: proposalMap.get(page.id).reviewed_at || null,
                  createdAt: proposalMap.get(page.id).created_at,
                  updatedAt: proposalMap.get(page.id).updated_at,
                }
              : null,
          })),
          savedAt: timestamp,
        })
      }

      const existingVersionMap = projectPageVersionColumnAvailable
  ```

  Reemplázalo por (deja que el guardado de Diseño caiga directo en el camino normal — el mismo que ya
  usan el resto de roles, con guard de versión 409, saneo, actividad por sección y auto-resolución de
  comentarios huérfanos):

  ```js
      const existingVersionMap = projectPageVersionColumnAvailable
  ```

  Verificación:
  ```bash
  node --check backend/src/routes/projects.js
  ```
  Esperado: sin salida (exit code 0).

- [ ] **Step 7: Borrar la ruta `POST /:id/pages/:pageId/proposals/:proposalId/decision`**

  Ubica este bloque completo (empieza en `router.post('/:id/pages/:pageId/proposals/:proposalId/decision'`
  y termina en el `})` que cierra el handler, seguido de la línea en blanco antes de
  `router.get('/:id/activity', ...)`, que no se toca):

  ```js
  router.post('/:id/pages/:pageId/proposals/:proposalId/decision', async (req, res) => {
    const status = req.body?.status
    const reviewerNote = String(req.body?.reviewerNote || '').trim() || null

    if (!['accepted', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'status debe ser accepted o rejected' })
    }

    try {
      const project = await getProjectById(req.params.id, req.currentUser)
      if (!project) return res.status(404).json({ error: 'Proyecto no encontrado' })
      if (!canManageProjectMeta(req.currentUser, project.company_id)) {
        return res.status(403).json({ error: 'Tu rol no puede revisar propuestas de diseño' })
      }
      if (!projectPageChangeProposalsTableAvailable) {
        return res.status(500).json({ error: 'Falta la tabla project_page_change_proposals. Ejecuta la migración de Supabase.' })
      }

      const { data: proposal, error: proposalError } = await supabaseAdmin
        .from('project_page_change_proposals')
        .select('id, project_id, page_id, proposer_user_id, content_html, content_json, seo_metadata, status, reviewer_user_id, reviewer_note, reviewed_at, created_at, updated_at')
        .eq('id', req.params.proposalId)
        .eq('project_id', project.id)
        .eq('page_id', req.params.pageId)
        .maybeSingle()

      if (proposalError) {
        if (isMissingTableError(proposalError, 'project_page_change_proposals')) {
          projectPageChangeProposalsTableAvailable = false
          return res.status(500).json({ error: 'Falta la tabla project_page_change_proposals. Ejecuta la migración de Supabase.' })
        }
        return res.status(500).json({ error: proposalError.message })
      }

      if (!proposal || proposal.status !== 'pending') {
        return res.status(404).json({ error: 'Propuesta pendiente no encontrada' })
      }

      const timestamp = new Date().toISOString()

      // Columnas seleccionadas de vuelta tras el UPDATE, en el mismo shape que
      // GET /:id devuelve por página — así el frontend puede rehidratar el
      // estado local con la respuesta de este endpoint sin un GET completo
      // adicional (ver frontend handleDesignerProposalDecision).
      const updatedPageColumns = [
        'id',
        'name',
        'position',
        'content_html',
        projectPageContentJsonColumnAvailable ? 'content_json' : null,
        projectPageSeoMetadataColumnAvailable ? 'seo_metadata' : null,
        projectPageContentRulesColumnAvailable ? 'content_rules' : null,
        projectPageVersionColumnAvailable ? 'version' : null,
        projectPageReviewColumnsAvailable ? 'review_status' : null,
        projectPageReviewColumnsAvailable ? 'review_baseline_version_id' : null,
        projectPageReviewColumnsAvailable ? 'review_baseline_at' : null,
        projectPageReviewColumnsAvailable ? 'review_requested_by' : null,
        'updated_at',
      ].filter(Boolean).join(', ')

      let updatedPage = null

      if (status === 'accepted') {
        const pageUpdates = {
          content_html: proposal.content_html || '<p></p>',
          updated_at: timestamp,
        }
        if (projectPageContentJsonColumnAvailable) pageUpdates.content_json = proposal.content_json || null
        if (projectPageSeoMetadataColumnAvailable) pageUpdates.seo_metadata = proposal.seo_metadata || {}
        if (projectPageVersionColumnAvailable) {
          const { data: pageVersionRow } = await supabaseAdmin
            .from('project_pages')
            .select('version')
            .eq('id', req.params.pageId)
            .maybeSingle()
          pageUpdates.version = (pageVersionRow?.version || 1) + 1
        }
        if (projectPageReviewColumnsAvailable) {
          pageUpdates.review_status = 'approved'
        }

        const { data: updatedPageRow, error: pageUpdateError } = await supabaseAdmin
          .from('project_pages')
          .update(pageUpdates)
          .eq('id', req.params.pageId)
          .eq('project_id', project.id)
          .select(updatedPageColumns)
          .maybeSingle()

        if (pageUpdateError) return res.status(500).json({ error: pageUpdateError.message })
        updatedPage = updatedPageRow
      } else if (projectPageReviewColumnsAvailable) {
        const { data: updatedPageRow } = await supabaseAdmin
          .from('project_pages')
          .update({ review_status: 'changes_requested', updated_at: timestamp })
          .eq('id', req.params.pageId)
          .eq('project_id', project.id)
          .select(updatedPageColumns)
          .maybeSingle()
        updatedPage = updatedPageRow
      }

      const { data: decidedProposal, error: proposalUpdateError } = await supabaseAdmin
        .from('project_page_change_proposals')
        .update({
          status,
          reviewer_user_id: req.currentUser.id,
          reviewer_note: reviewerNote,
          reviewed_at: timestamp,
          updated_at: timestamp,
        })
        .eq('id', proposal.id)
        .select('id, project_id, page_id, proposer_user_id, content_html, content_json, seo_metadata, status, reviewer_user_id, reviewer_note, reviewed_at, created_at, updated_at')
        .single()

      if (proposalUpdateError) return res.status(500).json({ error: proposalUpdateError.message })

      await logProjectActivity({
        projectId: project.id,
        currentUser: req.currentUser,
        eventType: status === 'accepted' ? 'designer_proposal_accepted' : 'designer_proposal_rejected',
        subjectType: 'proposal',
        subjectId: proposal.id,
        title: status === 'accepted' ? 'Propuesta de diseño aprobada' : 'Propuesta de diseño rechazada',
        description: reviewerNote || null,
        metadata: {
          pageId: req.params.pageId,
          proposerUserId: proposal.proposer_user_id,
        },
      })

      const notificationPayload = [{
        user_id: proposal.proposer_user_id,
        project_id: project.id,
        event_type: status === 'accepted' ? 'designer_proposal_accepted' : 'designer_proposal_rejected',
        title: status === 'accepted' ? 'Tu propuesta fue aprobada' : 'Tu propuesta necesita cambios',
        body: reviewerNote || (status === 'accepted' ? 'Los cambios ya fueron aplicados al proyecto.' : 'Revisa el feedback y vuelve a guardar tu propuesta.'),
        metadata: {
          pageId: req.params.pageId,
          proposalId: proposal.id,
          status,
        },
      }]

      if (proposal.proposer_user_id && proposal.proposer_user_id !== req.currentUser.id) {
        await supabaseAdmin.from('notifications').insert(notificationPayload)
      }

      return res.json({
        proposal: {
          id: decidedProposal.id,
          pageId: decidedProposal.page_id,
          proposerUserId: decidedProposal.proposer_user_id,
          status: decidedProposal.status,
          reviewerUserId: decidedProposal.reviewer_user_id,
          reviewerNote: decidedProposal.reviewer_note || '',
          reviewedAt: decidedProposal.reviewed_at,
          createdAt: decidedProposal.created_at,
          updatedAt: decidedProposal.updated_at,
        },
        page: updatedPage
          ? {
              id: updatedPage.id,
              name: updatedPage.name,
              position: updatedPage.position,
              contentHtml: updatedPage.content_html,
              contentJson: updatedPage.content_json || null,
              seoMetadata: updatedPage.seo_metadata || {},
              contentRules: updatedPage.content_rules || {},
              version: updatedPage.version || 1,
              reviewStatus: updatedPage.review_status || 'draft',
              reviewBaselineVersionId: updatedPage.review_baseline_version_id || null,
              reviewBaselineAt: updatedPage.review_baseline_at || null,
              reviewRequestedBy: updatedPage.review_requested_by || null,
              // La propuesta que acabamos de decidir ya no está pending — el
              // próximo GET tampoco la traería en pendingProposal
              // (loadPendingPageProposals filtra status='pending').
              pendingProposal: null,
              updatedAt: updatedPage.updated_at,
            }
          : null,
      })
    } catch (error) {
      return sendServerError(req, res, error, 'No se pudo revisar la propuesta')
    }
  })

  ```

  Reemplázalo por nada (borra el bloque completo, incluida la línea en blanco final que se muestra
  arriba) — la ruta pasa a responder 404 por no existir, como pide el diseño. La línea en blanco que ya
  separaba la ruta anterior (`POST /:id/pages/:pageId/review`) queda como único separador con
  `router.get('/:id/activity', ...)`.

  Verificación:
  ```bash
  node --check backend/src/routes/projects.js
  ```
  Esperado: sin salida (exit code 0).

- [ ] **Step 8: Borrar el flag `projectPageChangeProposalsTableAvailable`**

  Ubica (junto al resto de flags de columnas/tablas opcionales, cerca del principio del archivo):

  ```js
  let projectPageVersionsTableAvailable = true
  let projectPageChangeProposalsTableAvailable = true
  let projectActivityTableAvailable = true
  ```

  Reemplázalo por:

  ```js
  let projectPageVersionsTableAvailable = true
  let projectActivityTableAvailable = true
  ```

  Verificación:
  ```bash
  node --check backend/src/routes/projects.js
  ```
  Esperado: sin salida (exit code 0).

- [ ] **Step 9: Verificación final de la task**

  ```bash
  node --check backend/src/routes/projects.js
  ```
  Esperado: sin salida (exit code 0).

  ```bash
  rg -ni "proposal|propuesta" backend/src/routes/projects.js
  ```
  Esperado: sin salida y exit code 1 (ninguna coincidencia — `rg` devuelve 1 cuando no encuentra nada,
  es la señal de éxito acá, no un error).

  ```bash
  rg -n "isMissingTableError|createProjectNotifications|sanitizeContentHtml|getCompanyRole\(" backend/src/routes/projects.js | wc -l
  ```
  Esperado: un número mayor a 0 para cada identificador (confirma que los cuatro imports que compartía
  el código borrado se siguen usando en otras rutas y no hay que tocar la lista de imports).

  ```bash
  cd /Users/adrian/GitHub/webbrief/backend && NODE_ENV=test node --test 2>&1 | tail -10
  ```
  Esperado: mismo `fail 0` que en el Step 1 (el total de `pass` debe ser igual al de la línea base del
  Step 1, ya que esta task no agrega ni quita tests).

- [ ] **Step 10: Commit**

  ```bash
  git add backend/src/routes/projects.js
  ```

  ```bash
  git commit -m "$(cat <<'EOF'
  fix(backend): elimina el flujo de propuestas de diseño de projects.js

  Diseño ahora guarda directo, igual que el resto de roles con permiso de
  escritura: se quita la rama isDesignerProposalMode de PUT /:id/pages, el
  overlay de propuesta pendiente en GET /:id (pendingProposal), los helpers
  loadPendingPageProposals / upsertDesignerProposals / normalizeProposalStatus,
  el flag projectPageChangeProposalsTableAvailable y la ruta
  POST /:id/pages/:pageId/proposals/:proposalId/decision (pasa a responder
  404 por no existir). La tabla project_page_change_proposals se conserva
  como historial, sin migración.

  Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
  EOF
  )"
  ```

  Verificación:
  ```bash
  git status --short backend/src/routes/projects.js
  ```
  Esperado: sin salida (working tree limpio para ese archivo — quedó commiteado). Confirma también que
  ningún otro archivo quedó agregado por accidente:
  ```bash
  git show --stat -1 --format='%H %s' HEAD
  ```
  Esperado: primera línea con el hash + `fix(backend): elimina el flujo de propuestas de diseño de
  projects.js`, y en la lista de archivos tocados solo `backend/src/routes/projects.js`.

---

### Task A2: `assetReferences.js` deja de consultar propuestas + actualizar test de biblioteca

**Files:**
- Modificar: `backend/src/lib/assetReferences.js`
- Test: `backend/test/library-trash.test.js`

- [ ] **Step 1 (TDD — test primero): reescribir el test que documentaba el merge con propuestas**

  El test actual de `backend/test/library-trash.test.js` documenta, a nivel de la función pura
  `extractReferencedAssetIds`, el comportamiento que `findReferencedAssetIds` tenía antes de este cambio
  (mezclar `project_pages` con `project_page_change_proposals` pendientes antes de llamarla). Como ya no
  van a quedar propuestas pendientes que consultar, hay que reescribirlo para que documente lo que sigue
  siendo cierto — `extractReferencedAssetIds` es agnóstica del origen de cada `content_html`, detecta
  referencias sin importar en qué posición de un array combinado aparecen — sin mencionar propuestas.

  Ubica:

  ```js
  // findReferencedAssetIds (lib/assetReferences.js) concatena
  // project_pages.content_html con project_page_change_proposals.content_html
  // (status='pending') antes de llamar a extractReferencedAssetIds, para que
  // una imagen usada solo en una propuesta de designer todavía sin publicar
  // tampoco se pueda trashear. Se testea acá al nivel de la función pura
  // porque mockear supabaseAdmin es pesado (mismo criterio documentado en
  // test/companies-create.test.js) — esta función ya captura el comportamiento
  // real de merge sin tocar la DB.
  test('extractReferencedAssetIds: detecta referencias que solo aparecen en el html de una propuesta pendiente', () => {
    const assets = [
      { id: 'a1', storage_path: '/companies/c/library/only-in-proposal.webp', public_url: null },
      { id: 'a2', storage_path: '/companies/c/library/unused.webp', public_url: null },
    ]
    const publishedPages = [{ content_html: '<p>sin imágenes nuevas todavía</p>' }]
    const pendingProposals = [{ content_html: '<img src="/companies/c/library/only-in-proposal.webp">' }]
    const merged = [...publishedPages, ...pendingProposals]
    assert.deepEqual([...extractReferencedAssetIds(assets, merged)], ['a1'])
  })
  ```

  Reemplázalo por:

  ```js
  // extractReferencedAssetIds es agnóstica del origen de cada content_html:
  // solo le importa recibir un array de objetos con esa propiedad.
  // findReferencedAssetIds (lib/assetReferences.js) le pasa el content_html de
  // project_pages tal cual, pero cualquier llamador que combine varios arrays
  // antes de invocarla debe seguir funcionando. Se testea acá al nivel de la
  // función pura porque mockear supabaseAdmin es pesado (mismo criterio
  // documentado en test/companies-create.test.js).
  test('extractReferencedAssetIds: detecta referencias sin importar en qué array combinado aparecen', () => {
    const assets = [
      { id: 'a1', storage_path: '/companies/c/library/only-in-second-source.webp', public_url: null },
      { id: 'a2', storage_path: '/companies/c/library/unused.webp', public_url: null },
    ]
    const firstSource = [{ content_html: '<p>sin imágenes nuevas todavía</p>' }]
    const secondSource = [{ content_html: '<img src="/companies/c/library/only-in-second-source.webp">' }]
    const merged = [...firstSource, ...secondSource]
    assert.deepEqual([...extractReferencedAssetIds(assets, merged)], ['a1'])
  })
  ```

  Corre el archivo — como `extractReferencedAssetIds` todavía no cambió (solo cambia en el Step 3),
  este test reescrito ya tiene que pasar en verde: confirma que el reemplazo conserva la cobertura antes
  de tocar el código fuente.

  ```bash
  cd /Users/adrian/GitHub/webbrief/backend && NODE_ENV=test node --test test/library-trash.test.js 2>&1 | tail -12
  ```

  Esperado:
  ```
  ✔ extractReferencedAssetIds: detecta storage_path y public_url en html
  ✔ extractReferencedAssetIds: lanza si un asset no trae storage_path ni public_url
  ✔ extractReferencedAssetIds: detecta referencias sin importar en qué array combinado aparecen
  ✔ partitionTrashableAssets: separa referenciados
  ✔ collectFolderSubtreeIds: incluye la carpeta y todos sus descendientes
  ✔ validateAssetFileName: recorta, limita a 255, rechaza vacío
  ℹ tests 6
  ℹ pass 6
  ℹ fail 0
  ```

- [ ] **Step 2: Actualizar el comentario de cabecera de `assetReferences.js`**

  Ubica (las primeras líneas del archivo):

  ```js
  // Detección de assets de biblioteca usados en páginas de proyectos o en
  // propuestas de designer pendientes: regex (substring) sobre content_html,
  // mismo enfoque que el orphan-resolve de comentarios en
  // backend/src/routes/projects.js (buscar `comment_orphaned`). Un asset
  // "referenciado" no puede enviarse a la papelera sin `force: true` porque
  // borrar su origen en ImageKit rompería la imagen ya insertada en un
  // documento — publicado o todavía en revisión.
  ```

  Reemplázalo por:

  ```js
  // Detección de assets de biblioteca usados en páginas de proyectos: regex
  // (substring) sobre content_html, mismo enfoque que el orphan-resolve de
  // comentarios en backend/src/routes/projects.js (buscar `comment_orphaned`).
  // Un asset "referenciado" no puede enviarse a la papelera sin `force: true`
  // porque borrar su origen en ImageKit rompería la imagen ya insertada en un
  // documento publicado.
  ```

  Verificación:
  ```bash
  node --check backend/src/lib/assetReferences.js
  ```
  Esperado: sin salida (exit code 0).

- [ ] **Step 3: `findReferencedAssetIds` deja de consultar `project_page_change_proposals`**

  Ubica el import que queda sin uso tras este cambio (el único otro import del archivo,
  `supabaseAdmin`, se sigue usando en ambas funciones):

  ```js
  import { supabaseAdmin } from './supabase.js'
  import { isMissingTableError } from './projectAccess.js'
  ```

  Reemplázalo por:

  ```js
  import { supabaseAdmin } from './supabase.js'
  ```

  Ubica ahora la función completa:

  ```js
  export async function findReferencedAssetIds(companyId, assets) {
    if (!assets?.length) return new Set()
    const { data: projects } = await supabaseAdmin
      .from('projects').select('id').eq('company_id', companyId)
    const projectIds = (projects || []).map((p) => p.id)
    if (!projectIds.length) return new Set()

    const { data: pages } = await supabaseAdmin
      .from('project_pages').select('content_html').in('project_id', projectIds)

    // Una imagen usada solo en una propuesta de designer pendiente (todavía sin
    // publicar en project_pages) tampoco debe poder trashearse: si el revisor
    // la aprueba más tarde, la imagen ya estaría rota en ImageKit.
    // isMissingTableError replica la misma degradación agraciada que ya usa
    // projects.js para esta tabla (drift de deploy documentado en sesión 18).
    const { data: proposals, error: proposalsError } = await supabaseAdmin
      .from('project_page_change_proposals')
      .select('content_html')
      .in('project_id', projectIds)
      .eq('status', 'pending')
    if (proposalsError && !isMissingTableError(proposalsError, 'project_page_change_proposals')) {
      throw proposalsError
    }

    return extractReferencedAssetIds(assets, [...(pages || []), ...(proposals || [])])
  }
  ```

  Reemplázala por:

  ```js
  export async function findReferencedAssetIds(companyId, assets) {
    if (!assets?.length) return new Set()
    const { data: projects } = await supabaseAdmin
      .from('projects').select('id').eq('company_id', companyId)
    const projectIds = (projects || []).map((p) => p.id)
    if (!projectIds.length) return new Set()

    const { data: pages } = await supabaseAdmin
      .from('project_pages').select('content_html').in('project_id', projectIds)

    return extractReferencedAssetIds(assets, pages || [])
  }
  ```

  Verificación:
  ```bash
  node --check backend/src/lib/assetReferences.js
  ```
  Esperado: sin salida (exit code 0).

- [ ] **Step 4: Verificación final de la task**

  ```bash
  node --check backend/src/lib/assetReferences.js
  ```
  Esperado: sin salida (exit code 0).

  ```bash
  rg -ni "proposal|propuesta" backend/src/lib/assetReferences.js backend/test/library-trash.test.js
  ```
  Esperado: sin salida y exit code 1 (ninguna coincidencia en ninguno de los dos archivos).

  ```bash
  rg -n "project_page_change_proposals|isMissingTableError" backend/src/lib/assetReferences.js
  ```
  Esperado: sin salida (confirma que la tabla y el import quedaron fuera del archivo).

  ```bash
  cd /Users/adrian/GitHub/webbrief/backend && NODE_ENV=test node --test test/library-trash.test.js 2>&1 | tail -12
  ```
  Esperado: `tests 6`, `pass 6`, `fail 0` (mismo resultado que el Step 1, ahora con
  `findReferencedAssetIds` ya cambiado — prueba que el recorte no rompió la cobertura de la función
  pura).

  ```bash
  cd /Users/adrian/GitHub/webbrief/backend && NODE_ENV=test node --test 2>&1 | tail -10
  ```
  Esperado: mismo `fail 0` que la línea base (Task A1 Step 1) — el total de `pass` debe ser igual (esta
  task tampoco agrega ni quita tests, solo reescribe uno).

- [ ] **Step 5: Commit**

  ```bash
  git add backend/src/lib/assetReferences.js backend/test/library-trash.test.js
  ```

  ```bash
  git commit -m "$(cat <<'EOF'
  fix(backend): findReferencedAssetIds deja de consultar propuestas

  Ya no puede quedar una propuesta pendiente que proteger de la papelera de
  biblioteca, así que la función deja de consultar
  project_page_change_proposals y solo revisa project_pages. Actualiza el
  comentario del módulo y reescribe el test de library-trash que documentaba
  el merge con propuestas, conservando la cobertura de la función pura
  extractReferencedAssetIds.

  Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
  EOF
  )"
  ```

  Verificación:
  ```bash
  git status --short backend/src/lib/assetReferences.js backend/test/library-trash.test.js
  ```
  Esperado: sin salida (ambos archivos quedaron commiteados).
  ```bash
  git show --stat -1 --format='%H %s' HEAD
  ```
  Esperado: primera línea con el hash + `fix(backend): findReferencedAssetIds deja de consultar
  propuestas`, y en la lista de archivos tocados solo `backend/src/lib/assetReferences.js` y
  `backend/test/library-trash.test.js`.

## Parte A (frontend) — Eliminar el sistema de propuestas de diseño

Fuente: `docs/superpowers/specs/2026-09-11-remove-approval-robust-uploads-design.md` (Parte A).
Repo: `/Users/adrian/GitHub/webbrief`, rama `fix/remove-approval-robust-uploads`.

## Orden de ejecución (no numérico)

Ejecutar en este orden: **A3 → A5 → A6 → A4**.

Razón: `frontend/src/pages/ProjectEditor.jsx` importa `frontend/src/lib/proposalDiff.js`
y `frontend/src/lib/proposalBlockDiff.js` (Task A6 quita esos imports). Si Task A4
(que borra esos dos archivos) corriera antes que A6, el commit de A4 dejaría
`npm run build` roto (Rollup no puede resolver un import a un archivo borrado)
hasta que A6 corra — un commit intermedio no debe romper el build. Por eso A4
corre último, aunque conserve su nombre e identidad de "Task A4" tal como fue
asignada. A3 (activityOrdering) y A5 (roleCapabilities) no tienen dependencias
entre sí ni bloquean a A6; van primero por ser los cambios más chicos y aislados.

Cada task termina en su propio commit. Ninguno de estos commits bumpea
`frontend/package.json` — el spec fija la versión objetivo en 2.16.0 (MINOR)
para el conjunto Parte A + Parte B, y el bump se hace una sola vez, en el
commit que efectivamente se vaya a deployar (regla de Versioning en
`CLAUDE.md`: "Un solo bump por PR/feature").

No editar `frontend/package.json` en ninguna de estas tasks (la dependencia
`diff` sigue en uso por el visor de diffs del historial — ver Task A4).

---

### Task A3: `activityOrdering.js` — `buildSectionOrderIndex` sin propuestas

**Files:**
- Modify: `backend/test/activity-ordering.test.js`
- Modify: `frontend/src/lib/activityOrdering.js`
- Test: `backend/test/activity-ordering.test.js` (node --test)

TDD: primero se adapta el test a la firma nueva (debe seguir en verde contra
la lib VIEJA, porque `proposalHtml` ya es un segundo argumento opcional que
hoy no rompe nada si se deja de pasar) y recién después se simplifica la lib.

- [ ] **Step 1: Reescribir `backend/test/activity-ordering.test.js` sin los casos de propuesta**

  El archivo tiene 9 tests. Se borran los 2 que prueban secciones que solo
  existen en una propuesta pendiente (ese concepto desaparece), se les quita
  el segundo argumento (`proposalHtml`) a todas las llamadas restantes de
  `buildSectionOrderIndex`, se renombra el test de "ausente del doc y de la
  propuesta" a "ausente del doc", y se borra el helper `d()` (queda sin uso:
  era exclusivo de los dos tests borrados y del segundo argumento que ya no
  existe).

  Reemplazar el contenido completo del archivo por:

  ```js
  import assert from 'node:assert/strict'
  import { test } from 'node:test'
  import { buildSectionOrderIndex, orderSectionActivityGroups } from '../../frontend/src/lib/activityOrdering.js'

  // Helper: fabrica un activity item mínimo tal como lo devuelve el backend
  // (serializeActivity) para eventos section_edited/asset_uploaded.
  function item(id, sectionId, createdAt, extra = {}) {
    return {
      id,
      eventType: 'section_edited',
      createdAt,
      metadata: { sectionId, pageId: 'page-1', ...extra },
    }
  }

  // -------- buildSectionOrderIndex --------

  test('buildSectionOrderIndex: __seo__/__document__ primero, luego secciones del doc en su orden real', () => {
    const docSections = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
    const order = buildSectionOrderIndex(docSections)
    assert.equal(order.get('__seo__'), 0)
    assert.equal(order.get('__document__'), 1)
    assert.equal(order.get('a'), 2)
    assert.equal(order.get('b'), 3)
    assert.equal(order.get('c'), 4)
  })

  test('buildSectionOrderIndex: sectionId ausente del doc no entra al mapa', () => {
    const order = buildSectionOrderIndex([{ id: 'a' }])
    assert.equal(order.has('unknown-section'), false)
  })

  // -------- orderSectionActivityGroups --------

  test('orderSectionActivityGroups: agrupa por sectionId y ordena grupos por la posición real de la sección', () => {
    const order = buildSectionOrderIndex([{ id: 'a' }, { id: 'b' }, { id: 'c' }])
    // Actividad llega en orden arbitrario (p.ej. created_at DESC del backend) — la sección
    // 'c' es la más reciente pero debe quedar ÚLTIMA porque está última en el documento.
    const items = [
      item('ev-c', 'c', '2026-08-13T12:00:00Z'),
      item('ev-a', 'a', '2026-08-13T10:00:00Z'),
      item('ev-b', 'b', '2026-08-13T11:00:00Z'),
    ]
    const groups = orderSectionActivityGroups(items, order)
    assert.deepEqual(groups.map((g) => g.sectionId), ['a', 'b', 'c'])
  })

  test('orderSectionActivityGroups: sectionIds desconocidos (ausentes del doc) van al final, ordenados por el evento MÁS VIEJO — nunca por el más nuevo', () => {
    const order = buildSectionOrderIndex([{ id: 'a' }])
    const items = [
      // 'legacy-2' tiene el evento más reciente de los tres, pero su primer evento
      // (oldest) es más nuevo que el de 'legacy-1' → debe quedar después de legacy-1.
      item('ev-legacy-2-old', 'legacy-2', '2026-08-13T08:00:00Z'),
      item('ev-legacy-2-new', 'legacy-2', '2026-08-13T20:00:00Z'),
      item('ev-legacy-1', 'legacy-1', '2026-08-13T07:00:00Z'),
      item('ev-a', 'a', '2026-08-13T12:00:00Z'),
    ]
    const groups = orderSectionActivityGroups(items, order)
    assert.deepEqual(groups.map((g) => g.sectionId), ['a', 'legacy-1', 'legacy-2'])
  })

  test('orderSectionActivityGroups: marcar una actividad como leída (readAt en metadata) no altera el orden de los grupos', () => {
    const order = buildSectionOrderIndex([{ id: 'a' }, { id: 'b' }, { id: 'c' }])
    const items = [
      item('ev-c', 'c', '2026-08-13T12:00:00Z'),
      item('ev-a', 'a', '2026-08-13T10:00:00Z'),
      item('ev-b', 'b', '2026-08-13T11:00:00Z'),
    ]
    const before = orderSectionActivityGroups(items, order).map((g) => g.sectionId)

    // Simula exactamente lo que hace markActivityRead en ProjectEditor.jsx: reemplaza
    // el item por id con una copia que solo agrega metadata.readAt — createdAt y
    // sectionId quedan intactos, igual que en el response real del PATCH .../read.
    const readItems = items.map((it) => (
      it.id === 'ev-b' ? { ...it, metadata: { ...it.metadata, readAt: '2026-08-13T13:00:00Z', readBy: 'user-1' } } : it
    ))
    const after = orderSectionActivityGroups(readItems, order).map((g) => g.sectionId)

    assert.deepEqual(after, before)
    assert.deepEqual(after, ['a', 'b', 'c'])
  })

  test('orderSectionActivityGroups: dentro de un grupo, items[0] sigue siendo el evento más reciente (resumen de la fila)', () => {
    const order = buildSectionOrderIndex([{ id: 'a' }])
    const items = [
      item('ev-old', 'a', '2026-08-13T09:00:00Z'),
      item('ev-new', 'a', '2026-08-13T11:00:00Z'),
      item('ev-mid', 'a', '2026-08-13T10:00:00Z'),
    ]
    const groups = orderSectionActivityGroups(items, order)
    assert.equal(groups.length, 1)
    assert.deepEqual(groups[0].items.map((it) => it.id), ['ev-new', 'ev-mid', 'ev-old'])
  })

  test('orderSectionActivityGroups: items sin sectionId se ignoran (no arman un grupo huérfano)', () => {
    const order = buildSectionOrderIndex([{ id: 'a' }])
    const items = [item('ev-a', 'a', '2026-08-13T09:00:00Z'), item('ev-none', null, '2026-08-13T09:00:00Z')]
    const groups = orderSectionActivityGroups(items, order)
    assert.deepEqual(groups.map((g) => g.sectionId), ['a'])
  })
  ```

- [ ] **Step 2: Correr el test contra la lib vieja — debe quedar en verde**

  ```bash
  cd /Users/adrian/GitHub/webbrief/backend && NODE_ENV=test node --test test/activity-ordering.test.js
  ```

  Esperado: `# tests 7`, `# pass 7`, `# fail 0` (la lib vieja acepta que no le
  pasen `proposalHtml` — el default `= ''` hace que el `if (proposalHtml)`
  nunca entre, mismo resultado que antes).

- [ ] **Step 3: Simplificar `frontend/src/lib/activityOrdering.js`**

  Tres ediciones en el mismo archivo.

  **3a — comentario de cabecera del archivo** (quita la mención a
  `project_page_change_proposals`/`proposalDiff.js`, que ya no existen, y el
  import de `splitSections`, que queda sin uso una vez que `buildSectionOrderIndex`
  deja de parsear HTML de propuesta):

  Localizar (líneas 1-23):
  ```js
  // frontend/src/lib/activityOrdering.js
  // Orden del panel "Actividad" del editor (UpdatesPanel en ProjectEditor.jsx).
  //
  // Contrato: una fila por sección, SIEMPRE ordenada por posición de la sección
  // en el documento — nunca por fecha de creación ni por "última actualización".
  // Si una sección se mueve en el doc, su fila se mueve con ella; si no, se
  // queda quieta. Marcar una actividad como leída solo toca metadata.readAt del
  // item — nunca su sectionId ni su createdAt — así que no puede alterar el
  // orden acá computado.
  //
  // Caso real que motivó esto: un `designer` nunca escribe en `project_pages`
  // (cada guardado suyo va a `project_page_change_proposals`, status pending —
  // ver sectionMerge.js/proposalDiff.js). Si sube una imagen a una sección que
  // solo existe en SU propuesta, el evento `asset_uploaded` trae un `sectionId`
  // que no aparece en el doc publicado/montado. Antes caía a un bucket aparte
  // ("Actividad general") ordenado por `created_at DESC` del backend — se veía
  // como si el panel reordenara solo. Ahora esa sección se agrupa igual que las
  // demás, después de las del doc, en el orden en que aparece en la propuesta.
  //
  // Puro y sin DOM: corre igual en el navegador y en node (tests en
  // backend/test/activity-ordering.test.js, import con extensión .js porque
  // ESM no resuelve extensionless en node).
  import { splitSections } from './sectionMerge.js'
  ```

  Reemplazar por:
  ```js
  // frontend/src/lib/activityOrdering.js
  // Orden del panel "Actividad" del editor (UpdatesPanel en ProjectEditor.jsx).
  //
  // Contrato: una fila por sección, SIEMPRE ordenada por posición de la sección
  // en el documento — nunca por fecha de creación ni por "última actualización".
  // Si una sección se mueve en el doc, su fila se mueve con ella; si no, se
  // queda quieta. Marcar una actividad como leída solo toca metadata.readAt del
  // item — nunca su sectionId ni su createdAt — así que no puede alterar el
  // orden acá computado.
  //
  // sectionIds que no aparecen en el doc montado (p.ej. una sección borrada
  // después de generarse la actividad) van al final, ordenados por el evento
  // más viejo del grupo — ver orderSectionActivityGroups más abajo.
  //
  // Puro y sin DOM: corre igual en el navegador y en node (tests en
  // backend/test/activity-ordering.test.js, import con extensión .js porque
  // ESM no resuelve extensionless en node).
  ```

  **3b — JSDoc + firma + cuerpo de `buildSectionOrderIndex`:**

  Localizar:
  ```js
  /**
   * Mapa sectionId -> ordinal, combinando:
   *   1. IDs de pseudo-sección fijos (__seo__, __document__)
   *   2. Secciones del documento montado/publicado, en su orden real
   *   3. Secciones que SOLO existen en una propuesta de diseño pendiente
   *      (parseadas del contentHtml de la propuesta), en el orden de la
   *      propuesta — agregadas después de todo lo anterior
   *
   * sectionIds ausentes de las tres fuentes no entran en el mapa: el caller
   * (orderSectionActivityGroups) los manda al final, en orden estable.
   *
   * @param {Array<{id: string}>} docSections secciones derivadas del doc activo (orden = posición real)
   * @param {string} proposalHtml content_html de activePage.pendingProposal (puede ser '' o null)
   * @returns {Map<string, number>}
   */
  export function buildSectionOrderIndex(docSections = [], proposalHtml = '') {
    const order = new Map()
    PINNED_SECTION_IDS.forEach((id, index) => order.set(id, index))

    let next = PINNED_SECTION_IDS.length
    docSections.forEach((section) => {
      const id = section?.id
      if (!id || order.has(id)) return
      order.set(id, next++)
    })

    if (proposalHtml) {
      splitSections(proposalHtml).forEach((section) => {
        const id = section?.sectionId
        if (!id || order.has(id)) return
        order.set(id, next++)
      })
    }

    return order
  }
  ```

  Reemplazar por:
  ```js
  /**
   * Mapa sectionId -> ordinal, combinando:
   *   1. IDs de pseudo-sección fijos (__seo__, __document__)
   *   2. Secciones del documento montado/publicado, en su orden real
   *
   * sectionIds ausentes de las dos fuentes no entran en el mapa: el caller
   * (orderSectionActivityGroups) los manda al final, en orden estable.
   *
   * @param {Array<{id: string}>} docSections secciones derivadas del doc activo (orden = posición real)
   * @returns {Map<string, number>}
   */
  export function buildSectionOrderIndex(docSections = []) {
    const order = new Map()
    PINNED_SECTION_IDS.forEach((id, index) => order.set(id, index))

    let next = PINNED_SECTION_IDS.length
    docSections.forEach((section) => {
      const id = section?.id
      if (!id || order.has(id)) return
      order.set(id, next++)
    })

    return order
  }
  ```

  **3c — JSDoc de `orderSectionActivityGroups`** (misma mención stale a "la
  propuesta"):

  Localizar:
  ```js
   * y para sectionIds ausentes de `orderIndex` (datos legacy/huérfanos sin
   * relación con el doc ni con la propuesta), al final, por el createdAt MÁS
  ```

  Reemplazar por:
  ```js
   * y para sectionIds ausentes de `orderIndex` (datos legacy/huérfanos sin
   * relación con el doc), al final, por el createdAt MÁS
  ```

- [ ] **Step 4: Correr el test contra la lib nueva — debe seguir en verde**

  ```bash
  cd /Users/adrian/GitHub/webbrief/backend && NODE_ENV=test node --test test/activity-ordering.test.js
  ```

  Esperado: `# tests 7`, `# pass 7`, `# fail 0`.

- [ ] **Step 5: Verificar que no queda ninguna mención a propuestas en estos dos archivos**

  ```bash
  cd /Users/adrian/GitHub/webbrief
  rg -ni "proposal|propuesta" frontend/src/lib/activityOrdering.js
  rg -n "proposalHtml" backend/test/activity-ordering.test.js
  ```

  Esperado: ambos comandos sin output (exit code 1 de `rg`, "no matches").

- [ ] **Step 6: Commit**

  ```bash
  cd /Users/adrian/GitHub/webbrief
  git add backend/test/activity-ordering.test.js frontend/src/lib/activityOrdering.js
  git commit -m "$(cat <<'EOF'
  refactor(editor): simplifica buildSectionOrderIndex sin propuestas de diseño

  buildSectionOrderIndex ya no recibe el HTML de una propuesta pendiente:
  el orden de las secciones en el panel Actividad sale solo del documento
  montado/publicado. Ajusta backend/test/activity-ordering.test.js a la
  firma nueva y quita los dos casos que probaban secciones que solo
  existían en una propuesta.

  Parte A (frontend) de docs/superpowers/specs/2026-09-11-remove-approval-robust-uploads-design.md.

  Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
  EOF
  )"
  git status
  ```

  Verificar en la salida de `git status` que NO quedaron agregados
  `.claude/settings.local.json`, `deploy/nginx/*`, `frontend/index.html`,
  `frontend/package.json` ni `frontend/package-lock.json` (son cambios
  sueltos preexistentes en la rama, ajenos a esta task).

---

### Task A5: `roleCapabilities.js` — quitar capacidades de revisión de propuestas

**Files:**
- Modify: `frontend/src/lib/roleCapabilities.js`

No hay test dedicado para `getProjectEditorCapabilities` (se verificó con
`rg` — no existe ningún `*.test.js` que importe `roleCapabilities.js`). Único
consumidor: `frontend/src/pages/ProjectEditor.jsx` (se ajusta en Task A6).
Los demás archivos que importan `roleCapabilities.js` (`NewProject.jsx`,
`UsersPage.jsx`, `TrashPage.jsx`, `workspace/ProjectsPage.jsx`,
`workspace/TeamPage.jsx`, `CompaniesPage.jsx`, `TourContext.jsx`,
`UserEditModal.jsx`, `AppShell.jsx`) solo usan `isAdmin`, `canSendAccess`,
`getCompanyRole`, `getInviteRoleOptions`, `canCreateTestCompany`,
`canUseTrashNav`, `canManageUsersNav`, `canUseSecurityNav` o
`canCreateCompany` — ninguno toca `canReviewDesignerProposals` ni
`isDesigner`, así que no hace falta tocarlos.

- [ ] **Step 1: Editar `getProjectEditorCapabilities`**

  Localizar (líneas ~106-129):
  ```js
  export function getProjectEditorCapabilities(currentUser, companyId) {
    const companyRole = getCompanyRole(currentUser, companyId)
    const admin = isAdmin(currentUser)

    const canManageProjectMeta = admin || ['admin', 'manager', 'editor'].includes(companyRole)
    const canManageProjectStructure = admin || ['admin', 'manager', 'editor', 'content_writer', 'developer'].includes(companyRole)
    const canWriteContent = admin || COMPANY_ROLE_ORDER.includes(companyRole)
    const canUseHandoff = admin || ['admin', 'manager', 'designer', 'developer'].includes(companyRole)
    const canSendToReview = admin || ['admin', 'manager', 'developer'].includes(companyRole)
    const canReviewDesignerProposals = admin || ['admin', 'manager', 'editor'].includes(companyRole)
    const isDesignerRole = !admin && companyRole === 'designer'

    return {
      companyRole,
      canManageProjectMeta,
      canManageProjectStructure,
      canWriteContent,
      canUseHandoff,
      canSendToReview,
      canReviewDesignerProposals,
      isDesigner: isDesignerRole,
      canEditContentRules: canManageProjectMeta,
    }
  }
  ```

  Reemplazar por:
  ```js
  export function getProjectEditorCapabilities(currentUser, companyId) {
    const companyRole = getCompanyRole(currentUser, companyId)
    const admin = isAdmin(currentUser)

    const canManageProjectMeta = admin || ['admin', 'manager', 'editor'].includes(companyRole)
    const canManageProjectStructure = admin || ['admin', 'manager', 'editor', 'content_writer', 'developer'].includes(companyRole)
    const canWriteContent = admin || COMPANY_ROLE_ORDER.includes(companyRole)
    const canUseHandoff = admin || ['admin', 'manager', 'designer', 'developer'].includes(companyRole)
    const canSendToReview = admin || ['admin', 'manager', 'developer'].includes(companyRole)

    return {
      companyRole,
      canManageProjectMeta,
      canManageProjectStructure,
      canWriteContent,
      canUseHandoff,
      canSendToReview,
      canEditContentRules: canManageProjectMeta,
    }
  }
  ```

  Nota: `canUseHandoff` sigue habilitando `designer` a propósito — el spec
  dice explícitamente "Cambiar los permisos de estructura de Diseño: sigue
  sin poder crear, renombrar ni reordenar páginas" (no objetivo), y Handoff
  es una vista de lectura para el equipo de diseño, no la aprobación que se
  está quitando. No tocar esa línea.

- [ ] **Step 2: Verificar que los identificadores quitados no quedan en el archivo**

  ```bash
  cd /Users/adrian/GitHub/webbrief
  rg -n "canReviewDesignerProposals|isDesigner" frontend/src/lib/roleCapabilities.js
  ```

  Esperado: sin output.

- [ ] **Step 3: Build de frontend (a esta altura ProjectEditor.jsx todavía
  destructura `canReviewDesignerProposals`/`isDesigner`; en JS desestructurar
  una clave que no existe da `undefined`, no rompe el build — se limpia en
  Task A6)**

  ```bash
  cd /Users/adrian/GitHub/webbrief/frontend && npm run build
  ```

  Esperado: termina con `✓ built in <N>s` y sin errores (el único warning
  esperable es el preexistente de "chunks larger than 500 kB", ajeno a este
  cambio).

- [ ] **Step 4: Commit**

  ```bash
  cd /Users/adrian/GitHub/webbrief
  git add frontend/src/lib/roleCapabilities.js
  git commit -m "$(cat <<'EOF'
  refactor(editor): quita las capacidades de revisión de propuestas de diseño

  getProjectEditorCapabilities ya no expone canReviewDesignerProposals ni
  isDesigner: todos los roles con permiso de escritura publican directo,
  incluido Diseño. Único consumidor era ProjectEditor.jsx (se limpia en el
  próximo commit de esta rama).

  Parte A (frontend) de docs/superpowers/specs/2026-09-11-remove-approval-robust-uploads-design.md.

  Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
  EOF
  )"
  git status
  ```

  Verificar que `git status` no agregó ningún archivo fuera de
  `frontend/src/lib/roleCapabilities.js`.

---

### Task A6: `ProjectEditor.jsx` — quitar la UI de aprobación de propuestas

**Files:**
- Modify: `frontend/src/pages/ProjectEditor.jsx` (~12k líneas — usar los
  anclas de abajo; no releer el archivo completo)
- Modify: `frontend/src/pages/ProjectEditor.module.css`
- Modify: `frontend/src/pages/ProjectEditorPanels.module.css`
- Modify: `frontend/src/components/onboarding/FirstTimeTooltipsRoot.jsx`

No tocar en este archivo nada de `snapshotActivePage`, `saveProjectPages`,
los handlers de upload ni `EditableImageView` más allá de lo que listan los
steps de abajo (`openProposalView` llama a `snapshotActivePage`, así que
Step 6 borra esa llamada junto con la función; no se toca la implementación
de `snapshotActivePage` en sí). Esos cambios son de la Parte B (subidas
robustas), que edita este mismo archivo después.

- [ ] **Step 1: Imports — quitar `splitSections`, `proposalDiff`, `proposalBlockDiff`**

  Localizar (líneas ~44-49):
  ```js
  import { mergeSections, buildHtmlFromSections, normalizeHtml, splitSections } from '../lib/sectionMerge'
  import { buildSectionOrderIndex, orderSectionActivityGroups } from '../lib/activityOrdering'
  import { stripPendingUploadImagesFromHtml, stripPendingUploadImagesFromJson, countPendingUploadImages } from '../lib/pendingUploads'
  import { diffProposalSections, summarizeProposalDiff } from '../lib/proposalDiff'
  import { diffProposalBlocks } from '../lib/proposalBlockDiff'
  import PresenceAvatars from '../components/editor/PresenceAvatars'
  ```

  Reemplazar por:
  ```js
  import { mergeSections, buildHtmlFromSections, normalizeHtml } from '../lib/sectionMerge'
  import { buildSectionOrderIndex, orderSectionActivityGroups } from '../lib/activityOrdering'
  import { stripPendingUploadImagesFromHtml, stripPendingUploadImagesFromJson, countPendingUploadImages } from '../lib/pendingUploads'
  import PresenceAvatars from '../components/editor/PresenceAvatars'
  ```

  `splitSections` queda sin otro uso en este archivo recién después del Step
  13 (que gutea el único otro call site) — se verifica al final del task con
  `rg`, no hace falta reordenar los steps por esto.

- [ ] **Step 2: `mapPersistedPage` — quitar el campo `pendingProposal`**

  Localizar (líneas ~1849-1876):
  ```js
    return {
      id: page.id,
      name: page.name,
      sections,
      fullContent: contentHtml || buildDocumentHTML(sections),
      contentJson: page.contentJson || null,
      seoMetadata: getPageSeoMetadata(page),
      contentRules: getPageContentRules(page),
      version: page.version || 1,
      reviewStatus: page.reviewStatus || 'draft',
      reviewBaselineVersionId: page.reviewBaselineVersionId || null,
      reviewBaselineAt: page.reviewBaselineAt || null,
      reviewRequestedBy: page.reviewRequestedBy || null,
      pendingProposal: page.pendingProposal ? {
        id: page.pendingProposal.id,
        proposerUserId: page.pendingProposal.proposerUserId,
        contentHtml: page.pendingProposal.contentHtml || '',
        contentJson: page.pendingProposal.contentJson || null,
        seoMetadata: page.pendingProposal.seoMetadata || {},
        status: page.pendingProposal.status || 'pending',
        reviewerUserId: page.pendingProposal.reviewerUserId || null,
        reviewerNote: page.pendingProposal.reviewerNote || '',
        reviewedAt: page.pendingProposal.reviewedAt || null,
        createdAt: page.pendingProposal.createdAt || null,
        updatedAt: page.pendingProposal.updatedAt || null,
      } : null,
    }
  }
  ```

  Reemplazar por:
  ```js
    return {
      id: page.id,
      name: page.name,
      sections,
      fullContent: contentHtml || buildDocumentHTML(sections),
      contentJson: page.contentJson || null,
      seoMetadata: getPageSeoMetadata(page),
      contentRules: getPageContentRules(page),
      version: page.version || 1,
      reviewStatus: page.reviewStatus || 'draft',
      reviewBaselineVersionId: page.reviewBaselineVersionId || null,
      reviewBaselineAt: page.reviewBaselineAt || null,
      reviewRequestedBy: page.reviewRequestedBy || null,
    }
  }
  ```

- [ ] **Step 3: Quitar el estado `proposalViewOpen` / `isDecidingProposal`**

  Localizar (entre `handoffAudience` y `activity`):
  ```js
    // Comparador de propuesta de diseño: false = se ve lo publicado (el editor
    // normal), true = se ve la propuesta pendiente en solo lectura. Es un eje
    // aparte del modo Brief/Handoff/Preview (qué versión, no qué vista), y NO se
    // persiste en la vista guardada: siempre se entra por lo publicado.
    const [proposalViewOpen, setProposalViewOpen] = useState(false)
    // Loading state de la decisión de Aprobar — deshabilita el botón en ambos
    // lugares (proposalBox y header del comparador) y evita doble-click
    // mientras el POST /decision está en vuelo.
    const [isDecidingProposal, setIsDecidingProposal] = useState(false)
    const [activity, setActivity] = useState([])
  ```

  Reemplazar por:
  ```js
    const [activity, setActivity] = useState([])
  ```

- [ ] **Step 4: Destructuring de capacidades — quitar `canReviewDesignerProposals`, `isDesigner`**

  Localizar:
  ```js
    const {
      canManageProjectMeta,
      canManageProjectStructure: canEditProjectStructure,
      canWriteContent,
      canUseHandoff,
      canSendToReview,
      canReviewDesignerProposals,
      isDesigner,
      canEditContentRules,
    } = useMemo(() => (
  ```

  Reemplazar por:
  ```js
    const {
      canManageProjectMeta,
      canManageProjectStructure: canEditProjectStructure,
      canWriteContent,
      canUseHandoff,
      canSendToReview,
      canEditContentRules,
    } = useMemo(() => (
  ```

- [ ] **Step 5: Borrar el bloque "Revisión de propuesta de diseño" completo**

  (`pendingProposal`, `proposalDiff`, `proposerName`, `canSeeProposalReview`,
  `proposalReviewActive` y los dos `useEffect` que cierran el comparador.)

  Localizar (entre el `useMemo` de `availableEditorModes` y la declaración de
  `contentRuleNotice`):
  ```js
    // ── Revisión de propuesta de diseño ────────────────────────────────────
    // Un `designer` no escribe la página: cada guardado suyo queda como
    // propuesta pendiente (project_page_change_proposals) y el backend solo
    // superpone ese contenido para el propio designer. El revisor veía
    // "Aprobar / Pedir cambios" sin poder ver QUÉ aprobaba — de ahí este
    // comparador. El backend YA manda `pendingProposal` completo a los
    // revisores, así que todo esto es cliente: no hace falta endpoint nuevo.
    const pendingProposal = activePage?.pendingProposal || null
    const proposalDiff = useMemo(() => (
      pendingProposal
        ? diffProposalSections(activePage?.fullContent || '', pendingProposal.contentHtml || '')
        : null
    ), [pendingProposal, activePage?.fullContent])
    const proposerName = useMemo(() => {
      const proposerId = pendingProposal?.proposerUserId
      if (!proposerId) return ''
      const profile = commentMembers.find((member) => member.id === proposerId)
        || (Array.isArray(commentProfiles) ? commentProfiles.find((item) => item.id === proposerId) : null)
      return profile?.fullName || profile?.email || ''
    }, [pendingProposal, commentMembers, commentProfiles])
    const canSeeProposalReview = Boolean(canReviewDesignerProposals && pendingProposal)
    const proposalReviewActive = canSeeProposalReview && proposalViewOpen

    // Cambiar de página vuelve siempre a lo publicado: la aprobación es por
    // página, y el panel de secciones sigue derivando del doc montado (que en
    // vista propuesta no existe), así que arrastrar la vista entre páginas
    // dejaría la columna izquierda describiendo otra cosa.
    useEffect(() => {
      setProposalViewOpen(false)
    }, [activePageId])

    // La propuesta desapareció (aprobada, rechazada, o el rol dejó de poder
    // revisarla) → no hay nada que comparar.
    useEffect(() => {
      if (!canSeeProposalReview) setProposalViewOpen(false)
    }, [canSeeProposalReview])
    const [contentRuleNotice, setContentRuleNotice] = useState('')
  ```

  Reemplazar por:
  ```js
    const [contentRuleNotice, setContentRuleNotice] = useState('')
  ```

- [ ] **Step 6: Borrar `openProposalView`**

  Localizar (entre el cierre de `snapshotActivePage` y `loadPageIntoEditor`):
  ```js
    // Abre el comparador de propuesta. Vive acá y no junto al resto del estado
    // de propuesta porque necesita snapshotActivePage (declarado justo arriba):
    // si el revisor tenía cambios sin guardar, el snapshot los deja en `pages` y
    // vuelven al editor al cerrar el comparador — mismo contrato que el cambio
    // de modo Brief→Preview, que también desmonta EditorPanel.
    const openProposalView = useCallback(() => {
      if (!canSeeProposalReview) return
      snapshotActivePage()
      setProposalViewOpen(true)
    }, [canSeeProposalReview, snapshotActivePage])

    const loadPageIntoEditor = useCallback((page, shouldScroll = true) => {
  ```

  Reemplazar por:
  ```js
    const loadPageIntoEditor = useCallback((page, shouldScroll = true) => {
  ```

- [ ] **Step 7: Mensaje de guardado — quitar la rama `data.proposalSaved`**

  Localizar:
  ```js
        setSaveMessage(
          data.proposalSaved
            ? (source === 'autosave' ? 'Propuesta autoguardada' : 'Propuesta guardada')
            : (source === 'autosave' ? 'Autoguardado' : 'Guardado')
        )
  ```

  Reemplazar por:
  ```js
        setSaveMessage(source === 'autosave' ? 'Autoguardado' : 'Guardado')
  ```

- [ ] **Step 8: Borrar `handleDesignerProposalDecision` completa**

  Localizar (función completa, entre el cierre de la función anterior y el
  comentario `// F4 (colaboración) — resuelve un conflicto...`):
  ```js
    async function handleDesignerProposalDecision(status) {
      if (!canReviewDesignerProposals || !activePage?.pendingProposal?.id) return
      if (isDecidingProposal) return // guard: evita doble-click mientras la decisión está en vuelo

      // proposalDiff refleja la propuesta ANTES de decidirla — capturarlo acá
      // porque una vez que setPages reemplace la página, pendingProposal pasa a
      // null y proposalDiff se vacía en el próximo render.
      const diffSummary = summarizeProposalDiff(proposalDiff?.counts)

      setPanelError('')
      setIsDecidingProposal(true)
      setSaveMessage(status === 'accepted' ? 'Aprobando propuesta...' : 'Rechazando propuesta...')

      try {
        const data = await apiFetch(`/api/projects/${projectId}/pages/${activePage.id}/proposals/${activePage.pendingProposal.id}/decision`, {
          method: 'POST',
          body: JSON.stringify({ status }),
        })

        // El endpoint ya devuelve la página actualizada (ver POST .../decision
        // en backend/src/routes/projects.js) — evita el GET completo del
        // proyecto que antes agregaba un segundo round-trip bloqueante acá.
        // loadSidePanelData() abajo queda fire-and-forget: solo trae
        // actividad/notificaciones/entregables, nada que bloquee el canvas.
        if (data.page) {
          const mappedPage = mapPersistedPage(data.page, projectType)
          setPages((prev) => prev.map((page) => (page.id === mappedPage.id ? mappedPage : page)))
          // F3 (colaboración): este es un fill point de serverPagesRef igual que
          // la carga inicial y el post-save — si no se refresca acá, la 'base'
          // del próximo merge de 3 vías queda stale (pre-propuesta) y puede
          // generar conflictos falsos con una tercera sesión que edite después.
          serverPagesRef.current.set(mappedPage.id, { contentHtml: mappedPage.fullContent, version: mappedPage.version })
          // Aprobar reemplaza el content_html de la página, pero el editor montado
          // sigue con el doc viejo: setPages actualiza el state, no el doc de
          // TipTap (loadPageIntoEditor solo corría al cambiar de página). Sin esto
          // el revisor aprueba y el canvas no cambia hasta recargar — justo la
          // sensación de "aprobé y no pasó nada". Cuando el comparador está
          // abierto no hace falta: EditorPanel está desmontado y al volver se
          // monta con el `initialContent` ya fresco.
          if (!proposalViewOpen && editorRef.current && !editorRef.current.isDestroyed) {
            loadPageIntoEditor(mappedPage, false)
          }
        }

        loadSidePanelData()

        const summaryText = status === 'accepted'
          ? (diffSummary ? `Propuesta aprobada: ${diffSummary}` : 'Propuesta aprobada')
          : 'Propuesta rechazada'
        setSaveMessage(summaryText)
        setIsDirty(false)
        showToast({ kind: 'info', text: summaryText })
      } catch (error) {
        const message = error.message || 'No se pudo revisar la propuesta'
        setSaveMessage(message)
        setPanelError(message)
        showToast({ kind: 'warning', text: message })
      } finally {
        setIsDecidingProposal(false)
      }
    }

    // F4 (colaboración) — resuelve un conflicto de sección elegido en
  ```

  Reemplazar por:
  ```js
    // F4 (colaboración) — resuelve un conflicto de sección elegido en
  ```

- [ ] **Step 9: Render central — borrar `ProposalReviewPanel` y su invocación,
  destrabar los tres paneles**

  **9a** — localizar (comentario + bloque `proposalReviewActive` + inicio del
  bloque Brief):
  ```js
          {/* Área central: comparador de propuesta / editor / handoff / preview.
              El comparador es un eje aparte del modo (qué versión se ve, no qué
              vista), así que reemplaza a los tres mientras está abierto. */}
          {proposalReviewActive && (
            <ProposalReviewPanel
              pageName={activePage?.name || 'Página'}
              proposal={pendingProposal}
              diff={proposalDiff}
              proposerName={proposerName}
              scrollRequest={scrollRequest}
              onShowPublished={() => setProposalViewOpen(false)}
              onApprove={() => handleDesignerProposalDecision('accepted')}
              isDeciding={isDecidingProposal}
            />
          )}

          {!proposalReviewActive && editorMode === 'brief' && (
  ```

  Reemplazar por:
  ```js
          {editorMode === 'brief' && (
  ```

  **9b** — localizar:
  ```js
          {!proposalReviewActive && editorMode === 'handoff' && (
  ```

  Reemplazar por:
  ```js
          {editorMode === 'handoff' && (
  ```

  **9c** — localizar:
  ```js
          {!proposalReviewActive && editorMode === 'preview' && (
  ```

  Reemplazar por:
  ```js
          {editorMode === 'preview' && (
  ```

- [ ] **Step 10: Props de `<UpdatesPanel>` — quitar las de propuesta**

  **10a** — localizar:
  ```js
            canManageProjectMeta={canManageProjectMeta}
            canReviewDesignerProposals={canReviewDesignerProposals}
            isDesigner={isDesigner}
            onRefresh={refreshSidePanelData}
  ```

  Reemplazar por:
  ```js
            canManageProjectMeta={canManageProjectMeta}
            onRefresh={refreshSidePanelData}
  ```

  **10b** — localizar:
  ```js
            onUpdateDeliverableStatus={updateDeliverableStatus}
            onApproveDesignerProposal={() => handleDesignerProposalDecision('accepted')}
            isDecidingProposal={isDecidingProposal}
            proposalDiff={proposalDiff}
            proposalViewOpen={proposalViewOpen}
            onOpenProposalView={openProposalView}
            onActivityClick={navigateToActivity}
  ```

  Reemplazar por:
  ```js
            onUpdateDeliverableStatus={updateDeliverableStatus}
            onActivityClick={navigateToActivity}
  ```

- [ ] **Step 11: Borrar el componente `ProposalReviewPanel` completo (y
  `PROPOSAL_STATUS_META`)**

  Localizar (bloque completo, entre el cierre de `SectionHistoryList` — el
  `}` seguido de línea en blanco — y `function PreviewPanel(...)`):
  ```js
  // ---------------------------------------------------------------------------
  // ProposalReviewPanel — comparador Publicado ↔ Propuesta (solo lectura)
  // ---------------------------------------------------------------------------
  // Ocupa la columna central en lugar del editor mientras el revisor mira la
  // propuesta. Es deliberadamente NO editable: lo que se ve es el contenido que
  // aprobar/rechazar, no un borrador propio — editar acá escribiría sobre la
  // página publicada y no sobre la propuesta, que es justo la confusión que este
  // panel viene a resolver.
  //
  // Reusa las clases de PreviewPanel (previewPanel/previewToolbar/previewScroll/
  // previewPage) para que lea como la misma superficie de producto, y el atributo
  // data-preview-page para heredar los estilos de tabla/hr/CTA del HTML crudo.
  // Lo propio son los chips por sección que vienen del diff.
  const PROPOSAL_STATUS_META = {
    added: { label: 'Nueva', chipClass: 'proposalChipAdded' },
    changed: { label: 'Modificada', chipClass: 'proposalChipChanged' },
    removed: { label: 'Eliminada', chipClass: 'proposalChipRemoved' },
  }

  function ProposalReviewPanel({
    pageName = 'Página',
    proposal,
    diff,
    proposerName = '',
    scrollRequest,
    onShowPublished,
    onApprove,
    isDeciding = false,
  }) {
    const scrollRef = useRef(null)
    const contentRef = useRef(null)

    // Click en el panel de secciones (o deep-link ?s=) mientras el comparador
    // está abierto: acá no hay canvas ni dividers, así que el ancla es el
    // wrapper de cada sección. Sin animación de flash — el chip ya marca qué
    // cambió, y un flash amarillo encima competiría con esa señal.
    useEffect(() => {
      if (!scrollRequest || scrollRequest.type !== 'section') return
      const scroller = scrollRef.current
      const content = contentRef.current
      if (!scroller || !content) return
      const target = content.querySelector(`[data-proposal-section="${scrollRequest.sectionId}"]`)
      if (!target) return
      const top = target.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop - 70
      scroller.scrollTo({ top: Math.max(0, top), behavior: 'smooth' })
    }, [scrollRequest])

    const sections = diff?.sections || []
    const removedSections = diff?.removedSections || []
    const summary = summarizeProposalDiff(diff?.counts)
    const updatedAt = formatPanelDate(proposal?.updatedAt)
    const metaLine = [
      proposerName && `Por ${proposerName}`,
      updatedAt && `Actualizada ${updatedAt}`,
      summary ? `${summary}` : 'Sin cambios respecto a lo publicado',
    ].filter(Boolean).join(' · ')

    // Diff a nivel bloque solo para secciones 'changed': published/proposal
    // ambos existen (publishedInnerHtml viene de proposalDiff.js). Memoizado
    // por `sections` para no recalcular el LCS en cada render del panel (p.ej.
    // al togglear isDeciding).
    const changedSectionBlocks = useMemo(() => {
      const map = new Map()
      sections.forEach((section) => {
        if (section.status === 'changed' && section.publishedInnerHtml != null) {
          map.set(section.sectionId, diffProposalBlocks(section.publishedInnerHtml, section.innerHtml))
        }
      })
      return map
    }, [sections])

    function renderSection(section) {
      const meta = PROPOSAL_STATUS_META[section.status] || null
      const blockDiff = changedSectionBlocks.get(section.sectionId) || null
      return (
        <div
          key={`${section.status}-${section.sectionId}`}
          data-proposal-section={section.sectionId}
          className={cx(
            styles.proposalSection,
            section.status === 'removed' && styles.proposalSectionRemoved,
          )}
        >
          {meta && (
            <div className={styles.proposalSectionHeader}>
              <span className={cx(styles.proposalChip, styles[meta.chipClass])}>{meta.label}</span>
              <span className={styles.proposalSectionName}>{section.sectionName}</span>
              {section.renamedFrom && (
                <span className={styles.proposalSectionRename}>antes: {section.renamedFrom}</span>
              )}
            </div>
          )}
          {/* Mismo sink de HTML crudo que Preview/Handoff — ver nota de
              sanitización en CONTEXT.min.md (target=editor.collab). */}
          {blockDiff ? (
            blockDiff.blocks.map((block, index) => (
              <div
                key={`${section.sectionId}-block-${index}`}
                className={cx(
                  styles.proposalBlock,
                  block.type === 'added' && styles.proposalBlockAdded,
                  block.type === 'removed' && styles.proposalBlockRemoved,
                )}
                dangerouslySetInnerHTML={{ __html: sanitizeContentHtml(block.html) }}
              />
            ))
          ) : (
            <div
              className={cx(
                section.status === 'added' && styles.proposalContentAdded,
                section.status === 'removed' && styles.proposalContentRemoved,
              )}
              dangerouslySetInnerHTML={{ __html: sanitizeContentHtml(section.innerHtml) }}
            />
          )}
        </div>
      )
    }

    return (
      <div className={styles.previewPanel}>
        <div className={styles.previewToolbar}>
          <div className={styles.proposalReviewHeaderMain}>
            <p className={styles.handoffEyebrow}>Propuesta de diseño · solo lectura</p>
            <h2 className={styles.handoffTitle}>{pageName}</h2>
            <p className={styles.proposalReviewMeta}>{metaLine}</p>
            {diff?.hasChanges && (
              <p className={styles.proposalReviewLegend}>verde = agregado · rojo = eliminado</p>
            )}
          </div>
          <div className={styles.proposalReviewHeaderActions}>
            <div
              className={styles.segmentedControl}
              style={{ '--seg-count': 2, '--seg-index': 1 }}
              role="tablist"
              aria-label="Versión que se está viendo"
            >
              <div className={styles.segmentedIndicator} aria-hidden="true" />
              <button
                type="button"
                role="tab"
                aria-selected={false}
                className={styles.segmentedOption}
                onClick={onShowPublished}
              >
                Publicado
              </button>
              <button
                type="button"
                role="tab"
                aria-selected
                className={cx(styles.segmentedOption, styles.segmentedOptionActive)}
              >
                Propuesta
              </button>
            </div>
            <div className={styles.proposalReviewDecisions}>
              <Button variant="primary" size="sm" onClick={onApprove} disabled={isDeciding}>
                {isDeciding ? 'Aprobando…' : 'Aprobar'}
              </Button>
            </div>
          </div>
        </div>
        <div ref={scrollRef} className={styles.previewScroll}>
          <article ref={contentRef} data-preview-page="" className={styles.previewPage}>
            {sections.map(renderSection)}
            {removedSections.map(renderSection)}
            {!sections.length && !removedSections.length && (
              <p className={styles.proposalReviewEmpty}>La propuesta no tiene contenido.</p>
            )}
          </article>
        </div>
      </div>
    )
  }

  function PreviewPanel({ page, projectType = 'page', scrollRequest, flashRequest, onScrollHeadingChange }) {
  ```

  Reemplazar por:
  ```js
  function PreviewPanel({ page, projectType = 'page', scrollRequest, flashRequest, onScrollHeadingChange }) {
  ```

  Esto también elimina el único punto donde se usaba `styles.segmentedControl`
  /`segmentedIndicator`/`segmentedOption`/`segmentedOptionActive`/
  `previewPanel`/`previewToolbar`/`previewScroll`/`handoffEyebrow`/
  `handoffTitle` DESDE `ProposalReviewPanel` — esas clases NO se tocan en el
  CSS (Step 16) porque las sigue usando `PreviewPanel`/`HandoffPanel` (el
  pill Brief/Handoff/Preview real). Verificado con `rg` antes de escribir
  este plan.

- [ ] **Step 12: Destructuring de `UpdatesPanel` — quitar los 7 props de propuesta**

  **12a** — localizar:
  ```js
    canManageProjectMeta = true,
    canReviewDesignerProposals = false,
    isDesigner = false,
    onRefresh,
  ```

  Reemplazar por:
  ```js
    canManageProjectMeta = true,
    onRefresh,
  ```

  **12b** — localizar:
  ```js
    onUpdateDeliverableStatus,
    onApproveDesignerProposal,
    isDecidingProposal = false,
    proposalDiff = null,
    proposalViewOpen = false,
    onOpenProposalView,
    onActivityClick,
  ```

  Reemplazar por:
  ```js
    onUpdateDeliverableStatus,
    onActivityClick,
  ```

- [ ] **Step 13: `sectionOrderIndex` / `groupedSectionActivity` — quitar `pendingProposalHtml`**

  Esto es "el argumento `pendingProposalHtml` de `buildSectionOrderIndex`"
  que pide quitar el spec, más el fallback muerto que dependía de él en
  `groupedSectionActivity` (con propuestas eliminadas, `activePage.pendingProposal`
  nunca existe — ver Step 2 — así que `proposalSections`/`proposalSection`
  siempre habrían sido `[]`/`null`).

  Localizar (entre `diffEntry` y `sectionActivity`... hasta el cierre de
  `groupedSectionActivity`):
  ```js
    const [diffEntry, setDiffEntry] = useState(null)
    // Orden SIEMPRE por posición de sección en el documento — nunca por fecha
    // ni por lectura (ver frontend/src/lib/activityOrdering.js). Secciones que
    // solo existen en una propuesta de diseño pendiente (designer aún no
    // aprobado) se agrupan igual que las demás, después de las del doc
    // publicado, en el orden de la propuesta.
    const pendingProposalHtml = activePage?.pendingProposal?.contentHtml || ''
    const sectionOrderIndex = useMemo(() => (
      buildSectionOrderIndex(sections, pendingProposalHtml)
    ), [sections, pendingProposalHtml])
    const sectionActivity = useMemo(() => (
      activity.filter((item) => (
        (item.eventType === 'section_edited' || item.eventType === 'asset_uploaded' || item.eventType === 'seo_changed')
        && item.metadata?.sectionId
        && item.metadata?.pageId === activePageId
      ))
    ), [activity, activePageId])
    const groupedSectionActivity = useMemo(() => {
      const proposalSections = pendingProposalHtml ? splitSections(pendingProposalHtml) : []
      return orderSectionActivityGroups(sectionActivity, sectionOrderIndex).map(({ sectionId, items }) => {
        const section = sections.find((s) => s.id === sectionId)
        const proposalSection = !section ? proposalSections.find((s) => s.sectionId === sectionId) : null
        // Special virtual section IDs use the metadata-stored sectionName
        const sectionName = sectionId === '__document__'
          ? (items[0]?.metadata?.sectionName || 'Documento')
          : sectionId === '__seo__'
          ? (items[0]?.metadata?.sectionName || 'SEO metadata')
          : (section?.name || proposalSection?.sectionName || items[0]?.metadata?.sectionName || 'Sección')
        return { sectionId, sectionName, items }
      })
    }, [sectionActivity, sectionOrderIndex, sections, pendingProposalHtml])
  ```

  Reemplazar por:
  ```js
    const [diffEntry, setDiffEntry] = useState(null)
    // Orden SIEMPRE por posición de sección en el documento — nunca por fecha
    // ni por lectura (ver frontend/src/lib/activityOrdering.js).
    const sectionOrderIndex = useMemo(() => (
      buildSectionOrderIndex(sections)
    ), [sections])
    const sectionActivity = useMemo(() => (
      activity.filter((item) => (
        (item.eventType === 'section_edited' || item.eventType === 'asset_uploaded' || item.eventType === 'seo_changed')
        && item.metadata?.sectionId
        && item.metadata?.pageId === activePageId
      ))
    ), [activity, activePageId])
    const groupedSectionActivity = useMemo(() => (
      orderSectionActivityGroups(sectionActivity, sectionOrderIndex).map(({ sectionId, items }) => {
        const section = sections.find((s) => s.id === sectionId)
        // Special virtual section IDs use the metadata-stored sectionName
        const sectionName = sectionId === '__document__'
          ? (items[0]?.metadata?.sectionName || 'Documento')
          : sectionId === '__seo__'
          ? (items[0]?.metadata?.sectionName || 'SEO metadata')
          : (section?.name || items[0]?.metadata?.sectionName || 'Sección')
        return { sectionId, sectionName, items }
      })
    ), [sectionActivity, sectionOrderIndex, sections])
  ```

- [ ] **Step 14: Quitar `pendingProposal` / `proposalDiffSummary` de `UpdatesPanel`**

  Localizar:
  ```js
    const hasActivity = groupedSectionActivity.length > 0 || generalActivity.length > 0
    const pendingProposal = activePage?.pendingProposal || null
    // "2 nuevas · 1 modificada" — el revisor sabe cuánto hay antes de abrir el
    // comparador. Vacío cuando la propuesta no difiere de lo publicado.
    const proposalDiffSummary = summarizeProposalDiff(proposalDiff?.counts)
  ```

  Reemplazar por:
  ```js
    const hasActivity = groupedSectionActivity.length > 0 || generalActivity.length > 0
  ```

- [ ] **Step 15: Borrar la caja "Propuesta de diseño / Tu propuesta" del panel derecho**

  Localizar (bloque JSX completo, entre el aviso de `notice` y la caja
  `{false && projectType === 'page' && (` de Entregables):
  ```js
          {pendingProposal && projectType === 'page' && (
            <div className={panelStyles.proposalBox}>
              <div className={panelStyles.proposalHeader}>
                <span className={panelStyles.pendingTitle}>
                  {canReviewDesignerProposals ? 'Propuesta de diseño' : 'Tu propuesta'}
                </span>
                <span className={panelStyles.proposalBadge}>Pendiente</span>
              </div>
              <p className={panelStyles.proposalText}>
                {canReviewDesignerProposals
                  ? (proposalDiffSummary
                      ? `Cambios en esta página: ${proposalDiffSummary}.`
                      : 'Revisa la propuesta y apruébala para publicarla. Si necesitas ajustes, deja comentarios al diseñador.')
                  : 'Tus cambios no afectan el contenido publicado hasta que editor o manager los aprueben.'}
              </p>
              {pendingProposal.reviewerNote && (
                <p className={panelStyles.proposalText}>Nota: {pendingProposal.reviewerNote}</p>
              )}
              {canReviewDesignerProposals ? (
                <div className={panelStyles.proposalActions}>
                  {/* Primero VER, después decidir: aprobar sin haber abierto el
                      comparador es exactamente el agujero que esto cierra. */}
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={<Eye size={14} />}
                    onClick={onOpenProposalView}
                    disabled={proposalViewOpen}
                  >
                    {proposalViewOpen ? 'Viendo propuesta' : 'Ver propuesta'}
                  </Button>
                  <Button variant="primary" size="sm" onClick={onApproveDesignerProposal} disabled={isDecidingProposal}>
                    {isDecidingProposal ? 'Aprobando…' : 'Aprobar'}
                  </Button>
                </div>
              ) : isDesigner ? (
                <p className={panelStyles.deliverablesEmpty}>Puedes seguir editando y guardando sobre esta propuesta.</p>
              ) : null}
            </div>
          )}
          {false && projectType === 'page' && (
  ```

  Reemplazar por:
  ```js
          {false && projectType === 'page' && (
  ```

- [ ] **Step 16: CSS exclusivo del comparador en `ProjectEditor.module.css`**

  **16a** — recortar la mención al comparador en el comentario de
  `.previewPage img` (la regla en sí queda: la usa `PreviewPanel`, ver
  `frontend/src/pages/ProjectEditor.jsx` línea ~11267):

  Localizar:
  ```css
  /* El nodo imagen solo emite `max-width:100%` inline cuando tiene un width
     explícito (ver EditableImageNode.addAttributes.width.renderHTML): una imagen
     nunca redimensionada llega sin estilo y desbordaba la hoja a lo ancho
     (scrollbar horizontal en toda la columna). El canvas no lo sufre porque
     tiene su propia regla bajo :global(.ProseMirror). Aplica a Preview y al
     comparador de propuesta, que pintan el HTML crudo. */
  ```

  Reemplazar por:
  ```css
  /* El nodo imagen solo emite `max-width:100%` inline cuando tiene un width
     explícito (ver EditableImageNode.addAttributes.width.renderHTML): una imagen
     nunca redimensionada llega sin estilo y desbordaba la hoja a lo ancho
     (scrollbar horizontal en toda la columna). El canvas no lo sufre porque
     tiene su propia regla bajo :global(.ProseMirror). Aplica a Preview, que
     pinta el HTML crudo. */
  ```

  **16b** — borrar el bloque completo del comparador, incluidos los chips
  (`.proposalReview*`, `.proposalSection*`, `.proposalChip*`, `.proposalBlock*`,
  `.proposalContent*`) Y las reglas `:global(.__wb-diff-ins/del)`: se
  verificó con `rg` que `__wb-diff-ins`/`__wb-diff-del` los genera ÚNICAMENTE
  `frontend/src/lib/proposalBlockDiff.js` (líneas 188-189) — el visor de
  diffs del historial (`HistoryDiffModal`, usa `diffWords` de la librería
  `diff`) pinta sus `<ins>/<del>` con clases propias
  (`panelStyles.diffAdded`/`diffRemoved`), no con estas. Al borrar
  `proposalBlockDiff.js` en Task A4 nada vuelve a emitir estas dos clases, así
  que también quedan muertas.

  El bloque a borrar empieza en la línea que dice exactamente
  `/* ── Comparador de propuesta de diseño ──────────────────────────────────`
  (aparece una sola vez en el archivo — confirmar con
  `rg -c "Comparador de propuesta de diseño" frontend/src/pages/ProjectEditor.module.css`
  → `1`) y termina en el cierre de la regla
  `.previewPage :global(.__wb-diff-del) { ... }`, cuyas líneas finales son
  exactamente:
  ```css
  .previewPage :global(.__wb-diff-del) {
    background: var(--wb-color-danger-100);
    text-decoration: line-through;
    border-radius: 2px;
    padding: 0 3px;
    margin: 0 1px;
  }
  ```
  (también aparece una sola vez — confirmar con
  `rg -c "__wb-diff-del" frontend/src/pages/ProjectEditor.module.css` → `1`
  antes de borrar).

  Borrar desde la primera línea citada hasta la última inclusive, más la
  única línea en blanco que sigue inmediatamente después del `}` de cierre
  (para no dejar tres líneas en blanco seguidas antes de
  `:global(.ProseMirror) { ... }`, que es la regla siguiente y NO se toca).
  Resultado esperado: exactamente una línea en blanco entre `.previewPage img { ... }`
  (Step 16a) y `:global(.ProseMirror) { ... }`.

- [ ] **Step 17: CSS exclusivo de la caja de propuesta en `ProjectEditorPanels.module.css`**

  **17a** — localizar:
  ```css
  .markReadBtn,
  .proposalSecondaryButton {
  ```
  Reemplazar por:
  ```css
  .markReadBtn {
  ```

  **17b** — localizar:
  ```css
  .markReadBtn:hover:not(:disabled),
  .proposalSecondaryButton:hover:not(:disabled) {
  ```
  Reemplazar por:
  ```css
  .markReadBtn:hover:not(:disabled) {
  ```

  **17c** — localizar:
  ```css
  .markReadBtn:disabled,
  .proposalSecondaryButton:disabled {
  ```
  Reemplazar por:
  ```css
  .markReadBtn:disabled {
  ```

  (`.proposalSecondaryButton` ya estaba sin ningún uso en JSX/JS antes de
  este plan — se verificó con `rg` en todo `frontend/src`. Se limpia igual
  por ser CSS muerto del mismo sistema.)

  **17d** — localizar:
  ```css
  .updatesError,
  .updatesNotice,
  .pendingItem,
  .proposalText,
  .deliverablesEmpty {
  ```
  Reemplazar por:
  ```css
  .updatesError,
  .updatesNotice,
  .pendingItem,
  .deliverablesEmpty {
  ```

  **17e** — localizar:
  ```css
  .pendingBox,
  .proposalBox,
  .deliverablesBox,
  .shareBox {
  ```
  Reemplazar por:
  ```css
  .pendingBox,
  .deliverablesBox,
  .shareBox {
  ```

  **17f** — borrar el resto de las reglas exclusivas (`.proposalHeader`,
  `.proposalBadge`, la regla suelta `.proposalText { ... }`, los dos
  comentarios de layout y `.proposalActions`/`.proposalActions > *`), todas
  contiguas:

  Localizar:
  ```css
  .proposalHeader {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 8px;
  }

  .proposalBadge {
    min-height: 22px;
    display: inline-flex;
    align-items: center;
    padding: 0 8px;
    border-radius: 999px;
    background: var(--wb-color-warning-100);
    color: var(--wb-color-warning-800);
    font-size: 11px;
    font-weight: 700;
  }

  .proposalText {
    margin: 0 0 8px;
    color: var(--wb-color-neutral-500);
  }

  /* Fila única y estable: "Ver propuesta" + "Aprobar" (sin "Pedir cambios" —
     el feedback al diseñador se da por comentarios). Cada botón puede
     encogerse dentro de su columna en vez de forzar su ancho de contenido
     (min-width: 0 + flex-basis 0), así el ancho lo decide el contenedor y la
     fila nunca desborda la card. Ver DESIGN-SYSTEM.md §"min-width: 0 on flex
     children". */
  /* Columna, no fila: el panel derecho es angosto (~150-220px de card útil) y
     dos botones con estos labels lado a lado truncan el texto. Apilados a ancho
     completo siempre se leen enteros, sin importar el viewport. */
  .proposalActions {
    display: flex;
    flex-direction: column;
    gap: var(--wb-space-2);
  }

  .proposalActions > * {
    width: 100%;
  }

  .deliverableButton,
  ```

  Reemplazar por:
  ```css
  .deliverableButton,
  ```

- [ ] **Step 18: `FirstTimeTooltipsRoot.jsx` — copy neutral del tooltip de notificaciones**

  Localizar:
  ```js
    'notifications-bell': {
      title: 'Notificaciones',
      body: 'Aquí ves cuando algo cambia: proyecto creado, link compartido, propuesta aprobada.',
    },
  ```

  Reemplazar por:
  ```js
    'notifications-bell': {
      title: 'Notificaciones',
      body: 'Aquí ves cuando algo cambia: proyecto creado, link compartido, contenido actualizado.',
    },
  ```

- [ ] **Step 19: Verificación**

  ```bash
  cd /Users/adrian/GitHub/webbrief
  rg -ni "proposal|propuesta" frontend/src/pages/ProjectEditor.jsx
  rg -ni "proposal|propuesta" frontend/src/pages/ProjectEditor.module.css
  rg -ni "proposal|propuesta" frontend/src/pages/ProjectEditorPanels.module.css
  rg -n "propuesta aprobada" frontend/src/components/onboarding/FirstTimeTooltipsRoot.jsx
  ```

  Esperado: los cuatro comandos sin output.

  ```bash
  cd /Users/adrian/GitHub/webbrief/frontend && npm run build
  ```

  Esperado: `✓ built in <N>s`, sin errores (el warning preexistente de
  "chunks larger than 500 kB" — incluye `ProjectEditor-*.js` — es esperable y
  ajeno a este cambio; de hecho debería bajar de tamaño al haber menos código).

  ```bash
  cd /Users/adrian/GitHub/webbrief/backend && npm test 2>&1 | tail -15
  ```

  Esperado: termina en `# fail 0` (este task no toca archivos de test, es
  una verificación de que nada del backend quedó roto de rebote).

- [ ] **Step 20: Commit**

  ```bash
  cd /Users/adrian/GitHub/webbrief
  git add frontend/src/pages/ProjectEditor.jsx frontend/src/pages/ProjectEditor.module.css frontend/src/pages/ProjectEditorPanels.module.css frontend/src/components/onboarding/FirstTimeTooltipsRoot.jsx
  git commit -m "$(cat <<'EOF'
  refactor(editor): elimina la UI de aprobación de propuestas de diseño

  Todos los roles con permiso de escritura publican directo, incluido
  Diseño — la red de seguridad es el historial por sección ("Ver detalle"
  → "Restaurar esta versión"), que ya existe. Quita de ProjectEditor.jsx
  el comparador Publicado/Propuesta (ProposalReviewPanel) y su control
  segmentado, la caja "Propuesta de diseño" del panel derecho y sus
  props, pendingProposal en mapPersistedPage, y el mensaje "Propuesta
  guardada". Limpia el CSS exclusivo del comparador en
  ProjectEditor.module.css y ProjectEditorPanels.module.css (conserva
  .previewPage y las demás clases que sigue usando PreviewPanel/
  HandoffPanel). Ajusta la copia del tooltip de notificaciones en
  FirstTimeTooltipsRoot.jsx.

  Parte A (frontend) de docs/superpowers/specs/2026-09-11-remove-approval-robust-uploads-design.md.

  Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
  EOF
  )"
  git status
  ```

  Verificar que `git status` no agregó ningún archivo fuera de los 4 listados
  arriba.

---

### Task A4: borrar `proposalDiff.js` / `proposalBlockDiff.js` y sus tests

**Prerrequisito: Task A6 debe estar commiteada primero** (ver "Orden de
ejecución" al principio de este documento) — hasta que A6 quita los dos
imports de `frontend/src/pages/ProjectEditor.jsx`, esos archivos siguen en
uso y borrarlos rompe `npm run build`.

**Files:**
- Delete: `frontend/src/lib/proposalDiff.js`
- Delete: `frontend/src/lib/proposalBlockDiff.js`
- Delete: `backend/test/proposal-diff.test.js`
- Delete: `backend/test/proposal-block-diff.test.js`

- [ ] **Step 1: Confirmar que ya no hay consumidores (además de los propios archivos)**

  ```bash
  cd /Users/adrian/GitHub/webbrief
  rg -n "proposalDiff|proposalBlockDiff|diffProposalSections|summarizeProposalDiff|diffProposalBlocks|splitTopLevelBlocks" --type-not md -g '!node_modules'
  ```

  Esperado: SOLO estas 4 rutas (cada una haciéndose referencia a sí misma o a
  las otras 3 del mismo grupo) — ninguna mención en
  `frontend/src/pages/ProjectEditor.jsx` ni en los `.module.css`:
  - `frontend/src/lib/proposalDiff.js`
  - `frontend/src/lib/proposalBlockDiff.js`
  - `backend/test/proposal-diff.test.js`
  - `backend/test/proposal-block-diff.test.js`

  Si aparece cualquier otra ruta, detenerse — significa que Task A6 no se
  aplicó (o quedó incompleta) y borrar estos archivos ahora rompería el build.

- [ ] **Step 2: Borrar los 4 archivos**

  ```bash
  cd /Users/adrian/GitHub/webbrief
  rm frontend/src/lib/proposalDiff.js frontend/src/lib/proposalBlockDiff.js backend/test/proposal-diff.test.js backend/test/proposal-block-diff.test.js
  ```

- [ ] **Step 3: Verificar que no queda ninguna referencia**

  ```bash
  cd /Users/adrian/GitHub/webbrief
  rg -n "proposalDiff|proposalBlockDiff|diffProposalSections|summarizeProposalDiff|diffProposalBlocks|splitTopLevelBlocks" --type-not md -g '!node_modules'
  ```

  Esperado: sin output.

- [ ] **Step 4: Suite completa del backend**

  ```bash
  cd /Users/adrian/GitHub/webbrief/backend && npm test 2>&1 | tail -15
  ```

  Esperado: `# fail 0` (dos suites menos que antes: `proposal-diff` y
  `proposal-block-diff` ya no existen).

- [ ] **Step 5: Build de frontend**

  ```bash
  cd /Users/adrian/GitHub/webbrief/frontend && npm run build
  ```

  Esperado: `✓ built in <N>s`, sin errores de resolución de módulos.

- [ ] **Step 6: Commit**

  ```bash
  cd /Users/adrian/GitHub/webbrief
  git rm frontend/src/lib/proposalDiff.js frontend/src/lib/proposalBlockDiff.js backend/test/proposal-diff.test.js backend/test/proposal-block-diff.test.js
  git commit -m "$(cat <<'EOF'
  refactor(editor): elimina los módulos de diff de propuestas de diseño

  proposalDiff.js y proposalBlockDiff.js (y sus tests) quedaron sin uso
  tras quitar el comparador Publicado/Propuesta de ProjectEditor.jsx. La
  tabla project_page_change_proposals se conserva como historial; nada
  en el frontend vuelve a leerla.

  Parte A (frontend) de docs/superpowers/specs/2026-09-11-remove-approval-robust-uploads-design.md.

  Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
  EOF
  )"
  git status
  ```

  Verificar que `git status` solo muestra estas 4 rutas borradas (además de
  los cambios sueltos preexistentes de la rama, que se dejan intactos).

---

## Nota para quien integre el plan completo (Parte A + Parte B + release)

- Ninguna de las 4 tasks de esta sección bumpea versión. El spec fija
  `frontend/package.json` → `2.16.0` (MINOR) como versión objetivo del
  conjunto completo (Parte A + Parte B). Ese bump debe vivir en el commit que
  efectivamente se vaya a deployar — asegurarse de que algún task posterior
  (probablemente al final de Parte B, o un task de release dedicado) lo
  incluya antes de mergear a `main`/deployar. No hacerlo dos veces.
- Parte B va a volver a tocar `frontend/src/pages/ProjectEditor.jsx`
  (`snapshotActivePage`, `saveProjectPages`, handlers de upload,
  `EditableImageView`). Debe partir del archivo tal como queda después de
  Task A6 (no antes) para que sus propios anclas de línea sean válidas.

## Parte B — Subidas de imágenes robustas

Sección del plan correspondiente a "Parte B — Subidas de imágenes robustas" del diseño aprobado
(`docs/superpowers/specs/2026-09-11-remove-approval-robust-uploads-design.md`), limitada a
`frontend/src/lib/pendingUploads.js` (+ su test) y `frontend/src/pages/ProjectEditor.jsx`, más la
documentación de contexto del repo.

## Notas de contexto (verificadas antes de planear)

- **Orden respecto de la Parte A.** La Parte A ya corrió cuando estas tareas se ejecutan (ver
  `00-header.md`: "primero todas las tareas A y después las B"). Se verificó contra
  `plan-parts/A-frontend.md` que ninguno de sus steps toca `snapshotActivePage`, `saveProjectPages` ni la
  lista de props de `<EditorPanel>` (su Task A6 explicita "No tocar... Esos cambios son de la Parte B"), y
  que su Step 1 deja la línea `import { stripPendingUploadImagesFromHtml, stripPendingUploadImagesFromJson,
  countPendingUploadImages } from '../lib/pendingUploads'` **con el mismo texto** (solo cambian las líneas
  vecinas de `proposalDiff`/`proposalBlockDiff`). Los anchors de abajo están escritos contra el archivo
  YA con la Parte A aplicada; ninguno depende de código que la Parte A borra (`proposalReviewActive`,
  `pendingProposal`, `data.proposalSaved`, etc.).
- **`EditableImageNode.addAttributes()`** (ProjectEditor.jsx, la extensión `Image.extend(...)` justo antes
  de `GoogleDocsHeadingShortcuts`) hereda `src`/`alt` de la extensión base `Image` y define además
  `width` (con su propio `data-width` + `style` inline — no participa de las subidas), `originalWidth`,
  `originalHeight`, `assetId`, `fileName`, `storagePath`. Cada uno de estos últimos cuatro solo se
  serializa (`renderHTML`) si tiene valor. Los helpers nuevos de `pendingUploads.js` replican exactamente
  ese subconjunto (`src`, `alt`, `data-asset-id`, `data-file-name`, `data-storage-path`,
  `data-original-width`, `data-original-height`) — nunca tocan `width`/`data-width`, que es tamaño
  elegido por el usuario, ajeno a la subida.
- **Estrategia de stale closure.** No existía ningún ref espejo de `pages` en el archivo. Se agrega
  `pagesRef` (Task B3) para que `onImageUploadDone`/`onImageUploadFailed` — que resuelven después de un
  round-trip async a `/assets` — puedan preguntar "¿qué página tiene este placeholder AHORA?" sin cerrar
  sobre el `pages` de cuando arrancó la subida. La escritura real siempre pasa por la forma funcional de
  `setPages((prev) => ...)`, nunca por `pagesRef` directamente: el ref solo decide QUÉ mostrar en el toast
  y si hace falta o no `setIsDirty(true)`; la mutación en sí siempre lee el `prev` fresco que React le pasa
  al updater. Mismo criterio para el guardado (`saveProjectPages`): `keepLocalPlaceholderContent` se aplica
  vía `setPages((current) => ...)`, no contra el `pages` capturado al armar el payload.
- **`runImageUploadFlow` (rutina compartida) no decide DÓNDE insertar la imagen ya subida.** Solo inserta
  el placeholder, llama a `uploadFn` y reporta el resultado por callbacks. La decisión "¿el editor montado
  todavía lo tiene? ¿alguna página del estado lo tiene? ¿no está en ningún lado?" vive enteramente en
  `ProjectEditor` (`onImageUploadDone`/`onImageUploadFailed`), porque son las únicas funciones con vista
  completa de `editorRef` + `pagesRef` — la rutina compartida corre también dentro de `Toolbar`, que ni
  siquiera recibe `activePageId` como prop.
- **QA manual y bump de versión no son parte de esta sección** — ver `plan-parts/Z-qa-release.md` (Task
  Q1: los 7 escenarios de navegador en Dev; Task R1: bump MINOR a 2.16.0). Esta sección no repite esos
  pasos.

---

### Task B1: `frontend/src/lib/pendingUploads.js` — helpers puros para reemplazar/quitar un placeholder

**Files:**
- Modify: `frontend/src/lib/pendingUploads.js`
- Modify: `backend/test/pending-uploads.test.js`

- [ ] **Step 1: Escribir los tests nuevos (deben fallar — las funciones todavía no existen)**

Localizar la línea de import al principio de `backend/test/pending-uploads.test.js`:

```js
import {
  isPendingUploadSrc,
  stripPendingUploadImagesFromHtml,
  stripPendingUploadImagesFromJson,
  countPendingUploadImages,
} from '../../frontend/src/lib/pendingUploads.js'
```

Reemplazar por:

```js
import {
  isPendingUploadSrc,
  stripPendingUploadImagesFromHtml,
  stripPendingUploadImagesFromJson,
  countPendingUploadImages,
  hasPendingUpload,
  replacePendingUploadInHtml,
  replacePendingUploadInJson,
  removePendingUploadFromHtml,
  removePendingUploadFromJson,
  stripPendingUploadsFromPages,
  imageAttrsFromAsset,
  keepLocalPlaceholderContent,
} from '../../frontend/src/lib/pendingUploads.js'
```

Al final del archivo (después del último test, `'countPendingUploadImages: cuenta solo placeholders'`),
agregar:

```js

// -------- 5. hasPendingUpload --------

test('hasPendingUpload: encuentra el placeholder exacto en HTML', () => {
  const html = `<p>hola</p><img src="${BLOB}" alt="a.png">`
  assert.equal(hasPendingUpload(html, BLOB), true)
})

test('hasPendingUpload: no confunde un tempUrl distinto ni uno que solo aparece en el alt', () => {
  const html = `<img src="${REAL}" alt="captura de ${BLOB}">`
  assert.equal(hasPendingUpload(html, BLOB), false)
  assert.equal(hasPendingUpload(html, REAL), true)
})

test('hasPendingUpload: recorre JSON de TipTap en profundidad', () => {
  const json = {
    type: 'doc',
    content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'hola' }] },
      { type: 'image', attrs: { src: BLOB } },
    ],
  }
  assert.equal(hasPendingUpload(json, BLOB), true)
  assert.equal(hasPendingUpload(json, REAL), false)
})

test('hasPendingUpload: entradas vacías/nulas no rompen', () => {
  assert.equal(hasPendingUpload('', BLOB), false)
  assert.equal(hasPendingUpload(null, BLOB), false)
  assert.equal(hasPendingUpload(undefined, BLOB), false)
  assert.equal(hasPendingUpload('<img src="x">', ''), false)
  assert.equal(hasPendingUpload('<img src="x">', null), false)
})

// -------- 6. imageAttrsFromAsset --------

test('imageAttrsFromAsset: mapea el shape del asset recién subido', () => {
  const asset = {
    id: 'asset-1',
    publicUrl: REAL,
    fileName: 'IMG_2542.webp',
    path: 'companies/c1/projects/p1/asset-IMG_2542.webp',
    width: 1200,
    height: 800,
  }
  assert.deepEqual(imageAttrsFromAsset(asset, 'fallback.png'), {
    src: REAL,
    assetId: 'asset-1',
    fileName: 'IMG_2542.webp',
    storagePath: 'companies/c1/projects/p1/asset-IMG_2542.webp',
    originalWidth: 1200,
    originalHeight: 800,
  })
})

test('imageAttrsFromAsset: null-safe — asset incompleto no tira, usa el fallback de nombre', () => {
  assert.deepEqual(imageAttrsFromAsset(null, 'archivo.png'), {
    src: '',
    assetId: null,
    fileName: 'archivo.png',
    storagePath: null,
    originalWidth: null,
    originalHeight: null,
  })
  assert.deepEqual(imageAttrsFromAsset({}, ''), {
    src: '',
    assetId: null,
    fileName: '',
    storagePath: null,
    originalWidth: null,
    originalHeight: null,
  })
})

// -------- 7. replacePendingUploadInHtml --------

test('replacePendingUploadInHtml: reemplaza src y agrega los data-* del asset', () => {
  const html = `<p>hola</p><img src="${BLOB}" alt="IMG_2542.webp"><p>chau</p>`
  const attrs = imageAttrsFromAsset({
    id: 'asset-1',
    publicUrl: REAL,
    fileName: 'IMG_2542.webp',
    path: 'p/asset.webp',
    width: 100,
    height: 50,
  })
  const result = replacePendingUploadInHtml(html, BLOB, attrs)
  assert.equal(
    result,
    `<p>hola</p><img src="${REAL}" alt="IMG_2542.webp" data-asset-id="asset-1" data-file-name="IMG_2542.webp" data-storage-path="p/asset.webp" data-original-width="100" data-original-height="50"><p>chau</p>`
  )
})

test('replacePendingUploadInHtml: no toca otras imágenes ni placeholders con otro tempUrl', () => {
  const otherBlob = `${BLOB}-other`
  const html = `<img src="${otherBlob}"><img src="${REAL}">`
  assert.equal(replacePendingUploadInHtml(html, BLOB, { src: REAL }), html)
})

test('replacePendingUploadInHtml: identidad cuando el tempUrl no está o falta', () => {
  const html = `<p>hola</p>`
  assert.equal(replacePendingUploadInHtml(html, BLOB, { src: REAL }), html)
  assert.equal(replacePendingUploadInHtml('', BLOB, { src: REAL }), '')
  assert.equal(replacePendingUploadInHtml(html, '', { src: REAL }), html)
})

// -------- 8. replacePendingUploadInJson --------

test('replacePendingUploadInJson: mergea attrs + src en el nodo image, sin mutar el original', () => {
  const json = {
    type: 'doc',
    content: [{ type: 'image', attrs: { src: BLOB, alt: 'IMG_2542.webp' } }],
  }
  const attrs = imageAttrsFromAsset({ id: 'asset-1', publicUrl: REAL, path: 'p/a.webp' })
  const result = replacePendingUploadInJson(json, BLOB, attrs)
  assert.equal(result.content[0].attrs.src, REAL)
  assert.equal(result.content[0].attrs.assetId, 'asset-1')
  assert.equal(result.content[0].attrs.alt, 'IMG_2542.webp')
  assert.equal(json.content[0].attrs.src, BLOB) // no mutó el original
})

test('replacePendingUploadInJson: identidad referencial cuando el tempUrl no está', () => {
  const json = { type: 'doc', content: [{ type: 'image', attrs: { src: REAL } }] }
  assert.equal(replacePendingUploadInJson(json, BLOB, { src: REAL }), json)
})

// -------- 9. removePendingUploadFromHtml / removePendingUploadFromJson --------

test('removePendingUploadFromHtml: quita solo el placeholder del tempUrl indicado', () => {
  const html = `<img src="${BLOB}"><img src="${BLOB}2"><img src="${REAL}">`
  assert.equal(removePendingUploadFromHtml(html, BLOB), `<img src="${BLOB}2"><img src="${REAL}">`)
})

test('removePendingUploadFromHtml: identidad cuando no está', () => {
  const html = `<img src="${REAL}">`
  assert.equal(removePendingUploadFromHtml(html, BLOB), html)
  assert.equal(removePendingUploadFromHtml('', BLOB), '')
})

test('removePendingUploadFromJson: descarta solo el nodo con ese tempUrl, sin mutar el original', () => {
  const json = {
    type: 'doc',
    content: [
      { type: 'image', attrs: { src: BLOB } },
      { type: 'image', attrs: { src: REAL } },
    ],
  }
  const result = removePendingUploadFromJson(json, BLOB)
  assert.equal(result.content.length, 1)
  assert.equal(result.content[0].attrs.src, REAL)
  assert.equal(json.content.length, 2)
})

test('removePendingUploadFromJson: nodo que queda vacío pierde la clave content', () => {
  const json = { type: 'doc', content: [{ type: 'image', attrs: { src: BLOB } }] }
  const result = removePendingUploadFromJson(json, BLOB)
  assert.equal('content' in result, false)
})

// -------- 10. stripPendingUploadsFromPages --------

test('stripPendingUploadsFromPages: filtra TODAS las páginas del payload, no solo una', () => {
  const payload = [
    {
      id: 'p1',
      contentHtml: `<p>a</p><img src="${BLOB}">`,
      contentJson: { type: 'doc', content: [{ type: 'image', attrs: { src: BLOB } }] },
    },
    { id: 'p2', contentHtml: '<p>b</p>', contentJson: { type: 'doc', content: [] } },
    { id: 'p3', contentHtml: `<p>c</p><img src="${BLOB}2"><img src="${BLOB}3">`, contentJson: null },
  ]
  const { pages, dropped } = stripPendingUploadsFromPages(payload)
  assert.equal(dropped, 3)
  assert.equal(pages[0].contentHtml, '<p>a</p>')
  assert.equal(pages[0].contentJson.content, undefined)
  assert.equal(pages[1].contentHtml, '<p>b</p>')
  assert.equal(pages[2].contentHtml, '<p>c</p>')
})

test('stripPendingUploadsFromPages: sin placeholders en ninguna página, dropped=0 y no toca las páginas', () => {
  const payload = [{ id: 'p1', contentHtml: '<p>a</p>', contentJson: null }]
  const { pages, dropped } = stripPendingUploadsFromPages(payload)
  assert.equal(dropped, 0)
  assert.equal(pages[0], payload[0])
})

// -------- 11. keepLocalPlaceholderContent --------

test('keepLocalPlaceholderContent: conserva el local con placeholder, toma el resto del persisted', () => {
  const localPages = [
    { id: 'p1', fullContent: `<p>a</p><img src="${BLOB}">`, contentJson: { local: true }, sections: ['local-section'] },
    { id: 'p2', fullContent: '<p>b</p>', contentJson: { local: true }, sections: [] },
  ]
  const persistedPages = [
    { id: 'p1', fullContent: '<p>a</p>', contentJson: { server: true }, sections: [], version: 5, name: 'Uno' },
    { id: 'p2', fullContent: '<p>b editado en otra sesión</p>', contentJson: { server: true }, sections: [], version: 3, name: 'Dos' },
  ]
  const result = keepLocalPlaceholderContent(localPages, persistedPages)

  assert.equal(result[0].fullContent, `<p>a</p><img src="${BLOB}">`)
  assert.deepEqual(result[0].contentJson, { local: true })
  assert.deepEqual(result[0].sections, ['local-section'])
  assert.equal(result[0].version, 5)

  assert.equal(result[1].fullContent, '<p>b editado en otra sesión</p>')
})

test('keepLocalPlaceholderContent: página persisted sin equivalente local pasa igual', () => {
  const result = keepLocalPlaceholderContent([], [{ id: 'p1', fullContent: '<p>a</p>' }])
  assert.equal(result[0].fullContent, '<p>a</p>')
})

// -------- 12. Propiedad anti-falso-positivo (la usan buildSectionActivityEvents/buildDocumentActivityEvents en ProjectEditor.jsx) --------

test('propiedad: dos HTML que solo difieren en un placeholder blob: quedan idénticos tras filtrar', () => {
  // Sin esto, comparar un `previousPages` con el marcador contra un `payload`
  // ya filtrado vería un image_removed falso en saveProjectPages.
  const withPlaceholder = `<p>hola</p><img src="${BLOB}">`
  const withoutPlaceholder = `<p>hola</p>`
  assert.equal(stripPendingUploadImagesFromHtml(withPlaceholder), stripPendingUploadImagesFromHtml(withoutPlaceholder))
})
```

- [ ] **Step 2: Correr los tests — deben fallar (las funciones nuevas no existen todavía)**

Run: `cd /Users/adrian/GitHub/webbrief/backend && npm test -- test/pending-uploads.test.js`

Expected: falla con errores del tipo `hasPendingUpload is not a function` (o `is not defined` /
`SyntaxError` de import) para cada función todavía no exportada. Los 11 tests preexistentes (los que no
usan las funciones nuevas) siguen en verde.

- [ ] **Step 3: Implementar las 8 funciones nuevas en `pendingUploads.js`**

Al final del archivo (después del cierre de `countPendingUploadImages`, que termina en `}` sin nada
debajo), agregar:

```js

// ---------------------------------------------------------------------------
// F2 (robustez de subidas, 2026-09-11) — ver docs/superpowers/specs/
// 2026-09-11-remove-approval-robust-uploads-design.md Parte B. A diferencia
// de las funciones de arriba (que borran TODOS los blob: del documento antes
// de persistir), estas operan sobre UN placeholder puntual por tempUrl: son
// la contrapartida de una subida que ya terminó (bien o mal) y necesita
// resolverse exactamente donde quedó, sea el editor montado o el estado de
// otra página.

const ALT_ATTR_RE = /\balt\s*=\s*"([^"]*)"/i

function escapeImgAttr(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

// Serializa exactamente como EditableImageNode.addAttributes()/renderHTML
// (frontend/src/pages/ProjectEditor.jsx, la extensión Image.extend(...) justo
// antes de GoogleDocsHeadingShortcuts): src + alt (de la extensión Image
// base) y los data-* custom, cada uno solo si tiene valor. Nunca toca
// width/data-width — es tamaño elegido por el usuario, ajeno a la subida.
function serializePendingUploadImageTag(attrs) {
  const parts = [`src="${escapeImgAttr(attrs.src)}"`, `alt="${escapeImgAttr(attrs.alt || '')}"`]
  if (attrs.assetId) parts.push(`data-asset-id="${escapeImgAttr(attrs.assetId)}"`)
  if (attrs.fileName) parts.push(`data-file-name="${escapeImgAttr(attrs.fileName)}"`)
  if (attrs.storagePath) parts.push(`data-storage-path="${escapeImgAttr(attrs.storagePath)}"`)
  if (attrs.originalWidth) parts.push(`data-original-width="${escapeImgAttr(attrs.originalWidth)}"`)
  if (attrs.originalHeight) parts.push(`data-original-height="${escapeImgAttr(attrs.originalHeight)}"`)
  return `<img ${parts.join(' ')}>`
}

function jsonNodeHasPendingUpload(node, tempUrl) {
  if (!node || typeof node !== 'object') return false
  if (node.type === 'image' && node.attrs?.src === tempUrl) return true
  if (!Array.isArray(node.content)) return false
  return node.content.some((child) => jsonNodeHasPendingUpload(child, tempUrl))
}

// source: HTML (string) o JSON de TipTap (objeto/nodo). true si ese tempUrl
// todavía está insertado como <img>/nodo image.
export function hasPendingUpload(source, tempUrl) {
  if (!tempUrl) return false

  if (typeof source === 'string') {
    if (!source.includes(tempUrl)) return false
    const re = new RegExp(IMG_TAG_RE.source, 'gi')
    let match
    while ((match = re.exec(source))) {
      const src = match[0].match(SRC_ATTR_RE)
      if (src && src[1] === tempUrl) return true
    }
    return false
  }

  return jsonNodeHasPendingUpload(source, tempUrl)
}

// Reemplaza el <img src="tempUrl"> por uno con los attrs finales (post-
// upload). Conserva el `alt` original salvo que attrs traiga uno propio.
export function replacePendingUploadInHtml(html, tempUrl, attrs = {}) {
  const source = html || ''
  if (!tempUrl || !source.includes(tempUrl)) return source

  return source.replace(IMG_TAG_RE, (tag) => {
    const srcMatch = tag.match(SRC_ATTR_RE)
    if (!srcMatch || srcMatch[1] !== tempUrl) return tag
    const altMatch = tag.match(ALT_ATTR_RE)
    const inheritedAlt = altMatch ? altMatch[1] : ''
    return serializePendingUploadImageTag({ ...attrs, alt: attrs.alt ?? inheritedAlt })
  })
}

// Espejo de replacePendingUploadInHtml sobre JSON de TipTap. No muta el nodo
// recibido — copia solo a lo largo del camino que cambia (mismo criterio que
// stripPendingUploadImagesFromJson, arriba).
export function replacePendingUploadInJson(json, tempUrl, attrs = {}) {
  if (!json || typeof json !== 'object' || !tempUrl) return json

  if (json.type === 'image' && json.attrs?.src === tempUrl) {
    return { ...json, attrs: { ...json.attrs, ...attrs, src: attrs.src } }
  }
  if (!Array.isArray(json.content)) return json

  let changed = false
  const content = json.content.map((child) => {
    const next = replacePendingUploadInJson(child, tempUrl, attrs)
    if (next !== child) changed = true
    return next
  })

  return changed ? { ...json, content } : json
}

// Quita el <img src="tempUrl"> puntual (subida fallida) — a diferencia de
// stripPendingUploadImagesFromHtml, que quita TODOS los blob:, esto apunta a
// uno solo por tempUrl.
export function removePendingUploadFromHtml(html, tempUrl) {
  const source = html || ''
  if (!tempUrl || !source.includes(tempUrl)) return source

  return source.replace(IMG_TAG_RE, (tag) => {
    const match = tag.match(SRC_ATTR_RE)
    return match && match[1] === tempUrl ? '' : tag
  })
}

// Espejo de removePendingUploadFromHtml sobre JSON de TipTap.
export function removePendingUploadFromJson(json, tempUrl) {
  if (!json || typeof json !== 'object' || !tempUrl) return json
  if (!Array.isArray(json.content)) return json

  const content = []
  let changed = false

  for (const child of json.content) {
    if (child?.type === 'image' && child?.attrs?.src === tempUrl) {
      changed = true
      continue
    }
    const next = removePendingUploadFromJson(child, tempUrl)
    if (next !== child) changed = true
    content.push(next)
  }

  if (!changed) return json
  const cleaned = { ...json, content }
  if (!content.length) delete cleaned.content
  return cleaned
}

// Filtra TODAS las páginas de un payload de PUT /api/projects/:id/pages
// (items { contentHtml, contentJson, ... }), no solo la activa — una página
// no-activa puede tener un placeholder de una subida que arrancó antes de
// navegar a otra. `dropped` es el total de placeholders descartados, para el
// aviso de guardado manual.
export function stripPendingUploadsFromPages(payloadPages) {
  const pages = []
  let dropped = 0

  for (const page of payloadPages || []) {
    const count = countPendingUploadImages(page?.contentHtml)
    if (!count) {
      pages.push(page)
      continue
    }
    dropped += count
    pages.push({
      ...page,
      contentHtml: stripPendingUploadImagesFromHtml(page.contentHtml),
      contentJson: stripPendingUploadImagesFromJson(page.contentJson),
    })
  }

  return { pages, dropped }
}

// Shape que deja un asset recién subido (POST /api/projects/:id/assets),
// listo para pasarle a replaceImageSrc / replacePendingUploadInHtml/Json.
// Null-safe: un asset incompleto no debe tirar, solo producir attrs vacíos.
export function imageAttrsFromAsset(asset, fallbackFileName = '') {
  return {
    src: asset?.publicUrl || '',
    assetId: asset?.id || null,
    fileName: asset?.fileName || fallbackFileName || '',
    storagePath: asset?.path || null,
    originalWidth: asset?.width || null,
    originalHeight: asset?.height || null,
  }
}

// Tras un guardado exitoso, persistedPages ya NO tiene los placeholders
// blob: (saveProjectPages los filtró antes del PUT). Si localPages todavía
// tiene alguno para esa página (subida que seguía en vuelo cuando arrancó
// este guardado), conservamos el contenido local — perder el nodo del
// editor sería el mismo bug de siempre, solo que ahora vía setPages en vez
// de vía el PUT.
export function keepLocalPlaceholderContent(localPages, persistedPages) {
  const localById = new Map((localPages || []).map((page) => [page.id, page]))

  return (persistedPages || []).map((persistedPage) => {
    const localPage = localById.get(persistedPage.id)
    if (!localPage || !countPendingUploadImages(localPage.fullContent)) return persistedPage

    return {
      ...persistedPage,
      fullContent: localPage.fullContent,
      contentJson: localPage.contentJson,
      sections: localPage.sections,
    }
  })
}
```

- [ ] **Step 4: Correr los tests — deben pasar todos**

Run: `cd /Users/adrian/GitHub/webbrief/backend && npm test -- test/pending-uploads.test.js`

Expected: 31 tests en verde, 0 fallos (11 preexistentes + 20 nuevos).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/pendingUploads.js backend/test/pending-uploads.test.js
git commit -m "$(cat <<'EOF'
feat(uploads): agrega helpers puros para reemplazar/quitar un placeholder blob: puntual

Nuevas funciones en pendingUploads.js (hasPendingUpload, replace/removePendingUploadFrom{Html,Json},
stripPendingUploadsFromPages, imageAttrsFromAsset, keepLocalPlaceholderContent) para resolver una subida
en curso donde haya quedado su placeholder, sin importar si el editor sigue montado en esa página.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task B2: `ProjectEditor.jsx` — `snapshotActivePage` deja de filtrar; `saveProjectPages` filtra todas las páginas

**Files:**
- Modify: `frontend/src/pages/ProjectEditor.jsx`

Este proyecto no tiene test runner de frontend (sin Vitest/RTL — `frontend/package.json` solo define
`dev`/`build`/`preview`). La verificación de este task es `npm run build` (sintaxis + imports resueltos)
más la suite del backend (no debería tocarla, pero confirma que nada más se rompió); el comportamiento
real se confirma en el navegador — ver Task Q1 de `plan-parts/Z-qa-release.md` (escenarios 1-5 ejercitan
exactamente este task).

- [ ] **Step 1: Import — cambiar qué se trae de `pendingUploads.js`**

Localizar:

```js
import { stripPendingUploadImagesFromHtml, stripPendingUploadImagesFromJson, countPendingUploadImages } from '../lib/pendingUploads'
```

Reemplazar por:

```js
import {
  stripPendingUploadImagesFromHtml,
  stripPendingUploadsFromPages,
  keepLocalPlaceholderContent,
} from '../lib/pendingUploads'
```

(`stripPendingUploadImagesFromJson` y `countPendingUploadImages` dejan de usarse directamente en este
archivo: `snapshotActivePage` ya no filtra — Step 3 — y `stripPendingUploadsFromPages`, que sí los usa,
vive en `pendingUploads.js`.)

- [ ] **Step 2: Quitar el contador `pendingUploadsRef`**

Localizar:

```js
  const toastTimerRef = useRef(null)
  // Cuántos placeholders de subida (`blob:`) descartó el último snapshot. Se
  // avisa solo en guardado manual: en autosave el nodo sigue en el editor y
  // entra bien en el siguiente ciclo, cuando la subida ya resolvió su URL.
  const pendingUploadsRef = useRef(0)

  const activePage = pages.find((p) => p.id === activePageId)
```

Reemplazar por:

```js
  const toastTimerRef = useRef(null)

  const activePage = pages.find((p) => p.id === activePageId)
```

- [ ] **Step 3: `snapshotActivePage` deja de filtrar placeholders**

Localizar:

```js
  const snapshotActivePage = useCallback(() => {
    if (!editorRef.current || !activePageId) return null

    // Último filtro antes de persistir: un <img src="blob:…"> es el placeholder
    // de una subida todavía en vuelo (o fallada). El object URL muere con la
    // pestaña, así que guardarlo deja una imagen rota para siempre — pasó en
    // Prod. Se limpia acá, el único chokepoint por el que pasan autosave y
    // guardado manual; el nodo sigue vivo en el editor, así que si la subida
    // termina bien `replaceImageSrc` lo completa y el próximo save lo persiste
    // ya con su URL pública. Ver frontend/src/lib/pendingUploads.js.
    const rawHtml = editorRef.current.getHTML()
    const rawJson = editorRef.current.getJSON()
    const pendingUploads = countPendingUploadImages(rawHtml)
    const html = pendingUploads ? stripPendingUploadImagesFromHtml(rawHtml) : rawHtml
    const json = pendingUploads ? stripPendingUploadImagesFromJson(rawJson) : rawJson
    if (pendingUploads) pendingUploadsRef.current = pendingUploads
    const sections = parseSectionsFromHtml(html)
    const seoMetadata = getPageSeoMetadata({ seoMetadata: activeSeoMetadataRef.current })
    const contentRules = getPageContentRules({ contentRules: activeContentRulesRef.current })

    setPages((prev) => prev.map((page) => (
      page.id === activePageId
        ? { ...page, fullContent: html, contentJson: json, sections, seoMetadata, contentRules }
        : page
    )))

    return { html, json, sections, seoMetadata, contentRules }
  }, [activePageId])
```

Reemplazar por:

```js
  const snapshotActivePage = useCallback(() => {
    if (!editorRef.current || !activePageId) return null

    // Ya NO filtra los placeholders `blob:` acá (hasta v2.15.x sí lo hacía).
    // Este es el chokepoint que usan autosave, guardado manual, cambio de
    // página/modo Y syncRemoteChanges como "local" del merge de 3 vías — si
    // filtrara acá, un marcador en vuelo se perdía en cualquiera de esos
    // caminos (bug confirmado en Prod, página "Coapa"). El filtro real vive
    // en el único punto que de verdad viaja al servidor: saveProjectPages,
    // vía stripPendingUploadsFromPages. Ver frontend/src/lib/pendingUploads.js.
    const html = editorRef.current.getHTML()
    const json = editorRef.current.getJSON()
    const sections = parseSectionsFromHtml(html)
    const seoMetadata = getPageSeoMetadata({ seoMetadata: activeSeoMetadataRef.current })
    const contentRules = getPageContentRules({ contentRules: activeContentRulesRef.current })

    setPages((prev) => prev.map((page) => (
      page.id === activePageId
        ? { ...page, fullContent: html, contentJson: json, sections, seoMetadata, contentRules }
        : page
    )))

    return { html, json, sections, seoMetadata, contentRules }
  }, [activePageId])
```

- [ ] **Step 4: `saveProjectPages` — filtrar TODAS las páginas del payload antes del PUT**

Localizar:

```js
    const snapshot = snapshotActivePage()
    const payload = pages.map((page) => {
      if (page.id === activePageId && snapshot) {
        return {
          id: page.id,
          name: page.name,
          contentHtml: snapshot.html,
          contentJson: snapshot.json,
          seoMetadata: snapshot.seoMetadata,
          contentRules: snapshot.contentRules,
          version: page.version,
          reviewStatus: page.reviewStatus || 'draft',
          reviewBaselineVersionId: page.reviewBaselineVersionId || null,
          reviewBaselineAt: page.reviewBaselineAt || null,
          reviewRequestedBy: page.reviewRequestedBy || null,
        }
      }

      return {
        id: page.id,
        name: page.name,
        contentHtml: page.fullContent || buildDocumentHTML(page.sections),
        contentJson: page.contentJson || null,
        seoMetadata: getPageSeoMetadata(page),
        contentRules: getPageContentRules(page),
        version: page.version,
        reviewStatus: page.reviewStatus || 'draft',
        reviewBaselineVersionId: page.reviewBaselineVersionId || null,
        reviewBaselineAt: page.reviewBaselineAt || null,
        reviewRequestedBy: page.reviewRequestedBy || null,
      }
    })
    // FAQ usa el mismo modelo de sectionDivider que page → reusamos el builder
    // por sección (eventos granulares por FAQ). Document es lineal → builder
    // a nivel documento con sectionId virtual __document__.
    const sectionEvents = (projectType === 'page' || projectType === 'faq')
      ? buildSectionActivityEvents(pages, payload)
      : buildDocumentActivityEvents(pages, payload)

    saveInFlightRef.current = true
    setIsSaving(true)
    setSaveMessage(source === 'autosave' ? 'Autoguardando...' : '')

    try {
      const data = await apiFetch(`/api/projects/${projectId}/pages`, {
        method: 'PUT',
        body: JSON.stringify({ pages: payload, source, sectionEvents }),
      })
```

Reemplazar por:

```js
    const snapshot = snapshotActivePage()
    const payload = pages.map((page) => {
      if (page.id === activePageId && snapshot) {
        return {
          id: page.id,
          name: page.name,
          contentHtml: snapshot.html,
          contentJson: snapshot.json,
          seoMetadata: snapshot.seoMetadata,
          contentRules: snapshot.contentRules,
          version: page.version,
          reviewStatus: page.reviewStatus || 'draft',
          reviewBaselineVersionId: page.reviewBaselineVersionId || null,
          reviewBaselineAt: page.reviewBaselineAt || null,
          reviewRequestedBy: page.reviewRequestedBy || null,
        }
      }

      return {
        id: page.id,
        name: page.name,
        contentHtml: page.fullContent || buildDocumentHTML(page.sections),
        contentJson: page.contentJson || null,
        seoMetadata: getPageSeoMetadata(page),
        contentRules: getPageContentRules(page),
        version: page.version,
        reviewStatus: page.reviewStatus || 'draft',
        reviewBaselineVersionId: page.reviewBaselineVersionId || null,
        reviewBaselineAt: page.reviewBaselineAt || null,
        reviewRequestedBy: page.reviewRequestedBy || null,
      }
    })
    // Último filtro antes de persistir — ver frontend/src/lib/pendingUploads.js.
    // snapshotActivePage ya NO filtra (así el marcador sobrevive a
    // syncRemoteChanges y a los cambios de página/modo); acá se filtran TODAS
    // las páginas del payload, no solo la activa, porque una página no-activa
    // puede seguir teniendo el placeholder de una subida que arrancó antes de
    // navegar a otra.
    const { pages: strippedPayload, dropped } = stripPendingUploadsFromPages(payload)
    // El lado "previo" de la comparación también se filtra, para no comparar
    // manzanas con peras: si no se filtrara, un placeholder en vuelo que
    // estaba en `pages` (previo) y se cae del payload filtrado (nuevo) se
    // leería como un image_removed falso.
    const strippedPreviousPages = pages.map((page) => ({
      ...page,
      fullContent: stripPendingUploadImagesFromHtml(page.fullContent || buildDocumentHTML(page.sections || [])),
    }))
    // FAQ usa el mismo modelo de sectionDivider que page → reusamos el builder
    // por sección (eventos granulares por FAQ). Document es lineal → builder
    // a nivel documento con sectionId virtual __document__.
    const sectionEvents = (projectType === 'page' || projectType === 'faq')
      ? buildSectionActivityEvents(strippedPreviousPages, strippedPayload)
      : buildDocumentActivityEvents(strippedPreviousPages, strippedPayload)

    saveInFlightRef.current = true
    setIsSaving(true)
    setSaveMessage(source === 'autosave' ? 'Autoguardando...' : '')

    try {
      const data = await apiFetch(`/api/projects/${projectId}/pages`, {
        method: 'PUT',
        body: JSON.stringify({ pages: strippedPayload, source, sectionEvents }),
      })
```

- [ ] **Step 5: Aviso de guardado manual — usar `dropped` en vez del contador viejo**

Localizar:

```js
      // Hubo imágenes todavía subiendo cuando se serializó: no se guardaron
      // (su src era un `blob:` local, inservible fuera de esta pestaña). En
      // autosave no se avisa — el nodo sigue en el editor y entra solo en el
      // ciclo siguiente. En manual sí, porque el usuario cree que guardó todo.
      const droppedUploads = pendingUploadsRef.current
      pendingUploadsRef.current = 0
      if (droppedUploads > 0 && source !== 'autosave') {
        showToast({
          kind: 'warning',
          text: droppedUploads === 1
            ? 'Una imagen todavía se estaba subiendo y no se guardó. Espera a que termine y guarda de nuevo.'
            : `${droppedUploads} imágenes todavía se estaban subiendo y no se guardaron. Espera a que terminen y guarda de nuevo.`,
        })
      }
```

Reemplazar por:

```js
      // Hubo imágenes todavía subiendo cuando se serializó: no se guardaron
      // (su src era un `blob:` local, inservible fuera de esta pestaña). En
      // autosave no se avisa — el nodo sigue en el editor y entra solo en el
      // ciclo siguiente. En manual sí, porque el usuario cree que guardó todo.
      // `dropped` viene de stripPendingUploadsFromPages, calculado arriba
      // sobre TODAS las páginas (no solo la activa).
      if (dropped > 0 && source !== 'autosave') {
        showToast({
          kind: 'warning',
          text: dropped === 1
            ? 'Una imagen todavía se estaba subiendo y no se guardó. Espera a que termine y guarda de nuevo.'
            : `${dropped} imágenes todavía se estaban subiendo y no se guardaron. Espera a que terminen y guarda de nuevo.`,
        })
      }
```

- [ ] **Step 6: Tras guardar, conservar los placeholders que sigan vivos en memoria**

Localizar:

```js
      setPages(persistedPages)
      setIsDirty(false)
```

Reemplazar por:

```js
      // Si alguna página del estado local todavía tiene un placeholder blob:
      // (subida en curso que no llegó a este guardado), lo conservamos —
      // persistedPages ya no lo tiene porque el PUT lo filtró. Forma
      // funcional: entre armar el payload y esta respuesta puede haber
      // avanzado `pages` (p.ej. otra subida resolvió mientras esta esperaba).
      setPages((currentPages) => keepLocalPlaceholderContent(currentPages, persistedPages))
      setIsDirty(false)
```

- [ ] **Step 7: `syncRemoteChanges` — documentar por qué el marcador ya sobrevive al merge**

Localizar:

```js
      // Snapshot único de la página activa (si el editor está montado) — se usa
      // como 'local' para su merge. Puede además pisar el state de esa página
      // (efecto secundario propio de snapshotActivePage), pero el único
      // setPages real de esta función es el de más abajo con nextPages ya
      // resuelto, así que ese pisado intermedio queda sobrescrito sin efecto.
      const activeSnapshot = activePageId ? snapshotActivePage() : null
```

Reemplazar por:

```js
      // Snapshot único de la página activa (si el editor está montado) — se usa
      // como 'local' para su merge. Puede además pisar el state de esa página
      // (efecto secundario propio de snapshotActivePage), pero el único
      // setPages real de esta función es el de más abajo con nextPages ya
      // resuelto, así que ese pisado intermedio queda sobrescrito sin efecto.
      // Desde que snapshotActivePage dejó de filtrar `blob:`, un placeholder
      // en vuelo viaja intacto como local del merge (mergeSections no lo
      // toca: para él es HTML de sección como cualquier otro) y vuelve a
      // aparecer en nextPages/el editor — no hace falta reinyectarlo a mano.
      const activeSnapshot = activePageId ? snapshotActivePage() : null
```

No hay ningún otro cambio funcional en `syncRemoteChanges`: tanto la rama de la página activa (usa
`editorRef.current.getHTML()`, que sigue mostrando el placeholder porque `setContent(result.mergedHtml)`
lo reincorpora) como la de una página no activa (usa `result.mergedHtml`, construido a partir del
`localHtml` sin filtrar) ya preservan el marcador sin tocar nada más. Ver el escenario 4 de Task Q1
(`plan-parts/Z-qa-release.md`) para la verificación en navegador con dos pestañas.

- [ ] **Step 8: Build de frontend**

Run: `cd /Users/adrian/GitHub/webbrief/frontend && npm run build`

Expected: `✓ built in …` sin errores (en particular, sin `"pendingUploadsRef" is not defined` ni imports
sin resolver de `pendingUploads.js`).

- [ ] **Step 9: Commit**

```bash
git add frontend/src/pages/ProjectEditor.jsx
git commit -m "$(cat <<'EOF'
fix(editor): snapshotActivePage deja de descartar blob: y saveProjectPages filtra todas las páginas

Antes, snapshotActivePage limpiaba los placeholders de subida en CADA llamada (autosave, cambio de
página/modo, sync remoto), no solo al guardar — eso es lo que perdía imágenes en vuelo. Ahora el único
filtro real es saveProjectPages, sobre el payload completo (todas las páginas, no solo la activa), y
tras guardar se conservan en memoria los placeholders que sigan sin resolver.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task B3: `ProjectEditor.jsx` — registro de subidas en curso y ruta compartida

**Files:**
- Modify: `frontend/src/pages/ProjectEditor.jsx`

Igual que en Task B2: sin test runner de frontend, la verificación es `npm run build` por step y los
escenarios de Task Q1 (`plan-parts/Z-qa-release.md`) para el comportamiento real.

- [ ] **Step 1: Import — sumar los helpers puntuales de placeholder**

Localizar:

```js
import {
  stripPendingUploadImagesFromHtml,
  stripPendingUploadsFromPages,
  keepLocalPlaceholderContent,
} from '../lib/pendingUploads'
```

Reemplazar por:

```js
import {
  stripPendingUploadImagesFromHtml,
  stripPendingUploadsFromPages,
  keepLocalPlaceholderContent,
  hasPendingUpload,
  replacePendingUploadInHtml,
  replacePendingUploadInJson,
  removePendingUploadFromHtml,
  removePendingUploadFromJson,
  imageAttrsFromAsset,
} from '../lib/pendingUploads'
```

- [ ] **Step 2: `pagesRef` — espejo de `pages` para leer el valor más reciente desde callbacks async**

Localizar:

```js
  const [projectMeta, setProjectMeta] = useState(null)
  const [pages, setPages] = useState([])
  const [activePageId, setActivePageId] = useState(null)
```

Reemplazar por:

```js
  const [projectMeta, setProjectMeta] = useState(null)
  const [pages, setPages] = useState([])
  // Espejo de `pages` para leer el valor más reciente desde callbacks async
  // (onImageUploadDone/Failed, que resuelven después de un round-trip a
  // /assets) sin cerrar sobre el `pages` de cuando arrancó la subida. La
  // escritura real de estado siempre pasa por la forma funcional de
  // setPages, nunca por este ref — solo se usa para decidir QUÉ página tiene
  // el placeholder ahora.
  const pagesRef = useRef(pages)
  useEffect(() => {
    pagesRef.current = pages
  }, [pages])
  const [activePageId, setActivePageId] = useState(null)
```

- [ ] **Step 3: `inFlightUploadsRef` — registro de subidas en curso**

Localizar:

```js
  const toastTimerRef = useRef(null)

  const activePage = pages.find((p) => p.id === activePageId)
```

Reemplazar por:

```js
  const toastTimerRef = useRef(null)
  // Subidas de imagen en curso: tempUrl (blob:) → { pageId, fileName }. Vive
  // acá (no en el nodo del editor) porque el usuario puede cambiar de página
  // o de modo mientras la subida sigue en vuelo — ver onImageUploadStart/
  // Done/Failed más abajo y el effect de beforeunload.
  const inFlightUploadsRef = useRef(new Map())

  const activePage = pages.find((p) => p.id === activePageId)
```

- [ ] **Step 4: Rutina compartida `runImageUploadFlow` (nivel módulo, fuera del componente)**

Localizar (cierre de `removeImageBySrc` seguido de `setCssVars`):

```js
  editor.view.dispatch(editor.state.tr.delete(targetPos, targetPos + targetSize))
  return true
}

function setCssVars(node, vars) {
```

Reemplazar por:

```js
  editor.view.dispatch(editor.state.tr.delete(targetPos, targetPos + targetSize))
  return true
}

// Orquesta una subida de imagen de punta a punta: inserta el placeholder
// blob:, sube el archivo con `uploadFn` (cada call site decide qué manda:
// Toolbar no adjunta pageId/sectionId, EditorPanel sí) y reporta el
// resultado por callbacks — nunca reemplaza el placeholder acá mismo. Antes
// esto estaba triplicado (Toolbar.handleImageUpload, EditorPanel handleDrop
// y handlePaste) con el mismo try/catch/finally; ahora cada call site solo
// arma su `uploadFn`.
//
// El reemplazo real (¿el editor todavía tiene el placeholder? ¿alguna página
// del estado lo tiene? ¿no está en ningún lado?) vive en ProjectEditor
// (onImageUploadDone/onImageUploadFailed) y no acá, porque esta función no
// sabe si el usuario cambió de página o de modo mientras la subida estaba en
// vuelo — solo ProjectEditor tiene esa vista completa (editorRef + pages).
async function runImageUploadFlow({
  editor,
  file,
  position = null,
  uploadFn,
  onImageUploadStart,
  onImageUploadDone,
  onImageUploadFailed,
}) {
  if (!editor || !file) return

  const tempUrl = URL.createObjectURL(file)
  const inserted = insertTemporaryImage(editor, tempUrl, file.name, position)

  if (!inserted) {
    // No se pudo ni insertar el placeholder (p.ej. el editor perdió el foco
    // justo antes) — abortamos sin llamar a uploadFn. Reusamos el mismo
    // camino de aviso que un fallo de subida real: el registro nunca llegó a
    // tener esta entrada, así que su cleanup (delete + revoke) es un no-op
    // inofensivo.
    onImageUploadFailed?.({
      tempUrl,
      fileName: file.name,
      error: new Error('No se pudo insertar la imagen en el documento'),
    })
    return
  }

  onImageUploadStart?.({ tempUrl, fileName: file.name })

  try {
    const asset = await uploadFn(file)
    onImageUploadDone?.({ tempUrl, asset, fileName: file.name })
  } catch (error) {
    onImageUploadFailed?.({ tempUrl, fileName: file.name, error })
  }
}

function setCssVars(node, vars) {
```

- [ ] **Step 5: `onImageUploadStart` / `onImageUploadDone` / `onImageUploadFailed` en `ProjectEditor`**

Localizar:

```js
  useEffect(() => () => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
  }, [])

  const saveProjectPages = useCallback(async (source = 'manual', options = {}) => {
```

Reemplazar por:

```js
  useEffect(() => () => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
  }, [])

  // ── Ciclo de vida de una subida de imagen en curso ──────────────────────
  // Contrapartida de runImageUploadFlow (fuera del componente, arriba): esta
  // función sí sabe dónde está todo (editorRef, pagesRef) así que es quien
  // decide dónde insertar la imagen ya subida.
  const onImageUploadStart = useCallback(({ tempUrl, fileName }) => {
    inFlightUploadsRef.current.set(tempUrl, { pageId: activePageId, fileName })
  }, [activePageId])

  const onImageUploadDone = useCallback(async ({ tempUrl, asset, fileName }) => {
    const upload = inFlightUploadsRef.current.get(tempUrl)
    const resolvedFileName = fileName || upload?.fileName || asset?.fileName || 'imagen'
    const attrs = imageAttrsFromAsset(asset, resolvedFileName)

    // 1) El editor montado (no destruido) todavía tiene el placeholder — el
    // caso normal: la subida terminó mientras el usuario seguía ahí, en
    // cualquier página (setContent al cambiar de página reinserta el mismo
    // blob: si la página activa lo tenía guardado en `pages`).
    const replacedInEditor = Boolean(editorRef.current)
      && !editorRef.current.isDestroyed
      && (await replaceImageSrc(editorRef.current, tempUrl, attrs.src, attrs))

    if (!replacedInEditor) {
      // 2) Ninguna instancia montada lo tiene, pero puede seguir vivo en el
      // estado de otra página (el usuario navegó lejos). pagesRef.current
      // evita cerrar sobre el `pages` de cuando arrancó esta subida.
      const targetPage = pagesRef.current.find((page) => hasPendingUpload(page.fullContent, tempUrl))
      if (targetPage) {
        setPages((prev) => prev.map((page) => (
          page.id === targetPage.id
            ? {
                ...page,
                fullContent: replacePendingUploadInHtml(page.fullContent, tempUrl, attrs),
                contentJson: replacePendingUploadInJson(page.contentJson, tempUrl, attrs),
              }
            : page
        )))
        setIsDirty(true)
        showToast({ kind: 'info', text: `La imagen «${resolvedFileName}» quedó en «${targetPage.name}».` })
      } else {
        // 3) No está en ningún lado: se borró el nodo, o un conflicto de
        // sync se resolvió por "Usar la suya" y se llevó puesto el párrafo.
        showToast({
          kind: 'info',
          text: `La imagen «${resolvedFileName}» se subió, pero ya no estaba en el documento. La encuentras en Biblioteca › Documentos.`,
        })
      }
    }

    inFlightUploadsRef.current.delete(tempUrl)
    URL.revokeObjectURL(tempUrl)
  }, [showToast])

  const onImageUploadFailed = useCallback(({ tempUrl, error }) => {
    if (editorRef.current && !editorRef.current.isDestroyed) {
      removeImageBySrc(editorRef.current, tempUrl)
    }

    const targetPage = pagesRef.current.find((page) => hasPendingUpload(page.fullContent, tempUrl))
    if (targetPage) {
      setPages((prev) => prev.map((page) => (
        page.id === targetPage.id
          ? {
              ...page,
              fullContent: removePendingUploadFromHtml(page.fullContent, tempUrl),
              contentJson: removePendingUploadFromJson(page.contentJson, tempUrl),
            }
          : page
      )))
    }

    showToast({ kind: 'warning', text: error?.message || 'No se pudo subir la imagen' })
    inFlightUploadsRef.current.delete(tempUrl)
    URL.revokeObjectURL(tempUrl)
  }, [showToast])

  const saveProjectPages = useCallback(async (source = 'manual', options = {}) => {
```

- [ ] **Step 6: `beforeunload` — también bloquear con subidas en curso**

Localizar:

```js
  useEffect(() => {
    function handleBeforeUnload(event) {
      if (!isDirty) return
      event.preventDefault()
      event.returnValue = ''
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [isDirty])
```

Reemplazar por:

```js
  useEffect(() => {
    function handleBeforeUnload(event) {
      if (!isDirty && inFlightUploadsRef.current.size === 0) return
      event.preventDefault()
      event.returnValue = ''
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [isDirty])
```

- [ ] **Step 7: `<EditorPanel>` — pasar los tres callbacks**

Localizar:

```js
            commentMembersList={commentMembers}
          />
        )}
```

Reemplazar por:

```js
            commentMembersList={commentMembers}
            onImageUploadStart={onImageUploadStart}
            onImageUploadDone={onImageUploadDone}
            onImageUploadFailed={onImageUploadFailed}
          />
        )}
```

- [ ] **Step 8: `EditorPanel` — recibir los tres callbacks como props**

Localizar:

```js
  onEditComment,
  onDeleteComment,
  onCopyCommentLink,
  commentMembersList = [],
}) {
```

Reemplazar por:

```js
  onEditComment,
  onDeleteComment,
  onCopyCommentLink,
  commentMembersList = [],
  onImageUploadStart,
  onImageUploadDone,
  onImageUploadFailed,
}) {
```

- [ ] **Step 9: `EditorPanel.handleDrop` — usar la rutina compartida**

Localizar:

```js
      handleDrop(view, event) {
        const files = Array.from(event.dataTransfer?.files || [])
        const imageFile = files.find((file) => file.type.startsWith('image/'))
        if (!imageFile || !canWriteContent) return false

        event.preventDefault()
        const coords = view.posAtCoords({ left: event.clientX, top: event.clientY })
        const tempUrl = URL.createObjectURL(imageFile)
        insertTemporaryImage(editor, tempUrl, imageFile.name, coords?.pos || null)

        ;(async () => {
          try {
            const asset = await uploadProjectImage(imageFile)
            if (!asset?.publicUrl) return
            await replaceImageSrc(editor, tempUrl, asset.publicUrl, {
              assetId: asset.id || null,
              fileName: asset.fileName || imageFile.name,
              storagePath: asset.path || null,
              originalWidth: asset.width || null,
              originalHeight: asset.height || null,
            })
          } catch (error) {
            removeImageBySrc(editor, tempUrl)
            window.alert(error.message || 'No se pudo subir la imagen')
          } finally {
            URL.revokeObjectURL(tempUrl)
          }
        })()

        return true
      },
```

Reemplazar por:

```js
      handleDrop(view, event) {
        const files = Array.from(event.dataTransfer?.files || [])
        const imageFile = files.find((file) => file.type.startsWith('image/'))
        if (!imageFile || !canWriteContent) return false

        event.preventDefault()
        const coords = view.posAtCoords({ left: event.clientX, top: event.clientY })
        runImageUploadFlow({
          editor,
          file: imageFile,
          position: coords?.pos || null,
          uploadFn: uploadProjectImage,
          onImageUploadStart,
          onImageUploadDone,
          onImageUploadFailed,
        })

        return true
      },
```

- [ ] **Step 10: `EditorPanel.handlePaste` — usar la rutina compartida**

Localizar:

```js
      handlePaste(view, event) {
        // Imagen en clipboard (screenshot, copy de imagen): subir a Supabase
        // y reemplazar inline. Espejo de handleDrop; corto-circuita el pipeline
        // de SEO/HTML porque los screenshots no traen texto útil.
        const files = Array.from(event.clipboardData?.files || [])
        const imageFile = files.find((file) => file.type.startsWith('image/'))
        if (imageFile && canWriteContent) {
          event.preventDefault()
          const tempUrl = URL.createObjectURL(imageFile)
          insertTemporaryImage(editor, tempUrl, imageFile.name, null)
          ;(async () => {
            try {
              const asset = await uploadProjectImage(imageFile)
              if (!asset?.publicUrl) return
              await replaceImageSrc(editor, tempUrl, asset.publicUrl, {
                assetId: asset.id || null,
                fileName: asset.fileName || imageFile.name,
                storagePath: asset.path || null,
                originalWidth: asset.width || null,
                originalHeight: asset.height || null,
              })
            } catch (error) {
              removeImageBySrc(editor, tempUrl)
              window.alert(error.message || 'No se pudo subir la imagen')
            } finally {
              URL.revokeObjectURL(tempUrl)
            }
          })()
          return true
        }

        const html = event.clipboardData?.getData('text/html') || ''
```

Reemplazar por:

```js
      handlePaste(view, event) {
        // Imagen en clipboard (screenshot, copy de imagen): subir a Supabase
        // y reemplazar inline. Espejo de handleDrop; corto-circuita el pipeline
        // de SEO/HTML porque los screenshots no traen texto útil.
        const files = Array.from(event.clipboardData?.files || [])
        const imageFile = files.find((file) => file.type.startsWith('image/'))
        if (imageFile && canWriteContent) {
          event.preventDefault()
          runImageUploadFlow({
            editor,
            file: imageFile,
            uploadFn: uploadProjectImage,
            onImageUploadStart,
            onImageUploadDone,
            onImageUploadFailed,
          })
          return true
        }

        const html = event.clipboardData?.getData('text/html') || ''
```

- [ ] **Step 11: `Toolbar` — recibir los tres callbacks como props**

Localizar:

```js
function Toolbar({ editor, projectId, companyId, onUndo, onRedo, onAddComment, canComment = false }) {
```

Reemplazar por:

```js
function Toolbar({
  editor,
  projectId,
  companyId,
  onUndo,
  onRedo,
  onAddComment,
  canComment = false,
  onImageUploadStart,
  onImageUploadDone,
  onImageUploadFailed,
}) {
```

- [ ] **Step 12: `Toolbar.handleImageUpload` — usar la rutina compartida**

Localizar:

```js
  async function handleImageUpload(e) {
    const file = e.target.files?.[0]
    if (!file || !editor) return
    const tempUrl = URL.createObjectURL(file)
    try {
      if (!projectId) throw new Error('Proyecto no disponible')
      insertTemporaryImage(editor, tempUrl, file.name)
      const formData = new FormData()
      formData.append('file', file)
      const data = await apiFetch(`/api/projects/${projectId}/assets`, {
        method: 'POST',
        body: formData,
      })

      if (!data.asset?.renderInline || !data.asset?.publicUrl) {
        throw new Error('El archivo quedó guardado como adjunto. Los SVG no se insertan inline por seguridad.')
      }

      await replaceImageSrc(editor, tempUrl, data.asset.publicUrl, {
        assetId: data.asset.id || null,
        fileName: data.asset.fileName || file.name,
        storagePath: data.asset.path || null,
        originalWidth: data.asset.width || null,
        originalHeight: data.asset.height || null,
      })
    } catch (error) {
      removeImageBySrc(editor, tempUrl)
      window.alert(error.message || 'No se pudo subir la imagen')
    } finally {
      URL.revokeObjectURL(tempUrl)
      e.target.value = ''
    }
  }
```

Reemplazar por:

```js
  async function handleImageUpload(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !editor) return

    await runImageUploadFlow({
      editor,
      file,
      uploadFn: async (uploadFile) => {
        if (!projectId) throw new Error('Proyecto no disponible')
        const formData = new FormData()
        formData.append('file', uploadFile)
        const data = await apiFetch(`/api/projects/${projectId}/assets`, {
          method: 'POST',
          body: formData,
        })

        if (!data.asset?.renderInline || !data.asset?.publicUrl) {
          throw new Error('El archivo quedó guardado como adjunto. Los SVG no se insertan inline por seguridad.')
        }

        return data.asset
      },
      onImageUploadStart,
      onImageUploadDone,
      onImageUploadFailed,
    })
  }
```

- [ ] **Step 13: `<Toolbar>` (dentro de `EditorPanel`) — pasar los tres callbacks**

Localizar:

```js
      <Toolbar editor={editor} projectId={projectId} companyId={companyId} onUndo={onUndo} onRedo={onRedo} onAddComment={onAddComment} canComment={canComment} />
```

Reemplazar por:

```js
      <Toolbar
        editor={editor}
        projectId={projectId}
        companyId={companyId}
        onUndo={onUndo}
        onRedo={onRedo}
        onAddComment={onAddComment}
        canComment={canComment}
        onImageUploadStart={onImageUploadStart}
        onImageUploadDone={onImageUploadDone}
        onImageUploadFailed={onImageUploadFailed}
      />
```

- [ ] **Step 14: Build de frontend**

Run: `cd /Users/adrian/GitHub/webbrief/frontend && npm run build`

Expected: `✓ built in …` sin errores.

- [ ] **Step 15: Commit**

```bash
git add frontend/src/pages/ProjectEditor.jsx
git commit -m "$(cat <<'EOF'
feat(editor): registro de subidas en curso y ruta compartida para insertar/deshacer el placeholder

Toolbar.handleImageUpload, EditorPanel.handleDrop y handlePaste ahora comparten runImageUploadFlow en vez
de triplicar el mismo try/catch/finally. ProjectEditor lleva el registro (inFlightUploadsRef) y decide
dónde insertar la imagen ya subida: en el editor montado si lo tiene, si no en el estado de la página que
lo tenga, y si no aparece en ningún lado avisa por toast dónde encontrar el archivo. beforeunload también
bloquea con subidas pendientes.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task B4: `EditableImageView` — aviso "Subiendo…" mientras el placeholder sigue en `blob:`

**Files:**
- Modify: `frontend/src/pages/ProjectEditor.jsx`
- Modify: `frontend/src/pages/ProjectEditor.module.css`

Leído `DESIGN-SYSTEM.md` antes de este task (obligatorio por tocar una superficie visible). Se usan los
tokens de tooltip (`--wb-tooltip-bg`/`--wb-tooltip-text`) en vez de `--wb-text` porque ese par NO invierte
con el tema — igual que el canvas del editor (`--wb-canvas-*`, DESIGN-SYSTEM.md §1), que tampoco invierte;
`--wb-text` sobre un fondo oscuro fijo se leería mal en modo claro. El radio usa `--wb-radius-full`
(regla de border-radius, DESIGN-SYSTEM.md §1: pills de estado, no clickeable) en vez del `999px` literal
que ya usa el `.imageSizeNotice` vecino — no se toca ese literal existente (fuera de alcance), pero no hay
motivo para repetirlo en código nuevo.

- [ ] **Step 1: Import — sumar `isPendingUploadSrc`**

Localizar:

```js
import {
  stripPendingUploadImagesFromHtml,
  stripPendingUploadsFromPages,
  keepLocalPlaceholderContent,
  hasPendingUpload,
  replacePendingUploadInHtml,
  replacePendingUploadInJson,
  removePendingUploadFromHtml,
  removePendingUploadFromJson,
  imageAttrsFromAsset,
} from '../lib/pendingUploads'
```

Reemplazar por:

```js
import {
  stripPendingUploadImagesFromHtml,
  isPendingUploadSrc,
  stripPendingUploadsFromPages,
  keepLocalPlaceholderContent,
  hasPendingUpload,
  replacePendingUploadInHtml,
  replacePendingUploadInJson,
  removePendingUploadFromHtml,
  removePendingUploadFromJson,
  imageAttrsFromAsset,
} from '../lib/pendingUploads'
```

- [ ] **Step 2: `EditableImageView` — calcular `isUploading`**

Localizar:

```js
  const currentWidth = Number(node.attrs.width) || null

  function showSizeNotice(message) {
```

Reemplazar por:

```js
  const currentWidth = Number(node.attrs.width) || null
  const isUploading = isPendingUploadSrc(node.attrs.src)

  function showSizeNotice(message) {
```

- [ ] **Step 3: `EditableImageView` — mostrar el aviso sobre la imagen**

Localizar:

```js
        <img
          ref={imageRef}
          className={styles.imageNodeImage}
          src={node.attrs.src}
          alt={node.attrs.alt || ''}
          draggable={false}
        />
        {sizeNotice && <div className={styles.imageSizeNotice}>{sizeNotice}</div>}
```

Reemplazar por:

```js
        <img
          ref={imageRef}
          className={cx(styles.imageNodeImage, isUploading && styles.imageNodeImageUploading)}
          src={node.attrs.src}
          alt={node.attrs.alt || ''}
          draggable={false}
        />
        {isUploading && (
          <div className={styles.imageUploadingNotice} role="status">
            Subiendo…
          </div>
        )}
        {sizeNotice && <div className={styles.imageSizeNotice}>{sizeNotice}</div>}
```

- [ ] **Step 4: CSS — `.imageNodeImageUploading` y `.imageUploadingNotice`**

Localizar (en `frontend/src/pages/ProjectEditor.module.css`):

```css
.imageSizeNotice {
  position: absolute;
  left: 50%;
  bottom: 12px;
  transform: translateX(-50%);
  padding: 8px 12px;
  border: 1px solid rgba(15, 23, 42, 0.08);
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.84);
  color: var(--wb-text);
  font-size: 12px;
  font-weight: 500;
  line-height: 1;
  white-space: nowrap;
  pointer-events: none;
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.24);
}

.imageNodeSelected .imageNodeFrame {
```

Reemplazar por:

```css
.imageSizeNotice {
  position: absolute;
  left: 50%;
  bottom: 12px;
  transform: translateX(-50%);
  padding: 8px 12px;
  border: 1px solid rgba(15, 23, 42, 0.08);
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.84);
  color: var(--wb-text);
  font-size: 12px;
  font-weight: 500;
  line-height: 1;
  white-space: nowrap;
  pointer-events: none;
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.24);
}

.imageNodeImageUploading {
  opacity: 0.55;
}

/* "Subiendo…" — pill fija arriba de la imagen mientras src sigue siendo
   blob:. Usa los tokens de tooltip (fondo oscuro fijo, no invierte con el
   tema) porque el canvas del editor tampoco invierte — ver DESIGN-SYSTEM.md
   §1 (--wb-canvas-*). */
.imageUploadingNotice {
  position: absolute;
  left: 50%;
  top: 12px;
  transform: translateX(-50%);
  padding: 6px 12px;
  border-radius: var(--wb-radius-full);
  background: var(--wb-tooltip-bg);
  color: var(--wb-tooltip-text);
  font-size: var(--wb-text-xs);
  font-weight: var(--wb-weight-medium);
  line-height: 1.4;
  white-space: nowrap;
  pointer-events: none;
  box-shadow: var(--wb-shadow-md);
}

.imageNodeSelected .imageNodeFrame {
```

- [ ] **Step 5: Build de frontend**

Run: `cd /Users/adrian/GitHub/webbrief/frontend && npm run build`

Expected: `✓ built in …` sin errores.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/ProjectEditor.jsx frontend/src/pages/ProjectEditor.module.css
git commit -m "$(cat <<'EOF'
feat(editor): muestra "Subiendo…" sobre la imagen mientras su placeholder sigue en blob:

EditableImageView ahora distingue un placeholder en vuelo (src="blob:...") y lo comunica con una pill
accesible (role="status") en vez de dejar la imagen con aspecto de subida terminada.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task B5: Documentación — `CONTEXT.min.md` y `CONTEXT.md`

**Files:**
- Modify: `CONTEXT.min.md`
- Modify: `CONTEXT.md`

Alcance decidido: se actualizan las secciones de ESTADO ACTUAL (`Targets`, los bloques `target=...`, `Core
Facts`) porque deben seguir siendo ciertas hoy. NO se tocan las entradas fechadas de "Recent Fixes" /
"Completed (YYYY-MM-DD)" — son bitácora histórica de lo que pasó en esa sesión, no documentación vigente;
reescribirlas para que la propuesta de diseño "nunca hubiera existido" perdería la traza de por qué el
código es como es hoy. Se agrega, sí, una entrada nueva fechada 2026-09-11 resumiendo este cambio.

- [ ] **Step 1: `CONTEXT.min.md` — quitar `editor.proposals` de `Targets`**

Localizar:

```
- `editor.deeplinks`
- `editor.proposals`
- `share`
```

Reemplazar por:

```
- `editor.deeplinks`
- `share`
```

- [ ] **Step 2: `CONTEXT.min.md` — quitar "designer proposals" del ejemplo de eventos de notificación**

Localizar:

```
- Navbar bell icon opens a notifications dropdown sourced from the same `project_activity` table, filtered to non-content events (project lifecycle, deliverables, share links, designer proposals, client actions); per-item and bulk mark-as-read via existing `/activity/:id/read` endpoint
```

Reemplazar por:

```
- Navbar bell icon opens a notifications dropdown sourced from the same `project_activity` table, filtered to non-content events (project lifecycle, deliverables, share links, client actions); per-item and bulk mark-as-read via existing `/activity/:id/read` endpoint
```

- [ ] **Step 3: `CONTEXT.min.md` — `target=editor.collab`: `serverPagesRef` ya no se refresca en "proposal-decision"**

Localizar (dentro del `watch` de `target=editor.collab`, arranca con "`serverPagesRef` es la base del
merge"):

```
  - `watch`: `serverPagesRef` es la base del merge — se refresca en load/save-success/sync/proposal-decision; sessionId por pestaña (`crypto.randomUUID`); secciones remote-origin se agregan a `protectedEmptySectionIds` antes del splice (auto-remove); TipTap v3 `setContent` emite update por default → hidratación usa `{ emitUpdate: false }` o genera autosaves fantasma; tipo `document` resuelve conflictos `__document__` vía banner sobre el canvas + comparador sin "Insertar debajo" (setContent doc completo, historial normal); panel FAQ muestra dots de presencia/conflicto (mismos props que SectionsPanel); dropdowns portal (KebabMenu/PageIndexMenu/PagePill) comparten `frontend/src/hooks/useAnchoredDropdown.js` (modo controlado para PagePill via openMenuId; focus-return al trigger al cerrar); comparador es 4to sink `dangerouslySetInnerHTML` sin sanitizar — cablear `sanitizeHtml()` cuando mergee `fix/security-s1-xss-sanitization`
```

Reemplazar por:

```
  - `watch`: `serverPagesRef` es la base del merge — se refresca en load/save-success/sync (el 4to trigger que tenía, proposal-decision, desapareció con el sistema de propuestas — ver `target=editor.proposals` removido 2026-09-11); sessionId por pestaña (`crypto.randomUUID`); secciones remote-origin se agregan a `protectedEmptySectionIds` antes del splice (auto-remove); TipTap v3 `setContent` emite update por default → hidratación usa `{ emitUpdate: false }` o genera autosaves fantasma; tipo `document` resuelve conflictos `__document__` vía banner sobre el canvas + comparador sin "Insertar debajo" (setContent doc completo, historial normal); panel FAQ muestra dots de presencia/conflicto (mismos props que SectionsPanel); dropdowns portal (KebabMenu/PageIndexMenu/PagePill) comparten `frontend/src/hooks/useAnchoredDropdown.js` (modo controlado para PagePill via openMenuId; focus-return al trigger al cerrar); comparador es 4to sink `dangerouslySetInnerHTML` sin sanitizar — cablear `sanitizeHtml()` cuando mergee `fix/security-s1-xss-sanitization`
```

- [ ] **Step 4: `CONTEXT.min.md` — borrar el bloque `target=editor.proposals` completo**

Localizar (última línea del `watch` de `target=editor.deeplinks`, seguida de las tres líneas del target a
borrar, seguidas de la línea de `target=editor.handoff` — no hay líneas en blanco entre estos bullets en
el original):

```
  - `watch`: en el editor el deep-link inicial se captura UNA vez al montar (`deepLinkRef`) porque la URL se reescribe después; `?s` reutiliza `navigateToSection` (scrollRequest + flashRequest), no un scroll propio; el reintento por DOM es corto (12 ticks) y termina en silencio; al cambiar de página se BORRA `s` (un sectionId de otra página es peor que ninguno); en el share los divisores de sección están ocultos por CSS (`display:none`, sin rect) → el ancla es el primer hermano visible del divisor, y el scroll-spy que refleja `?p` arranca recién ~900ms después del scroll inicial para no reescribir con páginas intermedias; el highlight temporal usa la clase global `.wb-section-flash` (`styles/base.css`) porque CSS modules renombra `animation-name` aunque los keyframes sean globales; los kebabs de pill de página y de sección existen ahora también sin permisos de estructura, con "Copiar enlace" como único item
- `target=editor.proposals`
  - `keep`: un `designer` NUNCA escribe `project_pages` — cada guardado suyo va a `project_page_change_proposals` (status `pending`) y el backend superpone ese contenido SOLO para el propio designer (`shouldOverlayDesignerProposal`, `routes/projects.js`); el revisor (admin/manager/editor) recibe la página publicada + el objeto `pendingProposal` completo, así que el comparador es 100% cliente (sin endpoint nuevo); el comparador `Publicado ↔ Propuesta` (`ProposalReviewPanel`) ocupa la columna central en SOLO LECTURA y reemplaza a Brief/Handoff/Preview mientras está abierto — es un eje aparte del modo (qué versión, no qué vista) y no se persiste en la vista guardada; se entra por "Ver propuesta" en la caja del panel derecho y se sale por el segmented control; "Pedir cambios" NO existe en la UI del revisor (decisión 2026-08-14: el feedback al diseñador va por comentarios; el endpoint de decision con `rejected` sigue vivo para API/MCP); chips por sección `Nueva | Modificada | Eliminada` derivados de `lib/proposalDiff.js` (reusa `splitSections` + `normalizeHtml` de `sectionMerge.js`, así que "cambió" significa lo mismo que en el merge de colaboración y las diferencias cosméticas de serialización no cuentan); DENTRO de una sección modificada, diff por bloques via `lib/proposalBlockDiff.js` (LCS top-level quote-aware; bloques agregados con tinte verde, eliminados rojo tachado, párrafos 1:1 con word-diff `diffWords` sobre texto plano escapado — pierde formato inline a propósito; `<ins>/<del>` con clases `:global(.__wb-diff-ins/del)` porque CSS modules renombraría clases en HTML inyectado); un rename de sección cuenta como `changed` con `renamedFrom`; las eliminadas se pintan atenuadas al final; la decisión sigue siendo POR PÁGINA; Aprobar tiene loading (`isDecidingProposal`), toast de resumen al éxito, y UN solo round-trip (el endpoint decision devuelve `page` completa en camelCase → setPages + serverPagesRef sin re-GET; `loadSidePanelData` fire-and-forget)
  - `watch`: cambiar de página cierra el comparador (la aprobación es por página y el panel izquierdo deriva del doc montado, que en vista propuesta no existe); abrir el comparador desmonta `EditorPanel` → `openProposalView` hace `snapshotActivePage()` antes para no perder ediciones sin guardar (mismo contrato que Brief→Preview); al aprobar/rechazar con el comparador CERRADO hay que re-hidratar TipTap a mano (`loadPageIntoEditor` con guard `!editorRef.current.isDestroyed`) porque `setPages` no toca el doc montado — sin eso el revisor aprueba y el canvas no cambia hasta recargar; el panel es el 5to sink `dangerouslySetInnerHTML` sin sanitizar (misma deuda que el comparador de conflictos)
- `target=editor.handoff`
```

Reemplazar por (mismas primera y última línea, sin las tres del medio):

```
  - `watch`: en el editor el deep-link inicial se captura UNA vez al montar (`deepLinkRef`) porque la URL se reescribe después; `?s` reutiliza `navigateToSection` (scrollRequest + flashRequest), no un scroll propio; el reintento por DOM es corto (12 ticks) y termina en silencio; al cambiar de página se BORRA `s` (un sectionId de otra página es peor que ninguno); en el share los divisores de sección están ocultos por CSS (`display:none`, sin rect) → el ancla es el primer hermano visible del divisor, y el scroll-spy que refleja `?p` arranca recién ~900ms después del scroll inicial para no reescribir con páginas intermedias; el highlight temporal usa la clase global `.wb-section-flash` (`styles/base.css`) porque CSS modules renombra `animation-name` aunque los keyframes sean globales; los kebabs de pill de página y de sección existen ahora también sin permisos de estructura, con "Copiar enlace" como único item
- `target=editor.handoff`
```

- [ ] **Step 5: `CONTEXT.min.md` — reemplazar el párrafo de "placeholders de subida" por la invariante nueva**

Localizar:

```
- placeholders de subida (v2.14.0): el editor inserta `<img src="blob:…">` mientras la subida está en vuelo y lo reemplaza por la URL pública al responder el backend; `snapshotActivePage` (único chokepoint de autosave + guardado manual) descarta esos nodos antes de persistir vía `lib/pendingUploads.js` — un object URL guardado es una imagen rota para siempre (caso confirmado en Prod). El nodo sigue vivo en el editor: si la subida termina bien, el próximo save lo persiste ya con su URL. Solo se avisa en guardado manual (en autosave sería ruido)
```

Reemplazar por:

```
- placeholders de subida (v2.16.0): el editor inserta `<img src="blob:…">` mientras la subida está en vuelo; ese marcador vive SOLO en memoria (editor + `pages`) y nunca se persiste — `snapshotActivePage` ya NO lo filtra (así sobrevive a `syncRemoteChanges` y a los cambios de página/modo), el único filtro real es `saveProjectPages` vía `stripPendingUploadsFromPages` (`lib/pendingUploads.js`), que limpia TODAS las páginas del payload en el PUT, no solo la activa. Registro `inFlightUploadsRef` (tempUrl → {pageId, fileName}) en `ProjectEditor.jsx` rastrea subidas en curso; al resolver, `onImageUploadDone` reemplaza en el editor montado si lo tiene, si no en el estado de la página que lo tenga, y si no aparece en ningún lado avisa por toast dónde encontrar el archivo (Biblioteca › Documentos); al fallar, `onImageUploadFailed` quita el marcador y avisa por toast. `beforeunload` también bloquea con subidas en curso. `EditableImageView` muestra "Subiendo…" mientras el src siga siendo `blob:`
```

- [ ] **Step 6: `CONTEXT.md` — nota corta al final de la bitácora**

Localizar:

```
7. Cuando justifique: HTTP transport con OAuth (multi-scope, scopes refinados).

## Pending

- richer deliverables UI beyond compact editor panel
```

Reemplazar por:

```
7. Cuando justifique: HTTP transport con OAuth (multi-scope, scopes refinados).

## Completed (2026-09-11) — Quitar aprobación de propuestas + subidas de imagen robustas

Diseño completo en `docs/superpowers/specs/2026-09-11-remove-approval-robust-uploads-design.md`.

- **Aprobación eliminada para todos los roles** (incluido Diseño): motivado por un incidente en Prod donde aprobar 5 propuestas viejas pisó 7 secciones editadas el mismo día. `project_page_change_proposals` se conserva como historial (no se borra) pero ya no se escribe: todos los roles con permiso de escritura publican directo. La red de seguridad sigue siendo el historial por sección ("Ver detalle" → "Restaurar esta versión").
- **Subidas de imagen robustas**: motivado por un bug donde 11 imágenes subidas a Coapa/Del Valle quedaron en `project_assets` pero nunca en el HTML guardado. Nueva invariante: un placeholder `<img src="blob:…">` vive SOLO en memoria (editor + `pages`); `snapshotActivePage` ya no lo filtra (sobrevive a sync y a cambios de página/modo) y el único filtro real es `saveProjectPages` sobre TODAS las páginas del payload, vía `stripPendingUploadsFromPages` (`frontend/src/lib/pendingUploads.js`). Registro `inFlightUploadsRef` en `ProjectEditor.jsx` rastrea subidas en curso; al resolver, se reinserta en el editor montado o en el estado de la página que corresponda, o avisa por toast si no encuentra dónde; `beforeunload` bloquea con subidas pendientes; `EditableImageView` muestra "Subiendo…" mientras el src siga siendo `blob:`.

## Pending

- richer deliverables UI beyond compact editor panel
```

- [ ] **Step 7: Commit**

```bash
git add CONTEXT.min.md CONTEXT.md
git commit -m "$(cat <<'EOF'
docs(context): documenta la invariante de placeholders blob: y quita las menciones a propuestas

CONTEXT.min.md: target=editor.proposals eliminado (Targets + bloque keep/watch), la mención en el ejemplo
de notificaciones y el trigger "proposal-decision" de serverPagesRef que ya no existe; el párrafo de
"placeholders de subida" pasa a describir la invariante nueva (blob: solo en memoria, filtro único en el
PUT sobre todas las páginas, registro + fallback + toasts). CONTEXT.md suma una entrada fechada resumiendo
ambas partes del cambio.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Auto-revisión (spec vs. plan)

- **B1 (registro + callbacks):** cubierto por Task B3 — `inFlightUploadsRef`, `onImageUploadStart/Done/Failed`,
  las 3 ramas de `onImageUploadDone` (editor → estado → ningún lado), `onImageUploadFailed` quita placeholder
  + toast, revoke solo tras resolver.
- **Nueva invariante `blob:` solo en memoria:** cubierta por Task B2 (`snapshotActivePage`/`saveProjectPages`/
  comentario en `syncRemoteChanges`).
- **`beforeunload` con subidas en curso:** Task B3, Step 6.
- **"Subiendo…" accesible:** Task B4.
- **Helpers puros + tests:** Task B1 (8 funciones, 20 tests nuevos + 1 sobre una función existente).
- **DRY de las tres entradas de subida:** Task B3, `runImageUploadFlow` + Steps 9/10/12.
- **Pruebas unitarias del spec:** helpers (B1), payload filtra todas las páginas (B1, `stripPendingUploadsFromPages`
  con 3 páginas), eventos de actividad sin falsos positivos (B1, test de la propiedad de equivalencia +
  Task B2 aplica el mismo filtro a ambos lados del diff), suite completa en verde (Task Q1 de
  `Z-qa-release.md`, Step 11 — no se repite acá). `activityOrdering` sin propuestas es de la Parte A
  (`A-frontend.md` Task A3), no de esta sección.
- **QA en navegador:** Task Q1 de `plan-parts/Z-qa-release.md` (no duplicado acá).
- **Documentación:** Task B5.
- **Placeholders ("TBD", "similar a", etc.):** ninguno — cada step tiene el código completo o el comando
  exacto.
- **Consistencia de nombres:** `hasPendingUpload`, `replacePendingUploadInHtml/Json`,
  `removePendingUploadFromHtml/Json`, `stripPendingUploadsFromPages`, `imageAttrsFromAsset`,
  `keepLocalPlaceholderContent`, `inFlightUploadsRef`, `pagesRef`, `runImageUploadFlow`,
  `onImageUploadStart/Done/Failed` se usan con el mismo nombre y forma en B1, B2, B3 y B4 — verificado
  releyendo cada task tras escribirlas.
- **Desviación menor del contrato, documentada:** `onImageUploadDone` recibe `{ tempUrl, asset, fileName }`
  en vez de solo `{ tempUrl, asset }` — el `fileName` extra reproduce el fallback que ya existía inline en
  los tres call sites (`asset.fileName || file.name`) para cuando el backend no devuelve `fileName`; no
  rompe nada que dependa solo de `{ tempUrl, asset }`.

## Cierre (lo ejecuta el orquestador, no un subagente)

### Task Q1: QA en navegador (Dev)

**Precondiciones:**
- Supabase Dev restaurado. Hoy está pausado: `ENOTFOUND` en `mcp__supabaseDev__run_sql`.
- El dev server del usuario corre en `http://localhost:5173`. Se reutiliza con `preview_start {url: "http://localhost:5173"}`; no se levanta otro.
- El login lo hace el usuario con `claude-bot@test.local` (el agente no escribe contraseñas).
- Hace falta una segunda cuenta o sesión con rol Diseño para el escenario 7.

**Files:** ninguno (solo verificación). La evidencia se deja en el reporte final.

- [ ] **Step 1: Confirmar que `apiFetch` usa el `fetch` global al momento de llamar**

Run: `rg -n "fetch\(" /Users/adrian/GitHub/webbrief/frontend/src/lib/api.js`
Expected: llamadas a `fetch(` (global), sin una referencia capturada al cargar el módulo. Si hay una referencia capturada, en el Step 2 interceptar esa función en su lugar.

- [ ] **Step 2: Simular latencia de ~6 s en las subidas** (javascript_tool en la pestaña del editor, solo para la prueba)

```js
window.__realFetch = window.__realFetch || window.fetch.bind(window)
window.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input.url
  const method = (init?.method || 'GET').toUpperCase()
  if (method === 'POST' && /\/api\/projects\/[^/]+\/assets$/.test(url)) {
    await new Promise((resolve) => setTimeout(resolve, 6000))
  }
  return window.__realFetch(input, init)
}
```

- [ ] **Step 3: Escenario 1 — subir y esperar**
Arrastrar una imagen a una sección → mientras sube se ve "Subiendo…" → al terminar la imagen queda con URL de ImageKit → esperar el autoguardado → recargar.
Expected: la imagen sigue en la página y no aparece ningún toast de error.

- [ ] **Step 4: Escenario 2 — cambiar de página a mitad de la subida**
Soltar la imagen en la página A → antes de 6 s cambiar a la página B → esperar → volver a A.
Expected: la imagen está en A, en la posición donde se soltó, con URL final; toast "La imagen «…» quedó en «A»."; tras el autoguardado, recargar y comprobar que sigue ahí.

- [ ] **Step 5: Escenario 3 — pasar a Preview a mitad de la subida**
Soltar la imagen → cambiar a Preview → esperar → volver a Brief.
Expected: la imagen está con URL final y se guarda.

- [ ] **Step 6: Escenario 4 — dos pestañas**
Abrir el mismo proyecto en dos pestañas. En la A soltar una imagen; en la B editar un texto y guardar mientras la A sigue subiendo.
Expected: en A la imagen no desaparece al sincronizar y termina guardada; en B aparece por el timbre.

- [ ] **Step 7: Escenario 5 — recargar con subida en curso**
Soltar la imagen → intentar recargar antes de 6 s.
Expected: el navegador muestra el aviso de salida (beforeunload).

- [ ] **Step 8: Escenario 6 — subida fallida**
Soltar un archivo no permitido (por ejemplo un .gif renombrado a .png inválido, o simular un 400 respondiendo `new Response('{"error":"x"}', {status: 400})` desde el interceptor).
Expected: el marcador desaparece del editor y aparece un toast de error; no queda nada en el estado ni en el guardado.

- [ ] **Step 9: Escenario 7 — rol Diseño publica directo**
Con la cuenta de Diseño: editar un texto y subir una imagen → guardar.
Expected: no aparece la caja de "Propuesta"; otra sesión (Manager o Admin) ve el cambio al instante por el timbre; `select count(*) from project_page_change_proposals where status='pending'` en Dev no aumenta.

- [ ] **Step 10: UX y tiempos**
Medir el tiempo entre la respuesta del POST y la imagen final visible (objetivo: menos de 1 s más la precarga de la imagen). Verificar que los toasts se entienden y no se repiten. Tomar screenshots de los escenarios 2 y 7 como evidencia.

- [ ] **Step 11: Verificación final**

Run: `cd /Users/adrian/GitHub/webbrief/backend && npm test`
Expected: todos los tests en verde (0 fallos).
Run: `cd /Users/adrian/GitHub/webbrief/frontend && npm run build`
Expected: `✓ built in …` sin errores.

### Task R1: Versión y entrega (requiere confirmación del owner)

**Files:**
- Modify: `frontend/package.json` (`"version"`)
- Modify: `frontend/package-lock.json` (versión raíz y `packages[""].version`)

- [ ] **Step 1: Confirmar el bump con el owner**
Propuesta: MINOR → `2.16.0` (cambio visible: Diseño publica directo y desaparece la caja de propuestas). Ojo: `frontend/package.json` y el lock ya tienen un bump sin commitear a `2.15.4` que pertenece al trabajo de CSP. Decidir con el owner cómo conviven antes de tocarlos.

- [ ] **Step 2: Aplicar el bump acordado**
Editar `"version": "2.16.0"` en `frontend/package.json` y las dos ocurrencias de la versión del paquete en `frontend/package-lock.json`.

- [ ] **Step 3: Commit**

```bash
git add frontend/package.json frontend/package-lock.json
git commit -m "chore(release): v2.16.0

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

- [ ] **Step 4: Push, PR, merge y deploy solo si el owner lo pide explícitamente**
El deploy es `ssh deploy@199.192.22.74` y luego `scripts/deploy.sh`; el backend y el frontend van juntos.
