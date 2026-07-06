// cloud-scan.ts — Cloud-Provider-Scanner (Teil D, WP-D3). Zeigt fuer OpenAI,
// Anthropic und Google Gemini den KONFIG-/KEY-STATUS strukturell an, OHNE je den
// Key-WERT zu lesen, zu tragen oder zu loggen. Der Scanner prueft ausschliesslich
// die PRAESENZ einer Env-Variable (process.env[name] gesetzt + nicht leer) und
// liefert daraus einen booleschen Status — niemals den Wert selbst.
//
// Secret-Sicherheit (HART, HR18/[[credentials-protection]]): Es wird KEINE
// Key-Datei gelesen und KEIN Key-Wert in id/name/desc/fields/Logs ausgegeben.
// Einzige Quelle ist die boolesche Env-Praesenz. Kein console.log von Werten.
//
// Werte per WebSearch (Stand 2026-06) verifiziert:
//   OpenAI     OPENAI_API_KEY                    https://api.openai.com/v1
//   Anthropic  ANTHROPIC_API_KEY                 https://api.anthropic.com
//   Gemini     GEMINI_API_KEY / GOOGLE_API_KEY   https://generativelanguage.googleapis.com
//
// HR27: <300 Z, Fn <50 Z. Echte Umlaute in Anzeige-Texten.
import type { Category, ConfigEntry } from '@shared/contract'

// ── Provider-Stammdaten (deklarativ) ──────────────────────────────────────
// secretRefs: alle akzeptierten Env-NAMEN (inkl. Aliase) — NIE Werte.
// apiBase: Anzeige-Metadatum (kein Auto-Call). models: Anzeige-Beispiele.
export interface CloudProvider {
  id: string
  label: string
  secretRefs: string[]
  apiBase: string
  models: string[]
}

export const CLOUD_PROVIDERS: CloudProvider[] = [
  {
    id: 'openai',
    label: 'OpenAI',
    secretRefs: ['OPENAI_API_KEY'],
    apiBase: 'https://api.openai.com/v1',
    models: ['gpt-5.5', 'gpt-4o', 'o3-mini'],
  },
  {
    id: 'anthropic',
    label: 'Anthropic',
    secretRefs: ['ANTHROPIC_API_KEY'],
    apiBase: 'https://api.anthropic.com',
    models: ['claude-opus-4-8', 'claude-sonnet-4-6', 'claude-haiku-4-5'],
  },
  {
    id: 'gemini',
    label: 'Google Gemini',
    // GOOGLE_API_KEY ist der akzeptierte Alias (hat bei den Client-Libs Vorrang).
    secretRefs: ['GEMINI_API_KEY', 'GOOGLE_API_KEY'],
    apiBase: 'https://generativelanguage.googleapis.com',
    models: ['gemini-3.5-flash', 'gemini-2.5-flash'],
  },
]

// Slug fuer stabile ids: kleinschreiben, Nicht-Alnum -> '-', Raender trimmen.
function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

// Boolesche Key-Praesenz OHNE Wert-Leak: prueft alle Env-Namen auf gesetzt +
// nicht-leer. Gibt NUR true/false zurueck — der Wert verlaesst diese Funktion nie.
function keyPresent(secretRefs: string[]): boolean {
  return secretRefs.some((name) => {
    const v = process.env[name]
    return !!v && v.trim().length > 0
  })
}

// Key-Status-Eintrag: name/desc/fields tragen NUR den booleschen Status und die
// Env-NAMEN, niemals den Wert. status 'active' wenn gesetzt, sonst 'stale'.
function keyEntry(prov: CloudProvider): ConfigEntry {
  const set = keyPresent(prov.secretRefs)
  const names = prov.secretRefs.join(' / ')
  return {
    id: `cloud-${prov.id}-key`,
    name: `${prov.label} API-Key`,
    status: set ? 'active' : 'stale',
    scope: 'global',
    path: prov.apiBase,
    desc: set ? 'Gesetzt (Wert maskiert)' : `Nicht gesetzt — in ${prov.secretRefs[0]} hinterlegen`,
    updated: '',
    fields: {
      'Env-Variable': names,
      'Status': set ? 'gesetzt' : 'nicht gesetzt',
    },
  }
}

// Modell-Eintrag (reine Anzeige; status 'stale' = Beispiel, kein Live-Check).
function modelEntry(prov: CloudProvider, model: string): ConfigEntry {
  return {
    id: `cloud-${prov.id}-${slug(model)}`,
    name: model,
    status: 'stale',
    scope: 'global',
    path: prov.apiBase,
    desc: `${prov.label}-Modell (Beispiel)`,
    updated: '',
    fields: { 'API-Basis': prov.apiBase },
  }
}

// Eine Category je Provider: Key-Status-Eintrag zuerst, dann die Modell-Beispiele.
function providerCategory(prov: CloudProvider): Category {
  return {
    id: `cloud-${prov.id}`,
    label: prov.label,
    icon: 'api',
    path: prov.apiBase,
    blurb: `${prov.label}-Cloud-API: Key-Status (maskiert) + Beispiel-Modelle`,
    entries: [keyEntry(prov), ...prov.models.map((m) => modelEntry(prov, m))],
  }
}

/**
 * Cloud-Kategorien bauen — pro Provider EINE Category (OpenAI, Anthropic, Gemini).
 * Reine Metadaten + boolescher Env-Key-Status; liest NIE einen Key-Wert.
 */
export function cloudCategories(): Category[] {
  return CLOUD_PROVIDERS.map(providerCategory)
}
