// lines-hierarchy-teil-d.spec.ts — Teilplan-D-WP2-Gates (Override-Altlast + Typo-Hierarchie):
// 1) Keine pauschalen Override-Endbloecke mehr in workbench-shell.css /
//    workbench-cards.css (weder Marker-Kommentare noch minifizierte Regel-Ketten).
// 2) Hartschatten-Reste (box-shadow "Npx Npx 0 …" mit ink-Bezug, inkl.
//    color-mix-Varianten) stehen nur noch unter html[data-structure="retro"]-Guard;
//    Basis-Regeln bleiben lines-ruhig.
//    Bestandssonderfall .nav-overflow-menu: Retro-Basis mit explizitem lines/emboss-Guard.
// 3) Typo-Tokens sind rem-Werte (16px-Basis, Textskalierung) und werden von der
//    Kern-Hierarchie genutzt: .ov-head h1 -> --font-size-h1, .view-title h2 -> --font-size-h2,
//    .view-title p + .group-head h3 -> --font-size-meta.
// 4) global.css @import-Reihenfolge intakt.
import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const RENDERER = resolve(process.cwd(), 'src/renderer')
const STYLES = resolve(RENDERER, 'styles')
const SHELL_CSS = resolve(STYLES, 'workbench-shell.css')
const CARDS_CSS = resolve(STYLES, 'workbench-cards.css')
const TOKENS_CSS = resolve(STYLES, 'tokens.css')
const GLOBAL_CSS = resolve(STYLES, 'global.css')
const OVERVIEW_CSS = resolve(RENDERER, 'sections/overview/OverviewSection.css')
const ENTRY_ACTIONS_CSS = resolve(RENDERER, 'sections/config/EntryActions.css')

// Gehaertet (P3-2): erkennt Hartschatten ("Npx Npx 0 ...") auch in
// color-mix(...)-Varianten, solange ein ink-Bezug im selben Wert steht.
// Weiche lines-Schatten (z.B. "0 1px 2px var(--shadow)") matchen nicht:
// sie haben keinen "0 "-Blur-Anteil nach zwei px-Offsets bzw. kein ink.
const HARD_SHADOW = /\d+px \d+px 0 [^;{}]*ink/

function rules(css) {
  // Flache Selektor/Body-Paare — fuer Guard-Checks ausreichend (keine Media-Verschachtelung noetig)
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ selector: m[1].trim(), body: m[2] }))
}

// --- 1) Override-Endbloecke entfernt --------------------------------------------

test('keine Override-Endbloecke mehr in workbench-shell.css / workbench-cards.css', () => {
  for (const file of [SHELL_CSS, CARDS_CSS]) {
    const css = readFileSync(file, 'utf8')
    // Marker-Kommentare der beiden Endbloecke (Umlaute als Wildcard, ASCII-Spec)
    expect(css, `Override-Marker in ${file}`).not.toMatch(/Pr.zise Karten|Dichte, R.nder und Fokus/)
    // minifizierte Regel-Ketten ("}.foo{") waren die Schreibweise der Endbloecke
    expect(css, `minifizierte Regel-Kette in ${file}`).not.toMatch(/\}\.[a-z]/i)
  }
})

// --- 2) Hartschatten nur retro-geguardet -----------------------------------------

test('Hartschatten nur unter retro-Guard (OverviewSection, EntryActions, workbench-cards)', () => {
  for (const file of [OVERVIEW_CSS, ENTRY_ACTIONS_CSS, CARDS_CSS]) {
    for (const rule of rules(readFileSync(file, 'utf8'))) {
      if (HARD_SHADOW.test(rule.body)) {
        expect(rule.selector, `Hartschatten ohne retro-Guard: ${rule.selector} in ${file}`)
          .toContain('data-structure="retro"')
      }
    }
  }
})

test('.ov-mark: Basis ruhig (kein Hartschatten), retro-Guard mit 3px 3px 0', () => {
  const found = rules(readFileSync(OVERVIEW_CSS, 'utf8')).filter((r) => r.selector.endsWith('.ov-mark'))
  const base = found.find((r) => r.selector === '.ov-mark')
  const retro = found.find((r) => r.selector.includes('data-structure="retro"'))
  expect(base, '.ov-mark Basis-Regel fehlt').toBeTruthy()
  expect(base.body).not.toMatch(HARD_SHADOW)
  expect(retro, '.ov-mark retro-Guard fehlt').toBeTruthy()
  expect(retro.body).toMatch(/3px 3px 0 var\(--ink-2\)/)
})

test('.btn:active / .ea-btn:active: Basis ruhig, Hartschatten retro-geguardet', () => {
  const cards = rules(readFileSync(CARDS_CSS, 'utf8'))
  const btnActive = cards.find((r) => r.selector === '.btn:active')
  expect(btnActive, '.btn:active Basis-Regel fehlt').toBeTruthy()
  expect(btnActive.body).not.toMatch(HARD_SHADOW)
  const btnActiveRetro = cards.find((r) => r.selector.includes('data-structure="retro"') && r.selector.includes('.btn:active'))
  expect(btnActiveRetro, '.btn:active retro-Guard fehlt').toBeTruthy()
  const eaActives = rules(readFileSync(ENTRY_ACTIONS_CSS, 'utf8'))
    .filter((r) => r.selector.includes('.ea-btn') && r.selector.includes(':active'))
  expect(eaActives.length).toBeGreaterThan(0)
  for (const rule of eaActives) {
    expect(rule.selector, `.ea-btn:active ohne retro-Guard: ${rule.selector}`).toContain('data-structure="retro"')
  }
})

test('workbench-shell.css: Hartschatten retro-geguardet; nav-overflow-menu mit lines/emboss-Guard', () => {
  const found = rules(readFileSync(SHELL_CSS, 'utf8'))
  for (const rule of found) {
    if (HARD_SHADOW.test(rule.body) && !rule.selector.includes('.nav-overflow-menu')) {
      expect(rule.selector, `Hartschatten ohne retro-Guard: ${rule.selector}`)
        .toContain('data-structure="retro"')
    }
  }
  // Bestandssonderfall: .nav-overflow-menu hat Retro-Basis, aber expliziten lines/emboss-Guard
  const linesGuard = found.find((r) => r.selector.includes('data-structure="lines"') && r.selector.includes('.nav-overflow-menu'))
  expect(linesGuard, 'lines-Guard fuer .nav-overflow-menu fehlt').toBeTruthy()
  expect(linesGuard.body).toMatch(/box-shadow:/)
})

// --- 3) Typo-Tokens rem + Adoption ------------------------------------------------

test('Typo-Tokens sind rem-Werte', () => {
  const css = readFileSync(TOKENS_CSS, 'utf8')
  for (const token of ['--font-size-h1', '--font-size-h2', '--font-size-body', '--font-size-meta', '--font-size-eyebrow']) {
    const match = css.match(new RegExp(`\\${token}:\\s*([^;]+);`))
    expect(match, `${token} nicht gefunden`).not.toBeNull()
    expect(match[1].trim(), `${token} ist kein rem-Wert`).toMatch(/^[\d.]+rem$/)
  }
})

test('Kern-Hierarchie nutzt die Typo-Tokens', () => {
  const shell = readFileSync(SHELL_CSS, 'utf8')
  const cards = readFileSync(CARDS_CSS, 'utf8')
  const overview = readFileSync(OVERVIEW_CSS, 'utf8')
  expect(shell.match(/\.view-title h2 \{[^}]*\}/)?.[0] ?? '', '.view-title h2 ohne --font-size-h2').toContain('var(--font-size-h2)')
  expect(shell.match(/\.view-title p \{[^}]*\}/)?.[0] ?? '', '.view-title p ohne --font-size-meta').toContain('var(--font-size-meta)')
  expect(overview.match(/\.ov-head h1 \{[^}]*\}/)?.[0] ?? '', '.ov-head h1 ohne --font-size-h1').toContain('var(--font-size-h1)')
  expect(cards.match(/\.group-head h3 \{[^}]*\}/)?.[0] ?? '', '.group-head h3 ohne --font-size-meta').toContain('var(--font-size-meta)')
})

// --- 4) Import-Reihenfolge ----------------------------------------------------------

test('global.css @import-Reihenfolge intakt', () => {
  const css = readFileSync(GLOBAL_CSS, 'utf8')
  const order = ['./fonts.css', './tokens.css', './base.css', './workbench-shell.css', './workbench-cards.css', './layout.css', './components.css']
  const positions = order.map((ref) => {
    const at = css.indexOf(ref)
    expect(at, `${ref}-Import fehlt in global.css`).toBeGreaterThanOrEqual(0)
    return at
  })
  expect([...positions].sort((a, b) => a - b)).toEqual(positions)
})
