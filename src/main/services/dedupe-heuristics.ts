// Additional same-family duplicate heuristics kept outside dedupe.ts for HR27.
import path from 'node:path'

const ROOT_MARKERS = new Set(['.claude', '.codex', '.agents'])
const CAT_MARKERS = new Set(['agents', 'rules', 'skills', 'hooks', 'teams', 'plugins', 'instructions'])

export function sameFamilyDifferentRoot(aPath: string, bPath: string): boolean {
  const a = normalizePath(aPath)
  const b = normalizePath(bPath)
  if (!a || !b || a === b) return false
  const aKey = rootKey(a)
  const bKey = rootKey(b)
  if (!aKey || !bKey || aKey === bKey) return false
  return path.basename(a).toLowerCase() === path.basename(b).toLowerCase()
}

function rootKey(normPath: string): string {
  const parts = normPath.split('/').filter(Boolean)
  const projectKey = keyAfter(parts, 'projekte')
  if (projectKey) return `project:${projectKey}`
  const configKey = keyBeforeAny(parts, ROOT_MARKERS)
  if (configKey) return `config:${configKey}`
  const catKey = keyBeforeAny(parts, CAT_MARKERS)
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

function normalizePath(rawPath: string): string {
  return rawPath.replace(/\\/g, '/').toLowerCase()
}
