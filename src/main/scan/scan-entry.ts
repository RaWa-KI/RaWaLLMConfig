// scan-entry.ts — gemeinsame ConfigEntry-Fabrik fuer Scanner-Hotpaths.
import type { ConfigEntry } from '@shared/contract'
import { mtimeSafe } from './scan-helpers'
import { extractSearchKeysFromText } from './content-index'
import type { FileSnapshot } from './file-read-once'
import { decorateConfigEntry } from './load-classifier'
import { inferFrontmatterArtifact, type FrontmatterArtifact } from './frontmatter-schema'

export function configEntry(
  id: string,
  name: string,
  fp: string,
  desc: string,
  fields?: Record<string, string>,
  code?: string,
  snap?: FileSnapshot | null,
  kind?: FrontmatterArtifact,
): ConfigEntry {
  const searchKeys = extractSearchKeysFromText(fp, snap?.text)
  const entry: ConfigEntry = {
    id,
    name,
    status: 'active',
    scope: 'global',
    path: fp,
    desc,
    updated: snap?.mtimeIso ?? mtimeSafe(fp),
    fields,
    code,
    ...(searchKeys.length ? { searchKeys } : {}),
  }
  decorateConfigEntry(entry, snap?.text, kind ?? inferFrontmatterArtifact(fp))
  return entry
}
