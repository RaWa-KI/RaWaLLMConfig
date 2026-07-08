import { useEffect, useMemo } from 'react'
import { msg } from '../lib/messages'
import type { Section } from '../state/types'
import { readOverviewFocus } from '../sections/overview/overview-navigation'

export function FocusNotice({ section }: { section: Section }) {
  const focus = useMemo(() => readOverviewFocus(section), [section])
  useEffect(() => {
    if (!focus?.focusId || typeof document === 'undefined') return
    document.getElementById(focus.focusId)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [focus])
  if (!focus) return null
  const target = focus.targetDescription ?? focus.focusId ?? focus.route
  return (
    <div className="focus-notice" role="status" aria-live="polite">
      <b>{msg('diagnostics.focus.title')}</b>
      <span>{focus.reason}</span>
      <small>{msg('diagnostics.focus.target', { target })}</small>
    </div>
  )
}
