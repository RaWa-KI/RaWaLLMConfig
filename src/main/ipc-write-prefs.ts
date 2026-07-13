// ipc-write-prefs.ts — SELF-REGISTERING Prefs-/Explain-IPC (Teil D). Registriert
// `prefs:get`/`prefs:set`/`config:explain` via ipcMain.handle. `set` schreibt NUR
// ueber prefs-store (backup-first + atomar) — KEIN direkter fs-Write im Handler.
// Antworten sind sanitisiert (IpcResult ohne Pfad-Stack/Secret). Eigene Datei:
// A's ipc-write.ts wird NICHT angefasst. Der Aufruf von registerPrefsWrite()
// erfolgt in Welle 3 (Hub WP-INT-02). Nur `handle`, kein `on`.
import { ipcMain } from 'electron'
import { IPC_WRITE } from '@shared/channels-write'
import type {
  PrefsGetRequest, PrefsGetResult,
  PrefsSetRequest, PrefsSetResult,
  ExplainRequest, ExplainResult, PrefValue
} from '@shared/contract-write'
import { join } from 'node:path'
import {
  resolvePrefsStore, createFilePrefsStore, DEFAULT_PREFS_PATH,
  getPrefsStoreInfo, setPrefsStoreInfo, type PersistencePort
} from './services/prefs-store'
import { appendAudit, makeAuditEntry } from './services/audit-log'
import { explain } from './services/explain'
import { isWriteEnabled, getWriteContext } from './services/write-mode'
import { WRITE_DISABLED_REASON } from './ipc-write'
import { guardedAsync } from './lib/guarded'
import { setRootPrefsProvider } from './services/config-roots'

// Schreib-Store passend zum write-context bauen: im Sandbox-Modus liegen prefs.json
// + Archiv unter dem Sandbox-Root (Mutation confined), sonst resolved Singleton-Store.
// Singleton-Aufloesung (resolvePrefsStore) erfolgt EINMAL beim Start via initPrefsStore().
let _activeStore: PersistencePort | null = null
let _rootPrefs: Record<string, PrefValue> = {}

function refreshRootPrefs(all: Record<string, PrefValue>): void { _rootPrefs = all }

// Einmalige Initialisierung beim App-Start (in registerPrefsWrite aufrufen).
// Faellt auf File-Adapter zurueck wenn MariaDB nicht erreichbar.
export async function initPrefsStore(): Promise<void> {
  const ctx = getWriteContext()
  if (ctx.sandboxRoot) {
    // Sandbox-Modus: immer File-Adapter mit Sandbox-Pfad.
    const prefsPath = join(ctx.sandboxRoot, 'prefs.json')
    _activeStore = createFilePrefsStore({ prefsPath, archiveRoot: ctx.archiveRoot, auditPath: ctx.auditPath })
    setPrefsStoreInfo({ adapter: 'file', fallbackReason: null })
  } else {
    _activeStore = await resolvePrefsStore()
  }
  refreshRootPrefs(await _activeStore.getAll())
  setRootPrefsProvider(() => _rootPrefs)
}

function getActiveStore(): PersistencePort {
  if (!_activeStore) {
    // Fallback: File-Adapter mit Default-Pfad (sollte nach initPrefsStore nie eintreten).
    _activeStore = createFilePrefsStore({ prefsPath: DEFAULT_PREFS_PATH })
    setPrefsStoreInfo({ adapter: 'file', fallbackReason: null })
  }
  return _activeStore
}

// prefs:get — alle Prefs oder einen Schluessel lesen (non-secret UI-Settings).
// IMMER erlaubt (read). Im Sandbox-Modus aus demselben Store lesen wie set.
async function handlePrefsGet(req?: PrefsGetRequest): Promise<PrefsGetResult> {
  const store = getActiveStore()
  const info = getPrefsStoreInfo()
  let all
  try {
    all = await store.getAll()
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Prefs nicht lesbar'
    return { data: null, error: msg }
  }
  if (req && typeof req.key === 'string' && req.key) {
    const v = all[req.key]
    return {
      data: { prefs: v === undefined ? {} : { [req.key]: v }, ...info },
      error: null
    }
  }
  return { data: { prefs: all, ...info }, error: null }
}

// prefs:set — einen Tweak setzen via Store (backup-first + atomar bei File).
// Schreib-Gate ZUERST: ohne RAWALLM_WRITE_ENABLED keine Mutation.
export async function handlePrefsSet(req: PrefsSetRequest): Promise<PrefsSetResult> {
  if (!req || typeof req.key !== 'string' || !req.key) {
    return { data: null, error: 'invalid-request' }
  }
  if (!isWriteEnabled()) return { data: null, error: WRITE_DISABLED_REASON }
  const value = req.value as PrefValue
  const out = await getActiveStore().set(req.key, value)
  if (!out.ok) return { data: null, error: out.error ?? 'prefs-set-failed' }
  appendAudit(makeAuditEntry('prefs-set', req.key, 'ok'), getWriteContext().auditPath)
  if (req.key.startsWith('roots.')) refreshRootPrefs(await getActiveStore().getAll())
  return { data: { key: req.key, value }, error: null }
}

// config:explain — regelbasierte Erklaerung (kein Datei-Read, kein Secret).
function handleExplain(req: ExplainRequest): ExplainResult {
  return explain(req)
}

/**
 * Prefs-/Explain-Handler registrieren (self-registering). Genau EINMAL aufrufen
 * (Welle 3 / WP-INT-02). Unabhaengig von A's registerWriteBase().
 * initPrefsStore() muss vor den ersten IPC-Aufrufen abgeschlossen sein.
 */
export function registerPrefsWrite(): void {
  ipcMain.handle(IPC_WRITE.prefsGet, (_e, req?: PrefsGetRequest): Promise<PrefsGetResult> =>
    guardedAsync('prefs:get', () => handlePrefsGet(req))
  )
  ipcMain.handle(IPC_WRITE.prefsSet, (_e, req: PrefsSetRequest): Promise<PrefsSetResult> =>
    guardedAsync('prefs:set', () => handlePrefsSet(req))
  )
  ipcMain.handle(IPC_WRITE.configExplain, (_e, req: ExplainRequest): ExplainResult =>
    handleExplain(req)
  )
}
