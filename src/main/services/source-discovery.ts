// source-discovery.ts — Auto-Discovery der Standard-Config-Homes (OSS Teil C).
// Read-only Existenz-Pruefung der bekannten Provider-Ordner (~/.claude, ~/.codex,
// ~/.kimi-code, ~/.ollama, LM-Studio-Standardpfad). Liefert NUR existierende Homes als
// DiscoveryHit zurueck (noch nicht persistiert — der Nutzer bestaetigt im
// Onboarding). NUR Pfad/Metadaten, NIE Inhalt lesen, NIE ein Secret. Sandbox-
// aware ueber RAWALLM_SANDBOX_ROOT, damit Tests deterministisch ueber home-
// Injektion laufen. providerId zeigt stets auf ein providerRegistry()-Manifest
// (Bestands-ids: claude/codex/local/shared/cloud) — Ollama/LM-Studio -> 'local'.
// WP-6 (B8): Basis-Roots (configRoots()) werden herausgefiltert — sie liest der
// Scanner ohnehin, ein Uebernahme-Vorschlag waere nutzlos und verwirrend.
import { homedir } from 'node:os'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import type { DiscoveryHit } from '@shared/contract-sources'
import { normalizePathForCompare } from '@shared/path-compare'
import { configRoots } from './config-roots'

// Ein Discovery-Kandidat: relativer Unterpfad ab home + Provider-Zuordnung +
// sprechendes Label. root wird erst beim Scan zu join(home, subPath) aufgeloest.
interface Candidate {
  subPath: string
  providerId: string
  label: string
}

// Standard-Homes. NUR Standard-Pfade — KEIN Tiefscan konfigurierter Custom-Dirs
// (Owner-Entscheid: nur Standard-Ordner). LM Studio Windows-Standard = ~/.lmstudio.
const CANDIDATES: readonly Candidate[] = [
  { subPath: '.claude', providerId: 'claude', label: 'Claude (~/.claude)' },
  { subPath: '.codex', providerId: 'codex', label: 'Codex (~/.codex)' },
  // HR16-Paritaet: Claude, Codex und Kimi sind gleichwertige native Loader.
  // providerId 'kimi' zeigt auf kimi.manifest (providerRegistry()).
  { subPath: '.kimi-code', providerId: 'kimi', label: 'Kimi (~/.kimi-code)' },
  { subPath: '.ollama', providerId: 'local', label: 'Ollama (~/.ollama)' },
  { subPath: '.lmstudio', providerId: 'local', label: 'LM Studio (~/.lmstudio)' }
]

// Leere/whitespace-only Env als "nicht gesetzt" behandeln (gleiche Semantik wie
// config-roots.sandboxRoot — Sandbox nur bei echtem Wert).
function sandboxRoot(): string | undefined {
  const v = process.env.RAWALLM_SANDBOX_ROOT
  if (!v) return undefined
  const s = v.trim()
  return s.length > 0 ? s : undefined
}

// home-Basis aufloesen: explizites opts.home gewinnt (Test-Injektion), sonst
// RAWALLM_SANDBOX_ROOT (deterministische Sandbox), sonst das reale Home.
function resolveHome(optHome?: string): string {
  if (optHome && optHome.trim().length > 0) return optHome
  return sandboxRoot() ?? homedir()
}

// Plattformgerechter Vergleichsschluessel (gleiches Muster wie config-roots
// pathKey: normalizePathForCompare + process.platform).
function pathKey(value: string): string {
  return normalizePathForCompare(value, process.platform)
}

// WP-6 (B8): Die Basis-Roots (configRoots(): claudeHome, codexHome, sharedClaude,
// projectRoot) liest der Scanner immer — sie duerfen NICHT als zusaetzliche
// Quelle vorgeschlagen werden. Null-Wurzeln (nicht konfiguriert) fallen weg.
function baseRootKeys(): Set<string> {
  const r = configRoots()
  const roots = [r.claudeHome, r.codexHome, r.sharedClaude, r.projectRoot]
  return new Set(roots.filter((x): x is string => Boolean(x)).map(pathKey))
}

/**
 * Standard-Config-Homes entdecken. Prueft read-only die Existenz jedes Kandidaten
 * (join(home, subPath)) und gibt nur EXISTIERENDE als DiscoveryHit zurueck —
 * OHNE die Basis-Roots (B8-Filter oben). Reihenfolge = CANDIDATES-Reihenfolge.
 * existsSync ist graceful (kein Throw bei fehlendem/unzugaenglichem Pfad).
 * NIE Inhalt, NIE Secret.
 */
export function discoverSources(opts?: { home?: string }): DiscoveryHit[] {
  const home = resolveHome(opts?.home)
  const base = baseRootKeys()
  const hits: DiscoveryHit[] = []
  for (const c of CANDIDATES) {
    const root = join(home, c.subPath)
    if (!existsSync(root)) continue
    if (base.has(pathKey(root))) continue
    hits.push({ root, providerId: c.providerId, label: c.label })
  }
  return hits
}
