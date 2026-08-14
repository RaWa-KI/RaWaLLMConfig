// dedupe-content-scan.ts — inhaltsbasierte Duplikat-Erkennung (Plan C).
// Unabhaengig von Namen, Flach-Scan und Engine-Merge: echte Dublette = IDENTISCHER
// Inhalt an zwei Orten derselben Tool-Familie. Pipeline nach fdupes-Vorbild:
// (1) rekursiver Walk NUR ueber die Kategorie-Unterbaeume der Familien-Wurzeln
// (Basis + Nutzer-Zusatzquellen), (2) Groessen-Buckets, (3) SHA-256 nur bei
// Gleichgroesse, (4) Hash-Gruppen >= 2 Pfade -> Paare -> buildDuplicateSet.
// Begriffstrennung: identischer Inhalt = Dublette (hier); gleicher Name mit
// abweichendem Inhalt ueber Provider = Drift-Relation (eigene Sicht).
// Ausschluesse: Secret-Pfade (Secret-Gate), _memory, Punkt-Dateien/-Ordner,
// Links/Junctions (werden nicht gefolgt), 0-Byte- und Oversize-Dateien,
// node_modules/.git. Read-only; alle fs-Zugriffe in try/catch.
import fs from 'node:fs'
import path from 'node:path'
import type { DuplicateSet, LlmConfig } from '@shared/contract'
import { isManifestPath, manifestParent } from '@shared/manifest-map'
import { isSecretPathForRead, isSecretDirName } from './secret-guard'
import { configRoots, userSourceRootsForProvider } from './config-roots'
import { kimiHome } from '../scan/manifests/kimi-cats'
import { hashFile, MAX_HASH_BYTES } from './dedupe-fs'
import { normalizeCat } from './dedupe-key'
import { buildDuplicateSet, hiddenDecisionKeys, isHiddenByDecision, pushUniqueSet } from './dedupe-set-builder'
import type { DriftDecisionSource } from './drift-relation'
import { createDriftRelationStore } from './drift-relation-store'

// Kategorie-Unterbaeume, in denen Dubletten fachlich relevant sind
// ('instructions' ist compare-only, 'settings' traegt keine Dubletten).
// 'plugins' ist bewusst AUSGENOMMEN (Owner-Befund 2026-08-07, 2899 Rausch-
// Duplikate): Plugin-Baeume sind verwalteter Installationsbestand — die
// Marketplace-Quelle und die installierte Kopie tragen by design identische
// vendored Dateien. Das ist kein nutzer-behebbares Duplikat (Diagnoseregel:
// nur echte Befunde mit Handhabe).
const CAT_DIRS = ['skills', 'agents', 'rules', 'hooks', 'teams'] as const
const SKIP_DIRS = new Set(['_memory', 'node_modules', '.git'])
// Size-Cap kommt aus dedupe-fs (eine Quelle): groessere Dateien werden nicht gehasht.
const MAX_WALK_FILES = 5000 // Sicherheitsgrenze je Familien-Baum (Log + Kappung)

interface FoundFile {
  abs: string
  size: number
  catDir: string
}

/** Ergaenzt je Familie inhaltsbasierte DuplicateSets (haengt an, mutiert data). */
export function findContentDuplicates(
  data: Record<string, LlmConfig>,
  store: DriftDecisionSource = createDriftRelationStore()
): void {
  // Persistierte Drift-Decisions (parity/ignored) verwerfen ihre Sets —
  // gewollte Cross-Root-Paritaets-Kopien sind keine Dubletten (WP-F12F13).
  const hidden = hiddenDecisionKeys(readDecisionsSafe(store))
  const roots = familyRoots()
  for (const [family, cfg] of Object.entries(data)) {
    const famRoots = roots[family]
    if (!cfg || !famRoots || famRoots.length === 0) continue
    try {
      const sets = contentSetsForFamily(family, famRoots, cfg)
      if (!Array.isArray(cfg.duplicates)) cfg.duplicates = []
      for (const set of sets) {
        if (isHiddenByDecision(set, hidden)) continue
        pushUniqueSet(cfg.duplicates, set)
      }
    } catch (err) {
      console.error(`[scan:dedupe-content:${family}]`, err instanceof Error ? err.message.slice(0, 80) : 'unbekannt')
    }
  }
}

/** Decisions robust lesen (Store-Fehler -> keine Ausblendung). */
function readDecisionsSafe(store: DriftDecisionSource) {
  try {
    return store.readDecisions()
  } catch {
    return []
  }
}

/** Familien-Wurzeln: Basis (configRoots) + aktive Nutzer-Zusatzquellen. */
function familyRoots(): Record<string, string[]> {
  const r = configRoots()
  const out: Record<string, string[]> = {}
  const base: Record<string, string | null> = {
    claude: r.claudeHome,
    codex: r.codexHome,
    // HR16-Paritaet: ~/.kimi-code wurde nie auf Dubletten geprueft, obwohl die
    // Familie gescannt wird — echte Kopien blieben dort unsichtbar (F10).
    kimi: kimiHome(),
    shared: r.sharedClaude,
  }
  for (const [family, root] of Object.entries(base)) {
    // Wurzeln deduplizieren (Owner-Befund 2026-08-07): eine Zusatzquelle, die
    // identisch mit der Basis-Wurzel ist (z. B. „Claude (~/.claude)"), liess
    // sonst jeden Baum DOPPELT walken und hashen — doppelte Scan-Kosten.
    const seen = new Set<string>()
    const roots: string[] = []
    for (const r of [...(root ? [root] : []), ...userSourceRootsForProvider(family)]) {
      const key = path.resolve(r).toLowerCase()
      if (!r || seen.has(key)) continue
      seen.add(key)
      roots.push(r)
    }
    if (roots.length > 0) out[family] = roots
  }
  return out
}

/** Alle Content-Sets einer Familie: Walk -> Buckets -> Hash-Gruppen -> Paare. */
function contentSetsForFamily(family: string, roots: string[], cfg: LlmConfig): DuplicateSet[] {
  const files: FoundFile[] = []
  for (const root of roots) for (const catDir of CAT_DIRS) walkCatDir(root, catDir, files)
  const manifestCache = new Map<string, boolean>()
  const sets: DuplicateSet[] = []
  for (const group of hashGroups(files)) {
    for (const [a, b] of anchorPairs(group, manifestCache)) {
      const cat = catIdFor(cfg, a.catDir)
      const set = buildDuplicateSet(
        family, cat, a.name,
        { path: a.anchor, updated: mtimeSafe(a.anchor) },
        { path: b.anchor, updated: mtimeSafe(b.anchor) },
        family as NonNullable<DuplicateSet['mirrorFamily']>,
        'content-hash',
      )
      pushUniqueSet(sets, set)
    }
  }
  return sets
}

/**
 * Rekursiver Walk EINES Kategorie-Baums; sammelt hashbare Dateien (graceful).
 *
 * Deterministisch (F3): Die Eintraege jeder Ebene werden nach Namen sortiert
 * abgearbeitet (readdir-Reihenfolge ist plattform-/dateisystemabhaengig), und
 * die Sicherheitsgrenze MAX_WALK_FILES bricht NICHT mehr den gesamten Restbaum
 * per `return` ab: sie kappt nur noch das Einsammeln weiterer Dateien und
 * beendet den Walk geordnet. Vorher entschied die zufaellige Lesereihenfolge,
 * welche Dateien nach dem Cap noch gefunden wurden — dieselbe Installation
 * lieferte damit wechselnde Duplikat-Listen.
 */
function walkCatDir(root: string, catDir: string, out: FoundFile[]): boolean {
  const base = path.join(root, catDir)
  const stack = [base]
  let walked = 0
  let capped = false
  while (stack.length > 0) {
    const dir = stack.pop()!
    let dirents: fs.Dirent[]
    try {
      dirents = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      continue // fehlende/unlesbare Kategorie-Baeume sind normal (z. B. keine teams/)
    }
    // Stabile Reihenfolge: sortiert abarbeiten, Unterordner in umgekehrter
    // Sortierung auf den Stack legen -> pop() liefert sie wieder sortiert.
    dirents = [...dirents].sort((a, b) => a.name.localeCompare(b.name))
    const subDirs: string[] = []
    for (const d of dirents) {
      if (d.name.startsWith('.')) continue
      if (d.isSymbolicLink()) continue // Links/Junctions nicht folgen (kein Doppelzaehlen)
      const full = path.join(dir, d.name)
      if (d.isDirectory()) {
        // Secret-WERT-Verzeichnisse (credentials/security) gar nicht erst betreten
        // (Defense-in-Depth; die per-Datei-Pruefung unten nutzt den vollen Pfad).
        if (!SKIP_DIRS.has(d.name) && !isSecretDirName(d.name)) subDirs.push(full)
        continue
      }
      // Secret-Pruefung mit dem VOLLEN Pfad: der Klassifikator erkennt Secret-
      // Verzeichnisse (/credentials//security/) an Elternsegmenten, die im blossen
      // Basename fehlen — sonst wuerden Secret-Dateien gehasht und als Dublette
      // ausgeliefert (Basename-only war ein Leak, 2026-08-11).
      if (!d.isFile() || isSecretPathForRead(full)) continue
      if (++walked > MAX_WALK_FILES) {
        // Kappen statt Totalabbruch: die aktuelle Ebene wird noch geordnet
        // beendet, danach laeuft der Walk aus. Ergebnis bleibt reproduzierbar.
        if (!capped) console.error(`[scan:dedupe-content] walk-cap erreicht (${base.slice(-60)})`)
        capped = true
        break
      }
      const size = statSize(full)
      if (size === null || size === 0) continue
      if (size > MAX_HASH_BYTES) continue
      out.push({ abs: full, size, catDir })
    }
    if (capped) break
    // Umgekehrt pushen, damit pop() die Unterordner in Sortierreihenfolge liefert.
    for (let i = subDirs.length - 1; i >= 0; i--) stack.push(subDirs[i])
  }
  return capped
}

function statSize(abs: string): number | null {
  try {
    return fs.statSync(abs).size
  } catch {
    return null
  }
}

/** Groessen-Buckets -> SHA-256 nur bei Gleichgroesse -> Gruppen >= 2 Pfade. */
function hashGroups(files: FoundFile[]): FoundFile[][] {
  const bySize = new Map<number, FoundFile[]>()
  for (const f of files) {
    const list = bySize.get(f.size) ?? []
    list.push(f)
    bySize.set(f.size, list)
  }
  const byHash = new Map<string, FoundFile[]>()
  for (const sameSize of bySize.values()) {
    if (sameSize.length < 2) continue
    for (const f of sameSize) {
      const hash = hashFile(f.abs)
      if (!hash) continue
      const list = byHash.get(hash) ?? []
      list.push(f)
      byHash.set(hash, list)
    }
  }
  return [...byHash.values()].filter((group) => new Set(group.map((f) => f.abs)).size >= 2)
}

// Ein Paar-Anker: Item-Ordner (Manifest-/verschachtelte Datei) oder Einzeldatei.
interface Anchor {
  anchor: string
  name: string
  catDir: string
}

/** Bildet Paare aus einer Hash-Gruppe: Item-Anker mappen, (erster, jeder weitere). */
function anchorPairs(group: FoundFile[], manifestCache: Map<string, boolean>): Array<[Anchor, Anchor]> {
  const anchors: Anchor[] = []
  const seen = new Set<string>()
  for (const f of [...group].sort((x, y) => x.abs.localeCompare(y.abs))) {
    const anchor = itemAnchor(f, manifestCache)
    if (seen.has(anchor.anchor)) continue // identische Zweitdatei im selben Item
    seen.add(anchor.anchor)
    anchors.push(anchor)
  }
  const pairs: Array<[Anchor, Anchor]> = []
  const trunk = anchors[0]
  if (!trunk) return pairs
  for (const other of anchors.slice(1)) pairs.push([trunk, other])
  return pairs
}

/**
 * Mappt eine Datei auf ihren Vergleichs-Anker: den Item-Ordner, wenn sie in
 * einem Manifest-Item liegt (skills/<n>/...), sonst die Datei selbst — ein
 * Unterordner OHNE Manifest (z. B. rules/backup/) ist kein Item, sonst wuerde
 * eine Einzeldatei gegen ein Verzeichnis verglichen.
 */
function itemAnchor(f: FoundFile, manifestCache: Map<string, boolean>): Anchor {
  if (isManifestPath(f.abs)) {
    const parent = manifestParent(f.abs)
    return { anchor: parent, name: path.basename(parent), catDir: f.catDir }
  }
  const parts = path.dirname(f.abs).split(/[\\/]/)
  const catIndex = parts.lastIndexOf(f.catDir)
  const inItemDir = catIndex >= 0 && parts.length > catIndex + 1
  if (inItemDir) {
    const itemDir = parts.slice(0, catIndex + 2).join(path.sep)
    if (hasManifest(itemDir, manifestCache)) {
      return { anchor: itemDir, name: parts[catIndex + 1]!, catDir: f.catDir }
    }
  }
  return { anchor: f.abs, name: path.basename(f.abs), catDir: f.catDir }
}

/** Enthaelt der Ordner eine Manifestdatei (SKILL.md/AGENT.md/...)? Gecacht je Scan. */
function hasManifest(dir: string, cache: Map<string, boolean>): boolean {
  const cached = cache.get(dir)
  if (cached !== undefined) return cached
  let found = false
  try {
    found = fs.readdirSync(dir).some((name) => isManifestPath(path.join(dir, name)))
  } catch {
    found = false
  }
  cache.set(dir, found)
  return found
}

/** Echte Kategorie-id der Familie zur Achse (Fallback: family-catDir). */
function catIdFor(cfg: LlmConfig, catDir: string): string {
  const cat = cfg.categories.find((c) => normalizeCat(c.id) === catDir)
  return cat?.id ?? catDir
}

function mtimeSafe(abs: string): string {
  try {
    return fs.statSync(abs).mtime.toISOString().slice(0, 10)
  } catch {
    return ''
  }
}
