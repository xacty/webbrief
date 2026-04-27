import { supabaseAdmin } from '../lib/supabase.js'

async function loadCurrentUser(user) {
  const [
    { data: profile, error: profileError },
    { data: memberships, error: membershipsError },
  ] = await Promise.all([
    supabaseAdmin
      .from('profiles')
      .select('id, email, full_name, avatar_url, platform_role')
      .eq('id', user.id)
      .maybeSingle(),
    supabaseAdmin
      .from('company_memberships')
      .select('company_id, role')
      .eq('user_id', user.id),
  ])

  if (profileError) {
    throw profileError
  }
  if (membershipsError) {
    throw membershipsError
  }

  return {
    id: user.id,
    email: profile?.email || user.email || '',
    fullName: profile?.full_name || user.user_metadata?.full_name || '',
    avatarUrl: profile?.avatar_url || '',
    platformRole: profile?.platform_role || 'user',
    memberships: (memberships || []).map((membership) => ({
      companyId: membership.company_id,
      companyName: '',
      role: membership.role,
    })),
  }
}

export async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token no proporcionado' })
  }

  const token = authHeader.slice('Bearer '.length)

  try {
    const { data, error } = await supabaseAdmin.auth.getUser(token)
    if (error || !data?.user) {
      return res.status(401).json({ error: 'Token invalido o expirado' })
    }

    req.currentUser = await loadCurrentUser(data.user)
    req.accessToken = token
    return next()
  } catch (error) {
    return res.status(401).json({ error: error.message || 'No se pudo validar la sesion' })
  }
}
