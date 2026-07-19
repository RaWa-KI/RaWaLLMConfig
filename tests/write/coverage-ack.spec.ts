import { expect, test } from '@playwright/test'
import { existsSync, mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { LlmConfig } from '../../shared/contract'
import { createCoverageAckStore, coverageEntryKey } from '../../src/main/services/coverage-ack-store'
import { applyCoverageAcks } from '../../src/main/scan/scan-index'

test('coverage acknowledgement survives a reload and removes the conflict state', () => {
  const root = mkdtempSync(join(tmpdir(), 'rawallmconfig-coverage-ack-'))
  const storePath = join(root, 'coverage-acks.json')
  const archiveRoot = join(root, 'archive')
  const key = coverageEntryKey('claude', 'plugins', 'mcp-global-server')
  const store = createCoverageAckStore({ storePath, archiveRoot, auditPath: join(root, 'audit.jsonl') })

  expect(store.writeAck(key)).toEqual({ ok: true, error: null })
  expect(existsSync(storePath)).toBe(true)
  expect(createCoverageAckStore({ storePath, archiveRoot, auditPath: join(root, 'audit.jsonl') }).readKeys()).toContain(key)

  const data: Record<string, LlmConfig> = { claude: family() }
  applyCoverageAcks(data, new Set(store.readKeys()))
  expect(data.claude.categories[0].entries[0].status).toBe('acknowledged')
})

function family(): LlmConfig {
  return { categories: [{ id: 'plugins', label: '', icon: '', path: '', blurb: '', entries: [{
    id: 'mcp-global-server', name: 'server', status: 'conflict', scope: 'global', path: '', desc: '', updated: '',
  }] }], duplicates: [] }
}
