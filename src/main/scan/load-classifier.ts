// load-classifier.ts — Scanner-Wahrheit fuer Ladeverhalten + Token-Schaetzung.
import type { ConfigEntry, LoadMode } from '@shared/contract'
import { normalizePathForCompare, pathsEqual } from '@shared/path-compare'
import type { FrontmatterArtifact } from './frontmatter-schema'

const AVG_CHARS_PER_TOKEN = 4

type EntryFields = Record<string, string> | undefined

function baseName(filePath: string): string {
  const norm = filePath.replace(/\\/g, '/')
  return norm.slice(norm.lastIndexOf('/') + 1)
}

function hasSegment(filePath: string, segment: string, platform: string): boolean {
  const normalizedPath = normalizePathForCompare(filePath, platform)
  const normalizedSegment = normalizePathForCompare(segment, platform)
  return (`/${normalizedPath}/`).includes(`/${normalizedSegment}/`)
}

function hasField(fields: EntryFields, key: string): boolean {
  const needle = key.toLowerCase()
  if (!fields) return false
  if (Object.keys(fields).some((k) => k.toLowerCase() === needle)) return true
  return (fields.frontmatter ?? '').toLowerCase().split(/\s*,\s*/).includes(needle)
}

export function estimateTokens(text: string | undefined): number | undefined {
  if (text === undefined) return undefined
  return Math.ceil(text.length / AVG_CHARS_PER_TOKEN)
}

export function classifyLoadMode(
  filePath: string,
  fields?: EntryFields,
  kind: FrontmatterArtifact = 'generic',
  platform: string = process.platform,
): LoadMode {
  const base = baseName(filePath)
  if (['AGENTS.md', 'CLAUDE.md', 'CLAUDE.local.md'].some((name) => pathsEqual(base, name, platform))) return 'immer'
  if (kind === 'claude-skill' || kind === 'codex-skill' || hasSegment(filePath, 'skills', platform)) return 'bei-bedarf'
  if (kind === 'claude-agent' || kind === 'codex-agent' || hasSegment(filePath, 'agents', platform)) return 'bei-bedarf'
  if (kind === 'claude-rule' || hasSegment(filePath, 'rules', platform)) return hasField(fields, 'paths') ? 'bedingt' : 'immer'
  if (['settings.json', 'config.toml'].some((name) => pathsEqual(base, name, platform))) return 'immer'
  if (hasSegment(filePath, 'hooks', platform) || pathsEqual(base, 'hooks.json', platform)) return 'bei-bedarf'
  return 'unbekannt'
}

export function decorateConfigEntry(
  entry: ConfigEntry,
  text: string | undefined,
  kind: FrontmatterArtifact = 'generic',
): void {
  const tokens = estimateTokens(text)
  if (tokens !== undefined) entry.tokensEstimated = tokens
  entry.loadMode = classifyLoadMode(entry.path, entry.fields, kind)
}
