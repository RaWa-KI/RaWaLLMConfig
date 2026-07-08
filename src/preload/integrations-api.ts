import type { IpcRenderer } from 'electron'
import { IPC_INTEGRATIONS, type IntegrationsApi } from '@shared/channels-integrations'

export function createIntegrationsApi(ipcRenderer: IpcRenderer): IntegrationsApi {
  return {
    list: () => ipcRenderer.invoke(IPC_INTEGRATIONS.integrationsList),
    probe: (id) => ipcRenderer.invoke(IPC_INTEGRATIONS.integrationsProbe, id),
    setEnabled: (req) => ipcRenderer.invoke(IPC_INTEGRATIONS.integrationsSetEnabled, req),
    setPaused: (req) => ipcRenderer.invoke(IPC_INTEGRATIONS.integrationsSetPaused, req)
  }
}
