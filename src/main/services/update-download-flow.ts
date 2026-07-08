import type {
  UpdateDownloadResult,
  UpdateInfo,
  UpdateProgressPayload,
} from '@shared/contract-updates'

import type { UpdateSourcePort } from './update-source-port'
import { getDeps } from './update-manager-deps'
import { pushHistory, setError, setPhase, setStagedPath } from './update-state'

export interface StageUpdateInstallerInput {
  source: UpdateSourcePort
  freshInfo: UpdateInfo
  destPath: string
  onProgress: (p: UpdateProgressPayload) => void
}

export interface StagedInstaller {
  sha256Verified: boolean
}

export function requireReadyIntegrity(source: UpdateSourcePort, sha256Verified: boolean): string | null {
  return source.kind === 'https' && !sha256Verified ? 'Pruefsumme nicht verifiziert' : null
}

export async function stageUpdateInstaller(
  input: StageUpdateInstallerInput
): Promise<StagedInstaller | UpdateDownloadResult> {
  const stage = await input.source.stageInstaller({
    info: input.freshInfo,
    destPath: input.destPath,
    onProgress: (copied, total) => {
      const percentage = total > 0 ? Math.round((copied / total) * 100) : 0
      input.onProgress({ phase: 'downloading', copied, total, percentage })
    },
  })

  if (stage.ok) return { sha256Verified: stage.sha256Verified }

  setError(stage.error ?? 'Download fehlgeschlagen')
  console.error('[update-manager] stageInstaller:', stage.error)
  return { data: null, error: stage.error ?? 'Download fehlgeschlagen' }
}

export function finalizeDownload(
  freshInfo: UpdateInfo,
  destPath: string,
  sha256Verified: boolean
): UpdateDownloadResult {
  setStagedPath(destPath)
  setPhase('ready')
  pushHistory('download-complete')

  return {
    data: {
      assetName: freshInfo.assetName,
      stagedPath: destPath,
      fileSize: freshInfo.fileSize,
      sha256Verified,
      previousVersion: getDeps().getVersion(),
    },
    error: null,
  }
}
