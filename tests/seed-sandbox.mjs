// seed-sandbox.mjs — WP-08/12 Sandbox-Seed (idempotent, SECRET-FREI).
//
// Legt unter einem Temp-Sandbox-Root die vier Config-Wurzeln an, die
// src/main/services/config-roots.ts erwartet, wenn RAWALLM_SANDBOX_ROOT gesetzt
// ist (sandboxRoots(): <root>/.claude, <root>/.codex, <root>/.shared/.claude,
// <root>/project). Damit laufen ALLE mutierenden v4-Owner-Flows ausschliesslich
// gegen diese Sandbox — die echte Config wird nie beschrieben (F1 HART).
//
// WP-08-ROLLOUT (alle Kategorien × Familien):
// Der Seed bildet JEDE Rollout-Achse ab — Kategorien {Skills, Rules, Agents,
// Hooks, Instructions, Settings, Teams, Plugins} × Familien-Paarungen
// {Shared↔Claude, Shared↔Codex, Mirror-im-selben-Tool}. Die Paarungs-Wahrheit
// ist dedupe.ts + manifest-map.ts + dedupe-key.ts:
//   - Paare entstehen NUR (a) Tool↔Shared (cross-family, eine Seite = 'shared')
//     oder (b) Mirror im selben Tool (Pfad matcht MIRROR_RX). Claude↔Codex paart
//     NIE (Owner-Designentscheid dedupe.ts:5-6) — Codex-Pendants laufen darum
//     immer gegen die SHARED-Seite (Shared↔Codex), nie gegen Claude.
//   - Gepaart wird nach normalisiertem entry.name: normalizeKey strippt
//     .md/.toml/.yml/.yaml/.json/.rules -> Codex-`foo.toml`/`foo.rules` paart mit
//     Shared-`foo.md`. DARUM tragen Paar-Partner denselben BASE-Namen.
//   - normalizeCat strippt 'shared-'/'codex-' -> 'rules'↔'shared-rules'↔
//     'codex-rules' liegen auf derselben Achse; Cross-Achse paart nicht.
//   - Ordner-Paare (Skills/Agents/Teams/Plugins) erreichen den rekursiven
//     compareDirs NUR ueber einen Manifest-Anker (toCompareDir): SKILL.md/AGENT.md
//     in JEDEM Kontext; config.json NUR als teams/<seg>/config.json; plugin.json/
//     package.json NUR als plugins/<seg>/<manifest>. CODEX weicht hier bewusst ab.
//
// CODEX-STRUKTUR-WAHRHEIT (codex-scan.ts, kritiker P1-D — NICHT Claude spiegeln!):
//   - Instructions = Root-Dateien ^(AGENTS|CLAUDE_PARITY|CODEX)\.md / ^(pm-|profile)\.toml
//   - Settings     = config.toml (SECRET-CLASSED -> read-only-Erwartung)
//   - Hooks        = hooks.json + hooks/*  (.cjs roh)
//   - Skills/Agents/Rules = scanDir(withContent) — .rules-Endung wird erfasst
//   - Teams        = teams/*.toml-DATEIEN (KEIN config.json-Ordner!)
//   - Plugins      = plugins/* ORDNER OHNE Manifest (withContent=false, kein Drilldown)
//
// SECRET-FREIHEIT: Alle "Secret"-Werte sind offensichtliche Platzhalter
// (KEY=platzhalter). Es werden NIE echte Secrets gelesen oder kopiert. Das
// Dummy-Token 'platzhalter' wird vom v4-Flow-Leak-Check (=platzhalter) gesucht.
//
// IDEMPOTENZ: file() schreibt jede Datei deterministisch auf den Soll-Stand
// zurueck; dir() ist mkdir-recursive. Ein zweiter Lauf stellt exakt denselben
// Zustand her (auch nach einem mutierenden Flow), der `_archive`-Root bleibt.
//
// Aufruf:
//   node tests/seed-sandbox.mjs            -> nutzt stabilen Temp-Root, gibt ihn aus
//   node tests/seed-sandbox.mjs <root>     -> seedet in <root> (idempotent)
// Stdout (letzte Zeile): SANDBOX_ROOT=<absoluter Pfad>  (von Flow-Scripts geparst)

import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { seedFoundationCategories } from './seed-sandbox-foundation.mjs'

// ── Root bestimmen: Argument hat Vorrang, sonst frischer Temp-Ordner ──────────
function resolveRoot() {
  const arg = process.argv[2]
  if (arg && arg.trim().length > 0) return resolve(arg.trim())
  // Stabiler, wiederverwendbarer Sandbox-Root (idempotent ueber Laeufe hinweg).
  return join(tmpdir(), 'rawallm-sandbox-seed')
}

const ROOT = resolveRoot()

// Die vier Wurzeln exakt wie sandboxRoots() in config-roots.ts.
const CLAUDE = join(ROOT, '.claude')
const CODEX = join(ROOT, '.codex')
const SHARED = join(ROOT, '.shared', '.claude')
const PROJECT = join(ROOT, 'project')

// ── Idempotente Schreib-Helfer ───────────────────────────────────────────────
function dir(p) {
  mkdirSync(p, { recursive: true })
  return p
}
// Datei nur auf den Soll-Stand schreiben (idempotent, aber re-seedbar). Ein
// zweiter Lauf stellt nach einem Flow den Ausgangszustand wieder her.
function file(p, content) {
  dir(p.slice(0, p.lastIndexOf(p.includes('\\') ? '\\' : '/')))
  writeFileSync(p, content, 'utf8')
  return p
}

// Skill-Manifest (SKILL.md) bauen — gueltiges Frontmatter, secret-frei.
function skillMd(name, desc, body) {
  return [
    '---',
    `name: ${name}`,
    `description: ${desc}`,
    'model: sonnet',
    '---',
    '',
    `# ${name}`,
    '',
    body,
    ''
  ].join('\n')
}

// Agent-Manifest (AGENT.md / Claude-Einzeldatei-Agent) — gueltiges Frontmatter.
function agentMd(name, desc, body) {
  return [
    '---',
    `name: ${name}`,
    `description: ${desc}`,
    'model: sonnet',
    'tools: Read, Grep, Glob',
    '---',
    '',
    `# ${name}`,
    '',
    body,
    ''
  ].join('\n')
}

// Mehrzeiliger Markdown-Body mit Seiten-Variante (fuer diff-Paare). Mehrere
// abweichende Zeilen + gemeinsame Zeilen -> LCS/Chunk-tauglich.
function variantMd(title, seite) {
  return [
    `# ${title}`,
    '',
    'Grundsatz: gemeinsame Zeile.',
    `Detail-A: ${seite}-Fassung.`,
    'Mitte: gemeinsam.',
    `Detail-B: ${seite}-Fassung.`,
    'Schluss: gemeinsam.',
    ''
  ].join('\n')
}

// ── Wurzeln + Pflicht-Unterordner anlegen ────────────────────────────────────
for (const base of [CLAUDE, CODEX, SHARED, PROJECT]) dir(base)
for (const base of [CLAUDE, SHARED]) {
  dir(join(base, 'skills'))
  dir(join(base, 'rules'))
  dir(join(base, 'agents'))
  dir(join(base, 'plugins'))
}
dir(join(CLAUDE, 'teams'))
dir(join(SHARED, 'tools'))
// Codex-Unterordner (eigene Struktur — Teams=*.toml-Dateien, Plugins=Ordner-ohne-Manifest).
for (const sub of ['skills', 'rules', 'agents', 'plugins', 'teams', 'hooks']) dir(join(CODEX, sub))
// HR7-Archiv-Root der Sandbox: getWriteContext() nutzt <root>/_archive als
// archiveRoot; backup.ts legt ihn NICHT selbst an (archive-missing = STOP).
// Ohne diesen Ordner bricht JEDE Mutation korrekt ab.
dir(join(ROOT, '_archive'))

seedFoundationCategories({ CLAUDE, CODEX, SHARED, dir, file, skillMd, agentMd, variantMd })

// ══════════════════════════════════════════════════════════════════════════════
//  KATEGORIE: SETTINGS  (secret-classed Paar — fuer WP-06-Secret-Paar-Flow)
// ══════════════════════════════════════════════════════════════════════════════

// (SE1) Shared↔Codex Settings SECRET-Paar.
// CODEX-Settings = config.toml (secret-classed). Damit ein SHARED-Pendant auf der
// Achse 'settings' paart, braucht es eine Shared-settings-Karte. Der Shared-Scan
// hat KEINE 'settings'-Kategorie -> stattdessen: das beidseitig-secret-Paar wird
// auf der CLAUDE-Settings-Achse gegen SHARED erprobt, UND config.toml liegt als
// secret-classed Codex-Datei vor (read-only-Erwartung). config.toml wird vom
// Read-Scanner secret-maskiert; assertWritable lehnt Schreiben ab (owner-only).
{
  // config.toml (Codex-Hauptconfig, SECRET-CLASSED). Nur Struktur, Werte DUMMY.
  const configToml = [
    '# Codex-Hauptconfig (Sandbox, DUMMY) — config.toml ist secret-classed.',
    'model = "demo-model"',
    'approval_policy = "on-request"',
    'sandbox_mode = "read-only"',
    '',
    '[profiles.demo]',
    'note = "platzhalter"',
    ''
  ].join('\n')
  file(join(CODEX, 'config.toml'), configToml)
}

// (SE2) Shared↔Claude Settings-Datei-Paar als beidseitig-secret (settings.json).
// settings.json ist secret-classed (matchesPrefixClass). Beide Seiten maskiert ->
// dedupe verdict aus Roh-SHA korrekt, masked=true -> WP-06 read-only-Badge-Flow.
{
  const settings = JSON.stringify({ permissions: { deny: [], allow: [] }, env: {}, hooks: {} }, null, 2)
  file(join(CLAUDE, 'settings.json'), settings)
  file(join(SHARED, 'settings.json'), settings)
}

// ══════════════════════════════════════════════════════════════════════════════
//  KATEGORIE: TEAMS  — Claude: config.json-ORDNER  ·  Codex: teams/*.toml-DATEIEN
// ══════════════════════════════════════════════════════════════════════════════

// (T1) Claude↔Shared Teams config.json-ORDNER diff: "team-folder-pair"
// Claude collectTeams() drillt teams/<nm>/config.json. manifest-map ankert
// config.json NUR als teams/<seg>/config.json -> compareDirs (Ordner-Paar).
// SHARED-Seite traegt denselben teams/<nm>/config.json-Ordner (Achse 'teams',
// shared-Seite). (Claude↔Shared, NICHT Codex — Codex-Teams sind .toml-Dateien.)
{
  const nm = 'team-folder-pair'
  const claudeDir = dir(join(CLAUDE, 'teams', nm))
  const sharedDir = dir(join(SHARED, 'teams', nm))
  const cfgA = JSON.stringify({ name: nm, members: ['a', 'b'], note: 'claude-variante' }, null, 2)
  const cfgB = JSON.stringify({ name: nm, members: ['a', 'b'], note: 'shared-variante' }, null, 2)
  file(join(claudeDir, 'config.json'), cfgA)
  file(join(sharedDir, 'config.json'), cfgB)
  // zusaetzliche Innendatei je Seite -> Ordner-Vergleich hat mehr als das Manifest
  file(join(claudeDir, 'roster.md'), ['# Roster (Claude)', '', 'Mitglied a, Mitglied b.', ''].join('\n'))
  file(join(sharedDir, 'roster.md'), ['# Roster (Shared)', '', 'Mitglied a, Mitglied b.', ''].join('\n'))
}

// (T2) Shared↔Codex Teams diff: BASE "team-codex".
// CODEX-Teams = teams/*.toml-DATEIEN (KEIN config.json-Ordner!). scanDir(teams,
// withContent) listet die .toml als Datei. SHARED-Seite: teams/team-codex.md als
// Einzeldatei-Pendant. normalizeKey strippt .toml/.md -> Key 'team-codex' paart;
// compareSingleFile (keine Manifest-Ordner). Genau die Codex-Form, keine Fiktion.
{
  file(join(SHARED, 'teams', 'team-codex.md'), variantMd('Codex-Team', 'Shared'))
  file(join(CODEX, 'teams', 'team-codex.toml'), ['# Codex-Team (Sandbox, secret-frei)', 'name = "team-codex"', 'note = "codex-variante"', ''].join('\n'))
}

// ══════════════════════════════════════════════════════════════════════════════
//  KATEGORIE: PLUGINS  — Claude: plugin.json-ORDNER  ·  Codex: ORDNER OHNE Manifest
// ══════════════════════════════════════════════════════════════════════════════

// (P1) Claude↔Shared Plugins plugin.json-ORDNER diff: "plugin-folder-pair"
// Claude collectPlugins() drillt plugins/<nm>/plugin.json (drillPluginEntry).
// manifest-map ankert plugin.json NUR als plugins/<seg>/plugin.json -> compareDirs.
// SHARED-Seite: gleicher plugins/<nm>/plugin.json-Ordner (Achse 'plugins', shared).
{
  const nm = 'plugin-folder-pair'
  const claudeDir = dir(join(CLAUDE, 'plugins', nm))
  const sharedDir = dir(join(SHARED, 'plugins', nm))
  const manA = JSON.stringify({ name: nm, version: '1.0.0', note: 'claude-variante' }, null, 2)
  const manB = JSON.stringify({ name: nm, version: '1.0.0', note: 'shared-variante' }, null, 2)
  file(join(claudeDir, 'plugin.json'), manA)
  file(join(sharedDir, 'plugin.json'), manB)
  file(join(claudeDir, 'README.md'), ['# Plugin (Claude)', '', 'Demo-Plugin.', ''].join('\n'))
  file(join(sharedDir, 'README.md'), ['# Plugin (Shared)', '', 'Demo-Plugin.', ''].join('\n'))
}

// (P2) Codex Plugins = ORDNER OHNE Manifest (withContent=false, kein Drilldown).
// scanDir('codex-plugins', …, withContent=false) -> dirEntry, KEIN Manifest-Drill.
// Kein Shared-Pendant mit gleichem Namen -> KEIN Paar (Codex-Plugins sind by
// design nur Ordner-Listing ohne Vergleich). Dient der Codex-Struktur-Wahrheit:
// WP-09 prueft, dass die Codex-Plugins-Karte den Ordner OHNE Aktionen/Drill zeigt.
{
  const d = dir(join(CODEX, 'plugins', 'codex-plugin-bare'))
  // bewusst KEIN plugin.json/package.json — Codex-Plugins haben kein Manifest.
  file(join(d, 'notes.txt'), ['Codex-Plugin-Ordner ohne Manifest (Sandbox).', ''].join('\n'))
}

// ══════════════════════════════════════════════════════════════════════════════
//  WP-06 P1-C: GEMISCHTER Ordner mit GENAU EINER secret-Datei
// ══════════════════════════════════════════════════════════════════════════════

// (M1) Shared↔Claude Skill-Ordner-Paar, in dem EINE Innendatei secret-classed ist
// (.env). compareDirs markiert die .env-Zeile secret=true (isSecretPathForRead);
// die uebrigen Dateien sind normal vergleichbar -> "gemischter Ordner". WP-06
// kennzeichnet die secret-Zeile als „geschützt — übersprungen", die anderen
// Dateien bleiben normal aktionsfaehig. DUMMY-Werte (=platzhalter), nie echt.
{
  const nm = 'skill-mixed-secret'
  const sharedDir = dir(join(SHARED, 'skills', nm))
  const claudeDir = dir(join(CLAUDE, 'skills', nm))
  const manifest = skillMd(nm, 'Gemischter Ordner mit einer secret-Datei', 'Normaler Skill-Inhalt.')
  file(join(sharedDir, 'SKILL.md'), manifest)
  file(join(claudeDir, 'SKILL.md'), manifest)
  // normale diff-Innendatei (vergleichbar)
  file(join(sharedDir, 'extra.md'), ['# Extra (Shared)', '', 'Zeile A — Shared-Variante', 'Zeile B gemeinsam', ''].join('\n'))
  file(join(claudeDir, 'extra.md'), ['# Extra (Claude)', '', 'Zeile A — Claude-Variante', 'Zeile B gemeinsam', ''].join('\n'))
  // GENAU EINE secret-Datei (.env, DUMMY) je Seite -> pro-Datei skip-Kennzeichnung.
  const envBody = ['# Dummy-Env (gemischter Ordner) — KEINE echten Werte', 'API_KEY=platzhalter', 'TOKEN=platzhalter', ''].join('\n')
  file(join(sharedDir, '.env'), envBody)
  file(join(claudeDir, '.env'), envBody)
}

// ══════════════════════════════════════════════════════════════════════════════
//  SECRET-GATE Einzeldatei (FLOW-J): .env + settings.local.json (DUMMY) je Seite
// ══════════════════════════════════════════════════════════════════════════════
{
  const envBody = ['# Dummy-Env zum Secret-Gate-Test — KEINE echten Werte', 'API_KEY=platzhalter', 'DB_PASS=platzhalter', 'TOKEN=platzhalter', ''].join('\n')
  file(join(SHARED, '.env'), envBody)
  file(join(CLAUDE, '.env'), envBody)
  // settings.local.json (secret-classed) -> maskierter Instructions-/Settings-Eintrag.
  const localJson = JSON.stringify({ note: 'dummy', token: 'platzhalter', env: { DEMO_PW: 'platzhalter' } }, null, 2)
  file(join(CLAUDE, 'settings.local.json'), localJson)
}

// ── Ergebnis ──────────────────────────────────────────────────────────────────
console.log('[seed-sandbox] Wurzeln:')
console.log('  claudeHome  =', CLAUDE)
console.log('  codexHome   =', CODEX)
console.log('  sharedClaude=', SHARED)
console.log('  projectRoot =', PROJECT)
console.log('[seed-sandbox] Skills: skill-diff-multi(diff) skill-same(same) skill-only-shared skill-only-claude skill-codex-pair(S↔Codex) skill-mirror-pair(Mirror) skill-mixed-secret(P1-C)')
console.log('[seed-sandbox] Rules: rule-diff.md(S↔Claude) rule-same.md(same) rule-codex.md/.rules(S↔Codex) rule-mirror.md(Mirror)')
console.log('[seed-sandbox] Agents: agent-folder-pair(AGENT.md-Ordner S↔Codex) agent-single.md(Einzeldatei S↔Claude)')
console.log('[seed-sandbox] Hooks: demo-hook.cjs(S↔Codex) + codex hooks.json')
console.log('[seed-sandbox] Instructions: AGENTS.md(S↔Codex) + claude CLAUDE.md')
console.log('[seed-sandbox] Settings: config.toml(secret) settings.json-Paar(secret S↔Claude) settings.local.json')
console.log('[seed-sandbox] Teams: team-folder-pair(config.json-Ordner C↔S) team-codex.toml(Codex-Datei S↔Codex)')
console.log('[seed-sandbox] Plugins: plugin-folder-pair(plugin.json-Ordner C↔S) codex-plugin-bare(Codex Ordner-ohne-Manifest)')
// Letzte Zeile maschinell parsbar:
console.log(`SANDBOX_ROOT=${ROOT}`)
