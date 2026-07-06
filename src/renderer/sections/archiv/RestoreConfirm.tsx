import { useMemo, useState } from 'react'
import type { ArchiveBackupEntry } from '@shared/contract-archive'
import type { AppData } from '@shared/contract'
import { Icon } from '../../components/Icon'
import { PathPicker } from '../config/PathPicker'
import { useStore } from '../../state/store'
import { isAbsolutePath, ensureFileTarget, endsOnFolder, lastSegment } from '../config/move-target'

// Restore-Confirm-Dialog (Owner-Confirm + Zielpfad-Wahl). Zeigt den Original-
// Basename des Backups und schlaegt aus der bekannten Config (config.data) reale
// Zielpfade vor: bevorzugt der Original-Quellpfad aus dem .origin-Sidecar
// (entry.originalPath), sonst alle Eintraege mit gleichem Basename. Freitext
// bleibt erlaubt. Quotes/Whitespace werden getrimmt; ein Ordner-Ziel wird um den
// Dateinamen ergaenzt (Datenverlust-Schutz). Der Restore selbst (gated, backup-
// first) laeuft im Main; hier nur Bestaetigung. Modal-Huelle analog ImportTargetDialog.

interface RestoreConfirmProps {
  entry: ArchiveBackupEntry
  busy: boolean
  onConfirm(toPath: string): void
  onCancel(): void
}

// Whitespace + umschliessende Anfuehrungszeichen (" ') entfernen. Owner kopieren
// Pfade oft mit Quotes aus Explorer/Terminal — die wuerden isAbsolutePath brechen.
function stripQuotes(p: string): string {
  return p.trim().replace(/^["']+|["']+$/g, '').trim()
}

// Reale Restore-Ziel-Vorschlaege aus der bekannten Config ableiten (reine Funktion).
// 1) entry.originalPath (aus .origin-Sidecar) immer als ERSTER Vorschlag, falls
//    gesetzt. 2) Danach alle config.data-Eintraege, deren Basename === originalName
//    (separator-robust via lastSegment). Dedupliziert, Sidecar-Pfad zuerst. Liefert
//    nur sichtbare Pfade (nie Secret-Werte) — config.data ist die Wahrheit fuer
//    "bekannte Config-Datei", kein FS-Read im Renderer noetig.
export function suggestRestoreTargets(
  data: AppData | null,
  originalName: string,
  originalPath?: string
): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  const push = (p: string): void => {
    if (p && !seen.has(p)) { seen.add(p); out.push(p) }
  }
  if (originalPath) push(originalPath)
  for (const fam of Object.values(data?.data ?? {})) {
    for (const cat of fam.categories ?? []) {
      for (const e of cat.entries ?? []) {
        if (lastSegment(e.path) === originalName) push(e.path)
      }
    }
  }
  return out
}

export function RestoreConfirm({ entry, busy, onConfirm, onCancel }: RestoreConfirmProps) {
  const { config } = useStore()
  // Vorschlaege + Default-Vorbelegung aus der bekannten Config (Basename-Match
  // bzw. Sidecar-Pfad). Genau ein Treffer -> direkt vorbelegen.
  const suggestions = useMemo(
    () => suggestRestoreTargets(config.data, entry.originalName, entry.originalPath),
    [config.data, entry.originalName, entry.originalPath]
  )
  const [toPath, setToPath] = useState(() => suggestions[0] ?? '')

  const norm = stripQuotes(toPath)
  const ready = isAbsolutePath(norm)
  // Ordner-Warnung: zeigt der (normalisierte) Pfad auf einen Ordner statt auf die
  // Datei? knownFolders leer -> nur trailing-Separator-/Endungs-Heuristik greift.
  const onFolder = ready && endsOnFolder(norm, entry.originalName, new Set<string>())

  function confirm(): void {
    const p = stripQuotes(toPath)
    if (!isAbsolutePath(p) || busy) return
    // Ordner-Ziel -> Dateiname erzwingen (Datenverlust-Schutz), dann bestaetigen.
    onConfirm(ensureFileTarget(p, entry.originalName, 'Datei', new Set<string>()))
  }

  return (
    <div className="rc-back" onClick={onCancel}>
      <div className="rc-card" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="rc-head">
          <span className="rc-ic">{Icon.snap}</span>
          <h3>Wiederherstellen</h3>
        </div>
        <p className="rc-detail">
          Backup <b>{entry.originalName}</b> ({entry.dayTag}
          {entry.stamp ? ` · ${new Date(entry.stamp).toLocaleTimeString('de-DE', { hour12: false })}` : ''})
          auf einen Zielpfad zurückspielen. Existiert die Zieldatei, wird vorher automatisch ein
          neues Backup angelegt (backup-first, HR7) — nichts geht verloren.
        </p>

        <label className="rc-label" htmlFor="rc-to">Zielpfad (absolut)</label>
        <PathPicker
          value={toPath}
          onChange={setToPath}
          onSelect={setToPath}
          options={suggestions}
          placeholder={`Absoluter Zielpfad für ${entry.originalName}`}
          onSubmit={confirm}
        />
        {suggestions.length > 0 && (
          <p className="rc-hint">
            {Icon.check}
            <span>
              {suggestions.length === 1
                ? 'Bekannter Config-Pfad vorbelegt (aus config.data).'
                : `${suggestions.length} bekannte Pfade gefunden — Vorschlag wählen oder Pfad eingeben.`}
            </span>
          </p>
        )}
        {toPath.trim() && !ready && (
          <p className="rc-hint">
            {Icon.warn}
            <span>Bitte einen absoluten Pfad angeben (z. B. C:\\… oder /…).</span>
          </p>
        )}
        {onFolder && (
          <p className="rc-hint">
            {Icon.warn}
            <span>Pfad zeigt auf einen Ordner — Dateiname <b>{entry.originalName}</b> wird ergänzt.</span>
          </p>
        )}

        <div className="rc-actions">
          <button type="button" className="btn-ghost" onClick={onCancel} disabled={busy}>
            Abbrechen
          </button>
          <button type="button" className="btn rc-go" onClick={confirm} disabled={!ready || busy}>
            {Icon.refresh}
            {busy ? 'Stelle wieder her …' : 'Wiederherstellen'}
          </button>
        </div>
      </div>
    </div>
  )
}
