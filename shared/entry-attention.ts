import type { ConfigEntry } from './contract'

// Coverage-Info = gehoert ins „Abdeckung & Register" (Overview), nicht in
// Warn-Zaehler/Diagnose-Karten. Die audit-Familie ist Register-only
// (Masterplan Teil E): ihre Befunde erscheinen einmalig im Register —
// familyId-Param seit E-WP3 L2, Default ohne familyId bleibt unveraendert.
export function isCoverageInfoEntry(entry: ConfigEntry, familyId?: string): boolean {
  return entry.status === 'acknowledged' || familyId === 'audit' || (entry.status === 'conflict' && (
    entry.loadMode === 'bei-bedarf' || entry.loadMode === 'bedingt'
  ))
}
