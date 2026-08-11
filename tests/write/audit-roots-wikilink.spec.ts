// audit-roots-wikilink.spec.ts — WP-11 (B10): Wikilink-Sweep ueber ALLE
// Audit-Wurzeln (scope-begrenzt) mit root-uebergreifendem Aufloesungs-Index.
// Vor dem Fix ROT: buildAuditConfig nutzte nur projectRoot + sharedClaude
// (cross-root-False-Negatives) und lieferte pro Finding eine eigene Karte.
import { test, expect } from '@playwright/test'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import type { LlmConfig } from '../../shared/contract'
import { scanAllWikilinks } from '../../src/main/scan/reference-sweep'
import { buildAuditConfig } from '../../src/main/scan/scan-audit-categories'

function w(file: string, content: string): string {
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, content, 'utf8')
  return file
}

let tmp = ''
test.beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), 'rawallm-wiki-')) })
test.afterEach(() => { rmSync(tmp, { recursive: true, force: true }) })

test('B10: Link in Wurzel A auf Datei in Wurzel B loest auf (kein False-Negative)', () => {
  const a = join(tmp, 'a')
  const b = join(tmp, 'b')
  w(join(a, 'notiz.md'), 'siehe [[ziel-b]]\n')
  w(join(b, 'ziel-b.md'), '# Ziel\n')
  expect(scanAllWikilinks([a, b])).toEqual([])
})

test('B10: Top-Level-Markdown einer scope-begrenzten Wurzel ist als Linkziel sichtbar', () => {
  const a = join(tmp, 'a')
  const b = join(tmp, 'b')
  w(join(a, 'notiz.md'), 'siehe [[ziel-top]]\n')
  const top = w(join(b, 'ziel-top.md'), '# Top\n')
  // Scope-Begrenzung: die Wurzel B wird NICHT voll gewalkt — ihr
  // Top-Level-Markdown kommt als extraFile in den gemeinsamen Index.
  expect(scanAllWikilinks([a], [top])).toEqual([])
})

test('B10: Basename-Kollision ueber zwei Wurzeln loest auf, toter Link meldet genau 1 Finding', () => {
  const a = join(tmp, 'a')
  const b = join(tmp, 'b')
  w(join(a, 'docs', 'kollision.md'), '# A\n')
  w(join(b, 'notes', 'kollision.md'), '# B\n')
  w(join(a, 'start.md'), 'gut [[kollision]], schlecht [[kaputt]]\n')
  const findings = scanAllWikilinks([a, b])
  expect(findings).toHaveLength(1)
  expect(findings[0].target).toBe('kaputt')
  expect(findings[0].filePath).toBe(join(a, 'start.md'))
})

test('B10: pfadqualifizierter Link trifft die richtige Wurzel (kein Falschpositiv)', () => {
  const a = join(tmp, 'a')
  const b = join(tmp, 'b')
  w(join(a, 'docs', 'kollision.md'), '# A\n')
  w(join(b, 'notes', 'kollision.md'), '# B\n')
  w(join(a, 'start.md'), '[[docs/kollision]] und [[notes/kollision]] und [[fehlt/kollision]]\n')
  const findings = scanAllWikilinks([a, b])
  expect(findings.map((f) => f.target)).toEqual(['fehlt/kollision'])
})

// Sandbox-Verdrahtung (B10 a+c): buildAuditConfig nutzt die erweiterten,
// scope-begrenzten Wurzeln (claudeHome + Registry-Workspace) und buendelt
// die Findings zu EINER Karte mit Zaehler.
function seedWikilinkSandbox(sb: string): void {
  w(join(sb, 'project', 'docs', 'a.md'), '[[nur-im-claude-home]] [[kollision]] [[ws-doku]] [[kaputt-link]]\n')
  w(join(sb, '.claude', 'nur-im-claude-home.md'), '# Home\n')
  w(join(sb, '.claude', 'docs', 'kollision.md'), '# Home-Kollision\n')
  w(join(sb, 'ws2', 'docs', 'kollision.md'), '# WS-Kollision\n')
  w(join(sb, 'ws2', 'docs', 'ws-doku.md'), '# WS\n')
  w(join(sb, '.shared', '.claude', 'coordination', 'registry', 'workspaces.json'),
    JSON.stringify({ workspaces: { ws2: { name: 'WS2', path_local: join(sb, 'ws2') } } }))
  w(join(sb, '.claude', 'settings.json'), '{}\n')
  w(join(sb, '.codex', 'hooks.json'), '{}\n')
}

test('B10: buildAuditConfig loest cross-root auf und buendelt zu 1 Karte mit Zaehler', () => {
  const sb = mkdtempSync(join(tmpdir(), 'rawallm-audit-roots-'))
  const saved = process.env.RAWALLM_SANDBOX_ROOT
  process.env.RAWALLM_SANDBOX_ROOT = sb
  try {
    seedWikilinkSandbox(sb)
    const audit = buildAuditConfig()
    const refs = audit.categories.find((cat) => cat.id === 'audit-references')
    expect(refs).toBeDefined()
    // Genau EIN gebuendelter Eintrag; nur der wirklich tote Link zaehlt —
    // die drei cross-root-Links (claudeHome, Kollision, Registry-Workspace)
    // duerfen NICHT als tot gemeldet werden.
    expect(refs!.entries).toHaveLength(1)
    expect(refs!.entries[0].fields?.Fundstellen).toBe('1')
    expect(refs!.entries[0].desc).toContain('kaputt-link')
  } finally {
    if (saved === undefined) delete process.env.RAWALLM_SANDBOX_ROOT
    else process.env.RAWALLM_SANDBOX_ROOT = saved
    rmSync(sb, { recursive: true, force: true })
  }
})
