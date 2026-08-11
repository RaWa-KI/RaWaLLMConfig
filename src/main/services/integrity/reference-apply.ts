// reference-apply.ts — Wendet die im Plan vorgesehenen ReferenceOps an (W3).
// Plan-treu: es wird GENAU das umgeschrieben, was previewIntegrity geplant und
// der planHash bestätigt hat — nichts daneben. Dateien, die der Scan als
// manualRequired markiert hat (z.B. kaputtes JSON, Secret), tragen keine ops und
// werden hier nicht angefasst. Snapshots liegen bereits aus Phase snapshot vor;
// hier wird nur atomar (tmp+rename) geschrieben. Kein Secret-Read, kein Snippet-Log.
import { closeSync, fsyncSync, openSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import type { ReferenceOp } from '@shared/contract-integrity'
import { appendAudit, makeAuditEntry } from '../audit-log'

/** Atomares Schreiben (tmp + fsync + rename) im Zielverzeichnis. */
function atomicWrite(path: string, content: string): void {
  const tmp = `${path}.tmp-${process.pid}`
  writeFileSync(tmp, content, 'utf8')
  const fd = openSync(tmp, 'r+')
  try {
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }
  renameSync(tmp, path)
}

/** Alle ops gruppieren nach filePath (stabil, in Plan-Reihenfolge). */
function groupByFile(ops: ReferenceOp[]): Map<string, ReferenceOp[]> {
  const map = new Map<string, ReferenceOp[]>()
  for (const op of ops) {
    const list = map.get(op.filePath)
    if (list) list.push(op)
    else map.set(op.filePath, [op])
  }
  return map
}

/** String-Replace aller Vorkommen (kein Regex — Pfade enthalten Sonderzeichen). */
function replaceAll(content: string, needle: string, replacement: string): string {
  if (!needle || !content.includes(needle)) return content
  return content.split(needle).join(replacement)
}

export interface ReferenceApplyResult {
  rewrittenFiles: string[]
  error: string | null
}

/** Reine Anzeige-Rueckmeldung je bearbeiteter Datei (nie transaktionsrelevant). */
export type ReferenceApplyProgress = (done: number, total: number) => void

/**
 * Wendet die geplanten ReferenceOps an. Pro Datei: längste needle zuerst
 * (vermeidet Teil-Treffer-Kollision), atomar schreiben, Audit. Liefert die Liste
 * tatsächlich geänderter Dateien. Fehler beim Schreiben bricht ab (Aufrufer rollt zurück).
 * onProgress meldet nach jeder Datei den Stand — auch fuer uebersprungene, damit
 * der Zaehler die Gesamtzahl wirklich erreicht.
 */
export function applyReferenceOps(
  ops: ReferenceOp[],
  auditPath: string,
  onProgress?: ReferenceApplyProgress
): ReferenceApplyResult {
  const rewrittenFiles: string[] = []
  const grouped = groupByFile(ops)
  const total = grouped.size
  let done = 0
  const step = (): void => {
    done++
    onProgress?.(done, total)
  }
  for (const [filePath, fileOps] of grouped) {
    let content: string
    try {
      content = readFileSync(filePath, 'utf8')
    } catch {
      // Datei nicht mehr lesbar (z.B. selbst verschoben oder als Loser
      // archiviert) — überspringen. Die Archiv-Kopie behält bewusst ihre alten
      // Referenzen; die Verify-Phase überspringt Unlesbares ebenso.
      step()
      continue
    }
    const sorted = [...fileOps].sort((a, b) => b.oldValue.length - a.oldValue.length)
    let next = content
    for (const op of sorted) next = replaceAll(next, op.oldValue, op.newValue)
    if (next === content) {
      step()
      continue
    }
    try {
      atomicWrite(filePath, next)
      rewrittenFiles.push(filePath)
      appendAudit(makeAuditEntry('edit', filePath, 'ok', 'reference-rewrite'), auditPath)
    } catch (err) {
      return { rewrittenFiles, error: err instanceof Error ? err.message : 'reference-write-failed' }
    }
    step()
  }
  return { rewrittenFiles, error: null }
}
