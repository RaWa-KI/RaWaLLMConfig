// mariadb-prefs-store.ts — MariaDB-Adapter hinter PersistencePort.
// Tabelle: prefs(pref_key PK, pref_value TEXT, updated_at TIMESTAMP).
// Tabellenanlage idempotent via CREATE IF NOT EXISTS. Fehler: nur
// error.message, nie error.cause (kann Connection-Infos enthalten).
// KEINE Secret-Werte in Logs.
import type { PersistencePort, PrefsMap, PrefsSetOutcome } from './prefs-store'
import { DEFAULT_PREFS } from './prefs-store'
import type { MariaDbPool } from './mariadb-pool'

// SQL fuer die Prefs-Tabelle (idempotent).
const CREATE_PREFS_TABLE =
  'CREATE TABLE IF NOT EXISTS `prefs` (' +
  '`pref_key` VARCHAR(64) NOT NULL,' +
  '`pref_value` TEXT NOT NULL,' +
  '`updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,' +
  'PRIMARY KEY (`pref_key`)' +
  ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4'

// UPSERT: INSERT ... ON DUPLICATE KEY UPDATE (parametrisiert, kein Injection-Risiko).
const UPSERT_PREF =
  'INSERT INTO `prefs` (`pref_key`, `pref_value`) VALUES (?, ?) ' +
  'ON DUPLICATE KEY UPDATE `pref_value` = VALUES(`pref_value`)'

const SELECT_ALL_PREFS = 'SELECT `pref_key`, `pref_value` FROM `prefs`'

function readError(err: unknown, op: string): Error {
  const msg = err instanceof Error ? err.message : 'unbekannt'
  console.error(`[mariadb-prefs] ${op} fehlgeschlagen:`, msg)
  return new Error('MariaDB-Prefs nicht lesbar')
}

// Tabelle idempotent sicherstellen; CREATE IF NOT EXISTS veraendert keine Daten.
async function ensurePrefsTable(pool: MariaDbPool): Promise<void> {
  await pool.query(CREATE_PREFS_TABLE)
}

// Alle Prefs aus DB laden; mit DEFAULT_PREFS mergen (fehlende Keys -> Default).
async function loadAll(pool: MariaDbPool): Promise<PrefsMap> {
  const rows = await pool.query(SELECT_ALL_PREFS) as Array<{ pref_key: string; pref_value: string }>
  const result: PrefsMap = { ...DEFAULT_PREFS }
  if (Array.isArray(rows)) {
    for (const row of rows) {
      if (typeof row.pref_key === 'string' && typeof row.pref_value === 'string') {
        try {
          result[row.pref_key] = JSON.parse(row.pref_value) as string | number | boolean
        } catch {
          result[row.pref_key] = row.pref_value
        }
      }
    }
  }
  return result
}

// Factory: Tabelle sicherstellen, dann Adapter zurueckgeben.
// Wirft bei Migrations-Fehler — Aufrufer (resolvePrefsStore) faengt und faellt
// auf File-Adapter zurueck.
export async function createMariadbPrefsStore(pool: MariaDbPool): Promise<PersistencePort> {
  await ensurePrefsTable(pool)
  return {
    async getAll(): Promise<PrefsMap> {
      try {
        return await loadAll(pool)
      } catch (err) {
        throw readError(err, 'getAll')
      }
    },

    async get(key: string): Promise<string | number | boolean | undefined> {
      try {
        const all = await loadAll(pool)
        return all[key]
      } catch (err) {
        throw readError(err, 'get')
      }
    },

    async set(key: string, value: string | number | boolean): Promise<PrefsSetOutcome> {
      try {
        const serialized = JSON.stringify(value)
        await pool.query(UPSERT_PREF, [key, serialized])
        return { ok: true, error: null, backupPath: null }
      } catch (err) {
        // Nur message, nie cause (kann Connection-Infos enthalten).
        const msg = err instanceof Error ? err.message : 'mariadb-prefs-set-failed'
        console.error('[mariadb-prefs] set fehlgeschlagen:', msg)
        return { ok: false, error: msg, backupPath: null }
      }
    }
  }
}
