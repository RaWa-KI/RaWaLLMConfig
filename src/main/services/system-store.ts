// system-store.ts — Persistiert manuelle Feld-Overrides fuer System-Eintraege.
// Speicherort: userData/system-overrides.json. SRP: nur Lesen + Schreiben der
// Override-Map. KEIN Secret-Wert loggen oder zurueckgeben. Muster: prefs-store.
import { app } from 'electron'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { System, SystemArea, SystemEntry } from '@shared/contract'
import type { SystemEntryPatch } from '@shared/contract-write'
import { exportSnapshot, DEFAULT_ARCHIVE_ROOT } from './backup'
import { appendAudit, makeAuditEntry, DEFAULT_AUDIT_PATH } from './audit-log'

// Internes Datenmodell: { [areaId]: { [entryId]: { [field]: value } } }
type OverrideMap = Record<string, Record<string, Record<string, string>>>

function getStorePath(): string {
  return join(app.getPath('userData'), 'system-overrides.json')
}

function loadOverrides(): OverrideMap {
  try {
    const raw = readFileSync(getStorePath(), 'utf8')
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as OverrideMap
    }
    return {}
  } catch {
    // Datei fehlt oder korrupt → leere Map (kein Crash)
    return {}
  }
}

// Persistiert die Override-Map atomar genug fuer JSON (kein Secret-Leak).
// backup-first (HR7): existierende Datei VOR dem Overwrite in den Archiv-Root
// sichern (analog prefs-store.ts:92-96). archiveRoot injizierbar (Default real).
// Wirft bei snap.error -> bricht VOR writeFileSync ab (kein Datenverlust).
function saveOverrides(map: OverrideMap, archiveRoot: string): void {
  const p = getStorePath()
  // backup-first: nur sichern, wenn die Datei bereits existiert (kein Snapshot
  // bei Erst-Anlage). snapshot() liefert bei fehlender Datei snapshotPath:'' ohne
  // Fehler; ein echter snap.error (z.B. archive-missing) bricht VOR Mutation ab.
  const snap = exportSnapshot(p, archiveRoot)
  if (snap.error) throw new Error(`backup-failed: ${snap.error}`)
  mkdirSync(join(p, '..'), { recursive: true })
  writeFileSync(p, JSON.stringify(map, null, 2), 'utf8')
}

/**
 * Persistiert alle Patches in der Override-Map. backup-first vor dem Write (HR7),
 * Audit-Eintrag NACH erfolgreichem Schreiben (nur Pfad-Name/Status, nie Wert).
 * archiveRoot/auditPath injizierbar (Default real; Test = temp) — analog der
 * uebrigen Schreib-Aufrufer (apply/prefs-store).
 * @returns Anzahl gepatchter Felder
 */
export function setSystemOverrides(
  patches: SystemEntryPatch[],
  archiveRoot: string = DEFAULT_ARCHIVE_ROOT,
  auditPath: string = DEFAULT_AUDIT_PATH
): number {
  const map = loadOverrides()
  let count = 0
  for (const patch of patches) {
    const { areaId, entryId, field, value } = patch
    if (!areaId || !entryId || !field) continue
    if (!map[areaId]) map[areaId] = {}
    if (!map[areaId][entryId]) map[areaId][entryId] = {}
    // KEIN Logging des value — kein Secret-Leak
    map[areaId][entryId][field] = value
    count++
  }
  saveOverrides(map, archiveRoot)
  // Audit NACH erfolgreichem Write — nur Pfad-NAME/Status, nie ein Secret-Wert.
  appendAudit(makeAuditEntry('system-write', getStorePath(), 'ok'), auditPath)
  return count
}

/**
 * Merged gespeicherte Overrides in eine Kopie des System-Objekts.
 * Ueberschreibt entry.fields mit manuell gesetzten Werten und setzt
 * entry.manualFields auf die Liste der ueberschriebenen Feld-Schluessel.
 * Reine Funktion — mutiert das Original nicht.
 */
export function applySystemOverrides(system: System): System {
  const map = loadOverrides()
  if (Object.keys(map).length === 0) return system

  const areas: SystemArea[] = system.areas.map((area): SystemArea => {
    const areaOverrides = map[area.id]
    if (!areaOverrides) return area

    const entries: SystemEntry[] = area.entries.map((entry): SystemEntry => {
      const entryId = entry.id ?? entry.name
      const fieldOverrides = areaOverrides[entryId]
      if (!fieldOverrides || Object.keys(fieldOverrides).length === 0) return entry

      const mergedFields: Record<string, string> = { ...(entry.fields ?? {}), ...fieldOverrides }
      const manualFields: string[] = Object.keys(fieldOverrides)

      return { ...entry, fields: mergedFields, manualFields }
    })

    return { ...area, entries }
  })

  return { ...system, areas }
}
