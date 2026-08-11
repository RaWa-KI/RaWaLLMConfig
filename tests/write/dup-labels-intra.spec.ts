// dup-labels-intra.spec.ts — ehrliche Seitenbeschriftung fuer Intra-Familien-
// Duplikate (Owner-Befund P1 2026-08-07). Zwei Fundstellen DERSELBEN Familie
// (content-hash, mirrorFamily === family) duerfen NICHT als „Shared — zentrale
// Version" vs „… — deine Kopie" beschriftet werden — Shared ist nicht beteiligt.
// Teil 1: Intra-Set -> neutrale Labels mit unterscheidendem Pfadabschnitt,
//         keine Shared-/zentrale-Version-/Kopie-Begriffe, neutraler Intro-Satz.
// Teil 2 (Folge-WP 2026-08-07): named-mirror/heuristic sind seit dem
//         D3-Narrowing IMMER familienintern (dedupe.ts comparableConfidence
//         liefert bei a.family !== b.family strikt null; dedupe.ts ist der
//         einzige Erzeuger dieser Confidences) -> dieselbe Intra-Erkennung.
// Teil 3: ehrliche Intra-AKTIONS-Texte (Knoepfe/Confirm/Ordner/Speichern/
//         Chunk/Verschieben-Chips) ohne Shared-/Kopie-Sprache.
// Teil 4: Regression-Pin Cross-Root/Bestand ZEICHENGENAU: diffLabels() und
//         alle Bestand-Aktionstexte bleiben unveraendert.
import { test, expect } from '@playwright/test'
import {
  BEHALTEN,
  BEHALTEN_MIRROR,
  CONFIRM,
  FUNDSTELLE,
  SEITE_KURZ,
  SPEICHERN,
  UEBERNEHMEN,
  UEBERNEHMEN_TRUNK,
  diffLabels,
  familienName,
  intraAktionTexte,
  intraChunk,
  intraFamilyLabels,
  intraFassungenAusLabels,
  intraIntroSatz,
  intraOrdnerConfirm,
  intraSeiteKurz,
  intraSpeichern,
  isIntraFamilyDup,
  istIntraLabels,
  ordnerConfirm,
  speichernInKopie,
  unterscheidendeAbschnitte
} from '@shared/dup-labels'

// Beispiel aus dem Owner-Befund: zwei Hook-Fassungen innerhalb desselben
// Tool-Homes. Bewusst OHNE C:\Users-Form — das Public-Release-Gate blockt
// private Windows-Nutzerpfade auch in Fixtures (public-safe, HR27).
const PFAD_A = 'X:\\demo-home\\.claude\\hooks\\native-candidate-v2\\lib\\coordination-root.cjs'
const PFAD_B = 'X:\\demo-home\\.claude\\hooks\\native-candidate\\lib\\coordination-root.cjs'

// Set-Attrappe wie aus dedupe-content-scan.ts (mirrorFamily = eigene Familie).
const INTRA_SET = { confidence: 'content-hash', mirrorFamily: 'claude' } as const

test('Intra-Erkennung: content-hash + mirrorFamily === family', () => {
  expect(isIntraFamilyDup(INTRA_SET, 'claude')).toBe(true)
  // Folge-WP 2026-08-07: named-mirror/heuristic sind seit dem D3-Narrowing
  // ebenfalls IMMER familienintern (Code-Beleg dedupe.ts comparableConfidence:
  // `if (a.family !== b.family) return null`; einziger Erzeuger dieser
  // Confidences) -> dieselbe ehrliche Intra-Erkennung, gepinnt.
  expect(isIntraFamilyDup({ confidence: 'heuristic', mirrorFamily: 'claude' }, 'claude')).toBe(true)
  expect(isIntraFamilyDup({ confidence: 'named-mirror', mirrorFamily: 'claude' }, 'claude')).toBe(true)
  // Familien-Mismatch (z. B. Set aus anderer Familie) bleibt Bestand.
  expect(isIntraFamilyDup(INTRA_SET, 'codex')).toBe(false)
  expect(isIntraFamilyDup({ confidence: 'heuristic', mirrorFamily: 'shared' }, 'claude')).toBe(false)
  expect(isIntraFamilyDup({ confidence: undefined, mirrorFamily: undefined }, 'claude')).toBe(false)
})

test('Herleitung: erster abweichender Pfadabschnitt beider Member-Pfade', () => {
  expect(unterscheidendeAbschnitte(PFAD_A, PFAD_B)).toEqual(['native-candidate-v2', 'native-candidate'])
  // Trenner-robust ('/' und '\'), gemeinsames Praefix case-insensitiv.
  expect(unterscheidendeAbschnitte('~/.claude/rules/a.md', '~/.claude/rules-alt/a.md')).toEqual([
    'rules',
    'rules-alt'
  ])
  // Ohne echten Unterschied: neutraler Fallback, nie identische Labels.
  expect(unterscheidendeAbschnitte(PFAD_A, PFAD_A)).toEqual(['A', 'B'])
})

test('Intra-Labels: Familienname + Fassung, neutrale Paar-Tags, kein Shared-Bezug', () => {
  const l = intraFamilyLabels('claude', PFAD_A, PFAD_B)
  expect(l.trunk).toBe('Claude — Fassung „native-candidate-v2"')
  expect(l.mirror).toBe('Claude — Fassung „native-candidate"')
  expect(l.trunkTag).toBe(FUNDSTELLE.a)
  expect(l.mirrorTag).toBe(FUNDSTELLE.b)
  expect(istIntraLabels(l)).toBe(true)
  // Verbotene Irrefuehrung: kein Shared, keine zentrale Version, keine Kopie.
  for (const s of [l.trunk, l.mirror, l.trunkTag, l.mirrorTag, intraIntroSatz(l)]) {
    expect(s, `Shared-Bezug in Intra-Label: ${s}`).not.toMatch(/shared|zentrale? Version|deine Kopie/i)
  }
})

test('Intro-Satz: zwei Fundstellen derselben Familie, Sicherung bleibt genannt', () => {
  const l = intraFamilyLabels('claude', PFAD_A, PFAD_B)
  const satz = intraIntroSatz(l)
  expect(satz).toContain('zweier Fundstellen derselben Familie')
  expect(satz).toContain('Claude — Fassung „native-candidate-v2"')
  expect(satz).toContain('Claude — Fassung „native-candidate"')
  expect(satz).toContain('Änderungen werden vor dem Speichern automatisch gesichert.')
})

test('familienName: laienverstaendlich je Familie', () => {
  expect(familienName('claude')).toBe('Claude')
  expect(familienName('codex')).toBe('Codex')
  expect(familienName('shared')).toBe('Shared')
  expect(familienName('')).toBe('Workspace')
})

// Regression-Pin: Cross-Root-/Bestandslabels bleiben Zeichen fuer Zeichen gleich.
test('Cross-Root-Pin: diffLabels() unveraendert (Shared gegen lokale Kopie)', () => {
  expect(diffLabels('claude')).toEqual({
    trunk: 'Shared — zentrale Version',
    mirror: 'Claude — deine Kopie',
    trunkTag: 'zentral',
    mirrorTag: 'lokal'
  })
  expect(diffLabels('codex')).toEqual({
    trunk: 'Shared — zentrale Version',
    mirror: 'Codex — deine Kopie',
    trunkTag: 'zentral',
    mirrorTag: 'lokal'
  })
  expect(diffLabels('workspace')).toEqual({
    trunk: 'Shared — zentrale Version',
    mirror: 'Workspace — Kopie',
    trunkTag: 'zentral',
    mirrorTag: 'Kopie'
  })
  // Bestandslabels sind KEINE Intra-Labels — die Weiche greift dort nie.
  expect(istIntraLabels(diffLabels('claude'))).toBe(false)
})

// ── Teil 3: ehrliche Intra-AKTIONS-Texte ────────────────────────────────────

// Alle sichtbaren Strings eines Objekts (rekursiv) einsammeln.
function alleStrings(obj: unknown, out: string[] = []): string[] {
  if (typeof obj === 'string') out.push(obj)
  else if (obj && typeof obj === 'object') {
    for (const v of Object.values(obj as Record<string, unknown>)) alleStrings(v, out)
  }
  return out
}

const SHARED_SPRACHE = /shared|zentrale? Version|deine Kopie|Claude-Kopie|Codex-Kopie/i

test('Intra-Aktionen: Fassungs-Sprache fuer Knoepfe, kein Shared-/Kopie-Bezug', () => {
  const it = intraAktionTexte(PFAD_A, PFAD_B)
  expect(it.fassungen).toEqual(['native-candidate-v2', 'native-candidate'])
  expect(it.uebernehmen.titel).toBe('Fassung „native-candidate" → ersetzt Fassung „native-candidate-v2"')
  expect(it.uebernehmen.wirkung).toBe(
    'Der Inhalt von Fassung „native-candidate" ersetzt Fassung „native-candidate-v2"; die bisherige Fassung „native-candidate-v2" wird vorher gesichert.'
  )
  expect(it.behalten.titel).toBe('Fassung „native-candidate-v2" behalten — Fassung „native-candidate" archivieren')
  expect(it.behaltenMirror.titel).toBe('Fassung „native-candidate" behalten — Fassung „native-candidate-v2" archivieren')
  expect(it.uebernehmenTrunk.titel).toBe('Fassung „native-candidate-v2" → ersetzt Fassung „native-candidate"')
  // KEIN sichtbarer String des gesamten Intra-Aktions-Satzes traegt Shared-Sprache.
  for (const s of alleStrings(it)) {
    expect(s, `Shared-Sprache in Intra-Aktionstext: ${s}`).not.toMatch(SHARED_SPRACHE)
  }
})

test('Intra-Confirm: Fundstellen-Pfadzeilen, Fassungs-Entscheidungen, Kanon-Frage', () => {
  const c = intraAktionTexte(PFAD_A, PFAD_B).confirm
  expect(c.pfadShared).toBe(FUNDSTELLE.a)
  expect(c.pfadClaude).toBe(FUNDSTELLE.b)
  expect(c.decShared).toBe('Fassung „native-candidate-v2" behalten')
  expect(c.decClaude).toBe('Fassung „native-candidate" übernehmen')
  expect(c.decClaudeBehalten).toBe('Fassung „native-candidate" behalten')
  expect(c.decSharedUebernehmen).toBe('Fassung „native-candidate-v2" übernehmen')
  expect(c.kanonFrage).toBe('Welche Fassung bleibt?')
  expect(c.kanonShared).toBe('Fassung „native-candidate-v2"')
  expect(c.kanonClaude).toBe('Fassung „native-candidate"')
  expect(c.titelUebernehmen).toBe('Fassung „native-candidate" übernehmen — ersetzt Fassung „native-candidate-v2"?')
  expect(c.textBehalten).toBe(
    'Fassung „native-candidate-v2" bleibt unverändert. Fassung „native-candidate" wandert ins Archiv (nicht gelöscht).'
  )
  // Sicherung bleibt sichtbar genannt (backup-first, keine Verhaltensaenderung).
  expect(c.textUebernehmen).toContain('Sicherung')
  expect(c.textUebernehmen).toContain('geht nicht verloren')
})

test('Intra-Ordner/Speichern/Chunk/Verschieben-Chips: Fassungs-Sprache, Shared-frei', () => {
  const f: [string, string] = ['native-candidate-v2', 'native-candidate']
  const ordner = intraOrdnerConfirm('archivieren', 'b', 'coordination-root.cjs', f)
  expect(ordner.titel).toBe('Ganzen Ordner archivieren? (coordination-root.cjs)')
  expect(ordner.text).toContain('Fassung „native-candidate"')
  expect(ordner.text).toContain('nicht gelöscht')
  expect(intraOrdnerConfirm('verschieben', 'a', 'x', f).text).toContain('Fassung „native-candidate-v2"')
  expect(intraSpeichern(f)).toEqual({
    inA: 'In Fassung „native-candidate-v2" speichern',
    inB: 'In Fassung „native-candidate" speichern'
  })
  expect(intraChunk(f)).toEqual({
    linksTip: 'Diesen Absatz von Fassung „native-candidate" nach Fassung „native-candidate-v2" kopieren',
    rechtsTip: 'Diesen Absatz von Fassung „native-candidate-v2" nach Fassung „native-candidate" kopieren'
  })
  expect(intraSeiteKurz(f)).toEqual({
    a: 'Fassung „native-candidate-v2"',
    b: 'Fassung „native-candidate"',
    beide: 'Beide Fassungen'
  })
  const alles = [
    ...alleStrings(ordner),
    ...alleStrings(intraSpeichern(f)),
    ...alleStrings(intraChunk(f)),
    ...alleStrings(intraSeiteKurz(f))
  ]
  for (const s of alles) expect(s, `Shared-Sprache: ${s}`).not.toMatch(SHARED_SPRACHE)
})

test('intraFassungenAusLabels: Roundtrip aus Intra-Labels, null fuer Bestand', () => {
  const l = intraFamilyLabels('claude', PFAD_A, PFAD_B)
  expect(intraFassungenAusLabels(l)).toEqual(['native-candidate-v2', 'native-candidate'])
  // Cross-Root-/Bestandslabels liefern null — die Weiche greift dort nie.
  expect(intraFassungenAusLabels(diffLabels('claude'))).toBeNull()
  expect(intraFassungenAusLabels(diffLabels('workspace'))).toBeNull()
})

// ── Teil 4: Cross-Root-Regression-Pin ZEICHENGENAU (Bestand-Aktionstexte) ───

test('Cross-Root-Pin: Aktions-/Confirm-Texte fuer claude/codex unveraendert', () => {
  expect(UEBERNEHMEN('claude').titel).toBe('Claude-Kopie → ersetzt die zentrale Version (Shared)')
  expect(UEBERNEHMEN_TRUNK('claude').titel).toBe('Zentrale Version (Shared) → ersetzt die Claude-Kopie')
  expect(BEHALTEN('claude').titel).toBe('Zentrale Version (Shared) behalten — Claude-Kopie archivieren')
  expect(BEHALTEN_MIRROR('claude').titel).toBe('Claude-Kopie behalten — zentrale Version (Shared) archivieren')
  expect(UEBERNEHMEN_TRUNK('claude').wirkung).toBe(
    'Die zentrale Version (Shared) wird zur gemeinsamen Version; die bisherige Claude-Kopie wird vorher gesichert.'
  )
  expect(BEHALTEN_MIRROR('codex').titel).toBe('Codex-Kopie behalten — zentrale Version (Shared) archivieren')
  const c = CONFIRM('claude')
  expect(c.pfadShared).toBe('Shared (zentral)')
  expect(c.pfadClaude).toBe('Claude (lokal)')
  expect(c.decShared).toBe('Shared behalten')
  expect(c.decClaudeBehalten).toBe('Claude behalten')
  expect(c.decSharedUebernehmen).toBe('Shared übernehmen')
  expect(c.kanonFrage).toBe('Welche Version bleibt?')
  expect(c.kanonShared).toBe('Shared')
  expect(c.kanonClaude).toBe('Claude')
  expect(c.titelBehaltenMirror).toBe('Claude-Kopie behalten, Shared-Version archivieren?')
  expect(c.titelUebernehmenTrunk).toBe('Shared-Version nach Claude übernehmen?')
})

test('Cross-Root-Pin: Speichern-/Verschieben-/Ordner-Texte unveraendert', () => {
  expect(SPEICHERN.inShared).toBe('In zentrale Version (Shared) speichern')
  expect(speichernInKopie('Claude — deine Kopie')).toBe('In Claude — deine Kopie speichern')
  expect(SEITE_KURZ.shared).toBe('Shared — zentral')
  expect(SEITE_KURZ.claude).toBe('Claude — lokal')
  expect(SEITE_KURZ.beide).toBe('Beide Versionen')
  expect(ordnerConfirm('archivieren', 'shared', 'x').text).toContain('die zentrale Version (Shared)')
  expect(ordnerConfirm('verschieben', 'claude', 'x').text).toContain('deine Kopie (Claude)')
})
