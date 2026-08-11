import type { PrefValue } from '@shared/contract-write'
import { Icon } from '../../components/Icon'
import { effectiveRootPath, sameFolder, type RootFieldKey } from './root-field-help'

// RootRows — die drei Verzeichnis-Felder der Einstellungen (HR27-Split aus
// PrefsSection.tsx). Jedes Feld erklaert in Alltagssprache, wofuer es da ist,
// zeigt einen Beispielpfad und sagt, dass man es nur bei abweichendem Aufbau
// aendern muss. Zusaetzlich sichtbar: der tatsaechlich wirksame Pfad — die App
// normalisiert den gemeinsamen Ordner auf die darunterliegende `.claude`-Ebene,
// was vorher unsichtbar war und wie ein ignorierter Eintrag wirkte (F9).

interface RootField {
  key: RootFieldKey
  label: string
  optional?: boolean
  help: string
  beispiel: string
}

const ROOT_FIELDS: readonly RootField[] = [
  {
    key: 'roots.sharedClaude',
    label: 'Gemeinsamer Konfigurationsordner',
    optional: true,
    help: 'Ein Ordner, den mehrere Arbeitsbereiche zusammen nutzen. Viele Aufbauten haben so etwas nicht — leer lassen ist völlig normal und kein Fehler.',
    beispiel: '…\\Projekte\\.shared'
  },
  {
    key: 'roots.workspaceParent',
    label: 'Arbeitsbereich-Ordner',
    help: 'Der Ordner, in dem deine einzelnen Projektordner nebeneinander liegen.',
    beispiel: '…\\Projekte'
  },
  {
    key: 'roots.projectRoot',
    label: 'RaWaLLMConfig-Ordner',
    help: 'Der Ordner dieser App selbst.',
    beispiel: '…\\Projekte\\RaWaLLMConfig'
  }
]

interface RootRowsProps {
  prefs: Record<string, PrefValue>
  onSet(key: string, value: string): void
}

export function RootRows({ prefs, onSet }: RootRowsProps) {
  async function pick(key: string): Promise<void> {
    const result = await window.electronAPI?.pickFolder()
    if (result?.data) onSet(key, result.data)
  }
  const shared = String(prefs['roots.sharedClaude'] ?? '')
  const parent = String(prefs['roots.workspaceParent'] ?? '')
  const kollision = sameFolder(shared, parent)

  return (
    <div className="root-rows">
      <div className="tweak-label">Verzeichnisse</div>
      <p className="tweak-help">
        Nur ändern, wenn dein Aufbau von der Beschreibung abweicht. Änderungen gelten nach dem Neustart der App.
      </p>
      {ROOT_FIELDS.map((field) => (
        <RootRow
          key={field.key}
          field={field}
          value={String(prefs[field.key] ?? '')}
          warnung={field.key === 'roots.sharedClaude' && kollision}
          onPick={() => void pick(field.key)}
          onReset={() => onSet(field.key, '')}
        />
      ))}
    </div>
  )
}

interface RootRowProps {
  field: RootField
  value: string
  warnung: boolean
  onPick(): void
  onReset(): void
}

function RootRow({ field, value, warnung, onPick, onReset }: RootRowProps) {
  const wirksam = effectiveRootPath(field.key, value)
  return (
    <div className="root-row">
      <div className="root-row-main">
        <div className="tweak-label">
          {field.label}
          {field.optional && <span className="root-optional"> · optional</span>}
        </div>
        <p className="tweak-help">{field.help} Beispiel: <code>{field.beispiel}</code></p>
        <code className="backup-path">{value || (field.optional ? 'nicht gesetzt (normal)' : 'nicht konfiguriert')}</code>
        {wirksam && (
          <p className="root-effective">
            Wirksam verwendet die App: <code>{wirksam}</code>
          </p>
        )}
        {warnung && (
          <p className="root-warn">
            {Icon.warn}
            <span>
              Das ist vermutlich nicht gemeint — dieser Ordner ist derselbe wie der Arbeitsbereich-Ordner.
              Der gemeinsame Ordner ist ein eigener, geteilter Ordner. Im Zweifel leer lassen.
            </span>
          </p>
        )}
      </div>
      <div className="backup-actions">
        <button type="button" className="pill ghost" onClick={onPick}>{Icon.folder} Ordner wählen</button>
        {value && <button type="button" className="pill ghost" onClick={onReset}>Zurücksetzen</button>}
      </div>
    </div>
  )
}
