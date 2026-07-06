// Write-/neue Read-IPC-Kanal-Konstanten (Phase 2) — von Preload, ipc-write
// (Basis) UND den self-registering Modulen B/C/D/G/H importiert. EINE Quelle,
// keine Magic-Strings. WP-F besitzt diese Datei allein; B/C/D/G/H fassen sie
// NIE an (nur Import). Enthaelt ALLE Kanaele, damit Cluster nur Handler/UI bauen.
export const IPC_WRITE = {
  // Basis (Teil A, registerWriteBase)
  configApply: 'config:apply',
  configReadFull: 'config:readFull',
  // Reconcile (Teil B, registerReconcileWrite — self-registering)
  configReconcile: 'config:reconcile',
  // Prefs (Teil D, registerPrefsWrite — self-registering)
  prefsGet: 'prefs:get',
  prefsSet: 'prefs:set',
  // Explain (Teil D)
  configExplain: 'config:explain',
  // Write-Status/-Toggle (In-App-Schreib-Schalter, Fix #1)
  writeStatus: 'write:status',
  writeSetEnabled: 'write:setEnabled',
  // Dir-Operationen (Teil A — CONTRACT-SSoT)
  writeArchiveDir: 'write:archiveDir',
  writeMoveDir: 'write:moveDir',
  writeReconcileFolder: 'write:reconcileFolder',
  // Umbenennen-/Verschieben-Routen (WP-03; Datei+Ordner, Seitenwahl, Versions-Wahl)
  writeRename: 'write:rename',
  writeMoveVersioned: 'write:moveVersioned',
  writeMoveImpactScan: 'write:moveImpactScan',
  // System-Edit (Cluster C — WP-F besitzt Kanal; C fuellt Handler)
  systemWrite: 'system:write',
  // Env-Migrate (Cluster G — WP-F besitzt Kanal; G fuellt Handler)
  envCreate: 'env:create',
  // Struktur-Scan (Cluster H — WP-F besitzt Kanal; H fuellt Handler)
  strukturScan: 'struktur:scan',
  // Graph-Ingest (Cluster B)
  graphIngest: 'graph:ingest',
  // Graph-Ignore-Scopes (WP-B4): read-only Lesen + gated Schreiben je Scope
  graphReadIgnores: 'graph:readIgnores',
  graphWriteIgnore: 'graph:writeIgnore',
  // Vergleichs-Aggregator (read-only): multi-way Zeilenabgleich ueber N Kandidaten
  compareMulti: 'compare:multi',
  // Archiv/Restore (v1): read-only Liste der Backups + gated Einzeldatei-Restore.
  archiveList: 'archive:list',
  archiveRestore: 'archive:restore',
  // Endnutzer-Quellen-Verwaltung (OSS Teil C) — gated Mutations-Kanaele.
  // setOnboarding ist Onboarding-Abschluss (im Handler bewusst NICHT gegated).
  sourcesAdd: 'sources:add',
  sourcesRemove: 'sources:remove',
  sourcesSetEnabled: 'sources:setEnabled',
  sourcesSetOnboarding: 'sources:setOnboardingDone',
  // Integrity-Transaktionsschicht (W1 — Preview + Apply)
  integrityPreview: 'integrity:preview',
  integrityApply: 'integrity:apply'
} as const

export type IpcWriteChannel = (typeof IPC_WRITE)[keyof typeof IPC_WRITE]
