// write-mode.ts — Schreib-/Sandbox-GATE im LIVE-Code (P0-1). DEFAULT = AN
// (Owner-Entscheid): ohne explizites Env ist Bearbeiten eingeschaltet. Nur ein
// ausdrueckliches RAWALLM_WRITE_ENABLED=0 oder =false schaltet aus (Opt-out);
// leer/1/true = AN. Env wird EINMAL beim Modul-Load gelesen. Schutz bleibt: jede
// Mutation laeuft trotz Default-AN ueber backup-first, secret-guard und
// Scope-Pruefung. RAWALLM_SANDBOX_ROOT (geseedete Temp-Sandbox) confined die
// Mutationen auf die Sandbox-Config-Wurzeln; ohne Sandbox gelten die realen
// Config-Wurzeln als allowedRoots. Die Wurzelliste kommt aus configRoots()
// (Single Source) — keine doppelte Pfadliste. KEINE Secret-Werte.
import { join } from 'node:path'
import { DEFAULT_ARCHIVE_ROOT } from './backup'
import { DEFAULT_AUDIT_PATH } from './audit-log'
import { configRootList, activeSandboxRoot } from './config-roots'

// Zentrale, laienverstaendliche Begruendung, solange das Schreib-Gate AUS ist
// (nur per ausdruecklichem Opt-out). EINZIGE Quelle — ipc-write.ts re-exportiert
// dieselbe Konstante (F6); kein zweiter Text, kein „M2". Ohne Secret, ohne Pfad.
export const WRITE_DISABLED_REASON = 'Bearbeiten ist ausgeschaltet (RAWALLM_WRITE_ENABLED=0)'

// Schreib-Kontext, den die mutierenden IPC-Handler an apply/reconcile/prefs
// durchreichen: Archiv-Root, Audit-Pfad, HARTE Wurzel-Allowlist und (im Sandbox-
// Modus) der Sandbox-Root fuer prefs-/Confinement-Detektion.
export interface WriteContext {
  archiveRoot: string
  auditPath: string
  allowedRoots: string[]
  sandboxRoot: string | null
}

// Env EINMAL beim Modul-Load einlesen (kein Re-Read pro Aufruf).
const ENV = {
  enabled: parseEnabled(process.env.RAWALLM_WRITE_ENABLED),
  archiveOverride: nonEmpty(process.env.RAWALLM_ARCHIVE_ROOT),
  auditOverride: nonEmpty(process.env.RAWALLM_AUDIT_PATH)
}

interface WriteModeRuntimeState {
  runtimeFlag: boolean | null
  failedRegistrars: Set<string>
}

// Laufzeit-Override pro Prozess teilen: Tests und Bundler koennen write-mode
// mehrfach laden, Produktionscode erwartet aber einen gemeinsamen Schreibmodus.
const writeModeGlobal = globalThis as typeof globalThis & {
  __rawallmWriteModeRuntime?: WriteModeRuntimeState
}
const runtimeState = writeModeGlobal.__rawallmWriteModeRuntime ??= {
  runtimeFlag: null,
  failedRegistrars: new Set<string>()
}

/**
 * Laufzeit-Schreibmodus setzen (In-App-Toggle). null setzt auf Env-Fallback zurueck.
 * Aendert NICHT backup-first, secret-guard, Sandbox-Confinement oder Atomaritaet.
 */
export function setWriteEnabledRuntime(on: boolean | null): void {
  runtimeState.runtimeFlag = on
}

/** Registrar-Ausfaelle fuer write:status sammeln; nur Gruppennamen, keine Details. */
export function recordWriteRegistrarFailure(name: string): void {
  const safeName = name.trim()
  if (safeName.length > 0) runtimeState.failedRegistrars.add(safeName)
}

/** Test-/Retry-Helfer: Startwarnungen zuruecksetzen. */
export function clearWriteRegistrarFailures(): void {
  runtimeState.failedRegistrars.clear()
}

// DEFAULT = AN (Owner-Entscheid): fehlend/leer -> erlaubt. NUR ausdrueckliches
// '0' oder 'false' (case-insensitiv) schaltet aus (Opt-out); alles andere = AN.
function parseEnabled(v: string | undefined): boolean {
  if (!v) return true
  const s = v.trim().toLowerCase()
  if (s.length === 0) return true
  return s !== '0' && s !== 'false'
}

// Leere/whitespace-only Env-Werte als "nicht gesetzt" behandeln.
function nonEmpty(v: string | undefined): string | undefined {
  if (!v) return undefined
  const s = v.trim()
  return s.length > 0 ? s : undefined
}

/**
 * Ist Schreiben aktuell erlaubt? Prueft runtimeFlag (In-App-Toggle) zuerst;
 * faellt auf Env-Wert zurueck wenn kein Override gesetzt. DEFAULT = true
 * (Owner-Entscheid; nur RAWALLM_WRITE_ENABLED=0/false schaltet aus). Die
 * mutierenden IPC-Handler pruefen das ZUERST (kein guard/backup/mutate bei false).
 */
export function isWriteEnabled(): boolean {
  return runtimeState.runtimeFlag !== null ? runtimeState.runtimeFlag : ENV.enabled
}

/** Ist ein Sandbox-Root aktiv? Kurzaufruf fuer getWriteStatus. */
function hasSandbox(): boolean {
  return activeSandboxRoot() !== null
}

/**
 * Aktuellen Schreibstatus fuer den Renderer (write:status IPC).
 * reason ist null wenn enabled, sonst der zentrale WRITE_DISABLED_REASON-Text.
 * Kein Secret, kein Pfad im Ergebnis.
 */
export function getWriteStatus(): {
  enabled: boolean
  sandbox: boolean
  reason: string | null
  registrarFailures: string[]
} {
  const enabled = isWriteEnabled()
  return {
    enabled,
    sandbox: hasSandbox(),
    reason: enabled ? null : WRITE_DISABLED_REASON,
    registrarFailures: [...runtimeState.failedRegistrars]
  }
}

/**
 * Schreib-Kontext bauen (nur sinnvoll, wenn isWriteEnabled()===true). allowedRoots
 * kommt IMMER aus configRoots() (Single Source). Im Sandbox-Modus liegen Archiv +
 * Audit unter dem Sandbox-Root (Mutation confined); sonst reale Defaults.
 */
export function getWriteContext(): WriteContext {
  const allowedRoots = configRootList()
  const sandboxRoot = activeSandboxRoot()
  if (sandboxRoot) {
    return {
      archiveRoot: ENV.archiveOverride ?? join(sandboxRoot, '_archive'),
      auditPath: ENV.auditOverride ?? join(sandboxRoot, 'audit-log.jsonl'),
      allowedRoots,
      sandboxRoot
    }
  }
  return {
    archiveRoot: ENV.archiveOverride ?? DEFAULT_ARCHIVE_ROOT,
    auditPath: ENV.auditOverride ?? DEFAULT_AUDIT_PATH,
    allowedRoots,
    sandboxRoot: null
  }
}
