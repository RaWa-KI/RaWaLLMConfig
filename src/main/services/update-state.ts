/**
 * update-state.ts — Zentraler Zustandsspeicher fuer den Update-Manager.
 * SRP: Nur State-Struct, Mutations-Helper und getUpdateState().
 * Kein Electron-Singleton, kein IPC. Importiert nur Contract-Typen.
 * HR27: < 300 Z, Funktionen < 50 Z.
 */

import type {
  UpdatePhase,
  UpdateHistoryEntry,
  UpdateSourceKind,
  UpdateStateData,
} from '@shared/contract-updates'

// ---------------------------------------------------------------------------
// Konstanten
// ---------------------------------------------------------------------------

/** Maximale Anzahl History-Eintraege (Cap 20, 1:1 build-spec §3.2). */
const HISTORY_MAX = 20

// ---------------------------------------------------------------------------
// Modul-Level-State (Singleton, read via getUpdateState())
// ---------------------------------------------------------------------------

let state: UpdateStateData = {
  phase: 'idle',
  sourceConfigured: false,
  sourceKind: null,
  sourceLabel: 'Quelle wird geprüft',
  currentVersion: '',        // wird beim ersten Check via setSourceState(_, version) befuellt
  latestVersion: null,
  assetName: null,
  stagedPath: null,
  releaseNotes: null,
  lastCheckedAt: null,
  lastError: null,
  lastSourceError: null,
  history: [],
}

// ---------------------------------------------------------------------------
// State-Mutations-Helper (intern fuer update-manager.ts)
// ---------------------------------------------------------------------------

/**
 * Fuegt einen History-Eintrag hinzu (cap 20, FIFO).
 * detail darf keinen Pfad/Stack/Secret enthalten.
 */
export function pushHistory(event: string, detail?: string): void {
  const entry: UpdateHistoryEntry = {
    ts: new Date().toISOString(),
    event,
    ...(detail !== undefined ? { detail } : {}),
  }
  state.history = [entry, ...state.history].slice(0, HISTORY_MAX)
}

/** Setzt Phase und loggt sanitisiert. */
export function setPhase(phase: UpdatePhase): void {
  state.phase = phase
  pushHistory(`phase:${phase}`)
}

/**
 * Setzt lastError (generischer String, kein Pfad/Stack/Secret).
 * Setzt Phase auf 'error'.
 */
export function setError(msg: string): void {
  state.lastError = msg
  state.phase = 'error'
  pushHistory('error', msg)
}

/** Loescht lastError (fuer neuen Check-Zyklus). */
export function clearError(): void {
  state.lastError = null
}

/**
 * Aktualisiert sourceConfigured + currentVersion.
 * currentVersion kommt als Parameter (deps.getVersion() im update-manager) —
 * haelt dieses Modul electron-frei und pur testbar.
 */
export function setSourceState(
  configured: boolean,
  version: string,
  kind: UpdateSourceKind | null,
  label: string,
  sourceError: string | null = null
): void {
  state.sourceConfigured = configured
  state.currentVersion = version
  state.sourceKind = kind
  state.sourceLabel = label
  state.lastSourceError = sourceError
}

/** Setzt latestVersion + assetName nach erfolgreichem Manifest-Read. */
export function setAvailable(
  latestVersion: string | null,
  assetName: string | null,
  releaseNotes: string | null = null
): void {
  state.latestVersion = latestVersion
  state.assetName = assetName
  state.releaseNotes = releaseNotes
  state.lastCheckedAt = new Date().toISOString()
}

/** Loescht bekannten Manifeststand ohne den letzten erfolgreichen Check zu ueberschreiben. */
export function clearKnownRelease(): void {
  state.latestVersion = null
  state.assetName = null
  state.releaseNotes = null
}

/** Setzt stagedPath nach erfolgreichem Download. */
export function setStagedPath(p: string | null): void {
  state.stagedPath = p
}

/** Setzt previousVersion-Hinweis in der History (kein eigenes State-Feld). */
export function markPreviousVersion(version: string): void {
  pushHistory('previousVersion', version)
}

// ---------------------------------------------------------------------------
// Oeffentlicher Getter (fuer IPC + update-manager intern)
// ---------------------------------------------------------------------------

/**
 * Gibt eine Shallow-Copy des aktuellen State zurueck (unveraenderlich fuer Aufrufer).
 * History-Array wird flach kopiert (Eintraege sind unveraenderlich).
 */
export function getUpdateState(): UpdateStateData {
  return {
    ...state,
    history: [...state.history],
  }
}
