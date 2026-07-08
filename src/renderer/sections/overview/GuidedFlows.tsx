import { useState } from 'react'
import { Icon } from '../../components/Icon'
import { msg } from '../../lib/messages'
import type { Section } from '../../state/types'
import type { GuidedFlow, GuidedFlowId } from './guided-flows-model'
import './GuidedFlows.css'

interface GuidedFlowsProps {
  flows: GuidedFlow[]
  onOpen(section: Section): void
}

export function GuidedFlows({ flows, onOpen }: GuidedFlowsProps) {
  const [activeId, setActiveId] = useState<GuidedFlowId | null>(null)
  const activeFlow = flows.find((flow) => flow.id === activeId) ?? null
  return (
    <section className="ov-flows" aria-labelledby="guided-flows-title">
      <FlowIntro />
      <div className="ov-flow-shell">
        <FlowPicker flows={flows} activeId={activeId} onSelect={setActiveId} />
        {activeFlow ? (
          <FlowPanel flow={activeFlow} onCancel={() => setActiveId(null)} onOpen={onOpen} />
        ) : (
          <p className="ov-flow-empty">{msg('guidedFlows.selectHint')}</p>
        )}
      </div>
    </section>
  )
}

function FlowIntro() {
  return (
    <div className="ov-flow-intro">
      <h2 id="guided-flows-title">{msg('guidedFlows.title')}</h2>
      <p>{msg('guidedFlows.intro')}</p>
    </div>
  )
}

function FlowPicker(props: {
  flows: GuidedFlow[]
  activeId: GuidedFlowId | null
  onSelect(id: GuidedFlowId): void
}) {
  return (
    <div className="ov-flow-picker">
      {props.flows.map((flow) => (
        <button
          type="button"
          className={'ov-flow-choice' + (flow.id === props.activeId ? ' active' : '')}
          key={flow.id}
          onClick={() => props.onSelect(flow.id)}
        >
          <span>{Icon[flow.icon]}</span>
          <span>{flow.title}</span>
        </button>
      ))}
    </div>
  )
}

function FlowPanel(props: { flow: GuidedFlow; onCancel(): void; onOpen(section: Section): void }) {
  return (
    <div className="ov-flow-panel">
      <div className="ov-flow-panel-head">
        <div>
          <h3>{props.flow.title}</h3>
          <p>{props.flow.body}</p>
        </div>
        <button type="button" className="sec-btn compact" onClick={props.onCancel}>
          {Icon.x}
          {msg('guidedFlows.cancel')}
        </button>
      </div>
      <ol className="ov-flow-steps">
        {props.flow.steps.map((step, index) => (
          <li key={step}>
            <b>
              {msg('guidedFlows.stepCount', {
                current: String(index + 1),
                total: String(props.flow.steps.length)
              })}
            </b>
            <span>{step}</span>
          </li>
        ))}
      </ol>
      {props.flow.symptoms.length > 0 && <SymptomChoices symptoms={props.flow.symptoms} onOpen={props.onOpen} />}
      <button type="button" className="btn primary" onClick={() => props.onOpen(props.flow.target)}>
        {Icon.arrow}
        {msg('guidedFlows.backToDetails', { target: props.flow.targetLabel })}
      </button>
    </div>
  )
}

function SymptomChoices(props: { symptoms: GuidedFlow['symptoms']; onOpen(section: Section): void }) {
  return (
    <div className="ov-flow-symptoms">
      <b>{msg('guidedFlows.symptomTitle')}</b>
      {props.symptoms.map((symptom) => (
        <button type="button" className="ov-flow-symptom" key={symptom.id} onClick={() => props.onOpen(symptom.target)}>
          <span>{symptom.title}</span>
          <small>{symptom.status} · {symptom.action}</small>
        </button>
      ))}
    </div>
  )
}
