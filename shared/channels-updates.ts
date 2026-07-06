// shared/channels-updates.ts — Update-Manager-Kanaele. EINE Quelle, keine Magic-Strings. Namespace 'updates:'.
export const IPC_UPDATES = {
  updatesCheck: 'updates:check', updatesDownload: 'updates:download',
  updatesInstall: 'updates:install', updatesGetState: 'updates:getState'
} as const
export type IpcUpdatesChannel = (typeof IPC_UPDATES)[keyof typeof IPC_UPDATES]
export const IPC_UPDATES_EVENTS = { updatesProgress: 'updates:progress' } as const
export type IpcUpdatesEvent = (typeof IPC_UPDATES_EVENTS)[keyof typeof IPC_UPDATES_EVENTS]
