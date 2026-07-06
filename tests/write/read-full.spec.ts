// read-full.spec.ts — Specs fuer den geteilten readFull-Kern (WP11,
// ARCH-MITTEL-01): services/read-full.ts bedient config:readFull
// (credential:true) und sys:watcherReadFull (credential:false). Getestet wird
// die Pipeline (invalid-request/nicht-gefunden/ordner/zu-gross/Maskierung/
// Reveal+Audit) NUR gegen die temp-Sandbox (fixtures.ts) — nie reale Configs.
// Alle "Secret"-Werte hier sind erfundene Test-Fixtures, keine echten Werte.
import { test, expect } from '@playwright/test'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { readFullCore, MAX_READFULL_BYTES } from '../../src/main/services/read-full'
import { makeSandbox, seedFile, sandboxPath } from './fixtures'

test('invalid-request: leerer/fehlender Pfad wird abgelehnt', () => {
  expect(readFullCore({ path: '' }, { credential: true }).error).toBe('invalid-request')
  expect(
    readFullCore(undefined as unknown as { path: string }, { credential: false }).error
  ).toBe('invalid-request')
})

test('Datei > 2 MB -> zu-gross:<Groesse> (F8-Guard, beide Pfade)', () => {
  const sb = makeSandbox()
  const big = join(sb.configDir, 'model.gguf')
  writeFileSync(big, 'a'.repeat(MAX_READFULL_BYTES + 1), 'utf8')
  // credential:false = watcher-Pfad — der Guard gilt jetzt AUCH dort (WP11).
  const res = readFullCore({ path: big }, { credential: false })
  expect(res.data).toBeNull()
  expect(res.error?.startsWith('zu-gross:')).toBe(true)
  // config-Pfad identisch.
  expect(readFullCore({ path: big }, { credential: true }).error?.startsWith('zu-gross:')).toBe(true)
})

test('Ordner -> distinkter Fehler "ordner"', () => {
  const sb = makeSandbox()
  const res = readFullCore({ path: sb.configDir }, { credential: true })
  expect(res.data).toBeNull()
  expect(res.error).toBe('ordner')
})

test('Fehlender Pfad -> distinkter Fehler "nicht-gefunden"', () => {
  const sb = makeSandbox()
  const res = readFullCore({ path: sandboxPath(sb, 'gibt-es-nicht.md') }, { credential: false })
  expect(res.data).toBeNull()
  expect(res.error).toBe('nicht-gefunden')
})

test('Normale .md -> roher Inhalt, masked=false; credential nur bei opts.credential=true', () => {
  const sb = makeSandbox()
  const p = seedFile(sb, 'notizen.md', '# Notizen\n\nNur Doku, kein Secret.\n')
  // config:readFull-Pfad: credential-Meta vorhanden (Env-Migrations-Hinweis).
  const withCred = readFullCore({ path: p }, { credential: true })
  expect(withCred.error).toBeNull()
  expect(withCred.data?.content).toBe('# Notizen\n\nNur Doku, kein Secret.\n')
  expect(withCred.data?.masked).toBe(false)
  expect(withCred.data?.maskedCount).toBe(0)
  expect(withCred.data?.credential).toBeDefined()
  expect(withCred.data?.credential?.hasSecret).toBe(false)
  // watcher-Pfad: Shape unveraendert — KEINE credential-Meta.
  const noCred = readFullCore({ path: p }, { credential: false })
  expect(noCred.error).toBeNull()
  expect(noCred.data?.content).toBe('# Notizen\n\nNur Doku, kein Secret.\n')
  expect(noCred.data?.credential).toBeUndefined()
})

test('Owner-Editor: settings.json wird ohne Reveal roh geliefert', () => {
  const sb = makeSandbox()
  const raw = '{\n  "apiToken": "fixture123fixture456fixture789",\n  "theme": "dark"\n}\n'
  const p = seedFile(sb, 'settings.json', raw)

  const res = readFullCore({ path: p }, { credential: true, auditPath: sb.auditPath })
  expect(res.error).toBeNull()
  expect(res.data?.masked).toBe(false)
  expect(res.data?.maskedCount).toBe(0)
  expect(res.data?.content).toBe(raw)
  expect(existsSync(sb.auditPath)).toBe(false)
})

test('Watcher-Pfad: Secret-Datei bleibt maskiert; reveal=true liefert roh + Audit-Zeile', () => {
  const sb = makeSandbox()
  // Fixture-Wert (erfunden): maskSecrets maskiert den apiToken-Blattwert.
  const raw = '{\n  "apiToken": "fixture123fixture456fixture789",\n  "theme": "dark"\n}\n'
  const p = seedFile(sb, 'settings.json', raw)
  // Ohne reveal: maskiert ANGEZEIGT (•••), kein roher Wert im Content.
  const masked = readFullCore({ path: p }, { credential: false, auditPath: sb.auditPath })
  expect(masked.error).toBeNull()
  expect(masked.data?.masked).toBe(true)
  expect(masked.data?.maskedCount).toBeGreaterThan(0)
  expect(masked.data?.content).not.toContain('fixture123fixture456fixture789')
  expect(masked.data?.content).toContain('•••')
  // Ohne reveal KEIN Audit-Eintrag.
  expect(existsSync(sb.auditPath)).toBe(false)
  // Mit reveal: roher Inhalt + wertfreie Audit-Zeile in opts.auditPath.
  const revealed = readFullCore(
    { path: p, reveal: true },
    { credential: false, auditPath: sb.auditPath }
  )
  expect(revealed.error).toBeNull()
  expect(revealed.data?.masked).toBe(false)
  expect(revealed.data?.content).toBe(raw)
  const audit = readFileSync(sb.auditPath, 'utf8')
  expect(audit).toContain('readfull-reveal')
  expect(audit).not.toContain('fixture123fixture456fixture789') // nie Wert im Audit
})
