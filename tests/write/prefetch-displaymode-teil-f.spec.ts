// prefetch-displaymode-teil-f.spec.ts — Teilplan F (F-WP2): pinnt auf Source-
// Ebene (a) die Idle-Prefetch-Verdrahtung der Lazy-Chunks inkl. Specifier-
// Paritaet mit den lazy()-Imports (Drift-Guard: gleiche Datei = gleicher Chunk
// = warmer Cache-Treffer) und (b) den optimistischen DisplayMode-Pfad
// (sofortiges on + Store-Update als React-Transition).
import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const app = read('src/renderer/App.tsx')
const configSection = read('src/renderer/sections/config/ConfigSection.tsx')
const prefetch = read('src/renderer/lib/prefetch-sections.ts')
const hook = read('src/renderer/components/useDisplayModeSwitch.ts')
const modeSwitch = read('src/renderer/components/DisplayModeSwitch.tsx')
const topBar = read('src/renderer/chrome/TopBar.tsx')
const overviewSection = read('src/renderer/sections/overview/OverviewSection.tsx')
const settingsPanel = read('src/renderer/sections/settings/SettingsActionsPanel.tsx')

// (a) Specifier-Paritaet: jeder lazy()-Import aus App.tsx ('./sections/…') und
// ConfigSection.tsx ('../compare|coverage/…') liegt im Prefetch-Modul als
// '../sections/…'-Import derselben Datei.
test('prefetch covers every lazy() specifier from App.tsx and ConfigSection.tsx', () => {
  const appSpecifiers = [...app.matchAll(/import\('(\.\/sections\/[^']+)'\)/g)].map((m) => m[1])
  expect(appSpecifiers.length, 'App.tsx muss 7 Lazy-Sektionen haben').toBe(7)
  const configSpecifiers = [...configSection.matchAll(/import\('(\.\.\/[^']+)'\)/g)].map((m) => m[1])
  expect(configSpecifiers.length, 'ConfigSection.tsx muss 2 Lazy-Views haben').toBe(2)
  for (const spec of [...appSpecifiers, ...configSpecifiers.map((s) => `./sections${s.slice(2)}`)]) {
    expect(prefetch, `Prefetch fehlt fuer ${spec}`).toContain(`import('..${spec.slice(1)}')`)
  }
})

test('prefetch runs idle, fire-and-forget, and is scheduled once before the onboarding gate', () => {
  expect(prefetch).toContain('requestIdleCallback')
  expect(prefetch).toContain('window.setTimeout')
  expect(prefetch).toContain('.catch(')
  expect(app).toContain("import { scheduleSectionPrefetch } from './lib/prefetch-sections'")
  const call = app.indexOf('scheduleSectionPrefetch()')
  const gate = app.indexOf('if (!sources.loading && !sources.onboardingDone)')
  expect(call, 'Prefetch-Aufruf fehlt in App.tsx').toBeGreaterThan(-1)
  expect(call, 'Prefetch muss VOR dem First-Run-Gate stehen (stabile Hook-Reihenfolge)').toBeLessThan(gate)
})

// (b) Optimismus + Transition: der Klick zeigt on sofort, das Store-Update
// laeuft als Transition; externe Wechsel synchronisieren den Optimismus nach.
test('display mode switch is optimistic and the store update runs as a transition', () => {
  expect(hook).toContain('useTransition')
  expect(hook).toContain('setOptimistic(mode)')
  expect(hook).toContain('startTransition(() => actions.setDisplayMode(mode))')
  expect(hook).toContain('useEffect(() => { setOptimistic(ui.displayMode) }, [ui.displayMode])')
  const callers = [['TopBar', topBar], ['OverviewSection', overviewSection], ['SettingsActionsPanel', settingsPanel]] as const
  for (const [name, source] of callers) {
    expect(source, `${name} nutzt useDisplayModeSwitch`).toContain('useDisplayModeSwitch(')
    expect(source, `${name} reicht actions.setDisplayMode nicht mehr direkt durch`).not.toContain('onSelect={actions.setDisplayMode}')
  }
})

// Vertrag des Umschalters bleibt kontrolliert: on-Klasse und aria-pressed
// folgen dem active-Prop (jetzt = optimistischer Zustand).
test('switch component contract stays controlled: on-class and aria-pressed follow the active prop', () => {
  expect(modeSwitch).toContain("props.active === props.mode ? ' on' : ''")
  expect(modeSwitch).toContain('aria-pressed={props.active === props.mode}')
})

function read(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8')
}
