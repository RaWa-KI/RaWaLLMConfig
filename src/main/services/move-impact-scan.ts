// move-impact-scan.ts -- warn-only reference scan before a move.
// Read-only: no rewrite, no snapshot, no PM/shared/userglobal mutation. The
// scanner never reads secret-classed paths and only opens small text files.
import fs from 'node:fs'
import { dirname, extname, resolve } from 'node:path'
import type {
  MoveImpactFinding,
  MoveImpactKind,
  MoveImpactScanData,
  MoveImpactScanRequest,
  MoveImpactScanResult,
  MoveImpactSkipped
} from '@shared/contract-write-rename'
import { readFileOnce, MAX_SCAN_BYTES } from '../scan/file-read-once'
import { isSecretPathForRead } from './secret-guard'

export interface MoveImpactScanOptions {
  scanRoots?: string[]
  maxResults?: number
}

interface Needle {
  value: string
  kind: MoveImpactKind
}

const DEFAULT_MAX_RESULTS = 50
const SKIP_DIRS = new Set([
  '.git', 'node_modules', 'dist', 'build', 'out', 'vendor',
  'test-results', '_archiv', '_archive', 'dist-release'
])
const TEXT_EXT = new Set([
  '.md', '.markdown', '.mdx', '.txt', '.json', '.jsonc', '.yml', '.yaml',
  '.toml', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.ps1', '.sh', '.py'
])

function validRequest(req: MoveImpactScanRequest): boolean {
  return !!req && typeof req.fromPath === 'string' && typeof req.to === 'string'
    && (req.version === 'shared' || req.version === 'claude')
}

function makeSkipped(): MoveImpactSkipped {
  return { ignored: 0, binary: 0, secret: 0, oversize: 0 }
}

function normKey(p: string): string {
  return resolve(p).replace(/\\/g, '/').toLowerCase()
}

function scanRoots(req: MoveImpactScanRequest, opts: MoveImpactScanOptions): string[] {
  const raw = opts.scanRoots?.length ? opts.scanRoots : [dirname(req.fromPath), dirname(req.to)]
  const roots = raw.map((p) => resolve(p)).filter((p) => {
    try {
      return fs.statSync(p).isDirectory()
    } catch {
      return false
    }
  })
  return compactRoots(roots)
}

function compactRoots(roots: string[]): string[] {
  const out: string[] = []
  const sorted = [...new Set(roots.map((p) => resolve(p)))].sort((a, b) => a.length - b.length)
  for (const root of sorted) {
    const key = normKey(root)
    if (out.some((prev) => key === normKey(prev) || key.startsWith(normKey(prev) + '/'))) continue
    out.push(root)
  }
  return out
}

function lastSegment(p: string): string {
  const parts = p.replace(/\\/g, '/').split('/').filter(Boolean)
  return parts[parts.length - 1] ?? ''
}

function parentSegment(p: string): string {
  const parts = p.replace(/\\/g, '/').split('/').filter(Boolean)
  return parts[parts.length - 2] ?? ''
}

function artifactName(fromPath: string): string {
  const base = lastSegment(fromPath)
  const withoutExt = base.replace(/\.[^.]+$/, '')
  if (/^skill\.md$/i.test(base)) return parentSegment(fromPath)
  return withoutExt || base
}

function buildNeedles(fromPath: string): Needle[] {
  const out: Needle[] = []
  const add = (value: string, kind: MoveImpactKind): void => {
    if (value && !out.some((n) => n.value === value)) out.push({ value, kind })
  }
  const raw = fromPath.trim()
  add(raw, 'path')
  add(raw.replace(/\\/g, '/'), 'path')
  add(raw.replace(/\\/g, '\\\\'), 'path')
  const name = artifactName(raw)
  if (name && name.toLowerCase() !== 'skill') {
    add(`[[${name}]]`, 'wikilink')
    add(`[[${name}|`, 'wikilink')
    add(`[[${name}#`, 'wikilink')
  }
  return out
}

function shouldSkipDir(name: string): boolean {
  return SKIP_DIRS.has(name.toLowerCase())
}

function isTextCandidate(absPath: string): boolean {
  return TEXT_EXT.has(extname(absPath).toLowerCase())
}

function* walkFiles(roots: string[], skipped: MoveImpactSkipped): Generator<string> {
  const stack = [...roots]
  while (stack.length > 0) {
    const dir = stack.pop()!
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      skipped.ignored++
      continue
    }
    for (const entry of entries) {
      const full = resolve(dir, entry.name)
      if (entry.isDirectory()) {
        if (shouldSkipDir(entry.name)) skipped.ignored++
        else stack.push(full)
      } else if (entry.isFile()) {
        yield full
      }
    }
  }
}

function fieldForLine(line: string): MoveImpactFinding['field'] {
  if (line.includes('canonical_source')) return 'canonical_source'
  if (line.includes('loader_path')) return 'loader_path'
  return undefined
}

function kindForLine(line: string, needle: Needle): { kind: MoveImpactKind; field?: MoveImpactFinding['field'] } {
  const field = fieldForLine(line)
  if (field) return { kind: 'governance-dependency', field }
  if (needle.kind === 'path' && /\bCLAUDE_SKILL_DIR\b|\bCODEX_SKILL_DIR\b|\bLOADER_PATH\b/i.test(line)) {
    return { kind: 'loader-default' }
  }
  return { kind: needle.kind }
}

function snippet(line: string): string {
  const s = line.trim().replace(/\s+/g, ' ')
  return s.length > 180 ? `${s.slice(0, 177)}...` : s
}

function addLineFindings(
  data: MoveImpactScanData,
  filePath: string,
  line: string,
  lineNo: number,
  needles: Needle[],
  max: number
): void {
  for (const needle of needles) {
    if (data.findings.length >= max) return
    if (!line.includes(needle.value)) continue
    const classified = kindForLine(line, needle)
    data.findings.push({
      filePath,
      line: lineNo,
      kind: classified.kind,
      match: needle.value,
      snippet: snippet(line),
      ...(classified.field ? { field: classified.field } : {})
    })
  }
}

function scanFile(data: MoveImpactScanData, filePath: string, needles: Needle[], max: number): void {
  if (isSecretPathForRead(filePath)) {
    data.skipped.secret++
    return
  }
  if (!isTextCandidate(filePath)) {
    data.skipped.binary++
    return
  }
  const snap = readFileOnce(filePath)
  if (!snap) {
    data.skipped.ignored++
    return
  }
  data.scannedFiles++
  if (snap.text === undefined) {
    if (snap.size > MAX_SCAN_BYTES) data.skipped.oversize++
    return
  }
  const lines = snap.text.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) addLineFindings(data, filePath, lines[i], i + 1, needles, max)
}

function emptyData(req: MoveImpactScanRequest, needles: Needle[], skipped: MoveImpactSkipped): MoveImpactScanData {
  return {
    version: req.version,
    fromPath: req.fromPath,
    to: req.to,
    searchedFor: needles.map((n) => n.value),
    findings: [],
    scannedFiles: 0,
    skipped,
    truncated: false
  }
}

export function scanMoveImpact(
  req: MoveImpactScanRequest,
  opts: MoveImpactScanOptions = {}
): MoveImpactScanResult {
  if (!validRequest(req)) return { data: null, error: 'invalid-request' }
  const max = Math.max(1, Math.min(opts.maxResults ?? req.maxResults ?? DEFAULT_MAX_RESULTS, DEFAULT_MAX_RESULTS))
  const skipped = makeSkipped()
  const needles = buildNeedles(req.fromPath)
  const data = emptyData(req, needles, skipped)
  for (const filePath of walkFiles(scanRoots(req, opts), skipped)) {
    if (data.findings.length >= max) {
      data.truncated = true
      break
    }
    scanFile(data, filePath, needles, max)
  }
  return { data, error: null }
}
