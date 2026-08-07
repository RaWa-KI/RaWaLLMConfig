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
import { getCloudProviderAuthMode, isCloudProviderEnabled } from '../../services/cloud-provider-state'

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
// Env-NAMEN, niemals den Wert. status 'active' wenn gesetzt, sonst
// 'notConfigured' („nicht eingerichtet", WP-F4F9) — NIEMALS 'stale': ein
// fehlender Key ist kein Versionsbeleg und damit kein „veraltet".
// fileBacked: false (WP-5, B6/B7): path ist die API-Basis (URL), keine Datei —
// der Renderer zeigt einen Hinweis statt Datei-Edit/CRUD.
// providerEnabled (WP1, Diagnosekarten-Regel): die Nutzungsabsicht aus den
// Quellen-Toggles (Default aus). Nur ein aktivierter Anbieter darf eine
// „Key nicht gesetzt"-Diagnosekarte ausloesen; ein nicht genutzter Anbieter
// bleibt neutral „nicht eingerichtet" (kein Fehler, kein Rauschen).
function keyEntry(prov: CloudProvider): ConfigEntry {
  const set = keyPresent(prov.secretRefs)
  const names = prov.secretRefs.join(' / ')
  const enabled = isCloudProviderEnabled(prov.id)
  return {
    id: `cloud-${prov.id}-key`,
    name: `${prov.label} API-Key`,
    status: set ? 'active' : 'notConfigured',
    scope: 'global',
    path: prov.apiBase,
    desc: keyDescription(prov, set, enabled),
    updated: '',
    fileBacked: false,
    providerEnabled: enabled,
    fields: {
      'Env-Variable': names,
      'Status': set ? 'gesetzt' : 'nicht gesetzt',
      'Anbieter aktiviert': enabled ? 'ja' : 'nein',
    },
  }
}

// Anzeige-Text des Key-Eintrags: neutral bei nicht aktiviertem Anbieter,
// Handlungshinweis nur bei aktivierter Nutzungsabsicht (WP1).
function keyDescription(prov: CloudProvider, set: boolean, enabled: boolean): string {
  if (set) return 'Gesetzt (Wert maskiert)'
  if (!enabled) return 'Nicht eingerichtet — Anbieter wird nicht genutzt (in Quellen aktivierbar)'
  return `Nicht gesetzt — in ${prov.secretRefs[0]} hinterlegen`
}

// OAuth-Hinweis-Eintrag (WP-F7): bei Auth-Modus 'oauth' erscheint KEINE
// Key-Karte, sondern dieser neutrale Hinweis. Er traegt bewusst KEIN Feld
// 'Env-Variable' (Vertragssignal der Key-Karte, diagnosis-cards-filter
// isMissingKeyEntry) und status 'info' — so entsteht keine Diagnosekarte.
// Kein OAuth-Flow in der App: der Login laeuft im jeweiligen Tool selbst.
function oauthEntry(prov: CloudProvider): ConfigEntry {
  const enabled = isCloudProviderEnabled(prov.id)
  return {
    id: `cloud-${prov.id}-auth`,
    name: `${prov.label} Zugang`,
    status: 'info',
    scope: 'global',
    path: prov.apiBase,
    desc: 'OAuth-Login im Tool — Anmeldung läuft im jeweiligen Tool, kein API-Key nötig',
    updated: '',
    fileBacked: false,
    providerEnabled: enabled,
    fields: {
      'Auth-Modus': 'OAuth-Login im Tool',
      'Anbieter aktiviert': enabled ? 'ja' : 'nein',
    },
  }
}

// Modell-Eintrag (reine Anzeige; status 'info' = Beispiel, kein Live-Check,
// WP-F4F9). NIEMALS 'stale': ein Katalog-Beispiel hat keinen Versionsbeleg
// und darf nicht als „veraltet" erscheinen.
// fileBacked: false (WP-5): Katalog-Eintrag ohne eigene Datei (path = URL).
function modelEntry(prov: CloudProvider, model: string): ConfigEntry {
  return {
    id: `cloud-${prov.id}-${slug(model)}`,
    name: model,
    status: 'info',
    scope: 'global',
    path: prov.apiBase,
    desc: `${prov.label}-Modell (Beispiel)`,
    updated: '',
    fileBacked: false,
    fields: { 'API-Basis': prov.apiBase },
  }
}

// Eine Category je Provider: Auth-Status-Eintrag zuerst, dann Modell-Beispiele.
// WP-F7: Auth-Modus 'oauth' -> neutraler OAuth-Hinweis statt Key-Karte;
// 'apiKey' oder unset (Default) -> bisherige Env-Key-Pruefung.
function providerCategory(prov: CloudProvider): Category {
  const oauth = getCloudProviderAuthMode(prov.id) === 'oauth'
  return {
    id: `cloud-${prov.id}`,
    label: prov.label,
    icon: 'api',
    path: prov.apiBase,
    blurb: `${prov.label}-Cloud-API: Key-Status (maskiert) + Beispiel-Modelle`,
    entries: [oauth ? oauthEntry(prov) : keyEntry(prov), ...prov.models.map((m) => modelEntry(prov, m))],
  }
}

/**
 * Cloud-Kategorien bauen — pro Provider EINE Category (OpenAI, Anthropic, Gemini).
 * Reine Metadaten + boolescher Env-Key-Status; liest NIE einen Key-Wert.
 */
export function cloudCategories(): Category[] {
  return CLOUD_PROVIDERS.map(providerCategory)
}
