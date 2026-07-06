// src/renderer/sections/referenz/port-profile.ts
// Port-Profil Claude → Codex (deklaratives Feld-Mapping), kuratiert/editierbar.
// Bewusst DATEN, nicht Code: aendert sich ein Format, fasst du nur dieses Profil an.
// Vier Eimer pro Zeile: direct (1:1), transform (umbenannt/umgeformt), drop (kein Aequivalent),
// adds[] (Ziel-Feld ohne Quelle). Nie echte Secret-Werte. Versionsstempel in validFor.

import type { PortProfile } from '@shared/contract-referenz'

export const portProfile: PortProfile = {
  version: '1',
  validFor: { claude: '2.1.x', codex: '0.4x' },
  maps: {
    skill: {
      targetLabel: 'Codex-Skill (SKILL.md)',
      rows: [
        { from: 'name', to: 'name', kind: 'direct' },
        { from: 'description', to: 'description', kind: 'direct' },
        { from: 'allowed-tools', to: 'allowed-tools', kind: 'direct', note: 'Beide erzwingen die Liste.' },
        { from: 'argument-hint', to: 'argument-hint', kind: 'direct' },
        { from: 'model', to: 'config.toml › model', kind: 'transform', note: 'Codex setzt das Modell global, nicht pro Skill.' },
        { from: 'effort', to: 'model_reasoning_effort', kind: 'transform', note: 'Global statt pro Skill.' },
        { from: 'disable-model-invocation', to: null, kind: 'drop', note: 'Kein direktes Pendant — Aufruf-Steuerung laeuft anders.' },
        { from: 'user-invocable', to: null, kind: 'drop' },
        { from: 'context: fork', to: null, kind: 'drop', note: 'Codex-Skills haben kein fork-in-Subagent-Feld.' },
        { from: 'agent', to: null, kind: 'drop' }
      ],
      adds: [{ to: '[[skills.config]] path / enabled', note: 'Codex-spezifisch: Skill pro Pfad an/aus.' }]
    },
    hook: {
      targetLabel: 'Codex [hooks]',
      rows: [
        { from: 'matcher', to: 'matcher', kind: 'transform', note: 'Nur fuer command-Hooks wirksam.' },
        { from: 'command', to: 'command (Array)', kind: 'transform' },
        { from: 'PreToolUse / PostToolUse', to: 'command-Hook', kind: 'transform', note: 'Auf den einzigen laufenden Typ reduziert.' },
        { from: 'UserPromptSubmit / Stop / SessionStart …', to: null, kind: 'drop', note: 'Codex ueberspringt prompt-/agent-Hooks — kein Aequivalent.' },
        { from: 'type: http', to: null, kind: 'drop', note: 'Keine HTTP-Hooks.' },
        { from: 'timeout / async / once', to: null, kind: 'drop', note: 'Nicht abgebildet.' }
      ],
      adds: [{ to: 'notify', note: "Codex' einfacher Ereignis-Hook (kein Claude-Pendant)." }]
    },
    plugins: {
      // Claude-Kategorie „Plugins / MCP" → Codex MCP — Schluessel via Artefakt-id „mcp"
      targetLabel: 'Codex [mcp_servers]',
      rows: []
    },
    mcp: {
      targetLabel: 'Codex [mcp_servers.<id>]',
      rows: [
        { from: 'command', to: 'command', kind: 'direct' },
        { from: 'args', to: 'args', kind: 'direct' },
        { from: 'env', to: 'env / bearer_token_env_var', kind: 'transform', note: 'Secrets laufen ueber *_env_var.' },
        { from: 'url', to: 'url', kind: 'direct' },
        { from: 'headers', to: null, kind: 'drop', note: 'Nicht 1:1 — ueber env/token loesen.' },
        { from: 'type (stdio/sse)', to: null, kind: 'drop' }
      ],
      adds: [
        { to: 'timeout_secs', note: 'Codex-Zeitlimit.' },
        { to: 'enabled', note: 'An/aus ohne Entfernen.' }
      ]
    },
    agent: {
      targetLabel: 'Codex [agents.<rolle>]',
      rows: [
        { from: 'name', to: '[agents.<rolle>]', kind: 'transform', note: 'Rollen-Schluessel statt .md-Frontmatter.' },
        { from: 'description', to: 'description', kind: 'direct' },
        { from: 'tools / disallowedTools', to: 'config_file', kind: 'transform', note: 'Tools liegen in der Rollen-Konfig.' },
        { from: 'model', to: 'config_file', kind: 'transform' },
        { from: 'skills / isolation / memory / permissionMode', to: null, kind: 'drop', note: 'Keine direkten Felder.' }
      ],
      adds: [{ to: 'nickname_candidates', note: 'Anzeige-/Rufnamen der Rolle.' }]
    },
    memory: {
      targetLabel: 'Codex AGENTS.md',
      rows: [
        { from: '# Markdown-Inhalt', to: '# Markdown-Inhalt', kind: 'direct', note: 'Beide sind reines Markdown.' },
        { from: '@pfad-Import', to: '@pfad-Import', kind: 'transform', note: 'Import-Mechanik unterscheidet sich leicht.' },
        { from: 'CLAUDE.local.md', to: null, kind: 'drop', note: 'Kein direktes gitignore-Override.' },
        { from: 'claudeMdExcludes', to: 'project_doc_fallback_filenames', kind: 'transform', note: 'Verwandt, nicht identisch.' }
      ],
      adds: [
        { to: 'AGENTS.override.md', note: 'Codex-Override-Mechanik.' },
        { to: 'project_doc_max_bytes', note: 'Groessen-Limit (32 KiB).' }
      ]
    },
    settings: {
      targetLabel: 'Codex config.toml',
      rows: [
        { from: 'model', to: 'model', kind: 'direct' },
        { from: '$schema', to: '#:schema', kind: 'transform', note: 'TOML-Kommentar statt JSON-Key.' },
        { from: 'permissions.*', to: 'approval_policy + sandbox_mode', kind: 'transform', note: 'Anderes Sicherheitsmodell (zwei Achsen).' },
        { from: 'hooks', to: '[hooks] (eingeschraenkt)', kind: 'transform' },
        { from: 'env', to: 'env', kind: 'direct' },
        { from: 'language / outputStyle / spinner* …', to: null, kind: 'drop', note: 'Viele UI-Keys ohne Codex-Pendant.' }
      ],
      adds: [
        { to: 'approval_policy', note: 'Wann gefragt wird.' },
        { to: 'sandbox_mode', note: 'Was die Sandbox zulaesst.' }
      ]
    },
    permissions: {
      targetLabel: 'Codex Approvals & Sandbox',
      rows: [
        { from: 'allow / ask / deny', to: 'approval_policy', kind: 'transform', note: 'Codex kennt keine Tool(Spezifizierer)-Regeln — nur Stufen.' },
        { from: 'Read/Edit(<glob>) deny', to: 'sandbox_mode + writable_roots', kind: 'transform', note: 'Datei-Schutz ueber die Sandbox statt Globs.' },
        { from: 'WebFetch(domain:…)', to: 'web_search-Modus', kind: 'transform', note: 'Grobkoerniger.' },
        { from: 'defaultMode', to: 'approval_policy', kind: 'transform' }
      ],
      adds: [{ to: 'sandbox_workspace_write.network_access', note: 'Netz in der Sandbox an/aus.' }]
    }
  }
}
