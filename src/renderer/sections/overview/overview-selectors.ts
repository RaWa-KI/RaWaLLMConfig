import type { AppData, ConfigEntry, System, Watcher } from '@shared/contract'
import { coverageEntryKey } from '@shared/contract-coverage'
import { isCoverageInfoEntry } from '@shared/entry-attention'
import type { AppLocale } from '@shared/messages'
import { memoLast } from '../../lib/memo-last'
import { buildDiagnosisCards, type DiagnosisCard } from './diagnosis-model'
import { buildGuidedFlows } from './guided-flows-model'
import { buildOverviewModel } from './overview-model'

// Testbare Selektoren fuer die Overview-/Diagnosemodelle (Teilplan C). memoLast
// cached den letzten Aufruf: Die Daten-Slices sind referenzstabil (aendern sich
// nur bei Reload), daher wird bei Folge-Renders mit unveraenderten Inputs NICHT
// neu gerechnet und die Ergebnis-Referenz bleibt identisch.
//
// Der locale-Parameter ist bewusst Cache-Schluessel, kein Builder-Input: msg()
// liest eine modulweite Locale, die in den Daten-Inputs nicht sichtbar ist.
// Ohne locale im Schluessel wuerde ein Sprachwechsel stale Texte liefern.
// Errors gehen als Einzelwerte ein (kein frisches Array pro Render, sonst
// waere der Cache wirkungslos).
export const selectOverviewModel = memoLast(
  (
    config: AppData | null,
    system: System | null,
    watcher: Watcher | null,
    configError: string | null,
    systemError: string | null,
    watcherError: string | null,
    locale: AppLocale
  ) => {
    void locale
    return buildOverviewModel({ config, system, watcher, errors: [configError, systemError, watcherError] })
  }
)

export const selectDiagnosisCards = memoLast(
  (
    config: AppData | null,
    system: System | null,
    watcher: Watcher | null,
    configError: string | null,
    systemError: string | null,
    watcherError: string | null,
    locale: AppLocale
  ) => {
    void locale
    return buildDiagnosisCards({ config, system, watcher, errors: [configError, systemError, watcherError] })
  }
)

export const selectGuidedFlows = memoLast(
  (cards: readonly DiagnosisCard[], locale: AppLocale) => {
    void locale
    return buildGuidedFlows(cards)
  }
)

// Coverage-Eintraege enthalten keine lokalisierten Texte (isCoverageInfoEntry
// filtert rein fachlich) — locale ist hier kein Cache-Schluessel noetig.
// Zeilen tragen den Ack-Schluessel (E-WP3): familyId ist der Record-Key aus
// AppData.data — identisch zur Scan-Seite (applyCoverageAcks in scan-index).
export const selectCoverageEntries = memoLast(coverageEntriesFor)

export interface CoverageEntryRow {
  entry: ConfigEntry
  familyId: string
  categoryId: string
  key: string
}

function coverageEntriesFor(config: AppData | null): CoverageEntryRow[] {
  if (!config) return []
  return Object.entries(config.data)
    .flatMap(([familyId, family]) => family.categories.flatMap((category) =>
      category.entries.filter((entry) => isCoverageInfoEntry(entry, familyId)).map((entry) => ({
        entry,
        familyId,
        categoryId: category.id,
        key: coverageEntryKey(familyId, category.id, entry.id)
      }))))
}
