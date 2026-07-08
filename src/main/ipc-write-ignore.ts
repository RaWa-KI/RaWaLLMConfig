// ipc-write-ignore.ts — Self-registering Handler fuer die drei Ignore-Scopes der
// Graph-Sektion (WP-B4): obsidian / graphify / .gitignore, je WS. Kanaele:
// graphReadIgnores (read-only, kein Gate) und graphWriteIgnore (gated).
// isWriteEnabled() ZUERST im Write-Handler (Muster ipc-write-env.ts). Nur
// ipcMain.handle, kein .on; ipc-write.ts (registerWriteBase) wird NICHT angefasst.
// SECURITY: das scope-Enum wird SERVER-seitig auf einen Pfad gemappt (kein vom
// Renderer gelieferter Pfad). Nur diese drei definierten Dateien werden gelesen/
// geschrieben. Ignore-Listen sind keine Secrets; trotzdem nie anderer Inhalt.
// No-Data-Loss: backup-first ist PFLICHT vor jedem Overwrite (backup-Port);
// fehlt der Archiv-Root -> STOP mit Fehler statt Write. Atomar via tmp + rename.
import { ipcMain } from 'electron'
import { existsSync, readFileSync, writeFileSync, renameSync, mkdirSync, openSync, fsyncSync, closeSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { IPC_WRITE } from '@shared/channels-write'
import type { IpcResult } from '@shared/contract'
import type { ResolvedIntegration } from '@shared/contract-integrations'
import type {
  IgnoreScope,
  GraphIgnores,
  IgnoreScopeState,
  GraphWriteIgnoreRequest,
  GraphWriteIgnoreData,
  GraphModuleState,
  GraphOptionalModuleId
} from '@shared/contract-graph'
import { isWriteEnabled, getWriteContext } from './services/write-mode'
import { assertInScope } from './services/path-scope'
import { backup } from './services/backup'
import { appendAudit, makeAuditEntry } from './services/audit-log'
import { workspaceRoots } from './services/config-roots'
import { resolveIntegrations } from './services/integration-resolve'
import { WRITE_DISABLED_REASON } from './ipc-write'
import { guarded } from './lib/guarded'

// Pfad fuer Vergleich normalisieren (Trailing-Slash weg, lowercase wie config-roots).
function normRoot(p: string): string {
  return p.replace(/[\\/]+$/, '').toLowerCase()
}

// SECURITY (Authorization): wsRoot muss eine bekannte Workspace-Wurzel sein
// (workspaceRoots() = Parent + Registry). Verhindert, dass der Renderer einen
// beliebigen Pfad liefert und damit Dateien ausserhalb der WS-Menge gelesen/
// geschrieben werden (Path Traversal / Missing Authorization). Gilt fuer READ
// UND WRITE; der Write-Pfad prueft zusaetzlich assertInScope.
function isKnownWorkspace(wsRoot: string): boolean {
  const target = normRoot(wsRoot)
  return workspaceRoots().some((w) => normRoot(w.root) === target)
}

// scope-Enum SERVER-seitig auf den relativen Dateipfad mappen (kein Client-Pfad).
// graphify-Pfad ist eine ANNAHME (kein verlaesslicher graphify-Ignore-Standard):
// <wsRoot>/graphify-out/.graphignore. Falls spaeter ein abweichender Standard
// existiert, hier zentral aendern.
function scopePath(wsRoot: string, scope: IgnoreScope): string {
  switch (scope) {
    case 'obsidian':
      return join(wsRoot, '.obsidian', 'app.json')
    case 'graphify':
      return join(wsRoot, 'graphify-out', '.graphignore') // ANNAHME, siehe oben
    case 'gitignore':
      return join(wsRoot, '.gitignore')
  }
}

// userIgnoreFilters aus dem obsidian app.json holen (Zeilen-Array -> Text).
// Defekt/fehlend -> leerer Text; wirft nicht (read-only, tolerant).
function readObsidianFilters(raw: string): string {
  try {
    const parsed = JSON.parse(raw) as { userIgnoreFilters?: unknown }
    const arr = parsed?.userIgnoreFilters
    if (Array.isArray(arr)) return arr.filter((x) => typeof x === 'string').join('\n')
    return ''
  } catch {
    return ''
  }
}

// Einen Scope lesen: exists + Roh-Inhalt (obsidian: extrahierte Filter-Zeilen).
function readScope(wsRoot: string, scope: IgnoreScope): IgnoreScopeState {
  const fp = scopePath(wsRoot, scope)
  if (!existsSync(fp)) return { exists: false, content: '', availability: 'notConfigured' }
  const raw = readFileSync(fp, 'utf8')
  const content = scope === 'obsidian' ? readObsidianFilters(raw) : raw
  return { exists: true, content, availability: 'found' }
}

function defaultGraphModuleState(id: GraphOptionalModuleId): GraphModuleState {
  return { id, availability: 'notConfigured', root: null, detail: 'Nicht eingerichtet' }
}

function graphModuleState(id: GraphOptionalModuleId, integrations: ResolvedIntegration[]): GraphModuleState {
  const resolved = integrations.find((item) => item.id === id)
  if (!resolved) return defaultGraphModuleState(id)
  return { id, availability: resolved.availability, root: resolved.root, detail: resolved.detail }
}

// READ-Handler (read-only, KEIN Gate): aktueller Stand aller drei Scopes.
export function handleReadIgnores(
  wsRoot: string,
  integrations = resolveIntegrations()
): IpcResult<GraphIgnores> {
  if (!wsRoot || typeof wsRoot !== 'string') return { data: null, error: 'invalid-request' }
  if (!isKnownWorkspace(wsRoot)) return { data: null, error: 'Workspace nicht erlaubt' }
  return {
    data: {
      obsidian: readScope(wsRoot, 'obsidian'),
      graphify: readScope(wsRoot, 'graphify'),
      gitignore: readScope(wsRoot, 'gitignore'),
      modules: {
        graphify: graphModuleState('graphify', integrations),
        obsidian: graphModuleState('obsidian', integrations)
      }
    },
    error: null
  }
}

// Neuen Datei-Inhalt fuer einen Scope bauen. obsidian: gueltiges JSON ERHALTEN
// (vorhandenes app.json einlesen, nur userIgnoreFilters ersetzen); sonst Plaintext.
function buildContent(fp: string, scope: IgnoreScope, content: string): string {
  const lines = content.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0)
  if (scope !== 'obsidian') return content
  let obj: Record<string, unknown> = {}
  if (existsSync(fp)) {
    try {
      const parsed = JSON.parse(readFileSync(fp, 'utf8'))
      if (parsed && typeof parsed === 'object') obj = parsed as Record<string, unknown>
    } catch {
      obj = {} // defektes JSON -> sauberes Minimal-Objekt (kein stiller Datenverlust: Pre-Snapshot lief vorher)
    }
  }
  obj.userIgnoreFilters = lines
  return JSON.stringify(obj, null, 2) + '\n'
}

// Pre-Snapshot der existierenden Zieldatei (backup-first, No-Data-Loss). Bei
// fehlendem Archiv-Root liefert der Port 'archive-missing' -> STOP-Fehler.
function backupExisting(fp: string, archiveRoot: string): string | { error: string } {
  if (!existsSync(fp)) return '' // Neuanlage -> nichts zu sichern
  const res = backup.backup(fp, archiveRoot)
  if (res.error) return { error: 'backup-failed' }
  return res.data?.snapshotPath ?? ''
}

// Atomar schreiben: tmp im selben Ordner anlegen, fsync, dann rename auf das Ziel.
// fsync vor rename garantiert Durability (Muster aus apply-actions.ts atomicWrite).
function writeScopeAtomic(fp: string, data: string): void {
  mkdirSync(dirname(fp), { recursive: true })
  const tmp = `${fp}.${process.pid}.${Date.now()}.tmp`
  writeFileSync(tmp, data, 'utf8')
  const fd = openSync(tmp, 'r+')
  try {
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }
  renameSync(tmp, fp)
}

// WRITE-Handler (gated): Gate -> Scope-Pruefung -> backup-first -> atomar schreiben.
// Kein Sync der anderen Scopes (jeder Scope einzeln).
export function handleWriteIgnore(req: GraphWriteIgnoreRequest): IpcResult<GraphWriteIgnoreData> {
  if (!isWriteEnabled()) return { data: null, error: WRITE_DISABLED_REASON }
  if (!req || typeof req.wsRoot !== 'string' || typeof req.content !== 'string') {
    return { data: null, error: 'invalid-request' }
  }
  if (req.scope !== 'obsidian' && req.scope !== 'graphify' && req.scope !== 'gitignore') {
    return { data: null, error: 'invalid-scope' }
  }
  if (!isKnownWorkspace(req.wsRoot)) return { data: null, error: 'Workspace nicht erlaubt' }
  const ctx = getWriteContext()
  const fp = scopePath(req.wsRoot, req.scope)
  const verdict = assertInScope(fp, ctx.allowedRoots)
  if (!verdict.writable) return { data: null, error: 'Ziel ausserhalb des erlaubten Bereichs' }
  const snap = backupExisting(fp, ctx.archiveRoot)
  if (typeof snap !== 'string') {
    return { data: null, error: 'Kein Backup moeglich (Archiv-Ziel fehlt) — Schreiben abgebrochen' }
  }
  writeScopeAtomic(fp, buildContent(fp, req.scope, req.content))
  appendAudit(makeAuditEntry('graph-write-ignore', fp, 'ok'), ctx.auditPath)
  return { data: { scope: req.scope, snapshotPath: snap }, error: null }
}

/**
 * Graph-Ignore-Handler registrieren (self-registering). Genau EINMAL aufrufen
 * (via register-write.ts / safeRegister). Faesst ipc-write.ts nicht an.
 */
export function registerGraphIgnore(): void {
  ipcMain.handle(
    IPC_WRITE.graphReadIgnores,
    (_e, wsRoot: string): IpcResult<GraphIgnores> =>
      guarded('readIgnores', () => handleReadIgnores(wsRoot))
  )
  ipcMain.handle(
    IPC_WRITE.graphWriteIgnore,
    (_e, req: GraphWriteIgnoreRequest): IpcResult<GraphWriteIgnoreData> =>
      guarded('writeIgnore', () => handleWriteIgnore(req))
  )
}
