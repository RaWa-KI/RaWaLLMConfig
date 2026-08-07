// folder-ops-merge.spec.ts — Temp-Sandbox-Tests fuer Integrity-Ordner-Merge.
// Abgedeckt: deterministische Endmenge, Partial-Failure, Idempotenz,
// case-insensitive-Kollision. Alle Pfade temp via fixtures.
import { test, expect } from '@playwright/test'
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { makeSandbox } from './fixtures'
import type { DirReconcileRequest } from '@shared/contract-write'
import { ctx, previewAndApply } from './integrity-helpers'

// ── Hilfsroutinen ───────────────────────────────────────────────────────────

function makeDir(parent: string, name: string, files: Record<string, string>): string {
  const dir = join(parent, name)
  mkdirSync(dir, { recursive: true })
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(dir, rel)
    mkdirSync(join(abs, '..'), { recursive: true })
    writeFileSync(abs, content, 'utf8')
  }
  return dir
}

// ── Integrity: deterministische Endmenge ─────────────────────────────────────

test('reconcile: keep-trunk behaelt Trunk-Datei, Mirror wird archiviert', async () => {
  const sb = makeSandbox()
  const trunk = makeDir(sb.configDir, 'trunk-kt', {
    'shared.md': 'TRUNK-VERSION',
    'trunk-only.md': 'TRUNK-ONLY'
  })
  const mirror = makeDir(sb.configDir, 'mirror-kt', {
    'shared.md': 'MIRROR-VERSION',
    'mirror-only.md': 'MIRROR-ONLY'
  })

  const req: DirReconcileRequest = {
    trunkPath: trunk,
    mirrorPath: mirror,
    decisions: {
      'shared.md': 'keep-trunk'
    }
  }
  const run = await previewAndApply({ kind: 'reconcile-folder', req }, ctx(sb))
  expect(run.preview.error).toBeNull()
  expect(run.apply?.error).toBeNull()
  expect(run.apply?.data?.applied).toBe(true)

  // Trunk-Datei unveraendert.
  expect(readFileSync(join(trunk, 'shared.md'), 'utf8')).toBe('TRUNK-VERSION')
  expect(readFileSync(join(trunk, 'trunk-only.md'), 'utf8')).toBe('TRUNK-ONLY')
  // Einseitige Dateien bleiben im aktiven Integrity-Paarpfad unangetastet.
  expect(readFileSync(join(mirror, 'mirror-only.md'), 'utf8')).toBe('MIRROR-ONLY')

  // Aktiver Resulttyp: clean apply plus persistiertes Journal.
  expect(run.apply?.data?.partial).toBe(false)
  expect(run.apply?.data?.journalPath).toBeTruthy()
  expect(existsSync(run.apply!.data!.journalPath!)).toBe(true)

  // Kein backupPath bei keep-trunk (kein Trunk-Edit).
  const keepEntry = run.preview.data!.fsOps.find((f) => f.rel === 'shared.md')
  expect(keepEntry?.decision).toBe('keep-trunk')
})

// ── DEDUP identischer/gemischter Ordner (Owner-Bug: "behalten ändert nichts") ──
// Die UI liefert jetzt AUCH fuer identische (status='same') Dateien eine keep-
// Entscheidung -> ein Duplikat-Ordner wird dedupliziert (Verliererseite HR7-
// archiviert), auch bei gleichem Inhalt. Kein Datenverlust (Inhalt bleibt auf
// Gewinnerseite + im Archiv). Vorher blieben same-Dateien ohne decisions -> No-Op.

test('reconcile DEDUP: identischer Ordner keep-trunk -> Mirror-Dateien archiviert', async () => {
  const sb = makeSandbox()
  const trunk = makeDir(sb.configDir, 'trunk-id', { 'SKILL.md': 'GLEICH', 'a.md': 'GLEICH-A' })
  const mirror = makeDir(sb.configDir, 'mirror-id', { 'SKILL.md': 'GLEICH', 'a.md': 'GLEICH-A' })
  const req: DirReconcileRequest = {
    trunkPath: trunk,
    mirrorPath: mirror,
    decisions: { 'SKILL.md': 'keep-trunk', 'a.md': 'keep-trunk' }
  }
  const run = await previewAndApply({ kind: 'reconcile-folder', req }, ctx(sb))
  expect(run.preview.error).toBeNull()
  expect(run.apply?.error).toBeNull()
  expect(run.apply?.data?.applied).toBe(true)
  // Trunk (Gewinner) byte-identisch erhalten.
  expect(readFileSync(join(trunk, 'SKILL.md'), 'utf8')).toBe('GLEICH')
  // Mirror-Ordner komplett archiviert (Dedup), nicht geloescht.
  expect(existsSync(join(mirror, 'SKILL.md'))).toBe(false)
  expect(existsSync(join(mirror, 'a.md'))).toBe(false)
})

test('reconcile DEDUP: identischer Ordner keep-mirror -> Trunk-Dateien archiviert', async () => {
  const sb = makeSandbox()
  const trunk = makeDir(sb.configDir, 'trunk-id2', { 'SKILL.md': 'GLEICH' })
  const mirror = makeDir(sb.configDir, 'mirror-id2', { 'SKILL.md': 'GLEICH' })
  const req: DirReconcileRequest = {
    trunkPath: trunk,
    mirrorPath: mirror,
    decisions: { 'SKILL.md': 'keep-mirror' }
  }
  const run = await previewAndApply({ kind: 'reconcile-folder', req }, ctx(sb))
  expect(run.preview.error).toBeNull()
  expect(run.apply?.error).toBeNull()
  expect(run.apply?.data?.applied).toBe(true)
  // Mirror (Gewinner) erhalten; Trunk (Verlierer) archiviert.
  expect(readFileSync(join(mirror, 'SKILL.md'), 'utf8')).toBe('GLEICH')
  expect(existsSync(join(trunk, 'SKILL.md'))).toBe(false)
})

test('reconcile DEDUP: gemischter Ordner keep-trunk -> Mirror-Dateien archiviert', async () => {
  const sb = makeSandbox()
  const trunk = makeDir(sb.configDir, 'trunk-mix', { 'same.md': 'GLEICH', 'diff.md': 'TRUNK-D' })
  const mirror = makeDir(sb.configDir, 'mirror-mix', { 'same.md': 'GLEICH', 'diff.md': 'MIRROR-D' })
  const req: DirReconcileRequest = {
    trunkPath: trunk,
    mirrorPath: mirror,
    decisions: { 'same.md': 'keep-trunk', 'diff.md': 'keep-trunk' }
  }
  const run = await previewAndApply({ kind: 'reconcile-folder', req }, ctx(sb))
  expect(run.preview.error).toBeNull()
  expect(run.apply?.error).toBeNull()
  expect(run.apply?.data?.applied).toBe(true)
  // Trunk-Seite bleibt; Mirror komplett archiviert (auch die identische same.md).
  expect(readFileSync(join(trunk, 'same.md'), 'utf8')).toBe('GLEICH')
  expect(readFileSync(join(trunk, 'diff.md'), 'utf8')).toBe('TRUNK-D')
  expect(existsSync(join(mirror, 'same.md'))).toBe(false)
  expect(existsSync(join(mirror, 'diff.md'))).toBe(false)
})

test('reconcile: adopt-mirror uebernimmt Mirror-Datei mit Pre-Snapshot', async () => {
  const sb = makeSandbox()
  const trunk = makeDir(sb.configDir, 'trunk-am', {
    'shared.md': 'TRUNK-ORIG'
  })
  const mirror = makeDir(sb.configDir, 'mirror-am', {
    'shared.md': 'MIRROR-NEU'
  })

  const req: DirReconcileRequest = {
    trunkPath: trunk,
    mirrorPath: mirror,
    decisions: { 'shared.md': 'adopt-mirror' }
  }
  const run = await previewAndApply({ kind: 'reconcile-folder', req }, ctx(sb))
  expect(run.preview.error).toBeNull()
  expect(run.apply?.error).toBeNull()
  expect(run.apply?.data?.applied).toBe(true)

  // Trunk-Datei hat jetzt Mirror-Inhalt.
  expect(readFileSync(join(trunk, 'shared.md'), 'utf8')).toBe('MIRROR-NEU')

  // Pre-Snapshot vorhanden (backup-first via applyWrite).
  const adoptEntry = run.preview.data!.fsOps.find((f) => f.rel === 'shared.md')
  expect(adoptEntry?.decision).toBe('adopt-mirror')
  expect(run.apply?.data?.journalPath).toBeTruthy()
  expect(existsSync(run.apply!.data!.journalPath!)).toBe(true)

  // Alle Dateien opfern die Mirror-Seite -> Mirror-ORDNER als Ganzes archiviert
  // (F7-Idempotenz-Erhalt), mirrorArchivedTo gesetzt, Mirror-Ordner weg.
  expect(run.apply?.data?.partial).toBe(false)
  expect(existsSync(join(mirror, 'shared.md'))).toBe(false)
})

test('reconcile: skip erzeugt im Integrity-Kanal einen sicheren No-op', async () => {
  const sb = makeSandbox()
  const trunk = makeDir(sb.configDir, 'trunk-skip', { 'a.md': 'A-TRUNK' })
  const mirror = makeDir(sb.configDir, 'mirror-skip', { 'a.md': 'A-MIRROR' })

  const req: DirReconcileRequest = {
    trunkPath: trunk,
    mirrorPath: mirror,
    decisions: { 'a.md': 'skip' }
  }
  const run = await previewAndApply({ kind: 'reconcile-folder', req }, ctx(sb))
  expect(run.preview.error).toBeNull()
  expect(run.apply?.error).toBeNull()
  expect(run.apply?.data?.applied).toBe(true)
  expect(run.preview.data?.fsOps).toHaveLength(0)
  // Trunk unveraendert.
  expect(readFileSync(join(trunk, 'a.md'), 'utf8')).toBe('A-TRUNK')
  // Skip-Entscheidung im Report.
  expect(existsSync(join(mirror, 'a.md'))).toBe(true)
})

// ── Finding B: symmetrische Richtung (keep-mirror / adopt-trunk) ─────────────

test('keep-mirror (uniform): Mirror-Datei bleibt, Trunk-Datei wird archiviert', async () => {
  const sb = makeSandbox()
  const trunk = makeDir(sb.configDir, 'trunk-km', { 'shared.md': 'TRUNK-VERSION' })
  const mirror = makeDir(sb.configDir, 'mirror-km', { 'shared.md': 'MIRROR-VERSION' })

  const req: DirReconcileRequest = {
    trunkPath: trunk,
    mirrorPath: mirror,
    decisions: { 'shared.md': 'keep-mirror' }
  }
  const run = await previewAndApply({ kind: 'reconcile-folder', req }, ctx(sb))
  expect(run.preview.error).toBeNull()
  expect(run.apply?.error).toBeNull()
  expect(run.apply?.data?.applied).toBe(true)
  // Mirror-Datei unveraendert (Gewinner), Trunk-Seite (Verlierer) als Bulk archiviert.
  expect(readFileSync(join(mirror, 'shared.md'), 'utf8')).toBe('MIRROR-VERSION')
  expect(existsSync(join(trunk, 'shared.md'))).toBe(false)
  const entry = run.preview.data!.fsOps.find((f) => f.rel === 'shared.md')
  expect(entry?.decision).toBe('keep-mirror')
  expect(run.apply?.data?.partial).toBe(false)
})

test('adopt-trunk (uniform): Trunk-Inhalt nach Mirror uebernommen (backup-first)', async () => {
  const sb = makeSandbox()
  const trunk = makeDir(sb.configDir, 'trunk-at', { 'shared.md': 'TRUNK-NEU' })
  const mirror = makeDir(sb.configDir, 'mirror-at', { 'shared.md': 'MIRROR-ORIG' })

  const req: DirReconcileRequest = {
    trunkPath: trunk,
    mirrorPath: mirror,
    decisions: { 'shared.md': 'adopt-trunk' }
  }
  const run = await previewAndApply({ kind: 'reconcile-folder', req }, ctx(sb))
  expect(run.preview.error).toBeNull()
  expect(run.apply?.error).toBeNull()
  expect(run.apply?.data?.applied).toBe(true)
  // Mirror-Datei hat jetzt Trunk-Inhalt; Trunk-Seite (Verlierer) als Bulk archiviert.
  expect(readFileSync(join(mirror, 'shared.md'), 'utf8')).toBe('TRUNK-NEU')
  expect(existsSync(join(trunk, 'shared.md'))).toBe(false)
  const entry = run.preview.data!.fsOps.find((f) => f.rel === 'shared.md')
  expect(entry?.decision).toBe('adopt-trunk')
  expect(run.apply?.data?.journalPath).toBeTruthy() // Snapshot/Journaling vor edit
  expect(run.apply?.data?.partial).toBe(false)
})

test('keep-mirror granular pro Datei: nur eine Trunk-Datei archiviert', async () => {
  const sb = makeSandbox()
  const trunk = makeDir(sb.configDir, 'trunk-kmg', { 'keepm.md': 'T-KEEPM', 'keept.md': 'T-KEEPT' })
  const mirror = makeDir(sb.configDir, 'mirror-kmg', { 'keepm.md': 'M-KEEPM', 'keept.md': 'M-KEEPT' })

  const req: DirReconcileRequest = {
    trunkPath: trunk,
    mirrorPath: mirror,
    decisions: { 'keepm.md': 'keep-mirror', 'keept.md': 'keep-trunk' }
  }
  const run = await previewAndApply({ kind: 'reconcile-folder', req }, ctx(sb))
  expect(run.preview.error).toBeNull()
  expect(run.apply?.error).toBeNull()
  expect(run.apply?.data?.applied).toBe(true)
  // keepm: Trunk-Datei (Verlierer) pro Datei archiviert; Mirror bleibt.
  expect(existsSync(join(trunk, 'keepm.md'))).toBe(false)
  expect(readFileSync(join(mirror, 'keepm.md'), 'utf8')).toBe('M-KEEPM')
  const km = run.preview.data!.fsOps.find((f) => f.rel === 'keepm.md')
  expect(km?.decision).toBe('keep-mirror')
  // keept: Mirror-Datei (Verlierer) pro Datei archiviert; Trunk bleibt.
  expect(existsSync(join(mirror, 'keept.md'))).toBe(false)
  expect(readFileSync(join(trunk, 'keept.md'), 'utf8')).toBe('T-KEEPT')
  expect(run.apply?.data?.partial).toBe(false)
})

test('gemischt keep-trunk + keep-mirror: beide Gewinner bleiben', async () => {
  const sb = makeSandbox()
  const trunk = makeDir(sb.configDir, 'trunk-mix', { 'a.md': 'A-TRUNK', 'b.md': 'B-TRUNK' })
  const mirror = makeDir(sb.configDir, 'mirror-mix', { 'a.md': 'A-MIRROR', 'b.md': 'B-MIRROR' })

  const req: DirReconcileRequest = {
    trunkPath: trunk,
    mirrorPath: mirror,
    decisions: { 'a.md': 'keep-trunk', 'b.md': 'keep-mirror' }
  }
  const run = await previewAndApply({ kind: 'reconcile-folder', req }, ctx(sb))
  expect(run.preview.error).toBeNull()
  expect(run.apply?.error).toBeNull()
  expect(run.apply?.data?.applied).toBe(true)
  // a: Trunk-Gewinner bleibt, Mirror-a archiviert. b: Mirror-Gewinner bleibt, Trunk-b archiviert.
  expect(readFileSync(join(trunk, 'a.md'), 'utf8')).toBe('A-TRUNK')
  expect(existsSync(join(mirror, 'a.md'))).toBe(false)
  expect(readFileSync(join(mirror, 'b.md'), 'utf8')).toBe('B-MIRROR')
  expect(existsSync(join(trunk, 'b.md'))).toBe(false)
  expect(run.apply?.data?.partial).toBe(false)
})

test('secret-skip symmetrisch: Integrity blockiert secret-Trunk-Datei', async () => {
  const sb = makeSandbox()
  const trunk = makeDir(sb.configDir, 'trunk-sec', { 'settings.json': '{"t":true}' })
  const mirror = makeDir(sb.configDir, 'mirror-sec', { 'settings.json': '{"m":true}' })

  const req: DirReconcileRequest = {
    trunkPath: trunk,
    mirrorPath: mirror,
    decisions: { 'settings.json': 'keep-mirror' }
  }
  const run = await previewAndApply({ kind: 'reconcile-folder', req }, ctx(sb))
  expect(run.preview.error).toBeNull()
  expect(run.apply?.data?.applied).toBe(false)
  expect(run.apply?.data?.partial).toBe(false)
  // Beide Seiten unangetastet (Secret wird nie archiviert/mutiert).
  expect(existsSync(join(trunk, 'settings.json'))).toBe(true)
  expect(existsSync(join(mirror, 'settings.json'))).toBe(true)
})
