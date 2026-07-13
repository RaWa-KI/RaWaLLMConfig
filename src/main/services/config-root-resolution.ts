import fs from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

export interface ConfigRoots {
  claudeHome: string
  codexHome: string
  sharedClaude: string | null
  projectRoot: string | null
}

interface DefaultConfigRoots extends ConfigRoots {
  sharedClaude: string
  projectRoot: string
}

export type RootSource = 'sandbox' | 'prefs' | 'default' | 'none'
export interface RootDiscovery { value: string | null; source: RootSource }
export interface ConfigRootDiscovery {
  sharedClaude: RootDiscovery
  workspaceParent: RootDiscovery
  projectRoot: RootDiscovery
}

type RootPrefs = Partial<Record<'roots.sharedClaude' | 'roots.workspaceParent' | 'roots.projectRoot', string>>
type RootExists = (path: string) => boolean
let rootPrefsProvider: () => RootPrefs = () => ({})
let rootExists: RootExists = fs.existsSync

export function setRootPrefsProvider(provider: () => RootPrefs): void {
  rootPrefsProvider = provider
}

/** Test seam for absent defaults; production keeps node:fs existence checks. */
export function setRootExistsProvider(provider: RootExists): void {
  rootExists = provider
}

export function sandboxRoot(): string | undefined {
  const value = process.env.RAWALLM_SANDBOX_ROOT?.trim()
  return value || undefined
}

export function realRoots(): DefaultConfigRoots {
  const home = homedir()
  return {
    claudeHome: join(home, '.claude'),
    codexHome: join(home, '.codex'),
    sharedClaude: join(home, 'Desktop', 'Projekte', '.shared', '.claude'),
    projectRoot: join(home, 'Desktop', 'Projekte', 'RaWaLLMConfig')
  }
}

export function sandboxRoots(root: string): DefaultConfigRoots {
  return {
    claudeHome: join(root, '.claude'),
    codexHome: join(root, '.codex'),
    sharedClaude: join(root, '.shared', '.claude'),
    projectRoot: join(root, 'project')
  }
}

export function discoverRoot(preferred: string | null, defaultPath: string, exists: RootExists = fs.existsSync): RootDiscovery {
  if (preferred) return { value: preferred, source: 'prefs' }
  return exists(defaultPath)
    ? { value: defaultPath, source: 'default' }
    : { value: null, source: 'none' }
}

function prefRoot(key: keyof RootPrefs): string | null {
  return rootPrefsProvider()[key]?.trim() || null
}

export function discoverConfigRoots(): ConfigRootDiscovery {
  const sandbox = sandboxRoot()
  if (sandbox) return {
    sharedClaude: { value: join(sandbox, '.shared', '.claude'), source: 'sandbox' },
    workspaceParent: { value: sandbox, source: 'sandbox' },
    projectRoot: { value: join(sandbox, 'project'), source: 'sandbox' }
  }
  const defaults = realRoots()
  return {
    sharedClaude: discoverRoot(prefRoot('roots.sharedClaude'), defaults.sharedClaude, rootExists),
    workspaceParent: discoverRoot(prefRoot('roots.workspaceParent'), dirname(defaults.projectRoot), rootExists),
    projectRoot: discoverRoot(prefRoot('roots.projectRoot'), defaults.projectRoot, rootExists)
  }
}
