// Middleware de autenticación: verifica el token JWT en cada petición protegida
import jwt from 'jsonwebtoken'

export function requireAuth(req, res, next) {
  // El token llega en el header: Authorization: Bearer <token>
  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token no proporcionado' })
  }

  const token = authHeader.split(' ')[1]

  try {
    // Verificar y decodificar el token
    const payload = jwt.verify(token, process.env.JWT_SECRET)
    // Guardar los datos del diseñador en req.designer para usarlos en las rutas
    req.designer = payload
    next()
  } catch {
    return res.status(401).json({ error: 'Token inválido o expirado' })
  }
}
