import type { PrefValue } from '@shared/contract-write'
import { Icon } from '../../components/Icon'
import { effectiveRootPath, sameFolder, type RootFieldKey } from './root-field-help'

// RootRows — die drei konfigurierbaren Grundordner. Sie erscheinen ausschliesslich
// im Tab „Ordner“, gemeinsam mit weiteren Konfigurations- und Modellordnern.

interface RootField {
  key: RootFieldKey
  label: string
  optional?: boolean
  help: string
  expectation: string
}

const ROOT_FIELDS: readonly RootField[] = [
  {
    key: 'roots.sharedClaude',
    label: 'Gemeinsamer Konfigurationsordner',
    optional: true,
    help: 'Nutze ihn nur, wenn mehrere Projekte bewusst gemeinsame Einstellungen verwenden. Ohne diesen Ordner arbeitet die App ganz normal weiter.',
    expectation: 'Erwartet werden gemeinsame Einstellungsdateien. Leer lassen ist normal und löst keine Warnung aus.'
  },
  {
    key: 'roots.workspaceParent',
    label: 'Projektübersicht-Ordner',
    help: 'Nutze ihn nur, wenn du mehrere Projekte in einem übergeordneten Ordner verwaltest.',
    expectation: 'Erwartet werden einzelne Projektordner. Leer lassen, wenn du keine gemeinsame Projektübersicht brauchst.'
  },
  {
    key: 'roots.projectRoot',
    label: 'App-Ordner',
    help: 'Dieser Eintrag ist nur für eine abweichende Installation der App gedacht.',
    expectation: 'Erwartet werden die Dateien dieser App. Leer lassen, wenn die App normal startet.'
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
      <div className="tweak-label">Grundordner</div>
      <p className="tweak-help">
        Diese drei Angaben sind selten nötig. Ändere sie nur, wenn dein Aufbau davon abweicht; die Änderung gilt nach einem Neustart.
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
        <p className="tweak-help">{field.help}</p>
        <p className="tweak-help">{field.expectation}</p>
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
