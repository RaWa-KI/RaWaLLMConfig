import { useEffect, useRef, useState, type RefObject } from 'react'
import { useStore } from '../state/store'
import { Icon } from '../components/Icon'
import type { Section } from '../state/types'
import { msgText, type MessageKey } from '../lib/messages'
import { filterSectionsForMode, sectionVisibleForMode } from './nav-visibility'

type NavItem = { id: Section; icon: string } & ({ label: string } | { labelKey: MessageKey })

// D5 (Nav-Reduktion): die Hauptnav besteht aus fuenf benannten Bereichen —
// Ueberblick, Pruefen, Aendern, Wiederherstellen, Einstellungen. Jeder Eintrag
// traegt ein sichtbares Label aus den Message-Katalogen (kein Icon-only).
const TASK_SECTIONS: ReadonlyArray<NavItem> = [
  { id: 'overview', labelKey: 'overview.title', icon: 'sparkle' },
  { id: 'updates', labelKey: 'tasks.check.title', icon: 'refresh' },
  { id: 'config', labelKey: 'tasks.change.title', icon: 'edit' },
  { id: 'archiv', labelKey: 'tasks.restore.title', icon: 'snap' },
  { id: 'settings', labelKey: 'chrome.detail.prefs', icon: 'gear' }
]

// Zweitbereiche liegen beschriftet im „Mehr"-Menue statt als Icon-only-Leiste:
// Hilfe (beide Modi) plus die vier Experten-Bereiche (Modus-Weiche in LlmBar).
const MENU_SECTIONS: ReadonlyArray<NavItem> = [
  { id: 'referenz', labelKey: 'help.nav.title', icon: 'book' },
  { id: 'baum', labelKey: 'chrome.detail.baum', icon: 'map' },
  { id: 'graph', labelKey: 'chrome.detail.graph', icon: 'net' },
  { id: 'system', labelKey: 'chrome.detail.system', icon: 'cpu' },
  { id: 'struktur', labelKey: 'chrome.detail.struktur', icon: 'layers' }
]

function alertCount(sources: readonly { state: string }[] | undefined): number {
  if (!sources) return 0
  return sources.filter((s) => s.state !== 'current').length
}

interface SwitchProps {
  active: Section
  menuSections: ReadonlyArray<NavItem>
  updAlerts: number
  onSelect(id: Section): void
}

function SectionSwitch({ active, menuSections, updAlerts, onSelect }: SwitchProps) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const activeItem = [...TASK_SECTIONS, ...menuSections].find((s) => s.id === active)
  const closeMenu = () => setOpen(false)
  const choose = (id: Section) => {
    onSelect(id)
    closeMenu()
  }

  useCloseMenuOnOutside(menuRef, open, setOpen)

  return (
    <div className="section-switch" ref={menuRef}>
      <div className="active-section-pill" aria-live="polite">
        {activeItem && Icon[activeItem.icon]}
        <span>{activeItem ? itemLabel(activeItem) : msgText('overview.title')}</span>
      </div>
      {TASK_SECTIONS.map((s) => (
        <SectionButton key={s.id} item={s} active={active} updAlerts={updAlerts} onSelect={choose} />
      ))}
      <button
        type="button"
        className={'sec-btn nav-more' + (open ? ' on' : '')}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={open ? msgText('chrome.nav.moreClose') : msgText('chrome.nav.moreOpen')}
        title={open ? msgText('chrome.nav.moreClose') : msgText('chrome.nav.moreOpen')}
        onClick={() => setOpen((value) => !value)}
      >
        {Icon.list}
        <span>{msgText('chrome.nav.more')}</span>
      </button>
      {open && (
        <NavOverflowMenu active={active} menuSections={menuSections} updAlerts={updAlerts} onSelect={choose} />
      )}
    </div>
  )
}

// Schliesst das Overflow-Menue bei Klick ausserhalb oder Escape.
// setOpen aus useState ist stabil — der Effekt laeuft nur bei open-Wechsel neu.
function useCloseMenuOnOutside(
  menuRef: RefObject<HTMLDivElement | null>,
  open: boolean,
  setOpen: (value: boolean) => void
) {
  useEffect(() => {
    if (!open) return undefined
    const onPointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [menuRef, open, setOpen])
}

// Overflow-Menue (HR27-Split aus SectionSwitch): erste drei Hauptbereiche als
// mobile Eintraege, Rest plus sichtbare Menue-Bereiche als beschriftete Liste.
function NavOverflowMenu({ active, menuSections, updAlerts, onSelect }: SwitchProps) {
  return (
    <div className="nav-overflow-menu" role="menu" aria-label={msgText('chrome.nav.overflowLabel')}>
      {TASK_SECTIONS.slice(0, 3).map((s) => (
        <SectionButton
          key={s.id}
          item={s}
          active={active}
          updAlerts={updAlerts}
          onSelect={onSelect}
          menuItem
          mobileMenuItem
        />
      ))}
      {[...TASK_SECTIONS.slice(3), ...menuSections].map((s) => (
        <SectionButton
          key={s.id}
          item={s}
          active={active}
          updAlerts={updAlerts}
          onSelect={onSelect}
          menuItem
        />
      ))}
    </div>
  )
}

interface SectionButtonProps {
  item: NavItem
  active: Section
  updAlerts: number
  menuItem?: boolean
  mobileMenuItem?: boolean
  onSelect(id: Section): void
}

// D5: das Label wird immer sichtbar gerendert — kein Icon-only-Button ohne Text.
function SectionButton({ item, active, updAlerts, menuItem, mobileMenuItem, onSelect }: SectionButtonProps) {
  const label = itemLabel(item)
  return (
    <button
      type="button"
      className={'sec-btn' + (active === item.id ? ' on' : '') + (menuItem ? ' menu-item' : '') + (mobileMenuItem ? ' menu-mobile' : '')}
      onClick={() => onSelect(item.id)}
      role={menuItem ? 'menuitem' : undefined}
    >
      {Icon[item.icon]}
      {label}
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
  // Modus-Weiche (D2): Menue-Bereiche je Modus filtern — die vier Experten-
  // Bereiche nur im Expert-Modus; Hilfe und Hauptnav bleiben in beiden Modi.
  const menuSections = filterSectionsForMode(MENU_SECTIONS, ui.displayMode)
  // Guard-konsistent: bei ge-guard-eter Section zeigt Pill/aktiver Button overview.
  const activeSection = sectionVisibleForMode(ui.section, ui.displayMode) ? ui.section : 'overview'

  return (
    <div className="llmbar">
      <div className="llm-brand">
        <div className="lb-mark">{Icon.gear}</div>
        <div>
          {msgText('chrome.brand.title')}<div className="lb-sub">{msgText('chrome.brand.subtitle')}</div>
        </div>
      </div>
      <div className="llm-divider" />
      <SectionSwitch
        active={activeSection}
        menuSections={menuSections}
        updAlerts={updAlerts}
        onSelect={actions.setSection}
      />
      <div className="spacer" />
    </div>
  )
}
