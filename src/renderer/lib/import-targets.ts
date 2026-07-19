// Import-Ziel-/Normalisierungs-Logik (HR27-Auslagerung aus import.ts). Reine
// Renderer-Vorpruefung: Secret-Klassifikation, Pfad-Allowlist und Ziel-Wurzel-
// Ableitung. KEIN Write, KEIN fs/path — nur String-Heuristik. Single Source der
// Allowlist-Primitive; Secret-Klassifikation kommt aus @shared/secret-class
// (SSOT); import.ts importiert beides hier (kein Duplikat).
import {
  isPathEqualOrUnder,
  normalizePathForCompare,
  rendererPathComparisonPlatformFor,
  splitPathForPlatform,
} from '@shared/path-compare'
import { isSecretPathForWrite } from '@shared/secret-class'

// Status eines Import-Eintrags nach Gate-Klassifikation.
export type ImportStatus = 'ready' | 'skipped-secret' | 'skipped-foreign' | 'skipped-no-content'

// Ein vom Import vorbereiteter Eintrag (Bundle-Entry ODER rohe .md-Datei).
export interface ImportItem {
  name: string           // Basename/Anzeigename
  content: string        // Datei-Inhalt ('' bei no-content)
  sourcePath?: string    // Original-Pfad aus Bundle, falls vorhanden
  suggestedRoot: string  // vorgeschlagene Ziel-Wurzel (Allowlist-Wurzel des sourcePath, sonst knownRoots[0])
  status: ImportStatus
}

// Bekannte Config-Wurzeln (Allowlist-Segmente). Nur Pfade unter diesen Segmenten
// sind schreibbar; alles andere -> skipped-foreign (kein beliebiger absoluter Pfad).
export const ALLOWED_ROOT_SEGMENTS = ['.claude', '.codex', '.shared']

// projectRoot-Segment (.../RaWaLLMConfig). Der Main-Write-Scope
// (config-roots.ConfigRoots) enthaelt ausser den Allowlist-Segmenten auch den
// WS-Root, der KEIN Allowlist-Segment traegt. isAllowedRoot muss diese Wurzel
// mit-akzeptieren, sonst weicht die Renderer-Vorpruefung vom Main-Scope ab und
// verwirft (skipped-foreign) Pfade, die der Main schreiben wuerde (B1). Klein-
// geschrieben; segments() normalisiert plattformgerecht.
export const PROJECT_ROOT_SEGMENT = 'RaWaLLMConfig'

export function segments(p: string, platform: string = rendererPathComparisonPlatformFor(p)): string[] {
  return splitPathForPlatform(p, platform).segments
    .map((segment) => normalizePathForCompare(segment, platform))
}

// Vorpruefung = Write-Strenge: importiert die Single-Source @shared/secret-class
// — KEINE Kopie (QUAL-HOCH-01-Fix); die .md-Ausnahme gilt damit auch im
// Renderer-Gate (Owner-Override). Main bleibt die harte Durchsetzung; dieses
// Gate ist nur die UX-Vorpruefung (Skip-Anzeige). Export-Name bleibt
// isSecretPath (import.ts nutzt ihn an 4 Stellen).
export const isSecretPath = isSecretPathForWrite

export function isAllowedRoot(p: string, platform: string = rendererPathComparisonPlatformFor(p)): boolean {
  const segs = segments(p, platform)
  const allowedSegments = ALLOWED_ROOT_SEGMENTS.map((segment) => normalizePathForCompare(segment, platform))
  const projectRootSegment = normalizePathForCompare(PROJECT_ROOT_SEGMENT, platform)
  // Main-Scope: .claude/.codex/.shared ODER der projectRoot (.../RaWaLLMConfig).
  return segs.some((segment) => allowedSegments.includes(segment) || segment === projectRootSegment)
}

// Relatives Ziel (Basename/Anzeigename) vor dem Anhaengen an die gewaehlte Wurzel
// haerten: Backslash->Slash, Traversal-Segmente ('.', '..') und fuehrende/leere
// Segmente entfernen, Laufwerks-/absolute Praefixe abstreifen. Ergebnis ist ein
// reiner relativer Pfad OHNE '..' — so kann ein bösartiger/kaputter name das
// chosenRoot nicht verlassen (B1: Renderer-Pendant zu assertInScope im Main).
// Leerer/rein-traversaler name -> '' (Aufrufer skippt dann).
export function sanitizeRelTarget(name: string): string {
  return name
    .replace(/\\/g, '/')
    .split('/')
    .filter((s) => s !== '' && s !== '.' && s !== '..')
    // Laufwerksbuchstabe (z.B. "c:") als erstes Segment verwerfen -> nie absolut.
    .filter((s) => !/^[a-z]:$/i.test(s))
    .join('/')
}

// Ziel-Wurzel-Ableitung fuer ein Bundle-Entry mit Original-Pfad. Strategie:
// (1) die knownRoot waehlen, deren normalisierter Pfad ein echter Praefix des
//     sourcePath ist — bei mehreren der LAENGSTE (`.shared/.claude` schlaegt das
//     blosse `.claude`, weil spezifischer);
// (2) sonst die knownRoot, deren Allowlist-Segment im sourcePath vorkommt;
// (3) sonst Fallback knownRoots[0]. So landet `.codex`-Pfad unter `.codex`,
//     `.shared/.claude`-Pfad unter der `.shared`-Wurzel, nicht unter `.claude`.
export function suggestedRootFor(
  sourcePath: string | undefined,
  knownRoots: string[],
  platform?: string
): string {
  const fallback = knownRoots[0] ?? ''
  if (!sourcePath) return fallback
  const comparisonPlatform = platform ?? rendererPathComparisonPlatformFor(sourcePath, ...knownRoots)
  if (!isAllowedRoot(sourcePath, comparisonPlatform)) return fallback
  const prefixHit = knownRoots
    .filter((root) => isPathEqualOrUnder(sourcePath, root, comparisonPlatform))
    .sort((a, b) => segments(b, comparisonPlatform).length - segments(a, comparisonPlatform).length)[0]
  if (prefixHit) return prefixHit
  const srcSegs = segments(sourcePath, comparisonPlatform)
  const allowedSegments = ALLOWED_ROOT_SEGMENTS.map((segment) => normalizePathForCompare(segment, comparisonPlatform))
  const segment = allowedSegments.find((candidate) => srcSegs.includes(candidate))
  const match = segment
    ? knownRoots.find((root) => segments(root, comparisonPlatform).includes(segment))
    : undefined
  return match ?? fallback
}

// Klassifiziert einen Eintrag (Pfad zur Pruefung, Inhalt fuer no-content).
// `hasContent` entkoppelt die Inhalts-Pruefung (Bundle: writable+content:string;
// rohe .md: nicht-leerer Text).
export function classifyImport(
  checkPath: string,
  hasContent: boolean,
  platform: string = rendererPathComparisonPlatformFor(checkPath)
): ImportStatus {
  if (isSecretPath(checkPath)) return 'skipped-secret'
  if (!isAllowedRoot(checkPath, platform)) return 'skipped-foreign'
  if (!hasContent) return 'skipped-no-content'
  return 'ready'
}
