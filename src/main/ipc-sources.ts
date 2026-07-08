// ipc-sources.ts — SELF-REGISTERING IPC fuer die Endnutzer-Quellen-Verwaltung
// (OSS Teil C). Bindet ALLE Quellen-Kanaele in EINEM Registrar (read + gated
// Mutationen). Genau EINMAL aufrufen (via registerWrite() in register-write.ts);
// kein zweiter ipcMain.handle auf denselben Kanal (sonst Electron-Crash).
// Read-Handler sind ungated (IpcResult-Shape, sanitisiert via guarded/guardedAsync).
// Mutationen pruefen ZUERST isWriteEnabled() und delegieren sonst an den
// source-store (der backup-first + atomar + Audit kapselt). Eine Quelle ist nur
// Ordner-Pfad + Provider-Zuordnung + enabled — NIE ein Secret-Wert.
import { ipcMain } from 'electron'
import { IPC } from '@shared/channels'
import { IPC_WRITE } from '@shared/channels-write'
import type { IpcResult } from '@shared/contract'
import type {
  AddSourceRequest, SetSourceEnabledRequest,
  SourceMutateResult, UserSource, DiscoveryHit,
  ProviderChoice, SourceListResult, DiscoveryResult,
  ProviderChoiceResult, PickFolderResult, OnboardingDoneResult,
  ModelDiscoveryHit, ModelDiscoveryResult
} from '@shared/contract-sources'
import {
  createSourceStore,
  readEnabledSourceRootsByProviderSync,
  readEnabledSourceRootsSync
} from './services/source-store'
import { pickFolder } from './services/folder-picker'
import { listProviderChoices } from './services/providers-list'
import { discoverSources } from './services/source-discovery'
import { discoverLocalModels } from './scan/llm-discovery'
import { setUserSourceProviderRootsProvider, setUserSourceRootsProvider } from './services/config-roots'
import { isWriteEnabled } from './services/write-mode'
import { guarded, guardedAsync } from './lib/guarded'

// Gecachter Store (Default-Pfad, einmal erzeugt). Lazy, damit app.getPath erst
// beim ersten Aufruf (nach app-ready) anfaellt — nie auf Modulebene.
let _store: ReturnType<typeof createSourceStore> | null = null
function store(): ReturnType<typeof createSourceStore> {
  if (!_store) _store = createSourceStore()
  return _store
}

// Zentrale Ablehnung, solange das Schreib-Gate AUS ist. Der aktuelle Bestand
// wird mit zurueckgegeben, damit der Renderer ohne Re-Fetch konsistent bleibt.
async function writeOff(): Promise<SourceMutateResult> {
  return { ok: false, error: 'Schreibmodus ist aus', backupPath: null, sources: await store().listSources() }
}

// Sanitisierter Wrapper fuer Mutationen: SourceMutateResult ist KEIN IpcResult,
// daher eigener try/catch (kein guarded). Fehler -> generische Meldung, kein
// Pfad-/Secret-Leak; der Store kapselt seine Fehler ohnehin bereits intern.
async function guardMutate(
  label: string,
  fn: () => Promise<SourceMutateResult>
): Promise<SourceMutateResult> {
  try {
    return await fn()
  } catch (err) {
    console.error('[ipc-sources]', `${label}: ${err instanceof Error ? err.message : 'fail'}`)
    return { ok: false, error: 'Quellen-Aenderung fehlgeschlagen', backupPath: null, sources: [] }
  }
}

/**
 * Alle Quellen-IPC-Handler registrieren (self-registering). Genau EINMAL aufrufen.
 * Verdrahtet zudem den Allowlist-Provider (setUserSourceRootsProvider), damit
 * hinzugefuegte Quellen in configRootList() (Scanner + Write-Gate) einfliessen.
 */
export function registerSourcesIpc(): void {
  // Allowlist-Provider verdrahten: aktive Nutzer-Quellen speisen configRootList()
  // additiv (sync, graceful -> []). Kein Import-Zyklus (DI ueber config-roots).
  setUserSourceRootsProvider(() => readEnabledSourceRootsSync())
  setUserSourceProviderRootsProvider(() => readEnabledSourceRootsByProviderSync())

  // ── read-only (kein Gate) ────────────────────────────────────────────────
  ipcMain.handle(IPC.sourcesList, (): Promise<SourceListResult> =>
    guardedAsync<UserSource[]>('sources:list', async () => ({ data: await store().listSources(), error: null }))
  )
  ipcMain.handle(IPC.sourcesDiscover, (): IpcResult<DiscoveryHit[]> =>
    guarded<DiscoveryHit[]>('sources:discover', () => ({ data: discoverSources(), error: null }))
  )
  ipcMain.handle(IPC.sourcesDiscoverModels, (): Promise<ModelDiscoveryResult> =>
    guardedAsync<ModelDiscoveryHit[]>('sources:discoverModels', async () => ({ data: await discoverLocalModels(), error: null }))
  )
  ipcMain.handle(IPC.providersList, (): IpcResult<ProviderChoice[]> =>
    guarded<ProviderChoice[]>('providers:list', () => ({ data: listProviderChoices(), error: null }))
  )
  ipcMain.handle(IPC.sourcesPickFolder, (): Promise<PickFolderResult> =>
    guardedAsync<string | null>('sources:pickFolder', async () => ({ data: await pickFolder(), error: null }))
  )
  ipcMain.handle(IPC.sourcesOnboardingGet, (): Promise<OnboardingDoneResult> =>
    guardedAsync<boolean>('sources:onboardingDone', async () => ({ data: await store().getOnboardingDone(), error: null }))
  )

  // ── gated Mutationen (isWriteEnabled() ZUERST) ───────────────────────────
  ipcMain.handle(IPC_WRITE.sourcesAdd, (_e, req: AddSourceRequest): Promise<SourceMutateResult> =>
    guardMutate('sources:add', () => (isWriteEnabled() ? store().addSource(req) : writeOff()))
  )
  ipcMain.handle(IPC_WRITE.sourcesRemove, (_e, id: string): Promise<SourceMutateResult> =>
    guardMutate('sources:remove', () => (isWriteEnabled() ? store().removeSource(id) : writeOff()))
  )
  ipcMain.handle(IPC_WRITE.sourcesSetEnabled, (_e, req: SetSourceEnabledRequest): Promise<SourceMutateResult> =>
    guardMutate('sources:setEnabled', () => (isWriteEnabled() ? store().setSourceEnabled(req) : writeOff()))
  )
  // Onboarding/Skip muss in JEDEM Modus abschliessbar sein -> NICHT gaten.
  ipcMain.handle(IPC_WRITE.sourcesSetOnboarding, (_e, done: boolean): Promise<SourceMutateResult> =>
    guardMutate('sources:setOnboardingDone', () => store().setOnboardingDone(done))
  )
}
