// src/renderer/sections/referenz/refdata-claude-teil2.ts
// Ausgelagerte grosse Claude-Artefakte (HR27, 300-Z-Limit von refdata.ts).
// Enthaelt den /-Befehl-Katalog und settings.json — die beiden umfangreichsten Artefakte.
// Reine Daten, kuratiert/editierbar, nie echte Secret-Werte. Quelle: code.claude.com/docs · Stand Juni 2026.

import type { RefArtifact } from '@shared/contract-referenz'

// Skill — Faehigkeit, die Claude bei Bedarf laedt.
export const skillArtifact: RefArtifact = {
  id: 'skill',
  label: 'Skill',
  icon: 'skill',
  file: '~/.claude/skills/<name>/SKILL.md',
  surf: ['cli', 'ide', 'desktop'],
  tag: 'Markdown + YAML-Frontmatter',
  intro:
    'Eine Faehigkeit, die Claude bei Bedarf laedt. Oben YAML zwischen ---, darunter die Anweisung. Nur description ist wirklich wichtig — daran erkennt Claude, wann die Skill greift. Der /-Befehl kommt aus dem Ordnernamen.',
  skeleton: `---
name: summarize-changes
description: Fasst uncommittete Aenderungen zusammen und markiert Risiken.
  Use when der User fragt was sich geaendert hat oder eine Commit-Message will.
allowed-tools: Read, Grep, Bash(git diff:*)
---

# Anleitung
Fasse die Aenderungen in 2–3 Stichpunkten zusammen, dann liste Risiken.`,
  fields: [
    { id: 'skill.name', key: 'name', what: 'Anzeige-Label in der Skill-Liste. Bei normalen Skills aendert es NICHT den /-Befehl — der kommt aus dem Ordnernamen.', when: 'Selten noetig — nur wenn das Label vom Ordner abweichen soll.', safe: 'Weglassen → Ordnername wird genutzt.', example: 'summarize-changes', pitfall: 'Muss kebab-case sein und (wenn gesetzt) exakt dem Ordnernamen entsprechen — case-sensitive auf Mac/Linux.' },
    { id: 'skill.description', key: 'description', req: true, what: 'Der wichtigste Satz: sagt Claude, WANN die Skill automatisch geladen wird.', when: 'Immer setzen.', safe: 'Formel: Was es tut + „Use when …" + Schluesselwoerter.', example: 'Reviewt PRs auf OWASP-Top-10. Use when Auth/Daten-Code betroffen ist.', pitfall: 'Zu vage → triggert nie oder bei allem.' },
    { id: 'skill.allowed-tools', key: 'allowed-tools', what: 'Beschraenkt, welche Tools die Skill nutzen darf (CSV oder YAML-Liste).', when: 'Wenn die Skill nur lesen oder nur bestimmte Tools braucht.', safe: 'So eng wie moeglich; Bash immer scopen: Bash(git:*).', example: 'Read, Grep, Bash(npm:*)', pitfall: 'Nacktes „Bash" = Sicherheitsrisiko (alles erlaubt).' },
    { id: 'skill.disable-model-invocation', key: 'disable-model-invocation', what: 'true = nur DU kannst die Skill per /befehl starten, Claude nicht von selbst.', when: 'Fuer Nebenwirkungen: /deploy, /commit, /send-slack.', safe: 'true bei allem Destruktiven oder Teuren.', example: 'true' },
    { id: 'skill.user-invocable', key: 'user-invocable', what: 'false = nur Claude darf die Skill nutzen (Hintergrundwissen, kein /-Befehl).', when: 'Fuer Kontextwissen, das als Befehl keinen Sinn ergibt.', safe: 'Default true lassen.', example: 'false', pitfall: 'disable-model-invocation:true + user-invocable:false = unerreichbare Skill.' },
    { id: 'skill.model', key: 'model', what: 'Nagelt das Modell fuer diese Skill fest.', when: 'Wenn die Skill ein bestimmtes Modell braucht (z. B. teure Analyse → opus).', safe: 'inherit (Standard) oder sonnet/opus/haiku — nie eine hardcodierte Modell-ID (bricht bei Deprecation).', example: 'inherit' },
    { id: 'skill.context', key: 'context', what: 'fork = die Skill laeuft als isolierter Subagent mit eigenem Kontextfenster.', when: 'Bei viel explorativer Arbeit, die den Hauptchat zumuellen wuerde.', safe: 'Weglassen, ausser du willst Isolation.', example: 'fork' },
    { id: 'skill.agent', key: 'agent', what: 'Welcher Subagent-Typ bei context: fork ausfuehrt (Explore/Plan/general-purpose).', when: 'Nur zusammen mit context: fork.', safe: 'Explore fuer reines Lesen/Suchen.', example: 'Explore' },
    { id: 'skill.argument-hint', key: 'argument-hint', what: 'Hinweis im UI, welches Argument die Skill erwartet.', when: 'Wenn die Skill ein Argument nach dem /-Befehl nutzt.', safe: '—', example: '[issue-number]' },
    { id: 'skill.effort', key: 'effort', what: 'Denk-Tiefe fuer die Skill: low / medium / high.', when: 'Bei anspruchsvollen Aufgaben hoeher, bei simplen niedriger (spart Tokens).', safe: 'Weglassen = Session-Default.', example: 'high' }
  ],
  vars: [
    { token: '$ARGUMENTS', desc: 'Alles, was du nach dem /-Befehl tippst.' },
    { token: '!`befehl`', desc: 'Dynamische Kontext-Injektion: der Shell-Befehl wird ausgefuehrt und durch seinen Output ersetzt, bevor Claude die Skill sieht.' },
    { token: '@pfad/datei', desc: 'Bezieht eine Datei in den Kontext ein.' }
  ],
  notes: [
    'Identitaets-Felder version / author / license / tags (AgentSkills.io-Standard) stehen top-level, nicht unter metadata:.',
    'SKILL.md unter ~500 Zeilen halten; Details in separate Dateien auslagern.'
  ]
}

// Hook — Shell-/HTTP-Befehle an Lifecycle-Events.
export const hookArtifact: RefArtifact = {
  id: 'hook',
  label: 'Hook',
  icon: 'hook',
  file: 'settings.json › hooks',
  surf: ['cli', 'ide', 'desktop'],
  tag: 'JSON in settings.json',
  intro:
    'Shell- oder HTTP-Befehle, die an Lifecycle-Events feuern. Struktur: hooks → Event → [ Matcher + Befehle ]. Direkte Datei-Edits muessen im /hooks-Menue bestaetigt werden, bevor sie greifen (Sicherheits-Gate).',
  skeleton: `{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          { "type": "command", "command": "~/.claude/hooks/guard.sh", "timeout": 10 }
        ]
      }
    ]
  }
}`,
  fields: [
    { id: 'hook.matcher', key: 'matcher', what: 'Regex, welche Tools den Hook ausloesen. Gilt NUR fuer PreToolUse/PostToolUse/PermissionRequest.', when: 'Bei tool-bezogenen Events.', safe: '„Edit|Write", „Bash", oder „.*"/"" = alle.', example: 'Edit|Write', pitfall: 'Case-sensitive, keine Leerzeichen um |.' },
    { id: 'hook.type', key: 'type', what: 'Handler-Art: command (JSON auf stdin) oder http (JSON als POST-Body).', when: 'command fuer lokale Skripte, http fuer Services.', safe: 'command.', example: 'command' },
    { id: 'hook.command', key: 'command', what: 'Der Shell-Befehl. Bekommt das Event-JSON auf stdin (mit jq/python parsen).', when: 'Bei type: command.', safe: 'Schnell halten (<500 ms), idempotent.', example: 'npx prettier --write "$CLAUDE_PROJECT_DIR/..."' },
    { id: 'hook.timeout', key: 'timeout', what: 'Sekunden bis Abbruch.', when: 'Bei langsamen Befehlen anheben/senken.', safe: 'Default 60.', example: '10' },
    { id: 'hook.async', key: 'async', what: 'true = laeuft im Hintergrund, bremst Claude nicht.', when: 'Fuer Logging/Notifs ohne Entscheidung.', safe: 'false bei blockierenden Checks.', example: 'true' },
    { id: 'hook.once', key: 'once', what: 'true = nur einmal pro Session.', when: 'Einmal-Setup.', safe: '—', example: 'true' }
  ],
  events: [
    { key: 'PreToolUse', desc: 'Vor jedem Tool-Aufruf. Maechtigstes Event: erlauben/blocken/aendern. exit 2 oder permissionDecision: deny blockt.' },
    { key: 'PostToolUse', desc: 'Nach erfolgreichem Tool. Kann nicht rueckgaengig — ideal fuer Formatieren, Linten, Tests, Logging.' },
    { key: 'UserPromptSubmit', desc: 'Bevor dein Prompt verarbeitet wird. stdout wird als Kontext injiziert (z. B. Sprint-Ziele anhaengen).' },
    { key: 'Stop / SubagentStop', desc: 'Wenn Claude / ein Subagent fertig ist. exit 2 zwingt zum Weiterarbeiten.' },
    { key: 'SessionStart', desc: 'Sitzungsstart (matcher: startup/resume/clear/compact). stdout = Kontext, z. B. Git-Status.' },
    { key: 'SessionEnd', desc: 'Sitzungsende — Aufraeumen, Logging.' },
    { key: 'Notification', desc: 'Claude meldet sich (Permission-Frage / Idle) — Alerts nach Slack/Desktop.' },
    { key: 'PreCompact', desc: 'Kurz bevor die History komprimiert wird (matcher: manual/auto).' }
  ],
  vars: [
    { token: 'stdin-JSON', desc: 'tool_name · tool_input · session_id · cwd · hook_event_name (PostToolUse zusaetzlich tool_response).' },
    { token: '$CLAUDE_PROJECT_DIR', desc: 'Projekt-Wurzel.' },
    { token: '$CLAUDE_ENV_FILE', desc: 'Fuer SessionStart-Hooks, um Variablen zu persistieren.' },
    { token: 'exit 0 / 2 / sonst', desc: '0 = ok · 2 = blockieren (stderr geht an Claude) · sonst = nicht-blockierender Fehler.' }
  ]
}

// /-Befehle (Katalog) — eingebaute Befehle, Verfuegbarkeit pro Oberflaeche.
export const slashArtifact: RefArtifact = {
  id: 'slash',
  label: '/-Befehle (Katalog)',
  icon: 'term',
  file: 'in der Sitzung tippen · / zeigt alle',
  tag: 'eingebaute Befehle · Verfuegbarkeit pro Oberflaeche',
  intro:
    'Die eingebauten /-Befehle steuern die Sitzung selbst. Wichtig: nicht jeder laeuft ueberall — die CLI ist die volle Referenz, IDE/Desktop/Web spiegeln nur eine Teilmenge (Web fasst kein lokales Dateisystem an). Die Badges zeigen, wo ein Befehl verfuegbar ist (Richtwert) — massgeblich ist immer /help in DEINER Sitzung.',
  grouped: true,
  surfaceLegend: [
    { key: 'cli', desc: 'Terminal (volle Referenz)' },
    { key: 'ide', desc: 'VS Code / JetBrains' },
    { key: 'desktop', desc: 'Desktop-App' },
    { key: 'web', desc: 'claude.ai/code (kein lokales FS)' }
  ],
  fields: [
    { id: 'sl.help', key: '/help', group: 'Sitzung & Kontext', what: 'Listet alle Befehle, die in DEINER Sitzung verfuegbar sind.', surf: ['cli', 'ide', 'desktop', 'web'] },
    { id: 'sl.clear', key: '/clear', group: 'Sitzung & Kontext', what: 'Kontext leeren und frisch starten — Projekt-Memory bleibt.', surf: ['cli', 'ide', 'desktop', 'web'] },
    { id: 'sl.compact', key: '/compact', group: 'Sitzung & Kontext', what: 'Verlauf komprimieren, um Kontext freizugeben.', surf: ['cli', 'ide', 'desktop', 'web'] },
    { id: 'sl.context', key: '/context', group: 'Sitzung & Kontext', what: 'Zeigt die Kontext-Auslastung (inkl. Skill-Budget-Warnungen).', surf: ['cli', 'ide', 'desktop', 'web'] },
    { id: 'sl.rewind', key: '/rewind', group: 'Sitzung & Kontext', what: 'Rollt Code + Konversation auf einen Checkpoint zurueck.', surf: ['cli', 'ide', 'desktop'] },
    { id: 'sl.resume', key: '/resume', group: 'Sitzung & Kontext', what: 'Eine fruehere Konversation fortsetzen.', surf: ['cli', 'ide', 'desktop'] },
    { id: 'sl.branch', key: '/branch', group: 'Sitzung & Kontext', what: 'Konversation in eine neue Sitzung abzweigen. /fork existiert weiterhin als eigener Befehl (koexistiert, andere Rolle).', since: '2.1.77', surf: ['cli', 'ide', 'desktop'] },
    { id: 'sl.export', key: '/export', group: 'Sitzung & Kontext', what: 'Konversation in Datei oder Zwischenablage exportieren.', example: '/export conversation.md', surf: ['cli', 'ide', 'desktop', 'web'] },

    { id: 'sl.plan', key: '/plan', group: 'Arbeiten & Planen', what: 'Read-only Plan-Modus: erst Strategie, dann Umsetzung (auch Shift+Tab).', surf: ['cli', 'ide', 'desktop', 'web'] },
    { id: 'sl.aside', key: '/aside', group: 'Arbeiten & Planen', what: 'Kurze Zwischenfrage stellen, ohne den Hauptkontext zu verschmutzen.', surf: ['cli', 'ide', 'desktop'] },
    { id: 'sl.batch', key: '/batch', group: 'Arbeiten & Planen', what: 'Grosse Aenderung in 5–30 Einheiten zerlegen und je einen Hintergrund-Agenten starten (Skill).', surf: ['cli', 'ide', 'desktop'] },
    { id: 'sl.loop', key: '/loop', group: 'Arbeiten & Planen', what: 'Prompt wiederholt laufen lassen, solange die Sitzung offen ist (Skill).', alias: '/proactive', surf: ['cli', 'ide', 'desktop'] },
    { id: 'sl.background', key: '/background', group: 'Arbeiten & Planen', what: 'Laufende Hintergrund-Aufgaben ansehen (auch Ctrl+B).', surf: ['cli', 'ide', 'desktop'] },
    { id: 'sl.goal', key: '/goal', group: 'Arbeiten & Planen', what: 'Ein Sitzungs-Ziel setzen, an dem Claude sich orientiert.', surf: ['cli', 'ide', 'desktop'] },

    { id: 'sl.model', key: '/model', group: 'Modell & Eingabe', what: 'Modell mitten in der Sitzung wechseln.', surf: ['cli', 'ide', 'desktop', 'web'] },
    { id: 'sl.config', key: '/config', group: 'Modell & Eingabe', what: 'Einstellungen-UI: Theme, Modell, Output-Style …', alias: '/settings', surf: ['cli', 'ide', 'desktop', 'web'] },
    { id: 'sl.effort', key: '/effort', group: 'Modell & Eingabe', what: 'Denk-Tiefe einstellen (Slider: low … xhigh/max).', since: '2.1.111', surf: ['cli', 'ide', 'desktop'] },
    { id: 'sl.vim', key: '/vim', group: 'Modell & Eingabe', what: 'Vim-Tastenbelegung im Eingabefeld.', surf: ['cli'] },
    { id: 'sl.statusline', key: '/statusline', group: 'Modell & Eingabe', what: 'Statusline im Terminal einrichten.', surf: ['cli'] },
    { id: 'sl.terminalsetup', key: '/terminal-setup', group: 'Modell & Eingabe', what: 'Terminal-Tastenkuerzel einrichten.', surf: ['cli'] },
    { id: 'sl.outputstyle', key: '/output-style', group: 'Modell & Eingabe', what: 'Output-Style waehlen, der den System-Prompt anpasst (z. B. Explanatory).', surf: ['cli', 'ide', 'desktop', 'web'] },

    { id: 'sl.init', key: '/init', group: 'Projekt einrichten', what: 'Erzeugt eine Start-CLAUDE.md fuers Projekt.', surf: ['cli', 'ide', 'desktop'] },
    { id: 'sl.memory', key: '/memory', group: 'Projekt einrichten', what: 'CLAUDE.md bearbeiten, Auto-Memory steuern.', surf: ['cli', 'ide', 'desktop'] },
    { id: 'sl.adddir', key: '/add-dir', group: 'Projekt einrichten', what: 'Zusaetzliches Arbeitsverzeichnis fuer die Sitzung (kein Config-Discovery).', surf: ['cli', 'ide', 'desktop'] },
    { id: 'sl.permissions', key: '/permissions', group: 'Projekt einrichten', what: 'Freigabe-Regeln (allow/ask/deny) setzen.', surf: ['cli', 'ide', 'desktop'] },
    { id: 'sl.teamonboarding', key: '/team-onboarding', group: 'Projekt einrichten', what: 'Erzeugt einen Einarbeitungs-Leitfaden aus CLAUDE.md, Skills, Subagenten & Hooks.', since: '2.1.101', surf: ['cli', 'ide', 'desktop'] },

    { id: 'sl.agents', key: '/agents', group: 'Erweitern', what: 'Subagenten anlegen/verwalten (interaktiv).', surf: ['cli', 'ide', 'desktop'] },
    { id: 'sl.hooks', key: '/hooks', group: 'Erweitern', what: 'Hook-Konfiguration ansehen + bestaetigen.', surf: ['cli', 'ide', 'desktop'] },
    { id: 'sl.mcp', key: '/mcp', group: 'Erweitern', what: 'MCP-Server + OAuth verwalten.', surf: ['cli', 'ide', 'desktop'] },
    { id: 'sl.plugin', key: '/plugin', group: 'Erweitern', what: 'Plugins installieren/verwalten.', surf: ['cli', 'ide', 'desktop'] },
    { id: 'sl.reloadplugins', key: '/reload-plugins', group: 'Erweitern', what: 'Alle aktiven Plugins neu laden, ohne die CLI neu zu starten.', surf: ['cli', 'ide', 'desktop'] },
    { id: 'sl.fewerpermission', key: '/fewer-permission-prompts', group: 'Erweitern', what: 'Bash/MCP-Aufrufe analysieren und per Allowlist die Permission-Prompts reduzieren.', since: '2.1.111', surf: ['cli', 'ide', 'desktop'] },

    { id: 'sl.review', key: '/review', group: 'Review & Qualitaet', what: 'Read-only-Durchsicht des aktuellen Diffs.', surf: ['cli', 'ide', 'desktop', 'web'] },
    { id: 'sl.codereview', key: '/code-review', group: 'Review & Qualitaet', what: 'Diff auf Korrektheits-Bugs pruefen; mit --fix anwendbar.', surf: ['cli', 'ide', 'desktop'] },
    { id: 'sl.securityreview', key: '/security-review', group: 'Review & Qualitaet', what: 'Tieferer, read-only Sicherheits-Durchgang.', surf: ['cli', 'ide', 'desktop'] },
    { id: 'sl.diff', key: '/diff', group: 'Review & Qualitaet', what: 'Zeigt, was sich geaendert hat.', surf: ['cli', 'ide', 'desktop'] },
    { id: 'sl.simplify', key: '/simplify', group: 'Review & Qualitaet', what: 'Cleanup-Durchgang (Wiederverwendung/Vereinfachung) und Fixes anwenden — sucht keine Bugs.', surf: ['cli', 'ide', 'desktop'] },
    { id: 'sl.ultrareview', key: '/code-review ultra', group: 'Review & Qualitaet', what: 'Umfassendes Multi-Agent-Review in der Cloud.', since: '2.1.111', surf: ['cli', 'ide', 'desktop'] },

    { id: 'sl.status', key: '/status', group: 'Diagnose & Konto', what: 'Status-Panel: aktive Quellen, System-Info.', surf: ['cli', 'ide', 'desktop', 'web'] },
    { id: 'sl.doctor', key: '/doctor', group: 'Diagnose & Konto', what: 'Installations- und Laufzeit-Probleme diagnostizieren.', surf: ['cli', 'ide'] },
    { id: 'sl.cost', key: '/cost', group: 'Diagnose & Konto', what: 'Token-Verbrauch der Sitzung.', surf: ['cli', 'ide', 'desktop', 'web'] },
    { id: 'sl.usage', key: '/usage', group: 'Diagnose & Konto', what: 'Abo-Limits / Nutzung ansehen.', surf: ['cli', 'ide', 'desktop', 'web'] },
    { id: 'sl.feedback', key: '/feedback', group: 'Diagnose & Konto', what: 'Bug mit Sitzungs-Kontext an Anthropic melden.', surf: ['cli', 'ide', 'desktop', 'web'] },
    { id: 'sl.releasenotes', key: '/release-notes', group: 'Diagnose & Konto', what: 'Release-Notes der aktuellen Version.', surf: ['cli', 'ide', 'desktop', 'web'] },
    { id: 'sl.debug', key: '/debug', group: 'Diagnose & Konto', what: 'Laufzeit-Diagnose: ausfuehrliche Ausgabe zu Claudes Ablauf.', surf: ['cli', 'ide', 'desktop'] },
    { id: 'sl.ide', key: '/ide', group: 'Diagnose & Konto', what: 'Mit einer laufenden IDE verbinden.', surf: ['cli'] },
    { id: 'sl.githubapp', key: '/install-github-app', group: 'Diagnose & Konto', what: 'Die GitHub-App fuers Repo einrichten (PR-/Issue-Integration).', surf: ['cli', 'ide', 'desktop'] },
    { id: 'sl.login', key: '/login', group: 'Diagnose & Konto', what: 'Anthropic-Konto anmelden / wechseln.', surf: ['cli', 'ide', 'desktop'] },
    { id: 'sl.logout', key: '/logout', group: 'Diagnose & Konto', what: 'Vom Anthropic-Konto abmelden.', surf: ['cli', 'ide', 'desktop'] },
    { id: 'sl.privacy', key: '/privacy-settings', group: 'Diagnose & Konto', what: 'Datenschutz-Einstellungen ansehen/aendern.', surf: ['cli', 'ide', 'desktop', 'web'] },

    { id: 'sl.teleport', key: '/teleport', group: 'Remote (claude.ai)', what: 'Eine Web-Sitzung in dieses Terminal holen.', surf: ['cli'] },
    { id: 'sl.remotecontrol', key: '/remote-control', group: 'Remote (claude.ai)', what: 'Diese lokale Sitzung von einem anderen Geraet weitersteuern.', surf: ['cli', 'desktop'] },
    { id: 'sl.resumeremote', key: '/resume-remote', group: 'Remote (claude.ai)', what: 'Eine Remote-Sitzung von claude.ai fortsetzen.', surf: ['cli', 'ide', 'desktop'] }
  ],
  notes: [
    '60+ eingebaute Befehle existieren — hier die wichtigsten. Tippe / in deiner Sitzung fuer die vollstaendige, oberflaechen-korrekte Liste.',
    'Befehle aus Skills/Plugins/MCP erscheinen ebenfalls als /name — bei Namensgleichheit gewinnt die Skill.'
  ]
}

// settings.json — Verhalten, Berechtigungen, Umgebung (Auszug der Power-User-Keys).
export const settingsArtifact: RefArtifact = {
  id: 'settings',
  label: 'settings.json',
  icon: 'gear',
  file: '~/.claude/settings.json  ·  .claude/settings.json  ·  managed-settings.json',
  surf: ['cli', 'ide', 'desktop'],
  tag: 'JSON · kaskadiert ueber Ebenen',
  intro:
    'Verhalten, Berechtigungen, Umgebung. Kaskadiert: Managed → User → Projekt → Local. Auszug der wichtigsten Power-User-Keys — die vollstaendige Liste hat ~130 Keys (eigene settings.json-Referenz).',
  skeleton: `{
  "$schema": "https://json.schemastore.org/claude-code-settings.json",
  "model": "claude-sonnet-4-6",
  "language": "german",
  "permissions": { "deny": ["Bash(curl:*)", "Read(./.env)"] },
  "env": { "TZ": "Europe/Berlin" }
}`,
  fields: [
    { id: 'set.$schema', key: '$schema', what: 'Schema-URL ganz oben → schaltet Autocomplete + Inline-Validierung im Editor frei.', when: 'Immer — kostet nichts, hilft enorm.', safe: 'https://json.schemastore.org/claude-code-settings.json', example: '"https://json.schemastore.org/claude-code-settings.json"' },
    { id: 'set.model', key: 'model', what: 'Default-Modell fuer Claude Code.', safe: 'Alias statt Hardcoded-ID, wo moeglich.', example: '"claude-sonnet-4-6"' },
    { id: 'set.availableModels', key: 'availableModels', what: 'Welche Modelle per /model waehlbar sind.', example: '["sonnet", "haiku"]' },
    { id: 'set.language', key: 'language', what: 'Bevorzugte Antwort- (und Diktier-)Sprache.', example: '"german"' },
    { id: 'set.outputStyle', key: 'outputStyle', what: 'Output-Style, passt den System-Prompt an.', example: '"Explanatory"' },
    { id: 'set.effortLevel', key: 'effortLevel', what: 'Denk-Tiefe ueber Sessions: low/medium/high/xhigh.', example: '"high"' },
    { id: 'set.alwaysThinkingEnabled', key: 'alwaysThinkingEnabled', what: 'Extended Thinking standardmaessig an.', example: 'true' },
    { id: 'set.permissions', key: 'permissions', what: 'Berechtigungs-Objekt (allow/ask/deny). Siehe Tab „Permissions".', example: '{ "deny": ["Bash(curl:*)"] }' },
    { id: 'set.env', key: 'env', what: 'Umgebungsvariablen fuer jede Session + Subprozesse.', example: '{ "TZ": "Europe/Berlin" }' },
    { id: 'set.hooks', key: 'hooks', what: 'Lifecycle-Hooks. Siehe Tab „Hook".', example: '{ "PostToolUse": [ … ] }' },
    { id: 'set.statusLine', key: 'statusLine', what: 'Eigene Statusline per Skript.', surf: ['cli'], example: '{ "type": "command", "command": "~/.claude/statusline.sh" }' },
    { id: 'set.cleanupPeriodDays', key: 'cleanupPeriodDays', what: 'Transcripts aelter als X Tage werden beim Start entfernt.', safe: 'Default 30.', example: '20' },
    { id: 'set.autoUpdatesChannel', key: 'autoUpdatesChannel', what: 'Release-Kanal: stable (~1 Woche alt) oder latest.', safe: 'stable fuer ruhigere Updates.', example: '"stable"' },
    { id: 'set.minimumVersion', key: 'minimumVersion', what: 'Untergrenze, unter die Auto-Updates nicht zurueckfallen.', example: '"2.1.100"' },
    { id: 'set.includeGitInstructions', key: 'includeGitInstructions', what: 'Commit/PR-Workflow + Git-Status in den System-Prompt.', safe: 'Default true.', example: 'false' },
    { id: 'set.autoMemoryEnabled', key: 'autoMemoryEnabled', what: 'Auto-Memory an/aus (auch via /memory).', safe: 'Default true.', example: 'false' },
    { id: 'set.editorMode', key: 'editorMode', what: 'Eingabe-Tastenbelegung: normal oder vim.', surf: ['cli'], example: '"vim"' },
    { id: 'set.skillOverrides', key: 'skillOverrides', what: 'Pro-Skill-Sichtbarkeit: on/name-only/user-invocable-only/off.', example: '{ "deploy": "off" }', since: '2.1.129' },
    { id: 'set.maxSkillDescriptionChars', key: 'maxSkillDescriptionChars', what: 'Zeichenlimit fuers Skill-Listing pro Skill.', safe: 'Default 1536.', example: '2048', since: '2.1.105' },
    { id: 'set.disableAllHooks', key: 'disableAllHooks', what: 'Alle Hooks + Custom-Statusline aus.', example: 'true' },
    { id: 'set.enabledMcpjsonServers', key: 'enabledMcpjsonServers', what: 'Welche Server aus .mcp.json genehmigt werden.', example: '["github", "memory"]' },
    { id: 'set.enableAllProjectMcpServers', key: 'enableAllProjectMcpServers', what: 'Alle Server aus Projekt-.mcp.json automatisch genehmigen.', example: 'true' },
    { id: 'set.apiKeyHelper', key: 'apiKeyHelper', what: 'Skript, das einen Auth-Wert/Key erzeugt (statt Klartext).', example: '"/bin/gen_key.sh"' },
    { id: 'set.preferredNotifChannel', key: 'preferredNotifChannel', what: 'Benachrichtigungsweg: auto/terminal_bell/iterm2/…', example: '"terminal_bell"' },
    { id: 'set.companyAnnouncements', key: 'companyAnnouncements', what: 'Start-Ankuendigungen fuer User.', example: '["Welcome to Acme Corp!"]', managed: true }
  ],
  notes: [
    'Die Web-Oberflaeche (claude.ai/code) liest KEINE lokale settings.json — sie fasst kein lokales Dateisystem an. Lokale Datei-Config gilt nur in CLI / IDE / Desktop.',
    '(managed) = greift nur im Policy-Layer (managed-settings.json / MDM) und wird in User-/Projekt-Settings ignoriert.',
    'Aktive Quellen pruefen: /status · bearbeiten: /config.'
  ]
}
