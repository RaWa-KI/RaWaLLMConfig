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

// WP-9/B12: Den paths-WERT bewerten, nicht nur die Existenz. Breit heisst:
// Alles-Glob (**/*) oder Endungs-Globs ganz ohne Verzeichnis-Anker (*.ts) —
// das matcht praktisch jede Datei und ist damit kein Token-Filter. Globs mit
// Slash (src/**/*.ts, auch **/*.ts) gelten als verzeichnis-gebunden = eng.
// Spiegel der gleichnamigen Logik in renderer/compare/load-semantics.ts.
const ALL_MATCH_GLOBS = new Set(['*', '**', '**/*', '**/*.*', '*.*'])

function isBroadPaths(fields: EntryFields): boolean {
  if (!fields) return false
  const key = Object.keys(fields).find((k) => k.toLowerCase() === 'paths')
  const globs = (key ? fields[key] : '')
    .split(/[,;]+/)
    .map((g) => g.trim().replace(/^['"[]+|['"\]]+$/g, ''))
    .filter(Boolean)
  return globs.length > 0 && globs.every((g) => ALL_MATCH_GLOBS.has(g) || !g.includes('/'))
}

// WP-9/B12: Userglobal-Heuristik (read-only, kein fs) — nur Instanzen direkt
// unter dem Home-Config-Root (~/.claude, ~/.codex, ~/.kimi-code; Tilde- oder
// users|home-Schreibweise) laden bei JEDEM Tool-Start. Workspace-Instanzen
// derselben Basenames laden nur projektgebunden.
const HOME_CONFIG_ROOT_RX = /(^|\/)(~|users\/[^/]+|home\/[^/]+)\/(\.claude|\.codex|\.kimi-code)(\/|$)/i

function isUserglobalPath(filePath: string): boolean {
  return HOME_CONFIG_ROOT_RX.test(filePath.replace(/\\/g, '/'))
}

function estimateTokens(text: string | undefined): number | undefined {
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
  if (['AGENTS.md', 'CLAUDE.md', 'CLAUDE.local.md'].some((name) => pathsEqual(base, name, platform))) {
    // WP-9/B12: Der Basename allein reicht nicht — nur USERGLOBALE Instanzen
    // laden bei jedem Start; Workspace-Instanzen laden projektgebunden
    // ('bedingt'; die feinere 'beim Arbeiten hier'-Semantik liefert der
    // Renderer via classifyLoad, LoadMode kennt keinen solchen Wert).
    return isUserglobalPath(filePath) ? 'immer' : 'bedingt'
  }
  if (kind === 'claude-skill' || kind === 'codex-skill' || hasSegment(filePath, 'skills', platform)) return 'bei-bedarf'
  if (kind === 'claude-agent' || kind === 'codex-agent' || hasSegment(filePath, 'agents', platform)) return 'bei-bedarf'
  if (kind === 'claude-rule' || hasSegment(filePath, 'rules', platform)) {
    if (!hasField(fields, 'paths')) return 'immer'
    return isBroadPaths(fields) ? 'immer' : 'bedingt'
  }
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
