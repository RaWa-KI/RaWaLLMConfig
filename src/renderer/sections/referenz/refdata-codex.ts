// src/renderer/sections/referenz/refdata-codex.ts
// Codex — Referenz-Inhalte (eigener Datensatz), kuratiert/editierbar.
// Codex tickt anders als Claude: TOML statt JSON, AGENTS.md statt CLAUDE.md, approval_policy/
// sandbox_mode statt Permission-Regeln, eingeschraenkte Hooks (nur command-Hooks). Nie echte
// Secret-Werte. Quelle: developers.openai.com/codex · Stand Juni 2026.
//
// PFLEGE (DOKU-MITTEL-02): Deltas nur aus der Watcher-Triage (HR22, .shared
// references/*-changelog) übernehmen — je Änderung Quelle + Prüfdatum im note-Text.
// Kein hartkodiertes installed/latest: Versionsstand live aus dem Watcher
// (versionsFromWatcher); Gap-Berechnung macht ref-logic.driftItems.

import type { RefArtifact, RefDataset } from '@shared/contract-referenz'

// config.toml — Codex' zentrale Konfiguration.
const configArtifact: RefArtifact = {
  id: 'config',
  label: 'config.toml',
  icon: 'gear',
  file: '~/.codex/config.toml  ·  .codex/config.toml (Projekt)',
  surf: ['cli', 'ide', 'desktop'],
  tag: 'TOML · CLI + IDE teilen dieselbe Datei',
  intro:
    "Codex' zentrale Konfiguration — TOML, nicht JSON. Projekt-Dateien (.codex/config.toml) ueberlagern die globale, die naeher am Arbeitsverzeichnis gewinnt. Mit --profile laedst du benannte Varianten (~/.codex/<name>.config.toml).",
  skeleton: `#:schema https://developers.openai.com/codex/config-schema.json
model = "gpt-5-codex"
model_reasoning_effort = "medium"
approval_policy = "on-request"
sandbox_mode = "workspace-write"
web_search = "cached"`,
  fields: [
    { id: 'cx.schema', key: '#:schema', what: 'Schema-Kommentar ganz oben → Autocomplete + Validierung im Editor.', when: 'Immer — kostenlos.', safe: 'https://developers.openai.com/codex/config-schema.json', example: '#:schema https://developers.openai.com/codex/config-schema.json' },
    { id: 'cx.model', key: 'model', what: 'Default-Modell fuer CLI und IDE.', safe: 'Aktuelles Codex-Modell.', example: '"gpt-5-codex"' },
    { id: 'cx.provider', key: 'model_provider', what: 'Welcher Anbieter: openai, oder lokal (ollama, lmstudio) bzw. custom.', when: 'Fuer lokale/eigene Modelle.', safe: 'openai.', example: '"ollama"' },
    { id: 'cx.effort', key: 'model_reasoning_effort', what: 'Denk-Tiefe: minimal / low / medium / high.', safe: 'medium.', example: '"high"' },
    { id: 'cx.web', key: 'web_search', what: 'Web-Suche: cached (Default) / live / disabled.', when: 'live fuer frische Ergebnisse, disabled in abgeschotteten Umgebungen.', safe: 'cached.', example: '"live"' },
    { id: 'cx.personality', key: 'personality', what: 'Antwort-Ton: pragmatic / friendly / none.', safe: 'pragmatic.', example: '"friendly"' },
    { id: 'cx.devinstr', key: 'developer_instructions', what: 'Repo-Policy-Text, der jeder Anfrage vorangestellt wird.', when: 'Fuer feste Regeln (Pendant zu Teilen der AGENTS.md).', safe: 'Kurz halten.', example: '"Immer make lint vor Commit."' },
    { id: 'cx.docmax', key: 'project_doc_max_bytes', what: 'Obergrenze, wie viel AGENTS.md geladen wird.', safe: 'Default 32768 (32 KiB).', example: '65536' }
  ],
  notes: [
    'Vertrauensstufen pro Projekt stehen unter [projects] (trusted/untrusted) — nur vertrauenswuerdige Projekte lesen .codex/config.toml.',
    'Admin-erzwungene Grenzen kommen aus requirements.toml (z. B. approval_policy="never" verbieten).'
  ]
}

// AGENTS.md — Codex' Pendant zu CLAUDE.md.
const agentsmdArtifact: RefArtifact = {
  id: 'agentsmd',
  label: 'AGENTS.md',
  icon: 'rule',
  file: '~/.codex/AGENTS.md → ./AGENTS.md → <unterordner>/AGENTS.md',
  surf: ['cli', 'ide', 'desktop'],
  tag: 'Markdown · kein Frontmatter',
  intro:
    "Codex' Pendant zu CLAUDE.md: persistente Anweisungen als reines Markdown. Es kaskadiert ueber Ebenen — die Datei naeher am Arbeitsverzeichnis gewinnt. AGENTS.override.md weiter oben sticht eine darunterliegende.",
  skeleton: `# Projekt-Regeln
- Antworte auf Deutsch
- Conventional Commits, kein force-push auf main
- Tests vor jedem Push`,
  fields: [
    { id: 'ax.body', key: '# Ueberschriften / - Punkte', what: 'Reines Markdown — Regeln, Stil, Stack.', when: 'Fuer alles, was Codex dauerhaft beachten soll.', safe: 'Kurz & konkret.', example: '## Stil\\n- Tabs' },
    { id: 'ax.override', key: 'AGENTS.override.md', what: 'Uebersteuert eine AGENTS.md weiter unten in der Hierarchie.', when: 'Wenn ein uebergeordneter Ordner die Regeln eines Unterordners ueberschreiben soll.', safe: 'Sparsam einsetzen.', example: '# override' },
    { id: 'ax.fallback', key: 'project_doc_fallback_filenames', what: 'Weitere Dateinamen, die als Instruktions-Datei zaehlen, falls AGENTS.md fehlt (in config.toml).', when: 'Wenn dein Repo z. B. CLAUDE.md nutzt.', safe: '["CLAUDE.md"]', example: '["CLAUDE.md", "README.codex.md"]' }
  ],
  notes: ['Kein Frontmatter — anders als Skills/Subagents. Groesse wird ueber project_doc_max_bytes in config.toml gedeckelt.']
}

// Approvals & Sandbox — Codex' Sicherheitsmodell (zwei Achsen).
const approvalsArtifact: RefArtifact = {
  id: 'approvals',
  label: 'Approvals & Sandbox',
  icon: 'key',
  file: 'config.toml › approval_policy · sandbox_mode',
  surf: ['cli', 'ide', 'desktop'],
  tag: "Codex' Sicherheitsmodell",
  intro:
    'Statt einzelner Permission-Regeln wie bei Claude steuert Codex die Sicherheit ueber ZWEI Achsen: WANN gefragt wird (approval_policy) und WAS die Sandbox zulaesst (sandbox_mode). Zusammen ergeben sie das Risiko-Profil.',
  skeleton: `approval_policy = "on-request"      # untrusted | on-request | never
sandbox_mode   = "workspace-write" # read-only | workspace-write | danger-full-access

[sandbox_workspace_write]
network_access = false
writable_roots = ["/tmp/build"]`,
  fields: [
    { id: 'cx.approval', key: 'approval_policy', what: 'Wann Codex nachfragt: untrusted (nur Vertrautes ohne Frage) · on-request (Modell fragt bei Bedarf) · never (nie fragen).', when: 'on-request ist der gute Default; never nur in Sandbox/CI.', safe: 'on-request.', example: '"on-request"', pitfall: 'never ohne enge Sandbox = riskant; Admins koennen es per requirements.toml sperren.' },
    { id: 'cx.sandbox', key: 'sandbox_mode', what: 'Was ohne Freigabe erlaubt ist: read-only · workspace-write (Arbeitsordner schreibbar) · danger-full-access (alles).', when: 'workspace-write fuer normales Arbeiten.', safe: 'workspace-write.', example: '"workspace-write"', pitfall: 'danger-full-access hebt die Sandbox auf.' },
    { id: 'cx.net', key: '[sandbox_workspace_write] network_access', what: 'Ob die Sandbox ins Netz darf (Default aus).', when: 'Nur wenn noetig (z. B. npm install).', safe: 'false.', example: 'true' },
    { id: 'cx.writable', key: 'writable_roots', what: 'Zusaetzliche Pfade, die im workspace-write-Modus beschreibbar sind.', when: 'Build-/Cache-Ordner ausserhalb des Repos.', safe: 'Eng halten.', example: '["/tmp/build", "~/.cache"]' },
    { id: 'cx.reviewer', key: 'approvals_reviewer', what: 'Wer Freigaben prueft: user oder auto_review.', when: 'auto_review fuer mehr Autonomie.', safe: 'user.', example: '"user"' }
  ],
  notes: ['Schnell umschalten in der Sitzung: /permissions oder /approvals. Granulare Regeln via approval_policy = { granular = { … } }.']
}

// Hook — bei Codex deutlich eingeschraenkter (nur command-Hooks laufen).
const hookArtifact: RefArtifact = {
  id: 'hook',
  label: 'Hook',
  icon: 'hook',
  file: 'config.toml › [hooks]  ·  notify',
  surf: ['cli', 'ide', 'desktop'],
  tag: 'deutlich eingeschraenkter als Claude',
  intro:
    'Achtung — hier ist Codex spuerbar limitierter: Nur command-Hooks werden ausgefuehrt; prompt- und agent-Hooks werden zwar geparst, aber uebersprungen. Es gibt keine reiche Lifecycle-Palette wie bei Claude (PreToolUse, PostToolUse …). Konfiguriert in config.toml unter [hooks]; daneben gibt es das einfache notify-Programm fuer Ereignis-Benachrichtigungen.',
  skeleton: `notify = ["python3", "~/.codex/notify.py"]

[hooks]
# nur command-Hooks laufen; prompt-/agent-Hooks werden uebersprungen
[[hooks.<gruppe>]]
matcher = "…"
command = ["bash", "~/.codex/hooks/guard.sh"]`,
  fields: [
    { id: 'cxh.notify', key: 'notify', what: 'Ein Programm, das Codex bei bestimmten Ereignissen aufruft (z. B. Desktop-Benachrichtigung). Der einfachste Hook.', when: 'Fuer Fertig-Meldungen / Alerts.', safe: 'Schnelles Skript.', example: '["python3", "~/.codex/notify.py"]' },
    { id: 'cxh.matcher', key: '[hooks] matcher', what: 'Gruppiert, worauf ein command-Hook reagiert.', when: 'Bei command-Hooks.', safe: '—', example: '"Bash"' },
    { id: 'cxh.command', key: 'command', what: 'Auszufuehrender Befehl (Array). Nur dieser Hook-Typ laeuft tatsaechlich.', when: 'Fuer Format/Lint/Guard.', safe: 'command_windows als Windows-Variante.', example: '["bash", "./guard.sh"]' },
    { id: 'cxh.managed', key: 'managed_hooks_dir', what: 'Admin-verwaltetes Hook-Verzeichnis (macOS/Linux; …_windows fuer Windows).', when: 'Fuer organisationsweite Hooks.', safe: '—', example: '"/etc/codex/hooks"' }
  ],
  notes: ['Merksatz: Was du von Claudes Hooks kennst, ist hier nur teilweise da. prompt-/agent-Hooks existieren in der Konfig, tun aber (noch) nichts.']
}

// MCP-Server — externe Tool-Server in TOML.
const mcpArtifact: RefArtifact = {
  id: 'mcp',
  label: 'MCP-Server',
  icon: 'plug',
  file: 'config.toml › [mcp_servers.<id>]',
  surf: ['cli', 'ide', 'desktop'],
  tag: 'TOML-Tabelle',
  intro:
    'Externe Tool-Server, in TOML unter [mcp_servers.<id>]. CLI, IDE-Extension und Codex-App teilen dieselbe Liste. Hinzufuegen auch per „codex mcp add", ansehen mit /mcp.',
  skeleton: `[mcp_servers.github]
command = "npx"
args = ["-y", "@modelcontextprotocol/server-github"]
bearer_token_env_var = "GITHUB_TOKEN"
timeout_secs = 30
enabled = true`,
  fields: [
    { id: 'cxm.command', key: 'command', what: 'Programm, das den Server startet (stdio).', safe: 'npx / uvx / Pfad.', example: '"npx"' },
    { id: 'cxm.args', key: 'args', what: 'Argumente fuers Start-Kommando.', example: '["-y", "@mcp/github"]' },
    { id: 'cxm.url', key: 'url', what: 'Endpoint fuer Streamable-HTTP-Server (statt command).', when: 'Bei Remote-Servern.', example: '"https://mcp.example.com"' },
    { id: 'cxm.token', key: 'bearer_token_env_var', what: 'Name der Env-Variable mit dem Bearer-Token (Secret bleibt aus der Datei).', safe: 'Token nie im Klartext.', example: '"GITHUB_TOKEN"' },
    { id: 'cxm.timeout', key: 'timeout_secs', what: 'Zeitlimit fuer den Server.', example: '30' },
    { id: 'cxm.enabled', key: 'enabled', what: 'Server an/aus, ohne ihn zu entfernen.', example: 'false' }
  ],
  vars: [{ token: '/mcp', desc: 'Listet verbundene Server + Tools in der Sitzung.' }]
}

// Skill — Codex liest dasselbe offene SKILL.md-Format wie Claude.
const skillArtifact: RefArtifact = {
  id: 'skill',
  label: 'Skill',
  icon: 'skill',
  file: '~/.codex/skills/<name>/SKILL.md  ·  [[skills.config]]',
  surf: ['cli', 'ide', 'desktop'],
  tag: 'SKILL.md (AgentSkills.io) + TOML-Overrides',
  intro:
    'Codex liest dasselbe offene SKILL.md-Format wie Claude (name, description, allowed-tools …). Codex-spezifisch sind Pro-Skill-Overrides in config.toml unter [[skills.config]] (Pfad an/aus). Nicht jedes Feld, das Claude kennt, wirkt hier identisch.',
  skeleton: `---
name: deploy
description: Deployt nach Staging. Use when der User deployen will.
allowed-tools: Bash(git:*), Bash(npm:*)
---

# Anleitung …`,
  fields: [
    { id: 'cxs.name', key: 'name', what: 'Skill-Name (kebab-case, = Ordnername).', req: true, example: 'deploy' },
    { id: 'cxs.description', key: 'description', req: true, what: 'Wann die Skill greift — wie bei Claude der wichtigste Satz.', safe: 'Was + „Use when …".', example: 'Deployt nach Staging. Use when …' },
    { id: 'cxs.tools', key: 'allowed-tools', what: 'Tool-Beschraenkung (CSV oder Liste). Codex erzwingt sie.', safe: 'Bash scopen: Bash(git:*).', example: 'Read, Bash(npm:*)' },
    { id: 'cxs.override', key: '[[skills.config]] path / enabled', what: 'Codex-spezifisch: einzelne Skills per config.toml umbiegen oder abschalten.', when: 'Skill aus-/einschalten ohne Entfernen.', safe: '—', example: 'path = "~/skills/deploy"\\nenabled = false' }
  ],
  notes: ['Felder wie context: fork oder hooks aus Claude-Skills werden von Codex nicht (gleich) ausgewertet — Portieren prueft das pro Feld.']
}

// Subagent — bei Codex als TOML-Rollen, nicht Markdown.
const agentArtifact: RefArtifact = {
  id: 'agent',
  label: 'Subagent',
  icon: 'agent',
  file: 'config.toml › [agents.<rolle>]',
  surf: ['cli', 'ide', 'desktop'],
  tag: 'TOML-Rollen (nicht Markdown)',
  intro:
    'Anders als Claudes Markdown-Agents definiert Codex Subagenten als TOML-Rollen unter [agents.<rolle>]. Eine Rolle verweist auf eine Konfig-Datei und bekommt Anzeige-Namen.',
  skeleton: `[agents.reviewer]
description = "Reviewt Diffs nach Schweregrad"
config_file = "~/.codex/agents/reviewer.toml"
nickname_candidates = ["Rev", "Reviewer"]`,
  fields: [
    { id: 'cxa.desc', key: 'description', req: true, what: 'Wofuer die Rolle da ist — steuert die Delegation.', safe: 'Aktionsorientiert.', example: '"Reviewt Diffs nach Schweregrad"' },
    { id: 'cxa.config', key: 'config_file', what: 'Pfad zur Rollen-Konfiguration (eigene Tools/Modell).', example: '"~/.codex/agents/reviewer.toml"' },
    { id: 'cxa.nick', key: 'nickname_candidates', what: 'Anzeige-/Rufnamen der Rolle.', example: '["Rev", "Reviewer"]' }
  ],
  notes: ['Konzeptuell wie Claudes Subagent (eigener Kontext), aber Format und Felder unterscheiden sich — kein name/description-Frontmatter in einer .md.']
}

// /-Befehle (Katalog) — Codex' schlankerer Befehlssatz.
const slashArtifact: RefArtifact = {
  id: 'slash',
  label: '/-Befehle (Katalog)',
  icon: 'term',
  file: 'in der Sitzung tippen · / zeigt alle',
  tag: 'eingebaute Codex-Befehle · weniger als Claude',
  intro:
    'Codex hat einen eigenen, schlankeren Befehlssatz. Wichtig: nicht jeder laeuft ueberall — CLI/IDE/App teilen viel, die Cloud-Oberflaeche (chatgpt.com/codex) ist eingeschraenkter. Badges sind ein Richtwert — massgeblich ist /help in deiner Sitzung.',
  grouped: true,
  surfaceLegend: [
    { key: 'cli', desc: 'Terminal / CLI' },
    { key: 'ide', desc: 'IDE-Extension' },
    { key: 'desktop', desc: 'Codex-App' },
    { key: 'web', desc: 'chatgpt.com/codex (Cloud)' }
  ],
  fields: [
    { id: 'cxsl.init', key: '/init', group: 'Projekt', what: 'Erzeugt eine Start-AGENTS.md fuers Projekt.', surf: ['cli', 'ide', 'desktop'] },
    { id: 'cxsl.status', key: '/status', group: 'Projekt', what: 'Zeigt aktuelle Konfiguration: Modell, Sandbox, Approval.', surf: ['cli', 'ide', 'desktop', 'web'] },
    { id: 'cxsl.diff', key: '/diff', group: 'Arbeiten', what: 'Zeigt die aktuellen Aenderungen.', surf: ['cli', 'ide', 'desktop'] },
    { id: 'cxsl.review', key: '/review', group: 'Arbeiten', what: 'Laesst die Aenderungen pruefen (eigenes Review-Modell).', surf: ['cli', 'ide', 'desktop', 'web'] },
    { id: 'cxsl.compact', key: '/compact', group: 'Arbeiten', what: 'Verlauf komprimieren, um Kontext freizugeben.', surf: ['cli', 'ide', 'desktop', 'web'] },
    { id: 'cxsl.model', key: '/model', group: 'Konfig', what: 'Modell fuer die Sitzung wechseln.', surf: ['cli', 'ide', 'desktop', 'web'] },
    { id: 'cxsl.approvals', key: '/approvals', group: 'Konfig', what: 'Approval-Policy umschalten.', surf: ['cli', 'ide', 'desktop'] },
    { id: 'cxsl.permissions', key: '/permissions', group: 'Konfig', what: 'Sandbox-/Freigabe-Stufe in der Sitzung aendern.', surf: ['cli', 'ide', 'desktop'] },
    { id: 'cxsl.mcp', key: '/mcp', group: 'Erweitern', what: 'Verbundene MCP-Server + Tools auflisten.', surf: ['cli', 'ide', 'desktop'] },
    { id: 'cxsl.apps', key: '/apps', group: 'Erweitern', what: 'Connector-Apps durchsuchen/verbinden.', surf: ['cli', 'ide', 'desktop', 'web'] },
    { id: 'cxsl.feedback', key: '/feedback', group: 'Konto', what: 'Rueckmeldung / Bug an OpenAI melden.', surf: ['cli', 'ide', 'desktop', 'web'] }
  ],
  notes: ['Codex’ Befehlsumfang ist kleiner als der von Claude Code — viele Claude-Befehle (/hooks, /agents, /branch …) haben hier kein direktes Pendant.']
}

// Env-Variablen — Auszug der gaengigsten fuer Codex.
const envArtifact: RefArtifact = {
  id: 'env',
  label: 'Env-Variablen',
  icon: 'cube',
  file: 'Shell',
  surf: ['cli', 'ide', 'desktop'],
  tag: 'Auszug',
  intro: 'Umgebungsvariablen fuer Codex. Auszug der gaengigsten.',
  fields: [
    { id: 'cxe.home', key: 'CODEX_HOME', what: 'Ueberschreibt das Konfig-Verzeichnis (~/.codex).', when: 'Mehrere Profile / CI.', example: '/etc/codex' },
    { id: 'cxe.key', key: 'OPENAI_API_KEY', what: 'API-Schluessel fuer die Authentifizierung.', safe: 'Aus Secret/Keychain, nicht im Klartext.', example: '<API-KEY>' }
  ]
}

// Vollstaendiger Codex-Datensatz: Reihenfolge wie im Prototyp.
export const refdataCodex: RefDataset = {
  label: 'Codex',
  updated: 'Juni 2026',
  source: 'developers.openai.com/codex',
  artifacts: [
    configArtifact,
    agentsmdArtifact,
    approvalsArtifact,
    hookArtifact,
    mcpArtifact,
    skillArtifact,
    agentArtifact,
    slashArtifact,
    envArtifact
  ],
  changelog: {
    source: 'Codex',
    deltas: [
      { id: 'cc1', kind: 'added', art: 'config', field: 'cx.web', key: 'web_search', since: '0.40.0', note: 'Modi cached / live / disabled.' },
      { id: 'cc2', kind: 'added', art: 'config', field: 'cx.personality', key: 'personality', since: '0.41.0', note: 'Antwort-Ton: pragmatic / friendly / none.' },
      { id: 'cc3', kind: 'added', art: 'approvals', field: 'cx.reviewer', key: 'approvals_reviewer', since: '0.42.0', note: 'Freigabe-Pruefer: user oder auto_review.' },
      { id: 'cc4', kind: 'added', art: 'hook', field: 'cxh.command', key: '[hooks] command', since: '0.43.0', note: 'command-Hooks gibt es jetzt; prompt-/agent-Hooks weiterhin uebersprungen.' },
      { id: 'cc5', kind: 'added', art: 'approvals', field: null, key: 'exclude_slash_tmp', since: '0.44.0', note: '/tmp gezielt aus den Schreibrechten ausnehmen.' },
      { id: 'cc6', kind: 'deprecated', art: 'config', field: null, key: 'approval_mode', to: 'approval_policy', since: '0.3x', note: 'Altes Feld — nutze approval_policy.' },
      { id: 'cc7', kind: 'removed', art: 'config', field: null, key: 'disable_response_storage', to: 'Provider-Setting', since: '0.38.0', note: 'Entfaellt — pro Provider geregelt.' }
    ]
  }
}
