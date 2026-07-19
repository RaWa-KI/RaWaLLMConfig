// update-gates.spec.ts — Verhaltens-Specs fuer die transport-unabhaengigen
// Installer-Gates (WP18, TEST-MITTEL-03/A2): MZ-Header, exakte Groesse,
// SHA-256, HR7-konformer _failed-Move. Electron-frei, nur tmp-Sandbox
// (fixtures.makeSandbox) — kein Prod-Code-Touch, kein Zustand zwischen Tests.
import { test, expect } from '@playwright/test'
import { readdirSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { makeSandbox, seedFile } from './fixtures'
import {
  checkExactSize,
  checkMagicHeader,
  checkMzHeader,
  moveToFailed,
  sha256Hex,
} from '../../src/main/services/update-gates'

test.describe('checkMagicHeader', () => {
  test('ELF-Signatur (0x7f 45 4c 46) -> true', () => {
    const sb = makeSandbox()
    const p = seedFile(sb, 'ok.AppImage', Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0x00]).toString())
    expect(checkMagicHeader(p, [0x7f, 0x45, 0x4c, 0x46])).toBe(true)
  })

  test('abweichende Signatur -> false', () => {
    const sb = makeSandbox()
    const p = seedFile(sb, 'zip.AppImage', 'PK' + 'x'.repeat(64))
    expect(checkMagicHeader(p, [0x7f, 0x45, 0x4c, 0x46])).toBe(false)
  })

  test('Windows-MZ gegen Linux-ELF-Spec -> false', () => {
    const sb = makeSandbox()
    const p = seedFile(sb, 'windows.AppImage', 'MZ' + 'x'.repeat(64))
    expect(checkMagicHeader(p, [0x7f, 0x45, 0x4c, 0x46])).toBe(false)
  })
})

test.describe('checkMzHeader', () => {
  test('MZ-Signatur (0x4d 0x5a) -> true', () => {
    const sb = makeSandbox()
    const p = seedFile(sb, 'ok.exe', 'MZ' + 'x'.repeat(64))
    expect(checkMzHeader(p)).toBe(true)
  })

  test('PK-Header (ZIP) -> false', () => {
    const sb = makeSandbox()
    const p = seedFile(sb, 'zip.exe', 'PK' + 'x'.repeat(64))
    expect(checkMzHeader(p)).toBe(false)
  })

  test('1-Byte-Datei -> false (zu kurz fuer Signatur)', () => {
    const sb = makeSandbox()
    const p = seedFile(sb, 'tiny.exe', 'M')
    expect(checkMzHeader(p)).toBe(false)
  })

  test('fehlende Datei -> false (kein Throw)', () => {
    const sb = makeSandbox()
    expect(checkMzHeader(join(sb.configDir, 'gibt-es-nicht.exe'))).toBe(false)
  })
})

test.describe('checkExactSize', () => {
  test('exakte Byte-Anzahl -> true', () => {
    const sb = makeSandbox()
    const content = 'MZ' + 'a'.repeat(100)
    const p = seedFile(sb, 'sized.exe', content)
    expect(checkExactSize(p, Buffer.byteLength(content))).toBe(true)
  })

  test('abweichende Groesse -> false (strict)', () => {
    const sb = makeSandbox()
    const content = 'MZ' + 'a'.repeat(100)
    const p = seedFile(sb, 'sized.exe', content)
    expect(checkExactSize(p, Buffer.byteLength(content) + 1)).toBe(false)
    expect(checkExactSize(p, Buffer.byteLength(content) - 1)).toBe(false)
  })

  test('fehlende Datei -> false (kein Throw)', () => {
    const sb = makeSandbox()
    expect(checkExactSize(join(sb.configDir, 'fehlt.exe'), 42)).toBe(false)
  })
})

test.describe('sha256Hex', () => {
  test('liefert lowercase-hex identisch zum createHash-Referenzwert', async () => {
    const sb = makeSandbox()
    const content = 'MZ-Installer-Inhalt mit Umlauten äöü ' + 'z'.repeat(500)
    const p = seedFile(sb, 'hash.exe', content)
    const expected = createHash('sha256').update(Buffer.from(content, 'utf8')).digest('hex')
    const actual = await sha256Hex(p)
    expect(actual).toBe(expected)
    expect(actual).toBe(actual.toLowerCase())
  })
})

test.describe('moveToFailed', () => {
  test('verschiebt Datei nach _failed/<ts>_<basename>; Original weg', () => {
    const sb = makeSandbox()
    const p = seedFile(sb, 'kaputt.exe', 'PK-Teilcopy')
    moveToFailed(p)
    expect(existsSync(p)).toBe(false)
    const failedDir = join(sb.configDir, '_failed')
    expect(existsSync(failedDir)).toBe(true)
    const entries = readdirSync(failedDir)
    expect(entries.length).toBe(1)
    // Namensschema: ISO-Timestamp (:/. -> -) + '_' + Original-Basename.
    expect(entries[0]).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z_kaputt\.exe$/)
  })

  test('fehlende Quelle -> kein Throw, kein Eintrag in _failed', () => {
    const sb = makeSandbox()
    const p = join(sb.configDir, 'nie-da-gewesen.exe')
    expect(() => moveToFailed(p)).not.toThrow()
    const failedDir = join(sb.configDir, '_failed')
    // mkdir laeuft vor dem Existenz-Check — Ordner darf existieren, aber leer.
    if (existsSync(failedDir)) expect(readdirSync(failedDir).length).toBe(0)
  })
})
