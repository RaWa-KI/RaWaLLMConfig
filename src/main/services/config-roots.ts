// config-roots.ts — SINGLE SOURCE der vier Config-Wurzeln fuer Scanner + Write-
// Gate. DEFAULT (kein RAWALLM_SANDBOX_ROOT): exakt die heutigen realen Pfade
// (homedir/.claude, homedir/.codex, .shared/.claude, Projekt-Root) — byte-/
// struktur-identisch zum M1-Stand, NICHTS aendert sich. SANDBOX (Env gesetzt):
// alle vier Wurzeln unter <sandbox> (Owner-M2-Verifikation: Scanner LESEN aus
// Sandbox, Writes sind bereits dorthin confined). Env wird bei JEDEM Aufruf
// gelesen (reine Funktion der Env) -> Tests setzen/loeschen Env und rufen direkt.
// KEINE Secret-Werte, KEIN Schreiben.
import { join, dirname } from 'node:path'
import fs from 'node:fs'
import type { ProviderRoot } from '@shared/contract-provider'
import { normalizePathForCompare } from '@shared/path-compare'
import { filterProviderRoots } from '../scan/integration-filter'
import {
  discoverConfigRoots,
  realRoots,
  sandboxRoot,
  sandboxRoots
} from './config-root-resolution'
import type { ConfigRoots } from './config-root-resolution'
export {
  discoverConfigRoots,
  setRootPrefsProvider,
  setRootExistsProvider
} from './config-root-resolution'
export type {
  ConfigRootDiscovery,
  ConfigRoots,
  RootDiscovery,
  RootSource
} from './config-root-resolution'

/**
 * Die vier Config-Wurzeln aufloesen. DEFAULT = reale Home-Pfade (M1 unveraendert);
 * mit RAWALLM_SANDBOX_ROOT = alle unter <sandbox>. Reine Funktion der Env.
 */
export function configRoots(): ConfigRoots {
  const sb = sandboxRoot()
  if (sb) return sandboxRoots(sb)
  const defaults = realRoots()
  const discovered = discoverConfigRoots()
  return {
    claudeHome: defaults.claudeHome,
    codexHome: defaults.codexHome,
    sharedClaude: discovered.sharedClaude.value,
    projectRoot: discovered.projectRoot.value
  }
}

/** Aktiver Sandbox-Root (oder null im Default). Fuer prefs-/archive-Confinement. */
export function activeSandboxRoot(): string | null {
  return sandboxRoot() ?? null
}

// ── Nutzer-Quellen-Provider (additiv, WP-C1) ────────────────────────────────
// Die persistierten Endnutzer-Quellen (source-store) speisen die Allowlist
// additiv hinter den vier Basis-Wurzeln. Default-Provider liefert [] -> die
// Basis-4 bleiben byte-identisch (kritisch fuer die Invarianz-Tests). Der echte
// Provider wird im Main beim Start gesetzt (Dependency-Injection, kein Import-
// Zyklus config-roots -> source-store).
let _userSourceRootsProvider: () => string[] = () => []
let _userSourceProviderRootsProvider: () => Record<string, string[]> = () => ({})

function pathKey(value: string): string {
  return normalizePathForCompare(value, process.platform)
}

/** Provider fuer die persistierten Nutzer-Quellen setzen (Main-Bootstrap). */
export function setUserSourceRootsProvider(fn: () => string[]): void {
  _userSourceRootsProvider = fn
}

export function setUserSourceProviderRootsProvider(fn: () => Record<string, string[]>): void {
  _userSourceProviderRootsProvider = fn
}

/** Die roots der aktiven Nutzer-Quellen (robust: Provider-Fehler -> []). */
export function userSourceRoots(): string[] {
  try {
    return _userSourceRootsProvider()
  } catch {
    return []
  }
}

export function userSourceRootsForProvider(providerId: string): string[] {
  try {
    return _userSourceProviderRootsProvider()[providerId] ?? []
  } catch {
    return []
  }
}

/**
 * Die Allowlist-Wurzeln: die vier Basis-Wurzeln (Reihenfolge stabil) plus additiv
 * die aktiven Nutzer-Quellen, plattformgerecht dedupliziert (Basis zuerst; eine
 * Quelle die schon Basis ist faellt weg). Ohne gesetzten Provider -> exakt die
 * vier Basis-Wurzeln (Invarianz).
 */
export function configRootList(): string[] {
  const base = configWatchRootList()
  const seen = new Set(base.map(pathKey))
  const out = [...base]
  for (const extra of userSourceRoots()) {
    const key = pathKey(extra || '')
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(extra)
  }
  return out
}

/**
 * Provider-Wurzeln eines Manifests zu absoluten Basis-Pfaden aufloesen (B-2,
 * datengetriebener Ersatz fuer die hartcodierten scanX()-Wurzeln). `fixedRoot`
 * (config-roots-unabhaengig, z.B. llm-scan GGUF_ROOT auf E:) gewinnt; sonst die
 * sandbox-aware `configRoots()[rootKey]` plus optionaler `subPath`. Reihenfolge =
 * Eingabe-Reihenfolge; die RAWALLM_SANDBOX_ROOT-Verlegung bleibt automatisch
 * erhalten (laeuft ueber configRoots(), keine Pfad-Duplikation). Reine Funktion.
 */
function appendUserRoots(baseRoots: string[], providerId?: string): string[] {
  if (!providerId) return baseRoots
  const seen = new Set(baseRoots.map(pathKey))
  const out = [...baseRoots]
  for (const extra of userSourceRootsForProvider(providerId)) {
    const key = pathKey(extra || '')
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(extra)
  }
  return out
}

/**
 * Schmale Root-Liste fuer den Live-Dateiwatcher. Nutzerquellen koennen sehr breit
 * sein (z.B. ein kompletter Projekte-Parent oder Modellordner) und duerfen den
 * App-Start nicht durch rekursives Beobachten blockieren.
 */
export function configWatchRootList(): string[] {
  const r = configRoots()
  return [r.claudeHome, r.codexHome, r.sharedClaude, r.projectRoot].filter((root): root is string => root !== null)
}

export function resolveRoots(roots: ProviderRoot[], providerId?: string): string[] {
  const r = configRoots()
  const baseRoots = roots.map((root) => {
    // fixedRoot gewinnt; sonst configRoots()[rootKey]; ist beides leer
    // (metadaten-only Cloud-Provider, Teil D) -> '' (Engine laeuft trotzdem,
    // die CustomCategory ignoriert die Basis).
    const base = root.fixedRoot ?? (root.rootKey ? r[root.rootKey] ?? '' : '')
    return root.subPath ? join(base, root.subPath) : base
  })
  const filteredRoots = filterProviderRoots(providerId, baseRoots)
  if (baseRoots.length > 0 && filteredRoots.length === 0) return []
  return appendUserRoots(filteredRoots, providerId)
}

// ── Workspace-Roots (F6: CLAUDE.md/AGENTS.md ueber ALLE WS einsammeln) ─────
// Read-only Liste der lokalen Workspace-Wurzeln: Projekte-Parent-Root + jeder
// in der Registry gelisteten WS (Feld path_local). NUR fuer den Instructions-
// Vergleich (CLAUDE.md/AGENTS.md), NICHT die Write-Allowlist (das bleibt
// configRootList()). Robust gegen fehlende/kaputte Registry -> leere Liste.

// Ein WS-Origin: absolute Wurzel + sprechendes Label fuer die UI-Spalte.
export interface WorkspaceRoot {
  root: string // absolute lokale WS-Wurzel
  label: string // sprechender Ursprung, z.B. "Projekte (Parent)" oder "RaWaLLMConfig"
}

function isLocalAbsolutePath(pathValue: string): boolean {
  return /^[a-zA-Z]:[\\/]/.test(pathValue) || pathValue.startsWith('/')
}

// Parent-Verzeichnis, das die Sub-WS-Ordner enthaelt (Default = real, Sandbox =
// Eltern von <sandbox>/project). Die Registry liegt unter <parent>/.shared/...
function projectsParent(): string | null {
  const sb = sandboxRoot()
  // Sandbox: project liegt unter <sandbox>/project -> Parent = <sandbox>.
  // Default: projectRoot ist .../Projekte/RaWaLLMConfig -> Parent = .../Projekte.
  return sb ?? discoverConfigRoots().workspaceParent.value
}

// Registry-Pfad (relativ zum Parent). Im Sandbox-Modus existiert sie i.d.R.
// nicht — dann faellt workspaceRoots() sauber auf nur den Parent zurueck.
function registryPath(parent: string): string {
  return join(parent, '.shared', '.claude', 'coordination', 'registry', 'workspaces.json')
}

// Registry lesen und WS path_local extrahieren. Nur lokale absolute Pfade
// (ssh://-Remote-WS werden uebersprungen). Bei Fehler: leere Liste + Log.
function readRegistryRoots(parent: string): WorkspaceRoot[] {
  const fp = registryPath(parent)
  let raw: string
  try {
    raw = fs.readFileSync(fp, 'utf8')
  } catch {
    // Registry fehlt (z.B. Sandbox) -> kein Crash, nur Parent verwenden.
    return []
  }
  try {
    const parsed = JSON.parse(raw) as { workspaces?: Record<string, { name?: string; path_local?: string }> }
    const ws = parsed.workspaces ?? {}
    const out: WorkspaceRoot[] = []
    for (const [key, def] of Object.entries(ws)) {
      const p = def?.path_local
      // Nur lokale absolute Pfade; ssh://-Remotes und leere Felder ueberspringen.
      if (!p || /^ssh:\/\//i.test(p) || !isLocalAbsolutePath(p)) continue
      out.push({ root: p, label: def?.name || key })
    }
    return out
  } catch (err) {
    console.error('[config-roots]', `registry parse: ${(err as Error).message.slice(0, 60)}`)
    return []
  }
}

/**
 * Lokale Workspace-Wurzeln fuer den Instructions-Vergleich (F6). Liefert den
 * Projekte-Parent-Root plus jede registrierte lokale WS-Wurzel (path_local).
 * Dedupliziert nach absolutem Pfad (Reihenfolge: Parent zuerst). Read-only;
 * fehlende/kaputte Registry -> nur Parent (kein Crash).
 */
export function workspaceRoots(): WorkspaceRoot[] {
  const parent = projectsParent()
  if (!parent) return []
  const out: WorkspaceRoot[] = [{ root: parent, label: 'Projekte (Parent)' }]
  const seen = new Set<string>([pathKey(parent)])
  for (const w of readRegistryRoots(parent)) {
    const key = pathKey(w.root)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(w)
  }
  return out
}
