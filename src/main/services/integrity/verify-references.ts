// verify-references.ts — Phase verify der Integritäts-Transaktion (HR27-Split
// aus apply-integrity-run.ts).
//
// Geprüft werden GENAU die Dateien aus plan.referenceOps — kein erneuter
// Voll-Scan über alle allowedRoots. Der frühere Voll-Rescan las bei jedem Apply
// den kompletten Baum ein zweites Mal (pro fsOp einmal) und liess die App bei
// grossen Wurzeln minutenlang eingefroren wirken.
//
// Bewusster Trade-off (Owner-Entscheid): Referenzen, die ERST ZWISCHEN Preview
// und Apply in neuen oder fremden Dateien entstehen, werden nicht mehr erkannt
// und bleiben stehen — genauso wie jede Referenz, die nach der Operation
// entsteht. Verbindliche Arbeitsgrundlage ist der über planHash/previewToken
// bestätigte Plan. Ein Rewrite-Ausfall in einer Plan-Datei wird unverändert
// erkannt und löst den bestehenden Rollback-Pfad aus.
//
// Schreibt NIE, liest keine Secret-Inhalte, gibt keine Snippets zurück.
import { join, relative } from 'node:path'
import type { IntegrityPlan, ReferenceOp } from '@shared/contract-integrity'
import { isPathEqualOrUnder } from '@shared/path-compare'
import { readTextFile } from './reference-pairs'
import { findReferenceIndex } from './reference-scan'

const VERIFY_FAILED = 'verify-failed: alte Pflichtreferenzen verbleiben'

interface MoveMapping {
  from: string
  to: string
}

/** Nur echte Verschiebungen remappen (reconcile archiviert, verschiebt nicht). */
function moveMappings(plan: IntegrityPlan): MoveMapping[] {
  const mappings: MoveMapping[] = []
  for (const op of plan.fsOps) {
    if ((op.action === 'move' || op.action === 'move-dir') && op.to) {
      mappings.push({ from: op.from, to: op.to })
    }
  }
  return mappings
}

/**
 * Effektiver Pfad einer Referenzdatei NACH der FS-Phase: liegt sie unter einem
 * verschobenen from-Pfad, wird sie auf den to-Pfad umgeschrieben (Windows-Case
 * und Separator-Form über normalizePathForCompare/relative berücksichtigt).
 */
function effectivePath(filePath: string, mappings: MoveMapping[]): string {
  for (const mapping of mappings) {
    if (!isPathEqualOrUnder(filePath, mapping.from, process.platform)) continue
    const rest = relative(mapping.from, filePath)
    return rest ? join(mapping.to, rest) : mapping.to
  }
  return filePath
}

/** ReferenceOps nach effektivem Datei-Pfad gruppieren (eine Lesung je Datei). */
function groupOpsByEffectivePath(plan: IntegrityPlan): Map<string, ReferenceOp[]> {
  const mappings = moveMappings(plan)
  const grouped = new Map<string, ReferenceOp[]>()
  for (const op of plan.referenceOps) {
    const path = effectivePath(op.filePath, mappings)
    const list = grouped.get(path)
    if (list) list.push(op)
    else grouped.set(path, [op])
  }
  return grouped
}

/** Reine Anzeige-Rückmeldung je geprüfter Datei (nie transaktionsrelevant). */
export type VerifyProgress = (done: number, total: number) => void

/** Phase verify: keine geplante Alt-Referenz darf in ihrer Plan-Datei bleiben. */
export function runVerifyPhase(plan: IntegrityPlan, onProgress?: VerifyProgress): string | null {
  const grouped = groupOpsByEffectivePath(plan)
  const total = grouped.size
  let done = 0
  for (const [filePath, ops] of grouped) {
    const read = readTextFile(filePath)
    done++
    onProgress?.(done, total)
    // Nicht lesbar/binary/oversize: der Scan prüft solche Dateien auch nicht.
    // Dazu gehört der als Loser archivierte Pfad — kein Rollback dafür.
    if (!read || read.binary || read.oversize) continue
    for (const op of ops) {
      if (findReferenceIndex(read.content, op.oldValue) !== -1) return VERIFY_FAILED
    }
  }
  return null
}
