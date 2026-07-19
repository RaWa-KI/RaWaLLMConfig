// In-Memory-Ringpuffer der letzten Renderer-Fehler (max 50 Eintraege) fuer den
// optionalen "Debug-Logs mitsenden"-Anhang des Online-Fehlerberichts (D055).
// Die App schreibt bewusst keine Log-Datei — dieser Puffer ist die einzige,
// fluechtige Quelle und lebt nur fuer die Dauer der Fenster-Session.
// Es werden ausschliesslich Klartext-Meldungen abgelegt (secret-frei, Pfade
// werden beim Senden im Contract sanitiert) — nie Objekt-Dumps oder Stacks.

const MAX_ENTRIES = 50

export interface ErrorLogEntry {
  ts: string
  kind: string
  message: string
}

const entries: ErrorLogEntry[] = []

export function pushErrorLog(kind: string, message: unknown): void {
  const text = typeof message === 'string' ? message : String(message)
  entries.push({ ts: new Date().toISOString(), kind, message: text.slice(0, 500) })
  if (entries.length > MAX_ENTRIES) entries.splice(0, entries.length - MAX_ENTRIES)
}

export function getRecentErrorLogsJson(): string {
  return JSON.stringify(entries.slice(-MAX_ENTRIES), null, 2)
}
