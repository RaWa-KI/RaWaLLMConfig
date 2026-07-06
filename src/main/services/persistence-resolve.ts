// persistence-resolve.ts — Adapter-Auswahl fuer Prefs-Persistenz.
// MariaDB bleibt optional/graceful; ohne vollstaendige Env oder bei Init-Fehler
// wird der lokale File-Adapter verwendet. Logs enthalten nur Status, keine Werte.
import type { PersistencePort } from './prefs-store'
import { createFilePrefsStore } from './prefs-store'

export type PrefsStoreInfo = {
  adapter: 'file' | 'mariadb'
  fallbackReason: string | null
}

let resolvedStore: PersistencePort | null = null
let storeInfo: PrefsStoreInfo = { adapter: 'file', fallbackReason: null }

// Prueft ob MariaDB-Env-Variablen gesetzt sind (nur Namen, nie Werte).
export function hasMariadbEnv(): boolean {
  return Boolean(
    process.env.CAUDEX_MARIADB_HOST &&
    process.env.RAWALLMCONFIG_MARIADB_SCHEMA &&
    process.env.RAWALLMCONFIG_MARIADB_USER
  )
}

export function getPrefsStoreInfo(): PrefsStoreInfo {
  return storeInfo
}

export function setPrefsStoreInfo(info: PrefsStoreInfo): void {
  storeInfo = info
}

export async function resolvePrefsStore(): Promise<PersistencePort> {
  if (resolvedStore) return resolvedStore
  if (hasMariadbEnv()) {
    const mariadbStore = await tryResolveMariadbStore()
    if (mariadbStore) return mariadbStore
  }
  resolvedStore = createFilePrefsStore()
  return resolvedStore
}

async function tryResolveMariadbStore(): Promise<PersistencePort | null> {
  try {
    const { getPool } = await import('./mariadb-pool.js')
    const { createMariadbPrefsStore } = await import('./mariadb-prefs-store.js')
    const pool = await getPool()
    resolvedStore = await createMariadbPrefsStore(pool)
    storeInfo = { adapter: 'mariadb', fallbackReason: null }
    console.info('[prefs] MariaDB-Adapter aktiv')
    return resolvedStore
  } catch (err) {
    console.warn(
      '[prefs] MariaDB-Init fehlgeschlagen, File-Adapter aktiv:',
      err instanceof Error ? err.message : 'unbekannt'
    )
    storeInfo = {
      adapter: 'file',
      fallbackReason: 'Lokaler Datei-Modus (DB nicht erreichbar)'
    }
    return null
  }
}
