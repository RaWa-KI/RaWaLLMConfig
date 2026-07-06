// default-roots-invariance.spec.ts — M2-Sicherung: der DEFAULT-Lauf (kein
// RAWALLM_SANDBOX_ROOT) liest die REALE Config (M1-Stand) ohne Read-Regression.
//
// Frueher pinnte dieser Spec exakte Scan-Zahlen (z.B. claude=85). Das ist seit den
// gewollten Scanner-Erweiterungen (Plugins-Inventar, Hook-Skripte, .claude.json)
// obsolet UND grundsaetzlich brittle: die echte Config ist absichtlich "dirty" und
// aendert sich staendig. Stattdessen prueft der Spec STRUKTURELLE Invarianten, die
// Scan-Regressionen weiter fangen, ohne Live-Zahlen festzunageln:
//   (a) Determinismus: zwei Scans im selben Lauf liefern identische Zahlen.
//   (b) Vollstaendigkeit: alle erwarteten Familien (claude/codex/shared/local) mit >0 Kat.
//   (c) Kern-Kategorien je Familie nicht leer (Read-Regression-Fang).
//   (d) Secret-Hygiene: settings/hooks-code traegt KEINE rohen Secret-Werte (•••-Maske).
//
// GGUF-Precondition-Skip: Die Familie 'local' haengt am Wechsellaufwerk E:
// (GGUF_ROOT aus llm-scan.ts). Ohne Mount liefert scanLocalLlm() comingSoon +
// categories: [] — legitimer Zustand, kein Read-Regress. Deshalb filtern (b)/(c)
// 'local' bei !hasGguf, und ein eigener Test prueft 'local' mit test.skip
// (Skip bleibt im Report sichtbar). Mit gemountetem E: wird 'local' REAL geprueft.
// Read-only, kein App-Code.
import { existsSync } from 'node:fs'
import { test, expect } from '@playwright/test'
import { scanAll } from '../../src/main/scan/scan-index'
import { scanSystem } from '../../src/main/scan/sys-scan'
import { GGUF_ROOT } from '../../src/main/scan/llm-scan'

type App = ReturnType<typeof scanAll>

// Erwartete Familien (Sidebar/Datenmodell). Alle muessen real befuellt sein.
const FAMILIES = ['claude', 'codex', 'shared', 'userglobal', 'local'] as const

// Kern-Kategorien je Familie, die bei intakter realer Config NICHT leer sein duerfen.
// Kategorie-IDs sind familien-praefixiert (claude: bloss, codex/shared: <fam>-<name>).
// 'agents' bewusst NICHT in claude (Owner-OK 2026-06-09): globales ~/.claude/agents
// ist legitim leer (keine WS-lokalen Fachagenten) -> env-abhaengig, kein Read-Regress.
const CORE_CATEGORIES: Record<string, string[]> = {
  claude: ['skills', 'rules', 'teams', 'hooks', 'settings', 'instructions', 'plugins'],
  codex: ['codex-instructions', 'codex-settings', 'codex-hooks'],
  shared: ['shared-agents', 'shared-rules', 'shared-skills'],
  userglobal: ['userglobal-claude-skills', 'userglobal-codex-settings', 'userglobal-codex-hooks'],
  local: ['gguf-models', 'llm-endpoints'],
}

// Precondition: GGUF-Modellverzeichnis (Wechsellaufwerk E:) gemountet?
// Ohne E: ist comingSoon (Familie 'local' leer) der legitime Scanner-Zustand.
const hasGguf = existsSync(GGUF_ROOT)

function famCount(app: App, fam: string): number {
  return (app.data[fam]?.categories ?? []).reduce((n, c) => n + c.entries.length, 0)
}

function catEntries(app: App, fam: string, catId: string): number {
  const cat = (app.data[fam]?.categories ?? []).find((c) => c.id === catId)
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

// (b) Vollstaendigkeit: jede erwartete Familie hat >0 Kategorien und >0 Eintraege.
test('Vollstaendigkeit: alle Familien real befuellt (>0 Kategorien/Eintraege)', async () => {
  const app = scanAll()
  for (const fam of FAMILIES) {
    // 'local' braucht Wechsellaufwerk E: — ohne Mount ist comingSoon
    // (0 Kategorien) legitim; Abdeckung dann via eigenem Skip-Test unten.
    if (fam === 'local' && !hasGguf) continue
    const cats = app.data[fam]?.categories ?? []
    expect(cats.length, `Familie ${fam} hat keine Kategorien`).toBeGreaterThan(0)
    expect(famCount(app, fam), `Familie ${fam} hat keine Eintraege`).toBeGreaterThan(0)
  }
  // System-Areas (Hardware/Runtimes/Ports/MCP/...) sind ebenfalls real befuellt.
  expect((await scanSystem()).areas.length).toBeGreaterThan(0)
})

// (c) Kern-Kategorien je Familie sind nicht leer (faengt selektive Read-Regression).
test('Kern-Kategorien je Familie nicht leer (Read-Regression-Fang)', () => {
  const app = scanAll()
  for (const [fam, ids] of Object.entries(CORE_CATEGORIES)) {
    // 'local' nur mit gemountetem E: pruefen (sonst eigener Skip-Test unten).
    if (fam === 'local' && !hasGguf) continue
    for (const id of ids) {
      expect(catEntries(app, fam, id), `${fam}/${id} leer oder fehlt`).toBeGreaterThan(0)
    }
  }
})

// (b+c fuer 'local') Eigener Test, damit der E:-abhaengige Teil als SKIP im
// Report sichtbar bleibt statt still wegzufallen. Mit gemountetem E: werden
// die local-Invarianten hier REAL geprueft.
test('Familie local: GGUF-Modelle + Endpoints befuellt (braucht Laufwerk E:)', () => {
  test.skip(!hasGguf, `Wechsellaufwerk E: nicht gemountet (${GGUF_ROOT} fehlt) — comingSoon ist legitim`)
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
