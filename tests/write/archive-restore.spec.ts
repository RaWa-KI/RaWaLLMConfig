// archive-restore.spec.ts — WP22: Verhaltens-Specs fuer den mutierenden
// HR7-Restore-Pfad (listBackups + restoreBackup mit RestoreCtx-Injektion).
// ALLE Tests laufen NUR gegen temp-Sandbox (fixtures.makeSandbox), NIE gegen
// reale Archive (E:) oder reale Configs. Fallstrick (Plan-Karte): exportSnapshot
// legt eigene Tagesordner mit HEUTIGEM Datum an — auf Existenz asserten, nicht
// auf exakte Namen. Restore-Ziele sind .md (nicht-Secret-Write-Klasse), damit
// die Specs NICHT am write-mode-Singleton haengen (Suite-Invariante).
import { test, expect } from '@playwright/test'
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, basename } from 'node:path'
import { tmpdir } from 'node:os'
import { listBackups, restoreBackup } from '../../src/main/services/archive-restore'
import type { RestoreCtx } from '../../src/main/services/archive-restore'
import { makeSandbox, seedFile, sandboxPath } from './fixtures'
import type { Sandbox } from './fixtures'

// RestoreCtx fuer eine Sandbox bauen (allowedRoots = nur configDir).
function ctxFor(sb: Sandbox): RestoreCtx {
  return { archiveRoot: sb.archiveRoot, auditPath: sb.auditPath, allowedRoots: [sb.configDir] }
}

// Letzten Audit-Eintrag (NDJSON) der Sandbox parsen; null wenn Datei fehlt.
function lastAudit(sb: Sandbox): Record<string, unknown> | null {
  if (!existsSync(sb.auditPath)) return null
  const lines = readFileSync(sb.auditPath, 'utf8').trim().split('\n')
  return JSON.parse(lines[lines.length - 1])
}

// Fixture: Tagesordner unter archiveRoot anlegen und absoluten Pfad liefern.
function dayDir(sb: Sandbox, name: string): string {
  const d = join(sb.archiveRoot, name)
  mkdirSync(d, { recursive: true })
  return d
}

// Pfad-Vergleich segment-tolerant (Backslash-normalisiert, case-insensitiv).
function isUnderNorm(child: string, root: string): boolean {
  const c = child.replace(/\\/g, '/').toLowerCase()
  const r = root.replace(/\\/g, '/').toLowerCase()
  return c.startsWith(`${r}/`)
}

// ── listBackups ──────────────────────────────────────────────────────────────

test('listBackups -> archive-missing wenn der Archiv-Root fehlt (kein Fallback)', () => {
  const missing = join(tmpdir(), 'rawallm-archive-restore-does-not-exist')
  const res = listBackups(missing)
  expect(res.error).toBe('archive-missing')
  expect(res.data).toBeNull()
})

test('listBackups mappt write-Eintrag: originalName, ISO-stamp, kind, originalPath aus Sidecar', () => {
  const sb = makeSandbox()
  const w = dayDir(sb, '2026-06-09-phase2-write')
  const bak = join(w, 'settings.json.142233-123.bak')
  writeFileSync(bak, '{"a":1}', 'utf8')
  // Origin-Sidecar mit dem absoluten Original-Quellpfad (Restore-Vorbelegung).
  const originalSrc = join(sb.configDir, 'settings.json')
  writeFileSync(`${bak}.origin`, `${originalSrc}\n`, 'utf8')

  const res = listBackups(sb.archiveRoot)
  expect(res.error).toBeNull()
  const entry = res.data!.entries.find((e) => e.kind === 'write')
  expect(entry).toBeDefined()
  expect(entry!.backupPath).toBe(bak)
  expect(entry!.originalName).toBe('settings.json')
  // <HHMMSS-mmm> aus dem Dateinamen + dayTag -> ISO-Zeit (UTC).
  expect(entry!.stamp).toBe('2026-06-09T14:22:33.123Z')
  expect(entry!.dayTag).toBe('2026-06-09')
  expect(entry!.size).toBe(Buffer.byteLength('{"a":1}'))
  // Sidecar-Inhalt getrimmt als originalPath uebernommen.
  expect(entry!.originalPath).toBe(originalSrc)
  expect(res.data!.truncated).toBe(false)
})

test('listBackups: .origin nie als Eintrag; .snap-Ordner als size:0; archive-kind gemappt', () => {
  const sb = makeSandbox()
  const w = dayDir(sb, '2026-06-09-phase2-write')
  const bak = join(w, 'settings.json.142233-123.bak')
  writeFileSync(bak, '{"a":1}', 'utf8')
  writeFileSync(`${bak}.origin`, join(sb.configDir, 'settings.json'), 'utf8')
  const a = dayDir(sb, '2026-06-09-phase2-archive')
  writeFileSync(join(a, 'notes.md.142233-123'), 'ALT', 'utf8')
  const s = dayDir(sb, '2026-06-09-phase2-snapshot')
  const snapDir = join(s, 'x.142233-123.snap')
  mkdirSync(snapDir, { recursive: true })
  writeFileSync(join(snapDir, 'inner.md'), 'tief', 'utf8')

  const res = listBackups(sb.archiveRoot)
  expect(res.error).toBeNull()
  const entries = res.data!.entries
  // Genau 3 Eintraege: write + archive + snapshot — der Sidecar erscheint NIE.
  expect(entries.length).toBe(3)
  expect(entries.some((e) => e.backupPath.endsWith('.origin'))).toBe(false)
  const arch = entries.find((e) => e.kind === 'archive')
  expect(arch!.originalName).toBe('notes.md')
  const snap = entries.find((e) => e.kind === 'snapshot')
  expect(snap!.backupPath).toBe(snapDir)
  expect(snap!.originalName).toBe('x')
  expect(snap!.size).toBe(0)
})

// ── restoreBackup ────────────────────────────────────────────────────────────

test('restoreBackup (a): backupPath ausserhalb archiveRoot -> backup-out-of-archive', () => {
  const sb = makeSandbox()
  // "Backup" liegt in der Config (NICHT unter archiveRoot) -> kein freier Quellpfad.
  const rogue = seedFile(sb, 'rogue.md', 'BOESE')
  const target = seedFile(sb, 'ziel.md', 'ORIGINAL')
  const res = restoreBackup({ backupPath: rogue, toPath: target }, ctxFor(sb))
  expect(res.error).toBe('backup-out-of-archive')
  expect(res.data).toBeNull()
  // Ziel unveraendert (keine Mutation vor Validierung).
  expect(readFileSync(target, 'utf8')).toBe('ORIGINAL')
})

test('restoreBackup (b): .snap-Ordner -> snapshot-not-restorable (read-only)', () => {
  const sb = makeSandbox()
  const s = dayDir(sb, '2026-06-09-phase2-snapshot')
  const snapDir = join(s, 'x.142233-123.snap')
  mkdirSync(snapDir, { recursive: true })
  const target = seedFile(sb, 'ziel.md', 'ORIGINAL')
  const res = restoreBackup({ backupPath: snapDir, toPath: target }, ctxFor(sb))
  expect(res.error).toBe('snapshot-not-restorable')
  expect(res.data).toBeNull()
  expect(readFileSync(target, 'utf8')).toBe('ORIGINAL')
})

test('restoreBackup (c): toPath ausserhalb allowedRoots -> out-of-scope + Audit-error', () => {
  const sb = makeSandbox()
  const w = dayDir(sb, '2026-06-09-phase2-write')
  const bak = join(w, 'rule.md.142233-123.bak')
  writeFileSync(bak, 'ALT-BACKUP', 'utf8')
  // Ziel liegt in der Sandbox, aber AUSSERHALB der allowedRoots (configDir).
  const outside = join(sb.root, 'outside', 'evil.md')
  const res = restoreBackup({ backupPath: bak, toPath: outside }, ctxFor(sb))
  expect(res.error).toBe('out-of-scope')
  expect(res.data).toBeNull()
  expect(existsSync(outside)).toBe(false)
  // Audit-Eintrag: restore/error mit out-of-scope-Detail (nur Basename, kein Pfad).
  const audit = lastAudit(sb)
  expect(audit).not.toBeNull()
  expect(audit!.action).toBe('restore')
  expect(audit!.result).toBe('error')
  expect(audit!.detail).toBe('out-of-scope')
  expect(audit!.path).toBe('evil.md')
})

test('restoreBackup (d): Happy-Path auf existierendes Ziel -> Pre-Snapshot + Inhalt + Audit-ok', () => {
  const sb = makeSandbox()
  const w = dayDir(sb, '2026-06-09-phase2-write')
  const bak = join(w, 'rule.md.142233-123.bak')
  writeFileSync(bak, 'ALT-BACKUP', 'utf8')
  const target = seedFile(sb, 'rule.md', 'AKTUELLER-STAND')

  const res = restoreBackup({ backupPath: bak, toPath: target }, ctxFor(sb))
  expect(res.error).toBeNull()
  expect(res.data!.restoredTo).toBe(target)
  // Pre-Restore-Snapshot gesetzt: existiert UNTER archiveRoot (exportSnapshot
  // legt eigenen Tagesordner an — Existenz asserten, nicht exakte Namen) und
  // traegt den ALTEN Zielinhalt (HR7 backup-first vor Overwrite).
  const snap = res.data!.preRestoreSnapshot
  expect(snap).not.toBeNull()
  expect(existsSync(snap!)).toBe(true)
  expect(isUnderNorm(snap!, sb.archiveRoot)).toBe(true)
  expect(readFileSync(snap!, 'utf8')).toBe('AKTUELLER-STAND')
  // Zielinhalt == Backup-Inhalt (atomar geschrieben).
  expect(readFileSync(target, 'utf8')).toBe('ALT-BACKUP')
  // Audit: restore/ok mit Backup-Basename als Herkunft (to).
  const audit = lastAudit(sb)
  expect(audit!.action).toBe('restore')
  expect(audit!.result).toBe('ok')
  expect(audit!.path).toBe('rule.md')
  expect(audit!.to).toBe(basename(bak))
})

test('restoreBackup (e): Ziel existiert nicht -> restored ohne Pre-Snapshot (null)', () => {
  const sb = makeSandbox()
  const w = dayDir(sb, '2026-06-09-phase2-write')
  const bak = join(w, 'fresh.md.142233-123.bak')
  writeFileSync(bak, 'NEU-AUS-BACKUP', 'utf8')
  const target = sandboxPath(sb, 'fresh.md') // existiert NICHT

  const res = restoreBackup({ backupPath: bak, toPath: target }, ctxFor(sb))
  expect(res.error).toBeNull()
  expect(res.data!.preRestoreSnapshot).toBeNull()
  expect(readFileSync(target, 'utf8')).toBe('NEU-AUS-BACKUP')
})
