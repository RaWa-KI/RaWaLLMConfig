// source-store.ts — portabler Store fuer Endnutzer-Quellen (OSS Teil C, WP-C1).
// Persistiert die vom Nutzer registrierten Config-Wurzeln + First-Run-Flag als
// JSON (userData/sources.json). Folgt exakt dem prefs-store-Muster: injizierbarer
// Pfad (Default real, Test=temp), atomarer Write (tmp+fsync+rename IM Zielordner),
// backup-first via exportSnapshot (HR7), Audit NACH Write (nur Pfad-NAME/Status,
// NIE ein Wert). Eine Quelle ist nur Ordner-Pfad + Provider-Zuordnung + enabled —
// NIE ein Secret. Electron `app` wird NUR lazy in defaultSourcesPath() aufgerufen
// (NIE auf Modulebene — sonst bricht der Test-Runner ohne Electron-Runtime).
import {
  existsSync, mkdirSync, readFileSync, writeFileSync,
  renameSync, openSync, fsyncSync, closeSync
} from 'node:fs'
import { dirname, join, basename } from 'node:path'
import { app } from 'electron'
import type {
  SourcesFile, UserSource, AddSourceRequest,
  SetSourceEnabledRequest, SourceMutateResult
} from '@shared/contract-sources'
import { exportSnapshot, DEFAULT_ARCHIVE_ROOT } from './backup'
import { appendAudit, makeAuditEntry, DEFAULT_AUDIT_PATH } from './audit-log'

// Default-Store-Datei (Produktivlauf). app.getPath NUR hier, lazy (kein Top-Level).
export function defaultSourcesPath(): string {
  return join(app.getPath('userData'), 'sources.json')
}

// Frische/Default-Store-Struktur (graceful bei fehlender/korrupter Datei).
function emptyState(): SourcesFile {
  return { version: 1, sources: [], onboardingDone: false }
}

// Injizierbare Optionen (Test = temp).
export interface SourceStoreOptions {
  storePath?: string
  archiveRoot?: string
  auditPath?: string
}

// Atomarer JSON-Write: tmp IM Zielverzeichnis, fsync, rename (same-volume).
function atomicWriteJson(targetPath: string, data: SourcesFile): void {
  mkdirSync(dirname(targetPath), { recursive: true })
  const tmp = `${targetPath}.tmp-${process.pid}`
  writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8')
  const fd = openSync(tmp, 'r+')
  try { fsyncSync(fd) } finally { closeSync(fd) }
  renameSync(tmp, targetPath)
}

// Store einlesen; fehlende/kaputte Datei -> leerer Default (graceful, kein Crash).
function readState(storePath: string): SourcesFile {
  try {
    if (!existsSync(storePath)) return emptyState()
    const parsed = JSON.parse(readFileSync(storePath, 'utf8')) as Partial<SourcesFile>
    return {
      version: 1,
      sources: Array.isArray(parsed.sources) ? parsed.sources : [],
      onboardingDone: parsed.onboardingDone === true
    }
  } catch {
    return emptyState()
  }
}

// Slug aus root-Basename + Kollisions-Zaehler -> stabile, kollisionsarme id.
function makeId(root: string, taken: Set<string>): string {
  const base = (basename(root) || 'source').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'source'
  if (!taken.has(base)) return base
  for (let i = 2; i < 10000; i++) {
    const cand = `${base}-${i}`
    if (!taken.has(cand)) return cand
  }
  return `${base}-${Date.now()}`
}

// Store-Objekt mit injiziertem Pfad. Sync-Persistenz in async gewrappt (Datei klein).
export function createSourceStore(opts?: SourceStoreOptions) {
  const storePath = opts?.storePath ?? defaultSourcesPath()
  const archiveRoot = opts?.archiveRoot ?? DEFAULT_ARCHIVE_ROOT
  const auditPath = opts?.auditPath ?? DEFAULT_AUDIT_PATH

  // Gemeinsamer Schreibpfad: backup-first, dann atomarer Write, dann Audit.
  // Bei Snapshot-Fehler Abbruch OHNE Write (No-Data-Loss, HR7/HR20).
  function persist(next: SourcesFile): SourceMutateResult {
    try {
      let backupPath: string | null = null
      if (existsSync(storePath)) {
        const snap = exportSnapshot(storePath, archiveRoot)
        if (snap.error) return { ok: false, error: snap.error, backupPath: null, sources: readState(storePath).sources }
        backupPath = snap.data?.snapshotPath || null
      }
      atomicWriteJson(storePath, next)
      appendAudit(makeAuditEntry('source-mutate', storePath, 'ok'), auditPath)
      return { ok: true, error: null, backupPath, sources: next.sources }
    } catch (err) {
      console.error('[sources]', err instanceof Error ? err.message : 'source-write-failed')
      return { ok: false, error: 'source-write-failed', backupPath: null, sources: readState(storePath).sources }
    }
  }

  return {
    async getState(): Promise<SourcesFile> {
      return readState(storePath)
    },
    async listSources(): Promise<UserSource[]> {
      return readState(storePath).sources
    },
    async addSource(req: AddSourceRequest): Promise<SourceMutateResult> {
      const state = readState(storePath)
      // Duplikat-root (case-insensitiv) -> kein Zweit-Eintrag, ok:true mit Bestand.
      const exists = state.sources.some((s) => s.root.toLowerCase() === req.root.toLowerCase())
      if (exists) return { ok: true, error: null, backupPath: null, sources: state.sources }
      const taken = new Set(state.sources.map((s) => s.id))
      const entry: UserSource = {
        id: makeId(req.root, taken),
        root: req.root,
        providerId: req.providerId,
        label: req.label ?? basename(req.root),
        enabled: req.enabled ?? true
      }
      return persist({ ...state, sources: [...state.sources, entry] })
    },
    async removeSource(id: string): Promise<SourceMutateResult> {
      const state = readState(storePath)
      const next = state.sources.filter((s) => s.id !== id)
      // Unbekannte id -> kein Write noetig, ok:true mit Bestand.
      if (next.length === state.sources.length) {
        return { ok: true, error: null, backupPath: null, sources: state.sources }
      }
      return persist({ ...state, sources: next })
    },
    async setSourceEnabled(req: SetSourceEnabledRequest): Promise<SourceMutateResult> {
      const state = readState(storePath)
      let changed = false
      const next = state.sources.map((s) => {
        if (s.id !== req.id || s.enabled === req.enabled) return s
        changed = true
        return { ...s, enabled: req.enabled }
      })
      if (!changed) return { ok: true, error: null, backupPath: null, sources: state.sources }
      return persist({ ...state, sources: next })
    },
    async getOnboardingDone(): Promise<boolean> {
      return readState(storePath).onboardingDone
    },
    async setOnboardingDone(done: boolean): Promise<SourceMutateResult> {
      const state = readState(storePath)
      if (state.onboardingDone === done) {
        return { ok: true, error: null, backupPath: null, sources: state.sources }
      }
      return persist({ ...state, onboardingDone: done })
    }
  }
}

// Sync-Allowlist-Speisung fuer config-roots: liest die roots der enabled Quellen
// synchron (graceful -> []). KEIN app.getPath wenn storePath uebergeben wird.
export function readEnabledSourceRootsSync(storePath?: string): string[] {
  const fp = storePath ?? defaultSourcesPath()
  try {
    if (!existsSync(fp)) return []
    const parsed = JSON.parse(readFileSync(fp, 'utf8')) as Partial<SourcesFile>
    if (!Array.isArray(parsed.sources)) return []
    return parsed.sources.filter((s) => s && s.enabled && typeof s.root === 'string').map((s) => s.root)
  } catch {
    return []
  }
}

export function readEnabledSourceRootsByProviderSync(storePath?: string): Record<string, string[]> {
  const fp = storePath ?? defaultSourcesPath()
  try {
    if (!existsSync(fp)) return {}
    const parsed = JSON.parse(readFileSync(fp, 'utf8')) as Partial<SourcesFile>
    if (!Array.isArray(parsed.sources)) return {}
    const out: Record<string, string[]> = {}
    for (const s of parsed.sources) {
      if (!s?.enabled || typeof s.root !== 'string' || typeof s.providerId !== 'string') continue
      const list = out[s.providerId] ?? []
      list.push(s.root)
      out[s.providerId] = list
    }
    return out
  } catch {
    return {}
  }
}
