// reference-sweep.ts — C-04/A1-1 isolierter Wikilink-Bestands-Sweep.
// Scannt Textdateien read-only und meldet tote [[wikilinks]] ohne Integration.
import path from 'node:path'
import { readTextSafe } from './scan-helpers'
import { listFilesDeep, slashPath } from './c04-scan-helpers'

export interface WikilinkFinding {
  kind: 'dead-wikilink'
  filePath: string
  line: number
  target: string
  reason: string
}

const DOC_EXTENSIONS = new Set(['.md', '.mdx', '.txt'])

// extraFiles (B10): einzelne Dateien ausserhalb der gewalkten Wurzeln —
// Top-Level-Markdown scope-begrenzter Wurzeln (Tool-Homes/Workspaces), die
// bewusst NICHT voll gewalkt werden. Sie landen im gemeinsamen Index und
// werden selbst auf tote Links gescannt.
export function scanAllWikilinks(roots: string[], extraFiles: string[] = []): WikilinkFinding[] {
  const files = textFilesForRoots(roots, extraFiles)
  const index = buildWikilinkIndex(files, roots)
  const findings: WikilinkFinding[] = []
  for (const filePath of files) {
    collectDeadLinks(filePath, index, findings)
  }
  return findings
}

function textFilesForRoots(roots: string[], extraFiles: string[]): string[] {
  const files: string[] = []
  for (const root of roots) {
    files.push(...listFilesDeep(root, isTextCandidate))
  }
  files.push(...extraFiles.filter(isTextCandidate))
  return [...new Set(files)].sort()
}

function isTextCandidate(absPath: string): boolean {
  return DOC_EXTENSIONS.has(path.extname(absPath).toLowerCase())
}

// Aufloesungs-Index ueber ALLE Wurzeln GEMEINSAM (B10): relpaths traegt je
// Datei den Relativpfad von JEDER Wurzel aus (Primaerschluessel fuer
// pfadqualifizierte Links), basenames die Basenames aller Dateien aller
// Wurzeln (Sekundaerschluessel). Basename-Kollision zwischen Wurzeln: der
// Link ist aufloesbar, solange IRGENDEINE Wurzel den Namen traegt — ein Link
// wird nur dann als tot gemeldet, wenn er in KEINER Wurzel existiert (keine
// cross-root-False-Negatives, keine Falschpositive).
interface WikilinkIndex {
  relpaths: Set<string>
  basenames: Set<string>
}

function buildWikilinkIndex(files: string[], roots: string[]): WikilinkIndex {
  const index: WikilinkIndex = { relpaths: new Set(), basenames: new Set() }
  for (const file of files) {
    const noExt = slashPath(file.slice(0, file.length - path.extname(file).length))
    index.basenames.add(path.basename(noExt).toLowerCase())
    for (const root of roots) {
      const rel = slashPath(path.relative(root, noExt))
      if (!rel.startsWith('..')) index.relpaths.add(rel.toLowerCase())
    }
  }
  return index
}

function collectDeadLinks(filePath: string, index: WikilinkIndex, findings: WikilinkFinding[]): void {
  const text = readTextSafe(filePath)
  if (text === undefined) return
  const lines = text.split(/\r?\n/)
  for (let i = 0; i < lines.length; i += 1) {
    for (const target of linksInLine(lines[i])) {
      if (!isResolvable(index, target)) {
        findings.push({ kind: 'dead-wikilink', filePath, line: i + 1, target, reason: 'target-not-found' })
      }
    }
  }
}

// Pfadqualifizierte Links ('docs/foo') loesen nur ueber den vollen
// Relativpfad auf — ein Basename-Fallback waere hier ein Falschpositiv-
// Risiko. Reine Namens-Links loesen ueber den Basename-Index auf.
function isResolvable(index: WikilinkIndex, target: string): boolean {
  const normalized = normalizeTarget(target)
  if (normalized.includes('/')) return index.relpaths.has(normalized)
  return index.basenames.has(normalized)
}

function linksInLine(line: string): string[] {
  const out: string[] = []
  const re = /\[\[([^\]]+)\]\]/g
  let match: RegExpExecArray | null
  while ((match = re.exec(line))) {
    const target = match[1].split('|')[0].split('#')[0].trim()
    if (target) out.push(target)
  }
  return out
}

function normalizeTarget(target: string): string {
  return slashPath(target).replace(/\.(md|mdx|txt)$/i, '').toLowerCase()
}
