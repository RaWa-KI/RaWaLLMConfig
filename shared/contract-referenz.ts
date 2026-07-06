// shared/contract-referenz.ts
// Typen der Referenz-Sektion (Teil-A): Cross-Tool-Feldlandkarte Claude/Codex + Port-Profil.
// WP-A1 finalisiert die im WP-H0-Stub angelegten Typen passend zur echten Prototyp-Datenform
// (Artefakt-Felder Was/Wann/Sicher/Beispiel/Pitfall/seit, Port-Eimer). Nur Struktur/Namen,
// nie echte Secret-Werte. Ausgelagert aus contract.ts (R3, 300-Z-Limit).

// Oberflaechen, auf denen ein Artefakt/Feld/Befehl verfuegbar ist.
export type RefSurface = 'cli' | 'ide' | 'desktop' | 'web'

// Ein einzelnes anpassbares Config-Feld (oder Katalog-Eintrag) innerhalb eines Artefakts.
// Alle Felder ausser key/what sind optional, weil die Datensaetze sie selektiv setzen.
export interface RefField {
  id?: string
  key: string
  req?: boolean
  what: string
  when?: string
  safe?: string
  example?: string
  pitfall?: string
  since?: string
  alias?: string
  // Nur im /-Befehl-Katalog: Gruppenname und Verfuegbarkeits-Badges.
  group?: string
  surf?: RefSurface[]
  // Nur bei Changelog-/Verweis-Feldern: Ziel-Schluessel bei Umbenennung.
  to?: string
  // Nur bei managed-only Settings-Keys (Policy-Layer).
  managed?: boolean
}

// Platzhalter/Variable, die in einem Artefakt ersetzt oder per stdin geliefert wird.
export interface RefVar {
  token: string
  desc: string
}

// Benannter Eintrag mit Schluessel + Beschreibung (Hook-Events, Surface-Legende).
export interface RefKeyDesc {
  key: string
  desc: string
}

// Ein Config-Artefakt (z. B. settings.json, AGENTS.md) mit seinen Feldern.
export interface RefArtifact {
  id: string
  label: string
  icon?: string
  file: string
  surf?: RefSurface[]
  tag?: string
  intro?: string
  skeleton?: string
  fields: RefField[]
  vars?: RefVar[]
  notes?: string[]
  // Nur beim /-Befehl-Katalog: gruppierte Darstellung + Surface-Legende.
  grouped?: boolean
  surfaceLegend?: RefKeyDesc[]
  // Nur beim Hook-Artefakt: Lifecycle-Events.
  events?: RefKeyDesc[]
}

// Ein einzelnes typisiertes Changelog-Delta, das auf ein Referenz-Feld zeigt.
export interface RefDelta {
  id: string
  kind: 'added' | 'renamed' | 'deprecated' | 'removed'
  art: string
  field: string | null
  key: string
  to?: string
  since: string
  note?: string
}

// Changelog-Block: typisierte Deltas. Versionsfenster kommt live aus dem Watcher
// (versionsFromWatcher), nicht aus kuratierten installed/latest-Feldern (WP26).
export interface RefChangelog {
  source: string
  deltas: RefDelta[]
}

// Kuratierter Referenz-Datensatz pro Tool (Claude/Codex).
export interface RefDataset {
  label: string
  updated?: string
  source?: string
  artifacts: RefArtifact[]
  changelog?: RefChangelog
}

// ── Port-Profil Claude → Codex ──────────────────────────────────────────────
// Klassifikation einer einzelnen Feld-Zuordnung.
//   direct    = 1:1 uebernommen
//   transform = umbenannt / umgeformt
//   drop      = kein Aequivalent, bewusst weggelassen
export type PortKind = 'direct' | 'transform' | 'drop'

// Eine Zeile im Feld-Mapping eines Eimers.
export interface PortRow {
  from: string
  to: string | null
  kind: PortKind
  note?: string
}

// Ziel-Feld ohne Quelle (Default/Eingabe noetig).
export interface PortAdd {
  to: string
  note?: string
}

// Ein Mapping-Eimer pro Claude-Artefakt-id (z. B. skill, hook, mcp).
export interface PortBucket {
  targetLabel: string
  rows: PortRow[]
  adds?: PortAdd[]
}

// Sammlung aller Eimer, indiziert ueber die Claude-Artefakt-id.
export type PortMap = Record<string, PortBucket>

// Versionsstempel des Port-Profils.
export interface PortValidFor {
  claude: string
  codex: string
}

// Vollstaendiges Port-Profil Claude→Codex mit Versionsstempel + Mapping.
export interface PortProfile {
  version: string
  validFor: PortValidFor
  maps: PortMap
}
