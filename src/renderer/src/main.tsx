import { createRoot } from 'react-dom/client'
import App from './App'
import { applyTheme, loadStoredTheme } from './themes/themes'
import './styles/global.css'
import './styles/themes.css'

// Apply stored chrome theme before first paint
applyTheme(loadStoredTheme())

// No StrictMode — avoids double-mount side effects with IPC in Electron
createRoot(document.getElementById('root')!).render(<App />)
