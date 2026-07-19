// Additional same-family duplicate heuristics kept outside dedupe.ts for HR27.
import path from 'node:path'
import { normalizePathForCompare, pathsEqual } from '@shared/path-compare'

const ROOT_MARKERS = new Set(['.claude', '.codex', '.agents'])
const CAT_MARKERS = new Set(['agents', 'rules', 'skills', 'hooks', 'teams', 'plugins', 'instructions'])

export function sameFamilyDifferentRoot(
  aPath: string,
  bPath: string,
  platform: string = process.platform
): boolean {
  const a = normalizePathForCompare(aPath, platform)
  const b = normalizePathForCompare(bPath, platform)
  if (!a || !b || a === b) return false
  const aKey = rootKey(a, platform)
  const bKey = rootKey(b, platform)
  if (!aKey || !bKey || aKey === bKey) return false
  return pathsEqual(path.basename(a), path.basename(b), platform)
}

function rootKey(normPath: string, platform: string): string {
  const parts = normPath.split('/').filter(Boolean)
  const projectKey = keyAfter(parts, normalizePathForCompare('Projekte', platform))
  if (projectKey) return `project:${projectKey}`
  const rootMarkers = new Set([...ROOT_MARKERS].map((marker) => normalizePathForCompare(marker, platform)))
  const configKey = keyBeforeAny(parts, rootMarkers)
  if (configKey) return `config:${configKey}`
  const categoryMarkers = new Set([...CAT_MARKERS].map((marker) => normalizePathForCompare(marker, platform)))
  const catKey = keyBeforeAny(parts, categoryMarkers)
  if (catKey) return `category-root:${catKey}`
  return parts.length > 1 ? `top:${parts[0]}` : ''
}

function keyAfter(parts: string[], marker: string): string {
  const index = parts.findIndex((part) => part === marker)
  const next = index >= 0 ? parts[index + 1] : ''
  return next && next !== '.shared' ? next : ''
}

function keyBeforeAny(parts: string[], markers: Set<string>): string {
  const index = parts.findIndex((part) => markers.has(part))
  return index > 0 ? parts[index - 1] : ''
}
