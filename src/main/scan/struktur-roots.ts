// Root-Definitionen und bekannte Tool-Home-Pfade fuer den Struktur-Scan.
import path from 'node:path'
import { normalizePathForCompare } from '@shared/path-compare'
import { configRoots, workspaceRoots } from '../services/config-roots'

export const TOOL_HOME_DIRS = new Set(['.claude', '.codex'])
export const CONFIG_SUBDIRS = new Set(['skills', 'rules', 'hooks', 'agents', 'commands', 'plugins'])

export interface RootDef {
  label: string
  allowedTopLevel: ReadonlySet<string>
  warnTopLevel: ReadonlySet<string>
  knownNestedToolHomes: ReadonlySet<string>
}

function pathKey(value: string): string {
  return normalizePathForCompare(value, process.platform)
}

export function buildRootDefs(): Record<string, RootDef> {
  const roots = configRoots()
  if (!roots.projectRoot || !roots.sharedClaude) return {}
  const projekte = path.dirname(roots.projectRoot)
  const knownNestedToolHomes = new Set([
    roots.sharedClaude,
    path.join(roots.projectRoot, '.claude'),
    path.join(roots.projectRoot, '.codex'),
    ...workspaceRoots().flatMap(({ root }) => [
      path.join(root, '.claude'),
      path.join(root, '.codex')
    ])
  ].map(pathKey))

  return {
    [projekte]: {
      label: 'Projekte',
      allowedTopLevel: new Set<string>(),
      warnTopLevel: new Set([...TOOL_HOME_DIRS, ...CONFIG_SUBDIRS]),
      knownNestedToolHomes
    },
    [roots.claudeHome]: {
      label: '~/.claude',
      allowedTopLevel: new Set([...CONFIG_SUBDIRS]),
      warnTopLevel: new Set<string>(),
      knownNestedToolHomes: new Set<string>()
    },
    [roots.codexHome]: {
      label: '~/.codex',
      allowedTopLevel: new Set([...CONFIG_SUBDIRS, 'instructions']),
      warnTopLevel: new Set<string>(),
      knownNestedToolHomes: new Set<string>()
    },
    [roots.sharedClaude]: {
      label: '.shared/.claude',
      allowedTopLevel: new Set([...CONFIG_SUBDIRS, 'coordination', 'references', 'tools']),
      warnTopLevel: new Set<string>(),
      knownNestedToolHomes: new Set<string>()
    }
  }
}
