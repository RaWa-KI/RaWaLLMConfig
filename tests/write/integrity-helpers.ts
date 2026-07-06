// integrity-helpers.ts — Gemeinsame Hilfsfunktionen für die 4 Integrity-Specs.
// Kein beforeEach — jeder Test ruft makeSandbox() selbst.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { assertNotRealHome } from './fixtures'
import type { Sandbox } from './fixtures'
import type { IntegrityApplyOptions } from '../../src/main/services/integrity/apply-integrity'

// Kontext-Objekt für alle integrity-Service-Aufrufe.
export function ctx(sb: Sandbox, extra?: Partial<IntegrityApplyOptions>): IntegrityApplyOptions {
  return {
    archiveRoot: sb.archiveRoot,
    auditPath: sb.auditPath,
    allowedRoots: [sb.configDir],
    ...extra
  }
}

// Pfad-Separatoren auf Slash normieren (für plattformübergreifende Assertions).
export function slash(p: string): string {
  return p.replace(/\\/g, '/')
}

// Formunabhängiger Vergleich: JSON-escaped (\\) und native Backslashes → Slash.
export function norm(p: string): string {
  return p.replace(/\\\\/g, '/').replace(/\\/g, '/')
}

// Datei anlegen (inkl. Elternordner), Guard gegen echtes Home.
export function writeText(path: string, text: string): void {
  assertNotRealHome(path)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, text, 'utf8')
}

// Datei lesen, Guard gegen echtes Home.
export function readText(path: string): string {
  assertNotRealHome(path)
  return readFileSync(path, 'utf8')
}

// Governance-Dependencies-JSON anlegen (canonical_source + loader_path).
export function writeDeps(
  path: string,
  name: string,
  source: string
): void {
  writeText(
    path,
    JSON.stringify({ skills: { [name]: { canonical_source: source, loader_path: source } } }, null, 2)
  )
}

// Governance-Dependencies-JSON lesen und einen Eintrag zurückgeben.
export function readDep(
  path: string,
  name: string
): { canonical_source: string; loader_path: string } {
  const parsed = JSON.parse(readText(path)) as {
    skills: Record<string, { canonical_source: string; loader_path: string }>
  }
  return parsed.skills[name]
}
