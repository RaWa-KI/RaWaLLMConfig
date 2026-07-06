// cli-version-cache.ts — Once-pro-App-Lauf-Cache fuer Versions-Spawns
// (PERF-HOCH-01). Dedupliziert ueber bin+args (NICHT spec.id!): sys-scan nutzt
// id `claude` (VERSION_SPECS), watcher-live id `claude-cli` (CLI_SPECS) fuer
// denselben Spawn `claude --version` — nur der bin+args-Key dedupliziert beide.
// Promises werden VOR dem await gecacht, damit gleichzeitige Aufrufe einen
// In-Flight-Spawn teilen. null-Ergebnisse werden mitgecacht (Once pro Lauf).
import { readToolVersionAsync, type ToolSpec } from './cli-version-live'

export type VersionExecFn = (bin: string, args: string[]) => Promise<string | null>

// Cache-Key = `${bin}\x00${args.join('\x00')}` — \x00 kommt in bin/args nie vor.
const cache = new Map<string, Promise<string | null>>()

function cacheKey(bin: string, args: string[]): string {
  return `${bin}\x00${args.join('\x00')}`
}

// Liest je Spec die Live-Version mit Prozess-Cache; liefert Map id -> version|null.
// execFn ist injizierbar (Tests ohne echte Spawns); Default: readToolVersionAsync.
export async function getVersionsCached(
  specs: ToolSpec[],
  execFn: VersionExecFn = readToolVersionAsync
): Promise<Record<string, string | null>> {
  // Fehlende Keys parallel starten: Promise in den Cache legen BEVOR awaited
  // wird — so teilen sich gleichzeitige Aufrufe denselben In-Flight-Spawn.
  const pending: Array<[id: string, p: Promise<string | null>]> = []
  for (const s of specs) {
    const key = cacheKey(s.bin, s.args)
    let p = cache.get(key)
    if (!p) {
      p = execFn(s.bin, s.args)
      cache.set(key, p)
    }
    pending.push([s.id, p])
  }
  const out: Record<string, string | null> = {}
  for (const [id, p] of pending) {
    out[id] = await p
  }
  return out
}

// Leert den Prozess-Cache — naechster getVersionsCached-Aufruf spawnt neu.
export function refreshVersions(): void {
  cache.clear()
}
