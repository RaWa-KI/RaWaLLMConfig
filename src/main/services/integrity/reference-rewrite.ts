// reference-rewrite.ts — Referenz-Repair für Pfad-Mutationen.
// Scannt erlaubte Config-Roots und schreibt bekannte Text-Referenzen
// backup-first um. Liest keine Secret-Pfade, loggt keinen Datei-Inhalt.
import {
  closeSync,
  copyFileSync,
  fsyncSync,
  openSync,
  readFileSync,
  renameSync,
  writeFileSync
} from 'node:fs'
import { resolve } from 'node:path'
import type { IpcResult } from '@shared/contract'
import { exportSnapshot } from '../backup'
import { appendAudit, makeAuditEntry } from '../audit-log'
import {
  MAX_TEXT_BYTES,
  type ReplacementPair,
  buildPairs,
  isTextCandidate,
  safeStat,
  collectFiles
} from './reference-pairs'

export interface ReferenceRewriteOptions {
  archiveRoot: string
  auditPath: string
  allowedRoots?: string[]
}

export interface ReferenceRewriteData {
  rewrittenFiles: number
  replacements: number
}

interface FileRewrite {
  path: string
  content: string
  replacements: number
}

interface RewriteSnapshot {
  path: string
  snapshotPath: string
}

function fail(reason: string): IpcResult<ReferenceRewriteData> {
  console.error('[reference-rewrite]', reason)
  return { data: null, error: reason }
}

function replaceAllText(
  content: string,
  needle: string,
  replacement: string
): { text: string; count: number } {
  if (!content.includes(needle)) return { text: content, count: 0 }
  const parts = content.split(needle)
  return { text: parts.join(replacement), count: parts.length - 1 }
}

function planFile(path: string, pairs: ReplacementPair[]): FileRewrite | null {
  if (!isTextCandidate(path)) return null
  const st = safeStat(path)
  if (!st || !st.isFile() || st.size > MAX_TEXT_BYTES) return null
  let current = ''
  try {
    current = readFileSync(path, 'utf8')
  } catch {
    return null
  }
  if (current.includes('\0')) return null
  let next = current
  let replacements = 0
  for (const pair of pairs) {
    const result = replaceAllText(next, pair.needle, pair.replacement)
    next = result.text
    replacements += result.count
  }
  if (replacements === 0 || next === current) return null
  return { path, content: next, replacements }
}

function atomicWrite(path: string, content: string): void {
  const tmp = `${path}.tmp-${process.pid}`
  writeFileSync(tmp, content, 'utf8')
  const fd = openSync(tmp, 'r+')
  try {
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }
  renameSync(tmp, path)
}

function restoreSnapshots(snapshots: RewriteSnapshot[]): boolean {
  let ok = true
  for (const snap of snapshots) {
    try {
      copyFileSync(snap.snapshotPath, snap.path)
    } catch {
      ok = false
    }
  }
  return ok
}

function writePlanned(rewrites: FileRewrite[], opts: ReferenceRewriteOptions): IpcResult<ReferenceRewriteData> {
  const snapshots: RewriteSnapshot[] = []
  for (const rewrite of rewrites) {
    const snap = exportSnapshot(rewrite.path, opts.archiveRoot)
    if (snap.error) return fail(snap.error)
    if (snap.data?.snapshotPath) snapshots.push({ path: rewrite.path, snapshotPath: snap.data.snapshotPath })
  }
  let replacements = 0
  for (const rewrite of rewrites) {
    try {
      atomicWrite(rewrite.path, rewrite.content)
      replacements += rewrite.replacements
      appendAudit(makeAuditEntry('edit', rewrite.path, 'ok', 'reference-rewrite'), opts.auditPath)
    } catch (err) {
      const restored = restoreSnapshots(snapshots)
      const reason = err instanceof Error ? err.message : 'rewrite-failed'
      return fail(restored ? reason : `${reason}: rollback-failed`)
    }
  }
  return { data: { rewrittenFiles: rewrites.length, replacements }, error: null }
}

export function rewriteReferencesForMove(
  oldPath: string,
  newPath: string,
  opts: ReferenceRewriteOptions
): IpcResult<ReferenceRewriteData> {
  if (!oldPath || !newPath || resolve(oldPath) === resolve(newPath)) {
    return { data: { rewrittenFiles: 0, replacements: 0 }, error: null }
  }
  const roots = opts.allowedRoots?.filter(Boolean) ?? []
  if (roots.length === 0) return { data: { rewrittenFiles: 0, replacements: 0 }, error: null }
  const files: string[] = []
  for (const root of roots) collectFiles(root, files)
  const pairs = buildPairs(oldPath, newPath)
  const rewrites = files.map((file) => planFile(file, pairs)).filter((x): x is FileRewrite => x !== null)
  if (rewrites.length === 0) return { data: { rewrittenFiles: 0, replacements: 0 }, error: null }
  return writePlanned(rewrites, opts)
}
