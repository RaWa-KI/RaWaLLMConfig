import { useStore } from '../state/store'
import { Icon } from '../components/Icon'

// Toast: spiegelt ui.toast ({msg,icon?}|null) aus dem Store (kein lokales
// useState-Duplikat). Phase 2: zeigt auch Write-Resultate — Erfolg (icon 'check')
// und Fehler (icon 'warn') je Mutation. Die Meldung ist bereits sanitisiert
// (store-write reicht nur die generische error/ok-Nachricht durch); hier wird
// NIE ein Pfad-Stack oder Secret gerendert, nur msg + Status-Variante.
function variantFor(icon?: string): 'ok' | 'error' {
  return (icon === 'warn' || icon === 'x') ? 'error' : 'ok'
}

export function Toast() {
  const { ui } = useStore()
  const toast = ui.toast
  const variant = toast ? variantFor(toast.icon) : 'ok'
  return (
    <div className={'toast ' + variant + (toast ? ' show' : '')}>
      {toast && (
        <>
          {Icon[toast.icon || 'check'] || Icon.check}
          {toast.msg}
        </>
      )}
    </div>
  )
}
