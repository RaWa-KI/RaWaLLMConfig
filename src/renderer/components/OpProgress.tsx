import { useEffect, useState } from 'react'
import type { IntegrityApplyPhase, IntegrityApplyProgressPayload } from '@shared/contract-integrity'
import './OpProgress.css'

// OpProgress — Fortschrittsbalken beim Speichern einer Ordner-/Verschiebe-
// Operation. Zeigt waehrend eines laufenden Apply echte Zahlen statt nur
// „Arbeitet …" (Owner-Wunsch nach der 2-Minuten-Speicherdauer).
// Sichtbare Texte bleiben Alltagssprache — keine Fachbegriffe aus dem Plan.
// Ist die Gesamtzahl (noch) unbekannt, laeuft ein unbestimmter Balken statt
// falscher Prozentzahlen.

interface OpProgressProps {
  // True, solange die Operation laeuft (Busy-Zustand des Confirm-Flows).
  active: boolean
  // operationIds der laufenden Plaene; fremde Meldungen werden ignoriert.
  operationIds: string[]
}

// Phasen in Alltagssprache. Reihenfolge entspricht dem Ablauf im Hintergrund.
const PHASE_TEXT: Record<IntegrityApplyPhase, string> = {
  snapshot: 'Sicherung anlegen',
  fs: 'Dateien verschieben',
  references: 'Verweise aktualisieren',
  verify: 'Prüfen'
}

export function OpProgress({ active, operationIds }: OpProgressProps) {
  const progress = useApplyProgress(active, operationIds)
  if (!active) return null

  const total = progress?.total ?? 0
  const done = progress?.done ?? 0
  const unknown = !progress || total <= 0
  const percent = unknown ? 0 : Math.min(100, Math.round((done / total) * 100))
  const detail = detailText(progress, unknown)

  return (
    <div className="op-progress">
      <div className="op-progress-copy">
        <strong>Speichert …</strong>
        <span aria-live="polite">{detail}</span>
      </div>
      <div
        className="op-progress-track"
        role="progressbar"
        aria-label="Fortschritt beim Speichern"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={unknown ? undefined : percent}
        aria-valuetext={detail}
      >
        <span
          className={unknown ? 'op-progress-bar unknown' : 'op-progress-bar'}
          style={unknown ? undefined : { width: `${Math.max(3, percent)}%` }}
        />
      </div>
      <p className="op-progress-note">Bitte das Fenster offen lassen, bis der Vorgang fertig ist.</p>
    </div>
  )
}

// Textzeile: Phase + Zaehler. Ohne bekannte Gesamtzahl bleibt es bei der Phase.
function detailText(p: IntegrityApplyProgressPayload | null, unknown: boolean): string {
  if (!p) return 'Vorgang wird vorbereitet …'
  const phase = PHASE_TEXT[p.phase]
  if (unknown) return `${phase} …`
  const einheit = p.phase === 'fs' ? 'Schritten' : 'Dateien'
  return `${phase} … ${p.done} von ${p.total} ${einheit}`
}

/**
 * Abo auf den Apply-Fortschritt, gefiltert auf die eigenen operationIds.
 * Meldet sich beim Ende der Operation wieder ab und setzt den Stand zurueck,
 * damit ein zweiter Durchlauf nicht mit alten Zahlen startet.
 */
function useApplyProgress(
  active: boolean,
  operationIds: string[]
): IntegrityApplyProgressPayload | null {
  const [progress, setProgress] = useState<IntegrityApplyProgressPayload | null>(null)
  const idKey = operationIds.join('|')

  useEffect(() => {
    if (!active) {
      setProgress(null)
      return
    }
    const subscribe = window.electronAPI?.onIntegrityApplyProgress
    if (!subscribe) return
    const wanted = new Set(idKey ? idKey.split('|') : [])
    return subscribe((p) => {
      // Ohne bekannte operationId (erster Klick) alles annehmen, sonst filtern.
      if (wanted.size > 0 && !wanted.has(p.operationId)) return
      setProgress(p)
    })
  }, [active, idKey])

  return progress
}
