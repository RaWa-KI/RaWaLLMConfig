// cli-version-cache.ts — Once-pro-App-Lauf-Cache fuer Versions-Spawns
// (PERF-HOCH-01). Dedupliziert ueber bin+args (NICHT spec.id!): sys-scan nutzt
// id `claude` (VERSION_SPECS), watcher-live id `claude-cli` (CLI_SPECS) fuer
// denselben Spawn `claude --version` — nur der bin+args-Key dedupliziert beide.
// Promises werden VOR dem await gecacht, damit gleichzeitige Aufrufe einen
// In-Flight-Spawn teilen. Ergebnisse (auch Fehler) werden mitgecacht (Once pro
// Lauf); refreshVersions() leert fuer einen echten Re-Spawn.
//
// WP-F4F9 (2026-08-07): der Cache speichert jetzt ToolVersionResult
// (version ODER error-Grund). getVersionResultsCached liefert den Grund,
// getVersionsCached bleibt als string|null-Kompat-API bestehen.
import {
  readToolVersionResult,
  type ToolSpec,
  type ToolVersionResult
} from './cli-version-live'

export type VersionExecFn = (bin: string, args: string[]) => Promise<string | null>
export type VersionResultExecFn = (bin: string, args: string[]) => Promise<ToolVersionResult>

// Cache-Key = `${bin}\x00${args.join('\x00')}` — \x00 kommt in bin/args nie vor.
const cache = new Map<string, Promise<ToolVersionResult>>()

function cacheKey(bin: string, args: string[]): string {
  return `${bin}\x00${args.join('\x00')}`
}

// Liest je Spec die Live-Version MIT Fehlergrund (Prozess-Cache); liefert
// Map id -> ToolVersionResult. execFn injizierbar (Tests ohne echte Spawns).
export async function getVersionResultsCached(
  specs: ToolSpec[],
  execFn: VersionResultExecFn = readToolVersionResult
): Promise<Record<string, ToolVersionResult>> {
  // Fehlende Keys parallel starten: Promise in den Cache legen BEVOR awaited
  // wird — so teilen sich gleichzeitige Aufrufe denselben In-Flight-Spawn.
  const pending: Array<[id: string, p: Promise<ToolVersionResult>]> = []
  for (const s of specs) {
    const key = cacheKey(s.bin, s.args)
    let p = cache.get(key)
    if (!p) {
      p = execFn(s.bin, s.args)
      cache.set(key, p)
    }
    pending.push([s.id, p])
  }
  const out: Record<string, ToolVersionResult> = {}
  for (const [id, p] of pending) {
    out[id] = await p
  }
  return out
}

// Kompat-API (string|null pro id). Ein injizierter string|null-execFn wird in
// die Result-Form gehuellt (error null = Grund unbekannt, Legacy-Verhalten).
export async function getVersionsCached(
  specs: ToolSpec[],
  execFn?: VersionExecFn
): Promise<Record<string, string | null>> {
  const fn: VersionResultExecFn = execFn
    ? async (bin, args) => ({ version: await execFn(bin, args), error: null })
    : readToolVersionResult
  const results = await getVersionResultsCached(specs, fn)
  const out: Record<string, string | null> = {}
  for (const s of specs) out[s.id] = results[s.id]?.version ?? null
  return out
}

// Leert den Prozess-Cache — naechster Aufruf spawnt neu.
export function refreshVersions(): void {
  cache.clear()
}
