import type { Section } from '../../state/types'

const FOCUS_STORAGE_KEY = 'rawallmconfig.overviewFocus'

// Fokus-Invalidierung (WP-5): Ein gemerkter Fokus ist nur kurz nach dem Klick
// gueltig. Ohne Ablauf zeigte die Erklaerbox beim spaeteren Wiederbetreten
// derselben Sektion einen alten, fremden Befund — die Leseroutine prueft sonst
// nur die Route. 5 Minuten decken den Sprung samt Lesezeit ab.
export const OVERVIEW_FOCUS_TTL_MS = 5 * 60 * 1000

export interface OverviewNavigationAction {
  label: string
  reason: string
  route: Section
  focusId?: string
  targetDescription?: string
}

interface StoredOverviewFocus extends OverviewNavigationAction {
  savedAt: number
}

export function navigateToOverviewAction(action: OverviewNavigationAction, onOpen: (section: Section) => void): void {
  rememberOverviewFocus(action)
  onOpen(action.route)
}

export function rememberOverviewFocus(action: OverviewNavigationAction, now: number = Date.now()): void {
  if (typeof window === 'undefined') return
  try {
    const stored: StoredOverviewFocus = { ...action, savedAt: now }
    window.sessionStorage.setItem(FOCUS_STORAGE_KEY, JSON.stringify(stored))
  } catch {
    // Der Zielwechsel bleibt auch ohne Komfort-Fokus bedienbar.
  }
}

export function readOverviewFocus(route: Section, now: number = Date.now()): OverviewNavigationAction | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.sessionStorage.getItem(FOCUS_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<StoredOverviewFocus>
    if (parsed.route !== route || !parsed.label || !parsed.reason) return null
    if (!isFreshFocus(parsed.savedAt, now)) return null
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

// Ohne Zeitstempel stammt der Eintrag aus einer aelteren Sitzung/Version und
// gilt als abgelaufen; kuenftige Zeitstempel werden ebenfalls verworfen.
function isFreshFocus(savedAt: number | undefined, now: number): boolean {
  if (typeof savedAt !== 'number' || !Number.isFinite(savedAt)) return false
  const age = now - savedAt
  return age >= 0 && age <= OVERVIEW_FOCUS_TTL_MS
}
