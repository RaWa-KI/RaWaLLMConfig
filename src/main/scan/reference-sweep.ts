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

const TEXT_EXTENSIONS = new Set([
  '.md', '.mdx', '.txt', '.json', '.jsonc', '.toml', '.yaml', '.yml',
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
])

export function scanAllWikilinks(roots: string[]): WikilinkFinding[] {
  const files = textFilesForRoots(roots)
  const index = buildWikilinkIndex(files, roots)
  const findings: WikilinkFinding[] = []
  for (const filePath of files) {
    collectDeadLinks(filePath, index, findings)
  }
  return findings
}

function textFilesForRoots(roots: string[]): string[] {
  const files: string[] = []
  for (const root of roots) {
    files.push(...listFilesDeep(root, isTextCandidate))
  }
  return [...new Set(files)].sort()
}

function isTextCandidate(absPath: string): boolean {
  return TEXT_EXTENSIONS.has(path.extname(absPath).toLowerCase())
}

function buildWikilinkIndex(files: string[], roots: string[]): Set<string> {
  const index = new Set<string>()
  for (const file of files) {
    const noExt = slashPath(file.slice(0, file.length - path.extname(file).length))
    index.add(path.basename(noExt).toLowerCase())
    for (const root of roots) {
      const rel = slashPath(path.relative(root, noExt))
      if (!rel.startsWith('..')) index.add(rel.toLowerCase())
    }
  }
  return index
}

function collectDeadLinks(filePath: string, index: Set<string>, findings: WikilinkFinding[]): void {
  const text = readTextSafe(filePath)
  if (text === undefined) return
  const lines = text.split(/\r?\n/)
  for (let i = 0; i < lines.length; i += 1) {
    for (const target of linksInLine(lines[i])) {
      if (!index.has(normalizeTarget(target))) {
        findings.push({ kind: 'dead-wikilink', filePath, line: i + 1, target, reason: 'target-not-found' })
      }
    }
  }
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
