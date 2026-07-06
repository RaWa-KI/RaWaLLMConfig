// shared/contract-updates.ts — SSoT fuer Update-Manager-Typen. Importiert NUR IpcResult. Keine Laufzeit-Logik.
import type { IpcResult } from './contract'

export type UpdateSourceKind = 'local' | 'https'

export interface UpdateAsset {
  name: string
  browser_download_url: string      // audit-only bei local-fs
  size: number
  content_type?: string
  download_count?: number
  sha256?: string                   // OPTIONAL -> Gate nur wenn vorhanden
}
export interface UpdateRelease {
  tag_name: string; name: string; body: string; published_at: string
  prerelease: boolean; assets: UpdateAsset[]
}
export interface UpdateInfo {
  version: string                   // ohne 'v'
  name: string; releaseNotes: string; publishedAt: string
  assetName: string                 // path.basename()-normalisiert
  fileSize: number; isPrerelease: boolean; sha256?: string
}
export interface UpdateCheckRequest { /* leer; Quelle = RAWALLM_UPDATE_DIR */ }
export interface UpdateCheckResultData {
  hasUpdate: boolean; currentVersion: string; latestVersion: string | null
  info: UpdateInfo | null; sourceConfigured: boolean
  sourceKind: UpdateSourceKind | null; sourceLabel: string
  releaseNotes: string | null; lastSourceError: string | null
}
export type UpdateCheckResult = IpcResult<UpdateCheckResultData>
export interface UpdateDownloadRequest { version: string }
export interface UpdateDownloadResultData {
  assetName: string; stagedPath: string; fileSize: number
  sha256Verified: boolean; previousVersion: string | null
}
export type UpdateDownloadResult = IpcResult<UpdateDownloadResultData>
export interface UpdateInstallRequest { silent?: boolean }  // default true
export interface UpdateInstallResultData { spawned: boolean; willQuit: boolean }
export type UpdateInstallResult = IpcResult<UpdateInstallResultData>
export type UpdatePhase = 'idle'|'checking'|'available'|'downloading'|'ready'|'installing'|'error'
export interface UpdateHistoryEntry { ts: string; event: string; detail?: string }
export interface UpdateStateData {
  phase: UpdatePhase; sourceConfigured: boolean; currentVersion: string
  sourceKind: UpdateSourceKind | null; sourceLabel: string
  latestVersion: string | null; assetName: string | null; stagedPath: string | null
  releaseNotes: string | null; lastCheckedAt: string | null
  lastError: string | null; lastSourceError: string | null; history: UpdateHistoryEntry[]
}
export type UpdateStateResult = IpcResult<UpdateStateData>
export interface UpdateProgressPayload {
  phase: UpdatePhase; copied: number; total: number; percentage: number
}
export interface UpdatesApi {
  updatesCheck(req?: UpdateCheckRequest): Promise<UpdateCheckResult>
  updatesDownload(req: UpdateDownloadRequest): Promise<UpdateDownloadResult>
  updatesInstall(req?: UpdateInstallRequest): Promise<UpdateInstallResult>
  updatesGetState(): Promise<UpdateStateResult>
  onUpdatesProgress(cb: (p: UpdateProgressPayload) => void): () => void
}
