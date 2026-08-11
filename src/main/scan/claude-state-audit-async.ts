// claude-state-audit-async.ts — D2-Temp-Cache-Walk sync/async mit Dirent-Fast-Path.
import fs from 'node:fs'
import path from 'node:path'
import type { ClaudeDoctorContext, DoctorFinding, DoctorMarketplaceSource } from './claude-doctor-context'
import { yieldToEventLoop } from '../lib/yield-loop'

export interface StateAuditIo {
  readdir(filePath: string): string[]
  lstat(filePath: string): fs.Stats
  readdirWithTypes?(filePath: string): fs.Dirent[]
}
interface AsyncStateAuditIo {
  readdir(filePath: string): string[] | Promise<string[]>
  lstat(filePath: string): fs.Stats | Promise<fs.Stats>
  readdirWithTypes?(filePath: string): fs.Dirent[] | Promise<fs.Dirent[]>
  yieldNow?: () => Promise<void>
}
interface TempEntry { name: string; dirent?: fs.Dirent }
interface EntryInfo { link: boolean; directory: boolean; file: boolean; size: number }
interface TempCollection { paths: string[]; incomplete: boolean; errorCount: number; skippedReparse: number }
interface TempMeasure { fileCount: number; bytes: number; incomplete: boolean; errorCount: number }

const DEFAULT_IO: StateAuditIo = {
  readdir: (filePath) => fs.readdirSync(filePath), lstat: (filePath) => fs.lstatSync(filePath),
  readdirWithTypes: (filePath) => fs.readdirSync(filePath, { withFileTypes: true }),
}
const DEFAULT_ASYNC_IO: AsyncStateAuditIo = {
  readdir: (filePath) => fs.promises.readdir(filePath), lstat: (filePath) => fs.promises.lstat(filePath),
  readdirWithTypes: (filePath) => fs.promises.readdir(filePath, { withFileTypes: true }),
}
const ASYNC_YIELD_BUDGET = 128

function sorted(entries: TempEntry[], reverse = false): TempEntry[] {
  entries.sort((left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : 0)
  return reverse ? entries.reverse() : entries
}
function entriesSync(filePath: string, io: StateAuditIo, reverse = false): TempEntry[] {
  const dirents = io.readdirWithTypes?.(filePath)
  return sorted(dirents ? dirents.map((dirent) => ({ name: dirent.name, dirent }))
    : io.readdir(filePath).map((name) => ({ name })), reverse)
}
async function entriesAsync(filePath: string, io: AsyncStateAuditIo,
  reverse = false): Promise<TempEntry[]> {
  const dirents = io.readdirWithTypes ? await io.readdirWithTypes(filePath) : undefined
  return sorted(dirents ? dirents.map((dirent) => ({ name: dirent.name, dirent }))
    : (await io.readdir(filePath)).map((name) => ({ name })), reverse)
}
function infoFromStat(stat: fs.Stats): EntryInfo {
  return { link: stat.isSymbolicLink(), directory: stat.isDirectory(),
    file: stat.isFile(), size: stat.size }
}
function inspectSync(entry: TempEntry, filePath: string, io: StateAuditIo,
  needSize: boolean): EntryInfo {
  const dirent = entry.dirent
  if (dirent?.isSymbolicLink()) return { link: true, directory: false, file: false, size: 0 }
  if (dirent?.isDirectory()) return { link: false, directory: true, file: false, size: 0 }
  if (dirent?.isFile() && !needSize) return { link: false, directory: false, file: true, size: 0 }
  return infoFromStat(io.lstat(filePath))
}
async function inspectAsync(entry: TempEntry, filePath: string, io: AsyncStateAuditIo,
  needSize: boolean): Promise<EntryInfo> {
  const dirent = entry.dirent
  if (dirent?.isSymbolicLink()) return { link: true, directory: false, file: false, size: 0 }
  if (dirent?.isDirectory()) return { link: false, directory: true, file: false, size: 0 }
  if (dirent?.isFile() && !needSize) return { link: false, directory: false, file: true, size: 0 }
  return infoFromStat(await io.lstat(filePath))
}
function localReference(location: string | undefined, sourceKind: string, base: string): string {
  if (!location || /^[a-z][a-z0-9+.-]*:\/\//i.test(location)) return ''
  if (!path.isAbsolute(location) && sourceKind !== 'directory') return ''
  const absolute = path.isAbsolute(location) ? path.normalize(location) : path.resolve(base, location)
  return process.platform === 'win32' ? absolute.toLowerCase() : absolute
}
function addReferences(out: Set<string>, entries: DoctorMarketplaceSource[], base: string): void {
  for (const entry of entries) {
    const key = localReference(entry.location, entry.sourceKind, base)
    if (key) out.add(key)
  }
}
function marketplaceReferences(context: ClaudeDoctorContext): Set<string> {
  const out = new Set<string>()
  addReferences(out, context.knownMarketplaces, path.dirname(context.paths.knownMarketplacesJson))
  for (const layer of context.settings.layers) {
    const settingsPath = context.paths.settings[layer.layer]
    if (settingsPath) addReferences(out, layer.extraKnownMarketplaces, path.dirname(settingsPath))
  }
  return out
}
function pathKey(filePath: string): string {
  const normalized = path.normalize(filePath)
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized
}
function isMissing(error: unknown): boolean {
  return !!error && typeof error === 'object' && 'code' in error
    && (error as { code?: string }).code === 'ENOENT'
}
function yieldCheckpoint(yieldNow: () => Promise<void>): () => Promise<void> {
  let remaining = ASYNC_YIELD_BUDGET
  return async () => {
    remaining -= 1
    if (remaining > 0) return
    remaining = ASYNC_YIELD_BUDGET
    await yieldNow()
  }
}

function collectSync(context: ClaudeDoctorContext, referenced: Set<string>, io: StateAuditIo): TempCollection {
  const result: TempCollection = { paths: [], incomplete: false, errorCount: 0, skippedReparse: 0 }
  const seen = new Set<string>()
  for (const root of context.paths.tempCandidates) {
    const pending = [root]; let traversed = 0
    while (pending.length) {
      const current = pending.pop() as string; const currentKey = pathKey(current)
      if (seen.has(currentKey)) continue
      seen.add(currentKey)
      let entries: TempEntry[]
      try { entries = entriesSync(current, io, true) } catch (error) {
        if (!isMissing(error) || current !== root) { result.incomplete = true; result.errorCount += 1 }
        continue
      }
      for (const entry of entries) {
        if (traversed >= context.limits.tempCandidates.maxEntriesPerCandidate) {
          result.incomplete = true; pending.length = 0; break
        }
        traversed += 1
        const candidate = path.join(current, entry.name); let info: EntryInfo
        try { info = inspectSync(entry, candidate, io, false) } catch {
          result.incomplete = true; result.errorCount += 1; continue
        }
        if (info.link) {
          if (/^temp_git_/.test(entry.name)) { result.incomplete = true; result.skippedReparse += 1 }
          continue
        }
        if (!info.directory) continue
        if (!/^temp_git_/.test(entry.name)) { pending.push(candidate); continue }
        if (referenced.has(pathKey(candidate))) continue
        if (result.paths.length >= context.limits.tempCandidates.maxCandidates) result.incomplete = true
        else result.paths.push(candidate)
      }
    }
  }
  result.paths.sort()
  return result
}

async function collectAsync(context: ClaudeDoctorContext, referenced: Set<string>,
  io: AsyncStateAuditIo, checkpoint: () => Promise<void>): Promise<TempCollection> {
  const result: TempCollection = { paths: [], incomplete: false, errorCount: 0, skippedReparse: 0 }
  const seen = new Set<string>()
  for (const root of context.paths.tempCandidates) {
    const pending = [root]; let traversed = 0
    while (pending.length) {
      const current = pending.pop() as string; const currentKey = pathKey(current)
      if (seen.has(currentKey)) continue
      seen.add(currentKey)
      let entries: TempEntry[]
      try { entries = await entriesAsync(current, io, true) } catch (error) {
        if (!isMissing(error) || current !== root) { result.incomplete = true; result.errorCount += 1 }
        continue
      }
      for (const entry of entries) {
        if (traversed >= context.limits.tempCandidates.maxEntriesPerCandidate) {
          result.incomplete = true; pending.length = 0; break
        }
        traversed += 1; await checkpoint()
        const candidate = path.join(current, entry.name); let info: EntryInfo
        try { info = await inspectAsync(entry, candidate, io, false) } catch {
          result.incomplete = true; result.errorCount += 1; continue
        }
        if (info.link) {
          if (/^temp_git_/.test(entry.name)) { result.incomplete = true; result.skippedReparse += 1 }
          continue
        }
        if (!info.directory) continue
        if (!/^temp_git_/.test(entry.name)) { pending.push(candidate); continue }
        if (referenced.has(pathKey(candidate))) continue
        if (result.paths.length >= context.limits.tempCandidates.maxCandidates) result.incomplete = true
        else result.paths.push(candidate)
      }
    }
  }
  result.paths.sort()
  return result
}

function addMeasuredFile(result: TempMeasure, size: number, maxBytes: number): boolean {
  result.fileCount += 1
  if (result.bytes + size <= maxBytes) { result.bytes += size; return false }
  result.bytes = maxBytes; result.incomplete = true
  return true
}
function measureSync(root: string, context: ClaudeDoctorContext, io: StateAuditIo): TempMeasure {
  const cap = context.limits.tempCandidates
  const result: TempMeasure = { fileCount: 0, bytes: 0, incomplete: false, errorCount: 0 }
  const pending = [root]; let entryCount = 0; let halted = false
  while (pending.length && !halted) {
    const current = pending.pop() as string; let entries: TempEntry[]
    try { entries = entriesSync(current, io) } catch {
      result.incomplete = true; result.errorCount += 1; continue
    }
    for (const entry of entries) {
      if (entryCount >= cap.maxEntriesPerCandidate) { result.incomplete = true; halted = true; break }
      const child = path.join(current, entry.name); let info: EntryInfo
      try { info = inspectSync(entry, child, io, true) } catch {
        result.incomplete = true; result.errorCount += 1; continue
      }
      entryCount += 1
      if (info.link) { result.incomplete = true; continue }
      if (info.directory) { pending.push(child); continue }
      if (info.file && addMeasuredFile(result, info.size, cap.maxBytesPerCandidate)) { halted = true; break }
    }
  }
  return result
}

async function measureAsync(root: string, context: ClaudeDoctorContext, io: AsyncStateAuditIo,
  checkpoint: () => Promise<void>): Promise<TempMeasure> {
  const cap = context.limits.tempCandidates
  const result: TempMeasure = { fileCount: 0, bytes: 0, incomplete: false, errorCount: 0 }
  const pending = [root]; let entryCount = 0; let halted = false
  while (pending.length && !halted) {
    const current = pending.pop() as string; let entries: TempEntry[]
    try { entries = await entriesAsync(current, io) } catch {
      result.incomplete = true; result.errorCount += 1; continue
    }
    for (const entry of entries) {
      if (entryCount >= cap.maxEntriesPerCandidate) { result.incomplete = true; halted = true; break }
      await checkpoint()
      const child = path.join(current, entry.name); let info: EntryInfo
      try { info = await inspectAsync(entry, child, io, true) } catch {
        result.incomplete = true; result.errorCount += 1; continue
      }
      entryCount += 1
      if (info.link) { result.incomplete = true; continue }
      if (info.directory) { pending.push(child); continue }
      if (info.file && addMeasuredFile(result, info.size, cap.maxBytesPerCandidate)) { halted = true; break }
    }
  }
  return result
}

function finding(context: ClaudeDoctorContext, collection: TempCollection,
  measure: TempMeasure, index: number): DoctorFinding {
  return { rule: 'D2', kind: 'orphan-temp-git-cache', severity: measure.incomplete ? 'warning' : 'info',
    source: { kind: 'known-marketplaces', basename: path.basename(context.paths.knownMarketplacesJson) },
    evidence: [{ key: 'candidateOrdinal', value: index + 1 },
      { key: 'fileCount', value: measure.fileCount }, { key: 'bytes', value: measure.bytes },
      { key: 'incomplete', value: measure.incomplete || collection.incomplete }] }
}
function incompleteFinding(context: ClaudeDoctorContext, collection: TempCollection): DoctorFinding {
  return { rule: 'D2', kind: 'temp-cache-scan-incomplete', severity: 'warning',
    source: { kind: 'known-marketplaces', basename: path.basename(context.paths.knownMarketplacesJson) },
    evidence: [{ key: 'incomplete', value: true }, { key: 'errorCount', value: collection.errorCount },
      { key: 'skippedReparse', value: collection.skippedReparse }] }
}

export function auditTempGitCache(context: ClaudeDoctorContext,
  io: StateAuditIo = DEFAULT_IO): DoctorFinding[] {
  const collection = collectSync(context, marketplaceReferences(context), io)
  const findings = collection.paths.map((candidate, index) =>
    finding(context, collection, measureSync(candidate, context, io), index))
  if (collection.incomplete) findings.push(incompleteFinding(context, collection))
  return findings
}

export async function auditTempGitCacheAsync(context: ClaudeDoctorContext,
  io: AsyncStateAuditIo = DEFAULT_ASYNC_IO): Promise<DoctorFinding[]> {
  const checkpoint = yieldCheckpoint(io.yieldNow ?? yieldToEventLoop)
  const collection = await collectAsync(context, marketplaceReferences(context), io, checkpoint)
  const findings: DoctorFinding[] = []
  for (const [index, candidate] of collection.paths.entries()) {
    findings.push(finding(context, collection, await measureAsync(candidate, context, io, checkpoint), index))
  }
  if (collection.incomplete) findings.push(incompleteFinding(context, collection))
  return findings
}
