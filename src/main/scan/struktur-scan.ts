// struktur-scan.ts — Cluster H. Struktur-/Anomalie-Scan: erkennt fehlplatzierte
// oder doppelte Standard-Config-Ordner in 4 definierten Roots (Tiefe max 5).
// Nur Pfad-Existenz, keine Datei-Inhalts-Reads, keine Secret-Pfade oeffnen.
// Self-registering via register-write.ts (safeRegister). Owner-Punkt 11.
import { ipcMain } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { IPC_WRITE } from '@shared/channels-write'
import type { IpcResult } from '@shared/contract'
import type {
  StrukturScanRequest,
  StrukturScanResultData,
  StrukturFinding,
  StrukturFindingStatus
} from '@shared/contract-write'
import { buildRootDefs, CONFIG_SUBDIRS, TOOL_HOME_DIRS, type RootDef } from './struktur-roots'
import { normalizePathForCompare } from '@shared/path-compare'

// Container-Ordner, die beim Walk komplett uebersprungen werden (Treffer DARIN
// sind Rauschen, kein Config-Befund): VCS-/Dependency-/Vault-/Build-/Temp-Baeume.
// Verhindert, dass z.B. ".git/hooks", "node_modules", ".obsidian/plugins",
// "_research/**/.git/hooks", "dist-electron/**/services/rules" als Befund landen.
const IGNORE_CONTAINERS = new Set([
  '.git',
  'node_modules',
  '.obsidian',
  '_research',
  'dist',
  'dist-electron',
  'dist-release',
  'build',
  'out',
  '.tmp'
])

// Pruefen, ob ein Ordnername ein zu ignorierender Container ist. Neben der
// festen Liste zaehlen auch Bare-Git-Mirror-Verzeichnisse (z.B. "FS.git") als
// VCS-Rauschen, damit deren "hooks"-Ordner nicht als Befund erscheinen.
function isIgnoredContainer(nameLower: string): boolean {
  return IGNORE_CONTAINERS.has(nameLower) || nameLower.endsWith('.git')
}

// Pruefen ob ein Ordner existiert (nur stat, kein Inhalt-Read).
function dirExists(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory()
  } catch {
    return false
  }
}

// Kinder eines Verzeichnisses listen (nur Namen, kein Inhalt).
function listDirNames(p: string): string[] {
  try {
    return fs.readdirSync(p).filter((name) => {
      try {
        return fs.statSync(path.join(p, name)).isDirectory()
      } catch {
        return false
      }
    })
  } catch {
    return []
  }
}

// Top-Level-Klassifikation (depth === 1) eines einzelnen Kindeintrags.
// Gibt den Befund zurueck oder null wenn kein Config-Ordner (dann weiter walken).
//
// D022: Die parallelen Baeume der Tool-Homes (~/.claude, ~/.codex,
// .shared/.claude) sind GEWOLLT getrennt. Gleichnamige Unterordner
// (agents/hooks/plugins/rules/skills) ueber verschiedene Tool-Home-Roots hinweg
// sind KEINE Duplikate. Deshalb wird der seen-Schluessel pro Root gefuehrt
// ("<root>::<name>") statt nur ueber den Namen — ein erlaubter Config-Ordner in
// einem anderen Root ist `ok` (parallel), kein `duplicate`. Ein echtes Duplikat
// waere nur derselbe Name zweimal innerhalb desselben Roots, was per
// readdir-Eindeutigkeit auf Top-Level nicht vorkommt.
function classifyTopLevel(
  name: string,
  childPath: string,
  def: RootDef,
  seen: Map<string, string>
): StrukturFinding | null {
  const nameLower = name.toLowerCase()
  const isConfigDir = TOOL_HOME_DIRS.has(nameLower) || CONFIG_SUBDIRS.has(nameLower)
  if (!isConfigDir) return null

  let status: StrukturFindingStatus
  let note: string | undefined

  if (def.warnTopLevel.has(nameLower)) {
    status = def.label === 'Projekte' && TOOL_HOME_DIRS.has(nameLower) ? 'warn' : 'misplaced'
    note = status === 'warn'
      ? `"${name}" in ${def.label} — bekannter PC-/Legacy-Kontext, prüfen statt verschieben`
      : `"${name}" in ${def.label} — erwartet nicht hier (fehlplatziert)`
  } else if (def.allowedTopLevel.has(nameLower)) {
    const seenKey = `${def.label}::${nameLower}`
    const prevRoot = seen.get(seenKey)
    if (prevRoot != null) {
      status = 'duplicate'
      note = `Auch in ${prevRoot} vorhanden (selber Root)`
    } else {
      seen.set(seenKey, def.label)
      status = 'ok'
    }
  } else {
    // Weder erlaubt noch explizit gewarnt → neutral ok (unbekannt).
    status = 'ok'
  }

  return { path: childPath, status, root: def.label, kind: name, note }
}

// Kontext-Objekt fuer walkStep — kapselt veraenderlichen Zustand des Walks.
interface WalkCtx {
  def: RootDef
  maxDepth: number
  findings: StrukturFinding[]
  seen: Map<string, string>
  truncated: boolean
}

// Einen Schritt des rekursiven Walk-Durchlaufs verarbeiten.
// Rekursiver Aufruf laeuft in walkRoot — keine gegenseitige Abhaengigkeit.
function walkStep(dir: string, depth: number, ctx: WalkCtx): void {
  if (depth > ctx.maxDepth) { ctx.truncated = true; return }
  const children = listDirNames(dir)
  for (const name of children) {
    const childPath = path.join(dir, name)
    const nameLower = name.toLowerCase()
    // Container-Rauschen weder berichten noch betreten (VCS/Deps/Build/Temp).
    if (isIgnoredContainer(nameLower)) continue
    if (depth === 1) {
      const finding = classifyTopLevel(name, childPath, ctx.def, ctx.seen)
      if (finding === null) {
        // Kein Config-Ordner — tiefer walken ohne Befund.
        walkStep(childPath, depth + 1, ctx)
      } else {
        ctx.findings.push(finding)
        // Config-Unterordner nicht weiter in die Tiefe walken.
      }
      continue
    }
    // Tiefer als depth 1: nach versteckten Config-Ordnern suchen.
    const isConfigDir = TOOL_HOME_DIRS.has(nameLower) || CONFIG_SUBDIRS.has(nameLower)
    if (isConfigDir) {
      if (ctx.def.knownNestedToolHomes.has(normalizePathForCompare(childPath, process.platform))) continue
      ctx.findings.push({
        path: childPath,
        status: 'warn',
        root: ctx.def.label,
        kind: name,
        note: `Config-Ordner "${name}" tief verschachtelt in ${ctx.def.label} (depth ${depth})`
      })
      continue
    }
    walkStep(childPath, depth + 1, ctx)
  }
}

// Einen Root rekursiv walken (Tiefe max 5); sucht Config-Ordner und klassifiziert.
// Nur Verzeichnis-Existenz, kein Datei-Inhalt. Gibt true zurueck wenn truncated.
function walkRoot(
  rootPath: string,
  def: RootDef,
  maxDepth: number,
  findings: StrukturFinding[],
  seen: Map<string, string>
): boolean {
  if (!dirExists(rootPath)) return false
  const ctx: WalkCtx = { def, maxDepth, findings, seen, truncated: false }
  walkStep(rootPath, 1, ctx)
  return ctx.truncated
}

// Duplikat-Check zweite Runde: NUR echte Duplikate INNERHALB desselben Roots.
// D022: Gleichnamige Config-Ordner ueber verschiedene Tool-Home-Roots hinweg
// (z.B. ~/.codex/agents ↔ .shared/.claude/agents) sind GEWOLLT parallel und
// werden NICHT als Duplikat markiert. Der Schluessel kombiniert daher Root und
// Kind ("<root>::<kind>"); nur derselbe Kind zweimal im selben Root ist ein
// echtes Duplikat (Anomalie).
function markDuplicates(findings: StrukturFinding[]): void {
  const rootKindPaths = new Map<string, StrukturFinding[]>()
  for (const f of findings) {
    if (f.status !== 'ok') continue
    const key = `${f.root}::${f.kind.toLowerCase()}`
    const list = rootKindPaths.get(key) ?? []
    list.push(f)
    rootKindPaths.set(key, list)
  }
  for (const list of rootKindPaths.values()) {
    if (list.length <= 1) continue
    // Erster bleibt ok, weitere Treffer im selben Root sind Duplikate.
    for (let i = 1; i < list.length; i++) {
      list[i].status = 'duplicate'
      list[i].note = `Mehrfach im selben Root ${list[i].root} vorhanden`
    }
  }
}

// Ergebnis-Cache (Teilplan B): der Walk ueber 4 Roots kostet profiliert
// ~1,0–1,7 s Main-CPU und blockiert synchron den Event-Loop. Gecacht wird nur
// ein erfolgreicher Default-Lauf (ohne req.roots-Einschraenkung), verschluesselt
// auf die Root-Signatur (rootsKey) — geaenderte Scan-Roots treffen den Cache
// nicht. req.force umgeht den Cache (explizites „Neu scannen"). Invalidierung
// laeuft NUR ueber markStrukturScanCacheStale() — erfolgreiche Writes +
// debouncte Watcher-Signale (scan-invalidation.ts), analog zum Config-Scan-Cache.
let strukturScanCache: { rootsKey: string; data: StrukturScanResultData } | null = null

export function markStrukturScanCacheStale(): void {
  strukturScanCache = null
}

// Handler-Logik (rein, kein ipcMain-Coupling — leicht testbar).
export function handleStrukturScan(req: StrukturScanRequest | undefined): IpcResult<StrukturScanResultData> {
  try {
    const defs = buildRootDefs()
    const rootsKey = Object.keys(defs).join('|')
    if (!req?.force && !req?.roots && strukturScanCache?.rootsKey === rootsKey) {
      return { data: strukturScanCache.data, error: null }
    }
    const findings: StrukturFinding[] = []
    const seen = new Map<string, string>()
    const MAX_DEPTH = 5
    let truncated = false

    for (const [rootPath, def] of Object.entries(defs)) {
      if (walkRoot(rootPath, def, MAX_DEPTH, findings, seen)) {
        truncated = true
      }
    }

    markDuplicates(findings)

    const data: StrukturScanResultData = {
      findings,
      scannedRoots: Object.keys(defs),
      truncated
    }
    if (!req?.roots) strukturScanCache = { rootsKey, data }
    return { data, error: null }
  } catch (err) {
    console.error('[scan:struktur]', err instanceof Error ? err.message : 'fail')
    return { data: null, error: 'struktur-scan-fehlgeschlagen' }
  }
}

// Self-registering (aufgerufen von register-write.ts → safeRegister('struktur', ...)).
export function registerStrukturScan(): void {
  ipcMain.handle(IPC_WRITE.strukturScan, (_event, req?: StrukturScanRequest) =>
    handleStrukturScan(req)
  )
}
