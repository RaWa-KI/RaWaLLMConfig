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
  // read-only „Zeigen": Pfad im Datei-Manager anzeigen (shell.showItemInFolder,
  // bewusst NICHT shell.openPath — zeigt statt öffnet; Secret-Guard im Handler)
  systemOpenPath: 'system:openPath',
  // Endnutzer-Quellen-Verwaltung (OSS Teil C) — read-only Kanaele (kein Gate).
  sourcesList: 'sources:list',
  sourcesDiscover: 'sources:discover',
  sourcesDiscoverModels: 'sources:discoverModels',
  providersList: 'providers:list',
  sourcesPickFolder: 'sources:pickFolder',
  sourcesOnboardingGet: 'sources:onboardingDone',
  diagnosticsSaveErrorReport: 'diagnostics:saveErrorReport'
} as const

export type IpcChannel = (typeof IPC)[keyof typeof IPC]

// Request/Result fuer system:openPath (WP-F14). Read-only: es fliesst nur ein
// Pfad hin und ein Anzeige-Status zurueck — nie Datei-Inhalt, nie Secret-Werte.
export interface OpenPathRequest {
  path: string
}

// shown: 'file' = Datei im Ordner selektiert; 'folder' = (nur) Ordner gezeigt
// (Secret-Pfade werden nie selektiert/geoeffnet, nur ihr Ordner gezeigt).
export interface OpenPathData {
  shown: 'file' | 'folder'
}

export const IPC_EVENTS = {
  configChanged: 'config:changed'
} as const

export type IpcEventChannel = (typeof IPC_EVENTS)[keyof typeof IPC_EVENTS]
