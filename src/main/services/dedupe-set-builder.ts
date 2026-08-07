// dedupe-set-builder.ts — Paar→DuplicateSet-Konstruktion (HR27-Split aus
// dedupe.ts, Plan C). Vergleicht zwei Pfade (Ordner ODER Einzeldatei) und baut
// das Set — genutzt von der namensbasierten Erkennung (dedupe.ts) UND der
// inhaltsbasierten Stufe (dedupe-content-scan.ts). Semantik unveraendert:
// Verdict strikt aus ROH-SHA, Ordner via compareDirs, Einzeldatei mit `lines`
// fuer JEDE Klasse (WP-D1: same/diff/secret/oversize). Secret-Werte nie roh.
import type { DiffLine, DirCompare, DuplicateSet, Verdict } from '@shared/contract'
import type { DriftDecisionRecord } from '@shared/contract-drift'
import { isManifestPath, manifestParent } from '@shared/manifest-map'
import { compareDirs } from './dir-compare'
import { compareSingleFile } from './dedupe-content'
import type { SingleFileCompare } from './dedupe-content'
import { hashFile, isDirSafe, isFileSafe, resolvePath } from './dedupe-fs'
import { driftDecisionKeyForPaths } from './drift-relation'

// Eine Vergleichsseite: realer Pfad + Anzeige-Datum ('' erlaubt).
export interface SetSide {
  path: string
  updated: string
}

// Ergebnis eines Paar-Vergleichs (Einzeldatei ODER Ordner).
interface CompareResult {
  verdict: Verdict
  note: string
  lines: DiffLine[]
  dir?: DirCompare
  masked: boolean
  linesTruncated: boolean
}

// Leeres Inhalts-Ergebnis (wenn ein Hash nicht ermittelbar war).
const EMPTY_CONTENT: SingleFileCompare = { lines: [], masked: false, truncated: false }

/**
 * Baut ein DuplicateSet aus zwei realen Pfaden. `family` ist die gemeinsame
 * Tool-Familie (Cross-Familien-Paare gibt es seit dem D3-Narrowing nicht mehr);
 * `name` ist der Anzeigename (Item-Ordner- oder Dateiname).
 */
export function buildDuplicateSet(
  family: string,
  cat: string,
  name: string,
  trunk: SetSide,
  mirror: SetSide,
  mirrorFamily: NonNullable<DuplicateSet['mirrorFamily']>,
  confidence: NonNullable<DuplicateSet['confidence']>,
): DuplicateSet {
  const cmp = compare(trunk.path, mirror.path, family)
  const set: DuplicateSet = {
    cat,
    name,
    verdict: cmp.verdict,
    trunk: { path: trunk.path, updated: trunk.updated },
    mirror: { path: mirror.path, updated: mirror.updated },
    note: cmp.note,
    lines: cmp.lines,
    mirrorFamily,
    confidence,
  }
  if (cmp.dir) set.dir = cmp.dir // nur bei Verzeichnis-Dubletten
  if (cmp.masked) set.masked = true // Secret-Klasse: Anzeige nicht entmaskieren
  if (cmp.linesTruncated) set.linesTruncated = true // gekappter Vergleich
  return set
}

/**
 * Set genau einmal pro Liste ablegen — UNGEORDNETER Paar-Schluessel
 * (cat + beide Pfade sortiert), damit (a,b) und (b,a) aus verschiedenen
 * Erkennungsstufen nicht doppelt erscheinen.
 */
export function pushUniqueSet(list: DuplicateSet[], set: DuplicateSet): void {
  const key = pairKey(set.cat, set.trunk.path, set.mirror.path)
  if (!list.some((s) => pairKey(s.cat, s.trunk.path, s.mirror.path) === key)) list.push(set)
}

function pairKey(cat: string, a: string, b: string): string {
  return `${cat}|${[a, b].sort().join('|')}`
}

/**
 * Keys der per Drift-Decision ausgeblendeten Paare: 'parity' (gewollte
 * HR16-Paritaets-Kopie) und 'ignored' verbergen das DuplicateSet;
 * 'duplicate' oder fehlende Decision lassen es unveraendert.
 */
export function hiddenDecisionKeys(records: DriftDecisionRecord[]): Set<string> {
  const out = new Set<string>()
  for (const r of records) {
    if (r.decision === 'parity' || r.decision === 'ignored') out.add(r.key)
  }
  return out
}

/** true, wenn das Set einem persistierten parity/ignored-Key entspricht. */
export function isHiddenByDecision(set: DuplicateSet, hiddenKeys: Set<string>): boolean {
  if (hiddenKeys.size === 0) return false
  const key = driftDecisionKeyForPaths(set.cat, set.name, [set.trunk.path, set.mirror.path])
  return key !== null && hiddenKeys.has(key)
}

/**
 * SHA-256-Vergleich + sprechende Notiz; Verzeichnis-Paare via compareDirs.
 * Einzeldatei-Paare liefern fuer JEDE Klasse vergleichbare `lines`
 * (same -> alle ctx; diff -> LCS; secret -> maskiert; oversize -> gekappt).
 */
function compare(trunkPath: string, mirrorPath: string, family: string): CompareResult {
  const dirResult = compareAsDirs(trunkPath, mirrorPath, family)
  if (dirResult) return dirResult
  const ht = hashFile(trunkPath)
  const hm = hashFile(mirrorPath)
  let verdict: Verdict = 'diff'
  let detail = 'Inhalt nicht vergleichbar'
  let comparable = false
  if (ht !== null && hm !== null) {
    verdict = ht === hm ? 'same' : 'diff'
    detail = verdict === 'same' ? 'Inhalt identisch (SHA-256)' : 'Inhalt unterscheidet sich'
    comparable = true
  }
  // Inhalt fuer JEDE Klasse liefern (auch same/secret/oversize). Verdict aus ROH-SHA.
  const content = comparable ? loadSingleContent(trunkPath, mirrorPath, verdict) : EMPTY_CONTENT
  return {
    verdict,
    note: `${family} ↔ ${family}: ${detail}`,
    lines: content.lines,
    masked: content.masked,
    linesTruncated: content.truncated,
  }
}

/** Loest beide Pfade auf und liefert die Einzeldatei-Inhalts-Lieferung (Service-API). */
function loadSingleContent(trunkPath: string, mirrorPath: string, verdict: Verdict): SingleFileCompare {
  const at = resolvePath(trunkPath)
  const am = resolvePath(mirrorPath)
  if (!at || !am) return EMPTY_CONTENT
  return compareSingleFile(at, am, verdict)
}

/**
 * Verzeichnis-Pfad? Dann rekursiver Ordner-Vergleich (Skills/Agents sind Ordner).
 * Liefert null, wenn nicht beidseitig ein absolutes Verzeichnis ist (-> Einzeldatei).
 */
function compareAsDirs(trunkPath: string, mirrorPath: string, family: string): CompareResult | null {
  const at = toCompareDir(trunkPath)
  const am = toCompareDir(mirrorPath)
  if (!at || !am) return null
  const dir = compareDirs(at, am)
  if (!dir) return null
  const clean = dir.diffCount === 0 && dir.trunkOnlyCount === 0 && dir.mirrorOnlyCount === 0
  const verdict: Verdict = clean ? 'same' : 'diff'
  const note =
    `${family} ↔ ${family}: Ordner — ${dir.sameCount} gleich, ` +
    `${dir.diffCount} abweichend, ${dir.trunkOnlyCount} nur Trunk, ${dir.mirrorOnlyCount} nur Mirror`
  return { verdict, note, lines: [], dir, masked: false, linesTruncated: false }
}

/**
 * Liefert den zu vergleichenden ORDNER fuer einen Eintragspfad oder null.
 * Scanner-Asymmetrie: Eine Seite zeigt auf den Item-Ordner selbst, die andere
 * auf seine Manifestdatei (SKILL.md/AGENT.md bzw. teams/config.json,
 * plugins/plugin.json). BEIDE Seiten muessen auf denselben Item-Ordner
 * abgebildet werden, damit der rekursive Ordner-Vergleich ALLE innenliegenden
 * Dateien erfasst (nicht nur das Manifest).
 * Echte Einzeldateien (rules/hooks/settings) liefern null -> Einzeldatei-Diff.
 */
function toCompareDir(rawPath: string): string | null {
  const abs = resolvePath(rawPath)
  if (!abs) return null
  if (isDirSafe(abs)) return abs
  // Manifestdatei eines Item-Ordners -> der enthaltende Ordner (String aus Map).
  if (isFileSafe(abs) && isManifestPath(abs)) {
    const parent = manifestParent(abs)
    return isDirSafe(parent) ? parent : null
  }
  return null
}
