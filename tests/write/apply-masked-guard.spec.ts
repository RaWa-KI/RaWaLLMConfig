// apply-masked-guard.spec.ts — WP21 No-Data-Loss-Zweitlinie im Main
// (TEST-MITTEL-02/A10): ein edit auf einem Secret-WERT-Pfad, dessen Inhalt
// EXAKT maskSecrets(Disk) entspricht, wird abgewiesen — selbst wenn der
// Renderer-Guard (OverviewEditor) versagt. Owner-Override-Beweis: KEIN
// •••-Sentinel — eine Nicht-Secret-.md MIT •••-Zeichen bleibt speicherbar.
import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { applyWrite } from '../../src/main/services/apply'
import { maskSecrets } from '../../src/main/services/secret-mask'
import { makeSandbox, seedFile } from './fixtures'
import type { Sandbox } from './fixtures'

// Optionen fuer applyWrite immer mit Sandbox-Pfaden (nie real).
function opts(sb: Sandbox): { archiveRoot: string; auditPath: string } {
  return { archiveRoot: sb.archiveRoot, auditPath: sb.auditPath }
}

// Secret-WERT-Fixture (settings.json mit apiKey) — Test-Dummy, kein echtes Secret.
const SECRET_JSON = JSON.stringify(
  { apiKey: 'sk-test-dummy-abc123def456', host: 'localhost' },
  null,
  2
)

test('Zweitlinie: edit mit exakt maskSecrets(Disk) auf Secret-Pfad wird abgewiesen', () => {
  const sb = makeSandbox()
  const target = seedFile(sb, 'settings.json', SECRET_JSON)
  const { masked, maskedCount } = maskSecrets(SECRET_JSON, target)
  expect(maskedCount).toBeGreaterThan(0) // Fixture traegt wirklich maskierte Stellen
  const res = applyWrite(
    { action: 'edit', path: target, content: masked, ownerEdit: true },
    opts(sb)
  )
  expect(res.error).toBe('masked-content-no-data-loss')
  // Disk byte-identisch (kein •••-Overwrite, kein Datenverlust).
  expect(readFileSync(target, 'utf8')).toBe(SECRET_JSON)
  // Audit-error-Eintrag geschrieben (fail()-Pfad).
  const audit = readFileSync(sb.auditPath, 'utf8')
  expect(audit).toContain('"result":"error"')
  expect(audit).toContain('masked-content-no-data-loss')
})

test('Kontrolle: edit derselben Secret-Datei mit neuem ECHTEM Inhalt geht durch', () => {
  const sb = makeSandbox()
  const target = seedFile(sb, 'settings.json', SECRET_JSON)
  const neu = JSON.stringify(
    { apiKey: 'sk-test-dummy-NEU-999zzz888yyy', host: 'localhost' },
    null,
    2
  )
  const res = applyWrite(
    { action: 'edit', path: target, content: neu, ownerEdit: true },
    opts(sb)
  )
  expect(res.error).toBeNull() // kein False Positive — legitimer Owner-Edit
  expect(readFileSync(target, 'utf8')).toBe(neu)
  expect(res.data!.backupPath).toBeTruthy() // backup-first bleibt
})

test('Owner-Override: NICHT-Secret-.md MIT •••-Zeichen bleibt speicherbar (kein Sentinel)', () => {
  const sb = makeSandbox()
  const target = seedFile(sb, 'notizen.md', '# Doku\n\nAlter Stand.\n')
  const inhalt = '# Doku\n\nMaskierungszeichen in Doku: ••• und nochmal •••\n'
  const res = applyWrite({ action: 'edit', path: target, content: inhalt }, opts(sb))
  expect(res.error).toBeNull() // ••• im Inhalt blockt NIE eine Nicht-Secret-Datei
  expect(readFileSync(target, 'utf8')).toBe(inhalt)
})

test('CRLF-Variante: CRLF-normalisierter masked-Inhalt gegen CRLF-Disk wird abgewiesen', () => {
  const sb = makeSandbox()
  // Disk mit CRLF-Zeilenenden; maskSecrets (JSON-Pfad) liefert LF-joint —
  // ein Editor, der die Anzeige auf CRLF zurueckdreht, darf den Guard nicht umgehen.
  const crlfDisk = SECRET_JSON.replace(/\n/g, '\r\n')
  const target = seedFile(sb, 'settings.json', crlfDisk)
  const { masked, maskedCount } = maskSecrets(crlfDisk, target)
  expect(maskedCount).toBeGreaterThan(0)
  const crlfMasked = masked.replace(/\n/g, '\r\n') // Zeilenenden-Drift simulieren
  expect(crlfMasked).not.toBe(masked) // wirklich abweichende Variante
  const res = applyWrite(
    { action: 'edit', path: target, content: crlfMasked, ownerEdit: true },
    opts(sb)
  )
  expect(res.error).toBe('masked-content-no-data-loss')
  expect(readFileSync(target, 'utf8')).toBe(crlfDisk) // Disk unveraendert (byte-identisch)
})
