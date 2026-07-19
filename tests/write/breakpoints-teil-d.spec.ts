// breakpoints-teil-d.spec.ts — Teilplan-D Gate: Breakpoint-Konsolidierung.
// Die App kennt nur noch drei Breiten-Breakpoints: 560px, 900px, 1120px.
// Jede Breiten-Media-Query (min-width/max-width) in src/renderer/**/*.css muss
// einen dieser Werte nutzen. Nicht-Breiten-Queries (pointer: coarse,
// prefers-reduced-motion, min-/max-height, orientation …) bleiben unangetastet.
import { test, expect } from '@playwright/test'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

const RENDERER = resolve(process.cwd(), 'src/renderer')
const ALLOWED_WIDTHS = new Set(['560px', '900px', '1120px'])

function collectCss(dir) {
  const out = []
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry)
    if (statSync(p).isDirectory()) out.push(...collectCss(p))
    else if (entry.endsWith('.css')) out.push(p)
  }
  return out
}

test('Teil D: Breiten-Media-Queries nutzen ausschliesslich 560/900/1120px', () => {
  const files = collectCss(RENDERER)
  expect(files.length, 'keine CSS-Dateien gefunden').toBeGreaterThan(0)
  const violations = []
  for (const file of files) {
    const css = readFileSync(file, 'utf8')
    for (const m of css.matchAll(/@media[^{]+\{/g)) {
      for (const w of m[0].matchAll(/(?:min|max)-width:\s*([\d.]+px)/g)) {
        if (!ALLOWED_WIDTHS.has(w[1])) {
          violations.push(`${file}: ${m[0].trim()} -> ${w[1]}`)
        }
      }
    }
  }
  expect(violations, `unerlaubte Breiten-Breakpoints:\n${violations.join('\n')}`).toEqual([])
})

test('Teil D: alle drei Ziel-Breakpoints sind tatsaechlich im Einsatz', () => {
  const all = collectCss(RENDERER)
    .map((f) => readFileSync(f, 'utf8'))
    .join('\n')
  for (const w of ALLOWED_WIDTHS) {
    expect(all, `Ziel-Breakpoint ${w} nirgends genutzt`).toContain(w)
  }
})
