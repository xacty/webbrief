// Cliente API de carpetas de proyectos por empresa (montado en
// /api/companies/:companyId/project-folders, ver
// backend/src/routes/projectFolders.js). Mismo patrón que libraryApi.js —
// wrappers finos sobre apiFetch, sin lógica de negocio acá.
import { apiFetch } from './api'

const base = (companyId) => `/api/companies/${companyId}/project-folders`

// GET / — todas las carpetas de la empresa (plano) + projectCount por
// carpeta (conteo de proyectos ACTIVOS directos, ver projectFolders.js). El
// frontend arma el árbol/breadcrumb con parent_folder_id, igual que
// allFolders en la biblioteca.
export const fetchProjectFolders = (companyId) => apiFetch(base(companyId))

export const createProjectFolder = (companyId, { name, parentFolderId }) =>
  apiFetch(base(companyId), { method: 'POST', body: JSON.stringify({ name, parentFolderId: parentFolderId || null }) })

export const updateProjectFolder = (companyId, folderId, updates) =>
  apiFetch(`${base(companyId)}/${folderId}`, { method: 'PATCH', body: JSON.stringify(updates) })

// DELETE — hard delete que reparenta subcarpetas y proyectos contenidos a
// la carpeta padre (o raíz). Responde { deleted, reparentedProjects,
// reparentedFolders } — ver DELETE /:folderId en projectFolders.js para la
// semántica completa (project_folders NO tiene papelera).
export const deleteProjectFolder = (companyId, folderId) =>
  apiFetch(`${base(companyId)}/${folderId}`, { method: 'DELETE' })

// Bulk move-to-folder vive en /api/projects/bulk/*, NO bajo
// /companies/:id/project-folders — mismo nivel que los otros bulk
// endpoints de proyectos (archive/trash/move-company, ver
// backend/src/routes/projects.js). body: { ids, folderId }, folderId=null
// mueve a la raíz. Respuesta: { moved, failed }.
export const moveProjectsToFolder = (ids, folderId) =>
  apiFetch('/api/projects/bulk/move-to-folder', { method: 'POST', body: JSON.stringify({ ids, folderId: folderId || null }) })
