import { msg, msgText, type MessageKey } from '../../lib/messages'
import type { Section } from '../../state/types'
import type { DiagnosisCard } from './diagnosis-model'
import type { OverviewNavigationAction } from './overview-navigation'

export type GuidedFlowId = 'firstStart' | 'checkProblem' | 'prepareChange' | 'activateModule'

interface GuidedFlowSymptom {
  id: string
  title: string
  status: string
  action: string
  target: Section
  navigation: OverviewNavigationAction
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
  navigation: OverviewNavigationAction
}

const flowTargets: Record<GuidedFlowId, Section> = {
  firstStart: 'settings',
  checkProblem: 'updates',
  prepareChange: 'config',
  activateModule: 'settings'
}

// Vorwahl des richtigen Reiters bzw. Ankers am Ziel. „Modul aktivieren" landete
// bisher in den Einstellungen ohne Reiter, also im falschen Reiter.
const flowFocusIds: Partial<Record<GuidedFlowId, string>> = {
  activateModule: 'settings-tab-modules'
}

const flowIcons: Record<GuidedFlowId, string> = {
  firstStart: 'sparkle',
  checkProblem: 'search',
  prepareChange: 'edit',
  activateModule: 'plug'
}

export function buildGuidedFlows(diagnosisCards: readonly DiagnosisCard[]): GuidedFlow[] {
  return flowIds().map((id) => {
    const navigation = flowNavigation(id, diagnosisCards)
    return {
      id,
      title: msgText(`guidedFlows.${id}.title` as MessageKey),
      body: msgText(`guidedFlows.${id}.body` as MessageKey),
      targetLabel: msgText(`guidedFlows.${id}.target` as MessageKey),
      icon: flowIcons[id],
      target: navigation.route,
      steps: stepIds().map((step) => msgText(`guidedFlows.${id}.step.${step}` as MessageKey)),
      symptoms: id === 'checkProblem' ? symptomChoices(diagnosisCards) : [],
      navigation
    }
  })
}

// Ziel je Flow. „Problem pruefen" ist datengetrieben: es fuehrt zur obersten
// Diagnosekarte mit konkretem Anker (Liste ist bereits nach Schwere sortiert)
// statt pauschal auf die Watcher-Sektion. Ohne Befund bleibt das Sektionsziel.
function flowNavigation(id: GuidedFlowId, cards: readonly DiagnosisCard[]): OverviewNavigationAction {
  const targetLabel = msgText(`guidedFlows.${id}.target` as MessageKey)
  const card = id === 'checkProblem' ? topDiagnosisCard(cards) : undefined
  if (card) {
    return {
      label: msg('guidedFlows.backToDetails', { target: targetLabel }),
      reason: msg('guidedFlows.checkProblem.reason.card', { target: card.title }),
      route: card.diagnosisAction.route,
      focusId: card.diagnosisAction.focusId,
      targetDescription: card.title
    }
  }
  return {
    label: msg('guidedFlows.backToDetails', { target: targetLabel }),
    reason: msgText(`guidedFlows.${id}.reason` as MessageKey),
    route: flowTargets[id],
    focusId: flowFocusIds[id],
    targetDescription: targetLabel
  }
}

function topDiagnosisCard(cards: readonly DiagnosisCard[]): DiagnosisCard | undefined {
  return cards.find((card) => card.diagnosisAction.focusId !== undefined) ?? cards[0]
}

// Symptomknoepfe behalten die Fokus-ID der Diagnose (wurde bisher verworfen).
function symptomChoices(cards: readonly DiagnosisCard[]): GuidedFlowSymptom[] {
  return cards.slice(0, 4).map((card) => ({
    id: card.id,
    title: card.title,
    status: card.status,
    action: card.action,
    target: card.diagnosisAction.route,
    navigation: {
      label: card.diagnosisAction.label,
      reason: msg('guidedFlows.symptom.reason', { target: card.title }),
      route: card.diagnosisAction.route,
      focusId: card.diagnosisAction.focusId,
      targetDescription: card.title
    }
  }))
}

function flowIds(): GuidedFlowId[] {
  return ['firstStart', 'checkProblem', 'prepareChange', 'activateModule']
}

function stepIds(): string[] {
  return ['one', 'two', 'three', 'four']
}
