// scan-invalid-entry.ts — synthetischer Befund-Entry (Variante A, Owner-gelockt)
// fuer eine kaputte/unlesbare Config-Datei. Statt einer LEEREN Kategorie
// ("leer & gesund") erzeugt der Scan EINEN sichtbaren conflict-Entry — exakt die
// bewaehrte Konvention aus scan-claude-plugins.ts (status:'conflict' +
// conflictReason). Der Renderer zeigt das End-zu-Ende (Pille, HealthBar-Konflikt-
// Chip, Tooltip). KEIN neuer EntryStatus 'invalid'.
//
// Eigene Datei statt scan-helpers.ts: scan-helpers.ts hat bereits 290 Zeilen; der
// Helper dort einzufuegen wuerde das HR27-Limit (300 Z) reissen. Als eigenes,
// exportiertes Modul bleibt sowohl claude-scan als auch scan-helpers unter 300 —
// und claude-scan/codex-scan rufen den Helper nur AUF (nicht inline).
//
// HR18/Local-Only: desc/code tragen den Fehler nur MASKIERT (maskedPreview),
// nie Rohwerte einer secret-classed Quelle (settings.json/config.toml/hooks.json).
import path from 'node:path'
import type { ConfigEntry } from '@shared/contract'
import { mtimeSafe } from './scan-helpers'
import { maskedPreview } from './masked-preview'

// Baut den synthetischen conflict-Entry. kind = Fehler-Art als laienverstaendliches
// Label (Default 'JSON-Parse-Fehler'; z.B. 'TOML-Lesefehler' fuer config.toml).
// msg wird auf 60 Zeichen gekuerzt und nie roh weiterverteilt (nur die
// Exception-Message, kein Datei-Inhalt). code = maskierte Struktur-Vorschau der
// Quelldatei (Werte -> •••); bei Lesefehler liefert maskedPreview '' -> undefined.
export function invalidConfigEntry(
  id: string,
  name: string,
  fp: string,
  err: unknown,
  kind = 'JSON-Parse-Fehler',
): ConfigEntry {
  const msg = err instanceof Error ? err.message : String(err)
  const base = path.basename(fp)
  return {
    id,
    name,
    status: 'conflict',
    scope: 'global',
    path: fp,
    desc: `${kind}: ${msg.slice(0, 60)}`,
    conflictReason: `${kind} in ${base}`,
    updated: mtimeSafe(fp),
    fields: { typ: base },
    code: maskedPreview(fp) || undefined,
  }
}
