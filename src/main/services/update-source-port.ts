/**
 * update-source-port.ts — Transport-Port fuer Update-Quellen.
 * SRP: Vertrag zwischen Update-Manager und konkreter Quelle.
 */

import type {
  UpdateInfo,
  UpdateRelease,
  UpdateSourceKind,
} from '@shared/contract-updates'

export type { UpdateSourceKind } from '@shared/contract-updates'

export interface UpdateSourceDescription {
  kind: UpdateSourceKind
  configured: boolean
}

export interface UpdateSourceManifestResult {
  release: UpdateRelease | null
  error: string | null
  sourceConfigured: boolean
}

export type MaybePromise<T> = T | Promise<T>

export interface UpdateStageRequest {
  info: UpdateInfo
  destPath: string
  onProgress?: (copied: number, total: number) => void
}

export interface StageInstallerOpts extends UpdateStageRequest {
  updateDir: string
}

export interface StageResult {
  ok: boolean
  sha256Verified: boolean
  error: string | null
}

export interface UpdateSourcePort {
  readonly kind: UpdateSourceKind
  describe(): UpdateSourceDescription
  readManifest(): MaybePromise<UpdateSourceManifestResult>
  stageInstaller(opts: UpdateStageRequest): Promise<StageResult>
}
