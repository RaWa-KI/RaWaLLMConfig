import { msgText, type MessageKey } from '../../lib/messages'
import type { Section } from '../../state/types'
import type { DiagnosisCard } from './diagnosis-model'

export type GuidedFlowId = 'firstStart' | 'checkProblem' | 'prepareChange' | 'activateModule'

export interface GuidedFlowSymptom {
  id: string
  title: string
  status: string
  action: string
  target: Section
}

export interface GuidedFlow {
  id: GuidedFlowId
  title: string
  body: string
  targetLabel: string
  icon: string
  target: Section
  steps: string[]
  symptoms: GuidedFlowSymptom[]
}

const flowTargets: Record<GuidedFlowId, Section> = {
  firstStart: 'settings',
  checkProblem: 'updates',
  prepareChange: 'config',
  activateModule: 'settings'
}

const flowIcons: Record<GuidedFlowId, string> = {
  firstStart: 'sparkle',
  checkProblem: 'search',
  prepareChange: 'edit',
  activateModule: 'plug'
}

export function buildGuidedFlows(diagnosisCards: readonly DiagnosisCard[]): GuidedFlow[] {
  return flowIds().map((id) => ({
    id,
    title: msgText(`guidedFlows.${id}.title` as MessageKey),
    body: msgText(`guidedFlows.${id}.body` as MessageKey),
    targetLabel: msgText(`guidedFlows.${id}.target` as MessageKey),
    icon: flowIcons[id],
    target: flowTargets[id],
    steps: stepIds().map((step) => msgText(`guidedFlows.${id}.step.${step}` as MessageKey)),
    symptoms: id === 'checkProblem' ? symptomChoices(diagnosisCards) : []
  }))
}

function symptomChoices(cards: readonly DiagnosisCard[]): GuidedFlowSymptom[] {
  return cards.slice(0, 4).map((card) => ({
    id: card.id,
    title: card.title,
    status: card.status,
    action: card.action,
    target: card.target
  }))
}

function flowIds(): GuidedFlowId[] {
  return ['firstStart', 'checkProblem', 'prepareChange', 'activateModule']
}

function stepIds(): string[] {
  return ['one', 'two', 'three', 'four']
}
