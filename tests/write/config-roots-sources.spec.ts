// config-roots-sources.spec.ts — additive Einspeisung der Nutzer-Quellen in
// configRootList() (WP-C1). Prueft: (a) ohne Provider exakt die verfuegbaren Basis-
// Wurzeln (Invarianz, byte-identisch); (b) mit Provider erscheinen die Quellen
// additiv HINTEN; (c) eine Quelle die schon Basis ist wird dedupliziert. Der
// Provider wird in afterEach IMMER auf () => [] zurueckgesetzt (kein Leak in
// andere Specs/Invarianz-Tests). Reine Env/Provider-Funktion, kein FS, kein App-Code.
import { test, expect } from '@playwright/test'
import { pathsEqual } from '../../shared/path-compare'
import {
  configRootList, configRoots, configWatchRootList,
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
  return configWatchRootList()
}

test.afterEach(() => {
  // Provider zuruecksetzen — sonst leaken Test-Roots in die Invarianz-Specs.
  setUserSourceRootsProvider(() => [])
  setUserSourceProviderRootsProvider(() => ({}))
  clearEnv()
})

test('(a) ohne Provider -> exakt die verfuegbaren Basis-Wurzeln (Invarianz)', () => {
  clearEnv()
  expect(configRootList()).toEqual(baseRoots())
  expect(userSourceRoots()).toEqual([])
})

test('(b) mit Provider -> Quellen additiv HINTEN angehaengt', () => {
  clearEnv()
  setUserSourceRootsProvider(() => ['D:\\Extra\\One', 'D:\\Extra\\Two'])
  const base = baseRoots()
  const list = configRootList()
  expect(list.slice(0, base.length)).toEqual(base)
  expect(list).toContain('D:\\Extra\\One')
  expect(list).toContain('D:\\Extra\\Two')
  expect(list[list.length - 1]).toBe('D:\\Extra\\Two')
})

test('(b2) Live-Watcher bleibt auf Basis-Wurzeln begrenzt', () => {
  clearEnv()
  setUserSourceRootsProvider(() => ['D:\\Extra\\WideRoot'])
  expect(configRootList()).toContain('D:\\Extra\\WideRoot')
  expect(configWatchRootList()).toEqual(baseRoots())
  expect(configWatchRootList()).not.toContain('D:\\Extra\\WideRoot')
})

test('(c) Quelle die schon Basis ist wird plattformgerecht dedupliziert', () => {
  clearEnv()
  const claudeHome = configRoots().claudeHome
  const caseVariant = claudeHome.toUpperCase()
  setUserSourceRootsProvider(() => [caseVariant, 'D:\\Extra\\Neu'])
  const list = configRootList()
  expect(list.filter((path) => pathsEqual(path, claudeHome, process.platform))).toHaveLength(1)
  expect(list).toContain('D:\\Extra\\Neu')
  const caseVariantIsDistinct = process.platform !== 'win32' && caseVariant !== claudeHome
  expect(list).toHaveLength(baseRoots().length + (caseVariantIsDistinct ? 2 : 1))
  if (caseVariantIsDistinct) expect(list).toContain(caseVariant)
})

test('(d) defekter Provider -> Fehler faellt auf Basis-Wurzeln zurueck', () => {
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
