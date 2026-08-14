import { Icon } from '../../components/Icon'
import { usePrefs } from '../../state/store-write-prefs'
import { useStore } from '../../state/store'

// Cloud-Anbieter-Toggles (WP1, Diagnosekarten-Regel 2026-07-28): Der Nutzer
// markiert hier, welche Cloud-Anbieter er nutzt (Default: aus). Nur fuer
// aktivierte Anbieter meldet die App einen fehlenden Zugangsschluessel als
// Diagnosekarte — ein OAuth-/Login-Setup ohne API-Keys zeigt so keine
// Key-Karten. Der Toggle ist eine UI-Einstellung (Prefs, backup-first), kein
// Secret: gespeichert wird nur die Nutzungsabsicht, nie ein Schluessel.
// Texte nach app-text-ux: Was passiert bei an/aus in einem Satz.

interface CloudProviderToggle {
  id: string
  label: string
  envHint: string
}

// Reihenfolge = cloud-scan CLOUD_PROVIDERS (OpenAI, Anthropic, Gemini). Die
// Env-NAMEN sind oeffentliche Dokumentations-Namen, keine Werte.
const TOGGLES: readonly CloudProviderToggle[] = [
  { id: 'openai', label: 'OpenAI', envHint: 'OPENAI_API_KEY' },
  { id: 'anthropic', label: 'Anthropic', envHint: 'ANTHROPIC_API_KEY' },
  { id: 'gemini', label: 'Google Gemini', envHint: 'GEMINI_API_KEY / GOOGLE_API_KEY' }
]

function prefKey(id: string): string {
  return `cloudProvider.${id}.enabled`
}

// WP-F7: Auth-Modus-Pref je Anbieter. Ungesetzt = Standard = API-Key-Pruefung
// (bisheriges Verhalten); 'oauth' unterdrueckt die Key-Karte und zeigt statt-
// dessen den neutralen Hinweis „OAuth-Login im Tool". Kein OAuth-Flow hier.
function authModePrefKey(id: string): string {
  return `cloudProvider.${id}.authMode`
}

export function CloudProviderToggles() {
  const { actions } = useStore()
  const { prefs, loading, setPref } = usePrefs()

  function onToggle(id: string, enabled: boolean): void {
    // Nach dem Speichern neu scannen: der Main zieht den Toggle in den
    // Scan-Cache nach und invalidiert den Config-Scan (ipc-write-prefs).
    void setPref(prefKey(id), enabled).then(() => actions.reload())
  }

  function onAuthMode(id: string, mode: string): void {
    // WP-F7: Modus speichern und neu scannen — bei 'oauth' verschwindet die
    // Key-Karte zugunsten des neutralen OAuth-Hinweises, bei 'apiKey' gilt
    // wieder die Env-Key-Pruefung.
    void setPref(authModePrefKey(id), mode).then(() => actions.reload())
  }

  return (
    <section className="qs-cloud" aria-labelledby="qs-cloud-title">
      <div className="view-head">
        <div className="view-title">
          <h2 id="qs-cloud-title">Cloud-Anbieter · optional</h2>
          <p>
            Diese Auswahl zeigt mögliche Anbieter, keine erkannten Installationen. Schalte nur einen
            Anbieter ein, den du wirklich nutzt; erst dann prüft die App den Zugang.
          </p>
        </div>
      </div>
      <ul className="qs-list">
        {TOGGLES.map((toggle) => {
          const enabled = prefs[prefKey(toggle.id)] === true
          // Ungesetzt verhaelt sich wie 'apiKey' (bisheriges Verhalten).
          const authMode = prefs[authModePrefKey(toggle.id)] === 'oauth' ? 'oauth' : 'apiKey'
          return (
            <li key={toggle.id} className={'qs-row' + (enabled ? '' : ' qs-row--off')}>
              <label
                className="qs-toggle"
                title={enabled ? `${toggle.label} ist aktiviert` : `${toggle.label} ist ausgeschaltet`}
              >
                <input
                  type="checkbox"
                  checked={enabled}
                  disabled={loading}
                  onChange={() => onToggle(toggle.id, !enabled)}
                  aria-label={`${toggle.label} als genutzten Anbieter ein- oder ausschalten`}
                />
                <span className="qs-track" aria-hidden="true" />
              </label>
              <span className="qs-ic" aria-hidden="true">{Icon.plug}</span>
              <div className="qs-meta">
                <div className="qs-name">{toggle.label}</div>
                <div className="qs-path">
                  {!enabled
                    ? 'Aus — kein Schlüssel nötig, keine Hinweise.'
                    : authMode === 'oauth'
                      ? 'Aktiviert — OAuth-Login im Tool, kein Schlüssel nötig.'
                      : `Aktiviert — die App prüft, ob ${toggle.envHint} gesetzt ist.`}
                </div>
              </div>
              {enabled && (
                <select
                  className="qs-auth-mode"
                  value={authMode}
                  disabled={loading}
                  onChange={(e) => onAuthMode(toggle.id, e.target.value)}
                  aria-label={`Zugangsart für ${toggle.label} wählen`}
                  title="Zugangsart: API-Key-Prüfung oder OAuth-Login im Tool"
                >
                  <option value="apiKey">API-Key</option>
                  <option value="oauth">OAuth-Login im Tool</option>
                </select>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
