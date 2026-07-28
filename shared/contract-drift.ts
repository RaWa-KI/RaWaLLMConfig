// Drift-Relation (Plan 2026-07-20, WP1): gewollte Paritaets-Kopien derselben
// Datei ueber mehrere Provider-Loader-Roots (HR16) — eigener Relationstyp,
// KEIN DuplicateSet. Nur Pfade/Metadaten, nie Datei-Inhalte oder Secrets.
import { normalizeCat, normalizeKey } from './cat-key'
import type { IpcResult } from './contract'

// Loader-Root-Art eines Mitglieds (userglobal-Ebene). Disambiguierung (WP-8,
// B9): 'agents' bleibt der ~/.agents-Loader („Kimi (.agents)"), 'kimi' steht
// fuer ~/.kimi-code. Bestehende persistierte driftRelationKeys bleiben stabil
// (kein Rename, neuer Wert nur additiv).
export type DriftRootKind = 'claude' | 'codex' | 'agents' | 'kimi'

export interface DriftMember {
  path: string
  rootKind: DriftRootKind
  updated?: string
  sha256?: string
}

// Vergleichs-Status der Kopien (UI-Texte spaeter: 'gleich' / 'weicht ab').
export type DriftStatus = 'same' | 'diff'

// Nutzer-Festlegung: parity = gewollte Paritaets-Kopie, duplicate = echte
// Dublette (geht in den bestehenden Reconcile-Pfad), ignored = ausblenden.
export type DriftDecision = 'parity' | 'duplicate' | 'ignored'

export interface DriftRelation {
  cat: string
  name: string
  members: DriftMember[]
  status: DriftStatus
  suggestion: 'parity' | null
  decision?: DriftDecision
  decidedAt?: string
}

// Persistierter Festlegungs-Eintrag (Store drift-relation-decisions.json).
export interface DriftDecisionRecord {
  key: string
  decision: DriftDecision
  decidedAt: string
}

export interface DriftDecisionFile {
  version: 1
  records: DriftDecisionRecord[]
}

/**
 * Stabiler Gruppen-Key: normalizeCat-Achse + normalizeKey-Name + sortierte
 * Root-Arten. Sortierungsunabhaengig und rescan-stabil (keine Pfade im Key).
 */
export function driftRelationKey(cat: string, name: string, rootKinds: DriftRootKind[]): string {
  const roots = [...new Set(rootKinds)].sort().join('+')
  return `${normalizeCat(cat)}|${normalizeKey(name)}|${roots}`
}

// IPC-Nutzlasten (drift:readDecisions ungated, drift:writeDecision gegated).
export interface DriftDecisionsData {
  decisions: DriftDecisionRecord[]
}

export interface DriftWriteDecisionRequest {
  key: string
  decision: DriftDecision
}

// Preload-Bridge: readDriftDecisions ungated, writeDriftDecision im Main via
// isWriteEnabled() gegated. Keys/Records sind wertfrei (kein Inhalt/Secret).
export interface DriftApi {
  readDriftDecisions(): Promise<IpcResult<DriftDecisionsData>>
  writeDriftDecision(req: DriftWriteDecisionRequest): Promise<IpcResult<DriftDecisionsData>>
}
