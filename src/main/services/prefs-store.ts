// prefs-store.ts — lokaler File-Adapter hinter dem PersistencePort fuer
// App-State/Prefs/Audit (F-Tweaks). Legt Prefs als JSON ab; Node-stdlib only.
// Schreiben backup-first (Pre-Snapshot via backup.ts) + atomar (tmp-Datei IM
// Zielverzeichnis, fsync, rename -> same-volume). Pfad injizierbar (Default real,
// Test=temp). PersistencePort ist async; Adapter-Auswahl in persistence-resolve.ts.
// Prefs sind UI-Settings (non-secret); secret-bearing Pfade kommen hier nie vor.
import {
  existsSync, mkdirSync, readFileSync, writeFileSync,
  renameSync, openSync, fsyncSync, closeSync
} from 'node:fs'
import { dirname } from 'node:path'
import type { PrefValue } from '@shared/contract-write'
import { exportSnapshot, DEFAULT_ARCHIVE_ROOT } from './backup'
import { appendAudit, makeAuditEntry, DEFAULT_AUDIT_PATH } from './audit-log'
import { prefsPath as resolvePrefsPath } from './app-paths'

export type PrefsMap = Record<string, PrefValue>

// Default-Prefs (Basic-Einstellungen): UI-Tweaks aus dem Token-System.
export const DEFAULT_PREFS: PrefsMap = {
  theme: 'hell',
  structure: 'retro',
  density: 'airy'
}

// Default-Prefs-Datei (Produktivlauf). In Tests immer via Option ueberschrieben.
export const DEFAULT_PREFS_PATH = resolvePrefsPath()

// Injizierbare Optionen (Test = temp).
export interface PrefsOptions {
  prefsPath: string
  archiveRoot: string
  auditPath: string
}

const DEFAULTS: PrefsOptions = {
  prefsPath: DEFAULT_PREFS_PATH,
  archiveRoot: DEFAULT_ARCHIVE_ROOT,
  auditPath: DEFAULT_AUDIT_PATH
}

// Stabiler Vertrag fuer JEDEN Persistenz-Adapter (File + MariaDB).
// Async: ipcMain.handle ist async, Renderer greift schon async via IPC zu.
// Korrekte Fehlerpropagierung statt stiller Sync-Quittung bei DB-Write-Fehler.
export interface PersistencePort {
  getAll(): Promise<PrefsMap>
  get(key: string): Promise<PrefValue | undefined>
  set(key: string, value: PrefValue): Promise<PrefsSetOutcome>
}

export interface PrefsSetOutcome {
  ok: boolean
  error: string | null
  backupPath: string | null
}

// Atomarer JSON-Write: tmp IM Zielverzeichnis, fsync, rename (same-volume).
function atomicWriteJson(targetPath: string, data: PrefsMap): void {
  mkdirSync(dirname(targetPath), { recursive: true })
  const tmp = `${targetPath}.tmp-${process.pid}`
  writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8')
  const fd = openSync(tmp, 'r+')
  try { fsyncSync(fd) } finally { closeSync(fd) }
  renameSync(tmp, targetPath)
}

// Prefs einlesen; fehlende/kaputte Datei -> Defaults (graceful, kein Crash).
function readPrefs(prefsPath: string): PrefsMap {
  try {
    if (!existsSync(prefsPath)) return { ...DEFAULT_PREFS }
    const parsed = JSON.parse(readFileSync(prefsPath, 'utf8')) as PrefsMap
    return { ...DEFAULT_PREFS, ...parsed }
  } catch {
    return { ...DEFAULT_PREFS }
  }
}

// Lokaler File-Adapter (PersistencePort). Pfad injizierbar.
// Sync-Logik in async gewrappt — kein I/O-Umbau noetig (prefs.json klein).
export function createFilePrefsStore(partial?: Partial<PrefsOptions>): PersistencePort {
  const opts: PrefsOptions = { ...DEFAULTS, ...partial }
  return {
    async getAll(): Promise<PrefsMap> {
      return readPrefs(opts.prefsPath)
    },
    async get(key: string): Promise<PrefValue | undefined> {
      return readPrefs(opts.prefsPath)[key]
    },
    async set(key: string, value: PrefValue): Promise<PrefsSetOutcome> {
      try {
        // backup-first: existierende Prefs-Datei vor dem Overwrite sichern.
        let backupPath: string | null = null
        if (existsSync(opts.prefsPath)) {
          const snap = exportSnapshot(opts.prefsPath, opts.archiveRoot)
          if (snap.error) return { ok: false, error: snap.error, backupPath: null }
          backupPath = snap.data?.snapshotPath || null
        }
        const next = readPrefs(opts.prefsPath)
        next[key] = value
        atomicWriteJson(opts.prefsPath, next)
        // Audit NACH erfolgreichem Write — nur Pfad-NAME/Status (Prefs sind
        // non-secret, aber konsistent mit den uebrigen Schreib-Aufrufern).
        appendAudit(makeAuditEntry('prefs-set', opts.prefsPath, 'ok'), opts.auditPath)
        return { ok: true, error: null, backupPath }
      } catch (err) {
        console.error('[prefs]', err instanceof Error ? err.message : 'prefs-set-failed')
        return { ok: false, error: 'prefs-set-failed', backupPath: null }
      }
    }
  }
}

// Default-Instanz (Produktivlauf). Tests nutzen createFilePrefsStore({prefsPath:temp}).
export const prefsStore: PersistencePort = createFilePrefsStore()

export {
  getPrefsStoreInfo,
  hasMariadbEnv,
  resolvePrefsStore,
  setPrefsStoreInfo,
  type PrefsStoreInfo
} from './persistence-resolve'
