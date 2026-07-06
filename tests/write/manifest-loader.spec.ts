// manifest-loader.spec.ts (D6) — Beweis fuer den Loader nutzerdefinierter
// Provider-Manifeste: valide Manifeste landen in `manifests`, JEDER invalide
// Fall einzeln in `rejected` mit Grund (nie stiller Skip). Fixtures werden in
// eine temp-Sandbox geschrieben; RAWALLM_PROVIDERS_DIR zeigt direkt darauf
// (Env-Override-Pfad, kein configRoots-Reload noetig). Runner: Playwright
// (test/expect) als reiner Node-Test-Runner (kein Browser).
import { test, expect } from '@playwright/test'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadUserManifests } from '../../src/main/scan/providers/manifest-loader'

// Frisches Manifest-Verzeichnis je Test; Dateien hineinschreiben.
function freshDir(): string {
  return mkdtempSync(join(tmpdir(), 'rawallm-prov-'))
}
function write(dir: string, name: string, content: string): void {
  writeFileSync(join(dir, name), content, 'utf8')
}
function writeJson(dir: string, name: string, obj: unknown): void {
  write(dir, name, JSON.stringify(obj, null, 2))
}

// Ein minimal-valides, deklaratives Manifest (deklarative CategorySpec).
const validManifest = {
  id: 'my-provider',
  label: 'Mein Anbieter',
  roots: [{ rootKey: 'projectRoot', subPath: 'config' }],
  categories: [
    {
      id: 'my-rules',
      label: 'Regeln',
      icon: 'rule',
      blurb: 'Eigene Regeln',
      subdir: 'rules',
      glob: '*.md',
      scan: 'file',
      parser: 'frontmatter',
      withContent: true,
    },
  ],
  endpoints: [
    { id: 'local-ep', label: 'Lokal', url: 'http://127.0.0.1:8099/v1/chat' },
  ],
  secretRef: 'MY_KEY',
}

test('valide: deklaratives Manifest mit localhost-Endpoint + Env-secretRef -> manifests', () => {
  const dir = freshDir()
  writeJson(dir, 'valid.json', validManifest)
  const { manifests, rejected } = loadUserManifests(dir)
  expect(rejected).toEqual([])
  expect(manifests).toHaveLength(1)
  expect(manifests[0].id).toBe('my-provider')
  expect(manifests[0].secretRef).toBe('MY_KEY')
  rmSync(dir, { recursive: true, force: true })
})

test('valide: https-Cloud-Endpoint + apiBase -> manifests', () => {
  const dir = freshDir()
  writeJson(dir, 'cloud.json', {
    ...validManifest,
    apiBase: 'https://api.example.com/v1',
    endpoints: [{ id: 'cloud', label: 'Cloud', url: 'https://api.example.com/v1/chat' }],
  })
  const { manifests, rejected } = loadUserManifests(dir)
  expect(rejected).toEqual([])
  expect(manifests).toHaveLength(1)
  rmSync(dir, { recursive: true, force: true })
})

test('(a) invalide: nicht-localhost-nicht-https Endpoint (file://) -> rejected', () => {
  const dir = freshDir()
  writeJson(dir, 'bad-ep.json', {
    ...validManifest,
    endpoints: [{ id: 'evil', label: 'Evil', url: 'file:///etc/passwd' }],
  })
  const { manifests, rejected } = loadUserManifests(dir)
  expect(manifests).toEqual([])
  expect(rejected).toHaveLength(1)
  expect(rejected[0].file).toBe('bad-ep.json')
  expect(rejected[0].reason).toMatch(/Endpoint/i)
  rmSync(dir, { recursive: true, force: true })
})

test('(b) invalide: secretRef ist Inline-Wert statt Env-NAME -> rejected', () => {
  const dir = freshDir()
  writeJson(dir, 'inline-secret.json', { ...validManifest, secretRef: 'sk-ant-realkeyvalue' })
  const { manifests, rejected } = loadUserManifests(dir)
  expect(manifests).toEqual([])
  expect(rejected).toHaveLength(1)
  expect(rejected[0].reason).toMatch(/secretRef|Env-NAME/i)
  // Kein Secret-Wert im Grund (nur Klassen-Hinweis, nie der Inline-String).
  expect(rejected[0].reason).not.toContain('sk-ant-realkeyvalue')
  rmSync(dir, { recursive: true, force: true })
})

test('(c) invalide: kaputtes JSON -> rejected', () => {
  const dir = freshDir()
  write(dir, 'broken.json', '{ "id": "x", "label": ')
  const { manifests, rejected } = loadUserManifests(dir)
  expect(manifests).toEqual([])
  expect(rejected).toHaveLength(1)
  expect(rejected[0].reason).toMatch(/JSON/i)
  rmSync(dir, { recursive: true, force: true })
})

test('(d) invalide: ..-Traversal in fixedRoot -> rejected', () => {
  const dir = freshDir()
  writeJson(dir, 'traversal.json', {
    ...validManifest,
    roots: [{ fixedRoot: '../../etc' }],
  })
  const { manifests, rejected } = loadUserManifests(dir)
  expect(manifests).toEqual([])
  expect(rejected).toHaveLength(1)
  expect(rejected[0].reason).toMatch(/Root|Traversal/i)
  rmSync(dir, { recursive: true, force: true })
})

test('(e) invalide: Manifest mit custom-Feld -> rejected', () => {
  const dir = freshDir()
  // custom als Top-Level-Key (Funktions-Schmuggelversuch).
  writeJson(dir, 'custom-top.json', { ...validManifest, custom: 'irgendwas' })
  // custom in einer Kategorie.
  writeJson(dir, 'custom-cat.json', {
    ...validManifest,
    categories: [{ custom: 'evil' }],
  })
  const { manifests, rejected } = loadUserManifests(dir)
  expect(manifests).toEqual([])
  expect(rejected).toHaveLength(2)
  for (const r of rejected) expect(r.reason).toMatch(/custom/i)
  rmSync(dir, { recursive: true, force: true })
})

test('invalide: Shell-Meta im label -> rejected', () => {
  const dir = freshDir()
  writeJson(dir, 'shell.json', { ...validManifest, label: 'evil; rm -rf /' })
  const { manifests, rejected } = loadUserManifests(dir)
  expect(manifests).toEqual([])
  expect(rejected).toHaveLength(1)
  expect(rejected[0].reason).toMatch(/label/i)
  rmSync(dir, { recursive: true, force: true })
})

test('graceful: fehlendes Verzeichnis -> leeres Ergebnis, kein Crash', () => {
  const res = loadUserManifests(join(tmpdir(), 'rawallm-does-not-exist-xyz'))
  expect(res.manifests).toEqual([])
  expect(res.rejected).toEqual([])
})

test('gemischt: valide + invalide in einem Lauf -> beide getrennt, kein Skip', () => {
  const dir = freshDir()
  writeJson(dir, 'a-valid.json', validManifest)
  writeJson(dir, 'b-bad.json', { ...validManifest, secretRef: 'inline secret value' })
  // Nicht-.json wird ignoriert (kein reject).
  write(dir, 'note.txt', 'kein Manifest')
  // Leeres Unterverzeichnis stoert nicht.
  mkdirSync(join(dir, 'sub'))
  const { manifests, rejected } = loadUserManifests(dir)
  expect(manifests).toHaveLength(1)
  expect(manifests[0].id).toBe('my-provider')
  expect(rejected).toHaveLength(1)
  expect(rejected[0].file).toBe('b-bad.json')
  rmSync(dir, { recursive: true, force: true })
})
