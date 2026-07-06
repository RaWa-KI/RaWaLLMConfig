// ipc-sources-wiring.spec.ts — rein statische Verdrahtungs-Pruefung (OSS Teil C):
// fuer JEDEN SourcesApi-Methodennamen MUSS ein Kanal-Konstanten-Eintrag in
// IPC bzw. IPC_WRITE existieren. Kein Electron-Runtime, kein IPC-Roundtrip —
// nur der Vertrag (SourcesApi) gegen die Kanal-Tabellen. Schuetzt vor
// vergessenen/umbenannten Kanaelen ohne App-Start.
import { test, expect } from '@playwright/test'
import { IPC } from '../../shared/channels'
import { IPC_WRITE } from '../../shared/channels-write'
import { setWriteEnabledRuntime } from '../../src/main/services/write-mode'
import { setUserSourceRootsProvider } from '../../src/main/services/config-roots'

// Defensive Test-Isolation (Flaky-Schutz wie secret-guard/config-roots-sources):
// neutralen globalen Schreibmodus + leeren Quellen-Provider sicherstellen, damit
// diese Spec keinen In-App-Toggle/Provider-Leak an parallele Specs im selben
// Worker weitergibt. Rein statische Pruefung — beruehrt sonst keinen Laufzeit-State.
test.beforeEach(() => {
  setWriteEnabledRuntime(null)
  setUserSourceRootsProvider(() => [])
})
test.afterEach(() => {
  setWriteEnabledRuntime(null)
  setUserSourceRootsProvider(() => [])
})

// read-only Methoden -> IPC.*
const readMap: Record<string, string> = {
  listSources: IPC.sourcesList,
  discoverSources: IPC.sourcesDiscover,
  listProviders: IPC.providersList,
  pickFolder: IPC.sourcesPickFolder,
  getOnboardingDone: IPC.sourcesOnboardingGet
}
// gated/onboarding Mutationen -> IPC_WRITE.*
const writeMap: Record<string, string> = {
  addSource: IPC_WRITE.sourcesAdd,
  removeSource: IPC_WRITE.sourcesRemove,
  setSourceEnabled: IPC_WRITE.sourcesSetEnabled,
  setOnboardingDone: IPC_WRITE.sourcesSetOnboarding
}

test('jede read-Methode hat einen nicht-leeren IPC-Kanal', () => {
  for (const [method, channel] of Object.entries(readMap)) {
    expect(typeof channel, `Kanal fuer ${method}`).toBe('string')
    expect(channel.length, `Kanal fuer ${method}`).toBeGreaterThan(0)
  }
})

test('jede write-Methode hat einen nicht-leeren IPC_WRITE-Kanal', () => {
  for (const [method, channel] of Object.entries(writeMap)) {
    expect(typeof channel, `Kanal fuer ${method}`).toBe('string')
    expect(channel.length, `Kanal fuer ${method}`).toBeGreaterThan(0)
  }
})

test('alle 9 SourcesApi-Methoden sind abgedeckt, keine Doppelung', () => {
  const all = [...Object.keys(readMap), ...Object.keys(writeMap)]
  expect(all.length).toBe(9)
  expect(new Set(all).size).toBe(9)
})

test('kein Kanal doppelt zwischen read und write gebunden', () => {
  const channels = [...Object.values(readMap), ...Object.values(writeMap)]
  expect(new Set(channels).size).toBe(channels.length)
})
