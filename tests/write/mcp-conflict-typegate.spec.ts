import { expect, test } from '@playwright/test'
import type { Category, ConfigEntry } from '../../shared/contract'
import { markMcpConflicts } from '../../src/main/scan/mcp-conflicts'

function entry(id: string, name: string, fields?: Record<string, string>): ConfigEntry {
  return { id, name, status: 'active', scope: 'global', path: name, desc: '', updated: '', fields }
}

function category(entries: ConfigEntry[]): Category {
  return { id: 'plugins', label: 'Plugins', icon: 'plug', path: '', blurb: '', entries }
}

test('only real MCP servers become scan-only conflicts', () => {
  const result = markMcpConflicts(category([]), category([
    entry('skill-example', 'example-skill'),
    entry('mcp-global-server', 'example-server', { Transport: 'stdio' }),
  ]))

  expect(result.entries.find((item) => item.name === 'example-skill')?.status).toBe('active')
  expect(result.entries.find((item) => item.name === 'example-server')).toMatchObject({
    status: 'conflict',
    conflictReason: 'Nur im Plugin-Ordner — fehlt im MCP-Register',
  })
})
