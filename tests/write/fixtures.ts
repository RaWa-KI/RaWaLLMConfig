// fixtures.ts — Sandbox-Harness fuer Write-Tests. ALLE Tests laufen NUR gegen
// temp-Sandbox-Verzeichnisse (os.tmpdir()-Unterordner), NIE gegen reale
// ~/.claude/~/.codex/.shared. CI-Guard `assertNotRealHome` bricht ab, wenn ein
// Zielpfad im realen Home liegt. Kein Produktiv-Mutate.
import { mkdtempSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { tmpdir, homedir } from 'node:os'
import { join } from 'node:path'

// Eine isolierte Sandbox: Ziel-Config-Dir, Archiv-Root, Audit-Pfad — alle temp.
export interface Sandbox {
  root: string
  configDir: string
  archiveRoot: string
  auditPath: string
}

// Realer Home-Pfad (normalisiert) — Tests duerfen ihn NIE als Ziel nutzen.
const REAL_HOME = homedir().replace(/\\/g, '/').toLowerCase()

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

// Neue Sandbox anlegen (temp). configDir + archiveRoot existieren danach.
export function makeSandbox(): Sandbox {
  const root = mkdtempSync(join(tmpdir(), 'rawallm-write-'))
  const configDir = join(root, 'config')
  const archiveRoot = join(root, 'archive')
  const auditPath = join(root, 'audit', 'audit-log.ndjson')
  mkdirSync(configDir, { recursive: true })
  mkdirSync(archiveRoot, { recursive: true })
  assertNotRealHome(configDir)
  assertNotRealHome(archiveRoot)
  return { root, configDir, archiveRoot, auditPath }
}

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
