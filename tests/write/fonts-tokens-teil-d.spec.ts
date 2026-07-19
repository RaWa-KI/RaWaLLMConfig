// fonts-tokens-teil-d.spec.ts — Teilplan-D-WP1-Gates (Nunito lokal + Token-Fundament):
// 1) Alle in fonts.css referenzierten WOFF2 existieren auf Disk und starten mit
//    den Magic-Bytes "wOF2"; fonts.css selbst enthaelt keine externen URLs.
// 2) Kein externer Font-Request: src/renderer + index.html referenzieren weder
//    fonts.googleapis.com noch fonts.gstatic.com (CSP font-src 'self').
// 3) --font-ui in tokens.css beginnt mit "Nunito".
// 4) papier-Theme-Hexwerte == Design-Referenz (design_handoff_startseite_redesign,
//    verifiziert am Prototypen "Startseite Redesign.dc.html").
// 5) --radius 18px / --radius-sm 11px (papier-scoped; andere Themes unangetastet).
// 6) global.css importiert fonts.css VOR tokens.css (Fonts vor --font-ui-Nutzung).
// 7) OFL-1.1-Lizenztext liegt neben den Fonts.
import { test, expect } from '@playwright/test'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const RENDERER = resolve(process.cwd(), 'src/renderer')
const FONTS_CSS = resolve(RENDERER, 'styles/fonts.css')
const TOKENS_CSS = resolve(RENDERER, 'styles/tokens.css')
const GLOBAL_CSS = resolve(RENDERER, 'styles/global.css')
const INDEX_HTML = resolve(RENDERER, 'index.html')

// --- 1) Vendored Fonts --------------------------------------------------------

test('fonts.css: jede referenzierte WOFF2 existiert und startet mit Magic-Bytes wOF2', () => {
  const css = readFileSync(FONTS_CSS, 'utf8')
  const refs = [...css.matchAll(/url\('([^']+\.woff2)'\)/g)].map((m) => m[1])
  // Nunito: 5 Gewichte (400/600/700/800/900) x 2 Subsets (latin, latin-ext) = 10.
  // Oswald (F-WP2d D4, Display-Schrift): 2 Gewichte (600/700) x 2 Subsets = 4.
  expect(refs.length).toBe(14)
  for (const ref of refs) {
    const filePath = resolve(dirname(FONTS_CSS), ref)
    expect(existsSync(filePath), `Font fehlt: ${ref}`).toBe(true)
    const magic = readFileSync(filePath).subarray(0, 4).toString('latin1')
    expect(magic, `Magic-Bytes wOF2 erwartet: ${ref}`).toBe('wOF2')
  }
})

test('fonts.css: keine externen Font-URLs', () => {
  const css = readFileSync(FONTS_CSS, 'utf8')
  expect(css).not.toMatch(/url\(\s*'?\s*https?:/i)
})

// --- 2) Kein externer Font-Request ---------------------------------------------

function rendererSourceFiles(dir) {
  const entries = readdirSync(dir, { recursive: true, withFileTypes: true })
  return entries
    .filter((e) => e.isFile() && /\.(ts|tsx|js|jsx|css|html|json)$/.test(e.name))
    .map((e) => resolve(e.parentPath, e.name))
}

test('kein fonts.googleapis.com / fonts.gstatic.com in src/renderer + index.html', () => {
  const files = rendererSourceFiles(RENDERER)
  expect(files.length).toBeGreaterThan(0)
  for (const file of files) {
    const text = readFileSync(file, 'utf8')
    expect(text, `externer Font-Request in ${file}`).not.toMatch(/fonts\.(googleapis|gstatic)\.com/)
  }
})

// --- 3-5) Tokens ----------------------------------------------------------------

function papierBlock(css) {
  const match = css.match(/html\[data-theme="papier"\]\s*\{([^}]*)\}/)
  expect(match, 'papier-Theme-Block nicht gefunden').not.toBeNull()
  return match[1]
}

test('--font-ui beginnt mit "Nunito"', () => {
  const css = readFileSync(TOKENS_CSS, 'utf8')
  const match = css.match(/--font-ui:\s*([^;]+);/)
  expect(match, '--font-ui nicht gefunden').not.toBeNull()
  expect(match[1].trim().startsWith('"Nunito"')).toBe(true)
})

test('papier-Theme: Hexwerte == Design-Referenz', () => {
  const block = papierBlock(readFileSync(TOKENS_CSS, 'utf8'))
  // Kern-Liste (bg, bg-card, text, border, terra) plus die uebrigen angeglichenen
  // Referenzwerte. Quelle: Prototyp "Startseite Redesign.dc.html".
  const expected = {
    '--bg': '#ece3d6',
    '--bg-card': '#f6f0e6',
    '--text': '#473f37',
    '--text-lt': '#7a6e66',
    '--warm-gray': '#998e7e',
    '--border': '#ded4c4',
    '--terra': '#b0563c',
    '--sage': '#5f886c',
    '--amber': '#bf9242',
    '--papa': '#4f7da8'
  }
  for (const [token, hex] of Object.entries(expected)) {
    const match = block.match(new RegExp(`\\${token}:\\s*([^;]+);`))
    expect(match, `${token} nicht im papier-Block gefunden`).not.toBeNull()
    expect(match[1].trim().toLowerCase(), `${token} weicht von Referenz ab`).toBe(hex)
  }
})

test('papier-Theme: --radius 18px / --radius-sm 11px', () => {
  const block = papierBlock(readFileSync(TOKENS_CSS, 'utf8'))
  expect(block).toMatch(/--radius:\s*18px;/)
  expect(block).toMatch(/--radius-sm:\s*11px;/)
})

// --- 6) Import-Reihenfolge --------------------------------------------------------

test('global.css importiert fonts.css vor tokens.css', () => {
  const css = readFileSync(GLOBAL_CSS, 'utf8')
  const fontsAt = css.indexOf("./fonts.css")
  const tokensAt = css.indexOf("./tokens.css")
  expect(fontsAt, 'fonts.css-Import fehlt in global.css').toBeGreaterThanOrEqual(0)
  expect(tokensAt, 'tokens.css-Import fehlt in global.css').toBeGreaterThanOrEqual(0)
  expect(fontsAt).toBeLessThan(tokensAt)
})

// --- 7) Lizenz --------------------------------------------------------------------

test('OFL.txt liegt neben den Fonts (OFL 1.1, Nunito Project Authors)', () => {
  const ofl = resolve(RENDERER, 'assets/fonts/OFL.txt')
  expect(existsSync(ofl)).toBe(true)
  const text = readFileSync(ofl, 'utf8')
  expect(text).toContain('SIL OPEN FONT LICENSE Version 1.1')
  expect(text).toContain('The Nunito Project Authors')
})

// --- 8) Display-Schrift (F-WP2d D4, Schaerfung Kontrollbuch) ---------------------

test('--font-display beginnt mit "Oswald" und hat System-Fallback', () => {
  const css = readFileSync(TOKENS_CSS, 'utf8')
  const match = css.match(/--font-display:\s*([^;]+);/)
  expect(match, '--font-display nicht gefunden').not.toBeNull()
  expect(match[1].trim().startsWith('"Oswald"')).toBe(true)
  expect(match[1]).toMatch(/sans-serif/)
})

test('OFL-oswald.txt liegt neben den Fonts (OFL 1.1, Oswald Project Authors)', () => {
  const ofl = resolve(RENDERER, 'assets/fonts/OFL-oswald.txt')
  expect(existsSync(ofl)).toBe(true)
  const text = readFileSync(ofl, 'utf8')
  expect(text).toContain('SIL OPEN FONT LICENSE Version 1.1')
  expect(text).toContain('The Oswald Project Authors')
})
