import { useEffect, useRef, useState } from 'react'
import { useStore } from '../state/store'
import { Icon } from '../components/Icon'
import type { Section } from '../state/types'
import { msgText, type MessageKey } from '../lib/messages'

type NavItem = { id: Section; icon: string } & ({ label: string } | { labelKey: MessageKey })

const TASK_SECTIONS: ReadonlyArray<NavItem> = [
  { id: 'overview', labelKey: 'overview.title', icon: 'sparkle' },
  { id: 'updates', labelKey: 'tasks.check.title', icon: 'refresh' },
  { id: 'config', labelKey: 'tasks.change.title', icon: 'edit' },
  { id: 'archiv', labelKey: 'tasks.restore.title', icon: 'snap' },
  { id: 'referenz', labelKey: 'help.nav.title', icon: 'book' }
]

const DETAIL_SECTIONS: ReadonlyArray<NavItem> = [
  { id: 'baum', labelKey: 'chrome.detail.baum', icon: 'map' },
  { id: 'graph', labelKey: 'chrome.detail.graph', icon: 'net' },
  { id: 'system', labelKey: 'chrome.detail.system', icon: 'cpu' },
  { id: 'struktur', labelKey: 'chrome.detail.struktur', icon: 'layers' },
  { id: 'settings', labelKey: 'chrome.detail.prefs', icon: 'gear' }
]

function alertCount(sources: readonly { state: string }[] | undefined): number {
  if (!sources) return 0
  return sources.filter((s) => s.state !== 'current').length
}

interface SwitchProps {
  active: Section
  updAlerts: number
  onSelect(id: Section): void
}

function SectionSwitch({ active, updAlerts, onSelect }: SwitchProps) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const activeItem = [...TASK_SECTIONS, ...DETAIL_SECTIONS].find((s) => s.id === active)
  const closeMenu = () => setOpen(false)
  const choose = (id: Section) => {
    onSelect(id)
    closeMenu()
  }

  useEffect(() => {
    if (!open) return undefined
    const onPointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) closeMenu()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeMenu()
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div className="section-switch" ref={menuRef}>
      <div className="active-section-pill" aria-live="polite">
        {activeItem && Icon[activeItem.icon]}
        <span>{activeItem ? itemLabel(activeItem) : msgText('overview.title')}</span>
      </div>
      {TASK_SECTIONS.map((s) => (
        <SectionButton key={s.id} item={s} active={active} updAlerts={updAlerts} onSelect={choose} />
      ))}
      <span className="llm-divider mini" />
      {DETAIL_SECTIONS.map((s) => (
        <SectionButton key={s.id} item={s} active={active} updAlerts={updAlerts} onSelect={choose} compact />
      ))}
      <button
        type="button"
        className={'sec-btn nav-more' + (open ? ' on' : '')}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={open ? 'Menü schließen' : 'Weitere Bereiche öffnen'}
        title={open ? 'Menü schließen' : 'Weitere Bereiche'}
        onClick={() => setOpen((value) => !value)}
      >
        {Icon.list}
        <span>Mehr</span>
      </button>
      {open && (
        <div className="nav-overflow-menu" role="menu" aria-label="Weitere Bereiche">
          {TASK_SECTIONS.slice(0, 3).map((s) => (
            <SectionButton
              key={s.id}
              item={s}
              active={active}
              updAlerts={updAlerts}
              onSelect={choose}
              menuItem
              mobileMenuItem
            />
          ))}
          {[...TASK_SECTIONS.slice(3), ...DETAIL_SECTIONS].map((s) => (
            <SectionButton
              key={s.id}
              item={s}
              active={active}
              updAlerts={updAlerts}
              onSelect={choose}
              menuItem
            />
          ))}
        </div>
      )}
    </div>
  )
}

interface SectionButtonProps {
  item: NavItem
  active: Section
  updAlerts: number
  compact?: boolean
  menuItem?: boolean
  mobileMenuItem?: boolean
  onSelect(id: Section): void
}

function SectionButton({ item, active, updAlerts, compact, menuItem, mobileMenuItem, onSelect }: SectionButtonProps) {
  const label = itemLabel(item)
  return (
    <button
      type="button"
      className={'sec-btn' + (active === item.id ? ' on' : '') + (compact ? ' compact' : '') + (menuItem ? ' menu-item' : '') + (mobileMenuItem ? ' menu-mobile' : '')}
      onClick={() => onSelect(item.id)}
      role={menuItem ? 'menuitem' : undefined}
      title={compact ? `${label} öffnen` : undefined}
      aria-label={compact ? `${label} öffnen` : undefined}
    >
      {Icon[item.icon]}
      {(!compact || menuItem) && label}
      {item.id === 'updates' && updAlerts > 0 && <span className="sb-badge">{updAlerts}</span>}
    </button>
  )
}

function itemLabel(item: NavItem): string {
  return 'labelKey' in item ? msgText(item.labelKey) : item.label
}

export function LlmBar() {
  const { watcher, ui, actions } = useStore()
  const updAlerts = alertCount(watcher.data?.sources)

  return (
    <div className="llmbar">
      <div className="llm-brand">
        <div className="lb-mark">{Icon.gear}</div>
        <div>
          {msgText('chrome.brand.title')}<div className="lb-sub">{msgText('chrome.brand.subtitle')}</div>
        </div>
      </div>
      <div className="llm-divider" />
      <SectionSwitch active={ui.section} updAlerts={updAlerts} onSelect={actions.setSection} />
      <div className="spacer" />
    </div>
  )
}
