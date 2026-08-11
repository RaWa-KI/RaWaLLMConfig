// reconcile-plan-controller.spec.ts — Zwei-Klick-Vorschau fuer den Ordner-Merge.
// Belegt: 1. Klick holt NUR den Plan (kein Apply), 2. Klick fuehrt genau diesen
// Plan gegen SEINEN planHash aus. Reine Pure-Funktionen im Node-Sandbox-Runner:
// kein Renderer-DOM, kein fs, kein echter IPC — preview/apply sind Fakes.
// Stil wie move-plan-controller.spec.ts.
import { test, expect } from '@playwright/test'
import {
  applyReconcilePlan,
  previewReconcilePlan,
  reconcileApplyLabel,
  reconcileEffectText,
  reconcilePlanFacts,
  reconcileSideLabel
} from '../../src/renderer/sections/config/reconcile-plan-controller'
import type {
  IntegrityApplyRequest,
  IntegrityApplyResult,
  IntegrityPlan,
  IntegrityPreviewRequest,
  IntegrityPreviewResult
} from '../../shared/contract-integrity'
import type { DirReconcileRequest } from '../../shared/contract-write-reconcile'

// Ordner-Merge-Anfrage mit zwei Pro-Datei-Entscheidungen.
const req: DirReconcileRequest = {
  trunkPath: 'C:/x/shared/skills/demo',
  mirrorPath: 'C:/x/claude/skills/demo',
  decisions: { 'SKILL.md': 'keep-trunk', 'notes.md': 'adopt-trunk' }
}

// Minimaler gueltiger reconcile-folder-Plan (alle Pflichtfelder aus IntegrityPlan).
function mkPlan(over: Partial<IntegrityPlan> = {}): IntegrityPlan {
  return {
    operationId: 'op-1',
    planHash: 'hash-1',
    previewToken: 'token-1',
    kind: 'reconcile-folder',
    fsOps: [
      { action: 'reconcile-folder', from: 'C:/x/claude/skills/demo/SKILL.md', to: 'C:/x/shared/skills/demo/SKILL.md', decision: 'keep-trunk', rel: 'SKILL.md' },
      { action: 'reconcile-folder', from: 'C:/x/shared/skills/demo/notes.md', to: 'C:/x/claude/skills/demo/notes.md', decision: 'adopt-trunk', rel: 'notes.md' }
    ],
    referenceOps: [],
    blockers: [],
    manualRequired: [],
    scannedFiles: 4,
    truncated: false,
    ...over
  }
}

function okApply(plan: IntegrityPlan): IntegrityApplyResult {
  return {
    data: {
      applied: true,
      partial: false,
      operationId: plan.operationId,
      kind: plan.kind,
      rewrittenFiles: [],
      rolledBack: false,
      rollbackStatus: 'none',
      manualRequired: []
    },
    error: null
  }
}

// ── Fall 1: Der Zwei-Klick-Weg (Preview -> Apply mit planHash) ────────────────
test('Zwei Klicks: erst Vorschau (kein Apply), dann Apply gegen den planHash', async () => {
  const plan = mkPlan()
  const previewCalls: IntegrityPreviewRequest[] = []
  const applyCalls: IntegrityApplyRequest[] = []
  const preview = (async (r: IntegrityPreviewRequest): Promise<IntegrityPreviewResult> => {
    previewCalls.push(r)
    return { data: plan, error: null }
  }) as never
  const apply = (async (r: IntegrityApplyRequest): Promise<IntegrityApplyResult> => {
    applyCalls.push(r)
    return okApply(plan)
  }) as never

  // 1. Klick: nur Vorschau — es darf NICHTS ausgefuehrt werden.
  const out = await previewReconcilePlan(req, preview)
  expect(out.error).toBeNull()
  expect(out.plan).not.toBeNull()
  expect(previewCalls).toHaveLength(1)
  expect(previewCalls[0].kind).toBe('reconcile-folder')
  expect(previewCalls[0].req).toEqual(req)
  expect(applyCalls, 'erster Klick darf nicht ausfuehren').toHaveLength(0)

  // 2. Klick: genau dieser Plan, gebunden an seinen planHash.
  const res = await applyReconcilePlan(out.plan!, apply)
  expect(res.ok).toBe(true)
  expect(res.error).toBeNull()
  expect(applyCalls).toHaveLength(1)
  expect(applyCalls[0].planHash).toBe('hash-1')
  expect(applyCalls[0].plan.planHash).toBe(applyCalls[0].planHash)
  expect(applyCalls[0].plan.previewToken).toBe('token-1')
  expect(applyCalls[0].plan).toBe(out.plan) // unveraendert weitergereicht
})

// ── Fall 2: Vorschau-Fehler -> plan null + sichtbarer Text (kein Schein-Erfolg) ─
test('Vorschau-Fehler: plan===null und lesbarer Fehlertext', async () => {
  const failing = (async () => ({ data: null, error: 'plan-hash-mismatch' })) as never
  const out = await previewReconcilePlan(req, failing)
  expect(out.plan).toBeNull()
  expect(out.error).toContain('nicht mehr aktuell')
})

// ── Fall 3: Blocker sperren den zweiten Klick (kein Apply-Aufruf) ─────────────
test('Plan mit Blocker: kein Apply, sondern Handlungshinweis', async () => {
  const blocked = mkPlan({
    blockers: [{ code: 'secret-skip', path: 'C:/x/shared/skills/demo/.env', reason: 'geschützte Datei' }]
  })
  let called = 0
  const apply = (async () => { called += 1; return okApply(blocked) }) as never
  const res = await applyReconcilePlan(blocked, apply)
  expect(res.ok).toBe(false)
  expect(called, 'blockierter Plan darf nie gesendet werden').toBe(0)
  expect(res.error).toContain('nichts geändert')
  expect(reconcileApplyLabel(blocked)).toBe('Manuell erforderlich')
})

// ── Fall 4: Leere Auswahl ist kein Erfolg ────────────────────────────────────
test('Leerer Plan (keine Zuordnung): kein Apply, ehrlicher Hinweis', async () => {
  const leer = mkPlan({ fsOps: [] })
  let called = 0
  const apply = (async () => { called += 1; return okApply(leer) }) as never
  const res = await applyReconcilePlan(leer, apply)
  expect(res.ok).toBe(false)
  expect(called).toBe(0)
  expect(reconcilePlanFacts(leer).nothingToDo).toBe(true)
  expect(reconcileEffectText(leer)).toContain('bleibt alles unverändert')
})

// ── Fall 5: Rollback und applied=false gelten NICHT als Erfolg ────────────────
test('Rollback bzw. applied=false liefern ok=false mit Klartext', async () => {
  const plan = mkPlan()
  const rolled = (async (): Promise<IntegrityApplyResult> => ({
    data: { ...okApply(plan).data!, applied: false, rolledBack: true, rollbackStatus: 'rolled-back' },
    error: null
  })) as never
  const a = await applyReconcilePlan(plan, rolled)
  expect(a.ok).toBe(false)
  expect(a.error).toContain('zurückgenommen')

  const notApplied = (async (): Promise<IntegrityApplyResult> => ({
    data: { ...okApply(plan).data!, applied: false },
    error: null
  })) as never
  const b = await applyReconcilePlan(plan, notApplied)
  expect(b.ok).toBe(false)
  expect(b.error).toContain('Nicht ausgeführt')
})

// ── Fall 6: Anzeige-Texte nennen Zahlen und Sicherung konkret ─────────────────
test('Vorschau-Texte nennen Dateizahl, Sicherung und Richtung', () => {
  const plan = mkPlan()
  const f = reconcilePlanFacts(plan)
  expect(f.files).toBe(2)
  expect(f.hasBlockers).toBe(false)
  expect(reconcileEffectText(plan)).toContain('2 Dateien werden zusammengeführt')
  expect(reconcileEffectText(plan)).toContain('Sicherungskopie')
  expect(reconcileApplyLabel(plan)).toBe('2 Dateien zusammenführen')
  expect(reconcileApplyLabel(mkPlan({
    referenceOps: [{ filePath: 'C:/x/shared/INDEX.md', kind: 'path', oldValue: 'a', newValue: 'b' }]
  }))).toContain('Verweise mitziehen')
  expect(reconcileSideLabel('keep-trunk')).toBe('Shared-Fassung bleibt')
  expect(reconcileSideLabel('adopt-mirror')).toBe('Shared-Fassung bleibt')
  expect(reconcileSideLabel('keep-mirror')).toBe('deine Kopie bleibt')
})
