// src/renderer/sections/referenz/refdata.ts
// Claude Code — Referenz-Inhalte (Landkarte des Vokabulars), kuratiert/editierbar.
// Loop-ready: jedes Feld hat stabile id + since-Version, damit Watcher/Changelog typisierte
// Deltas andocken koennen. Grosse Artefakte (slash/settings) ausgelagert in refdata-claude-teil2.ts
// (HR27, 300-Z-Limit). Nie echte Secret-Werte. Quelle: code.claude.com/docs · Stand Juni 2026.
//
// PFLEGE (DOKU-MITTEL-02): Deltas werden NUR aus der Watcher-Triage (HR22,
// .shared references/*-changelog) übernommen — je Änderung Quelle + Prüfdatum im
// note-/Kommentartext. KEIN hartkodiertes installed/latest: Versionsstand kommt live
// aus dem Watcher (versionsFromWatcher); Gap-Berechnung macht ref-logic.driftItems.
// Inhalt geprüft 2026-06-10 gg. code.claude.com.

import type { RefArtifact, RefDataset } from '@shared/contract-referenz'
import { hookArtifact, settingsArtifact, skillArtifact, slashArtifact } from './refdata-claude-teil2'

// Subagent — spezialisierter Claude in eigenem Kontextfenster.
const agentArtifact: RefArtifact = {
  id: 'agent',
  label: 'Subagent',
  icon: 'agent',
  file: '.claude/agents/<name>.md  ·  ~/.claude/agents/<name>.md',
  surf: ['cli', 'ide', 'desktop'],
  tag: 'Markdown + YAML-Frontmatter',
  intro:
    'Ein spezialisierter Claude in eigenem Kontextfenster. Der Body ist sein System-Prompt; das Frontmatter steuert Auswahl, Tools und Modell. Projekt-Agents gewinnen bei Namensgleichheit gegen User-Agents.',
  skeleton: `---
name: code-reviewer
description: Reviewt einen Diff nach Schweregrad. Use proactively nach Code-Aenderungen.
tools: Read, Grep, Glob
model: inherit
---

Du bist ein Senior-Code-Reviewer. Wenn aufgerufen: git diff lesen,
Bugs/Sicherheit/Stil pruefen, Befunde mit Schweregrad + Fundstelle melden.`,
  fields: [
    { id: 'agent.name', key: 'name', req: true, what: 'Bezeichner des Subagenten.', when: 'Immer.', safe: 'kebab-case, sprechend.', example: 'code-reviewer' },
    { id: 'agent.description', key: 'description', req: true, what: 'Treibt die Delegation — Claude matcht deine Anfrage gegen diese Beschreibung.', when: 'Immer.', safe: 'Aktionsorientiert: „Use proactively to run tests and fix failures."', example: 'Expert code review. Use immediately after writing code.' },
    { id: 'agent.tools', key: 'tools', what: 'Allowlist der Tools. Weglassen = der Subagent erbt ALLE Tools (inkl. MCP).', when: 'Fast immer einschraenken — ein Reviewer braucht kein Write.', safe: 'Nur das Noetige: Read, Grep, Glob.', example: 'Read, Grep, Glob', pitfall: 'Weglassen = impliziter Vollzugriff. Bewusst setzen.' },
    { id: 'agent.disallowedTools', key: 'disallowedTools', what: 'Denylist — wird vom Tool-Pool zuerst abgezogen.', when: 'Wenn du fast alles erlauben, aber Einzelnes sperren willst.', safe: 'z. B. Skill entfernen, um Skill-Aufrufe zu verhindern.', example: 'Write, Edit', since: '2.1.x' },
    { id: 'agent.model', key: 'model', what: 'Modell des Subagenten: inherit / sonnet / opus / haiku.', when: 'Guenstig (haiku) fuer simple, opus fuer heikle Aufgaben.', safe: 'inherit, ausser du brauchst gezielt ein anderes.', example: 'inherit', pitfall: 'In manchen Versionen wird model: ignoriert und das Eltern-Modell vererbt — pruefen.' },
    { id: 'agent.skills', key: 'skills', what: 'Laedt den VOLLEN Inhalt genannter Skills beim Start in den Subagenten (vorgeladenes Fachwissen).', when: 'Wenn der Subagent feste Konventionen/Wissen braucht.', safe: 'Nur wenige, gezielte Skills.', example: '[api-conventions, error-handling]', since: '2.1.x' },
    { id: 'agent.isolation', key: 'isolation', what: 'worktree = isolierte Repo-Kopie (sonst bleibt cd zwischen Bash-Aufrufen nicht erhalten).', when: 'Wenn der Subagent gefahrlos im Dateisystem arbeiten soll.', safe: 'Weglassen fuer reines Lesen.', example: 'worktree' },
    { id: 'agent.permissionMode', key: 'permissionMode', what: 'Permission-Modus des Subagenten (default/acceptEdits/…).', when: 'Selten — meist erbt er vom Eltern.', safe: 'default.', example: 'default', pitfall: 'Eltern-bypassPermissions/acceptEdits ueberschreibt dieses Feld; unter auto-Mode wird es ignoriert.' },
    { id: 'agent.memory', key: 'memory', what: 'Opt-in Gedaechtnis ueber Aufrufe hinweg.', when: 'Wenn der Subagent Wissen ansammeln soll.', safe: 'Weglassen = jeder Aufruf frisch.', example: 'true', since: '2.1.x' }
  ],
  vars: [],
  notes: [
    'Built-in Subagents: Explore (read-only, schnell), Plan (sammelt Kontext), general-purpose. Explore & Plan ueberspringen CLAUDE.md + Git-Status fuer kleinen Kontext.',
    'Erstellen am einfachsten interaktiv per /agents.'
  ]
}

// Eigener /-Befehl — klassische Commands, heute weitgehend in Skills aufgegangen.
const commandArtifact: RefArtifact = {
  id: 'command',
  label: 'Eigener /-Befehl',
  icon: 'edit',
  file: '.claude/commands/<name>.md',
  surf: ['cli', 'ide', 'desktop'],
  tag: 'Markdown + YAML-Frontmatter',
  intro:
    'Klassische /-Befehle. Heute weitgehend in Skills aufgegangen — eine commands/review.md und skills/review/SKILL.md erzeugen beide /review; die Skill gewinnt bei Konflikt. Fuer Neues lieber Skills nehmen.',
  skeleton: `---
description: Erstellt einen Conventional-Commit aus den Staged-Changes.
argument-hint: [scope]
allowed-tools: Bash(git add:*), Bash(git commit:*)
model: inherit
---

Erzeuge einen Commit. Aktueller Stand: !\`git diff --staged\``,
  fields: [
    { id: 'cmd.description', key: 'description', what: 'Kurzbeschreibung des Befehls (fuer Auflistung + Auto-Auswahl).', when: 'Immer.', safe: 'Knapp, mit „Use when …".', example: 'Conventional-Commit aus Staged-Changes.' },
    { id: 'cmd.argument-hint', key: 'argument-hint', what: 'Zeigt im UI, welches Argument erwartet wird.', when: 'Wenn der Befehl $ARGUMENTS nutzt.', safe: '—', example: '[scope]' },
    { id: 'cmd.allowed-tools', key: 'allowed-tools', what: 'Beschraenkt die Tools des Befehls (wie bei Skills).', when: 'Wenn er Shell/Tools braucht.', safe: 'Eng scopen: Bash(git:*).', example: 'Bash(git commit:*)' },
    { id: 'cmd.model', key: 'model', what: 'Modell fuer diesen Befehl.', when: 'Selten.', safe: 'inherit.', example: 'inherit' },
    { id: 'cmd.disable-model-invocation', key: 'disable-model-invocation', what: 'true = nur manuell per /befehl ausloesbar.', when: 'Bei Nebenwirkungen.', safe: 'true fuer Deploy/Commit.', example: 'true' }
  ],
  vars: [
    { token: '$ARGUMENTS', desc: 'Alles nach dem /-Befehl.' },
    { token: '$1, $2 …', desc: 'Einzelne Argumente.' },
    { token: '!`befehl`', desc: 'Shell-Output wird eingefuegt.' },
    { token: '@pfad', desc: 'Datei einbeziehen.' }
  ]
}

// MCP-Server — externe Tool-Server (Model Context Protocol).
const mcpArtifact: RefArtifact = {
  id: 'mcp',
  label: 'MCP-Server',
  icon: 'plug',
  file: '.mcp.json  ·  settings.json › mcpServers',
  surf: ['cli', 'ide', 'desktop'],
  tag: 'JSON',
  intro:
    'Externe Tool-Server (Model Context Protocol) geben Claude zusaetzliche Werkzeuge. Projekt-Server stehen in .mcp.json. Ihre Tools heissen mcp__<server>__<tool> — so matchst du sie in Hooks und Permissions.',
  skeleton: `{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": { "GITHUB_TOKEN": "$GH_PAT" }
    }
  }
}`,
  fields: [
    { id: 'mcp.command', key: 'command', what: 'Programm, das den Server startet (stdio-Transport).', when: 'Bei lokalen Servern.', safe: 'npx / uvx / absoluter Pfad.', example: '"npx"' },
    { id: 'mcp.args', key: 'args', what: 'Argumente fuer das Start-Kommando.', example: '["-y", "@mcp/github"]' },
    { id: 'mcp.env', key: 'env', what: 'Umgebungsvariablen (Secrets als $VAR aus der Shell, nicht im Klartext).', safe: 'Tokens via $ENV referenzieren.', example: '{ "GITHUB_TOKEN": "$GH_PAT" }' },
    { id: 'mcp.type', key: 'type', what: 'Transport: stdio (lokal), sse oder http (remote).', safe: 'stdio fuer lokale Server.', example: '"http"' },
    { id: 'mcp.url', key: 'url', what: 'Endpoint bei remote-Servern (type sse/http).', example: '"https://mcp.example.com"' },
    { id: 'mcp.headers', key: 'headers', what: 'HTTP-Header fuer remote-Server (z. B. Auth).', example: '{ "Authorization": "Bearer $TOKEN" }' }
  ],
  vars: [{ token: 'mcp__<server>__<tool>', desc: 'So heisst ein MCP-Tool — nutzbar in Hook-Matchern und Permission-Regeln.' }]
}

// CLAUDE.md / Memory — persistente Anweisungen, kaskadiert ueber Ebenen.
const memoryArtifact: RefArtifact = {
  id: 'memory',
  label: 'CLAUDE.md',
  icon: 'rule',
  file: 'managed → ~/.claude/CLAUDE.md → ./CLAUDE.md → <unterordner>/CLAUDE.md',
  surf: ['cli', 'ide', 'desktop'],
  tag: 'Markdown · kein Frontmatter',
  intro:
    'Persistente Anweisungen, die immer mitlaufen. Kaskadiert ueber Ebenen (Managed → User → Projekt → Unterordner) — dieselbe Datei auf mehreren Ebenen ist gewollt, keine Dublette. Kein Frontmatter; einfach Markdown.',
  skeleton: `# Projekt-Regeln
- Antworte auf Deutsch
- Conventional Commits, keine force-pushes auf main

@./docs/architektur.md   # importiert eine weitere Datei`,
  fields: [
    { id: 'mem.headings', key: '# Ueberschriften / - Punkte', what: 'Reines Markdown — Regeln, Stil, Stack als Listen/Abschnitte.', when: 'Fuer alles, was Claude dauerhaft beachten soll.', safe: 'Kurz & konkret halten.', example: '## Stil\\n- Tabs, keine Spaces' },
    { id: 'mem.import', key: '@pfad/datei', what: 'Importiert eine weitere Datei in den Speicher (Bausteine wiederverwenden).', when: 'Wenn Regeln geteilt/ausgelagert werden.', safe: 'Relative Pfade.', example: '@./docs/architektur.md' },
    { id: 'mem.local', key: 'CLAUDE.local.md', what: 'Persoenliche, gitignorierte Overrides neben CLAUDE.md.', when: 'Fuer Maschinen-spezifisches, das nicht ins Repo soll.', safe: 'In .gitignore aufnehmen.', example: '# nur lokal' },
    { id: 'mem.excludes', key: 'claudeMdExcludes (settings)', what: 'Glob/Pfade von CLAUDE.md-Dateien, die NICHT geladen werden.', when: 'Um fremde CLAUDE.md (vendor/) auszublenden.', safe: '—', example: '["**/vendor/**/CLAUDE.md"]' }
  ],
  vars: []
}

// Permissions — steuert, was Claude ohne Nachfrage darf.
const permissionsArtifact: RefArtifact = {
  id: 'permissions',
  label: 'Permissions',
  icon: 'key',
  file: 'settings.json › permissions',
  surf: ['cli', 'ide', 'desktop'],
  tag: 'Muster: Tool(Spezifizierer)',
  intro:
    'Steuert, was Claude ohne Nachfrage darf. Reihenfolge: deny wird ZUERST geprueft, dann ask, dann allow. Das Muster ist Tool(Spezifizierer); nacktes „Bash" ohne Klammer = alles.',
  skeleton: `"permissions": {
  "allow": ["Bash(git diff:*)", "Read(./src/**)"],
  "ask":   ["Bash(git push:*)"],
  "deny":  ["Read(./.env)", "Read(./secrets/**)", "Bash(curl:*)"],
  "defaultMode": "acceptEdits"
}`,
  fields: [
    { id: 'perm.bash', key: 'Bash(<praefix>:*)', what: 'Erlaubt/verbietet Shell-Befehle nach Praefix.', when: 'Git-Lese-Befehle erlauben, destruktive sperren.', safe: 'Immer scopen: Bash(git:*) statt Bash.', example: 'Bash(git diff:*)', pitfall: 'Nacktes Bash = jeder Befehl.' },
    { id: 'perm.read', key: 'Read(<glob>) / Edit(<glob>)', what: 'Datei-Zugriff per Glob steuern.', when: 'Secrets ausschliessen, Quellcode freigeben.', safe: 'Read(./.env), Read(./secrets/**) in deny.', example: 'Read(./.env)' },
    { id: 'perm.webfetch', key: 'WebFetch(domain:…)', what: 'Netz-Zugriff auf bestimmte Domains begrenzen.', when: 'Wenn Claude nur bestimmte Hosts erreichen soll.', safe: 'Eng halten.', example: 'WebFetch(domain:github.com)' },
    { id: 'perm.mcp', key: 'mcp__<server>__*', what: 'MCP-Tools eines Servers erlauben/sperren.', when: 'Bei sensiblen MCP-Servern.', safe: 'Schreib-Tools in deny.', example: 'mcp__postgres__query' },
    { id: 'perm.defaultMode', key: 'defaultMode', what: 'Grund-Modus: default/acceptEdits/plan/auto/dontAsk/bypassPermissions.', when: 'acceptEdits spart Klicks bei Edits.', safe: 'acceptEdits fuer fluessiges Arbeiten; bypassPermissions vermeiden.', example: '"acceptEdits"' }
  ],
  vars: []
}

// Env-Variablen — ueberschreiben Verhalten pro Session.
const envArtifact: RefArtifact = {
  id: 'env',
  label: 'Env-Variablen',
  icon: 'cube',
  file: 'Shell · settings.json › env',
  surf: ['cli', 'ide', 'desktop'],
  tag: 'CLAUDE_CODE_* u. a. · Auszug',
  intro:
    'Umgebungsvariablen ueberschreiben Verhalten pro Session — nuetzlich fuer CI, Kosten-Deckel und Experimente. Auszug der gaengigsten; die vollstaendige Liste steht unter code.claude.com/docs/en/env-vars.',
  fields: [
    { id: 'env.apikey', key: 'ANTHROPIC_API_KEY', what: 'API-Schluessel fuer die Authentifizierung.', safe: 'Aus Keychain/Secret, nicht im Klartext.', example: '<API-KEY>' },
    { id: 'env.model', key: 'ANTHROPIC_MODEL', what: 'Ueberschreibt das Default-Modell fuer die Session.', example: 'claude-sonnet-4-6' },
    { id: 'env.submodel', key: 'CLAUDE_CODE_SUBAGENT_MODEL', what: 'Erzwingt EIN Modell fuer alle Subagenten (Kosten-Deckel/Compliance).', when: 'Wenn Subagent-Kosten gedeckelt werden sollen.', example: 'haiku' },
    { id: 'env.teams', key: 'CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS', what: 'Schaltet die experimentellen Agent-Teams frei (Default aus).', when: 'Zum Ausprobieren von Multi-Agent.', example: '1' },
    { id: 'env.projdir', key: 'CLAUDE_PROJECT_DIR', what: 'Projekt-Wurzel — in Hooks verfuegbar.', example: '~/projekt' },
    { id: 'env.envfile', key: 'CLAUDE_ENV_FILE', what: 'Datei, in der SessionStart-Hooks Variablen persistieren.', example: '~/.claude/.env' },
    { id: 'env.telemetry', key: 'DISABLE_TELEMETRY', what: 'Schaltet nicht-essenzielle Telemetrie ab.', example: '1' }
  ],
  vars: []
}

// Platzhalter & Variablen — die kleinen Zeichen an einem Ort.
const varsArtifact: RefArtifact = {
  id: 'vars',
  label: 'Platzhalter',
  icon: 'api',
  file: 'in Skills · Commands · Hooks · Permissions',
  surf: ['cli', 'ide', 'desktop'],
  tag: 'Variablen & Magie-Syntax',
  intro:
    'Die kleinen Zeichen, die man leicht vergisst: Platzhalter, die in Skills/Commands ersetzt werden, und die Felder, die Hooks per stdin bekommen. Hier alle an einem Ort.',
  fields: [
    { id: 'var.arguments', key: '$ARGUMENTS', what: 'Alles, was du nach dem /-Befehl tippst — in Skills & Commands.', example: 'Research $ARGUMENTS thoroughly' },
    { id: 'var.positional', key: '$1, $2, …', what: 'Einzelne Argumente positionsweise.', example: 'Fix issue $1 in $2' },
    { id: 'var.bang', key: '!`befehl`', what: 'Dynamische Kontext-Injektion: Shell-Output wird VOR dem Lauf eingesetzt.', example: 'Stand: !`git status --short`' },
    { id: 'var.at', key: '@pfad/datei', what: 'Bezieht eine Datei in den Kontext ein.', example: 'Pruefe @src/index.ts' },
    { id: 'var.envref', key: '${ENV_VAR}', what: 'Setzt eine Umgebungsvariable ein (z. B. in Hook-Headern).', example: 'Bearer ${MY_TOKEN}' },
    { id: 'var.hookjson', key: 'stdin-JSON (Hooks)', what: 'Felder, die ein Hook bekommt: tool_name · tool_input · session_id · cwd · hook_event_name (Post: tool_response).', example: "jq -r '.tool_input.file_path'" }
  ],
  vars: []
}

// Vollstaendiger Claude-Datensatz: Reihenfolge wie im Prototyp.
export const refdataClaude: RefDataset = {
  label: 'Claude Code',
  updated: 'Juni 2026',
  source: 'code.claude.com/docs',
  artifacts: [
    skillArtifact,
    agentArtifact,
    commandArtifact,
    slashArtifact,
    hookArtifact,
    settingsArtifact,
    mcpArtifact,
    memoryArtifact,
    permissionsArtifact,
    envArtifact,
    varsArtifact
  ],
  changelog: {
    source: 'Claude Code',
    // IDs stabil halten: c6/c10 entfallen (in der Original-Doku nicht belegt,
    // Audit-Verifikation 2026-06-10) — NICHT umnummerieren.
    deltas: [
      { id: 'c1', kind: 'added', art: 'settings', field: 'set.skillOverrides', key: 'skillOverrides', since: '2.1.129', note: 'Pro-Skill-Sichtbarkeit: on/name-only/user-invocable-only/off.' },
      { id: 'c2', kind: 'added', art: 'agent', field: 'agent.disallowedTools', key: 'disallowedTools', since: '2.1.125', note: 'Denylist fuer Subagent-Tools.' },
      { id: 'c3', kind: 'added', art: 'agent', field: 'agent.skills', key: 'skills', since: '2.1.130', note: 'Skills beim Start in den Subagenten vorladen.' },
      { id: 'c4', kind: 'added', art: 'agent', field: 'agent.memory', key: 'memory', since: '2.1.140', note: 'Subagent-Gedaechtnis ueber Aufrufe (opt-in).' },
      { id: 'c5', kind: 'added', art: 'settings', field: null, key: 'parentSettingsBehavior', since: '2.1.133', note: 'Host-gelieferte managed settings: first-wins/merge.' },
      { id: 'c7', kind: 'added', art: 'slash', field: null, key: '/fewer-permission-prompts', since: '2.1.111', note: 'Reduziert Permission-Prompts per Allowlist.' },
      { id: 'c8', kind: 'added', art: 'slash', field: 'sl.branch', key: '/branch', since: '2.1.77', note: 'Konversation abzweigen — /fork koexistiert als eigener Befehl (keine Umbenennung).' },
      { id: 'c9', kind: 'deprecated', art: 'settings', field: null, key: 'includeCoAuthoredBy', to: 'attribution', since: '2.1.x', note: 'Veraltet — nutze stattdessen attribution.' }
    ]
  }
}
