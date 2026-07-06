// secret-class.spec.ts — SSOT-Tests fuer @shared/secret-class (WP2,
// QUAL-MITTEL-01/QUAL-HOCH-01): die Secret-Pfad-Klassifikation lebt genau einmal
// in shared/secret-class.ts (browser-sicher, ohne node:path). Geprueft werden:
// (1) Write-Klassifikation der echten Secret-WERT-/Wortheuristik-Fixtures,
// (2) der .md-Owner-Override ([[app-zeigt-secrets-lokal-owner-override]]):
//     Markdown-Doku ist NIE secret-bearing fuer Write — das ist die KORREKTE,
//     owner-gedeckte Semantik, kein Bug,
// (3) Invariante ForWrite ⊇ ForRead ueber ALLE Fixtures,
// (4) Separator-Paritaet ('/' vs '\\') + baseOf-Verhalten gegen
//     node:path.win32.basename (Trailing-Slash/Windows-Pfade).
// Import per Relativpfad (wie import-targets.spec.ts) — kein @shared-Alias in tests/.
import { test, expect } from '@playwright/test'
import { win32 } from 'node:path'
import {
  isSecretPathForRead,
  isSecretPathForWrite,
  isMarkdownDoc
} from '../../shared/secret-class'

// ForWrite=true: echte Secret-WERT-Klassen (auch ForRead=true) + Wortheuristik-
// Treffer (Nicht-.md: my-token.txt -> nur ForWrite).
const FOR_WRITE_TRUE = [
  '/home/u/.claude/settings.json',
  '/home/u/.claude/settings.local.json',
  '/home/u/.codex/auth.json',
  '/home/u/.codex/config.toml',
  '/home/u/x/.env',
  '/home/u/x/x.key',
  '/home/u/.codex/codex-global-state.json',
  '/home/u/foo/credentials/x.txt', // /credentials/-Segment
  '/home/u/notes/my-token.txt' // Wortheuristik (Nicht-.md)
]

// ForWrite=false: Markdown-Doku trotz Secret-Wort im Basename (Owner-Override
// [[app-zeigt-secrets-lokal-owner-override]] — .md/.markdown/.mdx-Ausnahme ist
// die korrekte Semantik) + neutrale Doku (CLAUDE.md, kein Wort-Treffer).
const FOR_WRITE_FALSE = [
  '/home/u/notes/my-token.md',
  '/home/u/.shared/.claude/rules/credentials-protection.md',
  '/home/u/.claude/auth-flow.md',
  '/home/u/.shared/.claude/skills/token-effizienz/token-effizienz.md',
  '/home/u/.claude/CLAUDE.md'
]

const ALL_FIXTURES = [...FOR_WRITE_TRUE, ...FOR_WRITE_FALSE]

// Pfad mit Backslash-Separatoren als Windows-Variante (C:\-Prefix statt /home/u).
function toWin(p: string): string {
  return `C:${p.replace(/\//g, '\\')}`
}

test('ForWrite=true: Secret-WERT-Klassen + Wortheuristik (Nicht-.md)', () => {
  for (const p of FOR_WRITE_TRUE) {
    expect(isSecretPathForWrite(p), `ForWrite sollte true sein: ${p}`).toBe(true)
  }
})

test('ForWrite=false: .md-Owner-Override + neutrale Doku bleiben schreibbar', () => {
  for (const p of FOR_WRITE_FALSE) {
    expect(isSecretPathForWrite(p), `ForWrite sollte false sein: ${p}`).toBe(false)
    expect(isSecretPathForRead(p), `ForRead sollte false sein: ${p}`).toBe(false)
  }
})

test('Invariante: ForWrite ⊇ ForRead ueber alle Fixtures', () => {
  for (const p of ALL_FIXTURES) {
    if (isSecretPathForRead(p)) {
      expect(isSecretPathForWrite(p), `ForWrite muss ForRead enthalten: ${p}`).toBe(true)
    }
  }
})

test('Separator-Paritaet: "/" und "\\\\" klassifizieren identisch', () => {
  for (const p of ALL_FIXTURES) {
    const w = toWin(p)
    expect(isSecretPathForRead(w), `ForRead-Paritaet: ${w}`).toBe(isSecretPathForRead(p))
    expect(isSecretPathForWrite(w), `ForWrite-Paritaet: ${w}`).toBe(isSecretPathForWrite(p))
    expect(isMarkdownDoc(w), `isMarkdownDoc-Paritaet: ${w}`).toBe(isMarkdownDoc(p))
  }
})

test('baseOf-Verhalten == node:path.win32.basename (Trailing-Slash/Windows-Pfade)', () => {
  // baseOf ist privat — Verhalten indirekt ueber die Klassifikatoren absichern:
  // jeder Fixture-Pfad (auch mit Trailing-Slash und als Windows-Pfad) muss so
  // klassifizieren wie sein win32.basename als nackter Basename.
  const probes = [
    ...ALL_FIXTURES,
    ...ALL_FIXTURES.map((p) => `${p}/`), // Trailing-Slash
    ...ALL_FIXTURES.map(toWin),
    ...ALL_FIXTURES.map((p) => `${toWin(p)}\\`) // Windows + Trailing-Backslash
  ]
  for (const p of probes) {
    const base = win32.basename(p)
    // Segment-Klassen (/credentials/) ausnehmen — die haengen am Pfad, nicht am Basename.
    if (p.includes('/credentials/') || p.includes('\\credentials\\')) continue
    expect(isSecretPathForWrite(p), `Basename-Aequivalenz ForWrite: ${p}`).toBe(
      isSecretPathForWrite(base)
    )
    expect(isMarkdownDoc(p), `Basename-Aequivalenz isMarkdownDoc: ${p}`).toBe(isMarkdownDoc(base))
  }
})

test('isMarkdownDoc: .md/.markdown/.mdx true, sonst false', () => {
  expect(isMarkdownDoc('/x/CLAUDE.md')).toBe(true)
  expect(isMarkdownDoc('/x/readme.markdown')).toBe(true)
  expect(isMarkdownDoc('/x/page.mdx')).toBe(true)
  expect(isMarkdownDoc('/x/settings.json')).toBe(false)
  expect(isMarkdownDoc('/x/.env')).toBe(false)
  expect(isMarkdownDoc('')).toBe(false)
})
