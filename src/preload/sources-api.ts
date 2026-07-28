import type { IpcRenderer } from 'electron'
import { IPC } from '@shared/channels'
import { IPC_WRITE } from '@shared/channels-write'
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

// Endnutzer-Quellen-Verwaltung (OSS Teil C). Read-Methoden ungated; Mutationen
// im Main via isWriteEnabled() gegated. Kein roher ipcRenderer, keine Magic-
// Strings — read auf IPC.*, write auf IPC_WRITE.*. Nie Datei-Inhalt, nie Secret.
export function createSourcesApi(ipcRenderer: IpcRenderer): SourcesApi {
  return {
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
}
