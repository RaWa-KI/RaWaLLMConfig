import type { ConfigEntry } from '@shared/contract'
import { Icon } from './Icon'
import { useStore } from '../state/store'

interface ConflictCopy {
  title: string
  meaning: string
  keep: string
  add: string
  archive: string
}

interface ConflictResolutionProps {
  entry: ConfigEntry
  onEdit?: () => void
  onCompare(): void
}

function copyFor(reason: string): ConflictCopy {
  if (/Plugin-Ordner.*MCP-Register/i.test(reason)) {
    return {
      title: 'Dieser Plugin-Ordner ist nicht als MCP-Server eingetragen.',
      meaning: 'Die Dateien sind vorhanden, aber es fehlt ein passender Start-Eintrag. Darum ist unklar, ob der Ordner nur Material ist oder als MCP-Server laufen soll.',
      keep: 'Wenn er nur Material ist: bewusst so lassen oder mit „Verschieben“ an den passenden Ort legen.',
      add: 'Wenn er laufen soll: mit „Hinzufügen“ eine passende MCP-Definition im Plugin-Ordner anlegen.',
      archive: 'Wenn er veraltet ist: mit „Archivieren“ sichern. Dabei wird nichts ersatzlos gelöscht.'
    }
  }
  if (/MCP-Register.*Plugin-Ordner/i.test(reason)) {
    return {
      title: 'Ein MCP-Server ist eingetragen, aber die Plugin-Dateien fehlen.',
      meaning: 'Die App findet den Start-Eintrag, aber keinen passenden Ordner dazu. Dadurch kann der Server nicht sauber geprüft oder gestartet werden.',
      keep: 'Wenn der Eintrag richtig ist: die fehlenden Plugin-Dateien ergänzen.',
      add: 'Wenn der Ordner nur verschoben wurde: mit „Verschieben“ den Pfad korrigieren.',
      archive: 'Wenn der Eintrag alt ist: archivieren oder durch die richtige Datei ersetzen.'
    }
  }
  if (/json|parse/i.test(reason)) {
    return {
      title: 'Eine Konfigurationsdatei kann nicht sicher gelesen werden.',
      meaning: 'Meist fehlt ein Komma, eine Klammer oder ein Anführungszeichen. Bis das korrigiert ist, kann die App den Inhalt nicht verlässlich einordnen.',
      keep: 'Im Reiter „Konfiguration“ zuerst den betroffenen Inhalt ansehen.',
      add: 'Mit „Bearbeiten“ die Schreibansicht öffnen und die Datei korrigieren.',
      archive: 'Wenn die Datei alt ist: archivieren und danach neu prüfen.'
    }
  }
  return {
    title: 'Zwei Stellen sagen nicht dasselbe.',
    meaning: 'Die App hat denselben Bereich an mehreren Orten gefunden, aber die Angaben passen nicht zusammen.',
    keep: 'Entscheide, welche Stelle gelten soll, und gleiche die andere danach an.',
    add: 'Fehlende Datei oder fehlenden Eintrag mit „Hinzufügen“ ergänzen.',
    archive: 'Alten Bestand mit „Archivieren“ sichern, wenn er nicht mehr gebraucht wird.'
  }
}

export function ConflictResolution({ entry, onEdit, onCompare }: ConflictResolutionProps) {
  const { ui } = useStore()
  if (entry.status !== 'conflict' || !entry.conflictReason) return null
  const copy = copyFor(entry.conflictReason)
  return (
    <section className="conflict-guide" aria-label="Konflikt lösen">
      <div className="conflict-guide-head">
        <span className="conflict-guide-ic">{Icon.warn}</span>
        <div>
          <div className="sec-label">Konflikt lösen</div>
          <h4>{copy.title}</h4>
        </div>
      </div>
      <p>{copy.meaning}</p>
      {ui.displayMode === 'expert' && (
        <div className="conflict-guide-reason">
          <b>Technischer Grund:</b> {entry.conflictReason}
        </div>
      )}
      <div className="conflict-guide-actions">
        <button type="button" className="btn-ghost conflict-edit-btn" onClick={onCompare}>
          {Icon.diff}
          <span>Unterschiede ansehen</span>
        </button>
        {onEdit && (
          <button type="button" className="btn-ghost conflict-edit-btn" onClick={onEdit}>
            {Icon.edit}
            <span>Bearbeiten öffnen</span>
          </button>
        )}
        <span>Danach passenden Weg wählen:</span>
      </div>
      <div className="conflict-guide-options">
        <div>
          <b>Behalten</b>
          <p>{copy.keep}</p>
        </div>
        <div>
          <b>Ergänzen</b>
          <p>{copy.add}</p>
        </div>
        <div>
          <b>Aufräumen</b>
          <p>{copy.archive}</p>
        </div>
      </div>
    </section>
  )
}
