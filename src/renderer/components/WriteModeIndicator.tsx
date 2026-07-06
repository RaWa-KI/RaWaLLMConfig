import { useWriteConfig } from '../state/store-write-config'
import { Icon } from './Icon'

// WriteModeIndicator: schlanker, nicht-blockierender Statusstreifen fuer den
// Schreibmodus. Kein Aktivierungs-Zwang, kein grosses Banner (Owner-Entscheid
// 14:33: Schreibmodus default AN — „Ich oeffne die App, WEIL ich was bearbeiten
// will."). Zwei Zustaende:
//   AN  -> kompakter Aktiv-Indikator (.wmb-active) + ggf. (Sandbox).
//   AUS -> kompakter Aus-Indikator (.wmb-off) bei Env-Opt-out
//          (RAWALLM_WRITE_ENABLED=0). Kein Aktivieren-Button; der Grund haengt
//          als Tooltip am Indikator. Die Edit-Controls bleiben dann ueber den
//          jeweiligen Detail-Code deaktiviert (nicht hier).
// Kein Secret-Rendering; writeReason ist eine generische Statusmeldung vom Main.
export function WriteModeIndicator() {
  const wc = useWriteConfig()
  const registrarWarning =
    wc.registrarFailures.length > 0
      ? `Start-Warnung: ${wc.registrarFailures.join(', ')} nicht geladen`
      : null

  if (wc.writeEnabled) {
    return (
      <div className="wmb-stack" role="status">
        <div className="wmb-active">
          {Icon.check}
          <span>Bearbeiten aktiv</span>
          {wc.writeSandbox && <span className="wmb-sandbox">(Sandbox)</span>}
        </div>
        {registrarWarning && <div className="wmb-warning">{Icon.note}<span>{registrarWarning}</span></div>}
      </div>
    )
  }

  // Explizit ausgeschaltet (Env-Opt-out): schlanker Hinweis statt Banner.
  const reason = wc.writeReason ?? 'Bearbeiten ist ausgeschaltet'
  return (
    <div className="wmb-stack" role="status" title={reason}>
      <div className="wmb-off">
        {Icon.note}
        <span>Bearbeiten ausgeschaltet</span>
      </div>
      {registrarWarning && <div className="wmb-warning">{Icon.note}<span>{registrarWarning}</span></div>}
    </div>
  )
}
