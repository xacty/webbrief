// Detección de assets de biblioteca usados en páginas de proyectos: regex
// (substring) sobre content_html, mismo enfoque que el orphan-resolve de
// comentarios en backend/src/routes/projects.js (buscar `comment_orphaned`).
// Un asset "referenciado" no puede enviarse a la papelera sin `force: true`
// porque borrar su origen en ImageKit rompería la imagen ya insertada en un
// documento.
import { supabaseAdmin } from './supabase.js'

export function extractReferencedAssetIds(assets, pages) {
  const referenced = new Set()
  const haystack = (pages || []).map((p) => p?.content_html || '').join('\n')
  if (!haystack) return referenced
  for (const asset of assets || []) {
    const needles = [asset.storage_path, asset.public_url].filter(Boolean)
    if (needles.some((n) => haystack.includes(n))) referenced.add(asset.id)
  }
  return referenced
}

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
