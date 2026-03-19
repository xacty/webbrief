// Rutas de autenticación: registro e inicio de sesión del diseñador
import { Router } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import db from '../db.js'

const router = Router()

// POST /api/auth/register
// Crea el diseñador. Solo funciona si no existe ninguno todavía.
router.post('/register', async (req, res) => {
  const { email, password, name } = req.body

  // Validar que llegaron los datos necesarios
  if (!email || !password || !name) {
    return res.status(400).json({ error: 'Email, password y name son requeridos' })
  }

  // Verificar que no exista ningún diseñador registrado
  const existing = db.prepare('SELECT id FROM designers LIMIT 1').get()
  if (existing) {
    return res.status(403).json({ error: 'Ya existe un diseñador registrado' })
  }

  // Encriptar la contraseña antes de guardarla
  const password_hash = await bcrypt.hash(password, 10)

  // Guardar el nuevo diseñador en la base de datos
  const result = db
    .prepare('INSERT INTO designers (email, password_hash, name) VALUES (?, ?, ?)')
    .run(email, password_hash, name)

  res.status(201).json({ message: 'Diseñador creado', id: result.lastInsertRowid })
})

// POST /api/auth/login
// Valida email y password, devuelve un token JWT si son correctos
router.post('/login', async (req, res) => {
  const { email, password } = req.body

  if (!email || !password) {
    return res.status(400).json({ error: 'Email y password son requeridos' })
  }

  // Buscar el diseñador por email
  const designer = db.prepare('SELECT * FROM designers WHERE email = ?').get(email)
  if (!designer) {
    return res.status(401).json({ error: 'Credenciales incorrectas' })
  }

  // Comparar la contraseña con el hash guardado
  const valid = await bcrypt.compare(password, designer.password_hash)
  if (!valid) {
    return res.status(401).json({ error: 'Credenciales incorrectas' })
  }

  // Generar el token JWT con los datos del diseñador (expira en 7 días)
  const token = jwt.sign(
    { id: designer.id, email: designer.email, name: designer.name },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  )

  res.json({ token, name: designer.name })
})

export default router
