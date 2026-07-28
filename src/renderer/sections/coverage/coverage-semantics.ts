// coverage-semantics.ts (WP-05)
// Laienverstaendliche Auswirkungs-Map je Config-Kategorie:
// "Braucht Codex eine Adaption? Welche Auswirkung bei Luecke?"
// Muster wie load-semantics.ts — KEIN Modellgedaechtnis (HR10):
// jede Regel ist doc-belegt (Quelle + Begruendung als Kommentar).
// Reine Klassifikation per Kategorie-Key — kein fs, keine Werte.
//
// ── DOC-QUELLEN ───────────────────────────────────────────────────────────────
// [Q-AGENTS] cross-tool-paritaet (harte-regeln HR16) + Codex-AGENTS.md-Format
//   (OpenAI Codex CLI docs, 2026-06-04): Agents sind tool-spezifisch deklariert.
//   Claude buendelt Agents in Plugins (installed_plugins.json, ~/.claude/agents/);
//   Codex erwartet *.toml-Dateien (~/.codex/agents/ oder WS-lokal). Ein Shared-
//   Agent-Eintrag ohne entsprechende .toml-Datei ist in Codex schlicht nicht
//   verfuegbar — der Agent kann nicht aufgerufen werden. Auswirkung: hoch.
//   Quelle: .shared/.claude/rules/cross-tool-paritaet.md (lokal, 2026-06-09);
//   openai/codex CLI README (agents-Abschnitt, Stand 2026-05-01 lokal verifiziert).
//
// [Q-HOOKS] plugin-format-spec (lokal) + Claude-Hooks-Doc (code.claude.com/docs,
//   2026-06-08): Hooks sind vollstaendig tool-spezifisch — Claude nutzt JSON-
//   Manifest mit event/matcher/command; Codex definiert Hooks als shell-Scripts
//   in ~/.codex/hooks/ mit eigenem Aktivierungsformat. Ohne Adaption laeuft ein
//   Claude-Hook in Codex gar nicht (falsche Dateistruktur, kein Event-Dispatch).
//   Auswirkung: hoch (Hook wird ignoriert).
//   Quelle: .shared/.claude/references/plugin-format-spec.md (lokal, 2026-06-01);
//   Claude Code Memory-Doc [Q-HOOK] (code.claude.com, 2026-06-08).
//
// [Q-RULES] harte-regeln HR16 (cross-tool-paritaet): Rules (.md-Dateien in
//   .claude/rules/ bzw. .codex/rules/) sind oft inhaltlich tool-agnostisch (Stil,
//   Prozess, Sprachvorgaben). Beide Tools laden .md-Rules aus ihrem jeweiligen
//   rules/-Ordner. Eine fehlende Adaption bedeutet: dieselbe Verhaltensregel
//   gilt in Codex nicht — meist kein sofortiger Fehler, aber Verhaltens-Drift.
//   Auswirkung: mittel (kein Fehler, aber inkonsistentes Verhalten zwischen Tools).
//   Quelle: .shared/.claude/rules/harte-regeln.md HR16 (lokal, 2026-06-09);
//   cross-tool-paritaet.md Pflichtschritte-Abschnitt (lokal, 2026-06-09).
//
// [Q-PLUGINS] Claude Code Skills/Plugins-Doc (code.claude.com, 2026-06-08):
//   Plugins sind Claude-spezifisch — sie existieren als Konzept in Codex nicht.
//   Codex hat keinen Plugin-Marketplace und kein installed_plugins.json-Format.
//   Eine "Luecke" bei Codex ist deshalb kein Bug, sondern erwartet (n-a).
//   Auswirkung: keine (Codex braucht keine Plugin-Adaption).
//   Quelle: Claude Code Skills-Doc [Q-SKILL]/Plugin-Format-Spec (lokal,
//   2026-06-01); .shared/.claude/rules/cross-tool-paritaet.md (lokal, 2026-06-09).
//
// [Q-SKILLS] Claude Code Skills-Doc (code.claude.com, 2026-06-08): Skills sind
//   als SKILL.md-Dateien gespeichert; Codex laedt .md-Skills aus ~/.codex/skills/
//   progressiv bei Nutzung (codex-changelog 2026-06-01, skills-budget). Ein
//   Shared-Skill braucht eine Codex-Adaption, wenn er Codex-spezifische Trigger,
//   Anweisungen oder Formatierung braucht — oft aber portabel. Auswirkung: niedrig
//   bis mittel (Adaption meist vorhanden; Status pruefen).
//   Quelle: Claude Code Skills-Doc [Q-SKILL] (code.claude.com, 2026-06-08);
//   codex-changelog skills-budget (lokal, 2026-06-01).
//
// [Q-KIMI] cross-tool-paritaet HR16 (harte-regeln, lokal): Kimi ist ein
//   gleichwertiger nativer Loader und liest nur seine eigenen Ablagen
//   (~/.kimi-code, ~/.agents). Die Codex-Regeln oben sind Codex-Format-
//   spezifisch (.toml-Deklarationen, ~/.codex-Pfade) und gelten NICHT fuer
//   Kimi — darum bekommt die Kimi-Familie eigene, kategorie-unabhaengige
//   Texte (WP-8, B9).
//   Quelle: .shared/.claude/rules/cross-tool-paritaet.md (lokal, 2026-06-09).

import type { CoverageState } from '@shared/contract-coverage'

// Rueckgabetyp: laienverstaendlicher Anzeigetext + doc-belegte Quelle.
export interface CoverageImpact {
  text: string
  quelle: string
}

// Eine Bewertungsregel: auf welchen Kategorien greift sie, und was liefert sie
// fuer welchen Zell-Status (state)?
interface ImpactRule {
  cats: string[]
  // Gibt null zurueck, wenn diese Regel fuer den State nicht zustaendig ist
  // (naechste Regel versucht es). Gibt ein Objekt zurueck, wenn sie zustaendig ist.
  resolve: (state: CoverageState) => CoverageImpact | null
}

// Hilfsfunktion: Kurz-Impact ohne state-Differenzierung — liefert immer.
function fixed(text: string, quelle: string): (state: CoverageState) => CoverageImpact {
  return () => ({ text, quelle })
}

// Hilfsfunktion: Impact nur fuer bestimmte States, sonst null (naechste Regel).
function forStates(
  map: Partial<Record<CoverageState, CoverageImpact>>
): (state: CoverageState) => CoverageImpact | null {
  return (state) => map[state] ?? null
}

// ── Regelwerk (speziell vor generisch) ──────────────────────────────────────

const RULES: ImpactRule[] = [
  // ── agents ────────────────────────────────────────────────────────────────
  // Codex braucht eine *.toml-Deklaration — ohne sie ist der Agent nicht
  // aufrufbar. Auswirkung bei Luecke: hoch (Agent fehlt in Codex vollstaendig).
  {
    cats: ['agents'],
    resolve: forStates({
      fehlt: {
        text: 'Dieser Agent ist in Codex nicht verfügbar — Codex braucht eine eigene .toml-Deklaration.',
        quelle: 'cross-tool-paritaet HR16 + Codex-Agents-Format [Q-AGENTS]'
      },
      'via-plugin': {
        text: 'Claude bezieht diesen Agent über ein Plugin. In Codex braucht er eine eigene .toml-Deklaration — sonst nicht verfügbar.',
        quelle: 'cross-tool-paritaet HR16 + Codex-Agents-Format [Q-AGENTS]'
      },
      'n-a': {
        text: 'Codex-Adaption nicht eindeutig ermittelbar — manuell prüfen, ob eine .toml-Datei existiert.',
        quelle: 'cross-tool-paritaet HR16 [Q-AGENTS]'
      },
      identisch: {
        text: 'Agent ist in beiden Tools vorhanden und inhaltlich übereinstimmend.',
        quelle: 'cross-tool-paritaet HR16 [Q-AGENTS]'
      },
      abweichend: {
        text: 'Agent-Deklaration weicht ab — Codex-Version auf Aktualität prüfen (.toml vs. Shared).',
        quelle: 'cross-tool-paritaet HR16 [Q-AGENTS]'
      },
      vorhanden: {
        text: 'Agent ist in Codex vorhanden (Details nicht geprüft).',
        quelle: 'cross-tool-paritaet HR16 [Q-AGENTS]'
      }
    })
  },

  // ── hooks ─────────────────────────────────────────────────────────────────
  // Hooks sind vollstaendig tool-spezifisch. Ohne eigene Codex-Hook-Datei
  // im richtigen Format laeuft der Hook in Codex nicht.
  {
    cats: ['hooks'],
    resolve: forStates({
      fehlt: {
        text: 'Dieser Hook läuft in Codex nicht — Codex verwendet ein eigenes Hook-Format und einen separaten Aktivierungsweg.',
        quelle: 'plugin-format-spec + Claude-Hooks-Doc [Q-HOOKS]'
      },
      'n-a': {
        text: 'Hook-Adaption für Codex nicht ermittelbar — manuell prüfen.',
        quelle: 'plugin-format-spec [Q-HOOKS]'
      },
      identisch: {
        text: 'Hook ist in beiden Tools vorhanden und übereinstimmend.',
        quelle: 'plugin-format-spec [Q-HOOKS]'
      },
      abweichend: {
        text: 'Hook-Definition weicht ab — Codex-Version auf Aktualität prüfen.',
        quelle: 'plugin-format-spec [Q-HOOKS]'
      },
      vorhanden: {
        text: 'Hook ist in Codex vorhanden (Details nicht geprüft).',
        quelle: 'plugin-format-spec [Q-HOOKS]'
      }
    })
  },

  // ── rules ─────────────────────────────────────────────────────────────────
  // Rules sind oft tool-agnostisch (Stil, Prozess, Sprachvorgaben). Fehlt eine
  // Adaption, entsteht Verhaltens-Drift — meist kein harter Fehler.
  {
    cats: ['rules'],
    resolve: forStates({
      fehlt: {
        text: 'Diese Regel gilt in Codex nicht — inhaltlich oft portierbar, aber nicht automatisch übertragen.',
        quelle: 'harte-regeln HR16 + cross-tool-paritaet [Q-RULES]'
      },
      'n-a': {
        text: 'Rule-Adaption für Codex nicht ermittelbar — manuell prüfen.',
        quelle: 'harte-regeln HR16 [Q-RULES]'
      },
      identisch: {
        text: 'Regel ist in beiden Tools vorhanden und übereinstimmend — kein Handlungsbedarf.',
        quelle: 'harte-regeln HR16 [Q-RULES]'
      },
      abweichend: {
        text: 'Regeltext weicht ab — Codex-Version auf Aktualität prüfen.',
        quelle: 'harte-regeln HR16 [Q-RULES]'
      },
      vorhanden: {
        text: 'Regel ist in Codex vorhanden (Details nicht geprüft).',
        quelle: 'harte-regeln HR16 [Q-RULES]'
      }
    })
  },

  // ── plugins ───────────────────────────────────────────────────────────────
  // Plugins sind Claude-spezifisch — Codex hat dieses Konzept nicht.
  // Eine "Luecke" bei Codex ist erwartet und kein Bug.
  {
    cats: ['plugins'],
    resolve: fixed(
      'Plugins sind Claude-spezifisch — Codex hat kein Plugin-Konzept. Keine Adaption nötig (n-a).',
      'Claude-Plugin-Format-Spec + cross-tool-paritaet HR16 [Q-PLUGINS]'
    )
  },

  // ── skills ────────────────────────────────────────────────────────────────
  // Skills (.md) sind in beiden Tools verfuegbar. Adaption meist vorhanden,
  // aber Codex-spezifische Trigger oder Formate koennen abweichen.
  {
    cats: ['skills'],
    resolve: forStates({
      fehlt: {
        text: 'Skill fehlt in Codex — Codex laedt Skills aus ~/.codex/skills/. Adaption prüfen oder anlegen.',
        quelle: 'Skills-Doc + codex-changelog skills-budget [Q-SKILLS]'
      },
      'n-a': {
        text: 'Skill-Adaption für Codex nicht ermittelbar — manuell prüfen.',
        quelle: 'Skills-Doc [Q-SKILLS]'
      },
      identisch: {
        text: 'Skill ist in beiden Tools vorhanden und übereinstimmend.',
        quelle: 'Skills-Doc [Q-SKILLS]'
      },
      abweichend: {
        text: 'Skill-Inhalt weicht ab — Codex-Version auf Aktualität oder tool-spezifische Trigger prüfen.',
        quelle: 'Skills-Doc + codex-changelog [Q-SKILLS]'
      },
      'via-plugin': {
        text: 'Claude bezieht diesen Skill über ein Plugin. In Codex muss er separat als .md-Datei vorliegen.',
        quelle: 'Skills-Doc [Q-SKILLS]'
      },
      vorhanden: {
        text: 'Skill ist in Codex vorhanden (Details nicht geprüft).',
        quelle: 'Skills-Doc [Q-SKILLS]'
      }
    })
  }
]

// Fallback: keine belastbare Quelle fuer diese Kategorie/diesen State.
// Ehrlich "Quelle ausstehend" — NICHT erfinden (HR10).
const FALLBACK: CoverageImpact = {
  text: 'Auswirkung für diese Kategorie noch nicht dokumentiert — manuell prüfen.',
  quelle: 'Quelle ausstehend'
}

// Familien, fuer die coverageImpact Texte liefern kann (Default 'codex' =
// Bestand). Kimi bekommt eigene Texte, weil die Codex-Regeln Format-/Pfad-
// spezifisch sind [Q-KIMI].
export type CoverageImpactFamily = 'codex' | 'kimi'

// Laienverstaendliche Kimi-Texte je Zell-Status (kategorie-unabhaengig):
// Kimi liest nur seine eigenen Ablagen (~/.kimi-code, ~/.agents) [Q-KIMI].
const KIMI_QUELLE = 'cross-tool-paritaet HR16 [Q-KIMI]'
const KIMI_IMPACT: Record<CoverageState, CoverageImpact> = {
  identisch: {
    text: 'Diese Config ist bei Kimi vorhanden und stimmt mit dem Referenz-Stand überein.',
    quelle: KIMI_QUELLE
  },
  abweichend: {
    text: 'Die Kimi-Kopie weicht vom Referenz-Stand ab — auf Aktualität prüfen.',
    quelle: KIMI_QUELLE
  },
  fehlt: {
    text: 'Diese Config fehlt bei Kimi — Kimi liest nur seine eigenen Ablagen (~/.kimi-code, ~/.agents). Bei Bedarf dorthin übertragen.',
    quelle: KIMI_QUELLE
  },
  'via-plugin': {
    text: 'Das Plugin-Indiz gilt nur für Claude — für Kimi ist es nicht anwendbar.',
    quelle: KIMI_QUELLE
  },
  'n-a': {
    text: 'Für Kimi nicht anwendbar.',
    quelle: KIMI_QUELLE
  },
  vorhanden: {
    text: 'Diese Config ist bei Kimi vorhanden (Details nicht geprüft).',
    quelle: KIMI_QUELLE
  }
}

/**
 * Liefert einen laienverstaendlichen Auswirkungs-Text fuer eine Config-Kategorie
 * und den Zell-Status einer Tool-Spalte (z.B. Codex-Spalte = 'fehlt').
 * Jede Antwort ist doc-belegt (HR10) oder ehrlich als "Quelle ausstehend" markiert.
 * family: 'codex' (Default, Bestand) oder 'kimi' (WP-8, B9 — eigene Texte).
 */
export function coverageImpact(
  cat: string,
  state: CoverageState,
  family: CoverageImpactFamily = 'codex'
): CoverageImpact {
  if (family === 'kimi') return KIMI_IMPACT[state] ?? FALLBACK
  const lower = (cat || '').toLowerCase().trim()
  for (const rule of RULES) {
    if (rule.cats.includes(lower)) {
      const result = rule.resolve(state)
      if (result !== null) return result
    }
  }
  return FALLBACK
}
