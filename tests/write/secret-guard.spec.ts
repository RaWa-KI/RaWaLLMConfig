// secret-guard.spec.ts — Read/Write-Split-Tests (P1-Fix) + readFull-Anzeige-
// Verhalten (Owner-Override). Zwei Strengen ueber einer Basis: isSecretPathForRead
// (NUR echte Secret-WERT-Klassen, Doku sichtbar) und isSecretPathForWrite (= ForRead
// ODER Basename-Wortheuristik, paranoid). Garantie ForWrite ⊇ ForRead wird
// mitgeprueft. Der zweite Block prueft das NEUE Read-Seite-Verhalten: Secret-Klasse
// wird MASKIERT angezeigt (nicht mehr hart geblockt), reveal liefert roh + Audit
// 'readfull-reveal' (nur Pfad). Read-Verhalten nutzt dieselbe Komposition wie
// buildReadFullResult (isSecretPathForRead + maskSecrets bzw. reveal + appendAudit).
// Write-Seite (assertWritable) ist per DEFAULT strikt: secret-bearing -> geblockt,
// damit Bulk-/Ordner-/Reconcile-/Rename-/Move-Pfade secret-skip behalten. NUR mit
// dem expliziten Opt-in `{ ownerEdit: true }` UND aktivem Schreibmodus ist die
// Secret-Klasse owner-schreibbar (Owner-Override [[app-zeigt-secrets-lokal-owner-override]],
// nur fuer den owner-initiierten Einzeldatei-Content-Edit).
import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import {
  assertWritable,
  isSecretPathForRead,
  isSecretPathForWrite,
  SECRET_DENY_REASON
} from '../../src/main/services/secret-guard'
import { setWriteEnabledRuntime } from '../../src/main/services/write-mode'
import { makeSandbox, seedFile } from './fixtures'
import {
  DOC_EDITABLE_PATHS,
  readAudit,
  readFullBehavior,
  READ_VISIBLE_PATHS,
  SAFE_PATHS,
  SECRET_VALUE_PATHS,
  withWriteMode
} from './secret-guard-fixtures'

// Defensive Test-Isolation: jeden Test mit neutralem runtimeFlag (Env-Fallback)
// starten, falls ein paralleler Spec im selben Worker den globalen In-App-Toggle
// gesetzt zurueckgelassen hat (Flaky-Schutz, vgl. write-mode.spec Cache-Restore).
test.beforeEach(() => setWriteEnabledRuntime(null))

test('echte Secret-WERT-Pfade sind read UND write secret-bearing (Default-strikt)', () => {
  for (const p of SECRET_VALUE_PATHS) {
    expect(isSecretPathForRead(p), `ForRead sollte true sein: ${p}`).toBe(true)
    expect(isSecretPathForWrite(p), `ForWrite sollte true sein: ${p}`).toBe(true)
    // Default (kein ownerEdit) -> strikt geblockt (Bulk-/Ordner-/Move-Pfade).
    const v = assertWritable(p)
    expect(v.writable, `writable sollte false sein: ${p}`).toBe(false)
    expect(v.reason).toBe(SECRET_DENY_REASON)
  }
})

test('Nicht-Markdown mit Secret-Wort: READ-sichtbar, aber WRITE-verweigert (Wortheuristik)', () => {
  for (const p of READ_VISIBLE_PATHS) {
    // Read zeigt die Datei an (keine Secret-WERT-Klasse).
    expect(isSecretPathForRead(p), `ForRead sollte false sein: ${p}`).toBe(false)
    // Write bleibt streng: Wort-Basename (Nicht-.md) -> verweigert (Default, kein ownerEdit).
    expect(isSecretPathForWrite(p), `ForWrite sollte true sein: ${p}`).toBe(true)
    const v = assertWritable(p)
    expect(v.writable, `writable sollte false sein: ${p}`).toBe(false)
    expect(v.reason).toBe(SECRET_DENY_REASON)
  }
})

test('Markdown-Doku ist editierbar trotz Secret-Wort im Namen (Owner-Override)', () => {
  for (const p of DOC_EDITABLE_PATHS) {
    // Read zeigt die Doku an (keine Secret-WERT-Klasse).
    expect(isSecretPathForRead(p), `ForRead sollte false sein: ${p}`).toBe(false)
    // Write: .md/.markdown/.mdx ueberspringt die Wortheuristik -> editierbar.
    expect(isSecretPathForWrite(p), `ForWrite sollte false sein: ${p}`).toBe(false)
    const v = assertWritable(p)
    expect(v.writable, `writable sollte true sein: ${p}`).toBe(true)
    expect(v.reason).toBeNull()
  }
})

test('ownerEdit-Opt-in: Secret-Klasse owner-schreibbar nur bei Schreibmodus AN', () => {
  for (const p of SECRET_VALUE_PATHS) {
    // ownerEdit + Schreibmodus AN -> owner-schreibbar (Owner-Override).
    withWriteMode(true, () => {
      const v = assertWritable(p, { ownerEdit: true })
      expect(v.writable, `ownerEdit+AN sollte true sein: ${p}`).toBe(true)
      expect(v.reason).toBeNull()
    })
    // ownerEdit + Schreibmodus AUS -> weiter geblockt (kein Bypass des Opt-outs).
    withWriteMode(false, () => {
      const v = assertWritable(p, { ownerEdit: true })
      expect(v.writable, `ownerEdit+AUS sollte false sein: ${p}`).toBe(false)
      expect(v.reason).toBe(SECRET_DENY_REASON)
    })
    // Ohne ownerEdit bleibt es strikt geblockt, auch bei Schreibmodus AN.
    withWriteMode(true, () => {
      const v = assertWritable(p)
      expect(v.writable, `kein ownerEdit -> strikt geblockt: ${p}`).toBe(false)
      expect(v.reason).toBe(SECRET_DENY_REASON)
    })
  }
})

test('neutrale Doku ist BEIDE Seiten erlaubt (kein False-Positive)', () => {
  for (const p of SAFE_PATHS) {
    expect(isSecretPathForRead(p), `ForRead sollte false sein: ${p}`).toBe(false)
    expect(isSecretPathForWrite(p), `ForWrite sollte false sein: ${p}`).toBe(false)
    const v = assertWritable(p)
    expect(v.writable, `writable sollte true sein: ${p}`).toBe(true)
    expect(v.reason).toBeNull()
  }
})

test('ForWrite ist Obermenge von ForRead (Write nie schwaecher als Read)', () => {
  const all = [...SECRET_VALUE_PATHS, ...READ_VISIBLE_PATHS, ...DOC_EDITABLE_PATHS, ...SAFE_PATHS]
  for (const p of all) {
    if (isSecretPathForRead(p)) {
      expect(isSecretPathForWrite(p), `ForWrite muss ForRead enthalten: ${p}`).toBe(true)
    }
  }
})

// ── readFull-Anzeige-Verhalten (Owner-Override) ────────────────────────────
// Deutlich gefakter Dummy-Token (>=20 Z) in einem settings.json-Fixture.
const DUMMY_TOKEN = 'DUMMY-sk-zzzz9999yyyy8888xxxx7777'

// 11. readFull auf Secret-Klasse-Datei -> maskiert (Negativ-Match), count>0.
test('readFull Secret-Klasse: masked=true, Dummy-Wert NICHT im content', () => {
  const sb = makeSandbox()
  const file = seedFile(sb, 'settings.json', JSON.stringify({ apiKey: DUMMY_TOKEN, theme: 'dark' }))
  expect(isSecretPathForRead(file), 'settings.json muss Secret-Klasse sein').toBe(true)
  const raw = readFileSync(file, 'utf8')
  const r = readFullBehavior(file, raw, false, sb.auditPath)
  expect(r.masked).toBe(true)
  expect(r.maskedCount).toBeGreaterThan(0)
  expect(r.content).not.toContain(DUMMY_TOKEN) // Negativ-Match
  expect(r.content).toContain('"theme": "dark"') // Nicht-Secret bleibt sichtbar
})

// 12. readFull reveal:true -> roher Inhalt; Audit 'readfull-reveal' mit Pfad,
//     Dummy-Wert NICHT im Log (Audit protokolliert nur Basename/Aktion).
test('readFull reveal: roher Inhalt + Audit readfull-reveal ohne Wert', () => {
  const sb = makeSandbox()
  const file = seedFile(sb, 'settings.json', JSON.stringify({ token: DUMMY_TOKEN }))
  const raw = readFileSync(file, 'utf8')
  const r = readFullBehavior(file, raw, true, sb.auditPath)
  expect(r.masked).toBe(false)
  expect(r.content).toContain(DUMMY_TOKEN) // reveal -> roh
  const audit = readAudit(sb.auditPath)
  expect(audit).toContain('"action":"readfull-reveal"')
  expect(audit).toContain('"path":"settings.json"') // nur Basename, kein Verzeichnis
  expect(audit).not.toContain(DUMMY_TOKEN) // KEIN Secret-Wert im Log
})

// 13. Write-Seite Default-strikt: Secret-Klasse-Datei bleibt ohne ownerEdit
//     schreib-geblockt (Bulk-/Ordner-/Reconcile-/Rename-/Move-Pfade nutzen diesen
//     Default). Der owner-initiierte Einzeldatei-Edit nutzt das ownerEdit-Opt-in
//     (eigener Test oben); der Datenverlust-Schutz haengt nicht an diesem Guard.
test('Write-Seite Secret-Klasse bleibt geblockt (Default, kein ownerEdit)', () => {
  const sb = makeSandbox()
  const file = seedFile(sb, 'settings.json', '{}')
  const v = assertWritable(file)
  expect(v.writable).toBe(false)
  expect(v.reason).toBe(SECRET_DENY_REASON)
})

// 14. Nicht-Secret-Datei: readFull liefert roh, masked nicht gesetzt/false.
test('readFull Nicht-Secret-Datei: roh, masked=false', () => {
  const sb = makeSandbox()
  const body = '# Doku\nKein Secret hier, nur Text.\n'
  const file = seedFile(sb, 'NOTES.md', body)
  expect(isSecretPathForRead(file)).toBe(false)
  const raw = readFileSync(file, 'utf8')
  const r = readFullBehavior(file, raw, false, sb.auditPath)
  expect(r.masked).toBe(false)
  expect(r.maskedCount).toBe(0)
  expect(r.content).toBe(body) // byte-identisch roh
})

// 15. Defense-in-Depth: NICHT-secret-klassifizierte Datei (notes.md) mit NACKTEM
//     Inline-Credential -> readFull maskiert trotzdem (masked=true), Dummy NICHT
//     im content. Gegenprobe: harmlose .md ohne Credential bleibt byte-roh.
test('readFull Nicht-Secret-Pfad mit nacktem Credential: maskiert (Defense-in-Depth)', () => {
  const sb = makeSandbox()
  // notes.md ist KEINE Secret-Klasse (ForRead false), traegt aber einen nackten Token.
  const body = `# Notizen\napi_key = ${DUMMY_TOKEN}\nharmloser Text danach\n`
  const file = seedFile(sb, 'notes.md', body)
  expect(isSecretPathForRead(file), 'notes.md darf KEINE Secret-Klasse sein').toBe(false)
  const raw = readFileSync(file, 'utf8')
  const r = readFullBehavior(file, raw, false, sb.auditPath)
  expect(r.masked, 'nackter Credential im Nicht-Secret-Pfad muss maskieren').toBe(true)
  expect(r.maskedCount).toBeGreaterThan(0)
  expect(r.content).not.toContain(DUMMY_TOKEN) // Wert verlaesst die Bridge NICHT
  expect(r.content).toContain('harmloser Text danach') // Nicht-Secret-Zeile bleibt

  // Gegenprobe: harmlose Doku OHNE Credential bleibt roh/unmaskiert.
  const safeBody = '# Notizen\nNur Prosa, kein Geheimnis.\nNoch eine Zeile.\n'
  const safeFile = seedFile(sb, 'plain.md', safeBody)
  expect(isSecretPathForRead(safeFile)).toBe(false)
  const safeRaw = readFileSync(safeFile, 'utf8')
  const sr = readFullBehavior(safeFile, safeRaw, false, sb.auditPath)
  expect(sr.masked).toBe(false)
  expect(sr.maskedCount).toBe(0)
  expect(sr.content).toBe(safeBody) // byte-identisch roh
})
