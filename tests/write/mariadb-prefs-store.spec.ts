// mariadb-prefs-store.spec.ts — MariaDB-Adapter (createMariadbPrefsStore) mit Mock-Pool.
// KEINE Live-DB. Mock bedient direkte Prefs-Tabellenanlage + Prefs-Queries vollstaendig.
//
// Mock-Ansatz (orientiert an migrations.test.ts FakeQueryable):
//   pool.query(sql, params?) wird je nach SQL-Prefix geroutet:
//   1. "CREATE TABLE IF NOT EXISTS `prefs`" -> [] (eigentliche Prefs-Tabelle)
//   2. "SELECT `pref_key`, `pref_value` FROM `prefs`" -> konfigurierbare Zeilen
//   3. "INSERT INTO `prefs`" -> [] (UPSERT)
//   Unbekannte SQL-Patterns werfen, damit Testfehler sichtbar werden.
import { test, expect } from '@playwright/test'
import { createMariadbPrefsStore } from '../../src/main/services/mariadb-prefs-store'
import { DEFAULT_PREFS } from '../../src/main/services/prefs-store'
import type { PrefValue, PrefsMap } from '../../src/main/services/prefs-store'

// Erfasste Query-Aufrufe fuer Assertions.
interface QueryCall {
  sql: string
  params?: unknown[]
}

// Minimale Pool-Schnittstelle: nur query() benoetigt (ensurePrefsTable + loadAll + UPSERT).
// Typ als `any` um Pool-Typ-Kompatibilitaet zu umgehen — Tests pruefen Verhalten, nicht Typen.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MockPool = any

function makeMockPool(prefsRows: Array<{ pref_key: string; pref_value: string }> = []): {
  pool: MockPool
  calls: QueryCall[]
} {
  const calls: QueryCall[] = []

  const pool: MockPool = {
    query(sql: string, params?: unknown[]): unknown {
      calls.push({ sql, params })

      // Prefs-Tabelle anlegen (CREATE_PREFS_TABLE aus mariadb-prefs-store.ts).
      if (sql.includes('CREATE TABLE IF NOT EXISTS') && sql.includes('`prefs`')) {
        return []
      }

      // Alle Prefs laden (SELECT_ALL_PREFS).
      if (sql.includes('SELECT') && sql.includes('FROM `prefs`')) {
        return prefsRows
      }

      // UPSERT (INSERT ... ON DUPLICATE KEY UPDATE).
      if (sql.includes('INSERT INTO `prefs`')) {
        return []
      }

      throw new Error(`MockPool: unerwartetes SQL — ${sql.slice(0, 80)}`)
    }
  }

  return { pool, calls }
}

// Fehler-Pool: jedes query() wirft.
function makeErrorPool(message: string): MockPool {
  return {
    query(): never {
      throw new Error(message)
    }
  }
}

// -----------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------

test('getAll merged DEFAULT_PREFS mit leerer DB (alle Keys -> Default)', async () => {
  const { pool } = makeMockPool([])
  const store = await createMariadbPrefsStore(pool)
  const all = await store.getAll()
  expect(all).toEqual(DEFAULT_PREFS)
})

test('getAll merged DEFAULT_PREFS mit DB-Zeilen (JSON-geparste Werte)', async () => {
  const { pool } = makeMockPool([
    { pref_key: 'theme', pref_value: JSON.stringify('dunkel') },
    { pref_key: 'density', pref_value: JSON.stringify('compact') }
  ])
  const store = await createMariadbPrefsStore(pool)
  const all = await store.getAll()
  // DB-Zeilen ueberschreiben Defaults.
  expect(all.theme).toBe('dunkel')
  expect(all.density).toBe('compact')
  // Fehlende Keys kommen aus DEFAULT_PREFS.
  expect(all.structure).toBe(DEFAULT_PREFS.structure)
})

test('get liefert DB-Wert wenn vorhanden, sonst Default', async () => {
  const { pool } = makeMockPool([
    { pref_key: 'theme', pref_value: JSON.stringify('anthrazit') }
  ])
  const store = await createMariadbPrefsStore(pool)
  expect(await store.get('theme')).toBe('anthrazit')
  // Nicht in DB -> DEFAULT_PREFS.density
  expect(await store.get('density')).toBe(DEFAULT_PREFS.density)
})

test('set fuehrt parametrisierten UPSERT aus und liefert {ok:true, backupPath:null}', async () => {
  const { pool, calls } = makeMockPool([])
  const store = await createMariadbPrefsStore(pool)
  const out = await store.set('theme', 'espresso')
  expect(out.ok).toBe(true)
  expect(out.backupPath).toBeNull()
  expect(out.error).toBeNull()

  // UPSERT-Call mit korrekten Parametern pruefen.
  const upsert = calls.find(
    (c) => c.sql.includes('INSERT INTO `prefs`') && c.sql.includes('ON DUPLICATE KEY UPDATE')
  )
  expect(upsert).toBeDefined()
  // Erster Param: key, zweiter: JSON.stringify(value).
  expect(upsert!.params).toEqual(['theme', JSON.stringify('espresso')])
})

test('Fehlerpfad: query wirft -> set liefert {ok:false} mit error.message', async () => {
  // Pool der immer wirft — nach erfolgreichem createMariadbPrefsStore (Tabellenanlage via eigenem Pool).
  // Strategie: Store mit funktionierendem Pool erstellen, dann Pool tauschen.
  // Einfacher: separaten Error-Pool direkt beim Erstellen nutzen.
  // Da ensurePrefsTable beim Erstellen laeuft, brauchen wir einen Pool der erst
  // beim set() wirft. Wir erstellen den Store mit Mock-Pool und ersetzen query danach.
  const { pool } = makeMockPool([])
  const store = await createMariadbPrefsStore(pool)

  // Pool-query ab jetzt auf Fehler schalten.
  const errMsg = 'Connection verloren'
  pool.query = (): never => { throw new Error(errMsg) }

  const out = await store.set('structure', 'lines')
  expect(out.ok).toBe(false)
  expect(typeof out.error).toBe('string')
  expect(out.error).toBe(errMsg)
  // Kein error.cause-Leak — nur message verwenden.
  expect(out.error).not.toContain('cause')
})

test('Fehlerpfad: getAll wirft sichtbar statt stille Defaults zu liefern', async () => {
  const { pool } = makeMockPool([])
  const store = await createMariadbPrefsStore(pool)

  // Pool auf Fehler schalten.
  pool.query = (): never => { throw new Error('DB-Fehler') }

  await expect(store.getAll()).rejects.toThrow('MariaDB-Prefs nicht lesbar')
})

test('Fehlerpfad: get wirft sichtbar statt undefined zu liefern', async () => {
  const { pool } = makeMockPool([])
  const store = await createMariadbPrefsStore(pool)

  pool.query = (): never => { throw new Error('DB-Fehler') }

  await expect(store.get('theme')).rejects.toThrow('MariaDB-Prefs nicht lesbar')
})

test('Prefs-Tabelle wird beim Erstellen des Stores direkt/idempotent angelegt', async () => {
  const { pool, calls } = makeMockPool([])
  await createMariadbPrefsStore(pool)

  // Keine caudex-Migrationstabelle mehr: Store legt prefs direkt/idempotent an.
  const hasMigrationTableQuery = calls.some(
    (c) => c.sql.includes('schema_migrations') || c.sql.startsWith('SELECT id, checksum FROM')
  )
  expect(hasMigrationTableQuery).toBe(false)

  // Prefs-Tabelle muss ebenfalls erzeugt worden sein.
  const hasPrefsTable = calls.some(
    (c) => c.sql.includes('CREATE TABLE IF NOT EXISTS') && c.sql.includes('`prefs`')
  )
  expect(hasPrefsTable).toBe(true)
})
