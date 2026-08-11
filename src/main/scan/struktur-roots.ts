// Root-Definitionen und bekannte Tool-Home-Pfade fuer den Struktur-Scan.
import path from 'node:path'
import { normalizePathForCompare } from '@shared/path-compare'
import { configRoots, workspaceRoots } from '../services/config-roots'
import { kimiHome } from './manifests/kimi-cats'

// Bekannte Tool-Homes (HR16: Claude, Codex, Kimi, Grok und der gemeinsame
// .agents-Baum sind gleichwertige native Loader). Ein gleichnamiger Ordner in
// einem anderen Root ist parallel, kein Dup.
export const TOOL_HOME_DIRS = new Set(['.claude', '.codex', '.kimi-code', '.agents', '.grok'])
export const CONFIG_SUBDIRS = new Set(['skills', 'rules', 'hooks', 'agents', 'commands', 'plugins'])

export interface RootDef {
  label: string
  allowedTopLevel: ReadonlySet<string>
  warnTopLevel: ReadonlySet<string>
  knownNestedToolHomes: ReadonlySet<string>
  /**
   * Root ist der registrierte Workspace-Parent: JEDER direkte Unterordner ist
   * ein Workspace, dessen Tool-Homes und Config-Unterordner erwartet sind.
   * Der Struktur-Scan meldet sie damit als „ok/Erwartet" statt als Warnung —
   * vorher warnte er die normale WS-Struktur flaechendeckend an (F7).
   */
  workspaceParent?: boolean
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
    ...[roots.projectRoot, ...workspaceRoots().map(({ root }) => root)]
      .flatMap((root) => [...TOOL_HOME_DIRS].map((home) => path.join(root, home)))
  ].map(pathKey))

  return {
    [projekte]: {
      label: 'Projekte',
      allowedTopLevel: new Set<string>(),
      warnTopLevel: new Set([...TOOL_HOME_DIRS, ...CONFIG_SUBDIRS]),
      knownNestedToolHomes,
      // Der Projekte-Parent ist der registrierte Workspace-Parent: die
      // WS-Struktur darunter ist erwartet, kein Anomalie-Befund (F7).
      workspaceParent: true
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
    // HR16-Paritaet: ~/.kimi-code wird wie ~/.claude/~/.codex strukturell
    // geprueft. Erlaubt sind die Config-Unterordner plus die bekannten Laufzeit-/
    // Ablage-Ordner des Kimi-Loaders (nur Ordnernamen, keine Inhalts-Reads).
    [kimiHome()]: {
      label: '~/.kimi-code',
      allowedTopLevel: new Set([
        ...CONFIG_SUBDIRS,
        'bin',
        'credentials',
        'logs',
        'sessions',
        'telemetry',
        'updates',
        'user-history'
      ]),
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
