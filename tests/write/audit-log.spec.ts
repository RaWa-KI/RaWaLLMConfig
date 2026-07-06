// audit-log.spec.ts — append-only, no-secret, kein overwrite. Gegen temp-Sandbox.
import { test, expect } from '@playwright/test'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { appendAudit, makeAuditEntry } from '../../src/main/services/audit-log'
import { makeSandbox } from './fixtures'

test('audit-log appendet Eintraege ohne Secret-Wert (kein overwrite)', () => {
  const sb = makeSandbox()
  const e1 = makeAuditEntry('edit', '/home/u/.claude/rules/foo.md', 'ok')
  const e2 = makeAuditEntry('archive', '/home/u/.claude/rules/bar.md', 'ok')
  expect(appendAudit(e1, sb.auditPath)).toBe(true)
  expect(appendAudit(e2, sb.auditPath)).toBe(true)

  const raw = readFileSync(sb.auditPath, 'utf8').trim()
  const lines = raw.split('\n')
  expect(lines.length).toBe(2) // append, nicht overwrite

  const r1 = JSON.parse(lines[0])
  expect(r1.action).toBe('edit')
  // Nur Basisname protokolliert, kein Verzeichnis-/Secret-Leak.
  expect(r1.path).toBe('foo.md')
  expect(r1.result).toBe('ok')
  expect(typeof r1.ts).toBe('string')
  // Kein Inhalts-/Secret-Feld vorhanden.
  expect(r1.content).toBeUndefined()
})

test('audit-log Append-Fehler wirft nicht (Mutation bleibt gueltig)', () => {
  // Parent ist eine DATEI -> mkdirSync/append schlaegt fehl. appendAudit gibt
  // false zurueck, wirft aber NICHT (committete Mutation bleibt gueltig).
  const sb = makeSandbox()
  const fileAsParent = join(sb.root, 'not-a-dir')
  writeFileSync(fileAsParent, 'x', 'utf8')
  const bad = join(fileAsParent, 'audit.ndjson')
  const e = makeAuditEntry('edit', 'x.md', 'ok')
  expect(() => appendAudit(e, bad)).not.toThrow()
  expect(appendAudit(e, bad)).toBe(false)
})
