// Cargar variables de entorno desde el archivo .env
import 'dotenv/config'

import express from 'express'
import cors from 'cors'
import authRoutes from './routes/auth.js'
import companiesRoutes from './routes/companies.js'
import projectsRoutes from './routes/projects.js'
import usersRoutes from './routes/users.js'
import notificationsRoutes from './routes/notifications.js'
import publicRoutes from './routes/public.js'
import trashRoutes from './routes/trash.js'

const app = express()
const PORT = process.env.PORT || 3000

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
}))
app.use(express.json({ limit: '1mb' }))

// Ruta de prueba para verificar que el servidor funciona
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' })
})

// Rutas de autenticación y datos
app.use('/api/auth', authRoutes)
app.use('/api/companies', companiesRoutes)
app.use('/api/projects', projectsRoutes)
app.use('/api/users', usersRoutes)
app.use('/api/notifications', notificationsRoutes)
app.use('/api/trash', trashRoutes)
app.use('/api/public', publicRoutes)

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
})
