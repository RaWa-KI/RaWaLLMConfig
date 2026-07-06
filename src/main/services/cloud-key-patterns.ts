// cloud-key-patterns.ts — D4-Leaf-Modul: reale Cloud-API-Key-FORMATE als ein
// anker-gebundenes Regex-Set. Ausgelagert aus secret-mask.ts (HR27 <300 Z),
// electron-frei und ohne Seiteneffekt, damit es auch ohne Main-Kontext testbar
// bleibt. WICHTIG: KEINE echten Key-Werte hier — nur Format-Praefixe/Laengen.
//
// Quelle (WebSearch, Stand 2026, HR10):
//   OpenAI    sk-proj-… / sk-svcacct-… / sk-admin-… (+ legacy sk-…)
//   Anthropic sk-ant-api03-… (~108 Z) / sk-ant-oat01-…
//   Google    AIza + 35 Z [A-Za-z0-9_-] = 39 Z gesamt.
//
// Anker `^…$`: getestet wird der GANZE (getrimmte) Wert — so matcht ein nackter
// Key, aber NICHT ein blosses Praefix-Wort in Prosa (z.B. `AIza`/`AIzaBeispiel`
// ohne die volle 39-Zeichen-Laenge, oder `sk` allein). Die generischen sk-/JWT-
// Zweige bleiben in secret-mask.ts; hier nur das, was der base64-Zweig auslaesst
// bzw. was explizit getroffen werden soll (Google AIza mit `_`/`-`).
//
// Falschpositiv-Schutz an mehreren Stellen: (1) Laengen-Floor je Format, (2)
// Anker, (3) ${VAR}/%VAR%-Refs werden VOR dieser Pruefung in secret-mask.ts
// ausgesondert (isEnvRefValue), gelangen also nie hierher.

// Google/Gemini-API-Key: `AIza` + exakt 35 Zeichen [A-Za-z0-9_-] = 39 gesamt.
const GOOGLE_AIZA_RX = /^AIza[A-Za-z0-9_-]{35}$/

// OpenAI moderne Projekt-/Service-/Admin-Keys: sk-{proj,svcacct,admin}-… (lang).
const OPENAI_SCOPED_RX = /^sk-(?:proj|svcacct|admin)-[A-Za-z0-9_-]{16,}$/

// Anthropic Console-/OAuth-Keys: sk-ant-api03-… / sk-ant-oat01-… (lang).
const ANTHROPIC_RX = /^sk-ant-(?:api\d{2}|oat\d{2})-[A-Za-z0-9_-]{16,}$/

/**
 * True, wenn der (getrimmte) String ein reales Cloud-API-Key-Format hat
 * (OpenAI scoped / Anthropic / Google AIza). Anker-gebunden -> nur ganze Keys,
 * keine Praefix-Woerter in Prosa. Liefert NIE einen Wert; reine Format-Pruefung.
 */
export function isCloudKey(v: string): boolean {
  return CLOUD_KEY_RX.test(v)
}

// Vereinigtes, anker-gebundenes Set (Einzel-RX als Lesbarkeits-/Test-Quelle).
export const CLOUD_KEY_RX = new RegExp(
  `(?:${GOOGLE_AIZA_RX.source}|${OPENAI_SCOPED_RX.source}|${ANTHROPIC_RX.source})`
)
