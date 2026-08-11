// fixtures.ts — Sandbox-Harness fuer Write-Tests. ALLE Tests laufen NUR gegen
// temp-Sandbox-Verzeichnisse unter %TEMP%\rawa-suite\rawallm\, NIE gegen reale
// ~/.claude/~/.codex/.shared. CI-Guard `assertNotRealHome` bricht ab, wenn ein
// Zielpfad im realen Home liegt. Kein Produktiv-Mutate.
import { mkdtempSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs'
import { tmpdir, homedir } from 'node:os'
import { join } from 'node:path'
import { test } from '@playwright/test'

// Eine isolierte Sandbox: Ziel-Config-Dir, Archiv-Root, Audit-Pfad — alle temp.
export interface Sandbox {
  root: string
  configDir: string
  archiveRoot: string
  auditPath: string
}

// Realer Home-Pfad (normalisiert) — Tests duerfen ihn NIE als Ziel nutzen.
const REAL_HOME = homedir().replace(/\\/g, '/').toLowerCase()

// Zentraler Suite-Temp-Parent (Sweep-faehig fuer cleanup-user-temp-safe.ps1).
const SANDBOX_PARENT = join(tmpdir(), 'rawa-suite', 'rawallm')
const openSandboxes: string[] = []

// CI-Guard: bricht hart ab, wenn ein Zielpfad im realen Home-Baum liegt.
export function assertNotRealHome(target: string): void {
  const norm = target.replace(/\\/g, '/').toLowerCase()
  // Reale tool-Configs sind tabu; Sandbox liegt im OS-Temp (ausserhalb Home/.claude).
  const forbidden = [`${REAL_HOME}/.claude`, `${REAL_HOME}/.codex`, `${REAL_HOME}/desktop/projekte/.shared`]
  for (const f of forbidden) {
    if (norm.startsWith(f)) {
      throw new Error(`CI-GUARD: Zielpfad im realen Home verboten -> ${f}`)
    }
  }
}

// Sandbox-Root entfernen (idempotent; auch nach Teil-Fail).
function destroySandbox(sb: Sandbox | string): void {
  const root = typeof sb === 'string' ? sb : sb.root
  try {
    rmSync(root, { recursive: true, force: true })
  } catch {
    // ignore: locked files / already gone
  }
  const idx = openSandboxes.indexOf(root)
  if (idx >= 0) openSandboxes.splice(idx, 1)
}

// Neue Sandbox anlegen (temp). configDir + archiveRoot existieren danach.
export function makeSandbox(): Sandbox {
  mkdirSync(SANDBOX_PARENT, { recursive: true })
  const root = mkdtempSync(join(SANDBOX_PARENT, 'rawallm-write-'))
  const configDir = join(root, 'config')
  const archiveRoot = join(root, 'archive')
  const auditPath = join(root, 'audit', 'audit-log.ndjson')
  mkdirSync(configDir, { recursive: true })
  mkdirSync(archiveRoot, { recursive: true })
  assertNotRealHome(configDir)
  assertNotRealHome(archiveRoot)
  openSandboxes.push(root)
  return { root, configDir, archiveRoot, auditPath }
}

// Auto-Cleanup: jede makeSandbox-Sandbox nach dem Playwright-Test entfernen.
test.afterEach(() => {
  while (openSandboxes.length > 0) {
    const root = openSandboxes.pop()
    if (root) destroySandbox(root)
  }
})

// Eine Sandbox-Datei mit Inhalt anlegen und ihren Pfad zurueckgeben.
export function seedFile(sb: Sandbox, name: string, content: string): string {
  const p = join(sb.configDir, name)
  assertNotRealHome(p)
  writeFileSync(p, content, 'utf8')
  return p
}

// Zielpfad in der Sandbox (ohne anzulegen) — fuer add-Tests.
export function sandboxPath(sb: Sandbox, ...parts: string[]): string {
  const p = join(sb.configDir, ...parts)
  assertNotRealHome(p)
  return p
}

// Existenz-Helper (kurz).
export function exists(p: string): boolean {
  return existsSync(p)
}
