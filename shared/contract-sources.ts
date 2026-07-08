// contract-sources.ts — Typen fuer die Endnutzer-Quellen-Verwaltung + First-Run-
// Onboarding (OSS Teil C). BEWUSST ausgelagert aus contract.ts/contract-write.ts
// (beide nahe am 300-Z-Limit, HR27). Eine Quelle ist nur ein Ordner-Pfad +
// Provider-Zuordnung + enabled-Flag — NIE ein Secret-Wert. Der Ordner-Picker
// liefert ausschliesslich einen Pfad (nie Inhalt). Schema-versioniert fuer
// vorwaerts-kompatible Migration des persistierten Store.
import type { IpcResult } from './contract'

// ── Persistiertes Datenmodell (source-store, userData/sources.json) ──────────

/**
 * Eine vom Nutzer registrierte Config-Quelle. `root` ist eine Lese-Scan-Wurzel,
 * die — entsprechend OWNER-GRUNDPRINZIP — auch editierbar ist (gated via
 * write-mode + backup-first + Confirm + Secret-WERT-Maskierung). Keine
 * per-Source-read-only-Sperre. `providerId` referenziert ein providerRegistry()-
 * Manifest (`ProviderManifest.id`); leere/unbekannte id behandelt die UI als
 * generische Quelle.
 */
export interface UserSource {
  id: string // stabile, kollisionsarme id (Slug aus root + Zaehler)
  root: string // absoluter Ordner-Pfad (Lese-Scan-Wurzel)
  providerId: string // Zuordnung zu providerRegistry() manifest.id
  label?: string // optionaler Anzeigename (Default = Basename von root)
  enabled: boolean // im Scan aktiv?
}

/**
 * Persistierte Store-Datei. `onboardingVersion` ersetzt das alte boolesche
 * `onboardingDone`: abgeschlossen ist nur die aktuelle Onboarding-Version.
 */
export interface SourcesFile {
  version: 2
  sources: UserSource[]
  onboardingVersion: number
}

// ── Auto-Discovery (Standard-Homes, read-only) ───────────────────────────────

/**
 * Ein Treffer der Auto-Discovery der Standard-Homes (~/.claude, ~/.codex,
 * ~/.ollama, LM-Studio-Standardpfad). Noch NICHT persistiert — der Nutzer
 * bestaetigt im Onboarding, welche Treffer als Quelle uebernommen werden.
 */
export interface DiscoveryHit {
  root: string // gefundener absoluter Standard-Pfad
  providerId: string // erkannter Provider (providerRegistry-id)
  label: string // sprechendes Label, z.B. "Claude (~/.claude)"
}

/** Ein read-only erkannter lokaler Modellfund fuer das Onboarding. */
export interface ModelDiscoveryHit {
  id: string
  kind: 'gguf' | 'endpoint'
  label: string
  path: string
  detail: string
}

// ── Provider-Auswahl (aus providerRegistry(), nur id + label) ────────────────

/**
 * Provider-Auswahl-Eintrag fuer die UI. Wird IMMER aus providerRegistry()
 * abgeleitet (nie statische Liste in der UI, R-C4) — so erscheinen additive
 * Provider (Cloud/lokal aus Teil D, nutzerdefinierte Manifeste) automatisch.
 */
export interface ProviderChoice {
  id: string
  label: string
}

// ── Requests ─────────────────────────────────────────────────────────────────

/** Eine neue Quelle registrieren (gated). `enabled` Default true. */
export interface AddSourceRequest {
  root: string
  providerId: string
  label?: string
  enabled?: boolean
}

/** Aktiv-Status einer Quelle setzen (gated). */
export interface SetSourceEnabledRequest {
  id: string
  enabled: boolean
}

// ── Results (IPC) ─────────────────────────────────────────────────────────────

export type SourceListResult = IpcResult<UserSource[]>
export type DiscoveryResult = IpcResult<DiscoveryHit[]>
export type ModelDiscoveryResult = IpcResult<ModelDiscoveryHit[]>
export type ProviderChoiceResult = IpcResult<ProviderChoice[]>
export type OnboardingDoneResult = IpcResult<boolean>

/**
 * Ergebnis des Ordner-Pickers. `null` = Nutzer hat abgebrochen (kein Throw,
 * kein Pfad-Leak). Bei Auswahl der absolute Ordner-Pfad.
 */
export type PickFolderResult = IpcResult<string | null>

/**
 * Ergebnis einer Quellen-Mutation (add/remove/setEnabled). backup-first wie
 * PrefsSetOutcome (HR7). `sources` traegt den neuen Gesamtstand zurueck, damit
 * der Renderer ohne Re-Fetch aktualisieren kann.
 */
export interface SourceMutateResult {
  ok: boolean
  error: string | null
  backupPath: string | null
  sources: UserSource[]
}

// ── Preload-Bridge-Vertrag ────────────────────────────────────────────────────

/**
 * Getypte Renderer-Bridge fuer die Quellen-Verwaltung (analog GraphApi/ArchiveApi).
 * Read-Methoden ohne Gate; Mutationen sind im Main via isWriteEnabled() gegated.
 * Kein roher ipcRenderer, keine Magic-Strings — Kanaele liegen in channels(-write).
 */
export interface SourcesApi {
  // read-only
  listSources(): Promise<SourceListResult>
  discoverSources(): Promise<DiscoveryResult>
  discoverModels(): Promise<ModelDiscoveryResult>
  listProviders(): Promise<ProviderChoiceResult>
  pickFolder(): Promise<PickFolderResult>
  getOnboardingDone(): Promise<OnboardingDoneResult>
  // gated mutations
  addSource(req: AddSourceRequest): Promise<SourceMutateResult>
  removeSource(id: string): Promise<SourceMutateResult>
  setSourceEnabled(req: SetSourceEnabledRequest): Promise<SourceMutateResult>
  setOnboardingDone(done: boolean): Promise<SourceMutateResult>
}
