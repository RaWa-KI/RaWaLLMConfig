// claude-hook-runtime-audit.ts — D7/D10 aus begrenzten Hook-Attachments.
// Nur whitelisted Metadaten verlassen den JSONL-Parser; Rohtexte bleiben lokal.
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import type { DoctorLimits } from './claude-doctor-context'

type TranscriptLimits = DoctorLimits['transcripts']

export interface HookRuntimeAuditInput {
  transcriptRoots: string[]
  limits: TranscriptLimits
  nowMs?: number
}

interface HookRuntimeMetric {
  rule: 'D7'
  kind: 'observed-hook-runtime'
  hookName: string
  hookEvent: string
  observedAttachments: number
  durationSamples: number
  p50Ms?: number
  p90Ms?: number
  timeouts: number
  cancellations: number
}

interface HookRuntimeError {
  rule: 'D10'
  kind: 'observed-hook-error'
  hookName: string
  hookEvent: string
  errorClass: string
  errorCode?: string
  undefinedIdentifier?: string
  fingerprint: string
  count: number
}

interface HookTranscriptCoverage {
  complete: boolean
  eligibleFiles: number
  scannedFiles: number
  scannedBytes: number
  skippedOldFiles: number
  skippedLinkedEntries: number
  skippedOversizeFiles: number
  skippedByFileCap: number
  skippedByTotalByteCap: number
  unreadableEntries: number
  invalidJsonLines: number
  invalidAttachmentLines: number
  discoveryTruncated: boolean
  reasons: string[]
}

export interface HookRuntimeAuditResult {
  runtimes: HookRuntimeMetric[]
  errors: HookRuntimeError[]
  coverage: HookTranscriptCoverage
}

interface Candidate { filePath: string; size: number; mtimeMs: number }
interface SafeAttachment {
  type: string; hookName: string; hookEvent: string
  durationMs?: number; timedOut?: boolean; timeoutMs?: number
  errorClass?: string; errorCode?: string; undefinedIdentifier?: string
}

const SAFE_NAME = /^[A-Za-z0-9_.:@-]{1,128}$/
const SAFE_ERROR_CLASS = /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/
const SAFE_SYMBOL = /^[A-Z][A-Z0-9_]{1,63}$/

function emptyCoverage(): HookTranscriptCoverage {
  return {
    complete: true, eligibleFiles: 0, scannedFiles: 0, scannedBytes: 0,
    skippedOldFiles: 0, skippedLinkedEntries: 0, skippedOversizeFiles: 0,
    skippedByFileCap: 0, skippedByTotalByteCap: 0, unreadableEntries: 0,
    invalidJsonLines: 0, invalidAttachmentLines: 0, reasons: [],
    discoveryTruncated: false,
  }
}

function addReason(coverage: HookTranscriptCoverage, reason: string): void {
  coverage.complete = false
  if (!coverage.reasons.includes(reason)) coverage.reasons.push(reason)
}

function collectCandidates(
  roots: string[], cutoffMs: number, coverage: HookTranscriptCoverage, entryCap: number,
): Candidate[] {
  const candidates: Candidate[] = []
  const visit = (current: string): void => {
    if (coverage.discoveryTruncated) return
    if (entryCap <= 0) { coverage.discoveryTruncated = true; addReason(coverage, 'discovery-cap'); return }
    entryCap -= 1
    let stat: fs.Stats
    try { stat = fs.lstatSync(current) } catch {
      coverage.unreadableEntries += 1; addReason(coverage, 'unreadable-entry'); return
    }
    if (stat.isSymbolicLink()) {
      coverage.skippedLinkedEntries += 1; addReason(coverage, 'linked-entry'); return
    }
    if (stat.isDirectory()) {
      let names: string[]
      try { names = fs.readdirSync(current) } catch {
        coverage.unreadableEntries += 1; addReason(coverage, 'unreadable-entry'); return
      }
      for (const name of names) visit(path.join(current, name))
      return
    }
    if (!stat.isFile() || path.extname(current).toLowerCase() !== '.jsonl') return
    if (stat.mtimeMs < cutoffMs) { coverage.skippedOldFiles += 1; return }
    candidates.push({ filePath: current, size: stat.size, mtimeMs: stat.mtimeMs })
  }
  for (const root of roots) visit(root)
  return candidates.sort((a, b) => b.mtimeMs - a.mtimeMs || a.filePath.localeCompare(b.filePath))
}

function finiteNumber(value: unknown, minimum = 0): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= minimum ? value : undefined
}

function safeAttachment(value: unknown): SafeAttachment | 'discard' | 'invalid' {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 'discard'
  const row = value as Record<string, unknown>
  if (row.type !== 'attachment' || !row.attachment || typeof row.attachment !== 'object') return 'discard'
  const raw = row.attachment as Record<string, unknown>
  if (typeof raw.type !== 'string' || !/^hook_[a-z0-9_]+$/.test(raw.type)) return 'discard'
  if (typeof raw.hookName !== 'string' || !SAFE_NAME.test(raw.hookName)
    || typeof raw.hookEvent !== 'string' || !SAFE_NAME.test(raw.hookEvent)) return 'invalid'
  const durationMs = finiteNumber(raw.durationMs)
  const timeoutMs = finiteNumber(raw.timeoutMs, Number.EPSILON)
  const errorClass = typeof raw.errorClass === 'string' && SAFE_ERROR_CLASS.test(raw.errorClass)
    ? raw.errorClass : undefined
  const errorCode = typeof raw.errorCode === 'string' && SAFE_SYMBOL.test(raw.errorCode)
    ? raw.errorCode : undefined
  const undefinedIdentifier = typeof raw.undefinedIdentifier === 'string'
    && SAFE_SYMBOL.test(raw.undefinedIdentifier) ? raw.undefinedIdentifier : undefined
  return {
    type: raw.type, hookName: raw.hookName, hookEvent: raw.hookEvent,
    ...(durationMs !== undefined ? { durationMs } : {}),
    ...(typeof raw.timedOut === 'boolean' ? { timedOut: raw.timedOut } : {}),
    ...(timeoutMs !== undefined ? { timeoutMs } : {}), ...(errorClass ? { errorClass } : {}),
    ...(errorCode ? { errorCode } : {}), ...(undefinedIdentifier ? { undefinedIdentifier } : {}),
  }
}

function readAttachments(text: string, coverage: HookTranscriptCoverage): SafeAttachment[] {
  const out: SafeAttachment[] = []
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue
    let parsed: unknown
    try { parsed = JSON.parse(line) as unknown } catch {
      coverage.invalidJsonLines += 1; addReason(coverage, 'invalid-jsonl'); continue
    }
    const safe = safeAttachment(parsed)
    if (safe === 'invalid') {
      coverage.invalidAttachmentLines += 1; addReason(coverage, 'invalid-hook-attachment')
    } else if (safe !== 'discard') out.push(safe)
  }
  return out
}

function nearestRank(values: number[], percentile: number): number | undefined {
  if (values.length === 0) return undefined
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.max(0, Math.ceil(percentile * sorted.length) - 1)]
}

function runtimeMetrics(rows: SafeAttachment[]): HookRuntimeMetric[] {
  const groups = new Map<string, SafeAttachment[]>()
  for (const row of rows) {
    const key = `${row.hookName}\u0000${row.hookEvent}`
    groups.set(key, [...(groups.get(key) ?? []), row])
  }
  return [...groups.values()].map<HookRuntimeMetric>((group) => {
    const sample = group[0]
    const durations = group.flatMap((row) => row.durationMs === undefined ? [] : [row.durationMs])
    const timeouts = group.filter((row) => row.type === 'hook_cancelled'
      && row.timedOut === true && row.timeoutMs !== undefined).length
    const cancellations = group.filter((row) => row.type === 'hook_cancelled'
      && !(row.timedOut === true && row.timeoutMs !== undefined)).length
    const p50Ms = nearestRank(durations, 0.5); const p90Ms = nearestRank(durations, 0.9)
    return { rule: 'D7', kind: 'observed-hook-runtime', hookName: sample.hookName,
      hookEvent: sample.hookEvent, observedAttachments: group.length, durationSamples: durations.length,
      ...(p50Ms !== undefined ? { p50Ms } : {}), ...(p90Ms !== undefined ? { p90Ms } : {}),
      timeouts, cancellations }
  }).sort((a, b) => a.hookName.localeCompare(b.hookName) || a.hookEvent.localeCompare(b.hookEvent))
}

function runtimeErrors(rows: SafeAttachment[]): HookRuntimeError[] {
  const errors = rows.filter((row) => ['hook_error_during_execution', 'hook_non_blocking_error'].includes(row.type)
    && (row.errorClass || row.errorCode || row.undefinedIdentifier))
  const groups = new Map<string, { row: SafeAttachment; count: number }>()
  for (const row of errors) {
    const signature = [row.errorClass ?? 'HookError', row.errorCode ?? '', row.undefinedIdentifier ?? ''].join(':')
    const key = `${row.hookName}\u0000${row.hookEvent}\u0000${signature}`
    const current = groups.get(key); groups.set(key, { row, count: (current?.count ?? 0) + 1 })
  }
  return [...groups.values()].map<HookRuntimeError>(({ row, count }) => {
    const signature = [row.errorClass ?? 'HookError', row.errorCode ?? '', row.undefinedIdentifier ?? ''].join(':')
    return { rule: 'D10', kind: 'observed-hook-error', hookName: row.hookName,
      hookEvent: row.hookEvent, errorClass: row.errorClass ?? 'HookError',
      ...(row.errorCode ? { errorCode: row.errorCode } : {}),
      ...(row.undefinedIdentifier ? { undefinedIdentifier: row.undefinedIdentifier } : {}),
      fingerprint: createHash('sha256').update(signature).digest('hex').slice(0, 16), count }
  }).sort((a, b) => a.hookName.localeCompare(b.hookName) || a.fingerprint.localeCompare(b.fingerprint))
}

export function auditClaudeHookRuntime(input: HookRuntimeAuditInput): HookRuntimeAuditResult {
  const coverage = emptyCoverage()
  const cutoffMs = (input.nowMs ?? Date.now()) - input.limits.maxAgeDays * 86_400_000
  const candidates = collectCandidates(input.transcriptRoots, cutoffMs, coverage,
    Math.max(1_000, input.limits.maxFiles * 100))
  coverage.eligibleFiles = candidates.length
  const selected = candidates.slice(0, input.limits.maxFiles)
  coverage.skippedByFileCap = Math.max(0, candidates.length - selected.length)
  if (coverage.skippedByFileCap) addReason(coverage, 'file-cap')
  const attachments: SafeAttachment[] = []
  for (const candidate of selected) {
    if (candidate.size > input.limits.maxFileBytes) {
      coverage.skippedOversizeFiles += 1; addReason(coverage, 'file-byte-cap'); continue
    }
    if (coverage.scannedBytes + candidate.size > input.limits.maxTotalBytes) {
      coverage.skippedByTotalByteCap += 1; addReason(coverage, 'total-byte-cap'); continue
    }
    let bytes: Buffer
    try { bytes = fs.readFileSync(candidate.filePath) } catch {
      coverage.unreadableEntries += 1; addReason(coverage, 'unreadable-entry'); continue
    }
    if (bytes.byteLength > input.limits.maxFileBytes
      || coverage.scannedBytes + bytes.byteLength > input.limits.maxTotalBytes) {
      coverage.skippedOversizeFiles += 1; addReason(coverage, 'file-changed-during-scan'); continue
    }
    coverage.scannedFiles += 1; coverage.scannedBytes += bytes.byteLength
    attachments.push(...readAttachments(bytes.toString('utf8'), coverage))
  }
  return { runtimes: runtimeMetrics(attachments), errors: runtimeErrors(attachments), coverage }
}
