// c04-scan-helpers.ts — kleine read-only Helfer fuer isolierte C-04 Scanner.
// Kein Registry-/Shared-Mutate, keine Secret-Wert-Ausgabe.
import fs from 'node:fs'
import path from 'node:path'

const SKIP_DIRS = new Set(['.git', 'node_modules', 'dist', 'out', 'build'])

export function slashPath(value: string): string {
  return value.replace(/\\/g, '/')
}

export function readJsonFile(absPath: string): unknown | null {
  try {
    return JSON.parse(fs.readFileSync(absPath, 'utf8')) as unknown
  } catch {
    return null
  }
}

export function pathExists(absPath: string): boolean {
  try {
    return fs.existsSync(absPath)
  } catch {
    return false
  }
}

export function listFilesDeep(root: string, accept: (fp: string) => boolean): string[] {
  const out: string[] = []
  walk(root, accept, out)
  return out
}

function walk(current: string, accept: (fp: string) => boolean, out: string[]): void {
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(current, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    const fp = path.join(current, entry.name)
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(fp, accept, out)
    } else if (entry.isFile() && accept(fp)) {
      out.push(fp)
    }
  }
}
