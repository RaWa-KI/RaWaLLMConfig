// diagnosis-cards-filter.ts — Filter- und Textbausteine der Diagnosekarten,
// aus diagnosis-model.ts extrahiert (HR27-Split, WP-3/B3).
//
// Falschpositiv-Regel (B3): Das Contract-Flag `fileBacked` ist die EINZIGE
// Filterwahrheit. Katalog- und Beispiel-Eintraege (Endpoints wie llama-server/
// Ollama, Modell-Beispiele wie gpt-4o) tragen fileBacked === false — ihr
// `stale` heisst per Design „Katalog/nicht geprueft" (llm-scan.ts,
// providers/cloud-scan.ts), nicht „Ordner fehlt". Sie erzeugen KEINE Karte.
// Bewusst KEIN pauschaler stale-Filter: ein dateibasierter stale-Eintrag
// (wirklich fehlender/verschobener Ordner) bleibt eine echte Problemkarte.
import type { AppData, Category, ConfigEntry, EntryStatus } from '@shared/contract'
import { isCoverageInfoEntry } from '@shared/entry-attention'
import { msg } from '../../lib/messages'
import type { Section } from '../../state/types'
import type { DiagnosisSource, DiagnosisStatus } from './diagnosis-model'

/** Eintrag erzeugt eine Problemkarte (Warnung) — nur dateibasierte Befunde. */
export function isProblemEntry(entry: ConfigEntry, familyId: string): boolean {
  return entry.status !== 'active'
    && entry.fileBacked !== false
    && !isCoverageInfoEntry(entry, familyId)
}

/**
 * Ausnahme mit wahrem, einrichtbarem Befund: ein fehlender Cloud-API-Key ist
 * kein Katalog-Eintrag. Der Scanner meldet ihn als Key-Status-Eintrag mit dem
 * Env-NAMEN in fields (nie den Wert, cloud-scan.ts keyEntry). Dafuer gibt es
 * eine Info-Karte „Key nicht gesetzt" statt der frueheren „Ordner fehlt"-
 * Falschmeldung (B3). Vertragssignal ist das Feld 'Env-Variable'.
 */
export function isMissingKeyEntry(entry: ConfigEntry): boolean {
  return entry.fileBacked === false
    && entry.status !== 'active'
    && typeof entry.fields?.['Env-Variable'] === 'string'
}

/** Laienverstaendliche Texte der Key-Info-Karte (HR28; Wert bleibt maskiert). */
export function missingKeyCopy(entry: ConfigEntry): { meaning: string; how: string; changeHint: string } {
  const envNames = entry.fields?.['Env-Variable'] ?? ''
  return {
    meaning: `Key nicht gesetzt: Für ${entry.name} ist kein Zugangsschlüssel hinterlegt — der Anbieter ist erst nutzbar, wenn der Schlüssel gesetzt ist.`,
    how: `Lege den Schlüssel als Umgebungsvariable ${envNames} an (Windows: Systemeigenschaften > Umgebungsvariablen) und starte die App danach neu.`,
    changeHint: `Setze die Umgebungsvariable ${envNames} mit deinem Schlüssel und lade danach neu; der Wert wird nie angezeigt.`
  }
}

/** Konkretes „Was ist betroffen" aus dem Eintrag statt generischer Floskel. */
export function concreteMeaning(entry: ConfigEntry): string | undefined {
  const base = (entry.conflictReason ?? entry.desc).trim()
  return base.length > 0 ? base : undefined
}

export function familyLabel(llms: AppData['llms'], id: string): string {
  return llms.find((llm) => llm.id === id)?.name ?? id
}

export function configTargetLabel(category: Category, entry: ConfigEntry): string {
  return `${entry.name} (${category.label})`
}

export function configChangeHint(status: EntryStatus, reason: string | undefined, entryName: string): string {
  if (reason) return `Grund: ${reason}. Prüfe den Eintrag ${entryName} und entscheide, ob er verbunden, korrigiert oder bewusst stehen gelassen werden soll.`
  return changeText(statusCardState(status), 'config', entryName)
}

function statusCardState(status: EntryStatus): DiagnosisStatus {
  if (status === 'stale') return 'notFound'
  if (status === 'archived') return 'paused'
  return 'problemFound'
}

/** Gemeinsamer Handlungstext je Status (von card() und configChangeHint). */
export function changeText(status: DiagnosisStatus, source: DiagnosisSource, targetLabel?: string): string {
  const target = targetLabel ? ` ${targetLabel}` : ''
  if (status === 'notFound') return `Verbinde oder korrigiere${target}; wenn es absichtlich fehlt, die Quelle pausieren oder entfernen.`
  if (status === 'paused') return `Aktiviere${target} wieder oder lasse den pausierten Zustand bewusst bestehen.`
  if (status === 'problemFound') return `Öffne die Details und korrigiere die gemeldete Abweichung bei${target}.`
  if (status === 'notUsable') return `Öffne${target} und korrigiere Pfad, Datei oder lokalen Dienst.`
  if (status === 'unavailable') return `Lade neu und prüfe, ob ${msg(`diagnostics.source.${source}`)} erreichbar ist.`
  return `Richte${target} ein oder verbinde die passende Quelle.`
}

/** Ortstext der Karte je nach Zielbereich. */
export function whereText(source: DiagnosisSource, target: Section): string {
  if (target === 'settings') return 'Einstellungen'
  if (target === 'updates') return 'Prüfen > Toolchain-Watcher'
  if (target === 'config') return 'Ändern > Config-Eintrag'
  if (target === 'system') return 'System'
  return msg(`diagnostics.source.${source}`)
}

/** Fallback-Zieltext, wenn weder Label noch Detail bekannt sind. */
export function unknownTarget(source: DiagnosisSource): string {
  return msg('diagnostics.target.unknown', { source: msg(`diagnostics.source.${source}`) })
}
