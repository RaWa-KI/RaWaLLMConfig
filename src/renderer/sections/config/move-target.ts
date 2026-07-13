// Reine Pfad-/Ziel-Helfer fuer den Verschieben-Dialog (kein React/JSX/Hooks).
// Aus MoveDialog.tsx ausgelagert (HR27 <300 Z): Schnellwahl-Pfadbau, Quell-Pfad
// je Seite, Datenverlust-Schutz (endsOnFolder/ensureFileTarget) und die von der
// Versions-Wahl betroffenen physischen Seiten. Sichtbare Label-Texte bleiben in
// MoveDialog.tsx; hier nur Pfad-Praefixe und Logik.

import {
  normalizePathForCompare,
  rendererPathComparisonPlatformFor,
  splitPathForPlatform,
} from '@shared/path-compare'

export type MvVersion = 'shared' | 'claude' | 'beide'

// Familie -> erkennbares Wurzel-Endsegment in den realen knownPaths. 'claude'
// matcht NUR `.claude`, das NICHT direkt hinter `.shared` liegt (Trunk-Wurzel
// `.shared/.claude` gehoert zur Familie 'shared'). Keine sichtbaren Label-Texte.
export const MV_FAMILY_SEGMENTS: Record<string, string> = {
  shared: '.shared/.claude',
  claude: '.claude',
  codex: '.codex'
}

// Ist der Pfad absolut? Akzeptiert Windows-Laufwerke (C:\…, C:/…), UNC (\\…) und
// POSIX (/…). Kein node:path im Renderer (known-roots-Konvention) -> reine Regex.
export function isAbsolutePath(p: string): boolean {
  const s = p.trim()
  if (!s) return false
  return /^[a-zA-Z]:[\\/]/.test(s) || s.startsWith('\\\\') || s.startsWith('/')
}

// Familien-Wurzel (real, absolut) aus den bekannten Pfaden ableiten. knownPaths
// sind echte absolute Ordnerpfade (Kategorie-Roots + Eintrags-Ordner); aus dem
// ersten, der das Familien-Segment als Pfad-Komponente traegt, wird die Wurzel
// BIS EINSCHLIESSLICH dieses Segments gekappt (analog known-roots.rootOf). Fuer
// 'claude' wird `.shared/.claude` ausgeschlossen (gehoert zu 'shared'). Liefert
// undefined ohne passende reale Wurzel -> Schnellwahl bleibt leer, Confirm via
// isAbsolutePath abgeschaltet.
export function resolveFamilyRoot(
  fam: string,
  knownPaths: string[],
  platform?: string
): string | undefined {
  const seg = MV_FAMILY_SEGMENTS[fam]
  if (!seg) return undefined
  const comparisonPlatform = platform ?? rendererPathComparisonPlatformFor(...knownPaths)
  const wantSegs = normalizePathForCompare(seg, comparisonPlatform).split('/')
  for (const raw of knownPaths) {
    const root = truncateAtFamily(raw, wantSegs, fam, comparisonPlatform)
    if (root) return root
  }
  return undefined
}

// Pfad bei der Familien-Segmentkette kappen (inkl.). Gibt die absolute Wurzel
// im Original-Casing zurueck oder undefined, wenn die Kette nicht als zusammen-
// haengende Komponente vorkommt.
function truncateAtFamily(
  raw: string,
  wantSegs: string[],
  fam: string,
  platform: string
): string | undefined {
  const { prefix, segments: segs } = splitPathForPlatform(raw, platform)
  const comparisonSegments = segs.map((segment) => normalizePathForCompare(segment, platform))
  for (let i = 0; i + wantSegs.length <= comparisonSegments.length; i++) {
    if (wantSegs.some((wanted, offset) => comparisonSegments[i + offset] !== wanted)) continue
    // 'claude' (Einzel-`.claude`) darf nicht das Trunk-`.shared/.claude` treffen.
    if (fam === 'claude' && i > 0 && comparisonSegments[i - 1] === '.shared') continue
    return prefix + segs.slice(0, i + wantSegs.length).join('/')
  }
  return undefined
}

// Quell-Pfad der gewaehlten physischen Seite.
export function srcFor(side: 'shared' | 'claude', sharedPath?: string, claudePath?: string): string | undefined {
  return side === 'shared' ? sharedPath : claudePath
}

// Ziel-Pfad aus Schnellwahl bauen — ABSOLUT via resolveFamilyRoot. Ohne passende
// reale Familien-Wurzel bleibt das Ziel leer (kein relativer Pfad: der Main-
// Write-Guard verlangt absolute Ziele, Finding A). knownRoots = die realen,
// schreibbaren Wurzeln (known-roots.knownRootsFromConfig).
export function buildQuickPath(
  fam: string,
  cat: string,
  kind: 'Datei' | 'Ordner',
  name: string,
  knownRoots: string[],
  platform?: string
): string {
  const comparisonPlatform = platform ?? rendererPathComparisonPlatformFor(...knownRoots)
  const root = resolveFamilyRoot(fam, knownRoots, comparisonPlatform)
  if (!root) return ''
  const base = root + '/' + cat + '/'
  return kind === 'Ordner' ? base + name + '/' : base + name
}

function usesWindowsSeparators(platform: string): boolean {
  return /^win/i.test(platform)
}

// Letztes Pfad-Segment im Plattform-Dialekt — leer bei trailing Separator.
export function lastSegment(
  path: string,
  platform = rendererPathComparisonPlatformFor(path)
): string {
  const i = usesWindowsSeparators(platform)
    ? Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
    : path.lastIndexOf('/')
  return i >= 0 ? path.slice(i + 1) : path
}

// Endet das letzte Segment auf eine echte Datei-Endung (z.B. `.md`, `.json`)?
// Praezisiert die alte `includes('.')`-Heuristik: ein Punkt MITTEN im Ordnernamen
// (`agents.v2`) zaehlt nicht als Endung; ein fuehrender Punkt (`.env`, `.claude`)
// ist KEINE Endung (Dotfile/Dotordner). Endung = `.<nichtleeres-ohne-Punkt>` am
// Segment-Ende, nicht an Position 0.
function hasFileExtension(seg: string, platform: string): boolean {
  return usesWindowsSeparators(platform)
    ? /[^.\\/]\.[^.\\/]+$/.test(seg)
    : /[^./]\.[^./]+$/.test(seg)
}

// Datenverlust-Schutz: zeigt der Pfad auf einen ORDNER statt auf die Ziel-Datei?
// known-paths.ts liefert nur Ordnerpfade (dirname-only); waehlt der Owner so
// einen, fehlt der Dateiname. Treffer (Ordner-Ziel): trailing Separator,
// Allowlist-Treffer, exakter Ziel-Name als Segment (waere Move auf sich selbst)
// oder ein Segment OHNE echte Datei-Endung (hasFileExtension).
export function endsOnFolder(
  path: string,
  name: string,
  knownFolders: Set<string>,
  platform = rendererPathComparisonPlatformFor(path)
): boolean {
  const p = path.trim()
  if (!p) return false
  if (p.endsWith('/') || (usesWindowsSeparators(platform) && p.endsWith('\\'))) return true
  if (knownFolders.has(p)) return true
  const seg = lastSegment(p, platform)
  return seg !== name && !hasFileExtension(seg, platform)
}

// Erzwingt bei kind='Datei' immer ein Datei-Ziel: zeigt der Pfad auf einen
// Ordner, wird '<ordner>/<name>' angehaengt. Ordner-Move bleibt unveraendert.
export function ensureFileTarget(
  path: string,
  name: string,
  kind: 'Datei' | 'Ordner',
  knownFolders: Set<string>,
  platform = rendererPathComparisonPlatformFor(path)
): string {
  if (kind !== 'Datei') return path
  const p = path.trim()
  if (!p || !endsOnFolder(p, name, knownFolders, platform)) return p
  const folder = usesWindowsSeparators(platform)
    ? p.replace(/[\\/]+$/, '')
    : p.replace(/\/+$/, '')
  return folder + '/' + name
}

// Welche physischen Seiten die gewaehlte Versions-Wahl betrifft.
export function versionSides(v: MvVersion, sharedPath?: string, claudePath?: string): Array<'shared' | 'claude'> {
  if (v === 'shared') return sharedPath ? ['shared'] : []
  if (v === 'claude') return claudePath ? ['claude'] : []
  const out: Array<'shared' | 'claude'> = []
  if (sharedPath) out.push('shared')
  if (claudePath) out.push('claude')
  return out
}
