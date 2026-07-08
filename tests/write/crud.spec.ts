// crud.spec.ts (Teil C, WP-10; WP14 2026-06-10) — Fixture-Tests gegen temp-Sandbox
// (NIE reale Config). Deckt ab: CRUD via applyWrite (edit/add/archive/move), EditForm-
// Vollinhalt-Roundtrip (Datei >45 Z, kein "… (gekuerzt)", Byte-Identitaet ausser
// editierter Stelle), Import-Massenedit-Gate (secret-/Fremdpfad -> abgelehnt) und
// Export->Import-Roundtrip (Allowlist-konform). Kein Renderer-DOM noetig: getestet
// wird die reine Logik (apply/export/import) gegen Sandbox-Pfade.
// Import-Tests laufen seit WP14 ueber die neue, B1-gehaertete API
// (parseImportSource/applyImportItems); die Legacy-API ist HR7-archiviert
// im externen Workspace-Archiv.
import { test, expect } from '@playwright/test'
import { readFileSync, existsSync } from 'node:fs'
import { applyWrite } from '../../src/main/services/apply'
import type { WriteResult } from '../../shared/contract-write'
import { parseImportSource, applyImportItems } from '../../src/renderer/lib/import'
import { buildConflictExportBundle, collectEntries, buildExportBundle } from '../../src/renderer/lib/export'
import {
  bundleSummaryText,
  conflictBundleFilename,
  conflictBundleReportMetadata,
  fullBundleFilename,
  fullBundleReportMetadata
} from '../../shared/templates/export-report'
import { makeSandbox, seedFile, sandboxPath, exists } from './fixtures'
import type { Sandbox } from './fixtures'

function opts(sb: Sandbox): { archiveRoot: string; auditPath: string } {
  return { archiveRoot: sb.archiveRoot, auditPath: sb.auditPath }
}

// Erlaubte Ziel-Wurzeln (Allowlist) fuer parseImportSource/suggestedRoot.
const ROOTS = ['/home/u/.claude', '/home/u/.codex']

// Sammelnder Mock-Apply (kein realer Write), Stil wie import-targets.spec.ts:
// applyImportItems bekommt ihn injiziert statt der Write-IPC.
function recordingApply(sink: Array<{ path: string; content: string }>) {
  return (path: string, content: string): Promise<WriteResult> => {
    sink.push({ path, content })
    return Promise.resolve({ data: { action: 'add', path, backupPath: null }, error: null })
  }
}

test('CRUD edit/add/archive/move wirken gegen Sandbox', () => {
  const sb = makeSandbox()
  const f = seedFile(sb, 'a.md', 'ALT')
  expect(applyWrite({ action: 'edit', path: f, content: 'NEU' }, opts(sb)).error).toBeNull()
  expect(readFileSync(f, 'utf8')).toBe('NEU')

  const add = sandboxPath(sb, 'sub', 'b.md')
  expect(applyWrite({ action: 'add', path: add, content: 'B' }, opts(sb)).error).toBeNull()
  expect(readFileSync(add, 'utf8')).toBe('B')

  const arch = applyWrite({ action: 'archive', path: f }, opts(sb))
  expect(arch.error).toBeNull()
  expect(existsSync(f)).toBe(false) // archiviert, nicht geloescht
  expect(exists(arch.data!.movedTo!)).toBe(true)

  const to = sandboxPath(sb, 'moved', 'b.md')
  expect(applyWrite({ action: 'move', path: add, to }, opts(sb)).error).toBeNull()
  expect(readFileSync(to, 'utf8')).toBe('B')
})

test('EditForm-Vollinhalt-Roundtrip: Datei >45 Z, kein Truncation-Marker, Byte-Identitaet ausser Edit', () => {
  const sb = makeSandbox()
  const lines = Array.from({ length: 60 }, (_, i) => `Zeile ${i + 1}`)
  const original = lines.join('\n')
  const f = seedFile(sb, 'long.md', original)

  // Vollinhalt lesen (EditForm laedt via readFull -> hier direkt: voller Inhalt).
  const full = readFileSync(f, 'utf8')
  expect(full).toBe(original)
  expect(full).not.toContain('… (gekuerzt)')
  expect(full.split('\n').length).toBeGreaterThan(45)

  // Eine Stelle editieren (wie EditForm), zurueckschreiben.
  const edited = full.split('\n')
  edited[30] = 'Zeile 31 GEAENDERT'
  const res = applyWrite({ action: 'edit', path: f, content: edited.join('\n') }, opts(sb))
  expect(res.error).toBeNull()

  const after = readFileSync(f, 'utf8').split('\n')
  expect(after).not.toContain('… (gekuerzt)')
  expect(after[30]).toBe('Zeile 31 GEAENDERT')
  // Byte-Identitaet ausser editierter Zeile.
  for (let i = 0; i < after.length; i++) {
    if (i === 30) continue
    expect(after[i]).toBe(lines[i])
  }
})

test('Import-Massenedit-Gate lehnt secret-/Fremdpfad ab (nicht geschrieben)', async () => {
  const bundle = {
    app: 'rawallmconfig',
    version: 1,
    entries: [
      { path: '/home/u/.claude/rules/r.md', name: 'r', writable: true, content: 'OK' },
      { path: '/home/u/.claude/settings.json', name: 'settings', writable: true, content: 'LEAK' },
      { path: '/tmp/foreign/x.md', name: 'foreign', writable: true, content: 'FREMD' }
    ]
  }
  const res = await parseImportSource(new File([JSON.stringify(bundle)], 'bundle.json'), ROOTS)
  expect(res.valid).toBe(true)
  const byStatus = (s: string) => res.items.filter((i) => i.status === s).length
  expect(byStatus('ready')).toBe(1)
  expect(byStatus('skipped-secret')).toBe(1) // settings.json -> Secret
  expect(byStatus('skipped-foreign')).toBe(1) // /tmp/... -> nicht Allowlist

  // applyImportItems schreibt NUR ready-Picks; secret/foreign werden nie geschrieben.
  // Gewollte neue Semantik (WP14): Ziel = chosenRoot + '/' + sanitizeRelTarget(name)
  // (action 'add'), NICHT mehr der entry.path des Bundles.
  const picks = res.items
    .filter((i) => i.status === 'ready')
    .map((i) => ({ name: i.name, content: i.content, chosenRoot: i.suggestedRoot }))
  const writes: Array<{ path: string; content: string }> = []
  const out = await applyImportItems(picks, recordingApply(writes))
  expect(out.ok).toBe(true)
  expect(writes).toHaveLength(1)
  expect(writes[0].path).toBe(`${res.items[0].suggestedRoot}/r`)
  expect(writes[0].content).toBe('OK')
})

test('Export->Import-Roundtrip: Allowlist-konforme Entries schreibbar, gekuerzte uebersprungen', async () => {
  // Minimaler AppData-Snapshot mit einem writable + einem gekuerzten Entry.
  const config = {
    snapshot: { frozen: false, date: '', label: '' },
    machines: [],
    llms: [],
    data: {
      claude: {
        categories: [
          {
            id: 'rules',
            label: 'Rules',
            icon: 'rule',
            path: '/home/u/.claude/rules',
            blurb: '',
            entries: [
              {
                id: 'e1',
                name: 'r1',
                status: 'active' as const,
                scope: 'global' as const,
                path: '/home/u/.claude/rules/r1.md',
                desc: '',
                updated: '',
                code: 'INHALT VOLL'
              },
              {
                id: 'e2',
                name: 'r2',
                status: 'active' as const,
                scope: 'global' as const,
                path: '/home/u/.claude/rules/r2.md',
                desc: '',
                updated: '',
                code: 'kurz … (gekuerzt)'
              }
            ]
          }
        ],
        duplicates: []
      }
    }
  }
  const entries = collectEntries(config)
  expect(entries.find((e) => e.path.endsWith('r1.md'))!.writable).toBe(true)
  expect(entries.find((e) => e.path.endsWith('r2.md'))!.writable).toBe(false)

  const bundle = buildExportBundle({ config, system: null, watcher: null })
  const res = await parseImportSource(new File([JSON.stringify(bundle)], 'bundle.json'), ROOTS)
  expect(res.valid).toBe(true)
  const r1 = res.items.find((i) => i.sourcePath?.endsWith('r1.md'))!
  const r2 = res.items.find((i) => i.sourcePath?.endsWith('r2.md'))!
  expect(r1.status).toBe('ready')
  expect(r1.content).toBe('INHALT VOLL')
  expect(r2.status).toBe('skipped-no-content') // writable=false -> hasContent=false

  const picks = res.items
    .filter((i) => i.status === 'ready')
    .map((i) => ({ name: i.name, content: i.content, chosenRoot: i.suggestedRoot }))
  const writes: Array<{ path: string; content: string }> = []
  const out = await applyImportItems(picks, recordingApply(writes))
  expect(out.ok).toBe(true)
  expect(writes).toHaveLength(1)
  expect(writes[0].content).toBe('INHALT VOLL') // Vollinhalt, kein Truncation-Marker
  expect(writes[0].content).not.toContain('… (gekuerzt)')
})

test('buildConflictExportBundle exportiert nur Konflikt-Eintraege', () => {
  const config = {
    snapshot: { frozen: false, date: '', label: '' },
    machines: [],
    llms: [],
    data: {
      claude: {
        categories: [{
          id: 'rules', label: 'Rules', icon: 'rule', path: '', blurb: '',
          entries: [
            { id: 'ok', name: 'ok', status: 'active' as const, scope: 'global' as const, path: 'ok.md', desc: '', updated: '', code: 'ok' },
            { id: 'bad', name: 'bad', status: 'conflict' as const, scope: 'global' as const, path: 'bad.md', desc: '', updated: '', code: 'bad' }
          ]
        }],
        duplicates: []
      }
    }
  }
  const bundle = buildConflictExportBundle({ config, system: null, watcher: null })
  expect(bundle.filter).toBe('conflicts')
  expect(bundle.entries.map((e) => e.path)).toEqual(['bad.md'])
})

test('Export-Report-Templates halten Dateinamen und Reporttexte stabil', () => {
  const exported = '2026-07-07T07:15:30.000Z'
  const fullMeta = fullBundleReportMetadata()
  const conflictMeta = conflictBundleReportMetadata()

  expect(fullBundleFilename(exported)).toBe('rawallmconfig-2026-07-07.json')
  expect(conflictBundleFilename(exported)).toBe('rawallmconfig-konflikte-2026-07-07.json')
  expect(fullMeta).toMatchObject({ app: 'rawallmconfig', version: 1, kind: 'full' })
  expect(conflictMeta).toMatchObject({ filter: 'conflicts', kind: 'conflicts' })
  expect(bundleSummaryText(conflictMeta, 2)).toBe('Konflikt-Export: 2 Eintraege')
})
