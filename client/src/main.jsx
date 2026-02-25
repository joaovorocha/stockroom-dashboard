import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'

// Import legacy CSS (raw CSS, no Bootstrap or UI libraries)
import './assets/theme.css'
import './assets/shared-header.css'
import './assets/dashboard.css'
import './assets/app-home.css'
import './assets/mobile.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
