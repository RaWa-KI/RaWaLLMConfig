// dup-labels-intra.spec.ts — ehrliche Seitenbeschriftung fuer Intra-Familien-
// Duplikate (Owner-Befund P1 2026-08-07). Zwei Fundstellen DERSELBEN Familie
// (content-hash, mirrorFamily === family) duerfen NICHT als „Shared — zentrale
// Version" vs „… — deine Kopie" beschriftet werden — Shared ist nicht beteiligt.
// Teil 1: Intra-Set -> neutrale Labels mit unterscheidendem Pfadabschnitt,
//         keine Shared-/zentrale-Version-/Kopie-Begriffe, neutraler Intro-Satz.
// Teil 2: Regression-Pin Cross-Root/Bestand: diffLabels() und namens-/pfad-
//         basierte Sets (heuristic/named-mirror) behalten die Bestandslabels.
import { test, expect } from '@playwright/test'
import {
  FUNDSTELLE,
  diffLabels,
  familienName,
  intraFamilyLabels,
  intraIntroSatz,
  isIntraFamilyDup,
  istIntraLabels,
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
  // Andere Confidence-Stufen bleiben Bestand (Regression-Pin, kein Umlabeln).
  expect(isIntraFamilyDup({ confidence: 'heuristic', mirrorFamily: 'claude' }, 'claude')).toBe(false)
  expect(isIntraFamilyDup({ confidence: 'named-mirror', mirrorFamily: 'claude' }, 'claude')).toBe(false)
  // Familien-Mismatch (z. B. Set aus anderer Familie) bleibt Bestand.
  expect(isIntraFamilyDup(INTRA_SET, 'codex')).toBe(false)
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
