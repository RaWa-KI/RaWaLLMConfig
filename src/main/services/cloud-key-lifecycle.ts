// cloud-key-lifecycle.ts — D5: duenne Schicht ueber env-migrate.ts. Migriert
// einen Cloud-API-Key (OpenAI/Anthropic/Google) aus einer Config-Datei auf eine
// Windows-User-Env-Variable. KEINE eigene Krypto/spawn-Logik: der gesamte
// Schreib-/Backup-/Audit-Pfad (backup-first HR7/HR20, atomar tmp+rename, kein
// Wert in Log/IPC/Audit) lebt unveraendert in env-migrate.ts — hier nur ueber-
// schichten + Status-Mapping in eine fokussierte Cloud-Key-Status-Form.
//
// Der Secret-Wert wird NIEMALS in Ergebnis/Log/Return gegeben (Leak-Negativtest).
// envMigrate liefert ausschliesslich Namen/Status/Pfade zurueck — diese Schicht
// reicht nur diese weiter, nie den Wert.
//
// Owner-Gate (entschieden): NUR der Env-Var-Pfad wird gebaut. Ein verschluesselter
// OS-Keychain-Store ist bewusst DEFERRED (spaeteres Owner-Gate).
// TODO(O-D1 deferred): verschluesselter OS-Keychain-Store (DPAPI/Credential
// Manager) als alternativer Lifecycle-Pfad — NICHT in dieser Iteration bauen.
import { envMigrate } from './env-migrate'

// Eingabe: Config-Pfad + Ziel-Env-Variablenname. KEIN Wert-Feld (env-migrate
// liest den Wert im Main-Prozess selbst, nie via Bridge).
export interface MigrateCloudKeyInput {
  configPath: string
  varName: string
}

// Optionale Test-Injektion: Sandbox-Archiv/Audit + Fake-setEnv-Recorder, damit
// Specs NIE die reale User-Env mutieren oder powershell.exe spawnen.
export interface MigrateCloudKeyDeps {
  archiveRoot?: string
  auditPath?: string
  setEnv?: (varName: string, value: string) => boolean
}

// Status-Form: NUR Namen/Status/Pfade — NIEMALS der Key-Wert.
export type CloudKeyAction =
  | 'migrated'
  | 'write-disabled'
  | 'invalid-var'
  | 'not-a-secret-path'
  | 'no-secret'
  | 'unsupported-format'
  | 'backup-failed'
  | 'env-set-failed'
  | 'error'

export interface MigrateCloudKeyResult {
  ok: boolean
  varName: string
  action: CloudKeyAction
  backupPath: string | null
}

// Mappt den env-migrate-Fehlertext auf eine fokussierte Cloud-Key-Action.
// (Reine String-Klassifikation; env-migrate bleibt SSoT der Fehlertexte.)
function mapError(error: string): CloudKeyAction {
  if (error.includes('Bearbeiten ist ausgeschaltet')) return 'write-disabled'
  if (error.includes('varName')) return 'invalid-var'
  if (error.includes('not-a-secret-path')) return 'not-a-secret-path'
  if (error.startsWith('unsupported-format')) return 'unsupported-format'
  if (error.includes('no-secret-value-found')) return 'no-secret'
  if (error.startsWith('backup-')) return 'backup-failed'
  if (error.includes('env-set-failed')) return 'env-set-failed'
  return 'error'
}

/**
 * Migriert einen Cloud-API-Key auf eine Env-Variable (backup-first, atomar).
 * Delegiert vollstaendig an envMigrate; gibt NUR Status/Name/Backup-Pfad zurueck,
 * NIE den Wert. Bei jedem Fehlerpfad bleibt die Datei unveraendert (env-migrate
 * schreibt erst nach erfolgreichem Backup + Env-Set).
 */
export function migrateCloudKeyToEnv(
  input: MigrateCloudKeyInput,
  deps: MigrateCloudKeyDeps = {}
): MigrateCloudKeyResult {
  const varName = input?.varName ?? ''
  // setEnv: in Prod undefined -> envMigrate nutzt seinen Default (setUserEnv via
  // PowerShell, kein setx-Inline-Arg). Tests injizieren einen Fake-Recorder.
  const res = deps.setEnv
    ? envMigrate({ path: input.configPath, varName }, deps.archiveRoot, deps.auditPath, deps.setEnv)
    : envMigrate({ path: input.configPath, varName }, deps.archiveRoot, deps.auditPath)
  if (res.error || !res.data) {
    return { ok: false, varName, action: mapError(res.error ?? 'error'), backupPath: null }
  }
  // Erfolg = Env gesetzt UND Config auf ${VAR} umgeschrieben (backup-first lief).
  const ok = res.data.varSet && res.data.rewritten
  return {
    ok,
    varName: res.data.varName,
    action: ok ? 'migrated' : 'error',
    backupPath: res.data.backupPath
  }
}
