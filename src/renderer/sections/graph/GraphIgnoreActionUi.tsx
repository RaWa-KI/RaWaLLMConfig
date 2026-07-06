import { Icon } from '../../components/Icon'
import type { IgnoreAppendResult } from './graphIgnoreActions'

type IgnoreAppendSuccess = Extract<IgnoreAppendResult, { ok: true }>

export type GraphActionState =
  | { phase: 'idle' }
  | { phase: 'confirm' }
  | { phase: 'saving' }
  | { phase: 'done'; result: IgnoreAppendSuccess }
  | { phase: 'error'; msg: string }

export function GraphConfirm(props: {
  title: string
  text: string
  onCancel(): void
  onConfirm(): void
}) {
  const { title, text, onCancel, onConfirm } = props
  return (
    <div className="graph-confirm">
      <strong>{title}</strong>
      <span>{text}</span>
      <div className="graph-confirm-actions">
        <button type="button" className="dup-btn" onClick={onCancel}>
          {Icon.x}Abbrechen
        </button>
        <button type="button" className="dup-btn adopt" onClick={onConfirm}>
          {Icon.check}Bestätigen
        </button>
      </div>
    </div>
  )
}

export function GraphActionFeedback({ state, okText }: { state: GraphActionState; okText: string }) {
  if (state.phase === 'saving') return <span className="ign-ok">{Icon.refresh}Speichere …</span>
  if (state.phase === 'error') return <span className="ign-err">{Icon.warn}{state.msg}</span>
  if (state.phase !== 'done') return null
  return (
    <span className="ign-ok">
      {Icon.check}
      {state.result.added > 0 ? okText : 'Regeln waren schon vorhanden'}
    </span>
  )
}
