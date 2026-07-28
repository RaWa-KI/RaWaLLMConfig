import { expect, test } from '@playwright/test'
import type { Category, ConfigEntry } from '../../shared/contract'
import { markMcpConflicts } from '../../src/main/scan/mcp-conflicts'

function entry(id: string, name: string, fields?: Record<string, string>): ConfigEntry {
  return { id, name, status: 'active', scope: 'global', path: name, desc: '', updated: '', fields }
}

function category(entries: ConfigEntry[]): Category {
  return { id: 'plugins', label: 'Plugins', icon: 'plug', path: '', blurb: '', entries }
}

// Richtung "nur im Plugin-Ordner": unveraendert auf echte MCP-Server begrenzt.
// Ein normaler Skill-/Plugin-Ordner ohne MCP-Deklaration ist kein fehlender
// Registereintrag und darf nicht als Konflikt erscheinen.
test('only real MCP servers become scan-only conflicts', () => {
  const result = markMcpConflicts(category([]), category([
    entry('skill-example', 'example-skill'),
    entry('mcp-global-server', 'example-server', { Transport: 'stdio' }),
  ]))

  expect(result.entries.find((item: ConfigEntry) => item.name === 'example-skill')?.status).toBe('active')
  expect(result.entries.find((item: ConfigEntry) => item.name === 'example-server')).toMatchObject({
    status: 'conflict',
    conflictReason: 'Nur im Plugin-Ordner — fehlt im MCP-Register',
  })
})

// Bewusst nachgezogene Semantik (P0-Falschalarm): fuer die Richtung "nur im
// MCP-Register" gilt NICHT mehr der MCP-Typ-Filter, sondern reine Namensgleichheit
// gegen ALLE Scan-Eintraege der Plugins-Kategorie. Vorher war das Vergleichs-Set
// leer, weil gescannte Plugin-Ordner weder id-Praefix `mcp-` noch Feld `Transport`
// tragen — dadurch galt jedes vorhandene Plugin als "fehlt im Plugin-Ordner".
test('registered MCP servers match plain plugin entries by name', () => {
  const result = markMcpConflicts(
    category([entry('mcp-shared-rkwc-core', 'rkwc-core', { Transport: 'stdio' })]),
    category([entry('shared-plugins-rkwc-core', 'rkwc-core')]),
  )

  expect(result.entries).toHaveLength(1)
  expect(result.entries[0]?.status).toBe('active')
})
