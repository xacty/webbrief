import Database from 'better-sqlite3'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { mkdirSync } from 'fs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const dataDir = join(__dirname, '..', 'data')

// Crear la carpeta data/ si no existe
mkdirSync(dataDir, { recursive: true })

const db = new Database(join(dataDir, 'webbrief.db'))

db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

// Crear tabla de diseñadores si no existe todavía
db.exec(`
  CREATE TABLE IF NOT EXISTS designers (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    email         TEXT    UNIQUE NOT NULL,
    password_hash TEXT    NOT NULL,
    name          TEXT    NOT NULL,
    created_at    TEXT    DEFAULT (datetime('now'))
  )
`)

export default db
