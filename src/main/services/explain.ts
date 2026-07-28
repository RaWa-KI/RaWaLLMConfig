// explain.ts — regelbasierte "Was macht das?"-Erklaerung (F5). Erzeugt fuer
// einen ConfigEntry-Bezug (kind/name) einen laienverstaendlichen Text — OHNE
// Datei-Inhalt zu lesen und OHNE Secret-Werte. Rein deterministisch aus Typ-
// Familie + Element-Klasse + Name-Heuristik. Besonders Hooks werden klar in
// Alltagssprache erklaert. Bei Unbekanntem: generischer Fallback (nie leer).
import type { ExplainRequest, ExplainResult } from '@shared/contract-write'

// Familien-Praefix (ZIELE §2.3) -> Klartext, was die Familie ueberhaupt ist.
const FAMILY: Record<string, string> = {
  claude: 'Claude Code (Anthropic-CLI)',
  codex: 'Codex (OpenAI-CLI)',
  llm: 'lokale Sprachmodelle (llama-server/GGUF)',
  local: 'lokale Sprachmodelle (llama-server/GGUF)',
  mcp: 'MCP-Integrationen (externe Werkzeug-Server)',
  shared: 'gemeinsame Trunk-Kanonik (Cross-WS, .shared)',
  sys: 'System-Umgebung (Rechner, Laufzeiten, Tools)'
}

// Element-Klasse -> laienverstaendliche Erklaerung, was so ein Element bewirkt.
// Hooks bewusst ausfuehrlich (F5): warum/wann/Wirkung in Alltagssprache.
const KIND: Record<string, string> = {
  hook:
    'Ein Hook ist ein automatischer Auslöser. Zu einem festen Zeitpunkt (z. B. vor ' +
    'einem Befehl oder beim Start) läuft eine kleine Prüfung oder Aktion ab — ohne ' +
    'dass du etwas tust. Hooks können warnen, blockieren oder etwas vorbereiten.',
  rule:
    'Eine Rule ist eine Verhaltensregel. Sie sagt der KI, woran sie sich in jeder ' +
    'Sitzung halten soll (z. B. „nie löschen, immer archivieren"). Sie läuft kein ' +
    'Programm, sondern lenkt das Verhalten.',
  skill:
    'Ein Skill ist eine abrufbare Fähigkeit für einen wiederkehrenden Arbeitsablauf. ' +
    'Er wird nur geladen, wenn er gebraucht wird, und liefert eine strukturierte Hilfe.',
  agent:
    'Ein Agent ist ein spezialisierter Helfer mit eigenem Wissen und eigenem Kontext. ' +
    'Er wird für tiefe Aufgaben eines Fachgebiets gerufen.',
  plugin:
    'Ein Plugin bündelt mehrere Funktionen (Befehle, Skills, Hooks) als ein Paket, ' +
    'das man als Ganzes an- oder abschalten kann.',
  setting:
    'Eine Einstellung legt einen Wert oder Schalter fest, nach dem sich das Werkzeug ' +
    'richtet (z. B. Berechtigungen, Modell, Pfade).',
  mcp:
    'Ein MCP-Server stellt der KI zusätzliche Werkzeuge bereit (z. B. Web, Datenbank). ' +
    'Die KI kann diese Werkzeuge bei Bedarf aufrufen.',
  model:
    'Ein Modell ist ein lokales Sprachmodell, das Anfragen direkt auf diesem Rechner ' +
    'beantwortet — ohne externen Dienst.',
  endpoint:
    'Ein Endpoint ist die Adresse eines Dienstes (Servers), der Anfragen entgegennimmt — ' +
    'z. B. eines lokalen Modell-Servers. Er ist keine Datei, sondern ein laufender ' +
    'Dienst; geändert wird er am jeweiligen Server, nicht in einer Config-Datei.',
  changelog:
    'Ein Changelog-Eintrag dokumentiert, was sich an einem Werkzeug geändert hat ' +
    '(Version, Datum, Neuerungen). Reine Information, keine Aktion.',
  team:
    'Ein Team bündelt mehrere Agenten zu einer Zusammenarbeit. Die Rollen teilen ' +
    'sich eine Aufgabe auf (z. B. Recherche, Umsetzung, Prüfung), damit größere ' +
    'Aufgaben strukturiert und parallel bearbeitet werden.',
  instruction:
    'Eine Instruktion ist eine dauerhafte Anweisung an die KI (z. B. in AGENTS.md ' +
    'oder CLAUDE.md). Sie gilt in jeder Sitzung als Grundlage und legt fest, wie ' +
    'sich die KI verhalten und arbeiten soll.',
  sys:
    'Ein System-Eintrag beschreibt einen Teil der Rechner-Umgebung (z. B. Laufzeit, ' +
    'installiertes Werkzeug, Pfad oder Hardware-Detail). Reine Bestandsaufnahme, ' +
    'keine Aktion.'
}

const GENERIC =
  'Dieses Element gehört zur LLM-Konfiguration. Es beschreibt einen Bestandteil ' +
  'deiner Werkzeug-Einrichtung. Öffne den Detail-Bereich für Pfad und Status.'

// Familie aus dem stabilen Bezug ableiten (Praefix vor "-" in kind oder name).
function familyOf(req: ExplainRequest): string | null {
  const src = `${req.kind} ${req.name}`.toLowerCase()
  for (const key of Object.keys(FAMILY)) {
    if (src.includes(`${key}-`) || src.startsWith(key)) return key
  }
  return null
}

// Klassen-Suchreihenfolge (laengere/spezifischere zuerst, damit z.B. "instruction"
// vor "model" greift). Genutzt fuer kind- UND Name-Pruefung.
const CLASS_ORDER = [
  'instruction', 'changelog', 'setting', 'plugin', 'hook', 'rule',
  'skill', 'agent', 'team', 'mcp', 'model', 'endpoint'
]

// Mappt einen Kategorie-/kind-Token (z.B. "hooks", "agents", "instructions",
// "sys", "settings") auf die Element-Klasse. Plural/Singular werden normalisiert.
function classFromKindToken(token: string): string | null {
  if (token === 'sys') return 'sys'   // 3-Buchstaben-Klasse, kein Plural-Strip
  if (/^settings?$/.test(token)) return 'setting'
  const t = token.replace(/s$/, '')   // Plural -> Singular (hooks -> hook)
  if (CLASS_ORDER.includes(t)) return t
  return null
}

// Element-Klasse bestimmen — KIND-getrieben (kein Datei-Read).
// 1) Der uebergebene kind/cat.id ist das Primaersignal: "<familie>-<kategorie>"
//    (z.B. "claude-hooks") oder ein direkter Token ("sys", "changelog").
// 2) Erst wenn der kind keine Klasse liefert, greift die Name-Heuristik.
function classOf(req: ExplainRequest): string | null {
  const kindRaw = (req.kind ?? '').toLowerCase()
  // Primaer: jeden "-"-getrennten Token des kind pruefen (letzter = Kategorie).
  const tokens = kindRaw.split(/[-/.\s]+/).filter(Boolean)
  for (let i = tokens.length - 1; i >= 0; i--) {
    const cls = classFromKindToken(tokens[i])
    if (cls) return cls
  }
  // Fallback: Name-Heuristik (nur wenn kind nichts ergab).
  const name = (req.name ?? '').toLowerCase()
  for (const k of CLASS_ORDER) {
    if (name.includes(k)) return k
  }
  if (/settings?(\.|$)/.test(name)) return 'setting'
  return null
}

// Nutzbare desc: vorhanden und kein Zirkelsatz (wiederholt nur den Namen).
function usableDesc(req: ExplainRequest): string | null {
  const d = (req.desc ?? '').trim()
  if (!d) return null
  return d.toLowerCase() === req.name.trim().toLowerCase() ? null : d
}

// Erklaerungs-Koerper: Klassen-Text hat Vorrang; desc ist die inhaltliche Basis
// und schlaegt GENERIC (nie Zirkel, nie leer).
function bodyOf(req: ExplainRequest, cls: string | null): string {
  const desc = usableDesc(req)
  if (cls) return desc ? `${KIND[cls]} Konkret zu diesem Eintrag: ${desc}` : KIND[cls]
  return desc ?? GENERIC
}

/**
 * Regelbasierte Erklaerung fuer ein Element. Deterministisch, laienverstaendlich,
 * ohne Code/Secret. Liefert immer Titel + Text (nie leer).
 */
export function explain(req: ExplainRequest): ExplainResult {
  try {
    if (!req || typeof req.kind !== 'string' || typeof req.name !== 'string') {
      return { data: null, error: 'invalid-request' }
    }
    const fam = familyOf(req)
    const cls = classOf(req)
    const famText = fam ? `Gehört zu: ${FAMILY[fam]}. ` : ''
    const title = req.name || (cls ? cls : 'Element')
    return { data: { title, text: `${famText}${bodyOf(req, cls)}` }, error: null }
  } catch (err) {
    console.error('[explain]', err instanceof Error ? err.message : 'explain-failed')
    return { data: null, error: 'explain-failed' }
  }
}
