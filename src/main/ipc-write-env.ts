// ipc-write-env.ts — Self-registering Env-Migrate-Handler (Cluster G).
// Registriert den env:create-Kanal via ipcMain.handle. Muster: ipc-write-reconcile.ts.
// Sicherheitskritisch (Tier 1): Secret-Wert wird im Main-Prozess aus der Datei
// gelesen (env-migrate.ts), NIE via Bridge/Renderer transportiert. Request traegt
// nur {path, varName}. isWriteEnabled()-Gate prueft zuerst (keine Mutation bei OFF).
import { ipcMain } from 'electron'
import { IPC_WRITE } from '@shared/channels-write'
import type { EnvMigrateRequest, EnvMigrateResult } from '@shared/contract-write'
import { envMigrate } from './services/env-migrate'
import { isWriteEnabled, getWriteContext } from './services/write-mode'
import { WRITE_DISABLED_REASON } from './ipc-write'
import { guarded } from './lib/guarded'

// env:create-Handler: validiert, gate-prueft, delegiert an env-migrate.
// Wert NIEMALS im Result/Log — nur varName/varSet/rewritten/backupPath.
function handleEnvCreate(req: EnvMigrateRequest): EnvMigrateResult {
  if (!req || typeof req.path !== 'string' || typeof req.varName !== 'string') {
    return { data: null, error: 'invalid-request' }
  }
  // Schreib-Gate ZUERST: keine Mutation ohne RAWALLM_WRITE_ENABLED.
  if (!isWriteEnabled()) return { data: null, error: WRITE_DISABLED_REASON }
  // Schreib-Kontext durchreichen: backup-first (archiveRoot) + Audit (auditPath)
  // konsistent mit den uebrigen Kanaelen (im Sandbox-Modus confined).
  const ctx = getWriteContext()
  return envMigrate(req, ctx.archiveRoot, ctx.auditPath)
}

/**
 * Env-Migrate-Handler registrieren (self-registering). Genau EINMAL aufrufen
 * (via register-write.ts / safeRegister). Faesst ipc-write.ts nicht an.
 */
export function registerEnvWrite(): void {
  ipcMain.handle(IPC_WRITE.envCreate, (_e, req: EnvMigrateRequest): EnvMigrateResult =>
    guarded('envCreate', () => handleEnvCreate(req))
  )
}
