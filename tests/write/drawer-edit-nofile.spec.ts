// drawer-edit-nofile.spec.ts — WP-5 (B6+B7): Eintraege ohne eigene Datei
// (Endpoint-/Katalog-/Key-Eintraege, path traegt eine URL) duerfen im Drawer
// KEIN Datei-Bearbeiten-Panel, keine CRUD-Aktionen und kein readFull ausloesen.
// Stattdessen zeigt der Renderer einen erklaerenden Hinweis.
//  (1) Scanner-Seite (pure): llm-scan-Endpoints + cloud-scan Katalog/Key tragen
//      fileBacked === false; dateibasierte GGUF-Eintraege bleiben ohne Flag
//      (fehlend = dateibasiert, Default true).
//  (2) Contract-Pin: fileBacked?: boolean ist am Entry-Vertrag (additiv).
//  (3) Renderer-Verdrahtung (Source-Pin nach Muster drawer-first-click.spec.ts):
//      DrawerEdit/EditForm verzweigen auf entry.fileBacked === false, EditForm
//      ruft in dem Zweig keinen Vollinhalt ab, EntryActions-Prefill nutzt
//      entry.path (nicht cat.path).
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, expect } from '@playwright/test'
import { endpointEntries, scanGgufFiles } from '../../src/main/scan/llm-scan'
import { cloudCategories } from '../../src/main/scan/providers/cloud-scan'

test('B6: Endpoint-Eintraege (llama-server u.a.) tragen fileBacked === false', () => {
  const entries = endpointEntries()
  expect(entries.length, 'Endpoint-Katalog ist nicht leer').toBeGreaterThan(0)
  expect(entries.map((e) => e.id), 'llama-server ist im Endpoint-Katalog').toContain('llama-server-8099')
  for (const e of entries) {
    expect(e.fileBacked, `${e.id} muss fileBacked === false tragen (URL, keine Datei)`).toBe(false)
  }
})

test('B6: Cloud-Katalog-/Key-Eintraege tragen fileBacked === false', () => {
  const cats = cloudCategories()
  expect(cats.length, 'Cloud-Kategorien vorhanden').toBeGreaterThan(0)
  for (const cat of cats) {
    for (const e of cat.entries) {
      expect(e.fileBacked, `${e.id} muss fileBacked === false tragen (Katalog/Key)`).toBe(false)
    }
  }
})

test('B6: dateibasierte GGUF-Eintraege bleiben ohne Flag (Default = dateibasiert)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gguf-nofile-'))
  writeFileSync(join(dir, 'test-modell.gguf'), 'x')
  const entries = scanGgufFiles([dir])
  expect(entries, 'GGUF-Datei wurde gefunden').toHaveLength(1)
  expect(entries[0].fileBacked, 'Datei-Eintrag darf NICHT als nicht-dateibasiert gelten').toBeUndefined()
})

test('B7: Contract traegt fileBacked?: boolean (additiv-optional)', () => {
  const contract = readFileSync(join(process.cwd(), 'shared/contract.ts'), 'utf8')
  expect(contract).toContain('fileBacked?: boolean')
})

test('B7: DrawerEdit zeigt bei fileBacked === false Hinweis statt Edit-Panel/CRUD', () => {
  const src = readFileSync(join(process.cwd(), 'src/renderer/components/DrawerEdit.tsx'), 'utf8')
  expect(src, 'DrawerEdit verzweigt auf das Contract-Flag').toContain('entry.fileBacked === false')
  expect(src, 'Nicht-datei-Zweig rendert KEIN EntryActions (keine CRUD-Aktionen)').not.toMatch(
    /fileBacked === false[\s\S]{0,400}<EntryActions/
  )
  expect(src, 'Nicht-datei-Zweig rendert KEINE EditForm (kein readFull-Trigger)').not.toMatch(
    /fileBacked === false[\s\S]{0,400}<EditForm/
  )
})

test('B7: EditForm ruft bei fileBacked === false keinen Vollinhalt ab (kein readFull)', () => {
  const src = readFileSync(join(process.cwd(), 'src/renderer/sections/config/EditForm.tsx'), 'utf8')
  expect(src, 'EditForm verzweigt auf das Contract-Flag').toContain('entry.fileBacked === false')
  // Der Hook (readFull-Trigger) darf nur im dateibasierten Kind laufen:
  // EditForm selbst enthaelt keinen Hook-Aufruf vor der Verzweigung.
  const guardIdx = src.indexOf('entry.fileBacked === false')
  const hookIdx = src.indexOf('useEditorFullContent(entry.path)')
  expect(hookIdx, 'readFull-Hook bleibt verdrahtet (dateibasierter Zweig)').toBeGreaterThan(-1)
  expect(hookIdx, 'Hook liegt NACH der fileBacked-Verzweigung (Kind-Komponente)').toBeGreaterThan(guardIdx)
})

test('B7: EntryActions-Prefill nutzt entry.path, nicht cat.path (Owner-Auflage)', () => {
  const src = readFileSync(join(process.cwd(), 'src/renderer/sections/config/EntryActions.tsx'), 'utf8')
  expect(src, 'Prefill setzt entry.path').toContain('setTarget(entry.path)')
  expect(src, 'Prefill nutzt kein parentPath (cat.path) mehr').not.toContain('setTarget(next ===')
})
