// coverage-sticky-a11y.spec.ts — WP-8: Spaltenzuordnung darf nicht wegscrollen.
//
// Hintergrund: Spiegelung, Vergleich und Archiv sind keine echten <table>-
// Elemente, sondern CSS-Grids aus Divs. Zwei Fehlerbilder haengen daran:
//   1) Der Kartenrahmen hatte `overflow: hidden` und damit einen EIGENEN
//      Scrollport. Ein sticky-Kind klebt an diesem Scrollport — der sich nie
//      bewegt. `overflow: clip` klippt weiterhin an den Radien, erzeugt aber
//      keinen Scroll-Container; sticky greift dann am echten Scroll-Container
//      `.main` (workbench-shell.css; body hat overflow: hidden).
//   2) Ohne role/columnheader liest ein Screenreader nur „fehlt, vorhanden,
//      n/a" — der Bezug Badge -> Werkzeug ist rein visuell und fehlt dort
//      dauerhaft, nicht erst beim Scrollen.
// Diese Gates sichern beides gegen Regression.
import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const RENDERER = resolve(process.cwd(), 'src/renderer')

function read(rel: string): string {
  return readFileSync(resolve(RENDERER, rel), 'utf8')
}

// Regelkoerper zum ersten Selektor, der exakt so beginnt (Basisregel).
function ruleBody(css: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const m = css.match(new RegExp(`(?:^|[};/])\\s*${escaped}\\s*\\{([^}]*)\\}`, 'm'))
  expect(m, `Regel ${selector} nicht gefunden`).not.toBeNull()
  return m![1]
}

// ── 1) Kein eigener Scrollport auf den Kartenrahmen ──────────────────────

const CLIP_TARGETS: Array<{ file: string; selector: string }> = [
  { file: 'sections/coverage/CoverageView.css', selector: '.cvg-table' },
  { file: 'styles/workbench-cards.css', selector: '.diff-col' },
  { file: 'sections/archiv/ArchivSection.css', selector: '.archiv-rows' },
]

for (const { file, selector } of CLIP_TARGETS) {
  test(`${selector}: overflow clip statt hidden (kein eigener Scrollport)`, () => {
    const body = ruleBody(read(file), selector)
    expect(body, `${selector} nutzt weiter overflow: hidden`).not.toMatch(/overflow:\s*hidden/)
    expect(body, `${selector} braucht overflow: clip`).toMatch(/overflow:\s*clip/)
  })
}

// ── 2) Kopfzeilen kleben und liegen ueber dem Inhalt ─────────────────────

const STICKY_TARGETS: Array<{ file: string; selector: string }> = [
  { file: 'sections/coverage/CoverageView.css', selector: '.cvg-thead' },
  { file: 'styles/workbench-cards.css', selector: '.diff-col > .diff-col-head' },
  { file: 'sections/archiv/ArchivSection.css', selector: '.archiv-row--head' },
]

for (const { file, selector } of STICKY_TARGETS) {
  test(`${selector}: sticky mit top 0 und z-index`, () => {
    const body = ruleBody(read(file), selector)
    expect(body, `${selector} ist nicht sticky`).toMatch(/position:\s*sticky/)
    expect(body, `${selector} braucht top: 0`).toMatch(/top:\s*0/)
    expect(body, `${selector} braucht einen z-index ueber dem Inhalt`).toMatch(/z-index:\s*[1-9]/)
  })
}

test('.cvg-thead behaelt einen deckenden Hintergrund (sonst scrollt Text durch)', () => {
  expect(ruleBody(read('sections/coverage/CoverageView.css'), '.cvg-thead')).toMatch(
    /background:\s*var\(--bg\)/
  )
})

test('.diff-col > .diff-col-head setzt KEIN background (sonst kippt .cmp-col-head)', () => {
  // .cmp-col-head (CompareView.css) hat nur Klassen-Spezifitaet 0,1,0 und
  // wuerde von 0,2,0 ueberschrieben — der Kopf verloere seine Farbe.
  expect(ruleBody(read('styles/workbench-cards.css'), '.diff-col > .diff-col-head')).not.toMatch(
    /background/
  )
  // Einzige Variante ohne eigenen Hintergrund muss deckend nachgezogen sein.
  expect(ruleBody(read('styles/workbench-cards.css'), '.diff-col.missing > .diff-col-head')).toMatch(
    /background:\s*var\(--bg-card\)/
  )
})

// ── 3) Archiv: unter 900px keine unbeschrifteten Spalten ─────────────────

test('Archiv: ausgeblendete Kopfzeile <900px wird durch data-label ersetzt', () => {
  const css = read('sections/archiv/ArchivSection.css')
  const narrow = css.slice(css.indexOf('@media (max-width: 900px)'))
  expect(narrow, 'Kopfzeile weiter ersatzlos ausgeblendet').toMatch(
    /\[data-label\]::before\s*\{[^}]*content:\s*attr\(data-label\)/
  )
  const tsx = read('sections/archiv/ArchivList.tsx')
  for (const label of ['Datei', 'Original', 'Zeit', 'Größe']) {
    expect(tsx, `data-label="${label}" fehlt`).toContain(`data-label="${label}"`)
  }
})

// ── 4) Semantische Spaltenkoepfe (app-weit bisher komplett abwesend) ─────

test('Coverage: Tabellen-Rollen und Spaltenkoepfe sind gesetzt', () => {
  const table = read('sections/coverage/CoverageVirtualTable.tsx')
  expect(table).toContain('role="table"')
  expect(table).toContain('role="rowgroup"')
  expect(table).toContain('role="row"')
  // Fuenf sichtbare Spalten (Shared/Claude/Codex/Kimi seit WP-8) + Aktionsspalte.
  expect(table.match(/role="columnheader"/g)?.length).toBe(6)
  // Virtualisierungs-Platzhalter sind keine Zeilen und muessen versteckt sein.
  expect(table.match(/aria-hidden="true"/g)?.length).toBe(2)
})

test('Coverage: jede Status-Zelle traegt den Werkzeug-Praefix im aria-label', () => {
  const head = read('sections/coverage/CoverageRowHead.tsx')
  expect(head).toMatch(/aria-label=\{`\$\{tool\}:\s*\$\{SPOKEN_STATE\[cell\.state\]\}`\}/)
  for (const tool of ['Shared', 'Claude', 'Codex']) {
    expect(head, `Status-Zelle fuer ${tool} fehlt`).toContain(`tool="${tool}"`)
  }
  // Alle sechs Zustaende brauchen eine vorlesbare Entsprechung.
  for (const state of ['identisch', 'abweichend', 'fehlt', 'via-plugin', 'n-a', 'vorhanden']) {
    expect(head, `SPOKEN_STATE ohne ${state}`).toContain(state)
  }
})

test('Archiv: Tabellen-Rollen auf Liste, Zeilen und Zellen', () => {
  const list = read('sections/archiv/ArchivList.tsx')
  expect(list).toContain('role="table"')
  expect(list).toContain('role="columnheader"')
  expect(list.match(/role="row"/g)?.length).toBe(2)
  expect(list.match(/role="cell"/g)?.length).toBe(6)
})

// ── 5) Status bleibt Farbe UND Text (bestehende Staerke, nicht verlieren) ─

test('Status wird nie nur ueber Farbe transportiert', () => {
  const badge = read('sections/coverage/CoverageBadge.tsx')
  // Der farbige Punkt ist dekorativ; der Text daneben traegt die Information.
  expect(badge).toContain('aria-hidden="true"')
  expect(badge).toContain('BADGE_LABEL[state]')
})
