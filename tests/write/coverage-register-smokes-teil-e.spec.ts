// coverage-register-smokes-teil-e.spec.ts — Beweis-Smokes fuer das Coverage-
// Register (E-WP3 Abschluss). Matrix-Mapping (was wo belegt ist):
// - Ack-Rescan (Main-Ebene):            tests/write/coverage-ack.spec.ts
// - Ack-IPC/Schreibmodus-Gate (Admin-Flow): tests/write/coverage-ack-ipc.spec.ts
// - Ack-Button/Disabled/onAck-Pins, Filter-Existenz, path-expert-only:
//                                       tests/write/overview-zones-teil-e.spec.ts
// - Key-Konsistenz Selector<->Scan:     tests/write/coverage-ack-key.spec.ts
// - audit-Register-Dedupe (Teil E):     tests/write/register-dedupe-teil-e.spec.ts
// Hier neu: Filter-Verhalten (Logik), Detailzeile (Pins), Keyboard (Pins),
// 5.000er-Listen-Obergrenze (Logik + Pins) und der Disabled-Hinweis-Render.
import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { AppData, ConfigEntry, LlmConfig } from '../../shared/contract'
import { filterCoverageRows } from '../../src/renderer/sections/overview/CoverageRegister'
import {
  selectCoverageEntries,
  type CoverageEntryRow
} from '../../src/renderer/sections/overview/overview-selectors'

const register = read('src/renderer/sections/overview/CoverageRegister.tsx')
const overviewSection = read('src/renderer/sections/overview/OverviewSection.tsx')

// --- 1) Filter-Verhalten (Logik) ----------------------------------------------

test('filter check/decentral/all split rows by status and keep input order', () => {
  const rows = [
    row('fam-a', 'cat', 'ack-1', 'acknowledged'),
    row('fam-a', 'cat', 'on-demand-1', 'conflict', 'bei-bedarf'),
    row('audit', 'audit-references', 'audit-1', 'conflict')
  ]
  expect(filterCoverageRows(rows, 'check').map((r) => r.key)).toEqual([rows[0].key])
  expect(filterCoverageRows(rows, 'decentral').map((r) => r.key)).toEqual([rows[1].key, rows[2].key])
  expect(filterCoverageRows(rows, 'all').map((r) => r.key)).toEqual(rows.map((r) => r.key))
})

// --- 2) Detailzeile (Source-Pins) ----------------------------------------------

test('expanded row shows conflict reason fallback, expert-only path and aria-expanded', () => {
  expect(register).toContain("entry.conflictReason ?? msg('diagnostics.meaning.problemFound')")
  expect(register).toContain("props.displayMode === 'expert' && <span>{entry.path}</span>")
  expect(register).toContain('aria-expanded={props.expanded}')
})

// --- 3) Keyboard (Source-Pins) --------------------------------------------------

test('interactions are native buttons only (keyboard operable by default)', () => {
  const onClicks = register.match(/onClick=/g) ?? []
  const buttons = register.match(/<button\s+type="button"/g) ?? []
  // Jedes onClick haengt an einem nativen Button (Toggle, Filter, „So lassen", „Mehr").
  expect(onClicks.length).toBe(buttons.length)
  expect(register).not.toMatch(/<(div|span|a|li)[^>]*onClick/)
  expect(register).not.toMatch(/tabIndex=\{?[1-9]/)
  expect(register).toContain('role="group"')
  expect(register).toContain("aria-label={msg('coverage.panel.title')}")
})

// --- 4) 5.000er-Listen (Logik + Pins) -------------------------------------------

test('selector maps 5000 coverage entries to rows with unique ack keys', () => {
  const rows = selectCoverageEntries(largeFixture(5000))
  expect(rows).toHaveLength(5000)
  expect(new Set(rows.map((r) => r.key)).size).toBe(5000)
})

test('render caps the DOM at visibleCount and resets it on filter change', () => {
  expect(register).toContain('const PAGE_SIZE = 8')
  expect(register).toContain('filteredRows.slice(0, visibleCount)')
  expect(register).toContain('hasMore && <button')
  expect(register).toContain('setVisibleCount(PAGE_SIZE)')
})

// --- 5) Admin-Flow-Hinweis (Pin) ------------------------------------------------
// Der Schreibmodus-Gate-Flow selbst ist durch coverage-ack-ipc.spec.ts (Handler-
// Gate) und den Disabled-Pin in overview-zones-teil-e.spec.ts belegt; hier nur
// der Render-Mechanismus des Disabled-Hinweises.

test('disabled ack renders the hint text via coverage.action.ackDisabled', () => {
  expect(register).toContain('{props.ackDisabled && <span className="ov-coverage-ack-hint">{props.ackDisabledReason}</span>}')
  expect(overviewSection).toContain("ackDisabledReason={msg('coverage.action.ackDisabled')}")
})

// --- Fixtures --------------------------------------------------------------------

function row(
  familyId: string,
  categoryId: string,
  entryId: string,
  status: ConfigEntry['status'],
  loadMode?: ConfigEntry['loadMode']
): CoverageEntryRow {
  return {
    entry: entry({ id: entryId, status, loadMode }),
    familyId,
    categoryId,
    key: `${familyId}:${categoryId}:${entryId}`
  }
}

function largeFixture(count: number): AppData {
  const entries: ConfigEntry[] = Array.from({ length: count }, (_, i) =>
    entry({ id: `e-${i}`, status: 'conflict', loadMode: 'bei-bedarf' }))
  const family: LlmConfig = {
    categories: [{ id: 'cat', label: '', icon: '', path: '', blurb: '', entries }],
    duplicates: []
  }
  return {
    snapshot: { frozen: false, date: '', label: 'test' },
    machines: [],
    llms: [],
    data: { claude: family }
  }
}

function entry(partial: Partial<ConfigEntry> & { id: string }): ConfigEntry {
  return { name: partial.id, status: 'active', scope: 'global', path: '', desc: '', updated: '', ...partial }
}

function read(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8')
}
