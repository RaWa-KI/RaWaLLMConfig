import { useEffect, useMemo, useState } from 'react'
import { msg } from '../lib/messages'
import type { Section, StoreActions } from '../state/types'
import { useStore } from '../state/store'
import { clearOverviewFocus, readOverviewFocus } from '../sections/overview/overview-navigation'
import { useOverviewFocusVersion } from '../sections/overview/use-overview-focus'
import { resolveFocusJump, type FocusJump } from '../sections/overview/diagnosis-focus-resolvers'
import { applyConfigFocusTarget, type ConfigFocusUiState } from '../sections/config/config-focus-apply'
import './FocusNotice.css'

// Erklärbox nach einem Diagnose-/Flow-Sprung (WP-F1F8): „Details" ist ein
// dezenter Link (unterstrichen, kein Button) zum aufgelösten Ziel — Entry-
// Drawer via openEntry, System-Bereich + Zeile, Settings-Tab oder Watcher-
// Karte. Ohne auflösbares Ziel gibt es bewusst KEINEN Details-Link (ehrlicher
// Text statt totem Versprechen). „Als gelesen" verwirft den Fokus sofort über
// die Invalidate-Funktion statt auf die 5-Min-TTL zu warten.
// Routen-Sweep 2026-08-07: Die Fokus-Version haengt in Memo/Effekt, damit die
// Box auch bei Same-Section-Navigation frisch liest; ein neuer Klick hebt
// zudem ein frueheres „Als gelesen" wieder auf.
export function FocusNotice({ section }: { section: Section }) {
  const { config, system, watcher } = useStore()
  const focusVersion = useOverviewFocusVersion()
  const [dismissed, setDismissed] = useState(false)
  const focus = useMemo(() => readOverviewFocus(section), [section, focusVersion])
  useEffect(() => {
    setDismissed(false)
  }, [focusVersion])
  useEffect(() => {
    if (!focus?.focusId || typeof document === 'undefined') return
    scrollToElement(focus.focusId)
  }, [focus])
  if (!focus || dismissed) return null
  const jump = resolveFocusJump(section, focus.focusId, {
    config: config.data,
    system: system.data,
    watcher: watcher.data
  })
  const target = focus.targetDescription ?? focus.focusId ?? focus.route
  const onDismiss = (): void => {
    clearOverviewFocus()
    setDismissed(true)
  }
  return (
    <div className="focus-notice" role="status" aria-live="polite">
      <b>{msg('diagnostics.focus.title')}</b>
      <span>{focus.reason}</span>
      <small>{msg('diagnostics.focus.target', { target })}</small>
      <span className="focus-notice-links">
        {jump && <FocusDetailsLink jump={jump} focusId={focus.focusId ?? ''} />}
        <button type="button" className="focus-notice-dismiss" onClick={onDismiss}>
          {msg('diagnostics.focus.dismiss')}
        </button>
      </span>
    </div>
  )
}

function FocusDetailsLink({ jump, focusId }: { jump: FocusJump; focusId: string }) {
  const { ui, actions } = useStore()
  return (
    <a
      className="focus-notice-details"
      href={`#${focusId}`}
      onClick={(event) => {
        event.preventDefault()
        performFocusJump(jump, ui, actions)
      }}
    >
      {msg('diagnostics.focus.details')}
    </a>
  )
}

// Führt den Sprung zum aufgelösten Ziel aus. Config läuft über den geteilten
// Apply-Pfad (config-focus-apply, derselbe wie im ConfigSection-Fokus-Effekt),
// System wechselt Bereich + scrollt zur Zeile, Settings aktiviert den Tab
// (Klick auf den Tab-Button mit der Element-id), Watcher scrollt zur Karte.
function performFocusJump(jump: FocusJump, ui: ConfigFocusUiState, actions: StoreActions): void {
  if (jump.kind === 'config') {
    applyConfigFocusTarget(jump.target, ui, actions)
    return
  }
  if (jump.kind === 'system') {
    actions.setSysArea(jump.areaId)
    scrollToElement(jump.rowId)
    return
  }
  if (jump.kind === 'settingsTab') {
    const el = typeof document === 'undefined' ? null : document.getElementById(jump.elementId)
    if (el instanceof HTMLElement) el.click()
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    return
  }
  scrollToElement(jump.elementId)
}

function scrollToElement(id: string): void {
  if (typeof document === 'undefined') return
  document.getElementById(id)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
}
