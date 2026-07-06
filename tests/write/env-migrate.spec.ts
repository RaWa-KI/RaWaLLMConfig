// env-migrate.spec.ts — Tier-1-Korrektheit des Env-Migrations-Knopfs (WP8,
// QUAL-HOCH-02 / TEST-MITTEL-04). Kernbeweise: (1) migriert wird EXAKT die
// Credential-Zeile der Anzeige-Heuristik (CRED_KEY_RX), nie mehr die erste
// beliebige `=`-Zeile (`model = …` in config.toml bleibt unangetastet);
// (3) JSON/YAML-':'-Zuweisungen werden sauber abgelehnt statt zerschrieben.
// ALLE Laeufe in der temp-Sandbox (fixtures.ts); setEnv ist IMMER ein
// Fake-Recorder — KEIN Spec mutiert die reale User-Env oder spawnt
// powershell.exe. Fixture-Werte sind offensichtliche Dummies, keine Secrets.
import { test, expect } from '@playwright/test'
import { readFileSync, existsSync } from 'node:fs'
import { envMigrate } from '../../src/main/services/env-migrate'
import { findCredentialLine } from '../../src/main/services/credential-detect'
import { setWriteEnabledRuntime } from '../../src/main/services/write-mode'
import { makeSandbox, seedFile } from './fixtures'

// Schreibmodus deterministisch AN (In-App-Toggle); danach Env-Fallback zuruek.
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

function makeUnsetRecorder(result = true) {
  const calls: string[] = []
  const unsetEnv = (varName: string): boolean => {
    calls.push(varName)
    return result
  }
  return { calls, unsetEnv }
}

// (1) Kernbeweis QUAL-HOCH-02: config.toml mit `model = …` als ERSTER `=`-Zeile
// — migriert wird die Credential-Zeile (api_key), model bleibt byte-identisch.
test('config.toml: migriert exakt die Credential-Zeile, NIE die model-Zeile', () => {
  const sb = makeSandbox()
  const file = seedFile(
    sb,
    'config.toml',
    'model = gpt-x\nprovider = openai\napi_key = abc123dummysecret\n'
  )
  const rec = makeRecorder()
  const res = envMigrate({ path: file, varName: 'MY_API_KEY' }, sb.archiveRoot, sb.auditPath, rec.setEnv)
  expect(res.error).toBeNull()
  expect(res.data?.varSet).toBe(true)
  expect(res.data?.rewritten).toBe(true)
  // Recorder bekam exakt den Wert der ERKANNTEN Credential-Zeile (nicht 'gpt-x').
  expect(rec.calls).toHaveLength(1)
  expect(rec.calls[0].varName).toBe('MY_API_KEY')
  expect(rec.calls[0].value).toBe('abc123dummysecret')
  const after = readFileSync(file, 'utf8')
  expect(after).toContain('model = gpt-x') // NIE migriert
  expect(after).toContain('provider = openai')
  expect(after).toContain('api_key=${MY_API_KEY}') // exakt diese Zeile ersetzt
  expect(after).not.toContain('abc123dummysecret')
})

// (2) Multi-Credential v1-Pin: .env mit ZWEI Token-Zeilen -> nur die ERSTE wird
// umgeschrieben (bewusste v1-Entscheidung, Kommentar in findCredentialLine).
test('.env mit zwei Token-Zeilen: nur die erste wird umgeschrieben (v1-Pin)', () => {
  const sb = makeSandbox()
  const file = seedFile(sb, '.env', 'APP_TOKEN=firstdummyval\nAPI_TOKEN=seconddummyval\n')
  const rec = makeRecorder()
  const res = envMigrate({ path: file, varName: 'APP_TOKEN' }, sb.archiveRoot, sb.auditPath, rec.setEnv)
  expect(res.error).toBeNull()
  expect(res.data?.rewritten).toBe(true)
  expect(rec.calls).toHaveLength(1)
  expect(rec.calls[0].value).toBe('firstdummyval') // erste Credential-Zeile
  const after = readFileSync(file, 'utf8')
  expect(after).toContain('APP_TOKEN=${APP_TOKEN}')
  expect(after).toContain('API_TOKEN=seconddummyval') // zweite bleibt unveraendert
  expect(after).not.toContain('firstdummyval')
})

// (3) Kernbeweis: JSON-artige ':'-Zuweisung -> 'unsupported-format', Datei
// byte-identisch, setEnv wird NIE aufgerufen (kein Zerschreiben mehr).
test('JSON-Format: unsupported-format, Datei byte-identisch, setEnv NIE aufgerufen', () => {
  const sb = makeSandbox()
  const body = '{\n  "token": "xyzdummy123"\n}\n'
  const file = seedFile(sb, 'settings.json', body)
  const rec = makeRecorder()
  const res = envMigrate({ path: file, varName: 'MY_TOKEN' }, sb.archiveRoot, sb.auditPath, rec.setEnv)
  expect(res.data).toBeNull()
  expect(res.error).toBe('unsupported-format: nur KEY=VALUE migrierbar')
  expect(rec.calls).toHaveLength(0) // NIE Env gesetzt
  expect(readFileSync(file, 'utf8')).toBe(body) // byte-identisch, kein Rewrite
})

// (4) Bereits migrierte ${VAR}-Referenz -> 'no-secret-value-found', keine Mutation.
test('bereits ${VAR}-Referenz: no-secret-value-found, keine Mutation', () => {
  const sb = makeSandbox()
  const body = 'API_TOKEN=${MY_TOKEN}\n'
  const file = seedFile(sb, '.env', body)
  const rec = makeRecorder()
  const res = envMigrate({ path: file, varName: 'MY_TOKEN' }, sb.archiveRoot, sb.auditPath, rec.setEnv)
  expect(res.data).toBeNull()
  expect(res.error).toBe('no-secret-value-found')
  expect(rec.calls).toHaveLength(0)
  expect(readFileSync(file, 'utf8')).toBe(body)
})

// (5) Happy-Path: Backup-Snapshot unter Sandbox-archiveRoot (backup-first, HR7),
// Audit-Zeile 'env-migrate' im Sandbox-auditPath, Result NIE mit Secret-Wert.
test('Happy-Path: Backup unter archiveRoot, Audit env-migrate, Result wertfrei', () => {
  const sb = makeSandbox()
  const file = seedFile(sb, 'config.toml', 'api_key = dummyhappysecret\n')
  const rec = makeRecorder()
  const res = envMigrate({ path: file, varName: 'HAPPY_KEY' }, sb.archiveRoot, sb.auditPath, rec.setEnv)
  expect(res.error).toBeNull()
  const backupPath = res.data?.backupPath
  expect(backupPath).toBeTruthy()
  const normBackup = String(backupPath).replace(/\\/g, '/')
  expect(normBackup.startsWith(sb.archiveRoot.replace(/\\/g, '/'))).toBe(true)
  expect(existsSync(String(backupPath))).toBe(true)
  // Pre-Snapshot traegt den ALTEN Inhalt (Rueckrollquelle, No-Data-Loss-Gate).
  expect(readFileSync(String(backupPath), 'utf8')).toContain('dummyhappysecret')
  // Audit: Aktion + Basename, NIE der Wert.
  const audit = readFileSync(sb.auditPath, 'utf8')
  expect(audit).toContain('"action":"env-migrate"')
  expect(audit).not.toContain('dummyhappysecret')
  // IPC-Result enthaelt NIE den Fixture-Secret-Wert.
  expect(JSON.stringify(res)).not.toContain('dummyhappysecret')
})

// (6) setEnv schlaegt fehl -> rewritten:false, 'env-set-failed', Datei unveraendert
// (Owner kann den Knopf gefahrlos erneut ausloesen).
test('setEnv-Fehler: rewritten=false, env-set-failed, Datei unveraendert', () => {
  const sb = makeSandbox()
  const body = 'api_key = dummyfailsecret\n'
  const file = seedFile(sb, 'config.toml', body)
  const rec = makeRecorder(false) // Fake meldet Fehlschlag
  const res = envMigrate({ path: file, varName: 'FAIL_KEY' }, sb.archiveRoot, sb.auditPath, rec.setEnv)
  expect(res.error).toBe('env-set-failed')
  expect(res.data?.varSet).toBe(false)
  expect(res.data?.rewritten).toBe(false)
  expect(readFileSync(file, 'utf8')).toBe(body) // kein Rewrite ohne Env-Set
})

test('Rewrite-Fehler nach Env-Set: Env wird per Fake-Unsetter zurueckgenommen', () => {
  const sb = makeSandbox()
  const body = 'api_key = dummyrollbacksecret\n'
  const file = seedFile(sb, 'config.toml', body)
  const rec = makeRecorder(true)
  const unset = makeUnsetRecorder(true)
  const res = envMigrate(
    { path: file, varName: 'ROLLBACK_KEY' },
    sb.archiveRoot,
    sb.auditPath,
    rec.setEnv,
    unset.unsetEnv,
    () => false
  )

  expect(res.error).toBe('config-rewrite-failed-env-rolled-back')
  expect(res.data?.varSet).toBe(false)
  expect(res.data?.rewritten).toBe(false)
  expect(unset.calls).toEqual(['ROLLBACK_KEY'])
  expect(readFileSync(file, 'utf8')).toBe(body)
  expect(JSON.stringify(res)).not.toContain('dummyrollbacksecret')
})

// (7) Unit: findCredentialLine — Index/Wert der Credential-Zeile; ':'-only ->
// reject; leerer/credential-freier Inhalt -> null (Heuristik-Pin).
test('findCredentialLine: Zeilenwahl, unsupported-format und null-Faelle', () => {
  // '='-Auswahl: model-Zeile uebersprungen, api_key (Index 2) gewaehlt.
  const hit = findCredentialLine('model = gpt-x\nprovider = openai\napi_key = abc123dummysecret')
  expect(hit).toEqual({ index: 2, value: 'abc123dummysecret' })
  // Nur ':'-Zuweisung (JSON/YAML) -> reject statt Zeilenwahl.
  expect(findCredentialLine('{\n  "password": "dummy123"\n}')).toEqual({ reject: 'unsupported-format' })
  // Kein Credential-Key -> null (z. B. reine model-/provider-Config).
  expect(findCredentialLine('model = gpt-x\nprovider = openai')).toBeNull()
  // Var-Ref-Wert -> null (bereits migriert).
  expect(findCredentialLine('API_TOKEN=${MY_TOKEN}')).toBeNull()
})
