// folder-ops-fixtures.ts — Dateibaum-Fixtures fuer Verzeichnis-Operationstests.
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/** Legt einen verschachtelten Test-Ordner mit N Dateien an. */
export function makeTestDir(parent: string, name: string, files: Record<string, string>): string {
  const dir = join(parent, name)
  mkdirSync(dir, { recursive: true })
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(dir, rel)
    mkdirSync(join(dir, rel, '..'), { recursive: true })
    writeFileSync(abs, content, 'utf8')
  }
  return dir
}

/** Zaehlt regulaere Dateien rekursiv (kein Symlink). */
export function countFiles(dir: string): number {
  let n = 0
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, e.name)
    if (e.isDirectory()) n += countFiles(abs)
    else if (e.isFile()) n++
  }
  return n
}

/** SHA-256 einer Datei. */
function hashFile(abs: string): string {
  return createHash('sha256').update(readFileSync(abs)).digest('hex')
}

/** Liest alle rel->hash Eintraege aus einem Verzeichnis. */
export function dirHashes(dir: string, prefix = ''): Map<string, string> {
  const out = new Map<string, string>()
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, e.name)
    const rel = prefix ? `${prefix}/${e.name}` : e.name
    if (e.isDirectory()) {
      for (const [k, v] of dirHashes(abs, rel)) out.set(k, v)
    } else if (e.isFile()) {
      out.set(rel, hashFile(abs))
    }
  }
  return out
}
