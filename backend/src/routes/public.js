import { Router } from 'express'
import multer from 'multer'
import crypto from 'node:crypto'
import { supabaseAdmin } from '../lib/supabase.js'
import { hashToken, logProjectActivity } from '../lib/projectAccess.js'
import { uploadToImageKit, buildImageKitPath } from '../lib/imagekit.js'

const briefDocsUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
})

const PROJECT_TOTAL_BUDGET_BYTES = 500 * 1024 * 1024
const BRIEF_IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml'])
const BRIEF_DOC_MIMES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.oasis.opendocument.text',
  'application/vnd.oasis.opendocument.spreadsheet',
  'application/vnd.oasis.opendocument.presentation',
  'text/plain',
  'text/csv',
])
const BRIEF_ALLOWED_EXTS = new Set([
  'jpg', 'jpeg', 'png', 'webp', 'gif', 'svg',
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods', 'odp',
  'txt', 'csv',
])
function getFileExtension(filename) {
  if (!filename) return ''
  const idx = filename.lastIndexOf('.')
  if (idx < 0 || idx === filename.length - 1) return ''
  return filename.slice(idx + 1).toLowerCase()
}
function sanitizeBriefFilename(name) {
  if (!name) return 'archivo'
  return name
    .replace(/\.\./g, '')
    .replace(/[\\/]/g, '_')
    .replace(/[^a-zA-Z0-9._\-\s]/g, '')
    .trim()
    .slice(0, 200)
}

const router = Router()

function serializePublicPage(page) {
  return {
    id: page.id,
    name: page.name,
    position: page.position,
    contentHtml: page.content_html,
    contentJson: page.content_json,
    seoMetadata: page.seo_metadata || {},
    version: page.version || 1,
    updatedAt: page.updated_at,
  }
}

async function getActiveShare(token) {
  const tokenHash = hashToken(token)
  const { data: shareLink, error } = await supabaseAdmin
    .from('project_share_links')
    .select('id, project_id, label, expires_at, revoked_at')
    .eq('token_hash', tokenHash)
    .maybeSingle()

  if (error) throw error
  if (!shareLink || shareLink.revoked_at) return null
  if (shareLink.expires_at && new Date(shareLink.expires_at) < new Date()) return null
  return shareLink
}

router.get('/share/:token', async (req, res) => {
  try {
    const shareLink = await getActiveShare(req.params.token)
    if (!shareLink) return res.status(404).json({ error: 'Link no encontrado o expirado' })

    const [
      { data: project, error: projectError },
      { data: pages, error: pagesError },
    ] = await Promise.all([
      supabaseAdmin
        .from('projects')
        .select('*')
        .eq('id', shareLink.project_id)
        .is('archived_at', null)
        .is('trashed_at', null)
        .maybeSingle(),
      supabaseAdmin
        .from('project_pages')
        .select('*')
        .eq('project_id', shareLink.project_id)
        .order('position', { ascending: true }),
    ])

    if (projectError) throw projectError
    if (pagesError) throw pagesError
    if (!project) return res.status(404).json({ error: 'Proyecto no encontrado' })

    await supabaseAdmin
      .from('project_share_links')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', shareLink.id)

    return res.json({
      project: {
        id: project.id,
        name: project.name,
        clientName: project.client_name,
        clientEmail: project.client_email,
        businessType: project.business_type,
        projectType: project.project_type || 'page',
        updatedAt: project.updated_at,
      },
      pages: (pages || []).map(serializePublicPage),
    })
  } catch (error) {
    return res.status(500).json({ error: error.message || 'No se pudo abrir el link privado' })
  }
})

router.post('/share/:token/comments', async (req, res) => {
  const { authorName, authorEmail, body, pageId = null, sectionId = null } = req.body
  if (!authorName?.trim() || !authorEmail?.trim() || !body?.trim()) {
    return res.status(400).json({ error: 'authorName, authorEmail y body son requeridos' })
  }

  try {
    const shareLink = await getActiveShare(req.params.token)
    if (!shareLink) return res.status(404).json({ error: 'Link no encontrado o expirado' })

    const { data, error } = await supabaseAdmin
      .from('project_comments')
      .insert({
        project_id: shareLink.project_id,
        page_id: pageId,
        section_id: sectionId,
        author_name: authorName.trim(),
        author_email: authorEmail.trim().toLowerCase(),
        body: body.trim(),
        source: 'share',
      })
      .select('id, project_id, page_id, section_id, author_name, author_email, body, status, created_at')
      .single()

    if (error) return res.status(500).json({ error: error.message })

    await logProjectActivity({
      projectId: shareLink.project_id,
      eventType: 'client_comment_created',
      subjectType: 'comment',
      subjectId: data.id,
      title: 'Comentario de cliente',
      description: data.body,
      metadata: {
        clientName: data.author_name,
        clientEmail: data.author_email,
        pageId: data.page_id,
        sectionId: data.section_id,
      },
    })

    return res.status(201).json({
      comment: {
        id: data.id,
        projectId: data.project_id,
        pageId: data.page_id,
        sectionId: data.section_id,
        authorName: data.author_name,
        authorEmail: data.author_email,
        body: data.body,
        status: data.status,
        createdAt: data.created_at,
      },
    })
  } catch (error) {
    return res.status(500).json({ error: error.message || 'No se pudo crear el comentario' })
  }
})

router.post('/share/:token/approvals', async (req, res) => {
  const { reviewerName, reviewerEmail, status, comment = '', pageId = null, sectionId = null } = req.body
  if (!reviewerName?.trim() || !reviewerEmail?.trim() || !['approved', 'changes_requested'].includes(status)) {
    return res.status(400).json({ error: 'reviewerName, reviewerEmail y status válido son requeridos' })
  }

  try {
    const shareLink = await getActiveShare(req.params.token)
    if (!shareLink) return res.status(404).json({ error: 'Link no encontrado o expirado' })

    const { data, error } = await supabaseAdmin
      .from('project_approvals')
      .insert({
        project_id: shareLink.project_id,
        page_id: pageId,
        section_id: sectionId,
        reviewer_name: reviewerName.trim(),
        reviewer_email: reviewerEmail.trim().toLowerCase(),
        status,
        comment: comment?.trim() || null,
      })
      .select('id, project_id, page_id, section_id, reviewer_name, reviewer_email, status, comment, created_at')
      .single()

    if (error) return res.status(500).json({ error: error.message })

    await logProjectActivity({
      projectId: shareLink.project_id,
      eventType: status === 'approved' ? 'client_approved' : 'client_requested_changes',
      subjectType: 'approval',
      subjectId: data.id,
      title: status === 'approved' ? 'Cliente aprobó' : 'Cliente pidió cambios',
      description: data.comment,
      metadata: {
        clientName: data.reviewer_name,
        clientEmail: data.reviewer_email,
        pageId: data.page_id,
        sectionId: data.section_id,
      },
    })

    return res.status(201).json({
      approval: {
        id: data.id,
        projectId: data.project_id,
        pageId: data.page_id,
        sectionId: data.section_id,
        reviewerName: data.reviewer_name,
        reviewerEmail: data.reviewer_email,
        status: data.status,
        comment: data.comment,
        createdAt: data.created_at,
      },
    })
  } catch (error) {
    return res.status(500).json({ error: error.message || 'No se pudo registrar la aprobación' })
  }
})

// ---------------------------------------------------------------------------
// Brief public routes — no authentication required
// ---------------------------------------------------------------------------

router.get('/brief/:token', async (req, res) => {
  try {
    const { data: project, error } = await supabaseAdmin
      .from('projects')
      .select('id, name, project_type, brief_share_token, archived_at, trashed_at')
      .eq('brief_share_token', req.params.token)
      .is('archived_at', null)
      .is('trashed_at', null)
      .maybeSingle()

    if (error) throw error
    if (!project || project.project_type !== 'brief') {
      return res.status(404).json({ error: 'Brief no encontrado o expirado' })
    }

    const { data: pages, error: pagesError } = await supabaseAdmin
      .from('project_pages')
      .select('id, name, content_json')
      .eq('project_id', project.id)
      .order('position', { ascending: true })
      .limit(1)

    if (pagesError) throw pagesError

    const page = pages?.[0]
    const briefData = page?.content_json || {}

    return res.json({
      brief: {
        projectId: project.id,
        formTitle: briefData.formTitle || project.name,
        formDescription: briefData.formDescription || '',
        questions: Array.isArray(briefData.questions) ? briefData.questions : [],
      },
    })
  } catch (error) {
    return res.status(500).json({ error: error.message || 'No se pudo cargar el brief' })
  }
})

router.post('/brief/:token/submit', async (req, res) => {
  const { respondentName, respondentEmail, answers } = req.body
  if (!respondentName?.trim() || !respondentEmail?.trim()) {
    return res.status(400).json({ error: 'respondentName y respondentEmail son requeridos' })
  }
  if (!answers || typeof answers !== 'object') {
    return res.status(400).json({ error: 'answers debe ser un objeto' })
  }

  try {
    const { data: project, error: projectError } = await supabaseAdmin
      .from('projects')
      .select('id, name, project_type, archived_at, trashed_at')
      .eq('brief_share_token', req.params.token)
      .is('archived_at', null)
      .is('trashed_at', null)
      .maybeSingle()

    if (projectError) throw projectError
    if (!project || project.project_type !== 'brief') {
      return res.status(404).json({ error: 'Brief no encontrado' })
    }

    const { data: response, error: insertError } = await supabaseAdmin
      .from('brief_responses')
      .insert({
        project_id: project.id,
        share_token: req.params.token,
        respondent_name: respondentName.trim(),
        respondent_email: respondentEmail.trim().toLowerCase(),
        answers,
      })
      .select('id, submitted_at')
      .single()

    if (insertError) return res.status(500).json({ error: insertError.message })

    await logProjectActivity({
      projectId: project.id,
      eventType: 'brief_response_received',
      subjectType: 'brief_response',
      subjectId: response.id,
      title: 'Brief completado',
      description: `${respondentName.trim()} (${respondentEmail.trim().toLowerCase()})`,
      metadata: {
        respondentName: respondentName.trim(),
        respondentEmail: respondentEmail.trim().toLowerCase(),
      },
    })

    return res.status(201).json({ ok: true, submittedAt: response.submitted_at })
  } catch (error) {
    return res.status(500).json({ error: error.message || 'No se pudo enviar el brief' })
  }
})

router.post('/brief/:token/documents', briefDocsUpload.single('file'), async (req, res) => {
  try {
    const { data: project, error: projectError } = await supabaseAdmin
      .from('projects')
      .select('id, company_id, project_type, brief_share_token, brief_max_file_mb, archived_at, trashed_at')
      .eq('brief_share_token', req.params.token)
      .is('archived_at', null)
      .is('trashed_at', null)
      .maybeSingle()
    if (projectError) throw projectError
    if (!project || project.project_type !== 'brief') {
      return res.status(404).json({ error: 'Brief no encontrado o expirado' })
    }
    if (!req.file) return res.status(400).json({ error: 'file es requerido' })

    const mime = req.file.mimetype || ''
    const originalName = req.file.originalname || 'archivo'
    const ext = getFileExtension(originalName)
    const isImage = BRIEF_IMAGE_MIMES.has(mime)
    const isDoc = BRIEF_DOC_MIMES.has(mime)

    if (!isImage && !isDoc) {
      return res.status(400).json({ error: `Tipo de archivo no permitido (${mime})` })
    }
    if (ext && !BRIEF_ALLOWED_EXTS.has(ext)) {
      return res.status(400).json({ error: `Extensión .${ext} no permitida` })
    }

    const maxFileMb = project.brief_max_file_mb || 10
    if (req.file.size > maxFileMb * 1024 * 1024) {
      return res.status(400).json({ error: `El archivo supera el tope de ${maxFileMb} MB por archivo` })
    }

    const { data: existingAssets, error: budgetError } = await supabaseAdmin
      .from('project_assets')
      .select('file_size')
      .eq('project_id', project.id)
      .is('trashed_at', null)
    if (budgetError) return res.status(500).json({ error: budgetError.message })
    const usedBytes = (existingAssets || []).reduce((sum, a) => sum + (a.file_size || 0), 0)
    if (usedBytes + req.file.size > PROJECT_TOTAL_BUDGET_BYTES) {
      const remainingMb = Math.max(0, Math.floor((PROJECT_TOTAL_BUDGET_BYTES - usedBytes) / (1024 * 1024)))
      return res.status(400).json({ error: `Presupuesto del proyecto agotado. Restan ${remainingMb} MB.` })
    }

    const assetId = crypto.randomUUID()
    const safeName = sanitizeBriefFilename(originalName)

    let storageBucket
    let storagePath
    let publicUrl = null
    let imagekitFileId = null
    let assetKind

    if (isImage && mime !== 'image/svg+xml') {
      const folder = buildImageKitPath('companies', project.company_id, 'projects', project.id, 'brief')
      const uploadName = `${assetId}-${safeName}`
      const uploadResponse = await uploadToImageKit({
        buffer: req.file.buffer,
        fileName: uploadName,
        folder,
        tags: ['brief-document', 'public-upload'],
      })
      storageBucket = 'imagekit'
      storagePath = uploadResponse.filePath || `${folder}/${uploadName}`
      publicUrl = uploadResponse.url || null
      imagekitFileId = uploadResponse.fileId || null
      assetKind = 'image'
    } else {
      const path = `${project.id}/${assetId}-${safeName}`
      const { error: uploadError } = await supabaseAdmin.storage
        .from('brief-documents')
        .upload(path, req.file.buffer, {
          contentType: mime,
          cacheControl: '3600',
          upsert: false,
        })
      if (uploadError) {
        return res.status(500).json({
          error: `No se pudo subir: ${uploadError.message}. Verificar que el bucket "brief-documents" exista.`,
        })
      }
      storageBucket = 'brief-documents'
      storagePath = path
      assetKind = mime === 'image/svg+xml' ? 'svg' : 'file'
    }

    const { data: asset, error: assetError } = await supabaseAdmin
      .from('project_assets')
      .insert({
        id: assetId,
        project_id: project.id,
        deliverable_id: null,
        page_id: null,
        section_id: null,
        uploaded_by: null, // public upload, no auth user
        file_name: originalName,
        storage_bucket: storageBucket,
        storage_path: storagePath,
        imagekit_file_id: imagekitFileId,
        mime_type: mime,
        asset_kind: assetKind,
        public_url: publicUrl,
        file_size: req.file.size,
        render_inline: false,
      })
      .select('id, file_name, mime_type, file_size, public_url, created_at')
      .single()

    if (assetError) return res.status(500).json({ error: assetError.message })

    return res.status(201).json({
      asset: {
        id: asset.id,
        fileName: asset.file_name,
        mimeType: asset.mime_type,
        fileSize: asset.file_size,
        publicUrl: asset.public_url,
        createdAt: asset.created_at,
      },
    })
  } catch (error) {
    return res.status(500).json({ error: error.message || 'No se pudo subir el archivo' })
  }
})

export default router
