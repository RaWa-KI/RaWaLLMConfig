// import-targets.spec.ts (Teil C, neue Import-API) — deckt parseImportSource +
// applyImportItems ab (Ziel-Wahl je Eintrag, .md ODER Bundle). Reine Logik im
// Node-Sandbox-Runner: kein Renderer-DOM. File wird ueber den globalen Node-File-
// Konstruktor (Node 20+) gebaut. Schreib-API wird gemockt -> NIE reale Config.
// crud.spec.ts testet seit 2026-06-10 (WP14) ebenfalls die neue API
// (parseImportSource/applyImportItems); die Legacy-API ist HR7-archiviert
// im externen Workspace-Archiv.
import { test, expect } from '@playwright/test'
import type { WriteResult } from '../../shared/contract-write'
import { parseImportSource, applyImportItems } from '../../src/renderer/lib/import'
import { isAllowedRoot, sanitizeRelTarget } from '../../src/renderer/lib/import-targets'

// Erlaubte Ziel-Wurzeln (Allowlist). knownRoots[0] = Default-Fallback.
const ROOTS = ['/home/u/.claude', '/home/u/.codex', '/home/u/Desktop/Projekte/.shared/.claude']

// Mock-File: nur .name + .text() werden von parseImportSource genutzt.
function fakeFile(name: string, text: string): File {
  return new File([text], name, { type: 'text/plain' })
}

// Sammelnder Mock-Apply (kein realer Write). Default: ok.
function recordingApply(sink: Array<{ path: string; content: string }>, fail?: string) {
  return (path: string, content: string): Promise<WriteResult> => {
    sink.push({ path, content })
    if (fail && path.endsWith(fail)) return Promise.resolve({ data: null, error: 'mock-fail' })
    return Promise.resolve({ data: { action: 'add', path, backupPath: null }, error: null })
  }
}

test('rohe .md -> 1 ready-Item mit suggestedRoot=knownRoots[0]', async () => {
  const res = await parseImportSource(fakeFile('notes.md', 'Inhalt'), ROOTS)
  expect(res.valid).toBe(true)
  expect(res.items).toHaveLength(1)
  expect(res.items[0]).toMatchObject({
    name: 'notes.md',
    content: 'Inhalt',
    sourcePath: undefined,
    suggestedRoot: ROOTS[0],
    status: 'ready'
  })
})

test('.markdown/.mdx werden ebenfalls als rohe Markdown erkannt', async () => {
  const a = await parseImportSource(fakeFile('a.markdown', 'x'), ROOTS)
  const b = await parseImportSource(fakeFile('b.mdx', 'y'), ROOTS)
  expect(a.items[0].status).toBe('ready')
  expect(b.items[0].status).toBe('ready')
})

test('rohe .md leer -> skipped-no-content', async () => {
  const res = await parseImportSource(fakeFile('leer.md', ''), ROOTS)
  expect(res.items[0].status).toBe('skipped-no-content')
})

test('rohe .md mit Secret-Wort im Namen -> ready (.md ist nie Secret-WERT-Datei)', async () => {
  const res = await parseImportSource(fakeFile('auth.json', '{}'), ROOTS)
  // BEWUSSTE Verhaltensänderung 2026-06-10 (QUAL-HOCH-01): .md ist nie
  // Secret-WERT-Datei (Owner-Override, Parität zur secret-guard-.md-Ausnahme)
  // — vorher testgepinnter Bug (skipped-secret).
  const md = await parseImportSource(fakeFile('my-token.md', 'wert'), ROOTS)
  expect(md.items[0].status).toBe('ready')
  // (res nur, damit der .json-Pfad nicht ungenutzt ist — kein Bundle -> invalid)
  expect(res.valid).toBe(false)
})

test('Bundle-Parse: ready/skipped-secret/skipped-foreign/skipped-no-content je Eintrag', async () => {
  const bundle = {
    app: 'rawallmconfig',
    version: 1,
    entries: [
      { path: '/home/u/.claude/rules/r.md', name: 'r.md', writable: true, content: 'OK' },
      { path: '/home/u/.claude/settings.json', name: 'settings.json', writable: true, content: 'LEAK' },
      { path: '/tmp/foreign/x.md', name: 'x.md', writable: true, content: 'FREMD' },
      { path: '/home/u/.codex/agents/a.md', name: 'a.md', writable: false, content: 'kurz' }
    ]
  }
  const res = await parseImportSource(fakeFile('bundle.json', JSON.stringify(bundle)), ROOTS)
  expect(res.valid).toBe(true)
  const byStatus = (s: string) => res.items.filter((i) => i.status === s)
  expect(byStatus('ready')).toHaveLength(1)
  expect(byStatus('skipped-secret')).toHaveLength(1)
  expect(byStatus('skipped-foreign')).toHaveLength(1)
  expect(byStatus('skipped-no-content')).toHaveLength(1)
})

test('Bundle-Parse: suggestedRoot folgt der Allowlist-Wurzel des sourcePath', async () => {
  const bundle = {
    app: 'rawallmconfig',
    version: 1,
    entries: [
      { path: '/home/u/.codex/agents/a.md', name: 'a.md', writable: true, content: 'A' },
      { path: '/home/u/Desktop/Projekte/.shared/.claude/skills/s.md', name: 's.md', writable: true, content: 'S' }
    ]
  }
  const res = await parseImportSource(fakeFile('bundle.json', JSON.stringify(bundle)), ROOTS)
  const codex = res.items.find((i) => i.name === 'a.md')!
  const shared = res.items.find((i) => i.name === 's.md')!
  expect(codex.suggestedRoot).toBe('/home/u/.codex') // .codex-Wurzel, nicht knownRoots[0]
  expect(shared.suggestedRoot).toBe('/home/u/Desktop/Projekte/.shared/.claude') // .shared-Wurzel
})

test('kaputtes JSON / kein Bundle -> valid=false, keine Items', async () => {
  const broken = await parseImportSource(fakeFile('x.json', '{nope'), ROOTS)
  const noBundle = await parseImportSource(fakeFile('x.json', '{"foo":1}'), ROOTS)
  expect(broken.valid).toBe(false)
  expect(broken.items).toHaveLength(0)
  expect(noBundle.valid).toBe(false)
})

test('applyImportItems schreibt nur ready an chosenRoot + "/" + name (Mock-apply)', async () => {
  const sink: Array<{ path: string; content: string }> = []
  const res = await applyImportItems(
    [
      { name: 'r.md', content: 'OK', chosenRoot: '/home/u/.claude/rules' },
      { name: 's.md', content: 'S', chosenRoot: '/home/u/.codex/agents/' } // trailing slash normalisiert
    ],
    recordingApply(sink)
  )
  expect(res.ok).toBe(true)
  expect(sink).toEqual([
    { path: '/home/u/.claude/rules/r.md', content: 'OK' },
    { path: '/home/u/.codex/agents/s.md', content: 'S' }
  ])
})

test('applyImportItems: Secret-/Fremd-/Leer-Pick wird NIE geschrieben (Re-Validierung)', async () => {
  const sink: Array<{ path: string; content: string }> = []
  const res = await applyImportItems(
    [
      { name: 'auth.json', content: 'LEAK', chosenRoot: '/home/u/.claude' }, // Secret -> skip
      { name: 'x.md', content: 'FREMD', chosenRoot: '/tmp/foreign' },        // Fremd -> skip
      { name: 'leer.md', content: '', chosenRoot: '/home/u/.claude/docs' },  // leer -> skip
      { name: 'ok.md', content: 'OK', chosenRoot: '/home/u/.claude/docs' }   // ready -> write
    ],
    recordingApply(sink)
  )
  expect(res.ok).toBe(true)
  expect(sink).toHaveLength(1)
  expect(sink[0].path).toBe('/home/u/.claude/docs/ok.md')
})

test('applyImportItems stoppt sequentiell bei Write-Fehler', async () => {
  const sink: Array<{ path: string; content: string }> = []
  const res = await applyImportItems(
    [
      { name: 'a.md', content: 'A', chosenRoot: '/home/u/.claude/docs' },
      { name: 'b.md', content: 'B', chosenRoot: '/home/u/.claude/docs' }, // fail hier
      { name: 'c.md', content: 'C', chosenRoot: '/home/u/.claude/docs' }
    ],
    recordingApply(sink, 'b.md')
  )
  expect(res.ok).toBe(false)
  expect(res.message).toContain('b.md')
  // a + b versucht, c nicht mehr.
  expect(sink.map((s) => s.path)).toEqual([
    '/home/u/.claude/docs/a.md',
    '/home/u/.claude/docs/b.md'
  ])
})

test('Default-Apply ohne Bridge: schreibt nichts, Fehler stoppt -> ok=false', async () => {
  // Kein window/electronAPI in Node -> defaultApplyAdd liefert error -> Stop bei erstem ready.
  const res = await applyImportItems([{ name: 'ok.md', content: 'OK', chosenRoot: '/home/u/.claude/docs' }])
  expect(res.ok).toBe(false)
})

test('applyImportItems: alle Picks uebersprungen -> ok=false, ehrliche No-Op-Meldung (kein Scheinerfolg)', async () => {
  const sink: Array<{ path: string; content: string }> = []
  const res = await applyImportItems(
    [{ name: 'secret.key', content: 'x', chosenRoot: '/home/u/.claude' }], // Secret-Suffix -> skip
    recordingApply(sink)
  )
  expect(res.ok).toBe(false)
  expect(res.message).toContain('übersprungen')
  expect(sink).toHaveLength(0)
})

// ── B1: Renderer-Scope = Main-Scope + Traversal-Haertung ────────────────────

test('isAllowedRoot akzeptiert projectRoot (.../RaWaLLMConfig) wie den Main-Scope', () => {
  expect(isAllowedRoot('C:/Users/u/Desktop/Projekte/RaWaLLMConfig/docs/x.md', 'win32')).toBe(true)
  expect(isAllowedRoot('/home/u/.claude/rules/r.md', 'linux')).toBe(true)
  expect(isAllowedRoot('/tmp/foreign/x.md', 'linux')).toBe(false)
})

test('sanitizeRelTarget entfernt Traversal/absolute Praefixe', () => {
  expect(sanitizeRelTarget('r.md')).toBe('r.md')
  expect(sanitizeRelTarget('rules/r.md')).toBe('rules/r.md')
  expect(sanitizeRelTarget('..\\..\\evil.md')).toBe('evil.md')
  expect(sanitizeRelTarget('../../foreign/x.md')).toBe('foreign/x.md')
  expect(sanitizeRelTarget('C:\\Windows\\evil.md')).toBe('Windows/evil.md')
  expect(sanitizeRelTarget('..')).toBe('')
  expect(sanitizeRelTarget('./')).toBe('')
})

test('applyImportItems: Traversal-name kann chosenRoot nicht verlassen (gehaertetes Ziel)', async () => {
  const sink: Array<{ path: string; content: string }> = []
  const res = await applyImportItems(
    [{ name: '../../foreign/x.md', content: 'X', chosenRoot: '/home/u/.claude/docs' }],
    recordingApply(sink)
  )
  expect(res.ok).toBe(true)
  // '..'-Segmente entfernt -> bleibt unter .claude/docs, NICHT /home/u/foreign.
  expect(sink).toHaveLength(1)
  expect(sink[0].path).toBe('/home/u/.claude/docs/foreign/x.md')
})

test('applyImportItems: rein-traversaler name -> uebersprungen (kein Schreiben an die Wurzel)', async () => {
  const sink: Array<{ path: string; content: string }> = []
  const res = await applyImportItems(
    [{ name: '../..', content: 'X', chosenRoot: '/home/u/.claude/docs' }],
    recordingApply(sink)
  )
  expect(res.ok).toBe(false)
  expect(sink).toHaveLength(0)
})

test('applyImportItems: projectRoot-Wurzel ist schreibbar (Main-Scope-Paritaet)', async () => {
  const sink: Array<{ path: string; content: string }> = []
  const res = await applyImportItems(
    [{ name: 'note.md', content: 'OK', chosenRoot: 'C:/Users/u/Desktop/Projekte/RaWaLLMConfig/docs' }],
    recordingApply(sink)
  )
  expect(res.ok).toBe(true)
  expect(sink[0].path).toBe('C:/Users/u/Desktop/Projekte/RaWaLLMConfig/docs/note.md')
})
