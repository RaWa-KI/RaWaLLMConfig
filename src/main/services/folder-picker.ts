// folder-picker.ts — duenne Kapsel um den Electron-Ordner-Dialog (WP-C2).
// Liefert AUSSCHLIESSLICH einen absoluten Ordner-Pfad zurueck (nie Inhalt,
// kein fs-Touch) — passend zu contract-sources.ts (eine Quelle ist nur Pfad +
// Provider-Zuordnung, NIE ein Secret-Wert). Abbruch des Nutzers => null statt
// Throw, damit der Aufrufer (IPC `safe`-Wrapper) kein Fehlerergebnis erzeugt.
import { dialog } from 'electron'

// Test-Injektion: erlaubt im Spec einen Fake-Dialog ohne echtes Electron-Fenster.
// Default = der echte dialog.showOpenDialog.
export interface PickFolderOptions {
  showDialog?: typeof dialog.showOpenDialog
}

/**
 * Oeffnet den nativen Ordner-Picker (nur Verzeichnis-Auswahl) und gibt den
 * gewaehlten absoluten Ordner-Pfad zurueck. Bei Abbruch ODER leerer Auswahl
 * => null (kein Throw, kein Pfad-Leak). Es wird nur der Pfad geliefert — der
 * Ordner-Inhalt wird hier NICHT gelesen.
 */
export async function pickFolder(opts?: PickFolderOptions): Promise<string | null> {
  const showDialog = opts?.showDialog ?? dialog.showOpenDialog
  const result = await showDialog({ properties: ['openDirectory'] })
  if (result.canceled || result.filePaths.length === 0) return null
  return result.filePaths[0]
}
