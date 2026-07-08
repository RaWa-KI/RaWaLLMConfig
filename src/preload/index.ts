import { contextBridge, ipcRenderer } from 'electron'
import { IPC, IPC_EVENTS } from '@shared/channels'
import type { IntegrationsApi } from '@shared/channels-integrations'
import { IPC_WRITE } from '@shared/channels-write'
import { IPC_UPDATES, IPC_UPDATES_EVENTS } from '@shared/channels-updates'
import { createIntegrationsApi } from './integrations-api'
import type {
  AppData,
  System,
  Watcher,
  IpcResult,
  ElectronApi,
  ListDirRequest,
  ListDirData
} from '@shared/contract'
import type {
  WriteApi,
  WriteRequest,
  WriteResult,
  ReconcileRequest,
  ReconcileResult,
  PrefsGetRequest,
  PrefsGetResult,
  PrefsSetRequest,
  PrefsSetResult,
  ReadFullRequest,
  ReadFullResult,
  ExplainRequest,
  ExplainResult,
  WriteStatusResult,
  WriteSetEnabledRequest,
  DirActionRequest,
  DirActionResult,
  DirReconcileRequest,
  DirReconcileResult,
  SystemEditRequest,
  SystemEditResult,
  EnvMigrateRequest,
  EnvMigrateResult,
  StrukturScanRequest,
  StrukturScanResult
} from '@shared/contract-write'
import type {
  RenameRequest,
  RenameResult,
  MoveVersionedRequest,
  MoveVersionedResult,
  MoveImpactScanRequest,
  MoveImpactScanResult
} from '@shared/contract-write-rename'
import type {
  UpdatesApi,
  UpdateCheckRequest,
  UpdateDownloadRequest,
  UpdateInstallRequest,
  UpdateProgressPayload
} from '@shared/contract-updates'
import type {
  ConfigChangedPayload,
  ConfigWatcherFsApi
} from '@shared/contract-watcher-fs'
import type {
  GraphIngestAll,
  GraphIgnores,
  GraphWriteIgnoreRequest,
  GraphWriteIgnoreData
} from '@shared/contract-graph'
import type { CompareCandidate, MultiCompareResult } from '@shared/contract-compare'
import type {
  IntegrityApi,
  IntegrityPreviewRequest,
  IntegrityPreviewResult,
  IntegrityApplyRequest,
  IntegrityApplyResult
} from '@shared/contract-integrity'
import type {
  ArchiveApi,
  ArchiveListResult,
  ArchiveRestoreRequest,
  ArchiveRestoreResult
} from '@shared/contract-archive'
import type {
  SourcesApi,
  AddSourceRequest,
  SetSourceEnabledRequest,
  SourceListResult,
  DiscoveryResult,
  ModelDiscoveryResult,
  ProviderChoiceResult,
  PickFolderResult,
  OnboardingDoneResult,
  SourceMutateResult
} from '@shared/contract-sources'

// Sichere contextBridge. Read-API bleibt unveraendert; Phase 2 ergaenzt die
// VOLLE Write-API (NUR getypte Methoden ueber whitelisted Kanaele aus
// channels-write — kein generischer Kanal-Invoke). Keine Magic-Strings,
// kein fs/path im Preload. Secrets fliessen nie — nur Namen/Pfade.
const read: ElectronApi = {
  readConfig: (): Promise<IpcResult<AppData>> => ipcRenderer.invoke(IPC.configGetAll),
  readSystem: (): Promise<IpcResult<System>> => ipcRenderer.invoke(IPC.systemGetAreas),
  readWatcher: (): Promise<IpcResult<Watcher>> => ipcRenderer.invoke(IPC.watcherGetState),
  // Read-Drilldown fuer Watcher-Vollinhalt (secret-guarded). Read-Namespace:
  // Kanal in IPC (channels.ts), Handler in registerIpc(), Typ in ElectronApi.
  watcherReadFull: (req: ReadFullRequest): Promise<ReadFullResult> =>
    ipcRenderer.invoke(IPC.watcherReadFull, req)
}

// Read-only Innendatei-Liste (Ordner-Drilldown der Uebersicht). Liefert NUR
// Name/Groesse/secret-Flag, NIE Inhalt — Inhalt kommt erst on-demand via readFull
// (secret-guarded). Eigene Bridge-Methode, weil contract.ts/ElectronApi nicht im
// Write-Set liegt: lokale Erweiterungs-Schnittstelle + Whitelist-Kanal config:listDir.
export interface ListDirApi {
  listDir(req: ListDirRequest): Promise<IpcResult<ListDirData>>
}

const list: ListDirApi = {
  listDir: (req: ListDirRequest): Promise<IpcResult<ListDirData>> =>
    ipcRenderer.invoke(IPC.configListDir, req)
}

// Versions-Refresh (PERF-HOCH-01): leert den CLI-Versions-Cache im Main, damit
// readSystem/readWatcher beim naechsten Aufruf frische Versionen spawnen.
// Eigene Bridge-Methode analog ListDirApi, weil ElectronApi/contract.ts sie
// nicht fuehrt. Read-only, kein Write-Gate.
export interface RefreshApi {
  refreshVersions(): Promise<IpcResult<boolean>>
}

const refresh: RefreshApi = {
  refreshVersions: (): Promise<IpcResult<boolean>> =>
    ipcRenderer.invoke(IPC.systemRefreshVersions)
}

// Read-only graphify-Ingest (Graph-Sektion, Cluster B). Eigene Bridge-Methode,
// weil contract-write/WriteApi nicht im Write-Set liegt — analog ListDirApi.
// Liefert nur Knoten-/Kanten-Metadaten je WS (nie Datei-Inhalt, nie Secret).
export interface GraphApi {
  graphIngest(): Promise<IpcResult<GraphIngestAll>>
  graphReadIgnores(wsRoot: string): Promise<IpcResult<GraphIgnores>>
  graphWriteIgnore(req: GraphWriteIgnoreRequest): Promise<IpcResult<GraphWriteIgnoreData>>
}

const graph: GraphApi = {
  graphIngest: (): Promise<IpcResult<GraphIngestAll>> =>
    ipcRenderer.invoke(IPC_WRITE.graphIngest),
  // Read-only Lesen der drei Ignore-Scopes (kein Gate); Renderer schickt nur wsRoot.
  graphReadIgnores: (wsRoot: string): Promise<IpcResult<GraphIgnores>> =>
    ipcRenderer.invoke(IPC_WRITE.graphReadIgnores, wsRoot),
  // Gated Schreiben EINES Scopes (scope-Enum + wsRoot + content, NIE freier Pfad).
  graphWriteIgnore: (req: GraphWriteIgnoreRequest): Promise<IpcResult<GraphWriteIgnoreData>> =>
    ipcRenderer.invoke(IPC_WRITE.graphWriteIgnore, req)
}

// Read-only Vergleichs-Aggregator (compare:multi). Analog GraphApi —
// eigene Bridge-Methode, weil WriteApi/contract-write sie nicht führt.
// Liefert zeilen-aligned Multi-Way-Ergebnis, nie Secret-Werte ungekapselt.
export interface CompareApi {
  compareMulti(candidates: CompareCandidate[]): Promise<IpcResult<MultiCompareResult>>
}

const compare: CompareApi = {
  compareMulti: (c: CompareCandidate[]): Promise<IpcResult<MultiCompareResult>> =>
    ipcRenderer.invoke(IPC_WRITE.compareMulti, c)
}

// Archiv/Restore-Bridge (v1). archiveList read-only (kein Gate); archiveRestore
// gated im Main (isWriteEnabled). Eigene Bridge analog GraphApi/CompareApi, weil
// WriteApi/contract-write sie nicht fuehrt. Nie Datei-Inhalt — nur Pfade/Status.
const archive: ArchiveApi = {
  archiveList: (): Promise<IpcResult<ArchiveListResult>> =>
    ipcRenderer.invoke(IPC_WRITE.archiveList),
  archiveRestore: (req: ArchiveRestoreRequest): Promise<ArchiveRestoreResult> =>
    ipcRenderer.invoke(IPC_WRITE.archiveRestore, req)
}

// Endnutzer-Quellen-Verwaltung (OSS Teil C). Read-Methoden ungated; Mutationen
// im Main via isWriteEnabled() gegated. Kein roher ipcRenderer, keine Magic-
// Strings — read auf IPC.*, write auf IPC_WRITE.*. Nie Datei-Inhalt, nie Secret.
const sources: SourcesApi = {
  listSources: (): Promise<SourceListResult> =>
    ipcRenderer.invoke(IPC.sourcesList),
  discoverSources: (): Promise<DiscoveryResult> =>
    ipcRenderer.invoke(IPC.sourcesDiscover),
  discoverModels: (): Promise<ModelDiscoveryResult> =>
    ipcRenderer.invoke(IPC.sourcesDiscoverModels),
  listProviders: (): Promise<ProviderChoiceResult> =>
    ipcRenderer.invoke(IPC.providersList),
  pickFolder: (): Promise<PickFolderResult> =>
    ipcRenderer.invoke(IPC.sourcesPickFolder),
  getOnboardingDone: (): Promise<OnboardingDoneResult> =>
    ipcRenderer.invoke(IPC.sourcesOnboardingGet),
  addSource: (req: AddSourceRequest): Promise<SourceMutateResult> =>
    ipcRenderer.invoke(IPC_WRITE.sourcesAdd, req),
  removeSource: (id: string): Promise<SourceMutateResult> =>
    ipcRenderer.invoke(IPC_WRITE.sourcesRemove, id),
  setSourceEnabled: (req: SetSourceEnabledRequest): Promise<SourceMutateResult> =>
    ipcRenderer.invoke(IPC_WRITE.sourcesSetEnabled, req),
  setOnboardingDone: (done: boolean): Promise<SourceMutateResult> =>
    ipcRenderer.invoke(IPC_WRITE.sourcesSetOnboarding, done)
}

const write: WriteApi = {
  writeApply: (req: WriteRequest): Promise<WriteResult> =>
    ipcRenderer.invoke(IPC_WRITE.configApply, req),
  writeReconcile: (req: ReconcileRequest): Promise<ReconcileResult> =>
    ipcRenderer.invoke(IPC_WRITE.configReconcile, req),
  prefsGet: (req?: PrefsGetRequest): Promise<PrefsGetResult> =>
    ipcRenderer.invoke(IPC_WRITE.prefsGet, req),
  prefsSet: (req: PrefsSetRequest): Promise<PrefsSetResult> =>
    ipcRenderer.invoke(IPC_WRITE.prefsSet, req),
  readFull: (req: ReadFullRequest): Promise<ReadFullResult> =>
    ipcRenderer.invoke(IPC_WRITE.configReadFull, req),
  explain: (req: ExplainRequest): Promise<ExplainResult> =>
    ipcRenderer.invoke(IPC_WRITE.configExplain, req),
  // In-App-Schreib-Schalter (Fix #1): kein raw ipcRenderer exponiert (contextIsolation bleibt).
  writeStatus: (): Promise<WriteStatusResult> =>
    ipcRenderer.invoke(IPC_WRITE.writeStatus),
  writeSetEnabled: (req: WriteSetEnabledRequest): Promise<WriteStatusResult> =>
    ipcRenderer.invoke(IPC_WRITE.writeSetEnabled, req),
  // Dir-Operationen (Teil A — CONTRACT-SSoT): Bridge ueber whitelisted Kanaele.
  archiveDirEntry: (path: string): Promise<DirActionResult> =>
    ipcRenderer.invoke(IPC_WRITE.writeArchiveDir, { action: 'archive-dir', path }),
  moveDirEntry: (path: string, to: string): Promise<DirActionResult> =>
    ipcRenderer.invoke(IPC_WRITE.writeMoveDir, { action: 'move-dir', path, to }),
  reconcileFolder: (req: DirReconcileRequest): Promise<DirReconcileResult> =>
    ipcRenderer.invoke(IPC_WRITE.writeReconcileFolder, req),
  // Umbenennen-/Verschieben-Routen (WP-03/04; Datei+Ordner, Seitenwahl, Versions-Wahl)
  renameEntry: (req: RenameRequest): Promise<RenameResult> =>
    ipcRenderer.invoke(IPC_WRITE.writeRename, req),
  moveEntryVersioned: (req: MoveVersionedRequest): Promise<MoveVersionedResult> =>
    ipcRenderer.invoke(IPC_WRITE.writeMoveVersioned, req),
  moveImpactScan: (req: MoveImpactScanRequest): Promise<MoveImpactScanResult> =>
    ipcRenderer.invoke(IPC_WRITE.writeMoveImpactScan, req),
  // Neue Bridge-Methoden (WP-F Sync-Punkte; Handler fuellen C/G/H via Stubs)
  systemWrite: (req: SystemEditRequest): Promise<SystemEditResult> =>
    ipcRenderer.invoke(IPC_WRITE.systemWrite, req),
  envCreate: (req: EnvMigrateRequest): Promise<EnvMigrateResult> =>
    ipcRenderer.invoke(IPC_WRITE.envCreate, req),
  strukturScan: (req?: StrukturScanRequest): Promise<StrukturScanResult> =>
    ipcRenderer.invoke(IPC_WRITE.strukturScan, req)
}

// Update-Manager-Bridge (dritte Gruppe). onUpdatesProgress: einzige sanktionierte
// ipcRenderer.on-Ausnahme — fixer Kanal, gibt Unsubscribe zurueck, kein roher
// ipcRenderer exponiert (R6). Listener-Referenz gesichert fuer removeListener.
const updates: UpdatesApi = {
  updatesCheck: (req?: UpdateCheckRequest) =>
    ipcRenderer.invoke(IPC_UPDATES.updatesCheck, req),
  updatesDownload: (req: UpdateDownloadRequest) =>
    ipcRenderer.invoke(IPC_UPDATES.updatesDownload, req),
  updatesInstall: (req?: UpdateInstallRequest) =>
    ipcRenderer.invoke(IPC_UPDATES.updatesInstall, req),
  updatesGetState: () =>
    ipcRenderer.invoke(IPC_UPDATES.updatesGetState),
  onUpdatesProgress: (cb: (p: UpdateProgressPayload) => void): (() => void) => {
    const listener = (_e: unknown, p: UpdateProgressPayload): void => cb(p)
    ipcRenderer.on(IPC_UPDATES_EVENTS.updatesProgress, listener)
    return () => ipcRenderer.removeListener(IPC_UPDATES_EVENTS.updatesProgress, listener)
  }
}

// Config-Changed-Bridge (nur Event-Listener, kein Watcher-Service). Payload ist
// strikt Metadaten: Familien, Root-Kinds, Zeitpunkt und optionaler Grund.
const configWatcherFs: ConfigWatcherFsApi = {
  onConfigChanged: (cb: (p: ConfigChangedPayload) => void): (() => void) => {
    const listener = (_e: unknown, p: ConfigChangedPayload): void => cb(p)
    ipcRenderer.on(IPC_EVENTS.configChanged, listener)
    return () => ipcRenderer.removeListener(IPC_EVENTS.configChanged, listener)
  }
}

// Integrity-Transaktionsschicht (W4): Preview (read-only Dry-Run) + Apply (gated
// im Main). Bridge ueber whitelisted Kanaele integrity:preview/integrity:apply,
// kein roher ipcRenderer. Nie Secret-Werte, nur Plan/Status/Pfade.
const integrity: IntegrityApi = {
  integrityPreview: (req: IntegrityPreviewRequest): Promise<IntegrityPreviewResult> =>
    ipcRenderer.invoke(IPC_WRITE.integrityPreview, req),
  integrityApply: (req: IntegrityApplyRequest): Promise<IntegrityApplyResult> =>
    ipcRenderer.invoke(IPC_WRITE.integrityApply, req)
}

const integrations = createIntegrationsApi(ipcRenderer)

const api: ElectronApi & WriteApi & UpdatesApi & ListDirApi & RefreshApi & GraphApi & CompareApi & ArchiveApi & SourcesApi & IntegrityApi & ConfigWatcherFsApi & { integrations: IntegrationsApi } = {
  ...read,
  ...write,
  ...updates,
  ...configWatcherFs,
  ...list,
  ...refresh,
  ...graph,
  ...compare,
  ...archive,
  ...sources,
  ...integrity,
  integrations
}

contextBridge.exposeInMainWorld('electronAPI', api)
