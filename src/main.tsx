import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './i18n'
// Tipografías del sistema de diseño, servidas desde la propia app (sin Google Fonts)
import '@fontsource/mona-sans/latin-600.css'
import '@fontsource/mona-sans/latin-700.css'
import '@fontsource/commissioner/latin-400.css'
import '@fontsource/commissioner/latin-600.css'
import '@fontsource/reddit-mono/latin-500.css'
import '@fontsource/reddit-mono/latin-600.css'
import './styles/global.css'
import './styles/redesign.css'
import { App } from './app/App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
