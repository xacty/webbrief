// Cargar variables de entorno desde el archivo .env
import 'dotenv/config'

import express from 'express'
import cors from 'cors'
import authRoutes from './routes/auth.js'

const app = express()
const PORT = process.env.PORT || 3000

app.use(cors())
app.use(express.json())

// Ruta de prueba para verificar que el servidor funciona
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' })
})

// Rutas de autenticación (registro y login)
app.use('/api/auth', authRoutes)

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
})
