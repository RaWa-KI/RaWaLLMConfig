// frontmatter-meta.ts — kleine, wiederverwendbare Frontmatter-Anreicherung.
// Sie traegt nur Schluessel/Metadaten weiter, nie Secret-Werte.
import type { EntryStatus } from '@shared/contract'
import type { FrontmatterArtifact } from './frontmatter-schema'
import { validateFrontmatterKeys } from './frontmatter-schema'

const DISPLAY_KEYS = [
  'name',
  'description',
  'model',
  'allowed-tools',
  'tools',
  'paths',
  'globs',
  'shell',
  'disallowed-tools',
  'disable-model-invocation',
]

export function frontmatterFields(
  fm: Record<string, string>,
  keys: string[] = [],
  kind: FrontmatterArtifact = 'generic',
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const key of DISPLAY_KEYS) {
    if (fm[key]) out[key] = fm[key]
  }
  if (keys.length) out.frontmatter = keys.join(', ')
  const diagnostics = validateFrontmatterKeys(kind, keys)
  if (diagnostics.length) {
    out['Frontmatter-Hinweis'] = diagnostics
      .map((d) => d.suggestion ? `${d.key}: ${d.message} Nutze ${d.suggestion}.` : `${d.key}: ${d.message}`)
      .join(' ')
  }
  return out
}

export function ruleFrontmatterState(
  fm: Record<string, string>,
): { status?: EntryStatus; conflictReason?: string } {
  if (!fm.globs || fm.paths) return {}
  return {
    status: 'conflict',
    conflictReason: 'Frontmatter globs wird ignoriert; ohne paths laedt diese Rule bei jedem Start.',
  }
}
