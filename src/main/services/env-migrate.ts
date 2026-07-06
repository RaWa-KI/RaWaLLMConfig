// env-migrate.ts — Env-Anlege-Service (Cluster G, Tier 1, sicherheitskritisch).
// Legt eine Windows-User-Env-Variable via PowerShell [Environment]::SetEnvironmentVariable
// an. NIEMALS setx mit Inline-Wert (Prozesslisten-/History-Leak, HR18).
// Der Secret-Wert wird im Main-Prozess aus der Config-Datei gelesen (nie via Bridge).
// Config-Rewrite: Secret-Zeile -> ${VAR} (backup-first, isWriteEnabled()-gated).
// Kein Secret-Wert in Logs, IPC-Result, Audit oder Rueckgabe.
//
// SICHERHEIT: Secret-Wert wird via spawnSync-stdin uebergeben (kein Shell-Arg,
// kein Prozesslisten-Leak). varName ist vorab auf [A-Z_][A-Z0-9_]+ validiert
// (keine Shell-Injection moeglich). execSync/exec sind verboten (HR18, Plugin-Check).
import { readFileSync, writeFileSync, renameSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { spawnSync } from 'node:child_process'
import type { IpcResult } from '@shared/contract'
import type { EnvMigrateRequest, EnvMigrateResultData } from '@shared/contract-write'
import { exportSnapshot } from './backup'
import { findCredentialLine } from './credential-detect'
import { isSecretPathForRead } from './secret-guard'
import { DEFAULT_ARCHIVE_ROOT } from './backup'
import { isWriteEnabled, WRITE_DISABLED_REASON } from './write-mode'
import { appendAudit, makeAuditEntry, DEFAULT_AUDIT_PATH } from './audit-log'

export type EnvMigrateResult = IpcResult<EnvMigrateResultData>

// Validiert varName: nur Grossbuchstaben, Ziffern, Unterstrich; max 128 Zeichen.
// Garantiert keine Shell-Injection durch varName.
function isValidVarName(name: string): boolean {
  return /^[A-Z_][A-Z0-9_]{0,127}$/.test(name)
}

// Prueft ob eine Datei existiert und eine regulaere Datei ist.
function isRegularFile(p: string): boolean {
  try { return statSync(p).isFile() } catch { return false }
}

// Liest den Secret-Wert aus der Config-Datei — exakt die Zeile, die auch
// rewriteConfigLine ersetzt (GLEICHER Helfer findCredentialLine, gleicher index;
// nie mehr eine beliebige erste `=`-Zeile wie `model = …` in config.toml).
// JSON-/YAML-':'-Zuweisungen -> Reject statt Zerschreiben. Wert wird NIE geloggt.
// v1-Pin: bewusst nur die ERSTE Credential-Zeile (Multi-Credential -> Knopf
// nach erfolgreicher Migration erneut ausloesen). Export nur fuer Specs.
export function readSecretValue(filePath: string): { value: string } | { reject: string } {
  try {
    const content = readFileSync(filePath, 'utf8')
    const hit = findCredentialLine(content)
    if (hit === null) return { reject: 'no-secret-value-found' }
    if ('reject' in hit) return { reject: 'unsupported-format: nur KEY=VALUE migrierbar' }
    return { value: hit.value }
  } catch {
    return { reject: 'no-secret-value-found' }
  }
}

// Setzt Windows-User-Env via spawnSync + PowerShell stdin.
// Wert wird als stdin-Eingabe uebergeben — erscheint NICHT in der Prozessliste
// (kein Shell-Argument, kein Inline-Wert in -Command). varName ist vorab
// als [A-Z_][A-Z0-9_]+ validiert (keine Injection moeglich).
// Das PowerShell-Skript liest den Wert aus $input (stdin-Pipeline).
function setUserEnv(varName: string, value: string): boolean {
  try {
    // PS-Skript liest Wert aus stdin ($input), nicht aus Argument-String.
    // varName ist hier sicher (validierter Bezeichner, kein Sonderzeichen).
    const psScript = `$val = $input | Out-String; $val = $val.TrimEnd([char]0x0a,[char]0x0d); [Environment]::SetEnvironmentVariable('${varName}', $val, 'User')`
    const result = spawnSync(
      'powershell.exe',
      ['-NonInteractive', '-NoProfile', '-Command', psScript],
      {
        input: value,       // Wert via stdin, kein Shell-Argument
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 10_000,
        windowsHide: true   // kein sichtbares Konsolenfenster
      }
    )
    return result.status === 0 && !result.error
  } catch {
    return false
  }
}

function unsetUserEnv(varName: string): boolean {
  try {
    const psScript = `[Environment]::SetEnvironmentVariable('${varName}', $null, 'User')`
    const result = spawnSync('powershell.exe', ['-NonInteractive', '-NoProfile', '-Command', psScript], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 10_000,
      windowsHide: true
    })
    return result.status === 0 && !result.error
  } catch {
    return false
  }
}

// Ersetzt EXAKT die von findCredentialLine gewaehlte Credential-Zeile durch
// `key=${VAR_NAME}` — dieselbe Zeile, deren Wert readSecretValue geliefert hat
// (gemeinsamer Helfer, gleicher index). Schreibt atomar via tmp-Datei im
// Zielverzeichnis + renameSync (kein Corruption-Risiko bei Crash zwischen
// Truncate und Write). Export nur fuer Specs.
export function rewriteConfigLine(filePath: string, varName: string): boolean {
  try {
    const raw = readFileSync(filePath, 'utf8')
    const hit = findCredentialLine(raw)
    if (hit === null || 'reject' in hit) return false
    const lines = raw.split(/\r?\n/)
    const line = lines[hit.index]
    const eqIdx = line.indexOf('=')
    if (eqIdx < 1) return false
    // v1-Pin: nur die ERSTE Credential-Zeile (siehe findCredentialLine).
    lines[hit.index] = `${line.slice(0, eqIdx).trim()}=\${${varName}}`
    // Atomar: tmp im ZIELVERZEICHNIS schreiben, dann renameSync (POSIX-atomar;
    // auf Windows atomar innerhalb desselben Volumes — kein halbgeschriebenes File).
    const tmp = join(dirname(filePath), `.env-migrate-tmp-${Date.now()}`)
    writeFileSync(tmp, lines.join('\n'), 'utf8')
    renameSync(tmp, filePath)
    return true
  } catch {
    return false
  }
}

// Frueh-Validierung fuer envMigrate: Schreib-Gate, Eingabe, Datei-Guard, Secret-Wert.
// Gibt ein EnvMigrateResult-Fehler oder null zurueck; extrahiert filePath/varName/secretVal.
function validateEnvMigrateReq(
  req: EnvMigrateRequest
): { error: EnvMigrateResult } | { filePath: string; varName: string; secretVal: string } {
  if (!isWriteEnabled()) {
    return { error: { data: null, error: WRITE_DISABLED_REASON } }
  }
  if (!req || typeof req.path !== 'string' || !req.path.trim()) {
    return { error: { data: null, error: 'invalid-request: path fehlt' } }
  }
  if (!req.varName || typeof req.varName !== 'string' || !isValidVarName(req.varName)) {
    return { error: { data: null, error: 'invalid-request: varName ungueltig' } }
  }
  const { path: filePath, varName } = req
  if (!isRegularFile(filePath)) {
    return { error: { data: null, error: 'path-not-a-file' } }
  }
  if (!isSecretPathForRead(filePath)) {
    return { error: { data: null, error: 'not-a-secret-path' } }
  }
  // Reject-Reihenfolge: `unsupported-format` (JSON/YAML-':') kommt VOR
  // `no-secret-value-found` — beides liefert readSecretValue distinkt.
  const secret = readSecretValue(filePath)
  if ('reject' in secret) {
    return { error: { data: null, error: secret.reject } }
  }
  return { filePath, varName, secretVal: secret.value }
}

/**
 * Env-Anlege-Service: liest Secret-Wert aus Datei, setzt User-Env via PowerShell,
 * schreibt Config auf ${VAR} um (backup-first). Wert NIEMALS im Ergebnis.
 *
 * Ablauf:
 * 0+1+2+3. Schreib-Gate, Eingabe-Validierung, Secret-Guard, Secret-Wert-Lesen →
 *           validateEnvMigrateReq.
 * 4. Pre-Snapshot (backup-first, HR7).
 * 5. setEnv (Default: setUserEnv via PowerShell [Environment]::SetEnvironmentVariable;
 *    Specs injizieren einen Fake-Recorder — NIE reale User-Env-Mutation im Test).
 * 6. Config-Zeile auf ${VAR} umschreiben.
 * 7. Audit NACH erfolgreichem Rewrite (nur Pfad-Name/Status, nie Wert).
 */
export function envMigrate(
  req: EnvMigrateRequest,
  archiveRoot?: string,
  auditPath: string = DEFAULT_AUDIT_PATH,
  setEnv: (varName: string, value: string) => boolean = setUserEnv,
  unsetEnv: (varName: string) => boolean = unsetUserEnv,
  rewriteConfig: (filePath: string, varName: string) => boolean = rewriteConfigLine
): EnvMigrateResult {
  const validated = validateEnvMigrateReq(req)
  if ('error' in validated) return validated.error
  const { filePath, varName, secretVal } = validated

  // 4. Pre-Snapshot (backup-first, HR7) — bricht ab wenn Archiv fehlt oder
  //    snapshotPath leer (Datei existiert, aber kein Snapshot angelegt).
  const root = archiveRoot ?? DEFAULT_ARCHIVE_ROOT
  const snap = exportSnapshot(filePath, root)
  if (snap.error) return { data: null, error: `backup-failed: ${snap.error}` }
  if (!snap.data || !snap.data.snapshotPath) return { data: null, error: 'backup-empty' }
  const backupPath = snap.data.snapshotPath

  // 5. User-Env setzen (Default: PowerShell, kein setx-Inline-Arg; Test: Fake)
  const varSet = setEnv(varName, secretVal)

  // 6. Config-Zeile auf ${VAR} umschreiben (nur bei erfolgreichem Env-Set);
  //    bei Fehler kann der Owner den Anlegen-Knopf erneut ausloesen.
  let rewritten = false
  if (varSet) {
    rewritten = rewriteConfig(filePath, varName)
    // 7. Audit NACH erfolgreichem Config-Rewrite — nur Pfad-NAME/Status, nie Wert.
    if (rewritten) appendAudit(makeAuditEntry('env-migrate', filePath, 'ok'), auditPath)
  }

  if (varSet && !rewritten) {
    const reverted = unsetEnv(varName)
    return {
      data: { varName, varSet: !reverted, rewritten: false, backupPath },
      error: reverted ? 'config-rewrite-failed-env-rolled-back' : 'config-rewrite-failed-env-partial'
    }
  }

  // Wert NIEMALS im Ergebnis — nur Status/Pfade/Namen.
  return {
    data: { varName, varSet, rewritten, backupPath },
    error: varSet ? null : 'env-set-failed'
  }
}
