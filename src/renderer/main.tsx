import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { StoreProvider } from './state/store'
import { LocaleProvider } from './state/store-locale'
import { App } from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
import { pushErrorLog } from './lib/error-log-buffer'
import './styles/global.css'

// A8-6, Stufe 2: globale Fenster-Handler. Fangen Fehler ausserhalb des React-
// Render-Pfads (Event-Handler, async) ab und loggen NUR die Klartext-message
// (secret-frei) — verhindern eine stille, unsichtbare Fehlschlag-Kaskade.
// D055: dieselben Meldungen landen zusaetzlich im fluechtigen Ringpuffer, den
// der Online-Fehlerbericht bei aktivem Opt-in als Debug-Logs mitsendet.
window.addEventListener('error', (e) => {
  console.error('[renderer] window.onerror', e.message)
  pushErrorLog('window.onerror', e.message)
})
window.addEventListener('unhandledrejection', (e) => {
  const r = e.reason
  const msg = r instanceof Error ? r.message : String(r)
  console.error('[renderer] unhandledrejection', msg)
  pushErrorLog('unhandledrejection', msg)
})

const el = document.getElementById('root')
if (el) {
  createRoot(el).render(
    <StrictMode>
      <StoreProvider>
        <LocaleProvider>
          <ErrorBoundary>
            <App />
          </ErrorBoundary>
        </LocaleProvider>
      </StoreProvider>
    </StrictMode>
  )
}
