// dir-compare.ts — Rekursiver Verzeichnis-Vergleich fuer Ordner-Dubletten (read-only).
// Skills/Agents sind VERZEICHNISSE (z.B. .../skills/foo/SKILL.md). Der Einzeldatei-
// Hash-Vergleich aus dedupe.ts kann diese nicht vergleichen ("Inhalt nicht vergleichbar").
// Hier wird pro relativer Datei in der Vereinigung beider Seiten ein Status bestimmt:
//   same | diff (beide vorhanden, SHA-256-Vergleich) | trunk-only | mirror-only.
// Secrets werden NIE ausgegeben — Dateien werden nur gehasht, nie inhaltlich gerendert.
// Symlinks werden uebersprungen (Loop-Schutz). Alle fs-Zugriffe in try/catch; harte
// Fehler -> return null, unlesbare Einzeldateien werden graceful uebersprungen.

import { lstatSync, readdirSync, statSync } from 'node:fs'
import { join, posix } from 'node:path'
import type { DirCompare, DirFileEntry, DirFileStatus } from '@shared/contract'
import { hashFile } from './dedupe-fs'
import { isSecretPathForRead } from './secret-guard'

// Sicherheitsgrenze gegen Endlos-/Riesen-Scans: max Dateien pro Seite.
const MAX_FILES_PER_SIDE = 800

// Status-Sortierreihenfolge: erst diff, dann trunk-only, mirror-only, zuletzt same.
const STATUS_ORDER: Record<DirFileStatus, number> = {
  diff: 0,
  'trunk-only': 1,
  'mirror-only': 2,
  same: 3
}

// Eine Seite des Vergleichs: rel-POSIX-Pfad -> absoluter Dateipfad.
type FileMap = Map<string, string>

/**
 * Vergleicht zwei (bereits absolute) Verzeichnisse rekursiv Datei fuer Datei.
 * Liefert null, wenn ein Pfad kein Verzeichnis ist oder bei hartem fs-Fehler.
 */
export function compareDirs(trunkDirAbs: string, mirrorDirAbs: string): DirCompare | null {
  try {
    if (!isDir(trunkDirAbs) || !isDir(mirrorDirAbs)) return null
    const trunk = listFiles(trunkDirAbs)
    const mirror = listFiles(mirrorDirAbs)
    if (trunk === null || mirror === null) return null
    const truncated = trunk.truncated || mirror.truncated
    const files = buildEntries(trunk.map, mirror.map)
    return assemble(files, truncated)
  } catch (err) {
    fail('compareDirs', err)
    return null
  }
}

/** True, wenn der Pfad ein echtes Verzeichnis ist (graceful bei Fehler). */
function isDir(abs: string): boolean {
  try {
    return statSync(abs).isDirectory()
  } catch (err) {
    fail('isDir', err)
    return false
  }
}

/**
 * Listet rekursiv alle regulaeren Dateien unter `rootAbs` als rel-POSIX-Pfade.
 * Symlinks (Datei wie Ordner) werden uebersprungen. Bei Erreichen des Limits
 * wird truncated=true gesetzt und der Scan abgebrochen. null bei hartem Fehler.
 */
function listFiles(rootAbs: string): { map: FileMap; truncated: boolean } | null {
  const map: FileMap = new Map()
  const state = { truncated: false }
  try {
    walk(rootAbs, '', map, state)
    return { map, truncated: state.truncated }
  } catch (err) {
    fail('listFiles', err)
    return null
  }
}

/** Rekursiver Walk; sammelt Dateien, ueberspringt Symlinks, respektiert Limit. */
function walk(absDir: string, relDir: string, map: FileMap, state: { truncated: boolean }): void {
  if (state.truncated) return
  let dirents: import('node:fs').Dirent[]
  try {
    dirents = readdirSync(absDir, { withFileTypes: true })
  } catch (err) {
    fail('walk:readdir', err)
    return // unlesbares Verzeichnis graceful ueberspringen
  }
  for (const dirent of dirents) {
    if (state.truncated) return
    const absChild = join(absDir, dirent.name)
    const relChild = relDir ? posix.join(relDir, dirent.name) : dirent.name
    if (isSymlink(dirent, absChild)) continue // Loop-Schutz
    if (dirent.isDirectory()) {
      walk(absChild, relChild, map, state)
    } else if (dirent.isFile()) {
      if (map.size >= MAX_FILES_PER_SIDE) {
        state.truncated = true
        return
      }
      map.set(relChild, absChild)
    }
  }
}

/** True bei Symlink — per Dirent-Flag, mit lstat-Fallback (Loop-Schutz). */
function isSymlink(dirent: import('node:fs').Dirent, abs: string): boolean {
  try {
    if (dirent.isSymbolicLink()) return true
    return lstatSync(abs).isSymbolicLink()
  } catch (err) {
    fail('isSymlink', err)
    return true // im Zweifel ueberspringen statt folgen
  }
}

/** Bildet je rel-Pfad der Vereinigung beider Seiten einen DirFileEntry. */
function buildEntries(trunk: FileMap, mirror: FileMap): DirFileEntry[] {
  const rels = new Set<string>([...trunk.keys(), ...mirror.keys()])
  const entries: DirFileEntry[] = []
  for (const rel of rels) {
    const tAbs = trunk.get(rel)
    const mAbs = mirror.get(rel)
    entries.push(makeEntry(rel, tAbs, mAbs))
  }
  return entries
}

/** Status + Pfade + secret-Flag fuer einen einzelnen rel-Pfad bestimmen. */
function makeEntry(rel: string, tAbs?: string, mAbs?: string): DirFileEntry {
  const secret = (tAbs ? isSecretPathForRead(tAbs) : false) || (mAbs ? isSecretPathForRead(mAbs) : false)
  let status: DirFileStatus
  if (tAbs && mAbs) {
    const ht = hashFile(tAbs)
    const hm = hashFile(mAbs)
    // Unlesbare Seite -> als 'diff' werten (konservativ, nie faelschlich 'same').
    status = ht !== null && hm !== null && ht === hm ? 'same' : 'diff'
  } else if (tAbs) {
    status = 'trunk-only'
  } else {
    status = 'mirror-only'
  }
  return { rel, status, trunkPath: tAbs, mirrorPath: mAbs, secret }
}

/** Sortiert (Status, dann alphabetisch) und berechnet die Zaehler. */
function assemble(files: DirFileEntry[], truncated: boolean): DirCompare {
  files.sort((a, b) => {
    const so = STATUS_ORDER[a.status] - STATUS_ORDER[b.status]
    return so !== 0 ? so : a.rel.localeCompare(b.rel)
  })
  const sameCount = files.filter((f) => f.status === 'same').length
  const diffCount = files.filter((f) => f.status === 'diff').length
  const trunkOnlyCount = files.filter((f) => f.status === 'trunk-only').length
  const mirrorOnlyCount = files.filter((f) => f.status === 'mirror-only').length
  const out: DirCompare = { files, sameCount, diffCount, trunkOnlyCount, mirrorOnlyCount }
  if (truncated) out.truncated = true
  return out
}

/** Einheitliches stderr-Logging ohne Secret-/Wert-Ausgabe. */
function fail(where: string, err: unknown): void {
  console.error(`[scan:dir-compare:${where}]`, err instanceof Error ? err.message : 'unbekannt')
}
