import type { AppData, Category, ConfigEntry, Scope } from '@shared/contract'
import type { CompareCandidate } from '@shared/contract-compare'

export type SameFileStatus = 'ready' | 'partial' | 'ambiguous'

export interface SameFileGroup {
  basename: string
  status: SameFileStatus
  candidates: CompareCandidate[]
}

interface CandidateSeed {
  basename: string
  candidate: CompareCandidate
}

const COMMON_FILES = ['AGENTS.md', 'CLAUDE.md', 'settings.json']

export function buildSameFileGroups(input: AppData | Category[] | null | undefined): SameFileGroup[] {
  const seeds = collectSeeds(input)
  const byName = new Map<string, CandidateSeed[]>()
  for (const seed of seeds) {
    const list = byName.get(seed.basename) ?? []
    list.push(seed)
    byName.set(seed.basename, list)
  }
  return [...byName.entries()]
    .filter(([basename, items]) => items.length >= 2 || COMMON_FILES.includes(basename))
    .map(([basename, items]) => toGroup(basename, items))
    .sort(sortGroups)
}

function collectSeeds(input: AppData | Category[] | null | undefined): CandidateSeed[] {
  const categories = Array.isArray(input)
    ? input
    : Object.values(input?.data ?? {}).flatMap((family) => family.categories)
  return categories.flatMap((cat) => cat.entries.map((entry) => toSeed(entry)).filter(isSeed))
}

function toSeed(entry: ConfigEntry): CandidateSeed | null {
  if (!entry.path) return null
  const basename = basenameOf(entry.path || entry.name)
  if (!basename) return null
  const origin = everydayOrigin(entry)
  return {
    basename,
    candidate: {
      id: `${entry.id}:${entry.path}`,
      path: entry.path,
      label: basename,
      origin,
      secret: basename.toLowerCase() === 'settings.json' ? true : undefined
    }
  }
}

function toGroup(basename: string, items: CandidateSeed[]): SameFileGroup {
  const candidates = uniqueCandidates(items.map((item) => item.candidate))
  const ambiguous = hasDuplicatePlace(candidates)
  const status: SameFileStatus = ambiguous ? 'ambiguous' : candidates.length >= 2 ? 'ready' : 'partial'
  return { basename, status, candidates }
}

function uniqueCandidates(candidates: CompareCandidate[]): CompareCandidate[] {
  const seen = new Set<string>()
  return candidates.filter((candidate) => {
    const key = `${candidate.path}::${candidate.origin ?? ''}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function hasDuplicatePlace(candidates: CompareCandidate[]): boolean {
  const places = new Set<string>()
  for (const candidate of candidates) {
    const place = candidate.origin ?? '__unknown__'
    if (places.has(place)) return true
    places.add(place)
  }
  return false
}

function sortGroups(a: SameFileGroup, b: SameFileGroup): number {
  return groupRank(a) - groupRank(b) || a.basename.localeCompare(b.basename, 'de')
}

function groupRank(group: SameFileGroup): number {
  const commonIndex = COMMON_FILES.indexOf(group.basename)
  return commonIndex >= 0 ? commonIndex : COMMON_FILES.length + (group.status === 'ready' ? 0 : 1)
}

function everydayOrigin(entry: ConfigEntry): string | undefined {
  if (entry.scope === 'global' || looksPersonal(entry.origin)) return 'Persönlich'
  if (entry.scope === 'shared' || looksShared(entry.origin)) return 'Geteilt'
  if (entry.scope === 'project') return 'Workspace'
  if (entry.scope === 'local') return 'Lokal'
  return placeFromScope(entry.scope)
}

function placeFromScope(scope: Scope): string | undefined {
  return scope === 'managed' ? undefined : undefined
}

function looksPersonal(origin?: string): boolean {
  return Boolean(origin && /~\/\.|\\Users\\|\.codex|\.claude|\.agents/i.test(origin))
}

function looksShared(origin?: string): boolean {
  return Boolean(origin && /shared|geteilt|\.shared/i.test(origin))
}

function basenameOf(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? ''
}

function isSeed(seed: CandidateSeed | null): seed is CandidateSeed {
  return seed !== null
}
