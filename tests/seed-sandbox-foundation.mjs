import { join } from 'node:path'

export function seedFoundationCategories({ CLAUDE, CODEX, SHARED, dir, file, skillMd, agentMd, variantMd }) {
// ══════════════════════════════════════════════════════════════════════════════
//  KATEGORIE: SKILLS  (Ordner-Manifest SKILL.md)
// ══════════════════════════════════════════════════════════════════════════════

// (S1) Shared↔Claude diff-Ordner MIT mehreren Innendateien: "skill-diff-multi"
{
  const nm = 'skill-diff-multi'
  const sharedDir = dir(join(SHARED, 'skills', nm))
  const claudeDir = dir(join(CLAUDE, 'skills', nm))
  const manifest = skillMd(nm, 'Demo-Skill mit abweichender Innendatei', 'Gemeinsamer Hauptinhalt, identisch auf beiden Seiten.')
  file(join(sharedDir, 'SKILL.md'), manifest)
  file(join(claudeDir, 'SKILL.md'), manifest)
  file(join(sharedDir, 'extra.md'), ['# Extra (Shared)', '', 'Zeile A — Shared-Variante', 'Zeile B gemeinsam', 'Zeile C — Shared-Variante', 'Zeile D gemeinsam', ''].join('\n'))
  file(join(claudeDir, 'extra.md'), ['# Extra (Claude)', '', 'Zeile A — Claude-Variante', 'Zeile B gemeinsam', 'Zeile C — Claude-Variante', 'Zeile D gemeinsam', ''].join('\n'))
  file(join(claudeDir, 'nur-claude.md'), ['# Nur Claude', '', 'Diese Innendatei existiert nur auf der Claude-Seite.', ''].join('\n'))
}

// (S2) Shared↔Claude IDENTISCH (verdict same): "skill-same"
{
  const nm = 'skill-same'
  const sharedDir = dir(join(SHARED, 'skills', nm))
  const claudeDir = dir(join(CLAUDE, 'skills', nm))
  const manifest = skillMd(nm, 'Identischer Demo-Skill auf beiden Seiten', 'Byte-identischer Inhalt -> verdict same.')
  file(join(sharedDir, 'SKILL.md'), manifest)
  file(join(claudeDir, 'SKILL.md'), manifest)
}

// (S3) only-Shared-Ordner (mehrere Innendateien): "skill-only-shared"
{
  const nm = 'skill-only-shared'
  const d = dir(join(SHARED, 'skills', nm))
  file(join(d, 'SKILL.md'), skillMd(nm, 'Nur in Shared vorhanden', 'Existiert nur auf der Shared-Seite.'))
  file(join(d, 'notes.md'), ['# Notizen (Shared-only)', '', 'Zusatzdatei eins.', ''].join('\n'))
  file(join(d, 'guide.md'), ['# Anleitung (Shared-only)', '', 'Zusatzdatei zwei.', ''].join('\n'))
}

// (S4) only-Claude-Ordner (mehrere Innendateien): "skill-only-claude"
{
  const nm = 'skill-only-claude'
  const d = dir(join(CLAUDE, 'skills', nm))
  file(join(d, 'SKILL.md'), skillMd(nm, 'Nur in Claude vorhanden', 'Existiert nur auf der Claude-Seite.'))
  file(join(d, 'notes.md'), ['# Notizen (Claude-only)', '', 'Zusatzdatei eins.', ''].join('\n'))
  file(join(d, 'guide.md'), ['# Anleitung (Claude-only)', '', 'Zusatzdatei zwei.', ''].join('\n'))
}

// (S5) Shared↔Codex Skill-Ordner diff: "skill-codex-pair"
{
  const nm = 'skill-codex-pair'
  const sharedDir = dir(join(SHARED, 'skills', nm))
  const codexDir = dir(join(CODEX, 'skills', nm))
  const manifest = skillMd(nm, 'Shared↔Codex Skill-Ordner-Paar', 'Gemeinsamer Hauptinhalt.')
  file(join(sharedDir, 'SKILL.md'), manifest)
  file(join(codexDir, 'SKILL.md'), manifest)
  file(join(sharedDir, 'extra.md'), ['# Extra (Shared)', '', 'Zeile A — Shared-Variante', 'Zeile B gemeinsam', ''].join('\n'))
  file(join(codexDir, 'extra.md'), ['# Extra (Codex)', '', 'Zeile A — Codex-Variante', 'Zeile B gemeinsam', ''].join('\n'))
}

// (S6) Mirror-im-selben-Tool (Claude): MIRROR_RX matcht den Pfad ('mirror').
{
  const nm = 'skill-mirror-pair'
  const normalDir = dir(join(CLAUDE, 'skills', nm))
  const mirrorDir = dir(join(CLAUDE, 'skills', 'mirror', nm))
  const manifest = skillMd(nm, 'Mirror-Paar im selben Tool (Claude)', 'Original-Inhalt.')
  file(join(normalDir, 'SKILL.md'), manifest)
  file(join(mirrorDir, 'SKILL.md'), manifest)
  file(join(normalDir, 'body.md'), ['# Body (Original)', '', 'Zeile A — Original-Variante', 'Zeile B gemeinsam', ''].join('\n'))
  file(join(mirrorDir, 'body.md'), ['# Body (Spiegel)', '', 'Zeile A — Spiegel-Variante', 'Zeile B gemeinsam', ''].join('\n'))
}

// ══════════════════════════════════════════════════════════════════════════════
//  KATEGORIE: RULES  (Einzeldateien — kein Manifest -> compareSingleFile)
// ══════════════════════════════════════════════════════════════════════════════
{
  const nm = 'rule-diff.md'
  file(join(SHARED, 'rules', nm), variantMd('Demo-Regel', 'Shared'))
  file(join(CLAUDE, 'rules', nm), variantMd('Demo-Regel', 'Claude'))
}
{
  const nm = 'rule-same.md'
  const body = variantMd('Identische Regel', 'gemeinsam')
  file(join(SHARED, 'rules', nm), body)
  file(join(CLAUDE, 'rules', nm), body)
}
{
  file(join(SHARED, 'rules', 'rule-codex.md'), variantMd('Codex-Achsen-Regel', 'Shared'))
  file(join(CODEX, 'rules', 'rule-codex.rules'), variantMd('Codex-Achsen-Regel', 'Codex'))
}
{
  const nm = 'rule-mirror.md'
  file(join(SHARED, 'rules', nm), variantMd('Mirror-Regel', 'Original'))
  file(join(SHARED, 'rules', 'backup', nm), variantMd('Mirror-Regel', 'Spiegel'))
}

// ══════════════════════════════════════════════════════════════════════════════
//  KATEGORIE: AGENTS  (AGENT.md-ORDNER und Claude-Einzeldatei-Agent)
// ══════════════════════════════════════════════════════════════════════════════
{
  const nm = 'agent-folder-pair'
  const sharedDir = dir(join(SHARED, 'agents', nm))
  const codexDir = dir(join(CODEX, 'agents', nm))
  const manifest = agentMd(nm, 'Shared↔Codex AGENT.md-Ordner-Paar', 'Gemeinsame Agent-Definition.')
  file(join(sharedDir, 'AGENT.md'), manifest)
  file(join(codexDir, 'AGENT.md'), manifest)
  file(join(sharedDir, 'extra.md'), ['# Extra (Shared)', '', 'Zeile A — Shared-Variante', 'Zeile B gemeinsam', ''].join('\n'))
  file(join(codexDir, 'extra.md'), ['# Extra (Codex)', '', 'Zeile A — Codex-Variante', 'Zeile B gemeinsam', ''].join('\n'))
}
{
  const nm = 'agent-single.md'
  file(join(SHARED, 'agents', nm), agentMd('agent-single', 'Shared↔Claude Einzeldatei-Agent', variantMd('Inhalt', 'Shared')))
  file(join(CLAUDE, 'agents', nm), agentMd('agent-single', 'Shared↔Claude Einzeldatei-Agent', variantMd('Inhalt', 'Claude')))
}

// ══════════════════════════════════════════════════════════════════════════════
//  KATEGORIE: HOOKS  (.cjs-Dateien) — Codex: hooks.json + hooks/*
// ══════════════════════════════════════════════════════════════════════════════
{
  const nm = 'demo-hook.cjs'
  const head = ['#!/usr/bin/env node', "// Demo-Hook (secret-frei) — nur Struktur.", "const EVENT = 'SessionStart'"].join('\n')
  file(join(SHARED, 'hooks', nm), `${head}\nconsole.log('[demo-hook] shared-variante')\n`)
  file(join(CODEX, 'hooks', nm), `${head}\nconsole.log('[demo-hook] codex-variante')\n`)
}
{
  const hooksJson = {
    hooks: {
      SessionStart: [{ hooks: [{ type: 'command', command: 'node hooks/demo-hook.cjs' }] }]
    }
  }
  file(join(CODEX, 'hooks.json'), JSON.stringify(hooksJson, null, 2))
}

// ══════════════════════════════════════════════════════════════════════════════
//  KATEGORIE: INSTRUCTIONS  (CLAUDE.md / AGENTS.md)
// ══════════════════════════════════════════════════════════════════════════════
{
  const nm = 'AGENTS.md'
  file(join(SHARED, nm), variantMd('Cross-WS Startanker', 'Shared'))
  file(join(CODEX, nm), variantMd('Cross-WS Startanker', 'Codex'))
}
{
  file(join(CLAUDE, 'CLAUDE.md'), ['# Globale Instruktionen (Sandbox)', '', 'Demo-Startanker fuer die Claude-Familie.', ''].join('\n'))
}
}
