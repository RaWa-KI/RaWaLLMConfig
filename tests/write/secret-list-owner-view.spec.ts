// secret-list-owner-view.spec.ts — WP-F15: read-only Innendatei-Liste
// (config:listDir) darf Secret-ORDNER auflisten (Owner-Administrationssicht:
// Name/Groesse/secret-Flag), darf aber NIE Secret-INHALT durchlassen.
// Root-Cause-Fix: der Handler gated nicht mehr allein auf die Write-Allowlist
// (configRootList) — das Kimi-Tool-Home (~/.kimi-code) gehoert zum Read-Scope,
// sonst schlug die Liste fuer ~/.kimi-code/credentials mit out-of-scope fehl.
// Boot-Muster wie coverage-ack-ipc.spec.ts: electron-Mock im require-cache,
// RAWALLM_SANDBOX_ROOT vor dem Laden der Module (keine echten Nutzerpfade).
import { expect, test } from '@playwright/test'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const sandbox = mkdtempSync(join(tmpdir(), 'rawallmconfig-secret-list-'))
process.env.RAWALLM_SANDBOX_ROOT = sandbox

// Deutlich gefakter Dummy-Wert — darf in KEINEM Listen-Output auftauchen.
const DUMMY_SECRET = 'DUMMY-sk-listowner-aaaa1111bbbb2222'

interface ListFile {
  rel: string
  name: string
  size: number
  secret: boolean
}
type ListResult = { data: { files: ListFile[]; truncated?: boolean } | null; error: string | null }
type Handler = (event: unknown, req: { dirPath: string }) => ListResult
const handlers = new Map<string, Handler>()

const electronPath = require.resolve('electron')
require.cache[electronPath] = {
  id: electronPath,
  filename: electronPath,
  loaded: true,
  exports: {
    ipcMain: { handle: (channel: string, listener: Handler) => { handlers.set(channel, listener) } },
    app: { getPath: () => sandbox }
  }
} as never

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { IPC } = require('../../shared/channels') as typeof import('../../shared/channels')
// Frische Modulinstanz erzwingen: Worker teilen den require-Cache über
// Spec-Dateien hinweg — eine von einem frueheren Spec (mit anderem
// electron-Mock) geladene ipc-list-Instanz haette ipcMain=undefined
// (Volllauf-Flake 2026-08-07, 'reading handle').
delete require.cache[require.resolve('../../src/main/ipc-list')]
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { registerListIpc } = require('../../src/main/ipc-list') as typeof import('../../src/main/ipc-list')

registerListIpc()

function seed(dir: string, name: string, content: string): void {
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, name), content, 'utf8')
}

function listDir(dirPath: string): ListResult {
  const handler = handlers.get(IPC.configListDir)
  expect(handler).toBeDefined()
  return handler?.({}, { dirPath }) as ListResult
}

// Die Kimi-Credentials-Wurzel im Sandbox-Layout: <sandbox>/.kimi-code/credentials
// (kimiHome = dirname(claudeHome) + '.kimi-code', claudeHome = <sandbox>/.claude).
const KIMI_CRED_DIR = join(sandbox, '.kimi-code', 'credentials')
const CLAUDE_CRED_DIR = join(sandbox, '.claude', 'credentials')

test('Secret-Ordner unter ~/.kimi-code ist listbar (nur Metadaten, kein Wert)', () => {
  seed(KIMI_CRED_DIR, 'api-token.json', JSON.stringify({ token: DUMMY_SECRET }))
  seed(KIMI_CRED_DIR, 'session.key', DUMMY_SECRET)
  const res = listDir(KIMI_CRED_DIR)
  expect(res.error).toBeNull()
  const names = res.data?.files.map((f) => f.name) ?? []
  expect(names).toContain('api-token.json')
  expect(names).toContain('session.key')
  for (const f of res.data?.files ?? []) {
    expect(typeof f.size).toBe('number')
    expect(f.secret, `secret-Flag muss true sein: ${f.rel}`).toBe(true)
  }
  // Negativ-Match: kein Secret-Wert im gesamten Listen-Payload.
  expect(JSON.stringify(res.data)).not.toContain(DUMMY_SECRET)
})

test('Secret-Ordner unter der Write-Root bleibt ebenfalls wertfrei listbar', () => {
  seed(CLAUDE_CRED_DIR, 'auth.json', JSON.stringify({ access: DUMMY_SECRET }))
  const res = listDir(CLAUDE_CRED_DIR)
  expect(res.error).toBeNull()
  const file = res.data?.files.find((f) => f.name === 'auth.json')
  expect(file?.secret).toBe(true)
  expect(JSON.stringify(res.data)).not.toContain(DUMMY_SECRET)
})

test('Ordner ausserhalb aller Roots bleibt abgelehnt (Scope-Confinement)', () => {
  const outside = join(tmpdir(), 'rawallmconfig-secret-list-outside')
  seed(outside, 'notes.md', 'harmlos')
  const res = listDir(outside)
  expect(res.data).toBeNull()
  expect(res.error).toBe('Ordner liegt ausserhalb der bekannten Config-Bereiche')
})

test('Normaler Ordner: nicht-secret Dateien tragen secret=false', () => {
  const plain = join(sandbox, '.claude', 'skills', 'demo')
  seed(plain, 'SKILL.md', '# Demo\n')
  const res = listDir(plain)
  expect(res.error).toBeNull()
  const file = res.data?.files.find((f) => f.name === 'SKILL.md')
  expect(file?.secret).toBe(false)
})
