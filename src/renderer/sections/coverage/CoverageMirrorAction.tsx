import { useState } from 'react'
import type { CoverageRow } from '@shared/contract-coverage'
import { Icon } from '../../components/Icon'
import { useStore } from '../../state/store'
import { useWriteConfig } from '../../state/store-write-config'
import { coverageMirrorPlans, type CoverageMirrorPlan } from './coverage-mirror'

interface Props {
  row: CoverageRow
}

async function readMirrorSource(path: string): Promise<{ content: string; masked: boolean } | null> {
  if (typeof window === 'undefined' || !window.electronAPI?.readFull) return null
  const res = await window.electronAPI.readFull({ path })
  if (res.error || !res.data) return null
  return { content: res.data.content, masked: res.data.masked === true }
}

export function CoverageMirrorAction({ row }: Props) {
  const plans = coverageMirrorPlans(row)
  const wc = useWriteConfig()
  const { actions } = useStore()
  const [loading, setLoading] = useState<string | null>(null)
  if (plans.length === 0) return null

  async function requestMirror(plan: CoverageMirrorPlan) {
    if (plan.disabledReason || !plan.sourcePath || !plan.targetPath) return
    setLoading(plan.targetFamily)
    const source = await readMirrorSource(plan.sourcePath)
    setLoading(null)
    if (!source) {
      actions.showToast('Quelle konnte nicht gelesen werden', 'warn')
      return
    }
    if (source.masked) {
      actions.showToast('Nicht gespiegelt: Quelle ist maskiert', 'warn')
      return
    }
    wc.requestWrite({
      action: plan.action,
      path: plan.targetPath,
      content: source.content,
      label: plan.confirmLabel
    })
  }

  return (
    <div className="cvg-mirror-actions">
      {plans.map((plan) => {
        const disabled = wc.busy || loading !== null || !wc.writeEnabled || !!plan.disabledReason
        const title = !wc.writeEnabled ? (wc.writeReason ?? 'Schreibmodus nicht aktiv') : plan.disabledReason ?? plan.confirmLabel
        return (
          <button
            key={plan.targetFamily}
            type="button"
            className="cvg-mirror-btn"
            onClick={() => void requestMirror(plan)}
            disabled={disabled}
            title={title}
          >
            {Icon.merge}
            {loading === plan.targetFamily ? 'Lädt …' : plan.buttonLabel}
          </button>
        )
      })}
    </div>
  )
}
