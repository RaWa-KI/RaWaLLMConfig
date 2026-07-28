// drift-labels.spec.ts (Plan 2026-07-20, WP4) — Vollstaendigkeits-/Eindeutigkeits-
// Test der Drift-UI-Texte (Muster dup-labels.spec.ts, schlanker): Status-Mapping
// same→„gleich"/diff→„weicht ab", alle Label-Gruppen nicht-leer, eindeutig und
// frei von Tech-Verboten (trunk/mirror/merge — die Duplikat-Ansicht verbietet
// sie sichtbar, die Drift-Ansicht haelt dieselbe Sprach-Disziplin).
import { test, expect } from '@playwright/test'
import * as driftLabels from '@shared/drift-labels'
import {
  DRIFT,
  DRIFT_DECISION,
  DRIFT_DUPLICATE,
  DRIFT_FEHLER,
  DRIFT_IGNORIERTE,
  DRIFT_REVIDIEREN,
  DRIFT_ROOTKIND,
  DRIFT_STATUS,
  DRIFT_VERGLEICH,
  DRIFT_VORSCHLAG,
  driftDecisionBadge
} from '@shared/drift-labels'

const FORBIDDEN = /\btrunk|\bmirror|\bmerge|\bM2\b|\bspiegel/i

function collectStrings(obj: unknown, out: string[]): void {
  if (typeof obj === 'string') {
    out.push(obj)
    return
  }
  if (typeof obj === 'function') {
    const fn = obj as (...a: unknown[]) => unknown
    for (const arg of ['parity', 'duplicate', 'ignored', 3]) {
      try {
        collectStrings(fn(arg), out)
      } catch {
        /* Signatur passt nicht — ueberspringen */
      }
    }
    return
  }
  if (obj && typeof obj === 'object') {
    for (const v of Object.values(obj as Record<string, unknown>)) collectStrings(v, out)
  }
}

function allStrings(): string[] {
  const out: string[] = []
  collectStrings(driftLabels, out)
  return out
}

test('Status-Mapping: same→gleich, diff→weicht ab', () => {
  expect(DRIFT_STATUS.same).toBe('gleich')
  expect(DRIFT_STATUS.diff).toBe('weicht ab')
  expect(Object.keys(DRIFT_STATUS).sort()).toEqual(['diff', 'same'])
})

test('Festlegungen: parity/duplicate/ignored vollstaendig', () => {
  expect(Object.keys(DRIFT_DECISION).sort()).toEqual(['duplicate', 'ignored', 'parity'])
  expect(DRIFT_DECISION.parity).toBe('Paritäts-Kopie')
  expect(DRIFT_DECISION.duplicate).toBe('echte Dublette')
  expect(driftDecisionBadge('ignored')).toContain(DRIFT_DECISION.ignored)
})

test('Pflicht-Texte gesetzt (Titel, Erklaerung, Vorschlag, Revidieren, Ignorierte)', () => {
  expect(DRIFT.titel).toBe('Drift-Relationen')
  expect(DRIFT.erklaerung.length).toBeGreaterThan(40)
  expect(DRIFT_VORSCHLAG).toContain('Paritäts-Kopie')
  expect(DRIFT_REVIDIEREN.aendern).toBe('Festlegung ändern')
  expect(DRIFT_IGNORIERTE.einblenden(2)).toBe('Ignorierte einblenden (2)')
  expect(DRIFT_IGNORIERTE.ausblenden.length).toBeGreaterThan(0)
  expect(Object.keys(DRIFT_ROOTKIND).sort()).toEqual(['agents', 'claude', 'codex', 'kimi'])
  expect(DRIFT_VERGLEICH.mitglieder.length).toBeGreaterThan(0)
  expect(DRIFT_DUPLICATE.confirmText.length).toBeGreaterThan(20)
  expect(DRIFT_FEHLER.schreiben.length).toBeGreaterThan(0)
})

test('keine Leertexte in der gesamten Modul-Map', () => {
  const strings = allStrings()
  expect(strings.length).toBeGreaterThan(20)
  const leer = strings.filter((s) => s.trim().length === 0)
  expect(leer).toEqual([])
})

test('eindeutige Kern-Labels (Status/Festlegungen ueberschneiden sich nicht)', () => {
  const kern = [...Object.values(DRIFT_STATUS), ...Object.values(DRIFT_DECISION)]
  expect(new Set(kern).size).toBe(kern.length)
})

test('alle sichtbaren Werte verbotsfrei (trunk/mirror/merge/M2/spiegel)', () => {
  const hits = allStrings().filter((s) => FORBIDDEN.test(s))
  expect(hits, `Verbotener Begriff in drift-labels: ${JSON.stringify(hits)}`).toEqual([])
})
