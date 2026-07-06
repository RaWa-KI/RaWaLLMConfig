// config-roots.ts — SINGLE SOURCE der vier Config-Wurzeln fuer Scanner + Write-
// Gate. DEFAULT (kein RAWALLM_SANDBOX_ROOT): exakt die heutigen realen Pfade
// (homedir/.claude, homedir/.codex, .shared/.claude, Projekt-Root) — byte-/
// struktur-identisch zum M1-Stand, NICHTS aendert sich. SANDBOX (Env gesetzt):
// alle vier Wurzeln unter <sandbox> (Owner-M2-Verifikation: Scanner LESEN aus
// Sandbox, Writes sind bereits dorthin confined). Env wird bei JEDEM Aufruf
// gelesen (reine Funktion der Env) -> Tests setzen/loeschen Env und rufen direkt.
// KEINE Secret-Werte, KEIN Schreiben.
import { homedir } from 'node:os'
import { join, dirname } from 'node:path'
import fs from 'node:fs'
import type { ProviderRoot } from '@shared/contract-provider'

// Die vier kanonischen Config-Wurzeln. claudeHome/codexHome sind die Tool-Home-
// Verzeichnisse; sharedClaude ist der Trunk; projectRoot ist dieser WS.
export interface ConfigRoots {
  claudeHome: string
  codexHome: string
  sharedClaude: string
  projectRoot: string
}

// Leere/whitespace-only Env als "nicht gesetzt" behandeln (gleiche Semantik wie
// write-mode.nonEmpty — Sandbox nur bei echtem Wert).
function sandboxRoot(): string | undefined {
  const v = process.env.RAWALLM_SANDBOX_ROOT
  if (!v) return undefined
  const s = v.trim()
  return s.length > 0 ? s : undefined
}

// Reale Wurzeln (Default) — exakt die heutigen Scanner-Hardcodes. Aenderung hier
// veraendert das M1-Lese-Ergebnis; daher unveraendert lassen.
function realRoots(): ConfigRoots {
  const home = homedir()
  return {
    claudeHome: join(home, '.claude'),
    codexHome: join(home, '.codex'),
    sharedClaude: join(home, 'Desktop', 'Projekte', '.shared', '.claude'),
    projectRoot: join(home, 'Desktop', 'Projekte', 'RaWaLLMConfig')
  }
}

// Sandbox-Wurzeln (Owner-M2). Layout 1:1 wie real, nur unter <sandbox>.
function sandboxRoots(root: string): ConfigRoots {
  return {
    claudeHome: join(root, '.claude'),
    codexHome: join(root, '.codex'),
    sharedClaude: join(root, '.shared', '.claude'),
    projectRoot: join(root, 'project')
  }
}

/**
 * Die vier Config-Wurzeln aufloesen. DEFAULT = reale Home-Pfade (M1 unveraendert);
 * mit RAWALLM_SANDBOX_ROOT = alle unter <sandbox>. Reine Funktion der Env.
 */
export function configRoots(): ConfigRoots {
  const sb = sandboxRoot()
  return sb ? sandboxRoots(sb) : realRoots()
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
 * die aktiven Nutzer-Quellen, dedupliziert (case-insensitiv, Basis zuerst; eine
 * Quelle die schon Basis ist faellt weg). Ohne gesetzten Provider -> exakt die
 * vier Basis-Wurzeln (Invarianz).
 */
export function configRootList(): string[] {
  const r = configRoots()
  const base = [r.claudeHome, r.codexHome, r.sharedClaude, r.projectRoot]
  const seen = new Set(base.map((p) => p.toLowerCase()))
  const out = [...base]
  for (const extra of userSourceRoots()) {
    const key = (extra || '').toLowerCase()
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
  const seen = new Set(baseRoots.map((p) => p.toLowerCase()))
  const out = [...baseRoots]
  for (const extra of userSourceRootsForProvider(providerId)) {
    const key = (extra || '').toLowerCase()
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(extra)
  }
  return out
}

export function resolveRoots(roots: ProviderRoot[], providerId?: string): string[] {
  const r = configRoots()
  const baseRoots = roots.map((root) => {
    // fixedRoot gewinnt; sonst configRoots()[rootKey]; ist beides leer
    // (metadaten-only Cloud-Provider, Teil D) -> '' (Engine laeuft trotzdem,
    // die CustomCategory ignoriert die Basis).
    const base = root.fixedRoot ?? (root.rootKey ? r[root.rootKey] : '')
    return root.subPath ? join(base, root.subPath) : base
  })
  return appendUserRoots(baseRoots, providerId)
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
function projectsParent(): string {
  const sb = sandboxRoot()
  // Sandbox: project liegt unter <sandbox>/project -> Parent = <sandbox>.
  // Default: projectRoot ist .../Projekte/RaWaLLMConfig -> Parent = .../Projekte.
  return sb ? sb : dirname(realRoots().projectRoot)
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
  const out: WorkspaceRoot[] = [{ root: parent, label: 'Projekte (Parent)' }]
  const seen = new Set<string>([parent.toLowerCase()])
  for (const w of readRegistryRoots(parent)) {
    const key = w.root.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(w)
  }
  return out
}
