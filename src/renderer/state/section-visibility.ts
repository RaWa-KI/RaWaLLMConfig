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
