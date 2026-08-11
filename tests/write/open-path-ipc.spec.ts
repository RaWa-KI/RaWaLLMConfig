// open-path-ipc.spec.ts — WP-F14: read-only „Zeigen"-Route system:openPath.
// Absicherung: (1) Secret-Pfad wird NIE selbst selektiert/geöffnet — nur sein
// Ordner gezeigt; (2) normale Datei wird im Ordner selektiert; (3) ungültige/
// fehlende Pfade lösen keinen shell-Aufruf aus; (4) shell.openPath wird nie
// benutzt (zeigt statt öffnet). Boot-Muster wie coverage-ack-ipc.spec.ts:
// electron im require-cache mocken, BEVOR das Handler-Modul geladen wird.
import { expect, test } from '@playwright/test'
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
// channels ist reine Konstanten-Datei ohne electron-Bezug -> statisch.
import { IPC } from '../../shared/channels'

const sandbox = mkdtempSync(join(tmpdir(), 'rawallmconfig-open-path-'))

type OpenResult = { data: { shown: 'file' | 'folder' } | null; error: string | null }
type Handler = (event: unknown, req: { path: string }) => OpenResult
const handlers = new Map<string, Handler>()
const shownPaths: string[] = []
let openPathCalls = 0

const electronPath = require.resolve('electron')
require.cache[electronPath] = {
  id: electronPath,
  filename: electronPath,
  loaded: true,
  exports: {
    ipcMain: { handle: (channel: string, listener: Handler) => { handlers.set(channel, listener) } },
    shell: {
      showItemInFolder: (p: string) => { shownPaths.push(p) },
      openPath: () => { openPathCalls += 1; return Promise.resolve('') }
    }
  }
} as never

// BEWUSST require statt statischem Import: ipc-open bindet `electron` und muss
// NACH dem Mock oben geladen werden — statische Imports werden beim
// Transpilieren vor diese Statements gehoben. Zusaetzlich frische Modulinstanz
// erzwingen (geteilter Worker-require-Cache, siehe secret-list-owner-view.spec.ts
// — sonst haengt ipc-open am electron-Mock eines frueheren Specs).
delete require.cache[require.resolve('../../src/main/ipc-open')]
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { registerOpenIpc, openPathCore } = require('../../src/main/ipc-open') as typeof import('../../src/main/ipc-open')

registerOpenIpc()

// Funktionale Faelle laufen mit injiziertem Sandbox-Root (Scope-Confinement
// P2-1: Produktionsscope = Config-Wurzeln + Kimi-Home, hier die Sandbox).
function invoke(path: string): OpenResult {
  expect(handlers.get(IPC.systemOpenPath)).toBeDefined()
  return openPathCore({ path }, [sandbox]) as OpenResult
}

test.beforeEach(() => {
  shownPaths.length = 0
  openPathCalls = 0
})

test('normale Datei: im Ordner selektiert (shown=file)', () => {
  const file = join(sandbox, 'notes.md')
  writeFileSync(file, 'harmloser Inhalt', 'utf8')
  const res = invoke(file)
  expect(res.error).toBeNull()
  expect(res.data?.shown).toBe('file')
  expect(shownPaths).toEqual([resolve(file)])
})

test('Secret-Pfad: nur Ordner zeigen, Datei nie selektieren/öffnen', () => {
  const secret = join(sandbox, '.env')
  writeFileSync(secret, 'KEY=nur-fixture', 'utf8')
  const res = invoke(secret)
  expect(res.error).toBeNull()
  expect(res.data?.shown).toBe('folder')
  // Gezeigt wird der Ordner — nie der Secret-Dateipfad selbst.
  expect(shownPaths).toEqual([dirname(resolve(secret))])
  expect(shownPaths).not.toContain(resolve(secret))
})

test('Ordner: wird direkt gezeigt (shown=folder)', () => {
  const res = invoke(sandbox)
  expect(res.error).toBeNull()
  expect(res.data?.shown).toBe('folder')
  expect(shownPaths).toEqual([resolve(sandbox)])
})

test('relativer/leerer/fehlender Pfad: Fehler, kein shell-Aufruf', () => {
  for (const bad of ['relativ/pfad.txt', '', join(sandbox, 'gibt-es-nicht.txt')]) {
    const res = invoke(bad)
    expect(res.data).toBeNull()
    expect(res.error).toBeTruthy()
  }
  expect(shownPaths).toEqual([])
})

test('Pfad außerhalb des Scopes: abgelehnt ohne Existenz-Orakel und shell-Aufruf', () => {
  // Existierender wie nicht-existierender Fremdpfad liefern dieselbe
  // Scope-Ablehnung — kein Rückschluss auf Existenz (Kritiker P2-1).
  const foreignExisting = tmpdir()
  const foreignMissing = join(tmpdir(), 'rawallmconfig-gibt-es-nicht-xyz')
  const a = invoke(foreignExisting)
  const b = invoke(foreignMissing)
  expect(a.data).toBeNull()
  expect(b.data).toBeNull()
  expect(a.error).toBe(b.error)
  expect(shownPaths).toEqual([])
})

test('shell.openPath wird nie benutzt (zeigt statt öffnet)', () => {
  const file = join(sandbox, 'settings.json') // Secret-Klasse
  writeFileSync(file, '{}', 'utf8')
  invoke(file)
  invoke(sandbox)
  expect(openPathCalls).toBe(0)
})

// Verdrahtungs-Pins (Muster conflict-compare-entry.spec.ts): Link je Mitglied
// in DriftEntry, Preload-Bridge und Registrierung im read-only Registrar.
test('DriftEntry rendert je Mitglied einen „Zeigen"-Link auf openPath', () => {
  const src = readFileSync(resolve(process.cwd(), 'src/renderer/sections/config/DriftEntry.tsx'), 'utf8')
  // Der Link lebt in der members.map-Zeile und ruft die Bridge mit m.path.
  expect(src).toContain('onClick={(e) => showPath(e, m.path)}')
  expect(src).toContain('void window.electronAPI?.openPath?.({ path })')
  expect(src).toContain("const ZEIGEN_LABEL = 'Zeigen'")
})

test('Preload und Registrar sind verdrahtet', () => {
  const preload = readFileSync(resolve(process.cwd(), 'src/preload/index.ts'), 'utf8')
  expect(preload).toContain('ipcRenderer.invoke(IPC.systemOpenPath, req)')
  const ipc = readFileSync(resolve(process.cwd(), 'src/main/ipc.ts'), 'utf8')
  expect(ipc).toContain('registerOpenIpc()')
})
