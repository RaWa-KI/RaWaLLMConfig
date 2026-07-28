// shared-data-roots.ts — leitet die realen Datenwurzeln des Shared-Trunks ab.
//
// HINTERGRUND (WP-7 Pfad-Drift): sys-scan/watcher-live haben `references` und
// `coordination/tracking` faelschlich unter `configRoots().sharedClaude`
// (= <shared>/.claude) gesucht. Diese Pfade existieren nicht. Real liegen die
// Bestaende eine Ebene hoeher, direkt unter `<shared>`:
//   <shared>/docs/01-referenz/            -> *-changelog/** + SYSTEM-ENVIRONMENT.md
//   <shared>/coordination/tracking/       -> toolchain-daemon-state.json
//   <shared>/coordination/registry/       -> localhost-ports.json
//
// AUFLAGE A5: KEIN neuer ConfigRootKey. Die Wurzel wird lokal per
// `dirname(configRoots().sharedClaude)` abgeleitet — dadurch bleibt der
// Sandbox-Modus (RAWALLM_SANDBOX_ROOT) automatisch korrekt, weil sharedClaude
// dort bereits unter <sandbox> zeigt. Read-only, keine Secret-Werte.
import fs from 'node:fs'
import path from 'node:path'
import { configRoots } from '../services/config-roots'

export interface SharedDataRoots {
  sharedDir: string // <shared>
  referencesDir: string // <shared>/docs/01-referenz (enthaelt *-changelog/)
  trackingDir: string // <shared>/coordination/tracking
  registryDir: string // <shared>/coordination/registry
}

// Legacy-Layout (<shared>/.claude/references, <shared>/.claude/coordination/...)
// bleibt als zweite Kandidatur erhalten: aeltere/abweichende Ablagen und
// Test-Fixtures brechen dadurch nicht. Gewaehlt wird der erste EXISTIERENDE
// Kandidat; existiert keiner, gewinnt der reale Default (-> leerer Empty-State,
// nie erfundene Daten).
function pickExisting(candidates: string[]): string {
  for (const c of candidates) {
    try { if (fs.existsSync(c)) return c } catch { /* graceful */ }
  }
  return candidates[0]
}

/**
 * Datenwurzeln des Shared-Trunks aufloesen. `null`, wenn kein Shared-Ordner
 * konfiguriert ist (Erstinstallation) — Aufrufer zeigen dann den Empty-State.
 */
export function sharedDataRoots(): SharedDataRoots | null {
  const sharedClaude = configRoots().sharedClaude
  if (!sharedClaude) return null
  const sharedDir = path.dirname(sharedClaude)
  return {
    sharedDir,
    referencesDir: pickExisting([
      path.join(sharedDir, 'docs', '01-referenz'),
      path.join(sharedClaude, 'references')
    ]),
    trackingDir: pickExisting([
      path.join(sharedDir, 'coordination', 'tracking'),
      path.join(sharedClaude, 'coordination', 'tracking')
    ]),
    registryDir: pickExisting([
      path.join(sharedDir, 'coordination', 'registry'),
      path.join(sharedClaude, 'coordination', 'registry')
    ])
  }
}
