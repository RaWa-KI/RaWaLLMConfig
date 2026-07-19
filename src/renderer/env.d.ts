/// <reference types="vite/client" />
import type { ElectronApi, ListDirRequest, ListDirData, IpcResult } from '@shared/contract'
import type { WriteApi } from '@shared/contract-write'
import type { UpdatesApi } from '@shared/contract-updates'
import type {
  GraphIngestAll,
  GraphIgnores,
  GraphWriteIgnoreRequest,
  GraphWriteIgnoreData
} from '@shared/contract-graph'
import type { CompareCandidate, MultiCompareResult } from '@shared/contract-compare'
import type { ArchiveApi } from '@shared/contract-archive'
import type { SourcesApi } from '@shared/contract-sources'
import type { IntegrityApi } from '@shared/contract-integrity'
import type { ConfigWatcherFsApi } from '@shared/contract-watcher-fs'
import type { IntegrationsApi } from '@shared/channels-integrations'
import type { DiagnosticsApi } from '@shared/contract-diagnostics'
import type { ErrorReportApi } from '@shared/contract-error-report'
import type { CoverageApi } from '@shared/contract-coverage'

// Read-only Innendatei-Liste (config:listDir). Eigene Bridge-Methode am
// electronAPI (Preload-`ListDirApi`), weil ElectronApi/contract.ts sie nicht
// fuehrt. Hier getypt, damit Renderer-Slices (OverviewFiles) ohne strukturellen
// Cast auskommen. Signatur exakt wie Preload + contract.ts (ListDirRequest/IpcResult<ListDirData>).
interface ListDirApi {
  listDir(req: ListDirRequest): Promise<IpcResult<ListDirData>>
}

// Versions-Refresh (PERF-HOCH-01): leert den CLI-Versions-Cache im Main.
// Eigene Bridge-Methode analog ListDirApi (Preload-`RefreshApi`), Signatur
// exakt wie Preload. Read-only, kein Write-Gate.
interface RefreshApi {
  refreshVersions(): Promise<IpcResult<boolean>>
}

// Read-only graphify-Ingest (Graph-Sektion). Eigene Bridge-Methode analog
// ListDirApi, weil contract-write/WriteApi sie nicht fuehrt. Signatur exakt wie
// Preload-`GraphApi` (graphIngest -> IpcResult<GraphIngestAll>). Nur Metadaten.
interface GraphApi {
  graphIngest(): Promise<IpcResult<GraphIngestAll>>
  graphReadIgnores(wsRoot: string): Promise<IpcResult<GraphIgnores>>
  graphWriteIgnore(req: GraphWriteIgnoreRequest): Promise<IpcResult<GraphWriteIgnoreData>>
}

// Read-only Vergleichs-Aggregator (compare:multi). Analog GraphApi —
// eigene Bridge-Methode, weil WriteApi/contract-write sie nicht führt.
interface CompareApi {
  compareMulti(candidates: CompareCandidate[]): Promise<IpcResult<MultiCompareResult>>
}

// Renderer kennt die Preload-Bridge als read-API + volle Write-API + Update-API
// + read-only listDir + read-only graphIngest + read-only compareMulti.
// Optional, weil die Bridge im Browser-/Test-Kontext fehlen kann.
declare global {
  interface Window {
    electronAPI?: ElectronApi & WriteApi & UpdatesApi & ListDirApi & RefreshApi & GraphApi & CompareApi & ArchiveApi & SourcesApi & IntegrityApi & ConfigWatcherFsApi & DiagnosticsApi & CoverageApi & { integrations: IntegrationsApi; errorReport: ErrorReportApi }
  }
}

export {}
