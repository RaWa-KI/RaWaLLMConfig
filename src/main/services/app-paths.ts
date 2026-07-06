// app-paths.ts — portable App-eigene Schreibpfade.
// Electron userData wird nur in Resolvern gelesen; Tests koennen per Env oder
// Injection deterministisch bleiben. Keine Secrets, keine Inhalte.
import { app } from 'electron'
import { homedir } from 'node:os'
import { join } from 'node:path'

export type PathRootResolver = () => string | null | undefined

let injectedUserDataRootResolver: PathRootResolver | null = null
let injectedArchiveRootResolver: PathRootResolver | null = null

function cleanPath(value: string | null | undefined): string | null {
  const cleaned = value?.trim()
  return cleaned && cleaned.length > 0 ? cleaned : null
}

function sandboxRoot(): string | null {
  return cleanPath(process.env.RAWALLM_SANDBOX_ROOT)
}

function electronUserDataRoot(): string | null {
  try {
    return app?.getPath ? cleanPath(app.getPath('userData')) : null
  } catch {
    return null
  }
}

function nodeUserDataRoot(): string {
  const base = process.env.APPDATA
    ?? process.env.XDG_CONFIG_HOME
    ?? (process.platform === 'darwin'
      ? join(homedir(), 'Library', 'Application Support')
      : join(homedir(), '.config'))
  return join(base, 'RaWaLLMConfig')
}

export function setUserDataRootResolver(resolver: PathRootResolver | null): void {
  injectedUserDataRootResolver = resolver
}

export function setArchiveRootResolver(resolver: PathRootResolver | null): void {
  injectedArchiveRootResolver = resolver
}

export function userDataRoot(): string {
  return sandboxRoot()
    ?? cleanPath(injectedUserDataRootResolver?.())
    ?? electronUserDataRoot()
    ?? nodeUserDataRoot()
}

export function archiveRoot(): string {
  return join(userDataRoot(), 'archive')
}

export function auditPath(): string {
  return join(userDataRoot(), '.rawallmconfig', 'audit-log.ndjson')
}

export function prefsPath(): string {
  return join(userDataRoot(), '.rawallmconfig', 'prefs.json')
}

export function resolveDefaultArchiveRoot(): string {
  return cleanPath(process.env.RAWALLM_ARCHIVE_ROOT)
    ?? cleanPath(injectedArchiveRootResolver?.())
    ?? archiveRoot()
}
