import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { StoreProvider } from './state/store'
import { App } from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
import './styles/global.css'

// A8-6, Stufe 2: globale Fenster-Handler. Fangen Fehler ausserhalb des React-
// Render-Pfads (Event-Handler, async) ab und loggen NUR die Klartext-message
// (secret-frei) — verhindern eine stille, unsichtbare Fehlschlag-Kaskade.
window.addEventListener('error', (e) => {
  console.error('[renderer] window.onerror', e.message)
})
window.addEventListener('unhandledrejection', (e) => {
  const r = e.reason
  console.error('[renderer] unhandledrejection', r instanceof Error ? r.message : String(r))
})

const el = document.getElementById('root')
if (el) {
  createRoot(el).render(
    <StrictMode>
      <StoreProvider>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </StoreProvider>
    </StrictMode>
  )
}
