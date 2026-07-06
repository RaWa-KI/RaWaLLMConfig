// cloud-key-lifecycle.spec.ts — D5: duenne Schicht ueber env-migrate. Migriert
// einen Cloud-API-Key auf eine Env-Variable: backup-first, atomar, Wert NIEMALS
// im Ergebnis/Log. ALLE Laeufe in der temp-Sandbox (fixtures.ts); setEnv ist
// IMMER ein Fake-Recorder — KEIN Spec mutiert die reale User-Env oder spawnt
// powershell.exe. Fixture-Werte sind offensichtliche Fake-Cloud-Keys.
import { test, expect } from '@playwright/test'
import { readFileSync, existsSync } from 'node:fs'
import { migrateCloudKeyToEnv } from '../../src/main/services/cloud-key-lifecycle'
import { setWriteEnabledRuntime } from '../../src/main/services/write-mode'
import { makeSandbox, seedFile } from './fixtures'

// Schreibmodus deterministisch AN; danach Env-Fallback zurueck.
test.beforeEach(() => setWriteEnabledRuntime(true))
test.afterEach(() => setWriteEnabledRuntime(null))

// Fake-setEnv-Recorder: zeichnet Aufrufe auf, mutiert NIE die reale Env.
function makeRecorder(result = true) {
  const calls: Array<{ varName: string; value: string }> = []
  const setEnv = (varName: string, value: string): boolean => {
    calls.push({ varName, value })
    return result
  }
  return { calls, setEnv }
}

// Format-treuer FAKE-Cloud-Key (eindeutig Dummy, kein echter Key).
const FAKE_KEY = 'sk-ant-api03-DUMMYaaaabbbbccccddddeeee0000111122223333'

// (1) Happy-Path: Config -> ${VAR}, backup-first, Status wertfrei.
test('migriert Cloud-Key auf ${VAR}: backup-first, atomar, wertfrei', () => {
  const sb = makeSandbox()
  const file = seedFile(sb, 'config.toml', `model = gpt-x\napi_key = ${FAKE_KEY}\n`)
  const rec = makeRecorder()
  const res = migrateCloudKeyToEnv(
    { configPath: file, varName: 'ANTHROPIC_API_KEY' },
    { archiveRoot: sb.archiveRoot, auditPath: sb.auditPath, setEnv: rec.setEnv }
  )
  expect(res.ok).toBe(true)
  expect(res.varName).toBe('ANTHROPIC_API_KEY')
  expect(res.action).toBe('migrated')
  // Recorder bekam exakt den Cloud-Key der Credential-Zeile (nicht 'gpt-x').
  expect(rec.calls).toHaveLength(1)
  expect(rec.calls[0].value).toBe(FAKE_KEY)
  // Config auf ${VAR} umgeschrieben, Key-Wert verschwunden, model intakt.
  const after = readFileSync(file, 'utf8')
  expect(after).toContain('api_key=${ANTHROPIC_API_KEY}')
  expect(after).toContain('model = gpt-x')
  expect(after).not.toContain(FAKE_KEY)
})

// (2) Backup-first (HR7/HR20): Pre-Snapshot unter Sandbox-archiveRoot existiert
//     und traegt den ALTEN Inhalt (verifizierbare Rueckrollquelle).
test('backup-first: Pre-Snapshot unter archiveRoot mit altem Inhalt', () => {
  const sb = makeSandbox()
  const file = seedFile(sb, 'config.toml', `api_key = ${FAKE_KEY}\n`)
  const rec = makeRecorder()
  const res = migrateCloudKeyToEnv(
    { configPath: file, varName: 'CLOUD_KEY' },
    { archiveRoot: sb.archiveRoot, auditPath: sb.auditPath, setEnv: rec.setEnv }
  )
  expect(res.ok).toBe(true)
  expect(res.backupPath).toBeTruthy()
  const bp = String(res.backupPath)
  expect(existsSync(bp)).toBe(true)
  const norm = bp.replace(/\\/g, '/')
  expect(norm.startsWith(sb.archiveRoot.replace(/\\/g, '/'))).toBe(true)
  // Snapshot traegt den ALTEN (unmigriertem) Inhalt -> Rueckrollquelle.
  expect(readFileSync(bp, 'utf8')).toContain(FAKE_KEY)
})

// (3) LEAK-NEGATIVTEST: der Key-Wert taucht NIE im Funktionsergebnis auf
//     (JSON.stringify des gesamten Result-Objekts).
test('Leak-Negativtest: Key-Wert nie im Ergebnis (JSON.stringify)', () => {
  const sb = makeSandbox()
  const file = seedFile(sb, 'config.toml', `api_key = ${FAKE_KEY}\n`)
  const rec = makeRecorder()
  const res = migrateCloudKeyToEnv(
    { configPath: file, varName: 'CLOUD_KEY' },
    { archiveRoot: sb.archiveRoot, auditPath: sb.auditPath, setEnv: rec.setEnv }
  )
  expect(JSON.stringify(res)).not.toContain(FAKE_KEY)
  // Auch der Audit-Log enthaelt den Wert nie.
  const audit = readFileSync(sb.auditPath, 'utf8')
  expect(audit).not.toContain(FAKE_KEY)
})

// (4) setEnv-Fehler -> ok:false, action:'env-set-failed', Datei unveraendert
//     (Owner kann gefahrlos erneut ausloesen).
test('setEnv-Fehler: ok=false, action=env-set-failed, Datei unveraendert', () => {
  const sb = makeSandbox()
  const body = `api_key = ${FAKE_KEY}\n`
  const file = seedFile(sb, 'config.toml', body)
  const rec = makeRecorder(false)
  const res = migrateCloudKeyToEnv(
    { configPath: file, varName: 'CLOUD_KEY' },
    { archiveRoot: sb.archiveRoot, auditPath: sb.auditPath, setEnv: rec.setEnv }
  )
  expect(res.ok).toBe(false)
  expect(res.action).toBe('env-set-failed')
  expect(readFileSync(file, 'utf8')).toBe(body)
})

// (5) Kein Backup herstellbar (HR20): leerer/ungueltiger archiveRoot -> STOP/Fehler,
//     KEIN Schreiben (Datei byte-identisch, kein Rewrite).
test('No-Data-Loss: ohne herstellbares Backup -> Fehler, kein Schreiben', () => {
  const sb = makeSandbox()
  const body = `api_key = ${FAKE_KEY}\n`
  const file = seedFile(sb, 'config.toml', body)
  const rec = makeRecorder()
  // Ungueltiger Archiv-Root (leer) -> exportSnapshot scheitert -> Abbruch.
  const res = migrateCloudKeyToEnv(
    { configPath: file, varName: 'CLOUD_KEY' },
    { archiveRoot: '', auditPath: sb.auditPath, setEnv: rec.setEnv }
  )
  expect(res.ok).toBe(false)
  expect(res.action).toBe('backup-failed')
  expect(rec.calls).toHaveLength(0) // Env NIE gesetzt
  expect(readFileSync(file, 'utf8')).toBe(body) // kein Rewrite
})

// (6) Schreibmodus AUS -> ok:false, action:'write-disabled', keine Mutation.
test('Schreibmodus AUS: ok=false, action=write-disabled, keine Mutation', () => {
  setWriteEnabledRuntime(false)
  const sb = makeSandbox()
  const body = `api_key = ${FAKE_KEY}\n`
  const file = seedFile(sb, 'config.toml', body)
  const rec = makeRecorder()
  const res = migrateCloudKeyToEnv(
    { configPath: file, varName: 'CLOUD_KEY' },
    { archiveRoot: sb.archiveRoot, auditPath: sb.auditPath, setEnv: rec.setEnv }
  )
  expect(res.ok).toBe(false)
  expect(res.action).toBe('write-disabled')
  expect(rec.calls).toHaveLength(0)
  expect(readFileSync(file, 'utf8')).toBe(body)
})

// (7) Ungueltiger varName -> ok:false, action:'invalid-var', keine Mutation.
test('ungueltiger varName: ok=false, action=invalid-var, keine Mutation', () => {
  const sb = makeSandbox()
  const body = `api_key = ${FAKE_KEY}\n`
  const file = seedFile(sb, 'config.toml', body)
  const rec = makeRecorder()
  const res = migrateCloudKeyToEnv(
    { configPath: file, varName: 'bad-name!' },
    { archiveRoot: sb.archiveRoot, auditPath: sb.auditPath, setEnv: rec.setEnv }
  )
  expect(res.ok).toBe(false)
  expect(res.action).toBe('invalid-var')
  expect(rec.calls).toHaveLength(0)
  expect(readFileSync(file, 'utf8')).toBe(body)
})
