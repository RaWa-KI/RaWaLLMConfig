// mariadb-pool.ts — Pool-Singleton fuer den MariaDB-Adapter.
// Einmal via createMariaDbPool() aus Env erzeugen, nicht pro Request.
// Teardown: endPool() in index.ts an app.on('before-quit', ...) haengen.
// Treiber-Import bleibt optional fuer den Public-Build.
// KEINE Secret-Werte in Logs — nur Env-Namen und redacted Config.

export interface MariaDbPool {
  query(sql: string, params?: unknown[]): Promise<unknown>
  end(): Promise<void>
}

type MariaDbDriver = {
  createPool(config: {
    database: string
    host: string
    port: number
    user: string
    password: string | undefined
    connectionLimit: number
  }): MariaDbPool
}

const MARIADB_DRIVER = 'mariadb'

let _pool: MariaDbPool | null = null

async function loadMariaDbDriver(): Promise<MariaDbDriver> {
  const runtimeImport = new Function('specifier', 'return import(specifier)') as
    (specifier: string) => Promise<MariaDbDriver>
  return runtimeImport(MARIADB_DRIVER)
}

// Pool initialisieren (lazy, einmalig). Wirft bei fehlender Env oder
// nicht erreichbarer DB — Aufrufer (resolvePrefsStore) faengt und faellt
// auf File-Adapter zurueck.
export async function getPool(): Promise<MariaDbPool> {
  if (_pool) return _pool

  const schema = process.env.RAWALLMCONFIG_MARIADB_SCHEMA
  const user   = process.env.RAWALLMCONFIG_MARIADB_USER
  const pwd    = process.env.RAWALLMCONFIG_MARIADB_PWD
  const host   = process.env.CAUDEX_MARIADB_HOST
  const portRaw = process.env.CAUDEX_MARIADB_PORT

  if (!schema || !user || !host) {
    throw new Error('MariaDB-Env unvollstaendig (schema/user/host fehlen)')
  }

  const port = portRaw ? parseInt(portRaw, 10) : 3306

  const { createPool } = await loadMariaDbDriver()
  const pool = createPool({
    database: schema,
    host,
    port,
    user,
    password: pwd,
    connectionLimit: 3
  })

  // Connect-Probe: DB muss erreichbar sein, sonst Fehler -> File-Fallback.
  await pool.query('SELECT 1')

  _pool = pool
  return _pool
}

// Teardown beim App-Ende (before-quit). Idempotent.
export async function endPool(): Promise<void> {
  if (!_pool) return
  try {
    await _pool.end()
  } catch (err) {
    console.warn('[mariadb-pool] end() fehlgeschlagen:',
      err instanceof Error ? err.message : 'unbekannt')
  } finally {
    _pool = null
  }
}
