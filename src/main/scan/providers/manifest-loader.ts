// manifest-loader.ts (D6) — laedt OWNER-eigene Provider-Manifeste (JSON) aus
// einem Konfig-Verzeichnis, VALIDIERT sie und erzwingt Sicherheits-Leitplanken.
// Anders als die built-in TS-Manifeste (manifests/*.ts) sind Laufzeit-JSON-
// Manifeste UNGEPRUEFTER Owner-Input: sie duerfen NUR die deklarative
// CategorySpec nutzen (JSON kann keine Funktionen/CustomCategory tragen) und
// keine Shell-/Pfad-Injektion, kein fremdes Endpoint-Schema und keinen Inline-
// Secret-Wert einschleusen. Invalide Manifeste werden mit klarem Grund ABGELEHNT
// (rejected) — NIE still uebersprungen. Der Loader wirft NIE: fehlendes
// Verzeichnis oder kaputtes JSON => graceful (leeres Ergebnis bzw. reject).
//
// Verzeichnis-Konvention (sandbox-aware, EINE dokumentierte Quelle):
//   1. RAWALLM_PROVIDERS_DIR (Env) gewinnt, wenn gesetzt (Owner-Override/Tests).
//   2. sonst <configRoots().projectRoot>/rawallm-providers/ — laeuft ueber
//      config-roots.ts und wird daher von RAWALLM_SANDBOX_ROOT automatisch mit
//      verlegt (kein Pfad-Hardcode, keine realRoots()-Duplikation).
// KEINE Secret-WERTE in Logs (nur Dateiname + Grund).
import fs from 'node:fs'
import { join } from 'node:path'
import { configRoots } from '../../services/config-roots'
import type {
  CategorySpec,
  EndpointSpec,
  ProviderManifest,
  ProviderRoot,
} from '@shared/contract-provider'

export interface ManifestLoadResult {
  manifests: ProviderManifest[]
  rejected: { file: string; reason: string }[]
}

// Default-Verzeichnisname unter projectRoot (sandbox-aware via configRoots()).
const PROVIDERS_SUBDIR = 'rawallm-providers'

/** Sandbox-aware Manifest-Verzeichnis: Env-Override sonst <projectRoot>/rawallm-providers. */
export function providersDir(dir?: string): string | null {
  if (dir && dir.trim().length > 0) return dir
  const env = process.env.RAWALLM_PROVIDERS_DIR
  if (env && env.trim().length > 0) return env.trim()
  const projectRoot = configRoots().projectRoot
  return projectRoot ? join(projectRoot, PROVIDERS_SUBDIR) : null
}

// Shell-Metazeichen/Command-Strings: blockiert Injektion in String-Feldern.
const SHELL_META = /[;&|`$<>(){}\n\r\t\\]|\$\(|&&|\|\||\.\.[\\/]/
// Reiner Env-Variablen-NAME (kein Wert, kein Pfad, keine Quotes).
const ENV_NAME = /^[A-Z][A-Z0-9_]*$/
// Slug-id: kleinbuchstaben/zahlen/bindestrich, keine Sonderzeichen.
const SLUG = /^[a-z0-9][a-z0-9-]*$/

// Ein String ist „sauber", wenn nicht-leer und ohne Shell-Meta/Traversal.
function cleanStr(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0 && !SHELL_META.test(v)
}

// Endpoint-URL/Host-Allowlist: localhost-HTTP(S) immer ok, sonst nur https.
// Verboten: file:, javascript:, data:, beliebiges Schema, fremder http-Host.
function endpointUrlOk(url: unknown): boolean {
  if (typeof url !== 'string' || url.length === 0) return false
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return false
  }
  const host = u.hostname.toLowerCase()
  const local = host === '127.0.0.1' || host === 'localhost' || host === '::1'
  if (u.protocol === 'http:') return local // Klartext nur lokal
  if (u.protocol === 'https:') return true // localhost ODER Cloud-API ok
  return false // file:/javascript:/data:/... verboten
}

// Endpoint-Host (falls separat gesetzt) muss localhost oder leer sein; ein
// fremder Klartext-Host umginge die URL-Pruefung sonst nicht.
function endpointHostOk(host: unknown): boolean {
  if (host === undefined) return true
  if (typeof host !== 'string') return false
  const h = host.toLowerCase()
  return h === '127.0.0.1' || h === 'localhost' || h === '::1' || /^[a-z0-9.-]+$/.test(h)
}

// ProviderRoot pruefen: fixedRoot/subPath duerfen keine Traversal/Shell-Strings
// tragen (cleanStr deckt `..\`/`../` und Meta ab). rootKey bleibt typgepruefte
// Enum-Wahl der Engine (resolveRoots), hier nur Anwesenheits-/Form-Check.
function rootOk(r: unknown): r is ProviderRoot {
  if (typeof r !== 'object' || r === null) return false
  const o = r as Record<string, unknown>
  if (o.fixedRoot !== undefined && !cleanStr(o.fixedRoot)) return false
  if (o.subPath !== undefined && !cleanStr(o.subPath)) return false
  if (o.rootKey !== undefined && typeof o.rootKey !== 'string') return false
  return true
}

// Eine deklarative CategorySpec pruefen: KEIN `custom`-Feld (das waere eine
// CustomCategory/Funktion — in JSON unmoeglich, also Manipulationsversuch),
// Pflichtfelder string, scan/parser plausibel, keine Shell-Meta in Strings.
function categoryOk(c: unknown): c is CategorySpec {
  if (typeof c !== 'object' || c === null) return false
  const o = c as Record<string, unknown>
  if ('custom' in o) return false // JSON-Manifest darf NIE custom tragen
  if (!cleanStr(o.id) || !cleanStr(o.label) || !cleanStr(o.icon) || !cleanStr(o.blurb)) return false
  if (o.scan !== 'dir' && o.scan !== 'file') return false
  if (typeof o.parser !== 'string') return false
  for (const k of ['subdir', 'glob', 'desc', 'idPrefix'] as const) {
    if (o[k] !== undefined && !cleanStr(o[k])) return false
  }
  return true
}

// Endpoint-Spec pruefen: url MUSS Allowlist passen, host (falls da) plausibel.
function endpointOk(e: unknown): e is EndpointSpec {
  if (typeof e !== 'object' || e === null) return false
  const o = e as Record<string, unknown>
  if (!cleanStr(o.id) || !cleanStr(o.label)) return false
  if (!endpointUrlOk(o.url)) return false
  if (!endpointHostOk(o.host)) return false
  return true
}

// Validierung EINES geparsten Manifest-Objekts. Liefert null (valide) oder den
// Ablehnungsgrund (Alltagssprache, ohne Secret-Werte).
function validateManifest(m: unknown): string | null {
  if (typeof m !== 'object' || m === null) return 'kein Objekt'
  const o = m as Record<string, unknown>
  if ('custom' in o) return 'verbotenes custom-Feld (JSON darf keine Funktionen tragen)'
  // (1) Pflichtfelder/Form.
  if (typeof o.id !== 'string' || !SLUG.test(o.id)) return 'id fehlt oder ist kein Slug ([a-z0-9-])'
  if (!cleanStr(o.label)) return 'label fehlt oder enthaelt unzulaessige Zeichen'
  if (!Array.isArray(o.categories)) return 'categories ist kein Array'
  if (o.categories.length === 0) return 'categories ist leer'
  // (5) Keine custom/Funktions-Kategorie; nur deklarative CategorySpec.
  for (const c of o.categories) {
    if (typeof c === 'object' && c !== null && 'custom' in (c as object)) {
      return 'Kategorie mit custom-Feld (nur deklarative CategorySpec erlaubt)'
    }
    if (!categoryOk(c)) return 'ungueltige Kategorie (Pflichtfeld/Typ/scan/parser oder Shell-Meta)'
  }
  // (2) roots: keine Traversal/Shell-Strings in Pfaden.
  if (o.roots !== undefined) {
    if (!Array.isArray(o.roots)) return 'roots ist kein Array'
    for (const r of o.roots) {
      if (!rootOk(r)) return 'unplausible Root (Traversal/Shell-String in fixedRoot/subPath)'
    }
  }
  // (3) Endpoint-Allowlist.
  if (o.endpoints !== undefined) {
    if (!Array.isArray(o.endpoints)) return 'endpoints ist kein Array'
    for (const e of o.endpoints) {
      if (!endpointOk(e)) return 'Endpoint verletzt Allowlist (nur localhost-HTTP(S) oder https)'
    }
  }
  // (4) secretRef NUR Env-NAME, nie Inline-Wert/Pfad/Quotes.
  if (o.secretRef !== undefined) {
    if (typeof o.secretRef !== 'string' || !ENV_NAME.test(o.secretRef)) {
      return 'secretRef ist kein reiner Env-NAME (^[A-Z][A-Z0-9_]*$) — Inline-Secret/Pfad verboten'
    }
  }
  // apiBase (falls da) muss eine https/localhost-URL sein (gleiche Allowlist).
  if (o.apiBase !== undefined && !endpointUrlOk(o.apiBase)) {
    return 'apiBase verletzt URL-Allowlist (nur localhost-HTTP(S) oder https)'
  }
  return null
}

// Eine Datei lesen + parsen + validieren. Wirft NIE: gibt Manifest ODER Grund.
function loadOne(dir: string, file: string): { manifest?: ProviderManifest; reason?: string } {
  let raw: string
  try {
    raw = fs.readFileSync(join(dir, file), 'utf8')
  } catch (err) {
    return { reason: `nicht lesbar: ${(err as Error).message.slice(0, 60)}` }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (err) {
    return { reason: `kaputtes JSON: ${(err as Error).message.slice(0, 60)}` }
  }
  const reason = validateManifest(parsed)
  if (reason) return { reason }
  return { manifest: parsed as ProviderManifest }
}

/**
 * Owner-eigene Provider-Manifeste (*.json) aus dem Manifest-Verzeichnis laden,
 * validieren und Sicherheits-Leitplanken erzwingen. Graceful: fehlendes
 * Verzeichnis => leeres Ergebnis. Invalide Datei => rejected mit klarem Grund
 * (nie stiller Skip). Reine Funktion ueber Filesystem + Env (sandbox-aware).
 */
export function loadUserManifests(dir?: string): ManifestLoadResult {
  const base = providersDir(dir)
  const result: ManifestLoadResult = { manifests: [], rejected: [] }
  if (!base) return result
  let files: string[]
  try {
    files = fs.readdirSync(base).filter((f) => f.toLowerCase().endsWith('.json'))
  } catch {
    return result // Verzeichnis fehlt -> leeres Ergebnis, kein Crash.
  }
  for (const file of files.sort()) {
    const { manifest, reason } = loadOne(base, file)
    if (manifest) result.manifests.push(manifest)
    else result.rejected.push({ file, reason: reason ?? 'unbekannt' })
  }
  return result
}
