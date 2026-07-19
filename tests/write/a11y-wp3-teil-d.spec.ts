// a11y-wp3-teil-d.spec.ts — Teilplan-D Gates: Kritiker-Auflagen WP2 + WP3 Accessibility.
// Aufgabe 1 (Auflagen):
//   P2-1  Die fuenf Typo-Tokens (--font-size-body, --font-size-eyebrow,
//         --font-weight-body, --font-weight-meta, --font-weight-headline) sind
//         adoptiert (je mindestens eine var()-Referenz ausserhalb tokens.css).
//   P2-2  .drawer-head .dh-ic Basis nutzt 1px solid var(--border) (kein ink-
//         Ueberrest); retro-Guard mit 2.5px ink bleibt unveraendert.
//   P3-1  Keine px-Overrides auf .view-title h2 in Section-CSS; .brand h1 und
//         .drawer-head h3 nutzen rem-Tokens.
//   P3-2  Gehaertete Hartschatten-Regex erkennt color-mix-Varianten, ohne auf
//         weiche lines-Schatten fehlzualarmieren.
// Aufgabe 2 (WP3):
//   1) --focus-ring Token + einheitliche :focus-visible-Regel.
//   2) Touch-Targets ~44px via @media (pointer: coarse).
//   3) Globaler prefers-reduced-motion-Block (Transitionen/Animationen + Scroll).
//   4) Textskalierung: keine px-Fontgroessen in den Kern-Hierarchie-Regeln der
//      Shell/Cards/Overview (Stichprobe Kernkomponenten).
import { test, expect } from '@playwright/test'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

const RENDERER = resolve(process.cwd(), 'src/renderer')
const STYLES = resolve(RENDERER, 'styles')
const SECTIONS = resolve(RENDERER, 'sections')
const TOKENS_CSS = resolve(STYLES, 'tokens.css')
const BASE_CSS = resolve(STYLES, 'base.css')
const SHELL_CSS = resolve(STYLES, 'workbench-shell.css')
const CARDS_CSS = resolve(STYLES, 'workbench-cards.css')
const OVERVIEW_CSS = resolve(SECTIONS, 'overview/OverviewSection.css')
const HIERARCHY_SPEC = resolve(process.cwd(), 'tests/write/lines-hierarchy-teil-d.spec.ts')

function collectCss(dir) {
  const out = []
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry)
    if (statSync(p).isDirectory()) out.push(...collectCss(p))
    else if (entry.endsWith('.css')) out.push(p)
  }
  return out
}

function ruleBody(css, selectorRe) {
  // Erste Regel, deren Selektor das Muster enthaelt (Basis-Regeln stehen in den
  // Kern-Dateien jeweils vor den Media-Query-Varianten).
  const m = css.match(new RegExp(`[^{}]*${selectorRe.source}[^{}]*\\{([^}]*)\\}`))
  return m ? m[1] : null
}

function ruleBodies(css, selectorRe) {
  // ALLE Regeln inkl. Media-Query-Overrides (Kritiker P3-1: px-Overrides duerfen
  // nicht durch Media-Blocke hindurchrutschen). Der Selektor muss DIREKT vor der
  // oeffnenden Klammer enden — Kind-Regeln wie `.row-name .mono` fallen heraus.
  return [...css.matchAll(new RegExp(`${selectorRe.source}\\s*\\{([^}]*)\\}`, 'g'))].map((m) => m[1])
}

// --- P2-1: Typo-Tokens adoptiert -------------------------------------------------

test('P2-1: alle fuenf Typo-Tokens werden ausserhalb tokens.css referenziert', () => {
  const files = [...collectCss(STYLES), ...collectCss(SECTIONS)].filter((f) => f !== TOKENS_CSS)
  const all = files.map((f) => readFileSync(f, 'utf8')).join('\n')
  for (const token of [
    '--font-size-body',
    '--font-size-eyebrow',
    '--font-weight-body',
    '--font-weight-meta',
    '--font-weight-headline',
  ]) {
    expect(all, `toter Token ${token}`).toContain(`var(${token})`)
  }
})

// --- P2-2: dh-ic Basis lines-konform ----------------------------------------------

test('P2-2: .drawer-head .dh-ic Basis nutzt var(--border), retro-Guard bleibt 2.5px ink', () => {
  const css = readFileSync(CARDS_CSS, 'utf8')
  const base = ruleBody(css, /\.drawer-head \.dh-ic/)
  expect(base, '.drawer-head .dh-ic Basis-Regel fehlt').toBeTruthy()
  expect(base).toContain('border: 1px solid var(--border)')
  expect(base).not.toContain('var(--ink)')
  const retro = ruleBody(css, /html\[data-structure="retro"\] \.drawer-head \.dh-ic/)
  expect(retro, 'dh-ic retro-Guard fehlt').toBeTruthy()
  expect(retro).toContain('2.5px solid var(--ink)')
})

// --- P3-1: view-title-/Kopf-Hierarchie auf Tokens ---------------------------------

test('P3-1: kein px-font-size-Override auf .view-title h2 in Section-CSS', () => {
  for (const file of collectCss(SECTIONS)) {
    const css = readFileSync(file, 'utf8')
    for (const m of css.matchAll(/[^{}]*\.view-title h2[^{}]*\{([^}]*)\}/g)) {
      expect(m[1], `px-Override .view-title h2 in ${file}`).not.toMatch(/font-size:\s*[\d.]+px/)
    }
  }
})

test('P3-1: .brand h1 und .drawer-head h3 nutzen rem-Tokens', () => {
  const shell = readFileSync(SHELL_CSS, 'utf8')
  const cards = readFileSync(CARDS_CSS, 'utf8')
  const brand = ruleBody(shell, /\.brand h1/)
  expect(brand, '.brand h1 Basis-Regel fehlt').toBeTruthy()
  expect(brand).toContain('font-size: var(--font-size-h2)')
  expect(brand).not.toMatch(/font-size:\s*[\d.]+px/)
  const drawer = ruleBody(cards, /\.drawer-head h3/)
  expect(drawer, '.drawer-head h3 Basis-Regel fehlt').toBeTruthy()
  expect(drawer).toContain('font-size: var(--font-size-h2)')
  expect(drawer).not.toMatch(/font-size:\s*[\d.]+px/)
})

// --- P3-2: gehaertete Hartschatten-Regex -------------------------------------------

test('P3-2: Hartschatten-Regex erkennt color-mix-Varianten, keine Fehlalarme auf weiche Schatten', () => {
  // Regex-Quelle muss mit der lines-hierarchy-Spec uebereinstimmen (Single Source).
  const specSrc = readFileSync(HIERARCHY_SPEC, 'utf8')
  const m = specSrc.match(/const HARD_SHADOW = (\/.+\/)/)
  expect(m, 'HARD_SHADOW in lines-hierarchy-teil-d.spec.ts nicht gefunden').toBeTruthy()
  const HARD_SHADOW = new RegExp(m[1].slice(1, -1))
  // Positive: klassisch + color-mix-Variante
  expect(HARD_SHADOW.test('box-shadow: 2px 2px 0 var(--ink-2);')).toBe(true)
  expect(HARD_SHADOW.test('box-shadow: 2px 2px 0 color-mix(in oklab, var(--ink-2), transparent 55%);')).toBe(true)
  expect(HARD_SHADOW.test('box-shadow: 5px 5px 0 var(--ink);')).toBe(true)
  // Negative: weiche lines-/emboss-Schatten
  expect(HARD_SHADOW.test('box-shadow: 0 1px 2px var(--shadow);')).toBe(false)
  expect(HARD_SHADOW.test('box-shadow: 0 10px 24px var(--shadow);')).toBe(false)
  expect(HARD_SHADOW.test('box-shadow: -5px -5px 12px color-mix(in oklab,var(--bg-card),#fff 40%), 6px 6px 16px var(--shadow);')).toBe(false)
  expect(HARD_SHADOW.test('box-shadow: -12px 0 28px var(--shadow);')).toBe(false)
})

// --- WP3-1: Fokus-Ring --------------------------------------------------------------

test('WP3-1: --focus-ring Token definiert und :focus-visible-Regel nutzt ihn', () => {
  const tokens = readFileSync(TOKENS_CSS, 'utf8')
  expect(tokens).toMatch(/--focus-ring:\s*2px solid var\(--terra\)/)
  const base = readFileSync(BASE_CSS, 'utf8')
  const focus = ruleBody(base, /:focus-visible/)
  expect(focus, ':focus-visible-Regel in base.css fehlt').toBeTruthy()
  expect(focus).toContain('outline: var(--focus-ring)')
  expect(focus).toContain('outline-offset: 2px')
})

// --- WP3-2: Touch-Targets -------------------------------------------------------------

test('WP3-2: pointer-coarse Block mit ~44px Hit-Area fuer primaere interaktive Elemente', () => {
  const base = readFileSync(BASE_CSS, 'utf8')
  const m = base.match(/@media \(pointer: coarse\) \{([^@]*)\}/)
  expect(m, '@media (pointer: coarse) Block fehlt in base.css').toBeTruthy()
  expect(m[1]).toContain('min-height: 44px')
  for (const sel of ['.btn', '.sec-btn', '.llm-tab', '.mode-tab', '.nav-item']) {
    expect(m[1], `${sel} fehlt im Touch-Block`).toContain(sel)
  }
})

// --- WP3-3: Reduced Motion -------------------------------------------------------------

test('WP3-3: globaler prefers-reduced-motion Block entschaerft Transitionen/Animationen', () => {
  const base = readFileSync(BASE_CSS, 'utf8')
  const m = base.match(/@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/)
  expect(m, 'prefers-reduced-motion Block fehlt in base.css').toBeTruthy()
  expect(m[1]).toContain('transition-duration: 0.01ms')
  expect(m[1]).toContain('animation-duration: 0.01ms')
  expect(m[1]).toContain('scroll-behavior: auto')
})

// --- WP3-4: Textskalierung (Stichprobe Kernkomponenten) ---------------------------------

test('WP3-4: Kern-Hierarchie nutzt keine px-Fontgroessen (rem-Tokens greifen)', () => {
  const checks = [
    [SHELL_CSS, /\.view-title h2/],
    [SHELL_CSS, /\.view-title p/],
    [SHELL_CSS, /\.brand h1/],
    [CARDS_CSS, /\.group-head h3/],
    [CARDS_CSS, /\.row-name/],
    [CARDS_CSS, /\.drawer-head h3/],
    [OVERVIEW_CSS, /\.ov-head h1/],
  ]
  for (const [file, sel] of checks) {
    const bodies = ruleBodies(readFileSync(file, 'utf8'), sel)
    expect(bodies.length, `${sel} Regel fehlt in ${file}`).toBeGreaterThan(0)
    for (const body of bodies) {
      expect(body, `px-Fontgroesse bei ${sel} in ${file} (inkl. Media-Overrides)`).not.toMatch(/font-size:\s*[\d.]+px/)
    }
  }
})

// --- P3-3 (Kritiker): Ring-Fokus auf 1px-Border-Inputs --------------------------------

test('P3-3: field-/ea-/pp-input bekommen zusaetzlich den Fokus-Ring', () => {
  const base = readFileSync(BASE_CSS, 'utf8')
  const m = base.match(/\.field-input:focus-visible,\s*\.ea-input:focus-visible,\s*\.pp-input:focus-visible\s*\{([^}]*)\}/)
  expect(m, 'Input-Fokus-Ring-Regel (alle drei Selektoren) fehlt in base.css').toBeTruthy()
  expect(m[1]).toContain('outline: var(--focus-ring)')
})
