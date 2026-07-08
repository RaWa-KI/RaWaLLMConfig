import type { Section } from '../../state/types'

const FOCUS_STORAGE_KEY = 'rawallmconfig.overviewFocus'

export interface OverviewNavigationAction {
  label: string
  reason: string
  route: Section
  focusId?: string
  targetDescription?: string
}

export function navigateToOverviewAction(action: OverviewNavigationAction, onOpen: (section: Section) => void): void {
  rememberOverviewFocus(action)
  onOpen(action.route)
}

export function rememberOverviewFocus(action: OverviewNavigationAction): void {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.setItem(FOCUS_STORAGE_KEY, JSON.stringify(action))
  } catch {
    // Der Zielwechsel bleibt auch ohne Komfort-Fokus bedienbar.
  }
}

export function readOverviewFocus(route: Section): OverviewNavigationAction | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.sessionStorage.getItem(FOCUS_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<OverviewNavigationAction>
    if (parsed.route !== route || !parsed.label || !parsed.reason) return null
    return {
      label: parsed.label,
      reason: parsed.reason,
      route,
      focusId: parsed.focusId,
      targetDescription: parsed.targetDescription
    }
  } catch {
    return null
  }
}
