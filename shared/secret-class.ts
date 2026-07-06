// secret-class.ts — Single Source of Truth (SSOT) fuer secret-bearing Pfade,
// mit GETRENNTER Read-/Write-Strenge (P1-Fix). Beide Klassifikatoren leben hier
// (eine Quelle), unterscheiden sich nur in der Strenge:
//
//  - isSecretPathForRead(p)  : NUR echte Secret-WERT-Klassen (settings*.json,
//    .claude.json, .credentials.json, auth.json, config.toml, *.sqlite[3],
//    installation_id, .sandbox-secrets, codex-global-state*, *.env/.env.*,
//    *.key/*.pem/*.secret) + echte Verzeichnis-Segmente /credentials/ und
//    /security/. KEINE breite Basename-Wortheuristik -> legitime Policy-/Agent-/
//    Referenz-Doku (credentials-protection.md, security-agent.md, token-*.md …)
//    bleibt im read-only Dashboard SICHTBAR (Pre-Phase-2-Verhalten).
//
//  - isSecretPathForWrite(p) : = isSecretPathForRead(p) ODER die paranoide
//    Basename-Wortheuristik (secret|token|password|auth|credential|security als
//    Wortgrenze). Write/readFull/import bleiben damit mindestens so streng wie
//    bisher (lieber eine Datei nicht editierbar als ein Leak).
//
// Garantie: ForWrite ⊇ ForRead (Write nie schwaecher als Read). Matching =
// Basename + Suffix + Praefix + Pfadsegment (KEIN blosser Substring). KEIN throw.
//
// Browser-sicher: geteilt von Main + Renderer (@shared) — KEIN node:path, KEIN
// electron, KEIN write-mode. Main re-exportiert via services/secret-guard.ts
// (Pattern: dedupe-key.ts -> @shared/cat-key).

// Exakte Basenames (case-insensitive), die immer secret-bearing sind.
const SECRET_BASENAMES = new Set<string>([
  '.claude.json',
  '.credentials.json',
  'auth.json',
  '.sandbox-secrets',
  'config.toml',
  'installation_id'
])

// Dateiendungen (Suffixe), die nie inhaltlich beschrieben/gelesen werden.
// .env auch als reiner Basename ('.env'); .sqlite mit optionaler Ziffer (-wal/-shm/3).
const SECRET_SUFFIX_RX = /(?:^|\.)(?:env|key|pem|secret)$|\.sqlite\d?$/i

// Basename-Praefixe, die secret-bearing sind (settings*.json, codex-global-state*).
function matchesPrefixClass(base: string): boolean {
  const b = base.toLowerCase()
  // settings.json / settings.local.json / settings.<x>.json
  if (/^settings(\.[^.]+)*\.json$/.test(b)) return true
  // codex-global-state, codex-global-state.json, codex-global-state.lock ...
  if (b.startsWith('codex-global-state')) return true
  return false
}

// Pfadsegmente, die einen Zielpfad als secret-bearing markieren (z.B. .../credentials/x).
// NUR echte Secret-WERT-Verzeichnisse — exakte Ordnernamen (KEIN Substring). Damit
// bleibt `token-effizienz`/`security`-als-Basename-Wort fuer den Read-Layer erlaubt.
const SECRET_SEGMENTS: ReadonlyArray<string> = ['credentials', 'security']

// High-Signal-Woerter im BASENAME als abgegrenzte Wort-Treffer (Wortgrenze ueber
// Nicht-Buchstaben, kein blosser Substring). NUR fuer den WRITE-Layer (paranoid):
// greift `my-token-notes.md`, `password-policy.txt`, `auth-flow.md`, bare
// `credentials`/`security`, aber NICHT `CLAUDE.md`/`SKILL.md`/`token-effizienz`.
// Bewusst STRENG: lieber eine Datei nicht editierbar als ein Leak.
const SECRET_WORD_RX =
  /(?:^|[^a-z])(secret|token|password|auth|credential|security)s?(?:[^a-z]|$)/i

// Basename ohne node:path (browser-sicher): Separatoren normalisieren, letztes
// nicht-leeres Segment nehmen (Trailing-Slash-Verhalten wie node:path.basename).
function baseOf(p: string): string {
  const segs = p.replace(/\\/g, '/').split('/').filter(Boolean)
  return segs[segs.length - 1] ?? ''
}

// Pfad in normalisierte Kleinbuchstaben-Segmente zerlegen (/-getrennt).
function segments(p: string): string[] {
  return p.replace(/\\/g, '/').toLowerCase().split('/').filter(Boolean)
}

// True, wenn der Basename eine echte Secret-WERT-Klasse ist (exakt/Suffix/Praefix).
// KEINE Wortheuristik hier — die ist Write-only.
function isSecretValueBasename(base: string): boolean {
  const b = base.toLowerCase()
  if (SECRET_BASENAMES.has(b)) return true
  if (SECRET_SUFFIX_RX.test(b)) return true
  if (matchesPrefixClass(b)) return true
  return false
}

// True, wenn ein PfadSEGMENT (Ordner vor dem Basename) ein echtes Secret-WERT-
// Verzeichnis ist (credentials/security).
function hasSecretSegment(p: string): boolean {
  const dirs = segments(p).slice(0, -1) // letztes Segment ist der Basename
  return dirs.some((seg) => SECRET_SEGMENTS.includes(seg))
}

/**
 * READ-Klassifikation: NUR echte Secret-WERT-Pfade. Genutzt von den 4 Read-
 * Scannern (claude/codex/shared/mcp) sowie weiteren reinen Lese-Guards
 * (watcher-live, dedupe-Diff). Legitime Policy-/Agent-/Referenz-Doku bleibt
 * sichtbar — KEINE Basename-Wortheuristik.
 */
export function isSecretPathForRead(targetPath: string): boolean {
  if (!targetPath) return false
  return isSecretValueBasename(baseOf(targetPath)) || hasSecretSegment(targetPath)
}

/**
 * Markdown-Doku (.md/.markdown/.mdx) ist verwalteter Content, NIE eine Secret-WERT-
 * Datei. Owner-Override ([[app-zeigt-secrets-lokal-owner-override]]): solche Dateien
 * duerfen NICHT ueber Inhalts-Sentinels (detectCredentials/maskSecrets) als
 * „geschuetzt" markiert werden — sonst sperrt ein zufaelliger langer Hash/Token in
 * der Doku das Editieren. Echte Secret-WERTE sind nie .md (settings.json/.env/.key …).
 */
export function isMarkdownDoc(targetPath: string): boolean {
  if (!targetPath) return false
  return /\.(?:md|markdown|mdx)$/i.test(baseOf(targetPath))
}

/**
 * WRITE-Klassifikation: = isSecretPathForRead ODER die paranoide Basename-
 * Wortheuristik. Genutzt von assertWritable/apply, readFull-IPC (Edit-Vorbereitung
 * folgt Write-Strenge) und der Renderer-Import-Vorpruefung. Garantiert
 * mindestens so streng wie ForRead (ForWrite ⊇ ForRead).
 */
export function isSecretPathForWrite(targetPath: string): boolean {
  if (!targetPath) return false
  if (isSecretPathForRead(targetPath)) return true
  // Markdown-Dokumentation (.md/.markdown/.mdx) ist verwaltbarer Content, KEINE
  // Secret-WERT-Datei: die paranoide Basename-Wortheuristik wuerde sonst legitime
  // Policy-/Rules-/Agent-Docs (credentials-protection.md, security-agent.md …)
  // faelschlich vom Editieren UND Reconcile sperren. Owner-Override
  // ([[app-zeigt-secrets-lokal-owner-override]]): Markdown-Docs voll verwaltbar.
  // Echte Secret-WERTE (settings.json/auth.json/config.toml/.env/.key/.pem/.sqlite
  // + /credentials//security/-Segmente) deckt isSecretPathForRead oben bereits ab;
  // dieser Zweig schwaecht KEINE echte Secret-WERT-Datei (die sind nie .md).
  const base = baseOf(targetPath)
  if (/\.(?:md|markdown|mdx)$/i.test(base)) return false
  return SECRET_WORD_RX.test(base)
}
