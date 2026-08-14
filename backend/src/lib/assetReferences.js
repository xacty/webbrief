// Detección de assets de biblioteca usados en páginas de proyectos o en
// propuestas de designer pendientes: regex (substring) sobre content_html,
// mismo enfoque que el orphan-resolve de comentarios en
// backend/src/routes/projects.js (buscar `comment_orphaned`). Un asset
// "referenciado" no puede enviarse a la papelera sin `force: true` porque
// borrar su origen en ImageKit rompería la imagen ya insertada en un
// documento — publicado o todavía en revisión.
import { supabaseAdmin } from './supabase.js'
import { isMissingTableError } from './projectAccess.js'

// Contrato: cada asset necesita traer al menos storage_path o public_url
// (idealmente ambos) para poder decidir si está en uso. Si quien llama
// selecciona solo columnas parciales (p. ej. `id, file_name`), needles queda
// vacío y NINGÚN asset se marca como referenciado — falla abierto en vez de
// cerrado. Se lanza acá para detectar ese bug en el select de origen en vez
// de dejar pasar en silencio un asset en uso hacia la papelera (bug real
// corregido en library.js, ver BUG A).
export function extractReferencedAssetIds(assets, pages) {
  const referenced = new Set()
  const candidates = (assets || []).map((asset) => {
    const needles = [asset.storage_path, asset.public_url].filter(Boolean)
    if (needles.length === 0) {
      throw new Error(
        `extractReferencedAssetIds: el asset ${asset.id} no trae storage_path ni public_url; ` +
        'sin al menos uno de los dos no se puede saber si está referenciado (revisa el select de origen).'
      )
    }
    return { id: asset.id, needles }
  })
  const haystack = (pages || []).map((p) => p?.content_html || '').join('\n')
  if (!haystack) return referenced
  for (const { id, needles } of candidates) {
    if (needles.some((n) => haystack.includes(n))) referenced.add(id)
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
