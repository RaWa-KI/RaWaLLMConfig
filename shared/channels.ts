// IPC-Kanal-Konstanten — von Preload (Renderer-Bridge) UND ipc.ts (Main) importiert,
// damit beide Seiten garantiert dieselben Namen nutzen (keine Magic-Strings).
export const IPC = {
  configGetAll: 'config:getAll',
  systemGetAreas: 'system:getAreas',
  watcherGetState: 'watcher:getState',
  // Read-Route fuer Watcher-Drilldown (Vollinhalt, secret-guarded)
  watcherReadFull: 'watcher:readFull',
  // read-only Innendatei-Liste (Ordner-Drilldown; nur Name/Groesse/secret-Flag)
  configListDir: 'config:listDir',
  // Versions-Refresh (PERF-HOCH-01): leert den CLI-Versions-Cache im Main
  systemRefreshVersions: 'system:refreshVersions',
  // Endnutzer-Quellen-Verwaltung (OSS Teil C) — read-only Kanaele (kein Gate).
  sourcesList: 'sources:list',
  sourcesDiscover: 'sources:discover',
  providersList: 'providers:list',
  sourcesPickFolder: 'sources:pickFolder',
  sourcesOnboardingGet: 'sources:onboardingDone'
} as const

export type IpcChannel = (typeof IPC)[keyof typeof IPC]

export const IPC_EVENTS = {
  configChanged: 'config:changed'
} as const

export type IpcEventChannel = (typeof IPC_EVENTS)[keyof typeof IPC_EVENTS]
