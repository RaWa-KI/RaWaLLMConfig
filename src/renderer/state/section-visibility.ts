import type { DisplayMode, Section } from './types'

// Navigations-Weiche DisplayMode (Owner-Entscheid D1/D2, 2026-07-18):
// Pfad-Baum, Graph, System und Struktur-Scan sind Experten-Bereiche und im
// Simple-Modus verborgen. Einstellungen und die fuenf Task-Bereiche bleiben
// in beiden Modi erreichbar. Gilt fuer Navigation (LlmBar) und die
// Section-Weiche (App) gleichermassen — daher hier zentral.
const EXPERT_ONLY_SECTIONS: ReadonlyArray<Section> = ['baum', 'graph', 'system', 'struktur']

export function isExpertOnlySection(section: Section): boolean {
  return EXPERT_ONLY_SECTIONS.includes(section)
}

export function sectionVisibleForMode(section: Section, mode: DisplayMode): boolean {
  return mode === 'expert' || !isExpertOnlySection(section)
}

// Settings-Untertabs sources/modules sind per Modus-Weiche in SettingsSection
// Experten-Bereiche: eine Diagnose-Route dorthin ist im Simple-Modus ein totes
// Ziel (der Tab rendert nicht), obwohl die Sektion „Einstellungen" selbst
// sichtbar bleibt. Befund 2026-07-19: Laien landeten ueber eine Diagnosekarte
// auf dem Darstellungs-Tab ohne Handlungsfaehrung. WP-F6 (2026-08-07): der
// Updates-Tab ist in beiden Modi sichtbar — `settings-tab-updates` loest daher
// auch im Simple-Modus auf.
const EXPERT_ONLY_SETTINGS_FOCUS: ReadonlyArray<string> = [
  'settings-tab-sources',
  'settings-tab-modules'
]

export function actionVisibleForMode(action: { route: Section; focusId?: string }, mode: DisplayMode): boolean {
  if (!sectionVisibleForMode(action.route, mode)) return false
  if (mode === 'expert') return true
  return !(action.route === 'settings' && action.focusId !== undefined && EXPERT_ONLY_SETTINGS_FOCUS.includes(action.focusId))
}
