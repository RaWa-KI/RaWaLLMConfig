// read-full-error-text.ts — EINE owner-lesbare Uebersetzung der readFull-Fehler
// fuer alle Renderer-Konsumenten (Reiter "Konfiguration" via use-config-tab,
// Reiter "Detail & Edit" via EditForm/OverviewEditor).
//
// Vorher gab es zwei Wahrheiten: use-config-tab.ts mappte die distinkten
// Backend-Codes, die beiden Editoren kollabierten sie zu einem nackten Satz.
// Dieses Modul ist die einzige Quelle; Text = Zwei-Stufen-Muster Stufe 1
// (sichtbar, verstaendlich, mit Handlungshinweis, App bleibt nutzbar).
//
// Fehlercodes kommen aus src/main/services/read-full.ts (readFullCore):
//   invalid-request | nicht-gefunden | ordner | zu-gross:<Groesse> | nicht-lesbar
// Dazu die Renderer-/Guard-Faelle aus use-fetch-full.ts bzw. secret-guard.ts.

/** Guard-Code des Secret-Schutzes (secret-guard.ts SECRET_DENY_REASON). */
export const READ_FULL_GUARD_ERROR = 'owner-only/not-in-scope'

/**
 * Sonderfall-Erkennung: Der Secret-Guard ist KEIN Ladefehler, sondern eine
 * bewusste Schutzentscheidung. Die Editoren zeigen ihn eigenstaendig an, damit
 * die Guard-Meldung nicht in der allgemeinen Fehlerausgabe untergeht.
 */
export function isReadFullGuardError(err: string | null | undefined): boolean {
  return err === READ_FULL_GUARD_ERROR
}

/** Text zum Guard-Sonderfall (unveraenderte Kernaussage plus Handlungshinweis). */
export const READ_FULL_GUARD_TEXT =
  'Nur für Eigentümer / nicht im Bearbeitungsumfang (Secret-Pfad). ' +
  'Diese Datei bleibt hier gesperrt — ändern Sie sie bei Bedarf außerhalb der App.'

/** Auffangtext, wenn der Grund unbekannt ist (Stufe 1, nie leer). */
export const READ_FULL_FALLBACK_TEXT =
  'Der Inhalt konnte nicht geladen werden. ' +
  'Bitte die Ansicht neu einlesen oder die Datei in einem externen Editor öffnen.'

// Feste Codes -> Text. `zu-gross` wird separat behandelt (Groesse im Code).
const TEXTS: Record<string, string> = {
  'nicht-gefunden':
    'Die Datei gibt es an diesem Ort nicht mehr. ' +
    'Bitte die Ansicht neu einlesen oder prüfen, ob die Datei verschoben wurde.',
  ordner:
    'Dieser Eintrag ist ein Ordner, keine Datei. ' +
    'Bitte eine Datei innerhalb des Ordners auswählen.',
  'nicht-lesbar':
    'Die Datei konnte nicht gelesen werden — das System hat den Zugriff verweigert. ' +
    'Bitte die Datei in anderen Programmen schließen und die Freigabe prüfen.',
  'invalid-request':
    'Für diesen Eintrag ist kein Dateipfad hinterlegt. ' +
    'Bitte die Quelle ergänzen oder die Ansicht neu einlesen.',
  'Bridge nicht verfügbar':
    'Die App-Verbindung steht gerade nicht bereit. ' +
    'Bitte das Fenster neu laden und es noch einmal versuchen.',
  'Lesen fehlgeschlagen': READ_FULL_FALLBACK_TEXT,
}

// zu-gross:<Groesse> — Groesse gehoert sichtbar in den Text, damit der Nutzer
// versteht, warum die Datei nicht angezeigt wird (Grenze: 2 MB, read-full.ts).
function tooBigText(err: string): string {
  const size = err.slice('zu-gross:'.length).trim()
  const wieGross = size && size !== '—' ? ` (${size})` : ''
  return (
    `Die Datei ist zu groß für die Anzeige${wieGross}. ` +
    'Angezeigt werden Dateien bis 2 MB — bitte in einem externen Editor öffnen.'
  )
}

/**
 * Mappt einen readFull-Fehler auf owner-lesbaren Text mit Handlungshinweis.
 * Der Guard-Sonderfall wird bewusst mit beantwortet, damit kein Aufrufer ihn
 * versehentlich als generischen Ladefehler ausgibt.
 */
export function readFullErrText(err: string | null | undefined): string {
  if (!err) return READ_FULL_FALLBACK_TEXT
  if (isReadFullGuardError(err)) return READ_FULL_GUARD_TEXT
  if (err.startsWith('zu-gross:')) return tooBigText(err)
  if (err === 'zu-gross') return tooBigText('zu-gross:')
  return TEXTS[err] ?? READ_FULL_FALLBACK_TEXT
}
