// coverage-ack-ipc.spec.ts — Handler-Gate (E-WP3 L1): coverage:writeAck nur bei
// aktivem Schreibmodus, coverage:readAcks ungated. Boot-Muster wie
// write-mode.spec.ts: electron wird im require-cache gemockt, BEVOR das
// Handler-Modul geladen wird; der Ack-Store landet via RAWALLM_SANDBOX_ROOT
// in einem temp-Root (keine echten Nutzerpfade, keine Werte im Output).
import { expect, test } from '@playwright/test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const sandbox = mkdtempSync(join(tmpdir(), 'rawallmconfig-coverage-ack-ipc-'))
process.env.RAWALLM_SANDBOX_ROOT = sandbox

type IpcResultLike = { data: { acknowledgements: { key: string }[] } | null; error: string | null }
type Handler = (event: unknown, req: { key: string }) => IpcResultLike
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
const { IPC_WRITE } = require('../../shared/channels-write') as typeof import('../../shared/channels-write')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const writeMode = require('../../src/main/services/write-mode') as typeof import('../../src/main/services/write-mode')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { registerCoverageAckIpc } = require('../../src/main/ipc-write-coverage-ack') as typeof import('../../src/main/ipc-write-coverage-ack')

registerCoverageAckIpc()

function writeAck(key: string): IpcResultLike {
  const handler = handlers.get(IPC_WRITE.coverageWriteAck)
  expect(handler).toBeDefined()
  return handler?.({}, { key }) as IpcResultLike
}

test.afterEach(() => {
  writeMode.setWriteEnabledRuntime(null)
})

test('coverage:writeAck ist bei deaktiviertem Schreibmodus geblockt', () => {
  writeMode.setWriteEnabledRuntime(false)
  const res = writeAck('claude:plugins:x')
  expect(res.data).toBeNull()
  expect(res.error).toBe(writeMode.WRITE_DISABLED_REASON)
})

test('coverage:writeAck bestaetigt bei aktivem Schreibmodus und liefert die Ack-Liste', () => {
  writeMode.setWriteEnabledRuntime(true)
  const res = writeAck('claude:plugins:x')
  expect(res.error).toBeNull()
  expect(res.data?.acknowledgements.map((ack) => ack.key)).toContain('claude:plugins:x')
})

test('coverage:readAcks ist ungated (read bleibt ohne Schreibmodus nutzbar)', () => {
  writeMode.setWriteEnabledRuntime(false)
  const handler = handlers.get(IPC_WRITE.coverageReadAcks)
  expect(handler).toBeDefined()
  const res = handler?.({}, { key: '' }) as IpcResultLike
  expect(res.error).toBeNull()
  expect(Array.isArray(res.data?.acknowledgements)).toBe(true)
})
