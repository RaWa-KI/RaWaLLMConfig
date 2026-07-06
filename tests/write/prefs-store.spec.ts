// prefs-store.spec.ts — File-Adapter (PersistencePort) gegen temp-Sandbox.
// Prueft: Defaults, atomarer Write (keine tmp-Restdatei), backup-first
// (Pre-Snapshot beim Overwrite), MariaDB graceful-absent (File-Adapter laeuft
// ohne Env/DB). Reine temp-Sandbox, NIE reale Config.
import { test, expect } from '@playwright/test'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { createFilePrefsStore, DEFAULT_PREFS } from '../../src/main/services/prefs-store'
import { makeSandbox, assertNotRealHome } from './fixtures'

function storeOpts(): { prefsPath: string; archiveRoot: string; auditPath: string } {
  const sb = makeSandbox()
  const prefsPath = join(sb.configDir, 'prefs.json')
  assertNotRealHome(prefsPath)
  // auditPath mit in die Sandbox leiten — set() schreibt nach erfolgreichem Write
  // einen Audit-Eintrag; ohne Sandbox-Pfad landete der in der realen Config.
  return { prefsPath, archiveRoot: sb.archiveRoot, auditPath: sb.auditPath }
}

test('frische Prefs liefern Defaults (kein Crash ohne Datei)', async () => {
  const opts = storeOpts()
  const store = createFilePrefsStore(opts)
  expect(await store.getAll()).toEqual(DEFAULT_PREFS)
  expect(await store.get('theme')).toBe(DEFAULT_PREFS.theme)
})

test('set schreibt atomar (keine tmp-Restdatei) + Wert persistiert', async () => {
  const opts = storeOpts()
  const store = createFilePrefsStore(opts)
  const out = await store.set('theme', 'anthrazit')
  expect(out.ok).toBe(true)
  expect(out.error).toBeNull()
  // Wert persistiert in JSON.
  const onDisk = JSON.parse(readFileSync(opts.prefsPath, 'utf8'))
  expect(onDisk.theme).toBe('anthrazit')
  // Keine tmp-Restdatei im Zielverzeichnis.
  const dir = dirname(opts.prefsPath)
  expect(readdirSync(dir).some((f) => f.includes('.tmp-'))).toBe(false)
})

test('zweites set macht backup-first (Pre-Snapshot der alten Prefs)', async () => {
  const opts = storeOpts()
  const store = createFilePrefsStore(opts)
  await store.set('theme', 'papier') // legt Datei an (kein Backup, da vorher nicht da)
  const out = await store.set('theme', 'espresso') // Overwrite -> Pre-Snapshot
  expect(out.ok).toBe(true)
  expect(out.backupPath).toBeTruthy()
  expect(existsSync(out.backupPath!)).toBe(true)
  // Snapshot enthaelt den ALTEN Wert.
  expect(readFileSync(out.backupPath!, 'utf8')).toContain('papier')
})

test('get/set sind idempotent (gleicher Tweak -> gleicher Zustand)', async () => {
  const opts = storeOpts()
  const store = createFilePrefsStore(opts)
  await store.set('density', 'compact')
  await store.set('density', 'compact')
  expect(await store.get('density')).toBe('compact')
})

test('MariaDB graceful-absent: File-Adapter laeuft ohne DB/Env', async () => {
  // Hermetisch: relevante MARIADB-Env explizit fuer die Testlaufzeit loeschen
  // (vorher sichern, im finally restaurieren). So testet der Fall deterministisch
  // den File-Adapter-Pfad, unabhaengig davon, ob auf der Maschine MariaDB laeuft.
  const MARIADB_VARS = ['CAUDEX_MARIADB_HOST', 'RAWALLMCONFIG_MARIADB_SCHEMA', 'RAWALLMCONFIG_MARIADB_USER']
  const saved: Record<string, string | undefined> = {}
  for (const k of MARIADB_VARS) {
    saved[k] = process.env[k]
    delete process.env[k]
  }
  try {
    // Kein MARIADB_* gesetzt -> File-Adapter ist der aktive PersistencePort.
    expect(process.env.RAWALLMCONFIG_MARIADB_USER).toBeUndefined()
    const opts = storeOpts()
    const store = createFilePrefsStore(opts)
    expect((await store.set('structure', 'lines')).ok).toBe(true)
    expect(await store.get('structure')).toBe('lines')
  } finally {
    // Maschinen-Env wiederherstellen (kein Leak in andere Tests/Prozesse).
    for (const k of MARIADB_VARS) {
      if (saved[k] === undefined) delete process.env[k]
      else process.env[k] = saved[k]
    }
  }
})
