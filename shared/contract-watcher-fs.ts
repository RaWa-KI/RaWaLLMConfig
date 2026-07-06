// Metadaten-Contract fuer kuenftige Config-FS-Events. Keine Datei-Inhalte,
// keine Secret-Werte, keine Watcher-Service-Logik.
export type ConfigFamily = 'claude' | 'codex' | 'shared' | 'local'

export type ConfigRootKind = 'userglobal' | 'workspace' | 'shared' | 'project' | 'local'

export interface ConfigChangedPayload {
  families: ConfigFamily[]
  rootKinds: ConfigRootKind[]
  at: string
  reason?: string
}

export interface ConfigWatcherFsApi {
  onConfigChanged(cb: (p: ConfigChangedPayload) => void): () => void
}
