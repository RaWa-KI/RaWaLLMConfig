// coverage-items-f3.spec.ts — WP-F3 (Smoke-Fixpaket 2026-08-07): Coverage-
// „Befunde" sind explorierbar. Belegt wird:
// (1) Der Audit-Scan liefert je Gruppe die konkreten Fundstellen als
//     Item-Liste (Name + Pfad), an der Quelle gekappt (coverageItemsTotal
//     trägt die Gesamtzahl für „+ n weitere").
// (2) CoverageEntryRow trägt die Items in den Renderer.
// (3) Simple-Modus zeigt eine erklärende Zeile statt der nackten Zahl;
//     die Zahl bleibt dem Experten-Modus vorbehalten.
import { test, expect } from '@playwright/test'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import type { AppData, ConfigEntry, LlmConfig } from '../../shared/contract'
import { deOverviewMessages } from '../../shared/messages/de-overview'
import {
  coverageDetailLead,
  coverageItemOverflow,
  coverageRowSub
} from '../../src/renderer/sections/overview/CoverageRegister'
import {
  selectCoverageEntries,
  type CoverageEntryRow
} from '../../src/renderer/sections/overview/overview-selectors'

const ITEM_COUNT = 25
const ITEM_CAP = 20

function w(file: string, content: string): string {
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, content, 'utf8')
  return file
}

function bustScanCache(): void {
  for (const key of Object.keys(require.cache)) {
    const k = key.replace(/\\/g, '/')
    if (k.includes('/src/main/scan/') || k.includes('/src/main/services/')) delete require.cache[key]
  }
}

function withSandboxEnv<T>(sb: string, fn: () => T): T {
  const saved = process.env.RAWALLM_SANDBOX_ROOT
  process.env.RAWALLM_SANDBOX_ROOT = sb
  try {
    bustScanCache()
    return fn()
  } finally {
    if (saved === undefined) delete process.env.RAWALLM_SANDBOX_ROOT
    else process.env.RAWALLM_SANDBOX_ROOT = saved
    bustScanCache()
  }
}

function buildAuditIn(sb: string): LlmConfig {
  return withSandboxEnv(sb, () => {
    const mod = require('../../src/main/scan/scan-audit-categories') as { buildAuditConfig: () => LlmConfig }
    return mod.buildAuditConfig()
  })
}

function summaryFromSandbox(): ConfigEntry {
  const sb = mkdtempSync(join(tmpdir(), 'rawallm-f3-'))
  try {
    const links = Array.from({ length: ITEM_COUNT }, (_, i) => `[[kaputt-${i}]]`).join(' ')
    w(join(sb, 'project', 'docs', 'viele.md'), `${links}\n`)
    const audit = buildAuditIn(sb)
    const refs = audit.categories.find((cat) => cat.id === 'audit-references')
    expect(refs).toBeDefined()
    expect(refs!.entries).toHaveLength(1)
    return refs!.entries[0]
  } finally {
    rmSync(sb, { recursive: true, force: true })
  }
}

// --- (1) Scan liefert gekappte Item-Liste ---------------------------------------

test('F3: Audit-Summary trägt die Fundstellen als Item-Liste, gekappt an der Quelle', () => {
  const summary = summaryFromSandbox()
  expect(summary.coverageItemsTotal).toBe(ITEM_COUNT)
  expect(summary.coverageItems).toHaveLength(ITEM_CAP)
  const first = summary.coverageItems![0]
  expect(first.name).toBe('kaputt-0')
  expect(first.path.length).toBeGreaterThan(0)
  // F3: Der Zeilenname trägt keine nackte Zahl mehr, sondern sagt, was es ist.
  expect(summary.name).toBe('Prüfergebnisse: Referenz-Audit')
  expect(summary.name).not.toMatch(/\d/)
  expect(summary.fields?.Fundstellen).toBe(String(ITEM_COUNT))
})

// --- (2) CoverageEntryRow trägt die Items ---------------------------------------

test('F3: Selector reicht Items und Gesamtzahl in die Registerzeile durch', () => {
  const summary = summaryFromSandbox()
  const rows = selectCoverageEntries(appData(summary))
  expect(rows).toHaveLength(1)
  expect(rows[0].items).toHaveLength(ITEM_CAP)
  expect(rows[0].itemsTotal).toBe(ITEM_COUNT)
  // Kappung „+ n weitere": 25 gesamt, 20 gelistet -> 5 weitere.
  expect(coverageItemOverflow(rows[0])).toBe(ITEM_COUNT - ITEM_CAP)
})

// --- (3) Simple-Modus: erklärende Zeile statt nackter Zahl ----------------------

test('F3: Simple-Modus zeigt die erklärende Zeile, Experten-Modus die Zahl', () => {
  const summary = summaryFromSandbox()
  const row = selectCoverageEntries(appData(summary))[0]
  const explain = deOverviewMessages['coverage.row.simpleExplain']
  expect(coverageRowSub(row, 'simple')).toBe(explain)
  expect(coverageDetailLead(row, 'simple')).toBe(explain)
  expect(explain).not.toMatch(/\d/)
  // Experten-Modus behält den Zähler in der Kurzzeile und der Detailzeile.
  expect(coverageRowSub(row, 'expert')).toContain(`${ITEM_COUNT} Fundstellen`)
  expect(coverageDetailLead(row, 'expert')).toContain(`${ITEM_COUNT} Fundstellen`)
})

test('F3: Zeilen ohne Item-Liste behalten die bisherige Kurzzeile in beiden Modi', () => {
  const row: CoverageEntryRow = {
    entry: {
      id: 'plain', name: 'plain', status: 'acknowledged', scope: 'global',
      path: '', desc: 'Beschreibung', updated: ''
    },
    familyId: 'claude',
    categoryId: 'cat',
    key: 'claude:cat:plain',
    items: [],
    itemsTotal: 0
  }
  expect(coverageRowSub(row, 'simple')).toBe('Beschreibung')
  expect(coverageRowSub(row, 'expert')).toBe('Beschreibung')
})

// --- Fixtures --------------------------------------------------------------------

function appData(summary: ConfigEntry): AppData {
  const family: LlmConfig = {
    categories: [{ id: 'audit-references', label: 'Referenz-Audit', icon: 'list', path: '', blurb: '', entries: [summary] }],
    duplicates: []
  }
  return {
    snapshot: { frozen: false, date: '', label: 'test' },
    machines: [],
    llms: [],
    data: { audit: family }
  }
}
