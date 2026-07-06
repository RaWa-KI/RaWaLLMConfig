// manifest-map.spec.ts — kontext-bewusste Manifest-Erkennung (shared/manifest-map).
// Reine String-Logik (kein fs, keine Sandbox noetig): sichert die HARTE AUFLAGE
// (kritiker P1-B), dass config.json/plugin.json/package.json NUR im jeweiligen
// Pfad-Kontext (/teams/ bzw. /plugins/) als Ordner-Anker gelten — und sonst NICHT.
// Runner: Playwright (test/expect) als reiner Node-Test-Runner.
import { test, expect } from '@playwright/test'
import { isManifestPath, manifestParent, manifestFolder } from '../../shared/manifest-map'

// ── SKILL.md / AGENT.md: Anker in JEDEM Kontext (bestehendes Verhalten 1:1) ──
test('SKILL.md / AGENT.md sind Anker in jedem Kontext', () => {
  expect(isManifestPath('/a/b/skills/foo/SKILL.md')).toBe(true)
  expect(isManifestPath('/a/b/agents/bar/AGENT.md')).toBe(true)
  // case-insensitiv + Backslash-Trenner (Windows).
  expect(isManifestPath('C:\\x\\y\\Skill.MD')).toBe(true)
  expect(isManifestPath('C:\\users\\foo\\agents\\baz\\agent.md')).toBe(true)
  // ausserhalb eines /teams/- oder /plugins/-Pfads trotzdem Anker.
  expect(isManifestPath('/wherever/SKILL.md')).toBe(true)
})

// ── POSITIV: Teams config.json + Plugins plugin.json/package.json im Kontext ──
test('config.json im /teams/-Kontext ist Ordner-Anker', () => {
  expect(isManifestPath('/home/.claude/teams/myteam/config.json')).toBe(true)
  expect(isManifestPath('C:\\u\\.claude\\teams\\t\\config.json')).toBe(true)
})

test('plugin.json + package.json im /plugins/-Kontext sind Ordner-Anker', () => {
  expect(isManifestPath('/home/.claude/plugins/p/plugin.json')).toBe(true)
  expect(isManifestPath('/home/.claude/plugins/p/package.json')).toBe(true)
  expect(isManifestPath('C:\\u\\.claude\\plugins\\p\\plugin.json')).toBe(true)
})

// ── NEGATIV-SCHUTZ (Pflicht): generische Basenames AUSSERHALB ihres Kontexts ─
test('config.json AUSSERHALB /teams/ ist KEIN Anker (Negativ-Schutz)', () => {
  // z.B. neben mcp-Scan / beliebiger Ordner -> Einzeldatei, NICHT Ordner-Anker.
  expect(isManifestPath('/home/.shared/.claude/plugins/x/config.json')).toBe(false)
  expect(isManifestPath('/somewhere/random/config.json')).toBe(false)
  expect(isManifestPath('C:\\u\\project\\config.json')).toBe(false)
})

test('plugin.json / package.json AUSSERHALB /plugins/ sind KEIN Anker', () => {
  // mcp-Scan-Manifest plugin.json liegt NICHT unter /plugins/ -> kein Anker.
  expect(isManifestPath('/home/.shared/.claude/teams/x/plugin.json')).toBe(false)
  expect(isManifestPath('/repo/package.json')).toBe(false)
  expect(isManifestPath('/home/.claude/teams/t/package.json')).toBe(false)
})

// ── DIREKTE-ELTERNSCHAFT (kritiker P1): tief verschachtelt / Root-direkt = KEIN Anker ─
test('tief verschachteltes package.json unter /plugins/ ist KEIN Anker', () => {
  // .../plugins/x/node_modules/y/package.json: package.json ist der generischste
  // Basename ueberhaupt; ohne direkte Bundle-Elternschaft KEIN Ordner-Anker.
  expect(isManifestPath('/home/.claude/plugins/x/node_modules/y/package.json')).toBe(false)
  expect(isManifestPath('C:\\u\\.claude\\plugins\\x\\node_modules\\y\\package.json')).toBe(false)
})

test('plugin.json DIREKT unter plugins-Root (ohne Bundle-Ordner) ist KEIN Anker', () => {
  // .../plugins/plugin.json: kein <segment>-Bundle dazwischen -> kein Item-Anker.
  expect(isManifestPath('/home/.shared/.claude/plugins/plugin.json')).toBe(false)
})

test('README.md / index.md / installed_plugins.json sind NICHT gemappt', () => {
  // Kommen auch freistehend als Kategorie-Dateien vor (bzw. geteilter Inventar-Pfad).
  expect(isManifestPath('/home/.claude/plugins/p/README.md')).toBe(false)
  expect(isManifestPath('/home/.claude/teams/t/index.md')).toBe(false)
  expect(isManifestPath('/home/.claude/plugins/installed_plugins.json')).toBe(false)
})

test('echte Einzeldateien (rules/hooks/settings) sind kein Anker', () => {
  expect(isManifestPath('/home/.claude/rules/foo.md')).toBe(false)
  expect(isManifestPath('/home/.claude/settings.json')).toBe(false)
  expect(isManifestPath('')).toBe(false)
})

// ── manifestParent: trenner-treuer dirname (String-only) ─────────────────────
test('manifestParent ist trenner-treu (/-Pfad bleibt /, \\-Pfad bleibt \\)', () => {
  expect(manifestParent('/a/b/teams/t/config.json')).toBe('/a/b/teams/t')
  expect(manifestParent('C:\\a\\b\\skills\\s\\SKILL.md')).toBe('C:\\a\\b\\skills\\s')
})

// ── manifestFolder: Manifest -> Ordner, sonst Pfad unveraendert ──────────────
test('manifestFolder mappt Manifest auf Ordner, laesst Nicht-Manifest unveraendert', () => {
  expect(manifestFolder('/a/teams/t/config.json')).toBe('/a/teams/t')
  expect(manifestFolder('/a/plugins/p/plugin.json')).toBe('/a/plugins/p')
  // config.json ausserhalb /teams/ ist kein Manifest -> unveraendert.
  expect(manifestFolder('/a/random/config.json')).toBe('/a/random/config.json')
  // echter Ordnerpfad bleibt unveraendert.
  expect(manifestFolder('/a/skills/s')).toBe('/a/skills/s')
})
