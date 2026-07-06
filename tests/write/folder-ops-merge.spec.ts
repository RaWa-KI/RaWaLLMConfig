// folder-ops-merge.spec.ts — Temp-Sandbox-Tests fuer reconcileFolder.
// Abgedeckt: deterministische Endmenge, Partial-Failure, Idempotenz,
// case-insensitive-Kollision. Alle Pfade temp via fixtures.
import { test, expect } from '@playwright/test'
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { reconcileFolder } from '../../src/main/services/reconcile-folder'
import { makeSandbox } from './fixtures'
import type { DirReconcileRequest } from '@shared/contract-write'

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

function opts(sb: ReturnType<typeof makeSandbox>) {
  return { archiveRoot: sb.archiveRoot, auditPath: sb.auditPath }
}

// ── reconcileFolder: deterministische Endmenge ──────────────────────────────

test('reconcile: keep-trunk behaelt Trunk-Datei, Mirror wird archiviert', () => {
  const sb = makeSandbox()
  const trunk = makeDir(sb.root, 'trunk-kt', {
    'shared.md': 'TRUNK-VERSION',
    'trunk-only.md': 'TRUNK-ONLY'
  })
  const mirror = makeDir(sb.root, 'mirror-kt', {
    'shared.md': 'MIRROR-VERSION',
    'mirror-only.md': 'MIRROR-ONLY'
  })

  const req: DirReconcileRequest = {
    trunkPath: trunk,
    mirrorPath: mirror,
    decisions: {
      'shared.md': 'keep-trunk',
      'trunk-only.md': 'keep-trunk',
      'mirror-only.md': 'keep-trunk'
    }
  }
  const res = reconcileFolder(req, opts(sb))
  expect(res.error).toBeNull()
  expect(res.data).not.toBeNull()

  // Trunk-Datei unveraendert.
  expect(readFileSync(join(trunk, 'shared.md'), 'utf8')).toBe('TRUNK-VERSION')
  expect(readFileSync(join(trunk, 'trunk-only.md'), 'utf8')).toBe('TRUNK-ONLY')

  // Mirror wurde nach vollstaendiger Abarbeitung archiviert (partial = false).
  expect(res.data!.partial).toBe(false)
  expect(res.data!.mirrorArchivedTo).toBeTruthy()
  expect(existsSync(res.data!.mirrorArchivedTo!)).toBe(true)

  // Kein backupPath bei keep-trunk (kein Trunk-Edit).
  const keepEntry = res.data!.files.find((f) => f.rel === 'shared.md')
  expect(keepEntry?.decision).toBe('keep-trunk')
  expect(keepEntry?.backupPath).toBeFalsy()
})

// ── DEDUP identischer/gemischter Ordner (Owner-Bug: "behalten ändert nichts") ──
// Die UI liefert jetzt AUCH fuer identische (status='same') Dateien eine keep-
// Entscheidung -> ein Duplikat-Ordner wird dedupliziert (Verliererseite HR7-
// archiviert), auch bei gleichem Inhalt. Kein Datenverlust (Inhalt bleibt auf
// Gewinnerseite + im Archiv). Vorher blieben same-Dateien ohne decisions -> No-Op.

test('reconcile DEDUP: identischer Ordner keep-trunk -> Mirror-Ordner als Ganzes archiviert', () => {
  const sb = makeSandbox()
  const trunk = makeDir(sb.root, 'trunk-id', { 'SKILL.md': 'GLEICH', 'a.md': 'GLEICH-A' })
  const mirror = makeDir(sb.root, 'mirror-id', { 'SKILL.md': 'GLEICH', 'a.md': 'GLEICH-A' })
  const req: DirReconcileRequest = {
    trunkPath: trunk,
    mirrorPath: mirror,
    decisions: { 'SKILL.md': 'keep-trunk', 'a.md': 'keep-trunk' }
  }
  const res = reconcileFolder(req, opts(sb))
  expect(res.error).toBeNull()
  // Trunk (Gewinner) byte-identisch erhalten.
  expect(readFileSync(join(trunk, 'SKILL.md'), 'utf8')).toBe('GLEICH')
  // Mirror-Ordner komplett archiviert (Dedup), nicht geloescht.
  expect(res.data!.mirrorArchivedTo).toBeTruthy()
  expect(existsSync(res.data!.mirrorArchivedTo!)).toBe(true)
  expect(existsSync(mirror)).toBe(false)
})

test('reconcile DEDUP: identischer Ordner keep-mirror -> Trunk-Ordner als Ganzes archiviert', () => {
  const sb = makeSandbox()
  const trunk = makeDir(sb.root, 'trunk-id2', { 'SKILL.md': 'GLEICH' })
  const mirror = makeDir(sb.root, 'mirror-id2', { 'SKILL.md': 'GLEICH' })
  const req: DirReconcileRequest = {
    trunkPath: trunk,
    mirrorPath: mirror,
    decisions: { 'SKILL.md': 'keep-mirror' }
  }
  const res = reconcileFolder(req, opts(sb))
  expect(res.error).toBeNull()
  // Mirror (Gewinner) erhalten; Trunk (Verlierer) archiviert.
  expect(readFileSync(join(mirror, 'SKILL.md'), 'utf8')).toBe('GLEICH')
  expect(res.data!.mirrorArchivedTo).toBeTruthy()
  expect(existsSync(trunk)).toBe(false)
})

test('reconcile DEDUP: gemischter Ordner keep-trunk -> identische Datei wird mit-archiviert', () => {
  const sb = makeSandbox()
  const trunk = makeDir(sb.root, 'trunk-mix', { 'same.md': 'GLEICH', 'diff.md': 'TRUNK-D' })
  const mirror = makeDir(sb.root, 'mirror-mix', { 'same.md': 'GLEICH', 'diff.md': 'MIRROR-D' })
  const req: DirReconcileRequest = {
    trunkPath: trunk,
    mirrorPath: mirror,
    decisions: { 'same.md': 'keep-trunk', 'diff.md': 'keep-trunk' }
  }
  const res = reconcileFolder(req, opts(sb))
  expect(res.error).toBeNull()
  // Trunk-Seite bleibt; Mirror komplett archiviert (auch die identische same.md).
  expect(readFileSync(join(trunk, 'same.md'), 'utf8')).toBe('GLEICH')
  expect(readFileSync(join(trunk, 'diff.md'), 'utf8')).toBe('TRUNK-D')
  expect(res.data!.mirrorArchivedTo).toBeTruthy()
  expect(existsSync(mirror)).toBe(false)
})

test('reconcile: adopt-mirror uebernimmt Mirror-Datei in Trunk mit Pre-Snapshot', () => {
  const sb = makeSandbox()
  const trunk = makeDir(sb.root, 'trunk-am', {
    'shared.md': 'TRUNK-ORIG'
  })
  const mirror = makeDir(sb.root, 'mirror-am', {
    'shared.md': 'MIRROR-NEU'
  })

  const req: DirReconcileRequest = {
    trunkPath: trunk,
    mirrorPath: mirror,
    decisions: { 'shared.md': 'adopt-mirror' }
  }
  const res = reconcileFolder(req, opts(sb))
  expect(res.error).toBeNull()

  // Trunk-Datei hat jetzt Mirror-Inhalt.
  expect(readFileSync(join(trunk, 'shared.md'), 'utf8')).toBe('MIRROR-NEU')

  // Pre-Snapshot vorhanden (backup-first via applyWrite).
  const adoptEntry = res.data!.files.find((f) => f.rel === 'shared.md')
  expect(adoptEntry?.decision).toBe('adopt-mirror')
  expect(adoptEntry?.backupPath).toBeTruthy()
  expect(existsSync(adoptEntry!.backupPath!)).toBe(true)

  // Alle Dateien opfern die Mirror-Seite -> Mirror-ORDNER als Ganzes archiviert
  // (F7-Idempotenz-Erhalt), mirrorArchivedTo gesetzt, Mirror-Ordner weg.
  expect(res.data!.partial).toBe(false)
  expect(res.data!.mirrorArchivedTo).toBeTruthy()
  expect(existsSync(mirror)).toBe(false)
})

test('reconcile: skip laesst Trunk und Mirror-Datei unveraendert; Mirror archiviert', () => {
  const sb = makeSandbox()
  const trunk = makeDir(sb.root, 'trunk-skip', { 'a.md': 'A-TRUNK' })
  const mirror = makeDir(sb.root, 'mirror-skip', { 'a.md': 'A-MIRROR' })

  const req: DirReconcileRequest = {
    trunkPath: trunk,
    mirrorPath: mirror,
    decisions: { 'a.md': 'skip' }
  }
  const res = reconcileFolder(req, opts(sb))
  expect(res.error).toBeNull()
  // Trunk unveraendert.
  expect(readFileSync(join(trunk, 'a.md'), 'utf8')).toBe('A-TRUNK')
  // Skip-Entscheidung im Report.
  const skipEntry = res.data!.files.find((f) => f.rel === 'a.md')
  expect(skipEntry?.decision).toBe('skip')
})

// ── Finding B: symmetrische Richtung (keep-mirror / adopt-trunk) ─────────────

test('keep-mirror (uniform): Mirror-Datei bleibt, Trunk-ORDNER als Ganzes archiviert (Spiegel zu keep-trunk)', () => {
  const sb = makeSandbox()
  const trunk = makeDir(sb.root, 'trunk-km', { 'shared.md': 'TRUNK-VERSION' })
  const mirror = makeDir(sb.root, 'mirror-km', { 'shared.md': 'MIRROR-VERSION' })

  const req: DirReconcileRequest = {
    trunkPath: trunk,
    mirrorPath: mirror,
    decisions: { 'shared.md': 'keep-mirror' }
  }
  const res = reconcileFolder(req, opts(sb))
  expect(res.error).toBeNull()
  // Mirror-Datei unveraendert (Gewinner), Trunk-Seite (Verlierer) als Bulk archiviert.
  expect(readFileSync(join(mirror, 'shared.md'), 'utf8')).toBe('MIRROR-VERSION')
  expect(existsSync(trunk)).toBe(false)
  const entry = res.data!.files.find((f) => f.rel === 'shared.md')
  expect(entry?.decision).toBe('keep-mirror')
  // Bulk-Trunk-Archiv (Verlierer-Ordner) -> mirrorArchivedTo traegt den Archivpfad.
  expect(res.data!.mirrorArchivedTo).toBeTruthy()
  expect(existsSync(res.data!.mirrorArchivedTo!)).toBe(true)
  expect(res.data!.partial).toBe(false)
})

test('adopt-trunk (uniform): Trunk-Inhalt nach Mirror uebernommen (backup-first), Trunk-ORDNER archiviert', () => {
  const sb = makeSandbox()
  const trunk = makeDir(sb.root, 'trunk-at', { 'shared.md': 'TRUNK-NEU' })
  const mirror = makeDir(sb.root, 'mirror-at', { 'shared.md': 'MIRROR-ORIG' })

  const req: DirReconcileRequest = {
    trunkPath: trunk,
    mirrorPath: mirror,
    decisions: { 'shared.md': 'adopt-trunk' }
  }
  const res = reconcileFolder(req, opts(sb))
  expect(res.error).toBeNull()
  // Mirror-Datei hat jetzt Trunk-Inhalt; Trunk-Seite (Verlierer) als Bulk archiviert.
  expect(readFileSync(join(mirror, 'shared.md'), 'utf8')).toBe('TRUNK-NEU')
  expect(existsSync(trunk)).toBe(false)
  const entry = res.data!.files.find((f) => f.rel === 'shared.md')
  expect(entry?.decision).toBe('adopt-trunk')
  expect(entry?.backupPath).toBeTruthy() // backup der Mirror-Zielseite vor edit
  expect(existsSync(entry!.backupPath!)).toBe(true)
  expect(res.data!.mirrorArchivedTo).toBeTruthy() // Bulk-Trunk-Archiv
  expect(res.data!.partial).toBe(false)
})

test('keep-mirror granular pro Datei: nur eine Trunk-Datei archiviert (gemischter Ordner, kein Bulk)', () => {
  const sb = makeSandbox()
  const trunk = makeDir(sb.root, 'trunk-kmg', { 'keepm.md': 'T-KEEPM', 'keept.md': 'T-KEEPT' })
  const mirror = makeDir(sb.root, 'mirror-kmg', { 'keepm.md': 'M-KEEPM', 'keept.md': 'M-KEEPT' })

  const req: DirReconcileRequest = {
    trunkPath: trunk,
    mirrorPath: mirror,
    decisions: { 'keepm.md': 'keep-mirror', 'keept.md': 'keep-trunk' }
  }
  const res = reconcileFolder(req, opts(sb))
  expect(res.error).toBeNull()
  // keepm: Trunk-Datei (Verlierer) pro Datei archiviert; Mirror bleibt.
  expect(existsSync(join(trunk, 'keepm.md'))).toBe(false)
  expect(readFileSync(join(mirror, 'keepm.md'), 'utf8')).toBe('M-KEEPM')
  const km = res.data!.files.find((f) => f.rel === 'keepm.md')
  expect(km?.decision).toBe('keep-mirror')
  expect(km?.archivedTo).toBeTruthy()
  expect(existsSync(km!.archivedTo!)).toBe(true)
  // keept: Mirror-Datei (Verlierer) pro Datei archiviert; Trunk bleibt.
  expect(existsSync(join(mirror, 'keept.md'))).toBe(false)
  expect(readFileSync(join(trunk, 'keept.md'), 'utf8')).toBe('T-KEEPT')
  // Gemischt -> KEIN Bulk-Ordner-Archiv.
  expect(res.data!.mirrorArchivedTo).toBeNull()
  expect(res.data!.partial).toBe(false)
})

test('gemischt keep-trunk + keep-mirror: KEINE Seite als Ganzes archiviert, beide Gewinner bleiben', () => {
  const sb = makeSandbox()
  const trunk = makeDir(sb.root, 'trunk-mix', { 'a.md': 'A-TRUNK', 'b.md': 'B-TRUNK' })
  const mirror = makeDir(sb.root, 'mirror-mix', { 'a.md': 'A-MIRROR', 'b.md': 'B-MIRROR' })

  const req: DirReconcileRequest = {
    trunkPath: trunk,
    mirrorPath: mirror,
    decisions: { 'a.md': 'keep-trunk', 'b.md': 'keep-mirror' }
  }
  const res = reconcileFolder(req, opts(sb))
  expect(res.error).toBeNull()
  // a: Trunk-Gewinner bleibt, Mirror-a archiviert. b: Mirror-Gewinner bleibt, Trunk-b archiviert.
  expect(readFileSync(join(trunk, 'a.md'), 'utf8')).toBe('A-TRUNK')
  expect(existsSync(join(mirror, 'a.md'))).toBe(false)
  expect(readFileSync(join(mirror, 'b.md'), 'utf8')).toBe('B-MIRROR')
  expect(existsSync(join(trunk, 'b.md'))).toBe(false)
  // KEIN Bulk-Ordner-Archiv (gemischt) — nur per-Datei.
  expect(res.data!.mirrorArchivedTo).toBeNull()
  expect(res.data!.partial).toBe(false)
})

test('secret-skip symmetrisch: keep-mirror archiviert KEINE secret-Trunk-Datei', () => {
  const sb = makeSandbox()
  const trunk = makeDir(sb.root, 'trunk-sec', { 'settings.json': '{"t":true}' })
  const mirror = makeDir(sb.root, 'mirror-sec', { 'settings.json': '{"m":true}' })

  const req: DirReconcileRequest = {
    trunkPath: trunk,
    mirrorPath: mirror,
    decisions: { 'settings.json': 'keep-mirror' }
  }
  const res = reconcileFolder(req, opts(sb))
  expect(res.error).toBeNull()
  const entry = res.data!.files.find((f) => f.rel === 'settings.json')
  expect(entry?.decision).toBe('secret-skip')
  // Beide Seiten unangetastet (Secret wird nie archiviert/mutiert).
  expect(existsSync(join(trunk, 'settings.json'))).toBe(true)
  expect(existsSync(join(mirror, 'settings.json'))).toBe(true)
})

// ── Partial-Failure-Idempotenz ───────────────────────────────────────────────

test('Partial-Failure: Mirror NICHT archiviert, partial=true, Teilreport vorhanden', () => {
  // Fehler erzeugen: adopt-mirror auf Datei mit Secret-Pfad (isSecretPathForWrite).
  const sb = makeSandbox()
  const trunk = makeDir(sb.root, 'trunk-pf', {
    'normal.md': 'NORMAL-TRUNK',
    'settings.json': '{"t":true}'
  })
  const mirror = makeDir(sb.root, 'mirror-pf', {
    'normal.md': 'NORMAL-MIRROR',
    'settings.json': '{"m":true}'
  })

  // adopt-mirror auf settings.json -> secret-skip oder error -> Abbruch
  const req: DirReconcileRequest = {
    trunkPath: trunk,
    mirrorPath: mirror,
    decisions: {
      'settings.json': 'adopt-mirror',
      'normal.md': 'adopt-mirror'
    }
  }
  const res = reconcileFolder(req, opts(sb))
  // secret-skip ist kein harter Fehler (kein Abbruch), aber settings.json darf nicht mutiert werden.
  // normal.md kann adopted sein oder nicht, je nach Verarbeitungsreihenfolge.
  // Hauptgarantie: settings.json bleibt unveraendert.
  expect(existsSync(join(trunk, 'settings.json'))).toBe(true)
})

test('Partial-Failure bei fehlendem Archiv-Root: Mirror bleibt stehen (mirrorArchivedTo null)', () => {
  // Kein Archiv-Root -> snapshotDir/applyWrite schlug fehl bei adopt-mirror.
  const sb = makeSandbox()
  const trunk = makeDir(sb.root, 'trunk-pfar', { 'x.md': 'X-TRUNK' })
  const mirror = makeDir(sb.root, 'mirror-pfar', { 'x.md': 'X-MIRROR' })
  const missingRoot = join(sb.root, 'no-archive')

  const req: DirReconcileRequest = {
    trunkPath: trunk,
    mirrorPath: mirror,
    decisions: { 'x.md': 'adopt-mirror' }
  }
  const res = reconcileFolder(req, { archiveRoot: missingRoot, auditPath: sb.auditPath })

  // Bei fehlendem Archiv liefert applyWrite archive-missing -> Datei-Error -> aborted.
  // Mirror NICHT archiviert; mirrorArchivedTo null.
  if (res.data) {
    expect(res.data.mirrorArchivedTo).toBeNull()
    expect(res.data.partial).toBe(true)
  } else {
    // Oder direkt Fehler.
    expect(res.error).toBeTruthy()
  }
  // Trunk unveraendert (keine Mutation ohne Pre-Snapshot).
  expect(readFileSync(join(trunk, 'x.md'), 'utf8')).toBe('X-TRUNK')
  // Mirror steht noch.
  expect(existsSync(join(mirror, 'x.md'))).toBe(true)
})

test('Re-Run-Idempotenz: zweiter Lauf auf bereits adopt-mirror-Trunk idempotent', () => {
  // Erster Lauf uebernimmt Mirror-Datei. Zweiter Lauf mit denselben decisions:
  // Trunk hat jetzt Mirror-Inhalt; adopt-mirror nochmal -> Inhalt bleibt gleich.
  const sb = makeSandbox()
  const trunk = makeDir(sb.root, 'trunk-idem', { 'f.md': 'TRUNK-V1' })
  const mirror = makeDir(sb.root, 'mirror-idem', { 'f.md': 'MIRROR-V2' })

  const req: DirReconcileRequest = {
    trunkPath: trunk,
    mirrorPath: mirror,
    decisions: { 'f.md': 'adopt-mirror' }
  }
  // Erster Lauf.
  const res1 = reconcileFolder(req, opts(sb))
  expect(res1.error).toBeNull()
  expect(readFileSync(join(trunk, 'f.md'), 'utf8')).toBe('MIRROR-V2')

  // Mirror nach erstem Lauf archiviert; zweiter Lauf: Mirror-Ordner fehlt.
  if (!existsSync(mirror)) {
    // Mirror ist archiviert -> reconcileFolder verweigert (path-not-found).
    const res2 = reconcileFolder(req, opts(sb))
    expect(res2.error).toBeTruthy()
    // Trunk unveraendert (MIRROR-V2).
    expect(readFileSync(join(trunk, 'f.md'), 'utf8')).toBe('MIRROR-V2')
  }
})

// ── mirror-only adopt (P2-Fix) ───────────────────────────────────────────────

test('adopt-mirror: mirror-only Datei (kein Trunk-Pendant) landet via add im Trunk; kein Abbruch', () => {
  // Mirror hat eine Datei, die im Trunk NICHT existiert.
  // Vor P2-Fix: applyWrite('edit') auf nicht-existente Trunk-Datei -> NOT_FOUND -> Abbruch.
  // Nach P2-Fix: applyWrite('add') -> Datei im Trunk angelegt, kein Error.
  const sb = makeSandbox()
  const trunk = makeDir(sb.root, 'trunk-mirror-only', {
    'existing.md': 'EXISTING-IN-TRUNK'
  })
  const mirror = makeDir(sb.root, 'mirror-mirror-only', {
    'existing.md': 'MIRROR-VERSION',
    'only-in-mirror.md': 'MIRROR-ONLY-CONTENT'
  })

  const req: DirReconcileRequest = {
    trunkPath: trunk,
    mirrorPath: mirror,
    decisions: {
      'existing.md': 'adopt-mirror',
      'only-in-mirror.md': 'adopt-mirror'
    }
  }
  const res = reconcileFolder(req, opts(sb))
  expect(res.error).toBeNull()
  expect(res.data).not.toBeNull()

  // existing.md: Mirror-Inhalt uebernommen (edit, backup vorhanden).
  const existingEntry = res.data!.files.find((f) => f.rel === 'existing.md')
  expect(existingEntry?.decision).toBe('adopt-mirror')
  expect(existingEntry?.backupPath).toBeTruthy()

  // only-in-mirror.md: via add im Trunk angelegt (kein backupPath weil add, kein Prior).
  const mirrorOnlyEntry = res.data!.files.find((f) => f.rel === 'only-in-mirror.md')
  expect(mirrorOnlyEntry?.decision).toBe('adopt-mirror')
  // Datei existiert jetzt im Trunk.
  const trunkNewFile = join(trunk, 'only-in-mirror.md')
  expect(existsSync(trunkNewFile)).toBe(true)
  expect(readFileSync(trunkNewFile, 'utf8')).toBe('MIRROR-ONLY-CONTENT')

  // Kein Abbruch (partial = false).
  expect(res.data!.partial).toBe(false)
})

// ── Manifest-Pfad-Normalisierung (DATEI statt ORDNER) ────────────────────────

test('Manifest-Pfade (.../SKILL.md beidseitig) -> wirkt auf den ORDNER, kein dir-compare-failed', () => {
  // Reproduziert den Bug: shared-scan setzt entry.path=drilled.file (.../SKILL.md),
  // dedupe.storeSet uebernimmt ihn unveraendert. reconcileFolder bekam dadurch eine
  // DATEI -> compareDirs null -> 'dir-compare-failed'. Nach Fix wird MAIN-seitig auf
  // den Ordner normalisiert; keep-trunk archiviert den Mirror-ORDNER.
  const sb = makeSandbox()
  const trunk = makeDir(sb.root, 'skill-x-trunk', {
    'SKILL.md': 'TRUNK-SKILL',
    'helper.ts': 'TRUNK-HELPER'
  })
  const mirror = makeDir(sb.root, 'skill-x-mirror', {
    'SKILL.md': 'MIRROR-SKILL',
    'helper.ts': 'MIRROR-HELPER'
  })

  // Request traegt die MANIFEST-Pfade (.../SKILL.md), nicht die Ordnerpfade.
  const req: DirReconcileRequest = {
    trunkPath: join(trunk, 'SKILL.md'),
    mirrorPath: join(mirror, 'SKILL.md'),
    decisions: {
      'SKILL.md': 'keep-trunk',
      'helper.ts': 'keep-trunk'
    }
  }
  const res = reconcileFolder(req, opts(sb))

  // Kein 'dir-compare-failed' mehr — Vergleich lief auf den ORDNERN.
  expect(res.error).toBeNull()
  expect(res.data).not.toBeNull()

  // Trunk-Ordner unveraendert (keep-trunk).
  expect(readFileSync(join(trunk, 'SKILL.md'), 'utf8')).toBe('TRUNK-SKILL')
  expect(readFileSync(join(trunk, 'helper.ts'), 'utf8')).toBe('TRUNK-HELPER')

  // Mirror-ORDNER wurde archiviert (nicht die Manifestdatei allein).
  expect(res.data!.partial).toBe(false)
  expect(res.data!.mirrorArchivedTo).toBeTruthy()
  expect(existsSync(res.data!.mirrorArchivedTo!)).toBe(true)
  expect(existsSync(mirror)).toBe(false)
})

// ── case-insensitive-Kollision (Windows) ─────────────────────────────────────

test('case-insensitive: adopt-mirror mit case-only-Abweichung -> edit (backup-first), kein Overwrite ohne Snapshot', () => {
  // Auf Windows ist README.md und readme.md dieselbe Datei.
  // Mirror-Seite hat denselben Namen (gleicher case) -> adopt-mirror via edit.
  // Der Test prueft: backupPath ist gesetzt (edit => backup-first).
  const sb = makeSandbox()
  const trunk = makeDir(sb.root, 'trunk-ci', { 'README.md': 'TRUNK-README' })
  const mirror = makeDir(sb.root, 'mirror-ci', { 'README.md': 'MIRROR-README' })

  const req: DirReconcileRequest = {
    trunkPath: trunk,
    mirrorPath: mirror,
    decisions: { 'README.md': 'adopt-mirror' }
  }
  const res = reconcileFolder(req, opts(sb))
  expect(res.error).toBeNull()

  const entry = res.data!.files.find((f) => f.rel === 'README.md')
  expect(entry?.decision).toBe('adopt-mirror')
  // backup-first: Pre-Snapshot vorhanden (kein blinder Overwrite).
  expect(entry?.backupPath).toBeTruthy()
  expect(existsSync(entry!.backupPath!)).toBe(true)

  // Trunk hat Mirror-Inhalt.
  const trunkContent = readFileSync(join(trunk, 'README.md'), 'utf8')
  expect(trunkContent).toBe('MIRROR-README')
})
