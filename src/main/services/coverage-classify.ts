// coverage-classify.ts — Zell-Klassifikation + Asymmetrie-Logik fuer die
// Spiegelungs-Matrix (read-only). Aus coverage.ts ausgelagert (HR27-Split:
// coverage.ts bleibt unter 300 Z). REINE Klassifikations-/Drift-Logik; alle
// fs-Zugriffe laufen ueber die bestehenden read-only-Services (hashFile,
// compareSingleFile, compareDirs). KEINE Secret-/Wert-Ausgabe — Inhalte werden
// nur gehasht bzw. maskiert verglichen (Wahrheit = ROH-SHA, Anzeige maskiert).

import type {
  CoverageCell,
  ConfigEntry,
  DiffLine,
  DirCompare,
  Verdict
} from '@shared/contract'
import { isManifestPath, manifestParent } from '@shared/manifest-map'
import { compareDirs } from './dir-compare'
import { compareSingleFile } from './dedupe-content'
import type { SingleFileCompare } from './dedupe-content'
import { hashFile, isDirSafe, isFileSafe, resolvePath } from './dedupe-fs'
import { isSemanticallySameAgentAdapter } from './coverage-agent-semantics'

// Ein Vorkommen einer logischen Config in EINER Familie (Praesenz pro Familie,
// NICHT pro Entry — sonst Doppelzaehlung interner Codex-Mirror).
export interface FamilyPresence {
  entry: ConfigEntry
  cat: string // die familien-EIGENE (gueltige) Kategorie-id
}

// Tool-Familien, deren Configs Claude ueblicherweise ueber das Plugin-System
// (Marketplace/installed_plugins) bezieht. Fehlt eine echte ~/.claude-Datei,
// aber es sind Plugins installiert -> 'via-plugin' (NICHT 'fehlt').
// commands/mcp sind ebenfalls plugin-buendelbar; settings/instructions NICHT.
const PLUGIN_DELIVERABLE_CATS = new Set(['agents', 'skills', 'rules', 'hooks', 'commands', 'mcp'])

// Ergebnis eines Drift-Vergleichs (Trunk = Referenz, Mirror = Vergleichsseite).
export interface DriftResult {
  verdict: Verdict
  lines: DiffLine[]
  dir?: DirCompare
  masked: boolean
}

// Leeres Drift-Ergebnis (wenn ein Hash nicht ermittelbar war).
const EMPTY_DRIFT: DriftResult = { verdict: 'diff', lines: [], masked: false }

/**
 * Vergleicht Referenz- und Vergleichs-Pfad (Einzeldatei ODER Ordner) und liefert
 * verdict + (maskierte) Drift-Daten. Reuse der bestehenden read-only-Services;
 * Secret-Klasse -> maskierte Zeilen, Verdict bleibt aus ROH-SHA.
 */
export function compareDrift(refPath: string, otherPath: string): DriftResult {
  const dir = compareAsDirs(refPath, otherPath)
  if (dir) return dir
  if (isSemanticallySameAgentAdapter(refPath, otherPath)) {
    return { verdict: 'same', lines: [], masked: false }
  }
  const hr = hashFile(refPath)
  const ho = hashFile(otherPath)
  if (hr === null || ho === null) return EMPTY_DRIFT
  const verdict: Verdict = hr === ho ? 'same' : 'diff'
  const content = loadSingleContent(refPath, otherPath, verdict)
  return { verdict, lines: content.lines, masked: content.masked }
}

// Beide Pfade aufloesen und die Einzeldatei-Inhalts-Lieferung holen (Service-API).
function loadSingleContent(refPath: string, otherPath: string, verdict: Verdict): SingleFileCompare {
  const ar = resolvePath(refPath)
  const ao = resolvePath(otherPath)
  if (!ar || !ao) return { lines: [], masked: false, truncated: false }
  return compareSingleFile(ar, ao, verdict)
}

// Verzeichnis-Paar? Dann rekursiver Ordner-Vergleich (Skills/Agents sind Ordner).
// null, wenn nicht beidseitig ein absolutes Verzeichnis aufloesbar (-> Einzeldatei).
function compareAsDirs(refPath: string, otherPath: string): DriftResult | null {
  const ar = toCompareDir(refPath)
  const ao = toCompareDir(otherPath)
  if (!ar || !ao) return null
  const dir = compareDirs(ar, ao)
  if (!dir) return null
  const clean = dir.diffCount === 0 && dir.trunkOnlyCount === 0 && dir.mirrorOnlyCount === 0
  return { verdict: clean ? 'same' : 'diff', lines: [], dir, masked: false }
}

// Zu vergleichender ORDNER fuer einen Eintragspfad oder null (Manifest -> Ordner).
// Spiegelt toCompareDir aus dedupe.ts (dort privat) ueber die zentrale manifest-map.
function toCompareDir(rawPath: string): string | null {
  const abs = resolvePath(rawPath)
  if (!abs) return null
  if (isDirSafe(abs)) return abs
  if (isFileSafe(abs) && isManifestPath(abs)) {
    const parent = manifestParent(abs)
    return isDirSafe(parent) ? parent : null
  }
  return null
}

/**
 * Klassifiziert die Zelle einer NICHT-Referenz-Familie gegen die Referenz.
 * vorhanden + SHA == Referenz -> 'identisch'; vorhanden + SHA != -> 'abweichend';
 * nicht vorhanden -> 'fehlt' (Asymmetrie/n-a wird in classifyClaude/classifyCodex
 * gesondert behandelt, daher hier nur die Praesenz-/Drift-Achse).
 */
export function classifyPresent(present: FamilyPresence, drift: DriftResult): CoverageCell {
  const state = drift.verdict === 'same' ? 'identisch' : 'abweichend'
  return { state, path: present.entry.path }
}

// Einzelne echte Praesenz ist Referenz/Evidenz, kein Vergleich gegen sich selbst.
export function classifyReference(present: FamilyPresence): CoverageCell {
  return {
    state: 'vorhanden',
    path: present.entry.path,
    note: 'Referenz; kein Gegenstueck verglichen'
  }
}

/**
 * Claude-Zelle mit Asymmetrie: echte ~/.claude-Datei -> wie classifyPresent.
 * Fehlt sie, die Kategorie ist aber plugin-lieferbar UND es sind Plugins
 * installiert -> 'via-plugin' (NICHT 'fehlt'). Plugin-Auslieferung nicht
 * eindeutig ermittelbar -> 'n-a' (ehrlich, kein Raten). Ein installed_plugins-
 * Record ist KEIN Gegenstueck zu einer Quelldatei (Z-SP-3: kein Name-Match
 * Registry-Record <-> Quelldatei) — via-plugin ist daher Kategorie-/Praesenz-
 * abgeleitet, nicht aus einem Namens-Match.
 */
export function classifyClaude(
  present: FamilyPresence | undefined,
  drift: DriftResult | undefined,
  cat: string,
  hasClaudePlugins: boolean
): CoverageCell {
  if (present && drift) return classifyPresent(present, drift)
  if (PLUGIN_DELIVERABLE_CATS.has(cat)) {
    if (hasClaudePlugins) {
      return { state: 'via-plugin', note: 'Plugin-Indiz; kein Dateinachweis fuer diese Config' }
    }
    return { state: 'n-a', note: 'Plugin-Auslieferung nicht eindeutig ermittelbar' }
  }
  return { state: 'fehlt' }
}

/**
 * Codex-Zelle: 'plugins' ist Claude-spezifisch -> 'n-a' (Codex hat kein
 * Plugin-System). Sonst echte Praesenz -> classifyPresent, fehlt -> 'fehlt'.
 */
export function classifyCodex(
  present: FamilyPresence | undefined,
  drift: DriftResult | undefined,
  cat: string
): CoverageCell {
  if (cat === 'plugins') return { state: 'n-a', note: 'Plugins sind Claude-spezifisch' }
  if (present && drift) return classifyPresent(present, drift)
  return { state: 'fehlt' }
}
