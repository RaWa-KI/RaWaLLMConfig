// ipc-integrity-progress.ts — Fortschritts-Kanal der Integrity-Transaktion.
// Main -> Renderer (event.sender.send), damit die UI waehrend eines langen
// Speicher-Vorgangs echte Zahlen statt nur „Arbeitet …" zeigt. Der Callback
// geht IMMER nur an das Fenster, das den Apply angestossen hat (kein Broadcast).
// Traegt NIE Datei-Inhalte oder Secret-Werte — nur Phase, Zaehler, operationId.
import type { IpcMainInvokeEvent } from 'electron'
import { IPC_INTEGRITY_EVENTS } from '@shared/channels-write'
import type { IntegrityApplyProgressPayload } from '@shared/contract-integrity'

/**
 * Baut den onProgress-Callback fuer applyIntegrity. Ist das Fenster bereits weg,
 * wird still verworfen — Fortschritt ist Anzeige, nie transaktionsrelevant.
 */
export function integrityProgressSender(
  event: IpcMainInvokeEvent
): (p: IntegrityApplyProgressPayload) => void {
  return (payload) => {
    if (event.sender.isDestroyed()) return
    event.sender.send(IPC_INTEGRITY_EVENTS.applyProgress, payload)
  }
}
