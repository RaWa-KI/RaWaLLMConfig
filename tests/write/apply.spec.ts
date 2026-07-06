// apply.spec.ts — 5 Aktionen gegen temp-Sandbox: edit/add/archive/move/toggle.
// backup-first, atomar (tmp im Zielverzeichnis), remove=archive, audit nach rename.
import { test, expect } from '@playwright/test'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { applyWrite } from '../../src/main/services/apply'
import { makeSandbox, seedFile, sandboxPath, exists } from './fixtures'
import type { Sandbox } from './fixtures'

// Optionen fuer applyWrite immer mit Sandbox-Pfaden (nie real).
function opts(sb: Sandbox): { archiveRoot: string; auditPath: string } {
  return { archiveRoot: sb.archiveRoot, auditPath: sb.auditPath }
}

test('edit ersetzt Inhalt atomar + Pre-Snapshot + Audit nach rename', () => {
  const sb = makeSandbox()
  const target = seedFile(sb, 'r.md', 'ALT')
  const res = applyWrite({ action: 'edit', path: target, content: 'NEU' }, opts(sb))
  expect(res.error).toBeNull()
  expect(readFileSync(target, 'utf8')).toBe('NEU')
  // Pre-Snapshot vorhanden (backup-first).
  expect(res.data!.backupPath).toBeTruthy()
  expect(exists(res.data!.backupPath!)).toBe(true)
  // Audit-Eintrag nach rename geschrieben.
  const audit = readFileSync(sb.auditPath, 'utf8')
  expect(audit).toContain('"action":"edit"')
  expect(audit).toContain('"result":"ok"')
  // Keine tmp-Restdatei im Zielverzeichnis.
  expect(readdirSync(sb.configDir).some((f) => f.includes('.tmp-'))).toBe(false)
})

test('add legt neue Datei an (reiner add: kein Backup noetig)', () => {
  const sb = makeSandbox()
  const target = sandboxPath(sb, 'sub', 'neu.md') // Parent existiert nicht -> mkdir
  const res = applyWrite({ action: 'add', path: target, content: 'HALLO' }, opts(sb))
  expect(res.error).toBeNull()
  expect(readFileSync(target, 'utf8')).toBe('HALLO')
  // reiner add (Datei existierte nicht) -> kein Pre-Snapshot.
  expect(res.data!.backupPath).toBeNull()
})

test('add auf existierendes Ziel macht Pre-Snapshot (kein blinder Overwrite)', () => {
  const sb = makeSandbox()
  const target = seedFile(sb, 'exists.md', 'ALT')
  const res = applyWrite({ action: 'add', path: target, content: 'NEU' }, opts(sb))
  expect(res.error).toBeNull()
  // Snapshot der alten Datei wurde gemacht.
  expect(res.data!.backupPath).toBeTruthy()
  expect(exists(res.data!.backupPath!)).toBe(true)
})

test('archive verschiebt in temp-Archiv (Quelle weg, Archiv da, kein Loeschen)', () => {
  const sb = makeSandbox()
  const target = seedFile(sb, 'old.md', 'X')
  const res = applyWrite({ action: 'archive', path: target }, opts(sb))
  expect(res.error).toBeNull()
  expect(existsSync(target)).toBe(false) // Quelle verschoben
  expect(res.data!.movedTo).toBeTruthy()
  expect(exists(res.data!.movedTo!)).toBe(true) // im Archiv vorhanden
  expect(readFileSync(res.data!.movedTo!, 'utf8')).toBe('X')
})

test('move verschiebt an neuen Zielpfad', () => {
  const sb = makeSandbox()
  const target = seedFile(sb, 'm.md', 'Y')
  const to = sandboxPath(sb, 'moved', 'm.md')
  const res = applyWrite({ action: 'move', path: target, to }, opts(sb))
  expect(res.error).toBeNull()
  expect(existsSync(target)).toBe(false)
  expect(readFileSync(to, 'utf8')).toBe('Y')
})

test('toggle ist idempotent (active<->archived)', () => {
  const sb = makeSandbox()
  const target = seedFile(sb, 't.md', 'Z')
  const marker = join(sb.configDir, 't.md.archived')
  // 1. toggle: Marker an.
  expect(applyWrite({ action: 'toggle', path: target }, opts(sb)).error).toBeNull()
  expect(existsSync(marker)).toBe(true)
  // 2. toggle: Marker wieder weg (zurueck auf active).
  expect(applyWrite({ action: 'toggle', path: target }, opts(sb)).error).toBeNull()
  expect(existsSync(marker)).toBe(false)
})

test('backup-Fehler bricht apply VOR Mutation ab (Zieldatei unveraendert)', () => {
  const sb = makeSandbox()
  const target = seedFile(sb, 'guard.md', 'ORIGINAL')
  // Archiv-Root fehlt -> archive-missing -> Abbruch vor jeder Mutation.
  const res = applyWrite(
    { action: 'edit', path: target, content: 'SOLL-NICHT' },
    { archiveRoot: join(sb.root, 'no-archive-here'), auditPath: sb.auditPath }
  )
  expect(res.error).toBe('archive-missing')
  expect(readFileSync(target, 'utf8')).toBe('ORIGINAL') // unveraendert
})

test('secret-bearing Zielpfad wird verweigert (guard-first)', () => {
  const sb = makeSandbox()
  // Ziel-Basename = settings.json -> secret-bearing -> owner-only.
  const target = sandboxPath(sb, 'settings.json')
  const res = applyWrite({ action: 'add', path: target, content: '{}' }, opts(sb))
  expect(res.error).toBe('owner-only/not-in-scope')
  expect(existsSync(target)).toBe(false)
})
