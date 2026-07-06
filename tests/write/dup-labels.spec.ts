// dup-labels.spec.ts — Verbots-Test + seite-Parametrisierung (WP-01 Keystone).
// Drei Teile:
//  (a) HART: jeder sichtbare Wert aus shared/dup-labels(.+-seiten) — fuer ALLE
//      Seiten (claude/codex/workspace) — ist frei von den verbotenen Begriffen
//      trunk|mirror|merge|M2|spiegel (case-insensitiv). Quelle der Wahrheit fuer
//      alle UI-Texte — hier darf NIE ein Tech-Begriff durchrutschen.
//  (a2) POSITIV: die seite-parametrisierten Gruppen liefern je Seite den
//      korrekten Wortlaut. 'claude' MUSS verbatim dem heutigen v4-Owner-Stand
//      entsprechen; 'codex' nennt „Codex"; 'workspace' nennt weder „Claude" noch
//      „Codex" noch einen Verbots-Begriff (neutrale Mirror-im-selben-Tool-Texte).
//  (b) HART fuer die drei Main-Scan-Dateien: ihre sichtbaren *_DIFF_LABELS-Werte
//      und Blurbs tragen keine verbotenen Begriffe mehr. Plus ein heuristischer,
//      NICHT-fehlschlagender Audit ueber src/renderer/sections/config/*.tsx, der
//      verbliebene sichtbare Treffer nur MELDET (console.warn) — diese Dateien
//      gehoeren parallelen WPs (05/06/10) und sind in derselben Welle in Arbeit;
//      ein harter Fail darauf waere ein Falsch-FAIL (Plan: „lieber wenige gezielte
//      Patterns als Falsch-FAILs"). Code-interne Typnamen/CSS-Klassen/Member-
//      Zugriffe (keep-trunk, 'trunk-only', labels.trunk, side: 'trunk'|'mirror')
//      bleiben erlaubt — nur SICHTBARE String-Literale/JSX-Texte zaehlen.
import { test, expect } from '@playwright/test'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import * as dupLabels from '@shared/dup-labels'
import {
  UEBERNEHMEN,
  BEHALTEN,
  CHUNK,
  CONFIRM,
  UMBENENNEN,
  ordnerConfirm,
  SECRET_PAAR,
  type Seite
} from '@shared/dup-labels'

// Verbotene Begriffe als Wortgrenzen-Regex (case-insensitiv).
// M2 nur als eigenstaendiges Wort (\bM2\b) — „M21" (SVG-Pfad) darf NICHT matchen.
const FORBIDDEN = /\btrunk|\bmirror|\bmerge|\bM2\b|\bspiegel/i

const SEITEN: Seite[] = ['claude', 'codex', 'workspace']

const repoRoot = join(__dirname, '..', '..')
const scanDir = join(repoRoot, 'src', 'main', 'scan')
const rendererConfigDir = join(repoRoot, 'src', 'renderer', 'sections', 'config')

// Alle sichtbaren Strings der seite-parametrisierten Gruppen je Seite einsammeln.
function seiteStrings(seite: Seite): string[] {
  const out: string[] = []
  const objs: Array<Record<string, unknown>> = [
    UEBERNEHMEN(seite),
    BEHALTEN(seite),
    CHUNK(seite),
    CONFIRM(seite),
    UMBENENNEN(seite),
    ordnerConfirm('verschieben', seite, 'beispiel-ordner'),
    ordnerConfirm('archivieren', seite, 'beispiel-ordner'),
    ordnerConfirm('verschieben', 'shared', 'beispiel-ordner'),
    SECRET_PAAR
  ]
  for (const o of objs) for (const v of Object.values(o)) if (typeof v === 'string') out.push(v)
  return out
}

// (a) shared/dup-labels — ALLE Seiten: KEIN verbotener Begriff in sichtbaren Werten.
test('(a) dup-labels: alle Seiten frei von trunk/mirror/merge/M2/spiegel', () => {
  for (const seite of SEITEN) {
    const strings = seiteStrings(seite)
    expect(strings.length).toBeGreaterThan(10) // Schutz: wirklich geladen
    const hits = strings.filter((s) => FORBIDDEN.test(s))
    expect(hits, `Verbotener Begriff (${seite}): ${JSON.stringify(hits)}`).toEqual([])
  }
})

// (a2) POSITIV: Kern-Wortlaute je Seite korrekt.
test('(a2) claude: selbsterklaerende Aktions-Labels (Zeichen fuer Zeichen)', () => {
  // Microcopy-Ueberarbeitung 2026-06-08 (Owner-Feedback „nicht selbsterklaerend"):
  // Aktions-Titel nennen jetzt Quelle, Richtung und Ziel explizit.
  expect(UEBERNEHMEN('claude').titel).toBe('Claude-Kopie → ersetzt die zentrale Version (Shared)')
  expect(UEBERNEHMEN('claude').wirkung).toBe(
    'Die Claude-Kopie wird zur gemeinsamen Version; die bisherige zentrale (Shared) wird vorher gesichert.'
  )
  expect(BEHALTEN('claude').titel).toBe(
    'Zentrale Version (Shared) behalten — Claude-Kopie archivieren'
  )
  expect(BEHALTEN('claude').wirkung).toBe(
    'Die zentrale Version (Shared) bleibt unverändert; die Claude-Kopie wandert ins Archiv (nicht gelöscht).'
  )
  expect(CHUNK('claude').linksTip).toBe('Diesen Absatz von Claude nach Shared kopieren')
  expect(CHUNK('claude').rechtsTip).toBe('Diesen Absatz von Shared nach Claude kopieren')
  expect(CONFIRM('claude').decClaude).toBe('Claude übernehmen')
  expect(CONFIRM('claude').pfadClaude).toBe('Claude (lokal)')
  expect(CONFIRM('claude').titelUebernehmen).toBe('Claude-Version nach Shared übernehmen?')
  expect(CONFIRM('claude').titelBehalten).toBe(
    'Shared-Version behalten, Claude-Kopie archivieren?'
  )
  expect(CONFIRM('claude').textUebernehmen).toBe(
    'Die Claude-Kopie ersetzt die zentrale Version (Shared). Vorher wird automatisch eine Sicherung der zentralen Version im Archiv angelegt; die alte Fassung geht nicht verloren.'
  )
  expect(CONFIRM('claude').textBehalten).toBe(
    'Die zentrale Version (Shared) bleibt unverändert. Deine Claude-Kopie wandert ins Archiv (nicht gelöscht).'
  )
  expect(UMBENENNEN('claude').chipClaude).toBe('nur Claude')
})

// Default-Aufruf (ohne Argument / Property-Zugriff) == 'claude' (Rueckwaerts-Kompat).
test('(a2) default (kein Argument / Property) == claude', () => {
  expect(UEBERNEHMEN().titel).toBe(UEBERNEHMEN('claude').titel)
  // Bestehende Aufrufer lesen Properties direkt (Object.assign-Default):
  expect(UEBERNEHMEN.titel).toBe(UEBERNEHMEN('claude').titel)
  expect(BEHALTEN.wirkung).toBe(BEHALTEN('claude').wirkung)
  expect(CHUNK.linksTip).toBe(CHUNK('claude').linksTip)
  expect(CONFIRM.decClaude).toBe(CONFIRM('claude').decClaude)
  expect(UMBENENNEN.chipClaude).toBe(UMBENENNEN('claude').chipClaude)
})

test('(a2) codex: nennt „Codex" in den Seiten-Texten', () => {
  expect(UEBERNEHMEN('codex').titel).toContain('Codex')
  expect(UEBERNEHMEN('codex').titel).toBe('Codex-Kopie → ersetzt die zentrale Version (Shared)')
  expect(BEHALTEN('codex').wirkung).toContain('Codex')
  expect(CHUNK('codex').linksTip).toContain('Codex')
  expect(CONFIRM('codex').decClaude).toBe('Codex übernehmen')
  expect(CONFIRM('codex').titelUebernehmen).toContain('Codex')
  expect(UMBENENNEN('codex').chipClaude).toBe('nur Codex')
  expect(ordnerConfirm('archivieren', 'codex', 'x').text).toContain('Codex')
  // Keine Claude-Drift auf der Codex-Seite.
  expect(UEBERNEHMEN('codex').titel).not.toContain('Claude')
})

test('(a2) workspace: neutral — weder Claude noch Codex noch Verbots-Begriff', () => {
  const strings = seiteStrings('workspace')
  for (const s of strings) {
    expect(s, `Claude in workspace: ${s}`).not.toContain('Claude')
    expect(s, `Codex in workspace: ${s}`).not.toContain('Codex')
    expect(FORBIDDEN.test(s), `Verbot in workspace: ${s}`).toBe(false)
  }
  // Neutrale Anker sind tatsaechlich gesetzt (kein leerer Default).
  expect(UEBERNEHMEN('workspace').titel).toContain('zweite Kopie')
  expect(BEHALTEN('workspace').wirkung).toContain('zweite Kopie')
})

// SECRET_PAAR: laienverstaendlich, keine Secret-Werte, keine Verbots-Begriffe.
test('(a2) SECRET_PAAR: Schutz-Texte vorhanden + verbotsfrei', () => {
  // i18n-owner-01 (OWNER-GRUNDPRINZIP): kein "nur ansehen"-Edit-Verbot mehr —
  // Schutz ist Wert-Maskierung + Reveal-Gate, keine Sperre.
  expect(SECRET_PAAR.badge).toBe('Enthält Zugangsdaten — Werte maskiert')
  expect(SECRET_PAAR.uebersprungen).toBe('Enthält Zugangsdaten — übersprungen')
  expect(SECRET_PAAR.grundAnzeige).toContain('Zugangsdaten')
  for (const v of Object.values(SECRET_PAAR)) {
    expect(FORBIDDEN.test(v), `Verbot in SECRET_PAAR: ${v}`).toBe(false)
  }
})

// (a3) Vollscan der gesamten Modul-Map (alle seiten-neutralen const-Gruppen +
// Funktionen mit Default-Argument) — Sicherheitsnetz gegen neue Tech-Begriffe.
function collectStrings(obj: unknown, out: string[]): void {
  if (typeof obj === 'string') {
    out.push(obj)
    return
  }
  if (typeof obj === 'function') {
    // labelOrdnerAktion / ordnerConfirm / seite-Funktionen mit Beispiel-Argumenten.
    const fn = obj as (...a: unknown[]) => unknown
    for (const art of ['umbenennen', 'verschieben', 'archivieren']) {
      try {
        collectStrings(fn(art, 'beispiel-skill', 3), out)
      } catch {
        /* Signatur passt nicht — ueberspringen */
      }
    }
    for (const art of ['verschieben', 'archivieren']) {
      for (const seite of ['shared', 'claude', 'codex', 'workspace']) {
        try {
          collectStrings(fn(art, seite, 'beispiel-skill'), out)
        } catch {
          /* skip */
        }
      }
    }
    for (const seite of ['claude', 'codex', 'workspace']) {
      try {
        collectStrings(fn(seite), out)
      } catch {
        /* skip */
      }
    }
    return
  }
  if (obj && typeof obj === 'object') {
    for (const v of Object.values(obj as Record<string, unknown>)) collectStrings(v, out)
  }
}

test('(a3) dup-labels Modul-Map: alle sichtbaren Werte verbotsfrei', () => {
  const strings: string[] = []
  collectStrings(dupLabels, strings)
  expect(strings.length).toBeGreaterThan(20)
  const hits = strings.filter((s) => FORBIDDEN.test(s))
  expect(hits, `Verbotener Begriff in dup-labels: ${JSON.stringify(hits)}`).toEqual([])
})

// Kommentare entfernen (Block + Zeilen-Kommentare), damit nur Code/Strings bleiben.
function stripComments(src: string): string {
  const noBlock = src.replace(/\/\*[\s\S]*?\*\//g, ' ')
  return noBlock
    .split('\n')
    .map((ln) => {
      const i = ln.indexOf('//')
      // nur kappen, wenn // nicht offensichtlich in einem String steht (naive Heuristik)
      if (i !== -1 && (ln.slice(0, i).match(/['"`]/g)?.length ?? 0) % 2 === 0) return ln.slice(0, i)
      return ln
    })
    .join('\n')
}

// Code-interne Token-Formen neutralisieren (Member-Zugriff, Identifier, CSS-Klassen,
// Side-Union) — sie sind ausdruecklich erlaubt und duerfen NICHT als Treffer zaehlen.
function neutralizeCodeTokens(src: string): string {
  return src
    .replace(/\.(trunk|mirror|merge)\w*/gi, '.X') // labels.trunk, d.mirror.path, …
    .replace(/\b(trunk|mirror|merge)(Only|Tag|Path|Base|Side|Text|Sign|Cls|Count)\w*/gi, 'X')
    .replace(/['"`][a-z0-9 _-]*\b(?:trunk|mirror|merge)\b[a-z0-9 _-]*['"`]/gi, (m) =>
      // Nur CSS-Klassen-artige Strings neutralisieren (nur a-z0-9 _- Inhalt, keine Saetze)
      /[A-ZÄÖÜ.!?,]| (den|der|die|das|wird|ins|im) /.test(m) ? m : "'css'",
    )
    .replace(/'(?:trunk|mirror)'\s*\|\s*'(?:trunk|mirror)'/gi, "'side'|'side'")
}

// Sichtbare String-Literale + JSX-Texte (ohne {Ausdruecke}) extrahieren.
function visibleStrings(src: string): string[] {
  const clean = neutralizeCodeTokens(stripComments(src))
  const out: string[] = []
  for (let ln of clean.split('\n')) {
    if (ln.trim().startsWith('import')) continue
    for (const m of ln.matchAll(/(['"`])((?:[^\\]|\\.)*?)\1/g)) out.push(m[2])
    for (const m of ln.matchAll(/>([^<>{}]+)</g)) out.push(m[1])
  }
  return out
}

// (b1) HART: die drei Main-Scan-Dateien — sichtbare Strings ohne Verbote.
const SCAN_FILES = ['claude-scan.ts', 'codex-scan.ts', 'shared-scan.ts']
for (const file of SCAN_FILES) {
  test(`(b1) ${file}: sichtbare DiffLabels/Blurbs frei von trunk/mirror/merge/M2`, () => {
    const src = readFileSync(join(scanDir, file), 'utf8')
    const hits = visibleStrings(src).filter((s) => FORBIDDEN.test(s))
    expect(hits, `Sichtbarer Verbots-Begriff in ${file}: ${JSON.stringify(hits)}`).toEqual([])
  })
}

// (b2) AUDIT (nicht-fehlschlagend): Renderer-Config-Dateien — verbliebene sichtbare
// Treffer melden. Gehoeren parallelen WPs (05/06/10); hier nur Sichtbarkeit, kein Fail.
test('(b2) renderer config: heuristischer Audit (meldet, schlaegt NICHT fehl)', () => {
  const files = readdirSync(rendererConfigDir).filter((f) => f.endsWith('.tsx'))
  expect(files.length).toBeGreaterThan(0)
  for (const f of files) {
    const src = readFileSync(join(rendererConfigDir, f), 'utf8')
    const hits = [...new Set(visibleStrings(src).filter((s) => FORBIDDEN.test(s)))]
    if (hits.length > 0) {
      // eslint-disable-next-line no-console
      console.warn(`[dup-labels audit] ${f}: ${JSON.stringify(hits)}`)
    }
  }
})
