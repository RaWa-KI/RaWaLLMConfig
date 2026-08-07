import fs from 'node:fs'
import { homedir } from 'node:os'
import { basename, join } from 'node:path'

export interface ConfigRoots {
  claudeHome: string
  codexHome: string
  sharedClaude: string | null
  projectRoot: string | null
}

// Sandbox-Shape: unter RAWALLM_SANDBOX_ROOT sind alle vier Wurzeln gesetzt.
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

export type RootPrefKey = 'roots.sharedClaude' | 'roots.workspaceParent' | 'roots.projectRoot'

// Marker-Key der einmaligen Legacy-Migration (B13): steht er in den Prefs,
// wird der Legacy-Seed nicht mehr angelegt (idempotent; Opt-out der Migration).
export const ROOTS_LEGACY_MIGRATION_KEY = 'roots.legacyMigration'

export type RootPrefs = Partial<Record<RootPrefKey | typeof ROOTS_LEGACY_MIGRATION_KEY, string>>
export type RootExists = (path: string) => boolean
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

// Die Tool-Homes sind der EINZIGE verbleibende Default: sie liegen fest unter
// homedir() und sind auf jedem Rechner gleich aufzuloesen. sharedClaude und
// projectRoot sind OPTIONAL (Prefs oder Legacy-Migration unten) — keine
// Festverdrahtung auf einen konkreten Rechneraufbau mehr (B13).
export interface ToolHomeRoots {
  claudeHome: string
  codexHome: string
}

export function realRoots(): ToolHomeRoots {
  const home = homedir()
  return {
    claudeHome: join(home, '.claude'),
    codexHome: join(home, '.codex')
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
  if (!defaultPath) return { value: null, source: 'none' }
  return exists(defaultPath)
    ? { value: defaultPath, source: 'default' }
    : { value: null, source: 'none' }
}

// sharedClaude meint die `.claude`-Ebene UNTER dem Shared-Ordner. Die
// Einstellungs-UI fragt aber nach dem „Gemeinsamen Konfigurationsordner" —
// Nutzer waehlen dort naturgemaess `<shared>` selbst (Owner-Befund 2026-08-07:
// Pref `...\.shared` liess sharedDataRoots eine Ebene zu hoch ableiten →
// leerer Changelog-Feed, falsche Referenz-Pfade). Beide Formen sind gueltig:
// zeigt der Wert nicht selbst auf `.claude` und existiert `<wert>/.claude`,
// wird auf die `.claude`-Ebene normalisiert.
export function normalizeSharedClaude(d: RootDiscovery, exists: RootExists): RootDiscovery {
  if (!d.value) return d
  if (basename(d.value) === '.claude') return d
  const child = join(d.value, '.claude')
  return exists(child) ? { value: child, source: d.source } : d
}

function prefRoot(key: RootPrefKey, prefs: RootPrefs): string | null {
  return prefs[key]?.trim() || null
}

// ── MIGRATIONS-CODE (B13, Review-Auflage P1) ───────────────────────────────
// EINZIGER verbleibender Ort der bisherigen Festverdrahtung auf den
// Rechneraufbau "Home/Desktop/Projekte/...". Dient ausschliesslich der
// einmaligen Migration bestehender Installationen: der Seed haelt deren
// bisherige Aufloesung von sharedClaude/projectRoot unveraendert, solange
// keine eigenen Prefs gesetzt sind. Neuinstallationen ohne diese Ordner
// erhalten 'none' und konfigurieren die optionalen Wurzeln in den Einstellungen.
export interface LegacyRootDefaults {
  sharedClaude: string
  workspaceParent: string
  projectRoot: string
}

export function legacyRootDefaults(home: string = homedir()): LegacyRootDefaults {
  const projectsParent = join(home, 'Desktop', 'Projekte')
  return {
    sharedClaude: join(projectsParent, '.shared', '.claude'),
    workspaceParent: projectsParent,
    projectRoot: join(projectsParent, 'RaWaLLMConfig')
  }
}

// Reiner Migrations-Seed: fuer jede ungesetzte Root-Pref den bisherigen
// Legacy-Pfad uebernehmen, sofern er auf dieser Installation existiert.
// Marker gesetzt -> kein Seed (Migration bereits gelaufen oder abgeschaltet).
export function legacyRootPrefsSeed(
  prefs: RootPrefs,
  exists: RootExists = rootExists
): Partial<Record<RootPrefKey, string>> {
  if (prefs[ROOTS_LEGACY_MIGRATION_KEY]) return {}
  const legacy = legacyRootDefaults()
  const candidates: Array<[RootPrefKey, string]> = [
    ['roots.sharedClaude', legacy.sharedClaude],
    ['roots.workspaceParent', legacy.workspaceParent],
    ['roots.projectRoot', legacy.projectRoot]
  ]
  const seed: Partial<Record<RootPrefKey, string>> = {}
  for (const [key, value] of candidates) {
    if (!prefs[key]?.trim() && exists(value)) seed[key] = value
  }
  return seed
}

// Explizite Injection (prefs/exists) bevorzugt — Test-Seam ohne Modul-Global
// (.claude/debugging.md 2026-07-28: Global kann zwischen Spec- und
// src-Instanz divergieren). Default bleibt der Produktions-Provider/-fs-Check.
export function discoverConfigRoots(
  prefs?: RootPrefs,
  exists: RootExists = rootExists
): ConfigRootDiscovery {
  const sandbox = sandboxRoot()
  if (sandbox) return {
    sharedClaude: { value: join(sandbox, '.shared', '.claude'), source: 'sandbox' },
    workspaceParent: { value: sandbox, source: 'sandbox' },
    projectRoot: { value: join(sandbox, 'project'), source: 'sandbox' }
  }
  // Lazy, idempotente Migration (B13): ungesetzte optionale Wurzeln fallen auf
  // die bisherige Aufloesung zurueck, solange deren Pfade hier existieren.
  const effectivePrefs = prefs ?? rootPrefsProvider()
  const seed = legacyRootPrefsSeed(effectivePrefs, exists)
  return {
    sharedClaude: normalizeSharedClaude(discoverRoot(prefRoot('roots.sharedClaude', effectivePrefs), seed['roots.sharedClaude'] ?? '', exists), exists),
    workspaceParent: discoverRoot(prefRoot('roots.workspaceParent', effectivePrefs), seed['roots.workspaceParent'] ?? '', exists),
    projectRoot: discoverRoot(prefRoot('roots.projectRoot', effectivePrefs), seed['roots.projectRoot'] ?? '', exists)
  }
}
