// default-roots-invariance.spec.ts — M2-Sicherung: der DEFAULT-Lauf (kein
// RAWALLM_SANDBOX_ROOT) liest die REALE Config (M1-Stand) ohne Read-Regression.
//
// Frueher pinnte dieser Spec exakte Scan-Zahlen (z.B. claude=85). Das ist seit den
// gewollten Scanner-Erweiterungen (Plugins-Inventar, Hook-Skripte, .claude.json)
// obsolet UND grundsaetzlich brittle: die echte Config ist absichtlich "dirty" und
// aendert sich staendig. Stattdessen prueft der Spec STRUKTURELLE Invarianten, die
// Scan-Regressionen weiter fangen, ohne Live-Zahlen festzunageln:
//   (a) Determinismus: zwei Scans im selben Lauf liefern identische Zahlen.
//   (b) Vollstaendigkeit: alle aktiven Core-Familien mit >0 Kat.
//   (c) Kern-Kategorien je Familie nicht leer (Read-Regression-Fang).
//   (d) Secret-Hygiene: settings/hooks-code traegt KEINE rohen Secret-Werte (•••-Maske).
//
// GGUF-Precondition-Skip: Die Familie 'local' haengt am Modellordner
// GGUF_ROOT() aus llm-scan.ts (RAWALLM_GGUF_ROOT, sonst ~/models/gguf). Fehlt er,
// liefert scanLocalLlm() comingSoon + categories: [] — legitimer Zustand, kein
// Read-Regress. Deshalb filtern (b)/(c) 'local' bei !hasGguf, und ein eigener
// Test prueft 'local' mit test.skip (Skip bleibt im Report sichtbar). Mit
// vorhandenem Modellordner wird 'local' REAL geprueft.
// Read-only, kein App-Code.
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { test, expect } from '@playwright/test'
import type { Category, SystemArea } from '../../shared/contract'
import { scanAll } from '../../src/main/scan/scan-index'
import { scanSystem } from '../../src/main/scan/sys-scan'
import { GGUF_ROOT } from '../../src/main/scan/llm-scan'
import { configRoots } from '../../src/main/services/config-roots'

type App = ReturnType<typeof scanAll>

// Statische Imports: die Scan-Module loesen ihre Wurzeln seit 2026-08-10 bei
// JEDEM Aufruf ueber configRoots() bzw. GGUF_ROOT() auf. Ohne gesetztes
// RAWALLM_SANDBOX_ROOT (beforeEach loescht es) trifft dieser Spec deshalb immer
// die REALEN Wurzeln — auch wenn im selben Worker vorher Sandbox-Specs liefen.

function defaultPreconditions() {
  const roots = configRoots()
  const kimiRoot = join(dirname(roots.claudeHome), '.kimi-code')
  return {
    hasGguf: existsSync(GGUF_ROOT()),
    kimiRoot,
    hasKimi: existsSync(kimiRoot),
    hasProviderDefaults: existsSync(join(roots.claudeHome, 'CLAUDE.md'))
      && existsSync(join(roots.codexHome, 'AGENTS.md'))
  }
}

// Erwartete Familien (Sidebar/Datenmodell). Optionale Familien duerfen core-first
// leer bleiben; aktive Core-Familien muessen real befuellt sein.
// 'kimi' (WP-10, HR16-Paritaet) haengt am realen ~/.kimi-code und ist damit
// umgebungsabhaengig — wie 'local' kein REQUIRED, aber determinismus-relevant.
const FAMILIES = ['claude', 'codex', 'shared', 'userglobal', 'local', 'kimi'] as const
const REQUIRED_FAMILIES = ['claude', 'codex', 'userglobal', 'local'] as const

// Kern-Kategorien je Familie, die bei intakter realer Config NICHT leer sein duerfen.
// Kategorie-IDs sind familien-praefixiert (claude: bloss, codex/shared: <fam>-<name>).
// 'agents' bewusst NICHT in claude (Owner-OK 2026-06-09): globales ~/.claude/agents
// ist legitim leer (keine WS-lokalen Fachagenten) -> env-abhaengig, kein Read-Regress.
const CORE_CATEGORIES: Record<string, string[]> = {
  claude: ['skills', 'rules', 'teams', 'hooks', 'settings', 'instructions', 'plugins'],
  codex: ['codex-instructions', 'codex-settings', 'codex-hooks'],
  // Owner-Entscheid 2026-07-17: Config liegt nur userglobal (~/.claude, ~/.codex)
  // und WS-lokal. Der Shared-Trunk fuehrt keine eigenen agents/rules/skills-Configs
  // mehr; die leeren Bestandsdirs sind Soll, kein Read-Regress (Beleg: .shared-Git
  // trackt .claude/rules nie; harte-regeln & Co. leben in ~/.claude/rules und sind
  // ueber claude/rules gepinnt). Gepinnt bleiben die realen Trunk-Bestaende
  // plugins/tools; shared-agents speist sich allein aus Plugin-Agenten und ist
  // damit ueber shared-plugins mit abgedeckt.
  shared: ['shared-plugins', 'shared-tools'],
  userglobal: ['userglobal-claude-skills', 'userglobal-codex-settings', 'userglobal-codex-hooks'],
  local: ['gguf-models', 'llm-endpoints'],
}

function famCount(app: App, fam: string): number {
  return (app.data[fam]?.categories ?? []).reduce((n: number, c: Category) => n + c.entries.length, 0)
}

function catEntries(app: App, fam: string, catId: string): number {
  const cat = (app.data[fam]?.categories ?? []).find((c: Category) => c.id === catId)
  return cat ? cat.entries.length : -1 // -1 = Kategorie fehlt ganz
}

test.beforeEach(() => {
  delete process.env.RAWALLM_SANDBOX_ROOT
})

// (a) Determinismus: derselbe Default-Lauf darf nicht zwischen Aufrufen driften.
test('Determinismus: zwei Default-Scans liefern identische Zahlen', async () => {
  const a = scanAll()
  const b = scanAll()
  for (const fam of FAMILIES) {
    expect(famCount(b, fam)).toBe(famCount(a, fam))
  }
  expect((await scanSystem()).areas.length).toBe((await scanSystem()).areas.length)
})

// (b) Vollstaendigkeit: jede aktive Core-Familie hat >0 Kategorien und >0 Eintraege.
test('Vollstaendigkeit: aktive Core-Familien real befuellt (>0 Kategorien/Eintraege)', async () => {
  const { hasGguf, hasProviderDefaults } = defaultPreconditions()
  test.skip(!hasProviderDefaults, 'reale CLAUDE.md-/AGENTS.md-Defaults fehlen')
  const app = scanAll()
  for (const fam of REQUIRED_FAMILIES) {
    // 'local' braucht den Modellordner — ohne ihn ist comingSoon
    // (0 Kategorien) legitim; Abdeckung dann via eigenem Skip-Test unten.
    if (fam === 'local' && !hasGguf) continue
    const cats = app.data[fam]?.categories ?? []
    expect(cats.length, `Familie ${fam} hat keine Kategorien`).toBeGreaterThan(0)
    expect(famCount(app, fam), `Familie ${fam} hat keine Eintraege`).toBeGreaterThan(0)
  }
  // System-Areas (Hardware/Runtimes/Ports/MCP/...) sind ebenfalls real befuellt.
  const system = await scanSystem()
  const hardware = system.areas.find((area: SystemArea) => area.id === 'hardware')
  expect(system.areas.length).toBeGreaterThan(0)
  expect(hardware?.entries.length, 'Hardware-Area darf nicht leer sein').toBeGreaterThan(1)
})

// (c) Kern-Kategorien je Familie sind nicht leer (faengt selektive Read-Regression).
test('Kern-Kategorien je Familie nicht leer (Read-Regression-Fang)', () => {
  const { hasGguf, hasProviderDefaults } = defaultPreconditions()
  test.skip(!hasProviderDefaults, 'reale CLAUDE.md-/AGENTS.md-Defaults fehlen')
  const app = scanAll()
  for (const [fam, ids] of Object.entries(CORE_CATEGORIES)) {
    if (fam === 'shared' && famCount(app, fam) === 0) continue
    // 'local' nur mit vorhandenem Modellordner pruefen (sonst Skip-Test unten).
    if (fam === 'local' && !hasGguf) continue
    for (const id of ids) {
      expect(catEntries(app, fam, id), `${fam}/${id} leer oder fehlt`).toBeGreaterThan(0)
    }
  }
})

// (b+c fuer 'kimi') Eigener Test mit sichtbarem SKIP, wenn der Kimi-Loader lokal
// nicht installiert ist. Mit vorhandenem ~/.kimi-code wird die Familie REAL
// geprueft — inklusive der Leitplanke, dass aus credentials/ nur die
// Ordner-Klassifikation kommt (kein Dateiname, keine Werte).
test('Familie kimi: ~/.kimi-code real gescannt, credentials nur klassifiziert', () => {
  const { hasKimi, kimiRoot } = defaultPreconditions()
  test.skip(!hasKimi, `Kimi-Loader nicht installiert (${kimiRoot} fehlt) — leere Familie ist legitim`)
  const app = scanAll()
  const cats = app.data.kimi?.categories ?? []
  // kimi-skills seit 2026-08-11 (F10: ~/.kimi-code/skills fehlte in der Familie).
  expect(cats.map((c: Category) => c.id)).toEqual([
    'kimi-instructions', 'kimi-settings', 'kimi-credentials', 'kimi-skills', 'kimi-hooks', 'kimi-workspaces',
  ])
  expect(famCount(app, 'kimi'), 'Familie kimi hat keine Eintraege').toBeGreaterThan(0)
  const cred = cats.find((c: Category) => c.id === 'kimi-credentials')
  for (const entry of cred?.entries ?? []) {
    expect(entry.name, 'credentials-Eintrag traegt einen Dateinamen').toBe('credentials')
    expect(entry.code, 'credentials-Eintrag traegt eine Vorschau').toBeUndefined()
    expect(entry.searchKeys, 'credentials-Eintrag traegt searchKeys').toBeUndefined()
  }
})

// (b+c fuer 'local') Eigener Test, damit der modellordner-abhaengige Teil als
// SKIP im Report sichtbar bleibt statt still wegzufallen. Mit vorhandenem
// Modellordner werden die local-Invarianten hier REAL geprueft.
test('Familie local: GGUF-Modelle + Endpoints befuellt (braucht Modellordner)', () => {
  const { hasGguf } = defaultPreconditions()
  test.skip(!hasGguf, `Modellordner fehlt (${GGUF_ROOT()}) — comingSoon ist legitim`)
  const app = scanAll()
  const cats = app.data.local?.categories ?? []
  expect(cats.length, 'Familie local hat keine Kategorien').toBeGreaterThan(0)
  expect(famCount(app, 'local'), 'Familie local hat keine Eintraege').toBeGreaterThan(0)
  for (const id of CORE_CATEGORIES.local) {
    expect(catEntries(app, 'local', id), `local/${id} leer oder fehlt`).toBeGreaterThan(0)
  }
})

// (d) Secret-Hygiene: settings/hooks-Eintraege tragen nur MASKIERTE Vorschau —
// niemals rohe Secret-Werte. Stichprobe ueber alle code-Felder aller Familien:
// kein generisches Secret-Pattern (sk-/ghp_/lange base64) darf roh auftauchen;
// wo code existiert UND maskiert wurde, muss die ••• -Maske erscheinen.
test('Secret-Hygiene: keine rohen Secret-Werte in code-Vorschauen', () => {
  const { hasProviderDefaults } = defaultPreconditions()
  test.skip(!hasProviderDefaults, 'reale CLAUDE.md-/AGENTS.md-Defaults fehlen')
  const app = scanAll()
  // Generische Roh-Secret-Pattern (KEINE echten Werte — nur Form-Heuristik).
  const RAW_SECRET_RX = /(sk-[A-Za-z0-9_-]{16,}|ghp_[A-Za-z0-9]{16,})/
  let codeFieldsSeen = 0
  let maskedSeen = 0
  for (const fam of FAMILIES) {
    for (const cat of app.data[fam]?.categories ?? []) {
      for (const e of cat.entries) {
        if (typeof e.code !== 'string' || e.code.length === 0) continue
        codeFieldsSeen += 1
        expect(RAW_SECRET_RX.test(e.code), `rohes Secret-Pattern in ${fam}/${cat.id}/${e.id}`).toBe(false)
        if (e.code.includes('•••')) maskedSeen += 1
      }
    }
  }
  // Sanity: es gibt ueberhaupt code-Vorschauen, und mindestens eine traegt die Maske
  // (settings.json/hooks-Events laufen durch maskedPreview -> •••).
  expect(codeFieldsSeen, 'keine code-Vorschauen im Scan').toBeGreaterThan(0)
  expect(maskedSeen, 'keine maskierte (•••) code-Vorschau gefunden').toBeGreaterThan(0)
})
