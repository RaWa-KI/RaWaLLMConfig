// move-plan-controller.spec.ts — Regression A2-1 (P0): Preview-Fehler darf NICHT
// als leeres Plan-Array in einen Schein-Erfolg verschluckt werden. previewPlans
// liefert jetzt ein diskriminiertes PreviewOutcome (plans|error). Reine
// Pure-Funktionen im Node-Sandbox-Runner: kein Renderer-DOM, kein fs, kein echter
// IPC — die PreviewFn wird als Fake gemockt. Stil wie move-target.spec.ts.
import { test, expect } from '@playwright/test'
import { previewPlans, planFacts, applyPlans } from '../../src/renderer/sections/config/move-plan-controller'
import type { IntegrityPlan, IntegrityPreviewResult } from '../../shared/contract-integrity'
import type { MoveVersionedRequest } from '../../shared/contract-write-rename'

// Minimaler gueltiger Plan (alle Pflichtfelder aus IntegrityPlan). Dummy-Inhalte.
function mkPlan(id: string): IntegrityPlan {
  return {
    operationId: id,
    planHash: 'h-' + id,
    kind: 'move',
    fsOps: [],
    referenceOps: [],
    blockers: [],
    manualRequired: [],
    scannedFiles: 0,
    truncated: false
  }
}

// Eine Dummy-Move-Anfrage (Inhalt egal — die Fake-PreviewFn liest req nicht).
const reqs: MoveVersionedRequest[] = [
  { version: 'claude', fromPath: 'C:/x/a.md', to: 'C:/y/a.md' }
]

// Fake-PreviewFn, die IMMER einen Fehler liefert (gemockter IPC-Fehler).
function failingPreview(): (req: unknown) => Promise<IntegrityPreviewResult> {
  return async () => ({ error: 'x' })
}

// Fake-PreviewFn, die einen gueltigen Plan liefert.
function okPreview(plan: IntegrityPlan): (req: unknown) => Promise<IntegrityPreviewResult> {
  return async () => ({ data: plan })
}

// ── Fall 1: Preview-Fehler -> plans null UND error gesetzt (kein Schein-Erfolg) ─
test('previewPlans propagiert IPC-Fehler: plans===null und error gesetzt', async () => {
  const out = await previewPlans(reqs, failingPreview() as never)
  expect(out.plans).toBeNull()
  expect(out.error).toBe('x')
  // Der Kern der Regression: KEIN leeres Array, das Confirm faelschlich freigibt.
  expect(out.plans).not.toEqual([])
})

// ── Fall 2: gueltiges Preview -> plans gesetzt, error null ────────────────────
test('previewPlans bei gueltigem Plan: plans gesetzt, error===null', async () => {
  const plan = mkPlan('p1')
  const out = await previewPlans(reqs, okPreview(plan) as never)
  expect(out.error).toBeNull()
  expect(out.plans).not.toBeNull()
  expect(out.plans).toHaveLength(1)
  expect(out.plans![0].operationId).toBe('p1')
})

// ── Fall 3: Fehler ohne res.error -> Fallback 'preview-failed', plans null ────
test('previewPlans bei leerem Ergebnis (kein data): plans null, error-Fallback', async () => {
  const emptyPreview = (async () => ({})) as unknown as never
  const out = await previewPlans(reqs, emptyPreview)
  expect(out.plans).toBeNull()
  expect(out.error).toBe('preview-failed')
})

// ── Fall 4: Der Fehlerpfad erreicht applyPlans NIE mit [] ─────────────────────
// Dokumentiert die Schein-Erfolg-Regression: Vor dem Fix wurde aus dem Fehler ein
// leeres Array, planFacts([]).hasBlockers=false gab Confirm frei und applyPlans([])
// meldete allOk=true (Move vorgetaeuscht). Jetzt bleibt plans null -> der Aufrufer
// laeuft NIE in applyPlans mit einem leeren Plan-Array.
test('Fehlerpfad liefert plans=null; applyPlans wird nie mit [] als Erfolg erreicht', async () => {
  const out = await previewPlans(reqs, failingPreview() as never)
  expect(out.plans).toBeNull() // kein [] -> confirm() ruft applyPlans gar nicht

  // Gegenprobe der alten Falle: applyPlans([]) waere sonst faelschlich "Erfolg".
  const allOkOnEmpty = await applyPlans([], (async () => ({ error: 'unused' })) as unknown as never)
  expect(allOkOnEmpty).toBe(true) // leeres Array -> Schleife leer -> true
  // Genau deshalb MUSS der Fehlerpfad plans=null (nicht []) liefern.
  expect(out.plans).not.toEqual([])
})

// ── Fall 5: planFacts auf leerem Array meldet keine Blocker (die Ur-Falle) ────
test('planFacts([]) meldet hasBlockers=false — belegt, warum [] gefaehrlich waere', () => {
  const facts = planFacts([])
  expect(facts.hasBlockers).toBe(false)
  expect(facts.hasRefs).toBe(false)
  // Deshalb darf der Fehlerpfad nie [] produzieren, sonst wuerde Confirm freigeben.
})
