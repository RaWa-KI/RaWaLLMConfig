// config-roots-sources.spec.ts — additive Einspeisung der Nutzer-Quellen in
// configRootList() (WP-C1). Prueft: (a) ohne Provider exakt die vier Basis-
// Wurzeln (Invarianz, byte-identisch); (b) mit Provider erscheinen die Quellen
// additiv HINTEN; (c) eine Quelle die schon Basis ist wird dedupliziert. Der
// Provider wird in afterEach IMMER auf () => [] zurueckgesetzt (kein Leak in
// andere Specs/Invarianz-Tests). Reine Env/Provider-Funktion, kein FS, kein App-Code.
import { test, expect } from '@playwright/test'
import {
  configRootList, configRoots,
  resolveRoots,
  setUserSourceProviderRootsProvider,
  setUserSourceRootsProvider,
  userSourceRoots,
  userSourceRootsForProvider
} from '../../src/main/services/config-roots'

function clearEnv(): void {
  delete process.env.RAWALLM_SANDBOX_ROOT
}

function baseRoots(): string[] {
  const r = configRoots()
  return [r.claudeHome, r.codexHome, r.sharedClaude, r.projectRoot]
}

test.afterEach(() => {
  // Provider zuruecksetzen — sonst leaken Test-Roots in die Invarianz-Specs.
  setUserSourceRootsProvider(() => [])
  setUserSourceProviderRootsProvider(() => ({}))
  clearEnv()
})

test('(a) ohne Provider -> exakt die vier Basis-Wurzeln (Invarianz)', () => {
  clearEnv()
  expect(configRootList()).toEqual(baseRoots())
  expect(userSourceRoots()).toEqual([])
})

test('(b) mit Provider -> Quellen additiv HINTEN angehaengt', () => {
  clearEnv()
  setUserSourceRootsProvider(() => ['D:\\Extra\\One', 'D:\\Extra\\Two'])
  const list = configRootList()
  expect(list.slice(0, 4)).toEqual(baseRoots())
  expect(list).toContain('D:\\Extra\\One')
  expect(list).toContain('D:\\Extra\\Two')
  expect(list[list.length - 1]).toBe('D:\\Extra\\Two')
})

test('(c) Quelle die schon Basis ist wird dedupliziert (case-insensitiv)', () => {
  clearEnv()
  const claudeHome = configRoots().claudeHome
  setUserSourceRootsProvider(() => [claudeHome.toUpperCase(), 'D:\\Extra\\Neu'])
  const list = configRootList()
  // claudeHome darf nicht doppelt auftauchen; nur die Basis-Variante zaehlt.
  expect(list.filter((p) => p.toLowerCase() === claudeHome.toLowerCase())).toHaveLength(1)
  expect(list).toContain('D:\\Extra\\Neu')
  expect(list).toHaveLength(5)
})

test('(d) defekter Provider -> Fehler faellt auf Basis-4 zurueck', () => {
  clearEnv()
  setUserSourceRootsProvider(() => { throw new Error('boom') })
  expect(configRootList()).toEqual(baseRoots())
})

test('(e) resolveRoots haengt Quellen passend zur Provider-ID an', () => {
  clearEnv()
  setUserSourceProviderRootsProvider(() => ({
    claude: ['D:\\Extra\\Claude'],
    codex: ['D:\\Extra\\Codex']
  }))
  const roots = resolveRoots([{ rootKey: 'claudeHome' }], 'claude')
  expect(roots).toEqual([configRoots().claudeHome, 'D:\\Extra\\Claude'])
  expect(userSourceRootsForProvider('codex')).toEqual(['D:\\Extra\\Codex'])
})
