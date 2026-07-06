// ipc-list.ts — Self-registering Handler fuer die read-only Innendatei-Liste
// (config:listDir). Liefert pro Datei NUR Name/Groesse/secret-Flag, NIE Inhalt.
// Scope-Confinement: dirPath muss innerhalb der bekannten Config-Wurzeln liegen
// (assertInScope + configRootList) — sonst verstaendliche Ablehnung. Rekursiv mit
// hartem Datei-Cap (truncated). Keine Symlink-Folge ausserhalb des Roots:
// lstat ueberspringt Symlinks (keine Aufloesung). Nur ipcMain.handle, kein .on.
// Muster: ipc-write-rename.ts (self-registering, sanitisierte IpcResult-Antwort).
import { ipcMain } from 'electron'
import { lstatSync, readdirSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { IPC } from '@shared/channels'
import type { IpcResult, ListDirData, ListDirFile, ListDirRequest } from '@shared/contract'
import { assertInScope } from './services/path-scope'
import { configRootList } from './services/config-roots'
import { isSecretPathForRead } from './services/secret-guard'

// Harte Sicherheitsgrenze: nach so vielen Dateien wird abgebrochen (truncated).
const FILE_CAP = 200

// Verstaendliche Ablehnungsgruende (sichtbar im UI, kein Secret/Pfad-Leak).
const REASON_INVALID = 'invalid-request'
const REASON_OUT_OF_SCOPE = 'Ordner liegt ausserhalb der bekannten Config-Bereiche'
const REASON_NOT_DIR = 'Pfad ist kein Ordner'
const REASON_NOT_FOUND = 'Ordner nicht gefunden'
const REASON_FAIL = 'Innendatei-Liste fehlgeschlagen'

// Ein Eintrag in eine sammelnde Liste haengen (secret-Flag via Read-Guard).
function pushFile(out: ListDirFile[], absPath: string, rel: string, size: number): void {
  out.push({
    rel: rel.replace(/\\/g, '/'),
    name: rel.split(/[\\/]/).pop() ?? rel,
    size,
    secret: isSecretPathForRead(absPath)
  })
}

// Rekursiver Walk ab `dir`. `base` bleibt die Ausgangs-Wurzel fuer rel-Pfade.
// lstatSync (KEINE Symlink-Aufloesung) -> Symlinks werden uebersprungen, damit
// kein Pfad ausserhalb der Wurzel gefolgt wird. Bricht bei FILE_CAP ab.
function walk(dir: string, base: string, out: ListDirFile[]): boolean {
  let names: string[]
  try {
    names = readdirSync(dir)
  } catch {
    return false // nicht-lesbarer Unterordner -> still ueberspringen
  }
  for (const n of names) {
    if (out.length >= FILE_CAP) return true // truncated
    const abs = join(dir, n)
    let st: ReturnType<typeof lstatSync>
    try {
      st = lstatSync(abs)
    } catch {
      continue
    }
    if (st.isSymbolicLink()) continue // nie folgen (Scope-Schutz)
    if (st.isDirectory()) {
      if (walk(abs, base, out)) return true
    } else if (st.isFile()) {
      pushFile(out, abs, relative(base, abs), st.size)
    }
  }
  return false
}

// Handler: Innendatei-Liste fuer einen Ordner unter den Config-Wurzeln.
function handleListDir(req: ListDirRequest): IpcResult<ListDirData> {
  if (!req || typeof req.dirPath !== 'string' || !req.dirPath) {
    return { data: null, error: REASON_INVALID }
  }
  const dirPath = resolve(req.dirPath)
  if (!assertInScope(dirPath, configRootList()).writable) {
    return { data: null, error: REASON_OUT_OF_SCOPE }
  }
  let st: ReturnType<typeof lstatSync>
  try {
    st = lstatSync(dirPath)
  } catch {
    return { data: null, error: REASON_NOT_FOUND }
  }
  if (!st.isDirectory()) {
    return { data: null, error: REASON_NOT_DIR }
  }
  const files: ListDirFile[] = []
  const truncated = walk(dirPath, dirPath, files)
  return { data: truncated ? { files, truncated: true } : { files }, error: null }
}

/**
 * config:listDir-Handler registrieren (self-registering, read-only). Genau EINMAL
 * aufrufen (via registerWrite() in register-write.ts). Kein zweiter handle auf
 * denselben Kanal (sonst Electron-Crash). Faesst nur seinen eigenen Kanal an.
 */
export function registerListIpc(): void {
  ipcMain.handle(
    IPC.configListDir,
    (_e, req: ListDirRequest): IpcResult<ListDirData> => {
      try {
        return handleListDir(req)
      } catch (err) {
        console.error('[ipc-list]', err instanceof Error ? err.message : 'fail')
        return { data: null, error: REASON_FAIL }
      }
    }
  )
}
