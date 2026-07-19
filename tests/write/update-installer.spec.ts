// update-installer.spec.ts — Minimal-Specs fuer verifyInstaller + den
// runInstaller-Negativpfad (WP20 Schritt 6, Owner-Entscheid 3).
// KEIN echter Spawn-Test im Unit-Lauf — das deckt das Owner-Smoke-Gate der
// Referenzdoku. Electron-frei, nur tmp-Sandbox; Suite fullyParallel:false.
import { test, expect } from '@playwright/test'
import { join } from 'node:path'
import { makeSandbox, seedFile, sandboxPath } from './fixtures'
import { verifyInstaller, runInstaller } from '../../src/main/services/update-installer'
import { assetSpecFor } from '../../src/main/services/update-platform'

const MZ_CONTENT = 'MZ' + 'x'.repeat(1024)
const ELF_CONTENT = '\u007fELF' + 'x'.repeat(1024)
const WIN_SPEC = assetSpecFor('win32')

test.describe('verifyInstaller', () => {
  test('Verzeichnis statt Datei -> not-a-file', () => {
    const sb = makeSandbox()
    expect(verifyInstaller(sb.configDir, WIN_SPEC)).toEqual({ valid: false, error: 'not-a-file' })
  })

  test('0-Byte-.exe -> empty', () => {
    const sb = makeSandbox()
    const p = seedFile(sb, 'leer.exe', '')
    expect(verifyInstaller(p, WIN_SPEC)).toEqual({ valid: false, error: 'empty' })
  })

  test('.txt-Datei -> not-exe', () => {
    const sb = makeSandbox()
    const p = seedFile(sb, 'kein-installer.txt', MZ_CONTENT)
    expect(verifyInstaller(p, WIN_SPEC)).toEqual({ valid: false, error: 'not-exe' })
  })

  test('nicht-existenter Pfad -> verify-failed', () => {
    const sb = makeSandbox()
    const p = sandboxPath(sb, 'gibt-es-nicht.exe')
    expect(verifyInstaller(p, WIN_SPEC)).toEqual({ valid: false, error: 'verify-failed' })
  })

  test('gueltige nicht-leere .exe (case-insensitive Endung) -> valid', () => {
    const sb = makeSandbox()
    const p = seedFile(sb, 'RaWa-Setup.EXE', MZ_CONTENT)
    expect(verifyInstaller(p, WIN_SPEC)).toEqual({ valid: true, error: null })
  })

  test('Linux-Spec: falsche Endung -> not-appimage', () => {
    const sb = makeSandbox()
    const p = seedFile(sb, 'RaWa-Setup.exe', MZ_CONTENT)
    expect(verifyInstaller(p, assetSpecFor('linux'))).toEqual({ valid: false, error: 'not-appimage' })
  })

  test('Linux-Spec: gueltige nicht-leere .AppImage -> valid', () => {
    const sb = makeSandbox()
    const p = seedFile(sb, 'RaWaLLMConfig.AppImage', ELF_CONTENT)
    expect(verifyInstaller(p, assetSpecFor('linux'))).toEqual({ valid: true, error: null })
  })
})

test.describe('runInstaller (NUR Negativ-Pfad, kein Spawn)', () => {
  test('fehlende Datei -> spawned false, installer-missing', async () => {
    const sb = makeSandbox()
    const p = join(sb.configDir, 'staged', 'nie-da.exe')
    const r = await runInstaller(p, { silent: true })
    expect(r).toEqual({ spawned: false, error: 'installer-missing' })
  })
})
