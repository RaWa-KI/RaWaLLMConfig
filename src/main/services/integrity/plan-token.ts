// plan-token.ts — Main-only Preview-Nachweis fuer Integrity-Apply.
// Renderer darf den Plan sehen, aber keine gueltige Signatur fuer manipulierte
// Plaene erzeugen koennen. Das Runtime-Secret verlaesst den Main-Prozess nie.
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import type { IntegrityPlan } from '@shared/contract-integrity'

const TOKEN_SECRET = randomBytes(32)

function tokenPayload(plan: Pick<IntegrityPlan, 'kind' | 'operationId' | 'planHash'>): string {
  return `${plan.kind}\n${plan.operationId}\n${plan.planHash}`
}

export function signPreviewPlan(plan: Pick<IntegrityPlan, 'kind' | 'operationId' | 'planHash'>): string {
  return createHmac('sha256', TOKEN_SECRET).update(tokenPayload(plan)).digest('hex')
}

export function verifyPreviewToken(plan: IntegrityPlan): boolean {
  if (!plan.previewToken) return false
  const expected = Buffer.from(signPreviewPlan(plan), 'hex')
  const actual = Buffer.from(plan.previewToken, 'hex')
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}
