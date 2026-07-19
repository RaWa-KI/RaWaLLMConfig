import { expect, test } from '@playwright/test'
import {
  isPathEqualOrUnder,
  normalizePathForCompare,
  pathComparisonPlatformFor,
  pathsEqual
} from '../../shared/path-compare'
import { isAllowedRoot } from '../../src/renderer/lib/import-targets'
import { knownRootsFromConfig } from '../../src/renderer/lib/known-roots'
import { resolveFamilyRoot } from '../../src/renderer/sections/config/move-target'
import { classifyLoadMode } from '../../src/main/scan/load-classifier'
import type { AppData } from '../../shared/contract'

test('win32 vergleicht Pfade ohne Beachtung der Grossschreibung', () => {
  expect(pathsEqual('C:\\Workspace\\Project\\.codex', 'c:/workspace/project/.codex', 'win32')).toBe(true)
  expect(isPathEqualOrUnder('C:\\Workspace\\Project\\.codex\\agents', 'c:/workspace/project/.CODEX', 'win32')).toBe(true)
})

test('linux und darwin behalten die Grossschreibung bei', () => {
  expect(pathsEqual('/home/mona/.codex', '/home/Mona/.codex', 'linux')).toBe(false)
  expect(pathsEqual('/Users/mona/.codex', '/Users/Mona/.codex', 'darwin')).toBe(false)
  expect(isPathEqualOrUnder('/home/Mona/.codex/agents', '/home/mona/.codex', 'linux')).toBe(false)
})

test('Separatoren folgen dem Plattform-Dialekt', () => {
  expect(normalizePathForCompare('C:\\Workspace/Project\\.codex', 'win32')).toBe('c:/workspace/project/.codex')
  expect(normalizePathForCompare('/home/mona\\.codex//agents', 'linux')).toBe('/home/mona\\.codex/agents')
  expect(pathsEqual('/home/mona\\.codex', '/home/mona/.codex', 'linux')).toBe(false)
  expect(pathsEqual('/Users/mona\\.codex', '/Users/mona/.codex', 'darwin')).toBe(false)
})

test('Fallback-Inferenz verwechselt POSIX-Doppel-Slash nicht mit UNC', () => {
  expect(pathComparisonPlatformFor('C:\\Workspace\\Project\\.codex')).toBe('win32')
  expect(pathComparisonPlatformFor('\\\\server\\share\\.codex')).toBe('win32')
  expect(pathComparisonPlatformFor('/home/mona/.codex')).toBe('linux')
  expect(pathComparisonPlatformFor('//home/mona/.codex')).toBe('linux')
})

test('knownRootsFromConfig erhaelt den fuehrenden POSIX-Separator', () => {
  const data = {
    data: {
      codex: {
        categories: [{ path: '/home/mona/.codex/agents', entries: [] }]
      }
    }
  } as unknown as AppData
  expect(knownRootsFromConfig(data, 'linux')).toEqual(['/home/mona/.codex'])
})

test('Containment bleibt segment-sicher', () => {
  expect(isPathEqualOrUnder('/home/mona/.codex/agents', '/home/mona/.codex', 'linux')).toBe(true)
  expect(isPathEqualOrUnder('/home/mona/.codex-other', '/home/mona/.codex', 'linux')).toBe(false)
})

test('POSIX-Backslash bleibt Namenszeichen und oeffnet keine Allowlist', () => {
  expect(isAllowedRoot('/home/mona/.codex/agents', 'linux')).toBe(true)
  expect(isAllowedRoot('/home/mona\\.codex/agents', 'linux')).toBe(false)
  expect(isAllowedRoot('/home/mona/.codex\\agents', 'linux')).toBe(false)
})

test('POSIX-Doppel-Slash bleibt case-sensitiv, UNC bleibt Windows-case-insensitiv', () => {
  expect(normalizePathForCompare('//home/Mona/.codex', 'linux')).toBe('//home/Mona/.codex')
  expect(pathsEqual('//home/Mona/.codex', '//home/mona/.codex', 'linux')).toBe(false)
  expect(normalizePathForCompare('\\\\SERVER\\Share\\.CODEX', 'win32')).toBe('//server/share/.codex')
  expect(pathsEqual('//SERVER/Share/.CODEX', '\\\\server\\share\\.codex', 'win32')).toBe(true)
})

test('knownRoots erhaelt POSIX-, Drive- und UNC-Praefixe', () => {
  const appData = (path: string) => ({
    data: { codex: { categories: [{ path, entries: [] }] } }
  }) as unknown as AppData

  expect(knownRootsFromConfig(appData('/home/mona/.codex/agents'), 'linux'))
    .toEqual(['/home/mona/.codex'])
  expect(knownRootsFromConfig(appData('C:\\Workspace\\Project\\.codex\\agents'), 'win32'))
    .toEqual(['C:/Workspace/Project/.codex'])
  expect(knownRootsFromConfig(appData('\\\\server\\share\\.codex\\agents'), 'win32'))
    .toEqual(['//server/share/.codex'])
})

test('Pfadbasierte Klassifizierer respektieren die injizierte Plattform', () => {
  const windowsMixedCase = 'C:\\Workspace\\Project\\.CODEX\\agents\\AGENTS.md'
  const linuxMixedCase = '/home/mona/.CODEX/agents/AGENTS.md'
  expect(isAllowedRoot(windowsMixedCase, 'win32')).toBe(true)
  expect(isAllowedRoot(linuxMixedCase, 'linux')).toBe(false)
  expect(resolveFamilyRoot('codex', [windowsMixedCase], 'win32')).toBe('C:/Workspace/Project/.CODEX')
  expect(resolveFamilyRoot('codex', [linuxMixedCase], 'linux')).toBeUndefined()
  expect(classifyLoadMode('/home/mona/Skills/demo/SKILL.md', undefined, 'generic', 'win32')).toBe('bei-bedarf')
  expect(classifyLoadMode('/home/mona/Skills/demo/SKILL.md', undefined, 'generic', 'linux')).toBe('unbekannt')
})
