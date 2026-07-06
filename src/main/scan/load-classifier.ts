// load-classifier.ts — Scanner-Wahrheit fuer Ladeverhalten + Token-Schaetzung.
import type { ConfigEntry, LoadMode } from '@shared/contract'
import type { FrontmatterArtifact } from './frontmatter-schema'

const AVG_CHARS_PER_TOKEN = 4

type EntryFields = Record<string, string> | undefined

function baseName(filePath: string): string {
  const norm = filePath.replace(/\\/g, '/')
  return norm.slice(norm.lastIndexOf('/') + 1).toLowerCase()
}

function hasSegment(filePath: string, segment: string): boolean {
  return (`/${filePath.replace(/\\/g, '/').toLowerCase()}/`).includes(`/${segment}/`)
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
): LoadMode {
  const lower = filePath.replace(/\\/g, '/').toLowerCase()
  const base = baseName(lower)
  if (base === 'agents.md' || base === 'claude.md' || base === 'claude.local.md') return 'immer'
  if (kind === 'claude-skill' || kind === 'codex-skill' || hasSegment(lower, 'skills')) return 'bei-bedarf'
  if (kind === 'claude-agent' || kind === 'codex-agent' || hasSegment(lower, 'agents')) return 'bei-bedarf'
  if (kind === 'claude-rule' || hasSegment(lower, 'rules')) return hasField(fields, 'paths') ? 'bedingt' : 'immer'
  if (base === 'settings.json' || base === 'config.toml') return 'immer'
  if (hasSegment(lower, 'hooks') || base === 'hooks.json') return 'bei-bedarf'
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
