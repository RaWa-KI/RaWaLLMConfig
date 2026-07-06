// secret-mask.ts — maskiert Secret-Werte im ROH-Inhalt fuer die ANZEIGE.
// Owner-Override-Kern: Die Secret-Klasse wird nicht mehr hart geblockt, sondern
// maskiert ANGEZEIGT (Keys/Struktur/Kommentare bleiben, Werte -> ••• ).
// Drei Pfade: JSON strukturiert, TOML/env/unbekannt zeilenbasiert (Block-Carry),
// .pem/.key vollmaskiert. URL-Embedded-Tokens werden in JEDEM Pfad maskiert.
// KEINE echten Secret-Werte in Code/Kommentaren/Logs. Datei <300 Z, Fn <50 Z.

// Maskier-Platzhalter (sichtbar im UI, nie ein echter Wert).
const MASK = '•••' // •••

// Key-Heuristik: Schluessel, deren String-Blattwert maskiert wird. Statt blossem
// Teilstring-Match (Falschpositiv: `keywords`->key, `author`->auth, `monkey`->key)
// wird der Schluessel in SUB-WOERTER zerlegt — Trennung an Nicht-Buchstaben UND an
// camelCase-/Akronym-Grenzen (apiKey -> api|Key, DBPass -> DB|Pass) — und geprueft,
// ob ein Sub-Wort ein Credential-Wort IST. So matchen snake_case (api_key, DB_PASS),
// camelCase (apiKey, authToken, clientSecret) und kebab-case, aber NICHT Woerter,
// die das Token nur als Teilstring tragen.
const SECRET_WORDS = new Set<string>([
  'token', 'tokens', 'key', 'keys', 'secret', 'secrets',
  'password', 'passwords', 'passwd', 'pass', 'pwd', 'pw',
  'auth', 'credential', 'credentials', 'bearer'
])

// Einen Bezeichner in lowercase Sub-Woerter zerlegen (camelCase/Akronym/Trenner).
function subWords(s: string): string[] {
  return s
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2') // camelCase: aB -> a B
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2') // Akronym-Ende: HTTPKey -> HTTP Key
    .split(/[^A-Za-z]+/)
    .filter(Boolean)
    .map((w) => w.toLowerCase())
}

// True, wenn der Schluesselname ein Credential-Wort als eigenes Sub-Wort traegt.
function isSecretKeyName(keyish: string): boolean {
  return subWords(keyish).some((w) => SECRET_WORDS.has(w))
}

// Wert-Heuristik: credential-foermige Strings (lang base64/hex, sk-/ghp_, JWT,
// reale Cloud-API-Keys). WICHTIG (Falschpositiv-Fix): der generische Lang-Token-
// Zweig darf NICHT auf gewoehnliche Bindestrich-/Unterstrich-Komposita und
// Identifier matchen (Config-Dokus/Wikilinks wie „Namespace-Konventionen",
// „VALIDATED_REFERENCE-…" sind KEINE Secrets). Echte nackte Credentials sind
// KONTIGUIERLICH (kein Wort-Bindestrich), haben Entropie (>=1 Ziffer UND >=1
// Buchstabe) und sind lang (>=24). Schluessel=Wert-Secrets greift weiterhin
// maskAssignLine ueber SECRET_KEY_RX. sk-/ghp_/JWT bleiben explizit; zusaetzlich
// die D4-Cloud-Key-Praefixe (CLOUD_KEY_RX) — auch wenn der Wert `_`/`-` enthaelt
// (Google AIza-Keys), die der generische base64-Zweig sonst NICHT faengt. So
// bleiben echte Tokens maskiert, Doku editierbar.
import { CLOUD_KEY_RX } from './cloud-key-patterns'

const CRED_VALUE_RX =
  /^(?:sk-[A-Za-z0-9_-]{8,}|ghp_[A-Za-z0-9]{8,}|[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}|(?=[A-Za-z0-9+/=]*[0-9])(?=[A-Za-z0-9+/=]*[A-Za-z])[A-Za-z0-9+/=]{24,})$/

// URL-Embedded-Tokens: ://user:pass@ und ?token=/&key=-Query-Werte.
const URL_USERINFO_RX = /(:\/\/[^/\s:@]+:)([^@/\s]+)(@)/g
const URL_QUERY_RX = /([?&](?:token|key|secret|pass|pwd|auth|credential|bearer)[^=&\s]*=)([^&#\s]+)/gi

// PEM/Key-Header: nur BEGIN/END-Zeilen bleiben sichtbar.
const PEM_LINE_RX = /^-----(?:BEGIN|END)[^-]*-----\s*$/

// URL-Schema-Zeile: eine NACKTE URL (z.B. https://user:TOKEN@host) ohne Key=Value-
// Praefix. Ohne diesen Guard parst maskAssignLine `https:` als key:-Zuweisung,
// spaltet das `://` ab und das userinfo-Token bliebe unmaskiert. Solche Zeilen
// laufen IMMER durch die URL-Maskierung (maskUrlTokens auf der GANZEN Zeile).
const BARE_URL_LINE_RX = /^\s*[a-z][a-z0-9+.-]*:\/\//i

export interface MaskResult {
  masked: string
  maskedCount: number
}

// Zaehl-Wrapper: maskiert URL-eingebettete Tokens in einem String (alle Formate).
function maskUrlTokens(s: string, count: { n: number }): string {
  let out = s.replace(URL_USERINFO_RX, (_m, pre, _val, post) => {
    count.n += 1
    return `${pre}${MASK}${post}`
  })
  out = out.replace(URL_QUERY_RX, (_m, pre) => {
    count.n += 1
    return `${pre}${MASK}`
  })
  return out
}

// Reine Env-Referenz: ${VAR} (POSIX) oder %VAR% (Windows). Solche Werte sind
// KEIN Secret-Wert mehr, sondern zeigen, dass bereits via Env migriert wurde
// (Env-Migrations-Assistent). Der Owner MUSS das sehen -> NICHT maskieren (F3).
const ENV_REF_RX = /^(?:\$\{[A-Za-z_][A-Za-z0-9_]*\}|%[A-Za-z_][A-Za-z0-9_]*%)$/

// True, wenn der Wert (ohne Quotes/Trailing-Komma) NUR eine Env-Referenz ist.
function isEnvRefValue(v: string): boolean {
  return ENV_REF_RX.test(stripQuotes(v))
}

// Ist ein String-Wert credential-foermig (ohne Key-Kontext)?
// D4: zusaetzlich reale Cloud-API-Key-Praefixe (CLOUD_KEY_RX) — faengt z.B.
// Google AIza-Keys mit `_`/`-`, die der base64-Zweig von CRED_VALUE_RX auslaesst.
function isCredValue(v: string): boolean {
  const t = v.trim()
  if (t.length < 16) return false
  return CRED_VALUE_RX.test(t) || CLOUD_KEY_RX.test(t)
}

// Rekursiv JSON maskieren: secret-verdaechtige Keys ODER credential-Werte -> •••.
// `keyHint` traegt den umgebenden Key (fuer Array-Elemente unter secret-Keys).
function maskJsonNode(node: unknown, keyHint: string, count: { n: number }): unknown {
  if (typeof node === 'string') return maskJsonString(node, keyHint, count)
  if (Array.isArray(node)) return node.map((el) => maskJsonNode(el, keyHint, count))
  if (node && typeof node === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      out[k] = maskJsonNode(v, k, count)
    }
    return out
  }
  return node
}

// Einen JSON-String-Blattwert maskieren: secret-Key -> komplett •••,
// sonst nur URL-eingebettete Tokens; credential-foermige Werte -> •••.
function maskJsonString(value: string, keyHint: string, count: { n: number }): string {
  // F3: reine Env-Referenz (${VAR}/%VAR%) NICHT maskieren — zeigt bereits-migriert.
  if (isEnvRefValue(value)) return value
  if (isSecretKeyName(keyHint) && value.length > 0) {
    count.n += 1
    return MASK
  }
  if (isCredValue(value)) {
    count.n += 1
    return MASK
  }
  return maskUrlTokens(value, count)
}

// JSON-Pfad: parsen, strukturiert maskieren, mit 2 Spaces pretty-printen.
// Wirft NICHT — caller faengt parse-Fehler ab und faellt auf den Zeilen-Pfad.
function maskJson(content: string): MaskResult {
  const parsed = JSON.parse(content)
  const count = { n: 0 }
  const masked = maskJsonNode(parsed, '', count)
  return { masked: JSON.stringify(masked, null, 2), maskedCount: count.n }
}

// Maskiert die Werteseite einer KEY=VALUE-/key = "value"-Zeile (TOML/env).
// Liefert null, wenn die Zeile keine eindeutige Zuweisung ist.
function maskAssignLine(line: string, count: { n: number }): string | null {
  const m = /^(\s*[A-Za-z0-9_.-]+\s*[=:]\s*)(.+)$/.exec(line)
  if (!m) return null
  const [, head, rawValue] = m
  const keyPart = head
  // F3: reine Env-Referenz (${VAR}/%VAR%) als Wert NICHT maskieren (bereits migriert).
  if (isEnvRefValue(rawValue)) return head + rawValue
  const suspectKey = isSecretKeyName(keyPart)
  const inline = /^\{.*\}$/.test(rawValue.trim())
  if (inline) return head + maskInlineTable(rawValue, count)
  if (suspectKey || isCredValue(stripQuotes(rawValue))) {
    count.n += 1
    return head + reQuote(rawValue, MASK)
  }
  const urlMasked = maskUrlTokens(rawValue, count)
  return head + urlMasked
}

// TOML-Inline-Table (`{ token = "v", other = 1 }`): Sub-Keys einzeln maskieren.
function maskInlineTable(raw: string, count: { n: number }): string {
  return raw.replace(/([{,]\s*)([A-Za-z0-9_.-]+)(\s*=\s*)("(?:[^"\\]|\\.)*"|[^,}\s]+)/g,
    (full, sep, key, eq, val) => {
      // F3: reine Env-Referenz als Sub-Wert NICHT maskieren (bereits migriert).
      if (isEnvRefValue(val)) return full
      if (isSecretKeyName(key) || isCredValue(stripQuotes(val))) {
        count.n += 1
        return `${sep}${key}${eq}${reQuote(val, MASK)}`
      }
      return full
    })
}

// Anfuehrungszeichen vom Wert abstreifen (fuer Wert-Heuristik).
function stripQuotes(v: string): string {
  return v.trim().replace(/^["']/, '').replace(/["'],?\s*$/, '')
}

// Maske im selben Quoting wie das Original zurueckgeben (TOML/JSON-quote-erhalt).
function reQuote(original: string, mask: string): string {
  const t = original.trim()
  const trailing = /,\s*$/.test(original) ? ',' : ''
  if (/^"/.test(t)) return `"${mask}"${trailing}`
  if (/^'/.test(t)) return `'${mask}'${trailing}`
  return mask + trailing
}

// Block-Carry-State: zeilenbasierter Pfad maskiert nach secret-Key bis Strukturende.
interface CarryState {
  active: boolean
  closer: RegExp | null
}

// Bestimmt, ob eine Zeile einen mehrzeiligen Secret-Block oeffnet (Array/Table/""").
function openCarry(rawValue: string): CarryState | null {
  const v = rawValue.trim()
  if (/^\[/.test(v) && !/]/.test(v)) return { active: true, closer: /]/ }
  if (/^\{/.test(v) && !/}/.test(v)) return { active: true, closer: /}/ }
  if (/^"""/.test(v) && !/"""[\s,]*$/.test(v.slice(3))) return { active: true, closer: /"""/ }
  return null
}

// Eine Nicht-Zuweisungs-Zeile defensiv pruefen: enthaelt sie einen
// credential-Kandidaten als nacktes Token -> ganze Werteseite maskieren.
function maskBareLine(line: string, count: { n: number }): string {
  const tokens = line.match(/[A-Za-z0-9+/=._:@-]{16,}/g)
  if (tokens && tokens.some((t) => isCredValue(t.replace(/^[^A-Za-z0-9]+/, '')))) {
    count.n += 1
    return line.replace(/[A-Za-z0-9+/=._-]{16,}/g, MASK)
  }
  return maskUrlTokens(line, count)
}

// Zeilen-Pfad (TOML/env/unbekannt) mit Block-Carry + URL-Token-Maskierung.
function maskLines(content: string): MaskResult {
  const count = { n: 0 }
  const carry: CarryState = { active: false, closer: null }
  const out = content.split('\n').map((line) => maskOneLine(line, carry, count))
  return { masked: out.join('\n'), maskedCount: count.n }
}

// Genau eine Zeile im Zeilen-Pfad verarbeiten (Carry-aware).
function maskOneLine(line: string, carry: CarryState, count: { n: number }): string {
  if (carry.active) {
    count.n += 1
    const closed = carry.closer ? carry.closer.test(line) : true
    if (closed) carry.active = false
    return MASK
  }
  const trimmed = line.trimStart()
  if (trimmed === '' || trimmed.startsWith('#') || trimmed.startsWith(';')) return line
  // Nackte URL-Zeile zuerst: GANZE Zeile durch URL-Maskierung, damit `://` intakt
  // bleibt und userinfo-/Query-Tokens maskiert werden (sonst spaltet das key:-Parsing
  // das Schema ab). Host/Pfad bleiben sichtbar (`://user:•••@host`).
  if (BARE_URL_LINE_RX.test(line)) return maskUrlTokens(line, count)
  const assignMatch = /^(\s*[A-Za-z0-9_.-]+\s*[=:]\s*)(.+)$/.exec(line)
  if (assignMatch && isSecretKeyName(assignMatch[1])) {
    const opened = openCarry(assignMatch[2])
    if (opened) { carry.active = true; carry.closer = opened.closer; count.n += 1; return line }
  }
  const assigned = maskAssignLine(line, count)
  if (assigned !== null) return assigned
  return maskBareLine(line, count)
}

// PEM/Key-Pfad: jede Inhaltszeile -> •••, nur BEGIN/END-Zeilen sichtbar.
function maskPem(content: string): MaskResult {
  let n = 0
  const out = content.split('\n').map((line) => {
    if (line.trim() === '' || PEM_LINE_RX.test(line)) return line
    n += 1
    return MASK
  })
  return { masked: out.join('\n'), maskedCount: n }
}

// Erkennt PEM/Key-Inhalt ueber hint (.pem/.key) oder BEGIN-Header im Text.
function looksLikePem(content: string, hint?: string): boolean {
  if (hint && /\.(pem|key)$/i.test(hint)) return true
  return /-----BEGIN [^-]*-----/.test(content)
}

/**
 * Maskiert Secret-Werte im Roh-Inhalt fuer die reine ANZEIGE.
 * @param content Roh-Dateiinhalt (nie geloggt, nie zurueck als Wert).
 * @param hint    optionaler Datei-Hinweis (z.B. Pfad/Basename) fuer .pem/.key.
 * @returns       { masked, maskedCount } — maskierter Text + Anzahl Stellen.
 */
export function maskSecrets(content: string, hint?: string): MaskResult {
  if (typeof content !== 'string' || content.length === 0) {
    return { masked: content ?? '', maskedCount: 0 }
  }
  if (looksLikePem(content, hint)) return maskPem(content)
  const trimmed = content.trimStart()
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      return maskJson(content)
    } catch {
      // kein valides JSON -> zeilenbasiert maskieren (defensiv)
    }
  }
  return maskLines(content)
}
