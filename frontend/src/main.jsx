import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import { installChunkReloadHandler } from './lib/chunkReload'
import './styles/tokens.css'
import './styles/base.css'

installChunkReloadHandler()
createRoot(document.getElementById('root')).render(<App />)
