// secret-mask.spec.ts — maskSecrets() Anzeige-Maskierung. Owner-Override-Kern:
// Secret-Klasse wird NICHT hart geblockt, sondern maskiert ANGEZEIGT (Keys/Struktur
// bleiben, Werte -> •••). Drei Pfade (JSON strukturiert, TOML/env/unbekannt
// zeilenbasiert mit Block-Carry, .pem vollmaskiert) + URL-Embedded-Tokens.
// ALLE Werte sind DEUTLICH FAKE-Dummies (>=20 Z), NIE echte Config. Negativ-Match:
// der Dummy-String darf NICHT mehr im maskierten Output stehen.
import { test, expect } from '@playwright/test'
import { maskSecrets } from '../../src/main/services/secret-mask'

const MASK = '•••'

// Deutlich gefakte Dummy-Tokens (>=20 Z, kein echter Wert).
const DUMMY_SK = 'DUMMY-sk-aaaa1111bbbb2222cccc3333'
const DUMMY_SK2 = 'DUMMY-sk-dddd4444eeee5555ffff6666'
// credential-foermiger Wert OHNE secret-Key (langer base64/hex-Block, fake).
const DUMMY_CRED = 'AAAAbbbbCCCCdddd1234567890abcdefXYZ'

// 1. JSON: apiKey-Wert maskiert (Negativ-Match), name unveraendert, count>=1.
test('JSON: secret-Key-Wert maskiert, Nicht-Secret-Key unveraendert', () => {
  const src = JSON.stringify({ apiKey: DUMMY_SK, name: 'ok' })
  const { masked, maskedCount } = maskSecrets(src)
  expect(masked).not.toContain(DUMMY_SK) // Negativ-Match
  expect(masked).toContain(MASK)
  expect(masked).toContain('"name": "ok"') // unveraendert
  expect(maskedCount).toBeGreaterThanOrEqual(1)
})

// 2. JSON keyless Array unter secret-Key: beide Elemente maskiert (K-02).
test('JSON: Array unter secret-Key — alle Elemente maskiert', () => {
  const src = JSON.stringify({ tokens: [DUMMY_SK, DUMMY_SK2] })
  const { masked, maskedCount } = maskSecrets(src)
  expect(masked).not.toContain(DUMMY_SK)
  expect(masked).not.toContain(DUMMY_SK2)
  expect(maskedCount).toBeGreaterThanOrEqual(2)
})

// 3. JSON verschachtelt: secret-Key tief im Objekt -> maskiert.
test('JSON: tief verschachtelter secret-Key maskiert', () => {
  const src = JSON.stringify({ outer: { inner: { secret: DUMMY_SK } }, keep: 'x' })
  const { masked, maskedCount } = maskSecrets(src)
  expect(masked).not.toContain(DUMMY_SK)
  expect(masked).toContain('"keep": "x"')
  expect(maskedCount).toBeGreaterThanOrEqual(1)
})

// 4. TOML inline-table: { token = "<dummy>" } -> Sub-Key maskiert.
test('TOML: inline-table secret-Sub-Key maskiert', () => {
  const src = `x = { token = "${DUMMY_SK}", other = 1 }`
  const { masked, maskedCount } = maskSecrets(src)
  expect(masked).not.toContain(DUMMY_SK)
  expect(masked).toContain(MASK)
  expect(masked).toContain('other = 1') // Nicht-Secret-Sub-Key bleibt
  expect(maskedCount).toBeGreaterThanOrEqual(1)
})

// 5. TOML multiline """…""" nach secret-Key: kompletter Block maskiert (Carry).
test('TOML: multiline-Block nach secret-Key vollmaskiert (Block-Carry)', () => {
  const src = ['secret = """', DUMMY_SK, DUMMY_SK2, '"""', 'plain = 1'].join('\n')
  const { masked, maskedCount } = maskSecrets(src)
  expect(masked).not.toContain(DUMMY_SK)
  expect(masked).not.toContain(DUMMY_SK2)
  expect(masked).toContain('plain = 1') // nach Block-Ende wieder sichtbar
  expect(maskedCount).toBeGreaterThanOrEqual(1)
})

// 6. env-Zeile MY_PASSWORD=<dummy> maskiert; harmlose PATH=... bleibt.
test('env: secret-Zeile maskiert, harmlose PATH-Zeile unveraendert', () => {
  const src = ['MY_PASSWORD=' + DUMMY_SK, 'PATH=/usr/bin:/bin'].join('\n')
  const { masked, maskedCount } = maskSecrets(src)
  expect(masked).not.toContain(DUMMY_SK)
  expect(masked).toContain('PATH=/usr/bin:/bin') // harmlos, unveraendert
  expect(masked).toContain('MY_PASSWORD=') // Key bleibt
  expect(maskedCount).toBeGreaterThanOrEqual(1)
})

// 7. URL-Token: user:pass@ und ?token= als WERT (JSON/TOML) — eingebetteter Teil
//    maskiert, Rest der URL sichtbar. URL-Tokens werden im Werte-Kontext erkannt
//    (realer Config-Fall: URLs stehen als Werte, nicht als nackte key:value-Zeile).
test('URL: eingebettete Tokens maskiert, Rest der URL sichtbar', () => {
  // userinfo als JSON-Wert unter harmlosem Key.
  const userinfo = JSON.stringify({ url: `https://user:${DUMMY_SK}@host.example/path` })
  const r1 = maskSecrets(userinfo)
  expect(r1.masked).not.toContain(DUMMY_SK)
  expect(r1.masked).toContain('https://user:') // Schema/User sichtbar
  expect(r1.masked).toContain('@host.example/path') // Host/Pfad sichtbar
  expect(r1.maskedCount).toBeGreaterThanOrEqual(1)
  // query-token als TOML-Wert unter harmlosem Key.
  const query = `endpoint = "https://host.example/api?token=${DUMMY_SK2}&page=2"`
  const r2 = maskSecrets(query)
  expect(r2.masked).not.toContain(DUMMY_SK2)
  expect(r2.masked).toContain('?token=') // Key sichtbar
  expect(r2.masked).toContain('&page=2') // Rest-Query sichtbar
  expect(r2.maskedCount).toBeGreaterThanOrEqual(1)
})

// 7b. NACKTE URL-Zeile (kein key=value-Praefix) in env-artigem Inhalt:
//     userinfo-Token maskiert, Host/Pfad sichtbar. Regression-Fang fuer den
//     URL-Head-Edge (Schema `https:` darf NICHT als key:-Zuweisung geparst werden).
test('URL-Head-Edge: nackte URL-Zeile -> userinfo maskiert, Host sichtbar', () => {
  const src = [
    'PATH=/usr/bin:/bin',
    `https://user:${DUMMY_SK}@registry.example/feed`,
  ].join('\n')
  const { masked, maskedCount } = maskSecrets(src)
  expect(masked).not.toContain(DUMMY_SK) // userinfo-Token maskiert
  expect(masked).toContain('https://user:') // Schema/User sichtbar
  expect(masked).toContain('@registry.example/feed') // Host/Pfad sichtbar
  expect(masked).toContain('PATH=/usr/bin:/bin') // harmlose Zeile unveraendert
  expect(maskedCount).toBeGreaterThanOrEqual(1)
})

// 8. credential-foermiger Wert OHNE secret-Key -> maskiert (Wert-Heuristik).
test('credential-foermiger Wert ohne secret-Key wird maskiert', () => {
  const src = JSON.stringify({ note: DUMMY_CRED, label: 'short' })
  const { masked, maskedCount } = maskSecrets(src)
  expect(masked).not.toContain(DUMMY_CRED)
  expect(masked).toContain('"label": "short"') // kurzer/harmloser Wert bleibt
  expect(maskedCount).toBeGreaterThanOrEqual(1)
})

// 9. .pem-Inhalt: BEGIN/END sichtbar, alle Inhaltszeilen maskiert.
test('.pem: BEGIN/END sichtbar, Inhaltszeilen maskiert', () => {
  const body1 = 'MIIBOgIBAAJBAKj34GkxFhDUMMYpem11112222'
  const body2 = 'wbVfR1ZxDUMMYpem33334444aaaabbbbcccc='
  const src = ['-----BEGIN PRIVATE KEY-----', body1, body2, '-----END PRIVATE KEY-----'].join('\n')
  const { masked, maskedCount } = maskSecrets(src, '/sb/cert.pem')
  expect(masked).toContain('-----BEGIN PRIVATE KEY-----')
  expect(masked).toContain('-----END PRIVATE KEY-----')
  expect(masked).not.toContain(body1) // Inhaltszeilen maskiert
  expect(masked).not.toContain(body2)
  expect(maskedCount).toBeGreaterThanOrEqual(2)
})

// 9b. Env-Referenz (${VAR}) NICHT maskieren — zeigt bereits-migriert (F3).
//     Owner muss sehen, dass migriert wurde; ein echter Wert wird weiter maskiert.
test('Env-Ref ${VAR} bleibt sichtbar, echter Wert wird maskiert (F3)', () => {
  // JSON: ${VAR} unter secret-Key bleibt sichtbar.
  const refJson = JSON.stringify({ MYSQL_PWD: '${MYSQL_PWD}' })
  const r1 = maskSecrets(refJson)
  expect(r1.masked).toContain('${MYSQL_PWD}') // Env-Ref sichtbar
  expect(r1.maskedCount).toBe(0)
  // JSON: echter Wert unter demselben secret-Key wird maskiert.
  const realJson = JSON.stringify({ MYSQL_PWD: 'echterwert123456789ab' })
  const r2 = maskSecrets(realJson)
  expect(r2.masked).not.toContain('echterwert123456789ab') // echter Wert maskiert
  expect(r2.masked).toContain(MASK)
  expect(r2.maskedCount).toBeGreaterThanOrEqual(1)
  // env-Zeile: KEY=${VAR} bleibt sichtbar, echter Wert maskiert.
  const refLine = maskSecrets('MYSQL_PWD=${MYSQL_PWD}')
  expect(refLine.masked).toContain('${MYSQL_PWD}')
  expect(refLine.maskedCount).toBe(0)
  const realLine = maskSecrets('MYSQL_PWD=echterwert123456789ab')
  expect(realLine.masked).not.toContain('echterwert123456789ab')
  expect(realLine.maskedCount).toBeGreaterThanOrEqual(1)
})

// 9c. Frontmatter-/Prosa-Woerter werden NICHT maskiert (Buchstaben-Grenze):
//     keywords->key, author->auth, description->descr, scope->harmlos. Die
//     SECRET_KEY_RX nutzt Buchstaben-Grenzen, also greift kein Teilstring-Treffer.
test('Frontmatter-Woerter werden NICHT maskiert (Buchstaben-Grenze)', () => {
  const input = [
    'keywords: [a, b]',
    'author: ExampleAuthor',
    'description: "x"',
    'scope: global'
  ].join('\n')
  const { masked, maskedCount } = maskSecrets(input)
  expect(maskedCount).toBe(0)
  expect(masked).toBe(input) // byte-identisch, nichts maskiert
})

// 9d. Echte Credential-Keys werden maskiert (Buchstaben-Grenze greift den ECHTEN
//     Key). Jeder Fall separat: maskedCount>=1 und Rohwert verlaesst die Bridge NICHT.
test('echte Credential-Keys werden maskiert', () => {
  const VAL = 'abc123def456ghi789xyz' // langer Dummy-Wert (>=20 Z, Entropie)
  const cases: ReadonlyArray<[string, string]> = [
    ['auth_token = "' + VAL + '"', VAL],
    ['api_key: "' + VAL + '"', VAL],
    ['DB_PASS=geheim12345', 'geheim12345'],
    ['client_secret: "' + VAL + '"', VAL],
    ['password: "' + VAL + '"', VAL]
  ]
  for (const [src, raw] of cases) {
    const { masked, maskedCount } = maskSecrets(src)
    expect(maskedCount, `maskedCount>=1 fuer: ${src.split('=')[0].split(':')[0]}`).toBeGreaterThanOrEqual(1)
    expect(masked, `Rohwert nicht mehr im Output fuer: ${src.split('=')[0].split(':')[0]}`).not.toContain(raw)
  }
})

// 9e. ${VAR}-Env-Referenz bleibt sichtbar (nicht maskiert), env-Zeilen-Pfad.
test('${VAR}-Env-Referenz bleibt sichtbar (env-Zeile)', () => {
  const { masked, maskedCount } = maskSecrets('TH_DB_PW=${TH_DB_PW}')
  expect(masked).toContain('${TH_DB_PW}') // Env-Ref sichtbar
  expect(maskedCount).toBe(0)
})

// 10. Struktur-Treue (Zeilen-Pfad): Keys/Kommentare/Nicht-Secret-Zeilen
//     byte-identisch erhalten; nur die Werteseite des secret-Keys aendert sich.
test('Struktur-Treue: Kommentare und Nicht-Secret-Zeilen byte-identisch', () => {
  const lines = ['# Kommentar bleibt', '; ini-Kommentar bleibt', '', 'PLAIN = wert123', 'API_KEY=' + DUMMY_SK]
  const src = lines.join('\n')
  const { masked } = maskSecrets(src)
  const out = masked.split('\n')
  expect(out[0]).toBe('# Kommentar bleibt') // Kommentar identisch
  expect(out[1]).toBe('; ini-Kommentar bleibt')
  expect(out[2]).toBe('') // Leerzeile identisch
  expect(out[3]).toBe('PLAIN = wert123') // harmlose Zuweisung identisch
  expect(out[4].startsWith('API_KEY=')).toBe(true) // Key-Seite identisch
  expect(masked).not.toContain(DUMMY_SK) // nur Wert maskiert
})
