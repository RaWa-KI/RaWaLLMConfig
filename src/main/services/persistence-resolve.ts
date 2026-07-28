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
    const missingDriver = isMissingDriverError(err)
    console.warn(
      missingDriver
        ? '[prefs] MariaDB-Treiber nicht gebaut, File-Adapter aktiv:'
        : '[prefs] MariaDB nicht erreichbar, File-Adapter aktiv:',
      err instanceof Error ? err.message : 'unbekannt'
    )
    storeInfo = {
      adapter: 'file',
      fallbackReason: missingDriver
        ? 'Lokaler Datei-Modus (Datenbank-Treiber nicht gebaut)'
        : 'Lokaler Datei-Modus (Datenbank nicht erreichbar)'
    }
    return null
  }
}

// Trennt fehlenden Treiber/Adapter (Paket nicht mitgebaut) von einem echten
// Verbindungsfehler. Der Treiber wird erst zur Laufzeit dynamisch geladen.
function isMissingDriverError(err: unknown): boolean {
  const code = (err as { code?: unknown } | null)?.code
  if (code === 'MODULE_NOT_FOUND' || code === 'ERR_MODULE_NOT_FOUND') return true
  const message = err instanceof Error ? err.message : ''
  return /cannot find (module|package)/i.test(message)
}
