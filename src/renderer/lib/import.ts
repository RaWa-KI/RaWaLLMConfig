// Import-Writeback (Teil C) — neue Import-API: parseImportSource (.json-Bundle
// ODER rohe .md -> Import-Items mit Ziel-Wahl je Eintrag) + applyImportItems
// (schreibt NUR ready-Picks, B1-gehaertet via sanitizeRelTarget). Gate je Item:
// Secret-Guard (secret-bearing -> uebersprungen, owner-only), Pfad-Allowlist auf
// bekannte Config-Wurzeln, Inhalts-Pruefung. Geschrieben wird AUSSCHLIESSLICH
// ueber die Teil-A-Write-API (guard+backup-first); KEIN fs/path, KEIN throw nach
// aussen. Der Main-Guard bleibt die harte Durchsetzung; dieses Gate ist die
// Renderer-Vorpruefung (Skip + Owner-Sichtbarkeit).
// Legacy-API archiviert 2026-06-10 (HR7) im externen Workspace-Archiv
// (Symbolliste im dortigen ARCHIV-INDEX.md).
import type { WriteResult } from '@shared/contract-write'
import { isMarkdownDoc } from '@shared/secret-class'
import {
  isSecretPath,
  isAllowedRoot,
  suggestedRootFor,
  classifyImport,
  sanitizeRelTarget,
  type ImportItem,
  type ImportStatus
} from './import-targets'

export type { ImportItem, ImportStatus } from './import-targets'

export interface ImportResult {
  ok: boolean
  message: string
}

// Secret-/Allowlist-/Ziel-Primitive liegen in import-targets.ts (HR27).
// import.ts orchestriert nur Parse + Writeback ueber die Write-API.

interface BundleEntry {
  path?: unknown
  name?: unknown
  writable?: unknown
  content?: unknown
}

function isBundle(v: unknown): v is { app: string; entries?: unknown } {
  if (typeof v !== 'object' || v === null) return false
  const o = v as Record<string, unknown>
  return typeof o.app === 'string' && o.version !== undefined
}

// Apply-Funktion (Default: Write-API via defaultApplyAdd). Tests injizieren
// einen Sandbox-Apply.
export type ApplyFn = (path: string, content: string) => Promise<WriteResult>

// .md-Erkennung kommt aus @shared/secret-class (isMarkdownDoc, SSOT — nimmt
// Pfade UND nackte Dateinamen). Keine lokale Regex-Kopie mehr (QUAL-NIEDRIG-02).

// Rohe .md -> genau ein Item. KEIN Allowlist/Foreign-Check (es gibt keinen
// realen Quell-Pfad; die Ziel-Wurzel waehlt der Owner per Dropdown). Nur
// Secret- + Inhalts-Pruefung (Contract). suggestedRoot = knownRoots[0].
function markdownItem(name: string, content: string, knownRoots: string[]): ImportItem {
  const root = knownRoots[0] ?? ''
  let status: ImportStatus
  if (isSecretPath(name)) status = 'skipped-secret'
  else if (content.length === 0) status = 'skipped-no-content'
  else status = 'ready'
  return { name, content, sourcePath: undefined, suggestedRoot: root, status }
}

// Bundle-Entry -> Item. sourcePath getragen; voller Gate-Check (Secret -> Foreign
// -> no-content -> ready); suggestedRoot aus der Allowlist-Wurzel des sourcePath.
function bundleItem(e: BundleEntry, knownRoots: string[]): ImportItem | null {
  if (typeof e.path !== 'string') return null
  const sourcePath = e.path
  const name = typeof e.name === 'string' ? e.name : sourcePath
  const hasContent = e.writable === true && typeof e.content === 'string'
  const content = hasContent ? (e.content as string) : ''
  return {
    name,
    content,
    sourcePath,
    suggestedRoot: suggestedRootFor(sourcePath, knownRoots),
    status: classifyImport(sourcePath, hasContent)
  }
}

// Parst .json-Bundle ODER rohe .md -> Import-Items. knownRoots = erlaubte
// Ziel-Wurzeln (Allowlist) fuer suggestedRoot/Dropdown. Kein Write hier.
export async function parseImportSource(
  file: File,
  knownRoots: string[]
): Promise<{ valid: boolean; message: string; items: ImportItem[] }> {
  let text: string
  try {
    text = await file.text()
  } catch {
    return { valid: false, message: 'Import fehlgeschlagen — Datei nicht lesbar', items: [] }
  }
  if (isMarkdownDoc(file.name)) {
    const item = markdownItem(file.name, text, knownRoots)
    return { valid: true, message: item.status === 'ready' ? '1 schreibbar' : '0 schreibbar, 1 übersprungen', items: [item] }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return { valid: false, message: 'Import fehlgeschlagen — kein gültiges JSON', items: [] }
  }
  if (!isBundle(parsed)) {
    return { valid: false, message: 'Kein gültiges RaWaLLMConfig-Bundle (Feld app/version fehlt)', items: [] }
  }
  const raw = Array.isArray(parsed.entries) ? (parsed.entries as BundleEntry[]) : []
  const items = raw.map((e) => bundleItem(e, knownRoots)).filter((i): i is ImportItem => i !== null)
  const ready = items.filter((i) => i.status === 'ready').length
  return { valid: true, message: `${ready} schreibbar, ${items.length - ready} übersprungen`, items }
}

// Default-Apply fuer applyImportItems: neue Datei anlegen (action 'add' ->
// Parent-mkdir + Snapshot bei existierendem Ziel). backup-first/guard im Main.
const defaultApplyAdd: ApplyFn = (path, content) => {
  if (typeof window === 'undefined' || !window.electronAPI) {
    return Promise.resolve({ data: null, error: 'Bridge nicht verfuegbar' })
  }
  return window.electronAPI.writeApply({ action: 'add', path, content })
}

// Schreibt NUR ready-Items an chosenRoot + '/' + name ueber die Write-API
// (guard + backup-first). secret/foreign/no-content erreichen diese Funktion nie
// (Dialog uebergibt nur ready-Picks), zusaetzlich re-validiert (Defense-in-Depth):
// ein Pick, der jetzt als Secret/Fremd gilt, wird uebersprungen. Sequentiell;
// stoppt bei Write-Fehler.
export async function applyImportItems(
  picks: Array<{ name: string; content: string; chosenRoot: string }>,
  apply: ApplyFn = defaultApplyAdd
): Promise<ImportResult> {
  let written = 0
  let skipped = 0
  for (const pick of picks) {
    // Relatives Ziel haerten BEVOR der Pfad gebaut wird (B1): Traversal/absolute
    // Praefixe entfernen, sonst koennte ein '..'-name das chosenRoot verlassen,
    // waehrend isAllowedRoot (Segment-Substring) das chosenRoot-Segment noch sieht.
    const relTarget = sanitizeRelTarget(pick.name)
    const target = `${pick.chosenRoot.replace(/[\\/]+$/, '')}/${relTarget}`
    // Re-Validierung: nie an Secret-/Fremdpfad/leeres Ziel/entwerteten Namen schreiben (auch nicht via Pick).
    if (relTarget === '' || isSecretPath(target) || !isAllowedRoot(target) || pick.content.length === 0) {
      skipped += 1
      continue
    }
    const res = await apply(target, pick.content)
    if (res.error) return { ok: false, message: `Writeback gestoppt bei ${pick.name}` }
    written += 1
  }
  // Ehrliche No-Op-Meldung statt Scheinerfolg: nichts geschrieben trotz Picks ist ein Fehler.
  if (written === 0 && picks.length > 0) {
    return { ok: false, message: `Nichts geschrieben — alle ${skipped} Einträge übersprungen (Secret/Fremdpfad/ungültiges Ziel)` }
  }
  const tail = skipped > 0 ? `, ${skipped} übersprungen (Secret/Fremd/leeres Ziel)` : ''
  return { ok: true, message: `${written} Einträge geschrieben${tail}` }
}
