// credential-detect.ts — electron-FREIES Leaf-Modul fuer die Credential-Heuristik
// (Vorbild masked-preview-Schnitt). Geteilt zwischen ipc-write.ts (Anzeige:
// detectCredentials/deriveVarName) und env-migrate.ts (Migration:
// findCredentialLine). EINE Heuristik-Quelle (CRED_KEY_RX) garantiert: der
// Env-Migrations-Knopf migriert exakt die Zeile, die die Anzeige erkannt hat —
// nie mehr eine beliebige erste `=`-Zeile (z. B. `model = …` in config.toml).
// Liefert NIE echte Secret-Werte an Renderer/Logs; nur env-migrate (Main-Prozess)
// nutzt den Wert intern.
import { basename } from 'node:path'
import type { CredentialMeta } from '@shared/contract-write'

// Credential-Key-Kern: EINMALIG definiert, wiederverwendet in detectCredentials
// (Zuweisungs-Heuristik) und findCredentialLine (Zeilen-/Key-Auswahl).
export const CRED_KEY_RX = /(?:password|passwd|token|secret|api[_-]?key|auth[_-]?key)/i

// Bereits migrierter Wert: ${VAR}-Referenz (optional gequotet) am Wertanfang.
const VAR_REF_VALUE_RX = /^["']?\$\{[A-Z_][A-Z0-9_]*\}/

// VAR-Namens-Konvention aus Dateibasename ableiten (TH_DB_PW-Stil).
// Liefert KEINEN Wert — nur den vorgeschlagenen Variablennamen.
export function deriveVarName(filePath: string): string {
  const base = basename(filePath)
    .replace(/\.[^.]+$/, '') // Extension entfernen
    .replace(/[^a-zA-Z0-9]+/g, '_') // Nicht-Alphanum -> _
    .toUpperCase()
  return base || 'SECRET_VAR'
}

// Erkennt nackte Secret-Werte vs ${VAR}-Verweise im Datei-Inhalt.
// Liefert CredentialMeta OHNE jeden echten Wert (KEIN Leak).
export function detectCredentials(content: string, filePath: string): CredentialMeta {
  // Muster fuer ${VAR}-Verweise (bereits migriert)
  const varRefRx = /\$\{[A-Z_][A-Z0-9_]*\}/g
  // Muster fuer typische Credential-Zuweisungen (Heuristik, kein Wert extrahiert)
  const assignRx = new RegExp(
    `${CRED_KEY_RX.source}\\s*[=:]\\s*(?!["']?\\$\\{)[^\\s$#\\r\\n]{6,}`,
    'gi'
  )

  const hasAssign = assignRx.test(content)
  const hasVarRef = varRefRx.test(content)

  if (!hasAssign && !hasVarRef) {
    return { hasSecret: false, secretKind: null, masked: null, varSuggestion: null, alreadyVarRef: false }
  }
  if (hasVarRef && !hasAssign) {
    return { hasSecret: false, secretKind: null, masked: null, varSuggestion: null, alreadyVarRef: true }
  }
  // Nackter Wert erkannt — Typ-Heuristik (kein Wert in Output)
  const kindRx = /password|passwd/i.test(content)
    ? 'password'
    : /api[_-]?key/i.test(content)
    ? 'api-key'
    : /token/i.test(content)
    ? 'token'
    : 'secret'
  return {
    hasSecret: true,
    secretKind: kindRx,
    masked: '***',
    varSuggestion: deriveVarName(filePath),
    alreadyVarRef: hasVarRef
  }
}

// Treffer der Zeilen-Auswahl: 0-basierter Zeilen-Index + roher Wert (nur fuer
// den Main-Prozess; verlaesst NIE die Bridge).
export interface CredentialLineHit {
  index: number
  value: string
}

// Ablehnung: Datei traegt nur ':'-Zuweisungen (JSON/YAML) — nicht migrierbar.
export interface CredentialLineReject {
  reject: 'unsupported-format'
}

/**
 * Waehlt die ERSTE Zeile, deren Key-Teil (vor `=`) CRED_KEY_RX matcht und deren
 * Wert weder leer noch eine ${VAR}-Referenz ist -> { index, value }. Trifft die
 * Heuristik NUR auf ':'-Zuweisungen (Key matcht, kein `=` in der Zeile, z. B.
 * JSON/YAML) -> { reject: 'unsupported-format' } statt Zerschreiben. Kein
 * Treffer -> null. readSecretValue UND rewriteConfigLine (env-migrate.ts) nutzen
 * GENAU diesen Helfer — beide waehlen damit garantiert dieselbe Zeile.
 * v1-Pin: bewusst nur die ERSTE Credential-Zeile (Multi-Credential -> Knopf
 * nach erfolgreicher Migration erneut ausloesen).
 */
export function findCredentialLine(
  content: string
): CredentialLineHit | CredentialLineReject | null {
  const lines = content.split(/\r?\n/)
  let colonOnly = false
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const eqIdx = line.indexOf('=')
    if (eqIdx >= 1) {
      if (!CRED_KEY_RX.test(line.slice(0, eqIdx))) continue
      const value = line.slice(eqIdx + 1).trim()
      if (value.length === 0) continue
      if (VAR_REF_VALUE_RX.test(value)) continue // bereits Var-Ref
      return { index: i, value }
    }
    // Kein '=': ':'-Zuweisung mit Credential-Key (JSON/YAML) -> nicht migrierbar.
    const colonIdx = line.indexOf(':')
    if (colonIdx >= 1 && CRED_KEY_RX.test(line.slice(0, colonIdx))) {
      const value = line.slice(colonIdx + 1).trim()
      if (value.length > 0 && !VAR_REF_VALUE_RX.test(value)) colonOnly = true
    }
  }
  return colonOnly ? { reject: 'unsupported-format' } : null
}
