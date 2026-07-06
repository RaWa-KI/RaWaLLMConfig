// load-semantics.ts (WP-6a / Q7)
// Lade-Klassifikation je Datei: WANN/WIE wird die Datei vom Tool in den Kontext
// geladen — und wie steuert der Owner das (Tokenspar-Hebel). KEIN Modellgedaechtnis
// (HR10): jede Regel ist doc-belegt (Quelle + Stand als Kommentar/Konstante unten).
// Reine Klassifikation per Pfad-/Dateinamen-Muster — generisch ueber ALLE Dateien,
// nicht nur Instructions (Pilot rendert Instructions). Kein fs/IPC, keine Werte.
//
// ── DOC-QUELLEN (Local-First, dann offiziell) ──────────────────────────────────
// [Q-MEM]  Claude Code Memory-Doc — "CLAUDE.md and CLAUDE.local.md files in the
//          directory hierarchy above the working directory are loaded in full at
//          launch. Files in subdirectories load on demand."; "loaded into the
//          context window at the start of every session". Belegt zugleich die
//          USERGLOBAL-vs-WORKSPACE-Unterscheidung: ueberall in der Hierarchie
//          OBERHALB des Working Directory (inkl. ~/.claude userglobal) wird beim
//          Start geladen; ein Projekt-CLAUDE.md liegt IM Working Directory und
//          greift nur, wenn man in genau diesem Projekt arbeitet. Auto-memory
//          MEMORY.md: "loaded into every session (first 200 lines or 25KB)".
//          https://code.claude.com/docs/en/memory — Stand 2026-06-08 (Web).
// [Q-RULE] Claude Code Memory-Doc, Abschnitt .claude/rules/ — "Rules load into
//          context every session or when matching files are opened."; "Rules
//          without a paths field are loaded unconditionally"; "Path-scoped rules
//          trigger when Claude reads files matching the pattern".
//          https://code.claude.com/docs/en/memory — Stand 2026-06-08 (Web).
//          Lokal bestaetigt: claude-changelog v2.1.69 (2026-03-05) —
//          "InstructionsLoaded hook event that fires when CLAUDE.md or
//          .claude/rules/*.md files are loaded into context".
// [Q-SKILL] Claude Code Skills-Doc — "a skill's body loads only when it's used";
//          "load on demand"; "Claude loads the skill automatically when relevant,
//          or you can invoke it directly with /skill-name".
//          https://code.claude.com/docs/en/skills — Stand 2026-06-08 (Web).
//          Lokal bestaetigt: codex-changelog 2026-06-01 (skills-budget) — Codex
//          nutzt progressive Disclosure; volles SKILL.md erst bei Skill-Nutzung.
// [Q-HOOK] plugin-format-spec (lokal) + Claude-Hooks-Doc — Hooks sind
//          event-getriggert (SessionStart/PreToolUse/PostToolUse/Stop/...), kein
//          Kontext-Dauerload. paths-Glob: "nur bei passenden Dateien aktiv".
//          .shared/.claude/references/plugin-format-spec.md — Stand 2026-06-01 (lokal).
// [Q-SET]  Claude Code Memory/Settings-Doc — Settings sind technische, vom Client
//          durchgesetzte Config ("enforced by the client regardless of what Claude
//          decides"); je Session gelesen, nicht als Kontext-Text. AGENTS.md: Claude
//          Code "reads CLAUDE.md, not AGENTS.md" — AGENTS.md ist die Codex-Memory
//          (OpenAI/Codex laedt AGENTS.md je Session, analog CLAUDE.md).
//          https://code.claude.com/docs/en/memory — Stand 2026-06-08 (Web).
//          Codex/AGENTS.md lokal: vscode-ai-agenten...best-practices (2026-05-07).

// Lade-Zeitpunkt-Klassen (interne Keys, kein Anzeigetext):
//  'immer'            — bei JEDEM Start vom Tool geladen (userglobal-Ebene / Auto-Memory).
//  'beim Arbeiten hier' — nur geladen, wenn man IN genau diesem Projekt/Workspace
//                       arbeitet (CLAUDE.md/AGENTS.md im Working Directory). KEIN
//                       Dauerload ueber alle Sitzungen — deshalb eigene, ruhigere Klasse.
//  'bei Bedarf'       — erst bei Nutzung/Trigger geladen (Skills/Hooks).
//  'bedingt'          — haengt von Frontmatter/Trigger ab (Rules mit/ohne paths).
export type LoadWhen = 'immer' | 'beim Arbeiten hier' | 'bei Bedarf' | 'bedingt'

// Laienverstaendliche ANZEIGE-Beschriftung je Lade-Zeitpunkt (kurzer Chip-Text).
// Die internen Werte bleiben Keys — nur diese Funktion bestimmt den sichtbaren
// Text. Zentral, damit Chip (LoadHintBadge), Zeile (LoadInfoLine) und Tooltip
// exakt denselben Wortlaut zeigen. Der ausfuehrliche Satz steht in hint.control.
export function loadWhenLabel(when: LoadWhen): string {
  switch (when) {
    case 'immer':
      return 'lädt bei jedem Start'
    case 'beim Arbeiten hier':
      return 'lädt nur in diesem Projekt'
    case 'bei Bedarf':
      return 'lädt nur bei Bedarf'
    case 'bedingt':
      return 'lädt nur in bestimmten Fällen'
  }
}

// Ein Lade-Hinweis: when = Lade-Zeitpunkt, control = Owner-Steuerung (Tokenspar),
// source = doc-belegte Quelle (Kurz-Tag, Volltext im Kommentar oben).
export interface LoadHint {
  when: LoadWhen
  control: string
  source: string
}

// Eine Klassifikations-Regel: Pfad-/Namen-Muster -> LoadHint. Erste Treffer-Regel
// gewinnt (Reihenfolge = Spezifitaet, speziell vor generisch).
interface LoadRule {
  test: (lower: string) => boolean
  hint: LoadHint
}

type EntryFields = Record<string, string> | undefined

// Basename (klein) aus Pfad (akzeptiert / und \).
function baseName(path: string): string {
  const norm = path.replace(/\\/g, '/')
  const last = norm.slice(norm.lastIndexOf('/') + 1)
  return last.toLowerCase()
}

// Pfad enthaelt Segment (zwischen Slashes), tolerant fuer / und \.
function hasSeg(lower: string, seg: string): boolean {
  return ('/' + lower + '/').includes('/' + seg + '/')
}

// Userglobal-Erkennung (read-only Heuristik, KEIN fs). Beantwortet: liegt diese
// Datei auf der TOOL-WEITEN Userglobal-Ebene (~/.claude bzw. ~/.codex) — dann
// laedt sie bei JEDEM Start — oder ist sie projekt-/workspace-gebunden — dann
// laedt sie nur beim Arbeiten in genau diesem Projekt? (HR10: bewusst unscharf.)
//
// Token-Liste bewusst aus tree-logic.ts originIsForeign (scope 'global')
// uebernommen, NICHT neu erfunden: '~/.claude', '.codex', 'global', 'userglobal';
// '~/.codex' ergaenzt, weil Codex-Userglobal denselben Heimwurzel-Stil nutzt.
const USERGLOBAL_TOKENS = ['~/.claude', '~/.codex', '.codex', 'global', 'userglobal']

// Pfad-Heuristik fuer den Fall, dass origin LEER ist (z.B. Codex liefert fuer
// ~/.codex/AGENTS.md keinen sprechenden Ursprung): userglobal, wenn der Pfad das
// User-Home-.claude/.codex-Root traegt UND KEIN Workspace-/Projekt-Segment dazwischen
// liegt (analog originIsForeign — rein aus dem sprechenden Pfad, keine FS-Aufloesung).
function pathLooksUserglobal(lowerPath: string): boolean {
  const homeRoot = /(^|\/)(users\/[^/]+|home\/[^/]+)\/(\.claude|\.codex)\//
  if (!homeRoot.test(lowerPath)) return false
  // Liegt unterhalb des Home-.claude/.codex ein Projekt-/Workspace-Ordner, ist es
  // KEIN reines Userglobal mehr (z.B. ein per-WS gespiegeltes File).
  return !hasSeg(lowerPath, 'workspaces') && !hasSeg(lowerPath, 'projekte')
}

// true = Datei liegt auf der tool-weiten Userglobal-Ebene (laedt bei jedem Start).
// false = projekt-/workspace-gebunden (laedt nur beim Arbeiten in diesem Projekt).
export function isUserglobalOrigin(origin?: string, path?: string): boolean {
  const o = (origin || '').toLowerCase().trim()
  if (o && USERGLOBAL_TOKENS.some((tok) => o.includes(tok))) return true
  const p = (path || '').replace(/\\/g, '/').toLowerCase()
  return pathLooksUserglobal(p)
}

// Regel-Tabelle (speziell -> generisch). Jede hint.source verweist auf einen
// Doc-Tag aus dem Kopf-Kommentar (Q-MEM/Q-RULE/Q-SKILL/Q-HOOK/Q-SET).
const RULES: LoadRule[] = [
  {
    // Skills: SKILL.md (Datei) oder /skills/-Ordner -> on-demand (progressive Disclosure).
    test: (l) => baseName(l) === 'skill.md' || hasSeg(l, 'skills'),
    hint: {
      when: 'bei Bedarf',
      control: 'Lädt nur, wenn es gebraucht wird — der Inhalt kostet erst bei Nutzung Tokens (gesteuert über Trigger/Beschreibung im Frontmatter).',
      source: 'Skills-Doc [Q-SKILL]'
    }
  },
  {
    // Hooks: /hooks/-Ordner oder hooks.json -> event-getriggert, kein Kontext-Dauerload.
    test: (l) => hasSeg(l, 'hooks') || baseName(l) === 'hooks.json',
    hint: {
      when: 'bei Bedarf',
      control: 'Lädt nur, wenn es gebraucht wird — läuft erst bei einem passenden Ereignis/Datei-Treffer (kein Token-Dauerload; Umfang über Matcher/paths).',
      source: 'plugin-format-spec [Q-HOOK]'
    }
  },
  {
    // settings.json / settings.local.json -> technische Config, je Session aktiv gelesen.
    test: (l) => baseName(l) === 'settings.json' || baseName(l) === 'settings.local.json',
    hint: {
      when: 'immer',
      control: 'Wird bei jedem Start gelesen — Einstellung, kein Text fürs Modell (nur nötige Keys pflegen).',
      source: 'Settings-Doc [Q-SET]'
    }
  },
  {
    // Rules: .claude/rules/*.md -> ohne paths-Frontmatter always-on, mit paths bedingt.
    // Ohne entry.fields konservativ bedingt; mit fields entscheidet ruleHint().
    test: (l) => hasSeg(l, 'rules') && baseName(l).endsWith('.md'),
    hint: {
      when: 'bedingt',
      control: 'Ohne „paths" im Kopf lädt die Regel in jeder Sitzung; mit „paths" nur, wenn du eine passende Datei öffnest — „paths" setzen spart Tokens.',
      source: 'Rules-Doc [Q-RULE]'
    }
  },
  {
    // MEMORY.md (Auto-Memory-Index) -> je Session (erste 200 Z / 25 KB).
    test: (l) => baseName(l) === 'memory.md',
    hint: {
      when: 'immer',
      control: 'Lädt bei jedem Start — nur der Anfang (~200 Zeilen / 25 KB); Detail in Themen-Dateien auslagern.',
      source: 'Memory-Doc [Q-MEM]'
    }
  },
  // CLAUDE.md/CLAUDE.local.md und AGENTS.md sind NICHT in dieser Tabelle: ihr
  // Lade-Verhalten haengt vom Ursprung ab (userglobal = jeder Start vs. Workspace
  // = nur beim Arbeiten hier). classifyLoad behandelt sie origin-abhaengig (unten).
]

function hasField(fields: EntryFields, key: string): boolean {
  const needle = key.toLowerCase()
  if (!fields) return false
  if (Object.keys(fields).some((k) => k.toLowerCase() === needle)) return true
  return (fields.frontmatter ?? '').toLowerCase().split(/\s*,\s*/).includes(needle)
}

function ruleHint(fields: EntryFields): LoadHint {
  if (!fields) {
    return {
      when: 'bedingt',
      control: 'Ohne Frontmatter-Metadaten nicht sicher klassifizierbar — Rule-Kopf pruefen.',
      source: 'Rules-Doc [Q-RULE]'
    }
  }
  if (hasField(fields, 'paths')) {
    return {
      when: 'bedingt',
      control: 'Laedt nur bei passenden Dateien, weil paths im Rule-Kopf gesetzt ist.',
      source: 'Rules-Doc [Q-RULE]'
    }
  }
  if (hasField(fields, 'globs')) {
    return {
      when: 'immer',
      control: 'Frontmatter globs wird nicht als path-scope gewertet; bis paths gesetzt ist, laedt die Rule bei jedem Start.',
      source: 'Rules-Doc [Q-RULE]'
    }
  }
  return {
    when: 'immer',
    control: 'Kein paths im Rule-Kopf — diese Rule laedt bei jedem Start und kostet immer Kontext.',
    source: 'Rules-Doc [Q-RULE]'
  }
}

// CLAUDE.md/CLAUDE.local.md: userglobal (~/.claude) laedt bei JEDEM Start, ein
// Projekt-CLAUDE.md nur, wenn man IN diesem Workspace arbeitet (Working Directory).
// Belegt durch [Q-MEM] (Hierarchie OBERHALB des Working Directory laedt beim Start;
// Files IM/unterhalb des Working Directory greifen projektgebunden).
function claudeMdHint(userglobal: boolean): LoadHint {
  return userglobal
    ? {
        when: 'immer',
        control: 'Lädt komplett bei jedem Claude-Start (userglobal ~/.claude) — kurz halten, Pointer statt Volltext.',
        source: 'Memory-Doc [Q-MEM]'
      }
    : {
        when: 'beim Arbeiten hier',
        control: 'Lädt komplett, sobald du in diesem Workspace arbeitest (Working Directory) — nicht in anderen Projekten.',
        source: 'Memory-Doc [Q-MEM]'
      }
}

// AGENTS.md ist die Codex-Memory (Claude liest sie nicht direkt). Userglobal
// (~/.codex) laedt bei jedem Codex-Start; ein Workspace-AGENTS.md nur, wenn Codex
// in diesem Projekt arbeitet. Belegt durch [Q-SET]/[Q-MEM] (analog CLAUDE.md).
function agentsMdHint(userglobal: boolean): LoadHint {
  return userglobal
    ? {
        when: 'immer',
        control: 'Lädt komplett bei jedem Codex-Start (userglobal ~/.codex; Claude liest sie nicht direkt) — kurz halten, Pointer statt Volltext.',
        source: 'Memory-Doc [Q-SET]'
      }
    : {
        when: 'beim Arbeiten hier',
        control: 'Lädt komplett, sobald Codex in diesem Workspace arbeitet (Claude liest sie nicht direkt) — nicht in anderen Projekten.',
        source: 'Memory-Doc [Q-SET]'
      }
}

// Fallback wenn keine Regel greift: konservativ "bedingt" mit Quelle-ausstehend
// (HR10: lieber ehrlich unscharf als falsch sicher).
const FALLBACK: LoadHint = {
  when: 'bedingt',
  control: 'Lade-Verhalten dateispezifisch — vom Tool nur bei Zugriff/Trigger gelesen.',
  source: 'Doc-Quelle ausstehend'
}

// Klassifiziert eine Datei nach Lade-Zeitpunkt + Owner-Steuerung. origin steuert
// die CLAUDE.md/AGENTS.md-Unterscheidung userglobal (jeder Start) vs. Workspace
// (nur beim Arbeiten hier); alle anderen Klassen sind rein pfadbasiert.
export function classifyLoad(path: string, origin?: string, fields?: EntryFields): LoadHint {
  const lower = (path || '').replace(/\\/g, '/').toLowerCase()
  const base = baseName(lower)
  if (base === 'claude.md' || base === 'claude.local.md') {
    return claudeMdHint(isUserglobalOrigin(origin, path))
  }
  if (base === 'agents.md') {
    return agentsMdHint(isUserglobalOrigin(origin, path))
  }
  if (hasSeg(lower, 'rules') && base.endsWith('.md')) return ruleHint(fields)
  const rule = RULES.find((r) => r.test(lower))
  return rule ? rule.hint : FALLBACK
}
