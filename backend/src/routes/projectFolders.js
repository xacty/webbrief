// backend/src/routes/projectFolders.js
// Carpetas de proyectos por empresa. Montado en
// /api/companies/:companyId/project-folders (mergeParams, ANTES de
// companiesRoutes en index.js — mismo motivo que library.js: si montara
// después, GET /api/companies/:id podría shadowear estas rutas).
//
// Router hermano de routes/library.js (biblioteca de imágenes), pero con
// semántica de borrado distinta: project_folders NO tiene papelera. Borrar
// una carpeta de proyectos JAMÁS toca los proyectos — sus contenidos
// directos (subcarpetas + proyectos) se reparentan a la carpeta padre de la
// borrada, o a la raíz si no tenía padre. Ver planFolderDeletion en
// lib/folderTree.js para la función pura que calcula el plan de reparenteo,
// y el comentario en DELETE /:folderId más abajo para el porqué del orden
// de las operaciones.
import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { rateLimiters } from '../middleware/security.js'
import { supabaseAdmin } from '../lib/supabase.js'
import { logSecurityEvent } from '../lib/securityAudit.js'
import {
  wouldCreateFolderCycle,
  validateFolderName,
  resolveCompanyRole,
  planFolderDeletion,
} from '../lib/folderTree.js'

const router = Router({ mergeParams: true })
router.use(requireAuth)

// Middleware: resuelve companyId + rol; adjunta req.folderAccess. Mismo
// patrón que requireLibraryAccess en routes/library.js.
async function requireFolderAccess(req, res, next, { write = false } = {}) {
  const companyId = req.params.companyId
  const role = resolveCompanyRole(req.currentUser, companyId)
  if (!role) return res.status(404).json({ error: 'Empresa no encontrada' })
  if (write && role !== 'write') return res.status(403).json({ error: 'Tu rol no puede modificar las carpetas' })
  req.folderAccess = { companyId, role }
  next()
}
const readAccess = (req, res, next) => requireFolderAccess(req, res, next, { write: false })
const writeAccess = (req, res, next) => requireFolderAccess(req, res, next, { write: true })

// GET / — todas las carpetas de la empresa (plano, sin filtrar por padre;
// el árbol/breadcrumb lo arma el frontend con parent_folder_id, igual que
// allFolders en buildLibraryListing) + conteo de proyectos activos por
// carpeta. Proyectos archivados/en papelera no cuentan (mismo criterio que
// el listado principal de proyectos).
router.get('/', readAccess, async (req, res) => {
  const [{ data: folders, error: foldersError }, { data: projects, error: projectsError }] = await Promise.all([
    supabaseAdmin
      .from('project_folders')
      .select('id, parent_folder_id, name, position, created_at, updated_at')
      .eq('company_id', req.folderAccess.companyId)
      .order('position')
      .order('name'),
    supabaseAdmin
      .from('projects')
      .select('id, folder_id')
      .eq('company_id', req.folderAccess.companyId)
      .is('archived_at', null)
      .is('trashed_at', null),
  ])
  if (foldersError) return res.status(500).json({ error: foldersError.message })
  if (projectsError) return res.status(500).json({ error: projectsError.message })

  const countByFolder = new Map()
  for (const project of projects || []) {
    const key = project.folder_id || null
    countByFolder.set(key, (countByFolder.get(key) || 0) + 1)
  }

  res.json({
    folders: (folders || []).map((folder) => ({
      ...folder,
      projectCount: countByFolder.get(folder.id) || 0,
    })),
    role: req.folderAccess.role,
  })
})

router.post('/', rateLimiters.sensitiveAction, writeAccess, async (req, res) => {
  const name = validateFolderName(req.body?.name)
  if (!name) return res.status(400).json({ error: 'Nombre de carpeta requerido' })
  const parentFolderId = req.body?.parentFolderId || null
  if (parentFolderId) {
    const { data: parent } = await supabaseAdmin
      .from('project_folders').select('id').eq('id', parentFolderId)
      .eq('company_id', req.folderAccess.companyId).maybeSingle()
    if (!parent) return res.status(400).json({ error: 'Carpeta padre no encontrada' })
  }
  const { data, error } = await supabaseAdmin
    .from('project_folders')
    .insert({
      company_id: req.folderAccess.companyId,
      parent_folder_id: parentFolderId,
      name,
      created_by: req.currentUser.id,
    })
    .select('*')
    .single()
  if (error) return res.status(500).json({ error: error.message })
  res.status(201).json({ folder: data })
})

router.patch('/:folderId', rateLimiters.sensitiveAction, writeAccess, async (req, res) => {
  const updates = {}
  if (req.body?.name !== undefined) {
    const name = validateFolderName(req.body.name)
    if (!name) return res.status(400).json({ error: 'Nombre inválido' })
    updates.name = name
  }
  if (req.body?.parentFolderId !== undefined) {
    const nextParent = req.body.parentFolderId || null
    const { data: folders } = await supabaseAdmin
      .from('project_folders').select('id, parent_folder_id')
      .eq('company_id', req.folderAccess.companyId)
    if (wouldCreateFolderCycle(folders || [], req.params.folderId, nextParent)) {
      return res.status(400).json({ error: 'No puedes mover una carpeta dentro de sí misma' })
    }
    updates.parent_folder_id = nextParent
  }
  if (!Object.keys(updates).length) return res.status(400).json({ error: 'Nada que actualizar' })
  const { data, error } = await supabaseAdmin
    .from('project_folders').update(updates)
    .eq('id', req.params.folderId).eq('company_id', req.folderAccess.companyId)
    .select('*').maybeSingle()
  if (error) return res.status(500).json({ error: error.message })
  if (!data) return res.status(404).json({ error: 'Carpeta no encontrada' })
  res.json({ folder: data })
})

// DELETE /:folderId — hard delete (sin papelera) que reparenta subcarpetas y
// proyectos contenidos a la carpeta padre (o raíz). Orden de operaciones
// DELIBERADO, no cosmético:
//   1) reparentar subcarpetas (project_folders.parent_folder_id) — si
//      borráramos la carpeta primero, el FK parent_folder_id (ON DELETE
//      CASCADE) se llevaría puestas las subcarpetas en vez de reparentarlas.
//   2) reparentar proyectos (projects.folder_id) — si borráramos primero,
//      el FK projects.folder_id (ON DELETE SET NULL) los mandaría a la raíz
//      aunque la carpeta borrada tuviera padre (newParentId no nulo), lo
//      cual violaría la semántica "se mueven al padre, no a la raíz".
//   3) recién ahí borrar la fila de la carpeta.
router.delete('/:folderId', rateLimiters.sensitiveAction, writeAccess, async (req, res) => {
  try {
    const { data: folders, error: foldersError } = await supabaseAdmin
      .from('project_folders')
      .select('id, parent_folder_id')
      .eq('company_id', req.folderAccess.companyId)
    if (foldersError) return res.status(500).json({ error: foldersError.message })

    const target = (folders || []).find((folder) => folder.id === req.params.folderId)
    if (!target) return res.status(404).json({ error: 'Carpeta no encontrada' })

    const { data: projects, error: projectsError } = await supabaseAdmin
      .from('projects')
      .select('id, folder_id')
      .eq('company_id', req.folderAccess.companyId)
      .eq('folder_id', req.params.folderId)
    if (projectsError) return res.status(500).json({ error: projectsError.message })

    const plan = planFolderDeletion(folders, projects || [], req.params.folderId)

    if (plan.reparentedFolderIds.length > 0) {
      const { error } = await supabaseAdmin
        .from('project_folders')
        .update({ parent_folder_id: plan.newParentId })
        .in('id', plan.reparentedFolderIds)
        .eq('company_id', req.folderAccess.companyId)
      if (error) return res.status(500).json({ error: error.message })
    }

    if (plan.reparentedProjectIds.length > 0) {
      const { error } = await supabaseAdmin
        .from('projects')
        .update({ folder_id: plan.newParentId })
        .in('id', plan.reparentedProjectIds)
        .eq('company_id', req.folderAccess.companyId)
      if (error) return res.status(500).json({ error: error.message })
    }

    const { error: deleteError } = await supabaseAdmin
      .from('project_folders')
      .delete()
      .eq('id', req.params.folderId)
      .eq('company_id', req.folderAccess.companyId)
    if (deleteError) return res.status(500).json({ error: deleteError.message })

    await logSecurityEvent(req, {
      action: 'project_folder_deleted',
      resourceType: 'project_folder',
      resourceId: target.id,
      companyId: req.folderAccess.companyId,
      metadata: {
        reparentedProjects: plan.reparentedProjectIds.length,
        reparentedFolders: plan.reparentedFolderIds.length,
        newParentId: plan.newParentId,
      },
    })

    return res.json({
      deleted: true,
      reparentedProjects: plan.reparentedProjectIds.length,
      reparentedFolders: plan.reparentedFolderIds.length,
    })
  } catch (error) {
    return res.status(500).json({ error: error.message || 'No se pudo eliminar la carpeta' })
  }
})

export default router
